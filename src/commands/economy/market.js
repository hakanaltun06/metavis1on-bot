const { MessageFlags, ButtonBuilder, ButtonStyle, ActionRowBuilder } = require('discord.js');
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
const { disableAllComponents } = require('../../utils/componentUtils');

// Vitrin için kısa ve vurucu açıklamalar
const ITEM_SHORT_DESCS = {
    rob_shield:       'Bir soygun girişimini otomatik engeller.',
    lucky_amulet:     'Kumar şansını %5 artırır.',
    energy_drink:     'Tüm beklemeleri anında sıfırlar.',
    vip_badge:        'Prestij profil aksesuarı.',
    odak_kahvesi:     'Çalışma beklemesini sıfırlar.',
    risk_cipi:        'Suç beklemesini sıfırlar.',
    kasa_anahtari:    'Özel etkinlik sistemleri için biriktirilir.',
    profil_cercevesi: 'Neon temalı koleksiyon profil çerçevesi.',
    kara_kart:        'Koleksiyon değeri yüksek prestij eşyası.',
};

const CRATE_SHORT_DESCS = {
    basit_kasa:    'Düşük fiyatlı başlangıç kasası.',
    nadir_kasa:    'Orta seviye, dengeli ödül şansı.',
    nexus_kasa:    'Nadir ve epik arası dengeli dijital kasa.',
    epik_kasa:     'Yüksek ödül ihtimali, ciddi seviye.',
    neon_kasa:     'Epik eşya ağırlıklı yüksek seviye kasa.',
    efsanevi_kasa: 'En yüksek ödül ihtimali.',
    prestij_kasa:  'En üst seviye kasa. Garanti efsanevi vermez.',
};

// Fiyat etki satırı — değiştirilmeden korunur
function buildPriceEffectLine(current, base) {
    const pct = Math.round((current / base - 1) * 100);
    if (Math.abs(pct) <= 1) return '→ Normal fiyat';
    if (pct > 0) return `↗ %${pct} pahalı`;
    return `↘ %${Math.abs(pct)} ucuz`;
}

// Görsel vitrin için fiyat etki satırı — normal dışında temel fiyatı da gösterir
function buildEffectLine(dynamic, base) {
    const pct = Math.round((dynamic / base - 1) * 100);
    if (Math.abs(pct) <= 1) return '→ Normal fiyat';
    const tag = pct > 0 ? `↗ %${pct} pahalı` : `↘ %${Math.abs(pct)} ucuz`;
    return `${tag} · Temel: ${formatFull(base)} ${CURRENCY}`;
}

function buildItemBlock(item, index) {
    const dynamic = getDynamicPrice(item, index);
    const effect  = buildEffectLine(dynamic, Number(item.price));
    const desc    = ITEM_SHORT_DESCS[item.id] || item.desc;
    return `**${item.name}**\n\`${formatFull(dynamic)} ${CURRENCY_NAME} ${CURRENCY}\` · ${desc}\n${effect}`;
}

function buildCrateBlock(crate, index) {
    const dynamic = calculateCrateDynamicPrice(crate, index);
    const effect  = buildEffectLine(dynamic, crate.basePrice);
    const desc    = CRATE_SHORT_DESCS[crate.code] || crate.desc;
    return `**${crate.name}**\n\`${formatFull(dynamic)} ${CURRENCY_NAME} ${CURRENCY}\` · ${desc}\n${effect}`;
}

function buildSection(blocks) {
    return blocks.join('\n\n');
}

// Sekme butonları — aktif sekme mavi+devre dışı, diğerleri gri
function buildButtons(active, interactionId) {
    const tabs = [
        { id: 'items',  label: '⚡ Eşyalar' },
        { id: 'crates', label: '📦 Kasalar'  },
        { id: 'info',   label: 'ℹ️ Piyasa'  },
    ];
    const buttons = tabs.map(tab =>
        new ButtonBuilder()
            .setCustomId(`market:${tab.id}:${interactionId}`)
            .setLabel(tab.label)
            .setStyle(tab.id === active ? ButtonStyle.Primary : ButtonStyle.Secondary)
            .setDisabled(tab.id === active)
    );
    return new ActionRowBuilder().addComponents(buttons);
}

function buildItemsEmbed(index, mood) {
    const consumables = SHOP_ITEMS.filter(i => i.type === 'consumable');
    const passives    = SHOP_ITEMS.filter(i => i.type === 'passive');
    const flex        = SHOP_ITEMS.filter(i => i.type === 'flex');
    const embed = createEmbed('market', '🛒 metavis1on Market · Eşyalar', `**Piyasa Durumu:** ${mood}`);
    embed.addFields(
        { name: '⚡ Kullanılabilir',   value: buildSection(consumables.map(i => buildItemBlock(i, index))), inline: false },
        { name: '🛡️ Pasif Avantajlar', value: buildSection(passives.map(i => buildItemBlock(i, index))),    inline: false },
        { name: '💎 Prestij ve Özel',  value: buildSection(flex.map(i => buildItemBlock(i, index))),        inline: false }
    );
    embed.setFooter({ text: 'Satın almak için /satinal · Kasaları görmek için 📦 Kasalar butonuna bas' });
    return embed;
}

function buildCratesEmbed(index, mood) {
    const allCrates     = getCrateTypes();
    const starterCrates = allCrates.slice(0, 4); // basit, nadir, nexus, epik
    const premiumCrates = allCrates.slice(4);    // neon, efsanevi, prestij
    const embed = createEmbed('crate', '📦 metavis1on Market · Kasalar',
        `**Piyasa Durumu:** ${mood} · Fiyatlar ekonomiye göre değişir.`
    );
    embed.addFields(
        { name: '📦 Başlangıç & Orta Seviye', value: buildSection(starterCrates.map(c => buildCrateBlock(c, index))), inline: false },
        { name: '👑 Premium Kasalar',          value: buildSection(premiumCrates.map(c => buildCrateBlock(c, index))), inline: false }
    );
    embed.setFooter({ text: 'Kasa almak için /satinal · Kasa açmak için /kasa-ac · Eşyalar için ⚡ Eşyalar butonuna bas' });
    return embed;
}

function buildInfoEmbed(mood, trend) {
    const embed = createEmbed('info', 'ℹ️ metavis1on Market · Piyasa Bilgisi',
        `**Piyasa Durumu:** ${mood}\n${trend}`
    );
    embed.addFields(
        { name: '📈 Fiyatlar Nasıl Değişir?', value: 'Fiyatlar, sunucudaki toplam para miktarına göre otomatik olarak ayarlanır. Para fazlalaşınca fiyatlar yükselir, azalınca düşer.', inline: false },
        { name: '🛒 Nasıl Satın Alırım?',     value: '`/satinal` komutunu kullan. Eşya veya kasa seçip kaç adet istediğini belirt, MetaCoin cüzdanından düşülür.', inline: false },
        { name: '📦 Kasaları Nasıl Açarım?',  value: '`/kasa-ac` komutunu kullan. Her kasada MetaCoin veya koleksiyon eşyası kazanma şansın var.', inline: false },
        { name: '🎒 Eşyalarım Nerede?',       value: '`/envanter` ile sahip olduklarını gör. Kullanılabilir eşyalar için `/kullan` komutunu dene.', inline: false }
    );
    embed.setFooter({ text: '/satinal · /envanter · /kullan · /kasa-ac' });
    return embed;
}

const COLLECTOR_TIMEOUT = 5 * 60 * 1000;

module.exports = {
    data: { name: 'market', description: 'Market eşyalarını ve güncel fiyatları gösterir.' },
    async execute(interaction) {
        try {
            const supply = await getMoneySupply();
            const index  = calculateInflationIndex(supply.total);
            const mood   = getEconomyMood(index);
            const trend  = getPriceTrend(index);

            let currentRow = buildButtons('items', interaction.id);

            const message = await interaction.reply({
                embeds: [buildItemsEmbed(index, mood)],
                components: [currentRow],
                fetchReply: true
            });

            const collector = message.createMessageComponentCollector({
                time: COLLECTOR_TIMEOUT,
                filter: i => i.customId.startsWith('market:') && i.customId.endsWith(`:${interaction.id}`)
            });

            collector.on('collect', async (btn) => {
                if (btn.user.id !== interaction.user.id) {
                    return btn.reply({
                        content: 'Bu market menüsü sana ait değil. Kendi marketini görmek için `/market` kullan.',
                        flags: MessageFlags.Ephemeral
                    });
                }

                const tab = btn.customId.split(':')[1];

                let embed;
                if (tab === 'items')       embed = buildItemsEmbed(index, mood);
                else if (tab === 'crates') embed = buildCratesEmbed(index, mood);
                else                       embed = buildInfoEmbed(mood, trend);

                currentRow = buildButtons(tab, interaction.id);
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
            console.error('Market komutu hatası:', err?.message);
            const errorEmbed = createEmbed('error', '⚠️ Bir Aksilik Oldu', 'Market şu an yüklenemiyor. Biraz sonra tekrar dene.');
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
