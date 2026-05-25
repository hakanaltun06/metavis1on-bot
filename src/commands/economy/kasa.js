const { createEmbed } = require('../../utils/embeds');
const { formatFull } = require('../../utils/format');
const { CURRENCY, CURRENCY_NAME } = require('../../utils/constants');
const { getInventory } = require('../../database/inventory');
const { getCrateTypes, calculateCrateDynamicPrice } = require('../../services/crateService');
const { getMoneySupply, calculateInflationIndex } = require('../../services/economyService');

module.exports = {
    data: { name: 'kasa', description: 'Kasa türlerini ve sahip olduğun kasaları gösterir.' },
    async execute(interaction) {
        const supply = await getMoneySupply();
        const index = calculateInflationIndex(supply.total);
        const crates = getCrateTypes();
        const inventory = await getInventory(interaction.user.id);

        const inventoryMap = {};
        for (const row of inventory) {
            inventoryMap[row.item_id] = row.quantity;
        }

        const embed = createEmbed('crate', '📦 Kasa Listesi', 'Kasa alıp açarak MetaCoin veya koleksiyon eşyaları kazanabilirsin.');

        for (const crate of crates) {
            const dynamicPrice = calculateCrateDynamicPrice(crate, index);
            const owned = inventoryMap[crate.code] || 0;
            const priceText = `${formatFull(dynamicPrice)} ${CURRENCY_NAME} ${CURRENCY}`;
            const ownedText = owned > 0 ? `Sahip: **${owned} adet**` : 'Sahip: yok';

            embed.addFields({
                name: `${crate.name} — ${priceText}`,
                value: `${crate.desc}\nKod: \`${crate.code}\` — ${ownedText}`,
                inline: false
            });
        }

        embed.setFooter({ text: 'Kasa almak: /satinal <kod> · Kasa açmak: /kasa-ac' });
        await interaction.reply({ embeds: [embed] });
    }
};
