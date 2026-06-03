// Default bot ayarları — tek merkezi kaynak.
// ensureDefaultSettings() bu listeyi bot_settings tablosuna idempotent şekilde yazar.
// Mevcut değerler ezilmez; sadece metadata (description, category, min/max) güncellenir.

const { COOLDOWNS } = require('../utils/constants');
const { INTEREST_RATE, INTEREST_INTERVAL_MS } = require('../services/bankService');
const {
    GAMBLE_MIN_BET,
    GAMBLE_WIN_CHANCE,
    GAMBLE_WIN_MULTIPLIER,
    COINFLIP_MIN_BET,
    SLOT_MIN_BET
} = require('../services/gamblingService');

// Her ayar: { key, value, valueType, category, description, minValue, maxValue, defaultValue, isSensitive }
// value ve defaultValue string olarak tutulur (DB TEXT kolonu).
// minValue/maxValue null ise kısıtlama yok (boolean ve text için null kullan).

const DEFAULT_SETTINGS = [

    // ==================[ COOLDOWN ]==================
    {
        key: 'cooldown.gamble_spam',
        value: String(COOLDOWNS.GAMBLE_SPAM),
        valueType: 'integer',
        category: 'cooldown',
        description: 'Kumar spam cooldown süresi (ms). /kumar /yazitura /slot arası bekleme.',
        minValue: 0, maxValue: 300000,
        defaultValue: String(COOLDOWNS.GAMBLE_SPAM),
        isSensitive: false
    },
    {
        key: 'cooldown.work',
        value: String(COOLDOWNS.WORK),
        valueType: 'integer',
        category: 'cooldown',
        description: 'Çalışma cooldown süresi (ms). /calis arası bekleme.',
        minValue: 0, maxValue: 86400000,
        defaultValue: String(COOLDOWNS.WORK),
        isSensitive: false
    },
    {
        key: 'cooldown.crime',
        value: String(COOLDOWNS.CRIME),
        valueType: 'integer',
        category: 'cooldown',
        description: 'Suç cooldown süresi (ms). /suc arası bekleme.',
        minValue: 0, maxValue: 86400000,
        defaultValue: String(COOLDOWNS.CRIME),
        isSensitive: false
    },
    {
        key: 'cooldown.rob',
        value: String(COOLDOWNS.ROB),
        valueType: 'integer',
        category: 'cooldown',
        description: 'Soygun cooldown süresi (ms). /soy arası bekleme.',
        minValue: 0, maxValue: 86400000,
        defaultValue: String(COOLDOWNS.ROB),
        isSensitive: false
    },
    {
        key: 'cooldown.beg',
        value: String(COOLDOWNS.BEG),
        valueType: 'integer',
        category: 'cooldown',
        description: 'Dileniş cooldown süresi (ms). /dilen arası bekleme.',
        minValue: 0, maxValue: 3600000,
        defaultValue: String(COOLDOWNS.BEG),
        isSensitive: false
    },
    {
        key: 'cooldown.daily',
        value: String(COOLDOWNS.DAILY),
        valueType: 'integer',
        category: 'cooldown',
        description: 'Günlük ödül cooldown süresi (ms). /gunluk arası bekleme.',
        minValue: 0, maxValue: 172800000,
        defaultValue: String(COOLDOWNS.DAILY),
        isSensitive: false
    },
    {
        key: 'cooldown.weekly',
        value: String(COOLDOWNS.WEEKLY),
        valueType: 'integer',
        category: 'cooldown',
        description: 'Haftalık ödül cooldown süresi (ms). /haftalik arası bekleme.',
        minValue: 0, maxValue: 1209600000,
        defaultValue: String(COOLDOWNS.WEEKLY),
        isSensitive: false
    },
    {
        key: 'cooldown.monthly',
        value: String(COOLDOWNS.MONTHLY),
        valueType: 'integer',
        category: 'cooldown',
        description: 'Aylık ödül cooldown süresi (ms). /aylik arası bekleme.',
        minValue: 0, maxValue: 5184000000,
        defaultValue: String(COOLDOWNS.MONTHLY),
        isSensitive: false
    },
    {
        key: 'cooldown.interest',
        value: String(INTEREST_INTERVAL_MS),
        valueType: 'integer',
        category: 'cooldown',
        description: 'Faiz cooldown süresi (ms). /faiz arası bekleme.',
        minValue: 0, maxValue: 86400000,
        defaultValue: String(INTEREST_INTERVAL_MS),
        isSensitive: false
    },

    // ==================[ SİSTEM TOGGLE ]==================
    {
        key: 'system.gambling_enabled',
        value: 'true',
        valueType: 'boolean',
        category: 'system',
        description: 'Kumar sistemini açar/kapatır (/kumar /yazitura /slot).',
        minValue: null, maxValue: null,
        defaultValue: 'true',
        isSensitive: false
    },
    {
        key: 'system.market_enabled',
        value: 'true',
        valueType: 'boolean',
        category: 'system',
        description: 'Market sistemini açar/kapatır (/market /satinal /kullan).',
        minValue: null, maxValue: null,
        defaultValue: 'true',
        isSensitive: false
    },
    {
        key: 'system.crate_opening_enabled',
        value: 'true',
        valueType: 'boolean',
        category: 'system',
        description: 'Kasa açma sistemini açar/kapatır (/kasa-ac).',
        minValue: null, maxValue: null,
        defaultValue: 'true',
        isSensitive: false
    },
    {
        key: 'system.loan_enabled',
        value: 'true',
        valueType: 'boolean',
        category: 'system',
        description: 'Kredi sistemini açar/kapatır (/kredi al).',
        minValue: null, maxValue: null,
        defaultValue: 'true',
        isSensitive: false
    },
    {
        key: 'system.interest_enabled',
        value: 'true',
        valueType: 'boolean',
        category: 'system',
        description: 'Faiz sistemini açar/kapatır (/faiz).',
        minValue: null, maxValue: null,
        defaultValue: 'true',
        isSensitive: false
    },
    {
        key: 'system.transfer_enabled',
        value: 'true',
        valueType: 'boolean',
        category: 'system',
        description: 'Para transferini açar/kapatır (/gonder).',
        minValue: null, maxValue: null,
        defaultValue: 'true',
        isSensitive: false
    },
    {
        key: 'system.season_points_enabled',
        value: 'true',
        valueType: 'boolean',
        category: 'system',
        description: 'Sezon puanı kazanımını açar/kapatır.',
        minValue: null, maxValue: null,
        defaultValue: 'true',
        isSensitive: false
    },
    {
        key: 'system.tasks_enabled',
        value: 'true',
        valueType: 'boolean',
        category: 'system',
        description: 'Görev sistemini açar/kapatır (/gorevler).',
        minValue: null, maxValue: null,
        defaultValue: 'true',
        isSensitive: false
    },
    {
        key: 'system.achievements_enabled',
        value: 'true',
        valueType: 'boolean',
        category: 'system',
        description: 'Başarım sistemini açar/kapatır (/basarimlar).',
        minValue: null, maxValue: null,
        defaultValue: 'true',
        isSensitive: false
    },

    // ==================[ KUMAR ]==================
    {
        key: 'gamble.min_bet',
        value: String(GAMBLE_MIN_BET),
        valueType: 'integer',
        category: 'gambling',
        description: '/kumar minimum bahis miktarı.',
        minValue: 1, maxValue: 10000000,
        defaultValue: String(GAMBLE_MIN_BET),
        isSensitive: false
    },
    {
        key: 'gamble.max_bet',
        // Mevcut kodda sabit tanımlı değil; güvenli varsayılan 1.000.000.
        // 8.17 Admin Kumar Yönetimi aşamasında gamblingService bunu okuyabilir.
        value: '1000000',
        valueType: 'integer',
        category: 'gambling',
        description: '/kumar maksimum bahis miktarı. (Mevcut kodda sabit yok; 8.17 bağlanacak.)',
        minValue: 1, maxValue: 100000000,
        defaultValue: '1000000',
        isSensitive: false
    },
    {
        key: 'gamble.win_chance',
        value: String(GAMBLE_WIN_CHANCE),
        valueType: 'float',
        category: 'gambling',
        description: '/kumar kazanma olasılığı (0.01–0.99).',
        minValue: 0.01, maxValue: 0.99,
        defaultValue: String(GAMBLE_WIN_CHANCE),
        isSensitive: false
    },
    {
        key: 'gamble.win_multiplier',
        value: String(GAMBLE_WIN_MULTIPLIER),
        valueType: 'float',
        category: 'gambling',
        description: '/kumar kazanma çarpanı (kazanılan = bahis × çarpan).',
        minValue: 1.1, maxValue: 10,
        defaultValue: String(GAMBLE_WIN_MULTIPLIER),
        isSensitive: false
    },
    {
        key: 'coinflip.min_bet',
        value: String(COINFLIP_MIN_BET),
        valueType: 'integer',
        category: 'gambling',
        description: '/yazitura minimum bahis miktarı.',
        minValue: 1, maxValue: 10000000,
        defaultValue: String(COINFLIP_MIN_BET),
        isSensitive: false
    },
    {
        key: 'coinflip.multiplier',
        value: '2',
        valueType: 'float',
        category: 'gambling',
        description: '/yazitura kazanma çarpanı (kazanırsan bahsin ×2 geri döner).',
        minValue: 1.1, maxValue: 5,
        defaultValue: '2',
        isSensitive: false
    },
    {
        key: 'slot.min_bet',
        value: String(SLOT_MIN_BET),
        valueType: 'integer',
        category: 'gambling',
        description: '/slot minimum bahis miktarı.',
        minValue: 1, maxValue: 10000000,
        defaultValue: String(SLOT_MIN_BET),
        isSensitive: false
    },
    {
        key: 'slot.jackpot_multiplier',
        value: '10',
        valueType: 'integer',
        category: 'gambling',
        description: '/slot jackpot çarpanı (3×💎 elde edildiğinde).',
        minValue: 2, maxValue: 100,
        defaultValue: '10',
        isSensitive: false
    },

    // ==================[ BANKA ]==================
    {
        key: 'bank.interest_rate',
        value: String(INTEREST_RATE),
        valueType: 'float',
        category: 'bank',
        description: 'Banka faiz oranı (her 12 saatte bir bankaya uygulanan oran).',
        minValue: 0, maxValue: 0.5,
        defaultValue: String(INTEREST_RATE),
        isSensitive: false
    },

    // ==================[ MARKET ]==================
    {
        key: 'market.global_multiplier',
        value: '1',
        valueType: 'float',
        category: 'market',
        description: 'Market fiyatlarına uygulanan global çarpan.',
        minValue: 0.1, maxValue: 10,
        defaultValue: '1',
        isSensitive: false
    },
    {
        key: 'market.inflation_enabled',
        value: 'true',
        valueType: 'boolean',
        category: 'market',
        description: 'Market enflasyon sistemini açar/kapatır.',
        minValue: null, maxValue: null,
        defaultValue: 'true',
        isSensitive: false
    },

    // ==================[ İLERLEME ]==================
    {
        key: 'tasks.reward_multiplier',
        value: '1',
        valueType: 'float',
        category: 'progression',
        description: 'Görev ödüllerine uygulanan çarpan.',
        minValue: 0.1, maxValue: 10,
        defaultValue: '1',
        isSensitive: false
    },
    {
        key: 'achievements.reward_multiplier',
        value: '1',
        valueType: 'float',
        category: 'progression',
        description: 'Başarım ödüllerine uygulanan çarpan.',
        minValue: 0.1, maxValue: 10,
        defaultValue: '1',
        isSensitive: false
    },
];

module.exports = { DEFAULT_SETTINGS };
