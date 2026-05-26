const { withTx } = require('../database/tx');
const { ensureUser, deleteUser } = require('../database/users');
const { addMoney, removeMoney } = require('../database/money');
const { logTransaction } = require('../database/transactions');

async function adminAddMoney(adminId, targetId, amount) {
    await ensureUser(targetId);
    await addMoney(targetId, amount, 'wallet');
    await logTransaction(adminId, targetId, 'admin_add', amount, 'Yetkili ekleme');
}

async function adminRemoveMoney(adminId, targetId, amount) {
    await ensureUser(targetId);
    await removeMoney(targetId, amount, 'wallet');
    await logTransaction(adminId, targetId, 'admin_remove', amount, 'Yetkili silme');
}

async function adminResetUser(adminId, targetId) {
    await withTx(async (db) => {
        // Aktif kredi kayıtlarını temizle
        await db.query('DELETE FROM economy_loans WHERE user_id = $1', [targetId]);

        // Aktif sezondaki kullanıcı kaydını temizle (tamamlanan sezon geçmişi korunur)
        await db.query(`
            DELETE FROM economy_season_users
            WHERE user_id = $1
              AND season_id IN (
                  SELECT id FROM economy_seasons WHERE status = 'active'
              )
        `, [targetId]);

        // Kullanıcının kendi işlem geçmişini temizle (admin logları user_id=adminId olduğu için korunur)
        await db.query('DELETE FROM economy_transactions WHERE user_id = $1', [targetId]);

        // economy_users kaydını sil (economy_inventory cascade ile silinir)
        await deleteUser(targetId, db);

        // admin_reset logunu tüm temizlik tamamlandıktan sonra yaz
        await logTransaction(adminId, targetId, 'admin_reset', 0, 'Yetkili sıfırlama', db);
    });
}

module.exports = { adminAddMoney, adminRemoveMoney, adminResetUser };
