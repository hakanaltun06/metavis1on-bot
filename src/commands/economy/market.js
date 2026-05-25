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
const { getCrateTypes, calculateCrateDynamicPrice } = require('../../services/crateService');

function buildPriceEffectLine(current, base) {
    const pct = Math.round((current / base - 1) * 100);
    if (Math.abs(pct) <= 1) return '→ Normal fiyat';
    if (pct > 0) return `↗ %${pct} pahalı · Temel: ${formatFull(base)} ${CURRENCY_NAME} ${CURRENCY}`;
    return `↘ %${Math.abs(pct)} ucuz · Temel: ${formatFull(base)} ${CURRENCY_NAME} ${CURRENCY}`;
}

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
            const effectLine = buildPriceEffectLine(dynamic, base);
            embed.addFields({
                name: `${item.name} — ${formatFull(dynamic)} ${CURRENCY_NAME} ${CURRENCY}`,
                value: `${effectLine}\nKod: \`${item.id}\`\n*${item.desc}*`,
                inline: false
            });
        });

        embed.addFields({ name: '​', value: '**📦 Kasalar**', inline: false });
        getCrateTypes().forEach(crate => {
            const dynamic = calculateCrateDynamicPrice(crate, index);
            const base = crate.basePrice;
            const effectLine = buildPriceEffectLine(dynamic, base);
            embed.addFields({
                name: `${crate.name} — ${formatFull(dynamic)} ${CURRENCY_NAME} ${CURRENCY}`,
                value: `${effectLine}\nKod: \`${crate.code}\`\n*${crate.desc}*`,
                inline: false
            });
        });

        embed.setFooter({ text: 'Satın almak için /satinal · Eşyaların için /envanter · Kasalar için /kasa-ac' });
        await interaction.reply({ embeds: [embed] });
    }
};
