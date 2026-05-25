const { pool } = require('../../database/pool');
const { createEmbed } = require('../../utils/embeds');
const { formatNumber, formatFull } = require('../../utils/format');
const { CURRENCY, CURRENCY_NAME } = require('../../utils/constants');

module.exports = {
    data: { name: 'siralama', description: 'En zengin 10 kullanıcıyı gösterir.' },
    async execute(interaction) {
        const [topRes, myRes] = await Promise.all([
            pool.query('SELECT user_id, (wallet + bank) as total FROM economy_users ORDER BY total DESC LIMIT 10'),
            pool.query(
                `SELECT (wallet + bank) AS total,
                    (SELECT COUNT(*) FROM economy_users e2 WHERE (e2.wallet + e2.bank) > (e.wallet + e.bank)) + 1 AS rank
                 FROM economy_users e WHERE user_id = $1`,
                [interaction.user.id]
            )
        ]);

        let desc = '';
        for (let i = 0; i < topRes.rows.length; i++) {
            const row = topRes.rows[i];
            let tag = 'Bilinmeyen Kullanıcı';
            try {
                const u = await interaction.client.users.fetch(row.user_id);
                tag = u.username;
            } catch (e) { }

            const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `**#${i + 1}**`;
            desc += `${medal} **${tag}** — ${formatNumber(row.total)} ${CURRENCY_NAME} ${CURRENCY}\n`;
        }

        let footerText = 'Servetini artırmak için ekonomi komutlarını kullanmaya devam et.';
        if (myRes.rows.length > 0) {
            const myRank = Number(myRes.rows[0].rank);
            const myTotal = Number(myRes.rows[0].total);
            const inTop10 = topRes.rows.some(r => r.user_id === interaction.user.id);
            footerText = inTop10
                ? `Sen zaten listedesin: #${myRank}`
                : `Senin sıran: #${myRank} — Toplam servetin: ${formatFull(myTotal)} ${CURRENCY_NAME} ${CURRENCY}`;
        }

        const embed = createEmbed('premium', '🏆 En Zenginler', desc || 'Henüz kimse yok.')
            .setFooter({ text: footerText });
        await interaction.reply({ embeds: [embed] });
    }
};
