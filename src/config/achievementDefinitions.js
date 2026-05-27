// Başarım tanımları — kod sabiti olarak tutulur, veritabanına yazılmaz.
// Başarımlar kalıcıdır; bir kez açılır, tekrar açılamaz.
// Yeni başarım eklemek için bu dosyaya yeni obje eklemek yeterlidir.

const ACHIEVEMENT_DEFINITIONS = [
    {
        code: 'first_work',
        icon: '💼',
        title: 'İlk Mesai',
        description: 'İlk kez çalış.',
        eventType: 'work_completed',
        targetCount: 1,
        reward: { type: 'coin', amount: 1000 }
    },
    {
        code: 'work_10',
        icon: '🔨',
        title: 'Çalışkan',
        description: '10 kez çalış.',
        eventType: 'work_completed',
        targetCount: 10,
        reward: { type: 'coin', amount: 3000 }
    },
    {
        code: 'work_100',
        icon: '⚙️',
        title: 'Makine',
        description: '100 kez çalış.',
        eventType: 'work_completed',
        targetCount: 100,
        reward: { type: 'coin', amount: 10000 }
    },
    {
        code: 'first_daily',
        icon: '🎁',
        title: 'İlk Giriş',
        description: 'İlk günlük ödülünü al.',
        eventType: 'daily_claimed',
        targetCount: 1,
        reward: { type: 'coin', amount: 500 }
    },
    {
        code: 'first_crate',
        icon: '📦',
        title: 'Kasa Meraklısı',
        description: 'İlk kasanı aç.',
        eventType: 'crate_opened',
        targetCount: 1,
        reward: { type: 'coin', amount: 1500 }
    },
    {
        code: 'crate_10',
        icon: '🎰',
        title: 'Kasa Koleksiyoncusu',
        description: '10 kasa aç.',
        eventType: 'crate_opened',
        targetCount: 10,
        reward: { type: 'crate', itemId: 'basit_kasa', quantity: 1 }
    },
    {
        code: 'first_sell',
        icon: '💰',
        title: 'İlk Satış',
        description: 'İlk koleksiyon eşyanı sat.',
        eventType: 'item_sold',
        targetCount: 1,
        reward: { type: 'coin', amount: 1000 }
    },
    {
        code: 'first_buy',
        icon: '🛍️',
        title: 'Pazar Müşterisi',
        description: 'İlk market alışverişini yap.',
        eventType: 'item_bought',
        targetCount: 1,
        reward: { type: 'coin', amount: 500 }
    },
    {
        code: 'first_save',
        icon: '🏦',
        title: 'İlk Birikim',
        description: 'İlk kez bankaya para yatır.',
        eventType: 'bank_deposit',
        targetCount: 1,
        reward: { type: 'coin', amount: 500 }
    },
    {
        code: 'loan_closed',
        icon: '✅',
        title: 'Borcunu Kapattı',
        description: 'Kredi borcunu öde.',
        eventType: 'loan_paid',
        targetCount: 1,
        reward: { type: 'coin', amount: 2000 }
    }
];

function getAchievementDefinition(code) {
    return ACHIEVEMENT_DEFINITIONS.find(d => d.code === code) || null;
}

function getAllAchievementDefinitions() {
    return ACHIEVEMENT_DEFINITIONS;
}

function getAchievementDefinitionsByEvent(eventType) {
    return ACHIEVEMENT_DEFINITIONS.filter(d => d.eventType === eventType);
}

module.exports = {
    ACHIEVEMENT_DEFINITIONS,
    getAchievementDefinition,
    getAllAchievementDefinitions,
    getAchievementDefinitionsByEvent
};
