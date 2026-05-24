const { MessageFlags } = require('discord.js');
const { withTx } = require('../../database/tx');
const { ensureUser } = require('../../database/users');
const { applyInterest } = require('../../database/bank');
const { logTransaction } = require('../../database/transactions');
const { createEmbed } = require('../../utils/embeds');
const { fmtMoney } = require('../../utils/format');
const { BANK_LEVELS } = require('../../utils/constants');
const {
    INTEREST_RATE,
    INTEREST_INTERVAL_MS,
    estimateInterest
} = require('../../services/bankService');

module.exports = {
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

                const interest = estimateInterest(bank);
                if (interest <= 0) return { kind: 'too_small' };

                const room = Math.max(0, limit - bank);
                if (room <= 0) return { kind: 'full' };

                const credited = Math.min(interest, room);
                const wasCapped = credited < interest;

                await applyInterest(interaction.user.id, credited, db);
                await logTransaction(interaction.user.id, null, 'interest', credited, 'Faiz kazancı', db);

                return { kind: 'ok', credited, wasCapped };
            });

            if (result.kind === 'no_balance') {
                return interaction.reply({ embeds: [createEmbed('warn', '🏦 Faiz', 'Faiz kazanmak için önce bankana para yatırmalısın.')], flags: MessageFlags.Ephemeral });
            }
            if (result.kind === 'wait') {
                const hours = Math.floor(result.leftMs / 3600000);
                const mins = Math.floor((result.leftMs % 3600000) / 60000);
                return interaction.reply({ embeds: [createEmbed('warn', '⏳ Bekleme Süresi', `Yeni faiz almak için **${hours} saat ${mins} dakika** beklemen gerekiyor.`)], flags: MessageFlags.Ephemeral });
            }
            if (result.kind === 'too_small') {
                return interaction.reply({ embeds: [createEmbed('warn', '🏦 Faiz', 'Bankandaki miktar henüz faiz işlemek için çok düşük. Biraz daha para yatırmalısın.')], flags: MessageFlags.Ephemeral });
            }
            if (result.kind === 'full') {
                return interaction.reply({ embeds: [createEmbed('warn', '🏦 Banka Dolu', 'Bankan dolu olduğu için faiz eklenemedi. Kapasiteni artırman gerekiyor.')], flags: MessageFlags.Ephemeral });
            }

            const note = result.wasCapped ? '\nBankan dolduğu için faizin sadece sığan kısmı eklendi.' : '';
            return interaction.reply({ embeds: [createEmbed('success', '🏦 Faiz İşlendi', `Bankana ${fmtMoney(result.credited)} eklendi.${note}`)] });
        } catch (err) {
            console.error('Faiz hatası:', err && err.message ? err.message : err);
            return interaction.reply({ embeds: [createEmbed('error', '⚠️ Bir Aksilik Oldu', 'Faiz işlenirken bir sorun çıktı. Biraz sonra tekrar dener misin?')], flags: MessageFlags.Ephemeral });
        }
    }
};
