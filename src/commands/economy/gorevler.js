const { MessageFlags, ButtonBuilder, ButtonStyle, ActionRowBuilder } = require('discord.js');
const { createEmbed } = require('../../utils/embeds');
const { formatFull } = require('../../utils/format');
const { getDailyTasks, getWeeklyTasks, claimTaskReward } = require('../../services/progressionService');
const { disableAllComponents } = require('../../utils/componentUtils');

const COLLECTOR_TIMEOUT = 5 * 60 * 1000;

const TASK_ICONS = {
    daily_work:   '💼',
    daily_reward: '🎁',
    daily_crate:  '📦',
    daily_buy:    '🛍️',
    daily_sell:   '💰',
    daily_save:   '🏦',
    daily_game:   '🎲',
    weekly_work:  '🔨',
    weekly_crate: '🎰',
    weekly_games: '🃏',
    weekly_sell:  '💵',
    weekly_daily: '📆',
    weekly_loan:  '💳',
    weekly_save:  '💾'
};

const CRATE_NAMES = {
    basit_kasa:    'Basit Kasa',
    nadir_kasa:    'Nadir Kasa',
    nexus_kasa:    'Nexus Kasa',
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
    if (!reward) return 'Özel ödül';
    if (reward.type === 'coin')         return `${formatFull(reward.amount)} MetaCoin 🪙`;
    if (reward.type === 'crate')        return `${reward.quantity || 1}× ${CRATE_NAMES[reward.itemId] || reward.itemId}`;
    if (reward.type === 'season_point') return `${reward.amount} sezon puanı`;
    return 'Özel ödül';
}

function buildTaskText(tasks) {
    if (!tasks || tasks.length === 0) return 'Görev bulunamadı.';

    return tasks.map(task => {
        const icon      = TASK_ICONS[task.code] || '📌';
        const bar       = formatProgressBar(task.progress, task.targetCount);
        const rewardStr = formatReward(task.reward);

        let status;
        if (task.claimed)        status = '✅ Ödül alındı';
        else if (task.completed) status = '🎁 Ödül hazır';
        else                     status = '⏳ Devam ediyor';

        return (
            `${icon} **${task.title}**\n` +
            `${task.description}\n` +
            `\`${bar}\` ${task.progress}/${task.targetCount} · ${status} · Ödül: ${rewardStr}`
        );
    }).join('\n\n');
}

function hasClaimable(daily, weekly) {
    return [...daily, ...weekly].some(t => t.completed && !t.claimed);
}

function buildButtons(activeTab, interactionId, hasClaim) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`tasks:daily:${interactionId}`)
            .setLabel('🌞 Günlük')
            .setStyle(activeTab === 'daily' ? ButtonStyle.Primary : ButtonStyle.Secondary)
            .setDisabled(activeTab === 'daily'),
        new ButtonBuilder()
            .setCustomId(`tasks:weekly:${interactionId}`)
            .setLabel('📅 Haftalık')
            .setStyle(activeTab === 'weekly' ? ButtonStyle.Primary : ButtonStyle.Secondary)
            .setDisabled(activeTab === 'weekly'),
        new ButtonBuilder()
            .setCustomId(`tasks:claim:${interactionId}`)
            .setLabel('🎁 Ödülleri Topla')
            .setStyle(ButtonStyle.Success)
            .setDisabled(!hasClaim)
    );
}

module.exports = {
    data: {
        name: 'gorevler',
        description: 'Günlük ve haftalık görevlerini görüntüle.',
        options: [
            {
                name: 'odulleri_al',
                description: 'Tamamlanan görev ödüllerini alır.',
                type: 5,       // Boolean
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
                const [dailyBefore, weeklyBefore] = await Promise.all([
                    getDailyTasks(userId),
                    getWeeklyTasks(userId)
                ]);

                const claimable = [...dailyBefore, ...weeklyBefore].filter(t => t.completed && !t.claimed);
                const embeds = [];

                if (claimable.length === 0) {
                    embeds.push(createEmbed('info', '🎁 Ödül Alma',
                        'Alınabilecek tamamlanmış görev ödülün yok.'));
                } else {
                    const claimed = [];
                    for (const task of claimable) {
                        try {
                            const result = await claimTaskReward(userId, task.code, task.periodKey);
                            if (result.ok) {
                                claimed.push(`• **${task.title}:** ${formatReward(task.reward)}`);
                            }
                        } catch (err) {
                            console.error(`Görev ödülü alınamadı [${task.code}]:`, err?.message);
                        }
                    }

                    if (claimed.length > 0) {
                        embeds.push(createEmbed('reward', '🎁 Alınan Ödüller', claimed.join('\n')));
                    } else {
                        embeds.push(createEmbed('info', '🎁 Ödül Alma',
                            'Ödüller alınırken bir sorun çıktı. Biraz sonra tekrar dene.'));
                    }
                }

                const [dailyTasks, weeklyTasks] = await Promise.all([
                    getDailyTasks(userId),
                    getWeeklyTasks(userId)
                ]);

                embeds.push(createEmbed('info', '🌞 Günlük Görevler', buildTaskText(dailyTasks)));
                embeds.push(
                    createEmbed('info', '📅 Haftalık Görevler', buildTaskText(weeklyTasks))
                        .setFooter({ text: 'Kalıcı rozetlerin için /basarimlar' })
                );

                return interaction.reply({ embeds });
            }

            // ---- Butonlu arayüz: normal /gorevler ----
            const [dailyTasks, weeklyTasks] = await Promise.all([
                getDailyTasks(userId),
                getWeeklyTasks(userId)
            ]);

            let currentData = { daily: dailyTasks, weekly: weeklyTasks };
            let activeTab   = 'daily';
            let currentRow  = buildButtons(activeTab, interaction.id, hasClaimable(currentData.daily, currentData.weekly));

            const message = await interaction.reply({
                embeds: [
                    createEmbed('info', '🌞 Günlük Görevler', buildTaskText(currentData.daily))
                        .setFooter({ text: 'Kalıcı rozetlerin için /basarimlar' })
                ],
                components: [currentRow],
                fetchReply: true
            });

            const collector = message.createMessageComponentCollector({
                time: COLLECTOR_TIMEOUT,
                filter: i => i.customId.startsWith('tasks:') && i.customId.endsWith(`:${interaction.id}`)
            });

            collector.on('collect', async (btn) => {
                if (btn.user.id !== interaction.user.id) {
                    return btn.reply({
                        content: 'Bu görev menüsü sana ait değil. Kendi görevlerini görmek için `/gorevler` kullan.',
                        flags: MessageFlags.Ephemeral
                    });
                }

                const action = btn.customId.split(':')[1];

                if (action === 'daily') {
                    activeTab  = 'daily';
                    currentRow = buildButtons(activeTab, interaction.id, hasClaimable(currentData.daily, currentData.weekly));
                    try {
                        await btn.update({
                            embeds: [
                                createEmbed('info', '🌞 Günlük Görevler', buildTaskText(currentData.daily))
                                    .setFooter({ text: 'Kalıcı rozetlerin için /basarimlar' })
                            ],
                            components: [currentRow]
                        });
                    } catch { /* sessizce geç */ }

                } else if (action === 'weekly') {
                    activeTab  = 'weekly';
                    currentRow = buildButtons(activeTab, interaction.id, hasClaimable(currentData.daily, currentData.weekly));
                    try {
                        await btn.update({
                            embeds: [
                                createEmbed('info', '📅 Haftalık Görevler', buildTaskText(currentData.weekly))
                                    .setFooter({ text: 'Kalıcı rozetlerin için /basarimlar' })
                            ],
                            components: [currentRow]
                        });
                    } catch { /* sessizce geç */ }

                } else if (action === 'claim') {
                    let fresh;
                    try {
                        const [fd, fw] = await Promise.all([getDailyTasks(userId), getWeeklyTasks(userId)]);
                        fresh = { daily: fd, weekly: fw };
                    } catch (err) {
                        console.error('Görev verisi alınamadı (claim):', err?.message);
                        try {
                            await btn.reply({ content: 'Görevler yüklenemedi. Biraz sonra tekrar dene.', flags: MessageFlags.Ephemeral });
                        } catch { /* sessizce geç */ }
                        return;
                    }

                    const claimable = [...fresh.daily, ...fresh.weekly].filter(t => t.completed && !t.claimed);

                    if (claimable.length === 0) {
                        try {
                            await btn.reply({ content: 'Alınabilecek tamamlanmış görev ödülün yok.', flags: MessageFlags.Ephemeral });
                        } catch { /* sessizce geç */ }
                        return;
                    }

                    const claimed = [];
                    for (const task of claimable) {
                        try {
                            const result = await claimTaskReward(userId, task.code, task.periodKey);
                            if (result.ok) claimed.push(`• **${task.title}:** ${formatReward(task.reward)}`);
                        } catch (err) {
                            console.error(`Görev ödülü alınamadı [${task.code}]:`, err?.message);
                        }
                    }

                    try {
                        const [ud, uw] = await Promise.all([getDailyTasks(userId), getWeeklyTasks(userId)]);
                        currentData = { daily: ud, weekly: uw };
                    } catch (err) {
                        console.error('Görev verisi güncellenemedi:', err?.message);
                    }

                    const claimEmbed = claimed.length > 0
                        ? createEmbed('reward', '🎁 Alınan Ödüller', claimed.join('\n'))
                            .setFooter({ text: 'Günlük veya Haftalık butonuna basarak görevlerini görebilirsin.' })
                        : createEmbed('info', '🎁 Ödül Alma', 'Ödüller alınırken bir sorun çıktı. Biraz sonra tekrar dene.');

                    activeTab  = 'claim';
                    currentRow = buildButtons('claim', interaction.id, hasClaimable(currentData.daily, currentData.weekly));
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
            console.error('Görevler komutu hatası:', err?.message);
            const errorEmbed = createEmbed('error', '⚠️ Bir Aksilik Oldu', 'Görevler şu an yüklenemedi. Biraz sonra tekrar dene.');
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
