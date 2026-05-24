const { MessageFlags } = require('discord.js');
const { pool } = require('../../database/pool');
const { ensureUser } = require('../../database/users');
const { addMoney } = require('../../database/money');
const { createEmbed } = require('../../utils/embeds');
const { fmtMoney } = require('../../utils/format');
const { getMins } = require('../../utils/time');
const { COOLDOWNS } = require('../../utils/constants');
const { rollBegResult } = require('../../services/rewardsService');

module.exports = {
    data: { name: 'dilen', description: 'Sokakta dilenirsin. Bazen işe yarar.' },
    async execute(interaction) {
        const userData = await ensureUser(interaction.user.id);
        const now = new Date();
        const lastDate = userData.last_beg ? new Date(userData.last_beg) : new Date(0);

        if (now - lastDate < COOLDOWNS.BEG) {
            return interaction.reply({ embeds: [createEmbed('warn', '⏳ Bekleme Süresi', `İnsanlar şu an seninle uğraşmıyor. **${getMins(COOLDOWNS.BEG - (now - lastDate))} dk** sonra tekrar dene.`)], flags: MessageFlags.Ephemeral });
        }

        await pool.query('UPDATE economy_users SET last_beg = CURRENT_TIMESTAMP WHERE user_id = $1', [interaction.user.id]);

        const outcome = rollBegResult();
        if (outcome.rejected) {
            return interaction.reply({ embeds: [createEmbed('error', '😢 Eli Boş Döndün', 'Kimse sana para vermedi.')] });
        }

        await addMoney(interaction.user.id, outcome.reward, 'wallet');
        await interaction.reply({ embeds: [createEmbed('success', '🤲 Bağış', `Yoldan geçen biri acıdı ve sana ${fmtMoney(outcome.reward)} verdi.`)] });
    }
};
