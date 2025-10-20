import { SlashCommandBuilder, EmbedBuilder, MessageFlags } from "discord.js";
import { listSymbols, getSymbol, buySymbol, sellSymbol, portfolio, leaderboardEquity } from "../lib/market.js";
import { getOrCreateUser } from "../lib/db.js";
import { coin, num } from "../lib/format.js";

export const data = new SlashCommandBuilder()
  .setName("market")
  .setDescription("MetaCoin Sanal Borsa")
  .addSubcommand(s => s.setName("list").setDescription("Semboller ve son fiyatlar"))
  .addSubcommand(s => s.setName("info").setDescription("Sembol bilgisi")
    .addStringOption(o => o.setName("symbol").setDescription("Örn: META").setRequired(true)))
  .addSubcommand(s => s.setName("buy").setDescription("Sembol satın al")
    .addStringOption(o => o.setName("symbol").setDescription("Örn: META").setRequired(true))
    .addNumberOption(o => o.setName("qty").setDescription("Adet").setMinValue(0.0001).setRequired(true)))
  .addSubcommand(s => s.setName("sell").setDescription("Sembol sat")
    .addStringOption(o => o.setName("symbol").setDescription("Örn: META").setRequired(true))
    .addNumberOption(o => o.setName("qty").setDescription("Adet").setMinValue(0.0001).setRequired(true)))
  .addSubcommand(s => s.setName("portfolio").setDescription("Portföyünü göster"))
  .addSubcommand(s => s.setName("leaderboard").setDescription("Toplam varlık (cüzdan + banka + portföy) ilk 10"));

export async function execute(interaction) {
  const sub = interaction.options.getSubcommand();
  const userId = interaction.user.id;
  getOrCreateUser(userId);

  if (sub === "list") {
    const rows = listSymbols();
    const e = new EmbedBuilder().setTitle("📈 Semboller")
      .setDescription(rows.map(r => `• **${r.symbol}** — ${r.name} — Fiyat: ${coin(r.price.toFixed(2))}`).join("\n"));
    return interaction.reply({ embeds: [e] });
  }

  if (sub === "info") {
    const sym = interaction.options.getString("symbol", true).toUpperCase();
    const s = getSymbol(sym); if (!s) return interaction.reply({ content: "❌ Sembol bulunamadı.", flags: MessageFlags.Ephemeral });
    const e = new EmbedBuilder().setTitle(`ℹ️ ${s.symbol} — ${s.name}`)
      .addFields(
        { name: "Fiyat", value: coin(s.price.toFixed(4)), inline: true },
        { name: "Drift (yıllık ~)", value: `${(s.drift*100).toFixed(2)}%`, inline: true },
        { name: "Volatilite (yıllık ~)", value: `${(s.vol*100).toFixed(2)}%`, inline: true }
      )
      .setFooter({ text: "Fiyat simülasyonludur (GBM). Gerçek piyasa değildir." });
    return interaction.reply({ embeds: [e] });
  }

  if (sub === "buy" || sub === "sell") {
    const sym = interaction.options.getString("symbol", true).toUpperCase();
    const qty = interaction.options.getNumber("qty", true);
    try {
      if (sub === "buy") {
        const r = buySymbol(userId, sym, qty);
        return interaction.reply(`🛒 Satın alındı: **${sym} x${qty}** @ ~${coin((await r).price.toFixed(4))}`);
      } else {
        const r = sellSymbol(userId, sym, qty);
        return interaction.reply(`💰 Satıldı: **${sym} x${qty}** @ ~${coin((await r).price.toFixed(4))} → Gelir: ${coin((await r).revenue)} (P/L ~ ${coin((await r).pl.toFixed(0))})`);
      }
    } catch (e) {
      return interaction.reply({ content: `❌ ${e.message}`, flags: MessageFlags.Ephemeral });
    }
  }

  if (sub === "portfolio") {
    const pf = portfolio(userId);
    if (!pf.positions.length) return interaction.reply("📂 Portföyün boş.");
    const lines = pf.positions.map(p => `• **${p.symbol}** — ${p.name} — x${num(p.qty)} @ ~${p.price.toFixed(4)} → Değer: ${coin(p.value.toFixed(0))} (P/L: ${coin(p.pl.toFixed(0))})`).join("\n");
    const e = new EmbedBuilder().setTitle("💼 Portföyün").setDescription(lines).setFooter({ text: `Toplam Portföy Değeri: ${coin(pf.total.toFixed(0))}` });
    return interaction.reply({ embeds: [e] });
  }

  if (sub === "leaderboard") {
    const top = leaderboardEquity(10);
    const desc = top.map((t,i)=> `**#${i+1}** <@${t.id}> — Toplam Varlık: ${coin(t.eq)}`).join("\n") || "Veri yok.";
    const e = new EmbedBuilder().setTitle("🏦 Borsa + Ekonomi Liderliği").setDescription(desc);
    return interaction.reply({ embeds: [e] });
  }

  return interaction.reply({ content: "🤔 Bilinmeyen alt komut.", flags: MessageFlags.Ephemeral });
}
