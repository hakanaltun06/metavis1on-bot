const { getInventory } = require('../../database/inventory');
const { createEmbed } = require('../../utils/embeds');
const { findItemById } = require('../../services/shopService');

module.exports = {
    data: { name: 'envanter', description: 'Sahip olduğun eşyaları gösterir.' },
    async execute(interaction) {
        const rows = await getInventory(interaction.user.id);

        if (rows.length === 0) {
            return interaction.reply({ embeds: [createEmbed('info', '🎒 Envanter', 'Envanterin şu an boş.')] });
        }

        const embed = createEmbed('info', `🎒 ${interaction.user.username} — Envanter`);
        rows.forEach(row => {
            const itemDef = findItemById(row.item_id);
            const name = itemDef ? itemDef.name : row.item_id;
            embed.addFields({ name: `${name} (x${row.quantity})`, value: `Kod: \`${row.item_id}\``, inline: true });
        });
        await interaction.reply({ embeds: [embed] });
    }
};
