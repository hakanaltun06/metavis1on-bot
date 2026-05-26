const { MessageFlags } = require('discord.js');
const { pool } = require('../../database/pool');
const { checkItem, consumeItem, getInventory } = require('../../database/inventory');
const { createEmbed } = require('../../utils/embeds');
const { findItem } = require('../../services/shopService');
const { isCrateItem, isRareItem } = require('../../services/crateService');

const ITEM_TYPE_LABELS = {
    consumable: 'Kullanılabilir',
    passive:    'Pasif',
    flex:       'Prestij'
};

module.exports = {
    data: {
        name: 'kullan',
        description: 'Envanterindeki bir eşyayı kullanırsın.',
        options: [{ name: 'esya', description: 'Kullanmak istediğin eşyayı seç.', type: 3, required: true, autocomplete: true }]
    },

    async autocomplete(interaction) {
        try {
            const focused = interaction.options.getFocused().toLowerCase();
            const inventory = await getInventory(interaction.user.id);

            const usable = inventory
                .filter(row => row.quantity > 0 && !isCrateItem(row.item_id) && !isRareItem(row.item_id))
                .map(row => {
                    const def = findItem(row.item_id);
                    if (!def) return null;
                    const typeLabel = ITEM_TYPE_LABELS[def.type] || 'Eşya';
                    return {
                        name: `${def.name} ×${row.quantity} — ${typeLabel}`,
                        value: def.id
                    };
                })
                .filter(Boolean);

            if (usable.length === 0) return interaction.respond([]);

            const filtered = focused
                ? usable.filter(c => c.name.toLowerCase().includes(focused) || c.value.includes(focused))
                : usable;

            await interaction.respond(filtered.slice(0, 25));
        } catch (_) {
            await interaction.respond([]).catch(() => null);
        }
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
        if (!item || item.type !== 'consumable') {
            if (itemId === 'rob_shield') {
                return interaction.reply({
                    embeds: [createEmbed('info', '🛡️ Soygun Kalkanı',
                        'Bu eşya pasif çalışır. Envanterinde durduğu sürece bir soygun girişimini otomatik engeller ve o anda tüketilir.\n\nBu eşyayı ayrıca kullanmana gerek yok.')],
                    flags: MessageFlags.Ephemeral
                });
            }
            if (itemId === 'lucky_amulet') {
                return interaction.reply({
                    embeds: [createEmbed('info', '🍀 Şans Tılsımı',
                        'Bu eşya pasif çalışır. Envanterinde durduğu sürece desteklenen şans oyunlarında küçük bir avantaj sağlar.\n\nBu eşyayı ayrıca kullanmana gerek yok.')],
                    flags: MessageFlags.Ephemeral
                });
            }
            if (itemId === 'vip_badge') {
                return interaction.reply({
                    embeds: [createEmbed('info', '💎 VIP Rozeti',
                        'Bu bir prestij eşyasıdır. Profilinde özel görünüm sağlar ve doğrudan kullanılmaz.\n\nProfilini görmek için `/profil` komutunu kullanabilirsin.')],
                    flags: MessageFlags.Ephemeral
                });
            }
            return interaction.reply({
                embeds: [createEmbed('info', '🔒 Kullanılamaz',
                    'Bu eşya doğrudan kullanılmaz. Envanterinde durduğu sürece açıklamasındaki etki veya prestij bilgisi geçerlidir.')],
                flags: MessageFlags.Ephemeral
            });
        }

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

        return interaction.reply({
            embeds: [createEmbed('warn', '⚙️ Etki Tanımsız',
                'Bu eşya için henüz tanımlı bir kullanım etkisi bulunmuyor.\n\nHiçbir eşya tüketilmedi.')],
            flags: MessageFlags.Ephemeral
        });
    }
};
