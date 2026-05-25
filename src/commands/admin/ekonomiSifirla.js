const { checkAdmin } = require('../../utils/permissions');
const { adminResetUser } = require('../../services/adminService');
const { createEmbed } = require('../../utils/embeds');

module.exports = {
    data: {
        name: 'ekonomi-sifirla',
        description: 'Bir kullanıcının tüm ekonomi verisini sıfırlar. (Yetkili)',
        options: [{ name: 'kullanici', type: 6, description: 'Hangi kullanıcı?', required: true }]
    },
    async execute(interaction) {
        if (!checkAdmin(interaction)) return;
        const target = interaction.options.getUser('kullanici');
        await adminResetUser(target.id);
        return interaction.reply({ embeds: [createEmbed('admin', '🧹 Sıfırlandı', `${target.username} kullanıcısının tüm verisi silindi.`)] });
    }
};
