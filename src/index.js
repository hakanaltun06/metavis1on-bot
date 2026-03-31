/**
 * ============================================================================
 * MetaCoin REBORN v1.0.0
 * Next-Gen Advanced Discord Economy Bot
 * * Özellikler:
 * - Asenkron JSON ve Firestore Storage Soyutlaması
 * - Kapsamlı Finans: Kredi, Faiz, Vergi, Yatırım
 * - Gelişmiş Kumar, Envanter, Kasa, Yetenek Sistemleri
 * - Tek Dosya Mimarisi (Render ve Heroku Uyumlu)
 * ============================================================================
 */

import "dotenv/config";
import express from "express";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import admin from "firebase-admin";
import {
    Client, GatewayIntentBits, REST, Routes, Collection, Events,
    SlashCommandBuilder, EmbedBuilder, MessageFlags, Colors
} from "discord.js";

// ============================================================================
// 1. ENVIRONMENT & CONFIG
// ============================================================================
const {
    DISCORD_TOKEN, CLIENT_ID, GUILD_ID, PORT = 3000,
    REGISTER_COMMANDS = "true", OWNER_IDS = "", DEBUG = "false",
    DATA_PROVIDER = "json", STARTING_WALLET = "0", STARTING_BANK = "0",
    STARTING_BANK_MAX = "50000", DAILY_COOLDOWN_HOURS = "20",
    WORK_COOLDOWN_MINUTES = "30", BEG_COOLDOWN_MINUTES = "2",
    CRIME_COOLDOWN_MINUTES = "10", ROB_COOLDOWN_MINUTES = "60",
    INTEREST_ENABLED = "true", INTEREST_INTERVAL_HOURS = "12",
    INTEREST_RATE_SAVINGS = "0.02", INTEREST_RATE_LOAN = "0.05",
    INTEREST_CAP_MULTIPLIER = "0.20", TAX_ENABLED = "true",
    TAX_RATE_TRANSFER = "0.02", TAX_RATE_WITHDRAW = "0.01",
    TAX_RATE_GAMBLING_WIN = "0.03", MAX_BET_AMOUNT = "100000",
    MAX_SLOTS_AMOUNT = "50000", MAX_COINFLIP_AMOUNT = "100000",
    MAX_TRANSFER_AMOUNT = "1000000", ECONOMY_CURRENCY_NAME = "MetaCoin",
    ECONOMY_CURRENCY_SYMBOL = "MC", AUTO_SAVE_INTERVAL_MS = "15000",
    BACKUP_INTERVAL_MINUTES = "30", FIREBASE_PROJECT_ID,
    FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY
} = process.env;

if (!DISCORD_TOKEN || !CLIENT_ID) {
    console.error("FATAL: DISCORD_TOKEN ve CLIENT_ID zorunludur!");
    process.exit(1);
}

const ADMIN_LIST = OWNER_IDS.split(",").map(id => id.trim()).filter(Boolean);
const IS_DEBUG = DEBUG === "true";
const VERSION = "1.0.0 - REBORN";

// ============================================================================
// 2. CONSTANTS
// ============================================================================
const THEME = {
    main: 0x00c2ff, success: 0x2ecc71, error: 0xe74c3c,
    gamble: 0x9b59b6, admin: 0xe67e22, shop: 0xf1c40f, finance: 0x34495e
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
// 3. LOGGER & UTILITY FUNCTIONS
// ============================================================================
const log = (msg) => console.log(`[META] ${msg}`);
const debug = (msg) => { if (IS_DEBUG) console.log(`[DEBUG] ${msg}`); };
const errorLog = (msg, err) => console.error(`[ERROR] ${msg}`, err);
const nowSec = () => Math.floor(Date.now() / 1000);
const randint = (min, max) => crypto.randomInt(min, max + 1);
const fmt = (n) => `${Number(n).toLocaleString("tr-TR")} ${ECONOMY_CURRENCY_SYMBOL}`;
const generateId = () => crypto.randomBytes(8).toString('hex');

function embedBase(color = THEME.main) {
    return new EmbedBuilder().setColor(color).setFooter({ text: `MetaCoin REBORN • v${VERSION}`, iconURL: "https://cdn.discordapp.com/embed/avatars/0.png" }).setTimestamp();
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

function validateAmount(val, allowAll = false) {
    if (allowAll && typeof val === "string" && val.toLowerCase() === "all") return "all";
    const num = Math.floor(Number(val));
    if (isNaN(num) || !Number.isSafeInteger(num) || num <= 0) {
        throw new Error("Lütfen geçerli, pozitif bir tam sayı girin.");
    }
    return num;
}

// ============================================================================
// 4. USER MODEL DEFAULTS
// ============================================================================
const createUserTemplate = (userId) => ({
    user_id: userId,
    wallet: Number(STARTING_WALLET),
    bank: Number(STARTING_BANK),
    bank_max: Number(STARTING_BANK_MAX),
    xp: 0, level: 1, bio: null,
    created_at: nowSec(), updated_at: nowSec(),
    daily_streak: 0, last_daily: 0,
    total_interest_earned: 0, total_loan_interest_paid: 0, credit_score: 500,
    stats: {
        total_earned: 0, total_lost: 0, total_transferred_in: 0, total_transferred_out: 0,
        crates_opened: 0, items_sold: 0, work_uses: 0, beg_uses: 0,
        crime_success: 0, crime_fails: 0, rob_success: 0, rob_fails: 0,
        slots_plays: 0, coinflip_plays: 0, largest_win: 0, largest_loss: 0,
        loans_taken: 0, loans_repaid: 0, investments_created: 0, investments_claimed: 0
    }
});

// ============================================================================
// 5. STORAGE ABSTRACTION LAYER (JSON & FIRESTORE)
// ============================================================================
class StorageManager {
    constructor() { this.provider = DATA_PROVIDER; this.locks = new Set(); }
    
    // Concurrency Lock for Atomic Transactions
    async acquireLock(userId) {
        while (this.locks.has(userId)) await new Promise(r => setTimeout(r, 50));
        this.locks.add(userId);
    }
    releaseLock(userId) { this.locks.delete(userId); }

    async init() {
        if (this.provider === "firestore") await FirestoreImpl.init();
        else await JsonImpl.init();
        log(`Storage başlatıldı. Sağlayıcı: ${this.provider.toUpperCase()}`);
    }
    async getUser(id) { return this.provider === "firestore" ? FirestoreImpl.getUser(id) : JsonImpl.getUser(id); }
    async saveUser(id, data) { data.updated_at = nowSec(); return this.provider === "firestore" ? FirestoreImpl.saveUser(id, data) : JsonImpl.saveUser(id, data); }
    async getInventory(id) { return this.provider === "firestore" ? FirestoreImpl.getInventory(id) : JsonImpl.getInventory(id); }
    async saveInventory(id, inv) { return this.provider === "firestore" ? FirestoreImpl.saveInventory(id, inv) : JsonImpl.saveInventory(id, inv); }
    async addTransaction(id, tx) { tx.id = generateId(); tx.timestamp = nowSec(); return this.provider === "firestore" ? FirestoreImpl.addTransaction(id, tx) : JsonImpl.addTransaction(id, tx); }
    async getLoans(id) { return this.provider === "firestore" ? FirestoreImpl.getCollection(id, "loans") : JsonImpl.getCollection(id, "loans"); }
    async saveLoan(id, loan) { return this.provider === "firestore" ? FirestoreImpl.saveDocument(id, "loans", loan.id, loan) : JsonImpl.saveDocument(id, "loans", loan.id, loan); }
    async getInvestments(id) { return this.provider === "firestore" ? FirestoreImpl.getCollection(id, "investments") : JsonImpl.getCollection(id, "investments"); }
    async saveInvestment(id, inv) { return this.provider === "firestore" ? FirestoreImpl.saveDocument(id, "investments", inv.id, inv) : JsonImpl.saveDocument(id, "investments", inv.id, inv); }
    async deleteDocument(userId, col, docId) { return this.provider === "firestore" ? FirestoreImpl.deleteDocument(userId, col, docId) : JsonImpl.deleteDocument(userId, col, docId); }
    async getCooldown(id, cmd) { return this.provider === "firestore" ? FirestoreImpl.getCooldown(id, cmd) : JsonImpl.getCooldown(id, cmd); }
    async setCooldown(id, cmd, ms) { return this.provider === "firestore" ? FirestoreImpl.setCooldown(id, cmd, ms) : JsonImpl.setCooldown(id, cmd, ms); }
    async resetCooldown(id, cmd) { return this.provider === "firestore" ? FirestoreImpl.resetCooldown(id, cmd) : JsonImpl.resetCooldown(id, cmd); }
    async getAllUsers() { return this.provider === "firestore" ? FirestoreImpl.getAllUsers() : JsonImpl.getAllUsers(); }
}

// ----------------------------------------------------------------------------
// 5.1 JSON STORAGE IMPLEMENTATION
// ----------------------------------------------------------------------------
const JsonImpl = {
    file: path.join(process.cwd(), "data", "metacoin.json"),
    data: { users: {}, inventories: {}, transactions: {}, loans: {}, investments: {}, cooldowns: {} },
    dirty: false,
    async init() {
        const dir = path.join(process.cwd(), "data");
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        try {
            const raw = await fsp.readFile(this.file, "utf8");
            this.data = JSON.parse(raw);
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
            debug("JSON verisi diske atomic yazıldı.");
        } catch (e) { errorLog("JSON Save Error", e); }
    },
    async backup() {
        try {
            const bkpName = `metacoin_backup_${nowSec()}.json`;
            await fsp.writeFile(path.join(process.cwd(), "data", bkpName), JSON.stringify(this.data));
            log(`Otomatik yedek alındı: ${bkpName}`);
        } catch(e) { errorLog("Backup Error", e); }
    },
    async getUser(id) { 
        if (!this.data.users[id]) { this.data.users[id] = createUserTemplate(id); this.mark(); }
        return { ...this.data.users[id] }; // Return copy
    },
    async saveUser(id, user) { this.data.users[id] = user; this.mark(); },
    async getInventory(id) { return this.data.inventories[id] || {}; },
    async saveInventory(id, inv) { this.data.inventories[id] = inv; this.mark(); },
    async addTransaction(id, tx) { 
        if (!this.data.transactions[id]) this.data.transactions[id] = [];
        this.data.transactions[id].push(tx); 
        if(this.data.transactions[id].length > 50) this.data.transactions[id].shift(); // Keep last 50
        this.mark();
    },
    async getCollection(id, col) { return Object.values(this.data[col][id] || {}); },
    async saveDocument(id, col, docId, doc) { 
        if (!this.data[col][id]) this.data[col][id] = {};
        this.data[col][id][docId] = doc; this.mark(); 
    },
    async deleteDocument(id, col, docId) {
        if (this.data[col][id] && this.data[col][id][docId]) { delete this.data[col][id][docId]; this.mark(); }
    },
    async getCooldown(id, cmd) { return this.data.cooldowns[`${id}:${cmd}`] || 0; },
    async setCooldown(id, cmd, ms) { this.data.cooldowns[`${id}:${cmd}`] = nowSec() + Math.ceil(ms / 1000); this.mark(); },
    async resetCooldown(id, cmd) { delete this.data.cooldowns[`${id}:${cmd}`]; this.mark(); },
    async getAllUsers() { return Object.values(this.data.users); }
};

// ----------------------------------------------------------------------------
// 5.2 FIRESTORE STORAGE IMPLEMENTATION
// ----------------------------------------------------------------------------
let db;
const FirestoreImpl = {
    async init() {
        const pk = FIREBASE_PRIVATE_KEY ? FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n') : undefined;
        if(!FIREBASE_PROJECT_ID || !FIREBASE_CLIENT_EMAIL || !pk) throw new Error("Firestore ENV eksik!");
        admin.initializeApp({ credential: admin.credential.cert({ projectId: FIREBASE_PROJECT_ID, clientEmail: FIREBASE_CLIENT_EMAIL, privateKey: pk }) });
        db = admin.firestore();
    },
    async getUser(id) {
        const snap = await db.collection("users").doc(id).get();
        if (!snap.exists) {
            const newUser = createUserTemplate(id);
            await db.collection("users").doc(id).set(newUser);
            return newUser;
        }
        const data = snap.data();
        if(!data.stats) data.stats = createUserTemplate(id).stats; // Fallback for old schema
        return data;
    },
    async saveUser(id, user) { await db.collection("users").doc(id).set(user, { merge: true }); },
    async getInventory(id) { 
        const snap = await db.collection("users").doc(id).collection("inventory").get();
        const inv = {}; snap.forEach(d => inv[d.id] = d.data().qty); return inv;
    },
    async saveInventory(id, inv) {
        const batch = db.batch();
        const ref = db.collection("users").doc(id).collection("inventory");
        for (const [item, qty] of Object.entries(inv)) {
            if (qty <= 0) batch.delete(ref.doc(item));
            else batch.set(ref.doc(item), { qty });
        }
        await batch.commit();
    },
    async addTransaction(id, tx) { await db.collection("users").doc(id).collection("transactions").doc(tx.id).set(tx); },
    async getCollection(id, col) {
        const snap = await db.collection("users").doc(id).collection(col).get();
        return snap.docs.map(d => d.data());
    },
    async saveDocument(id, col, docId, doc) { await db.collection("users").doc(id).collection(col).doc(docId).set(doc); },
    async deleteDocument(id, col, docId) { await db.collection("users").doc(id).collection(col).doc(docId).delete(); },
    async getCooldown(id, cmd) {
        const s = await db.collection("users").doc(id).collection("cooldowns").doc(cmd).get();
        return s.exists ? s.data().expiresAt : 0;
    },
    async setCooldown(id, cmd, ms) { await db.collection("users").doc(id).collection("cooldowns").doc(cmd).set({ expiresAt: nowSec() + Math.ceil(ms / 1000) }); },
    async resetCooldown(id, cmd) { await db.collection("users").doc(id).collection("cooldowns").doc(cmd).delete(); },
    async getAllUsers() {
        const s = await db.collection("users").get();
        return s.docs.map(d => d.data());
    }
};

const DB = new StorageManager();

// ============================================================================
// 6. ECONOMY CORE & UNIFIED FUNCTIONS
// ============================================================================

// Helper: Vergi hesaplama ve kesme
function applyTax(amount, type) {
    if (TAX_ENABLED !== "true") return { amount, tax: 0 };
    let rate = 0;
    if (type === "transfer") rate = Number(TAX_RATE_TRANSFER);
    if (type === "withdraw") rate = Number(TAX_RATE_WITHDRAW);
    if (type === "gamble") rate = Number(TAX_RATE_GAMBLING_WIN);
    
    const tax = Math.floor(amount * rate);
    return { amount: amount - tax, tax };
}

async function updateStat(u, key, amount, isMaxCheck = false) {
    if (!u.stats[key]) u.stats[key] = 0;
    if (isMaxCheck) { if (amount > u.stats[key]) u.stats[key] = amount; }
    else { u.stats[key] += amount; }
}

function addXP(u, amount) {
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

async function addItem(userId, item, qty) {
    const inv = await DB.getInventory(userId);
    inv[item] = (inv[item] || 0) + qty;
    if (inv[item] <= 0) delete inv[item];
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
// 7. FINANCE SYSTEMS (Banks, Loans, Investments)
// ============================================================================

async function processDeposit(userId, amountStr) {
    await DB.acquireLock(userId);
    try {
        const u = await DB.getUser(userId);
        let amount = validateAmount(amountStr, true) === "all" ? u.wallet : validateAmount(amountStr);
        if (u.wallet < amount) throw new Error("Cüzdanda yeterli bakiye yok.");
        const can = Math.max(0, u.bank_max - u.bank);
        const will = Math.min(amount, can);
        if (will <= 0) throw new Error("Bankada yer yok.");
        
        u.wallet -= will; u.bank += will;
        await DB.saveUser(userId, u);
        await DB.addTransaction(userId, { type: "deposit", amount: will, status: "success" });
        return will;
    } finally { DB.releaseLock(userId); }
}

async function processWithdraw(userId, amountStr) {
    await DB.acquireLock(userId);
    try {
        const u = await DB.getUser(userId);
        let amount = validateAmount(amountStr, true) === "all" ? u.bank : validateAmount(amountStr);
        if (u.bank < amount) throw new Error("Bankada yeterli bakiye yok.");
        
        const { amount: net, tax } = applyTax(amount, "withdraw");
        u.bank -= amount; 
        u.wallet += net;
        
        await DB.saveUser(userId, u);
        await DB.addTransaction(userId, { type: "withdraw", amount, net, tax, status: "success" });
        return { net, tax, total: amount };
    } finally { DB.releaseLock(userId); }
}

async function processTransfer(fromId, toId, amountStr) {
    if (fromId === toId) throw new Error("Kendine para gönderemezsin.");
    const amount = validateAmount(amountStr);
    if (amount > Number(MAX_TRANSFER_AMOUNT)) throw new Error(`Tek seferde en fazla ${fmt(MAX_TRANSFER_AMOUNT)} gönderebilirsin.`);
    
    await DB.acquireLock(fromId);
    await DB.acquireLock(toId);
    try {
        const from = await DB.getUser(fromId);
        if (from.wallet < amount) throw new Error("Cüzdanında yeterli para yok.");
        
        const { amount: net, tax } = applyTax(amount, "transfer");
        from.wallet -= amount;
        updateStat(from, "total_transferred_out", amount);
        
        const to = await DB.getUser(toId);
        to.wallet += net;
        updateStat(to, "total_transferred_in", net);
        
        await DB.saveUser(fromId, from);
        await DB.saveUser(toId, to);
        await DB.addTransaction(fromId, { type: "transfer_out", to: toId, amount, tax });
        await DB.addTransaction(toId, { type: "transfer_in", from: fromId, amount: net, tax_paid_by_sender: tax });
        
        return { net, tax, total: amount };
    } finally { 
        DB.releaseLock(fromId); DB.releaseLock(toId); 
    }
}

// ============================================================================
// 8. LOANS & INVESTMENTS
// ============================================================================

async function takeLoan(userId, amountStr) {
    const amount = validateAmount(amountStr);
    await DB.acquireLock(userId);
    try {
        const u = await DB.getUser(userId);
        const networth = await getNetworth(userId);
        const limit = (u.level * 5000) + (networth * 0.1) + (u.credit_score * 100);
        
        const activeLoans = await DB.getLoans(userId);
        const currentDebt = activeLoans.reduce((acc, l) => acc + l.total_due, 0);
        
        if (currentDebt + amount > limit) {
            throw new Error(`Kredi limitin yetersiz. Maksimum Limit: ${fmt(limit)}\nMevcut Borcun: ${fmt(currentDebt)}`);
        }
        
        const interest = Math.floor(amount * Number(INTEREST_RATE_LOAN));
        const totalDue = amount + interest;
        const loan = { id: generateId(), amount, interest, total_due: totalDue, taken_at: nowSec(), due_date: nowSec() + (7 * 86400) }; // 7 Days
        
        u.wallet += amount;
        updateStat(u, "loans_taken", 1);
        
        await DB.saveLoan(userId, loan);
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
        const loan = loans.find(l => l.id === loanId);
        if (!loan) throw new Error("Böyle bir aktif kredi bulunamadı.");
        
        let amount = validateAmount(amountStr, true) === "all" ? loan.total_due : validateAmount(amountStr);
        if (amount > loan.total_due) amount = loan.total_due;
        if (u.wallet < amount && u.bank < amount) throw new Error("Cüzdan veya bankanda yeterli para yok.");
        
        // Deduct from wallet first, then bank
        if (u.wallet >= amount) u.wallet -= amount;
        else { const rem = amount - u.wallet; u.wallet = 0; u.bank -= rem; }
        
        loan.total_due -= amount;
        if (loan.total_due <= 0) {
            await DB.deleteDocument(userId, "loans", loanId);
            u.credit_score += 10; // Boost credit score
            updateStat(u, "loans_repaid", 1);
        } else {
            await DB.saveLoan(userId, loan);
        }
        await DB.saveUser(userId, u);
        await DB.addTransaction(userId, { type: "loan_repay", amount, loanId });
        
        return { paid: amount, left: loan.total_due, cleared: loan.total_due <= 0 };
    } finally { DB.releaseLock(userId); }
}

async function createInvestment(userId, amountStr, daysStr) {
    const amount = validateAmount(amountStr);
    const days = validateAmount(daysStr);
    if (days < 1 || days > 30) throw new Error("Vade süresi 1-30 gün arasında olmalıdır.");
    
    await DB.acquireLock(userId);
    try {
        const u = await DB.getUser(userId);
        if (u.wallet < amount) throw new Error("Cüzdanında yeterli para yok.");
        
        // Base interest 1% per day
        const returnAmt = Math.floor(amount + (amount * 0.01 * days));
        const inv = { id: generateId(), amount, return_amount: returnAmt, days, created_at: nowSec(), unlocks_at: nowSec() + (days * 86400) };
        
        u.wallet -= amount;
        updateStat(u, "investments_created", 1);
        
        await DB.saveInvestment(userId, inv);
        await DB.saveUser(userId, u);
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
        
        let payout = 0;
        let isPenalty = false;
        
        if (nowSec() >= inv.unlocks_at) {
            payout = inv.return_amount;
        } else {
            if (!forceBreak) throw new Error("Yatırımın süresi henüz dolmadı. Erken bozmak istiyorsan '/investment break' kullan.");
            // Penalty: lose 10% of original
            payout = Math.floor(inv.amount * 0.90);
            isPenalty = true;
            u.credit_score = Math.max(0, u.credit_score - 15);
        }
        
        u.wallet += payout;
        if (!isPenalty) updateStat(u, "investments_claimed", 1);
        
        await DB.deleteDocument(userId, "investments", invId);
        await DB.saveUser(userId, u);
        await DB.addTransaction(userId, { type: "invest_claim", payout, isPenalty });
        
        return { payout, isPenalty };
    } finally { DB.releaseLock(userId); }
}

// ============================================================================
// 9. INCOME & GAMBLING ACTIONS
// ============================================================================

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
            const events = ["Kod yazdın", "Garsonluk yaptın", "Maden kazdın", "Şarkı söyledin"];
            event = events[randint(0, events.length - 1)];
            updateStat(u, "work_uses", 1);
            addXP(u, 15); // Kilitlenme çözüldü
        } 
        else if (actionType === "beg") {
            updateStat(u, "beg_uses", 1);
            if (randint(1, 100) <= 25) { ok = false; event = "Kimse para vermedi."; }
            else { earned = randint(50, 180); addXP(u, 5); } // Kilitlenme çözüldü
        } 
        else if (actionType === "crime") {
            const caught = randint(1, 100) <= 45;
            if (caught) {
                ok = false; riskLost = Math.min(u.wallet, randint(200, 700));
                u.wallet -= riskLost; updateStat(u, "crime_fails", 1);
            } else {
                earned = randint(600, 2200); updateStat(u, "crime_success", 1);
                addXP(u, 25); // Kilitlenme çözüldü
            }
        }

        if (ok && earned > 0) {
            u.wallet += earned;
            updateStat(u, "total_earned", earned);
        }
        
        await DB.saveUser(userId, u);
        await DB.setCooldown(userId, actionType, COOLDOWNS[actionType]);
        return { ok, earned, event, riskLost, streak: u.daily_streak };
    } finally { DB.releaseLock(userId); }
}

async function processRob(userId, targetId) {
    if (userId === targetId) throw new Error("Kendini soyamazsın!");
    await DB.acquireLock(userId);
    await DB.acquireLock(targetId);
    try {
        const left = await checkCooldownLeft(userId, "rob");
        if (left > 0) return { ok: false, cooldown: true, left };

        const u = await DB.getUser(userId);
        const t = await DB.getUser(targetId);

        if (t.wallet < 500) throw new Error("Hedefin cüzdanı boş sayılır.");
        if (u.wallet < 500) throw new Error("Soygun için en az 500 MC risk etmelisin.");

        await DB.setCooldown(userId, "rob", COOLDOWNS.rob);
        const success = randint(1, 100) <= 35;
        
        if (success) {
            const stolen = Math.floor(t.wallet * (randint(10, 30) / 100));
            t.wallet -= stolen; u.wallet += stolen;
            updateStat(u, "rob_success", 1);
            await DB.saveUser(userId, u); await DB.saveUser(targetId, t);
            return { ok: true, amount: stolen };
        } else {
            const fine = Math.floor(u.wallet * 0.20);
            u.wallet -= fine;
            updateStat(u, "rob_fails", 1);
            await DB.saveUser(userId, u);
            return { ok: false, fine };
        }
    } finally { DB.releaseLock(userId); DB.releaseLock(targetId); }
}

async function processGamble(userId, type, betStr, extra) {
    const bet = validateAmount(betStr);
    const maxBet = type === "slots" ? Number(MAX_SLOTS_AMOUNT) : Number(MAX_COINFLIP_AMOUNT);
    if (bet > maxBet) throw new Error(`Maksimum bahis: ${fmt(maxBet)}`);
    
    await DB.acquireLock(userId);
    try {
        const u = await DB.getUser(userId);
        if (u.wallet < bet) throw new Error("Yetersiz cüzdan bakiyesi.");
        
        let win = false, grossWin = 0, eventData = {};
        
        if (type === "coinflip") {
            updateStat(u, "coinflip_plays", 1);
            const flip = randint(0, 1) === 0 ? "heads" : "tails";
            eventData.flip = flip;
            if (flip === extra) { win = true; grossWin = bet * 2; }
        } 
        else if (type === "slots") {
            updateStat(u, "slots_plays", 1);
            const symbols = ["🍒", "💎", "🍀", "7️⃣", "⭐"];
            const a = symbols[randint(0, 4)], b = symbols[randint(0, 4)], c = symbols[randint(0, 4)];
            eventData.reels = [a, b, c];
            if (a === b && b === c) {
                const table = { "🍒": 3, "⭐": 4, "🍀": 5, "💎": 7, "7️⃣": 15 };
                grossWin = Math.floor(bet * (table[a] || 3)); win = true;
            } else if (a === b || b === c || a === c) {
                grossWin = Math.floor(bet * 1.5); win = true;
            }
        }

        if (win) {
            const netWin = grossWin - bet;
            const { amount: taxedNetWin, tax } = applyTax(netWin, "gamble");
            u.wallet += taxedNetWin;
            updateStat(u, "largest_win", taxedNetWin, true);
            updateStat(u, "total_earned", taxedNetWin);
            eventData.netWin = taxedNetWin;
            eventData.tax = tax;
        } else {
            u.wallet -= bet;
            updateStat(u, "largest_loss", bet, true);
            updateStat(u, "total_lost", bet);
        }
        
        await DB.saveUser(userId, u);
        return { win, ...eventData, bet };
    } finally { DB.releaseLock(userId); }
}

// ============================================================================
// 10. CRATES, INVENTORY & SHOP
// ============================================================================

async function buyItemOrCrate(userId, name, countStr) {
    const count = validateAmount(countStr);
    await DB.acquireLock(userId);
    try {
        const u = await DB.getUser(userId);
        
        if (CRATES[name]) {
            const total = CRATES[name].price * count;
            if (u.wallet < total) throw new Error(`Yetersiz bakiye. Gerekli: ${fmt(total)}`);
            u.wallet -= total;
            await addItem(userId, `${name} crate`, count);
            await DB.saveUser(userId, u);
            return { type: "crate", total, count, name };
        }
        
        const rItem = Object.keys(SHOP_ITEMS).find(k => k.toLowerCase() === name.toLowerCase());
        if (rItem) {
            const total = SHOP_ITEMS[rItem].price * count;
            if (u.wallet < total) throw new Error(`Yetersiz bakiye. Gerekli: ${fmt(total)}`);
            u.wallet -= total;
            await addItem(userId, rItem, count);
            await DB.saveUser(userId, u);
            return { type: "item", total, count, name: rItem };
        }
        throw new Error("Mağazada bulunamadı.");
    } finally { DB.releaseLock(userId); }
}

async function openCrates(userId, type, countStr) {
    const count = validateAmount(countStr);
    if (!CRATES[type]) throw new Error("Bilinmeyen kasa.");
    
    await DB.acquireLock(userId);
    try {
        const ok = await removeItem(userId, `${type} crate`, count);
        if (!ok) throw new Error("Envanterinde yeterli kasa yok.");
        
        const results = [];
        let totalCoins = 0;
        for (let i = 0; i < count; i++) {
            const roll = choiceWeighted(CRATES[type].loot);
            if (roll.type === "coins") {
                const amt = randint(roll.min, roll.max);
                totalCoins += amt; results.push({ type: "coins", amount: amt });
            } else {
                const qty = randint(roll.min, roll.max);
                await addItem(userId, roll.item, qty);
                results.push({ type: "item", item: roll.item, qty });
            }
        }
        
        const u = await DB.getUser(userId);
        if (totalCoins > 0) u.wallet += totalCoins;
        updateStat(u, "crates_opened", count);
        addXP(u, count * 10); // Kilitlenme çözüldü (saveUser'dan önceye alındı)
        
        await DB.saveUser(userId, u);
        return { totalCoins, results };
    } finally { DB.releaseLock(userId); }
}

async function sellItems(userId, item, qtyStr) {
    const qty = validateAmount(qtyStr);
    const rItem = Object.keys(SELL_VALUES).find(k => k.toLowerCase() === item.toLowerCase());
    if (!rItem) throw new Error("Bu eşya satılamaz.");
    
    await DB.acquireLock(userId);
    try {
        const ok = await removeItem(userId, rItem, qty);
        if (!ok) throw new Error("Envanterde yeterli yok.");
        
        const gain = SELL_VALUES[rItem] * qty;
        const u = await DB.getUser(userId);
        u.wallet += gain;
        updateStat(u, "items_sold", qty);
        await DB.saveUser(userId, u);
        return gain;
    } finally { DB.releaseLock(userId); }
}

// ============================================================================
// 11. SLASH COMMAND BUILDERS
// ============================================================================
const commands = [
    new SlashCommandBuilder().setName("help").setDescription("MetaCoin REBORN komut yardım listesi"),
    new SlashCommandBuilder().setName("balance").setDescription("Cüzdan ve banka bakiyeni gösterir.").addUserOption(o => o.setName("kullanici").setDescription("Birini kontrol et")),
    new SlashCommandBuilder().setName("deposit").setDescription("Bankaya para yatır.").addStringOption(o => o.setName("miktar").setDescription("Sayı veya 'all'").setRequired(true)),
    new SlashCommandBuilder().setName("withdraw").setDescription("Bankadan para çek.").addStringOption(o => o.setName("miktar").setDescription("Sayı veya 'all'").setRequired(true)),
    new SlashCommandBuilder().setName("pay").setDescription("Birine para gönder (Vergi kesilebilir).").addUserOption(o => o.setName("hedef").setRequired(true).setDescription("Kime")).addStringOption(o => o.setName("miktar").setDescription("Miktar").setRequired(true)),
    new SlashCommandBuilder().setName("daily").setDescription("Günlük ödül (Seri bonuslu)."),
    new SlashCommandBuilder().setName("work").setDescription(`Çalış ve para kazan (${WORK_COOLDOWN_MINUTES} dk).`),
    new SlashCommandBuilder().setName("beg").setDescription(`Dilencilik (${BEG_COOLDOWN_MINUTES} dk).`),
    new SlashCommandBuilder().setName("crime").setDescription(`Suç işle riskli (${CRIME_COOLDOWN_MINUTES} dk).`),
    new SlashCommandBuilder().setName("rob").setDescription(`Soygun yap riskli (${ROB_COOLDOWN_MINUTES} dk).`).addUserOption(o => o.setName("hedef").setRequired(true).setDescription("Kurban")),
    new SlashCommandBuilder().setName("bet").setDescription("Yazı tura (coinflip).").addStringOption(o => o.setName("taraf").setRequired(true).setDescription("heads/tails").addChoices({name:"heads",value:"heads"},{name:"tails",value:"tails"})).addStringOption(o => o.setName("miktar").setRequired(true).setDescription("Bahis miktarı")),
    new SlashCommandBuilder().setName("slots").setDescription("Slot makinesi.").addStringOption(o => o.setName("miktar").setRequired(true).setDescription("Bahis miktarı")),
    new SlashCommandBuilder().setName("shop").setDescription("Mağazayı görüntüle.").addStringOption(o => o.setName("kategori").setDescription("Ne mağazası?").addChoices({name:"crates",value:"crates"},{name:"items",value:"items"})),
    new SlashCommandBuilder().setName("buy").setDescription("Eşya veya kasa satın al.").addStringOption(o => o.setName("urun").setRequired(true).setDescription("Adı")).addStringOption(o => o.setName("adet").setRequired(true).setDescription("Kaç tane?")),
    new SlashCommandBuilder().setName("inventory").setDescription("Envanterini göster.").addUserOption(o => o.setName("kullanici").setDescription("Kimin?")),
    new SlashCommandBuilder().setName("open").setDescription("Kasa aç.").addStringOption(o => o.setName("kasa").setRequired(true).setDescription("basic/rare/epic/legendary").addChoices({name:"basic",value:"basic"},{name:"rare",value:"rare"},{name:"epic",value:"epic"},{name:"legendary",value:"legendary"})).addStringOption(o => o.setName("adet").setRequired(true).setDescription("Adet")),
    new SlashCommandBuilder().setName("sell").setDescription("Eşya sat.").addStringOption(o => o.setName("esya").setRequired(true).setDescription("Adı")).addStringOption(o => o.setName("adet").setRequired(true).setDescription("Adet")),
    new SlashCommandBuilder().setName("leaderboard").setDescription("Liderlik tablosu").addStringOption(o => o.setName("tur").setRequired(true).setDescription("Sıralama türü").addChoices({name:"wallet",value:"wallet"},{name:"bank",value:"bank"},{name:"networth",value:"networth"})),
    new SlashCommandBuilder().setName("cooldowns").setDescription("Bekleme sürelerini göster."),
    new SlashCommandBuilder().setName("rank").setDescription("Sıralamanı gör."),
    new SlashCommandBuilder().setName("crateinfo").setDescription("Kasa içerik ve oranları."),
    
    // Bank System
    new SlashCommandBuilder().setName("bank").setDescription("Banka işlemleri")
        .addSubcommand(s => s.setName("upgrade").setDescription("Kapasite artır."))
        .addSubcommand(s => s.setName("interest").setDescription("Faiz oranlarını ve durumu gör."))
        .addSubcommand(s => s.setName("statement").setDescription("Son işlemleri (Transaction) gösterir.")),
        
    // Loan System
    new SlashCommandBuilder().setName("loan").setDescription("Kredi sistemi")
        .addSubcommand(s => s.setName("take").setDescription("Kredi çek.").addStringOption(o => o.setName("miktar").setRequired(true).setDescription("Miktar")))
        .addSubcommand(s => s.setName("repay").setDescription("Kredi öde.").addStringOption(o => o.setName("id").setRequired(true).setDescription("Kredi ID")).addStringOption(o=> o.setName("miktar").setRequired(true).setDescription("Miktar veya 'all'")))
        .addSubcommand(s => s.setName("list").setDescription("Aktif kredilerini gör.")),

    // Investment System
    new SlashCommandBuilder().setName("investment").setDescription("Yatırım / Vadeli Hesap")
        .addSubcommand(s => s.setName("create").setDescription("Yatırım yap.").addStringOption(o => o.setName("miktar").setRequired(true).setDescription("Miktar")).addStringOption(o=> o.setName("gun").setRequired(true).setDescription("Vade (1-30)")))
        .addSubcommand(s => s.setName("claim").setDescription("Vadesi dolan yatırımı çek.").addStringOption(o => o.setName("id").setRequired(true).setDescription("Yatırım ID")))
        .addSubcommand(s => s.setName("break").setDescription("Yatırımı cezalı erken boz.").addStringOption(o => o.setName("id").setRequired(true).setDescription("Yatırım ID")))
        .addSubcommand(s => s.setName("list").setDescription("Yatırımlarını gör.")),

    new SlashCommandBuilder().setName("tax").setDescription("Güncel vergi oranlarını gösterir."),
    new SlashCommandBuilder().setName("stats").setDescription("Detaylı istatistikler.").addUserOption(o => o.setName("kullanici").setDescription("Kimin?")),
    new SlashCommandBuilder().setName("profile").setDescription("Profil").addSubcommand(s=> s.setName("view").setDescription("Profil gör").addUserOption(o=> o.setName("kullanici").setDescription("Kimin?"))).addSubcommand(s=> s.setName("setbio").setDescription("Bio ayarla").addStringOption(o=> o.setName("metin").setRequired(true).setDescription("Metin"))),
    new SlashCommandBuilder().setName("top").setDescription("Gelişmiş Top")
        .addSubcommand(s => s.setName("crates").setDescription("En çok kasa açanlar")).addSubcommand(s => s.setName("gamblers").setDescription("En çok kumar oynayanlar")).addSubcommand(s => s.setName("richest").setDescription("En zenginler (Networth)")).addSubcommand(s => s.setName("level").setDescription("En yüksek leveller"))
];

const allSlashJSON = commands.map(c => c.toJSON());

// ============================================================================
// 12. INTERACTION HANDLERS
// ============================================================================
const handlers = {
    help: async (i) => {
        const e = embedBase().setTitle("MetaCoin REBORN • Sistem Rehberi")
            .setDescription("Gelişmiş ekonomi, finans, yatırım ve yetenek modülleri aktiftir.")
            .addFields(
                { name: "🏦 Finans & Banka", value: "`/balance`, `/deposit`, `/withdraw`, `/pay`, `/bank upgrade`, `/bank interest`, `/bank statement`, `/tax`" },
                { name: "📈 Kredi & Yatırım", value: "`/loan take`, `/loan repay`, `/loan list`\n`/investment create`, `/investment claim`, `/investment break`" },
                { name: "🛠️ İş & Gelir", value: "`/daily`, `/work`, `/beg`, `/crime`, `/rob`" },
                { name: "🎲 Kumar", value: "`/bet`, `/slots`" },
                { name: "📦 Eşya & Kasa", value: "`/shop`, `/buy`, `/open`, `/inventory`, `/sell`, `/crateinfo`" },
                { name: "🏆 Rekabet & Profil", value: "`/leaderboard`, `/top`, `/profile view`, `/stats`, `/rank`, `/cooldowns`" }
            );
        await i.reply({ embeds: [e] });
    },
    balance: async (i) => {
        const target = i.options.getUser("kullanici") || i.user;
        const u = await DB.getUser(target.id);
        const net = await getNetworth(target.id);
        const e = embedBase().setTitle(`Bakiye — ${target.username}`).setThumbnail(target.displayAvatarURL())
            .addFields(
                { name: "Cüzdan", value: fmt(u.wallet), inline: true },
                { name: "Banka", value: `${fmt(u.bank)} / ${fmt(u.bank_max)}`, inline: true },
                { name: "Net Değer", value: fmt(net), inline: true }
            );
        await i.reply({ embeds: [e] });
    },
    deposit: async (i) => {
        const placed = await processDeposit(i.user.id, i.options.getString("miktar"));
        await i.reply({ embeds: [embedBase(THEME.success).setDescription(`✅ Bankaya **${fmt(placed)}** yatırıldı.`)] });
    },
    withdraw: async (i) => {
        const { net, tax, total } = await processWithdraw(i.user.id, i.options.getString("miktar"));
        let desc = `✅ Bankadan başarıyla **${fmt(total)}** çekildi.`;
        if (tax > 0) desc += `\n*Vergi Kestintisi: ${fmt(tax)} (Ele geçen: ${fmt(net)})*`;
        await i.reply({ embeds: [embedBase(THEME.success).setDescription(desc)] });
    },
    pay: async (i) => {
        const target = i.options.getUser("hedef");
        if (target.bot) throw new Error("Botlara para atamazsın.");
        const { net, tax, total } = await processTransfer(i.user.id, target.id, i.options.getString("miktar"));
        let desc = `💸 **${target.username}** adlı kullanıcıya **${fmt(net)}** ulaştı.`;
        if (tax > 0) desc += ` *(Gönderilen: ${fmt(total)}, Vergi: ${fmt(tax)})*`;
        await i.reply({ embeds: [embedBase(THEME.success).setDescription(desc)] });
    },
    daily: async (i) => {
        const r = await doAction(i.user.id, "daily");
        if (!r.ok) return i.reply({ flags: MessageFlags.Ephemeral, content: `⏳ Bekle: **${msToHuman(r.left)}**` });
        await i.reply({ embeds: [embedBase(THEME.success).setTitle("🎁 Günlük Ödül").setDescription(`Kazanılan: **${fmt(r.earned)}**\n🔥 Seri: **${r.streak} Gün**`)] });
    },
    work: async (i) => {
        const r = await doAction(i.user.id, "work");
        if (!r.ok) return i.reply({ flags: MessageFlags.Ephemeral, content: `⏳ Bekle: **${msToHuman(r.left)}**` });
        await i.reply({ embeds: [embedBase(THEME.success).setDescription(`🛠️ **${r.event}**. Maaş: **${fmt(r.earned)}**\n🌟 *+15 XP*`)] });
    },
    beg: async (i) => {
        const r = await doAction(i.user.id, "beg");
        if (!r.ok && r.left) return i.reply({ flags: MessageFlags.Ephemeral, content: `⏳ Bekle: **${msToHuman(r.left)}**` });
        if (!r.ok) return i.reply({ content: `🤷 ${r.event}` });
        await i.reply({ content: `🙏 Yoldan geçen biri **${fmt(r.earned)}** fırlattı.` });
    },
    crime: async (i) => {
        const r = await doAction(i.user.id, "crime");
        if (!r.ok && r.left) return i.reply({ flags: MessageFlags.Ephemeral, content: `⏳ Ortalık durulana kadar bekle: **${msToHuman(r.left)}**` });
        if (r.ok) await i.reply({ embeds: [embedBase(THEME.success).setDescription(`🕶️ Mükemmel bir vurgun! **${fmt(r.earned)}** kaldırdın.\n🌟 *+25 XP*`)] });
        else await i.reply({ embeds: [embedBase(THEME.error).setDescription(`🚨 Polise yakalandın! Rüşvet: **${fmt(r.riskLost)}**`)] });
    },
    rob: async (i) => {
        const target = i.options.getUser("hedef");
        if (target.bot) throw new Error("Botları soyamazsın.");
        const r = await processRob(i.user.id, target.id);
        if (r.cooldown) return i.reply({ flags: MessageFlags.Ephemeral, content: `⏳ Bekle: **${msToHuman(r.left)}**` });
        if (r.ok) await i.reply({ embeds: [embedBase(THEME.success).setDescription(`🥷 **${target.username}** soyuldu! Ganimet: **${fmt(r.amount)}**`)] });
        else await i.reply({ embeds: [embedBase(THEME.error).setDescription(`🚨 **${target.username}** polisi aradı! Ceza: **${fmt(r.fine)}**`)] });
    },
    bet: async (i) => {
        const side = i.options.getString("taraf");
        const r = await processGamble(i.user.id, "coinflip", i.options.getString("miktar"), side);
        let desc = `Bahis: **${side}**\nAtılan: **${r.flip}**\n\nSonuç: ${r.win ? `**KAZANDIN!**` : `**KAYBETTİN!** (-${fmt(r.bet)})`}`;
        if (r.win) desc += `\nNet Kazanç: **${fmt(r.netWin)}** *(Vergi: ${fmt(r.tax)})*`;
        await i.reply({ embeds: [embedBase(THEME.gamble).setTitle("🪙 Yazı Tura").setDescription(desc)] });
    },
    slots: async (i) => {
        const r = await processGamble(i.user.id, "slots", i.options.getString("miktar"));
        let desc = `[ ${r.reels.join(" | ")} ]\n\nSonuç: ${r.win ? `**KAZANDIN!**` : `**KAYBETTİN!** (-${fmt(r.bet)})`}`;
        if (r.win) desc += `\nNet Kazanç: **${fmt(r.netWin)}** *(Vergi: ${fmt(r.tax)})*`;
        await i.reply({ embeds: [embedBase(THEME.gamble).setTitle("🎰 Slot Makinesi").setDescription(desc)] });
    },
    buy: async (i) => {
        const r = await buyItemOrCrate(i.user.id, i.options.getString("urun"), i.options.getString("adet"));
        await i.reply({ embeds: [embedBase(THEME.success).setDescription(`🛒 **${r.count}x ${r.name}** başarıyla alındı. Harcanan: **${fmt(r.total)}**`)] });
    },
    open: async (i) => {
        const r = await openCrates(i.user.id, i.options.getString("kasa"), i.options.getString("adet"));
        let desc = `📦 Başarıyla açıldı!\n\n**Kazanılanlar:**\n`;
        if (r.totalCoins > 0) desc += `🪙 **${fmt(r.totalCoins)}**\n`;
        const itemMap = {}; r.results.filter(x => x.type === "item").forEach(x => itemMap[x.item] = (itemMap[x.item] || 0) + x.qty);
        for (const [it, q] of Object.entries(itemMap)) desc += `🔹 **${it}**: x${q}\n`;
        await i.reply({ embeds: [embedBase(THEME.success).setDescription(desc)] });
    },
    sell: async (i) => {
        const gain = await sellItems(i.user.id, i.options.getString("esya"), i.options.getString("adet"));
        await i.reply({ embeds: [embedBase(THEME.success).setDescription(`💱 Eşyalar başarıyla satıldı. Kazanç: **${fmt(gain)}**`)] });
    },
    inventory: async (i) => {
        const target = i.options.getUser("kullanici") || i.user;
        const inv = await DB.getInventory(target.id);
        const crates = [], items = [];
        for (const [k, v] of Object.entries(inv)) { if (k.endsWith("crate")) crates.push(`• **${k}**: x${v}`); else items.push(`• **${k}**: x${v}`); }
        const e = embedBase().setTitle(`🎒 Envanter — ${target.username}`).addFields(
            { name: "📦 Kasalar", value: crates.join("\n") || "*Kasa yok*", inline: true },
            { name: "🧰 Eşyalar", value: items.join("\n") || "*Eşya yok*", inline: true }
        );
        await i.reply({ embeds: [e] });
    },
    shop: async (i) => {
        const cat = i.options.getString("kategori") || "crates";
        const e = embedBase(THEME.shop);
        if (cat === "crates") {
            e.setTitle("🛒 Mağaza — Kasalar").setDescription("`/buy urun:<isim> adet:<n>`");
            for (const [k, v] of Object.entries(CRATES)) e.addFields({ name: `📦 ${k}`, value: `Fiyat: ${fmt(v.price)}\n*${v.desc}*` });
        } else {
            e.setTitle("🛒 Mağaza — Eşyalar").setDescription("`/buy urun:<isim> adet:<n>`");
            for (const [k, v] of Object.entries(SHOP_ITEMS)) e.addFields({ name: `🔧 ${k}`, value: `Fiyat: ${fmt(v.price)}\n*${v.desc}*` });
        }
        await i.reply({ embeds: [e] });
    },
    crateinfo: async (i) => {
        const e = embedBase().setTitle("ℹ️ Kasa Oranları");
        for (const [k, v] of Object.entries(CRATES)) {
            const str = v.loot.map(l => l.type === "coins" ? `🪙 Para (${fmt(l.min)}-${fmt(l.max)}) [%${l.weight}]` : `🔹 ${l.item} (${l.min}-${l.max}) [%${l.weight}]`).join("\n");
            e.addFields({ name: `📦 ${k} (${fmt(v.price)})`, value: str });
        }
        await i.reply({ embeds: [e] });
    },
    tax: async (i) => {
        const e = embedBase(THEME.finance).setTitle("⚖️ Güncel Vergi Oranları")
            .setDescription("Sistemdeki para akışını dengelemek için vergi uygulanır.")
            .addFields(
                { name: "Para Transferi (Pay)", value: `%${(Number(TAX_RATE_TRANSFER)*100).toFixed(1)}`, inline: true },
                { name: "Bankadan Çekim (Withdraw)", value: `%${(Number(TAX_RATE_WITHDRAW)*100).toFixed(1)}`, inline: true },
                { name: "Kumar Kazançları (Bet/Slots)", value: `%${(Number(TAX_RATE_GAMBLING_WIN)*100).toFixed(1)}`, inline: true }
            );
        await i.reply({ embeds: [e] });
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
                await i.reply({ embeds: [embedBase(THEME.success).setDescription(`🏦 Kapasite artırıldı! Yeni sınır: **${fmt(u.bank_max)}**`)] });
            } finally { DB.releaseLock(i.user.id); }
        } 
        else if (sub === "interest") {
            const e = embedBase(THEME.finance).setTitle("🏦 Faiz Sistemi").addFields(
                { name: "Tasarruf Faizi Oranı", value: `%${(Number(INTEREST_RATE_SAVINGS)*100).toFixed(1)} / Periyot`, inline: true },
                { name: "Faiz Periyodu", value: `${INTEREST_INTERVAL_HOURS} Saat`, inline: true },
                { name: "Maksimum Getiri Sınırı", value: `Kapasitenin %${(Number(INTEREST_CAP_MULTIPLIER)*100)}'i`, inline: true },
                { name: "Nasıl Çalışır?", value: "Bankanızdaki para otomatik olarak faiz kazanır (Güncelleme bekleniyor)." }
            );
            await i.reply({ embeds: [e] });
        }
        else if (sub === "statement") {
            const txs = await DB.getCollection(i.user.id, "transactions");
            if (!txs.length) throw new Error("Henüz hiçbir işleminiz bulunmuyor.");
            txs.sort((a,b) => b.timestamp - a.timestamp);
            const lines = txs.slice(0, 10).map(t => {
                const dt = new Date(t.timestamp * 1000).toLocaleString("tr-TR");
                return `\`[${dt}]\` **${t.type.toUpperCase()}** - ${fmt(t.amount)}`;
            }).join("\n");
            await i.reply({ embeds: [embedBase(THEME.finance).setTitle("📄 Son 10 İşlem").setDescription(lines)] });
        }
    },
    loan: async (i) => {
        const sub = i.options.getSubcommand();
        if (sub === "take") {
            const loan = await takeLoan(i.user.id, i.options.getString("miktar"));
            await i.reply({ embeds: [embedBase(THEME.success).setDescription(`💳 Kredi onaylandı!\n\n**Çekilen:** ${fmt(loan.amount)}\n**Toplam Geri Ödenecek:** ${fmt(loan.total_due)}\n**ID:** \`${loan.id}\``)] });
        } else if (sub === "repay") {
            const r = await repayLoan(i.user.id, i.options.getString("id"), i.options.getString("miktar"));
            await i.reply({ embeds: [embedBase(THEME.success).setDescription(`💳 Kredi ödemesi alındı!\n\n**Ödenen:** ${fmt(r.paid)}\n**Kalan Borç:** ${fmt(r.left)}\n${r.cleared ? '✅ **Borç Kapandı!** (Kredi Puanı arttı)' : ''}`)] });
        } else if (sub === "list") {
            const loans = await DB.getLoans(i.user.id);
            if (!loans.length) throw new Error("Aktif kredin bulunmuyor.");
            const e = embedBase(THEME.finance).setTitle("💳 Aktif Krediler");
            for(let l of loans) e.addFields({name: `ID: ${l.id}`, value: `**Borç:** ${fmt(l.total_due)}\n**Alınma:** <t:${l.taken_at}:d>`, inline: false});
            await i.reply({ embeds: [e] });
        }
    },
    investment: async (i) => {
        const sub = i.options.getSubcommand();
        if (sub === "create") {
            const inv = await createInvestment(i.user.id, i.options.getString("miktar"), i.options.getString("gun"));
            await i.reply({ embeds: [embedBase(THEME.success).setDescription(`📈 Yatırım oluşturuldu!\n\n**Yatırılan:** ${fmt(inv.amount)}\n**Vade Sonu Getiri:** ${fmt(inv.return_amount)}\n**Kilit Açılma:** <t:${inv.unlocks_at}:f>\n**ID:** \`${inv.id}\``)] });
        } else if (sub === "claim") {
            const r = await claimInvestment(i.user.id, i.options.getString("id"), false);
            await i.reply({ embeds: [embedBase(THEME.success).setDescription(`📈 Yatırım vadesi doldu ve çekildi!\n\n**Kazanılan:** ${fmt(r.payout)}`)] });
        } else if (sub === "break") {
            const r = await claimInvestment(i.user.id, i.options.getString("id"), true);
            await i.reply({ embeds: [embedBase(THEME.error).setDescription(`⚠️ Yatırım erken bozuldu (Cezalı)!\n\n**Kurtarılan:** ${fmt(r.payout)}\n*Kredi Puanın düştü.*`)] });
        } else if (sub === "list") {
            const invs = await DB.getInvestments(i.user.id);
            if (!invs.length) throw new Error("Aktif yatırımın bulunmuyor.");
            const e = embedBase(THEME.finance).setTitle("📈 Aktif Yatırımlar");
            for(let inv of invs) e.addFields({name: `ID: ${inv.id}`, value: `**Yatırılan:** ${fmt(inv.amount)} ➔ **Getiri:** ${fmt(inv.return_amount)}\n**Açılış:** <t:${inv.unlocks_at}:R>`, inline: false});
            await i.reply({ embeds: [e] });
        }
    },
    cooldowns: async (i) => {
        const lines = [];
        for (const k of Object.keys(COOLDOWNS)) {
            const left = await checkCooldownLeft(i.user.id, k);
            lines.push(`**${k.toUpperCase()}**: ${left > 0 ? msToHuman(left) : "✅ Hazır"}`);
        }
        await i.reply({ flags: MessageFlags.Ephemeral, embeds: [embedBase().setTitle("⏱️ Bekleme Süreleri").setDescription(lines.join("\n"))] });
    },
    profile: async (i) => {
        if (i.options.getSubcommand() === "setbio") {
            await DB.acquireLock(i.user.id);
            try {
                const u = await DB.getUser(i.user.id); u.bio = i.options.getString("metin").slice(0, 180); await DB.saveUser(i.user.id, u);
                await i.reply({ embeds: [embedBase(THEME.success).setDescription("✅ Biyografi güncellendi.")] });
            } finally { DB.releaseLock(i.user.id); }
        } else {
            const target = i.options.getUser("kullanici") || i.user;
            const u = await DB.getUser(target.id);
            const e = embedBase().setTitle(`👤 Profil — ${target.username}`).setThumbnail(target.displayAvatarURL())
                .setDescription(u.bio ? `*"${u.bio}"*` : "*Biyografi ayarlanmamış.*")
                .addFields(
                    { name: "⭐ Seviye", value: `Level **${u.level}**`, inline: true },
                    { name: "✨ XP", value: `${u.xp} / ${u.level*500}`, inline: true },
                    { name: "💰 Net Değer", value: fmt(await getNetworth(target.id)), inline: true },
                    { name: "💳 Kredi Puanı", value: `${u.credit_score}`, inline: true },
                    { name: "🔥 Günlük Seri", value: `${u.daily_streak} Gün`, inline: true }
                );
            await i.reply({ embeds: [e] });
        }
    },
    stats: async (i) => {
        const target = i.options.getUser("kullanici") || i.user;
        const u = await DB.getUser(target.id); const s = u.stats;
        const e = embedBase().setTitle(`📈 İstatistikler — ${target.username}`)
            .addFields(
                { name: "💸 Toplam Kazanılan", value: fmt(s.total_earned), inline: true },
                { name: "📉 Toplam Kaybedilen", value: fmt(s.total_lost), inline: true },
                { name: "🧰 Kasa & Eşya", value: `Kasa: ${s.crates_opened} | Eşya: ${s.items_sold}`, inline: true },
                { name: "🛠️ Meslekler", value: `İş: ${s.work_uses} | Dilenci: ${s.beg_uses}`, inline: true },
                { name: "🚨 Suç & Soygun", value: `Suç Başarı: ${s.crime_success} | Soygun: ${s.rob_success}`, inline: true },
                { name: "🎰 Kumar Oyunları", value: `Slot: ${s.slots_plays} | CF: ${s.coinflip_plays}`, inline: true },
                { name: "🔥 En Büyük Tek Kazanç", value: fmt(s.largest_win), inline: true },
                { name: "💀 En Büyük Tek Kayıp", value: fmt(s.largest_loss), inline: true }
            );
        await i.reply({ embeds: [e] });
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
        await i.reply({ embeds: [embedBase().setTitle(`🏆 Top 10 — ${type.toUpperCase()}`).setDescription(lines)] });
    },
    top: async (i) => {
        const sub = i.options.getSubcommand();
        const all = await DB.getAllUsers();
        let arr = [];
        if (sub === "crates") arr = all.map(u => ({id: u.user_id, val: u.stats.crates_opened || 0}));
        if (sub === "gamblers") arr = all.map(u => ({id: u.user_id, val: (u.stats.slots_plays||0) + (u.stats.coinflip_plays||0)}));
        if (sub === "richest") arr = await Promise.all(all.map(async u => ({ id: u.user_id, val: await getNetworth(u.user_id) })));
        if (sub === "level") arr = all.map(u => ({id: u.user_id, val: u.level || 1}));
        
        arr.sort((a,b) => b.val - a.val);
        const lines = arr.slice(0, 10).map((r, idx) => `**${idx + 1}.** <@${r.id}> — ${sub === "richest" ? fmt(r.val) : r.val}`).join("\n") || "Kayıt yok.";
        await i.reply({ embeds: [embedBase().setTitle(`🏆 Top 10 — ${sub.toUpperCase()}`).setDescription(lines)] });
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
        await i.reply({ embeds: [embedBase().setTitle(`📊 Sıralaman`).addFields(
            { name: "Cüzdan Sırası", value: await getRank("wallet"), inline: true },
            { name: "Banka Sırası", value: await getRank("bank"), inline: true },
            { name: "Networth Sırası", value: await getRank("networth"), inline: true }
        )]});
    }
};

// ============================================================================
// 13. CLIENT & EXPRESS BOOTSTRAP
// ============================================================================
const client = new Client({ intents: [GatewayIntentBits.Guilds] });
const app = express();

app.get("/", (_req, res) => res.status(200).send(`MetaCoin REBORN v${VERSION} - SYSTEM ONLINE`));
app.listen(PORT, () => log(`Express Endpoint Aktif: ${PORT}`));

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

client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isChatInputCommand()) return;
    const handler = handlers[interaction.commandName];
    if (!handler) return;

    try {
        await handler(interaction);
    } catch (err) {
        const isCustom = err.message && !err.message.includes("DiscordAPI");
        const msg = isCustom ? `❌ ${err.message}` : "❌ Beklenmeyen bir sunucu hatası oluştu.";
        if (!isCustom) errorLog(`Command Error (${interaction.commandName})`, err);
        
        try {
            if (interaction.deferred || interaction.replied) await interaction.followUp({ flags: MessageFlags.Ephemeral, embeds: [embedBase(THEME.error).setDescription(msg)] });
            else await interaction.reply({ flags: MessageFlags.Ephemeral, embeds: [embedBase(THEME.error).setDescription(msg)] });
        } catch (e) { /* Ignore double fail */ }
    }
});

// Güvenli Kapanış
process.on("SIGTERM", async () => { log("SIGTERM alındı, JSON save tetikleniyor."); if (DATA_PROVIDER === "json") await JsonImpl.save(true); process.exit(0); });
process.on("SIGINT", async () => { log("SIGINT alındı."); if (DATA_PROVIDER === "json") await JsonImpl.save(true); process.exit(0); });
process.on("uncaughtException", (err) => errorLog("Uncaught Exception", err));
process.on("unhandledRejection", (err) => errorLog("Unhandled Rejection", err));

client.login(DISCORD_TOKEN);