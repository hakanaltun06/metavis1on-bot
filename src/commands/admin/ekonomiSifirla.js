const { MessageFlags } = require('discord.js');
const { requireOwner } = require('../../utils/permissions');
const { adminResetUser } = require('../../services/adminService');
const { createEmbed } = require('../../utils/embeds');

module.exports = {
    data: {
        name: 'ekonomi-sifirla',
        description: 'Bot sahibine özel: kullanıcının ekonomi kaydını sıfırlar.',
        options: [
            { name: 'kullanici', type: 6, description: 'Ekonomi kaydı sıfırlanacak kullanıcı.', required: true },
            { name: 'onayla', type: 5, description: 'Bu işlemin geri dönüşsüz olduğunu onaylar.', required: true }
        ]
    },
    async execute(interaction) {
        if (!requireOwner(interaction)) return;
        const target  = interaction.options.getUser('kullanici');
        const onayla  = interaction.options.getBoolean('onayla');

        if (!onayla) {
            return interaction.reply({
                embeds: [createEmbed('warn', '⚠️ Ekonomi Sıfırlama Onayı Gerekli',
                    'Bu işlem seçilen kullanıcının ekonomi verilerini geri dönüşsüz sıfırlar.\n\n' +
                    'Devam etmek için komutu `onayla: true` seçeneğiyle tekrar çalıştır.\n\n' +
                    '**Hiçbir veri silinmedi.**')],
                flags: MessageFlags.Ephemeral
            });
        }

        await adminResetUser(interaction.user.id, target.id);
        return interaction.reply({
            embeds: [createEmbed('admin', '🧹 Sıfırlandı',
                `${target.username} kullanıcısının tüm ekonomi verisi silindi. İşlem güvenlik kaydına işlendi.`)],
            flags: MessageFlags.Ephemeral
        });
    }
};
