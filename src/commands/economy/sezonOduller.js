const {
    MessageFlags,
    ButtonBuilder,
    ButtonStyle,
    ActionRowBuilder
} = require('discord.js');
const { createEmbed } = require('../../utils/embeds');
const { formatNumber } = require('../../utils/format');
const {
    getCurrentSeason,
    getUserSeasonData,
    getClaimedLevels,
    claimLevelReward
} = require('../../services/seasonService');
const {
    SEASON_REWARD_PATH,
    formatSeasonReward
} = require('../../config/seasonRewards');

const COLLECTOR_TIMEOUT = 4 * 60 * 1000; // 4 dakika
const PAGE_SIZE = 10;
const TOTAL_PAGES = Math.ceil(SEASON_REWARD_PATH.length / PAGE_SIZE);

// ================== [ CLAIM REASON MESAJLARI ] ==================
const CLAIM_REASONS = {
    no_active_season:  'Şu anda aktif sezon bulunmuyor.',
    season_not_active: 'Bu ödül yalnızca aktif sezon için alınabilir.',
    invalid_level:     'Geçersiz sezon seviyesi.',
    invalid_params:    'Geçersiz parametreler.',
    level_locked:      'Bu ödülü almak için önce ilgili sezon seviyesine ulaşmalısın.',
    already_claimed:   'Bu sezon ödülünü zaten almışsın.',
    reward_not_found:  'Bu seviye için tanımlı bir ödül bulunamadı.',
    invalid_reward:    'Ödül tanımı geçersiz görünüyor.',
    user_not_found:    'Sezon kaydın henüz oluşmamış. Sezon boyunca bir aktivite yaparak puan kazanman gerekiyor.',
    error:             'Ödül alınırken beklenmeyen bir sorun oluştu. Biraz sonra tekrar dene.'
};

function getClaimMessage(reason) {
    return CLAIM_REASONS[reason] || CLAIM_REASONS.error;
}

// ================== [ YARDIMCI FONKSİYONLAR ] ==================
function getPageEntries(page) {
    const start = page * PAGE_SIZE;
    return SEASON_REWARD_PATH.slice(start, start + PAGE_SIZE);
}

// Sayfadaki seviyeleri formatla: ✅ 🎁 🔒
function buildRewardLines(entries, currentLevel, claimedSet) {
    return entries.map(entry => {
        const lvl = entry.level;
        const rewardText = formatSeasonReward(entry);
        if (claimedSet.has(lvl)) {
            return `✅ **Seviye ${lvl}** — ${rewardText}`;
        }
        if (currentLevel >= lvl) {
            return `🎁 **Seviye ${lvl}** — ${rewardText}`;
        }
        return `🔒 **Seviye ${lvl}** — ${rewardText}`;
    }).join('\n');
}

// En düşük alınabilir ama alınmamış seviye
function findNextClaimableLevel(currentLevel, claimedSet) {
    for (const entry of SEASON_REWARD_PATH) {
        if (currentLevel >= entry.level && !claimedSet.has(entry.level)) {
            return entry.level;
        }
    }
    return null;
}

// Embed oluştur
function buildEmbed(page, season, userData, claimedSet) {
    const seasonName = season ? season.name : '—';
    const currentLevel = userData ? Number(userData.season_level) || 1 : 0;
    const points = userData ? Number(userData.points) || 0 : 0;

    const claimedCount = claimedSet.size;
    const readyCount = SEASON_REWARD_PATH.filter(
        e => currentLevel >= e.level && !claimedSet.has(e.level)
    ).length;

    let descParts = [];
    if (season) {
        descParts.push(`**${seasonName}** aktif`);
    } else {
        descParts.push('Şu anda aktif sezon bulunmuyor.');
    }
    descParts.push(`📊 **${formatNumber(points)}** puan · Seviye **${currentLevel}**`);
    descParts.push(`✅ **${claimedCount}**/30 ödül alındı${readyCount > 0 ? ` · 🎁 **${readyCount}** ödül hazır` : ''}`);

    const entries = getPageEntries(page);
    const rewardLines = buildRewardLines(entries, currentLevel, claimedSet);

    const embed = createEmbed('reward', `🎖️ Sezon Ödül Yolu — Sayfa ${page + 1}/${TOTAL_PAGES}`, descParts.join('\n'));
    embed.addFields({ name: `Seviye ${entries[0].level}–${entries[entries.length - 1].level}`, value: rewardLines });
    embed.setFooter({ text: 'Ödüller yalnızca bir kez alınabilir.' });

    return embed;
}

// Buton satırı oluştur
function buildButtons(interactionId, page, hasClaimable) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`sezon_oduller:prev:${interactionId}`)
            .setLabel('◀️ Önceki')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(page === 0),
        new ButtonBuilder()
            .setCustomId(`sezon_oduller:next:${interactionId}`)
            .setLabel('Sonraki ▶️')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(page === TOTAL_PAGES - 1),
        new ButtonBuilder()
            .setCustomId(`sezon_oduller:claim:${interactionId}`)
            .setLabel('🎁 Ödülü Al')
            .setStyle(ButtonStyle.Success)
            .setDisabled(!hasClaimable),
        new ButtonBuilder()
            .setCustomId(`sezon_oduller:refresh:${interactionId}`)
            .setLabel('🔄 Yenile')
            .setStyle(ButtonStyle.Secondary)
    );
}

// Devre dışı buton satırı (timeout sonrası)
function buildDisabledButtons(interactionId, page) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`sezon_oduller:prev:${interactionId}`)
            .setLabel('◀️ Önceki')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(true),
        new ButtonBuilder()
            .setCustomId(`sezon_oduller:next:${interactionId}`)
            .setLabel('Sonraki ▶️')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(true),
        new ButtonBuilder()
            .setCustomId(`sezon_oduller:claim:${interactionId}`)
            .setLabel('🎁 Ödülü Al')
            .setStyle(ButtonStyle.Success)
            .setDisabled(true),
        new ButtonBuilder()
            .setCustomId(`sezon_oduller:refresh:${interactionId}`)
            .setLabel('🔄 Yenile')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(true)
    );
}

// ================== [ KOMUT ] ==================
module.exports = {
    data: {
        name: 'sezon-oduller',
        description: 'Sezon ödül yolunu gösterir ve sezon level ödüllerini almanı sağlar.'
    },

    async execute(interaction) {
        const userId = interaction.user.id;

        try {
            const season    = await getCurrentSeason();
            const { user: userData } = season ? await getUserSeasonData(userId) : { user: null };
            const claimedArr  = season && userData ? await getClaimedLevels(userId, season.id) : [];
            const claimedSet  = new Set(claimedArr);

            const currentLevel = userData ? Number(userData.season_level) || 1 : 0;
            const hasClaimable = findNextClaimableLevel(currentLevel, claimedSet) !== null;

            let page = 0;
            const message = await interaction.reply({
                embeds: [buildEmbed(page, season, userData, claimedSet)],
                components: [buildButtons(interaction.id, page, hasClaimable)],
                fetchReply: true
            });

            const collector = message.createMessageComponentCollector({
                time: COLLECTOR_TIMEOUT,
                filter: i =>
                    i.customId.startsWith('sezon_oduller:') &&
                    i.customId.endsWith(`:${interaction.id}`)
            });

            // Durum: collector'ın iç state'i
            let curSeason    = season;
            let curUserData  = userData;
            let curClaimed   = claimedSet;

            collector.on('collect', async (btn) => {
                // Başka kullanıcı basarsa
                if (btn.user.id !== userId) {
                    return btn.reply({
                        content: 'Bu menü sana ait değil. Kendi ödül yolun için `/sezon-oduller` kullanabilirsin.',
                        flags: MessageFlags.Ephemeral
                    });
                }

                const action = btn.customId.split(':')[1];

                if (action === 'prev') {
                    if (page > 0) page--;
                    const lvl = curUserData ? Number(curUserData.season_level) || 1 : 0;
                    const canClaim = findNextClaimableLevel(lvl, curClaimed) !== null;
                    try {
                        await btn.update({
                            embeds: [buildEmbed(page, curSeason, curUserData, curClaimed)],
                            components: [buildButtons(interaction.id, page, canClaim)]
                        });
                    } catch { /* yoksay */ }

                } else if (action === 'next') {
                    if (page < TOTAL_PAGES - 1) page++;
                    const lvl = curUserData ? Number(curUserData.season_level) || 1 : 0;
                    const canClaim = findNextClaimableLevel(lvl, curClaimed) !== null;
                    try {
                        await btn.update({
                            embeds: [buildEmbed(page, curSeason, curUserData, curClaimed)],
                            components: [buildButtons(interaction.id, page, canClaim)]
                        });
                    } catch { /* yoksay */ }

                } else if (action === 'refresh') {
                    // Veriyi yeniden yükle
                    try {
                        await btn.deferUpdate();
                    } catch { return; }
                    try {
                        curSeason    = await getCurrentSeason();
                        const freshData = curSeason ? await getUserSeasonData(userId) : { user: null };
                        curUserData  = freshData.user;
                        const freshArr = curSeason && curUserData ? await getClaimedLevels(userId, curSeason.id) : [];
                        curClaimed   = new Set(freshArr);
                        const lvl    = curUserData ? Number(curUserData.season_level) || 1 : 0;
                        const canClaim = findNextClaimableLevel(lvl, curClaimed) !== null;
                        await btn.editReply({
                            embeds: [buildEmbed(page, curSeason, curUserData, curClaimed)],
                            components: [buildButtons(interaction.id, page, canClaim)]
                        });
                    } catch (err) {
                        console.error('Sezon ödüller yenile hatası:', err?.message || err);
                    }

                } else if (action === 'claim') {
                    try {
                        await btn.deferUpdate();
                    } catch { return; }

                    if (!curSeason) {
                        try {
                            await btn.followUp({
                                content: getClaimMessage('no_active_season'),
                                flags: MessageFlags.Ephemeral
                            });
                        } catch { /* yoksay */ }
                        return;
                    }

                    const lvl = curUserData ? Number(curUserData.season_level) || 1 : 0;
                    const nextLevel = findNextClaimableLevel(lvl, curClaimed);

                    if (nextLevel === null) {
                        try {
                            await btn.followUp({
                                content: 'Şu an alınabilecek ödülün yok. Puan kazanarak sezon seviyeni yükseltebilirsin.',
                                flags: MessageFlags.Ephemeral
                            });
                        } catch { /* yoksay */ }
                        return;
                    }

                    const claimResult = await claimLevelReward(userId, curSeason.id, nextLevel);

                    if (!claimResult.success) {
                        try {
                            await btn.followUp({
                                content: getClaimMessage(claimResult.reason),
                                flags: MessageFlags.Ephemeral
                            });
                        } catch { /* yoksay */ }
                        // Veriyi yenile (durum değişmiş olabilir)
                        try {
                            const freshArr = await getClaimedLevels(userId, curSeason.id);
                            curClaimed = new Set(freshArr);
                            const freshData = await getUserSeasonData(userId);
                            curUserData = freshData.user;
                        } catch { /* yoksay */ }
                    } else {
                        // Başarılı claim — veriyi yenile ve sonuç mesajı göster
                        try {
                            const freshArr = await getClaimedLevels(userId, curSeason.id);
                            curClaimed = new Set(freshArr);
                            const freshData = await getUserSeasonData(userId);
                            curUserData = freshData.user;
                        } catch { /* yoksay */ }

                        const rewardText = claimResult.reward ? formatSeasonReward(claimResult.reward) : '—';
                        try {
                            await btn.followUp({
                                content: `✅ **Seviye ${nextLevel}** ödülünü aldın: ${rewardText}`,
                                flags: MessageFlags.Ephemeral
                            });
                        } catch { /* yoksay */ }
                    }

                    // Ekranı güncelle
                    const newLvl   = curUserData ? Number(curUserData.season_level) || 1 : 0;
                    const canClaim = findNextClaimableLevel(newLvl, curClaimed) !== null;
                    try {
                        await btn.editReply({
                            embeds: [buildEmbed(page, curSeason, curUserData, curClaimed)],
                            components: [buildButtons(interaction.id, page, canClaim)]
                        });
                    } catch { /* yoksay */ }
                }
            });

            // Timeout sonrası butonları devre dışı bırak
            collector.on('end', async () => {
                try {
                    await interaction.editReply({
                        components: [buildDisabledButtons(interaction.id, page)]
                    });
                } catch { /* mesaj silinmiş olabilir */ }
            });

        } catch (err) {
            console.error('Sezon ödüller hatası:', err && err.message ? err.message : err);
            const reply = {
                embeds: [createEmbed('error', '⚠️ Bir Aksilik Oldu', 'Sezon ödülleri yüklenemedi. Biraz sonra tekrar dene.')],
                flags: MessageFlags.Ephemeral
            };
            try {
                if (interaction.replied || interaction.deferred) {
                    await interaction.followUp(reply);
                } else {
                    await interaction.reply(reply);
                }
            } catch { /* yoksay */ }
        }
    }
};
