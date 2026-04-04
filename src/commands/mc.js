const { SlashCommandBuilder } = require('discord.js');
const { getUser, updateUser } = require('../database/firestore');
const { successEmbed, errorEmbed, profileEmbed, infoEmbed } = require('../utils/embeds');
const { ECONOMY, COOLDOWNS } = require('../utils/constants');
const { randomInt, formatTime } = require('../utils/helpers');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('mc')
        .setDescription('MetaCoin Ekonomi Sistemi Ana Komutu')
        .addSubcommand(sub => sub.setName('bakiye').setDescription('Mevcut bakiyeni görüntüler.'))
        .addSubcommand(sub => sub.setName('profil').setDescription('Detaylı finansal profilini görüntüler.'))
        .addSubcommand(sub => sub.setName('günlük').setDescription('Günlük MetaCoin ödülünü alırsın.'))
        .addSubcommand(sub => sub.setName('çalış').setDescription('Çalışarak para kazanırsın.'))
        .addSubcommand(sub => 
            sub.setName('gönder')
            .setDescription('Başka bir kullanıcıya para gönderirsin.')
            .addUserOption(opt => opt.setName('kullanıcı').setDescription('Para gönderilecek kişi').setRequired(true))
            .addIntegerOption(opt => opt.setName('miktar').setDescription('Gönderilecek miktar').setRequired(true))
        )
        .addSubcommand(sub => 
            sub.setName('yatır')
            .setDescription('Cüzdanından bankaya para yatırırsın.')
            .addIntegerOption(opt => opt.setName('miktar').setDescription('Yatırılacak miktar').setRequired(true))
        )
        .addSubcommand(sub => sub.setName('yardım').setDescription('Tüm ekonomi komutlarını listeler.')),
        // Not: 'çek', 'dilen', 'suç', 'soy', 'market' gibi komutlar aynı mantıkla buraya eklenecek.

    async execute(interaction) {
        // Güvenli yanıt için defer yapıyoruz, böylece timeout hatası almayız.
        await interaction.deferReply();

        try {
            const userId = interaction.user.id;
            const subCommand = interaction.options.getSubcommand();
            let userData = await getUser(userId);

            // Güvenlik: Kullanıcı kara listede mi veya dondurulmuş mu?
            if (userData.flags.blacklisted || userData.flags.frozen) {
                return interaction.editReply({ embeds: [errorEmbed('Erişim Engellendi', 'Hesabınız askıya alınmış veya kara listeye eklenmiştir. İşlem yapamazsınız.')] });
            }

            // --- PROFİL & BAKİYE ---
            if (subCommand === 'bakiye') {
                return interaction.editReply({ embeds: [infoEmbed('Güncel Bakiye', `💰 Cüzdan: **${userData.wallet.toLocaleString()}** MC\n🏦 Banka: **${userData.bank.toLocaleString()}** MC`)] });
            }

            if (subCommand === 'profil') {
                return interaction.editReply({ embeds: [profileEmbed(userId, userData, interaction.user)] });
            }

            // --- GÜNLÜK ÖDÜL ---
            if (subCommand === 'günlük') {
                const now = Date.now();
                const lastDaily = userData.cooldowns.daily || 0;

                if (now - lastDaily < COOLDOWNS.DAILY) {
                    const timeLeft = formatTime(COOLDOWNS.DAILY - (now - lastDaily));
                    return interaction.editReply({ embeds: [errorEmbed('Beklemelisin', `Günlük ödülünü zaten almışsın. Tekrar almak için **${timeLeft}** beklemelisin.`)] });
                }

                userData.wallet += ECONOMY.DAILY_REWARD;
                userData.cooldowns.daily = now;
                userData.stats.dailyUses += 1;
                userData.stats.totalEarned += ECONOMY.DAILY_REWARD;

                await updateUser(userId, userData);
                return interaction.editReply({ embeds: [successEmbed('Günlük Ödül Alındı', `Cüzdanına başarıyla **${ECONOMY.DAILY_REWARD.toLocaleString()}** MC eklendi!`)] });
            }

            // --- ÇALIŞ ---
            if (subCommand === 'çalış') {
                const now = Date.now();
                const lastWork = userData.cooldowns.work || 0;

                if (now - lastWork < COOLDOWNS.WORK) {
                    const timeLeft = formatTime(COOLDOWNS.WORK - (now - lastWork));
                    return interaction.editReply({ embeds: [errorEmbed('Yorgunsun', `Çok fazla çalıştın. Tekrar çalışmak için **${timeLeft}** dinlenmelisin.`)] });
                }

                const earned = randomInt(ECONOMY.WORK.MIN, ECONOMY.WORK.MAX);
                userData.wallet += earned;
                userData.cooldowns.work = now;
                userData.stats.workUses += 1;
                userData.stats.totalEarned += earned;

                await updateUser(userId, userData);
                return interaction.editReply({ embeds: [successEmbed('İş Başarılı', `Sıkı çalıştın ve **${earned.toLocaleString()}** MC kazandın.`)] });
            }

            // --- GÖNDER ---
            if (subCommand === 'gönder') {
                const targetUser = interaction.options.getUser('kullanıcı');
                const amount = interaction.options.getInteger('miktar');

                if (targetUser.id === userId) return interaction.editReply({ embeds: [errorEmbed('Geçersiz İşlem', 'Kendinize para gönderemezsiniz.')] });
                if (targetUser.bot) return interaction.editReply({ embeds: [errorEmbed('Geçersiz İşlem', 'Botlara para gönderemezsiniz.')] });
                if (amount <= 0) return interaction.editReply({ embeds: [errorEmbed('Geçersiz Miktar', 'Gönderilecek miktar 0 veya negatif olamaz.')] });
                if (userData.wallet < amount) return interaction.editReply({ embeds: [errorEmbed('Yetersiz Bakiye', `Cüzdanında yeterli MetaCoin yok. Mevcut: **${userData.wallet.toLocaleString()}** MC`)] });

                let targetData = await getUser(targetUser.id); // Alıcının verisi (yoksa oluşur)

                // Transfer işlemi
                userData.wallet -= amount;
                targetData.wallet += amount;

                await updateUser(userId, userData);
                await updateUser(targetUser.id, targetData);

                return interaction.editReply({ embeds: [successEmbed('Transfer Başarılı', `**${targetUser.username}** adlı kullanıcıya **${amount.toLocaleString()}** MC gönderdin.`)] });
            }

            // --- BANKAYA YATIR ---
            if (subCommand === 'yatır') {
                const amount = interaction.options.getInteger('miktar');

                if (amount <= 0) return interaction.editReply({ embeds: [errorEmbed('Geçersiz Miktar', 'Yatırılacak miktar 0 veya negatif olamaz.')] });
                if (userData.wallet < amount) return interaction.editReply({ embeds: [errorEmbed('Yetersiz Bakiye', 'Cüzdanında bu kadar para yok.')] });
                
                const availableSpace = userData.bankMax - userData.bank;
                if (availableSpace <= 0) return interaction.editReply({ embeds: [errorEmbed('Banka Dolu', 'Bankan maksimum kapasitesine ulaşmış durumda.')] });
                
                const depositAmount = amount > availableSpace ? availableSpace : amount;

                userData.wallet -= depositAmount;
                userData.bank += depositAmount;

                await updateUser(userId, userData);
                
                let msg = `Bankaya **${depositAmount.toLocaleString()}** MC yatırdın.`;
                if (amount > availableSpace) msg += `\n*(Bankanda yeterli yer olmadığı için sadece sığan kısım yatırıldı.)*`;
                
                return interaction.editReply({ embeds: [successEmbed('İşlem Başarılı', msg)] });
            }

            // --- YARDIM ---
            if (subCommand === 'yardım') {
                const helpEmbed = new EmbedBuilder()
                    .setColor(COLORS.INFO)
                    .setTitle('📚 MetaCoin Ekonomi Sistemi | Yardım Menüsü')
                    .setDescription('Komutları kullanırken her zaman `/mc <komut>` formatını kullanmalısın.')
                    .addFields(
                        { name: '💼 Temel Komutlar', value: '`/mc bakiye` - Bakiyeni gösterir.\n`/mc profil` - Detaylı istatistiklerini gösterir.\n`/mc yardım` - Bu menüyü açar.', inline: false },
                        { name: '💸 Gelir Yöntemleri', value: '`/mc günlük` - Günlük ödül alırsın.\n`/mc çalış` - Saatlik çalışarak para kazanırsın.', inline: false },
                        { name: '🏦 Banka & Transfer', value: '`/mc yatır <miktar>` - Bankaya para yatırısın.\n`/mc gönder <kişi> <miktar>` - Başkasına para yollarsın.', inline: false }
                    )
                    .setFooter({ text: 'Daha fazlası yakında eklenecektir.' });

                return interaction.editReply({ embeds: [helpEmbed] });
            }

        } catch (error) {
            console.error('Komut işlenirken hata oluştu:', error);
            // Çökmeyi engellemek ve kullanıcıyı bilgilendirmek için
            return interaction.editReply({ embeds: [errorEmbed('Sistem Hatası', 'İşleminiz gerçekleştirilirken beklenmeyen bir hata oluştu. Lütfen daha sonra tekrar deneyin.')] });
        }
    }
};