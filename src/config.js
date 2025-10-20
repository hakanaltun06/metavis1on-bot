export const COOLDOWNS = {
daily: 24 * 60 * 60 * 1000, // 24 saat
weekly: 7 * 24 * 60 * 60 * 1000,
work: 60 * 60 * 1000, // 1 saat
beg: 15 * 60 * 1000, // 15 dk
coinflip: 30 * 1000, // 30 sn
slots: 30 * 1000
};


export const ECONOMY = {
startBalance: 250,
workMin: 100,
workMax: 300,
begMin: 20,
begMax: 80,
taxRate: 0.0 // şimdilik yok
};


export const ADMIN = {
userIds: (process.env.ADMIN_USER_IDS || "").split(",").map(s=>s.trim()).filter(Boolean),
roleIds: (process.env.ADMIN_ROLE_IDS || "").split(",").map(s=>s.trim()).filter(Boolean)
};