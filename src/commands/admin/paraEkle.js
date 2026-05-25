const { checkAdmin } = require('../../utils/permissions');
const { adminAddMoney } = require('../../services/adminService');
const { createEmbed } = require('../../utils/embeds');
const { fmtMoney } = require('../../utils/format');

module.exports = {
    data: {
        name: 'para-ekle',
        description: 'Bir kullanıcının cüzdanına MetaCoin ekler. (Yetkili)',
        options: [
            { name: 'kullanici', type: 6, description: 'Hangi kullanıcı?', required: true },
            { name: 'miktar', type: 4, description: 'Eklenecek miktar', required: true }
        ]
    },
    async execute(interaction) {
        if (!checkAdmin(interaction)) return;
        const target = interaction.options.getUser('kullanici');
        const amount = interaction.options.getInteger('miktar');
        await adminAddMoney(interaction.user.id, target.id, amount);
        return interaction.reply({ embeds: [createEmbed('admin', '✅ Tamamdır', `${target.username} hesabına ${fmtMoney(amount)} eklendi.`)] });
    }
};
