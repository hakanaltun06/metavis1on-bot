import { SlashCommandBuilder, EmbedBuilder, MessageFlags } from "discord.js";

export const data = new SlashCommandBuilder()
  .setName("help")
  .setDescription("MetaCoin komut rehberi");

export async function execute(interaction) {
  // Etkileşimi hemen ACK et (3sn sınırına takılma)
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

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
      "- `stats`: rich, level",
    ].join("\n"))
    .setFooter({ text: "İpucu: Yeni başlayanlar için /mc daily ve /mc economy work!" });

  // Asıl cevabı düzenle
  await interaction.editReply({ embeds: [e] });
}
