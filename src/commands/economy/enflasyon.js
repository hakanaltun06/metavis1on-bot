const { createEmbed } = require('../../utils/embeds');
const { fmtMoney, formatNumber } = require('../../utils/format');
const { CURRENCY, CURRENCY_NAME, BASE_MONEY_SUPPLY } = require('../../utils/constants');
const {
    getMoneySupply,
    calculateInflationIndex,
    getEconomyMood,
    getPriceTrend,
    formatPriceEffect
} = require('../../services/economyService');

module.exports = {
    data: { name: 'enflasyon', description: 'Sunucudaki piyasa durumunu ve fiyat etkisini gösterir.' },
    async execute(interaction) {
        const supply = await getMoneySupply();
        const index = calculateInflationIndex(supply.total);
        const mood = getEconomyMood(index);
        const trend = getPriceTrend(index);
        const effect = formatPriceEffect(index);

        function getIndexGuidance(idx) {
            if (idx < 0.95) return 'Fiyatlar normalin altında. Kasa veya eşya almak için iyi bir fırsat.';
            if (idx < 1.10) return 'Piyasa dengeli. Alışveriş ve birikim için uygun bir an.';
            if (idx < 1.60) return 'Fiyatlar yükseliyor. Zorunlu olmayan alımları ertelemeyi düşünebilirsin.';
            if (idx < 2.50) return 'Pahalı dönem. Büyük harcamalar yapmadan önce iki kez düşün.';
            return 'Sert enflasyon. Harcamalarını kıs; piyasa düşene kadar biriktirmeye bak.';
        }

        const embed = createEmbed('inflation', `📈 Piyasa Durumu — ${mood}`, trend)
            .addFields(
                { name: 'Fiyat Etkisi', value: `**${effect}**`, inline: true },
                { name: 'Denge Noktası', value: `${formatNumber(BASE_MONEY_SUPPLY)} ${CURRENCY_NAME} ${CURRENCY}`, inline: true },
                { name: 'Güncel Toplam Para', value: `${fmtMoney(supply.total)}`, inline: true },
                { name: 'Cüzdanlardaki Para', value: `${fmtMoney(supply.wallets)}`, inline: true },
                { name: 'Bankalardaki Para', value: `🏦 ${fmtMoney(supply.banks)}`, inline: true },
                { name: 'Piyasa Yorumu', value: getIndexGuidance(index), inline: false }
            )
            .setFooter({ text: 'Piyasa genelini görmek için /ekonomi · Alışveriş için /market' });

        await interaction.reply({ embeds: [embed] });
    }
};
