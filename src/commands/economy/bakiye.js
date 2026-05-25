const { MessageFlags } = require('discord.js');
const { ensureUser } = require('../../database/users');
const { createEmbed } = require('../../utils/embeds');
const { fmtMoney } = require('../../utils/format');
const { BANK_LEVELS } = require('../../utils/constants');
const { calculateFillPct } = require('../../services/bankService');

module.exports = {
    data: {
        name: 'bakiye',
        description: 'Cüzdanını, bankanı ve toplam servetini gösterir.',
        options: [{ name: 'kullanici', description: 'Bakiyesine bakmak istediğin kullanıcı.', type: 6, required: false }]
    },
    async execute(interaction) {
        const target = interaction.options.getUser('kullanici') || interaction.user;
        if (target.bot) return interaction.reply({ embeds: [createEmbed('error', '❌ Olmaz', 'Botların bakiyesi olmaz.')], flags: MessageFlags.Ephemeral });

        const userData = await ensureUser(target.id);
        const wallet = Number(userData.wallet);
        const bank = Number(userData.bank);
        const total = wallet + bank;
        const limit = Number(userData.bank_limit) || BANK_LEVELS[0].limit;
        const level = userData.bank_level || 1;
        const fillPct = calculateFillPct(bank, limit);

        const embed = createEmbed('info', `💳 ${target.username} — Bakiye`)
            .addFields(
                { name: 'Cüzdan', value: fmtMoney(wallet), inline: true },
                { name: 'Banka', value: fmtMoney(bank), inline: true },
                { name: 'Toplam Servet', value: fmtMoney(total), inline: false },
                { name: 'Banka Seviyesi', value: `**${level}**`, inline: true },
                { name: 'Kapasite', value: fmtMoney(limit), inline: true },
                { name: 'Doluluk', value: `**%${fillPct}**`, inline: true }
            )
            .setThumbnail(target.displayAvatarURL());
        await interaction.reply({ embeds: [embed] });
    }
};
