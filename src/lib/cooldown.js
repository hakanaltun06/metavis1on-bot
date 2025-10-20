const cd = new Map();
export function canUse(userId, action, cooldownMs) {
  const k = `${userId}:${action}`;
  const now = Date.now();
  const until = cd.get(k) ?? 0;
  if (until > now) return { ok: false, remainMs: until - now };
  cd.set(k, now + cooldownMs);
  return { ok: true, remainMs: 0 };
}
export function initCooldownSweeper() {
  setInterval(() => {
    const now = Date.now();
    for (const [k, v] of cd.entries()) if (v <= now) cd.delete(k);
  }, 60_000);
}
