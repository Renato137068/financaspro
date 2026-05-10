const fs = require('fs/promises');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', '.data');
const DB_FILE = path.join(DATA_DIR, 'financaspro.json');

const DEFAULT_STATE = {
  meta: { schemaVersion: 1, updatedAt: null },
  users: [],
  sessions: [],
  transactions: [],
  accounts: [],
  budgets: [],
  recurringTransactions: [],
  configByUserId: {}
};

async function ensureStore() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  try {
    await fs.access(DB_FILE);
  } catch {
    await fs.writeFile(DB_FILE, JSON.stringify(DEFAULT_STATE, null, 2), 'utf8');
  }
}

async function readStore() {
  await ensureStore();
  const raw = await fs.readFile(DB_FILE, 'utf8');
  try {
    return normalizeStore(JSON.parse(raw));
  } catch {
    return JSON.parse(JSON.stringify(DEFAULT_STATE));
  }
}

async function writeStore(state) {
  const next = Object.assign({}, state, {
    meta: Object.assign({}, state.meta, { updatedAt: new Date().toISOString() })
  });
  await ensureStore();
  const tempFile = `${DB_FILE}.tmp`;
  await fs.writeFile(tempFile, JSON.stringify(next, null, 2), 'utf8');
  await fs.rename(tempFile, DB_FILE);
  return next;
}

function normalizeStore(state) {
  const next = Object.assign({}, DEFAULT_STATE, state || {});
  next.meta = Object.assign({}, DEFAULT_STATE.meta, next.meta || {});
  next.users = Array.isArray(next.users) ? next.users : [];
  next.sessions = Array.isArray(next.sessions) ? next.sessions : [];
  next.transactions = Array.isArray(next.transactions) ? next.transactions : [];
  next.accounts = Array.isArray(next.accounts) ? next.accounts : [];
  next.budgets = Array.isArray(next.budgets) ? next.budgets : [];
  next.recurringTransactions = Array.isArray(next.recurringTransactions) ? next.recurringTransactions : [];
  next.configByUserId = next.configByUserId && typeof next.configByUserId === 'object'
    ? next.configByUserId
    : {};
  return next;
}

module.exports = {
  DATA_DIR,
  DB_FILE,
  DEFAULT_STATE,
  normalizeStore,
  readStore,
  writeStore
};
