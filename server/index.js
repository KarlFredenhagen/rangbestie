const path = require("path");
const crypto = require("crypto");
const express = require("express");
const { mutate, readState } = require("./store");
const { computeEloUpdates, DEFAULT_K } = require("./elo");

const PORT = process.env.PORT || 3000;
const START_ELO = 1000;

// Erlaubt Zugriffe von anderen Origins (z.B. Frontend auf GitHub Pages, Backend hier).
// Kommagetrennte Liste in CORS_ORIGIN, Standard "*" da keine Zugangsdaten/Cookies im Spiel sind.
const CORS_ORIGINS = (process.env.CORS_ORIGIN || "*").split(",").map((s) => s.trim());

const app = express();
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (CORS_ORIGINS.includes("*")) {
    res.setHeader("Access-Control-Allow-Origin", "*");
  } else if (origin && CORS_ORIGINS.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});
app.use(express.json());
app.use(express.static(path.join(__dirname, "..", "public")));

function newId() {
  return crypto.randomBytes(8).toString("hex");
}

function toPublicPlayer(p) {
  return { id: p.id, name: p.name, elo: p.elo, active: p.active, createdAt: p.createdAt };
}

// GET /api/players - alle Spieler, absteigend nach Elo sortiert
app.get("/api/players", async (req, res) => {
  const state = await readState();
  const players = [...state.players].sort((a, b) => b.elo - a.elo);
  res.json(players.map(toPublicPlayer));
});

// POST /api/players { name } - neuen Spieler anlegen
app.post("/api/players", async (req, res) => {
  const name = (req.body?.name || "").trim();
  if (!name) return res.status(400).json({ error: "Name darf nicht leer sein." });

  const player = await mutate((state) => {
    const exists = state.players.some(
      (p) => p.active && p.name.toLowerCase() === name.toLowerCase()
    );
    if (exists) return null;
    const p = {
      id: newId(),
      name,
      elo: START_ELO,
      active: true,
      createdAt: new Date().toISOString(),
    };
    state.players.push(p);
    return p;
  });

  if (!player) return res.status(409).json({ error: "Ein aktiver Spieler mit diesem Namen existiert schon." });
  res.status(201).json(toPublicPlayer(player));
});

// PATCH /api/players/:id { name?, active? }
app.patch("/api/players/:id", async (req, res) => {
  const { id } = req.params;
  const { name, active } = req.body || {};

  const player = await mutate((state) => {
    const p = state.players.find((pl) => pl.id === id);
    if (!p) return null;
    if (typeof name === "string" && name.trim()) p.name = name.trim();
    if (typeof active === "boolean") p.active = active;
    return p;
  });

  if (!player) return res.status(404).json({ error: "Spieler nicht gefunden." });
  res.json(toPublicPlayer(player));
});

// GET /api/sessions - Verlauf, neueste zuerst
app.get("/api/sessions", async (req, res) => {
  const state = await readState();
  const sessions = [...state.sessions].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
  res.json(sessions);
});

// POST /api/sessions { date, ranking: [playerId, ...] (1. Platz zuerst), kFactor? }
// Berechnet Elo-Aenderungen fuer die gesamte Runde und speichert sie.
app.post("/api/sessions", async (req, res) => {
  const { date, ranking, kFactor } = req.body || {};

  if (!date || typeof date !== "string") {
    return res.status(400).json({ error: "Datum fehlt." });
  }
  if (!Array.isArray(ranking) || ranking.length < 2) {
    return res.status(400).json({ error: "Mindestens 2 Spieler noetig." });
  }
  if (new Set(ranking).size !== ranking.length) {
    return res.status(400).json({ error: "Ein Spieler kann nicht doppelt platziert sein." });
  }

  const k = Number.isFinite(kFactor) && kFactor > 0 ? kFactor : DEFAULT_K;

  const outcome = await mutate((state) => {
    const playersById = new Map(state.players.map((p) => [p.id, p]));
    for (const id of ranking) {
      if (!playersById.has(id)) return { error: `Unbekannter Spieler: ${id}` };
    }

    const ratings = {};
    for (const id of ranking) ratings[id] = playersById.get(id).elo;

    const updates = computeEloUpdates(ranking, ratings, k);

    const results = ranking.map((id, idx) => {
      const u = updates.get(id);
      const player = playersById.get(id);
      const before = player.elo;
      player.elo = u.newRating;
      return {
        playerId: id,
        name: player.name,
        place: idx + 1,
        eloBefore: before,
        eloAfter: u.newRating,
        delta: u.delta,
      };
    });

    const session = {
      id: newId(),
      date,
      kFactor: k,
      createdAt: new Date().toISOString(),
      results,
    };
    state.sessions.push(session);
    return { session };
  });

  if (outcome.error) return res.status(400).json({ error: outcome.error });
  res.status(201).json(outcome.session);
});

// DELETE /api/sessions/:id - Runde loeschen und Elo-Aenderung rueckgaengig machen
app.delete("/api/sessions/:id", async (req, res) => {
  const { id } = req.params;

  const outcome = await mutate((state) => {
    const idx = state.sessions.findIndex((s) => s.id === id);
    if (idx === -1) return { notFound: true };
    const [session] = state.sessions.splice(idx, 1);

    // Elo-Aenderung dieser Runde rueckgaengig machen, unabhaengig davon,
    // ob seitdem weitere Runden gespielt wurden (einfaches Rueckrechnen der Deltas).
    const playersById = new Map(state.players.map((p) => [p.id, p]));
    for (const r of session.results) {
      const p = playersById.get(r.playerId);
      if (p) p.elo -= r.delta;
    }
    return { removed: session };
  });

  if (outcome.notFound) return res.status(404).json({ error: "Runde nicht gefunden." });
  res.json(outcome.removed);
});

app.listen(PORT, () => {
  console.log(`Tischtennis Rangbestie laeuft auf http://localhost:${PORT}`);
});
