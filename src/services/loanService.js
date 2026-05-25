// ================== [ KREDİ PUANI KADEMELERİ ] ==================
const CREDIT_TIERS = [
    { min: 800, max: 1000, key: 'very_trusted', name: 'Çok güvenilir', maxActive: 3, baseRate: 0.06 },
    { min: 650, max: 799,  key: 'trusted',      name: 'Güvenilir',     maxActive: 2, baseRate: 0.09 },
    { min: 500, max: 649,  key: 'normal',       name: 'Normal',        maxActive: 1, baseRate: 0.13 },
    { min: 350, max: 499,  key: 'risky',        name: 'Riskli',        maxActive: 1, baseRate: 0.18 },
    { min: 0,   max: 349,  key: 'very_risky',   name: 'Çok riskli',    maxActive: 0, baseRate: null }
];

function getCreditTier(score) {
    const s = Math.max(0, Math.min(1000, Number(score) || 0));
    return CREDIT_TIERS.find(t => s >= t.min && s <= t.max) || CREDIT_TIERS[CREDIT_TIERS.length - 1];
}

// ================== [ VADE SİSTEMİ ] ==================
const TERM_OPTIONS = {
    3:  { days: 3,  surcharge: 0.00, label: '3 gün' },
    7:  { days: 7,  surcharge: 0.02, label: '7 gün' },
    14: { days: 14, surcharge: 0.05, label: '14 gün' }
};

function getTermOption(value) {
    return TERM_OPTIONS[String(value)] || TERM_OPTIONS[String(Number(value))] || null;
}

function calculateDueDate(days) {
    const ms = Math.max(1, Math.floor(Number(days) || 0)) * 24 * 60 * 60 * 1000;
    return new Date(Date.now() + ms);
}

// ================== [ KREDİ LİMİTİ ] ==================
const LOAN_LIMIT_MIN = 10000;
const LOAN_LIMIT_MAX = 1000000;
const LOAN_AMOUNT_MIN = 1000;

function calculateLoanLimit(user) {
    const score = Math.max(0, Math.min(1000, Number(user.credit_score) || 500));
    const bankLevel = Math.max(1, Number(user.bank_level) || 1);
    const wallet = Number(user.wallet) || 0;
    const bank = Number(user.bank) || 0;
    const wealth = wallet + bank;

    const base = 25000;
    const fromScore = score * 100;
    const fromBank = bankLevel * 10000;
    const fromWealth = Math.floor(wealth * 0.15);

    const raw = base + fromScore + fromBank + fromWealth;
    return Math.max(LOAN_LIMIT_MIN, Math.min(LOAN_LIMIT_MAX, raw));
}

function getMaxActiveLoans(score) {
    return getCreditTier(score).maxActive;
}

// ================== [ FAİZ ORANI ] ==================
const RATE_FLOOR = 0.05;
const RATE_CEILING = 0.30;

function calculateBaseLoanRate(score) {
    const tier = getCreditTier(score);
    return tier.baseRate; // null olabilir (çok riskli)
}

// Enflasyon endeksi 1.00 → 0.00 ekleme
// Endeks 2.00 → +0.03 civarı; 3.20 → +0.04
// Çok sert olmasın diye eğri yumuşak tutuldu.
function calculateInflationLoanImpact(inflationIndex) {
    const i = Math.max(0.9, Math.min(3.5, Number(inflationIndex) || 1));
    const extra = Math.max(0, (i - 1)) * 0.02; // her 1 birim için +2 puan
    return Math.min(0.04, extra);
}

function calculateFinalLoanRate(score, inflationIndex, termSurcharge = 0) {
    const baseRate = calculateBaseLoanRate(score);
    if (baseRate == null) return null; // kredi alamaz
    const inflated = baseRate + calculateInflationLoanImpact(inflationIndex) + (Number(termSurcharge) || 0);
    return Math.max(RATE_FLOOR, Math.min(RATE_CEILING, inflated));
}

function calculateTotalDue(amount, rate) {
    const a = Math.max(0, Math.floor(Number(amount) || 0));
    const r = Math.max(0, Number(rate) || 0);
    // Önce faizi ayrı yuvarla, sonra anaparaya ekle.
    // Bu yaklaşım kayan nokta nedeniyle "11.300" yerine "11.299" gibi tek birim
    // sapmaları önler.
    return a + Math.round(a * r);
}

// ================== [ GECİKME CEZASI ] ==================
const LATE_FEE_RATE = 0.10;
const LATE_FEE_MIN = 1000;

function calculateLateFee(remaining) {
    const r = Math.max(0, Math.floor(Number(remaining) || 0));
    if (r <= 0) return 0;
    const fee = Math.floor(r * LATE_FEE_RATE);
    const safeFee = Math.max(LATE_FEE_MIN, fee);
    // Üst sınır: kalan borcun yarısından fazla ceza olmasın
    return Math.min(safeFee, Math.max(LATE_FEE_MIN, Math.floor(r * 0.5)));
}

// ================== [ KREDİ PUANI HAREKETLERİ ] ==================
const SCORE_DELTAS = {
    loan_paid_full: 25,
    loan_partial:   3,
    loan_overdue:  -40
};

function calculateCreditScoreChange(type) {
    return SCORE_DELTAS[type] || 0;
}

// ================== [ METİN YARDIMCILARI ] ==================
function getLoanStatusText(loan) {
    if (!loan) return 'Bilinmiyor';
    switch (loan.status) {
        case 'paid':      return 'Kapandı';
        case 'overdue':   return 'Gecikmiş';
        case 'active':    return 'Aktif';
        case 'defaulted': return 'Karşılıksız';
        default:          return loan.status;
    }
}

function getLoanRiskText(score) {
    return getCreditTier(score).name;
}

// ================== [ DOĞRULAMA ] ==================
function validateLoanAmount(amount, limit) {
    const a = Number(amount);
    if (!Number.isFinite(a) || a <= 0) return { ok: false, reason: 'invalid' };
    if (a < LOAN_AMOUNT_MIN)             return { ok: false, reason: 'too_small', min: LOAN_AMOUNT_MIN };
    if (a > limit)                       return { ok: false, reason: 'over_limit', limit };
    return { ok: true, amount: Math.floor(a) };
}

module.exports = {
    CREDIT_TIERS,
    TERM_OPTIONS,
    LOAN_LIMIT_MIN,
    LOAN_LIMIT_MAX,
    LOAN_AMOUNT_MIN,
    RATE_FLOOR,
    RATE_CEILING,
    LATE_FEE_RATE,
    LATE_FEE_MIN,
    SCORE_DELTAS,
    getCreditTier,
    getTermOption,
    calculateDueDate,
    calculateLoanLimit,
    getMaxActiveLoans,
    calculateBaseLoanRate,
    calculateInflationLoanImpact,
    calculateFinalLoanRate,
    calculateTotalDue,
    calculateLateFee,
    calculateCreditScoreChange,
    getLoanStatusText,
    getLoanRiskText,
    validateLoanAmount
};
