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

module.exports = {
    data: {
        name: 'satinal',
        description: 'Marketten eşya satın alırsın.',
        options: [
            { name: 'esya', description: 'Alınacak eşyanın kodu (market içinde görünüyor).', type: 3, required: true },
            { name: 'adet', description: 'Kaç tane?', type: 4, required: false }
        ]
    },
    async execute(interaction) {
        const itemId = interaction.options.getString('esya').toLowerCase();
        const qty = interaction.options.getInteger('adet') || 1;

        if (qty <= 0) return interaction.reply({ embeds: [createEmbed('warn', '❌ Geçersiz Adet', 'Adet sıfırdan büyük olmalı.')], flags: MessageFlags.Ephemeral });

        const item = findItem(itemId);
        if (!item) return interaction.reply({ embeds: [createEmbed('error', '❌ Bulunamadı', 'Bu kodda bir eşya yok. `/market` komutu ile mevcut eşyalara bakabilirsin.')], flags: MessageFlags.Ephemeral });

        try {
            const result = await withTx(async (db) => {
                // Aynı işlem içinde piyasa anlık görüntüsü; gösterilen ile ödenen tutar tutarlı.
                const supply = await getMoneySupply(db);
                const index = calculateInflationIndex(supply.total);
                const unitPrice = getDynamicPrice(item, index);
                const cost = unitPrice * qty;

                const u = await ensureUser(interaction.user.id, db);
                if (Number(u.wallet) < cost) return { kind: 'no_money', cost };

                await db.query(
                    'UPDATE economy_users SET wallet = wallet - $1, total_lost = total_lost + $1 WHERE user_id = $2',
                    [cost, interaction.user.id]
                );
                await addItem(interaction.user.id, item.id, qty, db);
                return { kind: 'ok', cost, unitPrice };
            });

            if (result.kind === 'no_money') {
                return interaction.reply({ embeds: [createEmbed('error', '❌ Yetersiz Bakiye', `Bu alışveriş için cüzdanında ${fmtMoney(result.cost)} olmalı.`)], flags: MessageFlags.Ephemeral });
            }
            const embed = createEmbed('market', '🛍️ Satın Alındı')
                .addFields(
                    { name: 'Eşya', value: `${item.name}`, inline: true },
                    { name: 'Adet', value: `**${qty}**`, inline: true },
                    { name: 'Ödenen', value: fmtMoney(result.cost), inline: true }
                );
            return interaction.reply({ embeds: [embed] });
        } catch (err) {
            console.error('Satınal hatası:', err && err.message ? err.message : err);
            return interaction.reply({ embeds: [createEmbed('error', '⚠️ Bir Aksilik Oldu', 'İşlem sırasında bir sorun çıktı. Biraz sonra tekrar dener misin?')], flags: MessageFlags.Ephemeral });
        }
    }
};
