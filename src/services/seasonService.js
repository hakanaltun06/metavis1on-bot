const { pool } = require('../database/pool');

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

module.exports = {
    SEASON_LEVELS,
    calculateSeasonLevel,
    getNextLevelInfo,
    getCurrentSeason,
    getUserSeasonData,
    grantSeasonPoints,
    grantCappedPoints,
    getSeasonLeaderboard,
    getUserSeasonRank
};
