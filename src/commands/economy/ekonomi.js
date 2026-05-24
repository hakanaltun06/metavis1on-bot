const { pool } = require('../../database/pool');
const { createEmbed } = require('../../utils/embeds');
const { formatNumber } = require('../../utils/format');
const { CURRENCY, CURRENCY_NAME } = require('../../utils/constants');
const {
    calculateInflationIndex,
    getEconomyMood,
    formatPriceEffect
} = require('../../services/economyService');

module.exports = {
    data: { name: 'ekonomi', description: 'Sunucunun genel ekonomi durumunu gösterir.' },
    async execute(interaction) {
        const res = await pool.query(`
            SELECT
                COUNT(*) as users,
                COALESCE(SUM(wallet), 0) as total_w,
                COALESCE(SUM(bank), 0) as total_b,
                COALESCE(SUM(total_interest_earned), 0) as total_int,
                COALESCE(AVG(bank_level), 1)::numeric(10,2) as avg_lvl,
                COALESCE(MAX(bank_level), 1) as max_lvl
            FROM economy_users
        `);
        const data = res.rows[0];
        const tw = Number(data.total_w) || 0;
        const tb = Number(data.total_b) || 0;
        const tInt = Number(data.total_int) || 0;
        const avgLvl = Number(data.avg_lvl) || 1;
        const maxLvl = Number(data.max_lvl) || 1;

        const totalMoney = tw + tb;
        const index = calculateInflationIndex(totalMoney);
        const mood = getEconomyMood(index);
        const effect = formatPriceEffect(index);

        const embed = createEmbed('info', '📊 Ekonomi Durumu')
            .addFields(
                { name: 'Kayıtlı Kullanıcı', value: `**${data.users}** kişi`, inline: true },
                { name: 'Cüzdanlardaki Para', value: `${formatNumber(tw)} ${CURRENCY_NAME} ${CURRENCY}`, inline: true },
                { name: 'Bankalardaki Para', value: `🏦 ${formatNumber(tb)} ${CURRENCY_NAME}`, inline: true },
                { name: 'Toplam Servet', value: `**${formatNumber(totalMoney)}** ${CURRENCY_NAME} ${CURRENCY}`, inline: true },
                { name: 'Toplam Faiz Kazancı', value: `${formatNumber(tInt)} ${CURRENCY_NAME}`, inline: true },
                { name: 'Banka Seviyesi', value: `Ortalama **${avgLvl.toFixed(2)}** — En yüksek **${maxLvl}**`, inline: true },
                { name: 'Piyasa Durumu', value: `**${mood}**`, inline: true },
                { name: 'Fiyat Etkisi', value: `**${effect}**`, inline: true }
            );
        await interaction.reply({ embeds: [embed] });
    }
};
