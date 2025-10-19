import { SlashCommandBuilder } from "discord.js";

export const data = new SlashCommandBuilder()
  .setName("ping")
  .setDescription("Bot gecikmesini gösterir.");

export async function execute(interaction) {
  const sent = await interaction.reply({ content: "Pong!", fetchReply: true });
  const latency = sent.createdTimestamp - interaction.createdTimestamp;
  await interaction.editReply(`Pong! Gecikme: ${latency}ms`);
}
