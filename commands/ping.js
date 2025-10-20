import { SlashCommandBuilder, MessageFlags } from "discord.js";

export const data = new SlashCommandBuilder()
  .setName("ping")
  .setDescription("Bot yanıt süresi");

export async function execute(interaction) {
  const t0 = Date.now();
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const latency = Date.now() - interaction.createdTimestamp;
  await interaction.editReply(`Pong! 🏓 ~${latency}ms (ack: ~${Date.now() - t0}ms)`);
}
