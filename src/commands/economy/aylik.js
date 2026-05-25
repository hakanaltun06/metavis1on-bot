const { MessageFlags } = require('discord.js');
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
            return interaction.reply({ embeds: [createEmbed('warn', '⏳ Bekleme Süresi', `Aylık ödül için **${Math.ceil((COOLDOWNS.MONTHLY - (now - lastDate))/86400000)} gün** beklemen gerek.`)], flags: MessageFlags.Ephemeral });
        }
        const reward = REWARDS.MONTHLY;
        await addMoney(interaction.user.id, reward, 'wallet');
        await pool.query('UPDATE economy_users SET last_monthly = CURRENT_TIMESTAMP WHERE user_id = $1', [interaction.user.id]);
        const newWallet = Number(userData.wallet) + reward;
        const embed = createEmbed('reward', '🏆 Aylık Ödül Alındı', 'Aylık MetaCoin ödülün cüzdanına eklendi.')
            .addFields(
                { name: 'Ödül', value: fmtMoney(reward), inline: true },
                { name: 'Yeni Cüzdan', value: fmtMoney(newWallet), inline: true },
                { name: 'Sonraki Aylık', value: '30 gün sonra', inline: true }
            )
            .setFooter({ text: 'Aylık ödül büyük kazanç sağlar; cüzdanını ve bankanı dengeli kullan.' });
        await interaction.reply({ embeds: [embed] });
    }
};
