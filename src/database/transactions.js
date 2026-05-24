const { pool } = require('./pool');

async function logTransaction(userId, targetId, type, amount, desc, db = pool) {
    await db.query(
        'INSERT INTO economy_transactions (user_id, target_id, type, amount, description) VALUES ($1, $2, $3, $4, $5)',
        [userId, targetId, type, amount, desc]
    );
}

module.exports = { logTransaction };
