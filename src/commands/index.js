// Tüm aktif Türkçe komutlar burada toplanır.
// Discord'a yalnızca aşağıdaki Türkçe adlar kayıt edilir.
// Eski İngilizce adlar legacyAliases üzerinden iç yönlendirmeyle çalışır.

const economyModules = [
    require('./economy/bakiye'),
    require('./economy/yatir'),
    require('./economy/cek'),
    require('./economy/gonder'),
    require('./economy/gunluk'),
    require('./economy/haftalik'),
    require('./economy/aylik'),
    require('./economy/calis'),
    require('./economy/dilen'),
    require('./economy/suc'),
    require('./economy/soy'),
    require('./economy/kumar'),
    require('./economy/yazitura'),
    require('./economy/slot'),
    require('./economy/market'),
    require('./economy/satinal'),
    require('./economy/envanter'),
    require('./economy/kullan'),
    require('./economy/banka'),
    require('./economy/faiz'),
    require('./economy/bankaYukselt'),
    require('./economy/profil'),
    require('./economy/siralama'),
    require('./economy/seri'),
    require('./economy/ekonomi'),
    require('./economy/bekleme')
];

const adminModules = [
    require('./admin/paraEkle'),
    require('./admin/paraSil'),
    require('./admin/ekonomiSifirla')
];

const allModules = [...economyModules, ...adminModules];

const commands = {};
for (const mod of allModules) {
    if (!mod || !mod.data || !mod.data.name || typeof mod.execute !== 'function') {
        console.error('Geçersiz komut modülü atlandı:', mod && mod.data && mod.data.name);
        continue;
    }
    commands[mod.data.name] = mod;
}

// Eski İngilizce adlardan yeni Türkçe komutlara yönlendirme.
// Discord global komut güncellemesi bir saate kadar sürebilir; bu süre boyunca
// eski adlardan gelen istekler de doğru komuta düşer.
const legacyAliases = {
    'balance': 'bakiye',
    'deposit': 'yatir',
    'withdraw': 'cek',
    'pay': 'gonder',
    'daily': 'gunluk',
    'weekly': 'haftalik',
    'monthly': 'aylik',
    'work': 'calis',
    'beg': 'dilen',
    'crime': 'suc',
    'rob': 'soy',
    'gamble': 'kumar',
    'coinflip': 'yazitura',
    'slots': 'slot',
    'shop': 'market',
    'buy': 'satinal',
    'inventory': 'envanter',
    'use': 'kullan',
    'profile': 'profil',
    'leaderboard': 'siralama',
    'rank-streak': 'seri',
    'economy-stats': 'ekonomi',
    'cooldowns': 'bekleme',
    'add-money': 'para-ekle',
    'remove-money': 'para-sil',
    'reset-economy-user': 'ekonomi-sifirla'
};

function getRegisterableData() {
    return Object.values(commands).map(c => c.data);
}

function resolveCommand(name) {
    if (commands[name]) return commands[name];
    const aliased = legacyAliases[name];
    if (aliased && commands[aliased]) return commands[aliased];
    return null;
}

module.exports = { commands, legacyAliases, getRegisterableData, resolveCommand };
