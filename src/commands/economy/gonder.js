const { MessageFlags } = require('discord.js');
const { withTx } = require('../../database/tx');
const { ensureUser } = require('../../database/users');
const { addToWalletPlain, removeFromWalletPlain } = require('../../database/money');
const { logTransaction } = require('../../database/transactions');
const { createEmbed } = require('../../utils/embeds');
const { fmtMoney } = require('../../utils/format');

module.exports = {
    data: {
        name: 'gonder',
        description: 'Başka bir kullanıcıya MetaCoin gönderir.',
        options: [
            { name: 'kullanici', description: 'MetaCoin göndermek istediğin kullanıcı.', type: 6, required: true },
            { name: 'miktar', description: 'Gönderilecek miktar.', type: 4, required: true }
        ]
    },
    async execute(interaction) {
        const target = interaction.options.getUser('kullanici');
        const amount = interaction.options.getInteger('miktar');

        if (target.id === interaction.user.id) return interaction.reply({ embeds: [createEmbed('warn', '❌ Olmaz', 'Kendine para gönderemezsin.')], flags: MessageFlags.Ephemeral });
        if (target.bot) return interaction.reply({ embeds: [createEmbed('warn', '❌ Olmaz', 'Botlara para gönderemezsin.')], flags: MessageFlags.Ephemeral });
        if (amount <= 0) return interaction.reply({ embeds: [createEmbed('warn', '❌ Geçersiz Miktar', 'Miktar sıfırdan büyük olmalı.')], flags: MessageFlags.Ephemeral });

        try {
            const result = await withTx(async (db) => {
                const sender = await ensureUser(interaction.user.id, db);
                await ensureUser(target.id, db);
                if (Number(sender.wallet) < amount) return { kind: 'no_money' };

                await removeFromWalletPlain(interaction.user.id, amount, db);
                await addToWalletPlain(target.id, amount, db);
                await logTransaction(interaction.user.id, target.id, 'transfer', amount, 'Kullanıcıdan kullanıcıya transfer', db);
                return { kind: 'ok', newWallet: Number(sender.wallet) - amount };
            });

            if (result.kind === 'no_money') return interaction.reply({ embeds: [createEmbed('error', '❌ Yetersiz Bakiye', 'Cüzdanında yeterli paran yok.')], flags: MessageFlags.Ephemeral });

            const embed = createEmbed('success', '💸 Transfer Tamamlandı', 'MetaCoin gönderildi.')
                .addFields(
                    { name: 'Alıcı', value: target.username, inline: true },
                    { name: 'Gönderilen', value: fmtMoney(amount), inline: true },
                    { name: 'Yeni Cüzdanın', value: fmtMoney(result.newWallet), inline: true }
                )
                .setFooter({ text: 'Bakiye durumunu görmek için /bakiye kullan.' });
            return interaction.reply({ embeds: [embed] });
        } catch (err) {
            console.error('Gönder hatası:', err && err.message ? err.message : err);
            return interaction.reply({ embeds: [createEmbed('error', '⚠️ Bir Aksilik Oldu', 'İşlem sırasında bir sorun çıktı. Biraz sonra tekrar dener misin?')], flags: MessageFlags.Ephemeral });
        }
    }
};
