import { SlashCommandBuilder, EmbedBuilder } from "discord.js";

export const data = new SlashCommandBuilder()
  .setName("help")
  .setDescription("MetaCoin komut rehberi");

export async function execute(interaction) {
  if (!interaction.deferred && !interaction.replied) {
    await interaction.deferReply({ flags: 64 }); // ephemeral
  }

  const embed = new EmbedBuilder()
    .setTitle("💎 MetaCoin — Yardım")
    .setDescription([
      "### Ekonomi",
      "`/mc economy balance|daily|work|beg|transfer`",
      "### Banka (faizli)",
      "`/mc bank deposit|withdraw|info`",
      "### Mağaza & Envanter",
      "`/mc shop list|buy|sell`, `/mc inv show`",
      "### Kasalar",
      "`/mc case list|info|open|simulate` — **çok sayıda kasa**, EV/olasılık önizleme, simülasyon",
      "### Kumar",
      "`/mc gamble coinflip|slots`",
      "### Sıralama",
      "`/mc stats rich|level`"
    ].join("\n"))
    .setFooter({ text: "İpucu: Kasa açmadan önce `/mc case info` ile EV'yi kontrol et." });

  await interaction.editReply({ embeds: [embed] });
}
