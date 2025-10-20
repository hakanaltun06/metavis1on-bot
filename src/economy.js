import crypto from "node:crypto";
import {
  getUser, updateUserMoney, getInventory, addItem, removeItem,
  getCooldown, setCooldown, setBio, getTopBy
} from "./db.js";

// RNG (kriptografik)
function randint(min, max) {
  const r = crypto.randomInt(min, max + 1);
  return r;
}
function choiceWeighted(entries) {
  // entries: [{weight, ...payload}]
  const total = entries.reduce((a, b) => a + b.weight, 0);
  let roll = randint(1, total);
  for (const e of entries) {
    if (roll <= e.weight) return e;
    roll -= e.weight;
  }
  return entries[entries.length - 1];
}

// Ekonomi sabitleri
export const COOLDOWNS = {
  daily: 20 * 60 * 60 * 1000,     // 20 saat
  work: 30 * 60 * 1000,           // 30 dk
  beg: 2 * 60 * 1000,             // 2 dk
  crime: 10 * 60 * 1000,          // 10 dk
};

export const CRATES = {
  basic: {
    price: 500,
    loot: [
      { weight: 60, type: "coins", min: 200, max: 600 },
      { weight: 25, type: "item", item: "Bronz Parça", min: 1, max: 3 },
      { weight: 10, type: "item", item: "Gümüş Parça", min: 1, max: 2 },
      { weight: 4,  type: "item", item: "Altın Parça", min: 1, max: 1 },
      { weight: 1,  type: "item", item: "Elmas Parça", min: 1, max: 1 }
    ]
  },
  rare: {
    price: 2500,
    loot: [
      { weight: 50, type: "coins", min: 1500, max: 3000 },
      { weight: 25, type: "item", item: "Gümüş Parça", min: 2, max: 4 },
      { weight: 18, type: "item", item: "Altın Parça", min: 1, max: 2 },
      { weight: 6,  type: "item", item: "Elmas Parça", min: 1, max: 1 },
      { weight: 1,  type: "item", item: "Artefakt", min: 1, max: 1 }
    ]
  },
  epic: {
    price: 10000,
    loot: [
      { weight: 45, type: "coins", min: 6000, max: 12000 },
      { weight: 25, type: "item", item: "Altın Parça", min: 2, max: 3 },
      { weight: 18, type: "item", item: "Elmas Parça", min: 1, max: 2 },
      { weight: 10, type: "item", item: "Artefakt", min: 1, max: 1 },
      { weight: 2,  type: "item", item: "Efsanevi Cevher", min: 1, max: 1 }
    ]
  },
  legendary: {
    price: 50000,
    loot: [
      { weight: 40, type: "coins", min: 30000, max: 60000 },
      { weight: 25, type: "item", item: "Elmas Parça", min: 2, max: 4 },
      { weight: 20, type: "item", item: "Artefakt", min: 1, max: 2 },
      { weight: 12, type: "item", item: "Efsanevi Cevher", min: 1, max: 1 },
      { weight: 3,  type: "item", item: "Mistik Relik", min: 1, max: 1 }
    ]
  }
};

export const SELL_VALUES = {
  "Bronz Parça": 120,
  "Gümüş Parça": 450,
  "Altın Parça": 1600,
  "Elmas Parça": 6000,
  "Artefakt": 12000,
  "Efsanevi Cevher": 55000,
  "Mistik Relik": 200000
};

export function networthOf(userId) {
  const u = getUser(userId);
  const inv = getInventory(userId);
  let itemsWorth = 0;
  for (const it of inv) {
    const price = SELL_VALUES[it.item] ?? 0;
    itemsWorth += price * it.qty;
  }
  return u.wallet + u.bank + itemsWorth;
}

// Cooldown kontrol
export function checkCooldown(userId, cmd) {
  const readyAtSec = getCooldown(userId, cmd);
  const nowSec = Math.floor(Date.now() / 1000);
  if (readyAtSec && readyAtSec > nowSec) {
    return (readyAtSec - nowSec) * 1000; // ms
  }
  return 0;
}
export function startCooldown(userId, cmd, ms) {
  return setCooldown(userId, cmd, ms);
}

// Basit işlemler
export function addCoins(userId, amount) {
  const { wallet } = updateUserMoney(userId, amount, 0);
  return wallet;
}

export function transferCoins(fromId, toId, amount) {
  if (amount <= 0) throw new Error("Miktar 0'dan büyük olmalı.");
  const from = getUser(fromId);
  if (from.wallet < amount) throw new Error("Cüzdanda yeterli bakiye yok.");
  updateUserMoney(fromId, -amount, 0);
  updateUserMoney(toId, amount, 0);
}

// Banka
export function deposit(userId, amount) {
  const u = getUser(userId);
  if (amount === "all") amount = u.wallet;
  amount = Math.max(0, Math.floor(amount));
  if (u.wallet < amount) throw new Error("Cüzdanda yeterli bakiye yok.");
  const can = Math.max(0, u.bank_max - u.bank);
  const will = Math.min(amount, can);
  if (will <= 0) throw new Error("Bankada yer yok.");
  updateUserMoney(userId, -will, will);
  return will;
}

export function withdraw(userId, amount) {
  const u = getUser(userId);
  if (amount === "all") amount = u.bank;
  amount = Math.max(0, Math.floor(amount));
  if (u.bank < amount) throw new Error("Bankada yeterli bakiye yok.");
  updateUserMoney(userId, amount, -amount);
  return amount;
}

// Kasa alış & açış
export function buyCrate(userId, type, count) {
  const crate = CRATES[type];
  if (!crate) throw new Error("Bilinmeyen kasa türü.");
  count = Math.max(1, Math.floor(count));
  const total = crate.price * count;
  const u = getUser(userId);
  if (u.wallet < total) throw new Error(`Yetersiz bakiye. Gerekli: ${total} MC`);
  updateUserMoney(userId, -total, 0);
  addItem(userId, `${type} crate`, count);
  return { spent: total, count };
}

export function openCrate(userId, type, count) {
  const crate = CRATES[type];
  if (!crate) throw new Error("Bilinmeyen kasa türü.");
  count = Math.max(1, Math.floor(count));
  const ok = removeItem(userId, `${type} crate`, count);
  if (!ok) throw new Error("Envanterde yeterli kasa yok.");

  const results = [];
  for (let i = 0; i < count; i++) {
    const roll = choiceWeighted(crate.loot);
    if (roll.type === "coins") {
      const amount = randint(roll.min, roll.max);
      addCoins(userId, amount);
      results.push({ type: "coins", amount });
    } else if (roll.type === "item") {
      const qty = randint(roll.min, roll.max);
      addItem(userId, roll.item, qty);
      results.push({ type: "item", item: roll.item, qty });
    }
  }
  return results;
}

// Gelir komutları
export function doDaily(userId) {
  const left = checkCooldown(userId, "daily");
  if (left > 0) return { ok: false, left };
  const bonus = randint(1200, 2500);
  addCoins(userId, bonus);
  startCooldown(userId, "daily", COOLDOWNS.daily);
  return { ok: true, bonus };
}

export function doWork(userId) {
  const left = checkCooldown(userId, "work");
  if (left > 0) return { ok: false, left };
  const earned = randint(450, 900);
  addCoins(userId, earned);
  startCooldown(userId, "work", COOLDOWNS.work);
  return { ok: true, earned };
}

export function doBeg(userId) {
  const left = checkCooldown(userId, "beg");
  if (left > 0) return { ok: false, left };
  const chance = randint(1, 100);
  if (chance <= 25) {
    startCooldown(userId, "beg", COOLDOWNS.beg);
    return { ok: true, earned: 0, msg: "Kimse para vermedi..." };
  }
  const earned = randint(50, 180);
  addCoins(userId, earned);
  startCooldown(userId, "beg", COOLDOWNS.beg);
  return { ok: true, earned };
}

export function doCrime(userId) {
  const left = checkCooldown(userId, "crime");
  if (left > 0) return { ok: false, left };
  const chance = randint(1, 100);
  if (chance <= 45) {
    // yakalandı
    const loss = randint(200, 700);
    const u = getUser(userId);
    const realLoss = Math.min(u.wallet, loss);
    addCoins(userId, -realLoss);
    startCooldown(userId, "crime", COOLDOWNS.crime);
    return { ok: false, loss: realLoss };
  }
  const gain = randint(600, 2200);
  addCoins(userId, gain);
  startCooldown(userId, "crime", COOLDOWNS.crime);
  return { ok: true, gain };
}

// Kumar
export function coinflip(userId, side, amount) {
  amount = Math.max(1, Math.floor(amount));
  const u = getUser(userId);
  if (u.wallet < amount) throw new Error("Yetersiz cüzdan bakiyesi.");
  const flip = randint(0, 1) === 0 ? "heads" : "tails";
  if (flip === side) {
    addCoins(userId, amount);
    return { win: true, flip, delta: amount };
  } else {
    addCoins(userId, -amount);
    return { win: false, flip, delta: -amount };
  }
}

export function slots(userId, amount) {
  amount = Math.max(1, Math.floor(amount));
  const u = getUser(userId);
  if (u.wallet < amount) throw new Error("Yetersiz cüzdan bakiyesi.");
  const symbols = ["🍒", "💎", "🍀", "7️⃣", "⭐"];
  const r = () => symbols[randint(0, symbols.length - 1)];
  const a = r(), b = r(), c = r();

  let multiplier = 0;
  if (a === b && b === c) {
    // üçlü
    const table = { "🍒": 3, "⭐": 4, "🍀": 5, "💎": 7, "7️⃣": 12 };
    multiplier = table[a] ?? 3;
  } else if (a === b || b === c || a === c) {
    multiplier = 1.5;
  }

  let delta = -amount;
  if (multiplier > 0) {
    const win = Math.floor(amount * multiplier);
    addCoins(userId, win);
    delta = win;
  } else {
    addCoins(userId, -amount);
  }
  return { reels: [a, b, c], delta, multiplier };
}

// Satış
export function sellItem(userId, item, qty) {
  qty = Math.max(1, Math.floor(qty));
  const price = SELL_VALUES[item];
  if (!price) throw new Error("Satılamayan/ bilinmeyen eşya.");
  const ok = removeItem(userId, item, qty);
  if (!ok) throw new Error("Yetersiz adet.");
  const gain = price * qty;
  addCoins(userId, gain);
  return gain;
}

export { setBio, getTopBy, getInventory, getUser };
