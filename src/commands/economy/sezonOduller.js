const { MessageFlags } = require('discord.js');
const { createEmbed } = require('../../utils/embeds');
const { getCurrentSeason } = require('../../services/seasonService');

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

const REWARD_TIERS = [
    {
        name: '🥇 1. Sıra',
        value: '3× Efsanevi Kasa\nÖzel sezon rozeti\nÖzel sezon koleksiyon eşyası',
        inline: false
    },
    {
        name: '🥈 2. Sıra',
        value: '2× Efsanevi Kasa\nÖzel sezon rozeti\nÖzel sezon koleksiyon eşyası',
        inline: false
    },
    {
        name: '🥉 3. Sıra',
        value: '1× Efsanevi Kasa\nÖzel sezon koleksiyon eşyası',
        inline: false
    },
    {
        name: '🏅 4.–10. Sıra',
        value: '2× Epik Kasa\nSezon katılım rozeti',
        inline: false
    },
    {
        name: '⭐ Seviye 3 ve Üstü',
        value: '1× Nadir Kasa',
        inline: true
    },
    {
        name: '📦 Seviye 2',
        value: '1× Basit Kasa',
        inline: true
    }
];

module.exports = {
    data: {
        name: 'sezon-oduller',
        description: 'Sezon ödüllerini ve ödül kademelerini gösterir.'
    },

    async execute(interaction) {
        try {
            const season = await getCurrentSeason();

            const desc = season
                ? `**${season.name}** sürüyor — Bitiş: ${formatSeasonDate(season.ends_at)} · Kalan: **${getRemainingText(season.ends_at)}**`
                : 'Şu anda aktif sezon bulunmuyor. Ödüller bir sonraki sezonda geçerli olacak.';

            const embed = createEmbed('premium', '🎖️ Sezon Ödülleri', desc)
                .addFields(...REWARD_TIERS)
                .setFooter({ text: 'Ödüller sezon sonunda bot sahibi tarafından dağıtılır.' });

            return interaction.reply({ embeds: [embed] });
        } catch (err) {
            console.error('Sezon ödüller hatası:', err && err.message ? err.message : err);
            return interaction.reply({
                embeds: [createEmbed('error', '⚠️ Bir Aksilik Oldu', 'Şu anda sezon bilgisi alınamadı. Biraz sonra tekrar dene.')],
                flags: MessageFlags.Ephemeral
            });
        }
    }
};
