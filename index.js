/**
 * ============================================================================
 * PROFESYONEL DISCORD MÜZİK BOTU (TEK DOSYA MİMARİSİ)
 * ============================================================================
 * Geliştirici Notu: Bu dosya fiziksel olarak tek parça olsa da, mantıksal
 * olarak modüler bir yapıya sahiptir. Bölümler arası geçişler net olarak
 * belirtilmiştir.
 * ============================================================================
 */

// ============================================================================
// 1. IMPORT VE YAPILANDIRMA BÖLÜMÜ
// ============================================================================
require('dotenv').config();
const { 
    Client, GatewayIntentBits, Partials, Collection, EmbedBuilder, 
    ActionRowBuilder, ButtonBuilder, ButtonStyle, REST, Routes, 
    SlashCommandBuilder 
} = require('discord.js');
const { 
    joinVoiceChannel, createAudioPlayer, createAudioResource, 
    entersState, StreamType, AudioPlayerStatus, VoiceConnectionStatus, 
    getVoiceConnection 
} = require('@discordjs/voice');
const play = require('play-dl');
const express = require('express');

// ============================================================================
// 2. CONFIG VE SABİTLER
// ============================================================================
const CONFIG = {
    TOKEN: process.env.DISCORD_TOKEN,
    CLIENT_ID: process.env.CLIENT_ID,
    GUILD_ID: process.env.GUILD_ID,
    PORT: process.env.PORT || 3000,
    REGISTER_COMMANDS: process.env.REGISTER_COMMANDS === 'true',
    DEFAULT_VOLUME: parseInt(process.env.DEFAULT_VOLUME) || 70,
    MAX_QUEUE_SIZE: parseInt(process.env.MAX_QUEUE_SIZE) || 100,
    COLORS: {
        PRIMARY: '#5865F2', // Discord Blurple
        SUCCESS: '#43B581', // Yeşil
        ERROR: '#F04747',   // Kırmızı
        INFO: '#FEE75C',    // Sarı
        PREMIUM: '#9B59B6'  // Mor
    }
};

// ============================================================================
// 3. EXPRESS HEALTH ENDPOINT
// ============================================================================
const app = express();
app.get('/health', (req, res) => {
    res.json({ status: 'UP', message: 'Discord Müzik Botu çalışıyor.', timestamp: new Date() });
});
app.listen(CONFIG.PORT, () => {
    console.log(`[EXPRESS] Health endpoint port ${CONFIG.PORT} üzerinde aktif.`);
});

// ============================================================================
// 4. MÜZİK KUYRUĞU (QUEUE) VERİ YAPISI
// ============================================================================
// Sunucu bazlı oynatıcıları ve kuyrukları tutacak ana harita
const queueMap = new Map();

/**
 * Kuyruk yapısı şablonu:
 * {
 * textChannel: TextChannel,
 * voiceChannel: VoiceChannel,
 * connection: VoiceConnection,
 * player: AudioPlayer,
 * songs: Array<{title, url, duration, thumbnail, requester}>,
 * volume: number,
 * playing: boolean,
 * loopMode: 'KAPALI' | 'SARKI' | 'KUYRUK',
 * currentSong: Object | null
 * }
 */

// ============================================================================
// 5. DISCORD UI VE YARDIMCI FONKSİYONLAR (EMBED ÜRETİCİLERİ)
// ============================================================================
const UI = {
    Success: (desc) => new EmbedBuilder().setColor(CONFIG.COLORS.SUCCESS).setDescription(`✅ | ${desc}`),
    Error: (desc) => new EmbedBuilder().setColor(CONFIG.COLORS.ERROR).setDescription(`❌ | ${desc}`),
    Info: (desc) => new EmbedBuilder().setColor(CONFIG.COLORS.INFO).setDescription(`ℹ️ | ${desc}`),
    Premium: (title, desc) => new EmbedBuilder().setColor(CONFIG.COLORS.PREMIUM).setTitle(title).setDescription(desc),
    
    NowPlaying: (song) => {
        return new EmbedBuilder()
            .setColor(CONFIG.COLORS.PRIMARY)
            .setAuthor({ name: '🎵 Şu An Çalıyor' })
            .setTitle(song.title)
            .setURL(song.url)
            .setThumbnail(song.thumbnail)
            .addFields(
                { name: 'Süre', value: song.duration, inline: true },
                { name: 'İsteyen', value: `<@${song.requester.id}>`, inline: true }
            )
            .setFooter({ text: 'Modern Müzik Sistemi' })
            .setTimestamp();
    },

    QueueList: (serverQueue) => {
        if (!serverQueue.songs.length && !serverQueue.currentSong) {
            return UI.Info('Kuyruk şu an boş.');
        }

        const embed = new EmbedBuilder()
            .setColor(CONFIG.COLORS.PRIMARY)
            .setTitle('🎶 Sunucu Müzik Kuyruğu')
            .setFooter({ text: `Döngü: ${serverQueue.loopMode} | Ses: %${serverQueue.volume}` });

        let desc = '';
        if (serverQueue.currentSong) {
            desc += `**▶️ Şu An Çalan:**\n[${serverQueue.currentSong.title}](${serverQueue.currentSong.url}) | \`${serverQueue.currentSong.duration}\`\n\n`;
        }

        if (serverQueue.songs.length > 0) {
            desc += `**⏳ Sıradakiler:**\n`;
            const max = Math.min(serverQueue.songs.length, 10);
            for (let i = 0; i < max; i++) {
                desc += `**${i + 1}.** [${serverQueue.songs[i].title}](${serverQueue.songs[i].url}) | \`${serverQueue.songs[i].duration}\`\n`;
            }
            if (serverQueue.songs.length > 10) {
                desc += `\n*...ve ${serverQueue.songs.length - 10} şarkı daha.*`;
            }
        } else {
            desc += `*Sırada bekleyen şarkı yok.*`;
        }

        embed.setDescription(desc);
        return embed;
    }
};

// Ses kanalında olup olmadığını kontrol eden yardımcı fonksiyon
function checkVoiceRequirements(interaction, requireBotInVoice = false) {
    const userVoice = interaction.member.voice.channel;
    if (!userVoice) {
        interaction.reply({ embeds: [UI.Error('Bu komutu kullanmak için bir ses kanalında olmalısınız.')], ephemeral: true });
        return false;
    }

    const botVoice = interaction.guild.members.me.voice.channel;
    if (requireBotInVoice && !botVoice) {
        interaction.reply({ embeds: [UI.Error('Bot şu an herhangi bir ses kanalında değil.')], ephemeral: true });
        return false;
    }

    if (botVoice && userVoice.id !== botVoice.id) {
        interaction.reply({ embeds: [UI.Error(`Bot zaten **${botVoice.name}** kanalında. Aynı kanalda olmalısınız.`)], ephemeral: true });
        return false;
    }

    return true;
}

// ============================================================================
// 6. SES KAYNAĞI VE MÜZİK YÖNETİM SİSTEMİ
// ============================================================================

async function playNext(guildId) {
    const serverQueue = queueMap.get(guildId);
    if (!serverQueue) return;

    // Döngü mantığı
    if (serverQueue.currentSong) {
        if (serverQueue.loopMode === 'SARKI') {
            serverQueue.songs.unshift(serverQueue.currentSong);
        } else if (serverQueue.loopMode === 'KUYRUK') {
            serverQueue.songs.push(serverQueue.currentSong);
        }
    }

    if (serverQueue.songs.length === 0) {
        // Kuyruk bitti
        serverQueue.currentSong = null;
        if (serverQueue.textChannel) {
            serverQueue.textChannel.send({ embeds: [UI.Info('Kuyruk sona erdi. Bot kanalda bekliyor.')] }).catch(() => {});
        }
        return;
    }

    const nextSong = serverQueue.songs.shift();
    serverQueue.currentSong = nextSong;

    try {
        const stream = await play.stream(nextSong.url);
        const resource = createAudioResource(stream.stream, {
            inputType: stream.type,
            inlineVolume: true
        });
        
        resource.volume.setVolume(serverQueue.volume / 100);
        serverQueue.player.play(resource);

        if (serverQueue.textChannel) {
            serverQueue.textChannel.send({ embeds: [UI.NowPlaying(nextSong)] }).catch(() => {});
        }
    } catch (error) {
        console.error(`[Oynatma Hatası - ${guildId}]:`, error);
        if (serverQueue.textChannel) {
            serverQueue.textChannel.send({ embeds: [UI.Error(`Şarkı oynatılamadı, sıradakine geçiliyor. (${nextSong.title})`)] }).catch(() => {});
        }
        playNext(guildId);
    }
}

// ============================================================================
// 7. SLASH COMMAND TANIMLAMALARI
// ============================================================================
const musicCommand = new SlashCommandBuilder()
    .setName('muzik')
    .setDescription('Gelişmiş müzik botu ana komutu.')
    
    // Alt Komutlar
    .addSubcommand(sub => sub.setName('gir').setDescription('Botu bulunduğunuz ses kanalına sokar.'))
    .addSubcommand(sub => sub.setName('cal').setDescription('Belirttiğiniz şarkıyı çalar veya kuyruğa ekler.')
        .addStringOption(opt => opt.setName('sorgu').setDescription('Şarkı adı veya URL (YouTube vs.)').setRequired(true)))
    .addSubcommand(sub => sub.setName('gec').setDescription('Mevcut şarkıyı geçer.'))
    .addSubcommand(sub => sub.setName('durdur').setDescription('Çalmayı durdurur ve kuyruğu temizler.'))
    .addSubcommand(sub => sub.setName('duraklat').setDescription('Mevcut şarkıyı duraklatır.'))
    .addSubcommand(sub => sub.setName('devam').setDescription('Duraklatılmış şarkıyı devam ettirir.'))
    .addSubcommand(sub => sub.setName('sira').setDescription('Müzik kuyruğunu gösterir.'))
    .addSubcommand(sub => sub.setName('calan').setDescription('Şu an çalan şarkı bilgisini gösterir.'))
    .addSubcommand(sub => sub.setName('ses').setDescription('Ses seviyesini ayarlar.')
        .addIntegerOption(opt => opt.setName('seviye').setDescription('Ses seviyesi (1-150)').setMinValue(1).setMaxValue(150).setRequired(true)))
    .addSubcommand(sub => sub.setName('dongu').setDescription('Döngü modunu değiştirir.')
        .addStringOption(opt => opt.setName('mod').setDescription('Döngü Modu').setRequired(true)
            .addChoices(
                { name: 'Kapalı', value: 'KAPALI' },
                { name: 'Şarkı (Tekrarla)', value: 'SARKI' },
                { name: 'Kuyruk (Tümünü Tekrarla)', value: 'KUYRUK' }
            )))
    .addSubcommand(sub => sub.setName('cik').setDescription('Bot ses kanalından çıkar ve verileri temizler.'))
    .addSubcommand(sub => sub.setName('yardim').setDescription('Müzik botu komutları hakkında bilgi verir.'));

// ============================================================================
// 8. DISCORD İSTEMCİSİ VE EVENT HANDLER
// ============================================================================
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMessages
    ]
});

client.once('ready', async () => {
    console.log(`[DISCORD] ${client.user.tag} olarak giriş yapıldı!`);
    client.user.setActivity('/muzik yardim | Premium Kalite', { type: 2 }); // Listening

    // Komutları Kaydet (Slash Command Register)
    if (CONFIG.REGISTER_COMMANDS) {
        const rest = new REST({ version: '10' }).setToken(CONFIG.TOKEN);
        try {
            console.log('[DISCORD] Slash komutları yükleniyor...');
            const route = CONFIG.GUILD_ID 
                ? Routes.applicationGuildCommands(CONFIG.CLIENT_ID, CONFIG.GUILD_ID)
                : Routes.applicationCommands(CONFIG.CLIENT_ID);
            
            await rest.put(route, { body: [musicCommand.toJSON()] });
            console.log('[DISCORD] Slash komutları başarıyla kaydedildi.');
        } catch (error) {
            console.error('[DISCORD] Komut kayıt hatası:', error);
        }
    }
});

// ============================================================================
// 9. SLASH COMMAND İŞLEYİCİSİ (INTERACTION CREATE)
// ============================================================================
client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;
    if (interaction.commandName !== 'muzik') return;

    const subCommand = interaction.options.getSubcommand();
    const guildId = interaction.guild.id;

    try {
        switch (subCommand) {
            // -------------------------------------------------------------
            case 'gir': {
                if (!checkVoiceRequirements(interaction, false)) return;
                
                const voiceChannel = interaction.member.voice.channel;
                const connection = joinVoiceChannel({
                    channelId: voiceChannel.id,
                    guildId: guildId,
                    adapterCreator: interaction.guild.voiceAdapterCreator,
                });

                await interaction.reply({ embeds: [UI.Success(`Bağlanıldı: **${voiceChannel.name}**`)] });
                break;
            }
            // -------------------------------------------------------------
            case 'cal': {
                if (!checkVoiceRequirements(interaction, false)) return;
                await interaction.deferReply(); // İşlem uzun sürebilir

                const query = interaction.options.getString('sorgu');
                const voiceChannel = interaction.member.voice.channel;
                
                // Araştırma / Parse İşlemi
                let videoInfo;
                try {
                    const searchResult = await play.search(query, { limit: 1 });
                    if (!searchResult || searchResult.length === 0) {
                        return interaction.editReply({ embeds: [UI.Error('Şarkı bulunamadı.')] });
                    }
                    videoInfo = searchResult[0];
                } catch (err) {
                    return interaction.editReply({ embeds: [UI.Error('Arama sırasında bir hata oluştu. Lütfen geçerli bir bağlantı veya isim girin.')] });
                }

                const song = {
                    title: videoInfo.title,
                    url: videoInfo.url,
                    duration: videoInfo.durationRaw,
                    thumbnail: videoInfo.thumbnails[0]?.url || null,
                    requester: interaction.user
                };

                let serverQueue = queueMap.get(guildId);

                // Kuyruk yoksa oluştur
                if (!serverQueue) {
                    const player = createAudioPlayer();
                    const connection = joinVoiceChannel({
                        channelId: voiceChannel.id,
                        guildId: guildId,
                        adapterCreator: interaction.guild.voiceAdapterCreator,
                    });

                    serverQueue = {
                        textChannel: interaction.channel,
                        voiceChannel: voiceChannel,
                        connection: connection,
                        player: player,
                        songs: [],
                        volume: CONFIG.DEFAULT_VOLUME,
                        playing: true,
                        loopMode: 'KAPALI',
                        currentSong: null
                    };
                    queueMap.set(guildId, serverQueue);

                    // Oynatıcı eventlerini dinle
                    player.on(AudioPlayerStatus.Idle, () => {
                        playNext(guildId);
                    });
                    
                    player.on('error', error => {
                        console.error(`[Ses Oynatıcı Hatası - ${guildId}]:`, error.message);
                        playNext(guildId);
                    });

                    connection.subscribe(player);
                }

                // Şarkıyı kuyruğa ekle
                if (serverQueue.songs.length >= CONFIG.MAX_QUEUE_SIZE) {
                    return interaction.editReply({ embeds: [UI.Error(`Kuyruk kapasitesi doldu! (Maksimum ${CONFIG.MAX_QUEUE_SIZE} şarkı)`)] });
                }

                serverQueue.songs.push(song);

                if (!serverQueue.currentSong) {
                    // İlk şarkıysa direkt başlat
                    interaction.editReply({ embeds: [UI.Success(`Şarkı yükleniyor ve çalmaya başlıyor...`)] });
                    playNext(guildId);
                } else {
                    // Oynatılıyorsa sıraya eklendi bilgisini ver
                    const addedEmbed = new EmbedBuilder()
                        .setColor(CONFIG.COLORS.INFO)
                        .setAuthor({ name: '📝 Kuyruğa Eklendi' })
                        .setTitle(song.title)
                        .setURL(song.url)
                        .addFields(
                            { name: 'Süre', value: song.duration, inline: true },
                            { name: 'Sıra', value: `#${serverQueue.songs.length}`, inline: true }
                        )
                        .setThumbnail(song.thumbnail);
                    interaction.editReply({ embeds: [addedEmbed] });
                }
                break;
            }
            // -------------------------------------------------------------
            case 'gec': {
                if (!checkVoiceRequirements(interaction, true)) return;
                const serverQueue = queueMap.get(guildId);
                
                if (!serverQueue || !serverQueue.currentSong) {
                    return interaction.reply({ embeds: [UI.Error('Şu anda çalan bir şarkı yok.')], ephemeral: true });
                }

                serverQueue.player.stop(); // Stop tetiklenince Idle eventi çalışır ve playNext()'i çağırır.
                interaction.reply({ embeds: [UI.Success('Şarkı geçildi. ⏭️')] });
                break;
            }
            // -------------------------------------------------------------
            case 'durdur': {
                if (!checkVoiceRequirements(interaction, true)) return;
                const serverQueue = queueMap.get(guildId);
                
                if (!serverQueue) {
                    return interaction.reply({ embeds: [UI.Error('Durdurulacak bir müzik sistemi aktif değil.')], ephemeral: true });
                }

                serverQueue.songs = [];
                serverQueue.loopMode = 'KAPALI';
                serverQueue.player.stop();
                interaction.reply({ embeds: [UI.Success('Müzik durduruldu ve kuyruk temizlendi. ⏹️')] });
                break;
            }
            // -------------------------------------------------------------
            case 'duraklat': {
                if (!checkVoiceRequirements(interaction, true)) return;
                const serverQueue = queueMap.get(guildId);
                
                if (!serverQueue || !serverQueue.currentSong) return interaction.reply({ embeds: [UI.Error('Çalan bir şarkı yok.')] });
                if (serverQueue.player.state.status === AudioPlayerStatus.Paused) return interaction.reply({ embeds: [UI.Info('Şarkı zaten duraklatılmış.')] });

                serverQueue.player.pause();
                interaction.reply({ embeds: [UI.Success('Şarkı duraklatıldı. ⏸️')] });
                break;
            }
            // -------------------------------------------------------------
            case 'devam': {
                if (!checkVoiceRequirements(interaction, true)) return;
                const serverQueue = queueMap.get(guildId);
                
                if (!serverQueue || !serverQueue.currentSong) return interaction.reply({ embeds: [UI.Error('Çalan bir şarkı yok.')] });
                if (serverQueue.player.state.status !== AudioPlayerStatus.Paused) return interaction.reply({ embeds: [UI.Info('Şarkı şu an duraklatılmış durumda değil.')] });

                serverQueue.player.unpause();
                interaction.reply({ embeds: [UI.Success('Şarkı devam ettiriliyor. ▶️')] });
                break;
            }
            // -------------------------------------------------------------
            case 'sira': {
                const serverQueue = queueMap.get(guildId);
                if (!serverQueue) {
                    return interaction.reply({ embeds: [UI.Info('Sunucuda aktif bir kuyruk bulunmuyor.')] });
                }
                interaction.reply({ embeds: [UI.QueueList(serverQueue)] });
                break;
            }
            // -------------------------------------------------------------
            case 'calan': {
                const serverQueue = queueMap.get(guildId);
                if (!serverQueue || !serverQueue.currentSong) {
                    return interaction.reply({ embeds: [UI.Info('Şu anda çalan bir şarkı yok.')] });
                }
                interaction.reply({ embeds: [UI.NowPlaying(serverQueue.currentSong)] });
                break;
            }
            // -------------------------------------------------------------
            case 'ses': {
                if (!checkVoiceRequirements(interaction, true)) return;
                const serverQueue = queueMap.get(guildId);
                if (!serverQueue) return interaction.reply({ embeds: [UI.Error('Aktif bir müzik sistemi yok.')], ephemeral: true });

                const volume = interaction.options.getInteger('seviye');
                serverQueue.volume = volume;
                
                // Mevcut resource varsa sesini güncelle
                if (serverQueue.player.state.status === AudioPlayerStatus.Playing) {
                    serverQueue.player.state.resource.volume.setVolume(volume / 100);
                }

                interaction.reply({ embeds: [UI.Success(`Ses seviyesi **%${volume}** olarak ayarlandı. 🔊`)] });
                break;
            }
            // -------------------------------------------------------------
            case 'dongu': {
                if (!checkVoiceRequirements(interaction, true)) return;
                const serverQueue = queueMap.get(guildId);
                if (!serverQueue) return interaction.reply({ embeds: [UI.Error('Aktif bir müzik sistemi yok.')], ephemeral: true });

                const mode = interaction.options.getString('mod');
                serverQueue.loopMode = mode;

                let modeStr = mode === 'KAPALI' ? 'Kapalı ➡️' : mode === 'SARKI' ? 'Şarkı Döngüsü 🔂' : 'Kuyruk Döngüsü 🔁';
                interaction.reply({ embeds: [UI.Success(`Döngü modu ayarlandı: **${modeStr}**`)] });
                break;
            }
            // -------------------------------------------------------------
            case 'cik': {
                if (!checkVoiceRequirements(interaction, true)) return;
                const serverQueue = queueMap.get(guildId);
                
                if (serverQueue) {
                    serverQueue.player.stop();
                    serverQueue.connection.destroy();
                    queueMap.delete(guildId);
                } else {
                    // Sadece kanaldan atılmış kalmış botu temizlemek için
                    const connection = getVoiceConnection(guildId);
                    if (connection) connection.destroy();
                }

                interaction.reply({ embeds: [UI.Success('Ses kanalından çıkıldı ve veriler temizlendi. 👋')] });
                break;
            }
            // -------------------------------------------------------------
            case 'yardim': {
                const helpEmbed = new EmbedBuilder()
                    .setColor(CONFIG.COLORS.PREMIUM)
                    .setTitle('🎛️ Müzik Sistemi Yardım Menüsü')
                    .setDescription('Gelişmiş komut yapısı `/muzik <işlem>` şeklindedir.')
                    .addFields(
                        { name: '🎵 Oynatma İşlemleri', value: 
                            `\`/muzik cal [sorgu]\` - Şarkı arar veya URL'den oynatır.\n` +
                            `\`/muzik gec\` - Çalan şarkıyı atlar.\n` +
                            `\`/muzik durdur\` - Sistemi durdurur, kuyruğu temizler.`
                        },
                        { name: '⏸️ Kontrol İşlemleri', value: 
                            `\`/muzik duraklat\` - Şarkıyı duraklatır.\n` +
                            `\`/muzik devam\` - Şarkıyı sürdürür.\n` +
                            `\`/muzik ses [seviye]\` - Sesi ayarlar (1-150).\n` +
                            `\`/muzik dongu [mod]\` - Tekrar modunu ayarlar.`
                        },
                        { name: '📋 Bilgi ve Yönetim', value: 
                            `\`/muzik sira\` - Tüm şarkı kuyruğunu görüntüler.\n` +
                            `\`/muzik calan\` - O anki şarkı detaylarını verir.\n` +
                            `\`/muzik gir\` - Kanala giriş yapar.\n` +
                            `\`/muzik cik\` - Çıkış yapar ve sistemi temizler.`
                        }
                    )
                    .setFooter({ text: 'Tek Dosya • Premium Müzik Botu' });

                interaction.reply({ embeds: [helpEmbed] });
                break;
            }
        }
    } catch (error) {
        console.error(`[Komut Hatası - ${subCommand}]:`, error);
        const errEmbed = UI.Error('Bu komut işlenirken beklenmeyen bir sistem hatası oluştu.');
        if (interaction.deferred || interaction.replied) {
            interaction.editReply({ embeds: [errEmbed], ephemeral: true }).catch(() => {});
        } else {
            interaction.reply({ embeds: [errEmbed], ephemeral: true }).catch(() => {});
        }
    }
});

// Bot Bağlantısı
client.login(CONFIG.TOKEN);