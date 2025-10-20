import "dotenv/config";
import express from "express";
import { Client, GatewayIntentBits, Collection, Events, MessageFlags } from "discord.js";
import * as ping from "./commands/ping.js";
import * as help from "./commands/help.js";
import * as mc from "./commands/mc.js";
import * as market from "./commands/market.js";
import { ensureDatabase } from "./lib/db.js";
import { initCooldownSweeper } from "./lib/cooldown.js";

const { DISCORD_TOKEN, PORT = 3000 } = process.env;
if (!DISCORD_TOKEN) {
  console.error("❌ DISCORD_TOKEN eksik.");
  process.exit(1);
}

// Health endpoint (Render)
const app = express();
app.get("/", (_req, res) => res.send("MetaCoin OK"));
app.listen(PORT, () => console.log(`🌐 Health port ${PORT}`));

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.commands = new Collection();
[ping, help, mc, market].forEach(cmd => client.commands.set(cmd.data.name, cmd));

await ensureDatabase();
initCooldownSweeper();

client.once(Events.ClientReady, (c) => {
  console.log(`✅ Giriş yapıldı: ${c.user.tag}`);
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  const command = client.commands.get(interaction.commandName);
  if (!command) return;

  try {
    await command.execute(interaction);
  } catch (err) {
    console.error("Komut hatası:", err);

    // Unknown/expired interaction ise sessiz düş
    if (err?.code === 10062) return;

    try {
      if (interaction.deferred) {
        await interaction.editReply({ content: "❌ Komut çalışırken bir hata oluştu." });
      } else if (!interaction.replied) {
        await interaction.reply({ content: "❌ Komut çalışırken bir hata oluştu.", flags: MessageFlags.Ephemeral });
      }
    } catch (e2) {
      if (e2?.code !== 10062) console.error("Hata yanıtı atılamadı:", e2);
    }
  }
});

client.login(DISCORD_TOKEN);
