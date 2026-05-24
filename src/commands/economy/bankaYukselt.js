const { withTx } = require('../../database/tx');
const { ensureUser } = require('../../database/users');
const { upgradeBankLevel } = require('../../database/bank');
const { logTransaction } = require('../../database/transactions');
const { createEmbed } = require('../../utils/embeds');
const { fmtMoney } = require('../../utils/format');
const { BANK_LEVELS } = require('../../utils/constants');
const { isMaxLevel, getNextLevelDef } = require('../../services/bankService');

module.exports = {
    data: { name: 'banka-yukselt', description: 'Banka hesap seviyeni yükseltir ve kapasiteni artırır.' },
    async execute(interaction) {
        try {
            const result = await withTx(async (db) => {
                const u = await ensureUser(interaction.user.id, db);
                const level = u.bank_level || 1;

                if (isMaxLevel(level)) return { kind: 'max' };

                const nextDef = getNextLevelDef(level);
                const cost = nextDef.upgradeCost;
                const wallet = Number(u.wallet);
                const oldLimit = Number(u.bank_limit) || BANK_LEVELS[0].limit;

                if (wallet < cost) return { kind: 'poor', cost };

                await upgradeBankLevel(interaction.user.id, cost, nextDef.level, nextDef.limit, db);
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
            console.error('Banka yükseltme hatası:', err && err.message ? err.message : err);
            return interaction.reply({ embeds: [createEmbed('error', '⚠️ Bir Aksilik Oldu', 'Yükseltme sırasında bir sorun çıktı. Biraz sonra tekrar dener misin?')], ephemeral: true });
        }
    }
};
