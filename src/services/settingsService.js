// Bot ayar okuma/yazma/validasyon/reset servisi.
// bot_settings tablosu üzerinden çalışır.
// Bu aşamada mevcut komutlar bu servisi okumaz; altyapı olarak hazır tutulur.

const { pool } = require('../database/pool');
const { DEFAULT_SETTINGS } = require('../config/defaultSettings');

const VALID_TYPES = ['integer', 'float', 'boolean', 'text'];

function findDefault(key) {
    return DEFAULT_SETTINGS.find(s => s.key === key) || null;
}

// ==================[ OKUMA ]==================

async function getSetting(key, fallback = null) {
    try {
        const res = await pool.query('SELECT value FROM bot_settings WHERE key = $1', [key]);
        if (res.rows.length > 0) return res.rows[0].value;
    } catch (err) {
        console.error('getSetting DB hatası [' + key + ']:', err && err.message ? err.message : err);
    }
    const def = findDefault(key);
    if (def) return def.defaultValue;
    return fallback;
}

async function getNumberSetting(key, fallback = 0) {
    const raw = await getSetting(key, String(fallback));
    const n = Number(raw);
    return isNaN(n) ? fallback : n;
}

async function getBooleanSetting(key, fallback = true) {
    const raw = await getSetting(key, fallback ? 'true' : 'false');
    if (raw === 'true'  || raw === '1') return true;
    if (raw === 'false' || raw === '0') return false;
    return fallback;
}

async function isSystemEnabled(systemKey, fallback = true) {
    const key = systemKey.startsWith('system.') ? systemKey : `system.${systemKey}`;
    return getBooleanSetting(key, fallback);
}

async function listSettings(category = null) {
    try {
        if (category) {
            const res = await pool.query(
                'SELECT * FROM bot_settings WHERE category = $1 ORDER BY key',
                [category]
            );
            return res.rows;
        }
        const res = await pool.query('SELECT * FROM bot_settings ORDER BY category, key');
        return res.rows;
    } catch (err) {
        console.error('listSettings hatası:', err && err.message ? err.message : err);
        return [];
    }
}

// ==================[ VALİDASYON ]==================

function validateSettingValue(settingRow, value) {
    // DB row (snake_case) veya defaultSettings entry (camelCase) kabul eder
    const type   = settingRow.value_type  || settingRow.valueType  || 'text';
    const minVal = settingRow.min_value   !== undefined ? settingRow.min_value  : settingRow.minValue;
    const maxVal = settingRow.max_value   !== undefined ? settingRow.max_value  : settingRow.maxValue;

    if (!VALID_TYPES.includes(type)) {
        return { valid: false, reason: 'Geçersiz value_type: ' + type };
    }

    if (type === 'boolean') {
        if (value !== 'true' && value !== 'false') {
            return { valid: false, reason: 'Boolean değer "true" veya "false" olmalı.' };
        }
        return { valid: true };
    }

    if (type === 'integer') {
        const n = parseInt(value, 10);
        if (isNaN(n)) return { valid: false, reason: 'Tam sayı bekleniyor.' };
        if (String(n) !== String(value).trim()) return { valid: false, reason: 'Tam sayı bekleniyor.' };
        if (minVal !== null && minVal !== undefined && n < Number(minVal)) {
            return { valid: false, reason: `Değer en az ${minVal} olmalı.` };
        }
        if (maxVal !== null && maxVal !== undefined && n > Number(maxVal)) {
            return { valid: false, reason: `Değer en fazla ${maxVal} olabilir.` };
        }
        return { valid: true };
    }

    if (type === 'float') {
        const n = parseFloat(value);
        if (isNaN(n)) return { valid: false, reason: 'Ondalıklı sayı bekleniyor.' };
        if (minVal !== null && minVal !== undefined && n < Number(minVal)) {
            return { valid: false, reason: `Değer en az ${minVal} olmalı.` };
        }
        if (maxVal !== null && maxVal !== undefined && n > Number(maxVal)) {
            return { valid: false, reason: `Değer en fazla ${maxVal} olabilir.` };
        }
        return { valid: true };
    }

    // text: uzunluk kısıtlaması yok, her şey geçerli
    return { valid: true };
}

// ==================[ YAZMA ]==================

async function setSetting(key, value, actorId, reason) {
    if (!reason || !reason.trim()) throw new Error('Sebep zorunludur.');
    if (!actorId)                  throw new Error('actorId zorunludur.');

    // DB'den mevcut satırı al
    let dbRow = null;
    try {
        const res = await pool.query('SELECT * FROM bot_settings WHERE key = $1', [key]);
        dbRow = res.rows[0] || null;
    } catch (err) {
        throw new Error('Ayar okunurken hata: ' + (err && err.message ? err.message : err));
    }

    // Validasyon için kaynak: DB satırı veya defaultSettings
    const validationSource = dbRow || (() => {
        const def = findDefault(key);
        if (!def) return null;
        return {
            value_type: def.valueType,
            min_value:  def.minValue,
            max_value:  def.maxValue,
            is_sensitive: def.isSensitive,
        };
    })();

    if (!validationSource) throw new Error(`Bilinmeyen ayar: "${key}"`);

    const validation = validateSettingValue(validationSource, value);
    if (!validation.valid) throw new Error(validation.reason);

    const oldValue = dbRow ? dbRow.value : null;
    const isSensitive = validationSource.is_sensitive || validationSource.isSensitive || false;

    try {
        if (dbRow) {
            await pool.query(
                'UPDATE bot_settings SET value = $1, updated_by = $2, updated_at = CURRENT_TIMESTAMP WHERE key = $3',
                [value, actorId, key]
            );
        } else {
            // DB'de yoksa defaultSettings'ten meta alarak oluştur
            const def = findDefault(key);
            await pool.query(`
                INSERT INTO bot_settings
                    (key, value, value_type, category, description, is_sensitive, min_value, max_value, default_value, updated_by)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
            `, [
                key, value, def.valueType, def.category, def.description,
                def.isSensitive,
                def.minValue !== null && def.minValue !== undefined ? def.minValue : null,
                def.maxValue !== null && def.maxValue !== undefined ? def.maxValue : null,
                def.defaultValue,
                actorId
            ]);
        }
    } catch (err) {
        throw new Error('Ayar kaydedilemedi: ' + (err && err.message ? err.message : err));
    }

    // Admin log (hata olsa da işlem iptal olmaz)
    try {
        const { logAdminAction } = require('./adminLogService');
        await logAdminAction({
            action: 'setting_changed',
            category: 'settings',
            actorId,
            targetKey: key,
            oldValue: isSensitive ? '[GİZLİ]' : (oldValue !== null ? oldValue : '(yok)'),
            newValue: isSensitive ? '[GİZLİ]' : value,
            reason:   reason.trim(),
        });
    } catch (logErr) {
        console.error('Admin log yazılamadı (setSetting):', logErr && logErr.message ? logErr.message : logErr);
    }

    return { ok: true, key, oldValue, newValue: value };
}

async function resetSetting(key, actorId, reason) {
    if (!reason || !reason.trim()) throw new Error('Sebep zorunludur.');
    const def = findDefault(key);
    if (!def) throw new Error(`Varsayılan değer bulunamadı: "${key}"`);
    return setSetting(key, def.defaultValue, actorId, reason);
}

// ==================[ SEED ]==================

async function ensureDefaultSettings() {
    if (DEFAULT_SETTINGS.length === 0) return;

    for (const s of DEFAULT_SETTINGS) {
        try {
            await pool.query(`
                INSERT INTO bot_settings
                    (key, value, value_type, category, description, is_sensitive, min_value, max_value, default_value)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                ON CONFLICT (key) DO UPDATE SET
                    description   = EXCLUDED.description,
                    category      = EXCLUDED.category,
                    value_type    = EXCLUDED.value_type,
                    min_value     = EXCLUDED.min_value,
                    max_value     = EXCLUDED.max_value,
                    default_value = EXCLUDED.default_value,
                    is_sensitive  = EXCLUDED.is_sensitive
            `, [
                s.key,
                s.value,
                s.valueType,
                s.category,
                s.description,
                s.isSensitive,
                s.minValue !== null && s.minValue !== undefined ? s.minValue : null,
                s.maxValue !== null && s.maxValue !== undefined ? s.maxValue : null,
                s.defaultValue
            ]);
        } catch (err) {
            console.error('ensureDefaultSettings hatası [' + s.key + ']:', err && err.message ? err.message : err);
        }
    }
    console.log(`✅ ${DEFAULT_SETTINGS.length} bot ayarı doğrulandı.`);
}

module.exports = {
    getSetting,
    getNumberSetting,
    getBooleanSetting,
    isSystemEnabled,
    listSettings,
    validateSettingValue,
    setSetting,
    resetSetting,
    ensureDefaultSettings,
};
