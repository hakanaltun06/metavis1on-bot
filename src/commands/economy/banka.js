const {
    MessageFlags, ButtonBuilder, ButtonStyle, ActionRowBuilder
} = require('discord.js');
const { ensureUser } = require('../../database/users');
const { getLoanSummary, getActiveLoans } = require('../../database/loans');
const { createEmbed } = require('../../utils/embeds');
const { fmtMoney, formatDateTime, formatNumber } = require('../../utils/format');
const { BANK_LEVELS } = require('../../utils/constants');
const {
    calculateFillPct, estimateInterest, getNextLevelDef, isMaxLevel,
    INTEREST_RATE, INTEREST_INTERVAL_MS
} = require('../../services/bankService');
const { refreshUserLoans } = require('../../services/loanRefresh');
const { disableAllComponents } = require('../../utils/componentUtils');

const COLLECTOR_TIMEOUT = 5 * 60 * 1000;

function getCreditRisk(score) {
    if (score >= 750) return '🟢 Çok Güvenilir';
    if (score >= 600) return '🟡 Güvenilir';
    if (score >= 450) return '🟠 Orta Risk';
    if (score >= 300) return '🔴 Riskli';
    return '⚫ Çok Riskli';
}

function buildButtons(active, interactionId) {
    const tabs = [
        { id: 'summary',  label: '🏦 Özet' },
        { id: 'interest', label: '📈 Faiz' },
        { id: 'loan',     label: '💳 Kredi' },
        { id: 'upgrade',  label: '⬆️ Yükseltme' },
        { id: 'advice',   label: '💡 Tavsiye' },
    ];
    const buttons = tabs.map(tab =>
        new ButtonBuilder()
            .setCustomId(`bank:${tab.id}:${interactionId}`)
            .setLabel(tab.label)
            .setStyle(tab.id === active ? ButtonStyle.Primary : ButtonStyle.Secondary)
            .setDisabled(tab.id === active)
    );
    return new ActionRowBuilder().addComponents(buttons);
}

// ==================[ ÖZET SEKMESİ ]==================
function buildSummaryEmbed(user, d) {
    const totalWealth = d.wallet + d.bank;
    const filled = Math.max(0, Math.min(10, Math.floor(d.fillPct / 10)));
    const bar = '█'.repeat(filled) + '░'.repeat(10 - filled) + ` %${d.fillPct}`;

    const interestStatus = d.bank <= 0
        ? 'Bankada para yok'
        : d.canGetInterest
            ? '✅ Hazır'
            : `⏳ ${d.interestWaitText} kaldı`;

    const loanStatus = d.loanSummary.activeCount > 0
        ? `${d.loanSummary.activeCount} aktif kredi${d.loanSummary.overdueCount > 0 ? ` ⚠️ ${d.loanSummary.overdueCount} gecikmiş` : ''}`
        : 'Açık borç yok';

    return createEmbed('bank', `🏦 ${user.username} — Banka Merkezi`)
        .setThumbnail(user.displayAvatarURL({ dynamic: true, size: 512 }))
        .addFields(
            { name: '💵 Cüzdan',   value: fmtMoney(d.wallet),    inline: true },
            { name: '🏦 Banka',    value: fmtMoney(d.bank),       inline: true },
            { name: '💎 Toplam',   value: fmtMoney(totalWealth),  inline: true },
            {
                name: '📊 Banka Hesabı',
                value: [
                    `Seviye: **${d.level}**${d.maxed ? ' (Maksimum)' : ` / ${BANK_LEVELS.length}`}`,
                    `Kapasite: ${fmtMoney(d.limit)}`,
                    `Doluluk: \`${bar}\``,
                ].join('\n'),
                inline: false
            },
            { name: '📈 Faiz',  value: interestStatus, inline: true },
            { name: '💳 Kredi', value: loanStatus,      inline: true }
        )
        .setFooter({ text: 'Sekmeler arasında geçiş yaparak banka detaylarını inceleyebilirsin.' });
}

// ==================[ FAİZ SEKMESİ ]==================
function buildInterestEmbed(user, d) {
    const pct = (INTEREST_RATE * 100).toFixed(0);
    const lastInterestText = d.userData.last_interest
        ? formatDateTime(d.userData.last_interest)
        : 'Henüz faiz almadın.';

    let interestLine;
    if (d.bank <= 0) {
        interestLine = 'Faiz kazanmak için önce bankana para yatırmalısın.';
    } else if (d.canGetInterest) {
        interestLine = '✅ Faiz alınabilir. `/faiz` ile alabilirsin.';
    } else {
        interestLine = `⏳ **${d.interestWaitText}** sonra alınabilir.`;
    }

    const capWarning = d.bank > 0 && d.bank >= d.limit * 0.95
        ? '⚠️ Banka kapasiten dolmak üzere. Faiz kısmen veya hiç eklenemeyebilir.'
        : null;

    const embed = createEmbed('bank', `📈 ${user.username} — Faiz Bilgisi`)
        .setThumbnail(user.displayAvatarURL({ dynamic: true, size: 512 }))
        .addFields(
            { name: '🏦 Bankandaki Para',     value: fmtMoney(d.bank),         inline: true },
            { name: '📊 Faiz Oranı',          value: `**%${pct}** / 12 saat`,  inline: true },
            { name: '💰 Tahmini Faiz Geliri', value: fmtMoney(d.est),           inline: true },
            { name: '⏱️ Faiz Durumu',         value: interestLine,              inline: false },
            { name: '🕰️ Son Faiz Zamanı',     value: lastInterestText,          inline: true },
            { name: '📈 Toplam Faiz Kazancı', value: fmtMoney(d.totalInterest), inline: true }
        );

    if (capWarning) embed.addFields({ name: '⚠️ Uyarı', value: capWarning, inline: false });

    return embed.setFooter({ text: 'Faiz almak için /faiz · Kapasite artırmak için /banka-yukselt' });
}

// ==================[ KREDİ SEKMESİ ]==================
function buildLoanEmbed(user, d) {
    const riskLabel = getCreditRisk(d.creditScore);

    const embed = createEmbed('bank', `💳 ${user.username} — Kredi Durumu`)
        .setThumbnail(user.displayAvatarURL({ dynamic: true, size: 512 }))
        .addFields(
            { name: '🏅 Kredi Puanı', value: `**${d.creditScore}** — ${riskLabel}`, inline: false }
        );

    if (d.loanSummary.activeCount > 0) {
        embed.addFields(
            { name: '📋 Aktif Kredi',  value: `**${d.loanSummary.activeCount}** adet`,  inline: true },
            { name: '💸 Toplam Borç',  value: fmtMoney(d.loanSummary.activeDebt),        inline: true }
        );

        if (d.loanSummary.overdueCount > 0) {
            embed.addFields({
                name: '⚠️ Gecikmiş Kredi',
                value: `**${d.loanSummary.overdueCount}** adet gecikmiş kredin var. Ödemeyi öne alman tavsiye edilir.`,
                inline: false
            });
        }

        if (d.activeLoans.length > 0 && d.activeLoans[0].due_at) {
            const nearest = d.activeLoans[0];
            const dueText = formatDateTime(nearest.due_at) || 'Bilinmiyor';
            embed.addFields({
                name: '📅 En Yakın Ödeme',
                value: `${dueText} — Kalan: ${fmtMoney(nearest.remaining)}`,
                inline: false
            });
        }
    } else {
        embed.addFields({
            name: '✅ Kredi Durumu',
            value: 'Açık borç yok. Kredi notun temiz.',
            inline: false
        });
    }

    return embed.setFooter({ text: 'Kredi detayları için /kredi bilgi · Yeni kredi için /kredi al' });
}

// ==================[ YÜKSELTME SEKMESİ ]==================
function buildUpgradeEmbed(user, d) {
    const embed = createEmbed('bank', `⬆️ ${user.username} — Banka Yükseltme`)
        .setThumbnail(user.displayAvatarURL({ dynamic: true, size: 512 }))
        .addFields(
            { name: '🏦 Mevcut Seviye',   value: `**${d.level}** / ${BANK_LEVELS.length}`, inline: true },
            { name: '📦 Mevcut Kapasite', value: fmtMoney(d.limit),                         inline: true }
        );

    if (d.maxed) {
        embed.addFields({
            name: '🏆 Maksimum Seviye',
            value: 'Banka seviyen maksimumda. Tüm seviyeleri tamamladın!',
            inline: false
        });
    } else {
        const nextDef = d.nextDef;
        const canAfford = d.wallet >= nextDef.upgradeCost;
        const shortage = nextDef.upgradeCost - d.wallet;
        const capacityGain = nextDef.limit - d.limit;

        embed.addFields(
            { name: '⬆️ Sonraki Seviye',    value: `**${nextDef.level}** / ${BANK_LEVELS.length}`, inline: true },
            { name: '📈 Yeni Kapasite',      value: fmtMoney(nextDef.limit),                        inline: true },
            { name: '💰 Kapasite Artışı',    value: fmtMoney(capacityGain),                         inline: true },
            { name: '💵 Yükseltme Maliyeti', value: fmtMoney(nextDef.upgradeCost),                  inline: true },
            {
                name: '🎯 Cüzdan Durumu',
                value: canAfford
                    ? `${fmtMoney(d.wallet)} — ✅ Yeterli bakiye var.`
                    : `${fmtMoney(d.wallet)} — ${fmtMoney(shortage)} daha biriktirilmeli.`,
                inline: false
            }
        );
    }

    return embed.setFooter({ text: 'Yükseltmek için /banka-yukselt · Her seviye ek kapasite sağlar' });
}

// ==================[ TAVSİYE SEKMESİ ]==================
function buildAdviceEmbed(user, d) {
    const suggestions = [];

    if (d.fillPct >= 90) {
        suggestions.push('📈 Banka kapasiten dolmak üzere. `/banka-yukselt` mantıklı olabilir.');
    }
    if (d.wallet > 50000 && d.bank < d.wallet) {
        suggestions.push('💡 Cüzdanında yüksek para var. Güvende tutmak için `/yatir` kullanabilirsin.');
    }
    if (d.canGetInterest && d.bank > 0) {
        suggestions.push('⭐ Faiz alınabilir görünüyor. `/faiz` ile pasif gelirini alabilirsin.');
    }
    if (d.loanSummary.overdueCount > 0) {
        suggestions.push('⚠️ Gecikmiş kredi riski var. Önceliği borç ödemeye verebilirsin.');
    } else if (d.loanSummary.activeCount > 0) {
        suggestions.push('💳 Aktif kredini takip etmeyi unutma. `/kredi bilgi` komutunu kullanabilirsin.');
    }

    if (suggestions.length === 0) {
        suggestions.push('✅ Banka durumun dengeli görünüyor. Görev ve sezon hedeflerine odaklanabilirsin.');
    }

    return createEmbed('bank', `💡 ${user.username} — Akıllı Öneriler`)
        .setThumbnail(user.displayAvatarURL({ dynamic: true, size: 512 }))
        .setDescription(suggestions.slice(0, 4).join('\n\n'))
        .setFooter({ text: 'Banka işlemleri için /yatir · /cek · /faiz · /banka-yukselt' });
}

// ==================[ ANA KOMUT ]==================
module.exports = {
    data: { name: 'banka', description: 'Banka hesabını, kapasiteni ve faiz durumunu gösterir.' },
    async execute(interaction) {
        try {
            await refreshUserLoans(interaction.user.id).catch(() => null);

            const userData = await ensureUser(interaction.user.id);
            const wallet       = Number(userData.wallet);
            const bank         = Number(userData.bank);
            const limit        = Number(userData.bank_limit) || BANK_LEVELS[0].limit;
            const level        = userData.bank_level || 1;
            const maxed        = isMaxLevel(level);
            const fillPct      = calculateFillPct(bank, limit);
            const est          = estimateInterest(bank);
            const totalInterest = Number(userData.total_interest_earned) || 0;
            const creditScore  = Number(userData.credit_score) || 500;
            const nextDef      = maxed ? null : getNextLevelDef(level);

            // Faiz cooldown
            const now = Date.now();
            const lastInterestMs = userData.last_interest ? new Date(userData.last_interest).getTime() : 0;
            const canGetInterest = bank > 0 && (!lastInterestMs || now - lastInterestMs >= INTEREST_INTERVAL_MS);
            let interestWaitText = '';
            if (!canGetInterest && lastInterestMs > 0) {
                const leftMs = INTEREST_INTERVAL_MS - (now - lastInterestMs);
                const hrs    = Math.floor(leftMs / 3600000);
                const mins   = Math.floor((leftMs % 3600000) / 60000);
                interestWaitText = `${hrs} saat ${mins} dakika`;
            }

            const [loanSummary, activeLoans] = await Promise.all([
                getLoanSummary(interaction.user.id).catch(() => ({ activeCount: 0, overdueCount: 0, activeDebt: 0 })),
                getActiveLoans(interaction.user.id).catch(() => [])
            ]);

            const d = {
                userData, wallet, bank, limit, level, maxed, fillPct, est, totalInterest, creditScore, nextDef,
                canGetInterest, interestWaitText,
                loanSummary, activeLoans
            };

            let currentTab = 'summary';
            let currentRow = buildButtons(currentTab, interaction.id);

            const message = await interaction.reply({
                embeds: [buildSummaryEmbed(interaction.user, d)],
                components: [currentRow],
                fetchReply: true
            });

            const collector = message.createMessageComponentCollector({
                time: COLLECTOR_TIMEOUT,
                filter: i => i.customId.startsWith('bank:') && i.customId.endsWith(`:${interaction.id}`)
            });

            collector.on('collect', async (btn) => {
                if (btn.user.id !== interaction.user.id) {
                    return btn.reply({
                        content: 'Bu banka menüsü sana ait değil. Kendi banka bilgilerini görmek için `/banka` kullan.',
                        flags: MessageFlags.Ephemeral
                    });
                }

                const tab = btn.customId.split(':')[1];
                currentTab = tab;
                currentRow = buildButtons(tab, interaction.id);

                let embed;
                switch (tab) {
                    case 'interest': embed = buildInterestEmbed(interaction.user, d); break;
                    case 'loan':     embed = buildLoanEmbed(interaction.user, d);     break;
                    case 'upgrade':  embed = buildUpgradeEmbed(interaction.user, d);  break;
                    case 'advice':   embed = buildAdviceEmbed(interaction.user, d);   break;
                    default:         embed = buildSummaryEmbed(interaction.user, d);
                }

                try {
                    await btn.update({ embeds: [embed], components: [currentRow] });
                } catch {
                    // Mesaj silindi veya etkileşim süresi doldu — sessizce geç
                }
            });

            collector.on('end', async () => {
                try {
                    await message.edit({ components: disableAllComponents([currentRow]) });
                } catch {
                    // Mesaj artık mevcut değil — sessizce geç
                }
            });

        } catch (err) {
            console.error('Banka komutu hatası:', err?.message);
            const errorEmbed = createEmbed('error', '⚠️ Bir Aksilik Oldu', 'Banka bilgileri şu an yüklenemiyor. Biraz sonra tekrar dene.');
            try {
                if (interaction.replied || interaction.deferred) {
                    await interaction.followUp({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
                } else {
                    await interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
                }
            } catch {
                // ignore
            }
        }
    }
};
