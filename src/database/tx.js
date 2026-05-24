const { pool } = require('./pool');

// Birden fazla SQL adımını atomik çalıştırmak için kullanılır.
// Hata olursa otomatik ROLLBACK, başarılıysa COMMIT.
async function withTx(fn) {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const result = await fn(client);
        await client.query('COMMIT');
        return result;
    } catch (err) {
        try { await client.query('ROLLBACK'); } catch (_) {}
        throw err;
    } finally {
        client.release();
    }
}

module.exports = { withTx };
