/**
 * ============================================================================
 * MetaCoin REBORN v2.0.0 (GOD TIER UPGRADE)
 * Next-Gen Advanced Discord Economy & Casino Bot
 * * Mimarisi: 30 Bölümlük Organize Tek Dosya (Single-File Architecture)
 * * Özellikler: Lazy Faiz Sistemi, Hibrit Ödeme, Gelişmiş Admin, Dev Casino
 * * Güvenlik: Smart Defer, Atomic Locks, Tam Validasyon, Veri Kaybı Koruması
 * ============================================================================
 */

// ============================================================================
// 1. IMPORTS
// ============================================================================
import "dotenv/config";
import express from "express";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import admin from "firebase-admin";
import {
    Client, GatewayIntentBits, REST, Routes, Events,
    SlashCommandBuilder, EmbedBuilder, MessageFlags
} from "discord.js";

// ============================================================================
// 2. ENVIRONMENT & CONFIG
// ============================================================================
const {
    DISCORD_TOKEN, CLIENT_ID, GUILD_ID, PORT = 3000,
    REGISTER_COMMANDS = "true", OWNER_IDS = "", DEBUG = "false",
    COMMAND_DEFER_MODE = "smart", USE_GLOBAL_ERROR_EMBEDS = "true", ENABLE_AUDIT_LOGS = "true",
    DATA_PROVIDER = "json", STARTING_WALLET = "0", STARTING_BANK = "0", STARTING_BANK_MAX = "50000",
    DAILY_COOLDOWN_HOURS = "20", WORK_COOLDOWN_MINUTES = "30", BEG_COOLDOWN_MINUTES = "2",
    CRIME_COOLDOWN_MINUTES = "10", ROB_COOLDOWN_MINUTES = "60",
    INTEREST_ENABLED = "true", INTEREST_INTERVAL_HOURS = "12", INTEREST_RATE_SAVINGS = "0.02",
    INTEREST_CAP_MULTIPLIER = "0.20", INTEREST_MAX_IDLE_HOURS = "168", INTEREST_MIN_BALANCE = "1000",
    INTEREST_RATE_LOAN = "0.05", LOAN_LATE_PENALTY_RATE = "0.10", LOAN_MAX_ACTIVE_COUNT = "3",
    INVESTMENT_BREAK_PENALTY_RATE = "0.15",
    TAX_ENABLED = "true", TAX_RATE_TRANSFER = "0.02", TAX_RATE_WITHDRAW = "0.01", TAX_RATE_GAMBLING_WIN = "0.03",
    MAX_BET_AMOUNT = "250000", MAX_SLOTS_AMOUNT = "100000", MAX_TRANSFER_AMOUNT = "1000000",
    MAX_CRATE_OPEN_BATCH = "50", MAX_SELL_BATCH = "100", MAX_BUY_BATCH = "50",
    MAX_INVENTMENT_DAYS = "30", MAX_TRANSACTION_HISTORY = "50",
    ECONOMY_CURRENCY_NAME = "MetaCoin", ECONOMY_CURRENCY_SYMBOL = "MC",
    AUTO_SAVE_INTERVAL_MS = "15000", BACKUP_INTERVAL_MINUTES = "30",
    FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY
} = process.env;

if (!DISCORD_TOKEN || !CLIENT_ID) {
    console.error("FATAL: DISCORD_TOKEN ve CLIENT_ID zorunludur!");
    process.exit(1);
}
const ADMIN_LIST = OWNER_IDS.split(",").map(id => id.trim()).filter(Boolean);
const IS_DEBUG = DEBUG === "true";
const VERSION = "2.0.0";

// ============================================================================
// 3. CONSTANTS
// ============================================================================
const THEME = {
    main: 0x00c2ff, success: 0x2ecc71, error: 0xe74c3c, gamble: 0x9b59b6, 
    admin: 0xe67e22, shop: 0xf1c40f, finance: 0x34495e, audit: 0x7f8c8d, jackpot: 0xffd700
};

const COOLDOWNS = {
    daily: Number(DAILY_COOLDOWN_HOURS) * 60 * 60 * 1000,
    work: Number(WORK_COOLDOWN_MINUTES) * 60 * 1000,
    beg: Number(BEG_COOLDOWN_MINUTES) * 60 * 1000,
    crime: Number(CRIME_COOLDOWN_MINUTES) * 60 * 1000,
    rob: Number(ROB_COOLDOWN_MINUTES) * 60 * 1000
};

const CRATES = {
    basic: { price: 500, desc: "Başlangıç seviyesi basit eşyalar ve paralar içerir.", loot: [{ weight: 30, type: "coins", min: 150, max: 500 }, { weight: 30, type: "item", item: "Bronz Parça", min: 1, max: 3 }, { weight: 20, type: "item", item: "Gümüş Parça", min: 1, max: 2 }, { weight: 10, type: "item", item: "Altın Parça", min: 1, max: 1 }, { weight: 5, type: "item", item: "Elmas Parça", min: 1, max: 1 }, { weight: 5, type: "coins", min: 50, max: 120 }] },
    rare: { price: 3000, desc: "Nadir kalitede eşyalar çıkarma ihtimali yüksektir.", loot: [{ weight: 30, type: "coins", min: 1200, max: 2800 }, { weight: 30, type: "item", item: "Gümüş Parça", min: 2, max: 4 }, { weight: 20, type: "item", item: "Altın Parça", min: 1, max: 2 }, { weight: 10, type: "item", item: "Elmas Parça", min: 1, max: 1 }, { weight: 5, type: "item", item: "Artefakt", min: 1, max: 1 }, { weight: 5, type: "coins", min: 300, max: 700 }] },
    epic: { price: 12000, desc: "Epik derecede değerli parçalar ve yüksek miktar para.", loot: [{ weight: 30, type: "coins", min: 6000, max: 12000 }, { weight: 25, type: "item", item: "Altın Parça", min: 2, max: 3 }, { weight: 20, type: "item", item: "Elmas Parça", min: 1, max: 2 }, { weight: 15, type: "item", item: "Artefakt", min: 1, max: 1 }, { weight: 5, type: "item", item: "Efsanevi Cevher", min: 1, max: 1 }, { weight: 5, type: "coins", min: 1200, max: 2400 }] },
    legendary: { price: 60000, desc: "Efsanevi! Jackpot ihtimali ve muazzam ödüller.", loot: [{ weight: 30, type: "coins", min: 30000, max: 70000 }, { weight: 25, type: "item", item: "Elmas Parça", min: 2, max: 4 }, { weight: 20, type: "item", item: "Artefakt", min: 1, max: 2 }, { weight: 15, type: "item", item: "Efsanevi Cevher", min: 1, max: 1 }, { weight: 9, type: "item", item: "Mistik Relik", min: 1, max: 1 }, { weight: 1, type: "coins", min: 200000, max: 300000 }] }
};

const SHOP_ITEMS = {
    "Olta": { price: 2500, desc: "Balık tutmak için kullanılır." },
    "Kazma": { price: 5000, desc: "Maden kazmak için kullanılır." },
    "Hırsız Maskesi": { price: 15000, desc: "Soygunlarda avantaj sağlar." }
};

const SELL_VALUES = {
    "Bronz Parça": 120, "Gümüş Parça": 450, "Altın Parça": 1600,
    "Elmas Parça": 6000, "Artefakt": 12000, "Efsanevi Cevher": 55000, "Mistik Relik": 200000
};

// ============================================================================
// 4. LOGGER / DIAGNOSTICS
// ============================================================================
const log = (msg) => console.log(`[META] ${msg}`);
const debug = (msg, ms = 0) => { if (IS_DEBUG) console.log(`[DEBUG] ${msg} ${ms ? `(${ms}ms)` : ''}`); };
const errorLog = (msg, err) => console.error(`[ERROR] ${msg}`, err);

// ============================================================================
// 5. UTILITY FUNCTIONS
// ============================================================================
const nowSec = () => Math.floor(Date.now() / 1000);
const randint = (min, max) => crypto.randomInt(min, max + 1);
const fmt = (n) => `${Number(n).toLocaleString("tr-TR")} ${ECONOMY_CURRENCY_SYMBOL}`;
const generateId = () => crypto.randomBytes(8).toString('hex');

function embedBase(color = THEME.main) {
    return new EmbedBuilder().setColor(color)
        .setFooter({ text: `MetaCoin REBORN • v${VERSION}`, iconURL: "https://cdn.discordapp.com/embed/avatars/0.png" })
        .setTimestamp();
}

function choiceWeighted(entries) {
    const total = entries.reduce((a, b) => a + b.weight, 0);
    let roll = randint(1, total);
    for (const e of entries) {
        if (roll <= e.weight) return e;
        roll -= e.weight;
    }
    return entries[entries.length - 1];
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

function makeXpBar(current, req, length = 10) {
    let p = Math.round((current / req) * length);
    if (p > length) p = length;
    return "█".repeat(p) + "░".repeat(length - p);
}

// ============================================================================
// 6. VALIDATION HELPERS
// ============================================================================
function validateAmount(val, allowAll = false) {
    if (allowAll && typeof val === "string" && val.toLowerCase() === "all") return "all";
    const num = Math.floor(Number(val));
    if (isNaN(num) || !Number.isSafeInteger(num) || num <= 0) {
        throw new Error("Lütfen geçerli, pozitif bir tam sayı girin.");
    }
    return num;
}

function enforceBatchLimit(count, max) {
    if (count > max) throw new Error(`Bu işlemi tek seferde en fazla ${max} adet için yapabilirsiniz.`);
}

// ============================================================================
// 7. USER MODEL DEFAULTS
// ============================================================================
const createUserTemplate = (userId) => ({
    user_id: userId,
    wallet: Number(STARTING_WALLET),
    bank: Number(STARTING_BANK),
    bank_max: Number(STARTING_BANK_MAX),
    xp: 0, level: 1, bio: null,
    created_at: nowSec(), updated_at: nowSec(),
    last_interest_calc: nowSec(),
    daily_streak: 0, last_daily: 0,
    total_interest_earned: 0, total_loan_interest_paid: 0, total_taxes_paid: 0, credit_score: 500,
    free_spins: 0, bet_streak: 0, bet_streak_type: "none",
    stats: {
        total_earned: 0, total_lost: 0, total_transferred_in: 0, total_transferred_out: 0,
        crates_opened: 0, items_sold: 0, work_uses: 0, beg_uses: 0,
        crime_success: 0, crime_fails: 0, rob_success: 0, rob_fails: 0,
        slots_plays: 0, bet_plays: 0, largest_win: 0, largest_loss: 0,
        loans_taken: 0, loans_repaid: 0, investments_created: 0, investments_claimed: 0
    }
});

function normalizeSchema(user) {
    const tpl = createUserTemplate(user.user_id);
    const healObj = (target, source) => {
        for (let k in source) {
            if (target[k] === undefined) target[k] = source[k];
            else if (typeof source[k] === "object" && source[k] !== null && !Array.isArray(source[k])) {
                if (typeof target[k] !== "object") target[k] = {};
                healObj(target[k], source[k]);
            }
        }
    };
    healObj(user, tpl);
    if (user.wallet < 0) user.wallet = 0;
    if (user.bank < 0) user.bank = 0;
    return user;
}

// ============================================================================
// 8. STORAGE ABSTRACTION LAYER (100% Coverage)
// ============================================================================
class StorageManager {
    constructor() { this.provider = DATA_PROVIDER; this.locks = new Set(); }
    
    async acquireLock(userId) {
        while (this.locks.has(userId)) await new Promise(r => setTimeout(r, 50));
        this.locks.add(userId);
    }
    releaseLock(userId) { this.locks.delete(userId); }

    async init() {
        if (this.provider === "firestore") await FirestoreImpl.init();
        else await JsonImpl.init();
        log(`Storage Modülü Aktif: ${this.provider.toUpperCase()}`);
    }

    async getUser(id) { let u = this.provider === "firestore" ? await FirestoreImpl.getUser(id) : await JsonImpl.getUser(id); return normalizeSchema(u); }
    async saveUser(id, data) { data.updated_at = nowSec(); return this.provider === "firestore" ? FirestoreImpl.saveUser(id, data) : JsonImpl.saveUser(id, data); }
    async getInventory(id) { return this.provider === "firestore" ? FirestoreImpl.getInventory(id) : JsonImpl.getInventory(id); }
    async saveInventory(id, inv) { return this.provider === "firestore" ? FirestoreImpl.saveInventory(id, inv) : JsonImpl.saveInventory(id, inv); }
    async getAllUsers() { return this.provider === "firestore" ? FirestoreImpl.getAllUsers() : JsonImpl.getAllUsers(); }

    async getCollection(id, col) { return this.provider === "firestore" ? FirestoreImpl.getCollection(id, col) : JsonImpl.getCollection(id, col); }
    async saveDocument(id, col, docId, doc) { return this.provider === "firestore" ? FirestoreImpl.saveDocument(id, col, docId, doc) : JsonImpl.saveDocument(id, col, docId, doc); }
    async deleteDocument(id, col, docId) { return this.provider === "firestore" ? FirestoreImpl.deleteDocument(id, col, docId) : JsonImpl.deleteDocument(id, col, docId); }

    async getLoans(id) { return this.getCollection(id, "loans"); }
    async saveLoan(id, loan) { return this.saveDocument(id, "loans", loan.id, loan); }
    async getInvestments(id) { return this.getCollection(id, "investments"); }
    async saveInvestment(id, inv) { return this.saveDocument(id, "investments", inv.id, inv); }

    async addTransaction(id, tx) { 
        tx.id = generateId(); tx.timestamp = nowSec(); 
        return this.provider === "firestore" ? FirestoreImpl.addTransaction(id, tx) : JsonImpl.addTransaction(id, tx); 
    }
    async getCooldown(id, cmd) { return this.provider === "firestore" ? FirestoreImpl.getCooldown(id, cmd) : JsonImpl.getCooldown(id, cmd); }
    async setCooldown(id, cmd, ms) { return this.provider === "firestore" ? FirestoreImpl.setCooldown(id, cmd, ms) : JsonImpl.setCooldown(id, cmd, ms); }
    async resetCooldown(id, cmd) { return this.provider === "firestore" ? FirestoreImpl.resetCooldown(id, cmd) : JsonImpl.resetCooldown(id, cmd); }

    async getGlobalConfig() { 
        let conf = this.provider === "firestore" ? await FirestoreImpl.getGlobalConfig() : await JsonImpl.getGlobalConfig(); 
        if(!conf.jackpot_pool) conf.jackpot_pool = 50000; // Varsayılan Başlangıç İkramiyesi
        return conf;
    }
    async saveGlobalConfig(conf) { return this.provider === "firestore" ? FirestoreImpl.saveGlobalConfig(conf) : JsonImpl.saveGlobalConfig(conf); }
    async addAuditLog(entry) { return this.provider === "firestore" ? FirestoreImpl.addAuditLog(entry) : JsonImpl.addAuditLog(entry); }
}

// ============================================================================
// 9. JSON STORAGE IMPLEMENTATION
// ============================================================================
const JsonImpl = {
    file: path.join(process.cwd(), "data", "metacoin.json"),
    data: { users: {}, inventories: {}, transactions: {}, loans: {}, investments: {}, cooldowns: {}, system_config: { blacklist: [], economy_freeze: false, jackpot_pool: 50000 }, audit_logs: [] },
    dirty: false,
    async init() {
        const dir = path.join(process.cwd(), "data");
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        try {
            const raw = await fsp.readFile(this.file, "utf8");
            this.data = { ...this.data, ...JSON.parse(raw) };
        } catch { await this.save(true); }
        setInterval(() => this.save(), Number(AUTO_SAVE_INTERVAL_MS));
        setInterval(() => this.backup(), Number(BACKUP_INTERVAL_MINUTES) * 60000);
    },
    mark() { this.dirty = true; },
    async save(force = false) {
        if (!this.dirty && !force) return;
        this.dirty = false;
        try {
            const tmp = this.file + ".tmp";
            await fsp.writeFile(tmp, JSON.stringify(this.data, null, 2), "utf8");
            await fsp.rename(tmp, this.file);
            debug("JSON Sync Complete");
        } catch (e) { errorLog("JSON Save Error", e); }
    },
    async backup() {
        try { await fsp.writeFile(path.join(process.cwd(), "data", `metacoin_backup_${nowSec()}.json`), JSON.stringify(this.data)); } 
        catch(e) { errorLog("Backup Error", e); }
    },
    async getUser(id) { if (!this.data.users[id]) { this.data.users[id] = createUserTemplate(id); this.mark(); } return { ...this.data.users[id] }; },
    async saveUser(id, user) { this.data.users[id] = user; this.mark(); },
    async getInventory(id) { return this.data.inventories[id] || {}; },
    async saveInventory(id, inv) { this.data.inventories[id] = inv; this.mark(); },
    async addTransaction(id, tx) { 
        if (!this.data.transactions[id]) this.data.transactions[id] = [];
        this.data.transactions[id].push(tx); 
        if(this.data.transactions[id].length > Number(MAX_TRANSACTION_HISTORY)) this.data.transactions[id].shift();
        this.mark();
    },
    async getCollection(id, col) { return Object.values(this.data[col]?.[id] || {}); },
    async saveDocument(id, col, docId, doc) { if (!this.data[col][id]) this.data[col][id] = {}; this.data[col][id][docId] = doc; this.mark(); },
    async deleteDocument(id, col, docId) { if (this.data[col][id]?.[docId]) { delete this.data[col][id][docId]; this.mark(); } },
    async getCooldown(id, cmd) { return this.data.cooldowns[`${id}:${cmd}`] || 0; },
    async setCooldown(id, cmd, ms) { this.data.cooldowns[`${id}:${cmd}`] = nowSec() + Math.ceil(ms / 1000); this.mark(); },
    async resetCooldown(id, cmd) { delete this.data.cooldowns[`${id}:${cmd}`]; this.mark(); },
    async getAllUsers() { return Object.values(this.data.users); },
    async getGlobalConfig() { return this.data.system_config || { blacklist: [], economy_freeze: false, jackpot_pool: 50000 }; },
    async saveGlobalConfig(conf) { this.data.system_config = conf; this.mark(); },
    async addAuditLog(entry) { this.data.audit_logs.push(entry); if (this.data.audit_logs.length > 500) this.data.audit_logs.shift(); this.mark(); }
};

// ============================================================================
// 10. FIRESTORE STORAGE IMPLEMENTATION
// ============================================================================
let db;
const FirestoreImpl = {
    async init() {
        if (!admin.apps.length) {
            const pk = FIREBASE_PRIVATE_KEY ? FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n') : undefined;
            if(!FIREBASE_PROJECT_ID || !FIREBASE_CLIENT_EMAIL || !pk) throw new Error("Firestore ENV eksik!");
            admin.initializeApp({ credential: admin.credential.cert({ projectId: FIREBASE_PROJECT_ID, clientEmail: FIREBASE_CLIENT_EMAIL, privateKey: pk }) });
        }
        db = admin.firestore();
    },
    async getUser(id) {
        const snap = await db.collection("users").doc(id).get();
        if (!snap.exists) { const nu = createUserTemplate(id); await db.collection("users").doc(id).set(nu); return nu; }
        return snap.data();
    },
    async saveUser(id, user) { await db.collection("users").doc(id).set(user, { merge: true }); },
    async getInventory(id) { const snap = await db.collection("users").doc(id).collection("inventory").get(); const inv = {}; snap.forEach(d => inv[d.id] = d.data().qty); return inv; },
    async saveInventory(id, inv) {
        const batch = db.batch(); const ref = db.collection("users").doc(id).collection("inventory");
        for (const [item, qty] of Object.entries(inv)) { if (qty <= 0) batch.delete(ref.doc(item)); else batch.set(ref.doc(item), { qty }); }
        await batch.commit();
    },
    async addTransaction(id, tx) { await db.collection("users").doc(id).collection("transactions").doc(tx.id).set(tx); },
    async getCollection(id, col) { const snap = await db.collection("users").doc(id).collection(col).get(); return snap.docs.map(d => d.data()); },
    async saveDocument(id, col, docId, doc) { await db.collection("users").doc(id).collection(col).doc(docId).set(doc); },
    async deleteDocument(id, col, docId) { await db.collection("users").doc(id).collection(col).doc(docId).delete(); },
    async getCooldown(id, cmd) { const s = await db.collection("users").doc(id).collection("cooldowns").doc(cmd).get(); return s.exists ? s.data().expiresAt : 0; },
    async setCooldown(id, cmd, ms) { await db.collection("users").doc(id).collection("cooldowns").doc(cmd).set({ expiresAt: nowSec() + Math.ceil(ms / 1000) }); },
    async resetCooldown(id, cmd) { await db.collection("users").doc(id).collection("cooldowns").doc(cmd).delete(); },
    async getAllUsers() { const s = await db.collection("users").get(); return s.docs.map(d => d.data()); },
    async getGlobalConfig() { const s = await db.collection("system").doc("config").get(); return s.exists ? s.data() : { blacklist: [], economy_freeze: false, jackpot_pool: 50000 }; },
    async saveGlobalConfig(conf) { await db.collection("system").doc("config").set(conf, { merge: true }); },
    async addAuditLog(entry) { await db.collection("audit_logs").doc(entry.id).set(entry); }
};

const DB = new StorageManager();

// ============================================================================
// 11. UNIFIED REPOSITORY FUNCTIONS & SECURITY CHECKS
// ============================================================================
async function checkGlobalSecurity(userId) {
    const conf = await DB.getGlobalConfig();
    if (conf.blacklist && conf.blacklist.includes(userId)) throw new Error("⛔ Kara listedesiniz. Sistemleri kullanamazsınız.");
    if (conf.economy_freeze && !ADMIN_LIST.includes(userId)) throw new Error("❄️ Ekonomi şu an bakıma alındı (Freeze). İşlemler geçici olarak durduruldu.");
}

async function updateStat(u, key, amount, isMaxCheck = false) {
    if (!u.stats[key]) u.stats[key] = 0;
    if (isMaxCheck) { if (amount > u.stats[key]) u.stats[key] = amount; }
    else { u.stats[key] += amount; }
}

async function getNetworth(userId) {
    const u = await DB.getUser(userId);
    const inv = await DB.getInventory(userId);
    let itemsWorth = 0;
    for (const [it, qty] of Object.entries(inv)) itemsWorth += (SELL_VALUES[it] || 0) * qty;
    return u.wallet + u.bank + itemsWorth;
}

async function checkCooldownLeft(userId, cmd) {
    const readyAt = await DB.getCooldown(userId, cmd);
    const now = nowSec();
    return (readyAt > now) ? (readyAt - now) * 1000 : 0;
}

// ============================================================================
// 12. ECONOMY CORE
// ============================================================================
function applyTax(amount, type, userObj) {
    if (TAX_ENABLED !== "true") return { amount, tax: 0 };
    let rate = 0;
    if (type === "transfer") rate = Number(TAX_RATE_TRANSFER);
    if (type === "withdraw") rate = Number(TAX_RATE_WITHDRAW);
    if (type === "gamble") rate = Number(TAX_RATE_GAMBLING_WIN);
    
    const tax = Math.floor(amount * rate);
    userObj.total_taxes_paid = (userObj.total_taxes_paid || 0) + tax;
    return { amount: Math.max(0, amount - tax), tax };
}

async function addItem(userId, item, qty) {
    const inv = await DB.getInventory(userId);
    inv[item] = (inv[item] || 0) + qty;
    await DB.saveInventory(userId, inv);
}

async function removeItem(userId, item, qty) {
    const inv = await DB.getInventory(userId);
    if ((inv[item] || 0) < qty) return false;
    inv[item] -= qty;
    if (inv[item] <= 0) delete inv[item];
    await DB.saveInventory(userId, inv);
    return true;
}

// ============================================================================
// 13. TAX / TRANSFER / WALLET / BANK LOGIC
// ============================================================================
async function processDeposit(userId, amountStr) {
    await DB.acquireLock(userId);
    try {
        await accrueInterestLazy(userId);
        const u = await DB.getUser(userId);
        let amount = validateAmount(amountStr, true) === "all" ? u.wallet : validateAmount(amountStr);
        if (u.wallet < amount) throw new Error("Cüzdanda yeterli bakiye yok.");
        const can = Math.max(0, u.bank_max - u.bank);
        const will = Math.min(amount, can);
        if (will <= 0) throw new Error("Bankada yer yok.");
        
        u.wallet = Math.max(0, u.wallet - will); u.bank += will;
        await DB.saveUser(userId, u);
        await DB.addTransaction(userId, { type: "deposit", amount: will, status: "success" });
        return will;
    } finally { DB.releaseLock(userId); }
}

async function processWithdraw(userId, amountStr) {
    await DB.acquireLock(userId);
    try {
        await accrueInterestLazy(userId);
        const u = await DB.getUser(userId);
        let amount = validateAmount(amountStr, true) === "all" ? u.bank : validateAmount(amountStr);
        if (u.bank < amount) throw new Error("Bankada yeterli bakiye yok.");
        
        const { amount: net, tax } = applyTax(amount, "withdraw", u);
        u.bank = Math.max(0, u.bank - amount); u.wallet += net;
        
        await DB.saveUser(userId, u);
        await DB.addTransaction(userId, { type: "withdraw", amount, net, tax, status: "success" });
        return { net, tax, total: amount };
    } finally { DB.releaseLock(userId); }
}

async function processTransfer(fromId, toId, amountStr) {
    if (fromId === toId) throw new Error("Kendine para gönderemezsin.");
    
    await DB.acquireLock(fromId);
    await DB.acquireLock(toId);
    try {
        const from = await DB.getUser(fromId);
        const amount = validateAmount(amountStr, true);
        let finalAmount = amount === "all" ? from.wallet : amount;
        
        if (finalAmount > Number(MAX_TRANSFER_AMOUNT)) throw new Error(`Tek seferde en fazla ${fmt(MAX_TRANSFER_AMOUNT)} gönderebilirsin.`);
        if (from.wallet < finalAmount || finalAmount <= 0) throw new Error("Cüzdanında yeterli para yok.");
        
        const { amount: net, tax } = applyTax(finalAmount, "transfer", from);
        from.wallet = Math.max(0, from.wallet - finalAmount);
        updateStat(from, "total_transferred_out", finalAmount);
        
        const to = await DB.getUser(toId);
        to.wallet += net;
        updateStat(to, "total_transferred_in", net);
        
        await DB.saveUser(fromId, from); await DB.saveUser(toId, to);
        await DB.addTransaction(fromId, { type: "transfer_out", to: toId, amount: finalAmount, tax });
        await DB.addTransaction(toId, { type: "transfer_in", from: fromId, amount: net, tax_paid_by_sender: tax });
        
        return { net, tax, total: finalAmount };
    } finally { DB.releaseLock(fromId); DB.releaseLock(toId); }
}

// ============================================================================
// 14. XP / LEVEL / RANK LOGIC
// ============================================================================
function processXP(u, amount) {
    u.xp += amount;
    let req = u.level * 500, leveledUp = false, reward = 0;
    while (u.xp >= req) {
        u.xp -= req; u.level++; leveledUp = true;
        u.bank_max += 2500;
        reward += u.level * 500;
        u.wallet += u.level * 500;
        req = u.level * 500;
    }
    return { level: u.level, leveledUp, reward };
}

// ============================================================================
// 15. LOAN LOGIC (Hybrid Wallet+Bank Repayment)
// ============================================================================
function checkLoanPenalties(u, loans) {
    let now = nowSec();
    let penalized = false;
    for (let l of loans) {
        if (now > l.due_date && !l.is_penalized) {
            let penalty = Math.floor(l.amount * Number(LOAN_LATE_PENALTY_RATE));
            l.total_due += penalty;
            l.is_penalized = true;
            u.credit_score = Math.max(0, u.credit_score - 50);
            penalized = true;
        }
    }
    return penalized;
}

async function takeLoan(userId, amountStr) {
    const amount = validateAmount(amountStr);
    await DB.acquireLock(userId);
    try {
        const u = await DB.getUser(userId);
        const loans = await DB.getLoans(userId);
        checkLoanPenalties(u, loans);
        
        if (loans.length >= Number(LOAN_MAX_ACTIVE_COUNT)) throw new Error(`Aynı anda en fazla ${LOAN_MAX_ACTIVE_COUNT} aktif krediniz olabilir.`);
        
        const networth = await getNetworth(userId);
        const limit = (u.level * 5000) + (networth * 0.1) + (u.credit_score * 100);
        const currentDebt = loans.reduce((acc, l) => acc + l.total_due, 0);
        
        if (currentDebt + amount > limit) throw new Error(`Limit yetersiz.\nLimit: ${fmt(limit)}\nBorç: ${fmt(currentDebt)}`);
        
        const interest = Math.floor(amount * Number(INTEREST_RATE_LOAN));
        const totalDue = amount + interest;
        const loan = { id: generateId(), amount, interest, total_due: totalDue, taken_at: nowSec(), due_date: nowSec() + (7 * 86400), is_penalized: false };
        
        u.wallet += amount;
        updateStat(u, "loans_taken", 1);
        
        await DB.saveLoan(userId, loan);
        for(let l of loans) if(l.is_penalized) await DB.saveLoan(userId, l);
        await DB.saveUser(userId, u);
        await DB.addTransaction(userId, { type: "loan_taken", amount });
        
        return loan;
    } finally { DB.releaseLock(userId); }
}

async function repayLoan(userId, loanId, amountStr) {
    await DB.acquireLock(userId);
    try {
        const u = await DB.getUser(userId);
        const loans = await DB.getLoans(userId);
        checkLoanPenalties(u, loans);
        
        const loan = loans.find(l => l.id === loanId);
        if (!loan) throw new Error("Aktif kredi bulunamadı.");
        
        let amount = validateAmount(amountStr, true) === "all" ? loan.total_due : validateAmount(amountStr);
        if (amount > loan.total_due) amount = loan.total_due;
        
        const totalAvailable = u.wallet + u.bank;
        if (totalAvailable < amount) throw new Error("Cüzdan ve banka toplamınız yetersiz.");
        
        if (u.wallet >= amount) {
            u.wallet = Math.max(0, u.wallet - amount);
        } else {
            const rem = amount - u.wallet;
            u.wallet = 0;
            u.bank = Math.max(0, u.bank - rem);
        }
        
        loan.total_due -= amount;
        if (loan.total_due <= 0) {
            await DB.deleteDocument(userId, "loans", loanId);
            u.credit_score = Math.min(1000, u.credit_score + (loan.is_penalized ? 2 : 15));
            updateStat(u, "loans_repaid", 1);
        } else {
            await DB.saveLoan(userId, loan);
        }
        for(let l of loans) if(l.is_penalized && l.id !== loanId) await DB.saveLoan(userId, l);
        await DB.saveUser(userId, u);
        await DB.addTransaction(userId, { type: "loan_repay", amount, loanId });
        
        return { paid: amount, left: loan.total_due, cleared: loan.total_due <= 0 };
    } finally { DB.releaseLock(userId); }
}

// ============================================================================
// 16. INVESTMENT LOGIC
// ============================================================================
async function createInvestment(userId, amountStr, daysStr) {
    const amount = validateAmount(amountStr);
    const days = validateAmount(daysStr);
    if (days < 1 || days > Number(MAX_INVENTMENT_DAYS)) throw new Error(`Vade süresi 1-${MAX_INVENTMENT_DAYS} gün olmalıdır.`);
    
    await DB.acquireLock(userId);
    try {
        const u = await DB.getUser(userId);
        if (u.wallet < amount) throw new Error("Cüzdan bakiyesi yetersiz.");
        
        let baseRate = 0.01;
        if (days >= 7) baseRate = 0.012;
        if (days >= 15) baseRate = 0.015;
        if (days >= 30) baseRate = 0.02;
        
        const returnAmt = Math.floor(amount + (amount * baseRate * days));
        const inv = { id: generateId(), amount, return_amount: returnAmt, days, created_at: nowSec(), unlocks_at: nowSec() + (days * 86400) };
        
        u.wallet = Math.max(0, u.wallet - amount);
        updateStat(u, "investments_created", 1);
        await DB.saveInvestment(userId, inv); await DB.saveUser(userId, u);
        await DB.addTransaction(userId, { type: "invest_create", amount, days });
        return inv;
    } finally { DB.releaseLock(userId); }
}

async function claimInvestment(userId, invId, forceBreak = false) {
    await DB.acquireLock(userId);
    try {
        const u = await DB.getUser(userId);
        const invs = await DB.getInvestments(userId);
        const inv = invs.find(i => i.id === invId);
        if (!inv) throw new Error("Yatırım bulunamadı.");
        
        let payout = 0, isPenalty = false;
        if (nowSec() >= inv.unlocks_at) { payout = inv.return_amount; } 
        else {
            if (!forceBreak) throw new Error("Süre dolmadı. Cezalı erken bozmak için '/investment break' kullanın.");
            let penaltyRate = Number(INVESTMENT_BREAK_PENALTY_RATE);
            payout = Math.floor(inv.amount * (1 - penaltyRate));
            isPenalty = true;
            u.credit_score = Math.max(0, u.credit_score - 10);
            await writeAuditLog(userId, "INVESTMENT_BREAK", userId, `Cezalı bozum. Kalan: ${inv.amount - payout}`);
        }
        
        u.wallet += payout;
        if (!isPenalty) updateStat(u, "investments_claimed", 1);
        await DB.deleteDocument(userId, "investments", invId); await DB.saveUser(userId, u);
        await DB.addTransaction(userId, { type: "invest_claim", payout, isPenalty });
        return { payout, isPenalty };
    } finally { DB.releaseLock(userId); }
}

// ============================================================================
// 17. INTEREST LOGIC (The Hardened Lazy Accrual)
// ============================================================================
async function accrueInterestLazy(userId) {
    if (INTEREST_ENABLED !== "true") return 0;
    const u = await DB.getUser(userId);
    let now = nowSec();
    let last = u.last_interest_calc || now;
    let elapsedHrs = (now - last) / 3600;
    let intervalHrs = Number(INTEREST_INTERVAL_HOURS);
    let intervals = Math.floor(elapsedHrs / intervalHrs);
    let totalGained = 0;

    if (intervals > 0) {
        let maxIntervals = Math.floor(Number(INTEREST_MAX_IDLE_HOURS) / intervalHrs);
        let validIntervals = Math.min(intervals, maxIntervals);

        if (u.bank >= Number(INTEREST_MIN_BALANCE)) {
            let cap = Math.floor(u.bank_max * Number(INTEREST_CAP_MULTIPLIER));
            for(let i=0; i<validIntervals; i++) {
                let tick = Math.floor(u.bank * Number(INTEREST_RATE_SAVINGS));
                if (tick > cap) tick = cap;
                totalGained += tick;
                u.bank += tick;
            }
            if (totalGained > 0) {
                u.total_interest_earned = (u.total_interest_earned || 0) + totalGained;
                await DB.addTransaction(userId, { type: "interest_accrual", amount: totalGained });
            }
        }
        u.last_interest_calc = now;
        await DB.saveUser(userId, u);
    }
    return totalGained;
}

async function getUserWithInterest(userId) {
    await DB.acquireLock(userId);
    try {
        await accrueInterestLazy(userId);
        return await DB.getUser(userId);
    } finally { DB.releaseLock(userId); }
}

// ============================================================================
// 18. INVENTORY / SHOP / CRATES (Batched)
// ============================================================================
async function buyItemOrCrate(userId, name, countStr) {
    const count = validateAmount(countStr, true) === "all" ? Number(MAX_BUY_BATCH) : validateAmount(countStr);
    enforceBatchLimit(count, Number(MAX_BUY_BATCH));
    
    await DB.acquireLock(userId);
    try {
        const u = await DB.getUser(userId);
        if (CRATES[name]) {
            const total = CRATES[name].price * count;
            if (u.wallet < total) throw new Error(`Yetersiz bakiye. Gerekli: ${fmt(total)}`);
            u.wallet = Math.max(0, u.wallet - total);
            await addItem(userId, `${name} crate`, count); await DB.saveUser(userId, u);
            return { type: "crate", total, count, name };
        }
        const rItem = Object.keys(SHOP_ITEMS).find(k => k.toLowerCase() === name.toLowerCase());
        if (rItem) {
            const total = SHOP_ITEMS[rItem].price * count;
            if (u.wallet < total) throw new Error(`Yetersiz bakiye. Gerekli: ${fmt(total)}`);
            u.wallet = Math.max(0, u.wallet - total);
            await addItem(userId, rItem, count); await DB.saveUser(userId, u);
            return { type: "item", total, count, name: rItem };
        }
        throw new Error("Mağazada bulunamadı.");
    } finally { DB.releaseLock(userId); }
}

async function openCrates(userId, type, countStr) {
    let count = validateAmount(countStr, true) === "all" ? "all" : validateAmount(countStr);
    if (!CRATES[type]) throw new Error("Bilinmeyen kasa.");
    
    await DB.acquireLock(userId);
    try {
        const inv = await DB.getInventory(userId);
        let available = inv[`${type} crate`] || 0;
        if (available <= 0) throw new Error("Envanterinde kasa yok.");
        if (count === "all") count = available;
        enforceBatchLimit(count, Number(MAX_CRATE_OPEN_BATCH));
        if (available < count) throw new Error("Yeterli kasa yok.");
        
        await removeItem(userId, `${type} crate`, count);
        
        const results = []; let totalCoins = 0;
        for (let i = 0; i < count; i++) {
            const roll = choiceWeighted(CRATES[type].loot);
            if (roll.type === "coins") {
                const amt = randint(roll.min, roll.max); totalCoins += amt; results.push({ type: "coins", amount: amt });
            } else {
                const qty = randint(roll.min, roll.max); await addItem(userId, roll.item, qty); results.push({ type: "item", item: roll.item, qty });
            }
        }
        const u = await DB.getUser(userId);
        if (totalCoins > 0) u.wallet += totalCoins;
        updateStat(u, "crates_opened", count);
        processXP(u, count * 10);
        await DB.saveUser(userId, u);
        return { count, totalCoins, results };
    } finally { DB.releaseLock(userId); }
}

async function sellItems(userId, item, qtyStr) {
    const qty = validateAmount(qtyStr, true) === "all" ? "all" : validateAmount(qtyStr);
    const rItem = Object.keys(SELL_VALUES).find(k => k.toLowerCase() === item.toLowerCase());
    if (!rItem) throw new Error("Bu eşya satılamaz.");
    
    await DB.acquireLock(userId);
    try {
        const inv = await DB.getInventory(userId);
        let available = inv[rItem] || 0;
        let finalQty = qty === "all" ? available : qty;
        if (available < finalQty || finalQty <= 0) throw new Error("Yeterli eşya yok.");
        enforceBatchLimit(finalQty, Number(MAX_SELL_BATCH));
        
        await removeItem(userId, rItem, finalQty);
        const gain = SELL_VALUES[rItem] * finalQty;
        const u = await DB.getUser(userId);
        u.wallet += gain; updateStat(u, "items_sold", finalQty);
        await DB.saveUser(userId, u);
        return { gain, count: finalQty };
    } finally { DB.releaseLock(userId); }
}

async function sellAllProcess(userId) {
    await DB.acquireLock(userId);
    try {
        const inv = await DB.getInventory(userId);
        let totalGain = 0, totalItems = 0;
        for (const [it, q] of Object.entries(inv)) {
            if (SELL_VALUES[it] && q > 0) {
                totalGain += SELL_VALUES[it] * q;
                totalItems += q;
                await removeItem(userId, it, q);
            }
        }
        if (totalGain === 0) throw new Error("Satılacak hiçbir değerli eşya yok.");
        const u = await DB.getUser(userId);
        u.wallet += totalGain; updateStat(u, "items_sold", totalItems);
        await DB.saveUser(userId, u);
        return { totalGain, totalItems };
    } finally { DB.releaseLock(userId); }
}

// ============================================================================
// 19. GAMBLING ENGINES (SLOTS & BET) - GOD TIER UPGRADE
// ============================================================================

const SLOT_SYMBOLS = [
    { id: "👑", weight: 2, mult3: "JACKPOT", mult2: 0, type: "legendary" },
    { id: "7️⃣", weight: 6, mult3: 20, mult2: 0, type: "epic" },
    { id: "💎", weight: 10, mult3: 10, mult2: 0, type: "epic" },
    { id: "🔔", weight: 15, mult3: 5, mult2: 0, type: "rare" },
    { id: "🍉", weight: 20, mult3: 3, mult2: 0.5, type: "common" },
    { id: "🍋", weight: 25, mult3: 2, mult2: 0.5, type: "common" },
    { id: "🍒", weight: 30, mult3: 1.5, mult2: 0.5, type: "common" },
    { id: "✨", weight: 5, mult3: "FREESPIN", mult2: "FREESPIN_MINI", type: "scatter" }
];

async function processAdvancedSlots(userId, betStr) {
    await DB.acquireLock(userId);
    try {
        const u = await DB.getUser(userId);
        const conf = await DB.getGlobalConfig();
        
        let isFreeSpin = false;
        let finalBet = 0;
        
        if (u.free_spins > 0 && (betStr === "free" || validateAmount(betStr, true) === "all")) {
            isFreeSpin = true;
            u.free_spins -= 1;
            finalBet = 1000; // Free spin base value
        } else {
            let bet = validateAmount(betStr, true) === "all" ? u.wallet : validateAmount(betStr);
            finalBet = bet;
            if (finalBet > Number(MAX_SLOTS_AMOUNT)) finalBet = Number(MAX_SLOTS_AMOUNT);
            if (u.wallet < finalBet || finalBet <= 0) throw new Error("Yetersiz bakiye veya hatalı bahis miktarı.");
            u.wallet = Math.max(0, u.wallet - finalBet);
            conf.jackpot_pool += Math.floor(finalBet * 0.02); // %2 goes to jackpot
        }

        updateStat(u, "slots_plays", 1);
        
        // 3x3 Grid Generation
        const grid = [];
        for (let i = 0; i < 3; i++) {
            grid.push([choiceWeighted(SLOT_SYMBOLS), choiceWeighted(SLOT_SYMBOLS), choiceWeighted(SLOT_SYMBOLS)]);
        }

        // We check the MIDDLE row (index 1) for main win line
        const payline = grid[1];
        const s1 = payline[0], s2 = payline[1], s3 = payline[2];
        
        let win = false;
        let grossWin = 0;
        let eventMsg = "";
        let isJackpot = false;

        // Win Logic
        if (s1.id === s2.id && s2.id === s3.id) {
            win = true;
            if (s1.mult3 === "JACKPOT") {
                isJackpot = true;
                grossWin = conf.jackpot_pool + (finalBet * 50);
                conf.jackpot_pool = 50000; // Reset
                eventMsg = "🚨 **MEGA JACKPOT!!!** 🚨";
            } else if (s1.mult3 === "FREESPIN") {
                u.free_spins += 5;
                eventMsg = "✨ **5 FREE SPIN KAZANDIN!** ✨";
            } else {
                grossWin = Math.floor(finalBet * s1.mult3);
                eventMsg = `🔥 **ÜÇLÜ EŞLEŞME!** (${s1.mult3}x)`;
            }
        } else if (s1.id === s2.id || s2.id === s3.id || s1.id === s3.id) {
            let matchSymbol = (s1.id === s2.id) ? s1 : (s2.id === s3.id) ? s2 : s1;
            if (matchSymbol.mult2 === "FREESPIN_MINI") {
                win = true; u.free_spins += 1;
                eventMsg = "✨ **1 FREE SPIN KAZANDIN!**";
            } else if (matchSymbol.mult2 > 0) {
                win = true; grossWin = Math.floor(finalBet * matchSymbol.mult2);
                eventMsg = `👍 **İkili Eşleşme!** (${matchSymbol.mult2}x Teselli)`;
            }
        }

        let netWin = 0, tax = 0;
        if (win && grossWin > 0) {
            const taxed = applyTax(grossWin - finalBet, "gamble", u);
            tax = taxed.tax;
            netWin = taxed.amount;
            u.wallet += (finalBet + netWin); // Refund bet + add net
            updateStat(u, "largest_win", netWin, true);
            updateStat(u, "total_earned", netWin);
        } else if (!win) {
            updateStat(u, "largest_loss", finalBet, true);
            updateStat(u, "total_lost", finalBet);
            eventMsg = "💀 Maalesef kaybettin.";
        }

        await DB.saveUser(userId, u);
        await DB.saveGlobalConfig(conf);

        return { 
            grid, win, grossWin, netWin, tax, finalBet, isFreeSpin, 
            eventMsg, isJackpot, currentJackpot: conf.jackpot_pool 
        };
    } finally { DB.releaseLock(userId); }
}

const BET_RISK = {
    "low": { chance: 48, mult: 1.5, name: "Düşük Risk" },
    "medium": { chance: 30, mult: 2.5, name: "Orta Risk" },
    "high": { chance: 10, mult: 8, name: "Yüksek Risk" },
    "extreme": { chance: 3, mult: 25, name: "Ekstrem Risk" }
};

async function processAdvancedBet(userId, riskLevel, betStr) {
    if (!BET_RISK[riskLevel]) throw new Error("Geçersiz risk seviyesi.");
    await DB.acquireLock(userId);
    try {
        const u = await DB.getUser(userId);
        let finalBet = validateAmount(betStr, true) === "all" ? u.wallet : validateAmount(betStr);
        if (finalBet > Number(MAX_BET_AMOUNT)) finalBet = Number(MAX_BET_AMOUNT);
        if (u.wallet < finalBet || finalBet <= 0) throw new Error("Yetersiz cüzdan bakiyesi.");
        
        u.wallet = Math.max(0, u.wallet - finalBet);
        updateStat(u, "bet_plays", 1);
        
        const riskData = BET_RISK[riskLevel];
        
        // Streak modifier (+1% chance per win, max +5%)
        let chanceMod = 0;
        if (u.bet_streak > 0 && u.bet_streak_type === "win") {
            chanceMod = Math.min(5, u.bet_streak);
        }
        
        const roll = randint(1, 100);
        const winChance = riskData.chance + chanceMod;
        const win = roll <= winChance;
        
        let grossWin = 0, eventMsg = "";
        
        if (win) {
            u.bet_streak = (u.bet_streak_type === "win") ? u.bet_streak + 1 : 1;
            u.bet_streak_type = "win";
            
            // Streak multiplier bonus (+0.1x per win, max +0.5x)
            let multBonus = Math.min(0.5, (u.bet_streak - 1) * 0.1);
            let finalMult = riskData.mult + multBonus;
            
            grossWin = Math.floor(finalBet * finalMult);
            eventMsg = `🎉 **Başarılı!** (${finalMult.toFixed(1)}x Çarpan)`;
        } else {
            u.bet_streak = (u.bet_streak_type === "loss") ? u.bet_streak + 1 : 1;
            u.bet_streak_type = "loss";
            eventMsg = `💥 **Kasa Kazandı.**`;
        }

        let netWin = 0, tax = 0;
        if (win && grossWin > 0) {
            const taxed = applyTax(grossWin - finalBet, "gamble", u);
            tax = taxed.tax;
            netWin = taxed.amount;
            u.wallet += (finalBet + netWin);
            updateStat(u, "largest_win", netWin, true);
            updateStat(u, "total_earned", netWin);
        } else {
            updateStat(u, "largest_loss", finalBet, true);
            updateStat(u, "total_lost", finalBet);
        }

        await DB.saveUser(userId, u);
        
        return { 
            win, roll, winChance, riskName: riskData.name,
            finalBet, grossWin, netWin, tax, eventMsg,
            streak: u.bet_streak, streakType: u.bet_streak_type
        };
    } finally { DB.releaseLock(userId); }
}

async function doAction(userId, actionType) {
    await DB.acquireLock(userId);
    try {
        const left = await checkCooldownLeft(userId, actionType);
        if (left > 0) return { ok: false, left };
        const u = await DB.getUser(userId);
        let earned = 0, event = "", ok = true, riskLost = 0;

        if (actionType === "daily") {
            const now = nowSec();
            if (u.last_daily > 0 && now - u.last_daily > 48 * 3600) u.daily_streak = 0;
            u.daily_streak++; u.last_daily = now;
            let base = randint(1500, 2600);
            earned = Math.floor(base + (base * Math.min(u.daily_streak * 0.05, 1.0)));
            event = `Günlük ödül. Seri: ${u.daily_streak}`;
        } 
        else if (actionType === "work") {
            earned = randint(450, 900);
            event = ["Kod yazdın", "Garsonluk yaptın", "Maden kazdın", "Şarkı söyledin"][randint(0, 3)];
            updateStat(u, "work_uses", 1); processXP(u, 15);
        } 
        else if (actionType === "beg") {
            updateStat(u, "beg_uses", 1);
            if (randint(1, 100) <= 25) { ok = false; event = "Kimse para vermedi."; }
            else { earned = randint(50, 180); processXP(u, 5); }
        } 
        else if (actionType === "crime") {
            if (randint(1, 100) <= 45) {
                ok = false; riskLost = Math.min(u.wallet, randint(200, 700));
                u.wallet = Math.max(0, u.wallet - riskLost); updateStat(u, "crime_fails", 1);
            } else {
                earned = randint(600, 2200); updateStat(u, "crime_success", 1); processXP(u, 25);
            }
        }
        if (ok && earned > 0) { u.wallet += earned; updateStat(u, "total_earned", earned); }
        await DB.saveUser(userId, u); await DB.setCooldown(userId, actionType, COOLDOWNS[actionType]);
        return { ok, earned, event, riskLost, streak: u.daily_streak };
    } finally { DB.releaseLock(userId); }
}

async function processRob(userId, targetId) {
    if (userId === targetId) throw new Error("Kendini soyamazsın!");
    await DB.acquireLock(userId); await DB.acquireLock(targetId);
    try {
        const left = await checkCooldownLeft(userId, "rob");
        if (left > 0) return { ok: false, cooldown: true, left };
        const u = await DB.getUser(userId); const t = await DB.getUser(targetId);
        if (t.wallet < 500) throw new Error("Hedefin cüzdanı boş sayılır.");
        if (u.wallet < 500) throw new Error("Risk almak için cüzdanında en az 500 MC olmalı.");

        await DB.setCooldown(userId, "rob", COOLDOWNS.rob);
        if (randint(1, 100) <= 35) {
            const stolen = Math.floor(t.wallet * (randint(10, 30) / 100));
            t.wallet = Math.max(0, t.wallet - stolen); u.wallet += stolen;
            updateStat(u, "rob_success", 1);
            await DB.saveUser(userId, u); await DB.saveUser(targetId, t);
            return { ok: true, amount: stolen };
        } else {
            const fine = Math.floor(u.wallet * 0.20);
            u.wallet = Math.max(0, u.wallet - fine); updateStat(u, "rob_fails", 1);
            await DB.saveUser(userId, u); return { ok: false, fine };
        }
    } finally { DB.releaseLock(userId); DB.releaseLock(targetId); }
}

// ============================================================================
// 20. COOLDOWN SYSTEMS (Abstracted above)
// ============================================================================

// ============================================================================
// 21. LEADERBOARDS (Dynamic interaction fetch)
// ============================================================================

// ============================================================================
// 22. PROFILE / STATS (Helpers abstracted above)
// ============================================================================

// ============================================================================
// 23. ADMIN / AUDIT / OWNER TOOLS
// ============================================================================
async function writeAuditLog(adminId, action, targetId, details) {
    if (ENABLE_AUDIT_LOGS !== "true") return;
    await DB.addAuditLog({ id: generateId(), adminId, action, targetId, details, time: nowSec() });
}

// ============================================================================
// 24. SLASH COMMAND BUILDERS (100% Validated)
// ============================================================================
const commands = [
    new SlashCommandBuilder().setName("help").setDescription("MetaCoin REBORN komut yardım listesi"),
    new SlashCommandBuilder().setName("balance").setDescription("Cüzdan, banka ve net değerinizi gösterir.").addUserOption(o => o.setName("kullanici").setDescription("Kimin?")),
    new SlashCommandBuilder().setName("deposit").setDescription("Bankaya para yatır.").addStringOption(o => o.setName("miktar").setDescription("Sayı veya 'all'").setRequired(true)),
    new SlashCommandBuilder().setName("withdraw").setDescription("Bankadan para çek.").addStringOption(o => o.setName("miktar").setDescription("Sayı veya 'all'").setRequired(true)),
    new SlashCommandBuilder().setName("pay").setDescription("Birine para gönder.").addUserOption(o => o.setName("hedef").setRequired(true).setDescription("Kime")).addStringOption(o => o.setName("miktar").setDescription("Miktar veya 'all'").setRequired(true)),
    new SlashCommandBuilder().setName("daily").setDescription("Günlük ödül."),
    new SlashCommandBuilder().setName("work").setDescription("Çalışıp para kazanın."),
    new SlashCommandBuilder().setName("beg").setDescription("Dilencilik yapın."),
    new SlashCommandBuilder().setName("crime").setDescription("Suç işleyin (Riskli)."),
    new SlashCommandBuilder().setName("rob").setDescription("Soygun yapın (Riskli).").addUserOption(o => o.setName("hedef").setRequired(true).setDescription("Kurban")),
    
    new SlashCommandBuilder().setName("bet").setDescription("Gelişmiş riskli bahis sistemi.")
        .addStringOption(o => o.setName("risk").setRequired(true).setDescription("Risk Seviyesi").addChoices(
            { name: "🟢 Düşük Risk (%48 Kazanma, 1.5x)", value: "low" }, 
            { name: "🟡 Orta Risk (%30 Kazanma, 2.5x)", value: "medium" },
            { name: "🔴 Yüksek Risk (%10 Kazanma, 8x)", value: "high" },
            { name: "🔥 Ekstrem Risk (%3 Kazanma, 25x)", value: "extreme" }
        ))
        .addStringOption(o => o.setName("miktar").setRequired(true).setDescription("Miktar veya 'all'")),
    
    new SlashCommandBuilder().setName("slots").setDescription("Gelişmiş Jackpot Slot Makinesi.")
        .addStringOption(o => o.setName("miktar").setRequired(true).setDescription("Miktar, 'all' veya free spin için 'free'")),
    
    new SlashCommandBuilder().setName("shop").setDescription("Mağazayı görüntüle.")
        .addStringOption(o => o.setName("kategori").setDescription("crates/items").addChoices({ name: "crates", value: "crates" }, { name: "items", value: "items" })),
    
    new SlashCommandBuilder().setName("buy").setDescription("Satın al.")
        .addStringOption(o => o.setName("urun").setRequired(true).setDescription("Adı"))
        .addStringOption(o => o.setName("adet").setRequired(true).setDescription("Adet veya 'all'")),
        
    new SlashCommandBuilder().setName("inventory").setDescription("Envanter.").addUserOption(o => o.setName("kullanici").setDescription("Kimin?")),
    
    new SlashCommandBuilder().setName("open").setDescription("Kasa aç.")
        .addStringOption(o => o.setName("kasa").setRequired(true).setDescription("Kasa türü").addChoices({ name: "basic", value: "basic" }, { name: "rare", value: "rare" }, { name: "epic", value: "epic" }, { name: "legendary", value: "legendary" }))
        .addStringOption(o => o.setName("adet").setRequired(true).setDescription("Adet veya 'all'")),
        
    new SlashCommandBuilder().setName("sell").setDescription("Eşya sat.")
        .addStringOption(o => o.setName("esya").setRequired(true).setDescription("Adı"))
        .addStringOption(o => o.setName("adet").setRequired(true).setDescription("Adet veya 'all'")),
        
    new SlashCommandBuilder().setName("sellall").setDescription("Satılabilir tüm eşyaları satar."),
    
    new SlashCommandBuilder().setName("leaderboard").setDescription("Liderlik tablosu")
        .addStringOption(o => o.setName("tur").setRequired(true).setDescription("Kategori seç").addChoices({ name: "wallet", value: "wallet" }, { name: "bank", value: "bank" }, { name: "networth", value: "networth" })),
        
    new SlashCommandBuilder().setName("cooldowns").setDescription("Bekleme süreleri."),
    new SlashCommandBuilder().setName("rank").setDescription("Sıralaman."),
    new SlashCommandBuilder().setName("crateinfo").setDescription("Kasa içerikleri."),
    new SlashCommandBuilder().setName("tax").setDescription("Güncel vergi oranları."),
    new SlashCommandBuilder().setName("stats").setDescription("İstatistikler.").addUserOption(o => o.setName("kullanici").setDescription("Kimin?")),
    new SlashCommandBuilder().setName("finance").setDescription("Bütünsel finansal durum özeti."),
    
    new SlashCommandBuilder().setName("bank").setDescription("Banka işlemleri")
        .addSubcommand(s => s.setName("upgrade").setDescription("Kapasite artır."))
        .addSubcommand(s => s.setName("interest").setDescription("Faiz durumunu gör."))
        .addSubcommand(s => s.setName("depositall").setDescription("Tüm parayı yatır."))
        .addSubcommand(s => s.setName("withdrawall").setDescription("Tüm parayı çek."))
        .addSubcommand(s => s.setName("statement").setDescription("Son işlemleri gösterir.")),
        
    new SlashCommandBuilder().setName("loan").setDescription("Kredi sistemi")
        .addSubcommand(s => s.setName("take").setDescription("Kredi çek.").addStringOption(o => o.setName("miktar").setRequired(true).setDescription("Miktar")))
        .addSubcommand(s => s.setName("repay").setDescription("Kredi öde.").addStringOption(o => o.setName("id").setRequired(true).setDescription("Kredi ID")).addStringOption(o=> o.setName("miktar").setRequired(true).setDescription("Miktar veya 'all'")))
        .addSubcommand(s => s.setName("list").setDescription("Aktif kredilerini gör."))
        .addSubcommand(s => s.setName("info").setDescription("Kredi skoru ve limit bilgilerini gör.")),

    new SlashCommandBuilder().setName("investment").setDescription("Yatırım / Vadeli")
        .addSubcommand(s => s.setName("create").setDescription("Yatırım yap.").addStringOption(o => o.setName("miktar").setRequired(true).setDescription("Miktar")).addStringOption(o=> o.setName("gun").setRequired(true).setDescription("Vade (1-30)")))
        .addSubcommand(s => s.setName("claim").setDescription("Vadesi dolan yatırımı çek.").addStringOption(o => o.setName("id").setRequired(true).setDescription("Yatırım ID")))
        .addSubcommand(s => s.setName("break").setDescription("Cezalı erken boz.").addStringOption(o => o.setName("id").setRequired(true).setDescription("Yatırım ID")))
        .addSubcommand(s => s.setName("list").setDescription("Yatırımlarını gör.")),

    new SlashCommandBuilder().setName("profile").setDescription("Profil")
        .addSubcommand(s=> s.setName("view").setDescription("Profil gör").addUserOption(o=> o.setName("kullanici").setDescription("Kimin?")))
        .addSubcommand(s=> s.setName("setbio").setDescription("Bio ayarla").addStringOption(o=> o.setName("metin").setRequired(true).setDescription("Metin"))),
    
    new SlashCommandBuilder().setName("top").setDescription("Gelişmiş Top")
        .addSubcommand(s => s.setName("crates").setDescription("En çok kasa açanlar")).addSubcommand(s => s.setName("gamblers").setDescription("En çok kumar oynayanlar"))
        .addSubcommand(s => s.setName("richest").setDescription("En zenginler")).addSubcommand(s => s.setName("level").setDescription("En yüksek leveller"))
        .addSubcommand(s => s.setName("wallet").setDescription("Sadece cüzdan")).addSubcommand(s => s.setName("bank").setDescription("Sadece banka")),

    new SlashCommandBuilder().setName("admin").setDescription("Yönetici Komutları")
        .addSubcommand(s=> s.setName("addcoins").setDescription("Para ver").addUserOption(o=>o.setName("hedef").setRequired(true).setDescription("Kime")).addStringOption(o=>o.setName("tur").setRequired(true).setDescription("Hesap türü").addChoices({name:"wallet",value:"wallet"},{name:"bank",value:"bank"})).addIntegerOption(o=>o.setName("miktar").setRequired(true).setDescription("Miktar")))
        .addSubcommand(s=> s.setName("removecoins").setDescription("Para sil").addUserOption(o=>o.setName("hedef").setRequired(true).setDescription("Kime")).addStringOption(o=>o.setName("tur").setRequired(true).setDescription("Hesap türü").addChoices({name:"wallet",value:"wallet"},{name:"bank",value:"bank"})).addIntegerOption(o=>o.setName("miktar").setRequired(true).setDescription("Miktar")))
        .addSubcommand(s=> s.setName("setcoins").setDescription("Para ayarla").addUserOption(o=>o.setName("hedef").setRequired(true).setDescription("Kime")).addStringOption(o=>o.setName("tur").setRequired(true).setDescription("Hesap türü").addChoices({name:"wallet",value:"wallet"},{name:"bank",value:"bank"})).addIntegerOption(o=>o.setName("miktar").setRequired(true).setDescription("Miktar")))
        .addSubcommand(s=> s.setName("additem").setDescription("Eşya ver").addUserOption(o=>o.setName("hedef").setRequired(true).setDescription("Kime")).addStringOption(o=>o.setName("esya").setRequired(true).setDescription("Ne")).addIntegerOption(o=>o.setName("adet").setRequired(true).setDescription("Kaç")))
        .addSubcommand(s=> s.setName("removeitem").setDescription("Eşya al").addUserOption(o=>o.setName("hedef").setRequired(true).setDescription("Kime")).addStringOption(o=>o.setName("esya").setRequired(true).setDescription("Ne")).addIntegerOption(o=>o.setName("adet").setRequired(true).setDescription("Kaç")))
        .addSubcommand(s=> s.setName("setlevel").setDescription("Level ayarla").addUserOption(o=>o.setName("hedef").setRequired(true).setDescription("Kime")).addIntegerOption(o=>o.setName("level").setRequired(true).setDescription("Level")))
        .addSubcommand(s=> s.setName("setxp").setDescription("XP ayarla").addUserOption(o=>o.setName("hedef").setRequired(true).setDescription("Kime")).addIntegerOption(o=>o.setName("xp").setRequired(true).setDescription("Miktar")))
        .addSubcommand(s=> s.setName("setcreditscore").setDescription("Kredi skoru ayarla").addUserOption(o=>o.setName("hedef").setRequired(true).setDescription("Kime")).addIntegerOption(o=>o.setName("score").setRequired(true).setDescription("Skor (0-1000)")))
        .addSubcommand(s=> s.setName("resetcooldown").setDescription("Bekleme süresi sıfırla").addUserOption(o=>o.setName("hedef").setRequired(true).setDescription("Kime")).addStringOption(o=>o.setName("komut").setRequired(true).setDescription("Komut adı")))
        .addSubcommand(s=> s.setName("resetuser").setDescription("Kullanıcı verisini sıfırla").addUserOption(o=>o.setName("hedef").setRequired(true).setDescription("Kime")))
        .addSubcommand(s=> s.setName("repairuser").setDescription("Veri şemasını onar").addUserOption(o=>o.setName("hedef").setRequired(true).setDescription("Kime")))
        .addSubcommand(s=> s.setName("forceinterest").setDescription("Faiz hesaplamasını tetikle").addUserOption(o=>o.setName("hedef").setRequired(true).setDescription("Kime")))
        .addSubcommand(s=> s.setName("blacklist").setDescription("Kullanıcı kara liste").addStringOption(o=>o.setName("islem").setRequired(true).setDescription("Ekle veya Çıkar").addChoices({name:"add",value:"add"},{name:"remove",value:"remove"})).addUserOption(o=>o.setName("hedef").setRequired(true).setDescription("Kime")))
        .addSubcommand(s=> s.setName("freeze").setDescription("Ekonomiyi dondur").addBooleanOption(o=>o.setName("durum").setRequired(true).setDescription("True: Dondur, False: Aç")))
        .addSubcommand(s=> s.setName("userinfo").setDescription("Ham data gör").addUserOption(o=>o.setName("hedef").setRequired(true).setDescription("Kime")))
        .addSubcommand(s=> s.setName("economyinfo").setDescription("Sistem analizi"))
];
const allSlashJSON = commands.map(c => c.toJSON());

// ============================================================================
// 25. INTERACTION ROUTER / HANDLERS
// ============================================================================
const handlers = {
    help: async (i) => {
        const e = embedBase().setTitle("MetaCoin REBORN • Gelişmiş Sistem Rehberi")
            .setDescription("Economy v2.0.0 — Kapsamlı finans, casino ve bankacılık hizmetinizde.")
            .addFields([
                { name: "🏦 Finans", value: "`/balance`, `/deposit`, `/withdraw`, `/pay`, `/bank upgrade`, `/bank interest`, `/finance`" },
                { name: "📈 Kredi & Yatırım", value: "`/loan take`, `/loan repay`, `/loan list`, `/loan info`\n`/investment create`, `/investment claim`, `/investment break`" },
                { name: "🛠️ İş & Gelir", value: "`/daily`, `/work`, `/beg`, `/crime`, `/rob`" },
                { name: "🎲 Casino & Kumar", value: "`/bet`, `/slots`" },
                { name: "📦 Ticaret", value: "`/shop`, `/buy`, `/open`, `/inventory`, `/sell`, `/sellall`" },
                { name: "🏆 Sosyal", value: "`/leaderboard`, `/top`, `/profile view`, `/stats`, `/rank`, `/cooldowns`" }
            ]);
        await replySafe(i, { embeds: [e] });
    },
    balance: async (i) => {
        const target = i.options.getUser("kullanici") || i.user;
        const u = await getUserWithInterest(target.id);
        const net = await getNetworth(target.id);
        const e = embedBase().setTitle(`🏦 | Bakiye Durumu — ${target.username}`).setThumbnail(target.displayAvatarURL())
            .addFields([
                { name: "Cüzdan", value: fmt(u.wallet), inline: true },
                { name: "Banka", value: `${fmt(u.bank)} / ${fmt(u.bank_max)}`, inline: true },
                { name: "Net Değer", value: fmt(net), inline: true }
            ]);
        await replySafe(i, { embeds: [e] });
    },
    finance: async (i) => {
        const u = await getUserWithInterest(i.user.id);
        const loans = await DB.getLoans(i.user.id);
        const invs = await DB.getInvestments(i.user.id);
        const debt = loans.reduce((acc, l) => acc + l.total_due, 0);
        const pendingInv = invs.reduce((acc, l) => acc + l.return_amount, 0);
        const net = await getNetworth(i.user.id);
        const e = embedBase(THEME.finance).setTitle(`📊 | Bütünsel Finans — ${i.user.username}`).setThumbnail(i.user.displayAvatarURL())
            .addFields([
                { name: "Likidite", value: `Cüzdan: ${fmt(u.wallet)}\nBanka: ${fmt(u.bank)}`, inline: true },
                { name: "Varlık", value: `Networth: ${fmt(net)}\nKredi Puanı: ${u.credit_score}`, inline: true },
                { name: "Borç / Alacak", value: `Aktif Borç: ${fmt(debt)} (${loans.length} Kredi)\nBekleyen Yatırım: ${fmt(pendingInv)} (${invs.length})`, inline: true },
                { name: "Vergi & Faiz Analizi", value: `Ödenen Toplam Vergi: ${fmt(u.total_taxes_paid || 0)}\nKazanılan Pasif Faiz: ${fmt(u.total_interest_earned || 0)}` }
            ]);
        await replySafe(i, { embeds: [e] });
    },
    deposit: async (i) => {
        const placed = await processDeposit(i.user.id, i.options.getString("miktar"));
        await replySafe(i, { embeds: [embedBase(THEME.success).setDescription(`✅ | Bankaya **${fmt(placed)}** yatırıldı.`)] });
    },
    withdraw: async (i) => {
        const { net, tax, total } = await processWithdraw(i.user.id, i.options.getString("miktar"));
        await replySafe(i, { embeds: [embedBase(THEME.success).setDescription(`✅ | Bankadan **${fmt(total)}** çekildi.\n*Vergi: ${fmt(tax)} (Ele geçen: ${fmt(net)})*`)] });
    },
    pay: async (i) => {
        const target = i.options.getUser("hedef");
        if (target.bot) throw new Error("Botlara para atamazsın.");
        const { net, tax, total } = await processTransfer(i.user.id, target.id, i.options.getString("miktar"));
        await replySafe(i, { embeds: [embedBase(THEME.success).setDescription(`💸 | **${target.username}** adlı kullanıcıya **${fmt(net)}** ulaştı.\n*(Gönderilen: ${fmt(total)}, Vergi: ${fmt(tax)})*`)] });
    },
    daily: async (i) => {
        const r = await doAction(i.user.id, "daily");
        if (!r.ok) return replySafe(i, { flags: MessageFlags.Ephemeral, content: `⏳ Bekle: **${msToHuman(r.left)}**` });
        await replySafe(i, { embeds: [embedBase(THEME.success).setTitle("🎁 | Günlük Ödül").setDescription(`Kazanılan: **${fmt(r.earned)}**\n🔥 Seri: **${r.streak} Gün**`)] });
    },
    work: async (i) => {
        const r = await doAction(i.user.id, "work");
        if (!r.ok) return replySafe(i, { flags: MessageFlags.Ephemeral, content: `⏳ Bekle: **${msToHuman(r.left)}**` });
        await replySafe(i, { embeds: [embedBase(THEME.success).setDescription(`🛠️ | **${r.event}**. Maaş: **${fmt(r.earned)}**\n🌟 *+15 XP*`)] });
    },
    beg: async (i) => {
        const r = await doAction(i.user.id, "beg");
        if (!r.ok && r.left) return replySafe(i, { flags: MessageFlags.Ephemeral, content: `⏳ Bekle: **${msToHuman(r.left)}**` });
        if (!r.ok) return replySafe(i, { content: `🤷 ${r.event}` });
        await replySafe(i, { content: `🙏 Yoldan geçen biri **${fmt(r.earned)}** fırlattı.` });
    },
    crime: async (i) => {
        const r = await doAction(i.user.id, "crime");
        if (!r.ok && r.left) return replySafe(i, { flags: MessageFlags.Ephemeral, content: `⏳ Bekle: **${msToHuman(r.left)}**` });
        if (r.ok) await replySafe(i, { embeds: [embedBase(THEME.success).setDescription(`🕶️ | Mükemmel bir vurgun! **${fmt(r.earned)}** kaldırdın.\n🌟 *+25 XP*`)] });
        else await replySafe(i, { embeds: [embedBase(THEME.error).setDescription(`🚨 | Polise yakalandın! Rüşvet: **${fmt(r.riskLost)}**`)] });
    },
    rob: async (i) => {
        const target = i.options.getUser("hedef");
        if (target.bot) throw new Error("Botları soyamazsın.");
        const r = await processRob(i.user.id, target.id);
        if (r.cooldown) return replySafe(i, { flags: MessageFlags.Ephemeral, content: `⏳ Bekle: **${msToHuman(r.left)}**` });
        if (r.ok) await replySafe(i, { embeds: [embedBase(THEME.success).setDescription(`🥷 | **${target.username}** soyuldu! Ganimet: **${fmt(r.amount)}**`)] });
        else await replySafe(i, { embeds: [embedBase(THEME.error).setDescription(`🚨 | **${target.username}** polisi aradı! Ceza: **${fmt(r.fine)}**`)] });
    },
    bet: async (i) => {
        const r = await processAdvancedBet(i.user.id, i.options.getString("risk"), i.options.getString("miktar"));
        let desc = `**Seçim:** ${r.riskName} (Kazanma İhtimali: %${r.winChance})\n`;
        desc += `**Yatırılan:** ${fmt(r.finalBet)}\n`;
        desc += `**Sonuç Zarı:** \`${r.roll}\` / 100\n\n`;
        desc += `${r.eventMsg}\n`;
        
        if (r.win) desc += `\nNet Kazanç: **${fmt(r.netWin)}** *(Vergi: ${fmt(r.tax)})*`;
        if (r.streak > 1) desc += `\n🔥 **Streak:** ${r.streak} (${r.streakType === 'win' ? 'Kazanma Serisi' : 'Kaybetme Serisi'})`;
        
        await replySafe(i, { embeds: [embedBase(r.win ? THEME.success : THEME.error).setTitle("🎲 | Gelişmiş Bet Sonucu").setDescription(desc)] });
    },
    slots: async (i) => {
        const r = await processAdvancedSlots(i.user.id, i.options.getString("miktar"));
        
        const renderRow = (row) => `[ ${row[0].id} | ${row[1].id} | ${row[2].id} ]`;
        let gridDisplay = `\n${renderRow(r.grid[0])}\n**► ${renderRow(r.grid[1])} ◄**\n${renderRow(r.grid[2])}\n`;
        
        let desc = `**Mevcut Havuz (Jackpot):** ${fmt(r.currentJackpot)}\n`;
        desc += `**Bahis:** ${r.isFreeSpin ? "✨ Bedava Çevirme" : fmt(r.finalBet)}\n`;
        desc += gridDisplay + "\n";
        desc += `**Sonuç:** ${r.eventMsg}\n`;
        
        if (r.win && r.grossWin > 0) desc += `Net Kazanç: **${fmt(r.netWin)}** *(Vergi: ${fmt(r.tax)})*`;
        
        const color = r.isJackpot ? THEME.jackpot : (r.win ? THEME.success : THEME.error);
        await replySafe(i, { embeds: [embedBase(color).setTitle("🎰 | Jackpot Slot Makinesi").setDescription(desc)] });
    },
    buy: async (i) => {
        const r = await buyItemOrCrate(i.user.id, i.options.getString("urun"), i.options.getString("adet"));
        await replySafe(i, { embeds: [embedBase(THEME.success).setDescription(`🛒 | **${r.count}x ${r.name}** başarıyla alındı. Harcanan: **${fmt(r.total)}**`)] });
    },
    open: async (i) => {
        const r = await openCrates(i.user.id, i.options.getString("kasa"), i.options.getString("adet"));
        let desc = `📦 | **${r.count}** adet başarıyla açıldı!\n\n**Kazanılanlar:**\n`;
        if (r.totalCoins > 0) desc += `🪙 **${fmt(r.totalCoins)}**\n`;
        const itemMap = {}; r.results.filter(x => x.type === "item").forEach(x => itemMap[x.item] = (itemMap[x.item] || 0) + x.qty);
        for (const [it, q] of Object.entries(itemMap)) desc += `🔹 **${it}**: x${q}\n`;
        await replySafe(i, { embeds: [embedBase(THEME.success).setDescription(desc)] });
    },
    sell: async (i) => {
        const r = await sellItems(i.user.id, i.options.getString("esya"), i.options.getString("adet"));
        await replySafe(i, { embeds: [embedBase(THEME.success).setDescription(`💱 | **${r.count}** adet eşya satıldı. Kazanç: **${fmt(r.gain)}**`)] });
    },
    sellall: async (i) => {
        const r = await sellAllProcess(i.user.id);
        await replySafe(i, { embeds: [embedBase(THEME.success).setDescription(`💱 | Envanterindeki satılabilir tüm eşyaları sattın (${r.totalItems} adet).\nToplam Kazanç: **${fmt(r.totalGain)}**`)] });
    },
    inventory: async (i) => {
        const target = i.options.getUser("kullanici") || i.user;
        const inv = await DB.getInventory(target.id);
        const u = await DB.getUser(target.id);
        const crates = [], items = [];
        for (const [k, v] of Object.entries(inv)) { if (k.endsWith("crate")) crates.push(`• **${k}**: x${v}`); else items.push(`• **${k}**: x${v}`); }
        const e = embedBase().setTitle(`🎒 | Envanter — ${target.username}`).addFields([
            { name: "📦 Kasalar", value: crates.join("\n") || "*Kasa yok*", inline: true },
            { name: "🧰 Eşyalar", value: items.join("\n") || "*Eşya yok*", inline: true },
            { name: "✨ Özel Haklar", value: `Slot Free Spins: **${u.free_spins || 0}**`, inline: false }
        ]);
        await replySafe(i, { embeds: [e] });
    },
    shop: async (i) => {
        const cat = i.options.getString("kategori") || "crates";
        const e = embedBase(THEME.shop);
        if (cat === "crates") {
            e.setTitle("🛒 | Mağaza — Kasalar").setDescription("`/buy urun:<isim> adet:<n>`");
            for (const [k, v] of Object.entries(CRATES)) e.addFields([{ name: `📦 ${k}`, value: `Fiyat: ${fmt(v.price)}\n*${v.desc}*` }]);
        } else {
            e.setTitle("🛒 | Mağaza — Eşyalar").setDescription("`/buy urun:<isim> adet:<n>`");
            for (const [k, v] of Object.entries(SHOP_ITEMS)) e.addFields([{ name: `🔧 ${k}`, value: `Fiyat: ${fmt(v.price)}\n*${v.desc}*` }]);
        }
        await replySafe(i, { embeds: [e] });
    },
    crateinfo: async (i) => {
        const e = embedBase().setTitle("ℹ️ | Kasa Oranları");
        for (const [k, v] of Object.entries(CRATES)) {
            const str = v.loot.map(l => l.type === "coins" ? `🪙 Para (${fmt(l.min)}-${fmt(l.max)}) [%${l.weight}]` : `🔹 ${l.item} (${l.min}-${l.max}) [%${l.weight}]`).join("\n");
            e.addFields([{ name: `📦 ${k} (${fmt(v.price)})`, value: str }]);
        }
        await replySafe(i, { embeds: [e] });
    },
    tax: async (i) => {
        const e = embedBase(THEME.finance).setTitle("⚖️ | Güncel Vergi Oranları")
            .setDescription("Sistemdeki para akışını dengelemek için vergi uygulanır.")
            .addFields([
                { name: "Para Transferi (Pay)", value: `%${(Number(TAX_RATE_TRANSFER)*100).toFixed(1)}`, inline: true },
                { name: "Bankadan Çekim (Withdraw)", value: `%${(Number(TAX_RATE_WITHDRAW)*100).toFixed(1)}`, inline: true },
                { name: "Kumar Kazançları", value: `%${(Number(TAX_RATE_GAMBLING_WIN)*100).toFixed(1)}`, inline: true }
            ]);
        await replySafe(i, { embeds: [e] });
    },
    bank: async (i) => {
        const sub = i.options.getSubcommand();
        if (sub === "upgrade") {
            await DB.acquireLock(i.user.id);
            try {
                const u = await DB.getUser(i.user.id);
                const cost = Math.floor(u.bank_max * 0.15);
                if (u.wallet < cost) throw new Error(`Banka kapasitesi artırımı için ${fmt(cost)} gerekli.`);
                u.wallet -= cost; u.bank_max += 25000;
                await DB.saveUser(i.user.id, u);
                await replySafe(i, { embeds: [embedBase(THEME.success).setDescription(`🏦 | Kapasite artırıldı! Yeni sınır: **${fmt(u.bank_max)}**`)] });
            } finally { DB.releaseLock(i.user.id); }
        } 
        else if (sub === "interest") {
            const u = await getUserWithInterest(i.user.id);
            const e = embedBase(THEME.finance).setTitle("🏦 | Faiz Sistemi").addFields([
                { name: "Faiz Oranı", value: `%${(Number(INTEREST_RATE_SAVINGS)*100).toFixed(1)} / Periyot`, inline: true },
                { name: "Faiz Periyodu", value: `${INTEREST_INTERVAL_HOURS} Saat`, inline: true },
                { name: "Max Birikim Limiti", value: `${INTEREST_MAX_IDLE_HOURS} Saat`, inline: true },
                { name: "Senin Durumun", value: `Şu ana kadar pasif faizden **${fmt(u.total_interest_earned || 0)}** kazandın.\nBankanda faiz işlemesi için min **${fmt(INTEREST_MIN_BALANCE)}** olmalıdır. Sen paranı kullandıkça faiz hesaplanır.` }
            ]);
            await replySafe(i, { embeds: [e] });
        }
        else if (sub === "statement") {
            const txs = await DB.getCollection(i.user.id, "transactions");
            if (!txs.length) throw new Error("Henüz hiçbir işleminiz bulunmuyor.");
            txs.sort((a,b) => b.timestamp - a.timestamp);
            const lines = txs.slice(0, 15).map(t => `\`[${new Date(t.timestamp * 1000).toLocaleString("tr-TR")}]\` **${t.type.toUpperCase()}** - ${fmt(t.amount)}`).join("\n");
            await replySafe(i, { embeds: [embedBase(THEME.finance).setTitle("📄 | Son 15 İşlem").setDescription(lines)] });
        }
        else if (sub === "depositall") {
            const placed = await processDeposit(i.user.id, "all");
            await replySafe(i, { embeds: [embedBase(THEME.success).setDescription(`✅ | Bankaya **${fmt(placed)}** yatırıldı.`)] });
        }
        else if (sub === "withdrawall") {
            const { net, tax, total } = await processWithdraw(i.user.id, "all");
            await replySafe(i, { embeds: [embedBase(THEME.success).setDescription(`✅ | Bankadan **${fmt(total)}** çekildi.\n*Vergi: ${fmt(tax)} (Ele geçen: ${fmt(net)})*`)] });
        }
    },
    loan: async (i) => {
        const sub = i.options.getSubcommand();
        if (sub === "take") {
            const loan = await takeLoan(i.user.id, i.options.getString("miktar"));
            await replySafe(i, { embeds: [embedBase(THEME.success).setDescription(`💳 | Kredi onaylandı!\n\n**Çekilen:** ${fmt(loan.amount)}\n**Toplam Geri Ödenecek:** ${fmt(loan.total_due)}\n**Son Ödeme:** <t:${loan.due_date}:d>\n**ID:** \`${loan.id}\``)] });
        } else if (sub === "repay") {
            const r = await repayLoan(i.user.id, i.options.getString("id"), i.options.getString("miktar"));
            await replySafe(i, { embeds: [embedBase(THEME.success).setDescription(`💳 | Kredi ödemesi alındı!\n\n**Ödenen:** ${fmt(r.paid)}\n**Kalan Borç:** ${fmt(r.left)}\n${r.cleared ? '✅ **Borç Kapandı!**' : ''}`)] });
        } else if (sub === "list") {
            const u = await DB.getUser(i.user.id);
            const loans = await DB.getLoans(i.user.id);
            checkLoanPenalties(u, loans); 
            if (!loans.length) throw new Error("Aktif kredin bulunmuyor.");
            const e = embedBase(THEME.finance).setTitle("💳 | Aktif Krediler");
            for(let l of loans) e.addFields([{name: `ID: ${l.id} ${l.is_penalized ? '⚠️ CEZALI' : ''}`, value: `**Borç:** ${fmt(l.total_due)}\n**Son Ödeme:** <t:${l.due_date}:R>`, inline: false}]);
            await replySafe(i, { embeds: [e] });
        } else if (sub === "info") {
            const u = await DB.getUser(i.user.id);
            const networth = await getNetworth(i.user.id);
            const limit = (u.level * 5000) + (networth * 0.1) + (u.credit_score * 100);
            const loans = await DB.getLoans(i.user.id);
            const debt = loans.reduce((a, l) => a + l.total_due, 0);
            const e = embedBase(THEME.finance).setTitle("💳 | Kredi Skoru & Limit").addFields([
                { name: "Kredi Puanı", value: `${u.credit_score} / 1000`, inline: true },
                { name: "Kredi Limiti", value: `${fmt(limit)}`, inline: true },
                { name: "Mevcut Borç", value: `${fmt(debt)}`, inline: true },
                { name: "Aktif Kredi", value: `${loans.length} / ${LOAN_MAX_ACTIVE_COUNT}`, inline: true },
                { name: "Sistem", value: `Faiz Oranı: %${Number(INTEREST_RATE_LOAN)*100}\nGecikme Cezası: %${Number(LOAN_LATE_PENALTY_RATE)*100}` }
            ]);
            await replySafe(i, { embeds: [e] });
        }
    },
    investment: async (i) => {
        const sub = i.options.getSubcommand();
        if (sub === "create") {
            const inv = await createInvestment(i.user.id, i.options.getString("miktar"), i.options.getString("gun"));
            await replySafe(i, { embeds: [embedBase(THEME.success).setDescription(`📈 | Yatırım oluşturuldu!\n\n**Yatırılan:** ${fmt(inv.amount)}\n**Vade Sonu Getiri:** ${fmt(inv.return_amount)}\n**Kilit Açılma:** <t:${inv.unlocks_at}:R>\n**ID:** \`${inv.id}\``)] });
        } else if (sub === "claim") {
            const r = await claimInvestment(i.user.id, i.options.getString("id"), false);
            await writeAuditLog(i.user.id, "INVESTMENT_CLAIM", i.user.id, `Kazanç: ${r.payout}`);
            await replySafe(i, { embeds: [embedBase(THEME.success).setDescription(`📈 | Yatırım vadesi doldu ve çekildi!\n\n**Kazanılan:** ${fmt(r.payout)}`)] });
        } else if (sub === "break") {
            const r = await claimInvestment(i.user.id, i.options.getString("id"), true);
            await replySafe(i, { embeds: [embedBase(THEME.error).setDescription(`⚠️ | Yatırım erken bozuldu (Cezalı)!\n\n**Kurtarılan:** ${fmt(r.payout)}\n*Kredi Puanın düştü.*`)] });
        } else if (sub === "list") {
            const invs = await DB.getInvestments(i.user.id);
            if (!invs.length) throw new Error("Aktif yatırımın bulunmuyor.");
            const e = embedBase(THEME.finance).setTitle("📈 | Aktif Yatırımlar");
            for(let inv of invs) {
                let timeLeft = inv.unlocks_at - nowSec();
                let timeStr = timeLeft > 0 ? `<t:${inv.unlocks_at}:R>` : "✅ Hazır";
                e.addFields([{name: `ID: ${inv.id}`, value: `**Yatırılan:** ${fmt(inv.amount)} ➔ **Getiri:** ${fmt(inv.return_amount)}\n**Durum:** ${timeStr}`, inline: false}]);
            }
            await replySafe(i, { embeds: [e] });
        }
    },
    cooldowns: async (i) => {
        const lines = [];
        for (const k of Object.keys(COOLDOWNS)) {
            const left = await checkCooldownLeft(i.user.id, k);
            lines.push(`**${k.toUpperCase()}**: ${left > 0 ? msToHuman(left) : "✅ Hazır"}`);
        }
        await replySafe(i, { flags: MessageFlags.Ephemeral, embeds: [embedBase().setTitle("⏱️ | Bekleme Süreleri").setDescription(lines.join("\n"))] });
    },
    profile: async (i) => {
        if (i.options.getSubcommand() === "setbio") {
            await DB.acquireLock(i.user.id);
            try {
                const u = await DB.getUser(i.user.id); u.bio = i.options.getString("metin").slice(0, 180); await DB.saveUser(i.user.id, u);
                await replySafe(i, { embeds: [embedBase(THEME.success).setDescription("✅ | Biyografi güncellendi.")] });
            } finally { DB.releaseLock(i.user.id); }
        } else {
            const target = i.options.getUser("kullanici") || i.user;
            const u = await DB.getUser(target.id);
            const xpBar = makeXpBar(u.xp, u.level * 500);
            const e = embedBase().setTitle(`👤 | Profil — ${target.username}`).setThumbnail(target.displayAvatarURL())
                .setDescription(u.bio ? `*"${u.bio}"*` : "*Biyografi ayarlanmamış.*")
                .addFields([
                    { name: "⭐ Seviye & XP", value: `Level **${u.level}**\n\`${xpBar}\` (${u.xp} / ${u.level*500})`, inline: false },
                    { name: "💰 Net Değer", value: fmt(await getNetworth(target.id)), inline: true },
                    { name: "💳 Kredi Puanı", value: `${u.credit_score}`, inline: true },
                    { name: "🔥 Günlük Seri", value: `${u.daily_streak} Gün`, inline: true },
                    { name: "📅 Oluşturulma", value: `<t:${u.created_at}:D>`, inline: true }
                ]);
            await replySafe(i, { embeds: [e] });
        }
    },
    stats: async (i) => {
        const target = i.options.getUser("kullanici") || i.user;
        const u = await DB.getUser(target.id); const s = u.stats;
        const e = embedBase().setTitle(`📈 | İstatistikler — ${target.username}`)
            .addFields([
                { name: "💸 Toplam Kazanılan", value: fmt(s.total_earned), inline: true },
                { name: "📉 Toplam Kaybedilen", value: fmt(s.total_lost), inline: true },
                { name: "🧰 Kasa & Eşya", value: `Kasa: ${s.crates_opened} | Eşya: ${s.items_sold}`, inline: true },
                { name: "🛠️ Meslekler", value: `İş: ${s.work_uses} | Dilenci: ${s.beg_uses}`, inline: true },
                { name: "🚨 Suç & Soygun", value: `Suç Başarı: ${s.crime_success} | Soygun: ${s.rob_success}`, inline: true },
                { name: "🎰 Casino", value: `Slot: ${s.slots_plays} | Bet: ${s.bet_plays}`, inline: true },
                { name: "🔥 En Büyük Tek Kazanç", value: fmt(s.largest_win), inline: true },
                { name: "💀 En Büyük Tek Kayıp", value: fmt(s.largest_loss), inline: true },
                { name: "💰 Pasif Gelir (Faiz)", value: fmt(u.total_interest_earned || 0), inline: true }
            ]);
        await replySafe(i, { embeds: [e] });
    },
    leaderboard: async (i) => {
        const type = i.options.getString("tur");
        const all = await DB.getAllUsers();
        let arr = [];
        if (type === "networth") {
            arr = await Promise.all(all.map(async u => ({ id: u.user_id, val: await getNetworth(u.user_id) })));
        } else {
            arr = all.map(u => ({ id: u.user_id, val: u[type] || 0 }));
        }
        arr.sort((a,b) => b.val - a.val);
        const lines = arr.slice(0, 10).map((r, idx) => `**${idx + 1}.** <@${r.id}> — ${fmt(r.val)}`).join("\n") || "Kayıt yok.";
        await replySafe(i, { embeds: [embedBase().setTitle(`🏆 | Top 10 — ${type.toUpperCase()}`).setDescription(lines)] });
    },
    top: async (i) => {
        const sub = i.options.getSubcommand();
        const all = await DB.getAllUsers();
        let arr = [];
        if (sub === "crates") arr = all.map(u => ({id: u.user_id, val: u.stats.crates_opened || 0}));
        if (sub === "gamblers") arr = all.map(u => ({id: u.user_id, val: (u.stats.slots_plays||0) + (u.stats.bet_plays||0)}));
        if (sub === "richest") arr = await Promise.all(all.map(async u => ({ id: u.user_id, val: await getNetworth(u.user_id) })));
        if (sub === "level") arr = all.map(u => ({id: u.user_id, val: u.level || 1}));
        if (sub === "wallet") arr = all.map(u => ({id: u.user_id, val: u.wallet || 0}));
        if (sub === "bank") arr = all.map(u => ({id: u.user_id, val: u.bank || 0}));
        
        arr.sort((a,b) => b.val - a.val);
        const formatVal = (sub === "richest" || sub === "wallet" || sub === "bank") ? fmt : (x => x);
        const lines = arr.slice(0, 10).map((r, idx) => `**${idx + 1}.** <@${r.id}> — ${formatVal(r.val)}`).join("\n") || "Kayıt yok.";
        await replySafe(i, { embeds: [embedBase().setTitle(`🏆 | Top 10 — ${sub.toUpperCase()}`).setDescription(lines)] });
    },
    rank: async (i) => {
        const all = await DB.getAllUsers();
        const getRank = async (type) => {
            let arr;
            if (type === "networth") arr = await Promise.all(all.map(async u => ({ id: u.user_id, val: await getNetworth(u.user_id) })));
            else arr = all.map(u => ({ id: u.user_id, val: u[type] || 0 }));
            arr.sort((a,b) => b.val - a.val);
            const idx = arr.findIndex(x => x.id === i.user.id);
            return idx !== -1 ? `#${idx + 1}` : "Yok";
        };
        await replySafe(i, { embeds: [embedBase().setTitle(`📊 | Sıralaman`).addFields([
            { name: "Cüzdan Sırası", value: await getRank("wallet"), inline: true },
            { name: "Banka Sırası", value: await getRank("bank"), inline: true },
            { name: "Networth Sırası", value: await getRank("networth"), inline: true },
            { name: "Level Sırası", value: await getRank("level"), inline: true }
        ])]});
    },

    // ------------------------------------------------------------------------
    // ADMIN SYSTEM (Robust and Secure GOD TIER EXTENSION)
    // ------------------------------------------------------------------------
    admin: async (i) => {
        if (!ADMIN_LIST.includes(i.user.id)) throw new Error("⛔ Yetkisiz erişim. Bu komut sadece Owner/Admin listesindekiler içindir.");
        const sub = i.options.getSubcommand();
        const e = embedBase(THEME.admin).setTitle("🛠️ | Admin Paneli");
        let logAction = "", logDetails = "";

        if (["addcoins", "removecoins", "setcoins"].includes(sub)) {
            const target = i.options.getUser("hedef"); const tur = i.options.getString("tur"); const miktar = i.options.getInteger("miktar");
            await DB.acquireLock(target.id);
            try {
                const u = await DB.getUser(target.id);
                if (sub === "addcoins") u[tur] += miktar;
                if (sub === "removecoins") u[tur] = Math.max(0, u[tur] - miktar);
                if (sub === "setcoins") u[tur] = Math.max(0, miktar);
                await DB.saveUser(target.id, u);
                e.setDescription(`✅ **${target.username}** kullanıcısının **${tur}** bakiyesi değiştirildi. Yeni bakiye: ${fmt(u[tur])}`);
                logAction = `ADMIN_${sub.toUpperCase()}`; logDetails = `${tur} -> ${miktar} | New: ${u[tur]}`;
            } finally { DB.releaseLock(target.id); }
            await writeAuditLog(i.user.id, logAction, target.id, logDetails);
        }
        else if (["additem", "removeitem"].includes(sub)) {
            const target = i.options.getUser("hedef"); const item = i.options.getString("esya"); const qty = i.options.getInteger("adet");
            await DB.acquireLock(target.id);
            try {
                if (sub === "additem") { await addItem(target.id, item, qty); e.setDescription(`✅ Verildi: **${item}** x${qty} -> ${target.username}`); }
                if (sub === "removeitem") { const ok = await removeItem(target.id, item, qty); if (!ok) throw new Error("Yeterli yok."); e.setDescription(`✅ Silindi: **${item}** x${qty} <- ${target.username}`); }
            } finally { DB.releaseLock(target.id); }
            await writeAuditLog(i.user.id, `ADMIN_${sub.toUpperCase()}`, target.id, `${item} x${qty}`);
        }
        else if (sub === "setlevel") {
            const target = i.options.getUser("hedef"); const lvl = i.options.getInteger("level");
            await DB.acquireLock(target.id);
            try { const u = await DB.getUser(target.id); u.level = lvl; await DB.saveUser(target.id, u); e.setDescription(`✅ Level güncellendi: ${lvl}`); } finally { DB.releaseLock(target.id); }
            await writeAuditLog(i.user.id, "ADMIN_SETLEVEL", target.id, `Level -> ${lvl}`);
        }
        else if (sub === "setxp") {
            const target = i.options.getUser("hedef"); const xp = i.options.getInteger("xp");
            await DB.acquireLock(target.id);
            try { const u = await DB.getUser(target.id); u.xp = Math.max(0, xp); await DB.saveUser(target.id, u); e.setDescription(`✅ XP güncellendi: ${u.xp}`); } finally { DB.releaseLock(target.id); }
            await writeAuditLog(i.user.id, "ADMIN_SETXP", target.id, `XP -> ${xp}`);
        }
        else if (sub === "setcreditscore") {
            const target = i.options.getUser("hedef"); const sc = i.options.getInteger("score");
            await DB.acquireLock(target.id);
            try { const u = await DB.getUser(target.id); u.credit_score = Math.max(0, Math.min(1000, sc)); await DB.saveUser(target.id, u); e.setDescription(`✅ Kredi Skoru güncellendi: ${u.credit_score}`); } finally { DB.releaseLock(target.id); }
            await writeAuditLog(i.user.id, "ADMIN_SETCREDITSCORE", target.id, `Score -> ${sc}`);
        }
        else if (sub === "resetcooldown") {
            const target = i.options.getUser("hedef"); const cmd = i.options.getString("komut");
            await DB.resetCooldown(target.id, cmd);
            e.setDescription(`✅ **${target.username}** için **${cmd}** süresi sıfırlandı.`);
            await writeAuditLog(i.user.id, "ADMIN_CD_RESET", target.id, cmd);
        }
        else if (sub === "resetuser") {
            const target = i.options.getUser("hedef");
            await DB.acquireLock(target.id);
            try {
                const u = createUserTemplate(target.id);
                await DB.saveUser(target.id, u);
                await DB.saveInventory(target.id, {});
                e.setDescription(`🧨 **${target.username}** tüm ekonomi verileri SIFIRLANDI.`);
            } finally { DB.releaseLock(target.id); }
            await writeAuditLog(i.user.id, "ADMIN_RESETUSER", target.id, "Full wipe");
        }
        else if (sub === "repairuser") {
            const target = i.options.getUser("hedef");
            await DB.acquireLock(target.id);
            try {
                let u = await DB.getUser(target.id);
                u = normalizeSchema(u);
                await DB.saveUser(target.id, u);
                e.setDescription(`🔧 **${target.username}** veri şeması onarıldı ve eksik veriler düzeltildi.`);
            } finally { DB.releaseLock(target.id); }
            await writeAuditLog(i.user.id, "ADMIN_REPAIRUSER", target.id, "Schema heal applied");
        }
        else if (sub === "forceinterest") {
            const target = i.options.getUser("hedef");
            await DB.acquireLock(target.id);
            try {
                let u = await DB.getUser(target.id);
                u.last_interest_calc = 0; // Force extreme lazy eval
                await DB.saveUser(target.id, u);
                let gained = await accrueInterestLazy(target.id);
                e.setDescription(`📈 **${target.username}** kullanıcısına zorla faiz işletildi.\nKazanılan: ${fmt(gained)}`);
            } finally { DB.releaseLock(target.id); }
            await writeAuditLog(i.user.id, "ADMIN_FORCEINTEREST", target.id, "Lazy time reset forced.");
        }
        else if (sub === "blacklist") {
            const target = i.options.getUser("hedef"); const islem = i.options.getString("islem");
            const conf = await DB.getGlobalConfig();
            if (!conf.blacklist) conf.blacklist = [];
            if (islem === "add") { if (!conf.blacklist.includes(target.id)) conf.blacklist.push(target.id); e.setDescription(`⛔ ${target.username} kara listeye eklendi.`); }
            else { conf.blacklist = conf.blacklist.filter(id => id !== target.id); e.setDescription(`✅ ${target.username} kara listeden çıkarıldı.`); }
            await DB.saveGlobalConfig(conf);
            await writeAuditLog(i.user.id, `ADMIN_BLACKLIST_${islem.toUpperCase()}`, target.id, "");
        }
        else if (sub === "freeze") {
            const durum = i.options.getBoolean("durum");
            const conf = await DB.getGlobalConfig();
            conf.economy_freeze = durum;
            await DB.saveGlobalConfig(conf);
            e.setDescription(durum ? `❄️ Ekonomi donduruldu. Tüm işlemler durdu.` : `☀️ Ekonomi tekrar aktif edildi.`);
            await writeAuditLog(i.user.id, "ADMIN_FREEZE", "GLOBAL", durum.toString());
        }
        else if (sub === "userinfo") {
            const target = i.options.getUser("hedef");
            const u = await DB.getUser(target.id);
            e.setDescription(`\`\`\`json\n${JSON.stringify(u, null, 2).slice(0, 4000)}\n\`\`\``);
            await writeAuditLog(i.user.id, "ADMIN_USERINFO", target.id, "Data inspected.");
        }
        else if (sub === "economyinfo") {
            const all = await DB.getAllUsers();
            const conf = await DB.getGlobalConfig();
            const w = all.reduce((a,u) => a + u.wallet, 0); const b = all.reduce((a,u) => a + u.bank, 0);
            e.setDescription(`**Genel Ekonomi Durumu**\nKayıtlı Profil: ${all.length}\nDolaşan Nakit: ${fmt(w)}\nBanka Rezervi: ${fmt(b)}\nToplam Hacim: ${fmt(w+b)}\nJackpot Havuzu: ${fmt(conf.jackpot_pool)}`);
        }
        await replySafe(i, { embeds: [e], flags: MessageFlags.Ephemeral });
    }
};

// ============================================================================
// 26. ERROR HANDLING / REPLY SAFETY (Smart Defer Router)
// ============================================================================
async function replySafe(interaction, payload) {
    try {
        if (interaction.deferred || interaction.replied) {
            await interaction.editReply(payload);
        } else {
            await interaction.reply(payload);
        }
    } catch (e) {
        if (e.code === 10062 || e.code === 40060) return;
        errorLog("ReplySafe Error", e);
    }
}

// ============================================================================
// 27. EXPRESS HEALTH ENDPOINT
// ============================================================================
const app = express();
app.get("/", (_req, res) => res.status(200).send(`MetaCoin REBORN v${VERSION} - SYSTEM ONLINE`));
app.listen(PORT, () => log(`Express Endpoint Aktif: ${PORT}`));

// ============================================================================
// 28. STARTUP / BOOTSTRAP
// ============================================================================
const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once(Events.ClientReady, async (c) => {
    log(`[DISCORD] ${c.user.tag} aktif!`);
    await DB.init();
    
    if (REGISTER_COMMANDS === "true") {
        const rest = new REST({ version: "10" }).setToken(DISCORD_TOKEN);
        try {
            if (GUILD_ID) await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: allSlashJSON });
            else await rest.put(Routes.applicationCommands(CLIENT_ID), { body: allSlashJSON });
            log(`Komutlar (Slash Commands) başarıyla Discord'a kaydedildi.`);
        } catch (e) { errorLog("Slash Command Kayıt Hatası", e); }
    }
});

// Main Interaction Event
client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isChatInputCommand()) return;
    const handler = handlers[interaction.commandName];
    if (!handler) return;

    let startTime = Date.now();
    try {
        const ephemeralCommands = ["cooldowns", "admin"];
        const isEphemeral = ephemeralCommands.includes(interaction.commandName);

        if (COMMAND_DEFER_MODE === "smart") {
            try {
                const deferOptions = isEphemeral ? { flags: MessageFlags.Ephemeral } : {};
                await interaction.deferReply(deferOptions);
            } catch (deferErr) {
                if (deferErr.code === 40060 || deferErr.code === 10062) return;
                throw deferErr;
            }
        }

        // Global Security Checks (Freeze, Blacklist)
        if (interaction.commandName !== "admin") {
            await checkGlobalSecurity(interaction.user.id);
        }

        await handler(interaction);
        debug(`Command /${interaction.commandName} executed`, Date.now() - startTime);

    } catch (err) {
        if (err.code === 40060 || err.code === 10062) return;

        const isSystemError = err.message.includes("DiscordAPI") || err.message.includes("is not defined") || err.message.includes("read properties");
        const msg = !isSystemError ? `❌ | ${err.message}` : "❌ | Beklenmeyen teknik bir sunucu hatası oluştu. Lütfen daha sonra tekrar deneyin.";
        if (isSystemError) errorLog(`System Error (${interaction.commandName})`, err);
        
        let errPayload = USE_GLOBAL_ERROR_EMBEDS === "true" 
            ? { embeds: [embedBase(THEME.error).setDescription(msg)], flags: MessageFlags.Ephemeral } 
            : { content: msg, flags: MessageFlags.Ephemeral };

        await replySafe(interaction, errPayload);
    }
});

// ============================================================================
// 29. SCHEDULED JOBS
// ============================================================================
// Lazy evaluation ile (interest, penalties) tetiklendiğinden sistem en düşük kaynakla çalışır.

// ============================================================================
// 30. GRACEFUL SHUTDOWN / BACKUP / RECOVERY
// ============================================================================
const shutdown = async (signal) => {
    log(`${signal} sinyali alındı. Kapanış prosedürü başlatılıyor...`);
    if (DATA_PROVIDER === "json") {
        log("JSON zorunlu senkronizasyon yapılıyor...");
        await JsonImpl.save(true);
        await JsonImpl.backup();
    }
    log("İşlem tamamlandı. Sistem kapatılıyor.");
    process.exit(0);
};

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("uncaughtException", (err) => errorLog("Uncaught Exception", err));
process.on("unhandledRejection", (err) => errorLog("Unhandled Rejection", err));

client.login(DISCORD_TOKEN);