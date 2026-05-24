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

                await removeFromWalletPlain(interaction.user.id, amount, db);
                await addToWalletPlain(target.id, amount, db);
                await logTransaction(interaction.user.id, target.id, 'transfer', amount, 'Kullanıcıdan kullanıcıya transfer', db);
                return { kind: 'ok' };
            });

            if (result.kind === 'no_money') return interaction.reply({ embeds: [createEmbed('error', '❌ Yetersiz Bakiye', 'Cüzdanında yeterli paran yok.')], ephemeral: true });
            return interaction.reply({ embeds: [createEmbed('success', '💸 Para Gönderildi', `**${target.username}** kişisine ${fmtMoney(amount)} gönderdin.`)] });
        } catch (err) {
            console.error('Gönder hatası:', err && err.message ? err.message : err);
            return interaction.reply({ embeds: [createEmbed('error', '⚠️ Bir Aksilik Oldu', 'İşlem sırasında bir sorun çıktı. Biraz sonra tekrar dener misin?')], ephemeral: true });
        }
    }
};
