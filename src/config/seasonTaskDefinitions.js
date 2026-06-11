'use strict';

// Sezon 2.0 Görev Tanımları — economy_user_tasks tablosunu kullanır.
// period_type: 'season_daily' | 'season_weekly' | 'season_once'
// Ödüller yalnızca season_point olup doğrudan MetaCoin verilmez.

const SEASON_DAILY_TASKS = [
    {
        code: 'season_daily_work',
        periodType: 'season_daily',
        title: 'Sezon Mesaisi',
        description: 'Bugün 3 kez çalış.',
        event: 'work_completed',
        target: 3,
        reward: { type: 'season_point', amount: 30 },
        emoji: '⚒️'
    },
    {
        code: 'season_daily_daily',
        periodType: 'season_daily',
        title: 'Günlük Başlangıç',
        description: 'Bugünkü günlük ödülünü al.',
        event: 'daily_claimed',
        target: 1,
        reward: { type: 'season_point', amount: 20 },
        emoji: '📅'
    },
    {
        code: 'season_daily_crate',
        periodType: 'season_daily',
        title: 'Günlük Kasa',
        description: 'Bugün 1 kasa aç.',
        event: 'crate_opened',
        target: 1,
        reward: { type: 'season_point', amount: 40 },
        emoji: '📦'
    },
    {
        code: 'season_daily_sell',
        periodType: 'season_daily',
        title: 'Pazar Hareketi',
        description: 'Bugün 2 eşya sat.',
        event: 'item_sold',
        target: 2,
        reward: { type: 'season_point', amount: 25 },
        emoji: '💰'
    },
    {
        code: 'season_daily_gamble',
        periodType: 'season_daily',
        title: 'Şans Denemesi',
        description: 'Bugün 3 risk oyunu oyna.',
        event: 'gamble_played',
        target: 3,
        reward: { type: 'season_point', amount: 20 },
        emoji: '🎲'
    }
];

const SEASON_WEEKLY_TASKS = [
    {
        code: 'season_weekly_work',
        periodType: 'season_weekly',
        title: 'Haftalık Mesai',
        description: 'Bu hafta 20 kez çalış.',
        event: 'work_completed',
        target: 20,
        reward: { type: 'season_point', amount: 150 },
        emoji: '🔨'
    },
    {
        code: 'season_weekly_crates',
        periodType: 'season_weekly',
        title: 'Kasa Koleksiyoncusu',
        description: 'Bu hafta 5 kasa aç.',
        event: 'crate_opened',
        target: 5,
        reward: { type: 'season_point', amount: 200 },
        emoji: '🎰'
    },
    {
        code: 'season_weekly_market',
        periodType: 'season_weekly',
        title: 'Pazar Uzmanı',
        description: 'Bu hafta 10 eşya sat.',
        event: 'item_sold',
        target: 10,
        reward: { type: 'season_point', amount: 150 },
        emoji: '💵'
    },
    {
        code: 'season_weekly_risk',
        periodType: 'season_weekly',
        title: 'Risk Haftası',
        description: 'Bu hafta 15 risk oyunu oyna.',
        event: 'gamble_played',
        target: 15,
        reward: { type: 'season_point', amount: 125 },
        emoji: '🃏'
    },
    {
        code: 'season_weekly_loan',
        periodType: 'season_weekly',
        title: 'Borç Disiplini',
        description: 'Bu hafta 3 kredi ödemesi yap.',
        event: 'loan_paid',
        target: 3,
        reward: { type: 'season_point', amount: 120 },
        emoji: '💳'
    }
];

const SEASON_ONCE_TASKS = [
    {
        code: 'season_once_first_daily',
        periodType: 'season_once',
        title: 'Sezona Giriş',
        description: 'Sezon içinde ilk günlük ödülünü al.',
        event: 'daily_claimed',
        target: 1,
        reward: { type: 'season_point', amount: 50 },
        emoji: '🌅'
    },
    {
        code: 'season_once_first_crate',
        periodType: 'season_once',
        title: 'İlk Kasa',
        description: 'Sezon içinde ilk kasanı aç.',
        event: 'crate_opened',
        target: 1,
        reward: { type: 'season_point', amount: 60 },
        emoji: '📦'
    },
    {
        code: 'season_once_first_sale',
        periodType: 'season_once',
        title: 'İlk Satış',
        description: 'Sezon içinde ilk eşyanı sat.',
        event: 'item_sold',
        target: 1,
        reward: { type: 'season_point', amount: 50 },
        emoji: '🏪'
    },
    {
        code: 'season_once_first_work',
        periodType: 'season_once',
        title: 'İlk Mesai',
        description: 'Sezon içinde ilk kez çalış.',
        event: 'work_completed',
        target: 1,
        reward: { type: 'season_point', amount: 40 },
        emoji: '💼'
    },
    {
        code: 'season_once_crime',
        periodType: 'season_once',
        title: 'Karanlık Deneme',
        description: 'Sezon içinde 3 suç denemesi yap.',
        event: 'crime_committed',
        target: 3,
        reward: { type: 'season_point', amount: 75 },
        emoji: '🕵️'
    },
    {
        code: 'season_once_rob',
        periodType: 'season_once',
        title: 'Büyük Risk',
        description: 'Sezon içinde 1 başarılı soygun yap.',
        event: 'rob_success',
        target: 1,
        reward: { type: 'season_point', amount: 100 },
        emoji: '🎯'
    }
];

const SEASON_TASKS = [...SEASON_DAILY_TASKS, ...SEASON_WEEKLY_TASKS, ...SEASON_ONCE_TASKS];

const SEASON_TASK_MAP = new Map(SEASON_TASKS.map(t => [t.code, t]));

function getSeasonTaskByCode(code) {
    return SEASON_TASK_MAP.get(code) || null;
}

function getSeasonTasksByPeriod(periodType) {
    return SEASON_TASKS.filter(t => t.periodType === periodType);
}

function formatSeasonTaskReward(task) {
    if (!task || !task.reward) return '—';
    if (task.reward.type === 'season_point') return `+${task.reward.amount} sezon puanı`;
    return '—';
}

module.exports = {
    SEASON_DAILY_TASKS,
    SEASON_WEEKLY_TASKS,
    SEASON_ONCE_TASKS,
    SEASON_TASKS,
    getSeasonTaskByCode,
    getSeasonTasksByPeriod,
    formatSeasonTaskReward
};
