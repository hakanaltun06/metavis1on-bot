const { MessageFlags } = require('discord.js');
const { ensureUser } = require('../../database/users');
const { createEmbed } = require('../../utils/embeds');
const { fmtMoney } = require('../../utils/format');
const { BANK_LEVELS } = require('../../utils/constants');
const { calculateFillPct } = require('../../services/bankService');
const { getLoanSummary } = require('../../database/loans');

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

        const isSelf = target.id === interaction.user.id;
        const loanSummary = isSelf ? await getLoanSummary(target.id) : null;

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

        if (loanSummary && loanSummary.activeDebt > 0) {
            embed.addFields(
                { name: 'Açık Borç', value: fmtMoney(loanSummary.activeDebt), inline: true },
                { name: 'Aktif Kredi', value: `**${loanSummary.activeCount}** adet`, inline: true }
            );
            embed.setFooter({ text: 'Borç durumunu görmek için /kredi bilgi kullan.' });
        } else {
            embed.setFooter({ text: 'Paranı büyütmek için /banka, /faiz ve /market komutlarını kullanabilirsin.' });
        }

        await interaction.reply({ embeds: [embed] });
    }
};
