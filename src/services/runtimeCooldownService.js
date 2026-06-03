'use strict';

// Bellek içi kısa süreli cooldown servisi.
// /kumar, /yazitura ve /slot gibi DB timestamp kullanmayan runtime-only cooldownlar için.
// Bot yeniden başlatılırsa cooldownlar sıfırlanır; bu kabul edilebilir davranıştır.
// Her get/set çağrısında süresi dolmuş kayıtlar temizlenir (memory leak önlemi).

const { COOLDOWNS } = require('../utils/constants');
const { getNumberSetting } = require('./settingsService');

// key: `${commandCode}:${userId}`, value: expiresAt (ms since epoch)
const _cooldowns = new Map();

// Komut adlarından oluşan sabit küme — sadece bu komutlar runtime cooldown kullanır.
const RUNTIME_COMMANDS = new Set(['kumar', 'yazitura', 'slot']);

function _cleanup() {
    const now = Date.now();
    for (const [key, expiresAt] of _cooldowns.entries()) {
        if (now >= expiresAt) _cooldowns.delete(key);
    }
}

function _key(commandCode, userId) {
    return `${commandCode}:${userId}`;
}

// Kalan süreyi ms cinsinden döndürür. 0 = hazır.
function getRuntimeCooldown(commandCode, userId) {
    _cleanup();
    const expiresAt = _cooldowns.get(_key(commandCode, userId));
    if (!expiresAt) return 0;
    const left = expiresAt - Date.now();
    return left > 0 ? left : 0;
}

// Cooldown başlat: userId için commandCode komutunu durationMs ms süre kilitler.
function setRuntimeCooldown(commandCode, userId, durationMs) {
    _cleanup();
    if (durationMs <= 0) {
        _cooldowns.delete(_key(commandCode, userId));
        return;
    }
    _cooldowns.set(_key(commandCode, userId), Date.now() + durationMs);
}

// Belirli bir komutun cooldownunu sıfırla.
function clearRuntimeCooldown(commandCode, userId) {
    _cooldowns.delete(_key(commandCode, userId));
    _cleanup();
}

// Kullanıcının tüm runtime cooldownlarını sıfırla.
function clearAllRuntimeCooldowns(userId) {
    for (const key of [..._cooldowns.keys()]) {
        if (key.endsWith(`:${userId}`)) _cooldowns.delete(key);
    }
    _cleanup();
}

// Belirli bir komutun kalan süresini newLeftMs'ye ayarla.
function setRuntimeCooldownRemaining(commandCode, userId, newLeftMs) {
    if (newLeftMs <= 0) {
        clearRuntimeCooldown(commandCode, userId);
        return;
    }
    _cooldowns.set(_key(commandCode, userId), Date.now() + newLeftMs);
    _cleanup();
}

// Tüm runtime komutlar için kullanıcının kalan sürelerini döndürür.
function getRuntimeCooldownStatus(userId) {
    _cleanup();
    const now = Date.now();
    return [...RUNTIME_COMMANDS].map(code => {
        const expiresAt = _cooldowns.get(_key(code, userId));
        const leftMs = expiresAt && expiresAt > now ? expiresAt - now : 0;
        return { commandCode: code, leftMs, ready: leftMs === 0 };
    });
}

// settingsService üzerinden gamble spam cooldown süresini oku; hata varsa constant fallback.
async function getGambleCooldownMs() {
    try {
        return await getNumberSetting('cooldown.gamble_spam', COOLDOWNS.GAMBLE_SPAM);
    } catch (_) {
        return COOLDOWNS.GAMBLE_SPAM;
    }
}

module.exports = {
    RUNTIME_COMMANDS,
    getRuntimeCooldown,
    setRuntimeCooldown,
    clearRuntimeCooldown,
    clearAllRuntimeCooldowns,
    setRuntimeCooldownRemaining,
    getRuntimeCooldownStatus,
    getGambleCooldownMs,
};
