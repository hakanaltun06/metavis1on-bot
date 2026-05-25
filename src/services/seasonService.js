const { pool } = require('../database/pool');
const { withTx } = require('../database/tx');
const { addItem } = require('../database/inventory');

// ================== [ SEZON SEVİYE EŞİKLERİ ] ==================
const SEASON_LEVELS = [
    { level: 1, threshold: 0 },
    { level: 2, threshold: 100 },
    { level: 3, threshold: 300 },
    { level: 4, threshold: 700 },
    { level: 5, threshold: 1400 },
    { level: 6, threshold: 2500 },
    { level: 7, threshold: 4000 }
];

// ================== [ SEVİYE HESAPLAMA ] ==================
function calculateSeasonLevel(points) {
    const p = Math.max(0, Number(points) || 0);
    let level = 1;
    for (const entry of SEASON_LEVELS) {
        if (p >= entry.threshold) level = entry.level;
    }
    return level;
}

function getNextLevelInfo(points) {
    const p = Math.max(0, Number(points) || 0);
    const current = calculateSeasonLevel(p);
    const nextEntry = SEASON_LEVELS.find(e => e.level === current + 1);
    if (!nextEntry) {
        return { level: current, nextLevel: null, nextThreshold: null, remaining: 0 };
    }
    return {
        level: current,
        nextLevel: nextEntry.level,
        nextThreshold: nextEntry.threshold,
        remaining: nextEntry.threshold - p
    };
}

// ================== [ AKTİF SEZON ] ==================
async function getCurrentSeason(db = pool) {
    try {
        const res = await db.query(`
            SELECT * FROM economy_seasons
            WHERE status = 'active'
              AND started_at <= NOW()
              AND ends_at > NOW()
            ORDER BY ends_at ASC
            LIMIT 1
        `);
        return res.rows[0] || null;
    } catch (err) {
        console.error('Sezon sorgu hatası:', err && err.message ? err.message : err);
        return null;
    }
}

// ================== [ KULLANICI SEZON VERİSİ ] ==================
async function getUserSeasonData(userId, db = pool) {
    try {
        const season = await getCurrentSeason(db);
        if (!season) return { season: null, user: null };

        const res = await db.query(
            'SELECT * FROM economy_season_users WHERE season_id = $1 AND user_id = $2',
            [season.id, userId]
        );
        const user = res.rows[0] || {
            season_id: season.id,
            user_id: userId,
            points: 0,
            season_level: 1,
            daily_cap_data: {},
            rewards_claimed: false
        };
        return { season, user };
    } catch (err) {
        console.error('Kullanıcı sezon verisi hatası:', err && err.message ? err.message : err);
        return { season: null, user: null };
    }
}

// ================== [ SEZON PUANI EKLE ] ==================
async function grantSeasonPoints(userId, points, db = pool) {
    try {
        const p = Math.floor(Number(points) || 0);
        if (p <= 0) return { granted: 0, reason: 'invalid_points' };

        const season = await getCurrentSeason(db);
        if (!season) return { granted: 0, reason: 'no_active_season' };

        await db.query(`
            INSERT INTO economy_season_users (season_id, user_id, points, season_level, last_updated)
            VALUES ($1, $2, $3, $4, NOW())
            ON CONFLICT (season_id, user_id) DO UPDATE
                SET points       = economy_season_users.points + $3,
                    season_level = $4,
                    last_updated = NOW()
        `, [
            season.id,
            userId,
            p,
            calculateSeasonLevel(p)
        ]);

        // Güncel puanı çekip seviyeyi doğru hesapla
        const updated = await db.query(
            'SELECT points FROM economy_season_users WHERE season_id = $1 AND user_id = $2',
            [season.id, userId]
        );
        const newPoints = updated.rows[0] ? Number(updated.rows[0].points) : p;
        const newLevel = calculateSeasonLevel(newPoints);

        await db.query(
            'UPDATE economy_season_users SET season_level = $1 WHERE season_id = $2 AND user_id = $3',
            [newLevel, season.id, userId]
        );

        return { granted: p, newPoints, newLevel };
    } catch (err) {
        console.error('Sezon puanı ekleme hatası:', err && err.message ? err.message : err);
        return { granted: 0, reason: 'error' };
    }
}

// ================== [ GÜNLÜK SINIRLI PUAN ] ==================
// category: 'gambling' | 'beg' | 'crate' | 'sell' | 'loan'
async function grantCappedPoints(userId, category, points, dailyLimit, db = pool) {
    try {
        const p = Math.floor(Number(points) || 0);
        const limit = Math.floor(Number(dailyLimit) || 0);
        if (p <= 0 || limit <= 0) return { granted: 0, reason: 'invalid_params' };

        const season = await getCurrentSeason(db);
        if (!season) return { granted: 0, reason: 'no_active_season' };

        // Kayıt yoksa oluştur
        await db.query(`
            INSERT INTO economy_season_users (season_id, user_id)
            VALUES ($1, $2)
            ON CONFLICT (season_id, user_id) DO NOTHING
        `, [season.id, userId]);

        const res = await db.query(
            'SELECT daily_cap_data FROM economy_season_users WHERE season_id = $1 AND user_id = $2',
            [season.id, userId]
        );
        const raw = res.rows[0] ? (res.rows[0].daily_cap_data || {}) : {};

        const todayStr = new Date().toISOString().slice(0, 10); // 'YYYY-MM-DD'
        // Gün değişmişse verileri sıfırla
        const capData = (raw.date === todayStr) ? { ...raw } : { date: todayStr };

        const usedToday = Number(capData[category]) || 0;
        const available = Math.max(0, limit - usedToday);

        if (available <= 0) {
            return { granted: 0, capped: true, remainingToday: 0 };
        }

        const toGrant = Math.min(p, available);
        capData[category] = usedToday + toGrant;

        await db.query(
            `UPDATE economy_season_users
             SET daily_cap_data = $1::jsonb, last_updated = NOW()
             WHERE season_id = $2 AND user_id = $3`,
            [JSON.stringify(capData), season.id, userId]
        );

        // Puanı ana tabloya yaz
        await db.query(`
            UPDATE economy_season_users
            SET points       = points + $1,
                last_updated = NOW()
            WHERE season_id = $2 AND user_id = $3
        `, [toGrant, season.id, userId]);

        // Seviyeyi güncelle
        const updated = await db.query(
            'SELECT points FROM economy_season_users WHERE season_id = $1 AND user_id = $2',
            [season.id, userId]
        );
        const newPoints = updated.rows[0] ? Number(updated.rows[0].points) : 0;
        const newLevel = calculateSeasonLevel(newPoints);
        await db.query(
            'UPDATE economy_season_users SET season_level = $1 WHERE season_id = $2 AND user_id = $3',
            [newLevel, season.id, userId]
        );

        return {
            granted: toGrant,
            capped: toGrant < p,
            remainingToday: Math.max(0, limit - (usedToday + toGrant))
        };
    } catch (err) {
        console.error('Günlük sınırlı puan hatası:', err && err.message ? err.message : err);
        return { granted: 0, reason: 'error' };
    }
}

// ================== [ SEZON LİDERBOARD ] ==================
async function getSeasonLeaderboard(limit = 10, db = pool) {
    try {
        const safeLimit = Math.max(1, Math.min(25, Math.floor(Number(limit) || 10)));
        const season = await getCurrentSeason(db);
        if (!season) return [];

        const res = await db.query(`
            SELECT user_id, points, season_level
            FROM economy_season_users
            WHERE season_id = $1
            ORDER BY points DESC
            LIMIT $2
        `, [season.id, safeLimit]);
        return res.rows;
    } catch (err) {
        console.error('Sezon liderboard hatası:', err && err.message ? err.message : err);
        return [];
    }
}

// ================== [ KULLANICI SIRASI ] ==================
async function getUserSeasonRank(userId, db = pool) {
    try {
        const season = await getCurrentSeason(db);
        if (!season) return null;

        const res = await db.query(`
            SELECT rank FROM (
                SELECT user_id, RANK() OVER (ORDER BY points DESC) AS rank
                FROM economy_season_users
                WHERE season_id = $1
            ) ranked
            WHERE user_id = $2
        `, [season.id, userId]);

        return res.rows[0] ? Number(res.rows[0].rank) : null;
    } catch (err) {
        console.error('Kullanıcı sezon sırası hatası:', err && err.message ? err.message : err);
        return null;
    }
}

// ================== [ SEZON YÖNETİMİ ] ==================
async function startSeason(name, durationDays = 30, db = pool) {
    try {
        const safeDays = Math.max(1, Math.min(90, Math.floor(Number(durationDays) || 30)));

        const existing = await getCurrentSeason(db);
        if (existing) {
            return { ok: false, reason: 'active_season_exists', season: existing };
        }

        const countRes = await db.query('SELECT COUNT(*) FROM economy_seasons');
        const num = Number(countRes.rows[0].count) + 1;
        const finalName = (name && String(name).trim()) || `Sezon ${num}`;

        const endsAt = new Date(Date.now() + safeDays * 86400000);
        const res = await db.query(
            `INSERT INTO economy_seasons (name, started_at, ends_at, status)
             VALUES ($1, NOW(), $2, 'active')
             RETURNING *`,
            [finalName, endsAt]
        );
        return { ok: true, season: res.rows[0] };
    } catch (err) {
        console.error('Sezon başlatma hatası:', err && err.message ? err.message : err);
        return { ok: false, reason: 'error' };
    }
}

async function completeCurrentSeason(db = pool) {
    try {
        const season = await getCurrentSeason(db);
        if (!season) {
            return { ok: false, reason: 'no_active_season' };
        }
        const res = await db.query(
            `UPDATE economy_seasons SET status = 'completed', ends_at = NOW() WHERE id = $1 RETURNING *`,
            [season.id]
        );
        return { ok: true, season: res.rows[0] };
    } catch (err) {
        console.error('Sezon bitirme hatası:', err && err.message ? err.message : err);
        return { ok: false, reason: 'error' };
    }
}

async function getSeasonUserCount(seasonId, db = pool) {
    try {
        const res = await db.query(
            'SELECT COUNT(*) FROM economy_season_users WHERE season_id = $1',
            [seasonId]
        );
        return Number(res.rows[0].count) || 0;
    } catch (err) {
        console.error('Sezon kullanıcı sayısı hatası:', err && err.message ? err.message : err);
        return 0;
    }
}

async function getSeasonTopUser(seasonId, db = pool) {
    try {
        const res = await db.query(
            `SELECT user_id, points, season_level
             FROM economy_season_users
             WHERE season_id = $1
             ORDER BY points DESC
             LIMIT 1`,
            [seasonId]
        );
        return res.rows[0] || null;
    } catch (err) {
        console.error('Sezon lider kullanıcı hatası:', err && err.message ? err.message : err);
        return null;
    }
}

// ================== [ SON TAMAMLANAN SEZON ] ==================
async function getLatestCompletedSeason(db = pool) {
    try {
        const res = await db.query(`
            SELECT * FROM economy_seasons
            WHERE status = 'completed'
            ORDER BY id DESC LIMIT 1
        `);
        return res.rows[0] || null;
    } catch (err) {
        console.error('Son tamamlanmış sezon hatası:', err && err.message ? err.message : err);
        return null;
    }
}

// ================== [ ÖDÜL ADAYLARI ] ==================
async function getSeasonRewardCandidates(seasonId, db = pool) {
    try {
        const res = await db.query(`
            SELECT user_id, points, season_level, rewards_claimed,
                   RANK() OVER (ORDER BY points DESC) AS rank
            FROM economy_season_users
            WHERE season_id = $1 AND points > 0
            ORDER BY points DESC
        `, [seasonId]);
        return res.rows;
    } catch (err) {
        console.error('Sezon ödül adayları hatası:', err && err.message ? err.message : err);
        return [];
    }
}

// ================== [ ÖDÜL PLANI ] ==================
function buildSeasonRewardPlan(users) {
    const plan = [];
    for (const user of users) {
        const rank = Number(user.rank);
        const level = Number(user.season_level);
        let tier = null;
        let rewards = [];
        if (rank === 1) {
            tier = '1. sıra';
            rewards = [{ itemId: 'efsanevi_kasa', quantity: 3 }];
        } else if (rank === 2) {
            tier = '2. sıra';
            rewards = [{ itemId: 'efsanevi_kasa', quantity: 2 }];
        } else if (rank === 3) {
            tier = '3. sıra';
            rewards = [{ itemId: 'efsanevi_kasa', quantity: 1 }];
        } else if (rank >= 4 && rank <= 10) {
            tier = '4-10. sıra';
            rewards = [{ itemId: 'epik_kasa', quantity: 2 }];
        } else if (level >= 3) {
            tier = 'Seviye 3+';
            rewards = [{ itemId: 'nadir_kasa', quantity: 1 }];
        } else if (level === 2) {
            tier = 'Seviye 2';
            rewards = [{ itemId: 'basit_kasa', quantity: 1 }];
        }
        if (rewards.length > 0) {
            plan.push({ userId: user.user_id, rank, points: Number(user.points), level, tier, rewards });
        }
    }
    return plan;
}

// ================== [ ÖDÜL DAĞITIMI ] ==================
async function distributeSeasonRewards(seasonId, db = pool) {
    try {
        const seasonRes = await db.query('SELECT * FROM economy_seasons WHERE id = $1', [seasonId]);
        const season = seasonRes.rows[0];
        if (!season) return { ok: false, reason: 'no_completed_season' };
        if (season.status !== 'completed') return { ok: false, reason: 'season_not_completed' };

        const candidates = await getSeasonRewardCandidates(seasonId, db);
        if (!candidates.length) return { ok: false, reason: 'no_candidates' };
        if (candidates.some(c => c.rewards_claimed)) return { ok: false, reason: 'already_distributed' };

        const plan = buildSeasonRewardPlan(candidates);
        if (!plan.length) return { ok: false, reason: 'no_candidates' };

        await withTx(async (client) => {
            for (const entry of plan) {
                for (const reward of entry.rewards) {
                    await addItem(entry.userId, reward.itemId, reward.quantity, client);
                }
                await client.query(
                    'UPDATE economy_season_users SET rewards_claimed = true WHERE season_id = $1 AND user_id = $2',
                    [seasonId, entry.userId]
                );
            }
        });

        return { ok: true, distributedCount: plan.length, rewards: plan };
    } catch (err) {
        console.error('Sezon ödül dağıtım hatası:', err && err.message ? err.message : err);
        return { ok: false, reason: 'database_error' };
    }
}

module.exports = {
    SEASON_LEVELS,
    calculateSeasonLevel,
    getNextLevelInfo,
    getCurrentSeason,
    getUserSeasonData,
    grantSeasonPoints,
    grantCappedPoints,
    getSeasonLeaderboard,
    getUserSeasonRank,
    startSeason,
    completeCurrentSeason,
    getSeasonUserCount,
    getSeasonTopUser,
    getLatestCompletedSeason,
    getSeasonRewardCandidates,
    buildSeasonRewardPlan,
    distributeSeasonRewards
};
