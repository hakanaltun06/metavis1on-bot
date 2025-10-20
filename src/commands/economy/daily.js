import { SlashCommandBuilder } from "discord.js";
import { getUser, setUser, addCoins } from "../../data/store.js";
import { cooldowns, ranges, randIn, fmt, remainMsText } from "../../economy/economy.js";

export const data = new SlashCommandBuilder()
  .setName("daily")
  .setDescription("Günlük ödülünü al (24 saatte bir).");

export const cooldownMs = 5000;

export async function execute(interaction) {
  const id = interaction.user.id;
  const u = await getUser(id);
  const now = Date.now();
  const diff = now - (u.lastDaily || 0);

  if (diff < cooldowns.daily) {
    const remain = cooldowns.daily - diff;
    return interaction.reply({ content: `Günlük ödülü zaten aldın. Kalan: **${remainMsText(remain)}**`, ephemeral: true });
  }

  const reward = randIn(ranges.daily);
  u.lastDaily = now;
  await setUser(id, u);
  await addCoins(id, reward);

  return interaction.reply(`Günlük ödül: **${fmt(reward)}** 🎁`);
}
