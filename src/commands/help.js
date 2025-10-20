import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import fs from "fs";
import path from "path";

export const data = new SlashCommandBuilder()
  .setName("help")
  .setDescription("Tüm komutları listeler.");

export const cooldownMs = 3000;

export async function execute(interaction) {
  const commandsPath = path.join(process.cwd(), "src", "commands");
  let allCommands = [];

  function readCommands(dir) {
    const files = fs.readdirSync(dir);
    for (const file of files) {
      const fullPath = path.join(dir, file);
      const stat = fs.statSync(fullPath);
      if (stat.isDirectory()) {
        readCommands(fullPath);
      } else if (file.endsWith(".js")) {
        allCommands.push(file.replace(".js", ""));
      }
    }
  }

  readCommands(commandsPath);

  const emb = new EmbedBuilder()
    .setTitle("📘 Metavis1on Bot — Yardım Menüsü")
    .setDescription("Tüm kullanılabilir komutlar aşağıda listelenmiştir:")
    .addFields(
      { name: "⚙️ Temel Komutlar", value: "`/help`, `/ping`" },
      { name: "💰 Ekonomi Komutları", value: "`/balance`, `/daily`, `/work`, `/mine`, `/bet`, `/give`, `/leaderboard`" }
    )
    .setFooter({ text: "Metacoin v1.0 — Metavis1on Ekonomisi" })
    .setTimestamp();

  await interaction.reply({ embeds: [emb], ephemeral: false });
}
