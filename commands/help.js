import { SlashCommandBuilder, EmbedBuilder } from "discord.js";

export const data = new SlashCommandBuilder()
  .setName("help")
  .setDescription("MetaCoin komut rehberi");

export async function execute(interaction) {
  const e = new EmbedBuilder()
    .setTitle("MetaCoin — Komutlar")
    .setDescription([
      "**/mc**: Ana komut. Alt komut grupları:",
      "- `economy`: balance, daily, work, beg, transfer",
      "- `bank`: deposit, withdraw",
      "- `shop`: list, buy, sell",
      "- `inv`: show",
      "- `case`: list, info, open",
      "- `gamble`: coinflip, slots",
      "- `pet`: adopt, list, info, feed",
    ].join("\n"))
    .setFooter({ text: "İpucu: Yeni başlayanlar için /mc daily ve /mc economy work!" });
  await interaction.reply({ embeds: [e], ephemeral: true });
}
