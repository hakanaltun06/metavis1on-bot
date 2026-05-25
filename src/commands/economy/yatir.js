const { MessageFlags } = require('discord.js');
const { withTx } = require('../../database/tx');
const { ensureUser } = require('../../database/users');
const { moveWalletToBank } = require('../../database/money');
const { createEmbed } = require('../../utils/embeds');
const { fmtMoney } = require('../../utils/format');
const { BANK_LEVELS } = require('../../utils/constants');

module.exports = {
    data: {
        name: 'yatir',
        description: 'Cüzdanındaki parayı bankaya yatırır.',
        options: [{ name: 'miktar', description: 'Yatırılacak miktar. Hepsi için "hepsi" yazabilirsin.', type: 3, required: true }]
    },
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

                await moveWalletToBank(interaction.user.id, amount, db);
                return { kind: 'ok', amount };
            });

            if (result.kind === 'invalid') return interaction.reply({ embeds: [createEmbed('error', '❌ Geçersiz Miktar', 'Geçerli bir sayı yaz.')], flags: MessageFlags.Ephemeral });
            if (result.kind === 'no_wallet') return interaction.reply({ embeds: [createEmbed('error', '❌ Yetersiz Bakiye', 'Cüzdanında bu kadar para yok.')], flags: MessageFlags.Ephemeral });
            if (result.kind === 'full') return interaction.reply({ embeds: [createEmbed('warn', '🏦 Banka Dolu', 'Bankanda yer kalmamış. Kapasiteni artırman gerekiyor. `/banka-yukselt` ile seviyeni yükseltebilirsin.')], flags: MessageFlags.Ephemeral });
            if (result.kind === 'over') return interaction.reply({ embeds: [createEmbed('warn', '🏦 Yer Yetersiz', `Bankanda sadece ${fmtMoney(result.room)} kadar yer var. Daha fazlasını yatırabilmek için kapasiteni artır.`)], flags: MessageFlags.Ephemeral });
            return interaction.reply({ embeds: [createEmbed('bank', '🏦 Bankaya Yatırıldı', `${fmtMoney(result.amount)} bankaya geçti.`)] });
        } catch (err) {
            console.error('Yatır hatası:', err && err.message ? err.message : err);
            return interaction.reply({ embeds: [createEmbed('error', '⚠️ Bir Aksilik Oldu', 'İşlem sırasında bir sorun çıktı. Biraz sonra tekrar dener misin?')], flags: MessageFlags.Ephemeral });
        }
    }
};
