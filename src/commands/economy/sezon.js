const { MessageFlags } = require('discord.js');
const { createEmbed } = require('../../utils/embeds');
const { formatNumber } = require('../../utils/format');
const {
    getCurrentSeason,
    getUserSeasonData,
    getUserSeasonRank,
    getNextLevelInfo
} = require('../../services/seasonService');

function formatSeasonDate(date) {
    return new Date(date).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' });
}

function getRemainingText(endsAt) {
    const days = Math.ceil((new Date(endsAt) - Date.now()) / 86400000);
    if (days < 0) return 'Süresi dolmuş';
    if (days === 0) return 'Bugün bitiyor';
    if (days === 1) return '1 gün';
    return `${days} gün`;
}

module.exports = {
    data: {
        name: 'sezon',
        description: 'Aktif sezon durumunu ve sezon ilerlemeni gösterir.'
    },

    async execute(interaction) {
        try {
            const season = await getCurrentSeason();

            if (!season) {
                const embed = createEmbed('info', '🏆 Sezon Sistemi',
                    'Şu anda aktif bir sezon bulunmuyor.\n\nYeni sezon başladığında burada sezon puanın, seviyen ve sıralaman görünecek.\n\nGeçmiş sezonları görmek için **/sezon-gecmis** komutunu kullanabilirsin.')
                    .setFooter({ text: 'Sezonlar bot sahibi tarafından başlatılır.' });
                return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
            }

            const [{ user }, rank] = await Promise.all([
                getUserSeasonData(interaction.user.id),
                getUserSeasonRank(interaction.user.id)
            ]);

            const points = user ? Number(user.points) : 0;
            const level = user ? Number(user.season_level) : 1;
            const levelInfo = getNextLevelInfo(points);

            const rankText = rank != null ? `**#${rank}**` : 'Henüz sıralamada yok';

            const nextLevelText = levelInfo.nextLevel == null
                ? 'Maksimum seviye 🎖️'
                : `Seviye **${levelInfo.nextLevel}** — Gereken: **${formatNumber(levelInfo.remaining)}** puan`;

            const embed = createEmbed('premium', `🏆 ${season.name}`, '')
                .addFields(
                    { name: '🎯 Sezon Puanın', value: `**${formatNumber(points)}** puan`, inline: true },
                    { name: '⭐ Seviyen',       value: `**${level}**`,                    inline: true },
                    { name: '🏅 Sıralaman',     value: rankText,                          inline: true },
                    { name: '📈 Sıradaki Seviye', value: nextLevelText,                   inline: false },
                    { name: '📅 Sezon Bitişi',
                      value: `${formatSeasonDate(season.ends_at)}\nKalan: **${getRemainingText(season.ends_at)}**`,
                      inline: false },
                    { name: '📌 Puan Nasıl Kazanılır?',
                      value: 'Günlük ödül, çalışma, suç, kasa açma, satış, kredi ödeme ve bazı oyun komutları sezon puanı kazandırır.',
                      inline: false }
                )
                .setFooter({ text: 'Sezon puanı, aktif ekonomi komutlarını kullandıkça kazanılır.' });

            return interaction.reply({ embeds: [embed] });

        } catch (err) {
            console.error('Sezon komutu hatası:', err && err.message ? err.message : err);
            return interaction.reply({
                embeds: [createEmbed('error', '⚠️ Bir Aksilik Oldu', 'Şu anda sezon bilgisi alınamadı. Biraz sonra tekrar dene.')],
                flags: MessageFlags.Ephemeral
            });
        }
    }
};
