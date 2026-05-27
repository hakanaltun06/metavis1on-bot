const { MessageFlags, ButtonBuilder, ButtonStyle, ActionRowBuilder } = require('discord.js');
const { createEmbed } = require('../../utils/embeds');
const { formatFull } = require('../../utils/format');
const { getUserAchievements, claimAchievementReward } = require('../../services/progressionService');
const { disableAllComponents } = require('../../utils/componentUtils');

const COLLECTOR_TIMEOUT = 5 * 60 * 1000;

const CRATE_NAMES = {
    basit_kasa:    'Basit Kasa',
    nadir_kasa:    'Nadir Kasa',
    nexus_kasa:    'Nexus Kasa',
    siber_kasa:    'Nexus Kasa',
    epik_kasa:     'Epik Kasa',
    neon_kasa:     'Neon Kasa',
    efsanevi_kasa: 'Efsanevi Kasa',
    prestij_kasa:  'Prestij Kasa'
};

function formatProgressBar(progress, target) {
    const t = Math.max(1, Number(target) || 1);
    const p = Math.max(0, Math.min(Number(progress) || 0, t));
    const filled = Math.round((p / t) * 5);
    return '[' + '█'.repeat(filled) + '░'.repeat(5 - filled) + ']';
}

function formatReward(reward) {
    if (!reward) return 'Rozet';
    if (reward.type === 'coin')  return `${formatFull(reward.amount)} MetaCoin 🪙`;
    if (reward.type === 'crate') return `${reward.quantity || 1}× ${CRATE_NAMES[reward.itemId] || reward.itemId}`;
    return 'Özel ödül';
}

function buildAchievementText(achievements) {
    if (!achievements || achievements.length === 0) return 'Başarım bulunamadı.';

    return achievements.map(a => {
        const icon      = a.icon || '🏅';
        const bar       = formatProgressBar(a.progress, a.targetCount);
        const rewardStr = formatReward(a.reward);

        let status;
        if (a.claimed)       status = '✅ Ödül alındı';
        else if (a.unlocked) status = '🎁 Ödül hazır';
        else                 status = '⏳ Devam ediyor';

        return (
            `${icon} **${a.title}**\n` +
            `${a.description}\n` +
            `\`${bar}\` ${a.progress}/${a.targetCount} · ${status} · Ödül: ${rewardStr}`
        );
    }).join('\n\n');
}

function hasClaimable(achievements) {
    return achievements.some(a => a.unlocked && !a.claimed);
}

function buildButtons(activeTab, interactionId, hasClaim) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`achievements:all:${interactionId}`)
            .setLabel('📋 Tümü')
            .setStyle(activeTab === 'all' ? ButtonStyle.Primary : ButtonStyle.Secondary)
            .setDisabled(activeTab === 'all'),
        new ButtonBuilder()
            .setCustomId(`achievements:unlocked:${interactionId}`)
            .setLabel('🎁 Açılanlar')
            .setStyle(activeTab === 'unlocked' ? ButtonStyle.Primary : ButtonStyle.Secondary)
            .setDisabled(activeTab === 'unlocked'),
        new ButtonBuilder()
            .setCustomId(`achievements:progress:${interactionId}`)
            .setLabel('⏳ Devam Edenler')
            .setStyle(activeTab === 'progress' ? ButtonStyle.Primary : ButtonStyle.Secondary)
            .setDisabled(activeTab === 'progress'),
        new ButtonBuilder()
            .setCustomId(`achievements:claim:${interactionId}`)
            .setLabel('🎁 Ödülleri Topla')
            .setStyle(ButtonStyle.Success)
            .setDisabled(!hasClaim)
    );
}

function buildAllEmbed(achievements) {
    return createEmbed('info', '🏅 Tüm Başarımlar',
        'Ekonomi yolculuğunda kazandığın rozetleri buradan takip edebilirsin.\n\n' +
        buildAchievementText(achievements)
    ).setFooter({ text: 'Günlük hedeflerin için /gorevler' });
}

function buildUnlockedEmbed(achievements) {
    const unlocked = achievements.filter(a => a.unlocked);
    if (unlocked.length === 0) {
        return createEmbed('info', '🎁 Açılanlar',
            'Henüz açılmış başarımın yok. Oynamaya devam ettikçe burada görünecek.'
        ).setFooter({ text: 'Günlük hedeflerin için /gorevler' });
    }
    return createEmbed('info', '🎁 Açılanlar', buildAchievementText(unlocked))
        .setFooter({ text: 'Günlük hedeflerin için /gorevler' });
}

function buildProgressEmbed(achievements) {
    const inProgress = achievements.filter(a => !a.unlocked);
    if (inProgress.length === 0) {
        return createEmbed('info', '⏳ Devam Edenler',
            'Devam eden başarım kalmamış. Harika gidiyorsun.'
        ).setFooter({ text: 'Günlük hedeflerin için /gorevler' });
    }
    return createEmbed('info', '⏳ Devam Edenler', buildAchievementText(inProgress))
        .setFooter({ text: 'Günlük hedeflerin için /gorevler' });
}

module.exports = {
    data: {
        name: 'basarimlar',
        description: 'Başarımlarını ve ilerlemeni görüntüle.',
        options: [
            {
                name: 'odulleri_al',
                description: 'Açılmış başarımların alınmamış ödüllerini alır.',
                type: 5,
                required: false
            }
        ]
    },

    async execute(interaction) {
        const shouldClaim = interaction.options.getBoolean('odulleri_al') || false;
        const userId      = interaction.user.id;

        try {
            // ---- Slash option akışı: odulleri_al:true — orijinal davranış korunuyor ----
            if (shouldClaim) {
                const achievementsBefore = await getUserAchievements(userId);
                const claimable = achievementsBefore.filter(a => a.unlocked && !a.claimed);

                const embeds = [];

                if (claimable.length === 0) {
                    embeds.push(createEmbed('info', '🎁 Ödül Alma',
                        'Alınabilecek açılmış başarım ödülün yok.'));
                } else {
                    const claimed = [];
                    for (const a of claimable) {
                        try {
                            const result = await claimAchievementReward(userId, a.code);
                            if (result.ok) {
                                claimed.push(`• **${a.title}:** ${formatReward(a.reward)}`);
                            }
                        } catch (err) {
                            console.error(`Başarım ödülü alınamadı [${a.code}]:`, err?.message);
                        }
                    }

                    if (claimed.length > 0) {
                        embeds.push(createEmbed('reward', '🎁 Alınan Ödüller', claimed.join('\n')));
                    } else {
                        embeds.push(createEmbed('info', '🎁 Ödül Alma',
                            'Ödüller alınırken bir sorun çıktı. Biraz sonra tekrar dene.'));
                    }
                }

                const achievements = await getUserAchievements(userId);
                embeds.push(
                    createEmbed('info', '🏅 Başarımlar',
                        'Ekonomi yolculuğunda kazandığın rozetleri buradan takip edebilirsin.\n\n' +
                        buildAchievementText(achievements))
                        .setFooter({ text: 'Ödülleri toplamak için /basarimlar odulleri_al seçeneğini aç · Günlük hedeflerin için /gorevler' })
                );

                return interaction.reply({ embeds });
            }

            // ---- Butonlu arayüz: normal /basarimlar ----
            const achievements = await getUserAchievements(userId);

            let currentAchievements = achievements;
            let activeTab   = 'all';
            let currentRow  = buildButtons(activeTab, interaction.id, hasClaimable(currentAchievements));

            const message = await interaction.reply({
                embeds: [buildAllEmbed(currentAchievements)],
                components: [currentRow],
                fetchReply: true
            });

            const collector = message.createMessageComponentCollector({
                time: COLLECTOR_TIMEOUT,
                filter: i => i.customId.startsWith('achievements:') && i.customId.endsWith(`:${interaction.id}`)
            });

            collector.on('collect', async (btn) => {
                if (btn.user.id !== interaction.user.id) {
                    return btn.reply({
                        content: 'Bu başarım menüsü sana ait değil. Kendi başarımlarını görmek için `/basarimlar` kullan.',
                        flags: MessageFlags.Ephemeral
                    });
                }

                const action = btn.customId.split(':')[1];

                if (action === 'all') {
                    activeTab  = 'all';
                    currentRow = buildButtons(activeTab, interaction.id, hasClaimable(currentAchievements));
                    try {
                        await btn.update({ embeds: [buildAllEmbed(currentAchievements)], components: [currentRow] });
                    } catch { /* sessizce geç */ }

                } else if (action === 'unlocked') {
                    activeTab  = 'unlocked';
                    currentRow = buildButtons(activeTab, interaction.id, hasClaimable(currentAchievements));
                    try {
                        await btn.update({ embeds: [buildUnlockedEmbed(currentAchievements)], components: [currentRow] });
                    } catch { /* sessizce geç */ }

                } else if (action === 'progress') {
                    activeTab  = 'progress';
                    currentRow = buildButtons(activeTab, interaction.id, hasClaimable(currentAchievements));
                    try {
                        await btn.update({ embeds: [buildProgressEmbed(currentAchievements)], components: [currentRow] });
                    } catch { /* sessizce geç */ }

                } else if (action === 'claim') {
                    let fresh;
                    try {
                        fresh = await getUserAchievements(userId);
                    } catch (err) {
                        console.error('Başarım verisi alınamadı (claim):', err?.message);
                        try {
                            await btn.reply({ content: 'Başarımlar yüklenemedi. Biraz sonra tekrar dene.', flags: MessageFlags.Ephemeral });
                        } catch { /* sessizce geç */ }
                        return;
                    }

                    const claimable = fresh.filter(a => a.unlocked && !a.claimed);

                    if (claimable.length === 0) {
                        try {
                            await btn.reply({ content: 'Alınabilecek açılmış başarım ödülün yok.', flags: MessageFlags.Ephemeral });
                        } catch { /* sessizce geç */ }
                        return;
                    }

                    const claimed = [];
                    for (const a of claimable) {
                        try {
                            const result = await claimAchievementReward(userId, a.code);
                            if (result.ok) claimed.push(`• **${a.title}:** ${formatReward(a.reward)}`);
                        } catch (err) {
                            console.error(`Başarım ödülü alınamadı [${a.code}]:`, err?.message);
                        }
                    }

                    try {
                        currentAchievements = await getUserAchievements(userId);
                    } catch (err) {
                        console.error('Başarım verisi güncellenemedi:', err?.message);
                    }

                    const claimEmbed = claimed.length > 0
                        ? createEmbed('reward', '🎁 Alınan Ödüller', claimed.join('\n'))
                            .setFooter({ text: 'Başarımlarını görmek için Tümü veya Açılanlar butonuna bas.' })
                        : createEmbed('info', '🎁 Ödül Alma', 'Ödüller alınırken bir sorun çıktı. Biraz sonra tekrar dene.');

                    activeTab  = 'claim';
                    currentRow = buildButtons('claim', interaction.id, hasClaimable(currentAchievements));
                    try {
                        await btn.update({ embeds: [claimEmbed], components: [currentRow] });
                    } catch { /* sessizce geç */ }
                }
            });

            collector.on('end', async () => {
                try {
                    await message.edit({ components: disableAllComponents([currentRow]) });
                } catch { /* sessizce geç */ }
            });

        } catch (err) {
            console.error('Başarımlar komutu hatası:', err?.message);
            const errorEmbed = createEmbed('error', '⚠️ Bir Aksilik Oldu', 'Başarımlar şu an yüklenemedi. Biraz sonra tekrar dene.');
            try {
                if (interaction.replied || interaction.deferred) {
                    await interaction.followUp({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
                } else {
                    await interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
                }
            } catch { /* ignore */ }
        }
    }
};
