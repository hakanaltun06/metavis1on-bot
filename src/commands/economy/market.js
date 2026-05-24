const { createEmbed } = require('../../utils/embeds');
const { formatFull } = require('../../utils/format');
const { CURRENCY, CURRENCY_NAME, SHOP_ITEMS } = require('../../utils/constants');

module.exports = {
    data: { name: 'market', description: 'Alınabilecek eşyaları gösterir.' },
    async execute(interaction) {
        const embed = createEmbed('premium', '🛒 Market', 'Paranla alabileceğin özel eşyalar.');
        SHOP_ITEMS.forEach(item => {
            embed.addFields({
                name: `${item.name} — ${formatFull(item.price)} ${CURRENCY_NAME} ${CURRENCY}`,
                value: `Kod: \`${item.id}\`\n*${item.desc}*`,
                inline: false
            });
        });
        await interaction.reply({ embeds: [embed] });
    }
};
