module.exports = {
    COLORS: {
        SUCCESS: '#2ecc71',
        ERROR: '#e74c3c',
        INFO: '#3498db',
        WARNING: '#f1c40f',
        PREMIUM: '#9b59b6'
    },
    ECONOMY: {
        STARTING_BALANCE: 0,
        BANK_MAX_DEFAULT: 5000,
        DAILY_REWARD: 500,
        WORK: { MIN: 100, MAX: 300 },
        BEG: { MIN: 10, MAX: 50 },
        CRIME: { WIN_MIN: 300, WIN_MAX: 800, LOSE_MIN: 200, LOSE_MAX: 500, SUCCESS_RATE: 0.4 },
    },
    COOLDOWNS: {
        DAILY: 24 * 60 * 60 * 1000, // 24 Saat
        WORK: 60 * 60 * 1000,       // 1 Saat
        BEG: 15 * 60 * 1000,        // 15 Dakika
        CRIME: 4 * 60 * 60 * 1000,  // 4 Saat
    }
};