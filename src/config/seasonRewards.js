'use strict';

const { formatNumber } = require('../utils/format');

const CRATE_DISPLAY_NAMES = {
    basit_kasa:    'Basit Kasa',
    nadir_kasa:    'Nadir Kasa',
    nexus_kasa:    'Nexus Kasa',
    siber_kasa:    'Nexus Kasa',
    epik_kasa:     'Epik Kasa',
    neon_kasa:     'Neon Kasa',
    efsanevi_kasa: 'Efsanevi Kasa',
    prestij_kasa:  'Prestij Kasa'
};

// Envantere eklenebilir geçerli kasa kodları
const VALID_CRATE_CODES = new Set([
    'basit_kasa', 'nadir_kasa', 'nexus_kasa', 'siber_kasa',
    'epik_kasa', 'neon_kasa', 'efsanevi_kasa', 'prestij_kasa'
]);

// Toplam coin: 500+1000+2000+3000+5000 = 11.500 MetaCoin
const SEASON_REWARD_PATH = [
    {
        level: 1,
        code: 'season_l1_basic_crate',
        title: 'Başlangıç',
        rewards: [{ type: 'crate', itemCode: 'basit_kasa', quantity: 1 }]
    },
    {
        level: 2,
        code: 'season_l2_rare_crate',
        title: 'İlk Adım',
        rewards: [{ type: 'crate', itemCode: 'nadir_kasa', quantity: 1 }]
    },
    {
        level: 3,
        code: 'season_l3_nexus_crate',
        title: 'Atılım',
        rewards: [{ type: 'crate', itemCode: 'nexus_kasa', quantity: 1 }]
    },
    {
        level: 4,
        code: 'season_l4_rare_coin',
        title: 'Kararlılık',
        rewards: [
            { type: 'crate', itemCode: 'nadir_kasa', quantity: 1 },
            { type: 'coin', amount: 500 }
        ]
    },
    {
        level: 5,
        code: 'season_l5_epic_crate',
        title: 'Yükseliş',
        rewards: [{ type: 'crate', itemCode: 'epik_kasa', quantity: 1 }]
    },
    {
        level: 6,
        code: 'season_l6_rare2',
        title: 'Çaba',
        rewards: [{ type: 'crate', itemCode: 'nadir_kasa', quantity: 2 }]
    },
    {
        level: 7,
        code: 'season_l7_neon_crate',
        title: 'Parlama',
        rewards: [{ type: 'crate', itemCode: 'neon_kasa', quantity: 1 }]
    },
    {
        level: 8,
        code: 'season_l8_nexus_rare',
        title: 'Güç',
        rewards: [
            { type: 'crate', itemCode: 'nexus_kasa', quantity: 1 },
            { type: 'crate', itemCode: 'nadir_kasa', quantity: 1 }
        ]
    },
    {
        level: 9,
        code: 'season_l9_epic2',
        title: 'Derinlik',
        rewards: [{ type: 'crate', itemCode: 'epik_kasa', quantity: 2 }]
    },
    {
        level: 10,
        code: 'season_l10_neon_coin',
        title: 'Onuncu Seviye',
        rewards: [
            { type: 'crate', itemCode: 'neon_kasa', quantity: 1 },
            { type: 'coin', amount: 1000 }
        ]
    },
    {
        level: 11,
        code: 'season_l11_legend_crate',
        title: 'Efsane Kapısı',
        rewards: [{ type: 'crate', itemCode: 'efsanevi_kasa', quantity: 1 }]
    },
    {
        level: 12,
        code: 'season_l12_neon2',
        title: 'Neon Dalgası',
        rewards: [{ type: 'crate', itemCode: 'neon_kasa', quantity: 2 }]
    },
    {
        level: 13,
        code: 'season_l13_legend_epic',
        title: 'Titan',
        rewards: [
            { type: 'crate', itemCode: 'efsanevi_kasa', quantity: 1 },
            { type: 'crate', itemCode: 'epik_kasa', quantity: 1 }
        ]
    },
    {
        level: 14,
        code: 'season_l14_legend2',
        title: 'Efendi',
        rewards: [{ type: 'crate', itemCode: 'efsanevi_kasa', quantity: 2 }]
    },
    {
        level: 15,
        code: 'season_l15_prestij_coin',
        title: 'Prestij',
        rewards: [
            { type: 'crate', itemCode: 'prestij_kasa', quantity: 1 },
            { type: 'coin', amount: 2000 }
        ]
    },
    {
        level: 16,
        code: 'season_l16_legend2b',
        title: 'Demir İrade',
        rewards: [{ type: 'crate', itemCode: 'efsanevi_kasa', quantity: 2 }]
    },
    {
        level: 17,
        code: 'season_l17_prestij_neon',
        title: 'Kristal',
        rewards: [
            { type: 'crate', itemCode: 'prestij_kasa', quantity: 1 },
            { type: 'crate', itemCode: 'neon_kasa', quantity: 1 }
        ]
    },
    {
        level: 18,
        code: 'season_l18_legend3',
        title: 'Kozmik',
        rewards: [{ type: 'crate', itemCode: 'efsanevi_kasa', quantity: 3 }]
    },
    {
        level: 19,
        code: 'season_l19_prestij_legend',
        title: 'Doruk',
        rewards: [
            { type: 'crate', itemCode: 'prestij_kasa', quantity: 1 },
            { type: 'crate', itemCode: 'efsanevi_kasa', quantity: 1 }
        ]
    },
    {
        level: 20,
        code: 'season_l20_prestij2_coin',
        title: 'Yirminci Seviye',
        rewards: [
            { type: 'crate', itemCode: 'prestij_kasa', quantity: 2 },
            { type: 'coin', amount: 3000 }
        ]
    },
    {
        level: 21,
        code: 'season_l21_prestij2b',
        title: 'Yıldız',
        rewards: [{ type: 'crate', itemCode: 'prestij_kasa', quantity: 2 }]
    },
    {
        level: 22,
        code: 'season_l22_prestij_legend2',
        title: 'Omega',
        rewards: [
            { type: 'crate', itemCode: 'prestij_kasa', quantity: 1 },
            { type: 'crate', itemCode: 'efsanevi_kasa', quantity: 2 }
        ]
    },
    {
        level: 23,
        code: 'season_l23_prestij3',
        title: 'Seçkin',
        rewards: [{ type: 'crate', itemCode: 'prestij_kasa', quantity: 3 }]
    },
    {
        level: 24,
        code: 'season_l24_prestij2_legend',
        title: 'Galaktik',
        rewards: [
            { type: 'crate', itemCode: 'prestij_kasa', quantity: 2 },
            { type: 'crate', itemCode: 'efsanevi_kasa', quantity: 1 }
        ]
    },
    {
        level: 25,
        code: 'season_l25_prestij3_coin',
        title: 'Yirmi Beş',
        rewards: [
            { type: 'crate', itemCode: 'prestij_kasa', quantity: 3 },
            { type: 'coin', amount: 5000 }
        ]
    },
    {
        level: 26,
        code: 'season_l26_prestij4',
        title: 'Kutup Yıldızı',
        rewards: [{ type: 'crate', itemCode: 'prestij_kasa', quantity: 4 }]
    },
    {
        level: 27,
        code: 'season_l27_prestij3_legend2',
        title: 'Yenilmez',
        rewards: [
            { type: 'crate', itemCode: 'prestij_kasa', quantity: 3 },
            { type: 'crate', itemCode: 'efsanevi_kasa', quantity: 2 }
        ]
    },
    {
        level: 28,
        code: 'season_l28_prestij5',
        title: 'Ölümsüz',
        rewards: [{ type: 'crate', itemCode: 'prestij_kasa', quantity: 5 }]
    },
    {
        level: 29,
        code: 'season_l29_prestij6',
        title: 'Efsane',
        rewards: [{ type: 'crate', itemCode: 'prestij_kasa', quantity: 6 }]
    },
    {
        level: 30,
        code: 'season_l30_legend',
        title: 'Şampiyon',
        rewards: [
            { type: 'crate', itemCode: 'prestij_kasa', quantity: 6 },
            // Rozet 8.27 Unvan/Rozet aşamasına kadar payload'da saklanır; envantere eklenmez.
            { type: 'badge', itemCode: 'season_badge_s2', title: 'Sezon 2 Şampiyonu' }
        ]
    }
];

// Hızlı erişim için level → entry map
const REWARD_BY_LEVEL = new Map(SEASON_REWARD_PATH.map(e => [e.level, e]));

function getSeasonRewardByLevel(level) {
    return REWARD_BY_LEVEL.get(Number(level)) || null;
}

// Ödülleri kısa kullanıcı dostu metin olarak döndürür
// Örnek: "1× Basit Kasa", "500 MetaCoin", "1× Neon Kasa + 1.000 MetaCoin"
function formatSeasonReward(entry) {
    if (!entry || !entry.rewards) return '—';
    return entry.rewards.map(r => {
        if (r.type === 'coin') return `${formatNumber(r.amount)} MetaCoin`;
        if (r.type === 'crate' || r.type === 'item') {
            const name = CRATE_DISPLAY_NAMES[r.itemCode] || r.itemCode;
            return `${r.quantity}× ${name}`;
        }
        if (r.type === 'badge') return `🏅 ${r.title || 'Özel Rozet'}`;
        return '';
    }).filter(Boolean).join(' + ');
}

// Seviye için kısa özet satırı
function getSeasonRewardSummary(level) {
    const entry = getSeasonRewardByLevel(level);
    return entry ? formatSeasonReward(entry) : '—';
}

module.exports = {
    SEASON_REWARD_PATH,
    VALID_CRATE_CODES,
    CRATE_DISPLAY_NAMES,
    getSeasonRewardByLevel,
    formatSeasonReward,
    getSeasonRewardSummary
};
