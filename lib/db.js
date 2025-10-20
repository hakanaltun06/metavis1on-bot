import Database from "better-sqlite3";

// Render/Glitch kalıcı disk için ortam değişkeni (yoksa proje klasörüne yazar)
const { DB_PATH = "./metacoin.db" } = process.env;

let db;

export function getDB() {
  if (!db) db = new Database(DB_PATH);
  return db;
}

export async function ensureDatabase() {
  const db = getDB();

  // Users
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      user_id TEXT PRIMARY KEY,
      balance INTEGER NOT NULL DEFAULT 0,
      bank INTEGER NOT NULL DEFAULT 0,
      xp INTEGER NOT NULL DEFAULT 0,
      level INTEGER NOT NULL DEFAULT 1,
      last_daily INTEGER,
      last_work INTEGER,
      last_beg INTEGER
    );
  `);

  // Items (shop/pool)
  db.exec(`
    CREATE TABLE IF NOT EXISTS items (
      item_id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      price INTEGER NOT NULL,
      description TEXT
    );
  `);

  // Inventory
  db.exec(`
    CREATE TABLE IF NOT EXISTS inventory (
      user_id TEXT NOT NULL,
      item_id TEXT NOT NULL,
      qty INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (user_id, item_id),
      FOREIGN KEY (item_id) REFERENCES items(item_id)
    );
  `);

  // Cases
  db.exec(`
    CREATE TABLE IF NOT EXISTS cases (
      case_id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      price INTEGER NOT NULL,
      drops_json TEXT NOT NULL -- [{item_id, weight, minQty, maxQty}] veya {coins:true,...}
    );
  `);

  // Pets
  db.exec(`
    CREATE TABLE IF NOT EXISTS pets (
      pet_id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      rarity TEXT NOT NULL,
      base_power INTEGER NOT NULL
    );
  `);

  // User pets
  db.exec(`
    CREATE TABLE IF NOT EXISTS user_pets (
      user_id TEXT NOT NULL,
      pet_id TEXT NOT NULL,
      nickname TEXT,
      level INTEGER NOT NULL DEFAULT 1,
      xp INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (user_id, pet_id),
      FOREIGN KEY (pet_id) REFERENCES pets(pet_id)
    );
  `);

  seedItems(db);
  seedCases(db);
  seedPets(db);
}

/* ---------------------- SEEDS ---------------------- */

function seedItems(db) {
  const items = [
    // mevcutlar
    { item_id: "cookie", name: "Kurabiye", type: "consumable", price: 50, description: "Pet'ine +5 XP" },
    { item_id: "gem", name: "Mavi Mücevher", type: "gem", price: 1200, description: "Nadir bir koleksiyon parçası." },
    { item_id: "rod", name: "Olta", type: "tool", price: 300, description: "Etkinliklerde +%5 şans." },
    { item_id: "pickaxe", name: "Kazma", type: "tool", price: 650, description: "Etkinliklerde +%10 şans." },
    { item_id: "vip", name: "VIP Kartı", type: "buff", price: 5000, description: "Bazı komutlarda +%5 bonus." },

    // yeni değerli eşyalar (kasalar için)
    { item_id: "sapphire", name: "Safir", type: "gem", price: 1800, description: "Parlak mavi taş." },
    { item_id: "emerald", name: "Zümrüt", type: "gem", price: 2000, description: "Yeşil mücevher." },
    { item_id: "ruby", name: "Yakut", type: "gem", price: 2400, description: "Kızıl taş." },
    { item_id: "diamond_gem", name: "Elmas", type: "gem", price: 6000, description: "Çok değerli taş." },
    { item_id: "gold_bar", name: "Altın Külçe", type: "bar", price: 3500, description: "Satılabilir değerli külçe." },
    { item_id: "platinum_bar", name: "Platin Külçe", type: "bar", price: 7000, description: "Daha değerli külçe." },
    { item_id: "artifact", name: "Antik Eser", type: "relic", price: 20000, description: "Oldukça nadir." },
    { item_id: "ticket", name: "Jackpot Bileti", type: "ticket", price: 1000, description: "Bir koleksiyon, garantili kazanç değil." }
  ];
  const stmt = db.prepare("INSERT OR IGNORE INTO items (item_id,name,type,price,description) VALUES (@item_id,@name,@type,@price,@description)");
  const tx = db.transaction((rows) => rows.forEach((r) => stmt.run(r)));
  tx(items);
}

function seedCases(db) {
  // Not: Yüksek fiyatlı kasalarda EV < fiyat olacak şekilde ağırlıklandırıldı.
  const cases = [
    // mevcut kasalar (korunuyor)
    {
      case_id: "starter", name: "Başlangıç Kasası", price: 250,
      drops_json: JSON.stringify([
        { item_id: "cookie", weight: 45, minQty: 1, maxQty: 3 },
        { item_id: "rod",    weight: 10, minQty: 1, maxQty: 1 },
        { item_id: "gem",    weight: 5,  minQty: 1, maxQty: 1 }
      ])
    },
    {
      case_id: "pro", name: "Pro Kasası", price: 1250,
      drops_json: JSON.stringify([
        { item_id: "cookie",  weight: 20, minQty: 2, maxQty: 5 },
        { item_id: "pickaxe", weight: 15, minQty: 1, maxQty: 1 },
        { item_id: "gem",     weight: 12, minQty: 1, maxQty: 2 },
        { coins: true,        weight: 25, minQty: 300, maxQty: 800 }
      ])
    },
    {
      case_id: "ultra", name: "Ultra Kasası", price: 5000,
      drops_json: JSON.stringify([
        { item_id: "vip",     weight: 8,  minQty: 1, maxQty: 1 },
        { item_id: "gem",     weight: 22, minQty: 2, maxQty: 4 },
        { coins: true,        weight: 40, minQty: 1500, maxQty: 4000 }
      ])
    },

    // yeni geniş yelpaze
    { // düşük seviye
      case_id: "bronze", name: "Bronz Kasası", price: 100,
      drops_json: JSON.stringify([
        { coins: true,        weight: 60, minQty: 40,  maxQty: 120 },
        { item_id: "cookie",  weight: 30, minQty: 1,   maxQty: 3 },
        { item_id: "sapphire",weight: 10, minQty: 1,   maxQty: 1 }
      ])
    },
    {
      case_id: "silver", name: "Gümüş Kasası", price: 250,
      drops_json: JSON.stringify([
        { coins: true,         weight: 55, minQty: 90,  maxQty: 220 },
        { item_id: "cookie",   weight: 25, minQty: 2,   maxQty: 4 },
        { item_id: "sapphire", weight: 10, minQty: 1,   maxQty: 1 },
        { item_id: "emerald",  weight: 10, minQty: 1,   maxQty: 1 }
      ])
    },
    {
      case_id: "gold", name: "Altın Kasası", price: 600,
      drops_json: JSON.stringify([
        { coins: true,          weight: 50, minQty: 200, maxQty: 500 },
        { item_id: "emerald",   weight: 18, minQty: 1,   maxQty: 2 },
        { item_id: "ruby",      weight: 12, minQty: 1,   maxQty: 1 },
        { item_id: "gold_bar",  weight: 8,  minQty: 1,   maxQty: 1 }
      ])
    },
    {
      case_id: "diamond", name: "Elmas Kasası", price: 1500,
      drops_json: JSON.stringify([
        { coins: true,            weight: 45, minQty: 400,  maxQty: 1400 },
        { item_id: "ruby",        weight: 18, minQty: 1,    maxQty: 2 },
        { item_id: "diamond_gem", weight: 10, minQty: 1,    maxQty: 1 },
        { item_id: "gold_bar",    weight: 10, minQty: 1,    maxQty: 2 },
        { item_id: "vip",         weight: 5,  minQty: 1,    maxQty: 1 }
      ])
    },
    {
      case_id: "royal", name: "Kraliyet Kasası", price: 10000,
      drops_json: JSON.stringify([
        { coins: true,             weight: 40, minQty: 2000, maxQty: 6000 },
        { item_id: "diamond_gem",  weight: 15, minQty: 1,    maxQty: 2 },
        { item_id: "platinum_bar", weight: 10, minQty: 1,    maxQty: 1 },
        { item_id: "vip",          weight: 5,  minQty: 1,    maxQty: 1 },
        { item_id: "artifact",     weight: 2,  minQty: 1,    maxQty: 1 }
      ])
    },
    { // düşük kâr şansı v1
      case_id: "mythic", name: "Mitrik Kasası (Düşük Kâr Şansı)", price: 20000,
      drops_json: JSON.stringify([
        { coins: true,             weight: 38, minQty: 3000,  maxQty: 12000 },
        { item_id: "platinum_bar", weight: 12, minQty: 1,     maxQty: 2 },
        { item_id: "diamond_gem",  weight: 12, minQty: 1,     maxQty: 2 },
        { item_id: "artifact",     weight: 3,  minQty: 1,     maxQty: 1 }
      ])
    },
    { // düşük kâr şansı v2
      case_id: "cosmic", name: "Kozmik Kasası (Düşük Kâr Şansı)", price: 50000,
      drops_json: JSON.stringify([
        { coins: true,             weight: 35, minQty: 8000,  maxQty: 35000 },
        { item_id: "platinum_bar", weight: 12, minQty: 1,     maxQty: 3 },
        { item_id: "diamond_gem",  weight: 10, minQty: 1,     maxQty: 3 },
        { item_id: "artifact",     weight: 2,  minQty: 1,     maxQty: 1 }
      ])
    },
    { // çok pahalı, nadir büyük ödeme, genel olarak zararlı
      case_id: "millionaire", name: "Milyoner Kasası (Düşük Kâr Şansı)", price: 100000,
      drops_json: JSON.stringify([
        { coins: true,             weight: 30, minQty: 15000, maxQty: 70000 },
        { item_id: "platinum_bar", weight: 10, minQty: 2,     maxQty: 4 },
        { item_id: "diamond_gem",  weight: 8,  minQty: 2,     maxQty: 4 },
        { item_id: "artifact",     weight: 2,  minQty: 1,     maxQty: 1 }
      ])
    },
    { // jackpot biletli eğlence, yine EV düşük
      case_id: "jackpot", name: "Jackpot Kasası (Çok Düşük Kâr Şansı)", price: 250000,
      drops_json: JSON.stringify([
        { coins: true,            weight: 25, minQty: 25000,  maxQty: 120000 },
        { item_id: "ticket",      weight: 20, minQty: 1,      maxQty: 3 },
        { item_id: "artifact",    weight: 3,  minQty: 1,      maxQty: 1 },
        // ultra nadir (çok düşük şans) büyük para
        { coins: true,            weight: 1,  minQty: 500000, maxQty: 1000000 }
      ])
    },
    // tematik kasalar
    {
      case_id: "tools", name: "Ekipman Kasası", price: 800,
      drops_json: JSON.stringify([
        { item_id: "rod",     weight: 35, minQty: 1, maxQty: 1 },
        { item_id: "pickaxe", weight: 25, minQty: 1, maxQty: 1 },
        { coins: true,        weight: 40, minQty: 150, maxQty: 400 }
      ])
    },
    {
      case_id: "gems", name: "Mücevher Kasası", price: 2000,
      drops_json: JSON.stringify([
        { item_id: "sapphire",     weight: 20, minQty: 1, maxQty: 2 },
        { item_id: "emerald",      weight: 20, minQty: 1, maxQty: 2 },
        { item_id: "ruby",         weight: 15, minQty: 1, maxQty: 2 },
        { item_id: "diamond_gem",  weight: 6,  minQty: 1, maxQty: 1 },
        { coins: true,             weight: 39, minQty: 300, maxQty: 1000 }
      ])
    },
    {
      case_id: "cookiejar", name: "Kurabiye Kavanozu", price: 120,
      drops_json: JSON.stringify([
        { item_id: "cookie", weight: 85, minQty: 2, maxQty: 6 },
        { coins: true,       weight: 15, minQty: 40, maxQty: 120 }
      ])
    },
    {
      case_id: "vip_pack", name: "VIP Paketi", price: 9000,
      drops_json: JSON.stringify([
        { item_id: "vip",          weight: 12, minQty: 1, maxQty: 1 },
        { item_id: "gold_bar",     weight: 10, minQty: 1, maxQty: 2 },
        { item_id: "diamond_gem",  weight: 6,  minQty: 1, maxQty: 1 },
        { coins: true,             weight: 72, minQty: 900, maxQty: 3000 }
      ])
    }
  ];

  const stmt = db.prepare("INSERT OR IGNORE INTO cases (case_id,name,price,drops_json) VALUES (@case_id,@name,@price,@drops_json)");
  const tx = db.transaction((rows) => rows.forEach((r) => stmt.run(r)));
  tx(cases);
}

function seedPets(db) {
  const pets = [
    { pet_id: "cat",   name: "Kedi",   rarity: "common",    base_power: 5 },
    { pet_id: "dog",   name: "Köpek",  rarity: "uncommon",  base_power: 8 },
    { pet_id: "eagle", name: "Kartal", rarity: "rare",      base_power: 12 },
    { pet_id: "fox",   name: "Tilki",  rarity: "epic",      base_power: 16 },
    { pet_id: "wolf",  name: "Kurt",   rarity: "legendary", base_power: 22 }
  ];
  const stmt = db.prepare("INSERT OR IGNORE INTO pets (pet_id,name,rarity,base_power) VALUES (@pet_id,@name,@rarity,@base_power)");
  const tx = db.transaction((rows) => rows.forEach((r) => stmt.run(r)));
  tx(pets);
}

/* ---------------------- USER ECONOMY ---------------------- */

export function getOrCreateUser(user_id) {
  const db = getDB();
  const row = db.prepare("SELECT * FROM users WHERE user_id=?").get(user_id);
  if (row) return row;
  db.prepare("INSERT INTO users (user_id, balance, bank, xp, level) VALUES (?,0,0,0,1)").run(user_id);
  return db.prepare("SELECT * FROM users WHERE user_id=?").get(user_id);
}

export function addBalance(user_id, amount) {
  const db = getDB();
  db.prepare("UPDATE users SET balance = balance + ? WHERE user_id=?").run(amount, user_id);
  return db.prepare("SELECT balance FROM users WHERE user_id=?").get(user_id).balance;
}

export function addXP(user_id, amount) {
  const db = getDB();
  const user = getOrCreateUser(user_id);
  let xp = user.xp + amount;
  let level = user.level;
  const needed = (level) => 100 + (level - 1) * 50;
  while (xp >= needed(level)) {
    xp -= needed(level);
    level++;
  }
  db.prepare("UPDATE users SET xp=?, level=? WHERE user_id=?").run(xp, level, user_id);
  return { xp, level };
}

export function setUserTimestamp(user_id, field, ms) {
  const db = getDB();
  db.prepare(`UPDATE users SET ${field}=? WHERE user_id=?`).run(ms, user_id);
}

export function getUser(user_id) {
  const db = getDB();
  return db.prepare("SELECT * FROM users WHERE user_id=?").get(user_id);
}

export function moveToBank(user_id, amount) {
  const db = getDB();
  const tx = db.transaction((uid, amt) => {
    const u = db.prepare("SELECT balance, bank FROM users WHERE user_id=?").get(uid);
    if (!u || u.balance < amt) throw new Error("Yetersiz cüzdan bakiyesi");
    db.prepare("UPDATE users SET balance = balance - ?, bank = bank + ? WHERE user_id=?").run(amt, amt, uid);
  });
  tx(user_id, amount);
}

export function moveFromBank(user_id, amount) {
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

/* ---------------------- INVENTORY & SHOP ---------------------- */

export function addItem(user_id, item_id, qty) {
  const db = getDB();
  const up = db.prepare("UPDATE inventory SET qty = qty + ? WHERE user_id=? AND item_id=?");
  const ins = db.prepare("INSERT OR IGNORE INTO inventory (user_id,item_id,qty) VALUES (?,?,0)");
  const tx = db.transaction((uid, iid, q) => {
    ins.run(uid, iid);
    up.run(q, uid, iid);
  });
  tx(user_id, item_id, qty);
}

export function getInventory(user_id) {
  const db = getDB();
  return db.prepare(`
    SELECT i.item_id, it.name, it.type, it.price, it.description, i.qty
    FROM inventory i
    JOIN items it ON it.item_id = i.item_id
    WHERE i.user_id=?
    ORDER BY it.type, it.name
  `).all(user_id);
}

export function listShop() {
  const db = getDB();
  return db.prepare("SELECT * FROM items ORDER BY price ASC").all();
}
export function getItemById(item_id) {
  const db = getDB();
  return db.prepare("SELECT * FROM items WHERE item_id=?").get(item_id);
}

/* ---------------------- CASES ---------------------- */

export function listCases() {
  const db = getDB();
  return db.prepare("SELECT * FROM cases ORDER BY price ASC").all();
}
export function getCase(case_id) {
  const db = getDB();
  return db.prepare("SELECT * FROM cases WHERE case_id=?").get(case_id);
}
export function buyCase(user_id, case_id) {
  const db = getDB();
  const c = getCase(case_id);
  if (!c) throw new Error("Kasa bulunamadı");
  const u = getOrCreateUser(user_id);
  if (u.balance < c.price) throw new Error("Yetersiz bakiye");
  db.prepare("UPDATE users SET balance = balance - ? WHERE user_id=?").run(c.price, user_id);
  return c;
}
export function rollCaseReward(user_id, c) {
  const drops = JSON.parse(c.drops_json);
  const total = drops.reduce((a, d) => a + d.weight, 0);
  let pick = Math.random() * total;
  let chosen;
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

// Olasılık & EV analiz (açmadan önce bilgi)
export function analyzeCase(c) {
  const drops = JSON.parse(c.drops_json);
  const totalW = drops.reduce((a, d) => a + d.weight, 0);
  const rows = drops.map(d => {
    const p = d.weight / totalW; // 0..1
    const avgQty = ((d.minQty ?? 1) + (d.maxQty ?? 1)) / 2;
    let valueMin = 0, valueMax = 0, valueAvg = 0, label = "";
    if (d.coins) {
      valueMin = d.minQty ?? 0;
      valueMax = d.maxQty ?? 0;
      valueAvg = avgQty;
      label = "🪙 Coin";
    } else {
      const it = getItemById(d.item_id);
      // Burada "satılabilir değer" = shop fiyatının yarısı
      const sellVal = Math.floor((it?.price ?? 0) * 0.5);
      valueMin = sellVal * (d.minQty ?? 1);
      valueMax = sellVal * (d.maxQty ?? 1);
      valueAvg = sellVal * avgQty;
      label = it ? it.name : d.item_id;
    }
    return {
      label,
      p, // olasılık
      qty: { min: d.minQty ?? 1, max: d.maxQty ?? 1 },
      v: { min: valueMin, avg: valueAvg, max: valueMax }
    };
  });

  const ev = rows.reduce((s, r) => s + r.p * r.v.avg, 0); // beklenen coin karşılığı
  return { rows, ev };
}

/* ---------------------- LEADERBOARDS ---------------------- */

export function topRich(limit = 10) {
  const db = getDB();
  return db.prepare(`
    SELECT user_id, balance, bank, (balance+bank) AS total
    FROM users
    ORDER BY total DESC
    LIMIT ?
  `).all(limit);
}

export function topLevels(limit = 10) {
  const db = getDB();
  return db.prepare(`
    SELECT user_id, level, xp
    FROM users
    ORDER BY level DESC, xp DESC
    LIMIT ?
  `).all(limit);
}

/* ---------------------- PETS ---------------------- */

export function listPets() {
  const db = getDB();
  return db.prepare("SELECT * FROM pets ORDER BY base_power ASC").all();
}
export function adoptPet(user_id, pet_id, nickname) {
  const db = getDB();
  const p = db.prepare("SELECT * FROM pets WHERE pet_id=?").get(pet_id);
  if (!p) throw new Error("Pet bulunamadı");
  const cost = { common: 500, uncommon: 1200, rare: 3000, epic: 7000, legendary: 15000 }[p.rarity] ?? 1000;
  const u = getOrCreateUser(user_id);
  if (u.balance < cost) throw new Error("Yetersiz bakiye");
  const tx = db.transaction(() => {
    db.prepare("UPDATE users SET balance = balance - ? WHERE user_id=?").run(cost, user_id);
    db.prepare("INSERT OR IGNORE INTO user_pets (user_id,pet_id,nickname,level,xp) VALUES (?,?,?,?,?)")
      .run(user_id, pet_id, nickname ?? null, 1, 0);
  });
  tx();
  return { pet: p, cost };
}
export function userPets(user_id) {
  const db = getDB();
  return db.prepare(`
    SELECT up.pet_id, p.name, p.rarity, p.base_power, up.nickname, up.level, up.xp
    FROM user_pets up
    JOIN pets p ON p.pet_id = up.pet_id
    WHERE up.user_id=?
    ORDER BY p.base_power DESC
  `).all(user_id);
}
export function feedPet(user_id, pet_id) {
  const db = getDB();
  const inv = db.prepare("SELECT qty FROM inventory WHERE user_id=? AND item_id='cookie'").get(user_id);
  if (!inv || inv.qty < 1) throw new Error("Kurabiye yok. /mc shop buy item:cookie ile alabilirsin.");
  const up = db.prepare("SELECT level, xp FROM user_pets WHERE user_id=? AND pet_id=?").get(user_id, pet_id);
  if (!up) throw new Error("Bu pet sende yok.");

  const consumeTx = db.transaction(() => {
    db.prepare("UPDATE inventory SET qty = qty - 1 WHERE user_id=? AND item_id='cookie'").run(user_id);
    let xp = up.xp + 5;
    let lvl = up.level;
    const need = (lv) => 50 + (lv - 1) * 25;
    while (xp >= need(lvl)) { xp -= need(lvl); lvl++; }
    db.prepare("UPDATE user_pets SET level=?, xp=? WHERE user_id=? AND pet_id=?").run(lvl, xp, user_id, pet_id);
  });
  consumeTx();

  return db.prepare("SELECT level, xp FROM user_pets WHERE user_id=? AND pet_id=?").get(user_id, pet_id);
}
