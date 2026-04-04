/**
 * ============================================================================
 * 1. IMPORTS & REQUIRE
 * ============================================================================
 */
const { Client, GatewayIntentBits, EmbedBuilder, SlashCommandBuilder, REST, Routes, Colors } = require('discord.js');
const admin = require('firebase-admin');
const express = require('express');
const dotenv = require('dotenv');

/**
 * ============================================================================
 * 2. DOTENV & CONFIG YÖNETİMİ
 * ============================================================================
 */
dotenv.config();

const CONFIG = {
    DISCORD: {
        TOKEN: process.env.DISCORD_TOKEN,
        CLIENT_ID: process.env.CLIENT_ID,
        GUILD_ID: process.env.GUILD_ID,
        REGISTER: process.env.REGISTER_COMMANDS === 'true'
    },
    SERVER: {
        PORT: process.env.PORT || 3000
    },
    FIREBASE: {
        PROJECT_ID: process.env.FIREBASE_PROJECT_ID,
        CLIENT_EMAIL: process.env.FIREBASE_CLIENT_EMAIL,
        PRIVATE_KEY: process.env.FIREBASE_PRIVATE_KEY ? process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n') : null
    },
    ECONOMY: {
        NAME: process.env.ECONOMY_CURRENCY_NAME || 'MetaCoin',
        SYMBOL: process.env.ECONOMY_CURRENCY_SYMBOL || 'MC',
        START_WALLET: Number(process.env.STARTING_WALLET) || 0,
        START_BANK: Number(process.env.STARTING_BANK) || 0,
        START_BANK_MAX: Number(process.env.STARTING_BANK_MAX) || 50000
    },
    COOLDOWNS: {
        DAILY: (Number(process.env.DAILY_COOLDOWN_HOURS) || 20) * 60 * 60 * 1000,
        WORK: (Number(process.env.WORK_COOLDOWN_MINUTES) || 30) * 60 * 1000,
        BEG: (Number(process.env.BEG_COOLDOWN_MINUTES) || 2) * 60 * 1000,
        CRIME: (Number(process.env.CRIME_COOLDOWN_MINUTES) || 10) * 60 * 1000,
        ROB: (Number(process.env.ROB_COOLDOWN_MINUTES) || 60) * 60 * 1000
    },
    UI: {
        COLORS: {
            PRIMARY: 0xFFD700, // Premium Altın Rengi
            SUCCESS: 0x2ECC71,
            ERROR: 0xE74C3C,
            INFO: 0x3498DB
        }
    }
};

/**
 * ============================================================================
 * 3. HEALTH ENDPOINT (EXPRESS)
 * ============================================================================
 */
const app = express();
app.get('/health', (req, res) => res.status(200).json({ status: 'Online', service: 'MetaCoin Discord Bot' }));
app.listen(CONFIG.SERVER.PORT, () => console.log(`[SERVER] Health endpoint aktif: Port ${CONFIG.SERVER.PORT}`));

/**
 * ============================================================================
 * 4. FIRESTORE BAĞLANTISI
 * ============================================================================
 */
if (!admin.apps.length) {
    try {
        admin.initializeApp({
            credential: admin.credential.cert({
                projectId: CONFIG.FIREBASE.PROJECT_ID,
                clientEmail: CONFIG.FIREBASE.CLIENT_EMAIL,
                privateKey: CONFIG.FIREBASE.PRIVATE_KEY
            })
        });
        console.log('[DATABASE] Firestore bağlantısı başarılı.');
    } catch (error) {
        console.error('[DATABASE] Firestore başlatılamadı. .env ayarlarınızı kontrol edin.', error.message);
        process.exit(1);
    }
}
const db = admin.firestore();

/**
 * ============================================================================
 * 5. SABİTLER / MARKET İÇERİĞİ
 * ============================================================================
 */
const SHOP_ITEMS = [
    { id: 'kucuk_kasa', name: 'Küçük Kasa', price: 2500, desc: 'İçinden sürpriz miktarda para çıkar.', category: 'Kasa' },
    { id: 'banka_belgesi', name: 'Banka Genişletme Belgesi', price: 15000, desc: 'Banka limitinizi 25.000 MC artırır.', category: 'Yükseltme' },
    { id: 'xp_karti', name: 'Premium XP Kartı', price: 5000, desc: 'Profilinize 500 XP ekler.', category: 'Güçlendirici' }
];

/**
 * ============================================================================
 * 6. YARDIMCI FONKSİYONLAR & UI
 * ============================================================================
 */
const formatMoney = (amount) => `**${amount.toLocaleString('tr-TR')} ${CONFIG.ECONOMY.SYMBOL}**`;
const getLevelTarget = (level) => level * level * 100;

const createEmbed = (title, description, color, user) => {
    return new EmbedBuilder()
        .setTitle(title)
        .setDescription(description)
        .setColor(color)
        .setTimestamp()
        .setFooter({ text: `MetaCoin Ekonomi Sistemi • İstek: ${user.username}`, iconURL: user.displayAvatarURL() });
};

const UI = {
    Success: (msg, user) => createEmbed('✅ İşlem Başarılı', msg, CONFIG.UI.COLORS.SUCCESS, user),
    Error: (msg, user) => createEmbed('❌ Hata', msg, CONFIG.UI.COLORS.ERROR, user),
    Info: (title, msg, user) => createEmbed(title, msg, CONFIG.UI.COLORS.PRIMARY, user)
};

/**
 * ============================================================================
 * 7. VERİTABANI: KULLANICI SERVİSİ
 * ============================================================================
 */
const getDefaultUser = () => ({
    wallet: CONFIG.ECONOMY.START_WALLET,
    bank: CONFIG.ECONOMY.START_BANK,
    bankMax: CONFIG.ECONOMY.START_BANK_MAX,
    xp: 0,
    level: 1,
    inventory: {},
    cooldowns: {},
    stats: {
        gunlukKullanim: 0, calismaSayisi: 0, dilenmeSayisi: 0, sucGirisimSayisi: 0, soyGirisimSayisi: 0,
        toplamKazanilan: 0, toplamKaybedilen: 0, marketAlimSayisi: 0
    },
    flags: { blacklisted: false, frozen: false },
    createdAt: Date.now(),
    updatedAt: Date.now()
});

async function getUserData(userId) {
    const ref = db.collection('users').doc(userId);
    const doc = await ref.get();
    let data = getDefaultUser();

    if (doc.exists) {
        const dbData = doc.data();
        // Eksik alanları default ile tamamla (Normalize)
        data = { ...data, ...dbData, stats: { ...data.stats, ...(dbData.stats || {}) }, flags: { ...data.flags, ...(dbData.flags || {}) } };
    }
    return { ref, data };
}

/**
 * ============================================================================
 * 8. EKONOMİ & XP SERVİSLERİ
 * ============================================================================
 */
async function addXP(data, amount) {
    data.xp += amount;
    const target = getLevelTarget(data.level);
    let leveledUp = false;
    if (data.xp >= target) {
        data.level += 1;
        leveledUp = true;
    }
    return leveledUp;
}

/**
 * ============================================================================
 * 9. COOLDOWN SERVİSİ
 * ============================================================================
 */
function checkCooldown(data, type) {
    const lastUsed = data.cooldowns[type] || 0;
    const cooldownTime = CONFIG.COOLDOWNS[type.toUpperCase()];
    const timeLeft = (lastUsed + cooldownTime) - Date.now();
    
    if (timeLeft > 0) {
        const hours = Math.floor(timeLeft / (1000 * 60 * 60));
        const minutes = Math.floor((timeLeft % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((timeLeft % (1000 * 60)) / 1000);
        let timeString = '';
        if (hours > 0) timeString += `${hours} saat `;
        if (minutes > 0) timeString += `${minutes} dakika `;
        timeString += `${seconds} saniye`;
        return { onCooldown: true, timeString };
    }
    return { onCooldown: false };
}

function setCooldown(data, type) {
    if (!data.cooldowns) data.cooldowns = {};
    data.cooldowns[type] = Date.now();
}

/**
 * ============================================================================
 * 10. KOMUT İŞLEYİCİLERİ (HANDLERS)
 * ============================================================================
 */

async function handleBakiye(interaction, data) {
    const targetUser = interaction.options.getUser('kullanici') || interaction.user;
    let userData = data;
    
    if (targetUser.id !== interaction.user.id) {
        const { data: targetData } = await getUserData(targetUser.id);
        userData = targetData;
    }

    const total = userData.wallet + userData.bank;
    const embed = UI.Info(`💳 ${targetUser.username} - Bakiye`, 
        `**Cüzdan:** ${formatMoney(userData.wallet)}\n**Banka:** ${formatMoney(userData.bank)} / ${formatMoney(userData.bankMax)}\n\n**Toplam Servet:** ${formatMoney(total)}`, 
        interaction.user);
    await interaction.editReply({ embeds: [embed] });
}

async function handleGunluk(interaction, data, ref) {
    const cd = checkCooldown(data, 'daily');
    if (cd.onCooldown) return interaction.editReply({ embeds: [UI.Error(`Günlük ödülünü zaten aldın. Lütfen **${cd.timeString}** bekle.`, interaction.user)] });

    const reward = Math.floor(Math.random() * 500) + 1000; // 1000-1500 arası
    data.wallet += reward;
    data.stats.gunlukKullanim += 1;
    data.stats.toplamKazanilan += reward;
    setCooldown(data, 'daily');
    await addXP(data, 15);

    await ref.set(data);
    await interaction.editReply({ embeds: [UI.Success(`Günlük ödülünü topladın! Cüzdanına ${formatMoney(reward)} eklendi.`, interaction.user)] });
}

async function handleCalis(interaction, data, ref) {
    const cd = checkCooldown(data, 'work');
    if (cd.onCooldown) return interaction.editReply({ embeds: [UI.Error(`Şu an çok yorgunsun. Çalışmak için **${cd.timeString}** dinlenmelisin.`, interaction.user)] });

    const reward = Math.floor(Math.random() * 300) + 200; // 200-500 arası
    const jobs = ['kod yazarak', 'madende çalışarak', 'kargo dağıtarak', 'grafik tasarlayarak', 'sunucu yöneterek'];
    const job = jobs[Math.floor(Math.random() * jobs.length)];

    data.wallet += reward;
    data.stats.calismaSayisi += 1;
    data.stats.toplamKazanilan += reward;
    setCooldown(data, 'work');
    const leveledUp = await addXP(data, 10);

    await ref.set(data);
    let msg = `Bugün ${job} ${formatMoney(reward)} kazandın.`;
    if (leveledUp) msg += `\n🎉 **Tebrikler, seviye atladın! Yeni Seviye: ${data.level}**`;
    
    await interaction.editReply({ embeds: [UI.Success(msg, interaction.user)] });
}

async function handleYatir(interaction, data, ref) {
    const miktarStr = interaction.options.getString('miktar').toLowerCase();
    let amount = 0;

    if (miktarStr === 'hepsi' || miktarStr === 'all') amount = data.wallet;
    else amount = parseInt(miktarStr);

    if (isNaN(amount) || amount <= 0) return interaction.editReply({ embeds: [UI.Error('Lütfen geçerli bir miktar girin veya "hepsi" yazın.', interaction.user)] });
    if (data.wallet < amount) return interaction.editReply({ embeds: [UI.Error('Cüzdanında bu kadar para yok!', interaction.user)] });
    
    const availableSpace = data.bankMax - data.bank;
    if (availableSpace <= 0) return interaction.editReply({ embeds: [UI.Error('Bankan tamamen dolu!', interaction.user)] });
    
    if (amount > availableSpace) amount = availableSpace;

    data.wallet -= amount;
    data.bank += amount;
    
    await ref.set(data);
    await interaction.editReply({ embeds: [UI.Success(`Bankaya başarıyla ${formatMoney(amount)} yatırıldı.\nYeni Banka Bakiyesi: ${formatMoney(data.bank)}`, interaction.user)] });
}

async function handleCek(interaction, data, ref) {
    const miktarStr = interaction.options.getString('miktar').toLowerCase();
    let amount = 0;

    if (miktarStr === 'hepsi' || miktarStr === 'all') amount = data.bank;
    else amount = parseInt(miktarStr);

    if (isNaN(amount) || amount <= 0) return interaction.editReply({ embeds: [UI.Error('Lütfen geçerli bir miktar girin veya "hepsi" yazın.', interaction.user)] });
    if (data.bank < amount) return interaction.editReply({ embeds: [UI.Error('Bankanda bu kadar para yok!', interaction.user)] });

    data.bank -= amount;
    data.wallet += amount;
    
    await ref.set(data);
    await interaction.editReply({ embeds: [UI.Success(`Bankadan başarıyla ${formatMoney(amount)} çekildi.\nYeni Cüzdan Bakiyesi: ${formatMoney(data.wallet)}`, interaction.user)] });
}

async function handleGonder(interaction, data, ref) {
    const targetUser = interaction.options.getUser('hedef');
    const amount = interaction.options.getInteger('miktar');

    if (targetUser.bot) return interaction.editReply({ embeds: [UI.Error('Botlara para gönderemezsin!', interaction.user)] });
    if (targetUser.id === interaction.user.id) return interaction.editReply({ embeds: [UI.Error('Kendine para gönderemezsin!', interaction.user)] });
    if (amount <= 0) return interaction.editReply({ embeds: [UI.Error('Geçerli bir miktar girmelisin.', interaction.user)] });
    if (data.wallet < amount) return interaction.editReply({ embeds: [UI.Error('Cüzdanında yeterli bakiye yok.', interaction.user)] });

    const { ref: targetRef, data: targetData } = await getUserData(targetUser.id);

    data.wallet -= amount;
    targetData.wallet += amount;

    await ref.set(data);
    await targetRef.set(targetData);

    await interaction.editReply({ embeds: [UI.Success(`${targetUser} adlı kullanıcıya başarıyla ${formatMoney(amount)} gönderildi.`, interaction.user)] });
}

async function handleMarket(interaction) {
    let desc = "Aşağıdaki ürünleri `/mc satınal <id>` komutu ile alabilirsiniz.\n\n";
    SHOP_ITEMS.forEach(item => {
        desc += `**📦 ${item.name}** (\`${item.id}\`)\n`;
        desc += `└ 🏷️ **Fiyat:** ${formatMoney(item.price)} | 🗂️ **Kategori:** ${item.category}\n`;
        desc += `└ 📝 *${item.desc}*\n\n`;
    });

    await interaction.editReply({ embeds: [UI.Info('🛒 MetaCoin Market', desc, interaction.user)] });
}

async function handleSatinal(interaction, data, ref) {
    const itemId = interaction.options.getString('urun_id').toLowerCase();
    const item = SHOP_ITEMS.find(i => i.id === itemId);

    if (!item) return interaction.editReply({ embeds: [UI.Error('Böyle bir ürün bulunamadı. Lütfen marketi kontrol edin.', interaction.user)] });
    if (data.wallet < item.price) return interaction.editReply({ embeds: [UI.Error(`Bu ürünü almak için cüzdanında yeterli para yok. Gerekli: ${formatMoney(item.price)}`, interaction.user)] });

    data.wallet -= item.price;
    data.stats.marketAlimSayisi += 1;

    // Özel ürün mantıkları
    if (item.id === 'banka_belgesi') {
        data.bankMax += 25000;
        await ref.set(data);
        return interaction.editReply({ embeds: [UI.Success(`Banka Genişletme Belgesi satın alındı! Yeni banka limitin: ${formatMoney(data.bankMax)}`, interaction.user)] });
    }
    
    if (item.id === 'xp_karti') {
        await addXP(data, 500);
        await ref.set(data);
        return interaction.editReply({ embeds: [UI.Success(`Premium XP Kartı kullanıldı! Hesabına 500 XP eklendi.`, interaction.user)] });
    }

    // Normal Envanter Kaydı
    if (!data.inventory[item.id]) data.inventory[item.id] = 0;
    data.inventory[item.id] += 1;

    await ref.set(data);
    await interaction.editReply({ embeds: [UI.Success(`Başarıyla **${item.name}** satın aldın!`, interaction.user)] });
}

async function handleProfil(interaction, data) {
    const targetUser = interaction.options.getUser('kullanici') || interaction.user;
    let userData = data;
    
    if (targetUser.id !== interaction.user.id) {
        const { data: targetData } = await getUserData(targetUser.id);
        userData = targetData;
    }

    const embed = new EmbedBuilder()
        .setTitle(`👤 ${targetUser.username} - Oyuncu Profili`)
        .setColor(CONFIG.UI.COLORS.PRIMARY)
        .setThumbnail(targetUser.displayAvatarURL({ dynamic: true, size: 256 }))
        .addFields(
            { name: '📊 Seviye & XP', value: `**Seviye:** ${userData.level}\n**XP:** ${userData.xp} / ${getLevelTarget(userData.level)}`, inline: true },
            { name: '💰 Bakiye', value: `**Cüzdan:** ${userData.wallet.toLocaleString()}\n**Banka:** ${userData.bank.toLocaleString()}/${userData.bankMax.toLocaleString()}`, inline: true },
            { name: '📈 İstatistikler', value: `**Çalışma:** ${userData.stats.calismaSayisi}\n**Günlük:** ${userData.stats.gunlukKullanim}\n**Market:** ${userData.stats.marketAlimSayisi}`, inline: false }
        )
        .setFooter({ text: 'MetaCoin Sistemleri' });

    await interaction.editReply({ embeds: [embed] });
}

async function handleSiralama(interaction) {
    const snapshot = await db.collection('users').get();
    const users = [];

    snapshot.forEach(doc => {
        const data = doc.data();
        const total = (data.wallet || 0) + (data.bank || 0);
        users.push({ id: doc.id, total, level: data.level || 1 });
    });

    users.sort((a, b) => b.total - a.total);
    const top10 = users.slice(0, 10);

    let desc = "**🏆 En Zengin 10 Kullanıcı**\n\n";
    for (let i = 0; i < top10.length; i++) {
        const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : '🎗️';
        desc += `${medal} **${i + 1}.** <@${top10[i].id}> - **${top10[i].total.toLocaleString()} ${CONFIG.ECONOMY.SYMBOL}** *(Seviye ${top10[i].level})*\n`;
    }

    await interaction.editReply({ embeds: [UI.Info('👑 MetaCoin Sıralama', desc, interaction.user)] });
}

async function handleYardim(interaction) {
    const embed = new EmbedBuilder()
        .setTitle('📚 MetaCoin Yardım Menüsü')
        .setColor(CONFIG.UI.COLORS.PRIMARY)
        .setDescription('Tüm bot sistemini `/mc` komutu üzerinden yönetebilirsiniz.')
        .addFields(
            { name: '💸 Gelir Komutları', value: '`/mc günlük` - Günlük ödül\n`/mc çalış` - Düzenli maaş\n`/mc suç` - Riskli işler (Geliştiriliyor)' },
            { name: '🏦 Banka ve Transfer', value: '`/mc bakiye` - Hesabını gör\n`/mc yatır <miktar/hepsi>` - Bankaya koy\n`/mc çek <miktar/hepsi>` - Cüzdana al\n`/mc gönder <kullanıcı> <miktar>` - Para yolla' },
            { name: '🛒 Market ve Ekonomi', value: '`/mc market` - Ürünleri listele\n`/mc satınal <id>` - Ürün al\n`/mc envanter` - Eşyalarını gör' },
            { name: '📊 Bilgi', value: '`/mc profil` - İstatistiklerin\n`/mc sıralama` - Zenginler listesi' }
        )
        .setFooter({ text: `İstek: ${interaction.user.username}`, iconURL: interaction.user.displayAvatarURL() });

    await interaction.editReply({ embeds: [embed] });
}

/**
 * ============================================================================
 * 11. SLASH COMMAND TANIMLAMASI
 * ============================================================================
 */
const mcCommand = new SlashCommandBuilder()
    .setName('mc')
    .setDescription('MetaCoin ekonomi sisteminin ana komutu.')
    
    // Bakiye
    .addSubcommand(sub => sub.setName('bakiye').setDescription('Mevcut paranızı ve banka durumunuzu gösterir.')
        .addUserOption(opt => opt.setName('kullanici').setDescription('Bakiyesini görmek istediğiniz kullanıcı (Opsiyonel)')))
    // Günlük
    .addSubcommand(sub => sub.setName('gunluk').setDescription('Günlük ücretsiz MetaCoin ödülünüzü alırsınız.'))
    // Çalış
    .addSubcommand(sub => sub.setName('calis').setDescription('Çalışarak para kazanırsınız.'))
    // Yatır
    .addSubcommand(sub => sub.setName('yatir').setDescription('Cüzdanınızdaki parayı bankaya yatırırsınız.')
        .addStringOption(opt => opt.setName('miktar').setDescription('Yatırılacak miktar veya "hepsi"').setRequired(true)))
    // Çek
    .addSubcommand(sub => sub.setName('cek').setDescription('Bankanızdaki parayı cüzdanınıza çekersiniz.')
        .addStringOption(opt => opt.setName('miktar').setDescription('Çekilecek miktar veya "hepsi"').setRequired(true)))
    // Gönder
    .addSubcommand(sub => sub.setName('gonder').setDescription('Başka bir kullanıcıya para gönderirsiniz.')
        .addUserOption(opt => opt.setName('hedef').setDescription('Para gönderilecek kullanıcı').setRequired(true))
        .addIntegerOption(opt => opt.setName('miktar').setDescription('Gönderilecek miktar').setRequired(true)))
    // Market
    .addSubcommand(sub => sub.setName('market').setDescription('Market ürünlerini listeler.'))
    // Satın Al
    .addSubcommand(sub => sub.setName('satinal').setDescription('Marketten bir ürün satın alırsınız.')
        .addStringOption(opt => opt.setName('urun_id').setDescription('Satın alınacak ürünün ID\'si').setRequired(true)))
    // Profil
    .addSubcommand(sub => sub.setName('profil').setDescription('Sizin veya bir başkasının seviye ve detaylı istatistiklerini gösterir.')
        .addUserOption(opt => opt.setName('kullanici').setDescription('Profiline bakılacak kullanıcı (Opsiyonel)')))
    // Sıralama
    .addSubcommand(sub => sub.setName('siralama').setDescription('Sunucudaki veya globaldeki en zengin kullanıcıları listeler.'))
    // Yardım
    .addSubcommand(sub => sub.setName('yardim').setDescription('Ekonomi botunun tüm komutlarını ve kullanımını gösterir.'));

/**
 * ============================================================================
 * 12. DISCORD EVENTLERİ VE BOT BAŞLATMA
 * ============================================================================
 */
const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once('ready', async () => {
    console.log(`[BOT] ${client.user.tag} olarak giriş yapıldı!`);

    if (CONFIG.DISCORD.REGISTER) {
        try {
            const rest = new REST({ version: '10' }).setToken(CONFIG.DISCORD.TOKEN);
            console.log('[BOT] Slash komutları kaydediliyor...');
            
            // Komutları sadece belirtilen sunucuya kaydet (Anında test için önerilir)
            if (CONFIG.DISCORD.GUILD_ID) {
                await rest.put(Routes.applicationGuildCommands(CONFIG.DISCORD.CLIENT_ID, CONFIG.DISCORD.GUILD_ID), { body: [mcCommand.toJSON()] });
                console.log('[BOT] Komutlar sunucuya kaydedildi.');
            } else {
                await rest.put(Routes.applicationCommands(CONFIG.DISCORD.CLIENT_ID), { body: [mcCommand.toJSON()] });
                console.log('[BOT] Komutlar globale kaydedildi.');
            }
        } catch (error) {
            console.error('[BOT] Komut kayıt hatası:', error);
        }
    }
});

client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;
    if (interaction.commandName !== 'mc') return;

    // Timeout olmaması için hızlıca defer ediyoruz
    await interaction.deferReply();

    try {
        const { ref, data } = await getUserData(interaction.user.id);

        if (data.flags.blacklisted) {
            return interaction.editReply({ embeds: [UI.Error('Kara listeye alınmışsınız. Ekonomi komutlarını kullanamazsınız.', interaction.user)] });
        }

        const sub = interaction.options.getSubcommand();

        switch (sub) {
            case 'bakiye': await handleBakiye(interaction, data); break;
            case 'gunluk': await handleGunluk(interaction, data, ref); break;
            case 'calis': await handleCalis(interaction, data, ref); break;
            case 'yatir': await handleYatir(interaction, data, ref); break;
            case 'cek': await handleCek(interaction, data, ref); break;
            case 'gonder': await handleGonder(interaction, data, ref); break;
            case 'market': await handleMarket(interaction); break;
            case 'satinal': await handleSatinal(interaction, data, ref); break;
            case 'profil': await handleProfil(interaction, data); break;
            case 'siralama': await handleSiralama(interaction); break;
            case 'yardim': await handleYardim(interaction); break;
            default:
                await interaction.editReply({ embeds: [UI.Info('Bilgi', 'Bu komut yapım aşamasındadır.', interaction.user)] });
        }
    } catch (error) {
        console.error('[ERROR] Komut işlenirken hata oluştu:', error);
        await interaction.editReply({ embeds: [UI.Error('İşlem sırasında beklenmedik bir veritabanı veya sistem hatası oluştu. Lütfen daha sonra tekrar deneyin.', interaction.user)] }).catch(() => {});
    }
});

client.login(CONFIG.DISCORD.TOKEN);