import { SlashCommandBuilder } from "discord.js";
import { getUser, addCoins } from "../../data/store.js";
import { fmt } from "../../economy/economy.js";

export const data = new SlashCommandBuilder()
  .setName("bet")
  .setDescription("Bahis oyna: %50 şans (kazanırsan 2x).")
  .addIntegerOption(o => o.setName("amount").setDescription("Bahis miktarı").setRequired(true));

export const cooldownMs = 4000;

export async function execute(interaction) {
  const id = interaction.user.id;
  const amount = interaction.options.getInteger("amount");

  if (amount <= 0) {
    return interaction.reply({ content: "Miktar 0'dan büyük olmalı.", ephemeral: true });
  }

  const u = await getUser(id);
  if (u.coins < amount) {
    return interaction.reply({ content: `Yetersiz bakiye. Mevcut: ${fmt(u.coins)}`, ephemeral: true });
  }

  const win = Math.random() < 0.5;
  if (win) {
    await addCoins(id, amount); // net +amount → toplam 2x (çünkü önce düşürmedik)
    return interaction.reply(`🎲 Kazandın! +${fmt(amount)} → Yeni bakiye: **${fmt((u.coins + amount))}**`);
  } else {
    await addCoins(id, -amount);
    return interaction.reply(`🎲 Kaybettin. -${fmt(amount)} → Yeni bakiye: **${fmt((u.coins - amount))}**`);
  }
}
