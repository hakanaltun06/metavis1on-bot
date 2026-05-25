const { ensureUser } = require('../../database/users');
const { getLoanSummary } = require('../../database/loans');
const { createEmbed } = require('../../utils/embeds');
const { fmtMoney, formatDateTime } = require('../../utils/format');
const { BANK_LEVELS } = require('../../utils/constants');
const {
    getNextLevelDef,
    isMaxLevel,
    calculateFillPct,
    estimateInterest
} = require('../../services/bankService');
const { refreshUserLoans } = require('../../services/loanRefresh');

module.exports = {
    data: { name: 'banka', description: 'Banka hesabını, kapasiteni ve faiz durumunu gösterir.' },
    async execute(interaction) {
        await refreshUserLoans(interaction.user.id).catch(() => null);
        const u = await ensureUser(interaction.user.id);
        const wallet = Number(u.wallet);
        const bank = Number(u.bank);
        const limit = Number(u.bank_limit) || BANK_LEVELS[0].limit;
        const level = u.bank_level || 1;
        const maxed = isMaxLevel(level);
        const fillPct = calculateFillPct(bank, limit);
        const est = estimateInterest(bank);
        const totalInterest = Number(u.total_interest_earned) || 0;
        const creditScore = Number(u.credit_score) || 500;
        const lastInterestText = u.last_interest ? formatDateTime(u.last_interest) : 'Henüz faiz almadın.';

        const nextDef = getNextLevelDef(level);
        const upgradeText = maxed
            ? 'Hesabın en yüksek seviyede.'
            : `Bir sonraki seviye: **${nextDef.level}** — Kapasite: ${fmtMoney(nextDef.limit)} — Ücret: ${fmtMoney(nextDef.upgradeCost)}`;

        const loanSummary = await getLoanSummary(interaction.user.id);
        const krediNot = loanSummary.activeCount > 0
            ? `Puan: **${creditScore}** — Açık Borç: ${fmtMoney(loanSummary.activeDebt)}${loanSummary.overdueCount > 0 ? ` (gecikmiş: ${loanSummary.overdueCount})` : ''}`
            : `Puan: **${creditScore}** — Açık borç yok`;

        const embed = createEmbed('info', `🏦 ${interaction.user.username} — Banka Hesabı`)
            .addFields(
                { name: 'Cüzdandaki Para', value: fmtMoney(wallet), inline: true },
                { name: 'Bankadaki Para', value: fmtMoney(bank), inline: true },
                { name: 'Hesap Seviyesi', value: `**${level}**${maxed ? ' (en yüksek)' : ''}`, inline: true },
                { name: 'Banka Kapasitesi', value: fmtMoney(limit), inline: true },
                { name: 'Doluluk Oranı', value: `**%${fillPct}**`, inline: true },
                { name: 'Şu An Alınabilecek Faiz', value: fmtMoney(est), inline: true },
                { name: 'Son Faiz Zamanı', value: lastInterestText, inline: true },
                { name: 'Faizden Kazandığın Toplam', value: fmtMoney(totalInterest), inline: true },
                { name: 'Kredi Durumu', value: krediNot, inline: false },
                { name: 'Yükseltme', value: upgradeText, inline: false }
            )
            .setThumbnail(interaction.user.displayAvatarURL());

        await interaction.reply({ embeds: [embed] });
    }
};
