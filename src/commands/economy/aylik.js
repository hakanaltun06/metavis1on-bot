const { pool } = require('../../database/pool');
const { ensureUser } = require('../../database/users');
const { addMoney } = require('../../database/money');
const { createEmbed } = require('../../utils/embeds');
const { fmtMoney } = require('../../utils/format');
const { COOLDOWNS } = require('../../utils/constants');
const { REWARDS } = require('../../services/rewardsService');

module.exports = {
    data: { name: 'aylik', description: 'Aylık dev ödülünü alırsın.' },
    async execute(interaction) {
        const userData = await ensureUser(interaction.user.id);
        const now = new Date();
        const lastDate = userData.last_monthly ? new Date(userData.last_monthly) : new Date(0);
        if (now - lastDate < COOLDOWNS.MONTHLY) {
            return interaction.reply({ embeds: [createEmbed('warn', '⏳ Bekleme Süresi', `Aylık ödül için **${Math.ceil((COOLDOWNS.MONTHLY - (now - lastDate))/86400000)} gün** beklemen gerek.`)], ephemeral: true });
        }
        const reward = REWARDS.MONTHLY;
        await addMoney(interaction.user.id, reward, 'wallet');
        await pool.query('UPDATE economy_users SET last_monthly = CURRENT_TIMESTAMP WHERE user_id = $1', [interaction.user.id]);
        await interaction.reply({ embeds: [createEmbed('success', '🏆 Aylık Ödül', `${fmtMoney(reward)} cüzdanına eklendi. Keyfini çıkar.`)] });
    }
};
