const { MessageFlags } = require('discord.js');
const { pool } = require('../../database/pool');
const { ensureUser } = require('../../database/users');
const { addMoney } = require('../../database/money');
const { createEmbed } = require('../../utils/embeds');
const { fmtMoney } = require('../../utils/format');
const { COOLDOWNS } = require('../../utils/constants');
const { computeDailyReward, REWARDS } = require('../../services/rewardsService');

module.exports = {
    data: { name: 'gunluk', description: 'Günlük ödülünü alırsın ve serini korursun.' },
    async execute(interaction) {
        const userData = await ensureUser(interaction.user.id);
        const now = new Date();
        const lastDaily = userData.last_daily ? new Date(userData.last_daily) : new Date(0);
        const diffMs = now - lastDaily;
        const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

        if (diffMs < COOLDOWNS.DAILY) {
            const left = COOLDOWNS.DAILY - diffMs;
            const hours = Math.floor(left / 3600000);
            const mins = Math.floor((left % 3600000) / 60000);
            return interaction.reply({ embeds: [createEmbed('warn', '⏳ Bekleme Süresi', `Günlük ödülünü zaten aldın. **${hours} saat ${mins} dakika** sonra tekrar uğra.`)], flags: MessageFlags.Ephemeral });
        }

        const { newStreak, streakBonus, totalReward } = computeDailyReward(userData.daily_streak, diffDays);

        await addMoney(interaction.user.id, totalReward, 'wallet');
        await pool.query('UPDATE economy_users SET daily_streak = $1, last_daily = CURRENT_TIMESTAMP WHERE user_id = $2', [newStreak, interaction.user.id]);

        const newWallet = Number(userData.wallet) + totalReward;
        const streakReset = diffDays > 1 && userData.daily_streak > 0;
        const footerText = streakReset
            ? 'Bir günden fazla beklediğin için serin sıfırlandı.'
            : 'Serini korudukça günlük kazancın güçlenir.';

        const fields = [
            { name: 'Günlük Ödül', value: fmtMoney(REWARDS.DAILY_BASE), inline: true },
            { name: 'Seri', value: `🔥 **${newStreak} gün**`, inline: true }
        ];
        if (streakBonus > 0) {
            fields.push({ name: 'Seri Bonusu', value: fmtMoney(streakBonus), inline: true });
        }
        fields.push(
            { name: 'Yeni Cüzdan', value: fmtMoney(newWallet), inline: true },
            { name: 'Sonraki Günlük', value: '24 saat sonra', inline: true }
        );

        const embed = createEmbed('reward', '🎁 Günlük Ödül Alındı', 'Günlük MetaCoin ödülün cüzdanına eklendi.')
            .addFields(...fields)
            .setFooter({ text: footerText });
        await interaction.reply({ embeds: [embed] });
    }
};
