const { MessageFlags } = require('discord.js');
const { pool } = require('../../database/pool');
const { ensureUser } = require('../../database/users');
const { addMoney, removeMoney } = require('../../database/money');
const { createEmbed } = require('../../utils/embeds');
const { fmtMoney } = require('../../utils/format');
const { getMins } = require('../../utils/time');
const { COOLDOWNS } = require('../../utils/constants');
const { rollCrime } = require('../../services/riskService');

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
            await addMoney(interaction.user.id, outcome.reward, 'wallet');
            return interaction.reply({ embeds: [createEmbed('risk', '🕵️ İş Bitti', `${outcome.scenario} ve kimseye yakalanmadan kaçtın.\nKazandığın: ${fmtMoney(outcome.reward)}`)] });
        }

        const realPenalty = Math.min(outcome.penalty, Number(userData.wallet));
        await removeMoney(interaction.user.id, realPenalty, 'wallet');
        return interaction.reply({ embeds: [createEmbed('error', '🚔 Yakalandın', `Plan ters gitti. Ceza olarak ${fmtMoney(realPenalty)} ödedin.`)] });
    }
};
