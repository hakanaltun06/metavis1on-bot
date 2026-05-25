const { MessageFlags } = require('discord.js');
const { pool } = require('../../database/pool');
const { ensureUser } = require('../../database/users');
const { addMoney } = require('../../database/money');
const { createEmbed } = require('../../utils/embeds');
const { fmtMoney } = require('../../utils/format');
const { getMins } = require('../../utils/time');
const { COOLDOWNS } = require('../../utils/constants');
const { rollWorkReward } = require('../../services/rewardsService');
const { grantSeasonPoints } = require('../../services/seasonService');

module.exports = {
    data: { name: 'calis', description: 'Çalışıp MetaCoin kazanırsın.' },
    async execute(interaction) {
        const userData = await ensureUser(interaction.user.id);
        const now = new Date();
        const lastDate = userData.last_work ? new Date(userData.last_work) : new Date(0);

        if (now - lastDate < COOLDOWNS.WORK) {
            const left = COOLDOWNS.WORK - (now - lastDate);
            return interaction.reply({ embeds: [createEmbed('warn', '⏳ Yoruldun', `Biraz nefes al. Yeni iş için **${getMins(left)} dakika** dinlen.`)], flags: MessageFlags.Ephemeral });
        }

        const { job, reward } = rollWorkReward();
        const newWallet = Number(userData.wallet) + reward;
        const newWorkCount = (userData.work_count || 0) + 1;

        await addMoney(interaction.user.id, reward, 'wallet');
        await pool.query('UPDATE economy_users SET last_work = CURRENT_TIMESTAMP, work_count = work_count + 1 WHERE user_id = $1', [interaction.user.id]);

        let seasonGrant = null;
        try {
            seasonGrant = await grantSeasonPoints(interaction.user.id, 8);
        } catch (err) {
            console.error('Sezon puanı eklenemedi (calis):', err?.message);
        }

        const embed = createEmbed('reward', '💼 Mesai Tamam', job)
            .addFields(
                { name: 'Kazanç', value: fmtMoney(reward), inline: true },
                { name: 'Yeni Cüzdan', value: fmtMoney(newWallet), inline: true },
                { name: 'Toplam Mesai', value: `**${newWorkCount}** kez`, inline: true }
            )
            .setFooter({ text: 'Daha büyük kazançlar için banka ve kasa sistemini de kullanabilirsin.' });
        if (seasonGrant && seasonGrant.granted > 0) {
            embed.addFields({ name: '🏆 Sezon Puanı', value: `+${seasonGrant.granted} puan`, inline: true });
        }
        await interaction.reply({ embeds: [embed] });
    }
};
