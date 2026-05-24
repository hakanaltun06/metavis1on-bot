const { ensureUser } = require('../../database/users');
const { createEmbed } = require('../../utils/embeds');
const { fmtMoney } = require('../../utils/format');
const { BANK_LEVELS } = require('../../utils/constants');

module.exports = {
    data: {
        name: 'bakiye',
        description: 'Cüzdanını ve bankadaki paranı gösterir.',
        options: [{ name: 'kullanici', description: 'Başka birinin bakiyesine bakmak için seç.', type: 6, required: false }]
    },
    async execute(interaction) {
        const target = interaction.options.getUser('kullanici') || interaction.user;
        if (target.bot) return interaction.reply({ embeds: [createEmbed('error', '❌ Olmaz', 'Botların bakiyesi olmaz.')], ephemeral: true });

        const userData = await ensureUser(target.id);
        const total = Number(userData.wallet) + Number(userData.bank);
        const limit = Number(userData.bank_limit) || BANK_LEVELS[0].limit;
        const level = userData.bank_level || 1;

        const embed = createEmbed('info', `💳 ${target.username} — Bakiye`)
            .addFields(
                { name: 'Cüzdan', value: fmtMoney(userData.wallet), inline: true },
                { name: 'Banka', value: `🏦 ${fmtMoney(userData.bank)}`, inline: true },
                { name: 'Toplam Servet', value: fmtMoney(total), inline: false },
                { name: 'Banka Seviyesi', value: `**${level}**`, inline: true },
                { name: 'Banka Kapasitesi', value: fmtMoney(limit), inline: true }
            )
            .setThumbnail(target.displayAvatarURL());
        await interaction.reply({ embeds: [embed] });
    }
};
