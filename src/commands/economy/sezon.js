const {
    MessageFlags,
    ButtonBuilder,
    ButtonStyle,
    ActionRowBuilder
} = require('discord.js');
const { createEmbed } = require('../../utils/embeds');
const { formatNumber } = require('../../utils/format');
const {
    getCurrentSeason,
    getUserSeasonData,
    getUserSeasonRank,
    getSeasonLevelInfo,
    getClaimedLevels,
    claimLevelReward,
    getSeasonLeaderboard,
    getSeasonHistory
} = require('../../services/seasonService');
const {
    SEASON_REWARD_PATH,
    formatSeasonReward
} = require('../../config/seasonRewards');
const {
    getUserSeasonTasks,
    claimSeasonTaskReward
} = require('../../services/progressionService');

const COLLECTOR_TIMEOUT = 4 * 60 * 1000;
const MEDALS = ['🥇', '🥈', '🥉'];
const TAB_IDS = ['home', 'rewards', 'tasks', 'lb', 'hist'];

// ==================[ REASON MESAJLARI ]==================

const LEVEL_CLAIM_REASONS = {
    no_active_season:  'Şu anda aktif sezon bulunmuyor.',
    season_not_active: 'Bu ödül yalnızca aktif sezon için alınabilir.',
    invalid_level:     'Geçersiz sezon seviyesi.',
    invalid_params:    'Geçersiz parametreler.',
    level_locked:      'Bu ödülü almak için önce ilgili sezon seviyesine ulaşmalısın.',
    already_claimed:   'Bu sezon ödülünü zaten almışsın.',
    reward_not_found:  'Bu seviye için tanımlı bir ödül bulunamadı.',
    invalid_reward:    'Ödül tanımı geçersiz görünüyor.',
    user_not_found:    'Sezon kaydın henüz oluşmamış. Puan kazanarak sezon sistemine katılabilirsin.',
    error:             'Ödül alınırken beklenmeyen bir sorun oluştu. Biraz sonra tekrar dene.'
};

const TASK_CLAIM_REASONS = {
    no_active_season:       'Şu anda aktif sezon bulunmuyor.',
    tasks_disabled:         'Görev sistemi kısa süreliğine kapalı.',
    season_points_disabled: 'Sezon puanı kazanımı kısa süreliğine kapalı.',
    task_not_found:         'Bu sezon görevi bulunamadı.',
    invalid_period:         'Bu görev dönemi artık geçerli değil. Menüyü yenileyip tekrar dene.',
    not_completed:          'Bu görevi almak için önce hedefi tamamlamalısın.',
    already_claimed:        'Bu sezon görevi ödülünü zaten almışsın.',
    error:                  'Görev ödülü alınırken beklenmeyen bir sorun oluştu. Biraz sonra tekrar dene.'
};

const getLevelClaimMsg = r => LEVEL_CLAIM_REASONS[r] || LEVEL_CLAIM_REASONS.error;
const getTaskClaimMsg  = r => TASK_CLAIM_REASONS[r]  || TASK_CLAIM_REASONS.error;

// ==================[ TARİH HELPERLARI ]==================

function formatSeasonDate(date) {
    return new Date(date).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' });
}

function getRemainingText(endsAt) {
    const days = Math.ceil((new Date(endsAt) - Date.now()) / 86400000);
    if (days < 0)  return 'Süresi dolmuş';
    if (days === 0) return 'Bugün bitiyor';
    if (days === 1) return '1 gün';
    return `${days} gün`;
}

// ==================[ XP BAR ]==================

function buildXPBar(ratio, blocks = 10) {
    const filled = Math.round(Math.min(1, Math.max(0, ratio)) * blocks);
    return '█'.repeat(filled) + '░'.repeat(blocks - filled);
}

// ==================[ ÖDÜL YOLU HELPERLARI ]==================

function findNextClaimableLevel(currentLevel, claimedSet) {
    for (const entry of SEASON_REWARD_PATH) {
        if (currentLevel >= entry.level && !claimedSet.has(entry.level)) return entry.level;
    }
    return null;
}

function getRewardWindowEntries(currentLevel, claimedSet) {
    const firstReady = SEASON_REWARD_PATH.find(e => currentLevel >= e.level && !claimedSet.has(e.level));
    let startIdx;
    if (firstReady) {
        startIdx = Math.max(0, SEASON_REWARD_PATH.indexOf(firstReady) - 2);
    } else {
        const lvlIdx = SEASON_REWARD_PATH.findIndex(e => e.level > currentLevel);
        const anchor = lvlIdx === -1 ? SEASON_REWARD_PATH.length : lvlIdx;
        startIdx = Math.max(0, anchor - 5);
    }
    return SEASON_REWARD_PATH.slice(startIdx, startIdx + 10);
}

function buildRewardLines(entries, currentLevel, claimedSet) {
    return entries.map(e => {
        const rt = formatSeasonReward(e);
        if (claimedSet.has(e.level))   return `✅ **Sv.${e.level}** — ${rt}`;
        if (currentLevel >= e.level)   return `🎁 **Sv.${e.level}** — ${rt}`;
        return `🔒 **Sv.${e.level}** — ${rt}`;
    }).join('\n');
}

// ==================[ GÖREV HELPERLARI ]==================

function buildTaskLine(t) {
    const pts = t.reward?.amount ?? 0;
    if (t.claimed)   return `✅ ${t.emoji || '⭐'} **${t.title}** — +${pts} puan`;
    if (t.completed) return `🎁 ${t.emoji || '⭐'} **${t.title}** — +${pts} puan`;
    return `⏳ ${t.emoji || '⭐'} **${t.title}** ${t.progress}/${t.target} — +${pts} puan`;
}

function buildTasksText(tasks) {
    if (!tasks || tasks.length === 0) return 'Bu kategoride görev yok.';
    const sorted = [...tasks].sort((a, b) => {
        const aReady = a.completed && !a.claimed;
        const bReady = b.completed && !b.claimed;
        if (aReady && !bReady) return -1;
        if (bReady && !aReady) return 1;
        if (!a.claimed && !b.claimed) return (b.progress / b.target) - (a.progress / a.target);
        return 0;
    });
    return sorted.map(buildTaskLine).join('\n');
}

// ==================[ EMBED OLUŞTURUCULAR ]==================

function buildHomeEmbed(season, userData, claimedSet, taskData, userRank) {
    const points  = userData ? Number(userData.points)       : 0;
    const level   = userData ? Number(userData.season_level) : 1;
    const lvlInfo = getSeasonLevelInfo(points);

    let xpText;
    if (lvlInfo.isMaxLevel) {
        xpText = `Seviye **30** — Maksimum seviye 🎖️\n[${buildXPBar(1)}]`;
    } else {
        xpText = `Seviye **${lvlInfo.currentLevel}** → **${lvlInfo.nextLevel}**\n[${buildXPBar(lvlInfo.progressRatio)}] ${formatNumber(points)} / ${formatNumber(lvlInfo.nextThreshold)}\nKalan: **${formatNumber(lvlInfo.pointsNeeded)}** puan`;
    }

    const readyCount     = SEASON_REWARD_PATH.filter(e => level >= e.level && !claimedSet.has(e.level)).length;
    const nextReadyLvl   = findNextClaimableLevel(level, claimedSet);
    const nextReadyEntry = nextReadyLvl ? SEASON_REWARD_PATH.find(e => e.level === nextReadyLvl) : null;
    let rewardLine = `Alınan: **${claimedSet.size}**/30`;
    if (readyCount > 0) {
        rewardLine += ` · Hazır: **${readyCount}**`;
        if (nextReadyEntry) rewardLine += `\nSıradaki: Sv.${nextReadyLvl} — ${formatSeasonReward(nextReadyEntry)}`;
    }

    const tasks      = taskData?.tasks || [];
    const readyTasks = tasks.filter(t => t.completed && !t.claimed);
    const activeTasks = tasks
        .filter(t => !t.completed && !t.claimed && t.progress > 0)
        .sort((a, b) => (b.progress / b.target) - (a.progress / a.target));

    let taskLine;
    if (readyTasks.length > 0) {
        taskLine = `Hazır: **${readyTasks.length}** görev ödülü alınabilir`;
    } else if (activeTasks.length > 0) {
        const top = activeTasks[0];
        taskLine = `Devam: ${top.emoji || '⭐'} **${top.title}** ${top.progress}/${top.target}`;
    } else {
        taskLine = 'Aktif sezon görevi yok';
    }

    const rankText = userRank != null ? `**#${userRank}**` : 'Henüz sıralamada yok';

    const embed = createEmbed('premium', `🏆 ${season.name}`,
        `📅 ${formatSeasonDate(season.ends_at)} · Kalan: **${getRemainingText(season.ends_at)}**`
    );
    embed.addFields(
        { name: '🎯 Puan',            value: `**${formatNumber(points)}**`, inline: true },
        { name: '⭐ Seviye',          value: `**${level}**`,                inline: true },
        { name: '🏅 Sıralama',        value: rankText,                     inline: true },
        { name: '📈 İlerleme',        value: xpText,                       inline: false },
        { name: '🎁 Ödül Yolu',       value: rewardLine,                   inline: false },
        { name: '⭐ Sezon Görevleri', value: taskLine,                     inline: false }
    );
    embed.setFooter({ text: 'Sekmeleri kullanarak detayları görüntüleyebilirsin.' });
    return embed;
}

function buildRewardsEmbed(season, userData, claimedSet) {
    if (!season) {
        return createEmbed('info', '🎖️ Sezon Ödül Yolu',
            'Şu anda aktif sezon bulunmuyor.\n\nYeni sezon başladığında ödül yolu burada görünecek.');
    }
    const currentLevel = userData ? Number(userData.season_level) || 1 : 0;
    const points       = userData ? Number(userData.points) || 0 : 0;
    const readyCount   = SEASON_REWARD_PATH.filter(e => currentLevel >= e.level && !claimedSet.has(e.level)).length;

    const entries     = getRewardWindowEntries(currentLevel, claimedSet);
    const rewardLines = buildRewardLines(entries, currentLevel, claimedSet);
    const from = entries[0].level;
    const to   = entries[entries.length - 1].level;

    const desc = [
        `**${season.name}** aktif`,
        `📊 **${formatNumber(points)}** puan · Seviye **${currentLevel}**`,
        `✅ **${claimedSet.size}**/30 alındı${readyCount > 0 ? ` · 🎁 **${readyCount}** hazır` : ''}`
    ].join('\n');

    const embed = createEmbed('reward', '🎖️ Sezon Ödül Yolu', desc);
    embed.addFields({ name: `Seviye ${from}–${to}`, value: rewardLines });
    embed.setFooter({ text: 'Tüm 30 seviye için /sezon-oduller komutunu kullanabilirsin.' });
    return embed;
}

function buildTasksEmbed(season, taskData) {
    if (!season) {
        return createEmbed('info', '⭐ Sezon Görevleri', 'Şu anda aktif sezon bulunmuyor.');
    }
    const tasks = taskData?.tasks || [];
    if (tasks.length === 0) {
        return createEmbed('info', `⭐ Sezon Görevleri — ${season.name}`, 'Sezon görevleri yüklenemedi.');
    }

    const daily      = tasks.filter(t => t.periodType === 'season_daily');
    const weekly     = tasks.filter(t => t.periodType === 'season_weekly');
    const once       = tasks.filter(t => t.periodType === 'season_once');
    const readyCount = tasks.filter(t => t.completed && !t.claimed).length;

    const desc = readyCount > 0
        ? `🎁 **${readyCount}** görev ödülü alınabilir`
        : 'Sezon görevlerin ve ilerlemen aşağıda.';

    const embed = createEmbed('info', `⭐ Sezon Görevleri — ${season.name}`, desc);
    if (daily.length > 0)  embed.addFields({ name: '📅 Günlük',   value: buildTasksText(daily.slice(0, 5)),  inline: false });
    if (weekly.length > 0) embed.addFields({ name: '📆 Haftalık', value: buildTasksText(weekly.slice(0, 5)), inline: false });
    if (once.length > 0)   embed.addFields({ name: '🌟 Sezonluk', value: buildTasksText(once.slice(0, 6)),   inline: false });
    embed.setFooter({ text: 'Görev detayları ve normal görevler için /gorevler komutunu kullanabilirsin.' });
    return embed;
}

function buildLeaderboardEmbed(season, leaderboard, userRank) {
    if (!season) {
        return createEmbed('info', '🏆 Sezon Sıralaması', 'Şu anda aktif sezon bulunmuyor.');
    }
    if (!leaderboard || leaderboard.length === 0) {
        return createEmbed('info', `🏆 Sıralama — ${season.name}`,
            'Bu sezonda henüz puan kazanan kullanıcı yok.\n\nPuan kazandıkça sıralama burada görünecek.');
    }
    const lines = leaderboard.map((row, i) => {
        const prefix = i < 3 ? MEDALS[i] : `**#${i + 1}**`;
        return `${prefix} <@${row.user_id}> — **${formatNumber(Number(row.points))}** puan · Sv.**${row.season_level}**`;
    });
    const rankText = userRank != null ? `Senin sıran: **#${userRank}**` : 'Henüz sıralamada değilsin.';
    const embed = createEmbed('premium', `🏆 Sıralama — ${season.name}`, lines.join('\n'));
    embed.addFields({ name: '📌 Senin Konumun', value: rankText, inline: false });
    embed.setFooter({ text: 'Sıralama toplam sezon puanına göre hesaplanır.' });
    return embed;
}

function buildHistoryEmbed(history) {
    if (!history || history.length === 0) {
        return createEmbed('info', '🏛️ Sezon Geçmişi',
            'Henüz tamamlanmış bir sezon bulunmuyor.\n\nİlk sezon tamamlandığında burada görünecek.');
    }
    const lines = history.map((entry, i) => {
        const { season, userCount, topUser, rewardsDistributed } = entry;
        const leader = topUser
            ? `<@${topUser.user_id}> · **${formatNumber(Number(topUser.points))}** puan`
            : 'Kayıt yok';
        return [
            `**${i + 1}. ${season.name}**`,
            `📅 ${formatSeasonDate(season.started_at)} – ${formatSeasonDate(season.ends_at)}`,
            `👥 ${userCount} katılımcı · 🥇 ${leader}`,
            `🎖️ Ödül: ${rewardsDistributed ? '✅ Dağıtıldı' : '⏳ Bekliyor'}`
        ].join('\n');
    });
    return createEmbed('premium', '🏛️ Sezon Geçmişi', lines.join('\n\n'))
        .setFooter({ text: `Son ${history.length} tamamlanmış sezon gösteriliyor.` });
}

// ==================[ BUTON SATIRI OLUŞTURUCULAR ]==================

const TAB_CONFIG = [
    { id: 'home',    label: 'Genel',    emoji: '🏠' },
    { id: 'rewards', label: 'Ödüller',  emoji: '🎁' },
    { id: 'tasks',   label: 'Görevler', emoji: '⭐' },
    { id: 'lb',      label: 'Sıralama', emoji: '🏆' },
    { id: 'hist',    label: 'Geçmiş',   emoji: '📜' }
];

function buildTabRow(activeTab, interactionId) {
    return new ActionRowBuilder().addComponents(
        TAB_CONFIG.map(tab =>
            new ButtonBuilder()
                .setCustomId(`sc:${tab.id}:${interactionId}`)
                .setLabel(tab.label)
                .setEmoji(tab.emoji)
                .setStyle(tab.id === activeTab ? ButtonStyle.Primary : ButtonStyle.Secondary)
        )
    );
}

function buildClaimRow(interactionId, customAction, label, emoji, hasClaimable) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`sc:${customAction}:${interactionId}`)
            .setLabel(label)
            .setEmoji(emoji)
            .setStyle(ButtonStyle.Success)
            .setDisabled(!hasClaimable)
    );
}

function buildDisabledTabRow(interactionId) {
    return new ActionRowBuilder().addComponents(
        TAB_CONFIG.map(tab =>
            new ButtonBuilder()
                .setCustomId(`sc:${tab.id}:${interactionId}`)
                .setLabel(tab.label)
                .setEmoji(tab.emoji)
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(true)
        )
    );
}

// ==================[ KOMUT ]==================

module.exports = {
    data: {
        name: 'sezon',
        description: 'Aktif sezon durumunu ve sezon ilerlemeni gösterir.'
    },

    async execute(interaction) {
        const userId = interaction.user.id;

        try {
            // Faz 1: Sezon varlığı + geçmiş paralel
            const [season, history] = await Promise.all([
                getCurrentSeason(),
                getSeasonHistory(5)
            ]);

            // Faz 2: Sezona özel veriler (sezon varsa)
            let userData = null, claimedSet = new Set(), taskData = { tasks: [] }, leaderboard = [], userRank = null;

            if (season) {
                const [{ user }, rank, td, lb, claimedArr] = await Promise.all([
                    getUserSeasonData(userId),
                    getUserSeasonRank(userId),
                    getUserSeasonTasks(userId),
                    getSeasonLeaderboard(10),
                    getClaimedLevels(userId, season.id)
                ]);
                userData    = user;
                userRank    = rank;
                taskData    = td;
                leaderboard = lb;
                claimedSet  = new Set(claimedArr);
            }

            const homeEmbed = season
                ? buildHomeEmbed(season, userData, claimedSet, taskData, userRank)
                : createEmbed('info', '🏆 Sezon Sistemi',
                    'Şu anda aktif bir sezon bulunmuyor.\n\nYeni sezon başladığında sezon puanın, seviyen ve sıralaman burada görünecek.');

            const message = await interaction.reply({
                embeds: [homeEmbed],
                components: [buildTabRow('home', interaction.id)],
                fetchReply: true
            });

            // Collector state
            let curSeason   = season;
            let curUserData = userData;
            let curClaimed  = claimedSet;
            let curTaskData = taskData;
            let curLB       = leaderboard;
            let curRank     = userRank;
            let curHistory  = history;

            const collector = message.createMessageComponentCollector({
                time: COLLECTOR_TIMEOUT,
                filter: i => i.customId.startsWith('sc:') && i.customId.endsWith(`:${interaction.id}`)
            });

            collector.on('collect', async (btn) => {
                if (btn.user.id !== userId) {
                    return btn.reply({
                        content: 'Bu sezon menüsü sana ait değil. Kendi sezon bilgilerin için `/sezon` kullan.',
                        flags: MessageFlags.Ephemeral
                    });
                }

                const action = btn.customId.split(':')[1];

                // ── SEKME GEÇİŞLERİ ──
                if (TAB_IDS.includes(action)) {
                    try { await btn.deferUpdate(); } catch { return; }

                    let embed;
                    const rows = [buildTabRow(action, interaction.id)];

                    try {
                        if (action === 'home') {
                            embed = curSeason
                                ? buildHomeEmbed(curSeason, curUserData, curClaimed, curTaskData, curRank)
                                : createEmbed('info', '🏆 Sezon Sistemi', 'Şu anda aktif bir sezon bulunmuyor.');

                        } else if (action === 'rewards') {
                            const curLevel     = curUserData ? Number(curUserData.season_level) || 1 : 0;
                            const hasClaimable = findNextClaimableLevel(curLevel, curClaimed) !== null;
                            embed = buildRewardsEmbed(curSeason, curUserData, curClaimed);
                            rows.push(buildClaimRow(interaction.id, 'cr', 'Hazır Ödülü Al', '🎁', hasClaimable));

                        } else if (action === 'tasks') {
                            const readyTask = curTaskData?.tasks?.find(t => t.completed && !t.claimed);
                            embed = buildTasksEmbed(curSeason, curTaskData);
                            rows.push(buildClaimRow(interaction.id, 'ct', 'Hazır Görevi Al', '⭐', !!readyTask));

                        } else if (action === 'lb') {
                            embed = buildLeaderboardEmbed(curSeason, curLB, curRank);

                        } else {
                            embed = buildHistoryEmbed(curHistory);
                        }
                    } catch (err) {
                        console.error(`Sezon sekmesi hatası [${action}]:`, err?.message || err);
                        embed = createEmbed('error', '⚠️ Bir Aksilik Oldu', 'Bu sekme şu an yüklenemiyor. Biraz sonra tekrar dene.');
                    }

                    try {
                        await btn.editReply({ embeds: [embed], components: rows });
                    } catch { /* yoksay */ }

                // ── ÖDÜL CLAIM ──
                } else if (action === 'cr') {
                    try { await btn.deferUpdate(); } catch { return; }

                    let followMsg;
                    try {
                        if (!curSeason) {
                            followMsg = getLevelClaimMsg('no_active_season');
                        } else {
                            const curLevel  = curUserData ? Number(curUserData.season_level) || 1 : 0;
                            const nextLevel = findNextClaimableLevel(curLevel, curClaimed);
                            if (nextLevel === null) {
                                followMsg = 'Şu an alınabilecek hazır ödülün yok.';
                            } else {
                                const claimResult = await claimLevelReward(userId, curSeason.id, nextLevel);
                                if (claimResult.success) {
                                    const rt = claimResult.reward ? formatSeasonReward(claimResult.reward) : '—';
                                    followMsg = `✅ **Seviye ${nextLevel}** ödülünü aldın: ${rt}`;
                                } else {
                                    followMsg = getLevelClaimMsg(claimResult.reason);
                                }
                                // Başarılı veya başarısız — durumu yenile
                                try {
                                    const [freshArr, freshData] = await Promise.all([
                                        getClaimedLevels(userId, curSeason.id),
                                        getUserSeasonData(userId)
                                    ]);
                                    curClaimed  = new Set(freshArr);
                                    curUserData = freshData.user;
                                } catch { /* yoksay */ }
                            }
                        }
                    } catch (err) {
                        console.error('Sezon ödül claim hatası:', err?.message || err);
                        followMsg = getLevelClaimMsg('error');
                    }

                    try {
                        await btn.followUp({ content: followMsg, flags: MessageFlags.Ephemeral });
                    } catch { /* yoksay */ }

                    try {
                        const curLevel     = curUserData ? Number(curUserData.season_level) || 1 : 0;
                        const hasClaimable = findNextClaimableLevel(curLevel, curClaimed) !== null;
                        await btn.editReply({
                            embeds: [buildRewardsEmbed(curSeason, curUserData, curClaimed)],
                            components: [
                                buildTabRow('rewards', interaction.id),
                                buildClaimRow(interaction.id, 'cr', 'Hazır Ödülü Al', '🎁', hasClaimable)
                            ]
                        });
                    } catch { /* yoksay */ }

                // ── GÖREV CLAIM ──
                } else if (action === 'ct') {
                    try { await btn.deferUpdate(); } catch { return; }

                    let followMsg;
                    try {
                        if (!curSeason) {
                            followMsg = getTaskClaimMsg('no_active_season');
                        } else {
                            const readyTask = curTaskData?.tasks?.find(t => t.completed && !t.claimed);
                            if (!readyTask) {
                                followMsg = 'Şu an alınabilecek hazır sezon görevi ödülün yok.';
                            } else {
                                const claimResult = await claimSeasonTaskReward(userId, readyTask.code, readyTask.periodKey);
                                if (claimResult.success) {
                                    const pts = claimResult.granted || readyTask.reward?.amount || 0;
                                    followMsg = `✅ **${readyTask.title}** görevi tamamlandı! +${formatNumber(pts)} sezon puanı kazandın.`;
                                } else {
                                    followMsg = getTaskClaimMsg(claimResult.reason);
                                }
                                // Başarılı veya başarısız — durumu yenile
                                try {
                                    const [freshTD, freshData] = await Promise.all([
                                        getUserSeasonTasks(userId),
                                        getUserSeasonData(userId)
                                    ]);
                                    curTaskData = freshTD;
                                    curUserData = freshData.user;
                                } catch { /* yoksay */ }
                            }
                        }
                    } catch (err) {
                        console.error('Sezon görev claim hatası:', err?.message || err);
                        followMsg = getTaskClaimMsg('error');
                    }

                    try {
                        await btn.followUp({ content: followMsg, flags: MessageFlags.Ephemeral });
                    } catch { /* yoksay */ }

                    try {
                        const readyTask = curTaskData?.tasks?.find(t => t.completed && !t.claimed);
                        await btn.editReply({
                            embeds: [buildTasksEmbed(curSeason, curTaskData)],
                            components: [
                                buildTabRow('tasks', interaction.id),
                                buildClaimRow(interaction.id, 'ct', 'Hazır Görevi Al', '⭐', !!readyTask)
                            ]
                        });
                    } catch { /* yoksay */ }
                }
            });

            collector.on('end', async () => {
                try {
                    await interaction.editReply({ components: [buildDisabledTabRow(interaction.id)] });
                } catch { /* mesaj silinmiş olabilir */ }
            });

        } catch (err) {
            console.error('Sezon komutu hatası:', err?.message || err);
            const reply = {
                embeds: [createEmbed('error', '⚠️ Bir Aksilik Oldu', 'Sezon bilgisi şu an alınamadı. Biraz sonra tekrar dene.')],
                flags: MessageFlags.Ephemeral
            };
            try {
                if (interaction.replied || interaction.deferred) {
                    await interaction.followUp(reply);
                } else {
                    await interaction.reply(reply);
                }
            } catch { /* yoksay */ }
        }
    }
};
