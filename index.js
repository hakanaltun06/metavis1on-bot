/**
 * ============================================================================
 * PREMIUM DISCORD ECONOMY BOT - SINGLE FILE ARCHITECTURE
 * ============================================================================
 * Node.js, Discord.js v14, PostgreSQL (pg)
 */

require('dotenv').config();
const { Client, GatewayIntentBits, EmbedBuilder, Collection, REST, Routes } = require('discord.js');
const { Pool } = require('pg');

// ================== [ CONFIGURATION & CONSTANTS ] ==================
const CURRENCY = "🪙";
const CURRENCY_NAME = "Coin";
const COLOR_SUCCESS = "#00FF7F";
const COLOR_ERROR = "#FF4500";
const COLOR_INFO = "#1E90FF";
const COLOR_WARNING = "#FFA500";
const COLOR_PREMIUM = "#FFD700";

// Geliştirici Sahip ID'si (Tehlikeli komutlar için)
const OWNER_ID = process.env.OWNER_ID;

// Geçici Cooldown Belleği (Gamble, coinflip gibi hızlı komutlar için)
const localCooldowns = new Collection();

// ================== [ DATABASE SETUP ] ==================
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    // SSL gerektiren uzak sunucular için (örn: Supabase, Render):
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
        `);
        console.log('✅ Veritabanı tabloları hazır.');
    } finally {
        client.release();
    }
}

// ================== [ ITEM DEFINITIONS ] ==================
const SHOP_ITEMS = [
    { id: 'rob_shield', name: '🛡️ Soygun Kalkanı', desc: 'Seni 1 soygundan korur. (Pasif)', price: 15000, type: 'passive' },
    { id: 'lucky_amulet', name: '🍀 Şans Tılsımı', desc: 'Kumar oyunlarında şansını %5 artırır. (Pasif)', price: 50000, type: 'passive' },
    { id: 'energy_drink', name: '⚡ Enerji İçeceği', desc: 'Work ve Crime bekleme süresini anında sıfırlar. (Kullanılabilir)', price: 7500, type: 'consumable' },
    { id: 'vip_badge', name: '💎 VIP Rozeti', desc: 'Profili süsler, prestij göstergesidir.', price: 500000, type: 'flex' }
];

// ================== [ HELPER FUNCTIONS ] ==================
const formatNumber = (num) => Intl.NumberFormat('en-US', { notation: 'compact', compactDisplay: 'short' }).format(num);
const formatFull = (num) => new Intl.NumberFormat('tr-TR').format(num);
const rand = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const getMins = (ms) => Math.ceil(ms / 60000);

function createEmbed(type, title, desc = '') {
    const embed = new EmbedBuilder().setTitle(title).setDescription(desc);
    if (type === 'success') embed.setColor(COLOR_SUCCESS);
    if (type === 'error') embed.setColor(COLOR_ERROR);
    if (type === 'info') embed.setColor(COLOR_INFO);
    if (type === 'warn') embed.setColor(COLOR_WARNING);
    if (type === 'premium') embed.setColor(COLOR_PREMIUM);
    return embed;
}

// ================== [ DATABASE HELPERS ] ==================
async function ensureUser(userId) {
    const res = await pool.query('SELECT * FROM economy_users WHERE user_id = $1', [userId]);
    if (res.rows.length === 0) {
        await pool.query('INSERT INTO economy_users (user_id) VALUES ($1)', [userId]);
        return (await pool.query('SELECT * FROM economy_users WHERE user_id = $1', [userId])).rows[0];
    }
    // Aktifliği güncelle
    await pool.query('UPDATE economy_users SET last_active = CURRENT_TIMESTAMP WHERE user_id = $1', [userId]);
    return res.rows[0];
}

async function addMoney(userId, amount, type = 'wallet') {
    const field = type === 'bank' ? 'bank' : 'wallet';
    await pool.query(`UPDATE economy_users SET ${field} = ${field} + $1, total_earned = total_earned + CASE WHEN $1 > 0 THEN $1 ELSE 0 END WHERE user_id = $2`, [amount, userId]);
}

async function removeMoney(userId, amount, type = 'wallet') {
    const field = type === 'bank' ? 'bank' : 'wallet';
    await pool.query(`UPDATE economy_users SET ${field} = ${field} - $1, total_lost = total_lost + $1 WHERE user_id = $2`, [amount, userId]);
}

async function logTransaction(userId, targetId, type, amount, desc) {
    await pool.query('INSERT INTO economy_transactions (user_id, target_id, type, amount, description) VALUES ($1, $2, $3, $4, $5)', [userId, targetId, type, amount, desc]);
}

async function checkItem(userId, itemId) {
    const res = await pool.query('SELECT quantity FROM economy_inventory WHERE user_id = $1 AND item_id = $2', [userId, itemId]);
    return res.rows.length > 0 ? res.rows[0].quantity : 0;
}

async function consumeItem(userId, itemId, amount = 1) {
    await pool.query('UPDATE economy_inventory SET quantity = quantity - $1 WHERE user_id = $2 AND item_id = $3', [amount, userId, itemId]);
    await pool.query('DELETE FROM economy_inventory WHERE quantity <= 0');
}

// ================== [ COMMAND REGISTRY & LOGIC ] ==================
const commands = {};

// --- 1. CORE COMMANDS ---
commands['balance'] = {
    data: { name: 'balance', description: 'Cüzdan ve banka bakiyeni gösterir.', options: [{ name: 'user', description: 'Başkasının bakiyesine bak', type: 6, required: false }] },
    async execute(interaction) {
        const target = interaction.options.getUser('user') || interaction.user;
        if (target.bot) return interaction.reply({ embeds: [createEmbed('error', '❌ Hata', 'Botların ekonomisi yoktur.')], ephemeral: true });
        
        const userData = await ensureUser(target.id);
        const total = Number(userData.wallet) + Number(userData.bank);

        const embed = createEmbed('info', `💳 Bakiye: ${target.username}`)
            .addFields(
                { name: 'Cüzdan', value: `${CURRENCY} **${formatFull(userData.wallet)}**`, inline: true },
                { name: 'Banka', value: `🏦 **${formatFull(userData.bank)}**`, inline: true },
                { name: 'Toplam Servet', value: `${CURRENCY} **${formatFull(total)}**`, inline: false }
            )
            .setThumbnail(target.displayAvatarURL());
        await interaction.reply({ embeds: [embed] });
    }
};

commands['deposit'] = {
    data: { name: 'deposit', description: 'Cüzdanından bankaya para yatır.', options: [{ name: 'amount', description: 'Miktar (veya hepsi için "all")', type: 3, required: true }] },
    async execute(interaction) {
        const amountStr = interaction.options.getString('amount').toLowerCase();
        const userData = await ensureUser(interaction.user.id);
        let amount = amountStr === 'all' ? Number(userData.wallet) : parseInt(amountStr);

        if (isNaN(amount) || amount <= 0) return interaction.reply({ embeds: [createEmbed('error', '❌ Geçersiz Miktar', 'Lütfen geçerli bir sayı girin.')], ephemeral: true });
        if (Number(userData.wallet) < amount) return interaction.reply({ embeds: [createEmbed('error', '❌ Yetersiz Bakiye', 'Cüzdanında bu kadar para yok.')], ephemeral: true });

        await removeMoney(interaction.user.id, amount, 'wallet');
        await addMoney(interaction.user.id, amount, 'bank');
        await interaction.reply({ embeds: [createEmbed('success', '🏦 Para Yatırıldı', `${CURRENCY} **${formatFull(amount)}** bankaya eklendi.`)] });
    }
};

commands['withdraw'] = {
    data: { name: 'withdraw', description: 'Bankadan cüzdanına para çek.', options: [{ name: 'amount', description: 'Miktar (veya hepsi için "all")', type: 3, required: true }] },
    async execute(interaction) {
        const amountStr = interaction.options.getString('amount').toLowerCase();
        const userData = await ensureUser(interaction.user.id);
        let amount = amountStr === 'all' ? Number(userData.bank) : parseInt(amountStr);

        if (isNaN(amount) || amount <= 0) return interaction.reply({ embeds: [createEmbed('error', '❌ Geçersiz Miktar', 'Lütfen geçerli bir sayı girin.')], ephemeral: true });
        if (Number(userData.bank) < amount) return interaction.reply({ embeds: [createEmbed('error', '❌ Yetersiz Bakiye', 'Bankanda bu kadar para yok.')], ephemeral: true });

        await removeMoney(interaction.user.id, amount, 'bank');
        await addMoney(interaction.user.id, amount, 'wallet');
        await interaction.reply({ embeds: [createEmbed('success', '🏦 Para Çekildi', `🏦 **${formatFull(amount)}** cüzdanına çekildi.`)] });
    }
};

commands['pay'] = {
    data: { name: 'pay', description: 'Birine para gönder.', options: [{ name: 'user', description: 'Kime?', type: 6, required: true }, { name: 'amount', description: 'Ne kadar?', type: 4, required: true }] },
    async execute(interaction) {
        const target = interaction.options.getUser('user');
        const amount = interaction.options.getInteger('amount');

        if (target.id === interaction.user.id) return interaction.reply({ embeds: [createEmbed('warn', '❌ Hata', 'Kendinize para gönderemezsiniz.')], ephemeral: true });
        if (target.bot) return interaction.reply({ embeds: [createEmbed('warn', '❌ Hata', 'Botlara para gönderemezsiniz.')], ephemeral: true });
        if (amount <= 0) return interaction.reply({ embeds: [createEmbed('warn', '❌ Geçersiz Miktar', 'Miktar sıfırdan büyük olmalı.')], ephemeral: true });

        const userData = await ensureUser(interaction.user.id);
        if (Number(userData.wallet) < amount) return interaction.reply({ embeds: [createEmbed('error', '❌ Yetersiz Bakiye', 'Cüzdanınızda yeterli bakiye yok.')], ephemeral: true });

        await ensureUser(target.id);
        await removeMoney(interaction.user.id, amount, 'wallet');
        await pool.query('UPDATE economy_users SET wallet = wallet + $1 WHERE user_id = $2', [amount, target.id]); // Direct add to avoid altering target's total_earned as it's a transfer
        await logTransaction(interaction.user.id, target.id, 'transfer', amount, 'Pay Command');

        await interaction.reply({ embeds: [createEmbed('success', '💸 Transfer Başarılı', `**${target.username}** adlı kullanıcıya ${CURRENCY} **${formatFull(amount)}** gönderdin.`)] });
    }
};

// --- 2. INCOME & REWARDS ---
commands['daily'] = {
    data: { name: 'daily', description: 'Günlük ödülünü al ve serini(streak) koru.' },
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
            return interaction.reply({ embeds: [createEmbed('warn', '⏳ Bekleme Süresi', `Günlük ödülünü zaten aldın. **${hours} saat ${mins} dakika** sonra tekrar gel.`)], ephemeral: true });
        }

        let newStreak = userData.daily_streak;
        if (diffDays === 1 || userData.daily_streak === 0) {
            newStreak += 1;
        } else {
            newStreak = 1; // Streak bozuldu
        }

        const baseReward = 500;
        const streakBonus = Math.min(newStreak * 50, 1000); // Max 1000 bonus
        const totalReward = baseReward + streakBonus;

        await addMoney(interaction.user.id, totalReward, 'wallet');
        await pool.query('UPDATE economy_users SET daily_streak = $1, last_daily = CURRENT_TIMESTAMP WHERE user_id = $2', [newStreak, interaction.user.id]);

        const embed = createEmbed('success', '🎁 Günlük Ödül', `Günün harika geçsin! Cüzdanına para eklendi.`)
            .addFields(
                { name: 'Kazanılan', value: `${CURRENCY} **${formatFull(totalReward)}**`, inline: true },
                { name: 'Güncel Seri (Streak)', value: `🔥 **${newStreak} Gün** (+${streakBonus} Bonus)`, inline: true }
            );
        if (diffDays > 1 && userData.daily_streak > 0) {
            embed.setFooter({ text: '⚠️ Bir günden fazla beklediğin için önceki serin bozuldu.' });
        }
        await interaction.reply({ embeds: [embed] });
    }
};

commands['weekly'] = {
    data: { name: 'weekly', description: 'Haftalık büyük ödülünü al.' },
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
        await interaction.reply({ embeds: [createEmbed('success', '🗓️ Haftalık Ödül', `${CURRENCY} **${formatFull(reward)}** cüzdanına eklendi.`)] });
    }
};

commands['monthly'] = {
    data: { name: 'monthly', description: 'Aylık dev ödülünü al.' },
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
        await interaction.reply({ embeds: [createEmbed('success', '🏆 Aylık Ödül', `${CURRENCY} **${formatFull(reward)}** cüzdanına eklendi! Zenginlik akıyor.`)] });
    }
};

commands['work'] = {
    data: { name: 'work', description: 'Çalışarak para kazan. (Meslekler rastgele)' },
    async execute(interaction) {
        const userData = await ensureUser(interaction.user.id);
        const now = new Date();
        const lastDate = userData.last_work ? new Date(userData.last_work) : new Date(0);
        
        if (now - lastDate < 3600000) { // 1 Saat
            const left = 3600000 - (now - lastDate);
            return interaction.reply({ embeds: [createEmbed('warn', '⏳ Mesai Bitti', `Çok yorulmuşsun. Yeni işe girmek için **${getMins(left)} dakika** dinlen.`)], ephemeral: true });
        }

        const jobs = [
            "Bir yazılım firmasında bug ayıkladın", "Discord sunucusu kurup sattın", 
            "Kafe'de barista olarak çalıştın", "Eski eşyalarını internette sattın",
            "Freelance grafik tasarım yaptın", "Taksi şoförlüğü yaptın"
        ];
        const reward = rand(150, 450);
        const job = jobs[rand(0, jobs.length - 1)];

        await addMoney(interaction.user.id, reward, 'wallet');
        await pool.query('UPDATE economy_users SET last_work = CURRENT_TIMESTAMP, work_count = work_count + 1 WHERE user_id = $1', [interaction.user.id]);

        await interaction.reply({ embeds: [createEmbed('success', '💼 Maaş Günü', `**${job}** ve ${CURRENCY} **${reward}** kazandın.`)] });
    }
};

commands['beg'] = {
    data: { name: 'beg', description: 'Sokakta dilen. (Bazen işe yarar)' },
    async execute(interaction) {
        const userData = await ensureUser(interaction.user.id);
        const now = new Date();
        const lastDate = userData.last_beg ? new Date(userData.last_beg) : new Date(0);
        
        if (now - lastDate < 300000) { // 5 dakika
            return interaction.reply({ embeds: [createEmbed('warn', '⏳ Kovuldun', `İnsanlar senden bıktı. Başka sokağa gitmek için **${getMins(300000 - (now - lastDate))} dk** bekle.`)], ephemeral: true });
        }

        await pool.query('UPDATE economy_users SET last_beg = CURRENT_TIMESTAMP WHERE user_id = $1', [interaction.user.id]);

        if (Math.random() < 0.3) {
            return interaction.reply({ embeds: [createEmbed('error', '😢 Reddedildin', 'Kimse sana para vermedi. Üstüne bir de dalga geçtiler.')] });
        }

        const reward = rand(10, 80);
        await addMoney(interaction.user.id, reward, 'wallet');
        await interaction.reply({ embeds: [createEmbed('success', '🤲 Sadaka', `Zengin bir iş adamı acıdı ve sana ${CURRENCY} **${reward}** fırlattı.`)] });
    }
};

// --- 3. RISK & PVP COMMANDS ---
commands['crime'] = {
    data: { name: 'crime', description: 'Yasadışı işlere bulaş. Kazancı büyük, riski yüksek.' },
    async execute(interaction) {
        const userData = await ensureUser(interaction.user.id);
        const now = new Date();
        const lastDate = userData.last_crime ? new Date(userData.last_crime) : new Date(0);
        
        if (now - lastDate < 7200000) { // 2 Saat
            return interaction.reply({ embeds: [createEmbed('warn', '🚔 Polis Peşinde', `Ortalığın sakinleşmesi lazım. **${getMins(7200000 - (now - lastDate))} dk** saklan.`)], ephemeral: true });
        }

        await pool.query('UPDATE economy_users SET last_crime = CURRENT_TIMESTAMP WHERE user_id = $1', [interaction.user.id]);

        const win = Math.random() < 0.45; // %45 Başarı
        if (win) {
            const reward = rand(600, 1500);
            const scenarios = ["Banka arabasını soydun", "Gizli belgeleri sızdırdın", "Tefeciyi dolandırdın"];
            await addMoney(interaction.user.id, reward, 'wallet');
            return interaction.reply({ embeds: [createEmbed('error', '🕵️‍♂️ Suç Başarılı!', `**${scenarios[rand(0,2)]}** ve polise yakalanmadan kaçtın!\nKazanılan: ${CURRENCY} **${reward}**`).setColor('#8B0000')] });
        } else {
            const penalty = rand(300, 800);
            const realPenalty = Math.min(penalty, Number(userData.wallet));
            await removeMoney(interaction.user.id, realPenalty, 'wallet');
            return interaction.reply({ embeds: [createEmbed('error', '🚔 Yakalandın!', `Operasyon ters gitti! Polis seni yakaladı.\nCeza ödedin: ${CURRENCY} **${realPenalty}**`)] });
        }
    }
};

commands['rob'] = {
    data: { name: 'rob', description: 'Başka bir kullanıcının cüzdanını soy.', options: [{ name: 'target', description: 'Kimi soyacaksın?', type: 6, required: true }] },
    async execute(interaction) {
        const target = interaction.options.getUser('target');
        if (target.id === interaction.user.id) return interaction.reply({ embeds: [createEmbed('warn', '❌ Hata', 'Kendini soyamazsın akıllı.')], ephemeral: true });
        if (target.bot) return interaction.reply({ embeds: [createEmbed('warn', '❌ Hata', 'Botların donanımı kalındır, soyamazsın.')], ephemeral: true });

        const userData = await ensureUser(interaction.user.id);
        const targetData = await ensureUser(target.id);

        const now = new Date();
        const lastDate = userData.last_rob ? new Date(userData.last_rob) : new Date(0);
        if (now - lastDate < 10800000) { // 3 Saat
            return interaction.reply({ embeds: [createEmbed('warn', '⏳ Cooldown', `Yeni bir plan yapmak için **${getMins(10800000 - (now - lastDate))} dk** bekle.`)], ephemeral: true });
        }

        if (Number(userData.wallet) < 500) return interaction.reply({ embeds: [createEmbed('error', '❌ Yetersiz Bütçe', 'Soygun planı yapmak için cüzdanında en az 500 coin olmalı. Fakir hırsız olmaz.')], ephemeral: true });
        if (Number(targetData.wallet) < 500) return interaction.reply({ embeds: [createEmbed('error', '❌ Değmez', 'Hedefin cüzdanı çok boş. Buna değmez.')], ephemeral: true });

        // Kalkan Kontrolü
        const hasShield = await checkItem(target.id, 'rob_shield');
        if (hasShield > 0) {
            await consumeItem(target.id, 'rob_shield', 1);
            await pool.query('UPDATE economy_users SET last_rob = CURRENT_TIMESTAMP WHERE user_id = $1', [interaction.user.id]);
            return interaction.reply({ embeds: [createEmbed('info', '🛡️ Engellendi!', `${target.username} adlı kişinin **Soygun Kalkanı** vardı! Kalkan kırıldı ama adam güvende.`)] });
        }

        await pool.query('UPDATE economy_users SET last_rob = CURRENT_TIMESTAMP WHERE user_id = $1', [interaction.user.id]);

        const win = Math.random() < 0.4; // %40 başarı
        if (win) {
            const pct = rand(10, 25) / 100;
            const stolen = Math.floor(Number(targetData.wallet) * pct);
            await removeMoney(target.id, stolen, 'wallet');
            await addMoney(interaction.user.id, stolen, 'wallet');
            await pool.query('UPDATE economy_users SET rob_success = rob_success + 1 WHERE user_id = $1', [interaction.user.id]);
            return interaction.reply({ embeds: [createEmbed('success', '🥷 Soygun Başarılı!', `${target.username} uyurken cüzdanına girdin.\nÇalınan: ${CURRENCY} **${formatFull(stolen)}**`)] });
        } else {
            const penalty = Math.floor(Number(userData.wallet) * 0.15); // Kendi parasının %15'i gider
            await removeMoney(interaction.user.id, penalty, 'wallet');
            await pool.query('UPDATE economy_users SET rob_fail = rob_fail + 1 WHERE user_id = $1', [interaction.user.id]);
            return interaction.reply({ embeds: [createEmbed('error', '🚔 Yakalandın!', `Ev sahibi uyandı! Kaçarken cüzdanını düşürdün.\nKaybedilen: ${CURRENCY} **${formatFull(penalty)}**`)] });
        }
    }
};

// --- 4. GAMBLING ---
async function handleGamble(interaction, gameName, amount, winMultiplier, winChanceBase) {
    const userData = await ensureUser(interaction.user.id);
    if (Number(userData.wallet) < amount) {
        await interaction.reply({ embeds: [createEmbed('error', '❌ Yetersiz Bakiye', `Cüzdanında ${CURRENCY} ${amount} yok.`)], ephemeral: true });
        return false;
    }

    // Şans Tılsımı kontrolü (+%5 şans)
    const hasAmulet = await checkItem(interaction.user.id, 'lucky_amulet');
    const finalChance = hasAmulet > 0 ? winChanceBase + 0.05 : winChanceBase;

    await pool.query('UPDATE economy_users SET gamble_count = gamble_count + 1 WHERE user_id = $1', [interaction.user.id]);

    const win = Math.random() < finalChance;
    if (win) {
        const profit = Math.floor(amount * winMultiplier) - amount;
        await addMoney(interaction.user.id, profit, 'wallet');
        return true; // Kazandı
    } else {
        await removeMoney(interaction.user.id, amount, 'wallet');
        return false; // Kaybetti
    }
}

commands['gamble'] = {
    data: { name: 'gamble', description: 'Zar atarak kumar oyna.', options: [{ name: 'amount', description: 'Bahis miktarı', type: 4, required: true }] },
    async execute(interaction) {
        const amount = interaction.options.getInteger('amount');
        if (amount < 50) return interaction.reply({ embeds: [createEmbed('warn', '❌ Hata', 'Minimum bahis 50 olmalıdır.')], ephemeral: true });

        const win = await handleGamble(interaction, 'Gamble', amount, 2.0, 0.45); // %45 kazanma, 2x ödül
        if (win === undefined) return;

        if (win) {
            interaction.reply({ embeds: [createEmbed('success', '🎲 Kazandın!', `Zarlar senin için düştü! ${CURRENCY} **${formatFull(amount)}** kâr ettin.`)] });
        } else {
            interaction.reply({ embeds: [createEmbed('error', '🎲 Kaybettin!', `Zarlar kötü geldi. ${CURRENCY} **${formatFull(amount)}** kaybettin.`)] });
        }
    }
};

commands['coinflip'] = {
    data: { 
        name: 'coinflip', description: 'Yazı tura at.', 
        options: [
            { name: 'choice', description: 'Yazı mı Tura mı?', type: 3, required: true, choices: [{name:'Yazı', value:'yazi'}, {name:'Tura', value:'tura'}] },
            { name: 'amount', description: 'Bahis miktarı', type: 4, required: true }
        ] 
    },
    async execute(interaction) {
        const choice = interaction.options.getString('choice');
        const amount = interaction.options.getInteger('amount');
        if (amount < 10) return interaction.reply({ embeds: [createEmbed('warn', '❌ Hata', 'Minimum bahis 10.')], ephemeral: true });

        const userData = await ensureUser(interaction.user.id);
        if (Number(userData.wallet) < amount) return interaction.reply({ embeds: [createEmbed('error', '❌ Bakiye Yetersiz', 'Paran yok.')], ephemeral: true });

        const result = Math.random() < 0.5 ? 'yazi' : 'tura';
        const win = choice === result;
        
        await pool.query('UPDATE economy_users SET gamble_count = gamble_count + 1 WHERE user_id = $1', [interaction.user.id]);

        if (win) {
            await addMoney(interaction.user.id, amount, 'wallet');
            interaction.reply({ embeds: [createEmbed('success', '🪙 Para Döndü...', `Para **${result.toUpperCase()}** geldi. Doğru bildin!\nKazanılan: ${CURRENCY} **${formatFull(amount)}**`)] });
        } else {
            await removeMoney(interaction.user.id, amount, 'wallet');
            interaction.reply({ embeds: [createEmbed('error', '🪙 Para Döndü...', `Para **${result.toUpperCase()}** geldi. Yanlış bildin.\nKaybedilen: ${CURRENCY} **${formatFull(amount)}**`)] });
        }
    }
};

commands['slots'] = {
    data: { name: 'slots', description: 'Slot makinesini çevir.', options: [{ name: 'amount', description: 'Bahis miktarı', type: 4, required: true }] },
    async execute(interaction) {
        const amount = interaction.options.getInteger('amount');
        if (amount < 100) return interaction.reply({ embeds: [createEmbed('warn', '❌ Hata', 'Minimum bahis 100.')], ephemeral: true });
        
        const userData = await ensureUser(interaction.user.id);
        if (Number(userData.wallet) < amount) return interaction.reply({ embeds: [createEmbed('error', '❌ Bakiye', 'Paran yetersiz.')], ephemeral: true });

        const emojis = ['🍒', '🍋', '🍉', '⭐', '💎'];
        const reel1 = emojis[rand(0, emojis.length-1)];
        const reel2 = emojis[rand(0, emojis.length-1)];
        const reel3 = emojis[rand(0, emojis.length-1)];

        const slotString = `[ ${reel1} | ${reel2} | ${reel3} ]`;
        
        await pool.query('UPDATE economy_users SET gamble_count = gamble_count + 1 WHERE user_id = $1', [interaction.user.id]);

        let multiplier = 0;
        if (reel1 === reel2 && reel2 === reel3) {
            multiplier = reel1 === '💎' ? 10 : 4; // Jackpot 10x, normal 3 eşleşme 4x
        } else if (reel1 === reel2 || reel2 === reel3 || reel1 === reel3) {
            multiplier = 1.5; // İkili eşleşme amorti+
        }

        if (multiplier > 0) {
            const profit = Math.floor(amount * multiplier) - amount;
            await addMoney(interaction.user.id, profit, 'wallet');
            interaction.reply({ embeds: [createEmbed('premium', '🎰 SLOT MAKİNESİ 🎰', `\n> ${slotString}\n\n🎉 **KAZANDIN!** Çarpan: **${multiplier}x**\nNet Kâr: ${CURRENCY} **${formatFull(profit)}**`)] });
        } else {
            await removeMoney(interaction.user.id, amount, 'wallet');
            interaction.reply({ embeds: [createEmbed('error', '🎰 SLOT MAKİNESİ 🎰', `\n> ${slotString}\n\n💀 **KAYBETTİN.**\nGiden: ${CURRENCY} **${formatFull(amount)}**`)] });
        }
    }
};

// --- 5. SHOP & INVENTORY ---
commands['shop'] = {
    data: { name: 'shop', description: 'Mağazadaki eşyaları listeler.' },
    async execute(interaction) {
        const embed = createEmbed('premium', '🛒 Karaborsa ve Market', 'Paranızla alabileceğiniz özel eşyalar.');
        SHOP_ITEMS.forEach(item => {
            embed.addFields({ name: `${item.name} — ${CURRENCY} ${formatFull(item.price)}`, value: `ID: \`${item.id}\`\n*${item.desc}*`, inline: false });
        });
        await interaction.reply({ embeds: [embed] });
    }
};

commands['buy'] = {
    data: { name: 'buy', description: 'Mağazadan eşya satın al.', options: [{ name: 'item_id', description: 'Satın alınacak eşyanın IDsi', type: 3, required: true }, { name: 'quantity', description: 'Adet', type: 4, required: false }] },
    async execute(interaction) {
        const itemId = interaction.options.getString('item_id').toLowerCase();
        const qty = interaction.options.getInteger('quantity') || 1;
        
        if (qty <= 0) return interaction.reply({ embeds: [createEmbed('warn', '❌', 'Sayı pozitif olmalı.')], ephemeral: true });

        const item = SHOP_ITEMS.find(i => i.id === itemId);
        if (!item) return interaction.reply({ embeds: [createEmbed('error', '❌ Bulunamadı', 'Bu ID\'ye sahip bir eşya yok. `/shop` komutunu kontrol et.')], ephemeral: true });

        const cost = item.price * qty;
        const userData = await ensureUser(interaction.user.id);
        
        if (Number(userData.wallet) < cost) return interaction.reply({ embeds: [createEmbed('error', '❌ Yetersiz Bakiye', `Bunun için cüzdanında ${CURRENCY} **${formatFull(cost)}** olmalı.`)], ephemeral: true });

        // Satın alma işlemi
        await removeMoney(interaction.user.id, cost, 'wallet');
        
        // Envantere ekle
        await pool.query(`
            INSERT INTO economy_inventory (user_id, item_id, quantity) 
            VALUES ($1, $2, $3) 
            ON CONFLICT (user_id, item_id) 
            DO UPDATE SET quantity = economy_inventory.quantity + $3
        `, [interaction.user.id, item.id, qty]);

        await interaction.reply({ embeds: [createEmbed('success', '🛍️ Satın Alma Başarılı!', `**${qty}x ${item.name}** satın aldın.\nÖdenen: ${CURRENCY} **${formatFull(cost)}**`)] });
    }
};

commands['inventory'] = {
    data: { name: 'inventory', description: 'Sahip olduğun eşyaları gör.' },
    async execute(interaction) {
        const res = await pool.query('SELECT item_id, quantity FROM economy_inventory WHERE user_id = $1', [interaction.user.id]);
        
        if (res.rows.length === 0) {
            return interaction.reply({ embeds: [createEmbed('info', '🎒 Envanterin', 'Envanterin bomboş. Fareler cirit atıyor.')] });
        }

        const embed = createEmbed('info', `🎒 ${interaction.user.username}'s Envanteri`);
        res.rows.forEach(row => {
            const itemDef = SHOP_ITEMS.find(i => i.id === row.item_id);
            const name = itemDef ? itemDef.name : row.item_id;
            embed.addFields({ name: `${name} (x${row.quantity})`, value: `ID: \`${row.item_id}\``, inline: true });
        });
        await interaction.reply({ embeds: [embed] });
    }
};

commands['use'] = {
    data: { name: 'use', description: 'Envanterindeki bir eşyayı kullan.', options: [{ name: 'item_id', description: 'Kullanılacak eşyanın IDsi', type: 3, required: true }] },
    async execute(interaction) {
        const itemId = interaction.options.getString('item_id').toLowerCase();
        const hasQty = await checkItem(interaction.user.id, itemId);
        
        if (hasQty <= 0) return interaction.reply({ embeds: [createEmbed('error', '❌ Hata', 'Bu eşyaya sahip değilsin.')], ephemeral: true });

        const item = SHOP_ITEMS.find(i => i.id === itemId);
        if (!item || item.type !== 'consumable') return interaction.reply({ embeds: [createEmbed('warn', '❌ Hata', 'Bu eşya kullanılamaz (Pasif veya Süs eşyası).')], ephemeral: true });

        // Efekt Uygulama
        if (itemId === 'energy_drink') {
            await pool.query('UPDATE economy_users SET last_work = NULL, last_crime = NULL WHERE user_id = $1', [interaction.user.id]);
            await consumeItem(interaction.user.id, itemId, 1);
            return interaction.reply({ embeds: [createEmbed('success', '⚡ Enerji Patlaması!', 'Enerji içeceğini diktin! `Work` ve `Crime` bekleme sürelerin sıfırlandı.')] });
        }
    }
};

// --- 6. STATS & LEADERBOARDS ---
commands['profile'] = {
    data: { name: 'profile', description: 'Detaylı ekonomi profilini gösterir.', options: [{ name: 'user', description: 'Hedef Kullanıcı', type: 6, required: false }] },
    async execute(interaction) {
        const target = interaction.options.getUser('user') || interaction.user;
        if (target.bot) return interaction.reply({ content: "Bot profili yok.", ephemeral: true });

        const userData = await ensureUser(target.id);
        const totalWealth = Number(userData.wallet) + Number(userData.bank);
        const invRes = await pool.query('SELECT COALESCE(SUM(quantity), 0) as total_items FROM economy_inventory WHERE user_id = $1', [target.id]);
        const itemsCount = invRes.rows[0].total_items;

        const hasVip = await checkItem(target.id, 'vip_badge') > 0;
        const titlePrefix = hasVip ? '💎 VIP PROFİL: ' : '👤 Profil: ';

        const embed = createEmbed('premium', `${titlePrefix}${target.username}`)
            .setThumbnail(target.displayAvatarURL({ dynamic: true, size: 512 }))
            .addFields(
                { name: '💰 Servet', value: `Cüzdan: **${formatNumber(userData.wallet)}**\nBanka: **${formatNumber(userData.bank)}**\nToplam: **${formatNumber(totalWealth)}**`, inline: true },
                { name: '🔥 Aktiflik', value: `Günlük Seri: **${userData.daily_streak}**\nMesai: **${userData.work_count} kez**`, inline: true },
                { name: '🎒 Envanter', value: `Toplam Eşya: **${itemsCount}**`, inline: true },
                { name: '📈 Nakit Akışı', value: `Kazanılan: **${formatNumber(userData.total_earned)}**\nKaybedilen: **${formatNumber(userData.total_lost)}**`, inline: true },
                { name: '🥷 Suç & Kumar', value: `Soygun: **${userData.rob_success} B / ${userData.rob_fail} H**\nKumar: **${userData.gamble_count} el**`, inline: true }
            )
            .setFooter({ text: `Hesap Açılış: ${new Date(userData.created_at).toLocaleDateString('tr-TR')}` });
        
        await interaction.reply({ embeds: [embed] });
    }
};

commands['leaderboard'] = {
    data: { name: 'leaderboard', description: 'En zengin 10 kullanıcıyı gösterir.' },
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
            
            const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `**#${i+1}**`;
            desc += `${medal} **${tag}** — ${CURRENCY} ${formatNumber(row.total)}\n`;
        }

        const embed = createEmbed('premium', '🏆 Global Servet Sıralaması', desc || 'Kimse yok.');
        await interaction.reply({ embeds: [embed] });
    }
};

commands['rank-streak'] = {
    data: { name: 'rank-streak', description: 'En yüksek günlük seriye sahip 10 kişi.' },
    async execute(interaction) {
        const res = await pool.query('SELECT user_id, daily_streak FROM economy_users WHERE daily_streak > 0 ORDER BY daily_streak DESC LIMIT 10');
        let desc = '';
        for (let i = 0; i < res.rows.length; i++) {
            let tag = 'Gizemli Biri';
            try { tag = (await interaction.client.users.fetch(res.rows[i].user_id)).username; } catch (e) { }
            desc += `🔥 **${res.rows[i].daily_streak} Gün** — ${tag}\n`;
        }
        await interaction.reply({ embeds: [createEmbed('info', '🔥 En İstikrarlı Kullanıcılar', desc || 'Aktif kimse yok.')] });
    }
};

commands['economy-stats'] = {
    data: { name: 'economy-stats', description: 'Sunucunun genel ekonomi durumunu gör.' },
    async execute(interaction) {
        const res = await pool.query('SELECT COUNT(*) as users, SUM(wallet) as total_w, SUM(bank) as total_b FROM economy_users');
        const data = res.rows[0];
        const tw = Number(data.total_w) || 0;
        const tb = Number(data.total_b) || 0;

        const embed = createEmbed('info', '📊 Global Ekonomi İstatistikleri')
            .addFields(
                { name: 'Kayıtlı Vatandaş', value: `**${data.users}** Kişi`, inline: true },
                { name: 'Piyasadaki Para (Cüzdanlar)', value: `${CURRENCY} **${formatNumber(tw)}**`, inline: true },
                { name: 'Rezervler (Bankalar)', value: `🏦 **${formatNumber(tb)}**`, inline: true },
                { name: 'Toplam Hacim', value: `**${formatNumber(tw + tb)}**`, inline: false }
            );
        await interaction.reply({ embeds: [embed] });
    }
};

commands['cooldowns'] = {
    data: { name: 'cooldowns', description: 'Komut bekleme sürelerini gösterir.' },
    async execute(interaction) {
        const u = await ensureUser(interaction.user.id);
        const now = new Date();
        
        const check = (last, ms) => {
            if (!last) return '🟢 Hazır';
            const diff = now - new Date(last);
            if (diff >= ms) return '🟢 Hazır';
            return `⏳ ${getMins(ms - diff)} dk kaldı`;
        };

        const embed = createEmbed('info', '⏱️ Bekleme Sürelerin')
            .addFields(
                { name: 'Work', value: check(u.last_work, 3600000), inline: true },
                { name: 'Crime', value: check(u.last_crime, 7200000), inline: true },
                { name: 'Rob', value: check(u.last_rob, 10800000), inline: true },
                { name: 'Beg', value: check(u.last_beg, 300000), inline: true },
                { name: 'Daily', value: check(u.last_daily, 86400000), inline: true }
            );
        await interaction.reply({ embeds: [embed] });
    }
};

// --- 7. ADMIN COMMANDS ---
const checkAdmin = (interaction) => {
    if (interaction.user.id !== OWNER_ID && !interaction.member.permissions.has('Administrator')) {
        interaction.reply({ embeds: [createEmbed('error', '⛔ Yetkisiz', 'Bunu sadece yöneticiler kullanabilir.')], ephemeral: true });
        return false;
    }
    return true;
};

commands['add-money'] = {
    data: { name: 'add-money', description: '[Yetkili] Para ekler.', options: [{ name: 'user', type: 6, description: 'Kime?', required: true }, { name: 'amount', type: 4, description: 'Miktar', required: true }] },
    async execute(interaction) {
        if (!checkAdmin(interaction)) return;
        const target = interaction.options.getUser('user');
        const amount = interaction.options.getInteger('amount');
        await ensureUser(target.id);
        await addMoney(target.id, amount, 'wallet');
        await logTransaction(interaction.user.id, target.id, 'admin_add', amount, 'Admin Added Money');
        interaction.reply({ embeds: [createEmbed('success', '✅ Başarılı', `${target.username} hesabına ${amount} eklendi.`)] });
    }
};

commands['remove-money'] = {
    data: { name: 'remove-money', description: '[Yetkili] Para siler.', options: [{ name: 'user', type: 6, description: 'Kimden?', required: true }, { name: 'amount', type: 4, description: 'Miktar', required: true }] },
    async execute(interaction) {
        if (!checkAdmin(interaction)) return;
        const target = interaction.options.getUser('user');
        const amount = interaction.options.getInteger('amount');
        await ensureUser(target.id);
        await removeMoney(target.id, amount, 'wallet');
        await logTransaction(interaction.user.id, target.id, 'admin_remove', amount, 'Admin Removed Money');
        interaction.reply({ embeds: [createEmbed('success', '✅ Başarılı', `${target.username} hesabından ${amount} silindi.`)] });
    }
};

commands['reset-economy-user'] = {
    data: { name: 'reset-economy-user', description: '[Yetkili] Kullanıcı ekonomisini sıfırlar.', options: [{ name: 'user', type: 6, description: 'Kimin?', required: true }] },
    async execute(interaction) {
        if (!checkAdmin(interaction)) return;
        const target = interaction.options.getUser('user');
        await pool.query('DELETE FROM economy_users WHERE user_id = $1', [target.id]);
        interaction.reply({ embeds: [createEmbed('success', '🧹 Sıfırlandı', `${target.username} adlı kişinin tüm verileri silindi.`)] });
    }
};

// ================== [ EVENT LISTENERS ] ==================
const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages] });

client.once('ready', async () => {
    console.log(`🤖 ${client.user.tag} aktif!`);
    await initDB();

    // Slash command kayıt işlemi (Global)
    const rest = new REST({ version: '10' }).setToken(process.env.BOT_TOKEN);
    try {
        console.log('🔄 Slash komutları yükleniyor...');
        const cmdArr = Object.values(commands).map(c => c.data);
        await rest.put(Routes.applicationCommands(process.env.CLIENT_ID), { body: cmdArr });
        console.log('✅ Komutlar başarıyla yüklendi!');
    } catch (error) {
        console.error('❌ Komut Yükleme Hatası:', error);
    }
});

client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;

    const command = commands[interaction.commandName];
    if (!command) return;

    try {
        await command.execute(interaction);
    } catch (error) {
        console.error(`Komut Hatası (${interaction.commandName}):`, error);
        const errEmbed = createEmbed('error', '⚠️ Sistem Hatası', 'Bu komutu işlerken kritik bir hata oluştu. Lütfen geliştiriciye bildirin.');
        if (interaction.replied || interaction.deferred) {
            await interaction.followUp({ embeds: [errEmbed], ephemeral: true }).catch(()=>null);
        } else {
            await interaction.reply({ embeds: [errEmbed], ephemeral: true }).catch(()=>null);
        }
    }
});

// ================== [ ERROR HANDLING ] ==================
process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception:', err);
    // process.exit(1); // Kritik sistemlerde açılabilir, bot kapanıp pm2 ile yeniden başlar.
});

// Bot Giriş
client.login(process.env.BOT_TOKEN);