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
    if (pct > 0) return `↗ %${pct} pahalı`;
    return `↘ %${Math.abs(pct)} ucuz`;
}

function buildItemLines(items, index) {
    return items.map(item => {
        const dynamic = getDynamicPrice(item, index);
        const effect = buildPriceEffectLine(dynamic, Number(item.price));
        return `**${item.name}** — ${formatFull(dynamic)} ${CURRENCY_NAME} ${CURRENCY}\n${item.desc} · *${effect}*`;
    }).join('\n\n');
}

module.exports = {
    data: { name: 'market', description: 'Market eşyalarını ve güncel fiyatları gösterir.' },
    async execute(interaction) {
        const supply = await getMoneySupply();
        const index = calculateInflationIndex(supply.total);
        const mood = getEconomyMood(index);
        const trend = getPriceTrend(index);

        const embed = createEmbed('market', `🛒 Market — ${mood}`, trend);

        const consumables = SHOP_ITEMS.filter(i => i.type === 'consumable');
        const passives    = SHOP_ITEMS.filter(i => i.type === 'passive');
        const flex        = SHOP_ITEMS.filter(i => i.type === 'flex');

        embed.addFields(
            { name: '⚡ Kullanılabilir Eşyalar', value: buildItemLines(consumables, index), inline: false },
            { name: '🛡️ Pasif Avantajlar',       value: buildItemLines(passives, index),    inline: false },
            { name: '💎 Prestij ve Özel',         value: buildItemLines(flex, index),        inline: false }
        );

        const crateLines = getCrateTypes().map(crate => {
            const dynamic = calculateCrateDynamicPrice(crate, index);
            const effect = buildPriceEffectLine(dynamic, crate.basePrice);
            return `**${crate.name}** — ${formatFull(dynamic)} ${CURRENCY_NAME} ${CURRENCY}\n${crate.desc} · *${effect}*`;
        }).join('\n\n');

        embed.addFields({ name: '📦 Kasalar', value: crateLines, inline: false });

        embed.setFooter({ text: 'Satın almak için /satinal · Kullanılabilir eşyalar için /kullan · Kasalar için /kasa-ac · Fiyatlar ekonomiye göre değişebilir.' });
        await interaction.reply({ embeds: [embed] });
    }
};
