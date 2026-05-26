// Para birimi
const CURRENCY = "🪙";
const CURRENCY_NAME = "MetaCoin";

// Embed renkleri
const COLOR_SUCCESS = "#2ECC71";
const COLOR_ERROR = "#E74C3C";
const COLOR_INFO = "#3498DB";
const COLOR_WARNING = "#F39C12";
const COLOR_PREMIUM = "#FFD700";

// Bağlama göre renkler — domain başına tutarlı görsel kimlik.
const COLOR_BANK      = "#1F3A93"; // koyu mavi — banka
const COLOR_MARKET    = "#9B59B6"; // mor — market
const COLOR_CREDIT    = "#16A085"; // turkuaz — kredi
const COLOR_ECONOMY   = "#F1C40F"; // altın — sunucu ekonomisi
const COLOR_INFLATION = "#E67E22"; // turuncu — piyasa/enflasyon
const COLOR_ADMIN     = "#34495E"; // koyu gri — yönetici
const COLOR_RISK      = "#C0392B"; // koyu kırmızı — risk/kumar
const COLOR_REWARD    = "#27AE60"; // yeşil — ödül
const COLOR_CRATE      = "#8E44AD"; // koyu mor — kasa
const COLOR_COLLECTION = "#E056A0"; // gül — koleksiyon

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
    { id: 'vip_badge',          name: '💎 VIP Rozeti',             desc: 'Profili süsler, prestij göstergesidir.',                                  price: 500000, type: 'flex',       volatility: 1.3  },
    { id: 'odak_kahvesi',       name: '☕ Odak Kahvesi',           desc: 'Çalışma bekleme süresini anında sıfırlar. (Kullanılabilir)',               price: 4500,   type: 'consumable', volatility: 0.80 },
    { id: 'risk_cipi',          name: '🎲 Risk Çipi',              desc: 'Suç bekleme süresini anında sıfırlar. (Kullanılabilir)',                   price: 8500,   type: 'consumable', volatility: 0.85 },
    { id: 'kasa_anahtari',      name: '🗝️ Kasa Anahtarı',         desc: 'Özel kasa/etkinlik sistemleri için saklanır. Şu an doğrudan kullanılmaz.', price: 35000,  type: 'flex',       volatility: 1.0  },
    { id: 'profil_cercevesi',   name: '🖼️ Neon Profil Çerçevesi', desc: 'Neon temalı prestij profil çerçevesi. Görsel eşya.',                      price: 150000, type: 'flex',       volatility: 1.2  },
    { id: 'kara_kart',          name: '🖤 Kara Kart',              desc: 'Yüksek seviye prestij eşyası. Koleksiyon değeri taşır.',                   price: 750000, type: 'flex',       volatility: 1.3  }
];

module.exports = {
    CURRENCY,
    CURRENCY_NAME,
    COLOR_SUCCESS,
    COLOR_ERROR,
    COLOR_INFO,
    COLOR_WARNING,
    COLOR_PREMIUM,
    COLOR_BANK,
    COLOR_MARKET,
    COLOR_CREDIT,
    COLOR_ECONOMY,
    COLOR_INFLATION,
    COLOR_ADMIN,
    COLOR_RISK,
    COLOR_REWARD,
    COLOR_CRATE,
    COLOR_COLLECTION,
    BANK_LEVELS,
    INTEREST_INTERVAL_MS,
    INTEREST_RATE,
    COOLDOWNS,
    SHOP_ITEMS,
    BASE_MONEY_SUPPLY,
    PRICE_INDEX_MIN,
    PRICE_INDEX_MAX
};
