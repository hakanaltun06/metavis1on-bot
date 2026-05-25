const { MessageFlags } = require('discord.js');
const { withTx } = require('../../database/tx');
const { ensureUser } = require('../../database/users');
const { checkItem, consumeItem } = require('../../database/inventory');
const { createEmbed } = require('../../utils/embeds');
const { fmtMoney } = require('../../utils/format');
const { getMins } = require('../../utils/time');
const { COOLDOWNS } = require('../../utils/constants');
const {
    ROB_SELF_MIN_WALLET,
    ROB_TARGET_MIN_WALLET,
    rollRob,
    computeRobPenalty
} = require('../../services/riskService');

module.exports = {
    data: {
        name: 'soy',
        description: 'Başka bir kullanıcının cüzdanını soymayı denersin.',
        options: [{ name: 'hedef', description: 'Kimi soymak istiyorsun?', type: 6, required: true }]
    },
    async execute(interaction) {
        const target = interaction.options.getUser('hedef');
        if (target.id === interaction.user.id) return interaction.reply({ embeds: [createEmbed('warn', '❌ Olmaz', 'Kendini soyamazsın.')], flags: MessageFlags.Ephemeral });
        if (target.bot) return interaction.reply({ embeds: [createEmbed('warn', '❌ Olmaz', 'Botların üzerinde nakit taşımaz.')], flags: MessageFlags.Ephemeral });

        try {
            const result = await withTx(async (db) => {
                const userData = await ensureUser(interaction.user.id, db);
                const targetData = await ensureUser(target.id, db);

                const now = new Date();
                const lastDate = userData.last_rob ? new Date(userData.last_rob) : new Date(0);
                if (now - lastDate < COOLDOWNS.ROB) {
                    return { kind: 'cooldown', leftMs: COOLDOWNS.ROB - (now - lastDate) };
                }
                if (Number(userData.wallet) < ROB_SELF_MIN_WALLET) return { kind: 'self_poor' };
                if (Number(targetData.wallet) < ROB_TARGET_MIN_WALLET) return { kind: 'target_poor' };

                const hasShield = await checkItem(target.id, 'rob_shield', db);
                if (hasShield > 0) {
                    await consumeItem(target.id, 'rob_shield', 1, db);
                    await db.query('UPDATE economy_users SET last_rob = CURRENT_TIMESTAMP WHERE user_id = $1', [interaction.user.id]);
                    return { kind: 'shielded' };
                }

                await db.query('UPDATE economy_users SET last_rob = CURRENT_TIMESTAMP WHERE user_id = $1', [interaction.user.id]);

                const outcome = rollRob(Number(targetData.wallet));
                if (outcome.win) {
                    await db.query('UPDATE economy_users SET wallet = wallet - $1, total_lost = total_lost + $1 WHERE user_id = $2', [outcome.stolen, target.id]);
                    await db.query('UPDATE economy_users SET wallet = wallet + $1, total_earned = total_earned + $1, rob_success = rob_success + 1 WHERE user_id = $2', [outcome.stolen, interaction.user.id]);
                    return { kind: 'success', stolen: outcome.stolen };
                }

                const penalty = computeRobPenalty(Number(userData.wallet));
                await db.query('UPDATE economy_users SET wallet = wallet - $1, total_lost = total_lost + $1, rob_fail = rob_fail + 1 WHERE user_id = $2', [penalty, interaction.user.id]);
                return { kind: 'caught', penalty };
            });

            if (result.kind === 'cooldown') {
                return interaction.reply({ embeds: [createEmbed('warn', '⏳ Bekleme Süresi', `Yeni bir plan kurmak için **${getMins(result.leftMs)} dk** beklemen gerek.`)], flags: MessageFlags.Ephemeral });
            }
            if (result.kind === 'self_poor') {
                return interaction.reply({ embeds: [createEmbed('error', '❌ Cebin Boş', `Soygun planı için cüzdanında en az ${fmtMoney(ROB_SELF_MIN_WALLET)} olmalı.`)], flags: MessageFlags.Ephemeral });
            }
            if (result.kind === 'target_poor') {
                return interaction.reply({ embeds: [createEmbed('error', '❌ Değmez', 'Hedefin cüzdanı çok zayıf. Buna değmez.')], flags: MessageFlags.Ephemeral });
            }
            if (result.kind === 'shielded') {
                return interaction.reply({ embeds: [createEmbed('info', '🛡️ Engellendi', `${target.username} kişisinde **Soygun Kalkanı** vardı. Kalkan kırıldı ama hedef güvende.`)] });
            }
            if (result.kind === 'success') {
                return interaction.reply({ embeds: [createEmbed('success', '🥷 Soygun Başarılı', `${target.username} uyurken cüzdanına girdin.\nÇaldığın: ${fmtMoney(result.stolen)}`)] });
            }
            return interaction.reply({ embeds: [createEmbed('error', '🚔 Yakalandın', `Hedef uyandı. Kaçarken ${fmtMoney(result.penalty)} düşürdün.`)] });
        } catch (err) {
            console.error('Soy hatası:', err && err.message ? err.message : err);
            return interaction.reply({ embeds: [createEmbed('error', '⚠️ Bir Aksilik Oldu', 'İşlem sırasında bir sorun çıktı. Biraz sonra tekrar dener misin?')], flags: MessageFlags.Ephemeral });
        }
    }
};
