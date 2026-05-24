const { pool } = require('../../database/pool');
const { checkItem, consumeItem } = require('../../database/inventory');
const { createEmbed } = require('../../utils/embeds');
const { findItem } = require('../../services/shopService');

module.exports = {
    data: {
        name: 'kullan',
        description: 'Envanterindeki bir eşyayı kullanırsın.',
        options: [{ name: 'esya', description: 'Kullanılacak eşyanın kodu.', type: 3, required: true }]
    },
    async execute(interaction) {
        const itemId = interaction.options.getString('esya').toLowerCase();
        const hasQty = await checkItem(interaction.user.id, itemId);

        if (hasQty <= 0) return interaction.reply({ embeds: [createEmbed('error', '❌ Yok', 'Bu eşyaya sahip değilsin.')], ephemeral: true });

        const item = findItem(itemId);
        if (!item || item.type !== 'consumable') return interaction.reply({ embeds: [createEmbed('warn', '❌ Kullanılamaz', 'Bu eşya pasif veya süs amaçlı. Doğrudan kullanılamıyor.')], ephemeral: true });

        if (itemId === 'energy_drink') {
            await pool.query('UPDATE economy_users SET last_work = NULL, last_crime = NULL WHERE user_id = $1', [interaction.user.id]);
            await consumeItem(interaction.user.id, itemId, 1);
            return interaction.reply({ embeds: [createEmbed('success', '⚡ Enerji Geldi', 'Enerji içeceğini içtin. Çalışma ve suç bekleme süreleri sıfırlandı.')] });
        }
    }
};
