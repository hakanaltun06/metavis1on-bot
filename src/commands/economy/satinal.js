const { MessageFlags } = require('discord.js');
const { withTx } = require('../../database/tx');
const { ensureUser } = require('../../database/users');
const { addItem } = require('../../database/inventory');
const { createEmbed } = require('../../utils/embeds');
const { fmtMoney } = require('../../utils/format');
const { findItem } = require('../../services/shopService');
const {
    getMoneySupply,
    calculateInflationIndex,
    getDynamicPrice
} = require('../../services/economyService');
const { getCrateByCode, calculateCrateDynamicPrice } = require('../../services/crateService');

module.exports = {
    data: {
        name: 'satinal',
        description: 'Marketten eşya veya kasa satın alırsın.',
        options: [
            { name: 'esya', description: 'Almak istediğin eşya veya kasanın kodu.', type: 3, required: true },
            { name: 'adet', description: 'Kaç adet almak istiyorsun?', type: 4, required: false }
        ]
    },
    async execute(interaction) {
        const itemId = interaction.options.getString('esya').toLowerCase();
        const qty = interaction.options.getInteger('adet') || 1;

        if (qty <= 0) return interaction.reply({ embeds: [createEmbed('warn', '❌ Geçersiz Adet', 'Adet sıfırdan büyük olmalı.')], flags: MessageFlags.Ephemeral });

        const shopItem = findItem(itemId);
        const crate = !shopItem ? getCrateByCode(itemId) : null;

        if (!shopItem && !crate) return interaction.reply({ embeds: [createEmbed('error', '❌ Bulunamadı', 'Bu kodda bir eşya veya kasa yok. `/market` komutu ile mevcut seçeneklere bakabilirsin.')], flags: MessageFlags.Ephemeral });

        try {
            const result = await withTx(async (db) => {
                const supply = await getMoneySupply(db);
                const index = calculateInflationIndex(supply.total);

                let unitPrice, addId, displayName;
                if (shopItem) {
                    unitPrice = getDynamicPrice(shopItem, index);
                    addId = shopItem.id;
                    displayName = shopItem.name;
                } else {
                    unitPrice = calculateCrateDynamicPrice(crate, index);
                    addId = crate.code;
                    displayName = crate.name;
                }

                const cost = unitPrice * qty;
                const u = await ensureUser(interaction.user.id, db);
                const walletBefore = Number(u.wallet);
                if (walletBefore < cost) return { kind: 'no_money', cost };

                await db.query(
                    'UPDATE economy_users SET wallet = wallet - $1, total_lost = total_lost + $1 WHERE user_id = $2',
                    [cost, interaction.user.id]
                );
                await addItem(interaction.user.id, addId, qty, db);
                return { kind: 'ok', cost, unitPrice, displayName, newWallet: walletBefore - cost };
            });

            if (result.kind === 'no_money') {
                return interaction.reply({ embeds: [createEmbed('error', '❌ Yetersiz Bakiye', `Bu alışveriş için cüzdanında ${fmtMoney(result.cost)} olmalı.`)], flags: MessageFlags.Ephemeral });
            }

            const footerText = crate
                ? 'Kasayı açmak için /kasa-ac kullan.'
                : 'Eşyalarını görmek için /envanter kullan.';
            const embed = createEmbed('market', '🛍️ Satın Alındı', `**${qty}** adet **${result.displayName}** envanterine eklendi.`)
                .addFields(
                    { name: 'Birim Fiyat', value: fmtMoney(result.unitPrice), inline: true },
                    { name: 'Toplam Ödenen', value: fmtMoney(result.cost), inline: true },
                    { name: 'Yeni Cüzdan', value: fmtMoney(result.newWallet), inline: true }
                )
                .setFooter({ text: footerText });
            return interaction.reply({ embeds: [embed] });
        } catch (err) {
            console.error('Satinal hatasi:', err && err.message ? err.message : err);
            return interaction.reply({ embeds: [createEmbed('error', '⚠️ Bir Aksilik Oldu', 'İşlem sırasında bir sorun çıktı. Biraz sonra tekrar dener misin?')], flags: MessageFlags.Ephemeral });
        }
    }
};
