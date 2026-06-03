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
    getItemDisplayName
} = require('../../services/adminControlService');
const { getLoanRiskText } = require('../../services/loanService');

// ==================[ YARDIMCI ]==================

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
