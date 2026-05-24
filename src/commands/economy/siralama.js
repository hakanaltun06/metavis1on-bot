const { pool } = require('../../database/pool');
const { createEmbed } = require('../../utils/embeds');
const { formatNumber } = require('../../utils/format');
const { CURRENCY, CURRENCY_NAME } = require('../../utils/constants');

module.exports = {
    data: { name: 'siralama', description: 'En zengin 10 kullanıcıyı gösterir.' },
    async execute(interaction) {
        const res = await pool.query('SELECT user_id, (wallet + bank) as total FROM economy_users ORDER BY total DESC LIMIT 10');

        let desc = '';
        for (let i = 0; i < res.rows.length; i++) {
            const row = res.rows[i];
            let tag = 'Bilinmeyen Kullanıcı';
            try {
                const u = await interaction.client.users.fetch(row.user_id);
                tag = u.username;
            } catch (e) { }

            const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `**#${i + 1}**`;
            desc += `${medal} **${tag}** — ${formatNumber(row.total)} ${CURRENCY_NAME} ${CURRENCY}\n`;
        }

        const embed = createEmbed('premium', '🏆 En Zenginler', desc || 'Henüz kimse yok.');
        await interaction.reply({ embeds: [embed] });
    }
};
