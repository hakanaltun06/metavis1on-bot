import { SlashCommandBuilder, EmbedBuilder, MessageFlags } from "discord.js";

export const data = new SlashCommandBuilder()
  .setName("help")
  .setDescription("MetaCoin komut rehberi");

export async function execute(interaction) {
  await interaction.deferReply({ ephemeral: true });

  const e = new EmbedBuilder()
    .setTitle("MetaCoin — Komutlar")
    .setDescription([
      "### Ekonomi",
      "`/mc economy balance|daily|work|beg|transfer`",
      "### Banka",
      "`/mc bank deposit|withdraw|info` (faizli hesap)",
      "### Mağaza & Envanter",
      "`/mc shop list|buy|sell`, `/mc inv show`",
      "### Kasalar",
      "`/mc case list|info|open` — **çok sayıda kasa**, EV/olasılık önizleme",
      "### Kumar",
      "`/mc gamble coinflip|slots`",
      "### Borsa",
      "`/market list|info|buy|sell|portfolio|leaderboard`",
      "### Sıralama",
      "`/mc stats rich|level` (klasik), `/market leaderboard` (toplam varlık)"
    ].join("\n"));

  await interaction.editReply({ embeds: [embed] });
}
