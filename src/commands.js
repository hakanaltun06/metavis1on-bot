import {
  SlashCommandBuilder,
  EmbedBuilder,
} from "discord.js";
import {
  addCoins, getUser, getInventory, doDaily, doWork, doBeg, doCrime,
  deposit, withdraw, transferCoins, coinflip, slots,
  buyCrate, openCrate, sellItem, CRATES, SELL_VALUES,
  networthOf, getTopBy, setBio, checkCooldown, COOLDOWNS
} from "./economy.js";

export const COMMANDS_VERSION = "1.0.0";

// ---- Slash Tanımları ----
const data = [];

// /help
const help = new SlashCommandBuilder()
  .setName("help")
  .setDescription("MetaCoin komut yardım listesi");

// /balance [user]
const balance = new SlashCommandBuilder()
  .setName("balance")
  .setDescription("Cüzdan ve banka bakiyeni gösterir.")
  .addUserOption(o => o.setName("kullanici").setDescription("Birini kontrol et").setRequired(false));

// bank
const depositCmd = new SlashCommandBuilder()
  .setName("deposit")
  .setDescription("Bankaya para yatır.")
  .addStringOption(o => o.setName("miktar").setDescription("Sayı veya 'all'").setRequired(true));

const withdrawCmd = new SlashCommandBuilder()
  .setName("withdraw")
  .setDescription("Bankadan para çek.")
  .addStringOption(o => o.setName("miktar").setDescription("Sayı veya 'all'").setRequired(true));

// pay
const pay = new SlashCommandBuilder()
  .setName("pay")
  .setDescription("Birine para gönder.")
  .addUserOption(o => o.setName("hedef").setDescription("Kime?").setRequired(true))
  .addIntegerOption(o => o.setName("miktar").setDescription("Kaç MC?").setRequired(true));

// gelir
const daily = new SlashCommandBuilder().setName("daily").setDescription("Günlük ödül al (20 saat).");
const work = new SlashCommandBuilder().setName("work").setDescription("Çalış ve para kazan (30 dk).");
const beg = new SlashCommandBuilder().setName("beg").setDescription("Dilencilik (2 dk).");
const crime = new SlashCommandBuilder().setName("crime").setDescription("Suç işle, riskli ama getirisi olabilir (10 dk).");

// kumar
const bet = new SlashCommandBuilder()
  .setName("bet")
  .setDescription("Yazı tura (coinflip).")
  .addStringOption(o =>
    o.setName("taraf").setDescription("heads/tails").addChoices(
      { name: "heads", value: "heads" },
      { name: "tails", value: "tails" }
    ).setRequired(true)
  )
  .addIntegerOption(o => o.setName("miktar").setDescription("Bahis miktarı").setRequired(true));

const slotsCmd = new SlashCommandBuilder()
  .setName("slots")
  .setDescription("Slot makinesi.")
  .addIntegerOption(o => o.setName("miktar").setDescription("Bahis miktarı").setRequired(true));

// shop & envanter & kasa
const shop = new SlashCommandBuilder().setName("shop").setDescription("Mağazayı görüntüle (kasalar).");
const buy = new SlashCommandBuilder()
  .setName("buy")
  .setDescription("Kasa satın al.")
  .addStringOption(o =>
    o.setName("kasa").setDescription("Kasa türü").addChoices(
      { name: "basic", value: "basic" },
      { name: "rare", value: "rare" },
      { name: "epic", value: "epic" },
      { name: "legendary", value: "legendary" }
    ).setRequired(true)
  )
  .addIntegerOption(o => o.setName("adet").setDescription("Kaç tane?").setRequired(true));

const inventory = new SlashCommandBuilder().setName("inventory").setDescription("Envanterini göster.");

const open = new SlashCommandBuilder()
  .setName("open")
  .setDescription("Kasa aç.")
  .addStringOption(o =>
    o.setName("kasa").setDescription("basic/rare/epic/legendary").addChoices(
      { name: "basic", value: "basic" },
      { name: "rare", value: "rare" },
      { name: "epic", value: "epic" },
      { name: "legendary", value: "legendary" }
    ).setRequired(true)
  )
  .addIntegerOption(o => o.setName("adet").setDescription("Kaç tane?").setRequired(true));

const sell = new SlashCommandBuilder()
  .setName("sell")
  .setDescription("Eşya sat.")
  .addStringOption(o => o.setName("item").setDescription("Eşya adı").setRequired(true))
  .addIntegerOption(o => o.setName("adet").setDescription("Kaç adet?").setRequired(true));

// leaderboard
const leaderboard = new SlashCommandBuilder()
  .setName("leaderboard")
  .setDescription("Liderlik tablosu")
  .addStringOption(o =>
    o.setName("tur").setDescription("wallet/bank/networth").addChoices(
      { name: "wallet", value: "wallet" },
      { name: "bank", value: "bank" },
      { name: "networth", value: "networth" }
    ).setRequired(true)
  );

// profile & cooldowns
const profile = new SlashCommandBuilder()
  .setName("profile")
  .setDescription("Profil ayarları")
  .addSubcommand(s =>
    s.setName("setbio")
     .setDescription("Biyografi ayarla")
     .addStringOption(o => o.setName("metin").setDescription("Maks 180 karakter").setRequired(true))
  );

const cooldowns = new SlashCommandBuilder().setName("cooldowns").setDescription("Komut bekleme sürelerini göster.");

// diziye ekle
data.push(
  help, balance, depositCmd, withdrawCmd, pay,
  daily, work, beg, crime,
  bet, slotsCmd,
  shop, buy, inventory, open, sell,
  leaderboard, profile, cooldowns
);

export const allSlashCommandData = data.map(d => d.toJSON());

// ---- Interaction Handler ----
function embedBase() {
  return new EmbedBuilder().setColor(0x00c2ff).setFooter({ text: "MetaCoin • metavis1on" });
}
function fmtMC(n) { return `${n.toLocaleString("tr-TR")} MC`; }

function msToHuman(ms) {
  const s = Math.ceil(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sc = s % 60;
  const parts = [];
  if (h) parts.push(`${h} sa`);
  if (m) parts.push(`${m} dk`);
  if (sc && !h) parts.push(`${sc} sn`);
  return parts.join(" ") || "az kaldı";
}

export async function handleInteraction(interaction) {
  const { commandName } = interaction;

  if (commandName === "help") {
    const e = embedBase()
      .setTitle("MetaCoin Yardım")
      .setDescription([
        "💰 **Ekonomi**: `/balance`, `/deposit`, `/withdraw`, `/pay`",
        "⚒️ **Gelir**: `/daily`, `/work`, `/beg`, `/crime`",
        "🎰 **Kumar**: `/bet`, `/slots`",
        "📦 **Kasa**: `/shop`, `/buy`, `/open`, `/inventory`, `/sell`",
        "🏆 **Liderlik**: `/leaderboard`",
        "👤 **Profil**: `/profile setbio`, `/cooldowns`"
      ].join("\n"))
      .addFields(
        { name: "İpucu", value: "Kasalardan çıkan parçaları `/sell` ile MC’ye çevirebilirsin." },
        { name: "Sürüm", value: COMMANDS_VERSION, inline: true }
      );
    return interaction.reply({ embeds: [e], ephemeral: true });
  }

  if (commandName === "balance") {
    const user = interaction.options.getUser("kullanici") || interaction.user;
    const u = getUser(user.id);
    const net = networthOf(user.id);
    const e = embedBase()
      .setTitle(`Bakiye — ${user.username}`)
      .addFields(
        { name: "Cüzdan", value: fmtMC(u.wallet), inline: true },
        { name: "Banka", value: `${fmtMC(u.bank)} / ${fmtMC(u.bank_max)}`, inline: true },
        { name: "Net Değer", value: fmtMC(net), inline: true }
      );
    return interaction.reply({ embeds: [e] });
  }

  if (commandName === "deposit") {
    const val = interaction.options.getString("miktar");
    try {
      const amt = isNaN(Number(val)) && val !== "all" ? null : (val === "all" ? "all" : Number(val));
      if (amt === null) throw new Error("Miktar sayı olmalı veya 'all' yazılmalı.");
      const placed = deposit(interaction.user.id, amt);
      return interaction.reply({ content: `Bankaya **${fmtMC(placed)}** yatırıldı.` });
    } catch (e) {
      return interaction.reply({ content: `❌ ${e.message}`, ephemeral: true });
    }
  }

  if (commandName === "withdraw") {
    const val = interaction.options.getString("miktar");
    try {
      const amt = isNaN(Number(val)) && val !== "all" ? null : (val === "all" ? "all" : Number(val));
      if (amt === null) throw new Error("Miktar sayı olmalı veya 'all' yazılmalı.");
      const got = withdraw(interaction.user.id, amt);
      return interaction.reply({ content: `Bankadan **${fmtMC(got)}** çekildi.` });
    } catch (e) {
      return interaction.reply({ content: `❌ ${e.message}`, ephemeral: true });
    }
  }

  if (commandName === "pay") {
    const target = interaction.options.getUser("hedef");
    const amount = interaction.options.getInteger("miktar");
    if (target.bot || target.id === interaction.user.id) {
      return interaction.reply({ content: "Kendine veya bota para gönderemezsin.", ephemeral: true });
    }
    try {
      transferCoins(interaction.user.id, target.id, amount);
      return interaction.reply({ content: `**${interaction.user.username}** → **${target.username}**: ${fmtMC(amount)}` });
    } catch (e) {
      return interaction.reply({ content: `❌ ${e.message}`, ephemeral: true });
    }
  }

  if (commandName === "daily") {
    const r = doDaily(interaction.user.id);
    if (!r.ok) {
      return interaction.reply({ content: `⏳ Daily için bekleme: **${msToHuman(r.left)}**`, ephemeral: true });
    }
    return interaction.reply({ content: `🎁 Günlük ödül: **${fmtMC(r.bonus)}**` });
  }

  if (commandName === "work") {
    const r = doWork(interaction.user.id);
    if (!r.ok) return interaction.reply({ content: `⏳ Çalışmak için bekleme: **${msToHuman(r.left)}**`, ephemeral: true });
    return interaction.reply({ content: `🛠️ Çalıştın ve **${fmtMC(r.earned)}** kazandın.` });
  }

  if (commandName === "beg") {
    const r = doBeg(interaction.user.id);
    if (!r.ok) return interaction.reply({ content: `⏳ Bekleme: **${msToHuman(r.left)}**`, ephemeral: true });
    if (r.earned === 0) return interaction.reply({ content: "🤷 Kimse bir şey vermedi..." });
    return interaction.reply({ content: `🙏 Birisi acıdı ve **${fmtMC(r.earned)}** verdi.` });
  }

  if (commandName === "crime") {
    const r = doCrime(interaction.user.id);
    if (!r.ok && r.left) return interaction.reply({ content: `⏳ Bekleme: **${msToHuman(r.left)}**`, ephemeral: true });
    if (r.ok) return interaction.reply({ content: `🕶️ Vurgun yaptın! **${fmtMC(r.gain)}** kazandın.` });
    return interaction.reply({ content: `🚨 Yakalandın! **${fmtMC(r.loss)}** ceza ödedin.` });
  }

  if (commandName === "bet") {
    const side = interaction.options.getString("taraf");
    const amount = interaction.options.getInteger("miktar");
    try {
      const r = coinflip(interaction.user.id, side, amount);
      return interaction.reply({ content: `🪙 Atılan: **${r.flip}** • Sonuç: **${r.win ? "Kazandın" : "Kaybettin"}** (${fmtMC(r.delta)})` });
    } catch (e) {
      return interaction.reply({ content: `❌ ${e.message}`, ephemeral: true });
    }
  }

  if (commandName === "slots") {
    const amount = interaction.options.getInteger("miktar");
    try {
      const r = slots(interaction.user.id, amount);
      return interaction.reply({ content: `🎰 ${r.reels.join(" | ")} • Sonuç: ${r.delta >= 0 ? `Kazanç **${fmtMC(r.delta)}**` : `Kayıp **${fmtMC(Math.abs(r.delta))}**`}` });
    } catch (e) {
      return interaction.reply({ content: `❌ ${e.message}`, ephemeral: true });
    }
  }

  if (commandName === "shop") {
    const e = embedBase()
      .setTitle("🛒 Mağaza — Kasalar")
      .setDescription("`/buy kasa:<tür> adet:<n>` komutuyla satın alabilirsin.")
      .addFields(
        { name: "basic", value: `${fmtMC(CRATES.basic.price)} — başlangıç kasası`, inline: true },
        { name: "rare", value: `${fmtMC(CRATES.rare.price)} — nadir yağma`, inline: true },
        { name: "epic", value: `${fmtMC(CRATES.epic.price)} — epik ödüller`, inline: true },
        { name: "legendary", value: `${fmtMC(CRATES.legendary.price)} — efsanevi ganimet`, inline: true }
      );
    return interaction.reply({ embeds: [e] });
  }

  if (commandName === "buy") {
    const type = interaction.options.getString("kasa");
    const count = interaction.options.getInteger("adet");
    try {
      const r = buyCrate(interaction.user.id, type, count);
      return interaction.reply({ content: `🧰 **${type}** kasasından **${r.count}** adet aldın. Harcanan: **${fmtMC(r.spent)}**` });
    } catch (e) {
      return interaction.reply({ content: `❌ ${e.message}`, ephemeral: true });
    }
  }

  if (commandName === "inventory") {
    const inv = getInventory(interaction.user.id);
    const u = getUser(interaction.user.id);
    const crates = inv.filter(i => i.item.endsWith("crate"));
    const items = inv.filter(i => !i.item.endsWith("crate"));
    const lines1 = crates.length ? crates.map(i => `• ${i.item}: x${i.qty}`).join("\n") : "—";
    const lines2 = items.length ? items.map(i => `• ${i.item}: x${i.qty}`).join("\n") : "—";
    const e = embedBase()
      .setTitle(`🎒 Envanter — ${interaction.user.username}`)
      .addFields(
        { name: "Kasalar", value: lines1 },
        { name: "Eşyalar", value: lines2 },
        { name: "Cüzdan", value: fmtMC(u.wallet), inline: true },
        { name: "Banka", value: fmtMC(u.bank), inline: true }
      );
    return interaction.reply({ embeds: [e] });
  }

  if (commandName === "open") {
    const type = interaction.options.getString("kasa");
    const count = interaction.options.getInteger("adet");
    try {
      const r = openCrate(interaction.user.id, type, count);
      const summary = r.map((x, i) =>
        x.type === "coins" ? `#${i+1} • ${fmtMC(x.amount)}` : `#${i+1} • ${x.item} x${x.qty}`
      ).join("\n");
      return interaction.reply({ content: `📦 Açılan **${count}× ${type}**:\n${summary}` });
    } catch (e) {
      return interaction.reply({ content: `❌ ${e.message}`, ephemeral: true });
    }
  }

  if (commandName === "sell") {
    const item = interaction.options.getString("item");
    const qty = interaction.options.getInteger("adet");
    if (!SELL_VALUES[item]) {
      return interaction.reply({ content: "Bu eşya satılamıyor ya da adı yanlış.", ephemeral: true });
    }
    try {
      const gain = sellItem(interaction.user.id, item, qty);
      return interaction.reply({ content: `💱 Satıldı: **${item} x${qty}** → **${fmtMC(gain)}**` });
    } catch (e) {
      return interaction.reply({ content: `❌ ${e.message}`, ephemeral: true });
    }
  }

  if (commandName === "leaderboard") {
    const type = interaction.options.getString("tur");
    let rows;
    if (type === "networth") {
      // networth hesaplayarak ilk 10
      // Not: basit yöntem — ilk 50 wallet sıralamasından bakıp networth hesaplanır
      const tops = getTopBy("wallet", 50);
      rows = tops.map(r => ({ user_id: r.user_id, net: networthOf(r.user_id) }))
                 .sort((a,b) => b.net - a.net)
                 .slice(0, 10);
      const lines = rows.map((r, i) => `**${i+1}.** <@${r.user_id}> — ${fmtMC(r.net)}`).join("\n");
      return interaction.reply({ embeds: [embedBase().setTitle("🏆 Networth Top 10").setDescription(lines || "—")] });
    } else {
      rows = getTopBy(type, 10);
      const lines = rows.map((r, i) => {
        const val = type === "wallet" ? r.wallet : r.bank;
        return `**${i+1}.** <@${r.user_id}> — ${fmtMC(val)}`;
      }).join("\n");
      return interaction.reply({ embeds: [embedBase().setTitle(`🏆 ${type} Top 10`).setDescription(lines || "—")] });
    }
  }

  if (commandName === "profile") {
    const sub = interaction.options.getSubcommand();
    if (sub === "setbio") {
      const text = interaction.options.getString("metin").slice(0, 180);
      setBio(interaction.user.id, text);
      return interaction.reply({ content: "✅ Biyografi güncellendi." });
    }
  }

  if (commandName === "cooldowns") {
    const lefts = Object.keys(COOLDOWNS).map(k => {
      const left = checkCooldown(interaction.user.id, k);
      return `• ${k}: ${left > 0 ? msToHuman(left) : "hazır"}`;
    }).join("\n");
    return interaction.reply({ content: `⏱️ Cooldowns:\n${lefts}`, ephemeral: true });
  }
}
