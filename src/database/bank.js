const { pool } = require('./pool');

// Faiz kazancını bankaya işler.
async function applyInterest(userId, credited, db = pool) {
    await db.query(
        'UPDATE economy_users SET bank = bank + $1, total_interest_earned = total_interest_earned + $1, total_earned = total_earned + $1, last_interest = CURRENT_TIMESTAMP WHERE user_id = $2',
        [credited, userId]
    );
}

// Banka seviyesini yükseltir; cüzdandan ücreti düşer.
async function upgradeBankLevel(userId, cost, newLevel, newLimit, db = pool) {
    await db.query(
        'UPDATE economy_users SET wallet = wallet - $1, total_lost = total_lost + $1, bank_level = $2, bank_limit = $3 WHERE user_id = $4',
        [cost, newLevel, newLimit, userId]
    );
}

module.exports = { applyInterest, upgradeBankLevel };
