// MetaCoin v2 — tek dosyalı, çok özellikli OWO tarzı ekonomi botu
// - JSON kalıcı depolama (native modül yok, Render sorunsuz)
// - Slash komutlar (otomatik kayıt: REGISTER_COMMANDS=true)
// - Ephemeral yanıtlar "flags: MessageFlags.Ephemeral" ile (deprecated uyarısı yok)
// - Health endpoint (Render uyumlu)

import "dotenv/config";
import express from "express";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  Collection,
  Events,
  SlashCommandBuilder,
  EmbedBuilder,
  MessageFlags
} from "discord.js";

// -------------------------- Config / Constants --------------------------

const {
  DISCORD_TOKEN,
  CLIENT_ID,
  GUILD_ID,
  PORT = 3000,
  REGISTER_COMMANDS = "false"
} = process.env;

if (!DISCORD_TOKEN || !CLIENT_ID) {
  console.error("HATA: DISCORD_TOKEN ve CLIENT_ID zorunludur. .env dosyanızı kontrol edin.");
  process.exit(1);
}

const VERSION = "2.0.0";
const DATA_DIR = path.join(process.cwd(), "data");
const DB_FILE = path.join(DATA_DIR, "metacoin.json");

// Ekonomi sabitleri
const COOLDOWNS = {
  daily: 20 * 60 * 60 * 1000,  // 20 saat
  work: 30 * 60 * 1000,        // 30 dk
  beg: 2 * 60 * 1000,          // 2 dk
  crime: 10 * 60 * 1000        // 10 dk
};

// Kasa türleri ve ödül tabloları (yüzdelik ağırlıklar)
// Not: Yüzdeler toplanmak zorunda değil; ağırlık toplamı üzerinden normalize edilir.
const CRATES = {
  basic: {
    price: 500,
    loot: [
      // %30 coin, %30 bronz, %20 gümüş, %10 altın, %5 elmas, %5 whammy (boş değil: düşük coin)
      { weight: 30, type: "coins", min: 150, max: 500 },
      { weight: 30, type: "item", item: "Bronz Parça", min: 1, max: 3 },
      { weight: 20, type: "item", item: "Gümüş Parça", min: 1, max: 2 },
      { weight: 10, type: "item", item: "Altın Parça", min: 1, max: 1 },
      { weight: 5,  type: "item", item: "Elmas Parça", min: 1, max: 1 },
      { weight: 5,  type: "coins", min: 50,  max: 120 } // whammy
    ]
  },
  rare: {
    price: 3000,
    loot: [
      // %30 coin, %30 gümüş, %20 altın, %10 elmas, %5 artefakt, %5 whammy
      { weight: 30, type: "coins", min: 1200, max: 2800 },
      { weight: 30, type: "item", item: "Gümüş Parça", min: 2, max: 4 },
      { weight: 20, type: "item", item: "Altın Parça", min: 1, max: 2 },
      { weight: 10, type: "item", item: "Elmas Parça", min: 1, max: 1 },
      { weight: 5,  type: "item", item: "Artefakt", min: 1, max: 1 },
      { weight: 5,  type: "coins", min: 300, max: 700 }
    ]
  },
  epic: {
    price: 12000,
    loot: [
      // %30 coin, %25 altın, %20 elmas, %15 artefakt, %5 efsanevi, %5 whammy
      { weight: 30, type: "coins", min: 6000, max: 12000 },
      { weight: 25, type: "item", item: "Altın Parça", min: 2, max: 3 },
      { weight: 20, type: "item", item: "Elmas Parça", min: 1, max: 2 },
      { weight: 15, type: "item", item: "Artefakt", min: 1, max: 1 },
      { weight: 5,  type: "item", item: "Efsanevi Cevher", min: 1, max: 1 },
      { weight: 5,  type: "coins", min: 1200, max: 2400 }
    ]
  },
  legendary: {
    price: 60000,
    loot: [
      // %30 coin, %25 elmas, %20 artefakt, %15 efsanevi, %9 mistik, %1 jackpot
      { weight: 30, type: "coins", min: 30000, max: 70000 },
      { weight: 25, type: "item", item: "Elmas Parça", min: 2, max: 4 },
      { weight: 20, type: "item", item: "Artefakt", min: 1, max: 2 },
      { weight: 15, type: "item", item: "Efsanevi Cevher", min: 1, max: 1 },
      { weight: 9,  type: "item", item: "Mistik Relik", min: 1, max: 1 },
      { weight: 1,  type: "coins", min: 200000, max: 300000 } // jackpot ~%1
    ]
  }
};

// Satış bedelleri
const SELL_VALUES = {
  "Bronz Parça": 120,
  "Gümüş Parça": 450,
  "Altın Parça": 1600,
  "Elmas Parça": 6000,
  "Artefakt": 12000,
  "Efsanevi Cevher": 55000,
  "Mistik Relik": 200000
};

// -------------------------- Utils --------------------------

const nowSec = () => Math.floor(Date.now() / 1000);
const randint = (min, max) => crypto.randomInt(min, max + 1);

function choiceWeighted(entries) {
  const total = entries.reduce((a, b) => a + b.weight, 0);
  let roll = randint(1, total);
  for (const e of entries) {
    if (roll <= e.weight) return e;
    roll -= e.weight;
  }
  return entries[entries.length - 1];
}

function ensureDir(p) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

function msToHuman(ms) {
  const s = Math.ceil(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sc = s % 60;
  const parts = [];
  if (h) parts.push(`${h} sa`);
  if (m) parts.push(`${m} dk`);
  if (sc && !h) parts.push(`${sc} sn`);
  return parts.join(" ") || "az kaldı";
}

// -------------------------- JSON Storage (atomic) --------------------------

class Storage {
  constructor(file) {
    this.file = file;
    this.data = { users: {}, cooldowns: {}, items: {} };
    this.dirty = false;
    this.saving = false;
    this._timer = null;
  }
  async load() {
    ensureDir(DATA_DIR);
    try {
      const raw = await fsp.readFile(this.file, "utf8");
      this.data = JSON.parse(raw);
    } catch {
      await this.save(true);
    }
    this._auto();
  }
  _auto() {
    if (this._timer) clearInterval(this._timer);
    this._timer = setInterval(() => this.save(), 15000);
  }
  mark() { this.dirty = true; }
  async save(force = false) {
    if (!this.dirty && !force) return;
    if (this.saving) return;
    this.saving = true;
    try {
      const tmp = this.file + ".tmp";
      await fsp.writeFile(tmp, JSON.stringify(this.data, null, 2), "utf8");
      await fsp.rename(tmp, this.file);
      this.dirty = false;
    } catch (e) {
      console.error("[STORE] save error:", e);
    } finally {
      this.saving = false;
    }
  }
}

const store = new Storage(DB_FILE);

// -------------------------- Economy API --------------------------

function getUser(userId) {
  if (!store.data.users[userId]) {
    store.data.users[userId] = {
      user_id: userId,
      wallet: 0,
      bank: 0,
      bank_max: 50000,
      xp: 0,
      level: 1,
      bio: null,
      created_at: nowSec()
    };
    store.mark();
  }
  return store.data.users[userId];
}

function updateUserMoney(userId, walletDelta = 0, bankDelta = 0) {
  const u = getUser(userId);
  u.wallet = Math.max(0, u.wallet + walletDelta);
  u.bank = Math.max(0, u.bank + bankDelta);
  store.mark();
  return { wallet: u.wallet, bank: u.bank, bank_max: u.bank_max };
}

function addItem(userId, item, qty) {
  if (!store.data.items[userId]) store.data.items[userId] = {};
  store.data.items[userId][item] = (store.data.items[userId][item] || 0) + qty;
  if (store.data.items[userId][item] <= 0) delete store.data.items[userId][item];
  store.mark();
}

function getInventory(userId) {
  const inv = store.data.items[userId] || {};
  return Object.entries(inv).map(([item, qty]) => ({ item, qty }));
}

function removeItem(userId, item, qty) {
  const inv = store.data.items[userId] || {};
  if ((inv[item] || 0) < qty) return false;
  inv[item] -= qty;
  if (inv[item] <= 0) delete inv[item];
  store.mark();
  return true;
}

function networthOf(userId) {
  const u = getUser(userId);
  const inv = getInventory(userId);
  let itemsWorth = 0;
  for (const it of inv) {
    const price = SELL_VALUES[it.item] ?? 0;
    itemsWorth += price * it.qty;
  }
  return u.wallet + u.bank + itemsWorth;
}

// cooldowns
function getCooldown(userId, cmd) {
  const key = `${userId}:${cmd}`;
  const t = store.data.cooldowns[key] || 0;
  return t;
}
function setCooldown(userId, cmd, msFromNow) {
  const key = `${userId}:${cmd}`;
  store.data.cooldowns[key] = nowSec() + Math.ceil(msFromNow / 1000);
  store.mark();
}
function checkCooldown(userId, cmd) {
  const readyAt = getCooldown(userId, cmd);
  const now = nowSec();
  if (readyAt && readyAt > now) {
    return (readyAt - now) * 1000;
  }
  return 0;
}

// money operations
function addCoins(userId, amount) {
  return updateUserMoney(userId, amount, 0).wallet;
}
function deposit(userId, amount) {
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
function withdraw(userId, amount) {
  const u = getUser(userId);
  if (amount === "all") amount = u.bank;
  amount = Math.max(0, Math.floor(amount));
  if (u.bank < amount) throw new Error("Bankada yeterli bakiye yok.");
  updateUserMoney(userId, amount, -amount);
  return amount;
}
function transferCoins(fromId, toId, amount) {
  if (amount <= 0) throw new Error("Miktar 0'dan büyük olmalı.");
  const from = getUser(fromId);
  if (from.wallet < amount) throw new Error("Cüzdanda yeterli bakiye yok.");
  updateUserMoney(fromId, -amount, 0);
  updateUserMoney(toId, amount, 0);
}

// income
function doDaily(userId) {
  const left = checkCooldown(userId, "daily");
  if (left > 0) return { ok: false, left };
  const bonus = randint(1500, 2600);
  addCoins(userId, bonus);
  setCooldown(userId, "daily", COOLDOWNS.daily);
  return { ok: true, bonus };
}
function doWork(userId) {
  const left = checkCooldown(userId, "work");
  if (left > 0) return { ok: false, left };
  const earned = randint(450, 900);
  addCoins(userId, earned);
  setCooldown(userId, "work", COOLDOWNS.work);
  return { ok: true, earned };
}
function doBeg(userId) {
  const left = checkCooldown(userId, "beg");
  if (left > 0) return { ok: false, left };
  const bad = randint(1, 100) <= 25;
  setCooldown(userId, "beg", COOLDOWNS.beg);
  if (bad) return { ok: true, earned: 0, msg: "Kimse para vermedi..." };
  const earned = randint(50, 180);
  addCoins(userId, earned);
  return { ok: true, earned };
}
function doCrime(userId) {
  const left = checkCooldown(userId, "crime");
  if (left > 0) return { ok: false, left };
  const caught = randint(1, 100) <= 45;
  setCooldown(userId, "crime", COOLDOWNS.crime);
  if (caught) {
    const loss = randint(200, 700);
    const u = getUser(userId);
    const realLoss = Math.min(u.wallet, loss);
    addCoins(userId, -realLoss);
    return { ok: false, loss: realLoss };
  } else {
    const gain = randint(600, 2200);
    addCoins(userId, gain);
    return { ok: true, gain };
  }
}

// crates
function buyCrate(userId, type, count) {
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
function openCrate(userId, type, count) {
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
    } else {
      const qty = randint(roll.min, roll.max);
      addItem(userId, roll.item, qty);
      results.push({ type: "item", item: roll.item, qty });
    }
  }
  return results;
}
function sellItem(userId, item, qty) {
  qty = Math.max(1, Math.floor(qty));
  const price = SELL_VALUES[item];
  if (!price) throw new Error("Satılamayan veya bilinmeyen eşya.");
  const ok = removeItem(userId, item, qty);
  if (!ok) throw new Error("Yetersiz adet.");
  const gain = price * qty;
  addCoins(userId, gain);
  return gain;
}

// gambling
function coinflip(userId, side, amount) {
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
function slots(userId, amount) {
  amount = Math.max(1, Math.floor(amount));
  const u = getUser(userId);
  if (u.wallet < amount) throw new Error("Yetersiz cüzdan bakiyesi.");
  const symbols = ["🍒", "💎", "🍀", "7️⃣", "⭐"];
  const r = () => symbols[randint(0, symbols.length - 1)];
  const a = r(), b = r(), c = r();
  let mult = 0;
  if (a === b && b === c) {
    const table = { "🍒": 3, "⭐": 4, "🍀": 5, "💎": 7, "7️⃣": 12 };
    mult = table[a] ?? 3;
  } else if (a === b || b === c || a === c) {
    mult = 1.5;
  }
  let delta = -amount;
  if (mult > 0) {
    const win = Math.floor(amount * mult);
    addCoins(userId, win);
    delta = win;
  } else {
    addCoins(userId, -amount);
  }
  return { reels: [a, b, c], delta, multiplier: mult };
}

// leaderboard helpers
function getTopUsersBy(field, limit = 10) {
  const all = Object.values(store.data.users);
  if (field === "networth") {
    const arr = all.map(u => ({ user_id: u.user_id, net: networthOf(u.user_id) }));
    arr.sort((a, b) => b.net - a.net);
    return arr.slice(0, limit);
  } else {
    const arr = all.slice().sort((a, b) => (b[field] ?? 0) - (a[field] ?? 0));
    return arr.slice(0, limit);
  }
}

// -------------------------- Discord Client & Commands --------------------------

const client = new Client({ intents: [GatewayIntentBits.Guilds] });
client.commands = new Collection();

const slash = [];

// /help
const c_help = new SlashCommandBuilder()
  .setName("help")
  .setDescription("MetaCoin komut yardım listesi");

// balance
const c_balance = new SlashCommandBuilder()
  .setName("balance")
  .setDescription("Cüzdan ve banka bakiyeni gösterir.")
  .addUserOption(o => o.setName("kullanici").setDescription("Birini kontrol et").setRequired(false));

// bank
const c_deposit = new SlashCommandBuilder()
  .setName("deposit")
  .setDescription("Bankaya para yatır.")
  .addStringOption(o => o.setName("miktar").setDescription("Sayı veya 'all'").setRequired(true));

const c_withdraw = new SlashCommandBuilder()
  .setName("withdraw")
  .setDescription("Bankadan para çek.")
  .addStringOption(o => o.setName("miktar").setDescription("Sayı veya 'all'").setRequired(true));

// pay
const c_pay = new SlashCommandBuilder()
  .setName("pay")
  .setDescription("Birine para gönder.")
  .addUserOption(o => o.setName("hedef").setDescription("Kime?").setRequired(true))
  .addIntegerOption(o => o.setName("miktar").setDescription("Kaç MC?").setRequired(true));

// income
const c_daily = new SlashCommandBuilder().setName("daily").setDescription("Günlük ödül (20 saat).");
const c_work  = new SlashCommandBuilder().setName("work").setDescription("Çalış ve para kazan (30 dk).");
const c_beg   = new SlashCommandBuilder().setName("beg").setDescription("Dilencilik (2 dk).");
const c_crime = new SlashCommandBuilder().setName("crime").setDescription("Suç işle (riskli).");

// gambling
const c_bet = new SlashCommandBuilder()
  .setName("bet")
  .setDescription("Yazı tura (coinflip).")
  .addStringOption(o => o.setName("taraf").setDescription("heads/tails")
    .addChoices({ name: "heads", value: "heads" }, { name: "tails", value: "tails" }).setRequired(true))
  .addIntegerOption(o => o.setName("miktar").setDescription("Bahis miktarı").setRequired(true));

const c_slots = new SlashCommandBuilder()
  .setName("slots")
  .setDescription("Slot makinesi.")
  .addIntegerOption(o => o.setName("miktar").setDescription("Bahis miktarı").setRequired(true));

// shop & crates & inventory
const c_shop = new SlashCommandBuilder().setName("shop").setDescription("Mağazayı görüntüle (kasalar).");

const c_buy = new SlashCommandBuilder()
  .setName("buy")
  .setDescription("Kasa satın al.")
  .addStringOption(o => o.setName("kasa").setDescription("Kasa türü")
    .addChoices(
      { name: "basic", value: "basic" },
      { name: "rare", value: "rare" },
      { name: "epic", value: "epic" },
      { name: "legendary", value: "legendary" }
    ).setRequired(true))
  .addIntegerOption(o => o.setName("adet").setDescription("Kaç tane?").setRequired(true));

const c_inventory = new SlashCommandBuilder().setName("inventory").setDescription("Envanterini göster.");

const c_open = new SlashCommandBuilder()
  .setName("open")
  .setDescription("Kasa aç.")
  .addStringOption(o => o.setName("kasa").setDescription("basic/rare/epic/legendary")
    .addChoices(
      { name: "basic", value: "basic" },
      { name: "rare", value: "rare" },
      { name: "epic", value: "epic" },
      { name: "legendary", value: "legendary" }
    ).setRequired(true))
  .addIntegerOption(o => o.setName("adet").setDescription("Kaç tane?").setRequired(true));

const c_sell = new SlashCommandBuilder()
  .setName("sell")
  .setDescription("Eşya sat.")
  .addStringOption(o => o.setName("item").setDescription("Eşya adı").setRequired(true))
  .addIntegerOption(o => o.setName("adet").setDescription("Kaç adet?").setRequired(true));

// leaderboard
const c_leaderboard = new SlashCommandBuilder()
  .setName("leaderboard")
  .setDescription("Liderlik tablosu")
  .addStringOption(o => o.setName("tur").setDescription("wallet/bank/networth")
    .addChoices(
      { name: "wallet", value: "wallet" },
      { name: "bank", value: "bank" },
      { name: "networth", value: "networth" }
    ).setRequired(true));

// profile & cooldowns
const c_profile = new SlashCommandBuilder()
  .setName("profile")
  .setDescription("Profil ayarları")
  .addSubcommand(s => s.setName("setbio").setDescription("Biyografi ayarla")
    .addStringOption(o => o.setName("metin").setDescription("Maks 180 karakter").setRequired(true)));

const c_cooldowns = new SlashCommandBuilder().setName("cooldowns").setDescription("Komut bekleme sürelerini göster.");

slash.push(
  c_help, c_balance, c_deposit, c_withdraw, c_pay,
  c_daily, c_work, c_beg, c_crime,
  c_bet, c_slots,
  c_shop, c_buy, c_inventory, c_open, c_sell,
  c_leaderboard, c_profile, c_cooldowns
);

const allSlashJSON = slash.map(d => d.toJSON());

function embedBase() {
  return new EmbedBuilder().setColor(0x00c2ff).setFooter({ text: `MetaCoin • v${VERSION}` });
}
const fmt = (n) => `${n.toLocaleString("tr-TR")} MC`;

// -------------------------- Register & Events --------------------------

async function registerSlash() {
  const rest = new REST({ version: "10" }).setToken(DISCORD_TOKEN);
  try {
    if (GUILD_ID) {
      await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: allSlashJSON });
      console.log(`[META] Guild(${GUILD_ID}) komutları kaydedildi. (${allSlashJSON.length})`);
    } else {
      await rest.put(Routes.applicationCommands(CLIENT_ID), { body: allSlashJSON });
      console.log(`[META] Global komutlar kaydedildi. (${allSlashJSON.length}) — yayılması birkaç dk sürebilir.`);
    }
  } catch (e) {
    console.error("[META] Komut kayıt hatası:", e);
  }
}

// -------------------------- Express (health) --------------------------

const app = express();
app.get("/", (_req, res) => res.status(200).send(`MetaCoin OK • v${VERSION}`));
app.listen(PORT, () => console.log(`[META] Health endpoint aktif :${PORT}`));

// -------------------------- Bot lifecycle --------------------------

client.once(Events.ClientReady, async (c) => {
  console.log(`[META] ${c.user.tag} olarak giriş yapıldı.`);
  await store.load();
  if (REGISTER_COMMANDS === "true") {
    await registerSlash();
  }
});

client.on(Events.InteractionCreate, async (interaction) => {
  try {
    if (!interaction.isChatInputCommand()) return;

    const name = interaction.commandName;

    // HELP — hızlı yanıt (defer yok)
    if (name === "help") {
      const e = embedBase()
        .setTitle("MetaCoin Yardım")
        .setDescription([
          "💰 **Ekonomi**: `/balance`, `/deposit`, `/withdraw`, `/pay`",
          "⚒️ **Gelir**: `/daily`, `/work`, `/beg`, `/crime`",
          "🎰 **Kumar**: `/bet`, `/slots`",
          "📦 **Kasa**: `/shop`, `/buy`, `/open`, `/inventory`, `/sell`",
          "🏆 **Liderlik**: `/leaderboard`",
          "👤 **Profil**: `/profile setbio`, `/cooldowns`"
        ].join("\n"));
      return interaction.reply({ flags: MessageFlags.Ephemeral, embeds: [e] });
    }

    if (name === "balance") {
      const user = interaction.options.getUser("kullanici") || interaction.user;
      const u = getUser(user.id);
      const net = networthOf(user.id);
      const e = embedBase()
        .setTitle(`Bakiye — ${user.username}`)
        .addFields(
          { name: "Cüzdan", value: fmt(u.wallet), inline: true },
          { name: "Banka", value: `${fmt(u.bank)} / ${fmt(u.bank_max)}`, inline: true },
          { name: "Net Değer", value: fmt(net), inline: true }
        );
      return interaction.reply({ embeds: [e] });
    }

    if (name === "deposit") {
      const val = interaction.options.getString("miktar");
      try {
        const amt = isNaN(Number(val)) && val !== "all" ? null : (val === "all" ? "all" : Number(val));
        if (amt === null) throw new Error("Miktar sayı olmalı veya 'all' yazılmalı.");
        const placed = deposit(interaction.user.id, amt);
        return interaction.reply({ content: `Bankaya **${fmt(placed)}** yatırıldı.` });
      } catch (e) {
        return interaction.reply({ flags: MessageFlags.Ephemeral, content: `❌ ${e.message}` });
      }
    }

    if (name === "withdraw") {
      const val = interaction.options.getString("miktar");
      try {
        const amt = isNaN(Number(val)) && val !== "all" ? null : (val === "all" ? "all" : Number(val));
        if (amt === null) throw new Error("Miktar sayı olmalı veya 'all' yazılmalı.");
        const got = withdraw(interaction.user.id, amt);
        return interaction.reply({ content: `Bankadan **${fmt(got)}** çekildi.` });
      } catch (e) {
        return interaction.reply({ flags: MessageFlags.Ephemeral, content: `❌ ${e.message}` });
      }
    }

    if (name === "pay") {
      const target = interaction.options.getUser("hedef");
      const amount = interaction.options.getInteger("miktar");
      if (target.bot || target.id === interaction.user.id) {
        return interaction.reply({ flags: MessageFlags.Ephemeral, content: "Kendine veya bota para gönderemezsin." });
      }
      try {
        transferCoins(interaction.user.id, target.id, amount);
        return interaction.reply({ content: `**${interaction.user.username}** → **${target.username}**: ${fmt(amount)}` });
      } catch (e) {
        return interaction.reply({ flags: MessageFlags.Ephemeral, content: `❌ ${e.message}` });
      }
    }

    if (name === "daily") {
      const r = doDaily(interaction.user.id);
      if (!r.ok) return interaction.reply({ flags: MessageFlags.Ephemeral, content: `⏳ Daily bekleme: **${msToHuman(r.left)}**` });
      return interaction.reply({ content: `🎁 Günlük ödül: **${fmt(r.bonus)}**` });
    }

    if (name === "work") {
      const r = doWork(interaction.user.id);
      if (!r.ok) return interaction.reply({ flags: MessageFlags.Ephemeral, content: `⏳ Çalışmak için bekleme: **${msToHuman(r.left)}**` });
      return interaction.reply({ content: `🛠️ Çalıştın ve **${fmt(r.earned)}** kazandın.` });
    }

    if (name === "beg") {
      const r = doBeg(interaction.user.id);
      if (!r.ok) return interaction.reply({ flags: MessageFlags.Ephemeral, content: `⏳ Bekleme: **${msToHuman(r.left)}**` });
      if (r.earned === 0) return interaction.reply({ content: "🤷 Kimse bir şey vermedi..." });
      return interaction.reply({ content: `🙏 Birisi acıdı ve **${fmt(r.earned)}** verdi.` });
    }

    if (name === "crime") {
      const r = doCrime(interaction.user.id);
      if (!r.ok && r.left) return interaction.reply({ flags: MessageFlags.Ephemeral, content: `⏳ Bekleme: **${msToHuman(r.left)}**` });
      if (r.ok) return interaction.reply({ content: `🕶️ Vurgun yaptın! **${fmt(r.gain)}** kazandın.` });
      return interaction.reply({ content: `🚨 Yakalandın! **${fmt(r.loss)}** ceza ödedin.` });
    }

    if (name === "bet") {
      const side = interaction.options.getString("taraf");
      const amount = interaction.options.getInteger("miktar");
      try {
        const r = coinflip(interaction.user.id, side, amount);
        return interaction.reply({ content: `🪙 Atılan: **${r.flip}** • Sonuç: **${r.win ? "Kazandın" : "Kaybettin"}** (${fmt(r.delta)})` });
      } catch (e) {
        return interaction.reply({ flags: MessageFlags.Ephemeral, content: `❌ ${e.message}` });
      }
    }

    if (name === "slots") {
      const amount = interaction.options.getInteger("miktar");
      try {
        const r = slots(interaction.user.id, amount);
        return interaction.reply({ content: `🎰 ${r.reels.join(" | ")} • Sonuç: ${r.delta >= 0 ? `Kazanç **${fmt(r.delta)}**` : `Kayıp **${fmt(Math.abs(r.delta))}**`} ${r.multiplier ? `(x${r.multiplier})` : ""}` });
      } catch (e) {
        return interaction.reply({ flags: MessageFlags.Ephemeral, content: `❌ ${e.message}` });
      }
    }

    if (name === "shop") {
      const e = embedBase()
        .setTitle("🛒 Mağaza — Kasalar")
        .setDescription("`/buy kasa:<tür> adet:<n>` komutuyla satın alabilirsin.")
        .addFields(
          { name: "basic", value: `${fmt(CRATES.basic.price)} — başlangıç kasası`, inline: true },
          { name: "rare", value: `${fmt(CRATES.rare.price)} — nadir yağma`, inline: true },
          { name: "epic", value: `${fmt(CRATES.epic.price)} — epik ödüller`, inline: true },
          { name: "legendary", value: `${fmt(CRATES.legendary.price)} — efsanevi ganimet`, inline: true }
        );
      return interaction.reply({ embeds: [e] });
    }

    if (name === "buy") {
      const type = interaction.options.getString("kasa");
      const count = interaction.options.getInteger("adet");
      try {
        const r = buyCrate(interaction.user.id, type, count);
        return interaction.reply({ content: `🧰 **${type}** kasasından **${r.count}** adet aldın. Harcanan: **${fmt(r.spent)}**` });
      } catch (e) {
        return interaction.reply({ flags: MessageFlags.Ephemeral, content: `❌ ${e.message}` });
      }
    }

    if (name === "inventory") {
      const inv = getInventory(interaction.user.id);
      const u = getUser(interaction.user.id);
      const crates = inv.filter(i => i.item.endsWith("crate"));
      const items = inv.filter(i => !i.item.endsWith("crate"));
      const lines1 = crates.length ? crates.map(i => `• ${i.item}: x${i.qty}`).join("\n") : "—";
      const lines2 = items.length ? items.map(i => `• ${i.item}: x${i.qty}`).join("\n") : "—";
      const e = embedBase()
        .setTitle(`🎒 Envanter — ${interaction.user.username}`)
        .addFields(
          { name: "Kasalar", value: lines1 },
          { name: "Eşyalar", value: lines2 },
          { name: "Cüzdan", value: fmt(u.wallet), inline: true },
          { name: "Banka", value: fmt(u.bank), inline: true }
        );
      return interaction.reply({ embeds: [e] });
    }

    if (name === "open") {
      const type = interaction.options.getString("kasa");
      const count = interaction.options.getInteger("adet");
      try {
        const r = openCrate(interaction.user.id, type, count);
        const summary = r.map((x, i) =>
          x.type === "coins" ? `#${i + 1} • ${fmt(x.amount)}` : `#${i + 1} • ${x.item} x${x.qty}`
        ).join("\n");
        return interaction.reply({ content: `📦 Açılan **${count}× ${type}**:\n${summary}` });
      } catch (e) {
        return interaction.reply({ flags: MessageFlags.Ephemeral, content: `❌ ${e.message}` });
      }
    }

    if (name === "sell") {
      const item = interaction.options.getString("item");
      const qty = interaction.options.getInteger("adet");
      if (!SELL_VALUES[item]) {
        return interaction.reply({ flags: MessageFlags.Ephemeral, content: "Bu eşya satılamıyor ya da adı yanlış." });
      }
      try {
        const gain = sellItem(interaction.user.id, item, qty);
        return interaction.reply({ content: `💱 Satıldı: **${item} x${qty}** → **${fmt(gain)}**` });
      } catch (e) {
        return interaction.reply({ flags: MessageFlags.Ephemeral, content: `❌ ${e.message}` });
      }
    }

    if (name === "leaderboard") {
      const type = interaction.options.getString("tur");
      if (type === "networth") {
        const rows = getTopUsersBy("networth", 10);
        const lines = rows.map((r, i) => `**${i + 1}.** <@${r.user_id}> — ${fmt(r.net)}`).join("\n") || "—";
        return interaction.reply({ embeds: [embedBase().setTitle("🏆 Networth Top 10").setDescription(lines)] });
      } else {
        const rows = getTopUsersBy(type, 10);
        const lines = rows.map((u, i) => {
          const val = type === "wallet" ? u.wallet : u.bank;
          return `**${i + 1}.** <@${u.user_id}> — ${fmt(val)}`;
        }).join("\n") || "—";
        return interaction.reply({ embeds: [embedBase().setTitle(`🏆 ${type} Top 10`).setDescription(lines)] });
      }
    }

    if (name === "profile") {
      const sub = interaction.options.getSubcommand();
      if (sub === "setbio") {
        const text = interaction.options.getString("metin").slice(0, 180);
        const u = getUser(interaction.user.id);
        u.bio = text;
        store.mark();
        return interaction.reply({ content: "✅ Biyografi güncellendi." });
      }
    }

    if (name === "cooldowns") {
      const lefts = Object.keys(COOLDOWNS).map(k => {
        const left = checkCooldown(interaction.user.id, k);
        return `• ${k}: ${left > 0 ? msToHuman(left) : "hazır"}`;
      }).join("\n");
      return interaction.reply({ flags: MessageFlags.Ephemeral, content: `⏱️ Cooldowns:\n${lefts}` });
    }

  } catch (err) {
    console.error("Komut hatası:", err);
    try {
      if (interaction.deferred || interaction.replied) {
        await interaction.followUp({ flags: MessageFlags.Ephemeral, content: "Bir hata oluştu. Tekrar deneyin." });
      } else {
        await interaction.reply({ flags: MessageFlags.Ephemeral, content: "Bir hata oluştu. Tekrar deneyin." });
      }
    } catch {}
  }
});

process.on("SIGTERM", async () => {
  console.log("[META] SIGTERM alındı, veriler kaydediliyor...");
  await store.save(true);
  process.exit(0);
});
process.on("SIGINT", async () => {
  console.log("[META] SIGINT alındı, veriler kaydediliyor...");
  await store.save(true);
  process.exit(0);
});

// -------------------------- Start --------------------------

client.login(DISCORD_TOKEN);
