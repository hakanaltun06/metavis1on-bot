// Görev ve başarım ilerleme servisi.
// Komutlarda tek satır kullanım: try { await trigger(userId, 'event', 1); } catch (err) { ... }

const { pool }     = require('../database/pool');
const { withTx }   = require('../database/tx');
const { addMoney } = require('../database/money');
const { addItem }  = require('../database/inventory');
const { grantSeasonPoints, getCurrentSeason } = require('./seasonService');
const { getTaskDefinitionsByType, getTaskDefinition }  = require('../config/taskDefinitions');
const { getAllAchievementDefinitions, getAchievementDefinition } = require('../config/achievementDefinitions');
const { isSystemEnabled } = require('./settingsService');
const { SEASON_TASKS, getSeasonTaskByCode } = require('../config/seasonTaskDefinitions');

// ==================[ PERİYOT ANAHTAR ÜRETİCİLERİ ]==================

function getCurrentPeriodKey(type) {
    const now = new Date();
    if (type === 'weekly') return _isoWeekKey(now);
    return now.toISOString().slice(0, 10); // 'YYYY-MM-DD' — daily ve fallback
}

function _isoWeekKey(date) {
    // ISO 8601 hafta numarası: Pazartesi haftanın ilk günü, yılın ilk Perşembesi 1. hafta.
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayOfWeek = d.getUTCDay() || 7; // 0 (Pazar) → 7
    d.setUTCDate(d.getUTCDate() + 4 - dayOfWeek); // Perşembe'ye taşı
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
    return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

// ==================[ GÖREV İLERLEME ]==================

async function triggerTaskProgress(userId, eventType, amount = 1, meta = {}) {
    const tasksEnabled = await isSystemEnabled('system.tasks_enabled').catch(() => true);
    if (!tasksEnabled) return { advanced: [], completed: [] };

    const safeAmount = Math.max(1, Math.floor(Number(amount) || 1));

    const matchingDefs = [
        ...getTaskDefinitionsByType('daily').filter(d => d.eventType === eventType),
        ...getTaskDefinitionsByType('weekly').filter(d => d.eventType === eventType)
    ];

    if (matchingDefs.length === 0) return { advanced: [], completed: [] };

    const advanced = [];
    const completed = [];

    for (const def of matchingDefs) {
        const periodKey = getCurrentPeriodKey(def.type);
        try {
            // Upsert: INSERT yeni kayıt, ON CONFLICT mevcut kaydı ilerlet.
            // WHERE claimed_at IS NULL: ödül alınmış görevde ilerleme durur.
            const res = await pool.query(`
                INSERT INTO economy_user_tasks
                    (user_id, task_code, period_type, period_key,
                     progress, target_count, completed_at, updated_at)
                VALUES ($1, $2, $3, $4,
                    LEAST($5::INTEGER, $6::INTEGER), $6::INTEGER,
                    CASE WHEN $5::INTEGER >= $6::INTEGER THEN CURRENT_TIMESTAMP ELSE NULL END,
                    CURRENT_TIMESTAMP)
                ON CONFLICT (user_id, task_code, period_key)
                DO UPDATE SET
                    progress = LEAST(
                        economy_user_tasks.progress + $5::INTEGER,
                        economy_user_tasks.target_count
                    ),
                    completed_at = CASE
                        WHEN economy_user_tasks.completed_at IS NOT NULL
                            THEN economy_user_tasks.completed_at
                        WHEN LEAST(
                            economy_user_tasks.progress + $5::INTEGER,
                            economy_user_tasks.target_count
                        ) >= economy_user_tasks.target_count
                            THEN CURRENT_TIMESTAMP
                        ELSE NULL
                    END,
                    updated_at = CURRENT_TIMESTAMP
                WHERE economy_user_tasks.claimed_at IS NULL
                RETURNING task_code, progress, target_count, completed_at, claimed_at
            `, [userId, def.code, def.type, periodKey, safeAmount, def.targetCount]);

            if (res.rows.length > 0) {
                const row = res.rows[0];
                advanced.push({
                    code:        def.code,
                    type:        def.type,
                    progress:    row.progress,
                    targetCount: row.target_count
                });
                if (row.completed_at && !row.claimed_at) {
                    completed.push({ code: def.code, type: def.type, def });
                }
            }
        } catch (err) {
            console.error(`Görev ilerleme hatası [${def.code}]:`, err && err.message ? err.message : err);
        }
    }

    return { advanced, completed };
}

// ==================[ GÖREV SORGULAMA ]==================

async function getUserTasks(userId, type) {
    const defs = getTaskDefinitionsByType(type);
    const periodKey = getCurrentPeriodKey(type);

    const res = await pool.query(
        `SELECT * FROM economy_user_tasks
         WHERE user_id = $1 AND period_type = $2 AND period_key = $3`,
        [userId, type, periodKey]
    );

    const progressMap = {};
    for (const row of res.rows) progressMap[row.task_code] = row;

    return defs.map(def => {
        const rec = progressMap[def.code] || null;
        return {
            ...def,
            periodKey,
            progress:  rec ? Number(rec.progress) : 0,
            completed: rec ? rec.completed_at != null : false,
            claimed:   rec ? rec.claimed_at   != null : false,
            record:    rec
        };
    });
}

async function getDailyTasks(userId)  { return getUserTasks(userId, 'daily'); }
async function getWeeklyTasks(userId) { return getUserTasks(userId, 'weekly'); }

// ==================[ GÖREV ÖDÜL ALMA ]==================

async function claimTaskReward(userId, taskCode, periodKey) {
    const tasksEnabled = await isSystemEnabled('system.tasks_enabled').catch(() => true);
    if (!tasksEnabled) return { ok: false, reason: 'system_disabled' };

    const def = getTaskDefinition(taskCode);
    if (!def) return { ok: false, reason: 'task_not_found' };

    const txResult = await withTx(async (db) => {
        const res = await db.query(
            `SELECT * FROM economy_user_tasks
             WHERE user_id = $1 AND task_code = $2 AND period_key = $3
             FOR UPDATE`,
            [userId, taskCode, periodKey]
        );

        if (!res.rows.length) return { ok: false, reason: 'task_not_started' };
        const rec = res.rows[0];
        if (!rec.completed_at) return { ok: false, reason: 'task_not_completed' };
        if (rec.claimed_at)    return { ok: false, reason: 'already_claimed' };

        if (def.reward.type === 'coin' && def.reward.amount > 0) {
            await addMoney(userId, def.reward.amount, 'wallet', db);
        } else if (def.reward.type === 'crate' && def.reward.itemId) {
            await addItem(userId, def.reward.itemId, def.reward.quantity || 1, db);
        }
        // season_point: transaction dışında uygulanır (aşağıda)

        await db.query(
            `UPDATE economy_user_tasks
             SET claimed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
             WHERE id = $1`,
            [rec.id]
        );

        return { ok: true, reward: def.reward };
    });

    // Sezon puanı ödülünü transaction dışında uygula — mevcut komut patterni ile tutarlı.
    if (txResult.ok && def.reward.type === 'season_point' && def.reward.amount > 0) {
        try {
            await grantSeasonPoints(userId, def.reward.amount);
        } catch (err) {
            console.error(`Görev sezon puanı verilemedi [${taskCode}]:`, err && err.message ? err.message : err);
        }
    }

    return txResult;
}

// ==================[ BAŞARIM İLERLEME ]==================

async function triggerAchievementProgress(userId, eventType, amount = 1, meta = {}) {
    const achievementsEnabled = await isSystemEnabled('system.achievements_enabled').catch(() => true);
    if (!achievementsEnabled) return { advanced: [], unlocked: [] };

    const safeAmount = Math.max(1, Math.floor(Number(amount) || 1));

    const matchingDefs = getAllAchievementDefinitions().filter(d => d.eventType === eventType);

    if (matchingDefs.length === 0) return { advanced: [], unlocked: [] };

    const advanced = [];
    const unlocked = [];

    for (const def of matchingDefs) {
        try {
            // Upsert: INSERT yeni kayıt, ON CONFLICT mevcut kaydı ilerlet.
            // WHERE unlocked_at IS NULL: zaten açılmış başarımda ilerleme durur.
            const res = await pool.query(`
                INSERT INTO economy_user_achievements
                    (user_id, achievement_code, progress, unlocked_at, updated_at)
                VALUES ($1, $2,
                    LEAST($3::INTEGER, $4::INTEGER),
                    CASE WHEN $3::INTEGER >= $4::INTEGER THEN CURRENT_TIMESTAMP ELSE NULL END,
                    CURRENT_TIMESTAMP)
                ON CONFLICT (user_id, achievement_code)
                DO UPDATE SET
                    progress = LEAST(
                        economy_user_achievements.progress + $3::INTEGER,
                        $4::INTEGER
                    ),
                    unlocked_at = CASE
                        WHEN economy_user_achievements.unlocked_at IS NOT NULL
                            THEN economy_user_achievements.unlocked_at
                        WHEN LEAST(
                            economy_user_achievements.progress + $3::INTEGER,
                            $4::INTEGER
                        ) >= $4::INTEGER
                            THEN CURRENT_TIMESTAMP
                        ELSE NULL
                    END,
                    updated_at = CURRENT_TIMESTAMP
                WHERE economy_user_achievements.unlocked_at IS NULL
                RETURNING achievement_code, progress, unlocked_at, claimed_at
            `, [userId, def.code, safeAmount, def.targetCount]);

            if (res.rows.length > 0) {
                const row = res.rows[0];
                advanced.push({
                    code:        def.code,
                    progress:    row.progress,
                    targetCount: def.targetCount
                });
                if (row.unlocked_at && !row.claimed_at) {
                    unlocked.push({ code: def.code, def });
                }
            }
        } catch (err) {
            console.error(`Başarım ilerleme hatası [${def.code}]:`, err && err.message ? err.message : err);
        }
    }

    return { advanced, unlocked };
}

// ==================[ BAŞARIM SORGULAMA ]==================

async function getUserAchievements(userId) {
    const defs = getAllAchievementDefinitions();

    const res = await pool.query(
        'SELECT * FROM economy_user_achievements WHERE user_id = $1',
        [userId]
    );

    const progressMap = {};
    for (const row of res.rows) progressMap[row.achievement_code] = row;

    return defs.map(def => {
        const rec = progressMap[def.code] || null;
        return {
            ...def,
            progress: rec ? Number(rec.progress) : 0,
            unlocked: rec ? rec.unlocked_at != null : false,
            claimed:  rec ? rec.claimed_at  != null : false,
            record:   rec
        };
    });
}

// ==================[ BAŞARIM ÖDÜL ALMA ]==================

async function claimAchievementReward(userId, achievementCode) {
    const achievementsEnabled = await isSystemEnabled('system.achievements_enabled').catch(() => true);
    if (!achievementsEnabled) return { ok: false, reason: 'system_disabled' };

    const def = getAchievementDefinition(achievementCode);
    if (!def) return { ok: false, reason: 'achievement_not_found' };

    return withTx(async (db) => {
        const res = await db.query(
            `SELECT * FROM economy_user_achievements
             WHERE user_id = $1 AND achievement_code = $2
             FOR UPDATE`,
            [userId, achievementCode]
        );

        if (!res.rows.length) return { ok: false, reason: 'achievement_not_started' };
        const rec = res.rows[0];
        if (!rec.unlocked_at) return { ok: false, reason: 'not_unlocked' };
        if (rec.claimed_at)   return { ok: false, reason: 'already_claimed' };

        if (def.reward && def.reward.type === 'coin' && def.reward.amount > 0) {
            await addMoney(userId, def.reward.amount, 'wallet', db);
        } else if (def.reward && def.reward.type === 'crate' && def.reward.itemId) {
            await addItem(userId, def.reward.itemId, def.reward.quantity || 1, db);
        }

        await db.query(
            `UPDATE economy_user_achievements
             SET claimed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
             WHERE id = $1`,
            [rec.id]
        );

        return { ok: true, reward: def.reward };
    });
}

// ==================[ SEZON GÖREVI PERIOD KEY ]==================

function _getSeasonTaskPeriodKey(task, season) {
    const now = new Date();
    if (task.periodType === 'season_daily') {
        return `s${season.id}_d_${now.toISOString().slice(0, 10)}`;
    }
    if (task.periodType === 'season_weekly') {
        // ISO hafta: _isoWeekKey formatı '2026-W24' → 's3_w_2026-24'
        const iso = _isoWeekKey(now); // '2026-W24'
        return `s${season.id}_w_${iso.replace('-W', '-')}`;
    }
    // season_once: sadece sezon ID'si ile sıfırlanır
    return `s${season.id}`;
}

// ==================[ SEZON GÖREVI SORGULAMA ]==================

async function getUserSeasonTasks(userId) {
    try {
        const season = await getCurrentSeason();
        if (!season) return { activeSeason: null, tasks: [] };

        const taskCodes  = SEASON_TASKS.map(t => t.code);
        const tasksWithKeys = SEASON_TASKS.map(t => ({
            ...t,
            periodKey: _getSeasonTaskPeriodKey(t, season)
        }));

        const periodKeys = [...new Set(tasksWithKeys.map(t => t.periodKey))];

        const res = await pool.query(
            `SELECT task_code, period_key, progress, target_count, completed_at, claimed_at
             FROM economy_user_tasks
             WHERE user_id = $1 AND task_code = ANY($2) AND period_key = ANY($3)`,
            [userId, taskCodes, periodKeys]
        );

        const progressMap = {};
        for (const row of res.rows) {
            progressMap[`${row.task_code}:${row.period_key}`] = row;
        }

        const tasks = tasksWithKeys.map(task => {
            const key = `${task.code}:${task.periodKey}`;
            const rec = progressMap[key] || null;
            return {
                ...task,
                progress:  rec ? Number(rec.progress) : 0,
                completed: rec ? rec.completed_at != null : false,
                claimed:   rec ? rec.claimed_at   != null : false,
                record:    rec
            };
        });

        return { activeSeason: season, tasks };
    } catch (err) {
        console.error('Sezon görevi sorgulama hatası:', err?.message || err);
        return { activeSeason: null, tasks: [] };
    }
}

// ==================[ SEZON GÖREVI İLERLEME ]==================

async function triggerSeasonTaskProgress(userId, eventType, amount = 1) {
    try {
        const tasksEnabled = await isSystemEnabled('system.tasks_enabled').catch(() => true);
        if (!tasksEnabled) return;

        const season = await getCurrentSeason();
        if (!season) return;

        const safeAmount = Math.max(1, Math.floor(Number(amount) || 1));
        const matching   = SEASON_TASKS.filter(t => t.event === eventType);
        if (matching.length === 0) return;

        for (const task of matching) {
            const periodKey = _getSeasonTaskPeriodKey(task, season);
            try {
                await pool.query(`
                    INSERT INTO economy_user_tasks
                        (user_id, task_code, period_type, period_key,
                         progress, target_count, completed_at, updated_at)
                    VALUES ($1, $2, $3, $4,
                        LEAST($5::INTEGER, $6::INTEGER), $6::INTEGER,
                        CASE WHEN $5::INTEGER >= $6::INTEGER THEN CURRENT_TIMESTAMP ELSE NULL END,
                        CURRENT_TIMESTAMP)
                    ON CONFLICT (user_id, task_code, period_key)
                    DO UPDATE SET
                        progress = LEAST(
                            economy_user_tasks.progress + $5::INTEGER,
                            economy_user_tasks.target_count
                        ),
                        completed_at = CASE
                            WHEN economy_user_tasks.completed_at IS NOT NULL
                                THEN economy_user_tasks.completed_at
                            WHEN LEAST(
                                economy_user_tasks.progress + $5::INTEGER,
                                economy_user_tasks.target_count
                            ) >= economy_user_tasks.target_count
                                THEN CURRENT_TIMESTAMP
                            ELSE NULL
                        END,
                        updated_at = CURRENT_TIMESTAMP
                    WHERE economy_user_tasks.claimed_at IS NULL
                `, [userId, task.code, task.periodType, periodKey, safeAmount, task.target]);
            } catch (err) {
                console.error(`Sezon görevi ilerleme hatası [${task.code}]:`, err?.message || err);
            }
        }
    } catch (err) {
        console.error('Sezon görevi trigger genel hatası:', err?.message || err);
    }
}

// ==================[ SEZON GÖREVI ÖDÜL ALMA ]==================

async function claimSeasonTaskReward(userId, taskCode, periodKey) {
    const tasksEnabled = await isSystemEnabled('system.tasks_enabled').catch(() => true);
    if (!tasksEnabled) return { success: false, reason: 'tasks_disabled' };

    const seasonPointsEnabled = await isSystemEnabled('system.season_points_enabled').catch(() => true);
    if (!seasonPointsEnabled) return { success: false, reason: 'season_points_disabled' };

    const season = await getCurrentSeason();
    if (!season) return { success: false, reason: 'no_active_season' };

    const task = getSeasonTaskByCode(taskCode);
    if (!task) return { success: false, reason: 'task_not_found' };

    // Period key'i geçerlilik kontrolü (eski/sahte key reddi)
    const expectedPeriodKey = _getSeasonTaskPeriodKey(task, season);
    if (periodKey !== expectedPeriodKey) return { success: false, reason: 'invalid_period' };

    const txResult = await withTx(async (db) => {
        const res = await db.query(
            `SELECT * FROM economy_user_tasks
             WHERE user_id = $1 AND task_code = $2 AND period_key = $3
             FOR UPDATE`,
            [userId, taskCode, periodKey]
        );

        if (!res.rows.length) return { success: false, reason: 'not_completed' };
        const rec = res.rows[0];
        if (!rec.completed_at) return { success: false, reason: 'not_completed' };
        if (rec.claimed_at)    return { success: false, reason: 'already_claimed' };

        await db.query(
            `UPDATE economy_user_tasks
             SET claimed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
             WHERE id = $1`,
            [rec.id]
        );

        return { success: true, reward: task.reward };
    });

    if (!txResult.success) return txResult;

    // Sezon puanı transaction dışında verilir — grantSeasonPoints kendi season_points_enabled kontrolünü yapar
    let granted = 0, newPoints = 0, newLevel = 1;
    if (task.reward.type === 'season_point' && task.reward.amount > 0) {
        try {
            const grantResult = await grantSeasonPoints(userId, task.reward.amount);
            granted   = grantResult.granted   || 0;
            newPoints = grantResult.newPoints || 0;
            newLevel  = grantResult.newLevel  || 1;
        } catch (err) {
            console.error(`Sezon görevi puanı verilemedi [${taskCode}]:`, err?.message || err);
        }
    }

    return { success: true, reward: task.reward, granted, newPoints, newLevel };
}

// ==================[ BİRLEŞİK TETİKLEYİCİ ]==================
// Komutlarda kullanım: try { await trigger(userId, 'work_completed'); } catch (err) { ... }

async function trigger(userId, eventType, amount = 1, meta = {}) {
    const [taskResult, achievementResult] = await Promise.all([
        triggerTaskProgress(userId, eventType, amount, meta),
        triggerAchievementProgress(userId, eventType, amount, meta),
        triggerSeasonTaskProgress(userId, eventType, amount)
    ]);
    return {
        tasks:        taskResult,
        achievements: achievementResult
    };
}

module.exports = {
    getCurrentPeriodKey,
    getDailyTasks,
    getWeeklyTasks,
    getUserTasks,
    triggerTaskProgress,
    claimTaskReward,
    getUserAchievements,
    triggerAchievementProgress,
    claimAchievementReward,
    trigger,
    getUserSeasonTasks,
    triggerSeasonTaskProgress,
    claimSeasonTaskReward
};
