const { pool } = require('./pool');

async function checkItem(userId, itemId, db = pool) {
    const res = await db.query('SELECT quantity FROM economy_inventory WHERE user_id = $1 AND item_id = $2', [userId, itemId]);
    return res.rows.length > 0 ? res.rows[0].quantity : 0;
}

async function addItem(userId, itemId, qty, db = pool) {
    await db.query(`
        INSERT INTO economy_inventory (user_id, item_id, quantity)
        VALUES ($1, $2, $3)
        ON CONFLICT (user_id, item_id)
        DO UPDATE SET quantity = economy_inventory.quantity + $3
    `, [userId, itemId, qty]);
}

async function consumeItem(userId, itemId, amount = 1, db = pool) {
    await db.query('UPDATE economy_inventory SET quantity = quantity - $1 WHERE user_id = $2 AND item_id = $3', [amount, userId, itemId]);
    await db.query('DELETE FROM economy_inventory WHERE quantity <= 0 AND user_id = $1 AND item_id = $2', [userId, itemId]);
}

async function getInventory(userId, db = pool) {
    const res = await db.query('SELECT item_id, quantity FROM economy_inventory WHERE user_id = $1', [userId]);
    return res.rows;
}

async function getInventoryTotal(userId, db = pool) {
    const res = await db.query('SELECT COALESCE(SUM(quantity), 0) as total_items FROM economy_inventory WHERE user_id = $1', [userId]);
    return Number(res.rows[0].total_items) || 0;
}

async function safeConsumeItem(userId, itemId, amount = 1, db = pool) {
    const res = await db.query(
        'UPDATE economy_inventory SET quantity = quantity - $1 WHERE user_id = $2 AND item_id = $3 AND quantity >= $1 RETURNING quantity',
        [amount, userId, itemId]
    );
    if (res.rowCount === 0) return false;
    if (res.rows[0].quantity <= 0) {
        await db.query('DELETE FROM economy_inventory WHERE user_id = $1 AND item_id = $2 AND quantity <= 0', [userId, itemId]);
    }
    return true;
}

module.exports = { checkItem, addItem, consumeItem, safeConsumeItem, getInventory, getInventoryTotal };
