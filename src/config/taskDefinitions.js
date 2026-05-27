// Görev tanımları — kod sabiti olarak tutulur, veritabanına yazılmaz.
// Yeni görev eklemek için bu dosyaya yeni obje eklemek yeterlidir.

const DAILY_TASK_DEFINITIONS = [
    {
        code: 'daily_work',
        type: 'daily',
        title: 'Günlük Mesai',
        description: '1 kez çalış.',
        eventType: 'work_completed',
        targetCount: 1,
        reward: { type: 'coin', amount: 800 }
    },
    {
        code: 'daily_reward',
        type: 'daily',
        title: 'Günlük Giriş',
        description: 'Günlük ödülünü al.',
        eventType: 'daily_claimed',
        targetCount: 1,
        reward: { type: 'coin', amount: 500 }
    },
    {
        code: 'daily_crate',
        type: 'daily',
        title: 'Kasa Merakı',
        description: '1 kasa aç.',
        eventType: 'crate_opened',
        targetCount: 1,
        reward: { type: 'coin', amount: 1000 }
    },
    {
        code: 'daily_buy',
        type: 'daily',
        title: 'Alışveriş Günü',
        description: 'Marketten 1 ürün satın al.',
        eventType: 'item_bought',
        targetCount: 1,
        reward: { type: 'coin', amount: 600 }
    },
    {
        code: 'daily_sell',
        type: 'daily',
        title: 'Hızlı Satış',
        description: '1 koleksiyon eşyası sat.',
        eventType: 'item_sold',
        targetCount: 1,
        reward: { type: 'coin', amount: 700 }
    },
    {
        code: 'daily_save',
        type: 'daily',
        title: 'Birikim Alışkanlığı',
        description: 'Bankaya para yatır.',
        eventType: 'bank_deposit',
        targetCount: 1,
        reward: { type: 'coin', amount: 500 }
    },
    {
        code: 'daily_game',
        type: 'daily',
        title: 'Şans Denemesi',
        description: '1 şans oyunu oyna.',
        eventType: 'gamble_played',
        targetCount: 1,
        reward: { type: 'coin', amount: 400 }
    }
];

const WEEKLY_TASK_DEFINITIONS = [
    {
        code: 'weekly_work',
        type: 'weekly',
        title: 'Haftalık Çalışan',
        description: '10 kez çalış.',
        eventType: 'work_completed',
        targetCount: 10,
        reward: { type: 'coin', amount: 8000 }
    },
    {
        code: 'weekly_crate',
        type: 'weekly',
        title: 'Kasa Avcısı',
        description: '5 kasa aç.',
        eventType: 'crate_opened',
        targetCount: 5,
        reward: { type: 'crate', itemId: 'basit_kasa', quantity: 1 }
    },
    {
        code: 'weekly_games',
        type: 'weekly',
        title: 'Şans Haftası',
        description: '10 şans oyunu oyna.',
        eventType: 'gamble_played',
        targetCount: 10,
        reward: { type: 'coin', amount: 5000 }
    },
    {
        code: 'weekly_sell',
        type: 'weekly',
        title: 'Koleksiyoncu Satışı',
        description: '3 koleksiyon eşyası sat.',
        eventType: 'item_sold',
        targetCount: 3,
        reward: { type: 'coin', amount: 6000 }
    },
    {
        code: 'weekly_daily',
        type: 'weekly',
        title: 'Seri Devamı',
        description: '3 kez günlük ödül al.',
        eventType: 'daily_claimed',
        targetCount: 3,
        reward: { type: 'season_point', amount: 10 }
    },
    {
        code: 'weekly_loan',
        type: 'weekly',
        title: 'Sorumlu Borçlu',
        description: 'Kredi borcu öde.',
        eventType: 'loan_paid',
        targetCount: 1,
        reward: { type: 'coin', amount: 5000 }
    },
    {
        code: 'weekly_save',
        type: 'weekly',
        title: 'Birikim Haftası',
        description: 'Bankaya para yatır.',
        eventType: 'bank_deposit',
        targetCount: 1,
        reward: { type: 'coin', amount: 7000 }
    }
];

const ALL_TASK_DEFINITIONS = [...DAILY_TASK_DEFINITIONS, ...WEEKLY_TASK_DEFINITIONS];

function getTaskDefinition(code) {
    return ALL_TASK_DEFINITIONS.find(d => d.code === code) || null;
}

function getTaskDefinitionsByType(type) {
    if (type === 'daily')  return DAILY_TASK_DEFINITIONS;
    if (type === 'weekly') return WEEKLY_TASK_DEFINITIONS;
    return [];
}

function getAllTaskDefinitions() {
    return ALL_TASK_DEFINITIONS;
}

module.exports = {
    DAILY_TASK_DEFINITIONS,
    WEEKLY_TASK_DEFINITIONS,
    getTaskDefinition,
    getTaskDefinitionsByType,
    getAllTaskDefinitions
};
