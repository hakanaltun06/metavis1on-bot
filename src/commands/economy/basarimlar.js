const { MessageFlags } = require('discord.js');
const { createEmbed } = require('../../utils/embeds');
const { formatFull } = require('../../utils/format');
const { getUserAchievements, claimAchievementReward } = require('../../services/progressionService');

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
        else                 status = 'Devam ediyor';

        return (
            `${icon} **${a.title}**\n` +
            `${a.description}\n` +
            `\`${bar}\` ${a.progress}/${a.targetCount} · ${status} · Ödül: ${rewardStr}`
        );
    }).join('\n\n');
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
            const embeds = [];

            if (shouldClaim) {
                const achievementsBefore = await getUserAchievements(userId);
                const claimable = achievementsBefore.filter(a => a.unlocked && !a.claimed);

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
                            console.error(`Başarım ödülü alınamadı [${a.code}]:`, err && err.message ? err.message : err);
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

            const achievements = await getUserAchievements(userId);

            embeds.push(
                createEmbed('info', '🏆 Başarımlar',
                    'Ekonomi yolculuğunda kazandığın rozetleri buradan takip edebilirsin.\n\n' +
                    buildAchievementText(achievements))
                    .setFooter({ text: 'Ödülleri toplamak için /basarimlar komutunu kullan, odulleri_al seçeneğini aç.' })
            );

            return interaction.reply({ embeds });

        } catch (err) {
            console.error('Başarımlar komutu hatası:', err && err.message ? err.message : err);
            return interaction.reply({
                embeds: [createEmbed('error', '⚠️ Bir Aksilik Oldu',
                    'Başarımlar şu an yüklenemedi. Biraz sonra tekrar dene.')],
                flags: MessageFlags.Ephemeral
            });
        }
    }
};
