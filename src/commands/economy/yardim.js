const { MessageFlags, StringSelectMenuBuilder, ActionRowBuilder } = require('discord.js');
const { createEmbed } = require('../../utils/embeds');
const { isBotOwner } = require('../../utils/permissions');
const { disableAllComponents } = require('../../utils/componentUtils');

const COLLECTOR_TIMEOUT = 5 * 60 * 1000;

function buildSelectMenu(interactionId, isOwner) {
    const options = [
        { label: '💰 Para',    description: 'Bakiye, transfer ve sıralama',               value: 'money'        },
        { label: '🎁 Gelir',   description: 'Günlük, haftalık, aylık ödüller ve çalışma', value: 'income'       },
        { label: '🎰 Kumar',   description: 'Kumar, yazı-tura ve slot',                    value: 'gambling'     },
        { label: '🥷 Risk',    description: 'Suç ve soygun komutları',                     value: 'risk'         },
        { label: '🛒 Market',  description: 'Alışveriş, envanter ve eşya yönetimi',        value: 'market'       },
        { label: '🏦 Banka',   description: 'Banka, faiz, kredi ve limit',                 value: 'bank'         },
        { label: '📦 Kasa',    description: 'Kasa açma ve koleksiyon eşyaları',            value: 'crate'        },
        { label: '🎯 Görev',   description: 'Günlük ve haftalık görevler',                 value: 'tasks'        },
        { label: '🏅 Başarım', description: 'Kalıcı başarımlar ve rozetler',               value: 'achievements' },
        { label: '⭐ Sezon',   description: 'Sezon puanı, sıralama ve ödüller',            value: 'season'       },
        { label: '📊 Bilgi',   description: 'Profil, istatistik ve bekleme süreleri',      value: 'info'         },
    ];

    if (isOwner) {
        options.push({ label: '⚙️ Yönetici', description: 'Bot sahibine özel yönetim komutları', value: 'admin' });
    }

    return new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId(`help:menu:${interactionId}`)
            .setPlaceholder('Bir yardım kategorisi seç')
            .addOptions(options)
    );
}

function buildDefaultEmbed() {
    return createEmbed('premium', '📘 metavis1on Yardım Merkezi',
        'Komutları kategori kategori incelemek için aşağıdaki menüden bir başlık seç.\n\n' +
        '**İlk kez başlıyorsan:** `/gunluk` → `/calis` → `/gorevler` → `/basarimlar`'
    ).setFooter({ text: 'Menü 5 dakika boyunca aktif kalır.' });
}

const CATEGORY_EMBEDS = {
    money: () => createEmbed('info', '💰 Para',
        '`/bakiye` — Cüzdan ve banka bakiyeni gösterir\n' +
        '`/gonder` — Birine MetaCoin gönder\n' +
        '`/siralama` — Sunucu zenginlik sıralaması'
    ).setFooter({ text: 'Geri dönmek için menüden başka kategori seçebilirsin.' }),

    income: () => createEmbed('reward', '🎁 Gelir',
        '`/gunluk` — 24 saatte bir ödül al\n' +
        '`/haftalik` — 7 günde bir ödül al\n' +
        '`/aylik` — 30 günde bir ödül al\n' +
        '`/calis` — Her saat çalışarak MetaCoin kazan\n' +
        '`/dilen` — 5 dakikada bir küçük kazanç'
    ).setFooter({ text: 'Geri dönmek için menüden başka kategori seçebilirsin.' }),

    gambling: () => createEmbed('info', '🎰 Kumar',
        '`/kumar` — MetaCoin bahsi yap\n' +
        '`/yazitura` — Yazı-tura at\n' +
        '`/slot` — Slot makinesi oyna'
    ).setFooter({ text: 'Geri dönmek için menüden başka kategori seçebilirsin.' }),

    risk: () => createEmbed('risk', '🥷 Risk',
        '`/suc` — Suç işle, 2 saatte bir\n' +
        '`/soy` — Birinin parasını çalmayı dene, 3 saatte bir'
    ).setFooter({ text: 'Geri dönmek için menüden başka kategori seçebilirsin.' }),

    market: () => createEmbed('market', '🛒 Market ve Envanter',
        '`/market` — Ürünleri ve kasaları gör\n' +
        '`/satinal` — Eşya veya kasa satın al\n' +
        '`/envanter` — Sahip olduklarını görüntüle\n' +
        '`/kullan` — Kullanılabilir eşyalarını kullan\n' +
        '`/sat` — Koleksiyon eşyasını sat'
    ).setFooter({ text: 'Geri dönmek için menüden başka kategori seçebilirsin.' }),

    bank: () => createEmbed('bank', '🏦 Banka ve Kredi',
        '`/banka` — Banka hesabı bilgileri\n' +
        '`/yatir` — Cüzdandan bankaya para yatır\n' +
        '`/cek` — Bankadan cüzdana para çek\n' +
        '`/faiz` — Faiz geçmişini ve birikimini gör\n' +
        '`/banka-yukselt` — Banka limitini artır\n' +
        '`/kredi` — Kredi al, öde veya sorgula'
    ).setFooter({ text: 'Geri dönmek için menüden başka kategori seçebilirsin.' }),

    crate: () => createEmbed('crate', '📦 Kasa ve Koleksiyon',
        '`/kasa` — Kasaları ve içeriklerini görüntüle\n' +
        '`/kasa-ac` — Envanterindeki kasayı aç\n\n' +
        'Kasa açarak MetaCoin veya koleksiyon eşyaları kazanabilirsin. Koleksiyon eşyalarını `/sat` ile satabilirsin.'
    ).setFooter({ text: 'Geri dönmek için menüden başka kategori seçebilirsin.' }),

    tasks: () => createEmbed('info', '🎯 Görev',
        '`/gorevler` — Günlük ve haftalık görevlerini görüntüle, tamamlanan ödülleri al\n\n' +
        'Görevleri tamamlayarak MetaCoin ve sezon puanı kazanabilirsin.'
    ).setFooter({ text: 'Geri dönmek için menüden başka kategori seçebilirsin.' }),

    achievements: () => createEmbed('info', '🏅 Başarım',
        '`/basarimlar` — Kalıcı başarımlarını, rozetlerini ve ödüllerini görüntüle\n\n' +
        'Başarımlar kalıcıdır, sezon sıfırlamasından etkilenmez.'
    ).setFooter({ text: 'Geri dönmek için menüden başka kategori seçebilirsin.' }),

    season: () => createEmbed('info', '⭐ Sezon',
        '`/sezon` — Sezon puanın, seviyeni ve sıralamana bak\n' +
        '`/sezon-siralama` — Sezon liderlik tablosu\n' +
        '`/sezon-oduller` — Sezon ödül kademeleri\n' +
        '`/sezon-gecmis` — Geçmiş tamamlanmış sezonlar'
    ).setFooter({ text: 'Geri dönmek için menüden başka kategori seçebilirsin.' }),

    info: () => createEmbed('info', '📊 Bilgi ve İstatistik',
        '`/profil` — Ekonomi profilini görüntüle\n' +
        '`/seri` — Günlük seri sıralaması\n' +
        '`/ekonomi` — Sunucu geneli para istatistikleri\n' +
        '`/enflasyon` — Piyasa fiyat endeksi ve yorum\n' +
        '`/bekleme` — Aktif bekleme sürelerini gör\n' +
        '`/yardim` — Bu yardım menüsü'
    ).setFooter({ text: 'Geri dönmek için menüden başka kategori seçebilirsin.' }),

    admin: () => createEmbed('admin', '⚙️ Yönetici',
        'Bu komutlar yalnızca bot sahibi tarafından kullanılabilir.\n\n' +
        '`/para-ekle` — Kullanıcıya MetaCoin ekle\n' +
        '`/para-sil` — Kullanıcıdan MetaCoin çıkar\n' +
        '`/ekonomi-sifirla` — Kullanıcı ekonomisini sıfırla\n' +
        '`/sezon-yonet` — Sezon yönet (**durum** · **başlat** · **bitir** · **dağıt**)'
    ).setFooter({ text: 'Geri dönmek için menüden başka kategori seçebilirsin.' }),
};

module.exports = {
    data: { name: 'yardim', description: 'Tüm bot komutlarını kategorilere göre listeler.' },
    async execute(interaction) {
        try {
            const isOwner = isBotOwner(interaction.user.id);
            const currentRow = buildSelectMenu(interaction.id, isOwner);

            const message = await interaction.reply({
                embeds: [buildDefaultEmbed()],
                components: [currentRow],
                flags: MessageFlags.Ephemeral,
                fetchReply: true
            });

            const collector = message.createMessageComponentCollector({
                time: COLLECTOR_TIMEOUT,
                filter: i => i.customId === `help:menu:${interaction.id}`
            });

            collector.on('collect', async (menu) => {
                if (menu.user.id !== interaction.user.id) {
                    return menu.reply({
                        content: 'Bu yardım menüsü sana ait değil. Kendi yardım menünü görmek için `/yardim` kullan.',
                        flags: MessageFlags.Ephemeral
                    });
                }

                const category = menu.values[0];
                const embedFn = CATEGORY_EMBEDS[category];
                const embed = embedFn ? embedFn() : buildDefaultEmbed();

                try {
                    await menu.update({ embeds: [embed], components: [currentRow] });
                } catch {
                    // Mesaj silindi veya etkileşim süresi doldu — sessizce geç
                }
            });

            collector.on('end', async () => {
                try {
                    await interaction.editReply({ components: disableAllComponents([currentRow]) });
                } catch {
                    // Mesaj artık mevcut değil — sessizce geç
                }
            });

        } catch (err) {
            console.error('Yardım komutu hatası:', err?.message);
            const errorEmbed = createEmbed('error', '⚠️ Bir Aksilik Oldu', 'Yardım menüsü şu an yüklenemiyor. Biraz sonra tekrar dene.');
            try {
                if (interaction.replied || interaction.deferred) {
                    await interaction.followUp({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
                } else {
                    await interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
                }
            } catch {
                // ignore
            }
        }
    }
};
