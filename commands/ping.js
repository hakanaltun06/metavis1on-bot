import { SlashCommandBuilder } from "discord.js";

export const data = new SlashCommandBuilder()
  .setName("ping")
  .setDescription("Bot yanıt süresi");

export async function execute(interaction) {
  const sent = await interaction.reply({ content: "Pong!", fetchReply: true, ephemeral: true });
  await interaction.editReply(`Pong! 🏓 ${sent.createdTimestamp - interaction.createdTimestamp}ms`);
}
