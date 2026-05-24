// Para birimi
const CURRENCY = "🪙";
const CURRENCY_NAME = "MetaCoin";

// Embed renkleri
const COLOR_SUCCESS = "#00FF7F";
const COLOR_ERROR = "#FF4500";
const COLOR_INFO = "#1E90FF";
const COLOR_WARNING = "#FFA500";
const COLOR_PREMIUM = "#FFD700";

// Banka seviyeleri
const BANK_LEVELS = [
    { level: 1,  limit: 50000,     upgradeCost: 0 },
    { level: 2,  limit: 150000,    upgradeCost: 25000 },
    { level: 3,  limit: 400000,    upgradeCost: 75000 },
    { level: 4,  limit: 1000000,   upgradeCost: 200000 },
    { level: 5,  limit: 2500000,   upgradeCost: 500000 },
    { level: 6,  limit: 5000000,   upgradeCost: 1250000 },
    { level: 7,  limit: 10000000,  upgradeCost: 3000000 },
    { level: 8,  limit: 25000000,  upgradeCost: 7500000 },
    { level: 9,  limit: 50000000,  upgradeCost: 18000000 },
    { level: 10, limit: 100000000, upgradeCost: 45000000 }
];

const INTEREST_INTERVAL_MS = 12 * 60 * 60 * 1000; // 12 saat
const INTEREST_RATE = 0.02; // %2

// Bekleme süreleri (ms)
const COOLDOWNS = {
    WORK: 3600000,        // 1 saat
    CRIME: 7200000,       // 2 saat
    ROB: 10800000,        // 3 saat
    BEG: 300000,          // 5 dakika
    DAILY: 86400000,      // 24 saat
    WEEKLY: 604800000,    // 7 gün
    MONTHLY: 2592000000   // 30 gün
};

// Enflasyon / piyasa ayarları
// Baz para arzı: tüm sunucudaki toplam para bu seviyeye yakınsa fiyatlar normal kabul edilir.
const BASE_MONEY_SUPPLY = 5000000;
const PRICE_INDEX_MIN = 0.90;
const PRICE_INDEX_MAX = 3.20;

// Market eşyaları
// volatility alanı opsiyoneldir; yoksa 1.0 kabul edilir.
//  - 1.0: normal duyarlılık
//  - >1.0: enflasyondan daha çok etkilenir (lüks/nadir)
//  - <1.0: enflasyondan daha az etkilenir (zorunlu/tüketim)
const SHOP_ITEMS = [
    { id: 'rob_shield', name: '🛡️ Soygun Kalkanı', desc: 'Seni bir soygundan korur. (Pasif)', price: 15000, type: 'passive', volatility: 1.0 },
    { id: 'lucky_amulet', name: '🍀 Şans Tılsımı', desc: 'Kumar oyunlarında şansını %5 artırır. (Pasif)', price: 50000, type: 'passive', volatility: 1.2 },
    { id: 'energy_drink', name: '⚡ Enerji İçeceği', desc: 'Çalışma ve suç bekleme sürelerini anında sıfırlar. (Kullanılabilir)', price: 7500, type: 'consumable', volatility: 0.85 },
    { id: 'vip_badge', name: '💎 VIP Rozeti', desc: 'Profili süsler, prestij göstergesidir.', price: 500000, type: 'flex', volatility: 1.3 }
];

module.exports = {
    CURRENCY,
    CURRENCY_NAME,
    COLOR_SUCCESS,
    COLOR_ERROR,
    COLOR_INFO,
    COLOR_WARNING,
    COLOR_PREMIUM,
    BANK_LEVELS,
    INTEREST_INTERVAL_MS,
    INTEREST_RATE,
    COOLDOWNS,
    SHOP_ITEMS,
    BASE_MONEY_SUPPLY,
    PRICE_INDEX_MIN,
    PRICE_INDEX_MAX
};
