const { MessageFlags } = require('discord.js');
const { ensureUser } = require('../../database/users');
const { getInventory } = require('../../database/inventory');
const { getLoanSummary } = require('../../database/loans');
const { createEmbed } = require('../../utils/embeds');
const { formatNumber, formatDate } = require('../../utils/format');
const { BANK_LEVELS, CURRENCY, CURRENCY_NAME } = require('../../utils/constants');
const { calculateFillPct } = require('../../services/bankService');
const { refreshUserLoans } = require('../../services/loanRefresh');
const { isCrateItem, isRareItem } = require('../../services/crateService');

module.exports = {
    data: {
        name: 'profil',
        description: 'Ekonomi profilini ve genel durumunu gösterir.',
        options: [{ name: 'kullanici', description: 'Profiline bakmak istediğin kullanıcı.', type: 6, required: false }]
    },
    async execute(interaction) {
        const target = interaction.options.getUser('kullanici') || interaction.user;
        if (target.bot) return interaction.reply({ embeds: [createEmbed('error', '❌ Olmaz', 'Botların profili olmaz.')], flags: MessageFlags.Ephemeral });

        if (target.id === interaction.user.id) {
            await refreshUserLoans(interaction.user.id).catch(() => null);
        }

        const userData = await ensureUser(target.id);
        const wallet = Number(userData.wallet);
        const bank = Number(userData.bank);
        const totalWealth = wallet + bank;
        const limit = Number(userData.bank_limit) || BANK_LEVELS[0].limit;
        const level = userData.bank_level || 1;
        const fillPct = calculateFillPct(bank, limit);
        const totalInterest = Number(userData.total_interest_earned) || 0;
        const creditScore = Number(userData.credit_score) || 500;

        const inventory = await getInventory(target.id);
        const totalItems = inventory.reduce((s, r) => s + r.quantity, 0);
        const hasVip = inventory.some(r => r.item_id === 'vip_badge' && r.quantity > 0);
        const crateCount = inventory.filter(r => isCrateItem(r.item_id)).reduce((s, r) => s + r.quantity, 0);
        const collectionTypes = inventory.filter(r => isRareItem(r.item_id)).length;
        const titlePrefix = hasVip ? '💎 VIP Profil — ' : '👤 Profil — ';

        const loanSummary = await getLoanSummary(target.id);
        const krediBlok = loanSummary.activeCount > 0
            ? `Puan: **${creditScore}**\nAktif: **${loanSummary.activeCount}** kredi\nAçık Borç: **${formatNumber(loanSummary.activeDebt)}**`
            : `Puan: **${creditScore}**\nAçık borç yok`;

        const envanterParts = [`Toplam: **${totalItems}** eşya`];
        if (crateCount > 0) envanterParts.push(`Kasa: **${crateCount}**`);
        if (collectionTypes > 0) envanterParts.push(`Koleksiyon: **${collectionTypes} tür**`);

        const embed = createEmbed('premium', `${titlePrefix}${target.username}`)
            .setThumbnail(target.displayAvatarURL({ dynamic: true, size: 512 }))
            .addFields(
                { name: '💰 Servet', value: `Cüzdan: **${formatNumber(wallet)}**\nBanka: **${formatNumber(bank)}** / **${formatNumber(limit)}** (%${fillPct})\nToplam: **${formatNumber(totalWealth)}** ${CURRENCY_NAME} ${CURRENCY}`, inline: true },
                { name: '🏦 Banka Hesabı', value: `Seviye: **${level}**\nFaizden Kazanılan: **${formatNumber(totalInterest)}**`, inline: true },
                { name: '💳 Kredi', value: krediBlok, inline: true },
                { name: '🔥 Aktiflik', value: `Günlük Seri: **${userData.daily_streak}**\nMesai: **${userData.work_count} kez**`, inline: true },
                { name: '🎒 Envanter', value: envanterParts.join('\n'), inline: true },
                { name: '📈 Para Akışı', value: `Kazanılan: **${formatNumber(userData.total_earned)}**\nKaybedilen: **${formatNumber(userData.total_lost)}**`, inline: true },
                { name: '🥷 Suç ve Kumar', value: `Soygun: **${userData.rob_success} başarı / ${userData.rob_fail} başarısız**\nKumar: **${userData.gamble_count} el**`, inline: true }
            )
            .setFooter({ text: `Hesap açılışı: ${formatDate(userData.created_at)}` });

        await interaction.reply({ embeds: [embed] });
    }
};
