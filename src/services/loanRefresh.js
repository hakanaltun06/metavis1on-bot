const { withTx } = require('../database/tx');
const {
    getActiveLoans,
    applyLateFeeToLoan,
    updateCreditScore
} = require('../database/loans');
const { logTransaction } = require('../database/transactions');
const {
    calculateLateFee,
    calculateCreditScoreChange
} = require('./loanService');

// Komut tetikli yenileme: kullanıcının gecikmiş kredilerine
// tek seferlik gecikme cezası uygular, kredi puanını düşürür.
// Aynı krediye ikinci kez ceza eklemez (late_fee_applied bayrağı).
async function refreshUserLoans(userId) {
    return withTx(async (db) => {
        const loans = await getActiveLoans(userId, db);
        const now = Date.now();
        const applied = [];
        for (const loan of loans) {
            const dueMs = loan.due_at ? new Date(loan.due_at).getTime() : 0;
            const isOverdue = dueMs && now > dueMs;
            if (!isOverdue) continue;
            if (loan.late_fee_applied) continue;
            const remaining = Number(loan.remaining) || 0;
            if (remaining <= 0) continue;
            const fee = calculateLateFee(remaining);
            await applyLateFeeToLoan(loan.id, userId, fee, db);
            await db.query(
                `UPDATE economy_users SET total_late_fees = total_late_fees + $1 WHERE user_id = $2`,
                [fee, userId]
            );
            await updateCreditScore(userId, calculateCreditScoreChange('loan_overdue'), db);
            await logTransaction(userId, null, 'loan_late_fee', fee, `Gecikme cezası — Kredi #${loan.id}`, db);
            applied.push({ loanId: loan.id, fee });
        }
        return applied;
    });
}

module.exports = { refreshUserLoans };
