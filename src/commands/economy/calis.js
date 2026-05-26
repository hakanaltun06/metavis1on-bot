const { MessageFlags } = require('discord.js');
const { pool } = require('../../database/pool');
const { ensureUser } = require('../../database/users');
const { addMoney } = require('../../database/money');
const { createEmbed } = require('../../utils/embeds');
const { fmtMoney } = require('../../utils/format');
const { getMins } = require('../../utils/time');
const { COOLDOWNS } = require('../../utils/constants');
const { rollWorkReward } = require('../../services/rewardsService');
const { grantSeasonPoints } = require('../../services/seasonService');

const WORK_JOBS = [
    // Ofis / veri
    'Günlük kayıt dosyalarını gözden geçirdin ve sıraladın.',
    'Basit bir tabloyu kontrol edip eksik satırları tamamladın.',
    'Müşteri listesindeki hatalı kayıtları düzelttiniz.',
    'Kısa bir haftalık rapor taslağı hazırladın.',
    // Depo / lojistik
    'Depodaki ürün etiketlerini kontrol ettin ve eksik kayıtları işaretledin.',
    'Gelen kargo kayıtlarını sisteme düzenli biçimde işledin.',
    'Paketleme bölümüne yardım edip stok listesini güncelledin.',
    'Depo raflarındaki eksikleri tespit edip listeye ekledin.',
    // Satış / destek
    'Müşteri taleplerini öncelik sırasına aldın.',
    'Satış ekibine kısa bir ürün tanıtım listesi hazırladın.',
    'Gelen destek mesajlarını konularına göre kategorilere ayırdın.',
    'Birkaç kullanıcı sorusunu yanıtlamaya yardım ettin ve not tutuldu.',
    // Dijital / içerik
    'Kısa bir duyuru metni taslağı hazırladın.',
    'Küçük bir sayfa metnini gözden geçirip düzelttiniz.',
    'Topluluk etkinliği için gereken notları çıkardın.',
    'Görsel içerikler için kısa açıklama metinleri hazırladın.',
    // Teknik / sistem
    'Küçük bir hata raporunu inceleyip durumu işaretledin.',
    'Sunucu durum kayıtlarını kısaca gözden geçirdin.',
    'Bozuk bağlantıları tespit edip raporladın.',
    'Basit bir otomasyon çıktısını kontrol edip onayladın.',
    // metavis1on ekonomi işleri
    'Market kayıtlarını kontrol edip küçük bir güncelleme yaptın.',
    'Kasa listesi için gerekli veri düzenlemesini tamamladın.',
    'Ekonomi paneli için hazırlık verileri topladın.',
    'Kullanıcı geri bildirimlerini gruplandırıp raporladın.',
    // Serbest / günlük
    'Kısa süreli bir etkinlik görevine yardım ettin.',
    'Dijital arşivde dağınık dosyaları düzenledin.',
    'Küçük bir teslimat planını kontrol edip onayladın.',
    'Birkaç notu derleyip daha okunabilir hale getirdin.',
];

module.exports = {
    data: { name: 'calis', description: 'Çalışıp MetaCoin kazanırsın.' },
    async execute(interaction) {
        const userData = await ensureUser(interaction.user.id);
        const now = new Date();
        const lastDate = userData.last_work ? new Date(userData.last_work) : new Date(0);

        if (now - lastDate < COOLDOWNS.WORK) {
            const left = COOLDOWNS.WORK - (now - lastDate);
            return interaction.reply({
                embeds: [createEmbed('warn', '⏳ Biraz Dinlen',
                    `Yeni iş için **${getMins(left)} dakika** beklemen gerekiyor.\n\nBeklemeyi hızlandırmak için \`/kullan\` ile **Odak Kahvesi** veya **Enerji İçeceği** kullanabilirsin.`)],
                flags: MessageFlags.Ephemeral
            });
        }

        const { reward } = rollWorkReward();
        const job = WORK_JOBS[Math.floor(Math.random() * WORK_JOBS.length)];
        const newWallet = Number(userData.wallet) + reward;
        const newWorkCount = (userData.work_count || 0) + 1;

        await addMoney(interaction.user.id, reward, 'wallet');
        await pool.query('UPDATE economy_users SET last_work = CURRENT_TIMESTAMP, work_count = work_count + 1 WHERE user_id = $1', [interaction.user.id]);

        let seasonGrant = null;
        try {
            seasonGrant = await grantSeasonPoints(interaction.user.id, 8);
        } catch (err) {
            console.error('Sezon puanı eklenemedi (calis):', err?.message);
        }

        const embed = createEmbed('reward', '💼 Mesai Tamamlandı')
            .addFields(
                { name: 'Yaptığın İş', value: job, inline: false },
                { name: 'Kazanç', value: fmtMoney(reward), inline: true },
                { name: 'Yeni Cüzdan', value: fmtMoney(newWallet), inline: true },
                { name: 'Toplam Mesai', value: `**${newWorkCount}** kez`, inline: true }
            )
            .setFooter({ text: 'Daha hızlı çalışmak için /kullan ile Odak Kahvesi veya Enerji İçeceği kullanabilirsin.' });
        if (seasonGrant && seasonGrant.granted > 0) {
            embed.addFields({ name: '🏆 Sezon Puanı', value: `+${seasonGrant.granted} puan`, inline: true });
        }
        await interaction.reply({ embeds: [embed] });
    }
};
