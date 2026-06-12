'use strict';

const {
    getCurrentSeason,
    ensureSeasonAutomationState,
    updateSeasonAutomationState,
    completeCurrentSeason,
    saveSnapshot,
    buildSeasonSnapshotData
} = require('./seasonService');
const { getSetting, getBooleanSetting } = require('./settingsService');
const { createEmbed } = require('../utils/embeds');
const { formatNumber } = require('../utils/format');

const TICK_INTERVAL_MS = 5 * 60 * 1000; // 5 dakika

let _intervalId = null;
let _started    = false;
let _ticking    = false;

// ================== [ KANAL MESAJ HELPERLARı ] ==================

async function sendToChannel(client, channelId, payload) {
    try {
        if (!channelId || !channelId.trim()) return { sent: false, reason: 'not_configured' };
        const ch = await client.channels.fetch(channelId.trim()).catch(() => null);
        if (!ch || !ch.isTextBased()) {
            console.warn(`[SeasonAuto] Kanal bulunamadı veya metin kanalı değil: ${channelId}`);
            return { sent: false, reason: 'channel_not_found' };
        }
        await ch.send(payload);
        return { sent: true, channelId: channelId.trim() };
    } catch (err) {
        console.error(`[SeasonAuto] Kanal gönderim hatası [${channelId}]:`, err?.message || err);
        return { sent: false, reason: 'send_failed' };
    }
}

async function sendToConfiguredChannel(client, settingKey, payload) {
    try {
        const channelId = await getSetting(settingKey, '');
        return await sendToChannel(client, channelId, payload);
    } catch (err) {
        console.error(`[SeasonAuto] Kanal ayar okuma hatası [${settingKey}]:`, err?.message || err);
        return { sent: false, reason: 'error' };
    }
}

// İki kanala gönderir. Aynı kanal ise sadece warning payload gönderilir, tekrar etmez.
async function sendToWarningAndAdmin(client, warnPayload, adminPayload) {
    const [wId, aId] = await Promise.all([
        getSetting('season.warning_channel_id', ''),
        getSetting('season.admin_channel_id', '')
    ]);

    const wTrimmed = wId ? wId.trim() : '';
    const aTrimmed = aId ? aId.trim() : '';
    let anySent = false;

    if (wTrimmed) {
        const r = await sendToChannel(client, wTrimmed, warnPayload);
        if (r.sent) anySent = true;
        // Admin kanalı farklıysa ayrıca gönder
        if (aTrimmed && aTrimmed !== wTrimmed) {
            const ra = await sendToChannel(client, aTrimmed, adminPayload);
            if (ra.sent) anySent = true;
        }
    } else if (aTrimmed) {
        // Uyarı kanalı yok, admin kanalına admin payload gönder
        const ra = await sendToChannel(client, aTrimmed, adminPayload);
        if (ra.sent) anySent = true;
    }

    return anySent;
}

// ================== [ EMBED OLUŞTURUCULAR ] ==================

function fmtDate(date) {
    return new Date(date).toLocaleDateString('tr-TR', {
        day: 'numeric', month: 'long', year: 'numeric',
        hour: '2-digit', minute: '2-digit'
    });
}

function buildWarning7dEmbed(season) {
    return createEmbed('admin', '⚠️ Sezon Uyarısı — 7 Gün',
        `**${season.name}** sezonunun bitmesine **7 gün** kaldı.`
    ).addFields(
        { name: '📅 Bitiş', value: fmtDate(season.ends_at), inline: true },
        { name: '📢 Not', value: 'Oyuncular henüz uyarılmadı. Hazırlık için 4 gün var.', inline: false }
    ).setFooter({ text: 'Sezon otomasyon uyarısı' });
}

function buildWarning3dEmbed(season) {
    return createEmbed('warn', '⏰ Sezon 3 Gün Sonra Bitiyor',
        `**${season.name}** sezonunun bitmesine **3 gün** kaldı! Ödüllerini almayı unutma.`
    ).addFields(
        { name: '📅 Bitiş', value: fmtDate(season.ends_at), inline: true }
    ).setFooter({ text: 'Sezon uyarısı — /sezon-oduller ile ödüllerini al' });
}

function buildWarning3dAdminEmbed(season) {
    return createEmbed('admin', '⚠️ Sezon Uyarısı — 3 Gün',
        `**${season.name}** sezonunun bitmesine **3 gün** kaldı.`
    ).addFields(
        { name: '📅 Bitiş', value: fmtDate(season.ends_at), inline: true },
        { name: '📢 Not', value: 'Uyarı oyuncu kanalına gönderildi.', inline: false }
    ).setFooter({ text: 'Sezon otomasyon uyarısı' });
}

function buildWarning24hEmbed(season) {
    return createEmbed('warn', '⏰ Sezon 24 Saat Sonra Bitiyor',
        `**${season.name}** sezonunun bitmesine **24 saat** kaldı! Son şans — ödüllerini ve görevlerini tamamla.`
    ).addFields(
        { name: '📅 Bitiş', value: fmtDate(season.ends_at), inline: true }
    ).setFooter({ text: 'Sezon uyarısı — /sezon · /sezon-oduller · /gorevler' });
}

function buildWarning24hAdminEmbed(season) {
    return createEmbed('admin', '⚠️ Sezon Uyarısı — 24 Saat',
        `**${season.name}** sezonunun bitmesine **24 saat** kaldı.`
    ).addFields(
        { name: '📅 Bitiş', value: fmtDate(season.ends_at), inline: true },
        { name: '📢 Not', value: 'Uyarı oyuncu kanalına gönderildi.', inline: false }
    ).setFooter({ text: 'Sezon otomasyon uyarısı' });
}

function buildWarning1hEmbed(season) {
    return createEmbed('warn', '🚨 Sezon Bitmek Üzere!',
        `**${season.name}** sezonunun bitmesine **1 saatten az** kaldı! Son dakika!`
    ).addFields(
        { name: '📅 Bitiş', value: fmtDate(season.ends_at), inline: true }
    ).setFooter({ text: 'Son şans! /sezon-oduller ile ödüllerini al.' });
}

function buildSeasonEndWarningEmbed(season, snapshot) {
    const top = snapshot.top10?.[0];
    return createEmbed('premium', '🏁 Sezon Sona Erdi',
        `**${season.name}** tamamlandı! Sonuçlar kilitlendi.`
    ).addFields(
        { name: '👥 Katılımcı', value: String(snapshot.participantCount || 0), inline: true },
        { name: '🏆 Lider',     value: top ? `<@${top.user_id}>` : '—', inline: true },
        { name: '📢 Ödüller',   value: 'Ödüller yakında dağıtılacak. Takipte kal!', inline: false }
    ).setFooter({ text: 'Yeni sezonda görüşmek üzere!' });
}

function buildSeasonEndAdminEmbed(season, snapshot, completeResult) {
    const top    = snapshot.top10?.[0];
    const status = completeResult?.ok
        ? '✅ `completed` olarak işaretlendi'
        : `⚠️ ${completeResult?.reason || 'bilinmiyor'}`;

    return createEmbed('admin', '🏁 Sezon Otomatik Tamamlandı',
        `**${season.name}** sezonu sistem tarafından tamamlandı.`
    ).addFields(
        { name: '🆔 Sezon ID',       value: String(season.id),                                   inline: true },
        { name: '👥 Katılımcı',      value: String(snapshot.participantCount || 0),              inline: true },
        { name: '🎯 Toplam Puan',    value: formatNumber(snapshot.totalPoints || 0),             inline: true },
        { name: '🏆 Lider',          value: top
            ? `<@${top.user_id}> — ${formatNumber(Number(top.points))} puan`
            : '—',                                                                               inline: false },
        { name: '📸 Snapshot',       value: '✅ `end` snapshot alındı',                          inline: true },
        { name: '⚙️ Durum',          value: status,                                              inline: true },
        { name: '🎖️ Ödül Dağıtımı', value: '⏳ Manuel onay bekliyor — `/sezon-yonet dagit`',    inline: false }
    ).setFooter({ text: 'Sezon otomasyon sistemi' });
}

function buildDailyReportEmbed(season, snapshot) {
    const endsAt       = season.ends_at ? new Date(season.ends_at) : null;
    const remainingMs  = endsAt ? (endsAt - Date.now()) : null;
    const remainingDays = remainingMs ? Math.ceil(remainingMs / 86400000) : null;

    const top5 = (snapshot.top10 || []).slice(0, 5);
    const topLines = top5.length > 0
        ? top5.map((u, i) => `**#${i + 1}** <@${u.user_id}> — ${formatNumber(Number(u.points))} puan · Sv.**${u.season_level}**`).join('\n')
        : 'Henüz katılımcı yok.';

    const descText = remainingDays !== null && remainingDays > 0
        ? `Sezona **${remainingDays} gün** kaldı.`
        : 'Sezon aktif.';

    return createEmbed('premium', `📊 Günlük Sezon Raporu — ${season.name}`, descText)
        .addFields(
            { name: '👥 Katılımcı',  value: String(snapshot.participantCount || 0),           inline: true },
            { name: '🎯 Toplam',     value: formatNumber(snapshot.totalPoints || 0),           inline: true },
            { name: '📈 Ortalama',   value: formatNumber(snapshot.averagePoints || 0),         inline: true },
            { name: '🎖️ Maks. Sv.', value: `${snapshot.maxLevelUserCount || 0} kullanıcı`,    inline: true },
            { name: '🏆 Top 5',      value: topLines,                                          inline: false }
        )
        .setFooter({ text: 'Bu rapor yaklaşık 24 saatte bir gönderilir.' });
}

// ================== [ UYARI HELPERLARı ] ==================

async function handleWarning7d(client, season) {
    const payload = { embeds: [buildWarning7dEmbed(season)] };
    const r = await sendToConfiguredChannel(client, 'season.admin_channel_id', payload);
    if (r.sent) {
        await updateSeasonAutomationState(season.id, { notified_7d: true });
        console.log(`[SeasonAuto] 7 gün uyarısı gönderildi — ${season.name}`);
    } else {
        console.warn(`[SeasonAuto] 7 gün uyarısı gönderilemedi (admin kanalı ayarlı değil veya hata). Season: ${season.name}`);
    }
}

async function handleWarning3d(client, season) {
    const warnPayload  = { embeds: [buildWarning3dEmbed(season)] };
    const adminPayload = { embeds: [buildWarning3dAdminEmbed(season)] };
    const anySent = await sendToWarningAndAdmin(client, warnPayload, adminPayload);
    if (anySent) {
        await updateSeasonAutomationState(season.id, { notified_3d: true });
        console.log(`[SeasonAuto] 3 gün uyarısı gönderildi — ${season.name}`);
    } else {
        console.warn(`[SeasonAuto] 3 gün uyarısı gönderilemedi (kanallar ayarlı değil). Season: ${season.name}`);
    }
}

async function handleWarning24h(client, season) {
    const warnPayload  = { embeds: [buildWarning24hEmbed(season)] };
    const adminPayload = { embeds: [buildWarning24hAdminEmbed(season)] };
    const anySent = await sendToWarningAndAdmin(client, warnPayload, adminPayload);
    if (anySent) {
        await updateSeasonAutomationState(season.id, { notified_24h: true });
        console.log(`[SeasonAuto] 24 saat uyarısı gönderildi — ${season.name}`);
    } else {
        console.warn(`[SeasonAuto] 24 saat uyarısı gönderilemedi (kanallar ayarlı değil). Season: ${season.name}`);
    }
}

async function handleWarning1h(client, season) {
    const payload  = { embeds: [buildWarning1hEmbed(season)] };
    const r = await sendToConfiguredChannel(client, 'season.warning_channel_id', payload);
    if (r.sent) {
        await updateSeasonAutomationState(season.id, { notified_1h: true });
        console.log(`[SeasonAuto] 1 saat uyarısı gönderildi — ${season.name}`);
    } else {
        console.warn(`[SeasonAuto] 1 saat uyarısı gönderilemedi (uyarı kanalı ayarlı değil). Season: ${season.name}`);
    }
}

async function handleSeasonEnd(client, season) {
    try {
        console.log(`[SeasonAuto] Sezon bitişi işleniyor — ${season.name} (ID: ${season.id})`);

        // 1. End snapshot al
        let snapshotData = { participantCount: 0, totalPoints: 0, averagePoints: 0, top10: [], maxLevelUserCount: 0 };
        try {
            snapshotData = await buildSeasonSnapshotData(season.id);
            await saveSnapshot(season.id, 'end', snapshotData);
            console.log(`[SeasonAuto] End snapshot alındı — season ${season.id}`);
        } catch (snapErr) {
            console.error('[SeasonAuto] End snapshot hatası:', snapErr?.message || snapErr);
        }

        // 2. Sezonu tamamla
        const completeResult = await completeCurrentSeason();
        if (!completeResult.ok && completeResult.reason !== 'already_completed') {
            console.error(`[SeasonAuto] Sezon tamamlanamadı: ${completeResult.reason}`);
            // Hata durumunda flag set etme — sonraki tick tekrar dener
            return;
        }
        console.log(`[SeasonAuto] Sezon tamamlandı — ${completeResult.reason || 'ok'}`);

        // 3. Automation state güncelle (flag önce set et, sonra mesaj at)
        await updateSeasonAutomationState(season.id, {
            notified_end:  true,
            auto_ended_at: new Date(),
            last_check:    new Date()
        });

        // 4. Kanallara bildirim gönder
        const warnPayload  = { embeds: [buildSeasonEndWarningEmbed(season, snapshotData)] };
        const adminPayload = { embeds: [buildSeasonEndAdminEmbed(season, snapshotData, completeResult)] };
        await sendToWarningAndAdmin(client, warnPayload, adminPayload);

    } catch (err) {
        console.error('[SeasonAuto] handleSeasonEnd hatası:', err?.message || err);
    }
}

async function checkDailyReport(client, season, state) {
    try {
        const reportId = await getSetting('season.report_channel_id', '');
        if (!reportId || !reportId.trim()) return;

        const now        = Date.now();
        const lastReport = state.last_daily_report_at;

        // 24 saat geçmediyse gönderme
        if (lastReport && (now - new Date(lastReport).getTime()) < 86400000) return;

        const snapshotData = await buildSeasonSnapshotData(season.id);
        await saveSnapshot(season.id, 'daily', snapshotData).catch(err => {
            console.error('[SeasonAuto] Daily snapshot hatası:', err?.message || err);
        });

        const payload = { embeds: [buildDailyReportEmbed(season, snapshotData)] };
        const result  = await sendToChannel(client, reportId.trim(), payload);

        if (result.sent) {
            await updateSeasonAutomationState(season.id, { last_daily_report_at: new Date() });
            console.log(`[SeasonAuto] Günlük rapor gönderildi — ${season.name}`);
        }
    } catch (err) {
        console.error('[SeasonAuto] Günlük rapor hatası:', err?.message || err);
    }
}

// ================== [ ANA TİCK ] ==================

async function runSeasonAutomationTick(client) {
    if (_ticking) {
        console.log('[SeasonAuto] Önceki tick devam ediyor, bu tick atlandı.');
        return;
    }
    _ticking = true;

    try {
        const autoEnabled = await getBooleanSetting('season.automation_enabled', true);
        if (!autoEnabled) return;

        const season = await getCurrentSeason();
        if (!season || !season.ends_at) return;

        const state = await ensureSeasonAutomationState(season.id);
        if (!state) {
            console.error('[SeasonAuto] Otomasyon state alınamadı.');
            return;
        }

        const now          = Date.now();
        const endsAt       = new Date(season.ends_at).getTime();
        const remainingMs  = endsAt - now;
        const remainingDays = remainingMs / 86400000;

        // ── SEZON BİTİŞİ ──
        if (remainingMs <= 0 && !state.notified_end) {
            await handleSeasonEnd(client, season);
            return;
        }

        if (remainingMs <= 0) return; // Zaten bitti ve flag set edilmiş

        // ── UYARILAR (büyükten küçüğe, catch-up mantığıyla) ──
        // Local mutation: aynı tick içinde duplicate gönderimini önler
        const localState = { ...state };

        if (remainingDays <= 7 && !localState.notified_7d) {
            await handleWarning7d(client, season);
            localState.notified_7d = true;
        }
        if (remainingDays <= 3 && !localState.notified_3d) {
            await handleWarning3d(client, season);
            localState.notified_3d = true;
        }
        if (remainingMs <= 86400000 && !localState.notified_24h) {
            await handleWarning24h(client, season);
            localState.notified_24h = true;
        }
        if (remainingMs <= 3600000 && !localState.notified_1h) {
            await handleWarning1h(client, season);
            localState.notified_1h = true;
        }

        // ── GÜNLÜK RAPOR ──
        const dailyEnabled = await getBooleanSetting('season.daily_report_enabled', true);
        if (dailyEnabled) {
            await checkDailyReport(client, season, state);
        }

        await updateSeasonAutomationState(season.id, { last_check: new Date() });

    } catch (err) {
        console.error('[SeasonAuto] Tick hatası:', err?.message || err);
    } finally {
        _ticking = false;
    }
}

// ================== [ BAŞLAT / DURDUR ] ==================

function startSeasonAutomation(client) {
    if (_started) {
        console.warn('[SeasonAuto] Otomasyon zaten başlatılmış, duplicate başlatma engellendi.');
        return;
    }
    _started = true;

    console.log('[SeasonAuto] Sezon otomasyon servisi başlatılıyor...');

    // İlk tick'i kısa gecikme ile çalıştır (bot hazır olsun)
    setTimeout(() => {
        runSeasonAutomationTick(client).catch(err => {
            console.error('[SeasonAuto] İlk tick hatası:', err?.message || err);
        });
    }, 30000); // 30 saniye sonra ilk tick

    _intervalId = setInterval(() => {
        runSeasonAutomationTick(client).catch(err => {
            console.error('[SeasonAuto] Periyodik tick hatası:', err?.message || err);
        });
    }, TICK_INTERVAL_MS);

    console.log(`[SeasonAuto] Otomasyon başlatıldı. Tick aralığı: ${TICK_INTERVAL_MS / 60000} dakika.`);
}

function stopSeasonAutomation() {
    if (_intervalId) {
        clearInterval(_intervalId);
        _intervalId = null;
    }
    _started = false;
    _ticking = false;
    console.log('[SeasonAuto] Sezon otomasyon servisi durduruldu.');
}

module.exports = {
    startSeasonAutomation,
    stopSeasonAutomation,
    runSeasonAutomationTick,
    sendToConfiguredChannel,
    sendToChannel,
};
