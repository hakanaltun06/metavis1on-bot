const { MessageFlags } = require('discord.js');
const { OWNER_IDS } = require('../config/env');
const { createEmbed } = require('./embeds');

function isBotOwner(userId) {
    return OWNER_IDS.length > 0 && OWNER_IDS.includes(userId);
}

function requireOwner(interaction) {
    if (OWNER_IDS.length === 0) {
        console.warn('Bot sahibi tanımlanmamış. OWNER_ID veya OWNER_IDS ayarlanmalı.');
        interaction.reply({
            embeds: [createEmbed('error', '⛔ İşlem Yapılamadı', 'Bot sahibi tanımlanmamış. Güvenlik nedeniyle işlem yapılmadı.')],
            flags: MessageFlags.Ephemeral
        });
        return false;
    }
    if (!isBotOwner(interaction.user.id)) {
        console.warn('Yetkisiz yönetici komutu denemesi engellendi.');
        interaction.reply({
            embeds: [createEmbed('error', '⛔ Yetki Yok', 'Bu komutu yalnızca bot sahibi kullanabilir.')],
            flags: MessageFlags.Ephemeral
        });
        return false;
    }
    return true;
}

module.exports = { isBotOwner, requireOwner };
