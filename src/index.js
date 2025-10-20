import "dotenv/config";
import express from "express";
import { Client, GatewayIntentBits, REST, Routes, Collection, Events } from "discord.js";
import { allSlashCommandData, handleInteraction, COMMANDS_VERSION } from "./commands.js";
import { ensureDatabase } from "./db.js";

const {
  DISCORD_TOKEN,
  CLIENT_ID,
  GUILD_ID,
  PORT = 3000,
  REGISTER_COMMANDS = "false"
} = process.env;

if (!DISCORD_TOKEN || !CLIENT_ID) {
  console.error("HATA: DISCORD_TOKEN ve CLIENT_ID zorunludur. .env dosyanızı kontrol edin.");
  process.exit(1);
}

// --- Express (Render health) ---
const app = express();
app.get("/", (_req, res) => res.status(200).send(`MetaCoin OK • v${COMMANDS_VERSION}`));
app.listen(PORT, () => console.log(`[META] Health endpoint aktif :${PORT}`));

// --- Discord Client ---
const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

client.commands = new Collection();

// Komutları kaydet
async function registerSlash() {
  const rest = new REST({ version: "10" }).setToken(DISCORD_TOKEN);

  try {
    if (GUILD_ID) {
      // İsterseniz hızlı test için guild bazlı kayıt
      await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), {
        body: allSlashCommandData
      });
      console.log(`[META] Guild(${GUILD_ID}) komutları kaydedildi. (${allSlashCommandData.length})`);
    } else {
      await rest.put(Routes.applicationCommands(CLIENT_ID), { body: allSlashCommandData });
      console.log(`[META] Global komutlar kaydedildi. (${allSlashCommandData.length})`);
      console.log("Global komutların görünmesi birkaç dakika sürebilir.");
    }
  } catch (err) {
    console.error("[META] Komut kayıt hatası:", err);
  }
}

// Bot hazır olduğunda
client.once(Events.ClientReady, async (c) => {
  console.log(`[META] ${c.user.tag} olarak giriş yapıldı.`);
  ensureDatabase(); // tablo kurulumları

  if (REGISTER_COMMANDS === "true") {
    await registerSlash();
  }
});

// Etkileşim yakalama
client.on(Events.InteractionCreate, async (interaction) => {
  try {
    if (!interaction.isChatInputCommand()) return;
    await handleInteraction(interaction);
  } catch (err) {
    console.error("[META] Interaction hatası:", err);
    if (interaction.deferred || interaction.replied) {
      await interaction.followUp({ content: "Bir hata oluştu. Lütfen tekrar deneyin.", ephemeral: true }).catch(()=>{});
    } else {
      await interaction.reply({ content: "Bir hata oluştu. Lütfen tekrar deneyin.", ephemeral: true }).catch(()=>{});
    }
  }
});

client.login(DISCORD_TOKEN);
