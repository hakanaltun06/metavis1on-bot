const { MessageFlags } = require('discord.js');
const { createEmbed } = require('../../utils/embeds');
const { isBotOwner } = require('../../utils/permissions');

module.exports = {
    data: {
        name: 'yardim',
        description: 'Tüm bot komutlarını kategorilere göre listeler.'
    },

    async execute(interaction) {
        const embed = createEmbed('premium', '📖 MetaVis1on — Komut Rehberi',
            '**İlk kez başlıyorsan:** `/gunluk` ile ödülünü al, `/calis` ile MetaCoin kazan, `/gorevler` ile hedeflerini takip et, `/basarimlar` ile kalıcı ilerlemeni gör.\n\nTüm komutlar aşağıda kategorilere göre listelenmiştir.')
            .addFields(
                {
                    name: '💸 Para Yönetimi',
                    value: '`/bakiye` — Cüzdan ve banka bakiyeni gösterir\n`/yatir` — Cüzdandan bankaya para yatır\n`/cek` — Bankadan cüzdana para çek\n`/gonder` — Birine MetaCoin gönder',
                    inline: false
                },
                {
                    name: '🎁 Gelir & Ödüller',
                    value: '`/gunluk` — 24 saatte bir ödül al\n`/haftalik` — 7 günde bir ödül al\n`/aylik` — 30 günde bir ödül al\n`/calis` — Her saat çalışarak para kazan\n`/dilen` — 5 dakikada bir dilenerek küçük kazanç',
                    inline: false
                },
                {
                    name: '🦹 Risk & Suç',
                    value: '`/suc` — Suç işle, 2 saatte bir\n`/soy` — Birinin parasını çalmayı dene, 3 saatte bir',
                    inline: false
                },
                {
                    name: '🎰 Kumar',
                    value: '`/kumar` — MetaCoin bahsi yap\n`/yazitura` — Yazı-tura at\n`/slot` — Slot makinesi oyna',
                    inline: false
                },
                {
                    name: '🛒 Market & Envanter',
                    value: '`/market` — Market fiyatlarına bak\n`/satinal` — Eşya veya kasa satın al\n`/envanter` — Envanterini görüntüle\n`/kullan` — Bir eşyayı kullan\n`/sat` — Koleksiyon eşyasını sat',
                    inline: false
                },
                {
                    name: '🏦 Banka & Kredi',
                    value: '`/banka` — Banka hesabı bilgileri\n`/faiz` — Faiz geçmişini ve birikimini gör\n`/banka-yukselt` — Banka limitini artır\n`/kredi` — Kredi al, öde veya sorgula',
                    inline: false
                },
                {
                    name: '📦 Kasa & Koleksiyon',
                    value: '`/kasa` — Kasaları ve içeriklerini görüntüle\n`/kasa-ac` — Envanterindeki kasayı aç',
                    inline: false
                },
                {
                    name: '🏆 Sezon',
                    value: '`/sezon` — Sezon puanın, seviyeni ve sıralamana bak\n`/sezon-siralama` — Sezon liderlik tablosu\n`/sezon-oduller` — Sezon ödül kademeleri\n`/sezon-gecmis` — Geçmiş tamamlanmış sezonlar',
                    inline: false
                },
                {
                    name: '🎯 İlerleme',
                    value: '`/gorevler` — Günlük ve haftalık görevlerini görüntüle, tamamlanan ödülleri al\n`/basarimlar` — Kalıcı başarımlarını, rozetlerini ve ödüllerini görüntüle',
                    inline: false
                },
                {
                    name: '📊 Bilgi & İstatistik',
                    value: '`/profil` — Ekonomi profilini görüntüle\n`/siralama` — Sunucu zenginlik sıralaması\n`/seri` — Günlük seri sıralaması\n`/ekonomi` — Sunucu geneli para istatistikleri\n`/enflasyon` — Piyasa fiyat endeksi ve yorum\n`/bekleme` — Aktif bekleme sürelerini gör',
                    inline: false
                }
            )
            .setFooter({ text: 'Komutların detaylı açıklamaları için Discord slash komut menüsünü kullanabilirsin.' });

        if (isBotOwner(interaction.user.id)) {
            embed.addFields({
                name: '⚙️ Yönetici',
                value: '`/para-ekle` — Kullanıcıya MetaCoin ekle\n`/para-sil` — Kullanıcıdan MetaCoin çıkar\n`/ekonomi-sifirla` — Kullanıcı ekonomisini sıfırla\n`/sezon-yonet` — Sezon yönet (**durum** · **baslat** · **bitir** · **dagit**)',
                inline: false
            });
        }

        return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }
};
