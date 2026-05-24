const { rand } = require('../utils/time');

const CRIME_SUCCESS_CHANCE = 0.45;
const ROB_SUCCESS_CHANCE = 0.4;
const ROB_SELF_MIN_WALLET = 500;
const ROB_TARGET_MIN_WALLET = 500;
const ROB_PENALTY_RATE = 0.15;

const CRIME_SCENARIOS = [
    "Para nakil aracını soydun",
    "Gizli belgeleri sızdırdın",
    "Tefeciyi dolandırdın"
];

function rollCrime() {
    const win = Math.random() < CRIME_SUCCESS_CHANCE;
    if (win) {
        return {
            win: true,
            reward: rand(600, 1500),
            scenario: CRIME_SCENARIOS[rand(0, CRIME_SCENARIOS.length - 1)]
        };
    }
    return { win: false, penalty: rand(300, 800) };
}

function rollRob(targetWalletAmount) {
    const win = Math.random() < ROB_SUCCESS_CHANCE;
    if (win) {
        const pct = rand(10, 25) / 100;
        return { win: true, stolen: Math.floor(targetWalletAmount * pct) };
    }
    return { win: false };
}

function computeRobPenalty(selfWalletAmount) {
    return Math.floor(selfWalletAmount * ROB_PENALTY_RATE);
}

module.exports = {
    CRIME_SUCCESS_CHANCE,
    ROB_SUCCESS_CHANCE,
    ROB_SELF_MIN_WALLET,
    ROB_TARGET_MIN_WALLET,
    ROB_PENALTY_RATE,
    rollCrime,
    rollRob,
    computeRobPenalty
};
