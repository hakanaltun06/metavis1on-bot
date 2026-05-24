const { rand } = require('../utils/time');

const JOBS = [
    "Bir yazılım firmasında küçük bir hatayı düzelttin",
    "Discord sunucusu kurup sattın",
    "Kafede barista olarak çalıştın",
    "Eski eşyalarını internetten sattın",
    "Serbest çalışan olarak grafik tasarım yaptın",
    "Bir gün taksi şoförlüğü yaptın"
];

const REWARDS = {
    DAILY_BASE: 500,
    DAILY_STREAK_BONUS_PER_DAY: 50,
    DAILY_STREAK_MAX_BONUS: 1000,
    WEEKLY: 5000,
    MONTHLY: 25000,
    WORK_MIN: 150,
    WORK_MAX: 450,
    BEG_MIN: 10,
    BEG_MAX: 80,
    BEG_REJECT_CHANCE: 0.3
};

function rollWorkReward() {
    return {
        job: JOBS[rand(0, JOBS.length - 1)],
        reward: rand(REWARDS.WORK_MIN, REWARDS.WORK_MAX)
    };
}

function rollBegResult() {
    if (Math.random() < REWARDS.BEG_REJECT_CHANCE) return { rejected: true };
    return { rejected: false, reward: rand(REWARDS.BEG_MIN, REWARDS.BEG_MAX) };
}

function computeDailyReward(currentStreak, diffDays) {
    let newStreak;
    if (diffDays === 1 || currentStreak === 0) {
        newStreak = currentStreak + 1;
    } else {
        newStreak = 1;
    }
    const streakBonus = Math.min(newStreak * REWARDS.DAILY_STREAK_BONUS_PER_DAY, REWARDS.DAILY_STREAK_MAX_BONUS);
    const totalReward = REWARDS.DAILY_BASE + streakBonus;
    return { newStreak, streakBonus, totalReward };
}

module.exports = { JOBS, REWARDS, rollWorkReward, rollBegResult, computeDailyReward };
