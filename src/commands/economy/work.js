import { SlashCommandBuilder } from "discord.js";
import { getUser, setUser, addCoins } from "../../data/store.js";
import { cooldowns, ranges, randIn, fmt, remainMsText } from "../../economy/economy.js";

const jobs = [
  "Siber güvenlik raporu yazdın",
  "Moderatörlük yaptın",
  "Sunucu optimizasyonu yaptın",
  "Metavis1on destek bileti çözdün",
  "Grafik arayüz cilaladın",
  "Veri analizi yaptın"
];

export const data = new SlashCommandBuilder()
  .setName("work")
  .setDescription("Çalış ve para kazan (1 saatte bir).");

export const cooldownMs = 5000;

export async function execute(interaction) {
  const id = interaction.user.id;
  const u = await getUser(id);
  const now = Date.now();
  const diff = now - (u.lastWork || 0);

  if (diff < cooldowns.work) {
    const remain = cooldowns.work - diff;
    return interaction.reply({ content: `Çalışma molası. Kalan: **${remainMsText(remain)}**`, ephemeral: true });
  }

  const reward = randIn(ranges.work);
  u.lastWork = now;
  await setUser(id, u);
  await addCoins(id, reward);

  const job = jobs[Math.floor(Math.random() * jobs.length)];
  return interaction.reply(`👷 ${job} → **${fmt(reward)}** kazandın.`);
}
