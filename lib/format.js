export const coin = (n) => `🪙 **${n.toLocaleString("tr-TR")}**`;
export const msToText = (ms) => {
  const s = Math.ceil(ms / 1000);
  const m = Math.floor(s / 60);
  const r = s % 60;
  if (m >= 1) return `${m}dk ${r}sn`;
  return `${r}sn`;
};
