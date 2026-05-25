const { pool } = require('../../database/pool');
const { createEmbed } = require('../../utils/embeds');

module.exports = {
    data: { name: 'seri', description: 'En uzun günlük seriye sahip 10 kişiyi gösterir.' },
    async execute(interaction) {
        const res = await pool.query('SELECT user_id, daily_streak FROM economy_users WHERE daily_streak > 0 ORDER BY daily_streak DESC LIMIT 10');
        let desc = '';
        for (let i = 0; i < res.rows.length; i++) {
            let tag = 'Bilinmeyen Kullanıcı';
            try { tag = (await interaction.client.users.fetch(res.rows[i].user_id)).username; } catch (e) { }
            desc += `🔥 **${res.rows[i].daily_streak} gün** — ${tag}\n`;
        }
        await interaction.reply({ embeds: [createEmbed('reward', '🔥 En Uzun Seriler', desc || 'Henüz aktif kimse yok.')] });
    }
};
