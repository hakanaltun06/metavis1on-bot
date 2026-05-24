const { ensureUser } = require('../../database/users');
const { createEmbed } = require('../../utils/embeds');
const { COOLDOWNS } = require('../../utils/constants');
const { formatRemaining } = require('../../services/cooldownService');
const { INTEREST_INTERVAL_MS } = require('../../services/bankService');

module.exports = {
    data: { name: 'bekleme', description: 'Ödül ve işlem bekleme sürelerini gösterir.' },
    async execute(interaction) {
        const u = await ensureUser(interaction.user.id);

        const embed = createEmbed('info', '⏱️ Bekleme Süreleri')
            .addFields(
                { name: 'Çalış', value: formatRemaining(u.last_work, COOLDOWNS.WORK), inline: true },
                { name: 'Suç', value: formatRemaining(u.last_crime, COOLDOWNS.CRIME), inline: true },
                { name: 'Soy', value: formatRemaining(u.last_rob, COOLDOWNS.ROB), inline: true },
                { name: 'Dilen', value: formatRemaining(u.last_beg, COOLDOWNS.BEG), inline: true },
                { name: 'Günlük', value: formatRemaining(u.last_daily, COOLDOWNS.DAILY), inline: true },
                { name: 'Faiz', value: formatRemaining(u.last_interest, INTEREST_INTERVAL_MS), inline: true }
            );
        await interaction.reply({ embeds: [embed] });
    }
};
