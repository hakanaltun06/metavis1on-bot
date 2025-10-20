import "dotenv/config";
import { REST, Routes } from "discord.js";
import * as ping from "./commands/ping.js";
import * as help from "./commands/help.js";
import * as mc from "./commands/mc.js";

const { DISCORD_TOKEN, CLIENT_ID, GUILD_ID } = process.env;
if (!DISCORD_TOKEN || !CLIENT_ID) {
  console.error("❌ DISCORD_TOKEN veya CLIENT_ID eksik.");
  process.exit(1);
}

const rest = new REST({ version: "10" }).setToken(DISCORD_TOKEN);
const commands = [ping.data, help.data, mc.data].map((c) => c.toJSON());

try {
  if (GUILD_ID) {
    await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: commands });
    console.log("✅ Guild komutları kaydedildi.");
  } else {
    await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
    console.log("✅ Global komutlar kaydedildi.");
  }
} catch (e) {
  console.error("Komut kayıt hatası:", e);
  process.exit(1);
}
