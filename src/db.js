import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

const DATA_DIR = path.join(process.cwd(), "data");
const DB_PATH = path.join(DATA_DIR, "metacoin.db");

let db;

export function ensureDatabase() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  db = new Database(DB_PATH);
  db.pragma("journal_mode = wal");

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      user_id TEXT PRIMARY KEY,
      wallet INTEGER NOT NULL DEFAULT 0,
      bank   INTEGER NOT NULL DEFAULT 0,
      bank_max INTEGER NOT NULL DEFAULT 50000,
      xp INTEGER NOT NULL DEFAULT 0,
      level INTEGER NOT NULL DEFAULT 1,
      bio TEXT DEFAULT NULL,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
    );
    CREATE TABLE IF NOT EXISTS items (
      user_id TEXT NOT NULL,
      item TEXT NOT NULL,
      qty INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (user_id, item)
    );
    CREATE TABLE IF NOT EXISTS cooldowns (
      user_id TEXT NOT NULL,
      cmd TEXT NOT NULL,
      ready_at INTEGER NOT NULL,
      PRIMARY KEY (user_id, cmd)
    );
    CREATE INDEX IF NOT EXISTS idx_users_wallet ON users(wallet);
    CREATE INDEX IF NOT EXISTS idx_users_bank ON users(bank);
  `);
}

function getDB() {
  if (!db) ensureDatabase();
  return db;
}

// User helpers
export function getUser(userId) {
  const d = getDB();
  const row = d.prepare(`SELECT * FROM users WHERE user_id = ?`).get(userId);
  if (row) return row;
  d.prepare(`INSERT INTO users (user_id) VALUES (?)`).run(userId);
  return d.prepare(`SELECT * FROM users WHERE user_id = ?`).get(userId);
}

export function updateUserMoney(userId, walletDelta = 0, bankDelta = 0) {
  const d = getDB();
  const current = getUser(userId);
  const wallet = Math.max(0, current.wallet + walletDelta);
  const bank = Math.max(0, current.bank + bankDelta);
  d.prepare(`UPDATE users SET wallet = ?, bank = ? WHERE user_id = ?`).run(wallet, bank, userId);
  return { wallet, bank, bank_max: current.bank_max };
}

export function setUserBank(userId, newBank) {
  const d = getDB();
  d.prepare(`UPDATE users SET bank = ? WHERE user_id = ?`).run(Math.max(0, newBank), userId);
}

export function setUserWallet(userId, newWallet) {
  const d = getDB();
  d.prepare(`UPDATE users SET wallet = ? WHERE user_id = ?`).run(Math.max(0, newWallet), userId);
}

export function setBio(userId, bioText) {
  const d = getDB();
  d.prepare(`UPDATE users SET bio = ? WHERE user_id = ?`).run(bioText, userId);
}

export function getTopBy(field = "wallet", limit = 10) {
  const d = getDB();
  return d.prepare(`SELECT user_id, wallet, bank FROM users ORDER BY ${field} DESC LIMIT ?`).all(limit);
}

// Items
export function addItem(userId, item, qty) {
  const d = getDB();
  const existing = d.prepare(`SELECT qty FROM items WHERE user_id = ? AND item = ?`).get(userId, item);
  if (existing) {
    d.prepare(`UPDATE items SET qty = ? WHERE user_id = ? AND item = ?`).run(existing.qty + qty, userId, item);
  } else {
    d.prepare(`INSERT INTO items (user_id, item, qty) VALUES (?, ?, ?)`).run(userId, item, qty);
  }
}

export function removeItem(userId, item, qty) {
  const d = getDB();
  const existing = d.prepare(`SELECT qty FROM items WHERE user_id = ? AND item = ?`).get(userId, item);
  if (!existing || existing.qty < qty) return false;
  const newQty = existing.qty - qty;
  if (newQty === 0) {
    d.prepare(`DELETE FROM items WHERE user_id = ? AND item = ?`).run(userId, item);
  } else {
    d.prepare(`UPDATE items SET qty = ? WHERE user_id = ? AND item = ?`).run(newQty, userId, item);
  }
  return true;
}

export function getInventory(userId) {
  const d = getDB();
  return d.prepare(`SELECT item, qty FROM items WHERE user_id = ? ORDER BY item ASC`).all(userId);
}

// Cooldowns
export function getCooldown(userId, cmd) {
  const d = getDB();
  const row = d.prepare(`SELECT ready_at FROM cooldowns WHERE user_id = ? AND cmd = ?`).get(userId, cmd);
  return row ? row.ready_at : 0;
}

export function setCooldown(userId, cmd, msFromNow) {
  const d = getDB();
  const readyAt = Math.floor(Date.now() / 1000) + Math.ceil(msFromNow / 1000);
  d.prepare(`
    INSERT INTO cooldowns (user_id, cmd, ready_at)
    VALUES (?, ?, ?)
    ON CONFLICT(user_id, cmd) DO UPDATE SET ready_at = excluded.ready_at
  `).run(userId, cmd, readyAt);
  return readyAt;
}
