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
const { SHOP_ITEMS } = require('../utils/constants');
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
};
