const { MessageFlags } = require('discord.js');
const { createEmbed } = require('../../utils/embeds');
const { formatNumber } = require('../../utils/format');
const { getSeasonHistory } = require('../../services/seasonService');

function formatSeasonDate(date) {
    return new Date(date).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' });
}

module.exports = {
    data: {
        name: 'sezon-gecmis',
        description: 'Geçmiş tamamlanmış sezonları ve kazananları gösterir.'
    },

    async execute(interaction) {
        try {
            const history = await getSeasonHistory(10);

            if (!history || history.length === 0) {
                const embed = createEmbed('info', '🏛️ Sezon Geçmişi',
                    'Henüz tamamlanmış bir sezon bulunmuyor.\n\nİlk sezon tamamlandığında geçmiş burada görünecek.')
                    .setFooter({ text: 'Sezonlar bot sahibi tarafından başlatılır.' });
                return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
            }

            const lines = history.map((entry, i) => {
                const { season, userCount, topUser, rewardsDistributed } = entry;
                const leader = topUser
                    ? `<@${topUser.user_id}> · **${formatNumber(Number(topUser.points))}** puan`
                    : 'Kayıt yok';
                const rewardText = rewardsDistributed ? '✅ Dağıtıldı' : '⏳ Bekliyor';
                return [
                    `**${i + 1}. ${season.name}**`,
                    `📅 ${formatSeasonDate(season.started_at)} – ${formatSeasonDate(season.ends_at)}`,
                    `👥 ${userCount} katılımcı · 🥇 ${leader}`,
                    `🎖️ Ödül: ${rewardText}`
                ].join('\n');
            });

            const embed = createEmbed('premium', '🏛️ Sezon Geçmişi', lines.join('\n\n'))
                .setFooter({ text: `Son ${history.length} tamamlanmış sezon gösteriliyor.` });

            return interaction.reply({ embeds: [embed] });

        } catch (err) {
            console.error('Sezon geçmişi komutu hatası:', err && err.message ? err.message : err);
            return interaction.reply({
                embeds: [createEmbed('error', '⚠️ Bir Aksilik Oldu', 'Şu anda sezon geçmişi alınamadı. Biraz sonra tekrar dene.')],
                flags: MessageFlags.Ephemeral
            });
        }
    }
};
