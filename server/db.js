// Lightweight JSON document store (in-memory, persisted to disk with debounce).
// Collections behave like tables: auto-increment ids, find/filter/update/remove.
const fs = require('fs');
const path = require('path');

const DATA_DIR = process.env.GDS_DATA_DIR || path.join(__dirname, '..', 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

let state = { _seq: {}, _meta: {} };
let timer = null;

function load() {
  if (fs.existsSync(DB_FILE)) state = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  return state;
}
function persistNow() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = DB_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(state));
  fs.renameSync(tmp, DB_FILE);
}
function persist() {
  clearTimeout(timer);
  timer = setTimeout(persistNow, 300);
}
function reset() { state = { _seq: {}, _meta: {} }; }
function exists() { return fs.existsSync(DB_FILE); }

function col(name) {
  if (!state[name]) state[name] = [];
  const rows = state[name];
  const api = {
    all: () => rows,
    find: (pred) => rows.find(typeof pred === 'function' ? pred : (r) => r.id == pred),
    get: (id) => rows.find((r) => r.id == id),
    filter: (pred) => rows.filter(pred),
    insert(doc) {
      const seq = (state._seq[name] || 0) + 1;
      state._seq[name] = seq;
      const row = { id: doc.id ?? seq, created_at: new Date().toISOString(), ...doc };
      if (doc.id && typeof doc.id === 'number' && doc.id > seq) state._seq[name] = doc.id;
      rows.push(row);
      persist();
      return row;
    },
    update(id, patch) {
      const r = api.get(id);
      if (!r) return null;
      Object.assign(r, patch, { updated_at: new Date().toISOString() });
      persist();
      return r;
    },
    remove(id) {
      const i = rows.findIndex((r) => r.id == id);
      if (i >= 0) { rows.splice(i, 1); persist(); return true; }
      return false;
    },
    count: (pred) => (pred ? rows.filter(pred).length : rows.length),
  };
  return api;
}

function meta(key, value) {
  if (value === undefined) return state._meta[key];
  state._meta[key] = value; persist(); return value;
}

module.exports = { load, persist, persistNow, reset, exists, col, meta, DB_FILE };
