const API = (window.RANGBESTIE_CONFIG && window.RANGBESTIE_CONFIG.apiBase) || "/api";

const state = {
  players: [],
  sessions: [],
  rankingOrder: [], // array of player ids, in placement order (index 0 = 1st place)
};

// ---------- API helpers ----------

async function api(path, options) {
  const res = await fetch(API + path, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  const setOnline = (online) => {
    const el = document.getElementById("connection-status");
    el.hidden = online;
    el.textContent = "Offline";
    el.classList.toggle("offline", !online);
  };
  if (!res.ok) {
    setOnline(true);
    let message = "Fehler bei der Anfrage.";
    try {
      message = (await res.json()).error || message;
    } catch (_) {}
    throw new Error(message);
  }
  setOnline(true);
  return res.status === 204 ? null : res.json();
}

// ---------- Icons ----------

const ICONS = {
  trophy: '<path d="M7 4h10v3a5 5 0 0 1-5 5 5 5 0 0 1-5-5Z"/><path d="M7 5H4a3 3 0 0 0 3 5M17 5h3a3 3 0 0 1-3 5"/><path d="M12 12v3M9 20h6M9.5 17h5l.5 3h-6Z"/>',
  plus: '<path d="M12 5.2v13.6M5.2 12h13.6"/>',
  list: '<path d="M8.4 6h12.2M8.4 12h12.2M8.4 18h12.2"/><path d="M3.6 6h.02M3.6 12h.02M3.6 18h.02"/>',
  people: '<circle cx="9" cy="8.4" r="3.2"/><path d="M3.6 20.2c0-3.4 2.4-5.6 5.4-5.6s5.4 2.2 5.4 5.6"/><circle cx="17.2" cy="9.4" r="2.4"/><path d="M15.4 14.8c2.4.2 4.2 2.1 4.2 5"/>',
};

function ico(name, size) {
  const p = ICONS[name];
  if (!p) return "";
  return `<svg class="i" viewBox="0 0 24 24" width="${size || 18}" height="${size || 18}" fill="none"
    stroke="currentColor" stroke-width="1.85" stroke-linecap="round" stroke-linejoin="round"
    aria-hidden="true">${p}</svg>`;
}

function paintIcons(root) {
  (root || document).querySelectorAll("[data-ico]").forEach((el) => {
    el.innerHTML = ico(el.dataset.ico, el.dataset.icoSize);
  });
}

// ---------- Tabs ----------

function moveNavPill() {
  const btn = document.querySelector(".tab-btn.active");
  const pill = document.getElementById("nav-pill");
  if (!btn || !pill) return;
  pill.style.width = btn.offsetWidth + "px";
  pill.style.transform = `translateX(${btn.offsetLeft}px)`;
}

function initTabs() {
  document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
      document.querySelectorAll(".tab-panel").forEach((p) => p.classList.remove("active"));
      btn.classList.add("active");
      document.getElementById(`tab-${btn.dataset.tab}`).classList.add("active");
      if (btn.dataset.tab === "history") renderHistory();
      if (btn.dataset.tab === "players") renderPlayersManage();
      if (btn.dataset.tab === "leaderboard") renderLeaderboard();
      moveNavPill();
    });
  });
  window.addEventListener("resize", moveNavPill);
}

// ---------- Leaderboard ----------

function lastDeltaForPlayer(playerId) {
  for (const session of state.sessions) {
    const row = session.results.find((r) => r.playerId === playerId);
    if (row) return row.delta;
  }
  return null;
}

function renderLeaderboard() {
  const container = document.getElementById("leaderboard-list");
  if (!state.players.length) {
    container.innerHTML = `<p class="empty-hint">Noch keine Spieler. Leg welche im Tab "Spieler" an.</p>`;
    return;
  }

  const ranked = state.players
    .filter((p) => p.active)
    .slice()
    .sort((a, b) => b.elo - a.elo);

  container.innerHTML = ranked
    .map((p, idx) => {
      const rankClass = idx === 0 ? "gold" : idx === 1 ? "silver" : idx === 2 ? "bronze" : "";
      const delta = lastDeltaForPlayer(p.id);
      let trendHtml = `<span class="trend flat">–</span>`;
      if (delta !== null && delta !== 0) {
        trendHtml = `<span class="trend ${delta > 0 ? "up" : "down"}">${delta > 0 ? "+" : ""}${delta}</span>`;
      } else if (delta === 0) {
        trendHtml = `<span class="trend flat">±0</span>`;
      }
      return `
        <div class="player-card">
          <span class="rank ${rankClass}">${idx + 1}</span>
          <span class="name">${escapeHtml(p.name)}</span>
          ${trendHtml}
          <span class="elo">${p.elo}</span>
        </div>`;
    })
    .join("");
}

// ---------- New session ----------

function renderParticipantPicker() {
  const container = document.getElementById("participant-picker");
  const active = state.players.filter((p) => p.active);
  if (!active.length) {
    container.innerHTML = `<p class="empty-hint">Leg zuerst Spieler im Tab "Spieler" an.</p>`;
    return;
  }
  container.innerHTML = active
    .map((p) => {
      const place = state.rankingOrder.indexOf(p.id);
      const selected = place !== -1;
      return `<button type="button" class="chip ${selected ? "selected" : ""}" data-id="${p.id}">
        ${selected ? `${place + 1}. ` : ""}${escapeHtml(p.name)}
      </button>`;
    })
    .join("");

  container.querySelectorAll(".chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      const id = chip.dataset.id;
      const idx = state.rankingOrder.indexOf(id);
      if (idx === -1) state.rankingOrder.push(id);
      else state.rankingOrder.splice(idx, 1);
      renderParticipantPicker();
      renderRankingList();
    });
  });
}

function renderRankingList() {
  const list = document.getElementById("ranking-list");
  const submitBtn = document.getElementById("submit-session");

  if (!state.rankingOrder.length) {
    list.innerHTML = `<li class="empty-hint">Waehle oben Teilnehmer aus</li>`;
    submitBtn.disabled = true;
    return;
  }

  list.innerHTML = state.rankingOrder
    .map((id, idx) => {
      const player = state.players.find((p) => p.id === id);
      return `
        <li class="ranking-item" data-id="${id}">
          <span class="place-badge">${idx + 1}</span>
          <span class="name">${escapeHtml(player ? player.name : "?")}</span>
          <button type="button" class="remove-btn" data-id="${id}" aria-label="Entfernen">✕</button>
        </li>`;
    })
    .join("");

  list.querySelectorAll(".remove-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.id;
      state.rankingOrder = state.rankingOrder.filter((x) => x !== id);
      renderParticipantPicker();
      renderRankingList();
    });
  });

  submitBtn.disabled = state.rankingOrder.length < 2;
}

function setSessionFeedback(message, type) {
  const el = document.getElementById("session-feedback");
  if (!message) {
    el.hidden = true;
    return;
  }
  el.hidden = false;
  el.textContent = message;
  el.className = `feedback ${type}`;
}

function renderLastResult(session) {
  const block = document.getElementById("last-result");
  const list = document.getElementById("last-result-list");
  block.hidden = false;
  list.innerHTML = session.results
    .slice()
    .sort((a, b) => a.place - b.place)
    .map((r) => {
      const sign = r.delta > 0 ? "+" : "";
      const cls = r.delta > 0 ? "up" : r.delta < 0 ? "down" : "flat";
      return `
        <div class="player-card">
          <span class="rank">${r.place}</span>
          <span class="name">${escapeHtml(r.name)}</span>
          <span class="trend ${cls}">${sign}${r.delta}</span>
          <span class="elo">${r.eloAfter}</span>
        </div>`;
    })
    .join("");
}

async function submitSession() {
  const date = document.getElementById("session-date").value;
  if (!date) {
    setSessionFeedback("Bitte ein Datum waehlen.", "error");
    return;
  }
  if (state.rankingOrder.length < 2) return;

  const submitBtn = document.getElementById("submit-session");
  submitBtn.disabled = true;
  setSessionFeedback(null);

  try {
    const session = await api("/sessions", {
      method: "POST",
      body: JSON.stringify({ date, ranking: state.rankingOrder }),
    });
    state.sessions.unshift(session);
    state.players = await api("/players");
    state.rankingOrder = [];
    renderParticipantPicker();
    renderRankingList();
    renderLeaderboard();
    setSessionFeedback("Runde gespeichert!", "success");
    renderLastResult(session);
  } catch (err) {
    setSessionFeedback(err.message, "error");
  } finally {
    submitBtn.disabled = state.rankingOrder.length < 2;
  }
}

function initNewSessionTab() {
  const dateInput = document.getElementById("session-date");
  dateInput.value = new Date().toISOString().slice(0, 10);

  document.getElementById("reset-selection").addEventListener("click", () => {
    state.rankingOrder = [];
    renderParticipantPicker();
    renderRankingList();
    setSessionFeedback(null);
    document.getElementById("last-result").hidden = true;
  });

  document.getElementById("submit-session").addEventListener("click", submitSession);
}

// ---------- History ----------

function renderHistory() {
  const container = document.getElementById("history-list");
  if (!state.sessions.length) {
    container.innerHTML = `<p class="empty-hint">Noch keine Runden gespielt.</p>`;
    return;
  }

  container.innerHTML = state.sessions
    .map((s) => {
      const rows = s.results
        .slice()
        .sort((a, b) => a.place - b.place)
        .map((r) => {
          const sign = r.delta > 0 ? "+" : "";
          const cls = r.delta > 0 ? "up" : r.delta < 0 ? "down" : "flat";
          return `<div class="history-row">
            <span class="place">${r.place}.</span>
            <span class="name">${escapeHtml(r.name)}</span>
            <span class="trend ${cls}">${sign}${r.delta}</span>
            <span class="elo">${r.eloAfter}</span>
          </div>`;
        })
        .join("");

      return `
        <details class="history-session">
          <summary>
            <span>${formatDate(s.date)}</span>
            <span class="session-meta">${s.results.length} Spieler</span>
          </summary>
          <div class="session-results">${rows}</div>
          <button type="button" class="delete-session-btn" data-id="${s.id}">Runde loeschen</button>
        </details>`;
    })
    .join("");

  container.querySelectorAll(".delete-session-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (!confirm("Diese Runde wirklich loeschen? Die Elo-Aenderung wird rueckgaengig gemacht.")) return;
      try {
        await api(`/sessions/${btn.dataset.id}`, { method: "DELETE" });
        state.sessions = state.sessions.filter((s) => s.id !== btn.dataset.id);
        state.players = await api("/players");
        renderHistory();
        renderLeaderboard();
      } catch (err) {
        alert(err.message);
      }
    });
  });
}

function formatDate(iso) {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("de-DE", { weekday: "short", day: "2-digit", month: "2-digit", year: "numeric" });
}

// ---------- Players management ----------

function renderPlayersManage() {
  const container = document.getElementById("players-manage-list");
  if (!state.players.length) {
    container.innerHTML = `<p class="empty-hint">Noch keine Spieler angelegt.</p>`;
    return;
  }

  const sorted = state.players.slice().sort((a, b) => a.name.localeCompare(b.name, "de"));

  container.innerHTML = sorted
    .map(
      (p) => `
      <div class="player-manage-row">
        <input type="text" data-id="${p.id}" class="rename-input" value="${escapeHtml(p.name)}" ${p.active ? "" : "disabled"} />
        <span class="elo">${p.elo}</span>
        <button type="button" class="icon-btn toggle-active-btn" data-id="${p.id}">${p.active ? "Deaktivieren" : "Aktivieren"}</button>
      </div>`
    )
    .join("");

  container.querySelectorAll(".rename-input").forEach((input) => {
    input.addEventListener("change", async () => {
      const id = input.dataset.id;
      const name = input.value.trim();
      if (!name) return;
      try {
        await api(`/players/${id}`, { method: "PATCH", body: JSON.stringify({ name }) });
        const p = state.players.find((pl) => pl.id === id);
        if (p) p.name = name;
        renderLeaderboard();
      } catch (err) {
        alert(err.message);
      }
    });
  });

  container.querySelectorAll(".toggle-active-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = btn.dataset.id;
      const p = state.players.find((pl) => pl.id === id);
      if (!p) return;
      try {
        const updated = await api(`/players/${id}`, {
          method: "PATCH",
          body: JSON.stringify({ active: !p.active }),
        });
        p.active = updated.active;
        renderPlayersManage();
        renderLeaderboard();
        renderParticipantPicker();
        renderRankingList();
      } catch (err) {
        alert(err.message);
      }
    });
  });
}

function initPlayersTab() {
  document.getElementById("add-player-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const input = document.getElementById("new-player-name");
    const name = input.value.trim();
    if (!name) return;
    const submitBtn = e.target.querySelector("button[type=submit]");
    const feedback = document.getElementById("add-player-feedback");
    feedback.hidden = true;
    input.disabled = true;
    submitBtn.disabled = true;
    try {
      const player = await api("/players", { method: "POST", body: JSON.stringify({ name }) });
      state.players.push(player);
      input.value = "";
      renderPlayersManage();
      renderLeaderboard();
      renderParticipantPicker();
    } catch (err) {
      feedback.hidden = false;
      feedback.className = "feedback error";
      feedback.textContent = err.message;
    } finally {
      input.disabled = false;
      submitBtn.disabled = false;
    }
  });
}

// ---------- Utils ----------

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[c]));
}

// ---------- Init ----------

async function init() {
  paintIcons();
  initTabs();
  initNewSessionTab();
  initPlayersTab();
  moveNavPill();

  try {
    const [players, sessions] = await Promise.all([api("/players"), api("/sessions")]);
    state.players = players;
    state.sessions = sessions;
  } catch (err) {
    document.getElementById("connection-status").hidden = false;
    document.getElementById("connection-status").textContent = "Offline";
    document.getElementById("connection-status").classList.add("offline");
  }

  renderLeaderboard();
  renderParticipantPicker();
  renderRankingList();

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }
}

init();
