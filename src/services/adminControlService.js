// Admin Kontrol Merkezi iş mantığı servisi.
// Tüm DB mutasyonları transaction içinde yapılır ve admin_logs'a yazılır.
// Bu servis doğrudan kullanıcı komutları tarafından çağrılmaz; sadece /admin kullanır.

const { pool }           = require('../database/pool');
const { withTx }         = require('../database/tx');
const { ensureUser }     = require('../database/users');
const { addMoney, removeMoney } = require('../database/money');
const {
    checkItem, addItem, safeConsumeItem, getInventory
} = require('../database/inventory');
const { getLoanSummary, getActiveLoans } = require('../database/loans');
const {
    getCurrentSeason, getUserSeasonData, getUserSeasonRank, calculateSeasonLevel
} = require('./seasonService');
const {
    getDailyTasks, getWeeklyTasks, getUserAchievements
} = require('./progressionService');
const { calculateFillPct, BANK_LEVELS } = require('./bankService');
const {
    isCrateItem, isRareItem, getRareItemByCode, getCrateByCode
} = require('./crateService');
const { SHOP_ITEMS, COOLDOWNS } = require('../utils/constants');
const { INTEREST_INTERVAL_MS } = require('./bankService');
const { getNumberSetting, setSetting, resetSetting, listSettings } = require('./settingsService');
const {
    getRuntimeCooldown,
    clearRuntimeCooldown,
    clearAllRuntimeCooldowns,
    setRuntimeCooldownRemaining,
    getRuntimeCooldownStatus,
} = require('./runtimeCooldownService');
const { logAdminAction } = require('./adminLogService');

// ==================[ YARDIMCI ]==================

function isValidItemCode(code) {
    const lower = (code || '').toLowerCase();
    return SHOP_ITEMS.some(i => i.id === lower) || isCrateItem(lower) || isRareItem(lower);
}

function getItemDisplayName(code) {
    const lower = (code || '').toLowerCase();
    const shopItem = SHOP_ITEMS.find(i => i.id === lower);
    if (shopItem) return shopItem.name;
    const crateItem = getCrateByCode(lower); // siber_kasa → Nexus Kasa otomatik
    if (crateItem) return crateItem.name;
    const rareItem = getRareItemByCode(lower);
    if (rareItem) return rareItem.name;
    return code;
}

// ==================[ İNCELEME ]==================

async function getAdminUserOverview(userId) {
    const [
        userData, loanSummary, activeLoans,
        seasonData, seasonRank,
        dailyTasks, weeklyTasks, achievements,
        inventory
    ] = await Promise.all([
        ensureUser(userId),
        getLoanSummary(userId).catch(() => ({ activeCount: 0, overdueCount: 0, activeDebt: 0 })),
        getActiveLoans(userId).catch(() => []),
        getUserSeasonData(userId).catch(() => ({ season: null, user: null })),
        getUserSeasonRank(userId).catch(() => null),
        getDailyTasks(userId).catch(() => []),
        getWeeklyTasks(userId).catch(() => []),
        getUserAchievements(userId).catch(() => []),
        getInventory(userId).catch(() => [])
    ]);

    const wallet      = Number(userData.wallet);
    const bank        = Number(userData.bank);
    const totalWealth = wallet + bank;
    const bankLimit   = Number(userData.bank_limit) || BANK_LEVELS[0].limit;
    const bankLevel   = userData.bank_level || 1;
    const fillPct     = calculateFillPct(bank, bankLimit);
    const creditScore = Number(userData.credit_score) || 500;

    const sUser   = seasonData.user;
    const sPoints = sUser ? Number(sUser.points)       : 0;
    const sLevel  = sUser ? Number(sUser.season_level)  : 1;

    const dailyDone  = dailyTasks.filter(t => t.completed).length;
    const weeklyDone = weeklyTasks.filter(t => t.completed).length;
    const unlockedAch = achievements.filter(a => a.unlocked).length;

    const crateRows  = inventory.filter(r => isCrateItem(r.item_id));
    const crateTotal = crateRows.reduce((s, r) => s + r.quantity, 0);
    const colRows    = inventory.filter(r => isRareItem(r.item_id));
    const colTotal   = colRows.reduce((s, r) => s + r.quantity, 0);
    const colValue   = colRows.reduce((s, r) => {
        const def = getRareItemByCode(r.item_id);
        return s + (def ? def.sellValue * r.quantity : 0);
    }, 0);

    const PRESTIGE_IDS = ['vip_badge', 'profil_cercevesi', 'kara_kart'];
    const prestigeOwned = PRESTIGE_IDS.filter(id =>
        inventory.some(r => r.item_id === id && r.quantity > 0)
    );

    const suspicious = [];
    if (totalWealth > 50_000_000) suspicious.push('⚠️ Çok yüksek servet (50M+)');
    if (loanSummary.overdueCount > 0) suspicious.push(`⚠️ ${loanSummary.overdueCount} gecikmiş kredi`);
    if (crateTotal > 100) suspicious.push(`⚠️ Yüksek kasa sayısı (${crateTotal})`);
    if (bank > bankLimit) suspicious.push('⚠️ Banka bakiyesi kapasiteyi aşıyor');

    return {
        userData, wallet, bank, totalWealth, bankLimit, bankLevel, fillPct, creditScore,
        loanSummary, activeLoans,
        sPoints, sLevel, sRank: seasonRank, activeSeason: seasonData.season,
        dailyDone, weeklyDone, dailyTotal: dailyTasks.length, weeklyTotal: weeklyTasks.length,
        unlockedAch, totalAch: achievements.length,
        crateTotal, colTotal, colValue, prestigeOwned,
        suspicious
    };
}

async function getAdminInventoryOverview(userId) {
    const inventory = await getInventory(userId);
    return inventory.map(row => {
        const code    = row.item_id;
        const name    = getItemDisplayName(code);
        const type    = isCrateItem(code) ? 'kasa' : isRareItem(code) ? 'koleksiyon' : 'esya';
        return { code, name, quantity: row.quantity, type };
    }).sort((a, b) => a.type.localeCompare(b.type));
}

async function getAdminCreditOverview(userId) {
    const [loanSummary, activeLoans, userData] = await Promise.all([
        getLoanSummary(userId),
        getActiveLoans(userId).catch(() => []),
        ensureUser(userId)
    ]);
    return {
        creditScore: Number(userData.credit_score) || 500,
        loanSummary,
        activeLoans
    };
}

async function getAdminSeasonOverview(userId) {
    const [seasonData, seasonRank] = await Promise.all([
        getUserSeasonData(userId).catch(() => ({ season: null, user: null })),
        getUserSeasonRank(userId).catch(() => null)
    ]);
    const sUser   = seasonData.user;
    const sPoints = sUser ? Number(sUser.points)       : 0;
    const sLevel  = sUser ? Number(sUser.season_level)  : 1;
    return {
        activeSeason: seasonData.season,
        sPoints, sLevel, sRank: seasonRank
    };
}

// ==================[ PARA MUTASYONU ]==================

async function adminMoneyOperation({ userId, field, mode, amount, actorId, reason }) {
    if (!['wallet', 'bank'].includes(field)) throw new Error('Geçersiz alan.');
    if (!['add', 'remove', 'set'].includes(mode)) throw new Error('Geçersiz mod.');

    const userData    = await ensureUser(userId);
    const current     = field === 'bank' ? Number(userData.bank) : Number(userData.wallet);
    const bankLimit   = Number(userData.bank_limit) || BANK_LEVELS[0].limit;

    let newValue;
    if (mode === 'add')    newValue = current + amount;
    else if (mode === 'remove') newValue = current - amount;
    else                   newValue = amount;

    if (newValue < 0) {
        return { ok: false, reason: 'İşlem sonucu negatif değere yol açar.' };
    }
    if (mode === 'remove' && current < amount) {
        return { ok: false, reason: `Yetersiz bakiye. Mevcut: ${current}` };
    }
    if (field === 'bank' && newValue > bankLimit) {
        return { ok: false, reason: `Banka kapasitesi aşılıyor. Limit: ${bankLimit}, İstenen: ${newValue}` };
    }

    await withTx(async (db) => {
        if (mode === 'add') {
            await addMoney(userId, amount, field, db);
        } else if (mode === 'remove') {
            await removeMoney(userId, amount, field, db);
        } else {
            // set — field validated as 'wallet' or 'bank', no injection risk
            await db.query(
                `UPDATE economy_users SET ${field} = $1 WHERE user_id = $2`,
                [newValue, userId]
            );
        }
    });

    await logAdminAction({
        action:        `admin.money.${mode}`,
        category:      'money',
        actorId,
        targetUserId:  userId,
        oldValue:      String(current),
        newValue:      String(newValue),
        reason,
        metadata:      { field, mode, amount, oldValue: current, newValue }
    }).catch(err => console.error('adminMoneyOperation log hatası:', err?.message));

    return { ok: true, field, mode, oldValue: current, newValue, amount };
}

// ==================[ ENVANTER MUTASYONU ]==================

async function adminInventoryOperation({ userId, itemCode, mode, quantity, actorId, reason }) {
    const lower = (itemCode || '').toLowerCase();
    if (!isValidItemCode(lower)) {
        return { ok: false, reason: `Geçersiz eşya kodu: "${itemCode}"` };
    }

    const currentQty = await checkItem(userId, lower);

    if (mode === 'remove' && currentQty < quantity) {
        return { ok: false, reason: `Yetersiz eşya. Mevcut: ${currentQty}, Silinecek: ${quantity}` };
    }

    let newQty;
    if (mode === 'add')    newQty = currentQty + quantity;
    else if (mode === 'remove') newQty = currentQty - quantity;
    else                   newQty = quantity;

    if (newQty < 0) {
        return { ok: false, reason: 'İşlem sonucu negatif miktara yol açar.' };
    }

    await withTx(async (db) => {
        if (mode === 'add') {
            await addItem(userId, lower, quantity, db);
        } else if (mode === 'remove') {
            const ok = await safeConsumeItem(userId, lower, quantity, db);
            if (!ok) throw new Error('Eşya silinemedi: yeterli miktar yok.');
        } else { // set
            if (quantity === 0) {
                await db.query(
                    'DELETE FROM economy_inventory WHERE user_id = $1 AND item_id = $2',
                    [userId, lower]
                );
            } else {
                await db.query(`
                    INSERT INTO economy_inventory (user_id, item_id, quantity)
                    VALUES ($1, $2, $3)
                    ON CONFLICT (user_id, item_id) DO UPDATE SET quantity = $3
                `, [userId, lower, quantity]);
            }
        }
    });

    await logAdminAction({
        action:       `admin.inventory.${mode}`,
        category:     'inventory',
        actorId,
        targetUserId: userId,
        targetKey:    lower,
        oldValue:     String(currentQty),
        newValue:     String(newQty),
        reason,
        metadata:     { itemCode: lower, mode, quantity, oldQuantity: currentQty, newQuantity: newQty }
    }).catch(err => console.error('adminInventoryOperation log hatası:', err?.message));

    return { ok: true, itemCode: lower, displayName: getItemDisplayName(lower), mode, oldQty: currentQty, newQty, quantity };
}

// ==================[ SEZON PUAN MUTASYONU ]==================

async function adminSeasonPointsOperation({ userId, amount, mode, actorId, reason }) {
    const seasonData = await getUserSeasonData(userId);
    if (!seasonData.season) {
        return { ok: false, reason: 'Aktif sezon bulunamadı. Sezon puanı işlemi yapılamaz.' };
    }

    const season  = seasonData.season;
    const sUser   = seasonData.user;
    const currentPoints = sUser ? Number(sUser.points) : 0;

    const newPoints = mode === 'add'
        ? currentPoints + amount
        : Math.max(0, currentPoints - amount);

    const newLevel = calculateSeasonLevel(newPoints);

    await pool.query(`
        INSERT INTO economy_season_users (season_id, user_id, points, season_level)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (season_id, user_id) DO UPDATE
            SET points       = $3,
                season_level = $4,
                last_updated = NOW()
    `, [season.id, userId, newPoints, newLevel]);

    await logAdminAction({
        action:       `admin.season.points_${mode}`,
        category:     'season',
        actorId,
        targetUserId: userId,
        oldValue:     String(currentPoints),
        newValue:     String(newPoints),
        reason,
        metadata:     { seasonId: season.id, amount, mode, oldPoints: currentPoints, newPoints }
    }).catch(err => console.error('adminSeasonPointsOperation log hatası:', err?.message));

    return { ok: true, mode, oldPoints: currentPoints, newPoints, amount, seasonId: season.id };
}

// ==================[ COOLDOWN KOMUT HARİTASI ]==================

// userField kesinlikle bu set'ten gelmeli — SQL injection koruması.
const ALLOWED_USER_FIELDS = new Set([
    'last_daily', 'last_weekly', 'last_monthly',
    'last_work', 'last_beg', 'last_crime', 'last_rob', 'last_interest'
]);

const COOLDOWN_COMMANDS = {
    gunluk:   { code: 'gunluk',   displayName: 'Günlük',   settingKey: 'cooldown.daily',       defaultMs: COOLDOWNS.DAILY,       storageType: 'db',      userField: 'last_daily'    },
    haftalik: { code: 'haftalik', displayName: 'Haftalık',  settingKey: 'cooldown.weekly',      defaultMs: COOLDOWNS.WEEKLY,      storageType: 'db',      userField: 'last_weekly'   },
    aylik:    { code: 'aylik',    displayName: 'Aylık',     settingKey: 'cooldown.monthly',     defaultMs: COOLDOWNS.MONTHLY,     storageType: 'db',      userField: 'last_monthly'  },
    calis:    { code: 'calis',    displayName: 'Çalış',     settingKey: 'cooldown.work',        defaultMs: COOLDOWNS.WORK,        storageType: 'db',      userField: 'last_work'     },
    dilen:    { code: 'dilen',    displayName: 'Dilen',     settingKey: 'cooldown.beg',         defaultMs: COOLDOWNS.BEG,         storageType: 'db',      userField: 'last_beg'      },
    suc:      { code: 'suc',      displayName: 'Suç',       settingKey: 'cooldown.crime',       defaultMs: COOLDOWNS.CRIME,       storageType: 'db',      userField: 'last_crime'    },
    soy:      { code: 'soy',      displayName: 'Soy',       settingKey: 'cooldown.rob',         defaultMs: COOLDOWNS.ROB,         storageType: 'db',      userField: 'last_rob'      },
    faiz:     { code: 'faiz',     displayName: 'Faiz',      settingKey: 'cooldown.interest',    defaultMs: INTEREST_INTERVAL_MS,  storageType: 'db',      userField: 'last_interest' },
    kumar:    { code: 'kumar',    displayName: 'Kumar',     settingKey: 'cooldown.gamble_spam', defaultMs: COOLDOWNS.GAMBLE_SPAM, storageType: 'runtime', userField: null            },
    yazitura: { code: 'yazitura', displayName: 'Yazı-Tura', settingKey: 'cooldown.gamble_spam', defaultMs: COOLDOWNS.GAMBLE_SPAM, storageType: 'runtime', userField: null            },
    slot:     { code: 'slot',     displayName: 'Slot',      settingKey: 'cooldown.gamble_spam', defaultMs: COOLDOWNS.GAMBLE_SPAM, storageType: 'runtime', userField: null            },
};

const MAX_USER_COOLDOWN_MS = 7 * 24 * 3600 * 1000;  // 7 gün
const MAX_GLOBAL_COOLDOWN_S = 30 * 24 * 3600;        // 30 gün (saniye)

// ==================[ COOLDOWN YARDIMCI ]==================

async function _getEffectiveCooldown(cmd) {
    return getNumberSetting(cmd.settingKey, cmd.defaultMs).catch(() => cmd.defaultMs);
}

function _computeLeftMs(lastTs, effectiveCooldownMs) {
    const now = Date.now();
    const lastMs = lastTs ? new Date(lastTs).getTime() : 0;
    const elapsed = now - lastMs;
    return elapsed < effectiveCooldownMs ? effectiveCooldownMs - elapsed : 0;
}

// DB'de last_* alanını güvenli şekilde günceller.
// newLastMs: null → NULL (hazır), number → ilgili timestamp
async function _setLastField(userId, field, newLastMs, db) {
    if (!ALLOWED_USER_FIELDS.has(field)) throw new Error('Geçersiz cooldown alanı.');
    if (newLastMs === null) {
        // Field adı whitelist'ten geldiği için template literal güvenlidir.
        await db.query(`UPDATE economy_users SET ${field} = NULL WHERE user_id = $1`, [userId]);
    } else {
        await db.query(
            `UPDATE economy_users SET ${field} = to_timestamp($1 / 1000.0) WHERE user_id = $2`,
            [Math.floor(newLastMs), userId]
        );
    }
}

// targetMs'yi DB timestamp'ine çevir ve güncelle.
async function _applyDbCooldown(userId, cmd, effectiveCooldownMs, targetMs) {
    const clamped = Math.max(0, Math.min(targetMs, MAX_USER_COOLDOWN_MS));
    const newLastMs = clamped === 0 ? null : (Date.now() - effectiveCooldownMs + clamped);
    await withTx(async (db) => {
        await _setLastField(userId, cmd.userField, newLastMs, db);
    });
    return clamped;
}

// ==================[ COOLDOWN OKUMA ]==================

async function getAdminCooldownOverview(userId) {
    const dbCmds = Object.values(COOLDOWN_COMMANDS).filter(c => c.storageType === 'db');

    // Paralel: kullanıcı verisi + tüm DB cooldown ayarları
    const [userData, ...effectiveMs] = await Promise.all([
        ensureUser(userId),
        ...dbCmds.map(cmd => _getEffectiveCooldown(cmd))
    ]);

    // Gamble spam ayarı (kumar/yazitura/slot için ortak)
    const gambleMs = await _getEffectiveCooldown(COOLDOWN_COMMANDS.kumar);

    const dbStatus = dbCmds.map((cmd, i) => {
        const eff = effectiveMs[i];
        const leftMs = _computeLeftMs(userData[cmd.userField], eff);
        return {
            commandCode:       cmd.code,
            displayName:       cmd.displayName,
            leftMs,
            effectiveCooldownMs: eff,
            defaultMs:         cmd.defaultMs,
            lastTimestamp:     userData[cmd.userField] || null,
            ready:             leftMs === 0,
        };
    });

    const runtimeStatus = getRuntimeCooldownStatus(userId).map(rs => ({
        ...rs,
        displayName:         COOLDOWN_COMMANDS[rs.commandCode].displayName,
        effectiveCooldownMs: gambleMs,
        defaultMs:           COOLDOWNS.GAMBLE_SPAM,
    }));

    return { dbStatus, runtimeStatus };
}

async function getGlobalCooldownSettings() {
    // Tüm cooldown kategorisindeki ayarları oku
    const rows = await listSettings('cooldown').catch(() => []);
    return Object.values(COOLDOWN_COMMANDS).map(cmd => {
        const row = rows.find(r => r.key === cmd.settingKey);
        const currentMs = row ? Number(row.value) : cmd.defaultMs;
        return {
            commandCode: cmd.code,
            displayName: cmd.displayName,
            settingKey:  cmd.settingKey,
            currentMs,
            defaultMs:   cmd.defaultMs,
            currentS:    Math.round(currentMs / 1000),
            defaultS:    Math.round(cmd.defaultMs / 1000),
        };
    });
}

// ==================[ KULLANICI BAZLI COOLDOWN MUTASYONU ]==================

async function resetUserCooldown({ userId, commandCode, actorId, reason }) {
    const cmd = COOLDOWN_COMMANDS[commandCode];
    if (!cmd) return { ok: false, reason: `Bilinmeyen komut: "${commandCode}"` };

    if (cmd.storageType === 'runtime') {
        const oldLeftMs = getRuntimeCooldown(commandCode, userId);
        clearRuntimeCooldown(commandCode, userId);
        await logAdminAction({
            action: 'admin.cooldown.reset', category: 'cooldown',
            actorId, targetUserId: userId, targetKey: commandCode,
            oldValue: String(Math.ceil(oldLeftMs / 1000)) + 's', newValue: '0s', reason,
            metadata: { commandCode, settingKey: cmd.settingKey, oldRemainingMs: oldLeftMs, newRemainingMs: 0 },
        }).catch(e => console.error('resetUserCooldown log hatası:', e?.message));
        return { ok: true, oldLeftMs, newLeftMs: 0 };
    }

    // DB storage
    const userData = await ensureUser(userId);
    const eff = await _getEffectiveCooldown(cmd);
    const oldLeftMs = _computeLeftMs(userData[cmd.userField], eff);
    await _applyDbCooldown(userId, cmd, eff, 0);

    await logAdminAction({
        action: 'admin.cooldown.reset', category: 'cooldown',
        actorId, targetUserId: userId, targetKey: commandCode,
        oldValue: String(Math.ceil(oldLeftMs / 1000)) + 's', newValue: '0s', reason,
        metadata: { commandCode, settingKey: cmd.settingKey, oldRemainingMs: oldLeftMs, newRemainingMs: 0 },
    }).catch(e => console.error('resetUserCooldown log hatası:', e?.message));

    return { ok: true, oldLeftMs, newLeftMs: 0 };
}

async function resetAllUserCooldowns({ userId, actorId, reason }) {
    const allCodes = Object.keys(COOLDOWN_COMMANDS);
    const results = {};

    // Runtime cooldownları sıfırla
    clearAllRuntimeCooldowns(userId);
    for (const code of ['kumar', 'yazitura', 'slot']) results[code] = 0;

    // DB cooldownları sıfırla
    const userData = await ensureUser(userId);
    const dbCmds = Object.values(COOLDOWN_COMMANDS).filter(c => c.storageType === 'db');
    const effectiveMs = await Promise.all(dbCmds.map(cmd => _getEffectiveCooldown(cmd)));

    await withTx(async (db) => {
        for (const cmd of dbCmds) {
            await _setLastField(userId, cmd.userField, null, db);
        }
    });

    dbCmds.forEach((cmd, i) => {
        results[cmd.code] = _computeLeftMs(userData[cmd.userField], effectiveMs[i]);
    });

    await logAdminAction({
        action: 'admin.cooldown.reset_all', category: 'cooldown',
        actorId, targetUserId: userId,
        oldValue: JSON.stringify(
            Object.fromEntries(dbCmds.map((cmd, i) => [cmd.code, Math.ceil(_computeLeftMs(userData[cmd.userField], effectiveMs[i]) / 1000)]))
        ),
        newValue: '0s (tümü)',
        reason,
        metadata: { commandCodes: allCodes, resetAt: new Date().toISOString() },
    }).catch(e => console.error('resetAllUserCooldowns log hatası:', e?.message));

    return { ok: true, results };
}

async function reduceUserCooldown({ userId, commandCode, seconds, actorId, reason }) {
    const cmd = COOLDOWN_COMMANDS[commandCode];
    if (!cmd) return { ok: false, reason: `Bilinmeyen komut: "${commandCode}"` };
    if (!seconds || seconds < 1) return { ok: false, reason: 'Süre en az 1 saniye olmalı.' };

    if (cmd.storageType === 'runtime') {
        const oldLeftMs = getRuntimeCooldown(commandCode, userId);
        const newLeftMs = Math.max(0, oldLeftMs - seconds * 1000);
        setRuntimeCooldownRemaining(commandCode, userId, newLeftMs);
        await logAdminAction({
            action: 'admin.cooldown.reduce', category: 'cooldown',
            actorId, targetUserId: userId, targetKey: commandCode,
            oldValue: String(Math.ceil(oldLeftMs / 1000)) + 's',
            newValue: String(Math.ceil(newLeftMs / 1000)) + 's',
            reason,
            metadata: { commandCode, settingKey: cmd.settingKey, seconds, oldRemainingMs: oldLeftMs, newRemainingMs: newLeftMs },
        }).catch(e => console.error('reduceUserCooldown log hatası:', e?.message));
        return { ok: true, oldLeftMs, newLeftMs };
    }

    const userData = await ensureUser(userId);
    const eff = await _getEffectiveCooldown(cmd);
    const oldLeftMs = _computeLeftMs(userData[cmd.userField], eff);
    const newLeftMs = Math.max(0, oldLeftMs - seconds * 1000);
    await _applyDbCooldown(userId, cmd, eff, newLeftMs);

    await logAdminAction({
        action: 'admin.cooldown.reduce', category: 'cooldown',
        actorId, targetUserId: userId, targetKey: commandCode,
        oldValue: String(Math.ceil(oldLeftMs / 1000)) + 's',
        newValue: String(Math.ceil(newLeftMs / 1000)) + 's',
        reason,
        metadata: { commandCode, settingKey: cmd.settingKey, seconds, oldRemainingMs: oldLeftMs, newRemainingMs: newLeftMs },
    }).catch(e => console.error('reduceUserCooldown log hatası:', e?.message));

    return { ok: true, oldLeftMs, newLeftMs };
}

async function extendUserCooldown({ userId, commandCode, seconds, actorId, reason }) {
    const cmd = COOLDOWN_COMMANDS[commandCode];
    if (!cmd) return { ok: false, reason: `Bilinmeyen komut: "${commandCode}"` };
    if (!seconds || seconds < 1) return { ok: false, reason: 'Süre en az 1 saniye olmalı.' };

    if (cmd.storageType === 'runtime') {
        const oldLeftMs = getRuntimeCooldown(commandCode, userId);
        const newLeftMs = Math.min(oldLeftMs + seconds * 1000, MAX_USER_COOLDOWN_MS);
        setRuntimeCooldownRemaining(commandCode, userId, newLeftMs);
        await logAdminAction({
            action: 'admin.cooldown.extend', category: 'cooldown',
            actorId, targetUserId: userId, targetKey: commandCode,
            oldValue: String(Math.ceil(oldLeftMs / 1000)) + 's',
            newValue: String(Math.ceil(newLeftMs / 1000)) + 's',
            reason,
            metadata: { commandCode, settingKey: cmd.settingKey, seconds, oldRemainingMs: oldLeftMs, newRemainingMs: newLeftMs },
        }).catch(e => console.error('extendUserCooldown log hatası:', e?.message));
        return { ok: true, oldLeftMs, newLeftMs };
    }

    const userData = await ensureUser(userId);
    const eff = await _getEffectiveCooldown(cmd);
    const oldLeftMs = _computeLeftMs(userData[cmd.userField], eff);
    const newLeftMs = Math.min(oldLeftMs + seconds * 1000, MAX_USER_COOLDOWN_MS);
    await _applyDbCooldown(userId, cmd, eff, newLeftMs);

    await logAdminAction({
        action: 'admin.cooldown.extend', category: 'cooldown',
        actorId, targetUserId: userId, targetKey: commandCode,
        oldValue: String(Math.ceil(oldLeftMs / 1000)) + 's',
        newValue: String(Math.ceil(newLeftMs / 1000)) + 's',
        reason,
        metadata: { commandCode, settingKey: cmd.settingKey, seconds, oldRemainingMs: oldLeftMs, newRemainingMs: newLeftMs },
    }).catch(e => console.error('extendUserCooldown log hatası:', e?.message));

    return { ok: true, oldLeftMs, newLeftMs };
}

async function setUserCooldownRemaining({ userId, commandCode, seconds, actorId, reason }) {
    const cmd = COOLDOWN_COMMANDS[commandCode];
    if (!cmd) return { ok: false, reason: `Bilinmeyen komut: "${commandCode}"` };
    if (seconds < 0) return { ok: false, reason: 'Süre negatif olamaz.' };

    const targetMs = Math.min(seconds * 1000, MAX_USER_COOLDOWN_MS);

    if (cmd.storageType === 'runtime') {
        const oldLeftMs = getRuntimeCooldown(commandCode, userId);
        setRuntimeCooldownRemaining(commandCode, userId, targetMs);
        await logAdminAction({
            action: 'admin.cooldown.set', category: 'cooldown',
            actorId, targetUserId: userId, targetKey: commandCode,
            oldValue: String(Math.ceil(oldLeftMs / 1000)) + 's',
            newValue: String(seconds) + 's',
            reason,
            metadata: { commandCode, settingKey: cmd.settingKey, seconds, oldRemainingMs: oldLeftMs, newRemainingMs: targetMs },
        }).catch(e => console.error('setUserCooldownRemaining log hatası:', e?.message));
        return { ok: true, oldLeftMs, newLeftMs: targetMs };
    }

    const userData = await ensureUser(userId);
    const eff = await _getEffectiveCooldown(cmd);
    const oldLeftMs = _computeLeftMs(userData[cmd.userField], eff);
    await _applyDbCooldown(userId, cmd, eff, targetMs);

    await logAdminAction({
        action: 'admin.cooldown.set', category: 'cooldown',
        actorId, targetUserId: userId, targetKey: commandCode,
        oldValue: String(Math.ceil(oldLeftMs / 1000)) + 's',
        newValue: String(seconds) + 's',
        reason,
        metadata: { commandCode, settingKey: cmd.settingKey, seconds, oldRemainingMs: oldLeftMs, newRemainingMs: targetMs },
    }).catch(e => console.error('setUserCooldownRemaining log hatası:', e?.message));

    return { ok: true, oldLeftMs, newLeftMs: targetMs };
}

// ==================[ GLOBAL COOLDOWN YÖNETİMİ ]==================

// settingsService.setSetting kendi admin_logs kaydını 'settings' kategorisinde yazıyor.
// Ayrıca admin.cooldown.global_set logu yazılmıyor — çift kayıt önleme.
async function setGlobalCooldown({ commandCode, seconds, actorId, reason }) {
    const cmd = COOLDOWN_COMMANDS[commandCode];
    if (!cmd) return { ok: false, reason: `Bilinmeyen komut: "${commandCode}"` };
    if (!seconds || seconds < 1) return { ok: false, reason: 'Süre en az 1 saniye olmalı.' };
    if (seconds > MAX_GLOBAL_COOLDOWN_S) {
        return { ok: false, reason: `Süre en fazla ${MAX_GLOBAL_COOLDOWN_S / 86400} gün (${MAX_GLOBAL_COOLDOWN_S}s) olabilir.` };
    }

    const newMs = seconds * 1000;
    try {
        const res = await setSetting(cmd.settingKey, String(newMs), actorId, reason);
        return { ok: true, commandCode, settingKey: cmd.settingKey, newMs, oldMs: res.oldValue ? Number(res.oldValue) : null };
    } catch (err) {
        return { ok: false, reason: err.message || 'Ayar kaydedilemedi.' };
    }
}

async function resetGlobalCooldown({ commandCode, actorId, reason }) {
    const cmd = COOLDOWN_COMMANDS[commandCode];
    if (!cmd) return { ok: false, reason: `Bilinmeyen komut: "${commandCode}"` };

    try {
        const res = await resetSetting(cmd.settingKey, actorId, reason);
        return { ok: true, commandCode, settingKey: cmd.settingKey, defaultMs: cmd.defaultMs, oldMs: res.oldValue ? Number(res.oldValue) : null };
    } catch (err) {
        return { ok: false, reason: err.message || 'Ayar sıfırlanamadı.' };
    }
}

module.exports = {
    isValidItemCode,
    getItemDisplayName,
    getAdminUserOverview,
    getAdminInventoryOverview,
    getAdminCreditOverview,
    getAdminSeasonOverview,
    adminMoneyOperation,
    adminInventoryOperation,
    adminSeasonPointsOperation,
    // Cooldown
    COOLDOWN_COMMANDS,
    MAX_USER_COOLDOWN_MS,
    MAX_GLOBAL_COOLDOWN_S,
    getAdminCooldownOverview,
    getGlobalCooldownSettings,
    resetUserCooldown,
    resetAllUserCooldowns,
    reduceUserCooldown,
    extendUserCooldown,
    setUserCooldownRemaining,
    setGlobalCooldown,
    resetGlobalCooldown,
};
