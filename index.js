require('dotenv').config();
const { Client, GatewayIntentBits, REST, Routes } = require('discord.js');
const mcCommand = require('./src/commands/mc');

const client = new Client({
    intents: [GatewayIntentBits.Guilds]
});

client.once('ready', async () => {
    console.log(`[BAŞARILI] ${client.user.tag} olarak giriş yapıldı. MetaCoin devrede!`);

    // Komutları Discord API'sine kaydediyoruz
    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
    try {
        console.log('Slash komutları (/) yükleniyor...');
        await rest.put(
            Routes.applicationCommands(process.env.CLIENT_ID),
            { body: [mcCommand.data.toJSON()] }
        );
        console.log('Slash komutları başarıyla yüklendi.');
    } catch (error) {
        console.error('Komutlar yüklenirken hata oluştu:', error);
    }
});

client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;

    if (interaction.commandName === 'mc') {
        await mcCommand.execute(interaction);
    }
});

client.login(process.env.DISCORD_TOKEN);