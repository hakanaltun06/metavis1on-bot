const { MessageFlags } = require('discord.js');
const { withTx } = require('../../database/tx');
const { ensureUser } = require('../../database/users');
const { checkItem, safeConsumeItem, getInventory } = require('../../database/inventory');
const { logTransaction } = require('../../database/transactions');
const { createEmbed } = require('../../utils/embeds');
const { fmtMoney, formatFull } = require('../../utils/format');
const { CURRENCY, CURRENCY_NAME } = require('../../utils/constants');
const {
    getSellableItemByCode,
    isCrateItem,
    isRareItem,
    getRareItemByCode,
    getRarityEmoji
} = require('../../services/crateService');
const { findItemById } = require('../../services/shopService');

module.exports = {
    data: {
        name: 'sat',
        description: 'Koleksiyon eşyalarını MetaCoin karşılığında satarsın.',
        options: [
            { name: 'esya', description: 'Satmak istediğin koleksiyon eşyasını seç.', type: 3, required: true, autocomplete: true },
            { name: 'adet', description: 'Kaç adet satmak istiyorsun?', type: 4, required: false, min_value: 1 }
        ]
    },

    async autocomplete(interaction) {
        try {
            const focused = interaction.options.getFocused().toLowerCase();
            const inventory = await getInventory(interaction.user.id);

            const sellable = inventory
                .filter(row => isRareItem(row.item_id) && row.quantity > 0)
                .map(row => {
                    const def = getRareItemByCode(row.item_id);
                    if (!def) return null;
                    const emoji = getRarityEmoji(def.rarity);
                    return {
                        name: `${emoji} ${def.name} (x${row.quantity}) — ${formatFull(def.sellValue)} ${CURRENCY_NAME} ${CURRENCY}`,
                        value: def.code
                    };
                })
                .filter(Boolean);

            if (sellable.length === 0) {
                return interaction.respond([]);
            }

            const filtered = focused
                ? sellable.filter(c => c.name.toLowerCase().includes(focused))
                : sellable;

            await interaction.respond(filtered.slice(0, 25));
        } catch (_) {
            await interaction.respond([]).catch(() => null);
        }
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

                const updRes = await db.query(
                    'UPDATE economy_users SET wallet = wallet + $1, total_earned = total_earned + $1 WHERE user_id = $2 RETURNING wallet',
                    [totalValue, interaction.user.id]
                );
                const newWallet = Number(updRes.rows[0].wallet);

                await logTransaction(interaction.user.id, null, 'sell_item', totalValue, `${qty}x ${rareItem.name} satildi`, db);

                return { kind: 'ok', totalValue, newWallet };
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

            const embed = createEmbed('reward', '💰 Eşya Satıldı', desc)
                .addFields(
                    { name: 'Birim Değer', value: fmtMoney(rareItem.sellValue), inline: true },
                    { name: 'Toplam Kazanç', value: fmtMoney(result.totalValue), inline: true },
                    { name: 'Yeni Cüzdan', value: fmtMoney(result.newWallet), inline: true }
                )
                .setFooter({ text: 'Kalan eşyalarını /envanter ile görebilirsin.' });

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
