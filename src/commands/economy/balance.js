import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import { getUser } from "../../data/store.js";
import { COIN, fmt } from "../../economy/economy.js";

export const data = new SlashCommandBuilder()
  .setName("balance")
  .setDescription("Bakiyeni veya bir başkasının bakiyesini gösterir.")
  .addUserOption(o => o.setName("user").setDescription("Kime bakalım?"));

export const cooldownMs = 3000;

export async function execute(interaction) {
  const target = interaction.options.getUser("user") || interaction.user;
  const u = await getUser(target.id);

  const emb = new EmbedBuilder()
    .setTitle(`${target.tag} — Cüzdan`)
    .addFields(
      { name: "Bakiye", value: fmt(u.coins), inline: true },
      { name: "Toplam Kazanç", value: fmt(u.totalEarned), inline: true },
      { name: "Toplam Harcama", value: fmt(u.totalSpent), inline: true }
    )
    .setFooter({ text: "Metacoin v1.0" })
    .setTimestamp();

  await interaction.reply({ embeds: [emb] });
}
