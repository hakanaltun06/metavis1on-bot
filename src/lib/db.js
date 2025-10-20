import Database from "better-sqlite3";

const { DB_PATH = "./metacoin.db" } = process.env;
let _db;
export function getDB() {
  if (!_db) _db = new Database(DB_PATH);
  return _db;
}

export async function ensureDatabase() {
  const db = getDB();

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      user_id TEXT PRIMARY KEY,
      balance INTEGER NOT NULL DEFAULT 0,
      bank INTEGER NOT NULL DEFAULT 0,
      xp INTEGER NOT NULL DEFAULT 0,
      level INTEGER NOT NULL DEFAULT 1,
      last_daily INTEGER,
      last_work INTEGER,
      last_beg INTEGER,
      interest_ts INTEGER
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS items (
      item_id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      price INTEGER NOT NULL,
      description TEXT
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS inventory (
      user_id TEXT NOT NULL,
      item_id TEXT NOT NULL,
      qty INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (user_id, item_id),
      FOREIGN KEY (item_id) REFERENCES items(item_id)
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS cases (
      case_id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      price INTEGER NOT NULL,
      drops_json TEXT NOT NULL
    );
  `);

  seedItems(db);
  seedCases(db);
}

/* --------- Seeds --------- */
function seedItems(db) {
  const items = [
    { item_id: "cookie", name: "Kurabiye", type: "consumable", price: 50, description: "Bazı mini-bonuslar için" },
    { item_id: "gem", name: "Mavi Mücevher", type: "gem", price: 1200, description: "Nadir koleksiyon" },
    { item_id: "rod", name: "Olta", type: "tool", price: 300, description: "+%5 şans bonusu" },
    { item_id: "pickaxe", name: "Kazma", type: "tool", price: 650, description: "+%10 şans bonusu" },
    { item_id: "vip", name: "VIP Kartı", type: "buff", price: 5000, description: "Bazı işlemlerde +%5" },
    { item_id: "sapphire", name: "Safir", type: "gem", price: 1800, description: "Parlak mavi taş" },
    { item_id: "emerald", name: "Zümrüt", type: "gem", price: 2000, description: "Yeşil mücevher" },
    { item_id: "ruby", name: "Yakut", type: "gem", price: 2400, description: "Kızıl taş" },
    { item_id: "diamond_gem", name: "Elmas", type: "gem", price: 6000, description: "Çok değerli" },
    { item_id: "gold_bar", name: "Altın Külçe", type: "bar", price: 3500, description: "Satılabilir külçe" },
    { item_id: "platinum_bar", name: "Platin Külçe", type: "bar", price: 7000, description: "Daha değerli külçe" },
    { item_id: "artifact", name: "Antik Eser", type: "relic", price: 20000, description: "Oldukça nadir" },
    { item_id: "ticket", name: "Jackpot Bileti", type: "ticket", price: 1000, description: "Koleksiyon" }
  ];
  const stmt = db.prepare(
    "INSERT OR IGNORE INTO items (item_id,name,type,price,description) VALUES (@item_id,@name,@type,@price,@description)"
  );
  const tx = db.transaction((rows) => rows.forEach((r) => stmt.run(r)));
  tx(items);
}

function seedCases(db) {
  const cases = [
    // giriş-orta-üst segment + "kâr şansı düşük" kasalar
    { case_id: "starter", name: "Başlangıç", price: 250, drops_json: JSON.stringify([
      { item_id: "cookie", weight: 45, minQty: 1, maxQty: 3 },
      { item_id: "rod", weight: 10, minQty: 1, maxQty: 1 },
      { item_id: "gem", weight: 5, minQty: 1, maxQty: 1 }
    ])},
    { case_id: "bronze", name: "Bronz", price: 100, drops_json: JSON.stringify([
      { coins: true, weight: 60, minQty: 40, maxQty: 120 },
      { item_id: "cookie", weight: 30, minQty: 1, maxQty: 3 },
      { item_id: "sapphire", weight: 10, minQty: 1, maxQty: 1 }
    ])},
    { case_id: "silver", name: "Gümüş", price: 250, drops_json: JSON.stringify([
      { coins: true, weight: 55, minQty: 90, maxQty: 220 },
      { item_id: "cookie", weight: 25, minQty: 2, maxQty: 4 },
      { item_id: "sapphire", weight: 10, minQty: 1, maxQty: 1 },
      { item_id: "emerald", weight: 10, minQty: 1, maxQty: 1 }
    ])},
    { case_id: "gold", name: "Altın", price: 600, drops_json: JSON.stringify([
      { coins: true, weight: 50, minQty: 200, maxQty: 500 },
      { item_id: "emerald", weight: 18, minQty: 1, maxQty: 2 },
      { item_id: "ruby", weight: 12, minQty: 1, maxQty: 1 },
      { item_id: "gold_bar", weight: 8, minQty: 1, maxQty: 1 }
    ])},
    { case_id: "diamond", name: "Elmas", price: 1500, drops_json: JSON.stringify([
      { coins: true, weight: 45, minQty: 400, maxQty: 1400 },
      { item_id: "ruby", weight: 18, minQty: 1, maxQty: 2 },
      { item_id: "diamond_gem", weight: 10, minQty: 1, maxQty: 1 },
      { item_id: "gold_bar", weight: 10, minQty: 1, maxQty: 2 },
      { item_id: "vip", weight: 5, minQty: 1, maxQty: 1 }
    ])},
    { case_id: "ultra", name: "Ultra", price: 5000, drops_json: JSON.stringify([
      { item_id: "vip", weight: 8, minQty: 1, maxQty: 1 },
      { item_id: "gem", weight: 22, minQty: 2, maxQty: 4 },
      { coins: true, weight: 40, minQty: 1500, maxQty: 4000 }
    ])},
    { case_id: "royal", name: "Kraliyet", price: 10000, drops_json: JSON.stringify([
      { coins: true, weight: 40, minQty: 2000, maxQty: 6000 },
      { item_id: "diamond_gem", weight: 15, minQty: 1, maxQty: 2 },
      { item_id: "platinum_bar", weight: 10, minQty: 1, maxQty: 1 },
      { item_id: "vip", weight: 5, minQty: 1, maxQty: 1 },
      { item_id: "artifact", weight: 2, minQty: 1, maxQty: 1 }
    ])},
    { case_id: "mythic", name: "Mitrik (Düşük Kâr Şansı)", price: 20000, drops_json: JSON.stringify([
      { coins: true, weight: 38, minQty: 3000, maxQty: 12000 },
      { item_id: "platinum_bar", weight: 12, minQty: 1, maxQty: 2 },
      { item_id: "diamond_gem", weight: 12, minQty: 1, maxQty: 2 },
      { item_id: "artifact", weight: 3, minQty: 1, maxQty: 1 }
    ])},
    { case_id: "cosmic", name: "Kozmik (Düşük Kâr Şansı)", price: 50000, drops_json: JSON.stringify([
      { coins: true, weight: 35, minQty: 8000, maxQty: 35000 },
      { item_id: "platinum_bar", weight: 12, minQty: 1, maxQty: 3 },
      { item_id: "diamond_gem", weight: 10, minQty: 1, maxQty: 3 },
      { item_id: "artifact", weight: 2, minQty: 1, maxQty: 1 }
    ])},
    { case_id: "millionaire", name: "Milyoner (Düşük Kâr Şansı)", price: 100000, drops_json: JSON.stringify([
      { coins: true, weight: 30, minQty: 15000, maxQty: 70000 },
      { item_id: "platinum_bar", weight: 10, minQty: 2, maxQty: 4 },
      { item_id: "diamond_gem", weight: 8, minQty: 2, maxQty: 4 },
      { item_id: "artifact", weight: 2, minQty: 1, maxQty: 1 }
    ])},
    { case_id: "jackpot", name: "Jackpot (Çok Düşük Kâr Şansı)", price: 250000, drops_json: JSON.stringify([
      { coins: true, weight: 25, minQty: 25000, maxQty: 120000 },
      { item_id: "ticket", weight: 20, minQty: 1, maxQty: 3 },
      { item_id: "artifact", weight: 3, minQty: 1, maxQty: 1 },
      { coins: true, weight: 1, minQty: 500000, maxQty: 1000000 }
    ])},
    // tematik
    { case_id: "tools", name: "Ekipman", price: 800, drops_json: JSON.stringify([
      { item_id: "rod", weight: 35, minQty: 1, maxQty: 1 },
      { item_id: "pickaxe", weight: 25, minQty: 1, maxQty: 1 },
      { coins: true, weight: 40, minQty: 150, maxQty: 400 }
    ])},
    { case_id: "gems", name: "Mücevher", price: 2000, drops_json: JSON.stringify([
      { item_id: "sapphire", weight: 20, minQty: 1, maxQty: 2 },
      { item_id: "emerald", weight: 20, minQty: 1, maxQty: 2 },
      { item_id: "ruby", weight: 15, minQty: 1, maxQty: 2 },
      { item_id: "diamond_gem", weight: 6, minQty: 1, maxQty: 1 },
      { coins: true, weight: 39, minQty: 300, maxQty: 1000 }
    ])},
    { case_id: "cookiejar", name: "Kurabiye Kavanozu", price: 120, drops_json: JSON.stringify([
      { item_id: "cookie", weight: 85, minQty: 2, maxQty: 6 },
      { coins: true, weight: 15, minQty: 40, maxQty: 120 }
    ])}
  ];
  const stmt = db.prepare("INSERT OR IGNORE INTO cases (case_id,name,price,drops_json) VALUES (@case_id,@name,@price,@drops_json)");
  const tx = db.transaction((rows) => rows.forEach((r) => stmt.run(r)));
  tx(cases);
}

/* --------- User / Economy --------- */
export function getOrCreateUser(user_id) {
  const db = getDB();
  const u = db.prepare("SELECT * FROM users WHERE user_id=?").get(user_id);
  if (u) return u;
  db.prepare("INSERT INTO users (user_id,balance,bank,xp,level,interest_ts) VALUES (?,?,?,?,?,?)")
    .run(user_id, 0, 0, 0, 1, Date.now());
  return db.prepare("SELECT * FROM users WHERE user_id=?").get(user_id);
}
export function getUser(user_id) { return getDB().prepare("SELECT * FROM users WHERE user_id=?").get(user_id); }
export function addBalance(user_id, amount) {
  const db = getDB();
  db.prepare("UPDATE users SET balance = balance + ? WHERE user_id=?").run(amount, user_id);
  return db.prepare("SELECT balance FROM users WHERE user_id=?").get(user_id).balance;
}
export function addXP(user_id, amount) {
  const db = getDB();
  const u = getOrCreateUser(user_id);
  let xp = u.xp + amount, level = u.level;
  const need = (lv) => 100 + (lv - 1) * 50;
  while (xp >= need(level)) { xp -= need(level); level++; }
  db.prepare("UPDATE users SET xp=?, level=? WHERE user_id=?").run(xp, level, user_id);
  return { xp, level };
}
export function setUserTimestamp(user_id, field, ms) {
  getDB().prepare(`UPDATE users SET ${field}=? WHERE user_id=?`).run(ms, user_id);
}

/* --------- Interest (Faiz) --------- */
// saatlik bileşik faiz (temkinli)
const HOURLY_INTEREST = 0.0002; // ~%0.02 / saat ≈ %0.48 / gün
export function applyAccruedInterest(user_id) {
  const db = getDB();
  const u = db.prepare("SELECT bank, interest_ts FROM users WHERE user_id=?").get(user_id);
  if (!u) return;
  const now = Date.now();
  const last = u.interest_ts ?? now;
  const hours = Math.max(0, (now - last) / (1000 * 60 * 60));
  if (hours < 0.01) return;
  const factor = Math.pow(1 + HOURLY_INTEREST, hours);
  const newBank = Math.floor(u.bank * factor);
  db.prepare("UPDATE users SET bank=?, interest_ts=? WHERE user_id=?").run(newBank, now, user_id);
}
export function moveToBank(user_id, amount) {
  applyAccruedInterest(user_id);
  const db = getDB();
  const tx = db.transaction((uid, amt) => {
    const u = db.prepare("SELECT balance, bank FROM users WHERE user_id=?").get(uid);
    if (!u || u.balance < amt) throw new Error("Yetersiz cüzdan bakiyesi");
    db.prepare("UPDATE users SET balance = balance - ?, bank = bank + ? WHERE user_id=?").run(amt, amt, uid);
  });
  tx(user_id, amount);
}
export function moveFromBank(user_id, amount) {
  applyAccruedInterest(user_id);
  const db = getDB();
  const tx = db.transaction((uid, amt) => {
    const u = db.prepare("SELECT balance, bank FROM users WHERE user_id=?").get(uid);
    if (!u || u.bank < amt) throw new Error("Yetersiz banka bakiyesi");
    db.prepare("UPDATE users SET bank = bank - ?, balance = balance + ? WHERE user_id=?").run(amt, amt, uid);
  });
  tx(user_id, amount);
}
export function transferBalance(from, to, amount) {
  const db = getDB();
  const tx = db.transaction((f, t, amt) => {
    const u = db.prepare("SELECT balance FROM users WHERE user_id=?").get(f);
    if (!u || u.balance < amt) throw new Error("Yetersiz cüzdan bakiyesi");
    db.prepare("UPDATE users SET balance = balance - ? WHERE user_id=?").run(amt, f);
    getOrCreateUser(t);
    db.prepare("UPDATE users SET balance = balance + ? WHERE user_id=?").run(amt, t);
  });
  tx(from, to, amount);
}

/* --------- Inventory & Shop --------- */
export function addItem(user_id, item_id, qty) {
  const db = getDB();
  const up = db.prepare("UPDATE inventory SET qty = qty + ? WHERE user_id=? AND item_id=?");
  const ins = db.prepare("INSERT OR IGNORE INTO inventory (user_id,item_id,qty) VALUES (?,?,0)");
  const tx = db.transaction((uid, iid, q) => { ins.run(uid, iid); up.run(q, uid, iid); });
  tx(user_id, item_id, qty);
}
export function getInventory(user_id) {
  return getDB().prepare(`
    SELECT i.item_id, it.name, it.type, it.price, it.description, i.qty
    FROM inventory i JOIN items it ON it.item_id = i.item_id
    WHERE i.user_id=? ORDER BY it.type, it.name
  `).all(user_id);
}
export function listShop() { return getDB().prepare("SELECT * FROM items ORDER BY price ASC").all(); }
export function getItemById(id) { return getDB().prepare("SELECT * FROM items WHERE item_id=?").get(id); }

/* --------- Cases --------- */
export function listCases() { return getDB().prepare("SELECT * FROM cases ORDER BY price ASC").all(); }
export function getCase(id) { return getDB().prepare("SELECT * FROM cases WHERE case_id=?").get(id); }
export function buyCase(user_id, id) {
  const c = getCase(id); if (!c) throw new Error("Kasa bulunamadı");
  const db = getDB(); const u = getOrCreateUser(user_id);
  if (u.balance < c.price) throw new Error("Yetersiz bakiye");
  db.prepare("UPDATE users SET balance = balance - ? WHERE user_id=?").run(c.price, user_id);
  return c;
}
export function rollCaseReward(user_id, c) {
  const drops = JSON.parse(c.drops_json);
  const total = drops.reduce((a, d) => a + d.weight, 0);
  let pick = Math.random() * total, chosen;
  for (const d of drops) { if ((pick -= d.weight) <= 0) { chosen = d; break; } }
  const minQ = chosen.minQty ?? 1, maxQ = chosen.maxQty ?? 1;
  const qty = Math.floor(Math.random() * (maxQ - minQ + 1)) + minQ;
  if (chosen.coins) {
    addBalance(user_id, qty);
    return { type: "coins", amount: qty };
  } else {
    addItem(user_id, chosen.item_id, qty);
    const it = getItemById(chosen.item_id);
    return { type: "item", item: it, qty };
  }
}
export function analyzeCase(c) {
  const drops = JSON.parse(c.drops_json);
  const totalW = drops.reduce((a, d) => a + d.weight, 0);
  const rows = drops.map(d => {
    const p = d.weight / totalW;
    const avgQty = ((d.minQty ?? 1) + (d.maxQty ?? 1)) / 2;
    let vavg = 0, label = "";
    if (d.coins) { vavg = avgQty; label = "🪙 Coin"; }
    else {
      const it = getItemById(d.item_id); const sell = Math.floor((it?.price ?? 0) * 0.5);
      vavg = sell * avgQty; label = it ? it.name : d.item_id;
    }
    return { label, p, qty: { min: d.minQty ?? 1, max: d.maxQty ?? 1 }, v: { avg: vavg } };
  });
  const ev = rows.reduce((s, r) => s + r.p * r.v.avg, 0);
  return { rows, ev };
}
