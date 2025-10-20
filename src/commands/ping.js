import { SlashCommandBuilder } from "discord.js";

export const data = new SlashCommandBuilder()
  .setName("ping")
  .setDescription("Bot yanıt süresi");

export async function execute(interaction) {
  // hızlı ACK (flags:64 = ephemeral)
  if (!interaction.deferred && !interaction.replied) {
    await interaction.deferReply({ flags: 64 });
  }
  const latency = Date.now() - interaction.createdTimestamp;
  await interaction.editReply(`Pong! 🏓 ~${latency}ms`);
}
