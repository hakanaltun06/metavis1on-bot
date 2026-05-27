const { MessageFlags, ButtonBuilder, ButtonStyle, ActionRowBuilder } = require('discord.js');
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
const { disableAllComponents } = require('../../utils/componentUtils');

const COLLECTOR_TIMEOUT = 5 * 60 * 1000;
const RARITY_ORDER = { efsanevi: 0, epik: 1, ender: 2, siradan: 3 };

// Sekme butonları — aktif ve boş sekmeler devre dışı
function buildButtons(active, interactionId, flags) {
    const tabs = [
        { id: 'summary',    label: '📋 Özet',      empty: false },
        { id: 'items',      label: '🛍️ Eşyalar',   empty: !flags.hasItems },
        { id: 'crates',     label: '📦 Kasalar',    empty: !flags.hasCrates },
        { id: 'collection', label: '💎 Koleksiyon', empty: !flags.hasCollection },
    ];
    const buttons = tabs.map(tab =>
        new ButtonBuilder()
            .setCustomId(`inventory:${tab.id}:${interactionId}`)
            .setLabel(tab.label)
            .setStyle(tab.id === active ? ButtonStyle.Primary : ButtonStyle.Secondary)
            .setDisabled(tab.id === active || tab.empty)
    );
    return new ActionRowBuilder().addComponents(buttons);
}

function buildSummaryEmbed(username, shopItems, crateItems, collectionItems) {
    const totalShop  = shopItems.reduce((s, r) => s + r.quantity, 0);
    const totalCrate = crateItems.reduce((s, r) => s + r.quantity, 0);
    const totalCol   = collectionItems.reduce((s, r) => s + r.quantity, 0);
    const total      = totalShop + totalCrate + totalCol;

    if (total === 0) {
        return createEmbed('info', `🎒 ${username} — Envanter · Özet`,
            'Envanterin şu an boş. Marketten eşya veya kasa alabilirsin.')
            .setFooter({ text: '/market ile ürünleri incele · /satinal ile satın al' });
    }

    const parts = [];
    if (totalShop > 0)  parts.push(`**Eşyalar:** ${totalShop} adet`);
    if (totalCrate > 0) parts.push(`**Kasalar:** ${totalCrate} adet`);
    if (totalCol > 0)   parts.push(`**Koleksiyon:** ${totalCol} adet`);

    let desc = `**Toplam:** ${total} eşya\n${parts.join(' · ')}`;

    if (collectionItems.length > 0) {
        const top = collectionItems
            .map(r => ({ ...r, def: getRareItemByCode(r.item_id) }))
            .filter(r => r.def)
            .sort((a, b) => (RARITY_ORDER[a.def.rarity] ?? 9) - (RARITY_ORDER[b.def.rarity] ?? 9))
            .slice(0, 3);

        if (top.length > 0) {
            const topLines = top.map(r => {
                const emoji = getRarityEmoji(r.def.rarity);
                return `${emoji} **${r.def.name}** ×${r.quantity}`;
            }).join('\n');
            desc += `\n\n**En Değerli Koleksiyonlar:**\n${topLines}`;
        }
    }

    return createEmbed('info', `🎒 ${username} — Envanter · Özet`, desc)
        .setFooter({ text: 'Eşya kullanmak için /kullan · Kasa açmak için /kasa-ac · Satmak için /sat' });
}

function buildItemsEmbed(username, shopItems) {
    if (shopItems.length === 0) {
        return createEmbed('info', `🛍️ ${username} — Envanter · Eşyalar`,
            'Bu kategoride eşyan yok. Ürün almak için /market ve /satinal kullan.')
            .setFooter({ text: 'Markette neler var? /market' });
    }

    const enriched    = shopItems.map(r => ({ ...r, def: findItemById(r.item_id) }));
    const consumables = enriched.filter(r => r.def?.type === 'consumable');
    const passives    = enriched.filter(r => r.def?.type === 'passive');
    const flex        = enriched.filter(r => {
        const t = r.def?.type;
        return t !== 'consumable' && t !== 'passive';
    });

    const embed = createEmbed('info', `🛍️ ${username} — Envanter · Eşyalar`, '');

    if (consumables.length > 0) {
        embed.addFields({
            name: '⚡ Kullanılabilir',
            value: consumables.map(r =>
                `**${r.def?.name ?? r.item_id}** ×${r.quantity}\n${r.def?.desc ?? ''}`
            ).join('\n'),
            inline: false
        });
    }
    if (passives.length > 0) {
        embed.addFields({
            name: '🛡️ Pasif Avantajlar',
            value: passives.map(r =>
                `**${r.def?.name ?? r.item_id}** ×${r.quantity}\n${r.def?.desc ?? ''}`
            ).join('\n'),
            inline: false
        });
    }
    if (flex.length > 0) {
        embed.addFields({
            name: '💎 Prestij ve Özel',
            value: flex.map(r =>
                `**${r.def?.name ?? r.item_id}** ×${r.quantity}\n${r.def?.desc ?? ''}`
            ).join('\n'),
            inline: false
        });
    }

    embed.setFooter({ text: 'Kullanılabilir eşyalar için /kullan' });
    return embed;
}

function buildCratesEmbed(username, crateItems) {
    if (crateItems.length === 0) {
        return createEmbed('crate', `📦 ${username} — Envanter · Kasalar`,
            'Kasaların yok. Kasa almak için /market ve /satinal kullan.')
            .setFooter({ text: 'Kasa almak için /satinal · /market' });
    }

    // getCrateByCode(siber_kasa) → nexus_kasa verisi döndürür — siber_kasa kullanıcıya görünmez
    const lines = crateItems.map(r => {
        const def  = getCrateByCode(r.item_id);
        const name = def ? def.name : r.item_id;
        return `**${name}** ×${r.quantity}\nAçmak için: \`/kasa-ac\``;
    }).join('\n\n');

    return createEmbed('crate', `📦 ${username} — Envanter · Kasalar`, '')
        .addFields({ name: '📦 Kasalarım', value: lines, inline: false })
        .setFooter({ text: 'Kasa açmak için /kasa-ac' });
}

function buildCollectionEmbed(username, collectionItems) {
    if (collectionItems.length === 0) {
        return createEmbed('collection', `💎 ${username} — Envanter · Koleksiyon`,
            'Koleksiyon eşyan yok. Kasa açarak koleksiyon eşyaları kazanabilirsin.')
            .setFooter({ text: 'Kasa açmak için /kasa-ac' });
    }

    const groups = { efsanevi: [], epik: [], ender: [], siradan: [] };
    for (const r of collectionItems) {
        const def = getRareItemByCode(r.item_id);
        if (!def) continue;
        const bucket = groups[def.rarity] ?? groups.siradan;
        bucket.push({ ...r, def });
    }

    const RARITY_HEADERS = {
        efsanevi: '🏆 Efsanevi',
        epik:     '✨ Epik',
        ender:    '🔹 Ender',
        siradan:  '⚪ Sıradan'
    };

    const embed = createEmbed('collection', `💎 ${username} — Envanter · Koleksiyon`, '');

    for (const rarity of ['efsanevi', 'epik', 'ender', 'siradan']) {
        if (groups[rarity].length === 0) continue;
        const lines = groups[rarity].map(r => {
            const emoji = getRarityEmoji(r.def.rarity);
            const label = getRarityLabel(r.def.rarity);
            return `${emoji} **${r.def.name}** ×${r.quantity} — *${label}* · ${formatFull(r.def.sellValue)} ${CURRENCY_NAME}`;
        }).join('\n');
        embed.addFields({ name: RARITY_HEADERS[rarity], value: lines, inline: false });
    }

    const colValue = collectionItems.reduce((s, r) => {
        const def = getRareItemByCode(r.item_id);
        return s + (def ? def.sellValue * r.quantity : 0);
    }, 0);
    const colTotal = collectionItems.reduce((s, r) => s + r.quantity, 0);

    embed.addFields({
        name: 'Koleksiyon Özeti',
        value: `Toplam Değer: ${formatFull(colValue)} ${CURRENCY_NAME} ${CURRENCY}\nToplam Adet: **${colTotal}**`,
        inline: false
    });
    embed.setFooter({ text: 'Satılabilir koleksiyonlar için /sat kullan.' });
    return embed;
}

module.exports = {
    data: { name: 'envanter', description: 'Envanterindeki eşyaları gösterir.' },
    async execute(interaction) {
        try {
            const rows     = await getInventory(interaction.user.id);
            const username = interaction.user.username;

            const shopItems       = [];
            const crateItems      = [];
            const collectionItems = [];

            for (const row of rows) {
                if (isCrateItem(row.item_id))    crateItems.push(row);
                else if (isRareItem(row.item_id)) collectionItems.push(row);
                else                              shopItems.push(row);
            }

            const flags = {
                hasItems:      shopItems.length > 0,
                hasCrates:     crateItems.length > 0,
                hasCollection: collectionItems.length > 0
            };

            let currentRow = buildButtons('summary', interaction.id, flags);

            const message = await interaction.reply({
                embeds: [buildSummaryEmbed(username, shopItems, crateItems, collectionItems)],
                components: [currentRow],
                fetchReply: true
            });

            const collector = message.createMessageComponentCollector({
                time: COLLECTOR_TIMEOUT,
                filter: i => i.customId.startsWith('inventory:') && i.customId.endsWith(`:${interaction.id}`)
            });

            collector.on('collect', async (btn) => {
                if (btn.user.id !== interaction.user.id) {
                    return btn.reply({
                        content: 'Bu envanter menüsü sana ait değil. Kendi envanterini görmek için `/envanter` kullan.',
                        flags: MessageFlags.Ephemeral
                    });
                }

                const tab = btn.customId.split(':')[1];

                let embed;
                if (tab === 'summary')         embed = buildSummaryEmbed(username, shopItems, crateItems, collectionItems);
                else if (tab === 'items')       embed = buildItemsEmbed(username, shopItems);
                else if (tab === 'crates')      embed = buildCratesEmbed(username, crateItems);
                else                            embed = buildCollectionEmbed(username, collectionItems);

                currentRow = buildButtons(tab, interaction.id, flags);
                try {
                    await btn.update({ embeds: [embed], components: [currentRow] });
                } catch {
                    // Mesaj silindi veya etkileşim süresi doldu — sessizce geç
                }
            });

            collector.on('end', async () => {
                try {
                    await message.edit({ components: disableAllComponents([currentRow]) });
                } catch {
                    // Mesaj artık mevcut değil — sessizce geç
                }
            });

        } catch (err) {
            console.error('Envanter komutu hatası:', err?.message);
            const errorEmbed = createEmbed('error', '⚠️ Bir Aksilik Oldu', 'Envanter şu an yüklenemiyor. Biraz sonra tekrar dene.');
            try {
                if (interaction.replied || interaction.deferred) {
                    await interaction.followUp({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
                } else {
                    await interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
                }
            } catch {
                // ignore
            }
        }
    }
};
