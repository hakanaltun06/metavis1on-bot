const { MessageFlags, ButtonBuilder, ButtonStyle, ActionRowBuilder } = require('discord.js');
const { createEmbed } = require('../../utils/embeds');
const { formatFull } = require('../../utils/format');
const {
    getDailyTasks, getWeeklyTasks, claimTaskReward,
    getUserSeasonTasks, claimSeasonTaskReward
} = require('../../services/progressionService');
const { formatSeasonTaskReward } = require('../../config/seasonTaskDefinitions');
const { disableAllComponents } = require('../../utils/componentUtils');
const { isSystemEnabled } = require('../../services/settingsService');

const COLLECTOR_TIMEOUT = 5 * 60 * 1000;

// ==================[ CLAIM REASON MESAJLARI — SEZON GÖREVİ ]==================
const SEASON_CLAIM_REASONS = {
    no_active_season:      'Şu anda aktif sezon bulunmuyor.',
    tasks_disabled:        'Görev sistemi kısa süreliğine kapalı.',
    season_points_disabled:'Sezon puanı kazanımı kısa süreliğine kapalı.',
    task_not_found:        'Bu sezon görevi bulunamadı.',
    invalid_period:        'Bu görev dönemi artık geçerli değil. Menüyü yenileyip tekrar dene.',
    not_completed:         'Bu sezon görevini almak için önce hedefi tamamlamalısın.',
    already_claimed:       'Bu sezon görevi ödülünü zaten almışsın.',
    error:                 'Sezon görevi ödülü alınırken beklenmeyen bir sorun oluştu. Biraz sonra tekrar dene.'
};

function getSeasonClaimMessage(reason) {
    return SEASON_CLAIM_REASONS[reason] || SEASON_CLAIM_REASONS.error;
}

// ==================[ NORMAL GÖREV HELPERları ]==================
const TASK_ICONS = {
    daily_work:   '💼',
    daily_reward: '🎁',
    daily_crate:  '📦',
    daily_buy:    '🛍️',
    daily_sell:   '💰',
    daily_save:   '🏦',
    daily_game:   '🎲',
    daily_crime:  '🕵️',
    daily_rob:    '🎯',
    weekly_work:  '🔨',
    weekly_crate: '🎰',
    weekly_games: '🃏',
    weekly_sell:  '💵',
    weekly_daily: '📆',
    weekly_loan:  '💳',
    weekly_save:  '💾',
    weekly_crime: '🕵️',
    weekly_rob:   '🎯'
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

// ==================[ SEZON GÖREVI HELPERları ]==================
function buildSeasonTaskText(tasks) {
    if (!tasks || tasks.length === 0) return 'Görev bulunamadı.';
    return tasks.map(task => {
        const bar       = formatProgressBar(task.progress, task.target);
        const rewardStr = formatSeasonTaskReward(task);
        let status;
        if (task.claimed)        status = '✅ Alındı';
        else if (task.completed) status = '🎁 Hazır';
        else                     status = '⏳ Devam ediyor';
        return (
            `${task.emoji} **${task.title}**\n` +
            `${task.description}\n` +
            `\`${bar}\` ${task.progress}/${task.target} · ${status} · ${rewardStr}`
        );
    }).join('\n\n');
}

function buildSeasonEmbed(seasonData) {
    const { activeSeason, tasks } = seasonData;

    if (!activeSeason) {
        return createEmbed('info', '⭐ Sezon Görevleri',
            'Şu anda aktif sezon bulunmuyor. Sezon başladığında burada görevlerini görebilirsin.')
            .setFooter({ text: 'Kalıcı rozetlerin için /basarimlar' });
    }

    const dailyTasks  = tasks.filter(t => t.periodType === 'season_daily');
    const weeklyTasks = tasks.filter(t => t.periodType === 'season_weekly');
    const onceTasks   = tasks.filter(t => t.periodType === 'season_once');

    const dailyClaimed  = dailyTasks.filter(t => t.claimed).length;
    const weeklyClaimed = weeklyTasks.filter(t => t.claimed).length;
    const onceClaimed   = onceTasks.filter(t => t.claimed).length;

    return createEmbed('info', `⭐ Sezon Görevleri — ${activeSeason.name}`,
        'Sezon görevlerini tamamlayarak ekstra puan kazan!')
        .addFields(
            {
                name:  `📅 Günlük Görevler (${dailyClaimed}/${dailyTasks.length})`,
                value: buildSeasonTaskText(dailyTasks)
            },
            {
                name:  `🗓️ Haftalık Görevler (${weeklyClaimed}/${weeklyTasks.length})`,
                value: buildSeasonTaskText(weeklyTasks)
            },
            {
                name:  `🏆 Sezonluk Görevler (${onceClaimed}/${onceTasks.length})`,
                value: buildSeasonTaskText(onceTasks)
            }
        )
        .setFooter({ text: 'Sezon görevleri puan kazandırır. Kalıcı rozetlerin için /basarimlar' });
}

// ==================[ BUTON YARDIMCILARI ]==================
function hasNormalClaimable(daily, weekly) {
    return [...daily, ...weekly].some(t => t.completed && !t.claimed);
}

function hasSeasonClaimable(seasonTasks) {
    return seasonTasks.some(t => t.completed && !t.claimed);
}

// activeTab: 'daily' | 'weekly' | 'season' | 'claim'
function buildButtons(activeTab, interactionId, hasClaim, hasSeasonClaim) {
    const inSeason     = activeTab === 'season';
    const claimId      = inSeason
        ? `tasks:season_claim:${interactionId}`
        : `tasks:claim:${interactionId}`;
    const claimLabel   = inSeason ? '🎁 Sezon Ödülü Al' : '🎁 Ödülleri Topla';
    const claimEnabled = inSeason ? hasSeasonClaim : hasClaim;

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
            .setCustomId(`tasks:season:${interactionId}`)
            .setLabel('⭐ Sezon')
            .setStyle(activeTab === 'season' ? ButtonStyle.Primary : ButtonStyle.Secondary)
            .setDisabled(activeTab === 'season'),
        new ButtonBuilder()
            .setCustomId(claimId)
            .setLabel(claimLabel)
            .setStyle(ButtonStyle.Success)
            .setDisabled(!claimEnabled)
    );
}

// ==================[ KOMUT ]==================
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
        const tasksEnabled = await isSystemEnabled('system.tasks_enabled').catch(() => true);
        if (!tasksEnabled) {
            return interaction.reply({
                embeds: [createEmbed('warn', '📋 Görevler', 'Görev sistemi kısa süreliğine kapalı. Biraz sonra tekrar deneyebilirsin.')],
                flags: MessageFlags.Ephemeral
            });
        }

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
            const [dailyTasks, weeklyTasks, seasonData] = await Promise.all([
                getDailyTasks(userId),
                getWeeklyTasks(userId),
                getUserSeasonTasks(userId)
            ]);

            let currentData       = { daily: dailyTasks, weekly: weeklyTasks };
            let currentSeasonData = seasonData;
            let activeTab         = 'daily';
            let currentRow        = buildButtons(
                activeTab, interaction.id,
                hasNormalClaimable(currentData.daily, currentData.weekly),
                hasSeasonClaimable(currentSeasonData.tasks)
            );

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
                    currentRow = buildButtons(
                        activeTab, interaction.id,
                        hasNormalClaimable(currentData.daily, currentData.weekly),
                        hasSeasonClaimable(currentSeasonData.tasks)
                    );
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
                    currentRow = buildButtons(
                        activeTab, interaction.id,
                        hasNormalClaimable(currentData.daily, currentData.weekly),
                        hasSeasonClaimable(currentSeasonData.tasks)
                    );
                    try {
                        await btn.update({
                            embeds: [
                                createEmbed('info', '📅 Haftalık Görevler', buildTaskText(currentData.weekly))
                                    .setFooter({ text: 'Kalıcı rozetlerin için /basarimlar' })
                            ],
                            components: [currentRow]
                        });
                    } catch { /* sessizce geç */ }

                } else if (action === 'season') {
                    activeTab  = 'season';
                    currentRow = buildButtons(
                        activeTab, interaction.id,
                        hasNormalClaimable(currentData.daily, currentData.weekly),
                        hasSeasonClaimable(currentSeasonData.tasks)
                    );
                    try {
                        await btn.update({
                            embeds: [buildSeasonEmbed(currentSeasonData)],
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
                            .setFooter({ text: 'Günlük, Haftalık veya Sezon butonuna basarak görevlerini görebilirsin.' })
                        : createEmbed('info', '🎁 Ödül Alma', 'Ödüller alınırken bir sorun çıktı. Biraz sonra tekrar dene.');

                    activeTab  = 'claim';
                    currentRow = buildButtons(
                        'claim', interaction.id,
                        hasNormalClaimable(currentData.daily, currentData.weekly),
                        hasSeasonClaimable(currentSeasonData.tasks)
                    );
                    try {
                        await btn.update({ embeds: [claimEmbed], components: [currentRow] });
                    } catch { /* sessizce geç */ }

                } else if (action === 'season_claim') {
                    try { await btn.deferUpdate(); } catch { return; }

                    const nextClaimable = currentSeasonData.tasks.find(t => t.completed && !t.claimed);

                    if (!nextClaimable) {
                        try {
                            await btn.followUp({
                                content: 'Şu an alınabilecek sezon görevi ödülün yok.',
                                flags: MessageFlags.Ephemeral
                            });
                        } catch { /* sessizce geç */ }
                        return;
                    }

                    const result = await claimSeasonTaskReward(userId, nextClaimable.code, nextClaimable.periodKey);

                    // Sezon verisini yenile (başarılı olsun olmasın)
                    try {
                        currentSeasonData = await getUserSeasonTasks(userId);
                    } catch { /* sessizce geç */ }

                    const resultMsg = result.success
                        ? `✅ **${nextClaimable.title}** görevi tamamlandı! ${formatSeasonTaskReward(nextClaimable)} kazandın.`
                        : getSeasonClaimMessage(result.reason);

                    try {
                        await btn.followUp({ content: resultMsg, flags: MessageFlags.Ephemeral });
                    } catch { /* sessizce geç */ }

                    currentRow = buildButtons(
                        activeTab, interaction.id,
                        hasNormalClaimable(currentData.daily, currentData.weekly),
                        hasSeasonClaimable(currentSeasonData.tasks)
                    );
                    try {
                        await btn.editReply({
                            embeds: [buildSeasonEmbed(currentSeasonData)],
                            components: [currentRow]
                        });
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
