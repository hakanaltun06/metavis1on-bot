const { withTx } = require('../../database/tx');
const { ensureUser } = require('../../database/users');
const { moveBankToWallet } = require('../../database/money');
const { createEmbed } = require('../../utils/embeds');
const { fmtMoney } = require('../../utils/format');

module.exports = {
    data: {
        name: 'cek',
        description: 'Bankadaki parayı cüzdanına çeker.',
        options: [{ name: 'miktar', description: 'Çekilecek miktar. Hepsi için "hepsi" yazabilirsin.', type: 3, required: true }]
    },
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

                await moveBankToWallet(interaction.user.id, amount, db);
                return { kind: 'ok', amount };
            });

            if (result.kind === 'invalid') return interaction.reply({ embeds: [createEmbed('error', '❌ Geçersiz Miktar', 'Geçerli bir sayı yaz.')], ephemeral: true });
            if (result.kind === 'no_bank') return interaction.reply({ embeds: [createEmbed('error', '❌ Yetersiz Bakiye', 'Bankanda bu kadar para yok.')], ephemeral: true });
            return interaction.reply({ embeds: [createEmbed('success', '🏦 Para Çekildi', `${fmtMoney(result.amount)} cüzdanına geçti.`)] });
        } catch (err) {
            console.error('Çek hatası:', err && err.message ? err.message : err);
            return interaction.reply({ embeds: [createEmbed('error', '⚠️ Bir Aksilik Oldu', 'İşlem sırasında bir sorun çıktı. Biraz sonra tekrar dener misin?')], ephemeral: true });
        }
    }
};
