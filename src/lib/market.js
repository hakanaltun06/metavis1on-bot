import { getDB } from "./db.js";


// Seeded RNG (mulberry32) + normal distro
function mulberry32(a){return function(){let t=a+=0x6D2B79F5;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return ((t^t>>>14)>>>0)/4294967296;};}
function normal01(rand){ // Box-Muller
  const u = Math.max(rand(), 1e-9), v = Math.max(rand(), 1e-9);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

// Geometric Brownian Motion step
function gbmStep(S, dtDays, mu, sigma, z){
  const drift = (mu - 0.5 * sigma * sigma) * dtDays;
  const diff = sigma * Math.sqrt(dtDays) * z;
  return Math.max(0.01, S * Math.exp(drift + diff));
}

export function touchSymbol(symbol) {
  const db = getDB();
  const row = db.prepare("SELECT symbol,name,price,drift,vol,seed,last_ts FROM market_symbols WHERE symbol=?").get(symbol);
  if (!row) return null;
  const now = Date.now();
  let dtMs = Math.max(0, now - row.last_ts);
  if (dtMs < 15_000) return row; // 15sn'den kısaysa güncelleme yok

  const dtDays = dtMs / (1000 * 60 * 60 * 24); // gün
  const rand = mulberry32(row.seed >>> 0);
  const z = normal01(rand);
  const newP = gbmStep(row.price, dtDays, row.drift, row.vol, z);
  const newSeed = Math.floor(rand() * 2**31);
  db.prepare("UPDATE market_symbols SET price=?, seed=?, last_ts=? WHERE symbol=?").run(newP, newSeed, now, symbol);
  return db.prepare("SELECT symbol,name,price,drift,vol,seed,last_ts FROM market_symbols WHERE symbol=?").get(symbol);
}

export function listSymbols() {
  const db = getDB();
  const syms = db.prepare("SELECT symbol FROM market_symbols").all();
  return syms.map(s => touchSymbol(s.symbol)); // hepsini güncelle
}
export function getSymbol(symbol) { return touchSymbol(symbol); }

export function buySymbol(user_id, symbol, qty) {
  qty = Number(qty);
  if (qty <= 0) throw new Error("Geçersiz adet");
  const db = getDB();
  const s = touchSymbol(symbol);
  if (!s) throw new Error("Sembol bulunamadı");
  const cost = Math.ceil(s.price * qty);
  const u = db.prepare("SELECT balance FROM users WHERE user_id=?").get(user_id);
  if (!u || u.balance < cost) throw new Error("Yetersiz bakiye");

  const tx = db.transaction(() => {
    db.prepare("UPDATE users SET balance = balance - ? WHERE user_id=?").run(cost, user_id);
    const pos = db.prepare("SELECT qty, avg_price FROM market_positions WHERE user_id=? AND symbol=?").get(user_id, symbol);
    if (!pos) {
      db.prepare("INSERT INTO market_positions (user_id,symbol,qty,avg_price) VALUES (?,?,?,?)").run(user_id, symbol, qty, s.price);
    } else {
      const newQty = pos.qty + qty;
      const newAvg = (pos.avg_price * pos.qty + s.price * qty) / newQty;
      db.prepare("UPDATE market_positions SET qty=?, avg_price=? WHERE user_id=? AND symbol=?").run(newQty, newAvg, user_id, symbol);
    }
  });
  tx();
  return { price: s.price, cost };
}

export function sellSymbol(user_id, symbol, qty) {
  qty = Number(qty);
  if (qty <= 0) throw new Error("Geçersiz adet");
  const db = getDB();
  const s = touchSymbol(symbol);
  if (!s) throw new Error("Sembol bulunamadı");
  const pos = db.prepare("SELECT qty, avg_price FROM market_positions WHERE user_id=? AND symbol=?").get(user_id, symbol);
  if (!pos || pos.qty < qty) throw new Error("Yetersiz adet");

  const revenue = Math.floor(s.price * qty);
  const tx = db.transaction(() => {
    const remain = pos.qty - qty;
    if (remain <= 0) db.prepare("DELETE FROM market_positions WHERE user_id=? AND symbol=?").run(user_id, symbol);
    else db.prepare("UPDATE market_positions SET qty=? WHERE user_id=? AND symbol=?").run(remain, user_id, symbol);
    db.prepare("UPDATE users SET balance = balance + ? WHERE user_id=?").run(revenue, user_id);
  });
  tx();
  const pl = (s.price - pos.avg_price) * qty;
  return { price: s.price, revenue, pl };
}

export function portfolio(user_id) {
  const db = getDB();
  const rows = db.prepare("SELECT symbol, qty, avg_price FROM market_positions WHERE user_id=? ORDER BY symbol").all(user_id);
  const detail = rows.map(r => {
    const s = touchSymbol(r.symbol);
    const val = s.price * r.qty;
    const pl = (s.price - r.avg_price) * r.qty;
    return { ...r, name: s.name, price: s.price, value: val, pl };
  });
  const total = detail.reduce((a, x) => a + x.value, 0);
  return { positions: detail, total };
}

export function equityFor(user_id) {
  const db = getDB();
  const u = db.prepare("SELECT balance, bank FROM users WHERE user_id=?").get(user_id);
  const pf = portfolio(user_id);
  return (u?.balance ?? 0) + (u?.bank ?? 0) + Math.floor(pf.total);
}

export function leaderboardEquity(limit = 10) {
  const db = getDB();
  const ids = db.prepare("SELECT user_id FROM users").all().map(x => x.user_id);
  const arr = ids.map(id => ({ id, eq: equityFor(id) }));
  arr.sort((a,b) => b.eq - a.eq);
  return arr.slice(0, limit);
}

// Kasa EV’leri borsaya bağlamıyoruz; ama dışarıdan hesap için util bıraktık
export function analyzeCaseValue() { return null; }
