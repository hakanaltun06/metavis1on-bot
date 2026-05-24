const { EmbedBuilder } = require('discord.js');
const {
    COLOR_SUCCESS,
    COLOR_ERROR,
    COLOR_INFO,
    COLOR_WARNING,
    COLOR_PREMIUM
} = require('./constants');

function createEmbed(type, title, desc = '') {
    const embed = new EmbedBuilder();
    if (title) embed.setTitle(String(title));
    if (desc) embed.setDescription(String(desc));
    if (type === 'success') embed.setColor(COLOR_SUCCESS);
    if (type === 'error') embed.setColor(COLOR_ERROR);
    if (type === 'info') embed.setColor(COLOR_INFO);
    if (type === 'warn') embed.setColor(COLOR_WARNING);
    if (type === 'premium') embed.setColor(COLOR_PREMIUM);
    return embed;
}

function genericErrorEmbed() {
    return createEmbed('error', '⚠️ Bir Aksilik Oldu', 'Bu komut işlenirken bir sorun çıktı. Biraz sonra tekrar dener misin?');
}

module.exports = { createEmbed, genericErrorEmbed };
