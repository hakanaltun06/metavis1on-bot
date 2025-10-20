import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import { canUse } from "../lib/cooldown.js";
import {
  getOrCreateUser, getUser, addBalance, addXP, setUserTimestamp,
  moveToBank, moveFromBank, transferBalance,
  getInventory, listShop, getItemById, addItem,
  listCases, getCase, buyCase, rollCaseReward, analyzeCase,
  applyAccruedInterest
} from "../lib/db.js";
import { coin, msToText, num } from "../lib/format.js";

export const data = new SlashCommandBuilder()
  .setName("mc").setDescription("MetaCoin ana komutu")

  // ECONOMY
  .addSubcommandGroup(g =>
    g.setName("economy").setDescription("Ekonomi")
      .addSubcommand(s => s.setName("balance").setDescription("Bakiyeni göster"))
      .addSubcommand(s => s.setName("daily").setDescription("Günlük ödül (24s cooldown)"))
      .addSubcommand(s => s.setName("work").setDescription("Çalış ve para kazan (45dk cooldown)"))
      .addSubcommand(s => s.setName("beg").setDescription("Dilencilik yap (5dk cooldown)"))
      .addSubcommand(s => s.setName("transfer")
        .setDescription("Başkasına para gönder")
        .addUserOption(o => o.setName("kime").setDescription("Alıcı").setRequired(true))
        .addIntegerOption(o => o.setName("miktar").setDescription("Miktar").setMinValue(1).setRequired(true)))
  )

  // BANK
  .addSubcommandGroup(g =>
    g.setName("bank").setDescription("Banka (faizli)")
      .addSubcommand(s => s.setName("deposit").setDescription("Bankaya yatır")
        .addIntegerOption(o => o.setName("miktar").setDescription("Miktar").setMinValue(1).setRequired(true)))
      .addSubcommand(s => s.setName("withdraw").setDescription("Bankadan çek")
        .addIntegerOption(o => o.setName("miktar").setDescription("Miktar").setMinValue(1).setRequired(true)))
      .addSubcommand(s => s.setName("info").setDescription("Banka bilgisi/son faiz işlenmesi"))
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
      .addSubcommand(s => s.setName("info").setDescription("Kasa bilgisi (olasılık & beklenen değer)")
        .addStringOption(o => o.setName("id").setDescription("Kasa ID").setRequired(true)))
      .addSubcommand(s => s.setName("open").setDescription("Kasa aç")
        .addStringOption(o => o.setName("id").setDescription("Kasa ID").setRequired(true))
        .addIntegerOption(o => o.setName("adet").setDescription("Kaç tane?").setMinValue(1)))
      .addSubcommand(s => s.setName("simulate").setDescription("Kasa simülasyonu (ör: 1000 kez)")
        .addStringOption(o => o.setName("id").setDescription("Kasa ID").setRequired(true))
        .addIntegerOption(o => o.setName("n").setDescription("Deneme sayısı").setMinValue(10).setMaxValue(100000)))
  )

  // GAMBLE
  .addSubcommandGroup(g =>
    g.setName("gamble").setDescription("Şans oyunları")
      .addSubcommand(s => s.setName("coinflip").setDescription("Yazı-tura")
        .addStringOption(o => o.setName("seçim").setDescription("yazı/tura").setRequired(true).addChoices(
          { name: "yazı", value: "yazı" }, { name: "tura", value: "tura" }
        ))
        .addIntegerOption(o => o.setName("bahis").setDescription("Bahis").setMinValue(1).setRequired(true)))
      .addSubcommand(s => s.setName("slots").setDescription("Slot makinesi")
        .addIntegerOption(o => o.setName("bahis").setDescription("Bahis").setMinValue(1).setRequired(true)))
  )

  // STATS
  .addSubcommandGroup(g =>
    g.setName("stats").setDescription("Sıralamalar")
      .addSubcommand(s => s.setName("rich").setDescription("Toplam cüzdan+banka ilk 10"))
      .addSubcommand(s => s.setName("level").setDescription("Seviye ilk 10"))
  );

export async function execute(interaction) {
  const group = interaction.options.getSubcommandGroup();
  const sub = interaction.options.getSubcommand();
  const userId = interaction.user.id;

  // hızlı ACK — interaction expiry ve uyarıları önler
  if (!interaction.deferred && !interaction.replied) {
    await interaction.deferReply({ flags: 64 });
  }

  getOrCreateUser(userId);

  /* -------- ECONOMY -------- */
  if (group === "economy") {
    if (sub === "balance") {
      applyAccruedInterest(userId);
      const u = getUser(userId);
      const e = new EmbedBuilder().setTitle("💼 Bakiye")
        .addFields(
          { name: "Cüzdan", value: coin(u.balance), inline: true },
          { name: "Banka (faizli)", value: coin(u.bank), inline: true },
          { name: "Seviye", value: `Lv.${u.level} (${u.xp}xp)`, inline: true }
        );
      return interaction.editReply({ embeds: [e] });
    }

    if (sub === "daily") {
      const cd = canUse(userId, "daily", 24*60*60*1000);
      if (!cd.ok) return interaction.editReply({ content: `🕒 Günlük için bekle: **${msToText(cd.remainMs)}**` });
      const reward = 350 + Math.floor(Math.random() * 200);
      addBalance(userId, reward); addXP(userId, 20); setUserTimestamp(userId, "last_daily", Date.now());
      return interaction.editReply(`🎁 Günlük ödül: ${coin(reward)}! +20xp`);
    }

    if (sub === "work") {
      const cd = canUse(userId, "work", 45*60*1000);
      if (!cd.ok) return interaction.editReply({ content: `🕒 Çalışmak için bekle: **${msToText(cd.remainMs)}**` });
      const base = 220 + Math.floor(Math.random() * 160);
      const inv = getInventory(userId); const hasVIP = inv.find(i => i.item_id==="vip" && i.qty>0);
      const reward = Math.floor(base * (hasVIP ? 1.05 : 1));
      addBalance(userId, reward); addXP(userId, 25); setUserTimestamp(userId, "last_work", Date.now());
      return interaction.editReply(`💼 Çalıştın ve ${coin(reward)} kazandın! ${hasVIP ? "(VIP +%5)" : ""} +25xp`);
    }

    if (sub === "beg") {
      const cd = canUse(userId, "beg", 5*60*1000);
      if (!cd.ok) return interaction.editReply({ content: `🕒 Dilencilik için bekle: **${msToText(cd.remainMs)}**` });
      const reward = Math.random() < 0.25 ? 0 : 25 + Math.floor(Math.random()*60);
      if (reward===0) return interaction.editReply("😶 Kimse para vermek istemedi.");
      addBalance(userId, reward); addXP(userId,5); setUserTimestamp(userId,"last_beg", Date.now());
      return interaction.editReply(`🤲 ${coin(reward)} kaptın! +5xp`);
    }

    if (sub === "transfer") {
      const to = interaction.options.getUser("kime", true);
      const amt = interaction.options.getInteger("miktar", true);
      if (to.bot) return interaction.editReply({ content: "🤖 Bota transfer yok." });
      if (to.id === userId) return interaction.editReply({ content: "Kendine transfer olmaz." });
      try { transferBalance(userId, to.id, amt); return interaction.editReply(`🔁 ${to} kullanıcısına ${coin(amt)} gönderdin.`); }
      catch (e) { return interaction.editReply({ content: `❌ ${e.message}` }); }
    }
  }

  /* -------- BANK -------- */
  if (group === "bank") {
    if (sub === "deposit" || sub === "withdraw") {
      const amt = interaction.options.getInteger("miktar", true);
      try {
        if (sub === "deposit") { moveToBank(userId, amt); return interaction.editReply(`🏦 Bankaya yatırıldı: ${coin(amt)}`); }
        else { moveFromBank(userId, amt); return interaction.editReply(`🏧 Bankadan çekildi: ${coin(amt)}`); }
      } catch (e) { return interaction.editReply({ content: `❌ ${e.message}` }); }
    }
    if (sub === "info") {
      applyAccruedInterest(userId);
      const u = getUser(userId);
      return interaction.editReply(`🏦 Banka bakiyesi: ${coin(u.bank)} — Faiz saatlik bileşik ve işlem sırasında işlenir.`);
    }
  }

  /* -------- SHOP -------- */
  if (group === "shop") {
    if (sub === "list") {
      const rows = listShop();
      const e = new EmbedBuilder().setTitle("🛒 Mağaza")
        .setDescription(rows.map(r => `• \`${r.item_id}\` — **${r.name}** (${r.type}) — ${coin(r.price)}\n> ${r.description ?? "-"}`).join("\n"));
      return interaction.editReply({ embeds: [e] });
    }
    if (sub === "buy") {
      const id = interaction.options.getString("item", true);
      const qty = interaction.options.getInteger("adet") ?? 1;
      const it = getItemById(id); if (!it) return interaction.editReply({ content: "❌ Ürün bulunamadı." });
      const total = it.price * qty; const u = getUser(userId);
      if (u.balance < total) return interaction.editReply({ content: "❌ Yetersiz bakiye." });
      addBalance(userId, -total); addItem(userId, it.item_id, qty); addXP(userId, 5);
      return interaction.editReply(`✅ Satın alındı: **${it.name} x${qty}** (${coin(total)})`);
    }
    if (sub === "sell") {
      const id = interaction.options.getString("item", true);
      const qty = interaction.options.getInteger("adet") ?? 1;
      const it = getItemById(id); if (!it) return interaction.editReply({ content: "❌ Ürün bulunamadı." });
      const inv = getInventory(userId); const row = inv.find(x => x.item_id===id);
      if (!row || row.qty < qty) return interaction.editReply({ content: "❌ Envanterde yeterli yok." });
      addItem(userId, id, -qty); const gain = Math.floor(it.price * qty * 0.5); addBalance(userId, gain);
      return interaction.editReply(`💱 Satıldı: **${it.name} x${qty}**, kazanç ${coin(gain)} (yarı fiyat)`);
    }
  }

  /* -------- INVENTORY -------- */
  if (group === "inv" && sub === "show") {
    const inv = getInventory(userId);
    if (!inv.length) return interaction.editReply("📦 Envanter boş.");
    const e = new EmbedBuilder().setTitle("📦 Envanter")
      .setDescription(inv.map(i => `• **${i.name}** (\`${i.item_id}\`, ${i.type}) x${i.qty}`).join("\n"));
    return interaction.editReply({ embeds: [e] });
  }

  /* -------- CASES -------- */
  if (group === "case") {
    if (sub === "list") {
      const cs = listCases();
      const e = new EmbedBuilder().setTitle("🎁 Kasalar")
        .setDescription(cs.map(c => {
          const risky = /(Düşük Kâr Şansı)/i.test(c.name) ? " 💀" : "";
          return `• \`${c.case_id}\` — **${c.name}** — ${coin(c.price)}${risky}`;
        }).join("\n"))
        .setFooter({ text: "İpucu: /mc case info id:<kasa_id>" });
      return interaction.editReply({ embeds: [e] });
    }

    if (sub === "info") {
      const id = interaction.options.getString("id", true);
      const c = getCase(id); if (!c) return interaction.editReply({ content: "❌ Kasa bulunamadı." });
      const a = analyzeCase(c);
      const lines = a.rows.map(r => {
        const pct = (r.p*100).toFixed(r.p < 0.01 ? 3 : 1);
        const val = `~${coin(Math.floor(r.v.avg))}`;
        const qty = r.qty.min === r.qty.max ? `x${r.qty.min}` : `x${r.qty.min}-${r.qty.max}`;
        return `• **${pct}%** — ${r.label} ${qty} → ${val}`;
      }).join("\n");
      const ev = Math.floor(a.ev); const evPct = ((ev / c.price) * 100).toFixed(1);
      const e = new EmbedBuilder().setTitle(`🎁 ${c.name}`)
        .addFields(
          { name: "Fiyat", value: coin(c.price), inline: true },
          { name: "Beklenen Değer (EV)*", value: `${coin(ev)} (~%${evPct})`, inline: true },
          { name: "Olasılık & Değer", value: lines || "-" }
        )
        .setFooter({ text: "*EV, itemların yarı fiyatla satılabilir değer ortalamasıdır. Kâr garantisi yoktur." });
      return interaction.editReply({ embeds: [e] });
    }

    if (sub === "open") {
      const id = interaction.options.getString("id", true);
      const count = interaction.options.getInteger("adet") ?? 1;
      if (count > 20) return interaction.editReply({ content: "⚠️ En fazla 20 kasa açılabilir." });
      const cd = canUse(userId, "open_case", 5_000);
      if (!cd.ok) return interaction.editReply({ content: `🕒 Lütfen bekle: **${msToText(cd.remainMs)}**` });
      const c = getCase(id); if (!c) return interaction.editReply({ content: "❌ Kasa bulunamadı." });
      const priceAll = c.price * count; const u = getUser(userId);
      if (u.balance < priceAll) return interaction.editReply({ content: "❌ Yetersiz bakiye." });

      for (let i = 0; i < count; i++) buyCase(userId, id);
      const rewards = []; for (let i = 0; i < count; i++) rewards.push(rollCaseReward(userId, c));
      addXP(userId, Math.min(5*count, 100));
      const lines = rewards.map(r => r.type==="coins" ? `🪙 ${coin(r.amount)}` : `🎯 **${r.item.name}** x${r.qty}`).join("\n");
      const e = new EmbedBuilder().setTitle(`🎉 ${c.name} açıldı x${count}`).setDescription(lines)
        .setFooter({ text: `Toplam ödenen: ${coin(priceAll)}` });
      return interaction.editReply({ embeds: [e] });
    }

    if (sub === "simulate") {
      const id = interaction.options.getString("id", true);
      const n = interaction.options.getInteger("n") ?? 1000;
      const c = getCase(id); if (!c) return interaction.editReply({ content: "❌ Kasa bulunamadı." });

      const drops = JSON.parse(c.drops_json);
      const total = drops.reduce((a,d)=>a+d.weight,0);
      const choose = () => {
        let p = Math.random()*total;
        for (const d of drops) { if ((p -= d.weight) <= 0) return d; }
        return drops.at(-1);
      };
      let sumValue = 0;
      for (let i=0;i<n;i++){
        const d = choose();
        const minQ=d.minQty??1, maxQ=d.maxQty??1;
        const qty = Math.floor(Math.random()*(maxQ-minQ+1))+minQ;
        if (d.coins) sumValue += qty;
        else {
          const it = getItemById(d.item_id);
          const sell = Math.floor((it?.price ?? 0) * 0.5);
          sumValue += sell * qty;
        }
      }
      const ev = Math.floor(sumValue / n);
      const evPct = ((ev / c.price)*100).toFixed(1);
      return interaction.editReply(`🧪 Simülasyon (${n}x): EV ≈ ${coin(ev)} (~%${evPct}) — Fiyat: ${coin(c.price)}.`);
    }
  }

  /* -------- GAMBLE -------- */
  if (group === "gamble") {
    const cd = canUse(userId, "gamble", 7_000);
    if (!cd.ok) return interaction.editReply({ content: `🕒 Lütfen bekle: **${msToText(cd.remainMs)}**` });
    const u = getUser(userId);

    if (sub === "coinflip") {
      const choice = interaction.options.getString("seçim", true);
      const bet = interaction.options.getInteger("bahis", true);
      if (bet > u.balance) return interaction.editReply({ content: "❌ Yetersiz bakiye." });
      const flip = Math.random() < 0.5 ? "yazı" : "tura"; const win = (flip === choice);
      addBalance(userId, win ? bet : -bet); addXP(userId,5);
      return interaction.editReply(`${win ? "✅" : "❌"} Çıkan: **${flip}** — ${win ? `Kazanç: ${coin(bet)}` : `Kayıp: ${coin(bet)}`}`);
    }

    if (sub === "slots") {
      const bet = interaction.options.getInteger("bahis", true);
      if (bet > u.balance) return interaction.editReply({ content: "❌ Yetersiz bakiye." });
      const pool = ["🍒","🍋","🔔","⭐","💎"];
      const r = () => pool[Math.floor(Math.random()*pool.length)];
      const a=r(), b=r(), c=r();
      let multiplier = 0;
      if (a===b && b===c) multiplier = a==="💎" ? 5 : 3;
      else if (a===b || b===c || a===c) multiplier = 1.5;
      const delta = Math.floor(bet * (multiplier - 1)); addBalance(userId, delta); addXP(userId, 6);
      const line = `[ ${a} | ${b} | ${c} ]`;
      return interaction.editReply(multiplier<=0 ? `${line} — ❌ Kaybettin: ${coin(bet)}` : `${line} — ✅ Kazanç: ${coin(Math.floor(bet*multiplier))} (x${multiplier})`);
    }
  }

  /* -------- STATS -------- */
  if (group === "stats") {
    const db = (await import("../lib/db.js")).getDB();
    if (sub === "rich") {
      const rows = db.prepare("SELECT user_id, balance, bank, (balance+bank) AS total FROM users ORDER BY total DESC LIMIT 10").all();
      const desc = rows.map((r,i)=>`**#${i+1}** <@${r.user_id}> — Toplam: ${coin(r.total)} (Cüzdan: ${coin(r.balance)}, Banka: ${coin(r.bank)})`).join("\n") || "Veri yok.";
      const e = new EmbedBuilder().setTitle("🏆 En Zengin 10").setDescription(desc);
      return interaction.editReply({ embeds: [e] });
    }
    if (sub === "level") {
      const rows = db.prepare("SELECT user_id, level, xp FROM users ORDER BY level DESC, xp DESC LIMIT 10").all();
      const desc = rows.map((r,i)=>`**#${i+1}** <@${r.user_id}> — Seviye: ${r.level} (${num(r.xp)}xp)`).join("\n") || "Veri yok.";
      const e = new EmbedBuilder().setTitle("📈 En Yüksek Seviye 10").setDescription(desc);
      return interaction.editReply({ embeds: [e] });
    }
  }

  return interaction.editReply({ content: "🤔 Bilinmeyen alt komut." });
}
