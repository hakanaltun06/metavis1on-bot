import { SlashCommandBuilder } from "discord.js";

export const data = new SlashCommandBuilder()
  .setName("ping")
  .setDescription("Botun gecikme süresini gösterir.");

export const cooldownMs = 2000;

export async function execute(interaction) {
  const sent = await interaction.reply({ content: "⏱️ Ping ölçülüyor...", fetchReply: true });
  const latency = sent.createdTimestamp - interaction.createdTimestamp;
  const apiPing = Math.round(interaction.client.ws.ping);

  await interaction.editReply(`🏓 Pong!\nBot gecikmesi: **${latency}ms**\nAPI gecikmesi: **${apiPing}ms**`);
}
