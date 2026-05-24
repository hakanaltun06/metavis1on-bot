const { checkAdmin } = require('../../utils/permissions');
const { adminRemoveMoney } = require('../../services/adminService');
const { createEmbed } = require('../../utils/embeds');
const { fmtMoney } = require('../../utils/format');

module.exports = {
    data: {
        name: 'para-sil',
        description: 'Bir kullanıcının cüzdanından MetaCoin siler. (Yetkili)',
        options: [
            { name: 'kullanici', type: 6, description: 'Hangi kullanıcı?', required: true },
            { name: 'miktar', type: 4, description: 'Silinecek miktar', required: true }
        ]
    },
    async execute(interaction) {
        if (!checkAdmin(interaction)) return;
        const target = interaction.options.getUser('kullanici');
        const amount = interaction.options.getInteger('miktar');
        await adminRemoveMoney(interaction.user.id, target.id, amount);
        return interaction.reply({ embeds: [createEmbed('success', '✅ Tamamdır', `${target.username} hesabından ${fmtMoney(amount)} silindi.`)] });
    }
};
