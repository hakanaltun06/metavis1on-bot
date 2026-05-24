const { pool } = require('./pool');

async function addMoney(userId, amount, type = 'wallet', db = pool) {
    const field = type === 'bank' ? 'bank' : 'wallet';
    await db.query(
        `UPDATE economy_users SET ${field} = ${field} + $1, total_earned = total_earned + CASE WHEN $1 > 0 THEN $1 ELSE 0 END WHERE user_id = $2`,
        [amount, userId]
    );
}

async function removeMoney(userId, amount, type = 'wallet', db = pool) {
    const field = type === 'bank' ? 'bank' : 'wallet';
    await db.query(
        `UPDATE economy_users SET ${field} = ${field} - $1, total_lost = total_lost + $1 WHERE user_id = $2`,
        [amount, userId]
    );
}

// Sadece cüzdandan düş (total_lost güncellemeden) — transferlerin alıcı tarafı için
async function addToWalletPlain(userId, amount, db = pool) {
    await db.query('UPDATE economy_users SET wallet = wallet + $1 WHERE user_id = $2', [amount, userId]);
}

async function removeFromWalletPlain(userId, amount, db = pool) {
    await db.query('UPDATE economy_users SET wallet = wallet - $1 WHERE user_id = $2', [amount, userId]);
}

// Cüzdan ile banka arası atomik kaydırma (aynı kullanıcı için)
async function moveWalletToBank(userId, amount, db = pool) {
    await db.query('UPDATE economy_users SET wallet = wallet - $1, bank = bank + $1 WHERE user_id = $2', [amount, userId]);
}

async function moveBankToWallet(userId, amount, db = pool) {
    await db.query('UPDATE economy_users SET bank = bank - $1, wallet = wallet + $1 WHERE user_id = $2', [amount, userId]);
}

module.exports = {
    addMoney,
    removeMoney,
    addToWalletPlain,
    removeFromWalletPlain,
    moveWalletToBank,
    moveBankToWallet
};
