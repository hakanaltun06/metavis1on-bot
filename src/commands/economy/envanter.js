const { getInventory } = require('../../database/inventory');
const { createEmbed } = require('../../utils/embeds');
const { formatFull } = require('../../utils/format');
const { CURRENCY, CURRENCY_NAME } = require('../../utils/constants');
const { findItemById } = require('../../services/shopService');
const {
    isCrateItem,
    isRareItem,
    getCrateByCode,
    getRareItemByCode,
    getRarityLabel,
    getRarityEmoji
} = require('../../services/crateService');

module.exports = {
    data: { name: 'envanter', description: 'Envanterindeki eşyaları gösterir.' },
    async execute(interaction) {
        const rows = await getInventory(interaction.user.id);

        if (rows.length === 0) {
            return interaction.reply({
                embeds: [createEmbed('info', '🎒 Envanter', 'Envanterin şu an boş. Marketten eşya veya kasa alabilirsin.')]
            });
        }

        const shopItems = [];
        const crateItems = [];
        const collectionItems = [];

        for (const row of rows) {
            if (isCrateItem(row.item_id)) {
                crateItems.push(row);
            } else if (isRareItem(row.item_id)) {
                collectionItems.push(row);
            } else {
                shopItems.push(row);
            }
        }

        const embed = createEmbed('info', `🎒 ${interaction.user.username} — Envanter`);

        if (shopItems.length > 0) {
            const lines = shopItems.map(row => {
                const def = findItemById(row.item_id);
                const name = def ? def.name : row.item_id;
                return `${name} — **${row.quantity} adet**`;
            }).join('\n');
            embed.addFields({ name: '🛍️ Eşyalar', value: lines, inline: false });
        }

        if (crateItems.length > 0) {
            const lines = crateItems.map(row => {
                const def = getCrateByCode(row.item_id);
                const name = def ? def.name : row.item_id;
                return `${name} — **${row.quantity} adet**`;
            }).join('\n');
            embed.addFields({ name: '📦 Kasalar', value: lines, inline: false });
        }

        if (collectionItems.length > 0) {
            const lines = collectionItems.map(row => {
                const def = getRareItemByCode(row.item_id);
                if (!def) return `\`${row.item_id}\` (x${row.quantity})`;
                const emoji = getRarityEmoji(def.rarity);
                const label = getRarityLabel(def.rarity);
                return `${emoji} ${def.name} (x${row.quantity}) — *${label}* · ${formatFull(def.sellValue)} ${CURRENCY_NAME}`;
            }).join('\n');

            const colTotal = collectionItems.reduce((s, r) => s + r.quantity, 0);
            const colValue = collectionItems.reduce((s, r) => {
                const def = getRareItemByCode(r.item_id);
                return s + (def ? def.sellValue * r.quantity : 0);
            }, 0);

            embed.addFields(
                { name: '🏆 Koleksiyon', value: lines, inline: false },
                { name: 'Koleksiyon Özeti', value: `Toplam Değer: ${formatFull(colValue)} ${CURRENCY_NAME} ${CURRENCY}\nToplam Adet: **${colTotal}**`, inline: false }
            );
        }

        embed.setFooter({ text: 'Eşya: /kullan · Kasa: /kasa-ac · Satış: /sat' });
        await interaction.reply({ embeds: [embed] });
    }
};
