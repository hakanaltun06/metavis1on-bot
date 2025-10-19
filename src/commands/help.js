import { SlashCommandBuilder, EmbedBuilder } from "discord.js";

export const data = new SlashCommandBuilder()
  .setName("help")
  .setDescription("Komut listesini gösterir.");

export async function execute(interaction) {
  const embed = new EmbedBuilder()
    .setTitle("Metavis1on Bot Yardım")
    .setDescription("Kullanılabilir komutlar:")
    .addFields(
      { name: "/ping", value: "Gecikme ölçer.", inline: true },
      { name: "/help", value: "Bu mesaj.", inline: true }
    )
    .setFooter({ text: "metavis1on.com" })
    .setTimestamp();

  await interaction.reply({ embeds: [embed], ephemeral: true });
}
