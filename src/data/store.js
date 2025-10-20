import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// DB dosyası ve klasörü
const DATA_DIR = path.join(__dirname);
const DB_FILE = path.join(DATA_DIR, "users.json");

// Basit bir yazma kuyruğu (atomic write için)
let writeQueue = Promise.resolve();

async function ensureFile() {
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
    await fs.access(DB_FILE).catch(async () => {
      await fs.writeFile(DB_FILE, JSON.stringify({}, null, 2), "utf8");
    });
  } catch (e) {
    console.error("DB ensure error:", e);
  }
}

async function readDB() {
  await ensureFile();
  const raw = await fs.readFile(DB_FILE, "utf8");
  try {
    return JSON.parse(raw || "{}");
  } catch {
    return {};
  }
}

async function writeDB(nextObj) {
  await ensureFile();
  // Yazma işlemlerini sıraya al
  writeQueue = writeQueue.then(async () => {
    const tmp = DB_FILE + ".tmp";
    await fs.writeFile(tmp, JSON.stringify(nextObj, null, 2), "utf8");
    await fs.rename(tmp, DB_FILE);
  }).catch(e => {
    console.error("DB write error:", e);
  });
  return writeQueue;
}

// --- Public API ---
export async function getUser(userId) {
  const db = await readDB();
  if (!db[userId]) {
    db[userId] = {
      coins: 0,
      lastDaily: 0,
      lastWork: 0,
      lastMine: 0,
      totalEarned: 0,
      totalSpent: 0
    };
    await writeDB(db);
  }
  return db[userId];
}

export async function setUser(userId, data) {
  const db = await readDB();
  db[userId] = data;
  await writeDB(db);
  return db[userId];
}

export async function addCoins(userId, amount) {
  const db = await readDB();
  if (!db[userId]) {
    db[userId] = {
      coins: 0,
      lastDaily: 0,
      lastWork: 0,
      lastMine: 0,
      totalEarned: 0,
      totalSpent: 0
    };
  }
  db[userId].coins += amount;
  if (amount >= 0) db[userId].totalEarned += amount;
  else db[userId].totalSpent += Math.abs(amount);
  if (db[userId].coins < 0) db[userId].coins = 0;
  await writeDB(db);
  return db[userId];
}

export async function transferCoins(fromId, toId, amount) {
  if (amount <= 0) throw new Error("Miktar 0'dan büyük olmalı.");
  const db = await readDB();
  if (!db[fromId] || db[fromId].coins < amount) {
    throw new Error("Yetersiz bakiye.");
  }
  if (!db[toId]) {
    db[toId] = {
      coins: 0,
      lastDaily: 0,
      lastWork: 0,
      lastMine: 0,
      totalEarned: 0,
      totalSpent: 0
    };
  }
  db[fromId].coins -= amount;
  db[fromId].totalSpent += amount;
  db[toId].coins += amount;
  db[toId].totalEarned += amount;
  await writeDB(db);
  return { from: db[fromId], to: db[toId] };
}

export async function topUsers(limit = 10) {
  const db = await readDB();
  const entries = Object.entries(db).map(([id, u]) => ({ id, ...u }));
  entries.sort((a, b) => b.coins - a.coins);
  return entries.slice(0, limit);
}
