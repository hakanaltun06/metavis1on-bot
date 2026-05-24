const { pool } = require('./pool');

async function initDB() {
    const client = await pool.connect();
    try {
        await client.query(`
            CREATE TABLE IF NOT EXISTS economy_users (
                user_id VARCHAR(25) PRIMARY KEY,
                wallet BIGINT DEFAULT 0,
                bank BIGINT DEFAULT 0,
                daily_streak INT DEFAULT 0,
                total_earned BIGINT DEFAULT 0,
                total_lost BIGINT DEFAULT 0,
                work_count INT DEFAULT 0,
                gamble_count INT DEFAULT 0,
                rob_success INT DEFAULT 0,
                rob_fail INT DEFAULT 0,
                last_daily TIMESTAMP,
                last_weekly TIMESTAMP,
                last_monthly TIMESTAMP,
                last_work TIMESTAMP,
                last_crime TIMESTAMP,
                last_rob TIMESTAMP,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                last_active TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS economy_inventory (
                id SERIAL PRIMARY KEY,
                user_id VARCHAR(25) REFERENCES economy_users(user_id) ON DELETE CASCADE,
                item_id VARCHAR(50),
                quantity INT DEFAULT 1,
                UNIQUE(user_id, item_id)
            );

            CREATE TABLE IF NOT EXISTS economy_transactions (
                id SERIAL PRIMARY KEY,
                user_id VARCHAR(25),
                target_id VARCHAR(25),
                type VARCHAR(50),
                amount BIGINT,
                description TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            ALTER TABLE economy_users ADD COLUMN IF NOT EXISTS last_beg TIMESTAMP;
            ALTER TABLE economy_users ADD COLUMN IF NOT EXISTS bank_limit BIGINT DEFAULT 50000;
            ALTER TABLE economy_users ADD COLUMN IF NOT EXISTS bank_level INTEGER DEFAULT 1;
            ALTER TABLE economy_users ADD COLUMN IF NOT EXISTS last_interest TIMESTAMP;
            ALTER TABLE economy_users ADD COLUMN IF NOT EXISTS total_interest_earned BIGINT DEFAULT 0;
        `);
        console.log('✅ Veritabanı tabloları hazır.');
    } finally {
        client.release();
    }
}

module.exports = { initDB };
