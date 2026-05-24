const { MessageFlags } = require('discord.js');
const { OWNER_ID } = require('../config/env');
const { createEmbed } = require('./embeds');

function checkAdmin(interaction) {
    if (interaction.user.id === OWNER_ID) return true;
    const member = interaction.member;
    const isAdmin = !!(member && member.permissions && typeof member.permissions.has === 'function' && member.permissions.has('Administrator'));
    if (!isAdmin) {
        interaction.reply({ embeds: [createEmbed('error', '⛔ Yetki Yok', 'Bu komutu yalnızca yetkili kişiler kullanabilir.')], flags: MessageFlags.Ephemeral });
        return false;
    }
    return true;
}

module.exports = { checkAdmin };
