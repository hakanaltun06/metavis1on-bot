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

async function adminResetUser(targetId) {
    await deleteUser(targetId);
}

module.exports = { adminAddMoney, adminRemoveMoney, adminResetUser };
