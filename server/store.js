const fs = require("fs/promises");
const path = require("path");

// DATA_DIR erlaubt es, den Datenordner auf ein Volume zu legen (z.B. in Docker),
// damit die Liste Container-Neustarts uebersteht. Ohne DATA_DIR liegt sie neben index.js.
const DATA_FILE = path.join(process.env.DATA_DIR || __dirname, "data.json");

const EMPTY_STATE = { players: [], sessions: [] };

async function readRaw() {
  try {
    const raw = await fs.readFile(DATA_FILE, "utf-8");
    return JSON.parse(raw);
  } catch (err) {
    if (err.code === "ENOENT") {
      await fs.writeFile(DATA_FILE, JSON.stringify(EMPTY_STATE, null, 2), "utf-8");
      return { ...EMPTY_STATE };
    }
    throw err;
  }
}

function readState() {
  return chain(readRaw);
}

// Serialisiert alle Lese-/Schreibzyklen hintereinander, damit zwei gleichzeitige
// Requests sich nicht gegenseitig ueberschreiben (bei dieser Nutzerzahl ausreichend).
let queue = Promise.resolve();
function chain(task) {
  const result = queue.then(task);
  queue = result.catch(() => {});
  return result;
}

function writeState(state) {
  return chain(() => fs.writeFile(DATA_FILE, JSON.stringify(state, null, 2), "utf-8"));
}

// Fuehrt `mutator(state)` atomar aus (read-modify-write in einem Queue-Schritt),
// speichert das Ergebnis und gibt den Rueckgabewert des Mutators zurueck.
function mutate(mutator) {
  return chain(async () => {
    const state = await readRaw();
    const result = mutator(state);
    await fs.writeFile(DATA_FILE, JSON.stringify(state, null, 2), "utf-8");
    return result;
  });
}

module.exports = { readState, writeState, mutate };
