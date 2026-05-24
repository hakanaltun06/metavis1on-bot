const { pool } = require('../database/pool');
const { BASE_MONEY_SUPPLY, PRICE_INDEX_MIN, PRICE_INDEX_MAX } = require('../utils/constants');

// ================== [ PARA ARZI ] ==================
// Sunucudaki toplam MetaCoin miktarını döner: cüzdan + banka.
// Opsiyonel db parametresi sayesinde transaction içinden de çağrılabilir.
async function getMoneySupply(db = pool) {
    const res = await db.query(`
        SELECT
            COALESCE(SUM(wallet), 0) AS total_w,
            COALESCE(SUM(bank), 0)   AS total_b
        FROM economy_users
    `);
    const row = res.rows[0];
    return {
        wallets: Number(row.total_w) || 0,
        banks: Number(row.total_b) || 0,
        total: (Number(row.total_w) || 0) + (Number(row.total_b) || 0)
    };
}

// ================== [ FİYAT KATSAYISI ] ==================
// Toplam para arzına göre piyasa fiyat katsayısını üretir.
// Parçalı doğrusal interpolasyon ile yumuşak geçiş sağlar.
// Sonuç her zaman [PRICE_INDEX_MIN, PRICE_INDEX_MAX] aralığındadır.
const INDEX_POINTS = [
    { money: 0,         index: 0.90 },
    { money: 2500000,   index: 0.97 },
    { money: 5000000,   index: 1.00 },
    { money: 10000000,  index: 1.20 },
    { money: 25000000,  index: 1.75 },
    { money: 50000000,  index: 2.50 },
    { money: 100000000, index: 3.20 }
];

function calculateInflationIndex(totalMoney) {
    const m = Math.max(0, Number(totalMoney) || 0);
    if (m <= INDEX_POINTS[0].money) return clampIndex(INDEX_POINTS[0].index);
    const last = INDEX_POINTS[INDEX_POINTS.length - 1];
    if (m >= last.money) return clampIndex(last.index);

    for (let i = 0; i < INDEX_POINTS.length - 1; i++) {
        const a = INDEX_POINTS[i];
        const b = INDEX_POINTS[i + 1];
        if (m >= a.money && m <= b.money) {
            const ratio = (m - a.money) / (b.money - a.money);
            return clampIndex(a.index + (b.index - a.index) * ratio);
        }
    }
    return 1.0; // güvenlik
}

function clampIndex(value) {
    return Math.max(PRICE_INDEX_MIN, Math.min(PRICE_INDEX_MAX, value));
}

// ================== [ PİYASA DURUMU METİNLERİ ] ==================
function getEconomyMood(index) {
    if (index < 0.95) return 'Ucuz Dönem';
    if (index < 1.10) return 'Dengeli Piyasa';
    if (index < 1.60) return 'Isınan Piyasa';
    if (index < 2.50) return 'Pahalı Dönem';
    return 'Sert Enflasyon';
}

function getPriceTrend(index) {
    if (index < 0.95) return 'Fiyatlar normalin biraz altında. Alışveriş için iyi bir zaman.';
    if (index < 1.10) return 'Fiyatlar normale yakın. Piyasa sakin.';
    if (index < 1.60) return 'Piyasa kıpırdanıyor. Fiyatlar normalin biraz üstünde.';
    if (index < 2.50) return 'Market fiyatları normalin üstünde. Cüzdanı korumakta fayda var.';
    return 'Sunucuda çok fazla MetaCoin dolaşımda. Fiyatlar oldukça yüksek.';
}

// Kullanıcıya görünen sade yüzde ifadesi
function formatPriceEffect(index) {
    const pct = Math.round((index - 1) * 100);
    if (pct === 0 || Math.abs(pct) <= 2) return 'Tam normal';
    if (pct > 0) return `%${pct} daha pahalı`;
    return `%${Math.abs(pct)} daha ucuz`;
}

// ================== [ FİYAT YUVARLAMA ] ==================
// Fiyatları kullanıcıya okunabilir tutmak için kademeli yuvarlama.
// Küçük fiyatlar olduğu gibi kalır, büyüdükçe daha yuvarlak değerlere çekilir.
function roundPrice(value) {
    const v = Math.max(1, Math.round(value));
    if (v < 100)      return v;
    if (v < 1000)     return Math.round(v / 10) * 10;
    if (v < 10000)    return Math.round(v / 50) * 50;
    if (v < 100000)   return Math.round(v / 100) * 100;
    if (v < 1000000)  return Math.round(v / 500) * 500;
    return Math.round(v / 1000) * 1000;
}

// ================== [ DİNAMİK FİYAT ] ==================
// Eşyanın güncel piyasa fiyatını döner.
// volatility yoksa 1.0 kabul edilir; mevcut sistem bozulmaz.
function getDynamicPrice(item, index) {
    if (!item) return 0;
    const v = (item.volatility != null) ? Number(item.volatility) : 1.0;
    // Etki şiddetini volatiliteye göre ölçeklendir, sonra üst/alt sınırı uygula.
    const effective = clampIndex(1 + (index - 1) * v);
    return roundPrice(Number(item.price) * effective);
}

module.exports = {
    BASE_MONEY_SUPPLY,
    getMoneySupply,
    calculateInflationIndex,
    getEconomyMood,
    getPriceTrend,
    formatPriceEffect,
    roundPrice,
    getDynamicPrice
};
