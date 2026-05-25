const { createEmbed } = require('../../utils/embeds');
const { formatFull } = require('../../utils/format');
const { CURRENCY, CURRENCY_NAME, SHOP_ITEMS } = require('../../utils/constants');
const {
    getMoneySupply,
    calculateInflationIndex,
    getEconomyMood,
    getPriceTrend,
    getDynamicPrice
} = require('../../services/economyService');

module.exports = {
    data: { name: 'market', description: 'Market eşyalarını ve güncel fiyatları gösterir.' },
    async execute(interaction) {
        const supply = await getMoneySupply();
        const index = calculateInflationIndex(supply.total);
        const mood = getEconomyMood(index);
        const trend = getPriceTrend(index);

        const embed = createEmbed('market', `🛒 Market — ${mood}`, trend);

        SHOP_ITEMS.forEach(item => {
            const dynamic = getDynamicPrice(item, index);
            const base = Number(item.price);
            const samePrice = dynamic === base;
            const priceLine = samePrice
                ? `${formatFull(dynamic)} ${CURRENCY_NAME} ${CURRENCY}`
                : `${formatFull(dynamic)} ${CURRENCY_NAME} ${CURRENCY} *(temel ${formatFull(base)})*`;
            embed.addFields({
                name: `${item.name} — ${priceLine}`,
                value: `Kod: \`${item.id}\`\n*${item.desc}*`,
                inline: false
            });
        });

        embed.setFooter({ text: 'Eşya almak için /satinal <kod> kullan.' });
        await interaction.reply({ embeds: [embed] });
    }
};
