const {
    MessageFlags, ButtonBuilder, ButtonStyle, ActionRowBuilder
} = require('discord.js');
const { ensureUser } = require('../../database/users');
const { getInventory } = require('../../database/inventory');
const { getLoanSummary } = require('../../database/loans');
const { createEmbed } = require('../../utils/embeds');
const { formatNumber, formatDate } = require('../../utils/format');
const { BANK_LEVELS, CURRENCY, CURRENCY_NAME } = require('../../utils/constants');
const {
    calculateFillPct, estimateInterest, getNextLevelDef, isMaxLevel
} = require('../../services/bankService');
const { refreshUserLoans } = require('../../services/loanRefresh');
const {
    isCrateItem, isRareItem, getRareItemByCode, getRarityLabel, getRarityEmoji
} = require('../../services/crateService');
const {
    getCurrentSeason, getUserSeasonData, getUserSeasonRank, getNextLevelInfo
} = require('../../services/seasonService');
const {
    getDailyTasks, getWeeklyTasks, getUserAchievements
} = require('../../services/progressionService');
const { getAllAchievementDefinitions } = require('../../config/achievementDefinitions');
const { disableAllComponents } = require('../../utils/componentUtils');

const COLLECTOR_TIMEOUT = 5 * 60 * 1000;
const RARITY_ORDER = { efsanevi: 4, epik: 3, ender: 2, siradan: 1 };

const WEALTH_TITLES = [
    { threshold: 10_000_000, label: '👑 Sunucu Patronu' },
    { threshold: 5_000_000,  label: '💰 Meta Milyoner' },
    { threshold: 1_000_000,  label: '🐺 Piyasa Kurdu' },
    { threshold: 500_000,    label: '🎰 Kasa Koleksiyoncusu' },
    { threshold: 150_000,    label: '🏦 Banka Müdavimi' },
    { threshold: 50_000,     label: '🎯 MetaCoin Avcısı' },
    { threshold: 10_000,     label: '🏪 Sokak Tüccarı' },
    { threshold: 0,          label: '🌱 Çaylak Kazanan' },
];

const PRESTIGE_ITEMS = [
    { id: 'kara_kart',        tag: '💳 Kara Kart Sahibi' },
    { id: 'profil_cercevesi', tag: '🌌 Neon Çerçeve Aktif' },
    { id: 'vip_badge',        tag: '⭐ VIP Rozeti Aktif' },
];

function getWealthTitle(totalWealth) {
    for (const entry of WEALTH_TITLES) {
        if (totalWealth >= entry.threshold) return entry.label;
    }
    return WEALTH_TITLES[WEALTH_TITLES.length - 1].label;
}

function buildButtons(active, interactionId) {
    const tabs = [
        { id: 'general',    label: '👤 Genel' },
        { id: 'economy',    label: '💰 Ekonomi' },
        { id: 'progress',   label: '🎯 İlerleme' },
        { id: 'season',     label: '⭐ Sezon' },
        { id: 'collection', label: '💎 Koleksiyon' },
    ];
    const buttons = tabs.map(tab =>
        new ButtonBuilder()
            .setCustomId(`profile:${tab.id}:${interactionId}`)
            .setLabel(tab.label)
            .setStyle(tab.id === active ? ButtonStyle.Primary : ButtonStyle.Secondary)
            .setDisabled(tab.id === active)
    );
    return new ActionRowBuilder().addComponents(buttons);
}

// ==================[ GENEL SEKMESİ ]==================
function buildGeneralEmbed(target, d) {
    const wealthTitle   = getWealthTitle(d.totalWealth);
    const unlockedAch   = d.achievements.filter(a => a.unlocked);
    const badgeIcons    = unlockedAch.slice(0, 5).map(a => a.icon).join(' ');
    const taskClaim     = [...d.dailyTasks, ...d.weeklyTasks].filter(t => t.completed && !t.claimed).length;
    const achClaim      = d.achievements.filter(a => a.unlocked && !a.claimed).length;
    const activePrestij = d.prestigeTags.filter(t => t.owned);
    const hasVip        = d.prestigeTags.some(t => t.id === 'vip_badge' && t.owned);
    const titlePrefix   = hasVip ? '💎 VIP Profil — ' : '👤 Profil — ';

    const seasonLine = d.activeSeason
        ? `Sezon Puanı: **${formatNumber(d.sPoints)}** (Sv. **${d.sLevel}**)`
        : 'Aktif sezon yok';

    const embed = createEmbed('premium', `${titlePrefix}${target.username}`)
        .setThumbnail(target.displayAvatarURL({ dynamic: true, size: 512 }))
        .addFields(
            { name: '🏅 Unvan', value: wealthTitle, inline: false },
            {
                name: '💰 Servet',
                value: [
                    `Cüzdan: **${formatNumber(d.wallet)} ${CURRENCY_NAME}** ${CURRENCY}`,
                    `Banka: **${formatNumber(d.bank)} ${CURRENCY_NAME}** ${CURRENCY}`,
                    `Toplam: **${formatNumber(d.totalWealth)} ${CURRENCY_NAME}** ${CURRENCY}`,
                ].join('\n'),
                inline: true
            },
            {
                name: '📊 Durum',
                value: [
                    `Banka Seviyesi: **${d.level}**`,
                    `Günlük Seri: **${d.userData.daily_streak || 0}**`,
                    `Toplam Mesai: **${d.userData.work_count || 0} kez**`,
                    seasonLine,
                ].join('\n'),
                inline: true
            },
            {
                name: '🎖️ Başarımlar',
                value: `**${unlockedAch.length}/${d.achievementTotal}** başarım açıldı` +
                    (badgeIcons ? `\n${badgeIcons}` : ''),
                inline: false
            }
        );

    if (activePrestij.length > 0) {
        embed.addFields({ name: '✨ Prestij', value: activePrestij.map(t => t.tag).join('\n'), inline: false });
    }

    if (taskClaim + achClaim > 0) {
        const parts = [];
        if (taskClaim > 0) parts.push(`**${taskClaim}** görev`);
        if (achClaim  > 0) parts.push(`**${achClaim}** başarım`);
        embed.addFields({
            name: '🎁 Hazır Ödüller',
            value: `${parts.join(' · ')} ödülü bekliyor!\n/gorevler ve /basarimlar ile toplayabilirsin.`,
            inline: false
        });
    }

    embed.setFooter({ text: `Kayıt: ${formatDate(d.userData.created_at)} · Sekmeler arasında geçiş yapabilirsin.` });
    return embed;
}

// ==================[ EKONOMİ SEKMESİ ]==================
function buildEconomyEmbed(target, d) {
    const nextDef  = getNextLevelDef(d.level);
    const maxed    = isMaxLevel(d.level);
    const interest = estimateInterest(d.bank);
    const filled   = Math.max(0, Math.min(10, Math.floor(d.fillPct / 10)));
    const bar      = '█'.repeat(filled) + '░'.repeat(10 - filled) + ` %${d.fillPct}`;
    const bankDesc = maxed
        ? 'Seviye **10** — Maksimum banka kapasitesi!'
        : `Seviye **${d.level}** → Yükseltme: **${formatNumber(nextDef.upgradeCost)} ${CURRENCY_NAME}** ${CURRENCY}`;

    const creditLines = [`Kredi Puanı: **${d.creditScore}**`];
    if (d.isSelf && d.loanSummary.activeCount > 0) {
        creditLines.push(`Aktif Kredi: **${d.loanSummary.activeCount}** adet`);
        creditLines.push(`Açık Borç: **${formatNumber(d.loanSummary.activeDebt)} ${CURRENCY_NAME}** ${CURRENCY}`);
    } else if (d.isSelf) {
        creditLines.push('Açık borç yok.');
    }

    const tips = [];
    if (d.fillPct >= 90) tips.push('📈 Banka kapasiten dolmak üzere. `/banka-yukselt` mantıklı olabilir.');
    else if (d.bank < d.limit * 0.1) tips.push('💡 Bankaya para yatırarak faizden daha iyi yararlanabilirsin.');
    if (d.isSelf && d.loanSummary.activeCount > 0) tips.push('💳 Aktif kredin var. `/kredi bilgi` ile takip edebilirsin.');
    else if (d.isSelf)  tips.push('💳 Kredi seçenekleri için `/kredi bilgi` kullanabilirsin.');

    const embed = createEmbed('premium', `💰 ${target.username} — Ekonomi`)
        .setThumbnail(target.displayAvatarURL({ dynamic: true, size: 512 }))
        .addFields(
            {
                name: '💵 Cüzdan',
                value: `**${formatNumber(d.wallet)} ${CURRENCY_NAME}** ${CURRENCY}`,
                inline: true
            },
            {
                name: '💎 Toplam Servet',
                value: `**${formatNumber(d.totalWealth)} ${CURRENCY_NAME}** ${CURRENCY}`,
                inline: true
            },
            { name: '​', value: '​', inline: true },
            {
                name: '🏦 Banka',
                value: [
                    `**${formatNumber(d.bank)}** / **${formatNumber(d.limit)} ${CURRENCY_NAME}** ${CURRENCY}`,
                    `\`${bar}\``,
                    bankDesc,
                    `Faiz Tahmini: **+${formatNumber(interest)} ${CURRENCY_NAME}** / 12 saat`,
                    `Toplam Faiz: **${formatNumber(d.totalInterest)} ${CURRENCY_NAME}** ${CURRENCY}`,
                ].join('\n'),
                inline: false
            },
            { name: '💳 Kredi', value: creditLines.join('\n'), inline: false }
        );

    if (tips.length > 0) embed.addFields({ name: '💡 Öneri', value: tips[0], inline: false });

    embed.setFooter({ text: 'Bakiye detayı için /bakiye · Banka bilgisi için /banka' });
    return embed;
}

// ==================[ İLERLEME SEKMESİ ]==================
function buildProgressEmbed(target, d) {
    const dailyDone  = d.dailyTasks.filter(t => t.completed).length;
    const weeklyDone = d.weeklyTasks.filter(t => t.completed).length;
    const unlocked   = d.achievements.filter(a => a.unlocked);
    const achPct     = d.achievementTotal > 0 ? Math.floor((unlocked.length / d.achievementTotal) * 100) : 0;
    const taskClaim  = [...d.dailyTasks, ...d.weeklyTasks].filter(t => t.completed && !t.claimed).length;
    const achClaim   = d.achievements.filter(a => a.unlocked && !a.claimed).length;
    const badgeIcons = unlocked.slice(0, 5).map(a => a.icon).join(' ');

    const embed = createEmbed('reward', `🎯 ${target.username} — İlerleme`)
        .setThumbnail(target.displayAvatarURL({ dynamic: true, size: 512 }))
        .addFields(
            { name: '📋 Günlük',  value: `**${dailyDone}/${d.dailyTasks.length}** tamamlandı`,                     inline: true },
            { name: '📅 Haftalık', value: `**${weeklyDone}/${d.weeklyTasks.length}** tamamlandı`,                   inline: true },
            { name: '🎖️ Başarım', value: `**${unlocked.length}/${d.achievementTotal}** — **%${achPct}**`, inline: true }
        );

    if (badgeIcons) {
        embed.addFields({ name: '🏅 Rozet Vitrini', value: badgeIcons, inline: false });
    }

    if (taskClaim + achClaim > 0) {
        const parts = [];
        if (taskClaim > 0) parts.push(`**${taskClaim}** görev ödülü`);
        if (achClaim  > 0) parts.push(`**${achClaim}** başarım ödülü`);
        embed.addFields({
            name: '🎁 Hazır Ödüller',
            value: `${parts.join(' · ')} hazır!\n/gorevler ve /basarimlar ile toplayabilirsin.`,
            inline: false
        });
    }

    const tips = [];
    if (taskClaim > 0)                        tips.push('▶ Hazır görev ödüllerin var. `/gorevler` ile toplayabilirsin.');
    else if (dailyDone < d.dailyTasks.length) tips.push('▶ Günlük görevlerini tamamlayarak ilerlemeni hızlandırabilirsin.');
    if (achClaim > 0)                         tips.push('▶ Açılmış başarım ödüllerin var. `/basarimlar` ile toplayabilirsin.');
    if (tips.length > 0) embed.addFields({ name: '💡 Sonraki Adım', value: tips[0], inline: false });

    embed.setFooter({ text: 'Görev detayları için /gorevler · Başarım detayları için /basarimlar' });
    return embed;
}

// ==================[ SEZON SEKMESİ ]==================
function buildSeasonEmbed(target, d) {
    const embed = createEmbed('premium', `⭐ ${target.username} — Sezon`)
        .setThumbnail(target.displayAvatarURL({ dynamic: true, size: 512 }));

    if (!d.activeSeason) {
        embed.setDescription('Şu anda aktif sezon yok. Yeni sezon başladığında bilgiler burada görünecek.');
        embed.setFooter({ text: 'Geçmiş sezonlar için /sezon-gecmis' });
        return embed;
    }

    const sRankText = d.sRank != null ? `#${d.sRank}` : 'Henüz yok';
    const nextInfo  = getNextLevelInfo(d.sPoints);
    const nextLine  = nextInfo.nextLevel
        ? `Sonraki Seviye **${nextInfo.nextLevel}**: **${formatNumber(nextInfo.remaining)}** puan kaldı`
        : '🏆 Maksimum Seviye!';

    let timeLeft = '';
    if (d.activeSeason.ends_at) {
        const diff = new Date(d.activeSeason.ends_at) - Date.now();
        if (diff > 0) {
            const days = Math.floor(diff / 86400000);
            timeLeft = days > 0
                ? ` · ${days} gün kaldı`
                : ` · ${Math.floor(diff / 3600000)} saat kaldı`;
        }
    }

    embed.addFields(
        { name: '🏆 Aktif Sezon', value: `**${d.activeSeason.name}**${timeLeft}`, inline: false },
        { name: '⭐ Puan',        value: `**${formatNumber(d.sPoints)}**`,          inline: true  },
        { name: '📊 Seviye',      value: `**${d.sLevel}**`,                         inline: true  },
        { name: '🏅 Sıralama',    value: `**${sRankText}**`,                        inline: true  },
        { name: '📈 İlerleme',    value: nextLine,                                  inline: false }
    );
    embed.setFooter({ text: '/sezon-siralama · /sezon-oduller · /sezon' });
    return embed;
}

// ==================[ KOLEKSİYON SEKMESİ ]==================
function buildCollectionEmbed(target, d) {
    const embed = createEmbed('collection', `💎 ${target.username} — Koleksiyon`)
        .setThumbnail(target.displayAvatarURL({ dynamic: true, size: 512 }));

    const colRows       = d.collectionRows;
    const activePrestij = d.prestigeTags.filter(t => t.owned);

    if (colRows.length === 0 && activePrestij.length === 0) {
        embed.setDescription('Henüz koleksiyon eşyan yok. Kasa açarak koleksiyonunu büyütebilirsin.');
        embed.setFooter({ text: '/kasa-ac ile kasa aç · /market ile kasa satın al' });
        return embed;
    }

    const rCount = { efsanevi: 0, epik: 0, ender: 0, siradan: 0 };
    let totalCount = 0, totalValue = 0, rarestItem = null, rarestLevel = 0;

    for (const row of colRows) {
        const def = getRareItemByCode(row.item_id);
        if (!def) continue;
        rCount[def.rarity] = (rCount[def.rarity] || 0) + row.quantity;
        totalCount += row.quantity;
        totalValue += def.sellValue * row.quantity;
        if ((RARITY_ORDER[def.rarity] || 0) > rarestLevel) {
            rarestLevel = RARITY_ORDER[def.rarity];
            rarestItem  = def;
        }
    }

    if (totalCount > 0) {
        const rarityLines = [
            rCount.efsanevi > 0 ? `🟡 Efsanevi: **${rCount.efsanevi}** adet` : null,
            rCount.epik     > 0 ? `🟣 Epik: **${rCount.epik}** adet`         : null,
            rCount.ender    > 0 ? `🟢 Ender: **${rCount.ender}** adet`        : null,
            rCount.siradan  > 0 ? `⚪ Sıradan: **${rCount.siradan}** adet`    : null,
        ].filter(Boolean);

        embed.addFields(
            {
                name: '📊 Nadirlik Dağılımı',
                value: rarityLines.length > 0 ? rarityLines.join('\n') : 'Koleksiyon eşyan yok.',
                inline: true
            },
            {
                name: '💰 Koleksiyon Özeti',
                value: `Adet: **${totalCount}**\nDeğer: **${formatNumber(totalValue)} ${CURRENCY_NAME}** ${CURRENCY}`,
                inline: true
            }
        );

        if (rarestItem) {
            embed.addFields({
                name: '👑 En Nadir Eşya',
                value: [
                    `${getRarityEmoji(rarestItem.rarity)} **${rarestItem.name}**`,
                    `*${getRarityLabel(rarestItem.rarity)}* · Değer: **${formatNumber(rarestItem.sellValue)} ${CURRENCY_NAME}** ${CURRENCY}`,
                ].join('\n'),
                inline: false
            });
        }
    }

    if (activePrestij.length > 0) {
        embed.addFields({
            name: '✨ Prestij Eşyaları',
            value: activePrestij.map(t => t.tag).join('\n'),
            inline: false
        });
    }

    embed.setFooter({ text: '/sat ile koleksiyon sat · /kasa-ac ile büyüt · /envanter ile detay' });
    return embed;
}

// ==================[ ANA KOMUT ]==================
module.exports = {
    data: {
        name: 'profil',
        description: 'Ekonomi profilini ve genel durumunu gösterir.',
        options: [{ name: 'kullanici', description: 'Profiline bakmak istediğin kullanıcı.', type: 6, required: false }]
    },
    async execute(interaction) {
        try {
            const target = interaction.options.getUser('kullanici') || interaction.user;
            if (target.bot) {
                return interaction.reply({
                    embeds: [createEmbed('error', '❌ Olmaz', 'Botların profili olmaz.')],
                    flags: MessageFlags.Ephemeral
                });
            }

            const isSelf = target.id === interaction.user.id;
            if (isSelf) await refreshUserLoans(interaction.user.id).catch(() => null);

            // === Temel kullanıcı verisi ===
            const userData    = await ensureUser(target.id);
            const wallet      = Number(userData.wallet);
            const bank        = Number(userData.bank);
            const totalWealth = wallet + bank;
            const limit       = Number(userData.bank_limit) || BANK_LEVELS[0].limit;
            const level       = userData.bank_level || 1;
            const fillPct     = calculateFillPct(bank, limit);
            const totalInterest = Number(userData.total_interest_earned) || 0;
            const creditScore   = Number(userData.credit_score) || 500;

            const loanSummary = isSelf
                ? await getLoanSummary(target.id).catch(() => ({ activeCount: 0, activeDebt: 0 }))
                : { activeCount: 0, activeDebt: 0 };

            // === Envanter ===
            const inventory = await getInventory(target.id);
            const collectionRows = inventory.filter(r => isRareItem(r.item_id) && r.quantity > 0);

            const prestigeTags = PRESTIGE_ITEMS.map(p => ({
                ...p,
                owned: inventory.some(r => r.item_id === p.id && r.quantity > 0)
            }));

            // === Sezon verisi ===
            let activeSeason = null, sPoints = 0, sLevel = 1, sRank = null;
            try {
                activeSeason = await getCurrentSeason();
                if (activeSeason) {
                    const [sd, rank] = await Promise.all([
                        getUserSeasonData(target.id),
                        getUserSeasonRank(target.id)
                    ]);
                    const sUser = sd.user;
                    sPoints = sUser ? Number(sUser.points)      : 0;
                    sLevel  = sUser ? Number(sUser.season_level) : 1;
                    sRank   = rank;
                }
            } catch (_) {}

            // === İlerleme verisi ===
            let dailyTasks = [], weeklyTasks = [], achievements = [];
            try {
                [dailyTasks, weeklyTasks, achievements] = await Promise.all([
                    getDailyTasks(target.id),
                    getWeeklyTasks(target.id),
                    getUserAchievements(target.id)
                ]);
            } catch (err) {
                console.error('Profil ilerleme verisi alınamadı:', err?.message);
            }

            const d = {
                userData, wallet, bank, totalWealth, limit, level, fillPct, totalInterest, creditScore,
                loanSummary, isSelf,
                collectionRows, prestigeTags,
                activeSeason, sPoints, sLevel, sRank,
                dailyTasks, weeklyTasks, achievements,
                achievementTotal: getAllAchievementDefinitions().length
            };

            // === Arayüz ===
            let currentTab = 'general';
            let currentRow = buildButtons(currentTab, interaction.id);

            const message = await interaction.reply({
                embeds: [buildGeneralEmbed(target, d)],
                components: [currentRow],
                fetchReply: true
            });

            const collector = message.createMessageComponentCollector({
                time: COLLECTOR_TIMEOUT,
                filter: i => i.customId.startsWith('profile:') && i.customId.endsWith(`:${interaction.id}`)
            });

            collector.on('collect', async (btn) => {
                if (btn.user.id !== interaction.user.id) {
                    return btn.reply({
                        content: 'Bu profil menüsü sana ait değil. Kendi profilini görmek için `/profil` kullan.',
                        flags: MessageFlags.Ephemeral
                    });
                }

                const tab = btn.customId.split(':')[1];
                currentTab = tab;
                currentRow = buildButtons(tab, interaction.id);

                let embed;
                switch (tab) {
                    case 'economy':    embed = buildEconomyEmbed(target, d);    break;
                    case 'progress':   embed = buildProgressEmbed(target, d);   break;
                    case 'season':     embed = buildSeasonEmbed(target, d);     break;
                    case 'collection': embed = buildCollectionEmbed(target, d); break;
                    default:           embed = buildGeneralEmbed(target, d);
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
            console.error('Profil komutu hatası:', err?.message);
            const errorEmbed = createEmbed('error', '⚠️ Bir Aksilik Oldu', 'Profil şu an yüklenemiyor. Biraz sonra tekrar dene.');
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
