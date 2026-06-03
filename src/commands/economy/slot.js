const { MessageFlags } = require('discord.js');
const { pool } = require('../../database/pool');
const { ensureUser } = require('../../database/users');
const { addMoney, removeMoney } = require('../../database/money');
const { checkItem } = require('../../database/inventory');
const { createEmbed } = require('../../utils/embeds');
const { fmtMoney } = require('../../utils/format');
const { SLOT_MIN_BET, rollSlot } = require('../../services/gamblingService');
const { grantCappedPoints } = require('../../services/seasonService');
const { trigger } = require('../../services/progressionService');
const { getRuntimeCooldown, setRuntimeCooldown, getGambleCooldownMs } = require('../../services/runtimeCooldownService');
const { getNumberSetting, getBooleanSetting } = require('../../services/settingsService');

module.exports = {
    data: {
        name: 'slot',
        description: 'Slot makinesini çevirirsin.',
        options: [{ name: 'miktar', description: 'Bahis olarak koymak istediğin miktar.', type: 4, required: true }]
    },
    async execute(interaction) {
        const [gamblingEnabled, minBet, maxBet, jackpotMultiplier, gambleCooldownMs] = await Promise.all([
            getBooleanSetting('system.gambling_enabled', true),
            getNumberSetting('slot.min_bet', SLOT_MIN_BET),
            getNumberSetting('slot.max_bet', 1000000),
            getNumberSetting('slot.jackpot_multiplier', 10),
            getGambleCooldownMs(),
        ]);

        if (!gamblingEnabled) {
            return interaction.reply({
                embeds: [createEmbed('warn', '🎲 Kumar Kapalı', 'Risk oyunları kısa süreliğine kapalı. Biraz sonra tekrar deneyebilirsin.')],
                flags: MessageFlags.Ephemeral
            });
        }

        const amount = interaction.options.getInteger('miktar');
        if (amount < minBet) return interaction.reply({ embeds: [createEmbed('warn', '❌ Düşük Bahis', `En düşük bahis ${fmtMoney(minBet)}.`)], flags: MessageFlags.Ephemeral });
        if (maxBet > 0 && amount > maxBet) {
            return interaction.reply({ embeds: [createEmbed('warn', '❌ Yüksek Bahis', `En yüksek bahis ${fmtMoney(maxBet)}.`)], flags: MessageFlags.Ephemeral });
        }

        const leftMs = getRuntimeCooldown('slot', interaction.user.id);
        if (leftMs > 0) {
            const leftSec = Math.ceil(leftMs / 1000);
            return interaction.reply({ embeds: [createEmbed('warn', '⏳ Biraz Bekle', `Bir sonraki slot için **${leftSec} saniye** beklemen gerek.`)], flags: MessageFlags.Ephemeral });
        }
        setRuntimeCooldown('slot', interaction.user.id, gambleCooldownMs);

        const userData = await ensureUser(interaction.user.id);
        if (Number(userData.wallet) < amount) return interaction.reply({ embeds: [createEmbed('error', '❌ Yetersiz Bakiye', 'Cüzdanında yeterli paran yok.')], flags: MessageFlags.Ephemeral });

        const hasAmulet = await checkItem(interaction.user.id, 'lucky_amulet');
        const spin = rollSlot({ jackpotMultiplier });
        const slotResult = `[ ${spin.reels[0]} | ${spin.reels[1]} | ${spin.reels[2]} ]`;

        // Tılsım varsa tam kayıp durumunda %10 ihtimalle bahis iadesi
        const amuletSaved = hasAmulet > 0 && spin.multiplier === 0 && Math.random() < 0.10;

        await pool.query('UPDATE economy_users SET gamble_count = gamble_count + 1 WHERE user_id = $1', [interaction.user.id]);

        let seasonGrant = null;
        try {
            seasonGrant = await grantCappedPoints(interaction.user.id, 'gambling', 3, 20);
        } catch (err) {
            console.error('Sezon puanı eklenemedi (slot):', err?.message);
        }

        try {
            await trigger(interaction.user.id, 'gamble_played', 1, { source: 'slot', bet: amount });
        } catch (err) {
            console.error('Görev ilerlemesi eklenemedi (slot):', err?.message);
        }

        if (amuletSaved) {
            const savedEmbed = createEmbed('info', '🎰 Şans Tılsımı Devreye Girdi')
                .addFields(
                    { name: 'Sonuç', value: slotResult, inline: false },
                    { name: 'Bahis', value: fmtMoney(amount), inline: true },
                    { name: 'İade', value: fmtMoney(amount), inline: true },
                    { name: 'Cüzdan', value: fmtMoney(Number(userData.wallet)), inline: true }
                )
                .setFooter({ text: 'Şans Tılsımı aktif — Kayıp önlendi, bahisin iade edildi.' });
            if (seasonGrant && seasonGrant.granted > 0) {
                savedEmbed.addFields({ name: '⭐ Sezon Puanı', value: `+${seasonGrant.granted} puan`, inline: true });
            }
            return interaction.reply({ embeds: [savedEmbed] });
        }

        if (spin.multiplier > 0) {
            const profit = Math.floor(amount * spin.multiplier) - amount;
            const newWallet = Number(userData.wallet) + profit;
            await addMoney(interaction.user.id, profit, 'wallet');
            const winEmbed = createEmbed('premium', '🎰 Makine Ödeme Yaptı')
                .addFields(
                    { name: 'Sonuç', value: slotResult, inline: false },
                    { name: 'Bahis', value: fmtMoney(amount), inline: true },
                    { name: 'Çarpan', value: `**${spin.multiplier}x**`, inline: true },
                    { name: 'Kazanç', value: fmtMoney(profit), inline: true },
                    { name: 'Yeni Cüzdan', value: fmtMoney(newWallet), inline: false }
                )
                .setFooter({ text: hasAmulet > 0 ? '🍀 Şans Tılsımı aktif.' : 'Bakiyeni kontrol etmek için /bakiye kullan.' });
            if (seasonGrant && seasonGrant.granted > 0) {
                winEmbed.addFields({ name: '⭐ Sezon Puanı', value: `+${seasonGrant.granted} puan`, inline: true });
            }
            return interaction.reply({ embeds: [winEmbed] });
        }

        const newWallet = Number(userData.wallet) - amount;
        await removeMoney(interaction.user.id, amount, 'wallet');
        const loseEmbed = createEmbed('error', '🎰 Makine Bu Tur Sessiz Kaldı')
            .addFields(
                { name: 'Sonuç', value: slotResult, inline: false },
                { name: 'Bahis', value: fmtMoney(amount), inline: true },
                { name: 'Kayıp', value: fmtMoney(amount), inline: true },
                { name: 'Yeni Cüzdan', value: fmtMoney(newWallet), inline: true }
            )
            .setFooter({ text: hasAmulet > 0 ? '🍀 Şans Tılsımı aktifti ama bu tur yetmedi.' : 'Bakiyeni kontrol etmek için /bakiye kullan.' });
        if (seasonGrant && seasonGrant.granted > 0) {
            loseEmbed.addFields({ name: '⭐ Sezon Puanı', value: `+${seasonGrant.granted} puan`, inline: true });
        }
        return interaction.reply({ embeds: [loseEmbed] });
    }
};
