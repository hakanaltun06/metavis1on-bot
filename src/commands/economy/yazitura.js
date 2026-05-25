const { MessageFlags } = require('discord.js');
const { pool } = require('../../database/pool');
const { ensureUser } = require('../../database/users');
const { addMoney, removeMoney } = require('../../database/money');
const { createEmbed } = require('../../utils/embeds');
const { fmtMoney } = require('../../utils/format');
const { COINFLIP_MIN_BET, rollCoinflip } = require('../../services/gamblingService');

module.exports = {
    data: {
        name: 'yazitura', description: 'Yazı tura atarsın.',
        options: [
            { name: 'secim', description: 'Yazı mı tura mı?', type: 3, required: true, choices: [{ name: 'Yazı', value: 'yazi' }, { name: 'Tura', value: 'tura' }] },
            { name: 'miktar', description: 'Bahis olarak koymak istediğin miktar.', type: 4, required: true }
        ]
    },
    async execute(interaction) {
        const choice = interaction.options.getString('secim');
        const amount = interaction.options.getInteger('miktar');
        if (amount < COINFLIP_MIN_BET) return interaction.reply({ embeds: [createEmbed('warn', '❌ Düşük Bahis', `En düşük bahis ${fmtMoney(COINFLIP_MIN_BET)}.`)], flags: MessageFlags.Ephemeral });

        const userData = await ensureUser(interaction.user.id);
        if (Number(userData.wallet) < amount) return interaction.reply({ embeds: [createEmbed('error', '❌ Yetersiz Bakiye', 'Cüzdanında yeterli paran yok.')], flags: MessageFlags.Ephemeral });

        const result = rollCoinflip();
        const win = choice === result;

        await pool.query('UPDATE economy_users SET gamble_count = gamble_count + 1 WHERE user_id = $1', [interaction.user.id]);

        const resultLabel = result === 'yazi' ? 'YAZI' : 'TURA';

        if (win) {
            await addMoney(interaction.user.id, amount, 'wallet');
            return interaction.reply({ embeds: [createEmbed('success', '🪙 Para Döndü', `Para **${resultLabel}** geldi. Doğru bildin.\nKazandığın: ${fmtMoney(amount)}`)] });
        }
        await removeMoney(interaction.user.id, amount, 'wallet');
        return interaction.reply({ embeds: [createEmbed('error', '🪙 Para Döndü', `Para **${resultLabel}** geldi. Yanlış bildin.\nKaybettiğin: ${fmtMoney(amount)}`)] });
    }
};
