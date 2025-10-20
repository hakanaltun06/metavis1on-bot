import { SlashCommandBuilder } from "discord.js";
import { transferCoins, getUser } from "../../data/store.js";
import { fmt } from "../../economy/economy.js";

export const data = new SlashCommandBuilder()
  .setName("give")
  .setDescription("Bir kullanıcıya Metacoin gönder.")
  .addUserOption(o => o.setName("user").setDescription("Kime?").setRequired(true))
  .addIntegerOption(o => o.setName("amount").setDescription("Miktar").setRequired(true));

export const cooldownMs = 4000;

export async function execute(interaction) {
  const fromId = interaction.user.id;
  const toUser = interaction.options.getUser("user");
  const amount = interaction.options.getInteger("amount");

  if (toUser.bot) return interaction.reply({ content: "Botlara coin gönderemezsin.", ephemeral: true });
  if (toUser.id === fromId) return interaction.reply({ content: "Kendine coin gönderemezsin.", ephemeral: true });
  if (amount <= 0) return interaction.reply({ content: "Miktar 0'dan büyük olmalı.", ephemeral: true });

  const fromData = await getUser(fromId);
  if (fromData.coins < amount) return interaction.reply({ content: "Yetersiz bakiye.", ephemeral: true });

  await transferCoins(fromId, toUser.id, amount);
  return interaction.reply(`💸 **${interaction.user.tag}** → **${toUser.tag}**: **${fmt(amount)}**`);
}
