const { pool } = require('./pool');

// ================== [ KREDİ KAYDI ] ==================
async function createLoan(userId, principal, interestRate, totalDue, dueAt, db = pool) {
    const res = await db.query(
        `INSERT INTO economy_loans (user_id, principal, remaining, interest_rate, total_due, due_at)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [userId, principal, totalDue, interestRate, totalDue, dueAt]
    );
    return res.rows[0];
}

// ================== [ KREDİ OKUMA ] ==================
async function getActiveLoans(userId, db = pool) {
    const res = await db.query(
        `SELECT * FROM economy_loans
         WHERE user_id = $1 AND status IN ('active', 'overdue')
         ORDER BY due_at ASC`,
        [userId]
    );
    return res.rows;
}

async function getUserLoans(userId, limit = 5, db = pool) {
    const res = await db.query(
        `SELECT * FROM economy_loans
         WHERE user_id = $1
         ORDER BY
            CASE status WHEN 'overdue' THEN 0 WHEN 'active' THEN 1 ELSE 2 END,
            created_at DESC
         LIMIT $2`,
        [userId, limit]
    );
    return res.rows;
}

async function getLoanById(loanId, userId, db = pool) {
    const res = await db.query(
        `SELECT * FROM economy_loans WHERE id = $1 AND user_id = $2`,
        [loanId, userId]
    );
    return res.rows[0] || null;
}

// Transaction içinde satır kilidi ile çek (eşzamanlı ödeme çakışmasını önler)
async function getLoanByIdForUpdate(loanId, userId, db) {
    const res = await db.query(
        `SELECT * FROM economy_loans WHERE id = $1 AND user_id = $2 FOR UPDATE`,
        [loanId, userId]
    );
    return res.rows[0] || null;
}

// ================== [ KREDİ ÖDEME ] ==================
async function payLoan(loanId, userId, amount, db = pool) {
    await db.query(
        `UPDATE economy_loans
         SET remaining = remaining - $1, paid_amount = paid_amount + $1
         WHERE id = $2 AND user_id = $3`,
        [amount, loanId, userId]
    );
}

async function markLoanPaid(loanId, userId, db = pool) {
    await db.query(
        `UPDATE economy_loans
         SET status = 'paid', remaining = 0, paid_at = CURRENT_TIMESTAMP
         WHERE id = $1 AND user_id = $2`,
        [loanId, userId]
    );
}

// ================== [ GECİKME CEZASI ] ==================
async function applyLateFeeToLoan(loanId, userId, fee, db = pool) {
    await db.query(
        `UPDATE economy_loans
         SET remaining = remaining + $1,
             total_due = total_due + $1,
             status = 'overdue',
             late_fee_applied = true
         WHERE id = $2 AND user_id = $3 AND late_fee_applied = false`,
        [fee, loanId, userId]
    );
}

// ================== [ ÖZET BİLGİ ] ==================
async function getLoanSummary(userId, db = pool) {
    const res = await db.query(
        `SELECT
            COUNT(*) FILTER (WHERE status IN ('active', 'overdue')) AS active_count,
            COUNT(*) FILTER (WHERE status = 'overdue') AS overdue_count,
            COALESCE(SUM(remaining) FILTER (WHERE status IN ('active', 'overdue')), 0) AS active_debt
         FROM economy_loans WHERE user_id = $1`,
        [userId]
    );
    const r = res.rows[0];
    return {
        activeCount: Number(r.active_count) || 0,
        overdueCount: Number(r.overdue_count) || 0,
        activeDebt: Number(r.active_debt) || 0
    };
}

async function getServerLoanStats(db = pool) {
    const res = await db.query(
        `SELECT
            COUNT(*) FILTER (WHERE status IN ('active', 'overdue')) AS active_count,
            COALESCE(SUM(remaining) FILTER (WHERE status IN ('active', 'overdue')), 0) AS active_debt
         FROM economy_loans`
    );
    const r = res.rows[0];
    return {
        activeCount: Number(r.active_count) || 0,
        activeDebt: Number(r.active_debt) || 0
    };
}

async function getAverageCreditScore(db = pool) {
    const res = await db.query(
        `SELECT COALESCE(AVG(credit_score), 500)::numeric(10,2) AS avg_score FROM economy_users`
    );
    return Number(res.rows[0].avg_score) || 500;
}

// ================== [ KREDİ PUANI ] ==================
async function updateCreditScore(userId, delta, db = pool) {
    await db.query(
        `UPDATE economy_users
         SET credit_score = GREATEST(0, LEAST(1000, credit_score + $1))
         WHERE user_id = $2`,
        [delta, userId]
    );
}

async function getCreditScore(userId, db = pool) {
    const res = await db.query(
        `SELECT credit_score FROM economy_users WHERE user_id = $1`,
        [userId]
    );
    return res.rows[0] ? Number(res.rows[0].credit_score) : 500;
}

module.exports = {
    createLoan,
    getActiveLoans,
    getUserLoans,
    getLoanById,
    getLoanByIdForUpdate,
    payLoan,
    markLoanPaid,
    applyLateFeeToLoan,
    getLoanSummary,
    getServerLoanStats,
    getAverageCreditScore,
    updateCreditScore,
    getCreditScore
};
