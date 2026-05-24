const { REST, Routes } = require('discord.js');
const { BOT_TOKEN, CLIENT_ID } = require('../config/env');
const { getRegisterableData } = require('../commands');

async function registerCommands() {
    if (!BOT_TOKEN || !CLIENT_ID) {
        console.error('Komutlar kaydedilemedi: BOT_TOKEN veya CLIENT_ID tanımlı değil.');
        return;
    }
    const rest = new REST({ version: '10' }).setToken(BOT_TOKEN);
    console.log('🔄 Slash komutları yükleniyor...');
    const body = getRegisterableData();
    await rest.put(Routes.applicationCommands(CLIENT_ID), { body });
    console.log(`✅ ${body.length} komut başarıyla yüklendi.`);
}

module.exports = { registerCommands };
