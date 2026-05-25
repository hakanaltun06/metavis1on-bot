const { MessageFlags } = require('discord.js');
const { pool } = require('../../database/pool');
const { ensureUser } = require('../../database/users');
const { addMoney, removeMoney } = require('../../database/money');
const { checkItem } = require('../../database/inventory');
const { createEmbed } = require('../../utils/embeds');
const { fmtMoney } = require('../../utils/format');
const {
    GAMBLE_MIN_BET,
    GAMBLE_WIN_CHANCE,
    GAMBLE_WIN_MULTIPLIER,
    applyAmuletBonus
} = require('../../services/gamblingService');

module.exports = {
    data: {
        name: 'kumar',
        description: 'Zar atarak şansını denersin.',
        options: [{ name: 'miktar', description: 'Bahis miktarı', type: 4, required: true }]
    },
    async execute(interaction) {
        const amount = interaction.options.getInteger('miktar');
        if (amount < GAMBLE_MIN_BET) return interaction.reply({ embeds: [createEmbed('warn', '❌ Düşük Bahis', `En düşük bahis ${fmtMoney(GAMBLE_MIN_BET)}.`)], flags: MessageFlags.Ephemeral });

        const userData = await ensureUser(interaction.user.id);
        if (Number(userData.wallet) < amount) {
            return interaction.reply({ embeds: [createEmbed('error', '❌ Yetersiz Bakiye', 'Cüzdanında yeterli paran yok.')], flags: MessageFlags.Ephemeral });
        }

        const hasAmulet = await checkItem(interaction.user.id, 'lucky_amulet');
        const finalChance = applyAmuletBonus(GAMBLE_WIN_CHANCE, hasAmulet > 0);

        await pool.query('UPDATE economy_users SET gamble_count = gamble_count + 1 WHERE user_id = $1', [interaction.user.id]);

        const win = Math.random() < finalChance;
        if (win) {
            const profit = Math.floor(amount * GAMBLE_WIN_MULTIPLIER) - amount;
            await addMoney(interaction.user.id, profit, 'wallet');
            return interaction.reply({ embeds: [createEmbed('success', '🎲 Kazandın', `Zarlar lehine geldi. ${fmtMoney(amount)} kâr ettin.`)] });
        }
        await removeMoney(interaction.user.id, amount, 'wallet');
        return interaction.reply({ embeds: [createEmbed('error', '🎲 Kaybettin', `Zar kötü düştü. ${fmtMoney(amount)} kaybettin.`)] });
    }
};
