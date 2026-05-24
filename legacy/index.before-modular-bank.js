/**
 * ============================================================================
 * metavis1on — Discord Ekonomi Botu (Tek Dosya Mimarisi)
 * ============================================================================
 * Node.js, Discord.js v14, PostgreSQL (pg)
 *
 * GELECEK GELİŞTİRMELER İÇİN PLAN NOTU
 * Aşağıdaki sistemler ileride parça parça eklenecek.
 *  - Enflasyon sistemi (ekonomi büyüdükçe fiyatların oransal artması)
 *  - Banka hesabı geliştirmesi (TEMELİ BU AŞAMADA: seviye, kapasite, faiz)
 *  - Kredi sistemi (borç çekme, ödeme, kredi skoru)
 *  - Market fiyat dalgalanması (arz/talep tabanlı dinamik fiyat)
 *  - Vergi sistemi (transfer ve kumar kazançlarından küçük kesintiler)
 *  - Sunucu ekonomisi raporu (haftalık/aylık özet)
 *  - Zenginlik seviyesi (servete göre unvan ve rozet)
 *  - Riskli kazanç yolları (yeni iş kolları, görevler)
 *  - Kasa ve nadir eşya sistemi (kasa açma, drop tablosu)
 *  - Sezon sistemi (dönemsel ödüller, sezon sonu fotoğrafı)
 * ============================================================================
 */

require('dotenv').config();
const { Client, GatewayIntentBits, EmbedBuilder, Collection, REST, Routes } = require('discord.js');
const { Pool } = require('pg');
const express = require('express');

// ================== [ AYARLAR VE SABİTLER ] ==================
const CURRENCY = "🪙";
const CURRENCY_NAME = "MetaCoin";
const COLOR_SUCCESS = "#00FF7F";
const COLOR_ERROR = "#FF4500";
const COLOR_INFO = "#1E90FF";
const COLOR_WARNING = "#FFA500";
const COLOR_PREMIUM = "#FFD700";

// Sahibin Discord kullanıcı kimliği (yetkili komutlar için)
const OWNER_ID = process.env.OWNER_ID;

// Geçici bekleme süreleri belleği (hızlı komutlar için)
const localCooldowns = new Collection();

// ================== [ BANKA AYARLARI ] ==================
// Her seviye, açtığı kapasiteyi ve bir sonraki seviyeye geçiş ücretini taşır.
// Seviye 1 ücretsizdir (yeni hesabın başlangıç durumudur).
const BANK_LEVELS = [
    { level: 1,  limit: 50000,     upgradeCost: 0 },
    { level: 2,  limit: 150000,    upgradeCost: 25000 },
    { level: 3,  limit: 400000,    upgradeCost: 75000 },
    { level: 4,  limit: 1000000,   upgradeCost: 200000 },
    { level: 5,  limit: 2500000,   upgradeCost: 500000 },
    { level: 6,  limit: 5000000,   upgradeCost: 1250000 },
    { level: 7,  limit: 10000000,  upgradeCost: 3000000 },
    { level: 8,  limit: 25000000,  upgradeCost: 7500000 },
    { level: 9,  limit: 50000000,  upgradeCost: 18000000 },
    { level: 10, limit: 100000000, upgradeCost: 45000000 }
];

const INTEREST_INTERVAL_MS = 12 * 60 * 60 * 1000; // 12 saat
const INTEREST_RATE = 0.02; // %2

function getBankLevelDef(level) {
    const n = Math.max(1, Math.min(BANK_LEVELS.length, Number(level) || 1));
    return BANK_LEVELS[n - 1];
}

// ================== [ VERİTABANI KURULUMU ] ==================
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    // Uzak sunucularda SSL gerekirse (örn: Supabase, Render):
    // ssl: { rejectUnauthorized: false }
});

pool.on('error', (err) => {
    console.error('Beklenmeyen Veritabanı Hatası:', err);
});

async function initDB() {
    const client = await pool.connect();
    try {
        await client.query(`
            CREATE TABLE IF NOT EXISTS economy_users (
                user_id VARCHAR(25) PRIMARY KEY,
                wallet BIGINT DEFAULT 0,
                bank BIGINT DEFAULT 0,
                daily_streak INT DEFAULT 0,
                total_earned BIGINT DEFAULT 0,
                total_lost BIGINT DEFAULT 0,
                work_count INT DEFAULT 0,
                gamble_count INT DEFAULT 0,
                rob_success INT DEFAULT 0,
                rob_fail INT DEFAULT 0,
                last_daily TIMESTAMP,
                last_weekly TIMESTAMP,
                last_monthly TIMESTAMP,
                last_work TIMESTAMP,
                last_crime TIMESTAMP,
                last_rob TIMESTAMP,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                last_active TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS economy_inventory (
                id SERIAL PRIMARY KEY,
                user_id VARCHAR(25) REFERENCES economy_users(user_id) ON DELETE CASCADE,
                item_id VARCHAR(50),
                quantity INT DEFAULT 1,
                UNIQUE(user_id, item_id)
            );

            CREATE TABLE IF NOT EXISTS economy_transactions (
                id SERIAL PRIMARY KEY,
                user_id VARCHAR(25),
                target_id VARCHAR(25),
                type VARCHAR(50),
                amount BIGINT,
                description TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            ALTER TABLE economy_users ADD COLUMN IF NOT EXISTS last_beg TIMESTAMP;
            ALTER TABLE economy_users ADD COLUMN IF NOT EXISTS bank_limit BIGINT DEFAULT 50000;
            ALTER TABLE economy_users ADD COLUMN IF NOT EXISTS bank_level INTEGER DEFAULT 1;
            ALTER TABLE economy_users ADD COLUMN IF NOT EXISTS last_interest TIMESTAMP;
            ALTER TABLE economy_users ADD COLUMN IF NOT EXISTS total_interest_earned BIGINT DEFAULT 0;
        `);
        console.log('✅ Veritabanı tabloları hazır.');
    } finally {
        client.release();
    }
}

// ================== [ İŞLEM SARMALAYICI (TRANSACTION) ] ==================
// Birden fazla SQL adımını atomik çalıştırmak için kullanılır.
// Hata olursa otomatik ROLLBACK yapılır; başarılıysa COMMIT.
async function withTx(fn) {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const result = await fn(client);
        await client.query('COMMIT');
        return result;
    } catch (err) {
        try { await client.query('ROLLBACK'); } catch (_) {}
        throw err;
    } finally {
        client.release();
    }
}

// ================== [ EŞYA TANIMLARI ] ==================
const SHOP_ITEMS = [
    { id: 'rob_shield', name: '🛡️ Soygun Kalkanı', desc: 'Seni bir soygundan korur. (Pasif)', price: 15000, type: 'passive' },
    { id: 'lucky_amulet', name: '🍀 Şans Tılsımı', desc: 'Kumar oyunlarında şansını %5 artırır. (Pasif)', price: 50000, type: 'passive' },
    { id: 'energy_drink', name: '⚡ Enerji İçeceği', desc: 'Çalışma ve suç bekleme sürelerini anında sıfırlar. (Kullanılabilir)', price: 7500, type: 'consumable' },
    { id: 'vip_badge', name: '💎 VIP Rozeti', desc: 'Profili süsler, prestij göstergesidir.', price: 500000, type: 'flex' }
];

// ================== [ YARDIMCI FONKSİYONLAR ] ==================
const formatNumber = (num) => Intl.NumberFormat('en-US', { notation: 'compact', compactDisplay: 'short' }).format(num);
const formatFull = (num) => new Intl.NumberFormat('tr-TR').format(num);
const rand = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const getMins = (ms) => Math.ceil(ms / 60000);

const fmtMoney = (n) => `**${formatFull(n)} ${CURRENCY_NAME}** ${CURRENCY}`;
const fmtMoneyShort = (n) => `**${formatNumber(n)} ${CURRENCY_NAME}** ${CURRENCY}`;

function createEmbed(type, title, desc = '') {
    const embed = new EmbedBuilder().setTitle(title).setDescription(desc);
    if (type === 'success') embed.setColor(COLOR_SUCCESS);
    if (type === 'error') embed.setColor(COLOR_ERROR);
    if (type === 'info') embed.setColor(COLOR_INFO);
    if (type === 'warn') embed.setColor(COLOR_WARNING);
    if (type === 'premium') embed.setColor(COLOR_PREMIUM);
    return embed;
}

// ================== [ VERİTABANI YARDIMCILARI ] ==================
// Bu yardımcılar hem havuz (pool) hem de transaction istemcisi ile çalışabilir.
// db parametresi verilmezse varsayılan olarak havuz kullanılır.

async function ensureUser(userId, db = pool) {
    await db.query('INSERT INTO economy_users (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING', [userId]);
    await db.query('UPDATE economy_users SET last_active = CURRENT_TIMESTAMP WHERE user_id = $1', [userId]);
    const res = await db.query('SELECT * FROM economy_users WHERE user_id = $1', [userId]);
    return res.rows[0];
}

async function addMoney(userId, amount, type = 'wallet', db = pool) {
    const field = type === 'bank' ? 'bank' : 'wallet';
    await db.query(`UPDATE economy_users SET ${field} = ${field} + $1, total_earned = total_earned + CASE WHEN $1 > 0 THEN $1 ELSE 0 END WHERE user_id = $2`, [amount, userId]);
}

async function removeMoney(userId, amount, type = 'wallet', db = pool) {
    const field = type === 'bank' ? 'bank' : 'wallet';
    await db.query(`UPDATE economy_users SET ${field} = ${field} - $1, total_lost = total_lost + $1 WHERE user_id = $2`, [amount, userId]);
}

async function logTransaction(userId, targetId, type, amount, desc, db = pool) {
    await db.query('INSERT INTO economy_transactions (user_id, target_id, type, amount, description) VALUES ($1, $2, $3, $4, $5)', [userId, targetId, type, amount, desc]);
}

async function checkItem(userId, itemId, db = pool) {
    const res = await db.query('SELECT quantity FROM economy_inventory WHERE user_id = $1 AND item_id = $2', [userId, itemId]);
    return res.rows.length > 0 ? res.rows[0].quantity : 0;
}

async function consumeItem(userId, itemId, amount = 1, db = pool) {
    await db.query('UPDATE economy_inventory SET quantity = quantity - $1 WHERE user_id = $2 AND item_id = $3', [amount, userId, itemId]);
    await db.query('DELETE FROM economy_inventory WHERE quantity <= 0 AND user_id = $1 AND item_id = $2', [userId, itemId]);
}

// ================== [ KOMUT KAYDI VE MANTIĞI ] ==================
const commands = {};

// --- 1. TEMEL KOMUTLAR ---
commands['bakiye'] = {
    data: { name: 'bakiye', description: 'Cüzdanını ve bankadaki paranı gösterir.', options: [{ name: 'kullanici', description: 'Başka birinin bakiyesine bakmak için seç.', type: 6, required: false }] },
    async execute(interaction) {
        const target = interaction.options.getUser('kullanici') || interaction.user;
        if (target.bot) return interaction.reply({ embeds: [createEmbed('error', '❌ Olmaz', 'Botların bakiyesi olmaz.')], ephemeral: true });

        const userData = await ensureUser(target.id);
        const total = Number(userData.wallet) + Number(userData.bank);
        const limit = Number(userData.bank_limit) || BANK_LEVELS[0].limit;
        const level = userData.bank_level || 1;

        const embed = createEmbed('info', `💳 ${target.username} — Bakiye`)
            .addFields(
                { name: 'Cüzdan', value: fmtMoney(userData.wallet), inline: true },
                { name: 'Banka', value: `🏦 ${fmtMoney(userData.bank)}`, inline: true },
                { name: 'Toplam Servet', value: fmtMoney(total), inline: false },
                { name: 'Banka Seviyesi', value: `**${level}**`, inline: true },
                { name: 'Banka Kapasitesi', value: fmtMoney(limit), inline: true }
            )
            .setThumbnail(target.displayAvatarURL());
        await interaction.reply({ embeds: [embed] });
    }
};

commands['yatir'] = {
    data: { name: 'yatir', description: 'Cüzdanındaki parayı bankaya yatırır.', options: [{ name: 'miktar', description: 'Yatırılacak miktar. Hepsi için "hepsi" yazabilirsin.', type: 3, required: true }] },
    async execute(interaction) {
        const amountStr = interaction.options.getString('miktar').toLowerCase();
        try {
            const result = await withTx(async (db) => {
                const u = await ensureUser(interaction.user.id, db);
                const wallet = Number(u.wallet);
                const bank = Number(u.bank);
                const limit = Number(u.bank_limit) || BANK_LEVELS[0].limit;
                const room = Math.max(0, limit - bank);

                const isAll = amountStr === 'hepsi' || amountStr === 'all';
                let amount = isAll ? Math.min(wallet, room) : parseInt(amountStr);

                if (isNaN(amount) || amount <= 0) return { kind: 'invalid' };
                if (wallet < amount) return { kind: 'no_wallet' };
                if (room <= 0) return { kind: 'full' };
                if (amount > room) return { kind: 'over', room };

                await db.query('UPDATE economy_users SET wallet = wallet - $1, bank = bank + $1 WHERE user_id = $2', [amount, interaction.user.id]);
                return { kind: 'ok', amount };
            });

            if (result.kind === 'invalid') return interaction.reply({ embeds: [createEmbed('error', '❌ Geçersiz Miktar', 'Geçerli bir sayı yaz.')], ephemeral: true });
            if (result.kind === 'no_wallet') return interaction.reply({ embeds: [createEmbed('error', '❌ Yetersiz Bakiye', 'Cüzdanında bu kadar para yok.')], ephemeral: true });
            if (result.kind === 'full') return interaction.reply({ embeds: [createEmbed('warn', '🏦 Banka Dolu', 'Bankanda yer kalmamış. Kapasiteni artırman gerekiyor. `/banka-yukselt` ile seviyeni yükseltebilirsin.')], ephemeral: true });
            if (result.kind === 'over') return interaction.reply({ embeds: [createEmbed('warn', '🏦 Yer Yetersiz', `Bankanda sadece ${fmtMoney(result.room)} kadar yer var. Daha fazlasını yatırabilmek için kapasiteni artır.`)], ephemeral: true });
            return interaction.reply({ embeds: [createEmbed('success', '🏦 Bankaya Yatırıldı', `${fmtMoney(result.amount)} bankaya geçti.`)] });
        } catch (err) {
            console.error('Yatır hatası:', err);
            return interaction.reply({ embeds: [createEmbed('error', '⚠️ Bir Aksilik Oldu', 'İşlem sırasında bir sorun çıktı. Biraz sonra tekrar dener misin?')], ephemeral: true });
        }
    }
};

commands['cek'] = {
    data: { name: 'cek', description: 'Bankadaki parayı cüzdanına çeker.', options: [{ name: 'miktar', description: 'Çekilecek miktar. Hepsi için "hepsi" yazabilirsin.', type: 3, required: true }] },
    async execute(interaction) {
        const amountStr = interaction.options.getString('miktar').toLowerCase();
        try {
            const result = await withTx(async (db) => {
                const u = await ensureUser(interaction.user.id, db);
                const bank = Number(u.bank);
                const isAll = amountStr === 'hepsi' || amountStr === 'all';
                let amount = isAll ? bank : parseInt(amountStr);

                if (isNaN(amount) || amount <= 0) return { kind: 'invalid' };
                if (bank < amount) return { kind: 'no_bank' };

                await db.query('UPDATE economy_users SET bank = bank - $1, wallet = wallet + $1 WHERE user_id = $2', [amount, interaction.user.id]);
                return { kind: 'ok', amount };
            });

            if (result.kind === 'invalid') return interaction.reply({ embeds: [createEmbed('error', '❌ Geçersiz Miktar', 'Geçerli bir sayı yaz.')], ephemeral: true });
            if (result.kind === 'no_bank') return interaction.reply({ embeds: [createEmbed('error', '❌ Yetersiz Bakiye', 'Bankanda bu kadar para yok.')], ephemeral: true });
            return interaction.reply({ embeds: [createEmbed('success', '🏦 Para Çekildi', `${fmtMoney(result.amount)} cüzdanına geçti.`)] });
        } catch (err) {
            console.error('Çek hatası:', err);
            return interaction.reply({ embeds: [createEmbed('error', '⚠️ Bir Aksilik Oldu', 'İşlem sırasında bir sorun çıktı. Biraz sonra tekrar dener misin?')], ephemeral: true });
        }
    }
};

commands['gonder'] = {
    data: {
        name: 'gonder',
        description: 'Başka bir kullanıcıya MetaCoin gönderir.',
        options: [
            { name: 'kullanici', description: 'Parayı kime göndereceksin?', type: 6, required: true },
            { name: 'miktar', description: 'Gönderilecek miktar.', type: 4, required: true }
        ]
    },
    async execute(interaction) {
        const target = interaction.options.getUser('kullanici');
        const amount = interaction.options.getInteger('miktar');

        if (target.id === interaction.user.id) return interaction.reply({ embeds: [createEmbed('warn', '❌ Olmaz', 'Kendine para gönderemezsin.')], ephemeral: true });
        if (target.bot) return interaction.reply({ embeds: [createEmbed('warn', '❌ Olmaz', 'Botlara para gönderemezsin.')], ephemeral: true });
        if (amount <= 0) return interaction.reply({ embeds: [createEmbed('warn', '❌ Geçersiz Miktar', 'Miktar sıfırdan büyük olmalı.')], ephemeral: true });

        try {
            const result = await withTx(async (db) => {
                const sender = await ensureUser(interaction.user.id, db);
                await ensureUser(target.id, db);
                if (Number(sender.wallet) < amount) return { kind: 'no_money' };

                await db.query('UPDATE economy_users SET wallet = wallet - $1 WHERE user_id = $2', [amount, interaction.user.id]);
                await db.query('UPDATE economy_users SET wallet = wallet + $1 WHERE user_id = $2', [amount, target.id]);
                await logTransaction(interaction.user.id, target.id, 'transfer', amount, 'Kullanıcıdan kullanıcıya transfer', db);
                return { kind: 'ok' };
            });

            if (result.kind === 'no_money') return interaction.reply({ embeds: [createEmbed('error', '❌ Yetersiz Bakiye', 'Cüzdanında yeterli paran yok.')], ephemeral: true });
            return interaction.reply({ embeds: [createEmbed('success', '💸 Para Gönderildi', `**${target.username}** kişisine ${fmtMoney(amount)} gönderdin.`)] });
        } catch (err) {
            console.error('Gönder hatası:', err);
            return interaction.reply({ embeds: [createEmbed('error', '⚠️ Bir Aksilik Oldu', 'İşlem sırasında bir sorun çıktı. Biraz sonra tekrar dener misin?')], ephemeral: true });
        }
    }
};

// --- 2. GELİR VE ÖDÜLLER ---
commands['gunluk'] = {
    data: { name: 'gunluk', description: 'Günlük ödülünü alırsın ve serini korursun.' },
    async execute(interaction) {
        const userData = await ensureUser(interaction.user.id);
        const now = new Date();
        const lastDaily = userData.last_daily ? new Date(userData.last_daily) : new Date(0);
        const diffMs = now - lastDaily;
        const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

        if (diffMs < 86400000) {
            const left = 86400000 - diffMs;
            const hours = Math.floor(left / 3600000);
            const mins = Math.floor((left % 3600000) / 60000);
            return interaction.reply({ embeds: [createEmbed('warn', '⏳ Bekleme Süresi', `Günlük ödülünü zaten aldın. **${hours} saat ${mins} dakika** sonra tekrar uğra.`)], ephemeral: true });
        }

        let newStreak = userData.daily_streak;
        if (diffDays === 1 || userData.daily_streak === 0) {
            newStreak += 1;
        } else {
            newStreak = 1;
        }

        const baseReward = 500;
        const streakBonus = Math.min(newStreak * 50, 1000);
        const totalReward = baseReward + streakBonus;

        await addMoney(interaction.user.id, totalReward, 'wallet');
        await pool.query('UPDATE economy_users SET daily_streak = $1, last_daily = CURRENT_TIMESTAMP WHERE user_id = $2', [newStreak, interaction.user.id]);

        const embed = createEmbed('success', '🎁 Günlük Ödül', `Günün iyi geçsin. Cüzdanına para eklendi.`)
            .addFields(
                { name: 'Kazandığın', value: fmtMoney(totalReward), inline: true },
                { name: 'Güncel Seri', value: `🔥 **${newStreak} gün** (+${streakBonus} bonus)`, inline: true }
            );
        if (diffDays > 1 && userData.daily_streak > 0) {
            embed.setFooter({ text: 'Bir günden fazla beklediğin için serin sıfırlandı.' });
        }
        await interaction.reply({ embeds: [embed] });
    }
};

commands['haftalik'] = {
    data: { name: 'haftalik', description: 'Haftalık büyük ödülünü alırsın.' },
    async execute(interaction) {
        const userData = await ensureUser(interaction.user.id);
        const now = new Date();
        const lastDate = userData.last_weekly ? new Date(userData.last_weekly) : new Date(0);
        if (now - lastDate < 604800000) {
            return interaction.reply({ embeds: [createEmbed('warn', '⏳ Bekleme Süresi', `Haftalık ödül için **${Math.ceil((604800000 - (now - lastDate))/86400000)} gün** beklemen gerek.`)], ephemeral: true });
        }
        const reward = 5000;
        await addMoney(interaction.user.id, reward, 'wallet');
        await pool.query('UPDATE economy_users SET last_weekly = CURRENT_TIMESTAMP WHERE user_id = $1', [interaction.user.id]);
        await interaction.reply({ embeds: [createEmbed('success', '🗓️ Haftalık Ödül', `${fmtMoney(reward)} cüzdanına eklendi.`)] });
    }
};

commands['aylik'] = {
    data: { name: 'aylik', description: 'Aylık dev ödülünü alırsın.' },
    async execute(interaction) {
        const userData = await ensureUser(interaction.user.id);
        const now = new Date();
        const lastDate = userData.last_monthly ? new Date(userData.last_monthly) : new Date(0);
        if (now - lastDate < 2592000000) {
            return interaction.reply({ embeds: [createEmbed('warn', '⏳ Bekleme Süresi', `Aylık ödül için **${Math.ceil((2592000000 - (now - lastDate))/86400000)} gün** beklemen gerek.`)], ephemeral: true });
        }
        const reward = 25000;
        await addMoney(interaction.user.id, reward, 'wallet');
        await pool.query('UPDATE economy_users SET last_monthly = CURRENT_TIMESTAMP WHERE user_id = $1', [interaction.user.id]);
        await interaction.reply({ embeds: [createEmbed('success', '🏆 Aylık Ödül', `${fmtMoney(reward)} cüzdanına eklendi. Keyfini çıkar.`)] });
    }
};

commands['calis'] = {
    data: { name: 'calis', description: 'Çalışıp MetaCoin kazanırsın.' },
    async execute(interaction) {
        const userData = await ensureUser(interaction.user.id);
        const now = new Date();
        const lastDate = userData.last_work ? new Date(userData.last_work) : new Date(0);

        if (now - lastDate < 3600000) {
            const left = 3600000 - (now - lastDate);
            return interaction.reply({ embeds: [createEmbed('warn', '⏳ Yoruldun', `Biraz nefes al. Yeni iş için **${getMins(left)} dakika** dinlen.`)], ephemeral: true });
        }

        const jobs = [
            "Bir yazılım firmasında küçük bir hatayı düzelttin",
            "Discord sunucusu kurup sattın",
            "Kafede barista olarak çalıştın",
            "Eski eşyalarını internetten sattın",
            "Serbest çalışan olarak grafik tasarım yaptın",
            "Bir gün taksi şoförlüğü yaptın"
        ];
        const reward = rand(150, 450);
        const job = jobs[rand(0, jobs.length - 1)];

        await addMoney(interaction.user.id, reward, 'wallet');
        await pool.query('UPDATE economy_users SET last_work = CURRENT_TIMESTAMP, work_count = work_count + 1 WHERE user_id = $1', [interaction.user.id]);

        await interaction.reply({ embeds: [createEmbed('success', '💼 Mesai Tamam', `${job} ve ${fmtMoney(reward)} kazandın.`)] });
    }
};

commands['dilen'] = {
    data: { name: 'dilen', description: 'Sokakta dilenirsin. Bazen işe yarar.' },
    async execute(interaction) {
        const userData = await ensureUser(interaction.user.id);
        const now = new Date();
        const lastDate = userData.last_beg ? new Date(userData.last_beg) : new Date(0);

        if (now - lastDate < 300000) {
            return interaction.reply({ embeds: [createEmbed('warn', '⏳ Bekleme Süresi', `İnsanlar şu an seninle uğraşmıyor. **${getMins(300000 - (now - lastDate))} dk** sonra tekrar dene.`)], ephemeral: true });
        }

        await pool.query('UPDATE economy_users SET last_beg = CURRENT_TIMESTAMP WHERE user_id = $1', [interaction.user.id]);

        if (Math.random() < 0.3) {
            return interaction.reply({ embeds: [createEmbed('error', '😢 Eli Boş Döndün', 'Kimse sana para vermedi.')] });
        }

        const reward = rand(10, 80);
        await addMoney(interaction.user.id, reward, 'wallet');
        await interaction.reply({ embeds: [createEmbed('success', '🤲 Bağış', `Yoldan geçen biri acıdı ve sana ${fmtMoney(reward)} verdi.`)] });
    }
};

// --- 3. RİSKLİ VE OYUNCULAR ARASI KOMUTLAR ---
commands['suc'] = {
    data: { name: 'suc', description: 'Yasadışı işlere bulaşırsın. Kazanç büyük, risk yüksek.' },
    async execute(interaction) {
        const userData = await ensureUser(interaction.user.id);
        const now = new Date();
        const lastDate = userData.last_crime ? new Date(userData.last_crime) : new Date(0);

        if (now - lastDate < 7200000) {
            return interaction.reply({ embeds: [createEmbed('warn', '🚔 Ortalık Kızgın', `Polis peşinde. **${getMins(7200000 - (now - lastDate))} dk** ortalıktan kaybol.`)], ephemeral: true });
        }

        await pool.query('UPDATE economy_users SET last_crime = CURRENT_TIMESTAMP WHERE user_id = $1', [interaction.user.id]);

        const win = Math.random() < 0.45;
        if (win) {
            const reward = rand(600, 1500);
            const scenarios = ["Para nakil aracını soydun", "Gizli belgeleri sızdırdın", "Tefeciyi dolandırdın"];
            await addMoney(interaction.user.id, reward, 'wallet');
            return interaction.reply({ embeds: [createEmbed('error', '🕵️ İş Bitti', `${scenarios[rand(0,2)]} ve kimseye yakalanmadan kaçtın.\nKazandığın: ${fmtMoney(reward)}`).setColor('#8B0000')] });
        } else {
            const penalty = rand(300, 800);
            const realPenalty = Math.min(penalty, Number(userData.wallet));
            await removeMoney(interaction.user.id, realPenalty, 'wallet');
            return interaction.reply({ embeds: [createEmbed('error', '🚔 Yakalandın', `Plan ters gitti. Ceza olarak ${fmtMoney(realPenalty)} ödedin.`)] });
        }
    }
};

commands['soy'] = {
    data: { name: 'soy', description: 'Başka bir kullanıcının cüzdanını soymayı denersin.', options: [{ name: 'hedef', description: 'Kimi soymak istiyorsun?', type: 6, required: true }] },
    async execute(interaction) {
        const target = interaction.options.getUser('hedef');
        if (target.id === interaction.user.id) return interaction.reply({ embeds: [createEmbed('warn', '❌ Olmaz', 'Kendini soyamazsın.')], ephemeral: true });
        if (target.bot) return interaction.reply({ embeds: [createEmbed('warn', '❌ Olmaz', 'Botların üzerinde nakit taşımaz.')], ephemeral: true });

        try {
            const result = await withTx(async (db) => {
                const userData = await ensureUser(interaction.user.id, db);
                const targetData = await ensureUser(target.id, db);

                const now = new Date();
                const lastDate = userData.last_rob ? new Date(userData.last_rob) : new Date(0);
                if (now - lastDate < 10800000) {
                    return { kind: 'cooldown', leftMs: 10800000 - (now - lastDate) };
                }
                if (Number(userData.wallet) < 500) return { kind: 'self_poor' };
                if (Number(targetData.wallet) < 500) return { kind: 'target_poor' };

                const hasShield = await checkItem(target.id, 'rob_shield', db);
                if (hasShield > 0) {
                    await consumeItem(target.id, 'rob_shield', 1, db);
                    await db.query('UPDATE economy_users SET last_rob = CURRENT_TIMESTAMP WHERE user_id = $1', [interaction.user.id]);
                    return { kind: 'shielded' };
                }

                await db.query('UPDATE economy_users SET last_rob = CURRENT_TIMESTAMP WHERE user_id = $1', [interaction.user.id]);

                const win = Math.random() < 0.4;
                if (win) {
                    const pct = rand(10, 25) / 100;
                    const stolen = Math.floor(Number(targetData.wallet) * pct);
                    await db.query('UPDATE economy_users SET wallet = wallet - $1, total_lost = total_lost + $1 WHERE user_id = $2', [stolen, target.id]);
                    await db.query('UPDATE economy_users SET wallet = wallet + $1, total_earned = total_earned + $1, rob_success = rob_success + 1 WHERE user_id = $2', [stolen, interaction.user.id]);
                    return { kind: 'success', stolen };
                } else {
                    const penalty = Math.floor(Number(userData.wallet) * 0.15);
                    await db.query('UPDATE economy_users SET wallet = wallet - $1, total_lost = total_lost + $1, rob_fail = rob_fail + 1 WHERE user_id = $2', [penalty, interaction.user.id]);
                    return { kind: 'caught', penalty };
                }
            });

            if (result.kind === 'cooldown') {
                return interaction.reply({ embeds: [createEmbed('warn', '⏳ Bekleme Süresi', `Yeni bir plan kurmak için **${getMins(result.leftMs)} dk** beklemen gerek.`)], ephemeral: true });
            }
            if (result.kind === 'self_poor') {
                return interaction.reply({ embeds: [createEmbed('error', '❌ Cebin Boş', `Soygun planı için cüzdanında en az 500 ${CURRENCY_NAME} olmalı.`)], ephemeral: true });
            }
            if (result.kind === 'target_poor') {
                return interaction.reply({ embeds: [createEmbed('error', '❌ Değmez', 'Hedefin cüzdanı çok zayıf. Buna değmez.')], ephemeral: true });
            }
            if (result.kind === 'shielded') {
                return interaction.reply({ embeds: [createEmbed('info', '🛡️ Engellendi', `${target.username} kişisinde **Soygun Kalkanı** vardı. Kalkan kırıldı ama hedef güvende.`)] });
            }
            if (result.kind === 'success') {
                return interaction.reply({ embeds: [createEmbed('success', '🥷 Soygun Başarılı', `${target.username} uyurken cüzdanına girdin.\nÇaldığın: ${fmtMoney(result.stolen)}`)] });
            }
            return interaction.reply({ embeds: [createEmbed('error', '🚔 Yakalandın', `Hedef uyandı. Kaçarken ${fmtMoney(result.penalty)} düşürdün.`)] });
        } catch (err) {
            console.error('Soy hatası:', err);
            return interaction.reply({ embeds: [createEmbed('error', '⚠️ Bir Aksilik Oldu', 'İşlem sırasında bir sorun çıktı. Biraz sonra tekrar dener misin?')], ephemeral: true });
        }
    }
};

// --- 4. KUMAR ---
async function handleGamble(interaction, gameName, amount, winMultiplier, winChanceBase) {
    const userData = await ensureUser(interaction.user.id);
    if (Number(userData.wallet) < amount) {
        await interaction.reply({ embeds: [createEmbed('error', '❌ Yetersiz Bakiye', `Cüzdanında ${fmtMoney(amount)} yok.`)], ephemeral: true });
        return false;
    }

    const hasAmulet = await checkItem(interaction.user.id, 'lucky_amulet');
    const finalChance = hasAmulet > 0 ? winChanceBase + 0.05 : winChanceBase;

    await pool.query('UPDATE economy_users SET gamble_count = gamble_count + 1 WHERE user_id = $1', [interaction.user.id]);

    const win = Math.random() < finalChance;
    if (win) {
        const profit = Math.floor(amount * winMultiplier) - amount;
        await addMoney(interaction.user.id, profit, 'wallet');
        return true;
    } else {
        await removeMoney(interaction.user.id, amount, 'wallet');
        return false;
    }
}

commands['kumar'] = {
    data: { name: 'kumar', description: 'Zar atarak şansını denersin.', options: [{ name: 'miktar', description: 'Bahis miktarı', type: 4, required: true }] },
    async execute(interaction) {
        const amount = interaction.options.getInteger('miktar');
        if (amount < 50) return interaction.reply({ embeds: [createEmbed('warn', '❌ Düşük Bahis', 'En düşük bahis 50.')], ephemeral: true });

        const win = await handleGamble(interaction, 'kumar', amount, 2.0, 0.45);
        if (win === undefined) return;

        if (win) {
            interaction.reply({ embeds: [createEmbed('success', '🎲 Kazandın', `Zarlar lehine geldi. ${fmtMoney(amount)} kâr ettin.`)] });
        } else {
            interaction.reply({ embeds: [createEmbed('error', '🎲 Kaybettin', `Zar kötü düştü. ${fmtMoney(amount)} kaybettin.`)] });
        }
    }
};

commands['yazitura'] = {
    data: {
        name: 'yazitura', description: 'Yazı tura atarsın.',
        options: [
            { name: 'secim', description: 'Yazı mı tura mı?', type: 3, required: true, choices: [{ name: 'Yazı', value: 'yazi' }, { name: 'Tura', value: 'tura' }] },
            { name: 'miktar', description: 'Bahis miktarı', type: 4, required: true }
        ]
    },
    async execute(interaction) {
        const choice = interaction.options.getString('secim');
        const amount = interaction.options.getInteger('miktar');
        if (amount < 10) return interaction.reply({ embeds: [createEmbed('warn', '❌ Düşük Bahis', 'En düşük bahis 10.')], ephemeral: true });

        const userData = await ensureUser(interaction.user.id);
        if (Number(userData.wallet) < amount) return interaction.reply({ embeds: [createEmbed('error', '❌ Yetersiz Bakiye', 'Cüzdanında yeterli paran yok.')], ephemeral: true });

        const result = Math.random() < 0.5 ? 'yazi' : 'tura';
        const win = choice === result;

        await pool.query('UPDATE economy_users SET gamble_count = gamble_count + 1 WHERE user_id = $1', [interaction.user.id]);

        const resultLabel = result === 'yazi' ? 'YAZI' : 'TURA';

        if (win) {
            await addMoney(interaction.user.id, amount, 'wallet');
            interaction.reply({ embeds: [createEmbed('success', '🪙 Para Döndü', `Para **${resultLabel}** geldi. Doğru bildin.\nKazandığın: ${fmtMoney(amount)}`)] });
        } else {
            await removeMoney(interaction.user.id, amount, 'wallet');
            interaction.reply({ embeds: [createEmbed('error', '🪙 Para Döndü', `Para **${resultLabel}** geldi. Yanlış bildin.\nKaybettiğin: ${fmtMoney(amount)}`)] });
        }
    }
};

commands['slot'] = {
    data: { name: 'slot', description: 'Slot makinesini çevirirsin.', options: [{ name: 'miktar', description: 'Bahis miktarı', type: 4, required: true }] },
    async execute(interaction) {
        const amount = interaction.options.getInteger('miktar');
        if (amount < 100) return interaction.reply({ embeds: [createEmbed('warn', '❌ Düşük Bahis', 'En düşük bahis 100.')], ephemeral: true });

        const userData = await ensureUser(interaction.user.id);
        if (Number(userData.wallet) < amount) return interaction.reply({ embeds: [createEmbed('error', '❌ Yetersiz Bakiye', 'Cüzdanında yeterli paran yok.')], ephemeral: true });

        const emojis = ['🍒', '🍋', '🍉', '⭐', '💎'];
        const reel1 = emojis[rand(0, emojis.length-1)];
        const reel2 = emojis[rand(0, emojis.length-1)];
        const reel3 = emojis[rand(0, emojis.length-1)];

        const slotString = `[ ${reel1} | ${reel2} | ${reel3} ]`;

        await pool.query('UPDATE economy_users SET gamble_count = gamble_count + 1 WHERE user_id = $1', [interaction.user.id]);

        let multiplier = 0;
        if (reel1 === reel2 && reel2 === reel3) {
            multiplier = reel1 === '💎' ? 10 : 4;
        } else if (reel1 === reel2 || reel2 === reel3 || reel1 === reel3) {
            multiplier = 1.5;
        }

        if (multiplier > 0) {
            const profit = Math.floor(amount * multiplier) - amount;
            await addMoney(interaction.user.id, profit, 'wallet');
            interaction.reply({ embeds: [createEmbed('premium', '🎰 Slot Makinesi', `\n> ${slotString}\n\n🎉 **Kazandın.** Çarpan: **${multiplier}x**\nNet kâr: ${fmtMoney(profit)}`)] });
        } else {
            await removeMoney(interaction.user.id, amount, 'wallet');
            interaction.reply({ embeds: [createEmbed('error', '🎰 Slot Makinesi', `\n> ${slotString}\n\n💀 **Kaybettin.**\nGiden: ${fmtMoney(amount)}`)] });
        }
    }
};

// --- 5. MARKET VE ENVANTER ---
commands['market'] = {
    data: { name: 'market', description: 'Alınabilecek eşyaları gösterir.' },
    async execute(interaction) {
        const embed = createEmbed('premium', '🛒 Market', 'Paranla alabileceğin özel eşyalar.');
        SHOP_ITEMS.forEach(item => {
            embed.addFields({ name: `${item.name} — ${formatFull(item.price)} ${CURRENCY_NAME} ${CURRENCY}`, value: `Kod: \`${item.id}\`\n*${item.desc}*`, inline: false });
        });
        await interaction.reply({ embeds: [embed] });
    }
};

commands['satinal'] = {
    data: {
        name: 'satinal',
        description: 'Marketten eşya satın alırsın.',
        options: [
            { name: 'esya', description: 'Alınacak eşyanın kodu (market içinde görünüyor).', type: 3, required: true },
            { name: 'adet', description: 'Kaç tane?', type: 4, required: false }
        ]
    },
    async execute(interaction) {
        const itemId = interaction.options.getString('esya').toLowerCase();
        const qty = interaction.options.getInteger('adet') || 1;

        if (qty <= 0) return interaction.reply({ embeds: [createEmbed('warn', '❌ Geçersiz Adet', 'Adet sıfırdan büyük olmalı.')], ephemeral: true });

        const item = SHOP_ITEMS.find(i => i.id === itemId);
        if (!item) return interaction.reply({ embeds: [createEmbed('error', '❌ Bulunamadı', 'Bu kodda bir eşya yok. `/market` komutu ile mevcut eşyalara bakabilirsin.')], ephemeral: true });

        const cost = item.price * qty;

        try {
            const result = await withTx(async (db) => {
                const u = await ensureUser(interaction.user.id, db);
                if (Number(u.wallet) < cost) return { kind: 'no_money' };

                await db.query('UPDATE economy_users SET wallet = wallet - $1, total_lost = total_lost + $1 WHERE user_id = $2', [cost, interaction.user.id]);
                await db.query(`
                    INSERT INTO economy_inventory (user_id, item_id, quantity)
                    VALUES ($1, $2, $3)
                    ON CONFLICT (user_id, item_id)
                    DO UPDATE SET quantity = economy_inventory.quantity + $3
                `, [interaction.user.id, item.id, qty]);
                return { kind: 'ok' };
            });

            if (result.kind === 'no_money') return interaction.reply({ embeds: [createEmbed('error', '❌ Yetersiz Bakiye', `Bunun için cüzdanında ${fmtMoney(cost)} olmalı.`)], ephemeral: true });
            return interaction.reply({ embeds: [createEmbed('success', '🛍️ Satın Alma Tamam', `**${qty} adet ${item.name}** aldın.\nÖdediğin: ${fmtMoney(cost)}`)] });
        } catch (err) {
            console.error('Satınal hatası:', err);
            return interaction.reply({ embeds: [createEmbed('error', '⚠️ Bir Aksilik Oldu', 'İşlem sırasında bir sorun çıktı. Biraz sonra tekrar dener misin?')], ephemeral: true });
        }
    }
};

commands['envanter'] = {
    data: { name: 'envanter', description: 'Sahip olduğun eşyaları gösterir.' },
    async execute(interaction) {
        const res = await pool.query('SELECT item_id, quantity FROM economy_inventory WHERE user_id = $1', [interaction.user.id]);

        if (res.rows.length === 0) {
            return interaction.reply({ embeds: [createEmbed('info', '🎒 Envanter', 'Envanterin şu an boş.')] });
        }

        const embed = createEmbed('info', `🎒 ${interaction.user.username} — Envanter`);
        res.rows.forEach(row => {
            const itemDef = SHOP_ITEMS.find(i => i.id === row.item_id);
            const name = itemDef ? itemDef.name : row.item_id;
            embed.addFields({ name: `${name} (x${row.quantity})`, value: `Kod: \`${row.item_id}\``, inline: true });
        });
        await interaction.reply({ embeds: [embed] });
    }
};

commands['kullan'] = {
    data: { name: 'kullan', description: 'Envanterindeki bir eşyayı kullanırsın.', options: [{ name: 'esya', description: 'Kullanılacak eşyanın kodu.', type: 3, required: true }] },
    async execute(interaction) {
        const itemId = interaction.options.getString('esya').toLowerCase();
        const hasQty = await checkItem(interaction.user.id, itemId);

        if (hasQty <= 0) return interaction.reply({ embeds: [createEmbed('error', '❌ Yok', 'Bu eşyaya sahip değilsin.')], ephemeral: true });

        const item = SHOP_ITEMS.find(i => i.id === itemId);
        if (!item || item.type !== 'consumable') return interaction.reply({ embeds: [createEmbed('warn', '❌ Kullanılamaz', 'Bu eşya pasif veya süs amaçlı. Doğrudan kullanılamıyor.')], ephemeral: true });

        if (itemId === 'energy_drink') {
            await pool.query('UPDATE economy_users SET last_work = NULL, last_crime = NULL WHERE user_id = $1', [interaction.user.id]);
            await consumeItem(interaction.user.id, itemId, 1);
            return interaction.reply({ embeds: [createEmbed('success', '⚡ Enerji Geldi', 'Enerji içeceğini içtin. Çalışma ve suç bekleme süreleri sıfırlandı.')] });
        }
    }
};

// --- 6. BANKA SİSTEMİ ---
commands['banka'] = {
    data: { name: 'banka', description: 'Banka hesabını, kapasiteni ve faiz durumunu gösterir.' },
    async execute(interaction) {
        const u = await ensureUser(interaction.user.id);
        const wallet = Number(u.wallet);
        const bank = Number(u.bank);
        const limit = Number(u.bank_limit) || BANK_LEVELS[0].limit;
        const level = u.bank_level || 1;
        const isMaxLevel = level >= BANK_LEVELS.length;
        const fillPct = limit > 0 ? Math.min(100, Math.floor((bank / limit) * 100)) : 0;
        const estInterest = Math.floor(bank * INTEREST_RATE);
        const totalInterest = Number(u.total_interest_earned) || 0;
        const lastInterest = u.last_interest ? new Date(u.last_interest) : null;
        const lastInterestText = lastInterest
            ? lastInterest.toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' })
            : 'Henüz faiz almadın.';

        const nextLevelDef = isMaxLevel ? null : BANK_LEVELS[level];
        const upgradeText = isMaxLevel
            ? 'Hesabın en yüksek seviyede.'
            : `Bir sonraki seviye: **${nextLevelDef.level}** — Kapasite: ${fmtMoney(nextLevelDef.limit)} — Ücret: ${fmtMoney(nextLevelDef.upgradeCost)}`;

        const embed = createEmbed('info', `🏦 ${interaction.user.username} — Banka Hesabı`)
            .addFields(
                { name: 'Cüzdandaki Para', value: fmtMoney(wallet), inline: true },
                { name: 'Bankadaki Para', value: fmtMoney(bank), inline: true },
                { name: 'Hesap Seviyesi', value: `**${level}**${isMaxLevel ? ' (en yüksek)' : ''}`, inline: true },
                { name: 'Banka Kapasitesi', value: fmtMoney(limit), inline: true },
                { name: 'Doluluk Oranı', value: `**%${fillPct}**`, inline: true },
                { name: 'Şu An Alınabilecek Faiz', value: fmtMoney(estInterest), inline: true },
                { name: 'Son Faiz Zamanı', value: lastInterestText, inline: true },
                { name: 'Faizden Kazandığın Toplam', value: fmtMoney(totalInterest), inline: true },
                { name: 'Yükseltme', value: upgradeText, inline: false }
            )
            .setThumbnail(interaction.user.displayAvatarURL());

        await interaction.reply({ embeds: [embed] });
    }
};

commands['faiz'] = {
    data: { name: 'faiz', description: 'Bankandaki paraya faiz işler. 12 saatte bir alınabilir.' },
    async execute(interaction) {
        try {
            const result = await withTx(async (db) => {
                const u = await ensureUser(interaction.user.id, db);
                const bank = Number(u.bank);
                const limit = Number(u.bank_limit) || BANK_LEVELS[0].limit;

                if (bank <= 0) return { kind: 'no_balance' };

                const now = Date.now();
                const lastMs = u.last_interest ? new Date(u.last_interest).getTime() : 0;
                if (lastMs && now - lastMs < INTEREST_INTERVAL_MS) {
                    return { kind: 'wait', leftMs: INTEREST_INTERVAL_MS - (now - lastMs) };
                }

                const interest = Math.floor(bank * INTEREST_RATE);
                if (interest <= 0) return { kind: 'too_small' };

                const room = Math.max(0, limit - bank);
                if (room <= 0) return { kind: 'full' };

                const credited = Math.min(interest, room);
                const wasCapped = credited < interest;

                await db.query(
                    'UPDATE economy_users SET bank = bank + $1, total_interest_earned = total_interest_earned + $1, total_earned = total_earned + $1, last_interest = CURRENT_TIMESTAMP WHERE user_id = $2',
                    [credited, interaction.user.id]
                );
                await logTransaction(interaction.user.id, null, 'interest', credited, 'Faiz kazancı', db);

                return { kind: 'ok', credited, wasCapped };
            });

            if (result.kind === 'no_balance') {
                return interaction.reply({ embeds: [createEmbed('warn', '🏦 Faiz', 'Faiz kazanmak için önce bankana para yatırmalısın.')], ephemeral: true });
            }
            if (result.kind === 'wait') {
                const hours = Math.floor(result.leftMs / 3600000);
                const mins = Math.floor((result.leftMs % 3600000) / 60000);
                return interaction.reply({ embeds: [createEmbed('warn', '⏳ Bekleme Süresi', `Yeni faiz almak için **${hours} saat ${mins} dakika** beklemen gerekiyor.`)], ephemeral: true });
            }
            if (result.kind === 'too_small') {
                return interaction.reply({ embeds: [createEmbed('warn', '🏦 Faiz', 'Bankandaki miktar henüz faiz işlemek için çok düşük. Biraz daha para yatırmalısın.')], ephemeral: true });
            }
            if (result.kind === 'full') {
                return interaction.reply({ embeds: [createEmbed('warn', '🏦 Banka Dolu', 'Bankan dolu olduğu için faiz eklenemedi. Kapasiteni artırman gerekiyor.')], ephemeral: true });
            }

            const note = result.wasCapped ? '\nBankan dolduğu için faizin sadece sığan kısmı eklendi.' : '';
            return interaction.reply({ embeds: [createEmbed('success', '🏦 Faiz İşlendi', `Bankana ${fmtMoney(result.credited)} eklendi.${note}`)] });
        } catch (err) {
            console.error('Faiz hatası:', err);
            return interaction.reply({ embeds: [createEmbed('error', '⚠️ Bir Aksilik Oldu', 'Faiz işlenirken bir sorun çıktı. Biraz sonra tekrar dener misin?')], ephemeral: true });
        }
    }
};

commands['banka-yukselt'] = {
    data: { name: 'banka-yukselt', description: 'Banka hesap seviyeni yükseltir ve kapasiteni artırır.' },
    async execute(interaction) {
        try {
            const result = await withTx(async (db) => {
                const u = await ensureUser(interaction.user.id, db);
                const level = u.bank_level || 1;

                if (level >= BANK_LEVELS.length) return { kind: 'max' };

                const nextDef = BANK_LEVELS[level]; // 1 tabanlı seviyeden 0 tabanlı dizi
                const cost = nextDef.upgradeCost;
                const wallet = Number(u.wallet);
                const oldLimit = Number(u.bank_limit) || BANK_LEVELS[0].limit;

                if (wallet < cost) return { kind: 'poor', cost };

                await db.query(
                    'UPDATE economy_users SET wallet = wallet - $1, total_lost = total_lost + $1, bank_level = $2, bank_limit = $3 WHERE user_id = $4',
                    [cost, nextDef.level, nextDef.limit, interaction.user.id]
                );
                await logTransaction(interaction.user.id, null, 'bank_upgrade', cost, `Banka seviye yükseltme → ${nextDef.level}`, db);

                return { kind: 'ok', newLevel: nextDef.level, oldLimit, newLimit: nextDef.limit, cost };
            });

            if (result.kind === 'max') {
                return interaction.reply({ embeds: [createEmbed('info', '🏦 Banka Hesabı', 'Banka hesabın zaten en yüksek seviyede.')], ephemeral: true });
            }
            if (result.kind === 'poor') {
                return interaction.reply({ embeds: [createEmbed('error', '❌ Yetersiz Bakiye', `Bu yükseltme için cüzdanında ${fmtMoney(result.cost)} olmalı.`)], ephemeral: true });
            }
            const embed = createEmbed('success', '🏦 Banka Yükseltildi', `Banka hesabın seviye **${result.newLevel}**'e çıktı.`)
                .addFields(
                    { name: 'Önceki Kapasite', value: fmtMoney(result.oldLimit), inline: true },
                    { name: 'Yeni Kapasite', value: fmtMoney(result.newLimit), inline: true },
                    { name: 'Ödediğin Ücret', value: fmtMoney(result.cost), inline: true }
                );
            return interaction.reply({ embeds: [embed] });
        } catch (err) {
            console.error('Banka yükseltme hatası:', err);
            return interaction.reply({ embeds: [createEmbed('error', '⚠️ Bir Aksilik Oldu', 'Yükseltme sırasında bir sorun çıktı. Biraz sonra tekrar dener misin?')], ephemeral: true });
        }
    }
};

// --- 7. İSTATİSTİK VE SIRALAMALAR ---
commands['profil'] = {
    data: { name: 'profil', description: 'Detaylı ekonomi profilini gösterir.', options: [{ name: 'kullanici', description: 'Başka birinin profili.', type: 6, required: false }] },
    async execute(interaction) {
        const target = interaction.options.getUser('kullanici') || interaction.user;
        if (target.bot) return interaction.reply({ content: 'Botların profili olmuyor.', ephemeral: true });

        const userData = await ensureUser(target.id);
        const wallet = Number(userData.wallet);
        const bank = Number(userData.bank);
        const totalWealth = wallet + bank;
        const limit = Number(userData.bank_limit) || BANK_LEVELS[0].limit;
        const level = userData.bank_level || 1;
        const fillPct = limit > 0 ? Math.min(100, Math.floor((bank / limit) * 100)) : 0;
        const totalInterest = Number(userData.total_interest_earned) || 0;

        const invRes = await pool.query('SELECT COALESCE(SUM(quantity), 0) as total_items FROM economy_inventory WHERE user_id = $1', [target.id]);
        const itemsCount = invRes.rows[0].total_items;

        const hasVip = await checkItem(target.id, 'vip_badge') > 0;
        const titlePrefix = hasVip ? '💎 VIP Profil — ' : '👤 Profil — ';

        const embed = createEmbed('premium', `${titlePrefix}${target.username}`)
            .setThumbnail(target.displayAvatarURL({ dynamic: true, size: 512 }))
            .addFields(
                { name: '💰 Servet', value: `Cüzdan: **${formatNumber(wallet)}**\nBanka: **${formatNumber(bank)}** / **${formatNumber(limit)}** (%${fillPct})\nToplam: **${formatNumber(totalWealth)}** ${CURRENCY_NAME} ${CURRENCY}`, inline: true },
                { name: '🏦 Banka Hesabı', value: `Seviye: **${level}**\nFaizden Kazanılan: **${formatNumber(totalInterest)}**`, inline: true },
                { name: '🔥 Aktiflik', value: `Günlük Seri: **${userData.daily_streak}**\nMesai: **${userData.work_count} kez**`, inline: true },
                { name: '🎒 Envanter', value: `Toplam Eşya: **${itemsCount}**`, inline: true },
                { name: '📈 Para Akışı', value: `Kazanılan: **${formatNumber(userData.total_earned)}**\nKaybedilen: **${formatNumber(userData.total_lost)}**`, inline: true },
                { name: '🥷 Suç ve Kumar', value: `Soygun: **${userData.rob_success} başarı / ${userData.rob_fail} başarısız**\nKumar: **${userData.gamble_count} el**`, inline: true }
            )
            .setFooter({ text: `Hesap açılışı: ${new Date(userData.created_at).toLocaleDateString('tr-TR')}` });

        await interaction.reply({ embeds: [embed] });
    }
};

commands['siralama'] = {
    data: { name: 'siralama', description: 'En zengin 10 kullanıcıyı gösterir.' },
    async execute(interaction) {
        const res = await pool.query('SELECT user_id, (wallet + bank) as total FROM economy_users ORDER BY total DESC LIMIT 10');

        let desc = '';
        for (let i = 0; i < res.rows.length; i++) {
            const row = res.rows[i];
            let tag = 'Bilinmeyen Kullanıcı';
            try {
                const u = await interaction.client.users.fetch(row.user_id);
                tag = u.username;
            } catch (e) { }

            const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `**#${i + 1}**`;
            desc += `${medal} **${tag}** — ${formatNumber(row.total)} ${CURRENCY_NAME} ${CURRENCY}\n`;
        }

        const embed = createEmbed('premium', '🏆 En Zenginler', desc || 'Henüz kimse yok.');
        await interaction.reply({ embeds: [embed] });
    }
};

commands['seri'] = {
    data: { name: 'seri', description: 'En uzun günlük seriye sahip 10 kişiyi gösterir.' },
    async execute(interaction) {
        const res = await pool.query('SELECT user_id, daily_streak FROM economy_users WHERE daily_streak > 0 ORDER BY daily_streak DESC LIMIT 10');
        let desc = '';
        for (let i = 0; i < res.rows.length; i++) {
            let tag = 'Bilinmeyen Kullanıcı';
            try { tag = (await interaction.client.users.fetch(res.rows[i].user_id)).username; } catch (e) { }
            desc += `🔥 **${res.rows[i].daily_streak} gün** — ${tag}\n`;
        }
        await interaction.reply({ embeds: [createEmbed('info', '🔥 En Uzun Seriler', desc || 'Henüz aktif kimse yok.')] });
    }
};

commands['ekonomi'] = {
    data: { name: 'ekonomi', description: 'Sunucunun genel ekonomi durumunu gösterir.' },
    async execute(interaction) {
        const res = await pool.query(`
            SELECT
                COUNT(*) as users,
                COALESCE(SUM(wallet), 0) as total_w,
                COALESCE(SUM(bank), 0) as total_b,
                COALESCE(SUM(total_interest_earned), 0) as total_int,
                COALESCE(AVG(bank_level), 1)::numeric(10,2) as avg_lvl,
                COALESCE(MAX(bank_level), 1) as max_lvl
            FROM economy_users
        `);
        const data = res.rows[0];
        const tw = Number(data.total_w) || 0;
        const tb = Number(data.total_b) || 0;
        const tInt = Number(data.total_int) || 0;
        const avgLvl = Number(data.avg_lvl) || 1;
        const maxLvl = Number(data.max_lvl) || 1;

        const embed = createEmbed('info', '📊 Ekonomi Durumu')
            .addFields(
                { name: 'Kayıtlı Kullanıcı', value: `**${data.users}** kişi`, inline: true },
                { name: 'Cüzdanlardaki Para', value: `${formatNumber(tw)} ${CURRENCY_NAME} ${CURRENCY}`, inline: true },
                { name: 'Bankalardaki Para', value: `🏦 ${formatNumber(tb)} ${CURRENCY_NAME}`, inline: true },
                { name: 'Toplam Servet', value: `**${formatNumber(tw + tb)}** ${CURRENCY_NAME} ${CURRENCY}`, inline: true },
                { name: 'Toplam Faiz Kazancı', value: `${formatNumber(tInt)} ${CURRENCY_NAME}`, inline: true },
                { name: 'Banka Seviyesi', value: `Ortalama **${avgLvl.toFixed(2)}** — En yüksek **${maxLvl}**`, inline: true }
            );
        await interaction.reply({ embeds: [embed] });
    }
};

commands['bekleme'] = {
    data: { name: 'bekleme', description: 'Ödül ve işlem bekleme sürelerini gösterir.' },
    async execute(interaction) {
        const u = await ensureUser(interaction.user.id);
        const now = new Date();

        const check = (last, ms) => {
            if (!last) return '🟢 Hazır';
            const diff = now - new Date(last);
            if (diff >= ms) return '🟢 Hazır';
            return `⏳ ${getMins(ms - diff)} dk kaldı`;
        };

        const embed = createEmbed('info', '⏱️ Bekleme Süreleri')
            .addFields(
                { name: 'Çalış', value: check(u.last_work, 3600000), inline: true },
                { name: 'Suç', value: check(u.last_crime, 7200000), inline: true },
                { name: 'Soy', value: check(u.last_rob, 10800000), inline: true },
                { name: 'Dilen', value: check(u.last_beg, 300000), inline: true },
                { name: 'Günlük', value: check(u.last_daily, 86400000), inline: true },
                { name: 'Faiz', value: check(u.last_interest, INTEREST_INTERVAL_MS), inline: true }
            );
        await interaction.reply({ embeds: [embed] });
    }
};

// --- 8. YETKİLİ KOMUTLARI ---
const checkAdmin = (interaction) => {
    if (interaction.user.id === OWNER_ID) return true;
    const member = interaction.member;
    const isAdmin = !!(member && member.permissions && typeof member.permissions.has === 'function' && member.permissions.has('Administrator'));
    if (!isAdmin) {
        interaction.reply({ embeds: [createEmbed('error', '⛔ Yetki Yok', 'Bu komutu yalnızca yetkili kişiler kullanabilir.')], ephemeral: true });
        return false;
    }
    return true;
};

commands['para-ekle'] = {
    data: {
        name: 'para-ekle',
        description: 'Bir kullanıcının cüzdanına MetaCoin ekler. (Yetkili)',
        options: [
            { name: 'kullanici', type: 6, description: 'Hangi kullanıcı?', required: true },
            { name: 'miktar', type: 4, description: 'Eklenecek miktar', required: true }
        ]
    },
    async execute(interaction) {
        if (!checkAdmin(interaction)) return;
        const target = interaction.options.getUser('kullanici');
        const amount = interaction.options.getInteger('miktar');
        await ensureUser(target.id);
        await addMoney(target.id, amount, 'wallet');
        await logTransaction(interaction.user.id, target.id, 'admin_add', amount, 'Yetkili ekleme');
        interaction.reply({ embeds: [createEmbed('success', '✅ Tamamdır', `${target.username} hesabına ${fmtMoney(amount)} eklendi.`)] });
    }
};

commands['para-sil'] = {
    data: {
        name: 'para-sil',
        description: 'Bir kullanıcının cüzdanından MetaCoin siler. (Yetkili)',
        options: [
            { name: 'kullanici', type: 6, description: 'Hangi kullanıcı?', required: true },
            { name: 'miktar', type: 4, description: 'Silinecek miktar', required: true }
        ]
    },
    async execute(interaction) {
        if (!checkAdmin(interaction)) return;
        const target = interaction.options.getUser('kullanici');
        const amount = interaction.options.getInteger('miktar');
        await ensureUser(target.id);
        await removeMoney(target.id, amount, 'wallet');
        await logTransaction(interaction.user.id, target.id, 'admin_remove', amount, 'Yetkili silme');
        interaction.reply({ embeds: [createEmbed('success', '✅ Tamamdır', `${target.username} hesabından ${fmtMoney(amount)} silindi.`)] });
    }
};

commands['ekonomi-sifirla'] = {
    data: {
        name: 'ekonomi-sifirla',
        description: 'Bir kullanıcının tüm ekonomi verisini sıfırlar. (Yetkili)',
        options: [{ name: 'kullanici', type: 6, description: 'Hangi kullanıcı?', required: true }]
    },
    async execute(interaction) {
        if (!checkAdmin(interaction)) return;
        const target = interaction.options.getUser('kullanici');
        await pool.query('DELETE FROM economy_users WHERE user_id = $1', [target.id]);
        interaction.reply({ embeds: [createEmbed('success', '🧹 Sıfırlandı', `${target.username} kullanıcısının tüm verisi silindi.`)] });
    }
};

// ================== [ ESKİ İNGİLİZCE ADLARDAN GEÇİCİ YÖNLENDİRME ] ==================
/**
 * Discord global slash komutlarının güncellenmesi en geç bir saat sürebilir.
 * Bu süre boyunca eski İngilizce komutlar bazı kullanıcılarda hâlâ görünebilir.
 * Aşağıdaki eşleme, eski ad gelirse onu yeni Türkçe işleyicisine yönlendirir.
 * Yeni komut listesinde eski adlar Discord'a kayıt edilmez; sadece iç uyumluluk için.
 */
const legacyAliases = {
    'balance': 'bakiye',
    'deposit': 'yatir',
    'withdraw': 'cek',
    'pay': 'gonder',
    'daily': 'gunluk',
    'weekly': 'haftalik',
    'monthly': 'aylik',
    'work': 'calis',
    'beg': 'dilen',
    'crime': 'suc',
    'rob': 'soy',
    'gamble': 'kumar',
    'coinflip': 'yazitura',
    'slots': 'slot',
    'shop': 'market',
    'buy': 'satinal',
    'inventory': 'envanter',
    'use': 'kullan',
    'profile': 'profil',
    'leaderboard': 'siralama',
    'rank-streak': 'seri',
    'economy-stats': 'ekonomi',
    'cooldowns': 'bekleme',
    'add-money': 'para-ekle',
    'remove-money': 'para-sil',
    'reset-economy-user': 'ekonomi-sifirla'
};

// ================== [ OLAY DİNLEYİCİLERİ ] ==================
const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages] });

client.once('ready', async () => {
    console.log(`🤖 ${client.user.tag} aktif!`);
    await initDB();

    const rest = new REST({ version: '10' }).setToken(process.env.BOT_TOKEN);
    try {
        console.log('🔄 Slash komutları yükleniyor...');
        const cmdArr = Object.values(commands).map(c => c.data);
        await rest.put(Routes.applicationCommands(process.env.CLIENT_ID), { body: cmdArr });
        console.log('✅ Komutlar başarıyla yüklendi!');
    } catch (error) {
        console.error('❌ Komut yükleme hatası:', error);
    }
});

client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;

    const requestedName = interaction.commandName;
    const resolvedName = commands[requestedName] ? requestedName : legacyAliases[requestedName];
    const command = resolvedName ? commands[resolvedName] : null;
    if (!command) return;

    try {
        await command.execute(interaction);
    } catch (error) {
        console.error(`Komut hatası (${requestedName}):`, error);
        const errEmbed = createEmbed('error', '⚠️ Bir Aksilik Oldu', 'Bu komut işlenirken bir sorun çıktı. Biraz sonra tekrar dener misin?');
        if (interaction.replied || interaction.deferred) {
            await interaction.followUp({ embeds: [errEmbed], ephemeral: true }).catch(()=>null);
        } else {
            await interaction.reply({ embeds: [errEmbed], ephemeral: true }).catch(()=>null);
        }
    }
});

// ================== [ HATA YAKALAMA ] ==================
process.on('unhandledRejection', (reason, promise) => {
    console.error('Yakalanmamış reddetme:', promise, 'sebep:', reason);
});

process.on('uncaughtException', (err) => {
    console.error('Yakalanmamış istisna:', err);
    // process.exit(1); // Kritik sistemlerde açılabilir, pm2 ile yeniden başlar.
});

// ================== [ SAĞLIK KONTROL SUNUCUSU ] ==================
const app = express();
app.get('/', (req, res) => {
    res.status(200).send('metavis1on bot çalışıyor.');
});
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🌐 Sağlık kontrol servisi ${PORT} numaralı bağlantı noktasını dinliyor.`);
}).on('error', (err) => {
    console.error('🌐 Sağlık kontrol servisi başlatılamadı:', err.message);
});

// ================== [ BOT GİRİŞİ ] ==================
(async () => {
    const token = process.env.BOT_TOKEN;
    if (!token) {
        console.error('❌ BOT_TOKEN tanımlı değil. .env dosyasını kontrol et.');
        process.exit(1);
    }
    try {
        await client.login(token);
    } catch (err) {
        console.error('❌ Bot girişi başarısız oldu. Token geçerli mi kontrol et.');
        console.error('Hata:', err && err.message ? err.message : 'Bilinmeyen hata');
        process.exit(1);
    }
})();
