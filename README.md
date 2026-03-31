# Metavis1on Discord Bot

Node 18+ ile çalışır. Render gibi PaaS ortamında / (root) health endpoint açık.

## Ortam Değişkenleri
- DISCORD_TOKEN = (Discord Bot Token)
- CLIENT_ID = (Application ID)
- GUILD_ID = (opsiyonel; test sunucusu ID'si - hızlı yayın)
- PORT = 3000

## Deploy (özet)
1. Bu repo’yu GitHub’a push et (asla .env pushlama).
2. Render → New → Web Service → GitHub repo’yu seç → Environment değişkenlerini gir → `npm start`.
3. Slash komutları otomatik kaydolur.
