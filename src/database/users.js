const { pool } = require('./pool');

async function ensureUser(userId, db = pool) {
    await db.query('INSERT INTO economy_users (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING', [userId]);
    await db.query('UPDATE economy_users SET last_active = CURRENT_TIMESTAMP WHERE user_id = $1', [userId]);
    const res = await db.query('SELECT * FROM economy_users WHERE user_id = $1', [userId]);
    return res.rows[0];
}

async function getUser(userId, db = pool) {
    const res = await db.query('SELECT * FROM economy_users WHERE user_id = $1', [userId]);
    return res.rows[0] || null;
}

async function deleteUser(userId, db = pool) {
    await db.query('DELETE FROM economy_users WHERE user_id = $1', [userId]);
}

module.exports = { ensureUser, getUser, deleteUser };
