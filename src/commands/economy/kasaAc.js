const { MessageFlags } = require('discord.js');
const { withTx } = require('../../database/tx');
const { ensureUser } = require('../../database/users');
const { checkItem, addItem, safeConsumeItem, getInventory } = require('../../database/inventory');
const { logTransaction } = require('../../database/transactions');
const { createEmbed } = require('../../utils/embeds');
const { fmtMoney, formatFull } = require('../../utils/format');
const { CURRENCY, CURRENCY_NAME } = require('../../utils/constants');
const {
    getCrateByCode,
    isCrateItem,
    rollCrate,
    getRarityLabel,
    getRarityEmoji
} = require('../../services/crateService');
const { grantCappedPoints } = require('../../services/seasonService');

const CRATE_SEASON_POINTS = {
    basit_kasa: 5,
    nadir_kasa: 15,
    epik_kasa: 35,
    efsanevi_kasa: 90
};

module.exports = {
    data: {
        name: 'kasa-ac',
        description: 'Envanterindeki bir kasayı açarsın.',
        options: [
            {
                name: 'kasa',
                description: 'Açmak istediğin kasayı seç.',
                type: 3,
                required: true,
                autocomplete: true
            },
            {
                name: 'adet',
                description: 'Kaç kasa açmak istiyorsun? (1–5)',
                type: 4,
                required: false,
                min_value: 1,
                max_value: 5
            }
        ]
    },
    async autocomplete(interaction) {
        try {
            const focused = interaction.options.getFocused().toLowerCase();
            const inventory = await getInventory(interaction.user.id);
            const results = inventory
                .filter(row => row.quantity > 0 && isCrateItem(row.item_id))
                .map(row => {
                    const crate = getCrateByCode(row.item_id);
                    if (!crate) return null;
                    return { name: `${crate.name} ×${row.quantity}`, value: crate.code };
                })
                .filter(Boolean)
                .filter(opt => opt.name.toLowerCase().includes(focused));
            await interaction.respond(results.slice(0, 25));
        } catch {
            await interaction.respond([]);
        }
    },
    async execute(interaction) {
        const crateCode = interaction.options.getString('kasa');
        const qty = interaction.options.getInteger('adet') || 1;

        const crate = getCrateByCode(crateCode);
        if (!crate) {
            return interaction.reply({
                embeds: [createEmbed('error', '❌ Geçersiz Kasa', 'Bu kasa türü bulunamadı.')],
                flags: MessageFlags.Ephemeral
            });
        }

        if (qty < 1 || qty > 5) {
            return interaction.reply({
                embeds: [createEmbed('warn', '❌ Geçersiz Adet', 'Tek seferde 1 ile 5 arasında kasa açabilirsin.')],
                flags: MessageFlags.Ephemeral
            });
        }

        try {
            const result = await withTx(async (db) => {
                await ensureUser(interaction.user.id, db);

                const owned = await checkItem(interaction.user.id, crateCode, db);
                if (owned < qty) {
                    return { kind: 'no_crate', owned };
                }

                const consumed = await safeConsumeItem(interaction.user.id, crateCode, qty, db);
                if (!consumed) {
                    return { kind: 'no_crate', owned: 0 };
                }

                const rewards = [];
                let totalCoinReward = 0;

                for (let i = 0; i < qty; i++) {
                    const reward = rollCrate(crateCode);
                    if (!reward) continue;

                    if (reward.type === 'coin') {
                        totalCoinReward += reward.amount;
                        rewards.push(reward);
                    } else if (reward.type === 'item' && reward.item) {
                        await addItem(interaction.user.id, reward.item.code, 1, db);
                        rewards.push(reward);
                    }

                    await db.query(
                        `INSERT INTO economy_crate_logs (user_id, crate_code, reward_type, reward_code, reward_amount)
                         VALUES ($1, $2, $3, $4, $5)`,
                        [
                            interaction.user.id,
                            crateCode,
                            reward.type,
                            reward.item ? reward.item.code : null,
                            reward.type === 'coin' ? reward.amount : 0
                        ]
                    );
                }

                if (totalCoinReward > 0) {
                    await db.query(
                        'UPDATE economy_users SET wallet = wallet + $1, total_earned = total_earned + $1 WHERE user_id = $2',
                        [totalCoinReward, interaction.user.id]
                    );
                    await logTransaction(interaction.user.id, null, 'crate_coin', totalCoinReward, `${crate.name} acilisindan MetaCoin odulu`, db);
                }

                const itemRewards = rewards.filter(r => r.type === 'item');
                for (const r of itemRewards) {
                    await logTransaction(interaction.user.id, null, 'crate_item', 0, `${crate.name} acilisindan ${r.item.name} kazanildi`, db);
                }

                return { kind: 'ok', rewards, totalCoinReward, remaining: owned - qty };
            });

            if (result.kind === 'no_crate') {
                const msg = result.owned > 0
                    ? `Envanterinde sadece **${result.owned}** adet ${crate.name} var.`
                    : `Envanterinde ${crate.name} yok. Marketten satın alabilirsin.`;
                return interaction.reply({
                    embeds: [createEmbed('warn', '📦 Yetersiz Kasa', msg)],
                    flags: MessageFlags.Ephemeral
                });
            }

            const perCratePoints = CRATE_SEASON_POINTS[crateCode] || 0;
            let seasonGrant = null;
            if (perCratePoints > 0) {
                try {
                    seasonGrant = await grantCappedPoints(interaction.user.id, 'crate', perCratePoints * qty, 200);
                } catch (err) {
                    console.error('Sezon puanı eklenemedi (kasa-ac):', err?.message);
                }
            }

            const rewardLines = result.rewards.map((r, i) => {
                if (r.type === 'coin') {
                    return `**${i + 1}.** ${formatFull(r.amount)} ${CURRENCY_NAME} ${CURRENCY}`;
                }
                const emoji = getRarityEmoji(r.rarity);
                const label = getRarityLabel(r.rarity);
                return `**${i + 1}.** ${emoji} ${r.item.name} — *${label}*`;
            });

            const hasLegendary = result.rewards.some(r => r.type === 'item' && r.rarity === 'efsanevi');
            const embedType = hasLegendary ? 'premium' : 'crate';
            const title = hasLegendary ? '🏆 Büyük Ödül!' : '📦 Kasa Açıldı';

            const desc = qty === 1
                ? `**1** adet ${crate.name} açtın.`
                : `**${qty}** adet ${crate.name} açtın.`;

            const embed = createEmbed(embedType, title, desc);
            embed.addFields({ name: 'Ödüller', value: rewardLines.join('\n'), inline: false });

            if (result.totalCoinReward > 0) {
                embed.addFields({ name: 'Toplam MetaCoin', value: fmtMoney(result.totalCoinReward), inline: true });
            }
            embed.addFields({ name: 'Kalan Kasa', value: `**${result.remaining}** adet`, inline: true });
            if (seasonGrant && seasonGrant.granted > 0) {
                embed.addFields({ name: '🏆 Sezon Puanı', value: `+${seasonGrant.granted} puan`, inline: true });
            }
            embed.setFooter({ text: 'Eşyalarını /envanter ile gör · Satılabilir eşyalar için /sat' });
            return interaction.reply({ embeds: [embed] });

        } catch (err) {
            console.error('Kasa acma hatasi:', err && err.message ? err.message : err);
            return interaction.reply({
                embeds: [createEmbed('error', '⚠️ Bir Aksilik Oldu', 'Kasa açılırken bir sorun çıktı. Biraz sonra tekrar dener misin?')],
                flags: MessageFlags.Ephemeral
            });
        }
    }
};
