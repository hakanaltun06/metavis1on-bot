const { MessageFlags } = require('discord.js');
const { withTx } = require('../../database/tx');
const { ensureUser } = require('../../database/users');
const { checkItem, safeConsumeItem } = require('../../database/inventory');
const { logTransaction } = require('../../database/transactions');
const { createEmbed } = require('../../utils/embeds');
const { fmtMoney } = require('../../utils/format');
const {
    getSellableItemByCode,
    isCrateItem,
    getRarityEmoji
} = require('../../services/crateService');
const { findItemById } = require('../../services/shopService');

module.exports = {
    data: {
        name: 'sat',
        description: 'Koleksiyon eşyalarını MetaCoin karşılığında satarsın.',
        options: [
            { name: 'esya', description: 'Satmak istediğin koleksiyon eşyasının kodu.', type: 3, required: true },
            { name: 'adet', description: 'Kaç adet satmak istiyorsun?', type: 4, required: false, min_value: 1 }
        ]
    },
    async execute(interaction) {
        const itemCode = interaction.options.getString('esya').toLowerCase();
        const qty = interaction.options.getInteger('adet') || 1;

        if (qty <= 0) {
            return interaction.reply({
                embeds: [createEmbed('warn', '❌ Geçersiz Adet', 'Adet en az 1 olmalı.')],
                flags: MessageFlags.Ephemeral
            });
        }

        if (isCrateItem(itemCode)) {
            return interaction.reply({
                embeds: [createEmbed('warn', '❌ Satılamaz', 'Kasalar satılamaz. Açmak için `/kasa-ac` komutunu kullan.')],
                flags: MessageFlags.Ephemeral
            });
        }

        if (findItemById(itemCode)) {
            return interaction.reply({
                embeds: [createEmbed('warn', '❌ Satılamaz', 'Market eşyaları satılamaz. Sadece koleksiyon eşyaları satılabilir.')],
                flags: MessageFlags.Ephemeral
            });
        }

        const rareItem = getSellableItemByCode(itemCode);
        if (!rareItem) {
            return interaction.reply({
                embeds: [createEmbed('error', '❌ Bulunamadı', 'Bu eşya kodu bulunamadı. Koleksiyon eşyalarını `/envanter` ile görebilirsin.')],
                flags: MessageFlags.Ephemeral
            });
        }

        try {
            const result = await withTx(async (db) => {
                await ensureUser(interaction.user.id, db);

                const owned = await checkItem(interaction.user.id, itemCode, db);
                if (owned < qty) {
                    return { kind: 'no_item', owned };
                }

                const consumed = await safeConsumeItem(interaction.user.id, itemCode, qty, db);
                if (!consumed) {
                    return { kind: 'no_item', owned: 0 };
                }

                const totalValue = rareItem.sellValue * qty;

                await db.query(
                    'UPDATE economy_users SET wallet = wallet + $1, total_earned = total_earned + $1 WHERE user_id = $2',
                    [totalValue, interaction.user.id]
                );

                await logTransaction(interaction.user.id, null, 'sell_item', totalValue, `${qty}x ${rareItem.name} satildi`, db);

                return { kind: 'ok', totalValue };
            });

            if (result.kind === 'no_item') {
                const msg = result.owned > 0
                    ? `Envanterinde sadece **${result.owned}** adet ${rareItem.name} var.`
                    : `Envanterinde ${rareItem.name} yok.`;
                return interaction.reply({
                    embeds: [createEmbed('warn', '❌ Yetersiz Eşya', msg)],
                    flags: MessageFlags.Ephemeral
                });
            }

            const emoji = getRarityEmoji(rareItem.rarity);
            const desc = qty === 1
                ? `**1** adet ${emoji} ${rareItem.name} sattın.`
                : `**${qty}** adet ${emoji} ${rareItem.name} sattın.`;

            const embed = createEmbed('reward', '💰 Eşya Satıldı', desc);
            embed.addFields({ name: 'Kazanç', value: fmtMoney(result.totalValue), inline: true });
            embed.setFooter({ text: 'Kalan eşyalarını /envanter ile görebilirsin.' });

            return interaction.reply({ embeds: [embed] });

        } catch (err) {
            console.error('Esya satma hatasi:', err && err.message ? err.message : err);
            return interaction.reply({
                embeds: [createEmbed('error', '⚠️ Bir Aksilik Oldu', 'Satış sırasında bir sorun çıktı. Biraz sonra tekrar dener misin?')],
                flags: MessageFlags.Ephemeral
            });
        }
    }
};
