const { MessageFlags } = require('discord.js');
const { resolveCommand } = require('../commands');
const { genericErrorEmbed } = require('../utils/embeds');

function attachInteractionHandler(client) {
    client.on('interactionCreate', async (interaction) => {
        if (interaction.isAutocomplete()) {
            const acCommand = resolveCommand(interaction.commandName);
            if (acCommand && typeof acCommand.autocomplete === 'function') {
                try {
                    await acCommand.autocomplete(interaction);
                } catch (err) {
                    console.error('Autocomplete hatası:', err && err.message ? err.message : err);
                    await interaction.respond([]).catch(() => null);
                }
            }
            return;
        }

        if (!interaction.isChatInputCommand()) return;

        const requestedName = interaction.commandName;
        const command = resolveCommand(requestedName);
        if (!command) return;

        try {
            await command.execute(interaction);
        } catch (error) {
            console.error(`Komut hatası (${requestedName}):`, error && error.message ? error.message : error);
            const errEmbed = genericErrorEmbed();
            if (interaction.replied || interaction.deferred) {
                await interaction.followUp({ embeds: [errEmbed], flags: MessageFlags.Ephemeral }).catch(() => null);
            } else {
                await interaction.reply({ embeds: [errEmbed], flags: MessageFlags.Ephemeral }).catch(() => null);
            }
        }
    });
}

module.exports = { attachInteractionHandler };
