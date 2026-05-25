const { requireOwner } = require('../../utils/permissions');
const { adminRemoveMoney } = require('../../services/adminService');
const { createEmbed } = require('../../utils/embeds');
const { fmtMoney } = require('../../utils/format');

module.exports = {
    data: {
        name: 'para-sil',
        description: 'Bot sahibine özel: kullanıcıdan MetaCoin siler.',
        options: [
            { name: 'kullanici', type: 6, description: 'MetaCoin silinecek kullanıcı.', required: true },
            { name: 'miktar', type: 4, description: 'Silinecek MetaCoin miktarı.', required: true }
        ]
    },
    async execute(interaction) {
        if (!requireOwner(interaction)) return;
        const target = interaction.options.getUser('kullanici');
        const amount = interaction.options.getInteger('miktar');
        await adminRemoveMoney(interaction.user.id, target.id, amount);
        return interaction.reply({ embeds: [createEmbed('admin', '✅ Tamamdır', `${target.username} hesabından ${fmtMoney(amount)} silindi.`)] });
    }
};
