const { MessageFlags } = require('discord.js');
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

                const afterMax = isMaxLevel(nextDef.level);
                const nextUpgradeDef = afterMax ? null : getNextLevelDef(nextDef.level);
                return {
                    kind: 'ok',
                    oldLevel: level,
                    newLevel: nextDef.level,
                    oldLimit,
                    newLimit: nextDef.limit,
                    cost,
                    newWallet: wallet - cost,
                    nextUpgradeCost: nextUpgradeDef ? nextUpgradeDef.upgradeCost : null
                };
            });

            if (result.kind === 'max') {
                return interaction.reply({ embeds: [createEmbed('info', '🏦 Banka Hesabı', 'Banka hesabın zaten en yüksek seviyede.')], flags: MessageFlags.Ephemeral });
            }
            if (result.kind === 'poor') {
                return interaction.reply({ embeds: [createEmbed('error', '❌ Yetersiz Bakiye', `Bu yükseltme için cüzdanında ${fmtMoney(result.cost)} olmalı.`)], flags: MessageFlags.Ephemeral });
            }
            const embed = createEmbed('bank', '🏦 Banka Yükseltildi', 'Banka kapasiten başarıyla artırıldı.')
                .addFields(
                    { name: 'Seviye', value: `**${result.oldLevel}** → **${result.newLevel}**`, inline: true },
                    { name: 'Eski Kapasite', value: fmtMoney(result.oldLimit), inline: true },
                    { name: 'Yeni Kapasite', value: fmtMoney(result.newLimit), inline: true },
                    { name: 'Ödenen', value: fmtMoney(result.cost), inline: true },
                    { name: 'Yeni Cüzdan', value: fmtMoney(result.newWallet), inline: true },
                    { name: 'Sonraki Yükseltme', value: result.nextUpgradeCost ? fmtMoney(result.nextUpgradeCost) : 'Maksimum seviyedesin', inline: true }
                )
                .setFooter({ text: 'Daha yüksek kapasite, faiz kazancını daha rahat büyütür.' });
            return interaction.reply({ embeds: [embed] });
        } catch (err) {
            console.error('Banka yükseltme hatası:', err && err.message ? err.message : err);
            return interaction.reply({ embeds: [createEmbed('error', '⚠️ Bir Aksilik Oldu', 'Yükseltme sırasında bir sorun çıktı. Biraz sonra tekrar dener misin?')], flags: MessageFlags.Ephemeral });
        }
    }
};
