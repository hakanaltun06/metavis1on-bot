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

            ALTER TABLE economy_users ADD COLUMN IF NOT EXISTS credit_score INTEGER DEFAULT 500;
            ALTER TABLE economy_users ADD COLUMN IF NOT EXISTS total_borrowed BIGINT DEFAULT 0;
            ALTER TABLE economy_users ADD COLUMN IF NOT EXISTS total_repaid BIGINT DEFAULT 0;
            ALTER TABLE economy_users ADD COLUMN IF NOT EXISTS total_late_fees BIGINT DEFAULT 0;
            ALTER TABLE economy_users ADD COLUMN IF NOT EXISTS loan_defaults INTEGER DEFAULT 0;

            CREATE TABLE IF NOT EXISTS economy_loans (
                id SERIAL PRIMARY KEY,
                user_id VARCHAR(25) NOT NULL,
                principal BIGINT NOT NULL,
                remaining BIGINT NOT NULL,
                interest_rate NUMERIC(6,4) NOT NULL,
                total_due BIGINT NOT NULL,
                paid_amount BIGINT DEFAULT 0,
                due_at TIMESTAMP NOT NULL,
                status TEXT DEFAULT 'active',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                paid_at TIMESTAMP,
                late_fee_applied BOOLEAN DEFAULT false
            );

            CREATE INDEX IF NOT EXISTS idx_loans_user_id ON economy_loans(user_id);
            CREATE INDEX IF NOT EXISTS idx_loans_status  ON economy_loans(status);
            CREATE INDEX IF NOT EXISTS idx_loans_due_at  ON economy_loans(due_at);

            CREATE TABLE IF NOT EXISTS economy_seasons (
                id         SERIAL PRIMARY KEY,
                name       VARCHAR(100) NOT NULL,
                started_at TIMESTAMP NOT NULL,
                ends_at    TIMESTAMP NOT NULL,
                status     TEXT DEFAULT 'active',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS economy_season_users (
                id              SERIAL PRIMARY KEY,
                season_id       INTEGER NOT NULL REFERENCES economy_seasons(id),
                user_id         VARCHAR(25) NOT NULL,
                points          INTEGER DEFAULT 0,
                season_level    INTEGER DEFAULT 1,
                daily_cap_data  JSONB DEFAULT '{}'::jsonb,
                last_updated    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                rewards_claimed BOOLEAN DEFAULT false,
                UNIQUE(season_id, user_id)
            );

            CREATE INDEX IF NOT EXISTS idx_season_users_season_id ON economy_season_users(season_id);
            CREATE INDEX IF NOT EXISTS idx_season_users_points    ON economy_season_users(season_id, points DESC);
            CREATE INDEX IF NOT EXISTS idx_season_users_user_id   ON economy_season_users(user_id);

            CREATE TABLE IF NOT EXISTS economy_crate_logs (
                id SERIAL PRIMARY KEY,
                user_id TEXT NOT NULL,
                crate_code TEXT NOT NULL,
                reward_type TEXT NOT NULL,
                reward_code TEXT,
                reward_amount BIGINT DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS economy_user_tasks (
                id           SERIAL PRIMARY KEY,
                user_id      VARCHAR(25) NOT NULL,
                task_code    VARCHAR(80) NOT NULL,
                period_type  VARCHAR(20) NOT NULL,
                period_key   VARCHAR(30) NOT NULL,
                progress     INTEGER DEFAULT 0,
                target_count INTEGER NOT NULL,
                completed_at TIMESTAMP,
                claimed_at   TIMESTAMP,
                created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(user_id, task_code, period_key)
            );

            CREATE INDEX IF NOT EXISTS idx_user_tasks_user_period
                ON economy_user_tasks(user_id, period_type, period_key);
            CREATE INDEX IF NOT EXISTS idx_user_tasks_task_code
                ON economy_user_tasks(task_code);
            CREATE INDEX IF NOT EXISTS idx_user_tasks_claimed
                ON economy_user_tasks(claimed_at);

            CREATE TABLE IF NOT EXISTS economy_user_achievements (
                id               SERIAL PRIMARY KEY,
                user_id          VARCHAR(25) NOT NULL,
                achievement_code VARCHAR(80) NOT NULL,
                progress         INTEGER DEFAULT 0,
                unlocked_at      TIMESTAMP,
                claimed_at       TIMESTAMP,
                created_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(user_id, achievement_code)
            );

            CREATE INDEX IF NOT EXISTS idx_user_achievements_user
                ON economy_user_achievements(user_id);
            CREATE INDEX IF NOT EXISTS idx_user_achievements_code
                ON economy_user_achievements(achievement_code);
            CREATE INDEX IF NOT EXISTS idx_user_achievements_unlocked
                ON economy_user_achievements(unlocked_at);
            CREATE INDEX IF NOT EXISTS idx_user_achievements_claimed
                ON economy_user_achievements(claimed_at);

            CREATE TABLE IF NOT EXISTS bot_settings (
                id            SERIAL PRIMARY KEY,
                key           TEXT NOT NULL UNIQUE,
                value         TEXT NOT NULL,
                value_type    TEXT NOT NULL DEFAULT 'text',
                category      TEXT NOT NULL DEFAULT 'general',
                description   TEXT,
                is_sensitive  BOOLEAN NOT NULL DEFAULT false,
                min_value     NUMERIC,
                max_value     NUMERIC,
                default_value TEXT NOT NULL,
                updated_by    TEXT,
                updated_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
            );

            CREATE INDEX IF NOT EXISTS idx_bot_settings_category
                ON bot_settings(category);

            CREATE TABLE IF NOT EXISTS admin_logs (
                id             SERIAL PRIMARY KEY,
                action         TEXT NOT NULL,
                category       TEXT NOT NULL DEFAULT 'general',
                actor_id       TEXT NOT NULL,
                target_user_id TEXT,
                target_key     TEXT,
                old_value      TEXT,
                new_value      TEXT,
                reason         TEXT,
                metadata       JSONB DEFAULT '{}',
                created_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
            );

            CREATE INDEX IF NOT EXISTS idx_admin_logs_actor
                ON admin_logs(actor_id);
            CREATE INDEX IF NOT EXISTS idx_admin_logs_target
                ON admin_logs(target_user_id);
            CREATE INDEX IF NOT EXISTS idx_admin_logs_category
                ON admin_logs(category);
            CREATE INDEX IF NOT EXISTS idx_admin_logs_created
                ON admin_logs(created_at DESC);

            CREATE TABLE IF NOT EXISTS economy_user_season_rewards (
                id             SERIAL PRIMARY KEY,
                season_id      INTEGER NOT NULL REFERENCES economy_seasons(id) ON DELETE CASCADE,
                user_id        VARCHAR(25) NOT NULL,
                level          INTEGER NOT NULL,
                reward_code    VARCHAR(100),
                reward_type    VARCHAR(50),
                reward_payload JSONB DEFAULT '{}'::jsonb,
                claimed_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(season_id, user_id, level)
            );

            CREATE INDEX IF NOT EXISTS idx_season_rewards_season_user
                ON economy_user_season_rewards(season_id, user_id);
            CREATE INDEX IF NOT EXISTS idx_season_rewards_season_level
                ON economy_user_season_rewards(season_id, level);
            CREATE INDEX IF NOT EXISTS idx_season_rewards_user
                ON economy_user_season_rewards(user_id);

            CREATE TABLE IF NOT EXISTS economy_season_snapshots (
                id            SERIAL PRIMARY KEY,
                season_id     INTEGER NOT NULL REFERENCES economy_seasons(id) ON DELETE CASCADE,
                snapshot_type VARCHAR(30) NOT NULL,
                data          JSONB NOT NULL DEFAULT '{}'::jsonb,
                created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE INDEX IF NOT EXISTS idx_season_snapshots_season_type
                ON economy_season_snapshots(season_id, snapshot_type);
            CREATE INDEX IF NOT EXISTS idx_season_snapshots_created
                ON economy_season_snapshots(created_at);

            CREATE TABLE IF NOT EXISTS economy_season_automation_state (
                id                   SERIAL PRIMARY KEY,
                season_id            INTEGER REFERENCES economy_seasons(id) ON DELETE CASCADE,
                notified_7d          BOOLEAN DEFAULT false,
                notified_3d          BOOLEAN DEFAULT false,
                notified_24h         BOOLEAN DEFAULT false,
                notified_1h          BOOLEAN DEFAULT false,
                notified_end         BOOLEAN DEFAULT false,
                last_check           TIMESTAMP,
                last_daily_report_at TIMESTAMP,
                auto_ended_at        TIMESTAMP,
                created_at           TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at           TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(season_id)
            );

            CREATE INDEX IF NOT EXISTS idx_season_automation_season
                ON economy_season_automation_state(season_id);
            CREATE INDEX IF NOT EXISTS idx_season_automation_ended
                ON economy_season_automation_state(auto_ended_at);
            CREATE INDEX IF NOT EXISTS idx_season_automation_report
                ON economy_season_automation_state(last_daily_report_at);
        `);
        console.log('✅ Veritabanı tabloları hazır.');
    } finally {
        client.release();
    }

    // Default bot ayarlarını seed et (idempotent — mevcut değerleri ezmez)
    try {
        const { ensureDefaultSettings } = require('../services/settingsService');
        await ensureDefaultSettings();
    } catch (err) {
        console.error('Default ayarlar seed edilemedi:', err && err.message ? err.message : err);
    }
}

module.exports = { initDB };
