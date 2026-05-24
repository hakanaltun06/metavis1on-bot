const { COOLDOWNS } = require('../utils/constants');
const { getMins } = require('../utils/time');

function checkCooldown(lastTimestamp, ms) {
    if (!lastTimestamp) return { ready: true, leftMs: 0 };
    const now = Date.now();
    const diff = now - new Date(lastTimestamp).getTime();
    if (diff >= ms) return { ready: true, leftMs: 0 };
    return { ready: false, leftMs: ms - diff };
}

function formatRemaining(lastTimestamp, ms) {
    const c = checkCooldown(lastTimestamp, ms);
    if (c.ready) return '🟢 Hazır';
    return `⏳ ${getMins(c.leftMs)} dk kaldı`;
}

module.exports = { COOLDOWNS, checkCooldown, formatRemaining };
