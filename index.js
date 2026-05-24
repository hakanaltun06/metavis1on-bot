/**
 * metavis1on — Discord Ekonomi Botu (Modüler Giriş)
 *
 * Bu dosya yalnızca başlangıç akışını yönetir.
 *  - Ortam ayarlarını yükler.
 *  - Sağlık kontrol sunucusunu başlatır.
 *  - Discord istemcisini oluşturup olayları bağlar.
 *  - Bot hazır olduğunda veritabanını hazırlar ve komutları yükler.
 *  - Token yoksa veya giriş başarısızsa gizli bilgi sızdırmadan Türkçe konsol mesajı yazar.
 *
 * Komut mantığı src/commands altında dosya başına bir komut olarak tutulur.
 * Veritabanı, yardımcılar ve servisler src/ altında ilgili klasörlerde modülerdir.
 *
 * GELECEK GELİŞTİRMELER İÇİN PLAN NOTU
 *  - Enflasyon sistemi (ekonomi büyüdükçe fiyatların oransal artması)
 *  - Kredi sistemi (borç çekme, ödeme, kredi skoru)
 *  - Market fiyat dalgalanması (arz/talep tabanlı dinamik fiyat)
 *  - Vergi sistemi (transfer ve kumar kazançlarından küçük kesintiler)
 *  - Sunucu ekonomisi raporu (haftalık/aylık özet)
 *  - Zenginlik seviyesi (servete göre unvan ve rozet)
 *  - Riskli kazanç yolları (yeni iş kolları, görevler)
 *  - Kasa ve nadir eşya sistemi (kasa açma, drop tablosu)
 *  - Sezon sistemi (dönemsel ödüller, sezon sonu fotoğrafı)
 */

const { BOT_TOKEN } = require('./src/config/env');
const { createClient } = require('./src/bot/client');
const { attachInteractionHandler } = require('./src/bot/events');
const { registerCommands } = require('./src/bot/registerCommands');
const { initDB } = require('./src/database/init');
const { startHealthServer } = require('./src/web/health');

// Genel hata yakalama
process.on('unhandledRejection', (reason) => {
    console.error('Yakalanmamış reddetme:', reason && reason.message ? reason.message : reason);
});
process.on('uncaughtException', (err) => {
    console.error('Yakalanmamış istisna:', err && err.message ? err.message : err);
});

(async () => {
    // Sağlık kontrol sunucusu Discord'dan bağımsız çalışır.
    startHealthServer();

    if (!BOT_TOKEN) {
        console.error('❌ BOT_TOKEN tanımlı değil. .env dosyasını kontrol et.');
        process.exit(1);
    }

    const client = createClient();
    attachInteractionHandler(client);

    client.once('ready', async () => {
        console.log(`🤖 ${client.user.tag} aktif!`);
        try {
            await initDB();
        } catch (err) {
            console.error('Veritabanı hazırlanırken sorun çıktı:', err && err.message ? err.message : 'Bilinmeyen hata');
        }
        try {
            await registerCommands();
        } catch (err) {
            console.error('Komut yükleme hatası:', err && err.message ? err.message : 'Bilinmeyen hata');
        }
    });

    try {
        await client.login(BOT_TOKEN);
    } catch (err) {
        console.error('❌ Bot girişi başarısız oldu. Token geçerli mi kontrol et.');
        console.error('Hata:', err && err.message ? err.message : 'Bilinmeyen hata');
        process.exit(1);
    }
})();
