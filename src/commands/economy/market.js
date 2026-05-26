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

module.exports = {
    data: { name: 'market', description: 'Market eşyalarını ve güncel fiyatları gösterir.' },
    async execute(interaction) {
        const supply = await getMoneySupply();
        const index  = calculateInflationIndex(supply.total);
        const mood   = getEconomyMood(index);
        const trend  = getPriceTrend(index);

        // ── Embed 1: Ana Rehber ──────────────────────────────────────────────
        const mainEmbed = createEmbed(
            'market',
            '🛒 metavis1on Market',
            `MetaCoin ile eşya, avantaj ve kasa satın alabileceğin ekonomi vitrini.\n\n**Piyasa Durumu:** ${mood}\n${trend}`
        );
        mainEmbed.addFields(
            { name: '⚡ Kullanılabilir Eşyalar', value: '/kullan ile aktif edilir. Bekleme sürelerini sıfırlar veya anlık avantaj sağlar.', inline: false },
            { name: '🛡️ Pasif Avantajlar',       value: 'Envanterde durdukça otomatik etki sağlar. Aktif kullanım gerekmez.',              inline: false },
            { name: '💎 Prestij ve Özel',         value: 'Profil ve koleksiyon değeri taşır. Biriktirilir veya sergilenir.',                inline: false },
            { name: '📦 Kasalar',                 value: 'Koleksiyon eşyası ve MetaCoin kazanmak için açılır. /kasa-ac ile aç.',            inline: false }
        );
        mainEmbed.setFooter({ text: '/satinal · /kullan · /kasa-ac · /envanter · Fiyatlar ekonomiye göre değişir.' });

        // ── Embed 2: Market Eşyaları ─────────────────────────────────────────
        const consumables = SHOP_ITEMS.filter(i => i.type === 'consumable');
        const passives    = SHOP_ITEMS.filter(i => i.type === 'passive');
        const flex        = SHOP_ITEMS.filter(i => i.type === 'flex');

        const itemEmbed = createEmbed('market', '⚡ Market Eşyaları', '');
        itemEmbed.addFields(
            { name: '⚡ Kullanılabilir',   value: buildSection(consumables.map(i => buildItemBlock(i, index))), inline: false },
            { name: '🛡️ Pasif Avantajlar', value: buildSection(passives.map(i => buildItemBlock(i, index))),    inline: false },
            { name: '💎 Prestij ve Özel',  value: buildSection(flex.map(i => buildItemBlock(i, index))),        inline: false }
        );
        itemEmbed.setFooter({ text: 'Satın almak için /satinal · Kullanmak için /kullan' });

        // ── Embed 3: Kasa Vitrini ────────────────────────────────────────────
        const allCrates     = getCrateTypes();
        const starterCrates = allCrates.slice(0, 4); // basit, nadir, nexus, epik
        const premiumCrates = allCrates.slice(4);    // neon, efsanevi, prestij

        const crateEmbed = createEmbed('crate', '📦 Kasa Vitrini', 'Koleksiyon eşyası veya MetaCoin içerebilir. Fiyatlar piyasaya göre değişir.');
        crateEmbed.addFields(
            { name: '📦 Başlangıç & Orta Seviye', value: buildSection(starterCrates.map(c => buildCrateBlock(c, index))),  inline: false },
            { name: '👑 Premium Kasalar',          value: buildSection(premiumCrates.map(c => buildCrateBlock(c, index))), inline: false }
        );
        crateEmbed.setFooter({ text: 'Satın almak için /satinal · Kasa açmak için /kasa-ac' });

        await interaction.reply({ embeds: [mainEmbed, itemEmbed, crateEmbed] });
    }
};
