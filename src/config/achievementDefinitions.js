// Başarım tanımları — kod sabiti olarak tutulur, veritabanına yazılmaz.
// Başarımlar kalıcıdır; bir kez açılır, tekrar açılamaz.
// Yeni başarım eklemek için bu dosyaya yeni obje eklemek yeterlidir.

const ACHIEVEMENT_DEFINITIONS = [
    // ==================[ ÇALIŞMA ]==================
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
        code: 'work_250',
        icon: '🏭',
        title: 'Fabrika Gibi',
        description: '250 kez çalış.',
        eventType: 'work_completed',
        targetCount: 250,
        reward: { type: 'coin', amount: 25000 }
    },
    {
        code: 'work_500',
        icon: '🤖',
        title: 'Yorulmaz',
        description: '500 kez çalış.',
        eventType: 'work_completed',
        targetCount: 500,
        reward: { type: 'coin', amount: 50000 }
    },
    // ==================[ GÜNLÜK ]==================
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
        code: 'daily_7',
        icon: '📅',
        title: '7 Günlük Seri',
        description: '7 kez günlük ödül al.',
        eventType: 'daily_claimed',
        targetCount: 7,
        reward: { type: 'coin', amount: 5000 }
    },
    {
        code: 'daily_30',
        icon: '🗓️',
        title: 'Aylık Devam',
        description: '30 kez günlük ödül al.',
        eventType: 'daily_claimed',
        targetCount: 30,
        reward: { type: 'coin', amount: 15000 }
    },
    // ==================[ KASA ]==================
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
        code: 'crate_25',
        icon: '🎀',
        title: 'Kasa Delisi',
        description: '25 kasa aç.',
        eventType: 'crate_opened',
        targetCount: 25,
        reward: { type: 'crate', itemId: 'basit_kasa', quantity: 1 }
    },
    {
        code: 'crate_50',
        icon: '🎊',
        title: 'Kasa Bağımlısı',
        description: '50 kasa aç.',
        eventType: 'crate_opened',
        targetCount: 50,
        reward: { type: 'coin', amount: 8000 }
    },
    {
        code: 'crate_100',
        icon: '🏆',
        title: 'Kasa Ustası',
        description: '100 kasa aç.',
        eventType: 'crate_opened',
        targetCount: 100,
        reward: { type: 'coin', amount: 20000 }
    },
    // ==================[ SATILIŞ ]==================
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
        code: 'sell_10',
        icon: '💱',
        title: 'Hızlı Satıcı',
        description: '10 eşya sat.',
        eventType: 'item_sold',
        targetCount: 10,
        reward: { type: 'coin', amount: 3000 }
    },
    {
        code: 'sell_25',
        icon: '📈',
        title: 'Tacir',
        description: '25 eşya sat.',
        eventType: 'item_sold',
        targetCount: 25,
        reward: { type: 'coin', amount: 6000 }
    },
    {
        code: 'sell_50',
        icon: '🏪',
        title: 'Büyük Tüccar',
        description: '50 eşya sat.',
        eventType: 'item_sold',
        targetCount: 50,
        reward: { type: 'coin', amount: 12000 }
    },
    // ==================[ MARKET ]==================
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
        code: 'buy_10',
        icon: '🛒',
        title: 'Alışveriş Tutkunu',
        description: '10 kez market alışverişi yap.',
        eventType: 'item_bought',
        targetCount: 10,
        reward: { type: 'coin', amount: 2000 }
    },
    {
        code: 'buy_25',
        icon: '💳',
        title: 'Market Müdavimi',
        description: '25 kez market alışverişi yap.',
        eventType: 'item_bought',
        targetCount: 25,
        reward: { type: 'coin', amount: 5000 }
    },
    // ==================[ BANKA ]==================
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
        code: 'deposit_10',
        icon: '💵',
        title: 'Biriktiriyorum',
        description: '10 kez bankaya para yatır.',
        eventType: 'bank_deposit',
        targetCount: 10,
        reward: { type: 'coin', amount: 2000 }
    },
    {
        code: 'deposit_25',
        icon: '💴',
        title: 'Tasarruf Uzmanı',
        description: '25 kez bankaya para yatır.',
        eventType: 'bank_deposit',
        targetCount: 25,
        reward: { type: 'coin', amount: 5000 }
    },
    // ==================[ KREDİ ]==================
    {
        code: 'loan_closed',
        icon: '✅',
        title: 'Borcunu Kapattı',
        description: 'Kredi borcunu öde.',
        eventType: 'loan_paid',
        targetCount: 1,
        reward: { type: 'coin', amount: 2000 }
    },
    {
        code: 'loan_closed_5',
        icon: '📋',
        title: 'Güvenilir Borçlu',
        description: '5 kez kredi borcunu öde.',
        eventType: 'loan_paid',
        targetCount: 5,
        reward: { type: 'coin', amount: 5000 }
    },
    {
        code: 'loan_closed_10',
        icon: '✔️',
        title: 'Kredi Uzmanı',
        description: '10 kez kredi borcunu öde.',
        eventType: 'loan_paid',
        targetCount: 10,
        reward: { type: 'coin', amount: 10000 }
    },
    // ==================[ KUMAR ]==================
    {
        code: 'first_gamble',
        icon: '🎲',
        title: 'İlk Bahis',
        description: 'İlk şans oyununu oyna.',
        eventType: 'gamble_played',
        targetCount: 1,
        reward: { type: 'coin', amount: 500 }
    },
    {
        code: 'gamble_10',
        icon: '🃏',
        title: 'Kumarbaz',
        description: '10 şans oyunu oyna.',
        eventType: 'gamble_played',
        targetCount: 10,
        reward: { type: 'coin', amount: 2000 }
    },
    {
        code: 'gamble_50',
        icon: '🎰',
        title: 'Şans Tiryakisi',
        description: '50 şans oyunu oyna.',
        eventType: 'gamble_played',
        targetCount: 50,
        reward: { type: 'coin', amount: 6000 }
    },
    {
        code: 'gamble_100',
        icon: '💸',
        title: 'Şans Filozofu',
        description: '100 şans oyunu oyna.',
        eventType: 'gamble_played',
        targetCount: 100,
        reward: { type: 'coin', amount: 12000 }
    },
    // ==================[ SUÇ ]==================
    {
        code: 'first_crime',
        icon: '🦹',
        title: 'İlk Suç',
        description: 'İlk kez suç işle.',
        eventType: 'crime_committed',
        targetCount: 1,
        reward: { type: 'coin', amount: 1000 }
    },
    {
        code: 'crime_10',
        icon: '🕵️',
        title: 'Suç Makinesi',
        description: '10 kez suç işle.',
        eventType: 'crime_committed',
        targetCount: 10,
        reward: { type: 'coin', amount: 3000 }
    },
    {
        code: 'crime_25',
        icon: '🔫',
        title: 'Aranan Adam',
        description: '25 kez suç işle.',
        eventType: 'crime_committed',
        targetCount: 25,
        reward: { type: 'coin', amount: 7000 }
    },
    // ==================[ SOYGUN ]==================
    {
        code: 'first_rob',
        icon: '🥷',
        title: 'İlk Soygun',
        description: 'İlk başarılı soygunu gerçekleştir.',
        eventType: 'rob_success',
        targetCount: 1,
        reward: { type: 'coin', amount: 2000 }
    },
    {
        code: 'rob_success_5',
        icon: '💰',
        title: 'Köy Soyguncusu',
        description: '5 başarılı soygun yap.',
        eventType: 'rob_success',
        targetCount: 5,
        reward: { type: 'coin', amount: 5000 }
    },
    {
        code: 'rob_success_10',
        icon: '🎭',
        title: 'Uzman Soyguncu',
        description: '10 başarılı soygun yap.',
        eventType: 'rob_success',
        targetCount: 10,
        reward: { type: 'coin', amount: 10000 }
    },
    {
        code: 'rob_success_25',
        icon: '👑',
        title: 'Efsane Soyguncu',
        description: '25 başarılı soygun yap.',
        eventType: 'rob_success',
        targetCount: 25,
        reward: { type: 'coin', amount: 20000 }
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
