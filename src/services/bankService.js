const { BANK_LEVELS, INTEREST_RATE, INTEREST_INTERVAL_MS } = require('../utils/constants');

function getBankLevelDef(level) {
    const n = Math.max(1, Math.min(BANK_LEVELS.length, Number(level) || 1));
    return BANK_LEVELS[n - 1];
}

function getNextLevelDef(currentLevel) {
    if (currentLevel >= BANK_LEVELS.length) return null;
    return BANK_LEVELS[currentLevel]; // 0-tabanlı: seviye n için bir sonraki BANK_LEVELS[n]
}

function isMaxLevel(level) {
    return (level || 1) >= BANK_LEVELS.length;
}

function calculateFillPct(bank, limit) {
    return limit > 0 ? Math.min(100, Math.floor((bank / limit) * 100)) : 0;
}

function estimateInterest(bank) {
    return Math.floor(bank * INTEREST_RATE);
}

module.exports = {
    BANK_LEVELS,
    INTEREST_RATE,
    INTEREST_INTERVAL_MS,
    getBankLevelDef,
    getNextLevelDef,
    isMaxLevel,
    calculateFillPct,
    estimateInterest
};
