const { MessageFlags } = require('discord.js');
const { requireOwner } = require('../../utils/permissions');
const { adminAddMoney } = require('../../services/adminService');
const { createEmbed } = require('../../utils/embeds');
const { fmtMoney } = require('../../utils/format');

module.exports = {
    data: {
        name: 'para-ekle',
        description: 'Bot sahibine özel: kullanıcıya MetaCoin ekler.',
        options: [
            { name: 'kullanici', type: 6, description: 'MetaCoin eklenecek kullanıcı.', required: true },
            { name: 'miktar', type: 4, description: 'Eklenecek MetaCoin miktarı.', required: true, min_value: 1 }
        ]
    },
    async execute(interaction) {
        if (!requireOwner(interaction)) return;
        const target = interaction.options.getUser('kullanici');
        const amount = interaction.options.getInteger('miktar');
        if (amount < 1) return interaction.reply({ embeds: [createEmbed('warn', '❌ Geçersiz Miktar', 'Miktar en az 1 olmalı.')], flags: MessageFlags.Ephemeral });
        await adminAddMoney(interaction.user.id, target.id, amount);
        return interaction.reply({ embeds: [createEmbed('admin', '✅ Tamamdır', `${target.username} hesabına ${fmtMoney(amount)} eklendi.`)] });
    }
};
