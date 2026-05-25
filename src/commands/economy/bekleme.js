const { ensureUser } = require('../../database/users');
const { createEmbed } = require('../../utils/embeds');
const { COOLDOWNS } = require('../../utils/constants');
const { checkCooldown } = require('../../services/cooldownService');
const { INTEREST_INTERVAL_MS } = require('../../services/bankService');

function fmtLeft(lastTimestamp, intervalMs) {
    const { ready, leftMs } = checkCooldown(lastTimestamp, intervalMs);
    if (ready) return '🟢 Hazır';
    const days = Math.floor(leftMs / 86400000);
    if (days >= 1) return `⏳ ${days} gün kaldı`;
    const hours = Math.floor(leftMs / 3600000);
    const mins = Math.floor((leftMs % 3600000) / 60000);
    if (hours >= 1) return `⏳ ${hours} saat${mins > 0 ? ` ${mins} dakika` : ''} kaldı`;
    return `⏳ ${Math.max(1, mins)} dakika kaldı`;
}

module.exports = {
    data: { name: 'bekleme', description: 'Ödül ve işlem bekleme sürelerini gösterir.' },
    async execute(interaction) {
        const u = await ensureUser(interaction.user.id);

        const embed = createEmbed('info', '⏱️ Bekleme Süreleri')
            .addFields(
                { name: 'Çalış',    value: fmtLeft(u.last_work,     COOLDOWNS.WORK),    inline: true },
                { name: 'Suç',      value: fmtLeft(u.last_crime,    COOLDOWNS.CRIME),   inline: true },
                { name: 'Soy',      value: fmtLeft(u.last_rob,      COOLDOWNS.ROB),     inline: true },
                { name: 'Dilen',    value: fmtLeft(u.last_beg,      COOLDOWNS.BEG),     inline: true },
                { name: 'Günlük',   value: fmtLeft(u.last_daily,    COOLDOWNS.DAILY),   inline: true },
                { name: 'Haftalık', value: fmtLeft(u.last_weekly,   COOLDOWNS.WEEKLY),  inline: true },
                { name: 'Aylık',    value: fmtLeft(u.last_monthly,  COOLDOWNS.MONTHLY), inline: true },
                { name: 'Faiz',     value: fmtLeft(u.last_interest, INTEREST_INTERVAL_MS), inline: true }
            )
            .setFooter({ text: 'Hazır olan komutları kullanabilir, beklemede olanlar için süreyi takip edebilirsin.' });
        await interaction.reply({ embeds: [embed] });
    }
};
