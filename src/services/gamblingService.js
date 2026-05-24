const { rand } = require('../utils/time');

const GAMBLE_MIN_BET = 50;
const GAMBLE_WIN_CHANCE = 0.45;
const GAMBLE_WIN_MULTIPLIER = 2.0;

const COINFLIP_MIN_BET = 10;
const SLOT_MIN_BET = 100;

const SLOT_EMOJIS = ['🍒', '🍋', '🍉', '⭐', '💎'];
const LUCKY_AMULET_BONUS = 0.05;

function rollSlot() {
    const a = SLOT_EMOJIS[rand(0, SLOT_EMOJIS.length - 1)];
    const b = SLOT_EMOJIS[rand(0, SLOT_EMOJIS.length - 1)];
    const c = SLOT_EMOJIS[rand(0, SLOT_EMOJIS.length - 1)];
    let multiplier = 0;
    if (a === b && b === c) {
        multiplier = a === '💎' ? 10 : 4;
    } else if (a === b || b === c || a === c) {
        multiplier = 1.5;
    }
    return { reels: [a, b, c], multiplier };
}

function rollCoinflip() {
    return Math.random() < 0.5 ? 'yazi' : 'tura';
}

function applyAmuletBonus(baseChance, hasAmulet) {
    return hasAmulet ? baseChance + LUCKY_AMULET_BONUS : baseChance;
}

module.exports = {
    GAMBLE_MIN_BET,
    GAMBLE_WIN_CHANCE,
    GAMBLE_WIN_MULTIPLIER,
    COINFLIP_MIN_BET,
    SLOT_MIN_BET,
    SLOT_EMOJIS,
    LUCKY_AMULET_BONUS,
    rollSlot,
    rollCoinflip,
    applyAmuletBonus
};
