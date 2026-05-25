const { MessageFlags } = require('discord.js');
const { createEmbed } = require('../../utils/embeds');
const { formatNumber } = require('../../utils/format');
const {
    getCurrentSeason,
    getSeasonLeaderboard,
    getUserSeasonRank
} = require('../../services/seasonService');

const MEDALS = ['🥇', '🥈', '🥉'];

function formatSeasonDate(date) {
    return new Date(date).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' });
}

function getRemainingText(endsAt) {
    const days = Math.ceil((new Date(endsAt) - Date.now()) / 86400000);
    if (days < 0) return 'Süresi dolmuş';
    if (days === 0) return 'Bugün bitiyor';
    if (days === 1) return '1 gün kaldı';
    return `${days} gün kaldı`;
}

function buildRankLine(i, row) {
    const prefix = i < 3 ? MEDALS[i] : `#${i + 1}`;
    return `${prefix} <@${row.user_id}> — **${formatNumber(Number(row.points))}** puan · Seviye **${row.season_level}**`;
}

module.exports = {
    data: {
        name: 'sezon-siralama',
        description: 'Aktif sezonun liderlik tablosunu gösterir.'
    },

    async execute(interaction) {
        try {
            const season = await getCurrentSeason();

            if (!season) {
                const embed = createEmbed('info', '🏆 Sezon Sıralaması',
                    'Şu anda aktif bir sezon bulunmuyor.\n\nYeni sezon başladığında en yüksek sezon puanına sahip kullanıcılar burada görünecek.')
                    .setFooter({ text: 'Sezonlar bot sahibi tarafından başlatılır.' });
                return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
            }

            const [leaderboard, userRank] = await Promise.all([
                getSeasonLeaderboard(10),
                getUserSeasonRank(interaction.user.id)
            ]);

            if (!leaderboard || leaderboard.length === 0) {
                const embed = createEmbed('info', `🏆 Sezon Sıralaması — ${season.name}`,
                    'Bu sezonda henüz puan kazanan kullanıcı yok.\n\nİlk sezon puanları kazanıldığında sıralama burada görünecek.')
                    .setFooter({ text: 'Sıralama toplam sezon puanına göre hesaplanır.' });
                return interaction.reply({ embeds: [embed] });
            }

            const lines = leaderboard.map((row, i) => buildRankLine(i, row));

            const rankValue = userRank != null
                ? `**#${userRank}**`
                : 'Henüz sıralamada değilsin.';

            const embed = createEmbed('premium', `🏆 Sezon Sıralaması — ${season.name}`, lines.join('\n'))
                .addFields(
                    { name: '📌 Senin Sıran', value: rankValue, inline: true },
                    { name: '📅 Sezon Bitişi',
                      value: `${formatSeasonDate(season.ends_at)} · Kalan: **${getRemainingText(season.ends_at)}**`,
                      inline: true }
                )
                .setFooter({ text: 'Sıralama toplam sezon puanına göre hesaplanır.' });

            return interaction.reply({ embeds: [embed] });

        } catch (err) {
            console.error('Sezon sıralama hatası:', err && err.message ? err.message : err);
            return interaction.reply({
                embeds: [createEmbed('error', '⚠️ Bir Aksilik Oldu', 'Şu anda sezon sıralaması alınamadı. Biraz sonra tekrar dene.')],
                flags: MessageFlags.Ephemeral
            });
        }
    }
};
