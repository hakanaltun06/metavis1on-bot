const { getDynamicPrice } = require('./economyService');

const CRATE_TYPES = [
    {
        code: 'basit_kasa',
        name: '📦 Basit Kasa',
        desc: 'Ucuz ve düşük ödüllü bir başlangıç kasası.',
        basePrice: 15000,
        volatility: 1.0,
        rewards: [
            { type: 'coin', rarity: null, weight: 55, min: 2000, max: 12000 },
            { type: 'item', rarity: 'siradan', weight: 32 },
            { type: 'item', rarity: 'ender', weight: 11 },
            { type: 'item', rarity: 'epik', weight: 2 }
        ]
    },
    {
        code: 'nadir_kasa',
        name: '🎁 Nadir Kasa',
        desc: 'Daha iyi ödül ihtimali olan orta seviye kasa.',
        basePrice: 50000,
        volatility: 1.1,
        rewards: [
            { type: 'coin', rarity: null, weight: 35, min: 8000, max: 45000 },
            { type: 'item', rarity: 'siradan', weight: 25 },
            { type: 'item', rarity: 'ender', weight: 28 },
            { type: 'item', rarity: 'epik', weight: 10 },
            { type: 'item', rarity: 'efsanevi', weight: 2 }
        ]
    },
    {
        code: 'epik_kasa',
        name: '✨ Epik Kasa',
        desc: 'Ciddi ödül ihtimali olan yüksek seviye kasa.',
        basePrice: 150000,
        volatility: 1.2,
        rewards: [
            { type: 'coin', rarity: null, weight: 25, min: 25000, max: 120000 },
            { type: 'item', rarity: 'ender', weight: 30 },
            { type: 'item', rarity: 'epik', weight: 35 },
            { type: 'item', rarity: 'efsanevi', weight: 10 }
        ]
    },
    {
        code: 'efsanevi_kasa',
        name: '🏆 Efsanevi Kasa',
        desc: 'En yüksek ödül ihtimaline sahip pahalı kasa.',
        basePrice: 500000,
        volatility: 1.3,
        rewards: [
            { type: 'coin', rarity: null, weight: 20, min: 80000, max: 350000 },
            { type: 'item', rarity: 'epik', weight: 50 },
            { type: 'item', rarity: 'efsanevi', weight: 30 }
        ]
    }
];

const RARE_ITEMS = [
    // --- Sıradan ---
    { code: 'parlak_jeton',       name: 'Parlak Jeton',       rarity: 'siradan', sellValue: 3000 },
    { code: 'eski_rozet',         name: 'Eski Rozet',         rarity: 'siradan', sellValue: 4000 },
    { code: 'sansli_pul',         name: 'Şanslı Pul',         rarity: 'siradan', sellValue: 5000 },
    { code: 'kirik_usb',          name: 'Kırık USB Bellek',   rarity: 'siradan', sellValue: 3500 },
    { code: 'eski_veri_karti',    name: 'Eski Veri Kartı',    rarity: 'siradan', sellValue: 4500 },
    { code: 'bakir_devre_parcasi',name: 'Bakır Devre Parçası',rarity: 'siradan', sellValue: 5500 },
    { code: 'neon_sticker',       name: 'Neon Sticker',       rarity: 'siradan', sellValue: 6000 },
    // --- Ender ---
    { code: 'neon_kart',          name: 'Neon Kart',          rarity: 'ender', sellValue: 18000 },
    { code: 'altin_anahtar',      name: 'Altın Anahtar',      rarity: 'ender', sellValue: 25000 },
    { code: 'gizli_marka_rozeti', name: 'Gizli Marka Rozeti', rarity: 'ender', sellValue: 35000 },
    { code: 'sifreli_bellek',     name: 'Şifreli Bellek',     rarity: 'ender', sellValue: 20000 },
    { code: 'guvenlik_anahtari',  name: 'Güvenlik Anahtarı',  rarity: 'ender', sellValue: 28000 },
    { code: 'mavi_devre_karti',   name: 'Mavi Devre Kartı',   rarity: 'ender', sellValue: 32000 },
    { code: 'veri_rozeti',        name: 'Veri Rozeti',        rarity: 'ender', sellValue: 40000 },
    // --- Epik ---
    { code: 'kristal_cekirdek',   name: 'Kristal Çekirdek',   rarity: 'epik', sellValue: 80000 },
    { code: 'meta_muhru',         name: 'Meta Mührü',         rarity: 'epik', sellValue: 120000 },
    { code: 'siyah_kart',         name: 'Siyah Kart',         rarity: 'epik', sellValue: 160000 },
    { code: 'kuantum_cip',        name: 'Kuantum Çip',        rarity: 'epik', sellValue: 90000 },
    { code: 'neon_anahtar_karti', name: 'Neon Anahtar Kartı', rarity: 'epik', sellValue: 110000 },
    { code: 'sentinel_modulu',    name: 'Sentinel Modülü',    rarity: 'epik', sellValue: 145000 },
    { code: 'meta_kristali',      name: 'Meta Kristali',      rarity: 'epik', sellValue: 175000 },
    // --- Efsanevi ---
    { code: 'sentinel_taci',         name: 'Sentinel Tacı',         rarity: 'efsanevi', sellValue: 350000 },
    { code: 'metavis1on_parcasi',    name: 'metavis1on Parçası',    rarity: 'efsanevi', sellValue: 500000 },
    { code: 'sonsuzluk_rozeti',      name: 'Sonsuzluk Rozeti',      rarity: 'efsanevi', sellValue: 750000 },
    { code: 'altin_guvenlik_karti',  name: 'Altın Güvenlik Kartı',  rarity: 'efsanevi', sellValue: 380000 },
    { code: 'siyah_kasa_cekirdegi',  name: 'Siyah Kasa Çekirdeği',  rarity: 'efsanevi', sellValue: 560000 },
    { code: 'metavis1on_cekirdegi',  name: 'metavis1on Çekirdeği',  rarity: 'efsanevi', sellValue: 650000 },
    { code: 'dijital_tac',           name: 'Dijital Taç',           rarity: 'efsanevi', sellValue: 820000 }
];

const RARITY_INFO = {
    siradan:  { label: 'Sıradan',  emoji: '⚪', colorType: 'info' },
    ender:    { label: 'Ender',    emoji: '🟢', colorType: 'success' },
    epik:     { label: 'Epik',     emoji: '🟣', colorType: 'market' },
    efsanevi: { label: 'Efsanevi', emoji: '🟡', colorType: 'premium' }
};

function getCrateTypes() { return CRATE_TYPES; }
function getCrateByCode(code) { return CRATE_TYPES.find(c => c.code === code) || null; }
function getRareItems() { return RARE_ITEMS; }
function getRareItemByCode(code) { return RARE_ITEMS.find(i => i.code === code) || null; }
function getSellableItemByCode(code) { return RARE_ITEMS.find(i => i.code === code) || null; }

function isCrateItem(code) { return CRATE_TYPES.some(c => c.code === code); }
function isRareItem(code) { return RARE_ITEMS.some(i => i.code === code); }
function isSellableItem(code) { return RARE_ITEMS.some(i => i.code === code); }

function getRarityLabel(rarity) {
    return (RARITY_INFO[rarity] && RARITY_INFO[rarity].label) || rarity;
}

function getRarityEmoji(rarity) {
    return (RARITY_INFO[rarity] && RARITY_INFO[rarity].emoji) || '';
}

function getRarityColorType(rarity) {
    return (RARITY_INFO[rarity] && RARITY_INFO[rarity].colorType) || 'info';
}

function calculateCrateDynamicPrice(crate, inflationIndex) {
    return getDynamicPrice({ price: crate.basePrice, volatility: crate.volatility }, inflationIndex);
}

function rollCrate(crateCode) {
    const crate = getCrateByCode(crateCode);
    if (!crate) return null;

    const totalWeight = crate.rewards.reduce((sum, r) => sum + r.weight, 0);
    let roll = Math.random() * totalWeight;

    let selected = crate.rewards[crate.rewards.length - 1];
    for (const reward of crate.rewards) {
        roll -= reward.weight;
        if (roll <= 0) {
            selected = reward;
            break;
        }
    }

    if (selected.type === 'coin') {
        const amount = Math.floor(Math.random() * (selected.max - selected.min + 1)) + selected.min;
        return { type: 'coin', amount, rarity: null, item: null };
    }

    const itemsOfRarity = RARE_ITEMS.filter(i => i.rarity === selected.rarity);
    if (itemsOfRarity.length === 0) {
        return { type: 'coin', amount: 1000, rarity: null, item: null };
    }
    const item = itemsOfRarity[Math.floor(Math.random() * itemsOfRarity.length)];
    return { type: 'item', amount: 0, rarity: item.rarity, item };
}

function getCrateDisplay(crateCode) {
    const crate = getCrateByCode(crateCode);
    if (!crate) return null;
    return { code: crate.code, name: crate.name, desc: crate.desc };
}

function getCrateExpectedValue(crateCode) {
    const crate = getCrateByCode(crateCode);
    if (!crate) return 0;
    const totalWeight = crate.rewards.reduce((sum, r) => sum + r.weight, 0);
    let ev = 0;
    for (const reward of crate.rewards) {
        const prob = reward.weight / totalWeight;
        if (reward.type === 'coin') {
            ev += prob * ((reward.min + reward.max) / 2);
        } else {
            const items = RARE_ITEMS.filter(i => i.rarity === reward.rarity);
            if (items.length > 0) {
                const avgValue = items.reduce((s, i) => s + i.sellValue, 0) / items.length;
                ev += prob * avgValue;
            }
        }
    }
    return Math.round(ev);
}

module.exports = {
    CRATE_TYPES,
    RARE_ITEMS,
    RARITY_INFO,
    getCrateTypes,
    getCrateByCode,
    getRareItems,
    getRareItemByCode,
    getSellableItemByCode,
    isCrateItem,
    isRareItem,
    isSellableItem,
    getRarityLabel,
    getRarityEmoji,
    getRarityColorType,
    calculateCrateDynamicPrice,
    rollCrate,
    getCrateDisplay,
    getCrateExpectedValue
};
