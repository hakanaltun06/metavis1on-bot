const { Pool } = require('pg');
const { DATABASE_URL } = require('../config/env');

const pool = new Pool({
    connectionString: DATABASE_URL,
    // Uzak sunucularda SSL gerekirse (örn: Supabase, Render):
    // ssl: { rejectUnauthorized: false }
});

pool.on('error', (err) => {
    // Bağlantı adresi veya gizli bilgi loglanmaz; yalnızca hata özeti.
    console.error('Beklenmeyen veritabanı hatası:', err && err.message ? err.message : err);
});

module.exports = { pool };
