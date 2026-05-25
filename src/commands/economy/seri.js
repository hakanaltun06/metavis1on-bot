const { pool } = require('../../database/pool');
const { ensureUser } = require('../../database/users');
const { createEmbed } = require('../../utils/embeds');

module.exports = {
    data: { name: 'seri', description: 'En uzun günlük seriye sahip 10 kişiyi gösterir.' },
    async execute(interaction) {
        const [res, u] = await Promise.all([
            pool.query('SELECT user_id, daily_streak FROM economy_users WHERE daily_streak > 0 ORDER BY daily_streak DESC LIMIT 10'),
            ensureUser(interaction.user.id)
        ]);

        let desc = '';
        for (let i = 0; i < res.rows.length; i++) {
            let tag = 'Bilinmeyen Kullanıcı';
            try { tag = (await interaction.client.users.fetch(res.rows[i].user_id)).username; } catch (e) { }
            desc += `🔥 **${res.rows[i].daily_streak} gün** — ${tag}\n`;
        }

        const myStreak = Number(u.daily_streak) || 0;
        let footerText = 'Günlük ödülünü almaya başlayarak seri oluşturabilirsin.';

        if (myStreak > 0) {
            const rankRes = await pool.query(
                'SELECT COUNT(*) FROM economy_users WHERE daily_streak > $1',
                [myStreak]
            );
            const myRank = Number(rankRes.rows[0].count) + 1;
            const inTop10 = res.rows.some(r => r.user_id === interaction.user.id);
            footerText = inTop10
                ? `Sen zaten listedesin: #${myRank} — ${myStreak} gün`
                : `Senin serin: ${myStreak} gün — Sıran: #${myRank}`;
        }

        await interaction.reply({ embeds: [createEmbed('reward', '🔥 En Uzun Seriler', desc || 'Henüz aktif kimse yok.')
            .setFooter({ text: footerText })] });
    }
};
