const { MessageFlags } = require('discord.js');
const { pool } = require('../../database/pool');
const { ensureUser } = require('../../database/users');
const { addMoney, removeMoney } = require('../../database/money');
const { createEmbed } = require('../../utils/embeds');
const { fmtMoney } = require('../../utils/format');
const { SLOT_MIN_BET, rollSlot } = require('../../services/gamblingService');

module.exports = {
    data: {
        name: 'slot',
        description: 'Slot makinesini çevirirsin.',
        options: [{ name: 'miktar', description: 'Bahis miktarı', type: 4, required: true }]
    },
    async execute(interaction) {
        const amount = interaction.options.getInteger('miktar');
        if (amount < SLOT_MIN_BET) return interaction.reply({ embeds: [createEmbed('warn', '❌ Düşük Bahis', `En düşük bahis ${SLOT_MIN_BET}.`)], flags: MessageFlags.Ephemeral });

        const userData = await ensureUser(interaction.user.id);
        if (Number(userData.wallet) < amount) return interaction.reply({ embeds: [createEmbed('error', '❌ Yetersiz Bakiye', 'Cüzdanında yeterli paran yok.')], flags: MessageFlags.Ephemeral });

        const spin = rollSlot();
        const slotString = `[ ${spin.reels[0]} | ${spin.reels[1]} | ${spin.reels[2]} ]`;

        await pool.query('UPDATE economy_users SET gamble_count = gamble_count + 1 WHERE user_id = $1', [interaction.user.id]);

        if (spin.multiplier > 0) {
            const profit = Math.floor(amount * spin.multiplier) - amount;
            await addMoney(interaction.user.id, profit, 'wallet');
            return interaction.reply({ embeds: [createEmbed('premium', '🎰 Slot Makinesi', `\n> ${slotString}\n\n🎉 **Kazandın.** Çarpan: **${spin.multiplier}x**\nNet kâr: ${fmtMoney(profit)}`)] });
        }
        await removeMoney(interaction.user.id, amount, 'wallet');
        return interaction.reply({ embeds: [createEmbed('error', '🎰 Slot Makinesi', `\n> ${slotString}\n\n💀 **Kaybettin.**\nGiden: ${fmtMoney(amount)}`)] });
    }
};
