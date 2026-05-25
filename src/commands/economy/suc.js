const { MessageFlags } = require('discord.js');
const { pool } = require('../../database/pool');
const { ensureUser } = require('../../database/users');
const { addMoney, removeMoney } = require('../../database/money');
const { createEmbed } = require('../../utils/embeds');
const { fmtMoney } = require('../../utils/format');
const { getMins } = require('../../utils/time');
const { COOLDOWNS } = require('../../utils/constants');
const { rollCrime } = require('../../services/riskService');
const { grantSeasonPoints } = require('../../services/seasonService');

module.exports = {
    data: { name: 'suc', description: 'Yasadışı işlere bulaşırsın. Kazanç büyük, risk yüksek.' },
    async execute(interaction) {
        const userData = await ensureUser(interaction.user.id);
        const now = new Date();
        const lastDate = userData.last_crime ? new Date(userData.last_crime) : new Date(0);

        if (now - lastDate < COOLDOWNS.CRIME) {
            return interaction.reply({ embeds: [createEmbed('warn', '🚔 Ortalık Kızgın', `Polis peşinde. **${getMins(COOLDOWNS.CRIME - (now - lastDate))} dk** ortalıktan kaybol.`)], flags: MessageFlags.Ephemeral });
        }

        await pool.query('UPDATE economy_users SET last_crime = CURRENT_TIMESTAMP WHERE user_id = $1', [interaction.user.id]);

        const outcome = rollCrime();
        if (outcome.win) {
            const newWallet = Number(userData.wallet) + outcome.reward;
            await addMoney(interaction.user.id, outcome.reward, 'wallet');
            let seasonGrant = null;
            try {
                seasonGrant = await grantSeasonPoints(interaction.user.id, 10);
            } catch (err) {
                console.error('Sezon puanı eklenemedi (suc-win):', err?.message);
            }
            const winEmbed = createEmbed('risk', '🕵️ İş Bitti', outcome.scenario)
                .addFields(
                    { name: 'Sonuç', value: '✅ Kazanç', inline: true },
                    { name: 'Kazanılan', value: fmtMoney(outcome.reward), inline: true },
                    { name: 'Yeni Cüzdan', value: fmtMoney(newWallet), inline: true }
                );
            if (seasonGrant && seasonGrant.granted > 0) {
                winEmbed.addFields({ name: '🏆 Sezon Puanı', value: `+${seasonGrant.granted} puan`, inline: true });
            }
            return interaction.reply({ embeds: [winEmbed] });
        }

        const realPenalty = Math.min(outcome.penalty, Number(userData.wallet));
        const newWallet = Number(userData.wallet) - realPenalty;
        await removeMoney(interaction.user.id, realPenalty, 'wallet');
        let seasonGrant = null;
        try {
            seasonGrant = await grantSeasonPoints(interaction.user.id, 10);
        } catch (err) {
            console.error('Sezon puanı eklenemedi (suc-lose):', err?.message);
        }
        const loseEmbed = createEmbed('error', '🚔 Yakalandın', 'Plan ters gitti.')
            .addFields(
                { name: 'Sonuç', value: '❌ Ceza', inline: true },
                { name: 'Kesilen', value: fmtMoney(realPenalty), inline: true },
                { name: 'Yeni Cüzdan', value: fmtMoney(newWallet), inline: true }
            )
            .setFooter({ text: 'Sıradaki fırsatı takip etmek için /bekleme kullan.' });
        if (seasonGrant && seasonGrant.granted > 0) {
            loseEmbed.addFields({ name: '🏆 Sezon Puanı', value: `+${seasonGrant.granted} puan`, inline: true });
        }
        return interaction.reply({ embeds: [loseEmbed] });
    }
};
