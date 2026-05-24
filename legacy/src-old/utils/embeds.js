const { EmbedBuilder } = require('discord.js');
const { COLORS } = require('./constants');

module.exports = {
    successEmbed: (title, description) => {
        return new EmbedBuilder()
            .setColor(COLORS.SUCCESS)
            .setTitle(`✅ ${title}`)
            .setDescription(description);
    },
    errorEmbed: (title, description) => {
        return new EmbedBuilder()
            .setColor(COLORS.ERROR)
            .setTitle(`⛔ ${title}`)
            .setDescription(description);
    },
    infoEmbed: (title, description) => {
        return new EmbedBuilder()
            .setColor(COLORS.INFO)
            .setTitle(`ℹ️ ${title}`)
            .setDescription(description);
    },
    profileEmbed: (user, userData, discordUser) => {
        return new EmbedBuilder()
            .setColor(COLORS.PREMIUM)
            .setAuthor({ name: `${discordUser.username} - Finansal Profil`, iconURL: discordUser.displayAvatarURL() })
            .addFields(
                { name: '💰 Cüzdan', value: `**${userData.wallet.toLocaleString()}** MC`, inline: true },
                { name: '🏦 Banka', value: `**${userData.bank.toLocaleString()} / ${userData.bankMax.toLocaleString()}** MC`, inline: true },
                { name: '📈 Seviye & XP', value: `Seviye **${userData.level}** (${userData.xp} XP)`, inline: true },
                { name: '📊 İstatistikler', value: `Kazanılan: **${userData.stats.totalEarned.toLocaleString()}** MC\nKaybedilen: **${userData.stats.totalLost.toLocaleString()}** MC`, inline: false }
            )
            .setFooter({ text: 'MetaCoin Güvencesiyle' })
            .setTimestamp();
    }
};