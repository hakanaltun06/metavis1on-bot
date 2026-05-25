const { MessageFlags } = require('discord.js');
const { pool } = require('../../database/pool');
const { ensureUser } = require('../../database/users');
const { addMoney } = require('../../database/money');
const { createEmbed } = require('../../utils/embeds');
const { fmtMoney } = require('../../utils/format');
const { COOLDOWNS } = require('../../utils/constants');
const { REWARDS } = require('../../services/rewardsService');

module.exports = {
    data: { name: 'haftalik', description: 'Haftalık büyük ödülünü alırsın.' },
    async execute(interaction) {
        const userData = await ensureUser(interaction.user.id);
        const now = new Date();
        const lastDate = userData.last_weekly ? new Date(userData.last_weekly) : new Date(0);
        if (now - lastDate < COOLDOWNS.WEEKLY) {
            return interaction.reply({ embeds: [createEmbed('warn', '⏳ Bekleme Süresi', `Haftalık ödül için **${Math.ceil((COOLDOWNS.WEEKLY - (now - lastDate))/86400000)} gün** beklemen gerek.`)], flags: MessageFlags.Ephemeral });
        }
        const reward = REWARDS.WEEKLY;
        await addMoney(interaction.user.id, reward, 'wallet');
        await pool.query('UPDATE economy_users SET last_weekly = CURRENT_TIMESTAMP WHERE user_id = $1', [interaction.user.id]);
        const newWallet = Number(userData.wallet) + reward;
        const embed = createEmbed('reward', '🗓️ Haftalık Ödül Alındı', 'Haftalık MetaCoin ödülün cüzdanına eklendi.')
            .addFields(
                { name: 'Ödül', value: fmtMoney(reward), inline: true },
                { name: 'Yeni Cüzdan', value: fmtMoney(newWallet), inline: true },
                { name: 'Sonraki Haftalık', value: '7 gün sonra', inline: true }
            )
            .setFooter({ text: 'Haftalık ödülünü düzenli almayı unutma.' });
        await interaction.reply({ embeds: [embed] });
    }
};
