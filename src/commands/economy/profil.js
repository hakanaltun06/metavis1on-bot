const { ensureUser } = require('../../database/users');
const { getInventoryTotal, checkItem } = require('../../database/inventory');
const { createEmbed } = require('../../utils/embeds');
const { formatNumber, formatDate } = require('../../utils/format');
const { BANK_LEVELS, CURRENCY, CURRENCY_NAME } = require('../../utils/constants');
const { calculateFillPct } = require('../../services/bankService');

module.exports = {
    data: {
        name: 'profil',
        description: 'Detaylı ekonomi profilini gösterir.',
        options: [{ name: 'kullanici', description: 'Başka birinin profili.', type: 6, required: false }]
    },
    async execute(interaction) {
        const target = interaction.options.getUser('kullanici') || interaction.user;
        if (target.bot) return interaction.reply({ content: 'Botların profili olmuyor.', ephemeral: true });

        const userData = await ensureUser(target.id);
        const wallet = Number(userData.wallet);
        const bank = Number(userData.bank);
        const totalWealth = wallet + bank;
        const limit = Number(userData.bank_limit) || BANK_LEVELS[0].limit;
        const level = userData.bank_level || 1;
        const fillPct = calculateFillPct(bank, limit);
        const totalInterest = Number(userData.total_interest_earned) || 0;

        const itemsCount = await getInventoryTotal(target.id);
        const hasVip = (await checkItem(target.id, 'vip_badge')) > 0;
        const titlePrefix = hasVip ? '💎 VIP Profil — ' : '👤 Profil — ';

        const embed = createEmbed('premium', `${titlePrefix}${target.username}`)
            .setThumbnail(target.displayAvatarURL({ dynamic: true, size: 512 }))
            .addFields(
                { name: '💰 Servet', value: `Cüzdan: **${formatNumber(wallet)}**\nBanka: **${formatNumber(bank)}** / **${formatNumber(limit)}** (%${fillPct})\nToplam: **${formatNumber(totalWealth)}** ${CURRENCY_NAME} ${CURRENCY}`, inline: true },
                { name: '🏦 Banka Hesabı', value: `Seviye: **${level}**\nFaizden Kazanılan: **${formatNumber(totalInterest)}**`, inline: true },
                { name: '🔥 Aktiflik', value: `Günlük Seri: **${userData.daily_streak}**\nMesai: **${userData.work_count} kez**`, inline: true },
                { name: '🎒 Envanter', value: `Toplam Eşya: **${itemsCount}**`, inline: true },
                { name: '📈 Para Akışı', value: `Kazanılan: **${formatNumber(userData.total_earned)}**\nKaybedilen: **${formatNumber(userData.total_lost)}**`, inline: true },
                { name: '🥷 Suç ve Kumar', value: `Soygun: **${userData.rob_success} başarı / ${userData.rob_fail} başarısız**\nKumar: **${userData.gamble_count} el**`, inline: true }
            )
            .setFooter({ text: `Hesap açılışı: ${formatDate(userData.created_at)}` });

        await interaction.reply({ embeds: [embed] });
    }
};
