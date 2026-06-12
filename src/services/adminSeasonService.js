'use strict';

const { pool } = require('../database/pool');
const { withTx } = require('../database/tx');
const { addMoney } = require('../database/money');
const { addItem } = require('../database/inventory');
const { ensureUser } = require('../database/users');
const {
    getCurrentSeason,
    getLatestCompletedSeason,
    buildSeasonSnapshotData,
    saveSnapshot,
    getSeasonAutomationState
} = require('./seasonService');
const { logAdminAction } = require('./adminLogService');

// ================== [ SEZON SONU ÖDÜL TIER TABLOSU ] ==================
// Hem preview hem distribution için tek kaynak — değiştirirsen ikisi birlikte güncellenir.
const END_REWARD_TIERS = [
    { minRank:  1, maxRank:  1, coin: 10000, items: [{ itemCode: 'prestij_kasa', qty: 3 }, { itemCode: 'efsanevi_kasa', qty: 2 }] },
    { minRank:  2, maxRank:  2, coin:  7500, items: [{ itemCode: 'prestij_kasa', qty: 2 }, { itemCode: 'efsanevi_kasa', qty: 2 }] },
    { minRank:  3, maxRank:  3, coin:  5000, items: [{ itemCode: 'prestij_kasa', qty: 1 }, { itemCode: 'efsanevi_kasa', qty: 2 }] },
    { minRank:  4, maxRank: 10, coin:  2500, items: [{ itemCode: 'efsanevi_kasa', qty: 1 }, { itemCode: 'neon_kasa', qty: 1 }] },
    { minRank: 11, maxRank: 25, coin:  1000, items: [{ itemCode: 'neon_kasa', qty: 1 }] }
];

const CRATE_DISPLAY = {
    prestij_kasa:  'Prestij Kasa',
    efsanevi_kasa: 'Efsanevi Kasa',
    neon_kasa:     'Neon Kasa',
    epik_kasa:     'Epik Kasa',
    nexus_kasa:    'Nexus Kasa',
    nadir_kasa:    'Nadir Kasa',
    basit_kasa:    'Basit Kasa'
};

// ================== [ YARDIMCI FONKSIYONLAR ] ==================

function getTierForRank(rank) {
    const r = Number(rank);
    return END_REWARD_TIERS.find(t => r >= t.minRank && r <= t.maxRank) || null;
}

function buildEndRewardPlan(users) {
    const plan = [];
    for (const u of users) {
        const rank = Number(u.rank);
        const tier = getTierForRank(rank);
        if (!tier) continue;
        plan.push({
            userId:        u.user_id,
            rank,
            points:        Number(u.points),
            seasonLevel:   Number(u.season_level),
            alreadyClaimed: u.rewards_claimed === true || u.rewards_claimed === 'true',
            coin:          tier.coin,
            items:         tier.items
        });
    }
    return plan;
}

async function resolveSeasonForAdmin(seasonId, db = pool) {
    if (seasonId) {
        const res = await db.query('SELECT * FROM economy_seasons WHERE id = $1', [seasonId]);
        return res.rows[0] || null;
    }
    const active = await getCurrentSeason(db);
    if (active) return active;
    return await getLatestCompletedSeason(db);
}

async function getTop25WithRank(seasonId, db = pool) {
    const res = await db.query(`
        SELECT user_id, points, season_level, rewards_claimed,
               RANK() OVER (ORDER BY points DESC) AS rank
        FROM economy_season_users
        WHERE season_id = $1 AND points > 0
        ORDER BY points DESC
        LIMIT 25
    `, [seasonId]);
    return res.rows;
}

// ================== [ ADMIN SEZON RAPORU ] ==================

async function getAdminSeasonReport(seasonId = null) {
    try {
        const season = await resolveSeasonForAdmin(seasonId);
        if (!season) return { ok: false, reason: 'no_season' };

        const [statsRes, top10Res, levelCntRes, levelClaimRes, snapshotCntRes, distCntRes, autoState] =
            await Promise.all([
                pool.query(`
                    SELECT COUNT(*)                        AS participant_count,
                           COALESCE(SUM(points),  0)      AS total_points,
                           COALESCE(AVG(points),  0)      AS avg_points,
                           COALESCE(MAX(points),  0)      AS max_points
                    FROM economy_season_users WHERE season_id = $1
                `, [season.id]),
                pool.query(`
                    SELECT user_id, points, season_level
                    FROM economy_season_users WHERE season_id = $1
                    ORDER BY points DESC LIMIT 10
                `, [season.id]),
                pool.query(`
                    SELECT COUNT(*) FILTER (WHERE season_level >= 10) AS lv10_plus,
                           COUNT(*) FILTER (WHERE season_level >= 20) AS lv20_plus,
                           COUNT(*) FILTER (WHERE season_level >= 30) AS lv30
                    FROM economy_season_users WHERE season_id = $1
                `, [season.id]),
                pool.query(`
                    SELECT COUNT(DISTINCT user_id) AS claimed_users,
                           COUNT(*)                AS claimed_total
                    FROM economy_user_season_rewards WHERE season_id = $1
                `, [season.id]),
                pool.query(`
                    SELECT COUNT(*) AS cnt FROM economy_season_snapshots WHERE season_id = $1
                `, [season.id]),
                pool.query(`
                    SELECT COUNT(*) AS distributed_count
                    FROM economy_season_users
                    WHERE season_id = $1 AND rewards_claimed = true
                `, [season.id]),
                getSeasonAutomationState(season.id)
            ]);

        const stats    = statsRes.rows[0]    || {};
        const levelCnt = levelCntRes.rows[0] || {};
        const claimCnt = levelClaimRes.rows[0] || {};

        const now      = Date.now();
        const endsAt   = season.ends_at ? new Date(season.ends_at).getTime() : null;
        const remainingMs = (endsAt && endsAt > now) ? (endsAt - now) : 0;

        return {
            ok: true,
            season,
            stats: {
                participantCount: Number(stats.participant_count) || 0,
                totalPoints:      Number(stats.total_points)      || 0,
                avgPoints:        Math.round(Number(stats.avg_points) || 0),
                maxPoints:        Number(stats.max_points)         || 0,
                lv10plus:         Number(levelCnt.lv10_plus)       || 0,
                lv20plus:         Number(levelCnt.lv20_plus)       || 0,
                lv30:             Number(levelCnt.lv30)            || 0
            },
            top10: top10Res.rows,
            claimedLevelRewards: {
                claimedUsers: Number(claimCnt.claimed_users)  || 0,
                totalClaims:  Number(claimCnt.claimed_total)  || 0
            },
            snapshotCount:    Number(snapshotCntRes.rows[0]?.cnt)              || 0,
            distributedCount: Number(distCntRes.rows[0]?.distributed_count)    || 0,
            automationState:  autoState || null,
            remainingMs
        };
    } catch (err) {
        console.error('[AdminSezon] Rapor hatası:', err?.message || err);
        return { ok: false, reason: 'error' };
    }
}

// ================== [ MANUEL SNAPSHOT ] ==================

async function createManualSeasonSnapshot(seasonId = null, actorId = null) {
    try {
        const season = await resolveSeasonForAdmin(seasonId);
        if (!season) return { ok: false, reason: 'no_season' };

        const snapshotData = await buildSeasonSnapshotData(season.id);
        const snapshot     = await saveSnapshot(season.id, 'manual', snapshotData);

        if (actorId) {
            logAdminAction({
                action:   'manual_snapshot_created',
                category: 'season',
                actorId,
                targetKey: `season_${season.id}`,
                newValue:  `snapshot_${snapshot.id}`,
                reason:   'Manuel snapshot alındı',
                metadata: { seasonId: season.id, seasonName: season.name, snapshotId: snapshot.id }
            }).catch(e => console.error('[AdminSezon] Log hatası:', e?.message));
        }

        return {
            ok: true,
            season,
            snapshot,
            summary: {
                participantCount: snapshotData.participantCount,
                totalPoints:      snapshotData.totalPoints
            }
        };
    } catch (err) {
        console.error('[AdminSezon] Manuel snapshot hatası:', err?.message || err);
        return { ok: false, reason: 'snapshot_failed' };
    }
}

// ================== [ SEZON SONU ÖDÜL ÖNİZLEME ] ==================

async function previewSeasonEndRewards(seasonId) {
    try {
        if (!seasonId) return { ok: false, reason: 'season_not_found' };

        const res = await pool.query('SELECT * FROM economy_seasons WHERE id = $1', [seasonId]);
        const season = res.rows[0];
        if (!season) return { ok: false, reason: 'season_not_found' };

        const users = await getTop25WithRank(season.id);
        const plan  = buildEndRewardPlan(users);

        let totalCoin = 0, totalCrates = 0, eligibleCount = 0, alreadyClaimedCount = 0;
        for (const entry of plan) {
            if (entry.alreadyClaimed) { alreadyClaimedCount++; continue; }
            eligibleCount++;
            totalCoin   += entry.coin;
            for (const it of entry.items) totalCrates += it.qty;
        }

        const confirmationPhrase = `SEZON-${seasonId}-DAGIT`;
        const canDistribute = season.status === 'completed' && eligibleCount > 0;
        const warnings = [];
        if (season.status !== 'completed') {
            warnings.push('Bu sezon henüz tamamlanmamış. Ödüller yalnızca tamamlanan sezonlara dağıtılabilir.');
        }
        if (plan.length === 0) {
            warnings.push("Top 25'te puan > 0 olan kullanıcı bulunamadı.");
        } else if (eligibleCount === 0) {
            warnings.push('Tüm uygun kullanıcıların ödülleri zaten dağıtılmış.');
        }

        return {
            ok: true,
            season,
            plan,
            totals: { totalCoin, totalCrates, eligibleCount, alreadyClaimedCount, totalRows: plan.length },
            confirmationPhrase,
            canDistribute,
            warnings
        };
    } catch (err) {
        console.error('[AdminSezon] Önizleme hatası:', err?.message || err);
        return { ok: false, reason: 'error' };
    }
}

// ================== [ GÜVENLİ SEZON SONU DAĞITIMI ] ==================

async function distributeSeasonEndRewards(seasonId, actorId, confirmationText) {
    if (!seasonId || !actorId) return { ok: false, reason: 'invalid_params' };

    // 1. Confirmation text kontrolü — DB'ye dokunmadan önce
    const expectedPhrase = `SEZON-${seasonId}-DAGIT`;
    if (!confirmationText || confirmationText.trim() !== expectedPhrase) {
        logAdminAction({
            action:   'season_reward_distribution_failed',
            category: 'season',
            actorId,
            targetKey: `season_${seasonId}`,
            reason:   'Hatalı onay metni',
            metadata: { seasonId, confirmationUsed: false, error: 'invalid_confirmation' }
        }).catch(() => {});
        return { ok: false, reason: 'invalid_confirmation' };
    }

    try {
        // 2. Sezon doğrulama
        const seasonRes = await pool.query('SELECT * FROM economy_seasons WHERE id = $1', [seasonId]);
        const season    = seasonRes.rows[0];
        if (!season)                        return { ok: false, reason: 'season_not_found' };
        if (season.status !== 'completed')  return { ok: false, reason: 'season_not_completed' };

        // 3. Aktif sezon değil mi kontrolü (çift güvenlik)
        const activeSeason = await getCurrentSeason();
        if (activeSeason && activeSeason.id === season.id) return { ok: false, reason: 'season_not_completed' };

        // 4. Ödül adayları
        const users   = await getTop25WithRank(season.id);
        const plan    = buildEndRewardPlan(users);
        if (plan.length === 0) return { ok: false, reason: 'nothing_to_distribute' };

        const eligible = plan.filter(e => !e.alreadyClaimed);
        const skipped  = plan.filter(e => e.alreadyClaimed);
        if (eligible.length === 0) return { ok: false, reason: 'already_distributed' };

        // 5. Başlangıç logu
        logAdminAction({
            action:   'season_reward_distribution_started',
            category: 'season',
            actorId,
            targetKey: `season_${seasonId}`,
            reason:   'Sezon sonu ödül dağıtımı başlatıldı',
            metadata: { seasonId, seasonName: season.name, eligibleCount: eligible.length, confirmationUsed: true }
        }).catch(() => {});

        let totalCoin = 0, totalCrates = 0;

        // 6. Transaction içinde dağıt
        await withTx(async (client) => {
            // FOR UPDATE ile satırları kilitle (aynı anda başka dağıtım engellenir)
            if (eligible.length > 0) {
                const params = [seasonId];
                const placeholders = eligible.map((e, i) => {
                    params.push(e.userId);
                    return `$${i + 2}`;
                }).join(', ');
                await client.query(
                    `SELECT id FROM economy_season_users
                     WHERE season_id = $1 AND user_id IN (${placeholders}) FOR UPDATE`,
                    params
                );
            }

            for (const entry of eligible) {
                await ensureUser(entry.userId, client);

                if (entry.coin > 0) {
                    await addMoney(entry.userId, entry.coin, 'wallet', client);
                    totalCoin += entry.coin;
                }
                for (const it of entry.items) {
                    await addItem(entry.userId, it.itemCode, it.qty, client);
                    totalCrates += it.qty;
                }

                // rewards_claimed = false koşulu idempotency güvencesi
                await client.query(
                    `UPDATE economy_season_users
                     SET rewards_claimed = true
                     WHERE season_id = $1 AND user_id = $2 AND rewards_claimed = false`,
                    [seasonId, entry.userId]
                );
            }
        });

        // 7. Dağıtım sonrası snapshot
        let snapshotId = null;
        try {
            const snapData = await buildSeasonSnapshotData(season.id);
            const snap     = await saveSnapshot(season.id, 'manual', snapData);
            snapshotId = snap?.id || null;
        } catch (snapErr) {
            console.error('[AdminSezon] Post-dağıtım snapshot hatası:', snapErr?.message);
        }

        // 8. Başarı logu
        logAdminAction({
            action:   'season_reward_distribution_completed',
            category: 'season',
            actorId,
            targetKey: `season_${seasonId}`,
            oldValue:  `${skipped.length} zaten dağıtılmış`,
            newValue:  `${eligible.length} kullanıcıya dağıtıldı`,
            reason:   'Sezon sonu ödül dağıtımı tamamlandı',
            metadata: {
                seasonId,
                seasonName:        season.name,
                distributedCount:  eligible.length,
                skippedCount:      skipped.length,
                totalCoin,
                totalCrates,
                snapshotId,
                confirmationUsed:  true
            }
        }).catch(() => {});

        return {
            ok:                   true,
            season,
            distributedUserCount: eligible.length,
            skippedAlreadyClaimed: skipped.length,
            totalCoin,
            totalCrates,
            rows:                 eligible,
            snapshotId
        };

    } catch (err) {
        console.error('[AdminSezon] Dağıtım hatası:', err?.message || err);
        logAdminAction({
            action:   'season_reward_distribution_failed',
            category: 'season',
            actorId,
            targetKey: `season_${seasonId}`,
            reason:   'Dağıtım hatası (transaction)',
            metadata: { seasonId, error: err?.message || 'unknown', confirmationUsed: true }
        }).catch(() => {});
        return { ok: false, reason: 'distribution_failed' };
    }
}

// ================== [ DAĞITIM DURUMU ] ==================

async function getSeasonDistributionStatus(seasonId = null) {
    try {
        const season = await resolveSeasonForAdmin(seasonId);
        if (!season) return { ok: false, reason: 'no_season' };

        const [totalRes, claimedRes, topRows] = await Promise.all([
            pool.query(
                'SELECT COUNT(*) AS total FROM economy_season_users WHERE season_id = $1 AND points > 0',
                [season.id]
            ),
            pool.query(
                'SELECT COUNT(*) AS claimed FROM economy_season_users WHERE season_id = $1 AND rewards_claimed = true',
                [season.id]
            ),
            getTop25WithRank(season.id)
        ]);

        const total   = Number(totalRes.rows[0]?.total)   || 0;
        const claimed = Number(claimedRes.rows[0]?.claimed) || 0;
        const plan    = buildEndRewardPlan(topRows);
        const eligible = plan.filter(e => !e.alreadyClaimed).length;

        return {
            ok: true,
            season,
            total,
            claimed,
            eligible,
            isFullyDistributed:  plan.length > 0 && eligible === 0,
            confirmationPhrase: `SEZON-${season.id}-DAGIT`
        };
    } catch (err) {
        console.error('[AdminSezon] Dağıtım durumu hatası:', err?.message || err);
        return { ok: false, reason: 'error' };
    }
}

module.exports = {
    getAdminSeasonReport,
    createManualSeasonSnapshot,
    previewSeasonEndRewards,
    distributeSeasonEndRewards,
    getSeasonDistributionStatus,
    buildEndRewardPlan,
    END_REWARD_TIERS,
    CRATE_DISPLAY
};
