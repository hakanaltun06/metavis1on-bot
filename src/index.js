import "dotenv/config";
import express from "express";
import {
  Client,
  GatewayIntentBits,
  Collection,
  Events,
  REST,
  Routes
} from "discord.js";

// --- Komutlar (temel + ekonomi) ---
import * as ping from "./commands/ping.js";
import * as help from "./commands/help.js";
import * as balance from "./commands/economy/balance.js";
import * as daily from "./commands/economy/daily.js";
import * as work from "./commands/economy/work.js";
import * as mine from "./commands/economy/mine.js";
import * as bet from "./commands/economy/bet.js";
import * as give from "./commands/economy/give.js";
import * as leaderboard from "./commands/economy/leaderboard.js";

const {
  DISCORD_TOKEN,
  CLIENT_ID,
  GUILD_ID,
  PORT = 3000
} = process.env;

// --- Health check (Render için) ---
const app = express();
app.get("/", (_req, res) => res.send("OK"));
app.listen(PORT, () => console.log("Health on", PORT));

// --- Slash komutları listesi ---
const commands = [
  ping.data.toJSON(),
  help.data.toJSON(),
  balance.data.toJSON(),
  daily.data.toJSON(),
  work.data.toJSON(),
  mine.data.toJSON(),
  bet.data.toJSON(),
  give.data.toJSON(),
  leaderboard.data.toJSON()
];

// --- Komutları Discord'a kaydet ---
async function registerCommands() {
  if (!CLIENT_ID) {
    console.warn("⚠️ CLIENT_ID boş: Komut kayıt atlanıyor.");
    return;
  }
  const rest = new REST({ version: "10" }).setToken(DISCORD_TOKEN);
  try {
    console.log("⏳ Slash komutları yükleniyor...");
    if (GUILD_ID) {
      await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), {
        body: commands
      });
      console.log("✅ Guild komutları yüklendi (anında).");
    } else {
      await rest.put(Routes.applicationCommands(CLIENT_ID), {
        body: commands
      });
      console.log("✅ Global komutlar yüklendi (yayılması biraz sürebilir).");
    }
  } catch (err) {
    console.error("❌ Komut kayıt hatası:", err);
  }
}

// --- Discord client ---
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

// --- Komut koleksiyonu ---
client.commands = new Collection();
client.commands.set(ping.data.name, ping);
client.commands.set(help.data.name, help);
client.commands.set(balance.data.name, balance);
client.commands.set(daily.data.name, daily);
client.commands.set(work.data.name, work);
client.commands.set(mine.data.name, mine);
client.commands.set(bet.data.name, bet);
client.commands.set(give.data.name, give);
client.commands.set(leaderboard.data.name, leaderboard);

client.once(Events.ClientReady, async (c) => {
  console.log(`✅ Giriş yapıldı: ${c.user.tag}`);
  await registerCommands();
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  const cmd = client.commands.get(interaction.commandName);
  if (!cmd) return;
  try {
    await cmd.execute(interaction);
  } catch (err) {
    console.error(err);
    const reply = { content: "❌ Komut çalıştırılırken hata oluştu.", ephemeral: true };
    if (interaction.deferred || interaction.replied) {
      await interaction.followUp(reply);
    } else {
      await interaction.reply(reply);
    }
  }
});

client.login(DISCORD_TOKEN);
