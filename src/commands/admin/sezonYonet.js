const { MessageFlags } = require('discord.js');
const { requireOwner } = require('../../utils/permissions');
const { createEmbed } = require('../../utils/embeds');
const { formatNumber } = require('../../utils/format');
const {
    getCurrentSeason,
    startSeason,
    completeCurrentSeason,
    getSeasonUserCount,
    getSeasonTopUser
} = require('../../services/seasonService');

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

module.exports = {
    data: {
        name: 'sezon-yonet',
        description: 'Sezonu yönetir. Sadece bot sahibine özeldir.',
        options: [
            {
                name: 'durum',
                description: 'Aktif sezon durumunu gösterir.',
                type: 1
            },
            {
                name: 'baslat',
                description: 'Yeni sezon başlatır.',
                type: 1,
                options: [
                    {
                        name: 'ad',
                        description: 'Sezon adı (boş bırakılırsa otomatik belirlenir).',
                        type: 3,
                        required: false
                    },
                    {
                        name: 'gun',
                        description: 'Sezon süresi gün olarak (1–90, varsayılan 30).',
                        type: 4,
                        required: false,
                        min_value: 1,
                        max_value: 90
                    }
                ]
            },
            {
                name: 'bitir',
                description: 'Aktif sezonu tamamlar. Ödül dağıtımı yapılmaz.',
                type: 1
            }
        ]
    },

    async execute(interaction) {
        if (!requireOwner(interaction)) return;

        const sub = interaction.options.getSubcommand();

        try {
            if (sub === 'durum')  return await handleDurum(interaction);
            if (sub === 'baslat') return await handleBaslat(interaction);
            if (sub === 'bitir')  return await handleBitir(interaction);
        } catch (err) {
            console.error('Sezon yonet hatası:', err && err.message ? err.message : err);
            return interaction.reply({
                embeds: [createEmbed('error', '⚠️ Bir Aksilik Oldu', 'İşlem sırasında bir sorun çıktı. Biraz sonra tekrar dener misin?')],
                flags: MessageFlags.Ephemeral
            });
        }
    }
};

async function handleDurum(interaction) {
    const season = await getCurrentSeason();

    if (!season) {
        const embed = createEmbed('info', '🏆 Sezon Durumu', 'Şu anda aktif sezon bulunmuyor.')
            .setFooter({ text: '/sezon-yonet baslat ile yeni sezon başlatabilirsin.' });
        return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }

    const [userCount, topUser] = await Promise.all([
        getSeasonUserCount(season.id),
        getSeasonTopUser(season.id)
    ]);

    const leaderText = topUser
        ? `<@${topUser.user_id}> — **${formatNumber(Number(topUser.points))}** puan · Seviye **${topUser.season_level}**`
        : 'Henüz puan kazanan kullanıcı yok.';

    const embed = createEmbed('premium', `🏆 ${season.name} — Durum`, '')
        .addFields(
            { name: '📅 Başlangıç', value: formatSeasonDate(season.started_at), inline: true },
            { name: '📅 Bitiş',     value: formatSeasonDate(season.ends_at),   inline: true },
            { name: '⏳ Kalan',     value: getRemainingText(season.ends_at),    inline: true },
            { name: '👥 Katılımcı', value: `**${userCount}** kullanıcı`,        inline: true },
            { name: '🥇 Lider',    value: leaderText,                           inline: false }
        )
        .setFooter({ text: `Sezon ID: ${season.id}` });

    return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
}

async function handleBaslat(interaction) {
    const ad  = interaction.options.getString('ad') || null;
    const gun = interaction.options.getInteger('gun') || 30;

    const result = await startSeason(ad, gun);

    if (!result.ok && result.reason === 'active_season_exists') {
        const s = result.season;
        const embed = createEmbed('warn', '⚠️ Zaten Aktif Sezon Var', `**${s.name}** devam ediyor.`)
            .addFields(
                { name: 'Bitiş', value: formatSeasonDate(s.ends_at), inline: true },
                { name: 'Kalan', value: getRemainingText(s.ends_at),  inline: true }
            )
            .setFooter({ text: 'Önce mevcut sezonu /sezon-yonet bitir ile tamamla.' });
        return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }

    if (!result.ok) {
        return interaction.reply({
            embeds: [createEmbed('error', '⚠️ Sezon Başlatılamadı', 'Bir sorun oluştu. Biraz sonra tekrar dener misin?')],
            flags: MessageFlags.Ephemeral
        });
    }

    const s = result.season;
    const embed = createEmbed('success', '🏆 Sezon Başladı', `**${s.name}** başarıyla başlatıldı.`)
        .addFields(
            { name: '📅 Başlangıç', value: formatSeasonDate(s.started_at), inline: true },
            { name: '📅 Bitiş',     value: formatSeasonDate(s.ends_at),    inline: true },
            { name: '⏳ Kalan',     value: getRemainingText(s.ends_at),     inline: true }
        )
        .setFooter({ text: `Sezon ID: ${s.id}` });
    return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
}

async function handleBitir(interaction) {
    const result = await completeCurrentSeason();

    if (!result.ok && result.reason === 'no_active_season') {
        return interaction.reply({
            embeds: [createEmbed('info', '🏆 Sezon', 'Şu anda aktif sezon bulunmuyor.')],
            flags: MessageFlags.Ephemeral
        });
    }

    if (!result.ok) {
        return interaction.reply({
            embeds: [createEmbed('error', '⚠️ Bir Aksilik Oldu', 'Sezon tamamlanamadı. Biraz sonra tekrar dener misin?')],
            flags: MessageFlags.Ephemeral
        });
    }

    const s = result.season;
    const embed = createEmbed('info', '🏆 Sezon Tamamlandı', `**${s.name}** tamamlandı. Sezon sonuçları ve kullanıcı puanları korunuyor.`)
        .addFields(
            { name: 'Sezon',  value: s.name,        inline: true },
            { name: 'Durum',  value: 'Tamamlandı',  inline: true }
        )
        .setFooter({ text: 'Sezon tamamlandı. Ödül dağıtımı bu aşamada yapılmadı.' });
    return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
}
