const { pool } = require('../database/pool');
const { withTx } = require('../database/tx');
const { addItem } = require('../database/inventory');
const { isSystemEnabled } = require('./settingsService');

// ================== [ SEZON SEVİYE EŞİKLERİ ] ==================
// 30 seviyeli progresif XP eğrisi — Sezon 2.0
const SEASON_LEVELS = [
    { level:  1, threshold:      0 },
    { level:  2, threshold:    150 },
    { level:  3, threshold:    400 },
    { level:  4, threshold:    800 },
    { level:  5, threshold:   1500 },
    { level:  6, threshold:   2500 },
    { level:  7, threshold:   4000 },
    { level:  8, threshold:   6000 },
    { level:  9, threshold:   8500 },
    { level: 10, threshold:  11500 },
    { level: 11, threshold:  15000 },
    { level: 12, threshold:  19000 },
    { level: 13, threshold:  23500 },
    { level: 14, threshold:  28500 },
    { level: 15, threshold:  34000 },
    { level: 16, threshold:  40000 },
    { level: 17, threshold:  46500 },
    { level: 18, threshold:  53500 },
    { level: 19, threshold:  61000 },
    { level: 20, threshold:  69000 },
    { level: 21, threshold:  77500 },
    { level: 22, threshold:  86500 },
    { level: 23, threshold:  96000 },
    { level: 24, threshold: 106000 },
    { level: 25, threshold: 116500 },
    { level: 26, threshold: 127500 },
    { level: 27, threshold: 139000 },
    { level: 28, threshold: 151000 },
    { level: 29, threshold: 163500 },
    { level: 30, threshold: 176500 }
];

const MAX_SEASON_LEVEL = 30;
const ALLOWED_SNAPSHOT_TYPES = new Set(['daily', 'weekly', 'end', 'manual']);
const ALLOWED_AUTOMATION_FIELDS = {
    notified_7d:          'notified_7d',
    notified_3d:          'notified_3d',
    notified_24h:         'notified_24h',
    notified_1h:          'notified_1h',
    notified_end:         'notified_end',
    last_check:           'last_check',
    last_daily_report_at: 'last_daily_report_at',
    auto_ended_at:        'auto_ended_at'
};

// ================== [ SEVİYE HESAPLAMA ] ==================
function calculateSeasonLevel(points) {
    const p = Math.max(0, Number(points) || 0);
    let level = 1;
    for (const entry of SEASON_LEVELS) {
        if (p >= entry.threshold) level = entry.level;
    }
    return level;
}

// Geriye uyumlu — /sezon komutu bu şekli kullanıyor
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

// Zengin seviye bilgisi — 8.24 /sezon merkezi için
function getSeasonLevelInfo(points) {
    const p = Math.max(0, Number(points) || 0);
    const currentLevel    = calculateSeasonLevel(p);
    const currentEntry    = SEASON_LEVELS.find(e => e.level === currentLevel);
    const nextEntry       = SEASON_LEVELS.find(e => e.level === currentLevel + 1);
    const currentThreshold = currentEntry ? currentEntry.threshold : 0;
    const nextThreshold    = nextEntry    ? nextEntry.threshold    : null;
    const isMaxLevel       = nextEntry == null;
    const levelRange       = (nextThreshold != null) ? (nextThreshold - currentThreshold) : 1;
    const pointsIntoLevel  = p - currentThreshold;
    const pointsNeeded     = isMaxLevel ? 0 : (nextThreshold - p);
    const progressRatio    = isMaxLevel ? 1 : Math.min(1, pointsIntoLevel / levelRange);

    return {
        points: p,
        currentLevel,
        currentThreshold,
        nextLevel:     isMaxLevel ? null : currentLevel + 1,
        nextThreshold: nextThreshold,
        pointsIntoLevel,
        pointsNeeded,
        progressRatio,
        isMaxLevel
    };
}

// Sonraki seviye odaklı özet — getSeasonLevelInfo üzerine ince wrapper
function getNextSeasonLevelInfo(points) {
    const info = getSeasonLevelInfo(points);
    return {
        currentLevel:  info.currentLevel,
        nextLevel:     info.nextLevel,
        nextThreshold: info.nextThreshold,
        remaining:     info.pointsNeeded,
        progressRatio: info.progressRatio,
        isMaxLevel:    info.isMaxLevel
    };
}

// Sonraki seviyeye ilerleme oranı (0–1)
function getSeasonProgressToNextLevel(points) {
    return getSeasonLevelInfo(points).progressRatio;
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
// Düzeltme: tek UPSERT + RETURNING ile gereksiz çift yazma kaldırıldı
async function grantSeasonPoints(userId, points, db = pool) {
    try {
        const enabled = await isSystemEnabled('system.season_points_enabled').catch(() => true);
        if (!enabled) return { granted: 0, reason: 'system_disabled' };

        const p = Math.floor(Number(points) || 0);
        if (p <= 0) return { granted: 0, reason: 'invalid_points' };

        const season = await getCurrentSeason(db);
        if (!season) return { granted: 0, reason: 'no_active_season' };

        // RETURNING ile yeni toplam puanı tek sorguda al
        const upsertRes = await db.query(`
            INSERT INTO economy_season_users (season_id, user_id, points, season_level, last_updated)
            VALUES ($1, $2, $3, 1, NOW())
            ON CONFLICT (season_id, user_id) DO UPDATE
                SET points       = economy_season_users.points + $3,
                    last_updated = NOW()
            RETURNING points
        `, [season.id, userId, p]);

        const newPoints = upsertRes.rows[0] ? Number(upsertRes.rows[0].points) : p;
        const newLevel  = calculateSeasonLevel(newPoints);

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
// category: 'gambling' | 'beg' | 'crate' | 'sell' | 'loan' | 'rob'
async function grantCappedPoints(userId, category, points, dailyLimit, db = pool) {
    try {
        const enabled = await isSystemEnabled('system.season_points_enabled').catch(() => true);
        if (!enabled) return { granted: 0, reason: 'system_disabled' };

        const p     = Math.floor(Number(points)     || 0);
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

        const todayStr = new Date().toISOString().slice(0, 10);
        const capData  = (raw.date === todayStr) ? { ...raw } : { date: todayStr };

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

        // Puanı ve seviyeyi tek UPDATE'te güncelle
        const updatedRes = await db.query(`
            UPDATE economy_season_users
            SET points       = points + $1,
                last_updated = NOW()
            WHERE season_id = $2 AND user_id = $3
            RETURNING points
        `, [toGrant, season.id, userId]);

        const newPoints = updatedRes.rows[0] ? Number(updatedRes.rows[0].points) : 0;
        const newLevel  = calculateSeasonLevel(newPoints);
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

        const trimmedName = name && String(name).trim() ? String(name).trim() : null;

        if (trimmedName) {
            const nameCheck = await db.query(
                'SELECT * FROM economy_seasons WHERE LOWER(name) = LOWER($1) LIMIT 1',
                [trimmedName]
            );
            if (nameCheck.rows[0]) {
                return { ok: false, reason: 'season_name_exists', existingSeason: nameCheck.rows[0] };
            }
        }

        let finalName;
        if (trimmedName) {
            finalName = trimmedName;
        } else {
            const countRes = await db.query('SELECT COUNT(*) FROM economy_seasons');
            let num = Number(countRes.rows[0].count) + 1;
            while (true) {
                const candidate = `Sezon ${num}`;
                const nameCheck = await db.query(
                    'SELECT id FROM economy_seasons WHERE LOWER(name) = LOWER($1) LIMIT 1',
                    [candidate]
                );
                if (!nameCheck.rows[0]) break;
                num++;
            }
            finalName = `Sezon ${num}`;
        }

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

// AND status='active' guard ile çift tamamlama koruması eklendi
async function completeCurrentSeason(db = pool) {
    try {
        const season = await getCurrentSeason(db);
        if (!season) {
            return { ok: false, reason: 'no_active_season' };
        }
        const res = await db.query(
            `UPDATE economy_seasons
             SET status = 'completed', ends_at = NOW()
             WHERE id = $1 AND status = 'active'
             RETURNING *`,
            [season.id]
        );
        if (!res.rows[0]) {
            return { ok: false, reason: 'already_completed' };
        }
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

// ================== [ TAMAMLANAN SEZONLAR ] ==================
async function getCompletedSeasons(limit = 10, db = pool) {
    try {
        const safeLimit = Math.max(1, Math.min(20, Math.floor(Number(limit) || 10)));
        const res = await db.query(`
            SELECT * FROM economy_seasons
            WHERE status = 'completed'
            ORDER BY id DESC
            LIMIT $1
        `, [safeLimit]);
        return res.rows;
    } catch (err) {
        console.error('Tamamlanmış sezonlar hatası:', err && err.message ? err.message : err);
        return [];
    }
}

// ================== [ ÖDÜL DAĞITIM DURUMU ] ==================
async function isSeasonRewardsDistributed(seasonId, db = pool) {
    try {
        const res = await db.query(
            'SELECT COUNT(*) FROM economy_season_users WHERE season_id = $1 AND rewards_claimed = true',
            [seasonId]
        );
        return Number(res.rows[0].count) > 0;
    } catch (err) {
        console.error('Ödül dağıtım durum hatası:', err && err.message ? err.message : err);
        return false;
    }
}

// ================== [ SEZON GEÇMİŞİ ] ==================
async function getSeasonHistory(limit = 10, db = pool) {
    try {
        const seasons = await getCompletedSeasons(limit, db);
        const result = [];
        for (const season of seasons) {
            const [userCount, topUser, rewardsDistributed] = await Promise.all([
                getSeasonUserCount(season.id, db),
                getSeasonTopUser(season.id, db),
                isSeasonRewardsDistributed(season.id, db)
            ]);
            result.push({ season, userCount, topUser, rewardsDistributed });
        }
        return result;
    } catch (err) {
        console.error('Sezon geçmişi hatası:', err && err.message ? err.message : err);
        return [];
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
        const rank  = Number(user.rank);
        const level = Number(user.season_level);
        let tier    = null;
        let rewards = [];
        if (rank === 1) {
            tier    = '1. sıra';
            rewards = [
                { itemId: 'prestij_kasa',  quantity: 1 },
                { itemId: 'efsanevi_kasa', quantity: 2 }
            ];
        } else if (rank === 2) {
            tier    = '2. sıra';
            rewards = [
                { itemId: 'prestij_kasa',  quantity: 1 },
                { itemId: 'efsanevi_kasa', quantity: 1 }
            ];
        } else if (rank === 3) {
            tier    = '3. sıra';
            rewards = [
                { itemId: 'neon_kasa',     quantity: 1 },
                { itemId: 'efsanevi_kasa', quantity: 1 }
            ];
        } else if (rank >= 4 && rank <= 10) {
            tier    = '4-10. sıra';
            rewards = [
                { itemId: 'neon_kasa', quantity: 1 },
                { itemId: 'epik_kasa', quantity: 1 }
            ];
        } else if (level >= 3) {
            tier    = 'Seviye 3+';
            rewards = [{ itemId: 'nexus_kasa', quantity: 1 }];
        } else if (level === 2) {
            tier    = 'Seviye 2';
            rewards = [{ itemId: 'nadir_kasa', quantity: 1 }];
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

// ================== [ SEVİYE ÖDÜL CLAIM TAKİBİ ] ==================
// Kullanıcının claim ettiği sezon seviyelerini döndürür — 8.22 ödül yolu için
async function getClaimedLevels(userId, seasonId, db = pool) {
    try {
        if (!userId || !seasonId) return [];
        const res = await db.query(
            'SELECT level FROM economy_user_season_rewards WHERE season_id = $1 AND user_id = $2 ORDER BY level ASC',
            [seasonId, userId]
        );
        return res.rows.map(r => Number(r.level));
    } catch (err) {
        console.error('Claim edilen seviyeler hatası:', err && err.message ? err.message : err);
        return [];
    }
}

// Duplicate korumalı seviye ödülü claim kaydı — 8.22'de gerçek ödül dağıtımı eklenecek
// Bu aşamada sadece claim kaydı oluşturur; coin/kasa verilmez.
async function claimLevelReward(userId, seasonId, level, reward = null, db = pool) {
    if (!userId || !seasonId || level == null) {
        return { success: false, reason: 'invalid_params' };
    }
    const lvl = Math.floor(Number(level) || 0);
    if (lvl < 1 || lvl > MAX_SEASON_LEVEL) {
        return { success: false, reason: 'invalid_level' };
    }

    try {
        // Kullanıcının bu seviyeye ulaşıp ulaşmadığını kontrol et
        const userRes = await db.query(
            'SELECT season_level FROM economy_season_users WHERE season_id = $1 AND user_id = $2',
            [seasonId, userId]
        );
        if (!userRes.rows[0]) {
            return { success: false, reason: 'user_not_found' };
        }
        const currentLevel = Number(userRes.rows[0].season_level);
        if (currentLevel < lvl) {
            return { success: false, reason: 'level_locked' };
        }

        const rewardCode    = reward ? (reward.code    || null) : null;
        const rewardType    = reward ? (reward.type    || null) : null;
        const rewardPayload = reward ? (reward.payload || {})   : {};

        // ON CONFLICT DO NOTHING — UNIQUE(season_id, user_id, level) duplicate koruması
        const insertRes = await db.query(`
            INSERT INTO economy_user_season_rewards
                (season_id, user_id, level, reward_code, reward_type, reward_payload)
            VALUES ($1, $2, $3, $4, $5, $6::jsonb)
            ON CONFLICT (season_id, user_id, level) DO NOTHING
            RETURNING id, claimed_at
        `, [seasonId, userId, lvl, rewardCode, rewardType, JSON.stringify(rewardPayload)]);

        if (!insertRes.rows[0]) {
            return { success: false, reason: 'already_claimed' };
        }

        return {
            success: true,
            level: lvl,
            claimedAt: insertRes.rows[0].claimed_at,
            reward
        };
    } catch (err) {
        console.error('Seviye ödülü claim hatası:', err && err.message ? err.message : err);
        return { success: false, reason: 'error' };
    }
}

// ================== [ SNAPSHOT ALTYAPISI ] ==================
async function saveSnapshot(seasonId, snapshotType, data = {}, db = pool) {
    if (!seasonId) throw new Error('seasonId gerekli');
    if (!ALLOWED_SNAPSHOT_TYPES.has(snapshotType)) {
        throw new Error(`Geçersiz snapshot tipi: "${snapshotType}". İzin verilenler: ${[...ALLOWED_SNAPSHOT_TYPES].join(', ')}`);
    }
    const safeData = (data && typeof data === 'object' && !Array.isArray(data)) ? data : {};

    const res = await db.query(`
        INSERT INTO economy_season_snapshots (season_id, snapshot_type, data)
        VALUES ($1, $2, $3::jsonb)
        RETURNING *
    `, [seasonId, snapshotType, JSON.stringify(safeData)]);

    return res.rows[0];
}

// Anlık sezon özet verisi — saveSnapshot ile birlikte kullanılır
async function buildSeasonSnapshotData(seasonId, db = pool) {
    try {
        const [seasonRes, statsRes, top10Res, levelDistRes] = await Promise.all([
            db.query('SELECT * FROM economy_seasons WHERE id = $1', [seasonId]),
            db.query(
                'SELECT COUNT(*) AS cnt, SUM(points) AS total_pts, AVG(points) AS avg_pts FROM economy_season_users WHERE season_id = $1',
                [seasonId]
            ),
            db.query(
                'SELECT user_id, points, season_level FROM economy_season_users WHERE season_id = $1 ORDER BY points DESC LIMIT 10',
                [seasonId]
            ),
            db.query(
                'SELECT season_level, COUNT(*) AS cnt FROM economy_season_users WHERE season_id = $1 GROUP BY season_level ORDER BY season_level',
                [seasonId]
            )
        ]);

        const season           = seasonRes.rows[0] || null;
        const stats            = statsRes.rows[0]  || {};
        const participantCount = Number(stats.cnt)      || 0;
        const totalPoints      = Number(stats.total_pts) || 0;
        const averagePoints    = participantCount > 0 ? Math.round(totalPoints / participantCount) : 0;

        const levelDistribution = {};
        for (const row of levelDistRes.rows) {
            levelDistribution[String(row.season_level)] = Number(row.cnt);
        }

        const maxLevelUserCount = top10Res.rows.filter(r => Number(r.season_level) === MAX_SEASON_LEVEL).length;

        return {
            seasonId,
            seasonName:     season ? season.name   : null,
            generatedAt:    new Date().toISOString(),
            status:         season ? season.status  : null,
            completedAt:    (season && season.status === 'completed') ? season.ends_at : null,
            participantCount,
            totalPoints,
            averagePoints,
            top10:          top10Res.rows,
            levelDistribution,
            maxLevelUserCount
        };
    } catch (err) {
        console.error('Snapshot data hazırlama hatası:', err && err.message ? err.message : err);
        return {
            seasonId,
            seasonName:        null,
            generatedAt:       new Date().toISOString(),
            participantCount:  0,
            totalPoints:       0,
            averagePoints:     0,
            top10:             [],
            levelDistribution: {},
            maxLevelUserCount: 0
        };
    }
}

// ================== [ OTOMASYON STATE HELPERLARI ] ==================
async function getSeasonAutomationState(seasonId, db = pool) {
    try {
        if (!seasonId) return null;
        const res = await db.query(
            'SELECT * FROM economy_season_automation_state WHERE season_id = $1',
            [seasonId]
        );
        return res.rows[0] || null;
    } catch (err) {
        console.error('Otomasyon state okuma hatası:', err && err.message ? err.message : err);
        return null;
    }
}

async function ensureSeasonAutomationState(seasonId, db = pool) {
    try {
        if (!seasonId) return null;
        await db.query(`
            INSERT INTO economy_season_automation_state (season_id)
            VALUES ($1)
            ON CONFLICT (season_id) DO NOTHING
        `, [seasonId]);
        const res = await db.query(
            'SELECT * FROM economy_season_automation_state WHERE season_id = $1',
            [seasonId]
        );
        return res.rows[0] || null;
    } catch (err) {
        console.error('Otomasyon state oluşturma hatası:', err && err.message ? err.message : err);
        return null;
    }
}

async function updateSeasonAutomationState(seasonId, patch, db = pool) {
    try {
        if (!seasonId || !patch || typeof patch !== 'object') {
            return await getSeasonAutomationState(seasonId, db);
        }

        const setClauses = [];
        const values     = [];
        let   idx        = 1;

        for (const [key, val] of Object.entries(patch)) {
            const col = ALLOWED_AUTOMATION_FIELDS[key];
            if (!col) continue;
            setClauses.push(`${col} = $${idx}`);
            values.push(val);
            idx++;
        }

        if (setClauses.length === 0) {
            return await getSeasonAutomationState(seasonId, db);
        }

        setClauses.push(`updated_at = NOW()`);
        values.push(seasonId);

        const res = await db.query(
            `UPDATE economy_season_automation_state SET ${setClauses.join(', ')} WHERE season_id = $${idx} RETURNING *`,
            values
        );
        return res.rows[0] || null;
    } catch (err) {
        console.error('Otomasyon state güncelleme hatası:', err && err.message ? err.message : err);
        return null;
    }
}

module.exports = {
    SEASON_LEVELS,
    calculateSeasonLevel,
    getNextLevelInfo,
    getSeasonLevelInfo,
    getNextSeasonLevelInfo,
    getSeasonProgressToNextLevel,
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
    distributeSeasonRewards,
    getCompletedSeasons,
    isSeasonRewardsDistributed,
    getSeasonHistory,
    getClaimedLevels,
    claimLevelReward,
    saveSnapshot,
    buildSeasonSnapshotData,
    getSeasonAutomationState,
    ensureSeasonAutomationState,
    updateSeasonAutomationState
};
