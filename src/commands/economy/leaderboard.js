import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import { topUsers } from "../../data/store.js";
import { fmt } from "../../economy/economy.js";

export const data = new SlashCommandBuilder()
  .setName("leaderboard")
  .setDescription("En zengin 10 kullanıcı.");

export const cooldownMs = 5000;

export async function execute(interaction) {
  const top = await topUsers(10);
  if (!top.length) return interaction.reply("Henüz kimsenin cüzdanı yok.");

  const lines = await Promise.all(top.map(async (u, i) => {
    // Kullanıcı adı çekmeye çalış (cache’de varsa)
    const user = await interaction.client.users.fetch(u.id).catch(() => null);
    const tag = user ? user.tag : `Kullanıcı ${u.id}`;
    return `**${i+1}.** ${tag} — ${fmt(u.coins)}`;
  }));

  const emb = new EmbedBuilder()
    .setTitle("💰 Metacoin — Zenginler Listesi")
    .setDescription(lines.join("\n"))
    .setTimestamp();

  await interaction.reply({ embeds: [emb] });
}
