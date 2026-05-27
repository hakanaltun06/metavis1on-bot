const { MessageFlags } = require('discord.js');
const { pool } = require('../../database/pool');
const { ensureUser } = require('../../database/users');
const { addMoney, removeMoney } = require('../../database/money');
const { checkItem } = require('../../database/inventory');
const { createEmbed } = require('../../utils/embeds');
const { fmtMoney } = require('../../utils/format');
const { COINFLIP_MIN_BET, applyAmuletBonus } = require('../../services/gamblingService');
const { grantCappedPoints } = require('../../services/seasonService');
const { trigger } = require('../../services/progressionService');

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

        const hasAmulet = await checkItem(interaction.user.id, 'lucky_amulet');
        const finalChance = applyAmuletBonus(0.5, hasAmulet > 0);
        const win = Math.random() < finalChance;
        const result = win ? choice : (choice === 'yazi' ? 'tura' : 'yazi');

        await pool.query('UPDATE economy_users SET gamble_count = gamble_count + 1 WHERE user_id = $1', [interaction.user.id]);

        let seasonGrant = null;
        try {
            seasonGrant = await grantCappedPoints(interaction.user.id, 'gambling', 2, 20);
        } catch (err) {
            console.error('Sezon puanı eklenemedi (yazitura):', err?.message);
        }

        try {
            await trigger(interaction.user.id, 'gamble_played', 1, { source: 'yazitura', bet: amount, choice });
        } catch (err) {
            console.error('Görev ilerlemesi eklenemedi (yazitura):', err?.message);
        }

        const choiceLabel = choice === 'yazi' ? 'Yazı' : 'Tura';
        const resultLabel = result === 'yazi' ? 'Yazı' : 'Tura';

        if (win) {
            const newWallet = Number(userData.wallet) + amount;
            await addMoney(interaction.user.id, amount, 'wallet');
            const winEmbed = createEmbed('success', '🪙 Tahminin Tuttu', `Para **${resultLabel}** geldi.`)
                .addFields(
                    { name: 'Seçimin', value: choiceLabel, inline: true },
                    { name: 'Sonuç', value: `${resultLabel} ✅`, inline: true },
                    { name: 'Kazanç', value: fmtMoney(amount), inline: true },
                    { name: 'Yeni Cüzdan', value: fmtMoney(newWallet), inline: false }
                )
                .setFooter({ text: 'Bakiyeni kontrol etmek için /bakiye kullan.' });
            if (hasAmulet > 0) {
                winEmbed.addFields({ name: '🍀 Şans Tılsımı', value: 'Aktif — tahmin şansın biraz arttı.', inline: true });
            }
            if (seasonGrant && seasonGrant.granted > 0) {
                winEmbed.addFields({ name: '⭐ Sezon Puanı', value: `+${seasonGrant.granted} puan`, inline: true });
            }
            return interaction.reply({ embeds: [winEmbed] });
        }

        const newWallet = Number(userData.wallet) - amount;
        await removeMoney(interaction.user.id, amount, 'wallet');
        const loseEmbed = createEmbed('error', '🪙 Para Diğer Yüzünü Gösterdi', `Para **${resultLabel}** geldi.`)
            .addFields(
                { name: 'Seçimin', value: choiceLabel, inline: true },
                { name: 'Sonuç', value: `${resultLabel} ❌`, inline: true },
                { name: 'Kayıp', value: fmtMoney(amount), inline: true },
                { name: 'Yeni Cüzdan', value: fmtMoney(newWallet), inline: false }
            )
            .setFooter({ text: 'Bakiyeni kontrol etmek için /bakiye kullan.' });
        if (hasAmulet > 0) {
            loseEmbed.addFields({ name: '🍀 Şans Tılsımı', value: 'Aktif — ama bu tur şans dönemedi.', inline: true });
        }
        if (seasonGrant && seasonGrant.granted > 0) {
            loseEmbed.addFields({ name: '⭐ Sezon Puanı', value: `+${seasonGrant.granted} puan`, inline: true });
        }
        return interaction.reply({ embeds: [loseEmbed] });
    }
};
