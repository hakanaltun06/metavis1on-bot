// Admin işlem loglama servisi.
// Tüm admin işlemleri admin_logs tablosuna geri izlenebilir şekilde kaydedilir.

const { pool } = require('../database/pool');

const MAX_LOG_LIMIT = 50;

// ==================[ YAZMA ]==================

async function logAdminAction(data) {
    const {
        action,
        category     = 'general',
        actorId,
        targetUserId = null,
        targetKey    = null,
        oldValue     = null,
        newValue     = null,
        reason       = null,
        metadata     = {}
    } = data;

    if (!action)   throw new Error('logAdminAction: action zorunludur.');
    if (!actorId)  throw new Error('logAdminAction: actorId zorunludur.');

    const metaJson = typeof metadata === 'object' && metadata !== null
        ? JSON.stringify(metadata)
        : (typeof metadata === 'string' ? metadata : '{}');

    await pool.query(`
        INSERT INTO admin_logs
            (action, category, actor_id, target_user_id, target_key, old_value, new_value, reason, metadata)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)
    `, [action, category, actorId, targetUserId, targetKey, oldValue, newValue, reason, metaJson]);
}

// ==================[ OKUMA ]==================

async function getRecentAdminLogs(limit = 20) {
    const safeLimit = Math.max(1, Math.min(MAX_LOG_LIMIT, Math.floor(Number(limit) || 20)));
    const res = await pool.query(
        'SELECT * FROM admin_logs ORDER BY created_at DESC LIMIT $1',
        [safeLimit]
    );
    return res.rows;
}

async function getUserAdminLogs(userId, limit = 20) {
    const safeLimit = Math.max(1, Math.min(MAX_LOG_LIMIT, Math.floor(Number(limit) || 20)));
    const res = await pool.query(
        'SELECT * FROM admin_logs WHERE target_user_id = $1 ORDER BY created_at DESC LIMIT $2',
        [userId, safeLimit]
    );
    return res.rows;
}

async function getActorLogs(actorId, limit = 20) {
    const safeLimit = Math.max(1, Math.min(MAX_LOG_LIMIT, Math.floor(Number(limit) || 20)));
    const res = await pool.query(
        'SELECT * FROM admin_logs WHERE actor_id = $1 ORDER BY created_at DESC LIMIT $2',
        [actorId, safeLimit]
    );
    return res.rows;
}

// filters: { category, actorId, targetUserId, action, since, limit }
async function listAdminLogs(filters = {}) {
    const {
        category,
        actorId,
        targetUserId,
        action,
        since,
        limit = 20
    } = filters;

    const safeLimit = Math.max(1, Math.min(MAX_LOG_LIMIT, Math.floor(Number(limit) || 20)));
    const conditions = [];
    const params     = [];

    if (category)     { params.push(category);     conditions.push(`category = $${params.length}`); }
    if (actorId)      { params.push(actorId);       conditions.push(`actor_id = $${params.length}`); }
    if (targetUserId) { params.push(targetUserId);  conditions.push(`target_user_id = $${params.length}`); }
    if (action)       { params.push(action);        conditions.push(`action = $${params.length}`); }
    if (since)        { params.push(since);         conditions.push(`created_at >= $${params.length}`); }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    params.push(safeLimit);

    const res = await pool.query(
        `SELECT * FROM admin_logs ${where} ORDER BY created_at DESC LIMIT $${params.length}`,
        params
    );
    return res.rows;
}

// ==================[ FORMATLAMA ]==================

function formatAdminLogEntry(log) {
    const date  = new Date(log.created_at).toLocaleString('tr-TR');
    const parts = [`\`${date}\``, `**${log.action}**`];

    if (log.target_user_id) parts.push(`Hedef: <@${log.target_user_id}>`);
    if (log.target_key)     parts.push(`Ayar: \`${log.target_key}\``);

    if (log.old_value !== null && log.new_value !== null) {
        parts.push(`${log.old_value} → ${log.new_value}`);
    }

    if (log.reason) parts.push(`_(${log.reason})_`);

    return parts.join(' · ');
}

module.exports = {
    logAdminAction,
    getRecentAdminLogs,
    getUserAdminLogs,
    getActorLogs,
    listAdminLogs,
    formatAdminLogEntry,
};
