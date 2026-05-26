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
const { grantCappedPoints } = require('../../services/seasonService');

module.exports = {
    data: {
        name: 'kumar',
        description: 'Zar atarak şansını denersin.',
        options: [{ name: 'miktar', description: 'Bahis olarak koymak istediğin miktar.', type: 4, required: true }]
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

        let seasonGrant = null;
        try {
            seasonGrant = await grantCappedPoints(interaction.user.id, 'gambling', 3, 20);
        } catch (err) {
            console.error('Sezon puanı eklenemedi (kumar):', err?.message);
        }

        const win = Math.random() < finalChance;
        const chanceText = hasAmulet > 0
            ? `🍀 Şans Tılsımı aktif — Kazanma şansın: %${(finalChance * 100).toFixed(0)}`
            : `Kazanma şansın: %${(finalChance * 100).toFixed(0)}`;
        if (win) {
            const profit = Math.floor(amount * GAMBLE_WIN_MULTIPLIER) - amount;
            const newWallet = Number(userData.wallet) + profit;
            await addMoney(interaction.user.id, profit, 'wallet');
            const winEmbed = createEmbed('success', '🎲 Kazandın', 'Zarlar lehine geldi.')
                .addFields(
                    { name: 'Bahis', value: fmtMoney(amount), inline: true },
                    { name: 'Kazanç', value: fmtMoney(profit), inline: true },
                    { name: 'Yeni Cüzdan', value: fmtMoney(newWallet), inline: true }
                )
                .setFooter({ text: chanceText });
            if (seasonGrant && seasonGrant.granted > 0) {
                winEmbed.addFields({ name: '🏆 Sezon Puanı', value: `+${seasonGrant.granted} puan`, inline: true });
            }
            return interaction.reply({ embeds: [winEmbed] });
        }
        const newWallet = Number(userData.wallet) - amount;
        await removeMoney(interaction.user.id, amount, 'wallet');
        const loseEmbed = createEmbed('error', '🎲 Kaybettin', 'Zar kötü düştü.')
            .addFields(
                { name: 'Bahis', value: fmtMoney(amount), inline: true },
                { name: 'Kayıp', value: fmtMoney(amount), inline: true },
                { name: 'Yeni Cüzdan', value: fmtMoney(newWallet), inline: true }
            )
            .setFooter({ text: chanceText });
        if (seasonGrant && seasonGrant.granted > 0) {
            loseEmbed.addFields({ name: '🏆 Sezon Puanı', value: `+${seasonGrant.granted} puan`, inline: true });
        }
        return interaction.reply({ embeds: [loseEmbed] });
    }
};
