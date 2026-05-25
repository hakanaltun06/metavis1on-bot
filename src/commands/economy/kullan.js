const { MessageFlags } = require('discord.js');
const { pool } = require('../../database/pool');
const { checkItem, consumeItem } = require('../../database/inventory');
const { createEmbed } = require('../../utils/embeds');
const { findItem } = require('../../services/shopService');
const { isCrateItem, isRareItem } = require('../../services/crateService');

module.exports = {
    data: {
        name: 'kullan',
        description: 'Envanterindeki bir eşyayı kullanırsın.',
        options: [{ name: 'esya', description: 'Kullanmak istediğin eşyanın kodu.', type: 3, required: true }]
    },
    async execute(interaction) {
        const itemId = interaction.options.getString('esya').toLowerCase();

        if (isCrateItem(itemId)) {
            return interaction.reply({ embeds: [createEmbed('info', '📦 Kasa', 'Kasaları açmak için `/kasa-ac` komutunu kullan.')], flags: MessageFlags.Ephemeral });
        }

        if (isRareItem(itemId)) {
            return interaction.reply({ embeds: [createEmbed('info', '🏆 Koleksiyon Eşyası', 'Bu bir koleksiyon eşyası; kullanılamaz. Satmak istiyorsan `/sat` komutunu dene.')], flags: MessageFlags.Ephemeral });
        }

        const hasQty = await checkItem(interaction.user.id, itemId);

        if (hasQty <= 0) return interaction.reply({ embeds: [createEmbed('error', '❌ Yok', 'Bu eşyaya sahip değilsin.')], flags: MessageFlags.Ephemeral });

        const item = findItem(itemId);
        if (!item || item.type !== 'consumable') return interaction.reply({ embeds: [createEmbed('warn', '❌ Kullanılamaz', 'Bu eşya pasif veya süs amaçlı. Doğrudan kullanılamıyor.')], flags: MessageFlags.Ephemeral });

        if (itemId === 'energy_drink') {
            await pool.query('UPDATE economy_users SET last_work = NULL, last_crime = NULL WHERE user_id = $1', [interaction.user.id]);
            await consumeItem(interaction.user.id, itemId, 1);
            const embed = createEmbed('success', '⚡ Enerji Geldi')
                .addFields(
                    { name: 'Kullanılan Eşya', value: 'Enerji İçeceği', inline: true },
                    { name: 'Etki', value: 'Çalışma ve risk aksiyonları için bekleme yenilendi', inline: true },
                    { name: 'Sonraki Adım', value: '/calis veya /suc kullanabilirsin', inline: false }
                )
                .setFooter({ text: 'Eşyalarını görmek için /envanter kullan.' });
            return interaction.reply({ embeds: [embed] });
        }
    }
};
