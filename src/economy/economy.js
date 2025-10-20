export const COIN = "₥";

export const ranges = {
  daily: [500, 1000],     // günlük ödül
  work:  [250, 600],      // saatlik çalışma
  mineWin: [100, 800],    // maden kazancı
  mineLose: [50, 400]     // maden kaybı
};

export const cooldowns = {
  daily: 24 * 60 * 60 * 1000, // 24 saat
  work: 60 * 60 * 1000,       // 1 saat
  mine: 10 * 60 * 1000        // 10 dk
};

export function randIn([a, b]) {
  return Math.floor(Math.random() * (b - a + 1)) + a;
}

export function fmt(amount) {
  return `${COIN}${amount.toLocaleString("tr-TR")}`;
}

export function remainMsText(ms) {
  const s = Math.ceil(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  const parts = [];
  if (h) parts.push(`${h}sa`);
  if (m) parts.push(`${m}dk`);
  if (ss && !h) parts.push(`${ss}sn`);
  return parts.join(" ");
}
