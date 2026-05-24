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

        const embed = createEmbed('premium', `📈 Piyasa Durumu — ${mood}`, trend)
            .addFields(
                { name: 'Fiyat Etkisi', value: `**${effect}**`, inline: true },
                { name: 'Denge Noktası', value: `${formatNumber(BASE_MONEY_SUPPLY)} ${CURRENCY_NAME} ${CURRENCY}`, inline: true },
                { name: 'Güncel Toplam Para', value: `${fmtMoney(supply.total)}`, inline: true },
                { name: 'Cüzdanlardaki Para', value: `${fmtMoney(supply.wallets)}`, inline: true },
                { name: 'Bankalardaki Para', value: `🏦 ${fmtMoney(supply.banks)}`, inline: true }
            )
            .setFooter({ text: 'Market fiyatları toplam para miktarına göre canlı belirlenir.' });

        await interaction.reply({ embeds: [embed] });
    }
};
