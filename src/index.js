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

import * as ping from "./commands/ping.js";
import * as help from "./commands/help.js";

const {
  DISCORD_TOKEN,
  CLIENT_ID,
  GUILD_ID,
  PORT = 3000
} = process.env;

// --- Basit health endpoint (Render için) ---
const app = express();
app.get("/", (_req, res) => res.send("OK"));
app.listen(PORT, () => console.log("Health on", PORT));

// --- Slash komutları listesi ---
const commands = [ping.data.toJSON(), help.data.toJSON()];

// --- Komutlar Discord'a kaydediliyor ---
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
    // aşağıdakiler opsiyonel kullanımına göre:
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

// Komut çalıştırma map'i
client.commands = new Collection();
client.commands.set(ping.data.name, ping);
client.commands.set(help.data.name, help);

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
    const reply = { content: "Komutta hata oluştu.", ephemeral: true };
    if (interaction.deferred || interaction.replied) {
      await interaction.followUp(reply);
    } else {
      await interaction.reply(reply);
    }
  }
});

client.login(DISCORD_TOKEN);
