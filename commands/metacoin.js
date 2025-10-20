import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import { canUse } from "../lib/cooldown.js";
import {
  getOrCreateUser, getUser, addBalance, addXP, setUserTimestamp,
  moveToBank, moveFromBank, transferBalance,
  getInventory, listShop, getItemById, addItem,
  listCases, getCase, buyCase, rollCaseReward,
  listPets, adoptPet, userPets, feedPet,
  analyzeCase, topRich, topLevels
} from "../lib/db.js";
import { coin, msToText } from "../lib/format.js";

export const data = new SlashCommandBuilder()
  .setName("mc")
  .setDescription("MetaCoin ana komutu")

  // ECONOMY
  .addSubcommandGroup(g =>
    g.setName("economy").setDescription("Ekonomi")
      .addSubcommand(s => s.setName("balance").setDescription("Bakiyeni göster"))
      .addSubcommand(s => s.setName("daily").setDescription("Günlük ödül (24s cooldown)"))
      .addSubcommand(s => s.setName("work").setDescription("Çalış ve para kazan (45dk cooldown)"))
      .addSubcommand(s => s.setName("beg").setDescription("Dilencilik yap (5dk cooldown, düşük ödül)"))
      .addSubcommand(s => s.setName("transfer")
        .setDescription("Başkasına para gönder")
        .addUserOption(o => o.setName("kime").setDescription("Alıcı").setRequired(true))
        .addIntegerOption(o => o.setName("miktar").setDescription("Miktar").setMinValue(1).setRequired(true)))
  )

  // BANK
  .addSubcommandGroup(g =>
    g.setName("bank").setDescription("Banka işlemleri")
      .addSubcommand(s => s.setName("deposit").setDescription("Bankaya yatır")
        .addIntegerOption(o => o.setName("miktar").setDescription("Miktar").setMinValue(1).setRequired(true)))
      .addSubcommand(s => s.setName("withdraw").setDescription("Bankadan çek")
        .addIntegerOption(o => o.setName("miktar").setDescription("Miktar").setMinValue(1).setRequired(true)))
  )

  // SHOP
  .addSubcommandGroup(g =>
    g.setName("shop").setDescription("Mağaza")
      .addSubcommand(s => s.setName("list").setDescription("Ürünleri listele"))
      .addSubcommand(s => s.setName("buy").setDescription("Satın al")
        .addStringOption(o => o.setName("item").setDescription("Ürün ID").setRequired(true))
        .addIntegerOption(o => o.setName("adet").setDescription("Adet").setMinValue(1)))
      .addSubcommand(s => s.setName("sell").setDescription("Sat (yarı fiyat)")
        .addStringOption(o => o.setName("item").setDescription("Ürün ID").setRequired(true))
        .addIntegerOption(o => o.setName("adet").setDescription("Adet").setMinValue(1)))
  )

  // INVENTORY
  .addSubcommandGroup(g =>
    g.setName("inv").setDescription("Envanter")
      .addSubcommand(s => s.setName("show").setDescription("Envanterini göster"))
  )

  // CASES
  .addSubcommandGroup(g =>
    g.setName("case").setDescription("Kasa sistemi")
      .addSubcommand(s => s.setName("list").setDescription("Kasaları listele"))
      .addSubcommand(s => s.setName("info").setDescription("Kasa bilgisi (olasılık & beklenen değer dahil)")
        .addStringOption(o => o.setName("id").setDescription("Kasa ID").setRequired(true)))
      .addSubcommand(s => s.setName("open").setDescription("Kasa aç")
        .addStringOption(o => o.setName("id").setDescription("Kasa ID").setRequired(true))
        .addIntegerOption(o => o.setName("adet").setDescription("Kaç tane?").setMinValue(1)))
  )

  // GAMBLE
  .addSubcommandGroup(g =>
    g.setName("gamble").setDescription("Şans oyunları")
      .addSubcommand(s => s.setName("coinflip").setDescription("Yazı-tura (50/50)")
        .addStringOption(o => o.setName("seçim").setDescription("yazı/tura").setRequired(true).addChoices(
          { name: "yazı", value: "yazı" }, { name: "tura", value: "tura" }
        ))
        .addIntegerOption(o => o.setName("bahis").setDescription("Bahis miktarı").setMinValue(1).setRequired(true)))
      .addSubcommand(s => s.setName("slots").setDescription("Slot makinesi (3x)")
        .addIntegerOption(o => o.setName("bahis").setDescription("Bahis miktarı").setMinValue(1).setRequired(true)))
  )

  // PETS
  .addSubcommandGroup(g =>
    g.setName("pet").setDescription("Evcil dostlar")
      .addSubcommand(s => s.setName("list").setDescription("Adopt edilebilir petler"))
      .addSubcommand(s => s.setName("adopt").setDescription("Pet sahiplen")
        .addStringOption(o => o.setName("id").setDescription("Pet ID").setRequired(true))
        .addStringOption(o => o.setName("isim").setDescription("Takma ad")))
      .addSubcommand(s => s.setName("info").setDescription("Sahip olduğun petleri göster"))
      .addSubcommand(s => s.setName("feed").setDescription("Pet'e kurabiye yedir (+5xp)")
        .addStringOption(o => o.setName("id").setDescription("Pet ID").setRequired(true)))
  )

  // STATS
  .addSubcommandGroup(g =>
    g.setName("stats").setDescription("Sıralamalar")
      .addSubcommand(s => s.setName("rich").setDescription("En zengin ilk 10"))
      .addSubcommand(s => s.setName("level").setDescription("En yüksek seviye ilk 10"))
  );

export async function execute(interaction) {
  const group = interaction.options.getSubcommandGroup();
  const sub = interaction.options.getSubcommand();
  const userId = interaction.user.id;

  getOrCreateUser(userId);

  /* -------- ECONOMY -------- */
  if (group === "economy") {
    if (sub === "balance") {
      const u = getUser(userId);
      const e = new EmbedBuilder()
        .setTitle("💼 Bakiye")
        .addFields(
          { name: "Cüzdan", value: coin(u.balance), inline: true },
          { name: "Banka", value: coin(u.bank), inline: true },
          { name: "Seviye", value: `Lv. ${u.level} (${u.xp}xp)`, inline: true }
        );
      return interaction.reply({ embeds: [e] });
    }

    if (sub === "daily") {
      const cd = canUse(userId, "daily", 24 * 60 * 60 * 1000);
      if (!cd.ok) return interaction.reply({ content: `🕒 Günlük için bekle: **${msToText(cd.remainMs)}**`, ephemeral: true });
      const reward = 350 + Math.floor(Math.random() * 200); // 350-549
      addBalance(userId, reward);
      addXP(userId, 20);
      setUserTimestamp(userId, "last_daily", Date.now());
      return interaction.reply(`🎁 Günlük ödül: ${coin(reward)}! +20xp`);
    }

    if (sub === "work") {
      const cd = canUse(userId, "work", 45 * 60 * 1000);
      if (!cd.ok) return interaction.reply({ content: `🕒 Çalışmak için bekle: **${msToText(cd.remainMs)}**`, ephemeral: true });
      const base = 220 + Math.floor(Math.random() * 160); // 220-379
      const inv = getInventory(userId);
      const hasVIP = inv.find(i => i.item_id === "vip" && i.qty > 0);
      const reward = Math.floor(base * (hasVIP ? 1.05 : 1));
      addBalance(userId, reward);
      addXP(userId, 25);
      setUserTimestamp(userId, "last_work", Date.now());
      return interaction.reply(`💼 Çalıştın ve ${coin(reward)} kazandın! ${hasVIP ? " (VIP +%5)" : ""} +25xp`);
    }

    if (sub === "beg") {
      const cd = canUse(userId, "beg", 5 * 60 * 1000);
      if (!cd.ok) return interaction.reply({ content: `🕒 Dilencilik için bekle: **${msToText(cd.remainMs)}**`, ephemeral: true });
      const reward = Math.random() < 0.25 ? 0 : 25 + Math.floor(Math.random() * 60);
      if (reward === 0) return interaction.reply("😶 Kimse para vermek istemedi.");
      addBalance(userId, reward);
      addXP(userId, 5);
      setUserTimestamp(userId, "last_beg", Date.now());
      return interaction.reply(`🤲 ${coin(reward)} kaptın! +5xp`);
    }

    if (sub === "transfer") {
      const to = interaction.options.getUser("kime", true);
      const amt = interaction.options.getInteger("miktar", true);
      if (to.bot) return interaction.reply({ content: "🤖 Bota transfer yok.", ephemeral: true });
      if (to.id === userId) return interaction.reply({ content: "Kendine transfer olmaz.", ephemeral: true });
      try {
        transferBalance(userId, to.id, amt);
        return interaction.reply(`🔁 ${to} kullanıcısına ${coin(amt)} gönderdin.`);
      } catch (e) {
        return interaction.reply({ content: `❌ ${e.message}`, ephemeral: true });
      }
    }
  }

  /* -------- BANK -------- */
  if (group === "bank") {
    const amt = interaction.options.getInteger("miktar", true);
    if (sub === "deposit") {
      try {
        moveToBank(userId, amt);
        return interaction.reply(`🏦 Bankaya yatırıldı: ${coin(amt)}`);
      } catch (e) {
        return interaction.reply({ content: `❌ ${e.message}`, ephemeral: true });
      }
    }
    if (sub === "withdraw") {
      try {
        moveFromBank(userId, amt);
        return interaction.reply(`🏧 Bankadan çekildi: ${coin(amt)}`);
      } catch (e) {
        return interaction.reply({ content: `❌ ${e.message}`, ephemeral: true });
      }
    }
  }

  /* -------- SHOP -------- */
  if (group === "shop") {
    if (sub === "list") {
      const rows = listShop();
      const e = new EmbedBuilder().setTitle("🛒 Mağaza")
        .setDescription(rows.map(r => `• \`${r.item_id}\` — **${r.name}** (${r.type}) — ${coin(r.price)}\n> ${r.description ?? "-"}`).join("\n"));
      return interaction.reply({ embeds: [e] });
    }
    if (sub === "buy") {
      const id = interaction.options.getString("item", true);
      const qty = interaction.options.getInteger("adet") ?? 1;
      const it = getItemById(id);
      if (!it) return interaction.reply({ content: "❌ Ürün bulunamadı.", ephemeral: true });
      const total = it.price * qty;
      const u = getUser(userId);
      if (u.balance < total) return interaction.reply({ content: "❌ Yetersiz bakiye.", ephemeral: true });
      addBalance(userId, -total);
      addItem(userId, it.item_id, qty);
      addXP(userId, 5);
      return interaction.reply(`✅ Satın alındı: **${it.name} x${qty}** (${coin(total)})`);
    }
    if (sub === "sell") {
      const id = interaction.options.getString("item", true);
      const qty = interaction.options.getInteger("adet") ?? 1;
      const it = getItemById(id);
      if (!it) return interaction.reply({ content: "❌ Ürün bulunamadı.", ephemeral: true });
      const inv = getInventory(userId);
      const row = inv.find(x => x.item_id === id);
      if (!row || row.qty < qty) return interaction.reply({ content: "❌ Envanterde yeterli yok.", ephemeral: true });
      addItem(userId, id, -qty);
      const gain = Math.floor(it.price * qty * 0.5);
      addBalance(userId, gain);
      return interaction.reply(`💱 Satıldı: **${it.name} x${qty}**, kazanç ${coin(gain)} (yarı fiyat)`);
    }
  }

  /* -------- INVENTORY -------- */
  if (group === "inv" && sub === "show") {
    const inv = getInventory(userId);
    if (!inv.length) return interaction.reply("📦 Envanter boş.");
    const e = new EmbedBuilder().setTitle("📦 Envanter")
      .setDescription(inv.map(i => `• **${i.name}** (\`${i.item_id}\`, ${i.type}) x${i.qty}`).join("\n"));
    return interaction.reply({ embeds: [e] });
  }

  /* -------- CASES -------- */
  if (group === "case") {
    if (sub === "list") {
      const cases = listCases();
      const e = new EmbedBuilder().setTitle("🎁 Kasalar")
        .setDescription(
          cases.map(c => {
            const risky = /(Düşük Kâr Şansı)/i.test(c.name) ? " 💀" : "";
            return `• \`${c.case_id}\` — **${c.name}** — ${coin(c.price)}${risky}`;
          }).join("\n")
        )
        .setFooter({ text: "İpucu: /mc case info id:<kasa_id> ile olasılık ve beklenen değeri gör." });
      return interaction.reply({ embeds: [e] });
    }

    if (sub === "info") {
      const id = interaction.options.getString("id", true);
      const c = getCase(id);
      if (!c) return interaction.reply({ content: "❌ Kasa bulunamadı.", ephemeral: true });

      const a = analyzeCase(c);
      // Olasılık satırları
      const lines = a.rows.map(r => {
        const pct = (r.p * 100).toFixed(r.p < 0.01 ? 3 : 1);
        const qty = r.qty.min === r.qty.max ? `x${r.qty.min}` : `x${r.qty.min}-${r.qty.max}`;
        const val = `~${coin(Math.floor(r.v.avg))}`; // satılsa yaklaşık
        return `• **${pct}%** — ${r.label} ${qty} → ${val}`;
      }).join("\n");

      const ev = Math.floor(a.ev);
      const evPct = ((ev / c.price) * 100).toFixed(1);

      const e = new EmbedBuilder()
        .setTitle(`🎁 ${c.name}`)
        .addFields(
          { name: "Fiyat", value: coin(c.price), inline: true },
          { name: "Beklenen Değer (EV)*", value: `${coin(ev)} (~%${evPct})`, inline: true },
          { name: "Olasılıklar & Yaklaşık Değer", value: lines || "-" }
        )
        .setFooter({ text: "*EV, itemların satılabilir değerinin (yarı fiyat) ortalamasına göre hesaplanır. Kâr garantisi yoktur." });

      return interaction.reply({ embeds: [e] });
    }

    if (sub === "open") {
      const id = interaction.options.getString("id", true);
      const count = interaction.options.getInteger("adet") ?? 1;
      if (count > 20) return interaction.reply({ content: "⚠️ En fazla 20 kasa bir kerede açılabilir.", ephemeral: true });

      const cd = canUse(userId, "open_case", 5_000);
      if (!cd.ok) return interaction.reply({ content: `🕒 Lütfen bekle: **${msToText(cd.remainMs)}**`, ephemeral: true });

      const c = getCase(id);
      if (!c) return interaction.reply({ content: "❌ Kasa bulunamadı.", ephemeral: true });

      const priceAll = c.price * count;
      const u = getUser(userId);
      if (u.balance < priceAll) return interaction.reply({ content: "❌ Yetersiz bakiye.", ephemeral: true });

      // satın al ve aç
      for (let i = 0; i < count; i++) buyCase(userId, id);
      const rewards = [];
      for (let i = 0; i < count; i++) rewards.push(rollCaseReward(userId, c));

      addXP(userId, Math.min(5 * count, 100));
      const lines = rewards.map(r =>
        r.type === "coins" ? `🪙 ${coin(r.amount)}` : `🎯 **${r.item.name}** x${r.qty}`
      ).join("\n");

      const e = new EmbedBuilder()
        .setTitle(`🎉 ${c.name} açıldı x${count}`)
        .setDescription(lines)
        .setFooter({ text: `Toplam ödenen: ${coin(priceAll)}` });
      return interaction.reply({ embeds: [e] });
    }
  }

  /* -------- GAMBLE -------- */
  if (group === "gamble") {
    const cd = canUse(userId, "gamble", 7_000);
    if (!cd.ok) return interaction.reply({ content: `🕒 Lütfen bekle: **${msToText(cd.remainMs)}**`, ephemeral: true });

    const u = getUser(userId);
    if (sub === "coinflip") {
      const choice = interaction.options.getString("seçim", true);
      const bet = interaction.options.getInteger("bahis", true);
      if (bet > u.balance) return interaction.reply({ content: "❌ Yetersiz bakiye.", ephemeral: true });

      const flip = Math.random() < 0.5 ? "yazı" : "tura";
      const win = (flip === choice);
      addBalance(userId, win ? bet : -bet);
      addXP(userId, 5);
      return interaction.reply(`${win ? "✅" : "❌"} Çıkan: **${flip}** — ${win ? `Kazanç: ${coin(bet)}` : `Kayıp: ${coin(bet)}`}`);
    }

    if (sub === "slots") {
      const bet = interaction.options.getInteger("bahis", true);
      if (bet > u.balance) return interaction.reply({ content: "❌ Yetersiz bakiye.", ephemeral: true });
      const pool = ["🍒", "🍋", "🔔", "⭐", "💎"];
      const r = () => pool[Math.floor(Math.random() * pool.length)];
      const a = r(), b = r(), c = r();

      let multiplier = 0;
      if (a === b && b === c) multiplier = a === "💎" ? 5 : 3;
      else if (a === b || b === c || a === c) multiplier = 1.5;

      const delta = Math.floor(bet * (multiplier - 1));
      addBalance(userId, delta);
      addXP(userId, 6);
      const line = `[ ${a} | ${b} | ${c} ]`;
      if (multiplier <= 0) return interaction.reply(`${line} — ❌ Kaybettin: ${coin(bet)}`);
      return interaction.reply(`${line} — ✅ Kazanç: ${coin(Math.floor(bet * multiplier))} (x${multiplier})`);
    }
  }

  /* -------- PETS -------- */
  if (group === "pet") {
    if (sub === "list") {
      const rows = listPets();
      const e = new EmbedBuilder().setTitle("🐾 Pet Listesi")
        .setDescription(rows.map(p => `• \`${p.pet_id}\` — **${p.name}** [${p.rarity}] — Güç: ${p.base_power}`).join("\n"))
        .setFooter({ text: "Adopt ücretleri rarity'ye göre hesaplanır." });
      return interaction.reply({ embeds: [e] });
    }

    if (sub === "adopt") {
      const id = interaction.options.getString("id", true);
      const name = interaction.options.getString("isim") ?? null;
      try {
        const { pet, cost } = adoptPet(userId, id, name);
        addXP(userId, 25);
        return interaction.reply(`🎉 ${pet.name} (${pet.rarity}) adopt edildi! Ödenen: ${coin(cost)} ${name ? ` • İsmi: **${name}**` : ""}`);
      } catch (e) {
        return interaction.reply({ content: `❌ ${e.message}`, ephemeral: true });
      }
    }

    if (sub === "info") {
      const rows = userPets(userId);
      if (!rows.length) return interaction.reply("🐾 Henüz petin yok. `/mc pet adopt` ile başlayabilirsin.");
      const e = new EmbedBuilder().setTitle("🐾 Petlerin")
        .setDescription(rows.map(p => `• **${p.name}** ${p.nickname ? `(${p.nickname})` : ""} — Lv.${p.level} (${p.xp}xp) — Güç: ${p.base_power} — [${p.rarity}]`).join("\n"));
      return interaction.reply({ embeds: [e] });
    }

    if (sub === "feed") {
      const id = interaction.options.getString("id", true);
      try {
        const after = feedPet(userId, id);
        addXP(userId, 5);
        return interaction.reply(`🍪 Beslendi! Yeni durum: Lv.${after.level} (${after.xp}xp)`);
      } catch (e) {
        return interaction.reply({ content: `❌ ${e.message}`, ephemeral: true });
      }
    }
  }

  /* -------- STATS -------- */
  if (group === "stats") {
    if (sub === "rich") {
      const rows = topRich(10);
      const desc = rows.map((r, i) => `**#${i+1}** <@${r.user_id}> — Toplam: ${coin(r.total)} (Cüzdan: ${coin(r.balance)}, Banka: ${coin(r.bank)})`).join("\n");
      const e = new EmbedBuilder().setTitle("🏆 En Zengin 10").setDescription(desc || "Veri yok.");
      return interaction.reply({ embeds: [e] });
    }
    if (sub === "level") {
      const rows = topLevels(10);
      const desc = rows.map((r, i) => `**#${i+1}** <@${r.user_id}> — Seviye: ${r.level} (${r.xp}xp)`).join("\n");
      const e = new EmbedBuilder().setTitle("📈 En Yüksek Seviye 10").setDescription(desc || "Veri yok.");
      return interaction.reply({ embeds: [e] });
    }
  }

  return interaction.reply({ content: "🤔 Bilinmeyen alt komut.", ephemeral: true });
}
