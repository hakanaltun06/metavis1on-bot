const { requireOwner } = require('../../utils/permissions');
const { adminResetUser } = require('../../services/adminService');
const { createEmbed } = require('../../utils/embeds');

module.exports = {
    data: {
        name: 'ekonomi-sifirla',
        description: 'Bot sahibine özel: kullanıcının ekonomi kaydını sıfırlar.',
        options: [{ name: 'kullanici', type: 6, description: 'Ekonomi kaydı sıfırlanacak kullanıcı.', required: true }]
    },
    async execute(interaction) {
        if (!requireOwner(interaction)) return;
        const target = interaction.options.getUser('kullanici');
        await adminResetUser(target.id);
        return interaction.reply({ embeds: [createEmbed('admin', '🧹 Sıfırlandı', `${target.username} kullanıcısının tüm verisi silindi.`)] });
    }
};
