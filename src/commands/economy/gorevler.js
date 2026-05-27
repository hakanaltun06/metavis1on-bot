const { MessageFlags } = require('discord.js');
const { createEmbed } = require('../../utils/embeds');
const { formatFull } = require('../../utils/format');
const { getDailyTasks, getWeeklyTasks, claimTaskReward } = require('../../services/progressionService');

// Görev kodu → ikon
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

// Kasa kodu → Türkçe görünen ad
const CRATE_NAMES = {
    basit_kasa:    'Basit Kasa',
    nadir_kasa:    'Nadir Kasa',
    nexus_kasa:    'Nexus Kasa',
    epik_kasa:     'Epik Kasa',
    neon_kasa:     'Neon Kasa',
    efsanevi_kasa: 'Efsanevi Kasa',
    prestij_kasa:  'Prestij Kasa'
};

// Örnek: formatProgressBar(2, 5) → '[██░░░]'
function formatProgressBar(progress, target) {
    const t = Math.max(1, Number(target) || 1);
    const p = Math.max(0, Math.min(Number(progress) || 0, t));
    const filled = Math.round((p / t) * 5);
    return '[' + '█'.repeat(filled) + '░'.repeat(5 - filled) + ']';
}

// Ödülü kullanıcıya okunabilir formatta yazar.
function formatReward(reward) {
    if (!reward) return 'Özel ödül';
    if (reward.type === 'coin')         return `${formatFull(reward.amount)} MetaCoin 🪙`;
    if (reward.type === 'crate')        return `${reward.quantity || 1}× ${CRATE_NAMES[reward.itemId] || reward.itemId}`;
    if (reward.type === 'season_point') return `${reward.amount} sezon puanı`;
    return 'Özel ödül';
}

// Görev listesini embed description metnine dönüştürür.
function buildTaskText(tasks) {
    if (!tasks || tasks.length === 0) return 'Görev bulunamadı.';

    return tasks.map(task => {
        const icon      = TASK_ICONS[task.code] || '📌';
        const bar       = formatProgressBar(task.progress, task.targetCount);
        const rewardStr = formatReward(task.reward);

        let status;
        if (task.claimed)    status = '✅ Ödül alındı';
        else if (task.completed) status = '🎁 Ödül hazır';
        else                 status = 'Devam ediyor';

        return (
            `${icon} **${task.title}**\n` +
            `${task.description}\n` +
            `\`${bar}\` ${task.progress}/${task.targetCount} · ${status} · Ödül: ${rewardStr}`
        );
    }).join('\n\n');
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
            const embeds = [];

            // ---- Ödül alma akışı (odulleri_al:True ise) ----
            if (shouldClaim) {
                const [dailyBefore, weeklyBefore] = await Promise.all([
                    getDailyTasks(userId),
                    getWeeklyTasks(userId)
                ]);

                const claimable = [...dailyBefore, ...weeklyBefore].filter(t => t.completed && !t.claimed);

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
                            console.error(`Görev ödülü alınamadı [${task.code}]:`, err && err.message ? err.message : err);
                        }
                    }

                    if (claimed.length > 0) {
                        embeds.push(createEmbed('reward', '🎁 Alınan Ödüller', claimed.join('\n')));
                    } else {
                        embeds.push(createEmbed('info', '🎁 Ödül Alma',
                            'Ödüller alınırken bir sorun çıktı. Biraz sonra tekrar dene.'));
                    }
                }
            }

            // ---- Güncel görev listesi (claim sonrası taze veri) ----
            const [dailyTasks, weeklyTasks] = await Promise.all([
                getDailyTasks(userId),
                getWeeklyTasks(userId)
            ]);

            embeds.push(
                createEmbed('info', '🌞 Günlük Görevler',
                    buildTaskText(dailyTasks))
            );

            embeds.push(
                createEmbed('info', '📅 Haftalık Görevler',
                    buildTaskText(weeklyTasks))
                    .setFooter({ text: 'Ödülleri toplamak için /gorevler komutunu kullan, odulleri_al seçeneğini aç.' })
            );

            return interaction.reply({ embeds });

        } catch (err) {
            console.error('Görevler komutu hatası:', err && err.message ? err.message : err);
            return interaction.reply({
                embeds: [createEmbed('error', '⚠️ Bir Aksilik Oldu',
                    'Görevler şu an yüklenemedi. Biraz sonra tekrar dene.')],
                flags: MessageFlags.Ephemeral
            });
        }
    }
};
