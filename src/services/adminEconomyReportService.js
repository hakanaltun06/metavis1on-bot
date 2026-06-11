'use strict';

// Admin Ekonomi Denetim Rapor Servisi — tamamen read-only.
// Hiçbir fonksiyon veri değiştirmez; sadece okur ve raporlar.
// DB hatası veya eksik tablo durumunda crash olmaz, { rows: [] } döner.

const { pool } = require('../database/pool');
const { SHOP_ITEMS } = require('../utils/constants');
const {
    CRATE_TYPES, isCrateItem, isRareItem, getRareItemByCode, getCrateByCode
} = require('./crateService');

// Tüm kasa kodları + legacy alias — parametre olarak kullanılır
const ALL_CRATE_CODES = [...CRATE_TYPES.map(c => c.code), 'siber_kasa'];
const PRESTIGE_IDS    = ['vip_badge', 'profil_cercevesi', 'kara_kart'];

// Hata loglar ama asla kullanıcıya göstermez; her zaman { rows: [] } döner.
async function safeQuery(sql, params = []) {
    try {
        return await pool.query(sql, params);
    } catch (err) {
        console.error('[EkonomiRapor] Query hatası:', err?.message || String(err));
        return { rows: [] };
    }
}

function safeNum(val, fallback = 0) {
    if (val === null || val === undefined) return fallback;
    const n = Number(val);
    return Number.isFinite(n) ? n : fallback;
}

// ==================[ GENEL EKONOMİ BAKIŞ ]==================

async function getEconomyOverview() {
    const [userStats, loanStats, invRows, seasonStats, top3] = await Promise.all([
        safeQuery(`
            SELECT
                COUNT(*) AS user_count,
                COALESCE(SUM(wallet), 0)             AS total_wallet,
                COALESCE(SUM(bank), 0)               AS total_bank,
                COALESCE(SUM(wallet + bank), 0)      AS total_wealth,
                COALESCE(AVG(wallet + bank), 0)      AS avg_wealth,
                COALESCE(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY wallet + bank), 0) AS median_wealth,
                COALESCE(AVG(credit_score), 500)     AS avg_credit_score
            FROM economy_users
        `),
        safeQuery(`
            SELECT
                COUNT(*) FILTER (WHERE status IN ('active', 'overdue')) AS active_count,
                COUNT(*) FILTER (WHERE status = 'overdue')             AS overdue_count,
                COALESCE(SUM(remaining) FILTER (WHERE status IN ('active', 'overdue')), 0) AS total_debt
            FROM economy_loans
        `),
        safeQuery(`
            SELECT item_id, SUM(quantity) AS total_qty
            FROM economy_inventory
            GROUP BY item_id
        `),
        safeQuery(`
            SELECT
                s.name                              AS season_name,
                COALESCE(SUM(su.points), 0)         AS total_points,
                COUNT(DISTINCT su.user_id)          AS participants
            FROM economy_season_users su
            JOIN economy_seasons s ON s.id = su.season_id AND s.status = 'active'
            GROUP BY s.name
            LIMIT 1
        `),
        safeQuery(`
            SELECT user_id, wallet + bank AS total_wealth
            FROM economy_users
            ORDER BY total_wealth DESC
            LIMIT 3
        `)
    ]);

    const u = userStats.rows[0] || {};
    const l = loanStats.rows[0]  || {};
    const s = seasonStats.rows[0] || {};

    let crateTotal = 0, colTotal = 0, colValue = 0;
    for (const r of invRows.rows) {
        const qty = safeNum(r.total_qty);
        if (isCrateItem(r.item_id)) {
            crateTotal += qty;
        } else if (isRareItem(r.item_id)) {
            colTotal += qty;
            const def = getRareItemByCode(r.item_id);
            if (def) colValue += def.sellValue * qty;
        }
    }

    return {
        userCount:          safeNum(u.user_count),
        totalWallet:        safeNum(u.total_wallet),
        totalBank:          safeNum(u.total_bank),
        totalWealth:        safeNum(u.total_wealth),
        avgWealth:          Math.round(safeNum(u.avg_wealth)),
        medianWealth:       Math.round(safeNum(u.median_wealth)),
        avgCreditScore:     Math.round(safeNum(u.avg_credit_score, 500)),
        activeLoanCount:    safeNum(l.active_count),
        overdueCount:       safeNum(l.overdue_count),
        totalActiveDebt:    safeNum(l.total_debt),
        crateTotal,
        colTotal,
        colValue,
        seasonName:         s.season_name || null,
        seasonPoints:       safeNum(s.total_points),
        seasonParticipants: safeNum(s.participants),
        top3: top3.rows.map(r => ({ userId: r.user_id, totalWealth: safeNum(r.total_wealth) })),
    };
}

// ==================[ PARA AKIŞI ]==================
// economy_transactions.amount her zaman pozitif; yön type alanından anlaşılır.

async function getMoneyFlowReport(hours) {
    const safeHours = Math.max(1, Math.min(168, safeNum(hours, 24)));
    const since = new Date(Date.now() - safeHours * 3_600_000).toISOString();

    const [txByType, adminMoney, crateCoins] = await Promise.all([
        safeQuery(`
            SELECT
                type,
                COUNT(*)                   AS cnt,
                COALESCE(SUM(amount), 0)   AS total_amount
            FROM economy_transactions
            WHERE created_at >= $1
            GROUP BY type
            ORDER BY total_amount DESC
            LIMIT 15
        `, [since]),
        safeQuery(`
            SELECT
                COALESCE(SUM(
                    CASE
                        WHEN action LIKE '%money.add%'
                             AND old_value ~ '^[0-9]+$'
                             AND new_value ~ '^[0-9]+$'
                        THEN CAST(new_value AS BIGINT) - CAST(old_value AS BIGINT)
                        ELSE 0
                    END
                ), 0) AS added,
                COALESCE(SUM(
                    CASE
                        WHEN action LIKE '%money.remove%'
                             AND old_value ~ '^[0-9]+$'
                             AND new_value ~ '^[0-9]+$'
                        THEN CAST(old_value AS BIGINT) - CAST(new_value AS BIGINT)
                        ELSE 0
                    END
                ), 0) AS removed
            FROM admin_logs
            WHERE category = 'money' AND created_at >= $1
        `, [since]),
        safeQuery(`
            SELECT COALESCE(SUM(reward_amount), 0) AS total_coin
            FROM economy_crate_logs
            WHERE reward_type = 'coin' AND created_at >= $1
        `, [since])
    ]);

    const hasData        = txByType.rows.length > 0;
    const totalTxAmount  = txByType.rows.reduce((s, r) => s + safeNum(r.total_amount), 0);
    const am             = adminMoney.rows[0] || {};

    return {
        hours: safeHours,
        hasData,
        types: txByType.rows.map(r => ({
            type:        r.type,
            count:       safeNum(r.cnt),
            totalAmount: safeNum(r.total_amount),
        })),
        totalTxAmount,
        adminAdded:    safeNum(am.added),
        adminRemoved:  safeNum(am.removed),
        crateCoinsOut: safeNum(crateCoins.rows[0]?.total_coin),
    };
}

// ==================[ EN ZENGİNLER ]==================

async function getRichestUsers(limit) {
    const safeLimit = Math.max(1, Math.min(25, safeNum(limit, 10)));

    const [users, overdueSet] = await Promise.all([
        safeQuery(`
            SELECT user_id, wallet, bank, wallet + bank AS total_wealth, bank_level, credit_score
            FROM economy_users
            ORDER BY total_wealth DESC
            LIMIT $1
        `, [safeLimit]),
        safeQuery(`
            SELECT DISTINCT user_id FROM economy_loans WHERE status = 'overdue'
        `)
    ]);

    const overdueUsers = new Set(overdueSet.rows.map(r => r.user_id));

    return users.rows.map(r => ({
        userId:      r.user_id,
        wallet:      safeNum(r.wallet),
        bank:        safeNum(r.bank),
        totalWealth: safeNum(r.total_wealth),
        bankLevel:   safeNum(r.bank_level, 1),
        creditScore: safeNum(r.credit_score, 500),
        hasOverdue:  overdueUsers.has(r.user_id),
        isHighWealth: safeNum(r.total_wealth) > 50_000_000,
    }));
}

// ==================[ KREDİ RAPORU ]==================

async function getCreditRiskReport() {
    const [agg, topDebtors, scoreStats] = await Promise.all([
        safeQuery(`
            SELECT
                COUNT(*) FILTER (WHERE status IN ('active', 'overdue')) AS active_count,
                COUNT(*) FILTER (WHERE status = 'overdue')             AS overdue_count,
                COALESCE(SUM(remaining) FILTER (WHERE status IN ('active', 'overdue')), 0) AS total_debt,
                COALESCE(AVG(remaining) FILTER (WHERE status IN ('active', 'overdue')), 0) AS avg_debt
            FROM economy_loans
        `),
        safeQuery(`
            SELECT
                l.user_id,
                COALESCE(SUM(l.remaining), 0)                      AS total_remaining,
                COUNT(*)                                            AS loan_count,
                COUNT(*) FILTER (WHERE l.status = 'overdue')       AS overdue_count
            FROM economy_loans l
            WHERE l.status IN ('active', 'overdue')
            GROUP BY l.user_id
            ORDER BY total_remaining DESC
            LIMIT 10
        `),
        safeQuery(`
            SELECT
                COALESCE(AVG(credit_score), 500)                    AS avg_score,
                COUNT(*) FILTER (WHERE credit_score < 350)          AS very_risky_count,
                COUNT(*) FILTER (WHERE credit_score < 500)          AS risky_count
            FROM economy_users
        `)
    ]);

    const a  = agg.rows[0]        || {};
    const sc = scoreStats.rows[0] || {};

    const overdueCount = safeNum(a.overdue_count);
    const totalDebt    = safeNum(a.total_debt);

    let riskLabel;
    if (overdueCount > 10 || totalDebt > 10_000_000)  riskLabel = '🔴 Yüksek';
    else if (overdueCount > 5 || totalDebt > 5_000_000) riskLabel = '🟡 Orta';
    else                                               riskLabel = '🟢 Normal';

    return {
        activeCount:    safeNum(a.active_count),
        overdueCount,
        totalDebt,
        avgDebt:        Math.round(safeNum(a.avg_debt)),
        avgCreditScore: Math.round(safeNum(sc.avg_score, 500)),
        veryRiskyCount: safeNum(sc.very_risky_count),
        riskyCount:     safeNum(sc.risky_count),
        riskLabel,
        topDebtors: topDebtors.rows.map(r => ({
            userId:         r.user_id,
            totalRemaining: safeNum(r.total_remaining),
            loanCount:      safeNum(r.loan_count),
            overdueCount:   safeNum(r.overdue_count),
        })),
    };
}

// ==================[ ENVANTER RAPORU ]==================

async function getInventoryEconomyReport() {
    const [allItems, topCrateUsers] = await Promise.all([
        safeQuery(`
            SELECT
                item_id,
                SUM(quantity)          AS total_qty,
                COUNT(DISTINCT user_id) AS user_count
            FROM economy_inventory
            GROUP BY item_id
            ORDER BY total_qty DESC
        `),
        safeQuery(`
            SELECT user_id, SUM(quantity) AS crate_total
            FROM economy_inventory
            WHERE item_id = ANY($1)
            GROUP BY user_id
            ORDER BY crate_total DESC
            LIMIT 5
        `, [ALL_CRATE_CODES])
    ]);

    const classified = allItems.rows.map(r => {
        const qty   = safeNum(r.total_qty);
        const users = safeNum(r.user_count);

        let category;
        if (isCrateItem(r.item_id))      category = 'kasa';
        else if (isRareItem(r.item_id))  category = 'koleksiyon';
        else                             category = 'esya';

        // siber_kasa → Nexus Kasa otomatik (getCrateByCode handles alias)
        let displayName = r.item_id;
        const shopItem  = SHOP_ITEMS.find(i => i.id === r.item_id);
        if (shopItem) {
            displayName = shopItem.name;
        } else {
            const rareItem = getRareItemByCode(r.item_id);
            if (rareItem) {
                displayName = rareItem.name;
            } else {
                const crateItem = getCrateByCode(r.item_id);
                if (crateItem) displayName = crateItem.name;
            }
        }

        let totalValue = 0;
        const rareItem = getRareItemByCode(r.item_id);
        if (rareItem) totalValue = rareItem.sellValue * qty;

        return { itemId: r.item_id, displayName, category, totalQty: qty, userCount: users, totalValue };
    });

    const crateItems = classified.filter(i => i.category === 'kasa');
    const colItems   = classified.filter(i => i.category === 'koleksiyon');
    const shopItems  = classified.filter(i => i.category === 'esya');

    const crateTotal = crateItems.reduce((s, i) => s + i.totalQty, 0);
    const colTotal   = colItems.reduce((s, i) => s + i.totalQty, 0);
    const colValue   = colItems.reduce((s, i) => s + i.totalValue, 0);
    const itemTotal  = shopItems.reduce((s, i) => s + i.totalQty, 0);

    const prestigeCounts = {};
    for (const pid of PRESTIGE_IDS) {
        const row = classified.find(i => i.itemId === pid);
        prestigeCounts[pid] = row ? row.userCount : 0;
    }

    const rarest = [...colItems]
        .filter(i => i.totalQty > 0)
        .sort((a, b) => a.totalQty - b.totalQty)
        .slice(0, 5);

    return {
        totalRecords: allItems.rows.length,
        crateTotal, colTotal, itemTotal, colValue,
        topItems: classified.slice(0, 10),
        rarest,
        topCrateUsers: topCrateUsers.rows.map(r => ({
            userId:     r.user_id,
            crateTotal: safeNum(r.crate_total),
        })),
        prestigeCounts,
    };
}

// ==================[ ADMİN ETKİSİ ]==================

async function getAdminImpactReport(hours) {
    const safeHours = Math.max(1, Math.min(168, safeNum(hours, 24)));
    const since     = new Date(Date.now() - safeHours * 3_600_000).toISOString();

    const [summary, topTargets, topActors, recentLogs, moneyImpact] = await Promise.all([
        safeQuery(`
            SELECT
                COUNT(*)                                              AS total,
                COUNT(*) FILTER (WHERE category = 'money')           AS money,
                COUNT(*) FILTER (WHERE category = 'inventory')       AS inventory,
                COUNT(*) FILTER (WHERE category = 'season')          AS season,
                COUNT(*) FILTER (WHERE category = 'cooldown')        AS cooldown,
                COUNT(*) FILTER (WHERE category = 'settings')        AS settings
            FROM admin_logs
            WHERE created_at >= $1
        `, [since]),
        safeQuery(`
            SELECT target_user_id, COUNT(*) AS cnt
            FROM admin_logs
            WHERE created_at >= $1 AND target_user_id IS NOT NULL
            GROUP BY target_user_id
            ORDER BY cnt DESC
            LIMIT 5
        `, [since]),
        safeQuery(`
            SELECT actor_id, COUNT(*) AS cnt
            FROM admin_logs
            WHERE created_at >= $1
            GROUP BY actor_id
            ORDER BY cnt DESC
            LIMIT 5
        `, [since]),
        safeQuery(`
            SELECT action, category, actor_id, target_user_id, old_value, new_value, created_at
            FROM admin_logs
            WHERE created_at >= $1
            ORDER BY created_at DESC
            LIMIT 5
        `, [since]),
        safeQuery(`
            SELECT
                COALESCE(SUM(
                    CASE
                        WHEN action LIKE '%money.add%'
                             AND old_value ~ '^[0-9]+$'
                             AND new_value ~ '^[0-9]+$'
                        THEN CAST(new_value AS BIGINT) - CAST(old_value AS BIGINT)
                        ELSE 0
                    END
                ), 0) AS added,
                COALESCE(SUM(
                    CASE
                        WHEN action LIKE '%money.remove%'
                             AND old_value ~ '^[0-9]+$'
                             AND new_value ~ '^[0-9]+$'
                        THEN CAST(old_value AS BIGINT) - CAST(new_value AS BIGINT)
                        ELSE 0
                    END
                ), 0) AS removed
            FROM admin_logs
            WHERE category = 'money' AND created_at >= $1
        `, [since])
    ]);

    const s  = summary.rows[0]     || {};
    const mi = moneyImpact.rows[0] || {};

    return {
        hours:         safeHours,
        total:         safeNum(s.total),
        moneyCount:    safeNum(s.money),
        invCount:      safeNum(s.inventory),
        seasonCount:   safeNum(s.season),
        cooldownCount: safeNum(s.cooldown),
        settingsCount: safeNum(s.settings),
        adminAdded:    safeNum(mi.added),
        adminRemoved:  safeNum(mi.removed),
        topTargets:    topTargets.rows.map(r => ({ userId: r.target_user_id, count: safeNum(r.cnt) })),
        topActors:     topActors.rows.map(r => ({ actorId: r.actor_id,      count: safeNum(r.cnt) })),
        recentLogs:    recentLogs.rows,
    };
}

// ==================[ ŞÜPHELİ SİNYALLER ]==================

async function getSuspiciousEconomyReport(hours) {
    const safeHours = Math.max(1, Math.min(168, safeNum(hours, 24)));
    const since     = new Date(Date.now() - safeHours * 3_600_000).toISOString();

    const [highWealth, bankOverflow, highCrates, overdueRich, manyAdminActions, highPrestige] =
        await Promise.all([
            safeQuery(`
                SELECT user_id, wallet + bank AS total_wealth
                FROM economy_users
                WHERE wallet + bank > 50000000
                ORDER BY total_wealth DESC
                LIMIT 10
            `),
            safeQuery(`
                SELECT user_id, bank, bank_limit
                FROM economy_users
                WHERE bank > bank_limit
                LIMIT 10
            `),
            safeQuery(`
                SELECT user_id, SUM(quantity) AS crate_count
                FROM economy_inventory
                WHERE item_id = ANY($1)
                GROUP BY user_id
                HAVING SUM(quantity) > 100
                ORDER BY crate_count DESC
                LIMIT 10
            `, [ALL_CRATE_CODES]),
            safeQuery(`
                SELECT u.user_id, u.wallet + u.bank AS total_wealth
                FROM economy_users u
                WHERE u.wallet + u.bank > 1000000
                  AND EXISTS (
                      SELECT 1 FROM economy_loans l
                      WHERE l.user_id = u.user_id AND l.status = 'overdue'
                  )
                ORDER BY total_wealth DESC
                LIMIT 10
            `),
            safeQuery(`
                SELECT target_user_id, COUNT(*) AS cnt
                FROM admin_logs
                WHERE created_at >= $1 AND target_user_id IS NOT NULL
                GROUP BY target_user_id
                HAVING COUNT(*) >= 5
                ORDER BY cnt DESC
                LIMIT 10
            `, [since]),
            safeQuery(`
                SELECT user_id, SUM(quantity) AS prestige_count
                FROM economy_inventory
                WHERE item_id = ANY($1)
                GROUP BY user_id
                HAVING SUM(quantity) > 2
                ORDER BY prestige_count DESC
                LIMIT 10
            `, [PRESTIGE_IDS])
        ]);

    const signals = [];

    for (const r of highWealth.rows) {
        signals.push({
            type:   'high_wealth',
            userId: r.user_id,
            detail: `Toplam servet: ${safeNum(r.total_wealth).toLocaleString('tr-TR')} 🪙`,
        });
    }
    for (const r of bankOverflow.rows) {
        signals.push({
            type:   'bank_overflow',
            userId: r.user_id,
            detail: `Banka: ${safeNum(r.bank).toLocaleString('tr-TR')} / Limit: ${safeNum(r.bank_limit).toLocaleString('tr-TR')} 🪙`,
        });
    }
    for (const r of highCrates.rows) {
        signals.push({
            type:   'high_crates',
            userId: r.user_id,
            detail: `Kasa adedi: ${r.crate_count}`,
        });
    }
    for (const r of overdueRich.rows) {
        signals.push({
            type:   'overdue_rich',
            userId: r.user_id,
            detail: `Servet: ${safeNum(r.total_wealth).toLocaleString('tr-TR')} 🪙 + gecikmiş kredi`,
        });
    }
    for (const r of manyAdminActions.rows) {
        signals.push({
            type:   'many_admin',
            userId: r.target_user_id,
            detail: `Son ${safeHours}s: ${r.cnt} admin işlemi`,
        });
    }
    for (const r of highPrestige.rows) {
        signals.push({
            type:   'high_prestige',
            userId: r.user_id,
            detail: `Prestij eşyası: ${r.prestige_count} adet`,
        });
    }

    return { hours: safeHours, signals };
}

module.exports = {
    getEconomyOverview,
    getMoneyFlowReport,
    getRichestUsers,
    getCreditRiskReport,
    getInventoryEconomyReport,
    getAdminImpactReport,
    getSuspiciousEconomyReport,
};
