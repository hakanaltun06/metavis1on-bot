'use strict';

const { MessageFlags }  = require('discord.js');
const { requireOwner }  = require('../../utils/permissions');
const { createEmbed }   = require('../../utils/embeds');
const { formatNumber, formatDateTime } = require('../../utils/format');
const { awaitAdminConfirmation }       = require('../../utils/adminConfirmations');
const { ensureUser }    = require('../../database/users');
const { checkItem }     = require('../../database/inventory');
const {
    getRecentAdminLogs, getUserAdminLogs, getActorLogs, formatAdminLogEntry
} = require('../../services/adminLogService');
const {
    getAdminUserOverview,
    getAdminInventoryOverview,
    getAdminCreditOverview,
    getAdminSeasonOverview,
    adminMoneyOperation,
    adminInventoryOperation,
    adminSeasonPointsOperation,
    isValidItemCode,
    getItemDisplayName,
    getAdminCooldownOverview,
    getGlobalCooldownSettings,
    resetUserCooldown,
    resetAllUserCooldowns,
    reduceUserCooldown,
    extendUserCooldown,
    setUserCooldownRemaining,
    setGlobalCooldown,
    resetGlobalCooldown,
    COOLDOWN_COMMANDS,
    MAX_USER_COOLDOWN_MS,
} = require('../../services/adminControlService');
const { getLoanRiskText } = require('../../services/loanService');
const {
    getNumberSetting, getBooleanSetting, listSettings, setSetting, resetSetting
} = require('../../services/settingsService');
const {
    getEconomyOverview,
    getMoneyFlowReport,
    getRichestUsers,
    getCreditRiskReport,
    getInventoryEconomyReport,
    getAdminImpactReport,
    getSuspiciousEconomyReport,
} = require('../../services/adminEconomyReportService');

// ==================[ YARDIMCI ]==================

const KOMUT_CHOICES = [
    { name: 'Günlük',   value: 'gunluk'   },
    { name: 'Haftalık', value: 'haftalik' },
    { name: 'Aylık',    value: 'aylik'    },
    { name: 'Çalış',    value: 'calis'    },
    { name: 'Dilen',    value: 'dilen'    },
    { name: 'Suç',      value: 'suc'      },
    { name: 'Soy',      value: 'soy'      },
    { name: 'Faiz',     value: 'faiz'     },
    { name: 'Kumar',    value: 'kumar'    },
    { name: 'Yazı-Tura', value: 'yazitura' },
    { name: 'Slot',     value: 'slot'     },
];

const KUMAR_AYAR_CHOICES = [
    { name: 'Kumar Min Bahis',        value: 'gamble_min_bet'       },
    { name: 'Kumar Max Bahis',        value: 'gamble_max_bet'       },
    { name: 'Kumar Kazanma %',        value: 'gamble_win_chance'    },
    { name: 'Kumar Kazanc Carpani',   value: 'gamble_multiplier'    },
    { name: 'Yazi-Tura Min Bahis',    value: 'coinflip_min_bet'     },
    { name: 'Yazi-Tura Max Bahis',    value: 'coinflip_max_bet'     },
    { name: 'Yazi-Tura Carpani',      value: 'coinflip_multiplier'  },
    { name: 'Slot Min Bahis',         value: 'slot_min_bet'         },
    { name: 'Slot Max Bahis',         value: 'slot_max_bet'         },
    { name: 'Slot Jackpot Carpani',   value: 'slot_jackpot'         },
];

// ayar choice → { settingKey, isPercentage, defaultValue, displayName }
const KUMAR_AYAR_MAP = {
    gamble_min_bet:      { key: 'gamble.min_bet',          isPercentage: false, defaultValue: 50,      displayName: 'Kumar Min Bahis'      },
    gamble_max_bet:      { key: 'gamble.max_bet',          isPercentage: false, defaultValue: 1000000, displayName: 'Kumar Max Bahis'      },
    gamble_win_chance:   { key: 'gamble.win_chance',       isPercentage: true,  defaultValue: 0.45,    displayName: 'Kumar Kazanma Oranı'  },
    gamble_multiplier:   { key: 'gamble.win_multiplier',   isPercentage: false, defaultValue: 2.0,     displayName: 'Kumar Kazanç Çarpanı' },
    coinflip_min_bet:    { key: 'coinflip.min_bet',        isPercentage: false, defaultValue: 10,      displayName: 'Yazı-Tura Min Bahis'  },
    coinflip_max_bet:    { key: 'coinflip.max_bet',        isPercentage: false, defaultValue: 1000000, displayName: 'Yazı-Tura Max Bahis'  },
    coinflip_multiplier: { key: 'coinflip.multiplier',     isPercentage: false, defaultValue: 2.0,     displayName: 'Yazı-Tura Çarpanı'   },
    slot_min_bet:        { key: 'slot.min_bet',            isPercentage: false, defaultValue: 100,     displayName: 'Slot Min Bahis'       },
    slot_max_bet:        { key: 'slot.max_bet',            isPercentage: false, defaultValue: 1000000, displayName: 'Slot Max Bahis'       },
    slot_jackpot:        { key: 'slot.jackpot_multiplier', isPercentage: false, defaultValue: 10,      displayName: 'Slot Jackpot Çarpanı' },
};

// Kazanma oranı % olarak alınıp 0.01-0.95 aralığında validate edilir
function validateWinChancePct(pct) {
    return Number.isFinite(pct) && pct >= 1 && pct <= 95;
}

function getKumarRiskLevel(ayarChoice, rawDeger) {
    if (ayarChoice === 'gamble_win_chance' && rawDeger > 70) return 'high';
    if ((ayarChoice === 'gamble_multiplier' || ayarChoice === 'coinflip_multiplier') && rawDeger > 3) return 'high';
    if (ayarChoice === 'slot_jackpot' && rawDeger > 20) return 'high';
    if ((['gamble_max_bet', 'coinflip_max_bet', 'slot_max_bet'].includes(ayarChoice)) && rawDeger > 500000) return 'high';
    return 'normal';
}

function fmtKumarValue(ayarChoice, storedValue) {
    const info = KUMAR_AYAR_MAP[ayarChoice];
    if (!info) return String(storedValue);
    if (info.isPercentage) return `%${Math.round(storedValue * 100)}`;
    return formatNumber(storedValue);
}

const SISTEM_CHOICES = [
    { name: 'Kumar (Slot / Yazı-Tura)',     value: 'gambling'      },
    { name: 'Market (Satın Al / Sat)',       value: 'market'        },
    { name: 'Kasa Açma',                    value: 'crate_opening' },
    { name: 'Kredi Alma',                   value: 'loan'          },
    { name: 'Faiz',                         value: 'interest'      },
    { name: 'Para Transferi',               value: 'transfer'      },
    { name: 'Sezon Puanı Kazanımı',         value: 'season_points' },
    { name: 'Görevler (İlerleme / Ödül)',   value: 'tasks'         },
    { name: 'Başarımlar (İlerleme / Ödül)', value: 'achievements'  },
];

const SISTEM_MAP = {
    gambling:      { key: 'system.gambling_enabled',      label: 'Kumar',          commands: '/kumar · /yazitura · /slot',                    riskLevel: 'high'   },
    market:        { key: 'system.market_enabled',         label: 'Market',         commands: '/market · /satinal · /sat',                    riskLevel: 'high'   },
    crate_opening: { key: 'system.crate_opening_enabled',  label: 'Kasa Açma',      commands: '/kasa-ac',                                     riskLevel: 'high'   },
    loan:          { key: 'system.loan_enabled',           label: 'Kredi Alma',     commands: '/kredi al (görüntüleme ve ödeme açık kalır)',   riskLevel: 'high'   },
    interest:      { key: 'system.interest_enabled',       label: 'Faiz',           commands: '/faiz',                                        riskLevel: 'normal' },
    transfer:      { key: 'system.transfer_enabled',       label: 'Para Transferi', commands: '/gonder',                                      riskLevel: 'high'   },
    season_points: { key: 'system.season_points_enabled',  label: 'Sezon Puanı',    commands: 'Puan kazanımı (görüntüleme açık kalır)',        riskLevel: 'normal' },
    tasks:         { key: 'system.tasks_enabled',          label: 'Görevler',       commands: '/gorevler ilerleme ve ödül alma',               riskLevel: 'normal' },
    achievements:  { key: 'system.achievements_enabled',   label: 'Başarımlar',     commands: '/basarimlar ilerleme ve ödül alma',             riskLevel: 'normal' },
};

function fmtMs(ms) {
    if (ms <= 0) return '🟢 Hazır';
    const totalSec = Math.ceil(ms / 1000);
    if (totalSec < 60) return `⏳ ${totalSec}s`;
    const mins = Math.floor(totalSec / 60);
    const secs = totalSec % 60;
    if (mins < 60) return `⏳ ${mins}d ${secs}s`;
    const hours = Math.floor(mins / 60);
    const rem = mins % 60;
    if (hours < 24) return `⏳ ${hours}sa ${rem}d`;
    const days = Math.floor(hours / 24);
    return `⏳ ${days}gün ${hours % 24}sa`;
}

function alanToField(alanOpt)  { return alanOpt === 'banka' ? 'bank' : 'wallet'; }
function alanToLabel(field)    { return field === 'bank' ? 'Banka' : 'Cüzdan'; }
function safeLimit(raw, def)   { return Math.max(1, Math.min(50, raw || def)); }
function clamp(v, min, max)    { return Math.max(min, Math.min(max, v)); }

function editError(interaction, msg) {
    return interaction.editReply({
        embeds: [createEmbed('error', '⚠️ İşlem Başarısız', msg)]
    });
}

function editInfo(interaction, title, msg) {
    return interaction.editReply({
        embeds: [createEmbed('info', title, msg)]
    });
}

// ==================[ KOMUT TANIMI ]==================

module.exports = {
    data: {
        name: 'admin',
        description: 'Bot sahibine özel admin kontrol merkezi.',
        options: [
            {
                name: 'kullanici',
                description: 'Kullanıcı inceleme işlemleri.',
                type: 2,
                options: [
                    {
                        name: 'incele',
                        description: 'Kullanıcının tüm ekonomi bilgilerini detaylı inceler.',
                        type: 1,
                        options: [
                            { name: 'kullanici', type: 6, description: 'İncelenecek kullanıcı.', required: true }
                        ]
                    }
                ]
            },
            {
                name: 'para',
                description: 'Para yönetimi işlemleri.',
                type: 2,
                options: [
                    {
                        name: 'ekle',
                        description: 'Kullanıcıya MetaCoin ekler.',
                        type: 1,
                        options: [
                            { name: 'kullanici', type: 6, description: 'Hedef kullanıcı.', required: true },
                            { name: 'miktar',    type: 4, description: 'Eklenecek MetaCoin miktarı.', required: true, min_value: 1 },
                            { name: 'sebep',     type: 3, description: 'İşlem sebebi.',               required: true },
                            {
                                name: 'alan', type: 3, description: 'Hedef alan (varsayılan: cüzdan).', required: false,
                                choices: [
                                    { name: 'Cüzdan', value: 'cuzdan' },
                                    { name: 'Banka',  value: 'banka'  }
                                ]
                            }
                        ]
                    },
                    {
                        name: 'sil',
                        description: 'Kullanıcıdan MetaCoin siler.',
                        type: 1,
                        options: [
                            { name: 'kullanici', type: 6, description: 'Hedef kullanıcı.', required: true },
                            { name: 'miktar',    type: 4, description: 'Silinecek MetaCoin miktarı.', required: true, min_value: 1 },
                            { name: 'sebep',     type: 3, description: 'İşlem sebebi.',               required: true },
                            {
                                name: 'alan', type: 3, description: 'Hedef alan (varsayılan: cüzdan).', required: false,
                                choices: [
                                    { name: 'Cüzdan', value: 'cuzdan' },
                                    { name: 'Banka',  value: 'banka'  }
                                ]
                            }
                        ]
                    },
                    {
                        name: 'ayarla',
                        description: 'Kullanıcının bakiyesini belirli bir değere ayarlar.',
                        type: 1,
                        options: [
                            { name: 'kullanici', type: 6, description: 'Hedef kullanıcı.', required: true },
                            {
                                name: 'alan', type: 3, description: 'Hedef alan.', required: true,
                                choices: [
                                    { name: 'Cüzdan', value: 'cuzdan' },
                                    { name: 'Banka',  value: 'banka'  }
                                ]
                            },
                            { name: 'miktar', type: 4, description: 'Yeni bakiye değeri.', required: true, min_value: 0 },
                            { name: 'sebep',  type: 3, description: 'İşlem sebebi.',       required: true }
                        ]
                    }
                ]
            },
            {
                name: 'envanter',
                description: 'Envanter yönetimi işlemleri.',
                type: 2,
                options: [
                    {
                        name: 'listele',
                        description: 'Kullanıcının envanterini listeler.',
                        type: 1,
                        options: [
                            { name: 'kullanici', type: 6, description: 'Hedef kullanıcı.', required: true }
                        ]
                    },
                    {
                        name: 'ver',
                        description: 'Kullanıcıya eşya verir.',
                        type: 1,
                        options: [
                            { name: 'kullanici', type: 6, description: 'Hedef kullanıcı.', required: true },
                            { name: 'esya',      type: 3, description: 'Eşya kodu.',        required: true },
                            { name: 'adet',      type: 4, description: 'Verilecek adet.',   required: true, min_value: 1 },
                            { name: 'sebep',     type: 3, description: 'İşlem sebebi.',     required: true }
                        ]
                    },
                    {
                        name: 'sil',
                        description: 'Kullanıcıdan eşya siler.',
                        type: 1,
                        options: [
                            { name: 'kullanici', type: 6, description: 'Hedef kullanıcı.', required: true },
                            { name: 'esya',      type: 3, description: 'Eşya kodu.',        required: true },
                            { name: 'adet',      type: 4, description: 'Silinecek adet.',  required: true, min_value: 1 },
                            { name: 'sebep',     type: 3, description: 'İşlem sebebi.',     required: true }
                        ]
                    },
                    {
                        name: 'ayarla',
                        description: 'Kullanıcının eşya adedini belirli bir değere ayarlar.',
                        type: 1,
                        options: [
                            { name: 'kullanici', type: 6, description: 'Hedef kullanıcı.', required: true },
                            { name: 'esya',      type: 3, description: 'Eşya kodu.',        required: true },
                            { name: 'adet',      type: 4, description: 'Yeni adet değeri.',  required: true, min_value: 0 },
                            { name: 'sebep',     type: 3, description: 'İşlem sebebi.',     required: true }
                        ]
                    }
                ]
            },
            {
                name: 'kredi',
                description: 'Kredi inceleme işlemleri.',
                type: 2,
                options: [
                    {
                        name: 'incele',
                        description: 'Kullanıcının kredi durumunu inceler.',
                        type: 1,
                        options: [
                            { name: 'kullanici', type: 6, description: 'İncelenecek kullanıcı.', required: true }
                        ]
                    }
                ]
            },
            {
                name: 'sezon',
                description: 'Sezon yönetimi işlemleri.',
                type: 2,
                options: [
                    {
                        name: 'incele',
                        description: 'Kullanıcının sezon durumunu inceler.',
                        type: 1,
                        options: [
                            { name: 'kullanici', type: 6, description: 'İncelenecek kullanıcı.', required: true }
                        ]
                    },
                    {
                        name: 'puan-ekle',
                        description: 'Kullanıcıya sezon puanı ekler.',
                        type: 1,
                        options: [
                            { name: 'kullanici', type: 6, description: 'Hedef kullanıcı.',        required: true },
                            { name: 'miktar',    type: 4, description: 'Eklenecek puan miktarı.', required: true, min_value: 1 },
                            { name: 'sebep',     type: 3, description: 'İşlem sebebi.',           required: true }
                        ]
                    },
                    {
                        name: 'puan-sil',
                        description: 'Kullanıcıdan sezon puanı siler.',
                        type: 1,
                        options: [
                            { name: 'kullanici', type: 6, description: 'Hedef kullanıcı.',        required: true },
                            { name: 'miktar',    type: 4, description: 'Silinecek puan miktarı.', required: true, min_value: 1 },
                            { name: 'sebep',     type: 3, description: 'İşlem sebebi.',           required: true }
                        ]
                    }
                ]
            },
            {
                name: 'log',
                description: 'Admin log görüntüleme işlemleri.',
                type: 2,
                options: [
                    {
                        name: 'listele',
                        description: 'Son admin işlemlerini listeler.',
                        type: 1,
                        options: [
                            { name: 'limit', type: 4, description: 'Gösterilecek kayıt sayısı (1–50).', required: false, min_value: 1, max_value: 50 }
                        ]
                    },
                    {
                        name: 'kullanici',
                        description: 'Belirli bir kullanıcıya yapılan admin işlemlerini listeler.',
                        type: 1,
                        options: [
                            { name: 'kullanici', type: 6, description: 'Hedef kullanıcı.', required: true },
                            { name: 'limit',     type: 4, description: 'Gösterilecek kayıt sayısı (1–50).', required: false, min_value: 1, max_value: 50 }
                        ]
                    },
                    {
                        name: 'aktor',
                        description: 'Belirli bir admin tarafından yapılan işlemleri listeler.',
                        type: 1,
                        options: [
                            { name: 'kullanici', type: 6, description: 'Admin kullanıcı.', required: true },
                            { name: 'limit',     type: 4, description: 'Gösterilecek kayıt sayısı (1–50).', required: false, min_value: 1, max_value: 50 }
                        ]
                    }
                ]
            },
            {
                name: 'bekleme',
                description: 'Bekleme süresi yönetimi işlemleri.',
                type: 2,
                options: [
                    {
                        name: 'durum',
                        description: 'Kullanıcının tüm bekleme sürelerini gösterir.',
                        type: 1,
                        options: [
                            { name: 'kullanici', type: 6, description: 'Hedef kullanıcı.', required: true }
                        ]
                    },
                    {
                        name: 'sifirla',
                        description: 'Kullanıcının belirli bir komut için bekleme süresini sıfırlar.',
                        type: 1,
                        options: [
                            { name: 'kullanici', type: 6, description: 'Hedef kullanıcı.', required: true },
                            { name: 'komut',     type: 3, description: 'Sıfırlanacak komut.', required: true, choices: KOMUT_CHOICES },
                            { name: 'sebep',     type: 3, description: 'İşlem sebebi.', required: true }
                        ]
                    },
                    {
                        name: 'azalt',
                        description: 'Kullanıcının bekleme süresini belirtilen saniye azaltır.',
                        type: 1,
                        options: [
                            { name: 'kullanici', type: 6, description: 'Hedef kullanıcı.', required: true },
                            { name: 'komut',     type: 3, description: 'Hedef komut.', required: true, choices: KOMUT_CHOICES },
                            { name: 'sure',      type: 4, description: 'Azaltılacak süre (saniye).', required: true, min_value: 1 },
                            { name: 'sebep',     type: 3, description: 'İşlem sebebi.', required: true }
                        ]
                    },
                    {
                        name: 'uzat',
                        description: 'Kullanıcının bekleme süresini belirtilen saniye uzatır.',
                        type: 1,
                        options: [
                            { name: 'kullanici', type: 6, description: 'Hedef kullanıcı.', required: true },
                            { name: 'komut',     type: 3, description: 'Hedef komut.', required: true, choices: KOMUT_CHOICES },
                            { name: 'sure',      type: 4, description: 'Uzatılacak süre (saniye).', required: true, min_value: 1 },
                            { name: 'sebep',     type: 3, description: 'İşlem sebebi.', required: true }
                        ]
                    },
                    {
                        name: 'ayarla',
                        description: 'Kullanıcının bekleme süresini belirtilen saniyeye ayarlar (0 = hazır).',
                        type: 1,
                        options: [
                            { name: 'kullanici', type: 6, description: 'Hedef kullanıcı.', required: true },
                            { name: 'komut',     type: 3, description: 'Hedef komut.', required: true, choices: KOMUT_CHOICES },
                            { name: 'sure',      type: 4, description: 'Kalan süre (saniye, 0 = hazır).', required: true, min_value: 0 },
                            { name: 'sebep',     type: 3, description: 'İşlem sebebi.', required: true }
                        ]
                    },
                    {
                        name: 'tumunu-sifirla',
                        description: 'Kullanıcının tüm bekleme sürelerini sıfırlar.',
                        type: 1,
                        options: [
                            { name: 'kullanici', type: 6, description: 'Hedef kullanıcı.', required: true },
                            { name: 'sebep',     type: 3, description: 'İşlem sebebi.', required: true }
                        ]
                    },
                    {
                        name: 'global-goster',
                        description: 'Tüm global bekleme süresi ayarlarını gösterir.',
                        type: 1,
                        options: []
                    },
                    {
                        name: 'global-ayarla',
                        description: 'Bir komutun global bekleme süresini değiştirir.',
                        type: 1,
                        options: [
                            { name: 'komut', type: 3, description: 'Hedef komut.', required: true, choices: KOMUT_CHOICES },
                            { name: 'sure',  type: 4, description: 'Yeni bekleme süresi (saniye).', required: true, min_value: 1 },
                            { name: 'sebep', type: 3, description: 'İşlem sebebi.', required: true }
                        ]
                    },
                    {
                        name: 'global-sifirla',
                        description: 'Bir komutun global bekleme süresini varsayılana döndürür.',
                        type: 1,
                        options: [
                            { name: 'komut', type: 3, description: 'Hedef komut.', required: true, choices: KOMUT_CHOICES },
                            { name: 'sebep', type: 3, description: 'İşlem sebebi.', required: true }
                        ]
                    }
                ]
            },
            {
                name: 'kumar',
                description: 'Kumar sistemi yönetimi işlemleri.',
                type: 2,
                options: [
                    {
                        name: 'durum',
                        description: 'Kumar sisteminin genel durumunu ve tüm ayarlarını gösterir.',
                        type: 1,
                        options: []
                    },
                    {
                        name: 'ayar-goster',
                        description: 'Tüm gambling kategorisi ayarlarını min/max/default ile listeler.',
                        type: 1,
                        options: []
                    },
                    {
                        name: 'ayar-ayarla',
                        description: 'Bir kumar ayarını değiştirir. Kazanma oranı için yüzde girin (45 = %45).',
                        type: 1,
                        options: [
                            { name: 'ayar',  type: 3,  description: 'Değiştirilecek ayar.', required: true, choices: KUMAR_AYAR_CHOICES },
                            { name: 'deger', type: 10, description: 'Yeni değer. Kazanma oranı için yüzde (1-95), diğerleri için doğrudan değer.', required: true, min_value: 0.01 },
                            { name: 'sebep', type: 3,  description: 'İşlem sebebi.', required: true }
                        ]
                    },
                    {
                        name: 'ac',
                        description: 'Kumar sistemini açar (/kumar /yazitura /slot aktif olur).',
                        type: 1,
                        options: [
                            { name: 'sebep', type: 3, description: 'İşlem sebebi.', required: true }
                        ]
                    },
                    {
                        name: 'kapat',
                        description: 'Kumar sistemini geçici olarak kapatır (/kumar /yazitura /slot devre dışı).',
                        type: 1,
                        options: [
                            { name: 'sebep', type: 3, description: 'İşlem sebebi.', required: true }
                        ]
                    },
                    {
                        name: 'varsayilana-dondur',
                        description: 'Bir kumar ayarını varsayılan değerine döndürür.',
                        type: 1,
                        options: [
                            { name: 'ayar',  type: 3, description: 'Varsayılana döndürülecek ayar.', required: true, choices: KUMAR_AYAR_CHOICES },
                            { name: 'sebep', type: 3, description: 'İşlem sebebi.', required: true }
                        ]
                    }
                ]
            },
            {
                name: 'ekonomi',
                description: 'Ekonomi denetim raporları (read-only).',
                type: 2,
                options: [
                    {
                        name: 'rapor',
                        description: 'Genel ekonomi sağlık raporu.',
                        type: 1,
                        options: []
                    },
                    {
                        name: 'para-akisi',
                        description: 'Son X saatteki para akışı raporu.',
                        type: 1,
                        options: [
                            { name: 'sure', type: 4, description: 'Kaç saatlik veri? (1–168, varsayılan: 24)', required: false, min_value: 1, max_value: 168 }
                        ]
                    },
                    {
                        name: 'zenginler',
                        description: 'En zengin kullanıcılar listesi.',
                        type: 1,
                        options: [
                            { name: 'limit', type: 4, description: 'Gösterilecek kullanıcı sayısı (1–25, varsayılan: 10)', required: false, min_value: 1, max_value: 25 }
                        ]
                    },
                    {
                        name: 'krediler',
                        description: 'Kredi ve borç risk raporu.',
                        type: 1,
                        options: []
                    },
                    {
                        name: 'envanter',
                        description: 'Envanter, kasa ve koleksiyon ekonomi raporu.',
                        type: 1,
                        options: []
                    },
                    {
                        name: 'admin-etkisi',
                        description: 'Son X saatte admin müdahalelerinin ekonomiye etkisi.',
                        type: 1,
                        options: [
                            { name: 'sure', type: 4, description: 'Kaç saatlik veri? (1–168, varsayılan: 24)', required: false, min_value: 1, max_value: 168 }
                        ]
                    },
                    {
                        name: 'supheli',
                        description: 'Şüpheli ekonomi sinyalleri raporu.',
                        type: 1,
                        options: [
                            { name: 'sure', type: 4, description: 'Kaç saatlik veri? (1–168, varsayılan: 24)', required: false, min_value: 1, max_value: 168 }
                        ]
                    }
                ]
            },
            {
                name: 'sistem',
                description: 'Bot sistemlerini açma, kapatma ve yönetim.',
                type: 2,
                options: [
                    {
                        name: 'durum',
                        description: 'Tüm sistem açık/kapalı durumunu gösterir.',
                        type: 1,
                        options: []
                    },
                    {
                        name: 'ayarlar',
                        description: 'Sistem kategorisi bot_settings kayıtlarını görüntüler.',
                        type: 1,
                        options: []
                    },
                    {
                        name: 'ac',
                        description: 'Seçilen sistemi açar.',
                        type: 1,
                        options: [
                            { name: 'sistem', type: 3, description: 'Açılacak sistem.', required: true, choices: SISTEM_CHOICES },
                            { name: 'sebep',  type: 3, description: 'İşlem sebebi.',    required: true }
                        ]
                    },
                    {
                        name: 'kapat',
                        description: 'Seçilen sistemi geçici olarak kapatır.',
                        type: 1,
                        options: [
                            { name: 'sistem', type: 3, description: 'Kapatılacak sistem.', required: true, choices: SISTEM_CHOICES },
                            { name: 'sebep',  type: 3, description: 'İşlem sebebi.',       required: true }
                        ]
                    },
                    {
                        name: 'varsayilana-dondur',
                        description: 'Seçilen sistem ayarını varsayılan değerine döndürür.',
                        type: 1,
                        options: [
                            { name: 'sistem', type: 3, description: 'Varsayılana döndürülecek sistem.', required: true, choices: SISTEM_CHOICES },
                            { name: 'sebep',  type: 3, description: 'İşlem sebebi.',                   required: true }
                        ]
                    }
                ]
            }
        ]
    },

    async execute(interaction) {
        if (!requireOwner(interaction)) return;

        const group = interaction.options.getSubcommandGroup();
        const sub   = interaction.options.getSubcommand();

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        try {
            if (group === 'kullanici') {
                if (sub === 'incele') return await handleKullaniciIncele(interaction);
            }
            if (group === 'para') {
                if (sub === 'ekle')   return await handleParaEkle(interaction);
                if (sub === 'sil')    return await handleParaSil(interaction);
                if (sub === 'ayarla') return await handleParaAyarla(interaction);
            }
            if (group === 'envanter') {
                if (sub === 'listele') return await handleEnvanterListele(interaction);
                if (sub === 'ver')     return await handleEnvanterVer(interaction);
                if (sub === 'sil')     return await handleEnvanterSil(interaction);
                if (sub === 'ayarla')  return await handleEnvanterAyarla(interaction);
            }
            if (group === 'kredi') {
                if (sub === 'incele') return await handleKrediIncele(interaction);
            }
            if (group === 'sezon') {
                if (sub === 'incele')    return await handleSezonIncele(interaction);
                if (sub === 'puan-ekle') return await handleSezonPuanEkle(interaction);
                if (sub === 'puan-sil')  return await handleSezonPuanSil(interaction);
            }
            if (group === 'log') {
                if (sub === 'listele')   return await handleLogListele(interaction);
                if (sub === 'kullanici') return await handleLogKullanici(interaction);
                if (sub === 'aktor')     return await handleLogAktor(interaction);
            }
            if (group === 'bekleme') {
                if (sub === 'durum')          return await handleBeklemeDurum(interaction);
                if (sub === 'sifirla')        return await handleBeklemeSifirla(interaction);
                if (sub === 'azalt')          return await handleBeklemeAzalt(interaction);
                if (sub === 'uzat')           return await handleBeklemeUzat(interaction);
                if (sub === 'ayarla')         return await handleBeklemeAyarla(interaction);
                if (sub === 'tumunu-sifirla') return await handleBeklemeTumuSifirla(interaction);
                if (sub === 'global-goster')  return await handleBeklemeGlobalGoster(interaction);
                if (sub === 'global-ayarla')  return await handleBeklemeGlobalAyarla(interaction);
                if (sub === 'global-sifirla') return await handleBeklemeGlobalSifirla(interaction);
            }
            if (group === 'kumar') {
                if (sub === 'durum')              return await handleKumarDurum(interaction);
                if (sub === 'ayar-goster')        return await handleKumarAyarGoster(interaction);
                if (sub === 'ayar-ayarla')        return await handleKumarAyarAyarla(interaction);
                if (sub === 'ac')                 return await handleKumarAc(interaction);
                if (sub === 'kapat')              return await handleKumarKapat(interaction);
                if (sub === 'varsayilana-dondur') return await handleKumarVarsayilanaDondur(interaction);
            }
            if (group === 'ekonomi') {
                if (sub === 'rapor')        return await handleEkonomiRapor(interaction);
                if (sub === 'para-akisi')   return await handleEkonomiParaAkisi(interaction);
                if (sub === 'zenginler')    return await handleEkonomiZenginler(interaction);
                if (sub === 'krediler')     return await handleEkonomiKrediler(interaction);
                if (sub === 'envanter')     return await handleEkonomiEnvanter(interaction);
                if (sub === 'admin-etkisi') return await handleEkonomiAdminEtkisi(interaction);
                if (sub === 'supheli')      return await handleEkonomiSupheli(interaction);
            }
            if (group === 'sistem') {
                if (sub === 'durum')              return await handleSistemDurum(interaction);
                if (sub === 'ayarlar')            return await handleSistemAyarlar(interaction);
                if (sub === 'ac')                 return await handleSistemAc(interaction);
                if (sub === 'kapat')              return await handleSistemKapat(interaction);
                if (sub === 'varsayilana-dondur') return await handleSistemVarsayilanaDondur(interaction);
            }
        } catch (err) {
            console.error(`/admin ${group} ${sub} hatası:`, err?.message ?? err);
            await interaction.editReply({
                embeds: [createEmbed('error', '⚠️ Bir Aksilik Oldu',
                    'İşlem sırasında bir sorun çıktı. Hiçbir teknik detay paylaşılmadı. Logları kontrol et.')]
            });
        }
    }
};

// ==================[ KULLANICI İNCELE ]==================

async function handleKullaniciIncele(interaction) {
    const target = interaction.options.getUser('kullanici');
    const ov     = await getAdminUserOverview(target.id);

    const riskLabel = getLoanRiskText(ov.creditScore);
    const prestigeNames = { vip_badge: '💎 VIP Rozeti', profil_cercevesi: '🖼️ Profil Çerçevesi', kara_kart: '🖤 Kara Kart' };
    const prestigeText = ov.prestigeOwned.length > 0
        ? ov.prestigeOwned.map(id => prestigeNames[id] || id).join(', ')
        : 'Yok';

    const seasonLine = ov.activeSeason
        ? `${formatNumber(ov.sPoints)} puan · Seviye ${ov.sLevel}${ov.sRank ? ` · Sıra #${ov.sRank}` : ''}`
        : 'Aktif sezon yok';

    const embed = createEmbed('admin', `🔍 Kullanıcı İncelemesi — ${target.username}`, `<@${target.id}>`)
        .addFields(
            { name: '💰 Cüzdan',        value: `${formatNumber(ov.wallet)} 🪙`,         inline: true },
            { name: '🏦 Banka',          value: `${formatNumber(ov.bank)} 🪙`,           inline: true },
            { name: '💎 Toplam Servet',  value: `${formatNumber(ov.totalWealth)} 🪙`,    inline: true },

            { name: '📊 Banka Seviyesi', value: `Seviye ${ov.bankLevel}`,                inline: true },
            { name: '📦 Kapasite',       value: `${formatNumber(ov.bankLimit)} 🪙`,      inline: true },
            { name: '📈 Doluluk',        value: `%${ov.fillPct}`,                        inline: true },

            { name: '📋 Kredi Puanı',   value: `${ov.creditScore} — ${riskLabel}`,       inline: true },
            { name: '📝 Aktif Kredi',   value: `${ov.loanSummary.activeCount} adet`,     inline: true },
            { name: '💸 Toplam Borç',   value: `${formatNumber(ov.loanSummary.activeDebt)} 🪙`, inline: true },
            { name: '⚠️ Gecikmiş',     value: `${ov.loanSummary.overdueCount} adet`,     inline: true },

            { name: '🏆 Sezon',         value: seasonLine,                               inline: false },

            { name: '✅ Günlük Görev',  value: `${ov.dailyDone}/${ov.dailyTotal}`,       inline: true },
            { name: '📅 Haftalık',      value: `${ov.weeklyDone}/${ov.weeklyTotal}`,     inline: true },
            { name: '🏅 Başarımlar',   value: `${ov.unlockedAch}/${ov.totalAch}`,        inline: true },

            { name: '✨ Koleksiyon',    value: `${ov.colTotal} eşya · ~${formatNumber(ov.colValue)} 🪙`, inline: true },
            { name: '📦 Kasa',         value: `${ov.crateTotal} adet`,                   inline: true },

            { name: '👑 Prestij Eşyaları', value: prestigeText, inline: false }
        );

    if (ov.suspicious.length > 0) {
        embed.addFields({ name: '🚨 Dikkat Noktaları', value: ov.suspicious.join('\n'), inline: false });
    }

    embed.setFooter({ text: `Admin incelemesi · ID: ${target.id}` });
    return interaction.editReply({ embeds: [embed] });
}

// ==================[ PARA İŞLEMLERİ ]==================

async function handleParaEkle(interaction) {
    const target  = interaction.options.getUser('kullanici');
    const amount  = interaction.options.getInteger('miktar');
    const sebep   = interaction.options.getString('sebep');
    const alanOpt = interaction.options.getString('alan') || 'cuzdan';
    const field   = alanToField(alanOpt);
    const label   = alanToLabel(field);

    const userData   = await ensureUser(target.id);
    const currentVal = Number(field === 'bank' ? userData.bank : userData.wallet);
    const newVal     = currentVal + amount;

    const confirmed = await awaitAdminConfirmation(interaction, {
        title:       '⚠️ Para Ekle — Onay',
        description: `**${target.username}** kullanıcısına MetaCoin eklenecek.`,
        target:      `${target.username} (<@${target.id}>)`,
        oldValue:    `${formatNumber(currentVal)} 🪙 (${label})`,
        newValue:    `${formatNumber(newVal)} 🪙 (${label})`,
        reason:      sebep,
        riskLevel:   amount >= 1_000_000 ? 'high' : 'normal'
    });

    if (!confirmed) {
        return editInfo(interaction, '❌ İptal Edildi', 'Para ekleme işlemi gerçekleştirilmedi.');
    }

    const result = await adminMoneyOperation({
        userId: target.id, field, mode: 'add',
        amount, actorId: interaction.user.id, reason: sebep
    });

    if (!result.ok) return editError(interaction, result.reason || 'İşlem gerçekleştirilemedi.');

    return interaction.editReply({
        embeds: [createEmbed('admin', '✅ Para Eklendi',
            `**${target.username}** · ${label}\n${formatNumber(result.oldValue)} 🪙 → **${formatNumber(result.newValue)} 🪙**`
        ).addFields({ name: '📝 Sebep', value: sebep, inline: false })]
    });
}

async function handleParaSil(interaction) {
    const target  = interaction.options.getUser('kullanici');
    const amount  = interaction.options.getInteger('miktar');
    const sebep   = interaction.options.getString('sebep');
    const alanOpt = interaction.options.getString('alan') || 'cuzdan';
    const field   = alanToField(alanOpt);
    const label   = alanToLabel(field);

    const userData   = await ensureUser(target.id);
    const currentVal = Number(field === 'bank' ? userData.bank : userData.wallet);

    if (currentVal < amount) {
        return editError(interaction,
            `Yetersiz bakiye. Mevcut ${label}: **${formatNumber(currentVal)} 🪙**, silinmek istenen: **${formatNumber(amount)} 🪙**`
        );
    }

    const newVal = currentVal - amount;

    const confirmed = await awaitAdminConfirmation(interaction, {
        title:       '⚠️ Para Sil — Onay',
        description: `**${target.username}** kullanıcısından MetaCoin silinecek.`,
        target:      `${target.username} (<@${target.id}>)`,
        oldValue:    `${formatNumber(currentVal)} 🪙 (${label})`,
        newValue:    `${formatNumber(newVal)} 🪙 (${label})`,
        reason:      sebep,
        riskLevel:   amount >= 1_000_000 ? 'high' : 'normal'
    });

    if (!confirmed) {
        return editInfo(interaction, '❌ İptal Edildi', 'Para silme işlemi gerçekleştirilmedi.');
    }

    const result = await adminMoneyOperation({
        userId: target.id, field, mode: 'remove',
        amount, actorId: interaction.user.id, reason: sebep
    });

    if (!result.ok) return editError(interaction, result.reason || 'İşlem gerçekleştirilemedi.');

    return interaction.editReply({
        embeds: [createEmbed('admin', '✅ Para Silindi',
            `**${target.username}** · ${label}\n${formatNumber(result.oldValue)} 🪙 → **${formatNumber(result.newValue)} 🪙**`
        ).addFields({ name: '📝 Sebep', value: sebep, inline: false })]
    });
}

async function handleParaAyarla(interaction) {
    const target  = interaction.options.getUser('kullanici');
    const alanOpt = interaction.options.getString('alan');
    const amount  = interaction.options.getInteger('miktar');
    const sebep   = interaction.options.getString('sebep');
    const field   = alanToField(alanOpt);
    const label   = alanToLabel(field);

    const userData   = await ensureUser(target.id);
    const currentVal = Number(field === 'bank' ? userData.bank : userData.wallet);
    const bankLimit  = Number(userData.bank_limit) || 50000;

    if (field === 'bank' && amount > bankLimit) {
        return editError(interaction,
            `Banka kapasitesi aşılıyor. Limit: **${formatNumber(bankLimit)} 🪙**, girilen: **${formatNumber(amount)} 🪙**`
        );
    }

    const confirmed = await awaitAdminConfirmation(interaction, {
        title:       '⚠️ Para Ayarla — Onay',
        description: `**${target.username}** kullanıcısının bakiyesi belirtilen değere ayarlanacak.`,
        target:      `${target.username} (<@${target.id}>)`,
        oldValue:    `${formatNumber(currentVal)} 🪙 (${label})`,
        newValue:    `${formatNumber(amount)} 🪙 (${label})`,
        reason:      sebep,
        riskLevel:   'high'
    });

    if (!confirmed) {
        return editInfo(interaction, '❌ İptal Edildi', 'Para ayarlama işlemi gerçekleştirilmedi.');
    }

    const result = await adminMoneyOperation({
        userId: target.id, field, mode: 'set',
        amount, actorId: interaction.user.id, reason: sebep
    });

    if (!result.ok) return editError(interaction, result.reason || 'İşlem gerçekleştirilemedi.');

    return interaction.editReply({
        embeds: [createEmbed('admin', '✅ Bakiye Ayarlandı',
            `**${target.username}** · ${label}\n${formatNumber(result.oldValue)} 🪙 → **${formatNumber(result.newValue)} 🪙**`
        ).addFields({ name: '📝 Sebep', value: sebep, inline: false })]
    });
}

// ==================[ ENVANTER İŞLEMLERİ ]==================

async function handleEnvanterListele(interaction) {
    const target = interaction.options.getUser('kullanici');
    const items  = await getAdminInventoryOverview(target.id);

    if (items.length === 0) {
        return editInfo(interaction, '📦 Envanter Boş',
            `**${target.username}** kullanıcısının envanteri boş.`);
    }

    const kasaItems = items.filter(i => i.type === 'kasa');
    const kolItems  = items.filter(i => i.type === 'koleksiyon');
    const esyaItems = items.filter(i => i.type !== 'kasa' && i.type !== 'koleksiyon');
    const totalQty  = items.reduce((s, i) => s + i.quantity, 0);
    const listOf    = arr => arr.map(i => `• ${i.name} — **${i.quantity}**`).join('\n');

    const embed = createEmbed('admin', `📦 Envanter — ${target.username}`, `<@${target.id}>`);
    if (kasaItems.length > 0)  embed.addFields({ name: '📦 Kasalar',    value: listOf(kasaItems).slice(0, 1024), inline: false });
    if (kolItems.length > 0)   embed.addFields({ name: '✨ Koleksiyon', value: listOf(kolItems).slice(0, 1024),  inline: false });
    if (esyaItems.length > 0)  embed.addFields({ name: '🛒 Eşyalar',   value: listOf(esyaItems).slice(0, 1024), inline: false });
    embed.setFooter({ text: `${items.length} eşya türü · ${totalQty} toplam adet` });

    return interaction.editReply({ embeds: [embed] });
}

async function handleEnvanterVer(interaction) {
    const target  = interaction.options.getUser('kullanici');
    const esya    = (interaction.options.getString('esya') || '').trim().toLowerCase();
    const adet    = interaction.options.getInteger('adet');
    const sebep   = interaction.options.getString('sebep');

    if (!isValidItemCode(esya)) {
        return editError(interaction,
            `\`${esya}\` geçerli bir eşya kodu değil. Mevcut item, kasa veya koleksiyon kodu gir.`);
    }

    const displayName = getItemDisplayName(esya);
    const currentQty  = await checkItem(target.id, esya);
    const newQty      = currentQty + adet;

    const confirmed = await awaitAdminConfirmation(interaction, {
        title:       '⚠️ Eşya Ver — Onay',
        description: `**${target.username}** kullanıcısına eşya verilecek.`,
        target:      `${target.username} (<@${target.id}>)`,
        targetKey:   displayName,
        oldValue:    `${currentQty} adet`,
        newValue:    `${newQty} adet`,
        reason:      sebep,
        riskLevel:   adet >= 10 ? 'high' : 'normal'
    });

    if (!confirmed) {
        return editInfo(interaction, '❌ İptal Edildi', 'Eşya verme işlemi gerçekleştirilmedi.');
    }

    const result = await adminInventoryOperation({
        userId: target.id, itemCode: esya, mode: 'add',
        quantity: adet, actorId: interaction.user.id, reason: sebep
    });

    if (!result.ok) return editError(interaction, result.reason || 'Eşya verilemedi.');

    return interaction.editReply({
        embeds: [createEmbed('admin', '✅ Eşya Verildi',
            `**${target.username}** · ${result.displayName}\n${result.oldQty} adet → **${result.newQty} adet**`
        ).addFields({ name: '📝 Sebep', value: sebep, inline: false })]
    });
}

async function handleEnvanterSil(interaction) {
    const target  = interaction.options.getUser('kullanici');
    const esya    = (interaction.options.getString('esya') || '').trim().toLowerCase();
    const adet    = interaction.options.getInteger('adet');
    const sebep   = interaction.options.getString('sebep');

    if (!isValidItemCode(esya)) {
        return editError(interaction,
            `\`${esya}\` geçerli bir eşya kodu değil. Mevcut item, kasa veya koleksiyon kodu gir.`);
    }

    const displayName = getItemDisplayName(esya);
    const currentQty  = await checkItem(target.id, esya);

    if (currentQty < adet) {
        return editError(interaction,
            `Yetersiz eşya. **${target.username}** kullanıcısında **${displayName}**: ${currentQty} adet var, silinmek istenen: ${adet} adet.`);
    }

    const newQty = currentQty - adet;

    const confirmed = await awaitAdminConfirmation(interaction, {
        title:       '⚠️ Eşya Sil — Onay',
        description: `**${target.username}** kullanıcısından eşya silinecek.`,
        target:      `${target.username} (<@${target.id}>)`,
        targetKey:   displayName,
        oldValue:    `${currentQty} adet`,
        newValue:    `${newQty} adet`,
        reason:      sebep,
        riskLevel:   adet >= 10 ? 'high' : 'normal'
    });

    if (!confirmed) {
        return editInfo(interaction, '❌ İptal Edildi', 'Eşya silme işlemi gerçekleştirilmedi.');
    }

    const result = await adminInventoryOperation({
        userId: target.id, itemCode: esya, mode: 'remove',
        quantity: adet, actorId: interaction.user.id, reason: sebep
    });

    if (!result.ok) return editError(interaction, result.reason || 'Eşya silinemedi.');

    return interaction.editReply({
        embeds: [createEmbed('admin', '✅ Eşya Silindi',
            `**${target.username}** · ${result.displayName}\n${result.oldQty} adet → **${result.newQty} adet**`
        ).addFields({ name: '📝 Sebep', value: sebep, inline: false })]
    });
}

async function handleEnvanterAyarla(interaction) {
    const target  = interaction.options.getUser('kullanici');
    const esya    = (interaction.options.getString('esya') || '').trim().toLowerCase();
    const adet    = interaction.options.getInteger('adet');
    const sebep   = interaction.options.getString('sebep');

    if (!isValidItemCode(esya)) {
        return editError(interaction,
            `\`${esya}\` geçerli bir eşya kodu değil. Mevcut item, kasa veya koleksiyon kodu gir.`);
    }

    const displayName = getItemDisplayName(esya);
    const currentQty  = await checkItem(target.id, esya);

    const confirmed = await awaitAdminConfirmation(interaction, {
        title:       '⚠️ Eşya Ayarla — Onay',
        description: `**${target.username}** kullanıcısının eşya adedi belirtilen değere ayarlanacak.`,
        target:      `${target.username} (<@${target.id}>)`,
        targetKey:   displayName,
        oldValue:    `${currentQty} adet`,
        newValue:    `${adet} adet`,
        reason:      sebep,
        riskLevel:   adet >= 10 ? 'high' : 'normal'
    });

    if (!confirmed) {
        return editInfo(interaction, '❌ İptal Edildi', 'Eşya ayarlama işlemi gerçekleştirilmedi.');
    }

    const result = await adminInventoryOperation({
        userId: target.id, itemCode: esya, mode: 'set',
        quantity: adet, actorId: interaction.user.id, reason: sebep
    });

    if (!result.ok) return editError(interaction, result.reason || 'Eşya ayarlanamadı.');

    return interaction.editReply({
        embeds: [createEmbed('admin', '✅ Eşya Ayarlandı',
            `**${target.username}** · ${result.displayName}\n${result.oldQty} adet → **${result.newQty} adet**`
        ).addFields({ name: '📝 Sebep', value: sebep, inline: false })]
    });
}

// ==================[ KREDİ İNCELE ]==================

async function handleKrediIncele(interaction) {
    const target = interaction.options.getUser('kullanici');
    const ov     = await getAdminCreditOverview(target.id);

    const riskLabel  = getLoanRiskText(ov.creditScore);
    const sortedLoans = [...ov.activeLoans].sort((a, b) => new Date(a.due_at) - new Date(b.due_at));
    const nearest    = sortedLoans[0] || null;

    const embed = createEmbed('credit', `💳 Kredi İncelemesi — ${target.username}`, `<@${target.id}>`)
        .addFields(
            { name: '📋 Kredi Puanı',  value: `${ov.creditScore}`,                                  inline: true },
            { name: '⚖️ Risk',         value: riskLabel,                                             inline: true },
            { name: '📝 Aktif Kredi',  value: `${ov.loanSummary.activeCount} adet`,                  inline: true },
            { name: '💸 Toplam Borç',  value: `${formatNumber(ov.loanSummary.activeDebt)} 🪙`,       inline: true },
            { name: '⚠️ Gecikmiş',    value: `${ov.loanSummary.overdueCount} adet`,                  inline: true },
            { name: '📅 En Yakın Vade', value: nearest ? (formatDateTime(nearest.due_at) || '—') : '—', inline: true }
        );

    if (ov.activeLoans.length > 0) {
        const lines = ov.activeLoans.slice(0, 5).map(l => {
            const stLabel = l.status === 'overdue' ? '⚠️ Gecikmiş' : '✅ Aktif';
            return `#${l.id} — ${formatNumber(Number(l.remaining))} 🪙 — vade: ${formatDateTime(l.due_at) || '?'} — ${stLabel}`;
        });
        embed.addFields({ name: '📋 Aktif Krediler', value: lines.join('\n').slice(0, 1024), inline: false });
    } else {
        embed.addFields({ name: '📋 Aktif Krediler', value: 'Aktif kredi yok.', inline: false });
    }

    embed.setFooter({ text: 'Kredi incelemesi — read-only' });
    return interaction.editReply({ embeds: [embed] });
}

// ==================[ SEZON İŞLEMLERİ ]==================

async function handleSezonIncele(interaction) {
    const target = interaction.options.getUser('kullanici');
    const ov     = await getAdminSeasonOverview(target.id);

    const embed = createEmbed('premium', `🏆 Sezon İncelemesi — ${target.username}`, `<@${target.id}>`);

    if (!ov.activeSeason) {
        embed.addFields({ name: 'ℹ️ Durum', value: 'Şu anda aktif sezon bulunmuyor.', inline: false });
    } else {
        embed.addFields(
            { name: '🏆 Aktif Sezon', value: ov.activeSeason.name,                        inline: true },
            { name: '🎯 Puan',        value: `${formatNumber(ov.sPoints)}`,                inline: true },
            { name: '📊 Seviye',      value: `${ov.sLevel}`,                               inline: true },
            { name: '🥇 Sıralama',   value: ov.sRank ? `#${ov.sRank}` : 'Puan girilmemiş', inline: true }
        );
    }

    embed.setFooter({ text: 'Sezon incelemesi — read-only' });
    return interaction.editReply({ embeds: [embed] });
}

async function handleSezonPuanEkle(interaction) {
    const target = interaction.options.getUser('kullanici');
    const miktar = interaction.options.getInteger('miktar');
    const sebep  = interaction.options.getString('sebep');

    const ov = await getAdminSeasonOverview(target.id);
    if (!ov.activeSeason) {
        return editError(interaction, 'Aktif sezon bulunamadı. Sezon puanı işlemi yapılamaz.');
    }

    const newPoints = ov.sPoints + miktar;

    const confirmed = await awaitAdminConfirmation(interaction, {
        title:       '⚠️ Sezon Puanı Ekle — Onay',
        description: `**${target.username}** kullanıcısına sezon puanı eklenecek.`,
        target:      `${target.username} (<@${target.id}>)`,
        oldValue:    `${formatNumber(ov.sPoints)} puan`,
        newValue:    `${formatNumber(newPoints)} puan`,
        reason:      sebep,
        riskLevel:   miktar >= 1000 ? 'high' : 'normal'
    });

    if (!confirmed) {
        return editInfo(interaction, '❌ İptal Edildi', 'Sezon puanı ekleme işlemi gerçekleştirilmedi.');
    }

    const result = await adminSeasonPointsOperation({
        userId: target.id, amount: miktar, mode: 'add',
        actorId: interaction.user.id, reason: sebep
    });

    if (!result.ok) return editError(interaction, result.reason || 'Puan eklenemedi.');

    return interaction.editReply({
        embeds: [createEmbed('admin', '✅ Sezon Puanı Eklendi',
            `**${target.username}**\n${formatNumber(result.oldPoints)} puan → **${formatNumber(result.newPoints)} puan**`
        ).addFields({ name: '📝 Sebep', value: sebep, inline: false })]
    });
}

async function handleSezonPuanSil(interaction) {
    const target = interaction.options.getUser('kullanici');
    const miktar = interaction.options.getInteger('miktar');
    const sebep  = interaction.options.getString('sebep');

    const ov = await getAdminSeasonOverview(target.id);
    if (!ov.activeSeason) {
        return editError(interaction, 'Aktif sezon bulunamadı. Sezon puanı işlemi yapılamaz.');
    }

    const effectiveRemove = Math.min(miktar, ov.sPoints);
    const newPoints = Math.max(0, ov.sPoints - miktar);

    const confirmed = await awaitAdminConfirmation(interaction, {
        title:       '⚠️ Sezon Puanı Sil — Onay',
        description: `**${target.username}** kullanıcısından sezon puanı silinecek.${
            effectiveRemove < miktar ? `\n⚠️ Mevcut puan yetersiz; ${formatNumber(effectiveRemove)} puan silinecek.` : ''
        }`,
        target:      `${target.username} (<@${target.id}>)`,
        oldValue:    `${formatNumber(ov.sPoints)} puan`,
        newValue:    `${formatNumber(newPoints)} puan`,
        reason:      sebep,
        riskLevel:   miktar >= 1000 ? 'high' : 'normal'
    });

    if (!confirmed) {
        return editInfo(interaction, '❌ İptal Edildi', 'Sezon puanı silme işlemi gerçekleştirilmedi.');
    }

    const result = await adminSeasonPointsOperation({
        userId: target.id, amount: miktar, mode: 'remove',
        actorId: interaction.user.id, reason: sebep
    });

    if (!result.ok) return editError(interaction, result.reason || 'Puan silinemedi.');

    return interaction.editReply({
        embeds: [createEmbed('admin', '✅ Sezon Puanı Silindi',
            `**${target.username}**\n${formatNumber(result.oldPoints)} puan → **${formatNumber(result.newPoints)} puan**`
        ).addFields({ name: '📝 Sebep', value: sebep, inline: false })]
    });
}

// ==================[ LOG İŞLEMLERİ ]==================

function buildLogEmbed(title, logs) {
    if (logs.length === 0) return null;
    const lines = logs.map(l => formatAdminLogEntry(l));
    return createEmbed('admin', title, lines.join('\n').slice(0, 4000))
        .setFooter({ text: 'Log görüntüleme — read-only' });
}

async function handleLogListele(interaction) {
    const limit = safeLimit(interaction.options.getInteger('limit'), 20);
    const logs  = await getRecentAdminLogs(limit);

    if (logs.length === 0) {
        return editInfo(interaction, '📋 Admin Logları', 'Henüz admin işlemi kaydedilmemiş.');
    }

    const embed = buildLogEmbed(`📋 Son ${logs.length} Admin İşlemi`, logs);
    return interaction.editReply({ embeds: [embed] });
}

async function handleLogKullanici(interaction) {
    const target = interaction.options.getUser('kullanici');
    const limit  = safeLimit(interaction.options.getInteger('limit'), 20);
    const logs   = await getUserAdminLogs(target.id, limit);

    if (logs.length === 0) {
        return editInfo(interaction, '📋 Kullanıcı Logları',
            `**${target.username}** için admin işlemi kaydı bulunamadı.`);
    }

    const embed = buildLogEmbed(`📋 ${target.username} — Admin Logları (${logs.length})`, logs);
    return interaction.editReply({ embeds: [embed] });
}

async function handleLogAktor(interaction) {
    const actor = interaction.options.getUser('kullanici');
    const limit = safeLimit(interaction.options.getInteger('limit'), 20);
    const logs  = await getActorLogs(actor.id, limit);

    if (logs.length === 0) {
        return editInfo(interaction, '📋 Aktör Logları',
            `**${actor.username}** tarafından yapılmış admin işlemi bulunamadı.`);
    }

    const embed = buildLogEmbed(`📋 ${actor.username} — İşlem Geçmişi (${logs.length})`, logs);
    return interaction.editReply({ embeds: [embed] });
}

// ==================[ BEKLEME İŞLEMLERİ ]==================

async function handleBeklemeDurum(interaction) {
    const target = interaction.options.getUser('kullanici');
    const ov     = await getAdminCooldownOverview(target.id);

    // Grup 1: Ödüller ve rutin (DB)
    const group1 = ov.dbStatus.filter(s => ['gunluk', 'haftalik', 'aylik', 'calis', 'faiz'].includes(s.commandCode));
    // Grup 2: Risk (DB)
    const group2 = ov.dbStatus.filter(s => ['dilen', 'suc', 'soy'].includes(s.commandCode));
    // Grup 3: Oyunlar (runtime)
    const group3 = ov.runtimeStatus;

    const fmt = arr => arr.map(s =>
        `**/${s.commandCode}** (${s.displayName}) — ${fmtMs(s.leftMs)} · global: ${Math.round(s.effectiveCooldownMs / 1000)}s`
    ).join('\n');

    const embed = createEmbed('admin', `⏳ Bekleme Durumu — ${target.username}`, `<@${target.id}>`)
        .addFields(
            { name: '🏅 Ödüller ve İş',   value: fmt(group1).slice(0, 1024) || '—', inline: false },
            { name: '⚡ Risk Komutları',   value: fmt(group2).slice(0, 1024) || '—', inline: false },
            { name: '🎲 Oyunlar (anlık)',  value: fmt(group3).slice(0, 1024) || '—', inline: false }
        )
        .setFooter({ text: `Bekleme durumu — read-only · ID: ${target.id}` });

    return interaction.editReply({ embeds: [embed] });
}

async function handleBeklemeSifirla(interaction) {
    const target = interaction.options.getUser('kullanici');
    const komut  = interaction.options.getString('komut');
    const sebep  = interaction.options.getString('sebep');
    const cmd    = COOLDOWN_COMMANDS[komut];
    if (!cmd) return editError(interaction, `\`${komut}\` geçerli bir komut kodu değil.`);

    // Mevcut kalan süreyi hesapla (göstermek için)
    const ov  = await getAdminCooldownOverview(target.id);
    const all = [...ov.dbStatus, ...ov.runtimeStatus];
    const cur = all.find(s => s.commandCode === komut);
    const oldLeftMs = cur ? cur.leftMs : 0;

    const confirmed = await awaitAdminConfirmation(interaction, {
        title:       '⚠️ Bekleme Sıfırla — Onay',
        description: `**${target.username}** kullanıcısının \`/${komut}\` bekleme süresi sıfırlanacak.`,
        target:      `${target.username} (<@${target.id}>)`,
        targetKey:   `/${komut}`,
        oldValue:    fmtMs(oldLeftMs),
        newValue:    '🟢 Hazır',
        reason:      sebep,
        riskLevel:   'normal'
    });
    if (!confirmed) return editInfo(interaction, '❌ İptal Edildi', 'Bekleme sıfırlama işlemi gerçekleştirilmedi.');

    const result = await resetUserCooldown({ userId: target.id, commandCode: komut, actorId: interaction.user.id, reason: sebep });
    if (!result.ok) return editError(interaction, result.reason || 'İşlem gerçekleştirilemedi.');

    return interaction.editReply({
        embeds: [createEmbed('admin', '✅ Bekleme Sıfırlandı',
            `**${target.username}** · \`/${komut}\`\n${fmtMs(result.oldLeftMs)} → **🟢 Hazır**`
        ).addFields({ name: '📝 Sebep', value: sebep, inline: false })]
    });
}

async function handleBeklemeAzalt(interaction) {
    const target = interaction.options.getUser('kullanici');
    const komut  = interaction.options.getString('komut');
    const sure   = interaction.options.getInteger('sure');
    const sebep  = interaction.options.getString('sebep');
    const cmd    = COOLDOWN_COMMANDS[komut];
    if (!cmd) return editError(interaction, `\`${komut}\` geçerli bir komut kodu değil.`);

    const ov  = await getAdminCooldownOverview(target.id);
    const all = [...ov.dbStatus, ...ov.runtimeStatus];
    const cur = all.find(s => s.commandCode === komut);
    const oldLeftMs = cur ? cur.leftMs : 0;
    const newLeftMs = Math.max(0, oldLeftMs - sure * 1000);

    const confirmed = await awaitAdminConfirmation(interaction, {
        title:       '⚠️ Bekleme Azalt — Onay',
        description: `**${target.username}** kullanıcısının \`/${komut}\` bekleme süresi azaltılacak.`,
        target:      `${target.username} (<@${target.id}>)`,
        targetKey:   `/${komut}`,
        oldValue:    fmtMs(oldLeftMs),
        newValue:    fmtMs(newLeftMs),
        reason:      sebep,
        riskLevel:   'normal'
    });
    if (!confirmed) return editInfo(interaction, '❌ İptal Edildi', 'Bekleme azaltma işlemi gerçekleştirilmedi.');

    const result = await reduceUserCooldown({ userId: target.id, commandCode: komut, seconds: sure, actorId: interaction.user.id, reason: sebep });
    if (!result.ok) return editError(interaction, result.reason || 'İşlem gerçekleştirilemedi.');

    return interaction.editReply({
        embeds: [createEmbed('admin', '✅ Bekleme Azaltıldı',
            `**${target.username}** · \`/${komut}\`\n${fmtMs(result.oldLeftMs)} → **${fmtMs(result.newLeftMs)}**`
        ).addFields({ name: '📝 Sebep', value: sebep, inline: false })]
    });
}

async function handleBeklemeUzat(interaction) {
    const target = interaction.options.getUser('kullanici');
    const komut  = interaction.options.getString('komut');
    const sure   = interaction.options.getInteger('sure');
    const sebep  = interaction.options.getString('sebep');
    const cmd    = COOLDOWN_COMMANDS[komut];
    if (!cmd) return editError(interaction, `\`${komut}\` geçerli bir komut kodu değil.`);

    const ov  = await getAdminCooldownOverview(target.id);
    const all = [...ov.dbStatus, ...ov.runtimeStatus];
    const cur = all.find(s => s.commandCode === komut);
    const oldLeftMs = cur ? cur.leftMs : 0;
    const newLeftMs = Math.min(oldLeftMs + sure * 1000, MAX_USER_COOLDOWN_MS);

    const confirmed = await awaitAdminConfirmation(interaction, {
        title:       '⚠️ Bekleme Uzat — Onay',
        description: `**${target.username}** kullanıcısının \`/${komut}\` bekleme süresi uzatılacak.`,
        target:      `${target.username} (<@${target.id}>)`,
        targetKey:   `/${komut}`,
        oldValue:    fmtMs(oldLeftMs),
        newValue:    fmtMs(newLeftMs),
        reason:      sebep,
        riskLevel:   sure >= 3600 ? 'high' : 'normal'
    });
    if (!confirmed) return editInfo(interaction, '❌ İptal Edildi', 'Bekleme uzatma işlemi gerçekleştirilmedi.');

    const result = await extendUserCooldown({ userId: target.id, commandCode: komut, seconds: sure, actorId: interaction.user.id, reason: sebep });
    if (!result.ok) return editError(interaction, result.reason || 'İşlem gerçekleştirilemedi.');

    return interaction.editReply({
        embeds: [createEmbed('admin', '✅ Bekleme Uzatıldı',
            `**${target.username}** · \`/${komut}\`\n${fmtMs(result.oldLeftMs)} → **${fmtMs(result.newLeftMs)}**`
        ).addFields({ name: '📝 Sebep', value: sebep, inline: false })]
    });
}

async function handleBeklemeAyarla(interaction) {
    const target = interaction.options.getUser('kullanici');
    const komut  = interaction.options.getString('komut');
    const sure   = interaction.options.getInteger('sure');
    const sebep  = interaction.options.getString('sebep');
    const cmd    = COOLDOWN_COMMANDS[komut];
    if (!cmd) return editError(interaction, `\`${komut}\` geçerli bir komut kodu değil.`);

    const ov  = await getAdminCooldownOverview(target.id);
    const all = [...ov.dbStatus, ...ov.runtimeStatus];
    const cur = all.find(s => s.commandCode === komut);
    const oldLeftMs = cur ? cur.leftMs : 0;
    const newLeftMs = Math.min(sure * 1000, MAX_USER_COOLDOWN_MS);

    const confirmed = await awaitAdminConfirmation(interaction, {
        title:       '⚠️ Bekleme Ayarla — Onay',
        description: `**${target.username}** kullanıcısının \`/${komut}\` bekleme süresi belirtilen değere ayarlanacak.`,
        target:      `${target.username} (<@${target.id}>)`,
        targetKey:   `/${komut}`,
        oldValue:    fmtMs(oldLeftMs),
        newValue:    sure === 0 ? '🟢 Hazır' : fmtMs(newLeftMs),
        reason:      sebep,
        riskLevel:   sure >= 3600 ? 'high' : 'normal'
    });
    if (!confirmed) return editInfo(interaction, '❌ İptal Edildi', 'Bekleme ayarlama işlemi gerçekleştirilmedi.');

    const result = await setUserCooldownRemaining({ userId: target.id, commandCode: komut, seconds: sure, actorId: interaction.user.id, reason: sebep });
    if (!result.ok) return editError(interaction, result.reason || 'İşlem gerçekleştirilemedi.');

    return interaction.editReply({
        embeds: [createEmbed('admin', '✅ Bekleme Ayarlandı',
            `**${target.username}** · \`/${komut}\`\n${fmtMs(result.oldLeftMs)} → **${sure === 0 ? '🟢 Hazır' : fmtMs(result.newLeftMs)}**`
        ).addFields({ name: '📝 Sebep', value: sebep, inline: false })]
    });
}

async function handleBeklemeTumuSifirla(interaction) {
    const target = interaction.options.getUser('kullanici');
    const sebep  = interaction.options.getString('sebep');

    const confirmed = await awaitAdminConfirmation(interaction, {
        title:       '⚠️ Tüm Beklemeler Sıfırla — Onay',
        description: `**${target.username}** kullanıcısının **tüm** bekleme süreleri sıfırlanacak.`,
        target:      `${target.username} (<@${target.id}>)`,
        oldValue:    '11 komutun bekleme süresi',
        newValue:    '🟢 Tümü hazır',
        reason:      sebep,
        riskLevel:   'high'
    });
    if (!confirmed) return editInfo(interaction, '❌ İptal Edildi', 'Toplu bekleme sıfırlama gerçekleştirilmedi.');

    const result = await resetAllUserCooldowns({ userId: target.id, actorId: interaction.user.id, reason: sebep });
    if (!result.ok) return editError(interaction, result.reason || 'İşlem gerçekleştirilemedi.');

    return interaction.editReply({
        embeds: [createEmbed('admin', '✅ Tüm Beklemeler Sıfırlandı',
            `**${target.username}** kullanıcısının tüm bekleme süreleri sıfırlandı.`
        ).addFields({ name: '📝 Sebep', value: sebep, inline: false })]
    });
}

async function handleBeklemeGlobalGoster(interaction) {
    const settings = await getGlobalCooldownSettings();
    const lines = settings.map(s => {
        const isMod = s.currentMs !== s.defaultMs ? ' *(değiştirilmiş)*' : '';
        return `**/${s.commandCode}** — ${s.currentS}s (varsayılan: ${s.defaultS}s)${isMod}`;
    });

    const embed = createEmbed('admin', '⚙️ Global Bekleme Süreleri',
        'Tüm komutların aktif global bekleme süreleri. Değiştirmek için `/admin bekleme global-ayarla` kullan.'
    ).addFields({ name: '📋 Ayarlar', value: lines.join('\n').slice(0, 1024), inline: false })
     .setFooter({ text: 'Global bekleme görüntüleme — read-only' });

    return interaction.editReply({ embeds: [embed] });
}

async function handleBeklemeGlobalAyarla(interaction) {
    const komut = interaction.options.getString('komut');
    const sure  = interaction.options.getInteger('sure');
    const sebep = interaction.options.getString('sebep');
    const cmd   = COOLDOWN_COMMANDS[komut];
    if (!cmd) return editError(interaction, `\`${komut}\` geçerli bir komut kodu değil.`);

    const settings = await getGlobalCooldownSettings();
    const cur = settings.find(s => s.commandCode === komut);
    const oldS = cur ? cur.currentS : Math.round(cmd.defaultMs / 1000);
    const newMs = sure * 1000;

    const confirmed = await awaitAdminConfirmation(interaction, {
        title:       '⚠️ Global Bekleme Ayarla — Onay',
        description: `\`/${komut}\` komutu için global bekleme süresi değiştirilecek. Tüm kullanıcıları etkiler.`,
        targetKey:   `/${komut} — ${cmd.settingKey}`,
        oldValue:    `${oldS}s`,
        newValue:    `${sure}s`,
        reason:      sebep,
        riskLevel:   'high'
    });
    if (!confirmed) return editInfo(interaction, '❌ İptal Edildi', 'Global bekleme ayarlama işlemi gerçekleştirilmedi.');

    const result = await setGlobalCooldown({ commandCode: komut, seconds: sure, actorId: interaction.user.id, reason: sebep });
    if (!result.ok) return editError(interaction, result.reason || 'Ayar kaydedilemedi.');

    return interaction.editReply({
        embeds: [createEmbed('admin', '✅ Global Bekleme Ayarlandı',
            `\`/${komut}\` — ${cmd.settingKey}\n${oldS}s → **${sure}s**`
        ).addFields(
            { name: '📝 Sebep', value: sebep, inline: false },
            { name: 'ℹ️ Not', value: 'Mevcut runtime cooldownlar eski süreyle devam eder. Yeni oturumlar yeni süreyi kullanır.', inline: false }
        )]
    });
}

async function handleBeklemeGlobalSifirla(interaction) {
    const komut = interaction.options.getString('komut');
    const sebep = interaction.options.getString('sebep');
    const cmd   = COOLDOWN_COMMANDS[komut];
    if (!cmd) return editError(interaction, `\`${komut}\` geçerli bir komut kodu değil.`);

    const settings = await getGlobalCooldownSettings();
    const cur = settings.find(s => s.commandCode === komut);
    const oldS = cur ? cur.currentS : Math.round(cmd.defaultMs / 1000);
    const defS = Math.round(cmd.defaultMs / 1000);

    const confirmed = await awaitAdminConfirmation(interaction, {
        title:       '⚠️ Global Bekleme Sıfırla — Onay',
        description: `\`/${komut}\` komutu için global bekleme süresi varsayılana döndürülecek.`,
        targetKey:   `/${komut} — ${cmd.settingKey}`,
        oldValue:    `${oldS}s`,
        newValue:    `${defS}s (varsayılan)`,
        reason:      sebep,
        riskLevel:   'high'
    });
    if (!confirmed) return editInfo(interaction, '❌ İptal Edildi', 'Global bekleme sıfırlama işlemi gerçekleştirilmedi.');

    const result = await resetGlobalCooldown({ commandCode: komut, actorId: interaction.user.id, reason: sebep });
    if (!result.ok) return editError(interaction, result.reason || 'Ayar sıfırlanamadı.');

    return interaction.editReply({
        embeds: [createEmbed('admin', '✅ Global Bekleme Sıfırlandı',
            `\`/${komut}\` — varsayılan değere döndürüldü.\n${oldS}s → **${defS}s**`
        ).addFields({ name: '📝 Sebep', value: sebep, inline: false })]
    });
}

// ==================[ KUMAR İŞLEMLERİ ]==================

async function handleKumarDurum(interaction) {
    const [gamblingEnabled, gambleMin, gambleMax, winChance, winMultiplier,
           coinMin, coinMax, coinMultiplier, slotMin, slotMax, slotJackpot, spamMs] = await Promise.all([
        getBooleanSetting('system.gambling_enabled', true),
        getNumberSetting('gamble.min_bet', 50),
        getNumberSetting('gamble.max_bet', 1000000),
        getNumberSetting('gamble.win_chance', 0.45),
        getNumberSetting('gamble.win_multiplier', 2.0),
        getNumberSetting('coinflip.min_bet', 10),
        getNumberSetting('coinflip.max_bet', 1000000),
        getNumberSetting('coinflip.multiplier', 2.0),
        getNumberSetting('slot.min_bet', 100),
        getNumberSetting('slot.max_bet', 1000000),
        getNumberSetting('slot.jackpot_multiplier', 10),
        getNumberSetting('cooldown.gamble_spam', 10000),
    ]);

    const statusIcon = gamblingEnabled ? '🟢 **AÇIK**' : '🔴 **KAPALI**';

    const embed = createEmbed('admin', '🎰 Kumar Sistemi Durumu', `Sistem durumu: ${statusIcon}`)
        .addFields(
            { name: '🎲 Kumar (/kumar)',
              value: `Min: ${formatNumber(gambleMin)} 🪙 · Max: ${formatNumber(gambleMax)} 🪙\nKazanma: %${Math.round(winChance*100)} · Çarpan: ${winMultiplier}x`,
              inline: false },
            { name: '🪙 Yazı-Tura (/yazitura)',
              value: `Min: ${formatNumber(coinMin)} 🪙 · Max: ${formatNumber(coinMax)} 🪙\nKazanç çarpanı: ${coinMultiplier}x`,
              inline: false },
            { name: '🎰 Slot (/slot)',
              value: `Min: ${formatNumber(slotMin)} 🪙 · Max: ${formatNumber(slotMax)} 🪙\nJackpot: ${slotJackpot}x · Üçlü: 4x · İkili: 1.5x`,
              inline: false },
            { name: '⏱️ Spam Koruması',
              value: `${Math.round(spamMs / 1000)}s · Değiştirmek için \`/admin bekleme global-ayarla\` kullan.`,
              inline: false }
        )
        .setFooter({ text: 'Kumar durumu — read-only' });

    return interaction.editReply({ embeds: [embed] });
}

async function handleKumarAyarGoster(interaction) {
    const [rows, gamblingEnabled] = await Promise.all([
        listSettings('gambling').catch(() => []),
        getBooleanSetting('system.gambling_enabled', true)
    ]);

    const statusText = gamblingEnabled ? '🟢 Açık' : '🔴 Kapalı';

    if (rows.length === 0) {
        const embed = createEmbed('admin', '⚙️ Kumar Ayarları',
            'Henüz ayar kaydedilmemiş. Varsayılan değerler kullanılıyor.'
        ).addFields({ name: '🎰 Risk Oyunları', value: statusText, inline: true });
        return interaction.editReply({ embeds: [embed] });
    }

    const lines = rows.map(r => {
        const val = r.value;
        const def = r.default_value;
        const isMod = val !== def ? ' *(değiştirilmiş)*' : '';
        const range = (r.min_value !== null && r.max_value !== null)
            ? ` [${r.min_value}–${r.max_value}]`
            : '';
        return `**${r.key}**: ${val} (varsayılan: ${def})${range}${isMod}`;
    });

    const embed = createEmbed('admin', '⚙️ Kumar Ayarları',
        'Tüm gambling kategorisi ayarları. Değiştirmek için `/admin kumar ayar-ayarla` kullan.'
    ).addFields(
        { name: '🎰 Risk Oyunları',  value: statusText,                             inline: true },
        { name: '📋 Ayarlar',        value: lines.join('\n').slice(0, 1024),         inline: false },
        { name: 'ℹ️ Not',           value: 'Cooldown ayarı `/admin bekleme global-ayarla komut:kumar` üzerinden yönetilir.', inline: false }
    ).setFooter({ text: 'Kumar ayar görüntüleme — read-only' });

    return interaction.editReply({ embeds: [embed] });
}

async function handleKumarAyarAyarla(interaction) {
    const ayarChoice = interaction.options.getString('ayar');
    const rawDeger   = interaction.options.getNumber('deger');
    const sebep      = interaction.options.getString('sebep');

    const ayarInfo = KUMAR_AYAR_MAP[ayarChoice];
    if (!ayarInfo) return editError(interaction, `\`${ayarChoice}\` geçerli bir kumar ayarı değil.`);

    // Değeri dönüştür ve validate et
    let storedValue, displayOldValue, displayNewValue;

    const currentRaw = await getNumberSetting(ayarInfo.key, ayarInfo.defaultValue);

    if (ayarInfo.isPercentage) {
        if (!validateWinChancePct(rawDeger)) {
            return editError(interaction, `Kazanma oranı 1 ile 95 arasında yüzde olarak girilmeli (örn: 45 → %45).`);
        }
        storedValue = rawDeger / 100;
        displayOldValue = `%${Math.round(currentRaw * 100)}`;
        displayNewValue = `%${rawDeger}`;
    } else {
        storedValue = rawDeger;
        displayOldValue = formatNumber(currentRaw);
        displayNewValue = formatNumber(rawDeger);
    }

    const riskLevel = getKumarRiskLevel(ayarChoice, rawDeger);

    const confirmed = await awaitAdminConfirmation(interaction, {
        title:       '⚠️ Kumar Ayarı Değiştir — Onay',
        description: `\`${ayarInfo.key}\` ayarı değiştirilecek.`,
        targetKey:   ayarInfo.key,
        oldValue:    displayOldValue,
        newValue:    displayNewValue,
        reason:      sebep,
        riskLevel
    });
    if (!confirmed) return editInfo(interaction, '❌ İptal Edildi', 'Kumar ayarı değiştirme iptal edildi.');

    try {
        await setSetting(ayarInfo.key, String(storedValue), interaction.user.id, sebep);
    } catch (err) {
        return editError(interaction, err.message || 'Ayar kaydedilemedi.');
    }

    return interaction.editReply({
        embeds: [createEmbed('admin', '✅ Kumar Ayarı Güncellendi',
            `\`${ayarInfo.key}\`\n${displayOldValue} → **${displayNewValue}**`
        ).addFields({ name: '📝 Sebep', value: sebep, inline: false })]
    });
}

async function handleKumarAc(interaction) {
    const sebep = interaction.options.getString('sebep');

    const currentEnabled = await getBooleanSetting('system.gambling_enabled', true);
    if (currentEnabled) {
        return editInfo(interaction, 'ℹ️ Kumar Zaten Açık', 'Kumar sistemi halihazırda açık durumda.');
    }

    const confirmed = await awaitAdminConfirmation(interaction, {
        title:       '⚠️ Kumar Sistemini Aç — Onay',
        description: 'Kumar sistemi açılacak. `/kumar`, `/yazitura` ve `/slot` tekrar kullanılabilir olacak.',
        targetKey:   'system.gambling_enabled',
        oldValue:    'false (kapalı)',
        newValue:    'true (açık)',
        reason:      sebep,
        riskLevel:   'high'
    });
    if (!confirmed) return editInfo(interaction, '❌ İptal Edildi', 'Kumar açma işlemi gerçekleştirilmedi.');

    try {
        await setSetting('system.gambling_enabled', 'true', interaction.user.id, sebep);
    } catch (err) {
        return editError(interaction, err.message || 'Ayar kaydedilemedi.');
    }

    return interaction.editReply({
        embeds: [createEmbed('admin', '✅ Kumar Sistemi Açıldı',
            '`/kumar`, `/yazitura` ve `/slot` komutları tekrar kullanılabilir.'
        ).addFields({ name: '📝 Sebep', value: sebep, inline: false })]
    });
}

async function handleKumarKapat(interaction) {
    const sebep = interaction.options.getString('sebep');

    const currentEnabled = await getBooleanSetting('system.gambling_enabled', true);
    if (!currentEnabled) {
        return editInfo(interaction, 'ℹ️ Kumar Zaten Kapalı', 'Kumar sistemi halihazırda kapalı durumda.');
    }

    const confirmed = await awaitAdminConfirmation(interaction, {
        title:       '⚠️ Kumar Sistemini Kapat — Onay',
        description: 'Kumar sistemi kapatılacak. `/kumar`, `/yazitura` ve `/slot` devre dışı kalacak.',
        targetKey:   'system.gambling_enabled',
        oldValue:    'true (açık)',
        newValue:    'false (kapalı)',
        reason:      sebep,
        riskLevel:   'high'
    });
    if (!confirmed) return editInfo(interaction, '❌ İptal Edildi', 'Kumar kapatma işlemi gerçekleştirilmedi.');

    try {
        await setSetting('system.gambling_enabled', 'false', interaction.user.id, sebep);
    } catch (err) {
        return editError(interaction, err.message || 'Ayar kaydedilemedi.');
    }

    return interaction.editReply({
        embeds: [createEmbed('admin', '✅ Kumar Sistemi Kapatıldı',
            '`/kumar`, `/yazitura` ve `/slot` komutları geçici olarak devre dışı.'
        ).addFields({ name: '📝 Sebep', value: sebep, inline: false })]
    });
}

async function handleKumarVarsayilanaDondur(interaction) {
    const ayarChoice = interaction.options.getString('ayar');
    const sebep      = interaction.options.getString('sebep');

    const ayarInfo = KUMAR_AYAR_MAP[ayarChoice];
    if (!ayarInfo) return editError(interaction, `\`${ayarChoice}\` geçerli bir kumar ayarı değil.`);

    const currentRaw = await getNumberSetting(ayarInfo.key, ayarInfo.defaultValue);

    const displayOld = ayarInfo.isPercentage
        ? `%${Math.round(currentRaw * 100)}`
        : formatNumber(currentRaw);
    const displayDef = ayarInfo.isPercentage
        ? `%${Math.round(ayarInfo.defaultValue * 100)}`
        : formatNumber(ayarInfo.defaultValue);

    const confirmed = await awaitAdminConfirmation(interaction, {
        title:       '⚠️ Varsayılana Döndür — Onay',
        description: `\`${ayarInfo.key}\` ayarı varsayılan değerine döndürülecek.`,
        targetKey:   ayarInfo.key,
        oldValue:    displayOld,
        newValue:    `${displayDef} (varsayılan)`,
        reason:      sebep,
        riskLevel:   'normal'
    });
    if (!confirmed) return editInfo(interaction, '❌ İptal Edildi', 'Varsayılana döndürme iptal edildi.');

    try {
        await resetSetting(ayarInfo.key, interaction.user.id, sebep);
    } catch (err) {
        return editError(interaction, err.message || 'Ayar sıfırlanamadı.');
    }

    return interaction.editReply({
        embeds: [createEmbed('admin', '✅ Ayar Varsayılana Döndürüldü',
            `\`${ayarInfo.key}\`\n${displayOld} → **${displayDef}**`
        ).addFields({ name: '📝 Sebep', value: sebep, inline: false })]
    });
}

// ==================[ EKONOMİ DENETİM RAPORLARI ]==================

async function handleEkonomiRapor(interaction) {
    const [ov, gamblingEnabled] = await Promise.all([
        getEconomyOverview(),
        getBooleanSetting('system.gambling_enabled', true)
    ]);

    const topLine = ov.top3.length > 0
        ? ov.top3.map((r, i) => `${i + 1}. <@${r.userId}> — ${formatNumber(r.totalWealth)} 🪙`).join('\n')
        : 'Veri yok.';

    const seasonLine = ov.seasonName
        ? `${ov.seasonName} · ${formatNumber(ov.seasonPoints)} puan · ${ov.seasonParticipants} katılımcı`
        : 'Aktif sezon yok.';

    const embed = createEmbed('economy', '📊 Genel Ekonomi Raporu',
        `Sunucunun anlık ekonomik sağlık durumu.`
    ).addFields(
        { name: '👥 Kayıtlı Kullanıcı', value: String(ov.userCount),                        inline: true },
        { name: '💰 Toplam Cüzdan',      value: `${formatNumber(ov.totalWallet)} 🪙`,        inline: true },
        { name: '🏦 Toplam Banka',       value: `${formatNumber(ov.totalBank)} 🪙`,           inline: true },

        { name: '💎 Toplam Servet',      value: `${formatNumber(ov.totalWealth)} 🪙`,         inline: true },
        { name: '📈 Ortalama Servet',    value: `${formatNumber(ov.avgWealth)} 🪙`,           inline: true },
        { name: '📉 Medyan Servet',      value: `${formatNumber(ov.medianWealth)} 🪙`,        inline: true },

        { name: '📋 Ort. Kredi Puanı',  value: String(ov.avgCreditScore),                   inline: true },
        { name: '📝 Aktif Krediler',     value: `${ov.activeLoanCount} adet`,                 inline: true },
        { name: '⚠️ Gecikmiş Krediler', value: `${ov.overdueCount} adet`,                    inline: true },

        { name: '💸 Toplam Aktif Borç',  value: `${formatNumber(ov.totalActiveDebt)} 🪙`,    inline: true },
        { name: '📦 Kasalar (envanter)', value: `${formatNumber(ov.crateTotal)} adet`,        inline: true },
        { name: '✨ Koleksiyon (adet)',   value: `${formatNumber(ov.colTotal)} / ~${formatNumber(ov.colValue)} 🪙`, inline: true },

        { name: '🏆 Aktif Sezon',        value: seasonLine.slice(0, 1024),                             inline: false },
        { name: '👑 En Zengin 3',        value: topLine.slice(0, 1024) || 'Veri yok.',                inline: false },
        { name: '🎰 Kumar Sistemi',       value: gamblingEnabled ? '🟢 Açık' : '🔴 Kapalı',            inline: true  }
    ).setFooter({ text: 'Ekonomi raporu — read-only' });

    return interaction.editReply({ embeds: [embed] });
}

async function handleEkonomiParaAkisi(interaction) {
    const sure = interaction.options.getInteger('sure') ?? 24;
    const data = await getMoneyFlowReport(sure);

    if (!data.hasData) {
        const embed = createEmbed('economy', `💸 Para Akışı — Son ${data.hours} Saat`,
            'Bu dönem için `economy_transactions` tablosunda kayıt bulunamadı.\n' +
            'Not: `money.js` işlemleri bu tabloya kaydetmez; yalnızca `adminService` kayıt bırakır.'
        );
        return interaction.editReply({ embeds: [embed] });
    }

    const typeLines = data.types
        .map(t => `**${t.type}**: ${formatNumber(t.totalAmount)} 🪙 (${t.count}x)`)
        .join('\n')
        .slice(0, 1024) || 'Veri yok.';

    const embed = createEmbed('economy', `💸 Para Akışı — Son ${data.hours} Saat`,
        `Toplam işlem hacmi: **${formatNumber(data.totalTxAmount)} 🪙**`
    ).addFields(
        { name: '📋 İşlem Tipleri (en yüksek)',  value: typeLines,                                inline: false },
        { name: '➕ Admin Para Ekleme',           value: `${formatNumber(data.adminAdded)} 🪙`,   inline: true  },
        { name: '➖ Admin Para Silme',            value: `${formatNumber(data.adminRemoved)} 🪙`, inline: true  },
        { name: '📦 Kasa Coin Çıkışı',            value: `${formatNumber(data.crateCoinsOut)} 🪙`, inline: true }
    ).addFields({
        name: 'ℹ️ Not',
        value: 'İşlem tablosundaki `amount` değerleri her zaman pozitif; yön `type` alanından anlaşılır.',
        inline: false
    }).setFooter({ text: `Para akışı raporu — son ${data.hours} saat — read-only` });

    return interaction.editReply({ embeds: [embed] });
}

async function handleEkonomiZenginler(interaction) {
    const limit = interaction.options.getInteger('limit') ?? 10;
    const users = await getRichestUsers(limit);

    if (users.length === 0) {
        return editInfo(interaction, '👑 En Zenginler', 'Henüz kayıtlı kullanıcı yok.');
    }

    const lines = users.map((u, i) => {
        const flags = [
            u.hasOverdue   ? '⚠️' : '',
            u.isHighWealth ? '🔴' : '',
        ].filter(Boolean).join('');
        return `**${i + 1}.** <@${u.userId}> — ${formatNumber(u.totalWealth)} 🪙` +
               ` (C: ${formatNumber(u.wallet)} / B: ${formatNumber(u.bank)})` +
               ` Kredi: ${u.creditScore} ${flags}`;
    }).join('\n').slice(0, 1024);

    const embed = createEmbed('economy', `👑 En Zengin ${users.length} Kullanıcı`, lines)
        .addFields({
            name: 'Göstergeler',
            value: '⚠️ Gecikmiş kredi · 🔴 Servet 50M+ (yüksek)',
            inline: false
        })
        .setFooter({ text: `En zenginler raporu — read-only` });

    return interaction.editReply({ embeds: [embed] });
}

async function handleEkonomiKrediler(interaction) {
    const data = await getCreditRiskReport();

    const debtorLines = data.topDebtors.length > 0
        ? data.topDebtors.map(d =>
              `<@${d.userId}> — ${formatNumber(d.totalRemaining)} 🪙 (${d.loanCount} kredi, ${d.overdueCount}x gecikmiş)`
          ).join('\n')
        : 'Aktif borçlu yok.';

    const embed = createEmbed('credit', '📋 Kredi & Borç Risk Raporu',
        `Genel risk durumu: **${data.riskLabel}**`
    ).addFields(
        { name: '📝 Aktif Kredi Sayısı', value: String(data.activeCount),                    inline: true },
        { name: '⚠️ Gecikmiş Kredi',    value: String(data.overdueCount),                   inline: true },
        { name: '💸 Toplam Aktif Borç', value: `${formatNumber(data.totalDebt)} 🪙`,         inline: true },

        { name: '📊 Ort. Borç Miktarı', value: `${formatNumber(data.avgDebt)} 🪙`,           inline: true },
        { name: '📈 Ort. Kredi Puanı',  value: String(data.avgCreditScore),                  inline: true },
        { name: '🔴 Çok Riskli (<350)', value: `${data.veryRiskyCount} kullanıcı`,           inline: true },

        { name: '🏆 En Yüksek Borçlular', value: debtorLines.slice(0, 1024),                inline: false }
    ).setFooter({ text: 'Kredi risk raporu — read-only' });

    return interaction.editReply({ embeds: [embed] });
}

async function handleEkonomiEnvanter(interaction) {
    const data = await getInventoryEconomyReport();

    const topItemLines = data.topItems.length > 0
        ? data.topItems.map(i =>
              `**${i.displayName}** (${i.category}): ${formatNumber(i.totalQty)} adet / ${i.userCount} kullanıcı`
          ).join('\n')
        : 'Veri yok.';

    const rarestLines = data.rarest.length > 0
        ? data.rarest.map(i =>
              `**${i.displayName}**: ${i.totalQty} adet (${i.userCount} kullanıcı)`
          ).join('\n')
        : 'Veri yok.';

    const topCrateLines = data.topCrateUsers.length > 0
        ? data.topCrateUsers.map((u, i) =>
              `${i + 1}. <@${u.userId}> — ${u.crateTotal} kasa`
          ).join('\n')
        : 'Veri yok.';

    const prestigeLine = Object.entries(data.prestigeCounts)
        .map(([id, cnt]) => {
            const names = { vip_badge: 'VIP Rozeti', profil_cercevesi: 'Profil Çerçevesi', kara_kart: 'Kara Kart' };
            return `**${names[id] || id}**: ${cnt} kullanıcı`;
        }).join(' · ') || 'Veri yok.';

    const embed = createEmbed('crate', '📦 Envanter Ekonomi Raporu',
        `Toplam **${data.totalRecords}** farklı eşya tipi envanterde.`
    ).addFields(
        { name: '📦 Toplam Kasa (tüm)',        value: formatNumber(data.crateTotal),                   inline: true },
        { name: '✨ Koleksiyon Adedi',          value: formatNumber(data.colTotal),                     inline: true },
        { name: '💰 Koleksiyon Değeri (sat)',   value: `${formatNumber(data.colValue)} 🪙`,             inline: true },

        { name: '🏪 Diğer Eşyalar (toplam)',   value: formatNumber(data.itemTotal),                    inline: true },
        { name: '👑 Prestij Dağılımı',          value: prestigeLine.slice(0, 1024),                    inline: false },

        { name: '📋 En Çok Sahip Olunan (top 10)', value: topItemLines.slice(0, 1024),                 inline: false },
        { name: '🔮 En Nadir Koleksiyonlar',        value: rarestLines.slice(0, 1024),                 inline: false },
        { name: '📦 En Çok Kasası Olan Kullanıcılar', value: topCrateLines.slice(0, 1024),             inline: false }
    ).setFooter({ text: 'Envanter ekonomi raporu — read-only' });

    return interaction.editReply({ embeds: [embed] });
}

async function handleEkonomiAdminEtkisi(interaction) {
    const sure = interaction.options.getInteger('sure') ?? 24;
    const data = await getAdminImpactReport(sure);

    const topTargetLines = data.topTargets.length > 0
        ? data.topTargets.map(t => `<@${t.userId}> — ${t.count}x`).join('\n')
        : 'Veri yok.';
    const topActorLines = data.topActors.length > 0
        ? data.topActors.map(a => `<@${a.actorId}> — ${a.count}x`).join('\n')
        : 'Veri yok.';
    const recentLines = data.recentLogs.length > 0
        ? data.recentLogs.map(l =>
              `**${l.action}** [${l.category}] — <@${l.actor_id}>` +
              (l.target_user_id ? ` → <@${l.target_user_id}>` : '')
          ).join('\n')
        : 'Veri yok.';

    const embed = createEmbed('admin', `🛡️ Admin Etkisi — Son ${data.hours} Saat`,
        `Toplam **${data.total}** admin işlemi gerçekleştirildi.`
    ).addFields(
        { name: '💰 Para İşlemleri',   value: String(data.moneyCount),    inline: true },
        { name: '📦 Envanter',          value: String(data.invCount),      inline: true },
        { name: '🏆 Sezon',             value: String(data.seasonCount),   inline: true },

        { name: '⏳ Bekleme',           value: String(data.cooldownCount), inline: true },
        { name: '⚙️ Ayarlar',          value: String(data.settingsCount), inline: true },
        { name: '➕ Admin Para +',      value: `${formatNumber(data.adminAdded)} 🪙`,   inline: true },

        { name: '➖ Admin Para −',      value: `${formatNumber(data.adminRemoved)} 🪙`, inline: true },

        { name: '🎯 En Çok Hedef Alınan',    value: topTargetLines.slice(0, 1024),  inline: false },
        { name: '👮 En Aktif Admin',          value: topActorLines.slice(0, 1024),   inline: false },
        { name: '🕐 Son 5 İşlem',             value: recentLines.slice(0, 1024),     inline: false }
    ).setFooter({ text: `Admin etkisi raporu — son ${data.hours} saat — read-only` });

    return interaction.editReply({ embeds: [embed] });
}

async function handleEkonomiSupheli(interaction) {
    const sure = interaction.options.getInteger('sure') ?? 24;
    const data = await getSuspiciousEconomyReport(sure);

    if (data.signals.length === 0) {
        const embed = createEmbed('economy', `🔍 Şüpheli Ekonomi Sinyalleri — Son ${data.hours} Saat`,
            '✅ Şüpheli sinyal tespit edilmedi. Ekonomi normal görünüyor.'
        ).setFooter({ text: 'Şüpheli sinyal raporu — read-only' });
        return interaction.editReply({ embeds: [embed] });
    }

    const TYPE_LABELS = {
        high_wealth:  '💎 Yüksek Servet (50M+)',
        bank_overflow:'🏦 Banka Taşması',
        high_crates:  '📦 Çok Fazla Kasa (100+)',
        overdue_rich: '⚠️ Zengin Ama Gecikmiş Kredi',
        many_admin:   '👮 Yoğun Admin Müdahalesi',
        high_prestige:'👑 Çok Prestij Eşyası (3+)',
    };

    // Sinyalleri tip bazında grupla, her grup için bir embed field yap
    const groups = {};
    for (const s of data.signals) {
        if (!groups[s.type]) groups[s.type] = [];
        groups[s.type].push(s);
    }

    const embed = createEmbed('admin', `🔍 Şüpheli Ekonomi Sinyalleri — Son ${data.hours} Saat`,
        `Toplam **${data.signals.length}** şüpheli sinyal tespit edildi. Bu rapor otomatik ceza vermez; yalnızca bilgilendirme amaçlıdır.`
    );

    for (const [type, list] of Object.entries(groups)) {
        const label = TYPE_LABELS[type] || type;
        const lines = list
            .map(s => `• <@${s.userId}>: ${s.detail}`)
            .join('\n')
            .slice(0, 1024);
        embed.addFields({ name: label, value: lines || 'Veri yok.', inline: false });
    }

    embed.addFields(
        {
            name: 'ℹ️ Sinyal Türleri Hakkında',
            value: 'Servet, banka kapasitesi, kasa ve prestij sinyalleri anlık durumdur; süre filtresi yalnızca admin hareketleri gibi zamana bağlı sinyallere uygulanır.',
            inline: false
        },
        {
            name: '⚠️ Önemli Not',
            value: 'Bu rapor otomatik ceza vermez. Şüpheli durumları kendin inceleyerek karar ver.',
            inline: false
        }
    ).setFooter({ text: `Şüpheli sinyal raporu — son ${data.hours} saat — read-only` });

    return interaction.editReply({ embeds: [embed] });
}

// ==================[ /admin sistem durum ]==================

async function handleSistemDurum(interaction) {
    const [gambling, market, crateOpening, loan, interest, transfer, seasonPoints, tasks, achievements] =
        await Promise.all([
            getBooleanSetting('system.gambling_enabled',      true),
            getBooleanSetting('system.market_enabled',         true),
            getBooleanSetting('system.crate_opening_enabled',  true),
            getBooleanSetting('system.loan_enabled',           true),
            getBooleanSetting('system.interest_enabled',       true),
            getBooleanSetting('system.transfer_enabled',       true),
            getBooleanSetting('system.season_points_enabled',  true),
            getBooleanSetting('system.tasks_enabled',          true),
            getBooleanSetting('system.achievements_enabled',   true),
        ]);
    function s(v) { return v ? '🟢 Açık' : '🔴 Kapalı'; }
    const embed = createEmbed('admin', '⚙️ Sistem Durumu',
        'Tüm bot sistemlerinin anlık açık/kapalı durumu. Bu ekran sadece durum gösterir, işlem yapmaz.')
        .addFields(
            { name: '🎰 Kumar',           value: `${s(gambling)}\n/kumar · /yazitura · /slot`,           inline: true },
            { name: '🛒 Market',          value: `${s(market)}\n/market · /satinal · /sat`,              inline: true },
            { name: '📦 Kasa Açma',      value: `${s(crateOpening)}\n/kasa-ac`,                          inline: true },
            { name: '💳 Kredi Alma',     value: `${s(loan)}\n/kredi al (görüntüleme ve ödeme açık)`,     inline: true },
            { name: '🏦 Faiz',           value: `${s(interest)}\n/faiz`,                                 inline: true },
            { name: '💸 Para Transferi', value: `${s(transfer)}\n/gonder`,                               inline: true },
            { name: '🏆 Sezon Puanı',    value: `${s(seasonPoints)}\nPuan kazanımı (görüntüleme açık)`, inline: true },
            { name: '📋 Görevler',       value: `${s(tasks)}\n/gorevler ilerleme ve ödül`,               inline: true },
            { name: '🏅 Başarımlar',     value: `${s(achievements)}\n/basarimlar ilerleme ve ödül`,      inline: true },
        )
        .setFooter({ text: 'Açmak/kapatmak için /admin sistem ac | kapat' });
    return interaction.editReply({ embeds: [embed] });
}

// ==================[ /admin sistem ayarlar ]==================

async function handleSistemAyarlar(interaction) {
    const rows = await listSettings('system').catch(() => []);
    if (!rows.length) {
        return editInfo(interaction, 'ℹ️ Sistem Ayarları', 'Henüz sistem kategorisinde kayıt yok.');
    }
    const lines = rows.map(r => {
        const val = String(r.value ?? r.default_value ?? '—');
        return `\`${r.key}\` → **${val}**` + (r.description ? `\n— ${r.description}` : '');
    }).join('\n\n');
    const embed = createEmbed('admin', '⚙️ Sistem Kategorisi Ayarları',
        lines.slice(0, 4000)
    ).setFooter({ text: `${rows.length} kayıt · bot_settings · sistem — read-only` });
    return interaction.editReply({ embeds: [embed] });
}

// ==================[ /admin sistem ac ]==================

async function handleSistemAc(interaction) {
    const sistemChoice = interaction.options.getString('sistem');
    const sebep        = interaction.options.getString('sebep');
    const sistemInfo   = SISTEM_MAP[sistemChoice];
    if (!sistemInfo) return editError(interaction, `\`${sistemChoice}\` geçerli bir sistem değil.`);

    const currentEnabled = await getBooleanSetting(sistemInfo.key, true);
    if (currentEnabled) {
        return editInfo(interaction, `ℹ️ ${sistemInfo.label} Zaten Açık`,
            `**${sistemInfo.label}** sistemi zaten açık durumda.`);
    }

    const confirmed = await awaitAdminConfirmation(interaction, {
        title:       `⚠️ Sistemi Aç — ${sistemInfo.label}`,
        description: `**${sistemInfo.label}** sistemi açılacak.\nEtkilenen: ${sistemInfo.commands}`,
        targetKey:   sistemInfo.key,
        oldValue:    '🔴 Kapalı',
        newValue:    '🟢 Açık',
        reason:      sebep,
        riskLevel:   sistemInfo.riskLevel
    });
    if (!confirmed) return editInfo(interaction, '❌ İptal Edildi', 'Sistem açma işlemi gerçekleştirilmedi.');

    try {
        await setSetting(sistemInfo.key, 'true', interaction.user.id, sebep);
    } catch (err) {
        return editError(interaction, 'Ayar kaydedilemedi. Biraz sonra tekrar dener misin?');
    }

    return interaction.editReply({
        embeds: [createEmbed('admin', `✅ ${sistemInfo.label} Açıldı`,
            `**${sistemInfo.label}** sistemi açıldı.\nEtkilenen: ${sistemInfo.commands}`
        ).addFields({ name: '📝 Sebep', value: sebep, inline: false })]
    });
}

// ==================[ /admin sistem kapat ]==================

async function handleSistemKapat(interaction) {
    const sistemChoice = interaction.options.getString('sistem');
    const sebep        = interaction.options.getString('sebep');
    const sistemInfo   = SISTEM_MAP[sistemChoice];
    if (!sistemInfo) return editError(interaction, `\`${sistemChoice}\` geçerli bir sistem değil.`);

    const currentEnabled = await getBooleanSetting(sistemInfo.key, true);
    if (!currentEnabled) {
        return editInfo(interaction, `ℹ️ ${sistemInfo.label} Zaten Kapalı`,
            `**${sistemInfo.label}** sistemi zaten kapalı durumda.`);
    }

    const confirmed = await awaitAdminConfirmation(interaction, {
        title:       `⚠️ Sistemi Kapat — ${sistemInfo.label}`,
        description: `**${sistemInfo.label}** sistemi geçici olarak kapatılacak.\nEtkilenen: ${sistemInfo.commands}`,
        targetKey:   sistemInfo.key,
        oldValue:    '🟢 Açık',
        newValue:    '🔴 Kapalı',
        reason:      sebep,
        riskLevel:   'high'
    });
    if (!confirmed) return editInfo(interaction, '❌ İptal Edildi', 'Sistem kapatma işlemi gerçekleştirilmedi.');

    try {
        await setSetting(sistemInfo.key, 'false', interaction.user.id, sebep);
    } catch (err) {
        return editError(interaction, 'Ayar kaydedilemedi. Biraz sonra tekrar dener misin?');
    }

    return interaction.editReply({
        embeds: [createEmbed('admin', `🔴 ${sistemInfo.label} Kapatıldı`,
            `**${sistemInfo.label}** sistemi kapatıldı.\nEtkilenen: ${sistemInfo.commands}`
        ).addFields({ name: '📝 Sebep', value: sebep, inline: false })]
    });
}

// ==================[ /admin sistem varsayilana-dondur ]==================

async function handleSistemVarsayilanaDondur(interaction) {
    const sistemChoice = interaction.options.getString('sistem');
    const sebep        = interaction.options.getString('sebep');
    const sistemInfo   = SISTEM_MAP[sistemChoice];
    if (!sistemInfo) return editError(interaction, `\`${sistemChoice}\` geçerli bir sistem değil.`);

    const currentEnabled = await getBooleanSetting(sistemInfo.key, true);
    const oldValue = currentEnabled ? '🟢 Açık' : '🔴 Kapalı';

    const confirmed = await awaitAdminConfirmation(interaction, {
        title:       `⚠️ Varsayılana Döndür — ${sistemInfo.label}`,
        description: `**${sistemInfo.label}** sistem ayarı varsayılan değerine döndürülecek.\nEtkilenen: ${sistemInfo.commands}`,
        targetKey:   sistemInfo.key,
        oldValue,
        newValue:    '🟢 Açık (varsayılan: true)',
        reason:      sebep,
        riskLevel:   sistemInfo.riskLevel
    });
    if (!confirmed) return editInfo(interaction, '❌ İptal Edildi', 'Varsayılana döndürme işlemi gerçekleştirilmedi.');

    try {
        await resetSetting(sistemInfo.key, interaction.user.id, sebep);
    } catch (err) {
        return editError(interaction, 'Ayar sıfırlanamadı. Biraz sonra tekrar dener misin?');
    }

    return interaction.editReply({
        embeds: [createEmbed('admin', `↩️ ${sistemInfo.label} Varsayılana Döndürüldü`,
            `**${sistemInfo.label}** sistem ayarı varsayılan değerine döndürüldü.\nEtkilenen: ${sistemInfo.commands}`
        ).addFields(
            { name: '⬅️ Eski Değer', value: oldValue,              inline: true },
            { name: '➡️ Yeni Değer', value: '🟢 Açık (varsayılan)', inline: true },
            { name: '📝 Sebep',       value: sebep,                  inline: false }
        )]
    });
}
