import { SlashCommandBuilder } from "discord.js";
import { getUser, setUser, addCoins } from "../../data/store.js";
import { cooldowns, ranges, randIn, fmt, remainMsText } from "../../economy/economy.js";

export const data = new SlashCommandBuilder()
  .setName("mine")
  .setDescription("Madene in; risk al, kazan ya da kaybet (10 dk).");

export const cooldownMs = 4000;

export async function execute(interaction) {
  const id = interaction.user.id;
  const u = await getUser(id);
  const now = Date.now();
  const diff = now - (u.lastMine || 0);

  if (diff < cooldowns.mine) {
    const remain = cooldowns.mine - diff;
    return interaction.reply({ content: `Madene girmeden önce beklemelisin. Kalan: **${remainMsText(remain)}**`, ephemeral: true });
  }

  u.lastMine = now;
  await setUser(id, u);

  // %55 kazanma, %45 kaybetme
  const win = Math.random() < 0.55;
  if (win) {
    const gain = randIn(ranges.mineWin);
    await addCoins(id, gain);
    return interaction.reply(`⛏️ Maden: Şanslı günün! **${fmt(gain)}** buldun.`);
  } else {
    const lose = randIn(ranges.mineLose);
    await addCoins(id, -lose);
    return interaction.reply(`💥 Maden çöktü! **-${fmt(lose)}** kaybettin.`);
  }
}
