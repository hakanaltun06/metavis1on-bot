const { Client, GatewayIntentBits } = require('discord.js');

function createClient() {
    return new Client({
        intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages]
    });
}

module.exports = { createClient };
