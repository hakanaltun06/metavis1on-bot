const { MessageFlags } = require('discord.js');
const { withTx } = require('../../database/tx');
const { ensureUser } = require('../../database/users');
const {
    createLoan,
    getActiveLoans,
    getUserLoans,
    getLoanByIdForUpdate,
    payLoan,
    markLoanPaid,
    getLoanSummary,
    updateCreditScore
} = require('../../database/loans');
const { logTransaction } = require('../../database/transactions');
const { createEmbed } = require('../../utils/embeds');
const { fmtMoney, formatDateTime } = require('../../utils/format');
const { CURRENCY_NAME } = require('../../utils/constants');
const { getMoneySupply, calculateInflationIndex, getEconomyMood } = require('../../services/economyService');
const {
    getCreditTier,
    getTermOption,
    calculateDueDate,
    calculateLoanLimit,
    getMaxActiveLoans,
    calculateBaseLoanRate,
    calculateFinalLoanRate,
    calculateTotalDue,
    calculateCreditScoreChange,
    getLoanStatusText,
    validateLoanAmount,
    LOAN_AMOUNT_MIN
} = require('../../services/loanService');
const { refreshUserLoans } = require('../../services/loanRefresh');

// ================== [ KOMUT TANIMI ] ==================
module.exports = {
    data: {
        name: 'kredi',
        description: 'Kredi alma, ödeme ve kredi puanı işlemleri.',
        options: [
            {
                name: 'bilgi',
                description: 'Kredi limitini, puanını ve faiz tahminini gösterir.',
                type: 1
            },
            {
                name: 'al',
                description: 'Yeni bir kredi çekersin.',
                type: 1,
                options: [
                    { name: 'miktar', description: 'Çekmek istediğin miktar.', type: 4, required: true },
                    {
                        name: 'vade',
                        description: 'Geri ödeme süresi.',
                        type: 3,
                        required: true,
                        choices: [
                            { name: '3 gün', value: '3' },
                            { name: '7 gün', value: '7' },
                            { name: '14 gün', value: '14' }
                        ]
                    }
                ]
            },
            {
                name: 'ode',
                description: 'Açık bir krediye ödeme yaparsın.',
                type: 1,
                options: [
                    { name: 'kredi', description: 'Ödeme yapılacak kredi numarası.', type: 4, required: true },
                    { name: 'miktar', description: 'Ödeme miktarı.', type: 4, required: true }
                ]
            },
            {
                name: 'listele',
                description: 'Aktif ve son kapanmış kredilerini gösterir.',
                type: 1
            },
            {
                name: 'puan',
                description: 'Kredi puanını ve borç geçmişini gösterir.',
                type: 1
            }
        ]
    },

    async execute(interaction) {
        const sub = interaction.options.getSubcommand();

        try {
            // Her alt komuttan önce kullanıcının gecikmiş kredilerini sessizce yenile
            await refreshUserLoans(interaction.user.id).catch((err) => {
                console.error('Kredi yenileme uyarısı:', err && err.message ? err.message : err);
            });

            if (sub === 'bilgi')   return await handleBilgi(interaction);
            if (sub === 'al')      return await handleAl(interaction);
            if (sub === 'ode')     return await handleOde(interaction);
            if (sub === 'listele') return await handleListele(interaction);
            if (sub === 'puan')    return await handlePuan(interaction);
        } catch (err) {
            console.error('Kredi hatası:', err && err.message ? err.message : err);
            const errEmbed = createEmbed('error', '⚠️ Bir Aksilik Oldu', 'İşlem sırasında bir sorun çıktı. Biraz sonra tekrar dener misin?');
            if (interaction.replied || interaction.deferred) {
                await interaction.followUp({ embeds: [errEmbed], flags: MessageFlags.Ephemeral }).catch(() => null);
            } else {
                await interaction.reply({ embeds: [errEmbed], flags: MessageFlags.Ephemeral }).catch(() => null);
            }
        }
    }
};

// ================== [ /kredi bilgi ] ==================
async function handleBilgi(interaction) {
    const u = await ensureUser(interaction.user.id);
    const tier = getCreditTier(u.credit_score);
    const limit = calculateLoanLimit(u);
    const maxActive = getMaxActiveLoans(u.credit_score);
    const supply = await getMoneySupply();
    const inflationIndex = calculateInflationIndex(supply.total);
    const mood = getEconomyMood(inflationIndex);

    const baseRate = calculateBaseLoanRate(u.credit_score);
    const sampleFinalRate = baseRate == null
        ? null
        : calculateFinalLoanRate(u.credit_score, inflationIndex, 0);

    const rateText = sampleFinalRate == null
        ? 'Şu an kredi alamazsın.'
        : `**%${(sampleFinalRate * 100).toFixed(1)}** (3 günlük vadede)`;

    const note = baseRate == null
        ? 'Kredi puanın düşük. Önce mevcut borçlarını toparlaman ve puanını yükseltmen gerekiyor.'
        : `Piyasa şu an **${mood.toLowerCase()}**; faiz oranı buna göre belirleniyor.`;

    const embed = createEmbed('info', `📋 ${interaction.user.username} — Kredi Bilgisi`, note)
        .addFields(
            { name: 'Kredi Puanı', value: `**${u.credit_score}** / 1000`, inline: true },
            { name: 'Risk Durumu', value: `**${tier.name}**`, inline: true },
            { name: 'Kredi Limiti', value: fmtMoney(limit), inline: true },
            { name: 'Aktif Kredi Hakkı', value: `**${maxActive}** kredi`, inline: true },
            { name: 'Tahmini Faiz', value: rateText, inline: true },
            { name: 'Vade Seçenekleri', value: '3 / 7 / 14 gün', inline: true }
        );
    return interaction.reply({ embeds: [embed] });
}

// ================== [ /kredi al ] ==================
async function handleAl(interaction) {
    const amount = interaction.options.getInteger('miktar');
    const vadeStr = interaction.options.getString('vade');
    const term = getTermOption(vadeStr);

    if (!term) {
        return interaction.reply({
            embeds: [createEmbed('error', '❌ Geçersiz Vade', 'Vade 3, 7 veya 14 gün olabilir.')],
            flags: MessageFlags.Ephemeral
        });
    }

    // Enflasyon endeksini tx dışında alalım; satın alma ile aynı an snapshot olmasına
    // ihtiyaç yok çünkü kredi alma kullanıcının kendi anlık talebi.
    const supply = await getMoneySupply();
    const inflationIndex = calculateInflationIndex(supply.total);

    const outcome = await withTx(async (db) => {
        const u = await ensureUser(interaction.user.id, db);

        const baseRate = calculateBaseLoanRate(u.credit_score);
        if (baseRate == null) return { kind: 'too_risky' };

        const maxActive = getMaxActiveLoans(u.credit_score);
        const active = await getActiveLoans(interaction.user.id, db);
        if (active.length >= maxActive) {
            return { kind: 'too_many', maxActive, currentCount: active.length };
        }

        const limit = calculateLoanLimit(u);
        const validation = validateLoanAmount(amount, limit);
        if (!validation.ok) {
            if (validation.reason === 'invalid')    return { kind: 'invalid_amount' };
            if (validation.reason === 'too_small')  return { kind: 'too_small', min: validation.min };
            if (validation.reason === 'over_limit') return { kind: 'over_limit', limit: validation.limit };
        }

        const principal = validation.amount;
        const finalRate = calculateFinalLoanRate(u.credit_score, inflationIndex, term.surcharge);
        const totalDue = calculateTotalDue(principal, finalRate);
        const dueAt = calculateDueDate(term.days);

        // Cüzdana krediyi ekle (sadece nakit kaydı; kazanç sayılmaz, total_earned ARTIRMA)
        await db.query(
            `UPDATE economy_users SET wallet = wallet + $1, total_borrowed = total_borrowed + $1 WHERE user_id = $2`,
            [principal, interaction.user.id]
        );
        const loan = await createLoan(interaction.user.id, principal, finalRate, totalDue, dueAt, db);
        await logTransaction(interaction.user.id, null, 'loan_take', principal, `Kredi alındı — #${loan.id}`, db);

        return {
            kind: 'ok',
            principal,
            totalDue,
            dueAt,
            rate: finalRate,
            term,
            loanId: loan.id
        };
    });

    if (outcome.kind === 'too_risky') {
        return interaction.reply({
            embeds: [createEmbed('warn', '🚫 Kredi Verilemedi', 'Kredi puanın şu an kredi almak için yeterli değil. Önce borç geçmişini toparlaman gerekiyor.')],
            flags: MessageFlags.Ephemeral
        });
    }
    if (outcome.kind === 'too_many') {
        return interaction.reply({
            embeds: [createEmbed('warn', '🚫 Aktif Kredi Sınırı', `Şu an en fazla **${outcome.maxActive}** aktif kredin olabilir. Önce mevcut borçlarını kapatmalısın.`)],
            flags: MessageFlags.Ephemeral
        });
    }
    if (outcome.kind === 'invalid_amount') {
        return interaction.reply({
            embeds: [createEmbed('error', '❌ Geçersiz Miktar', 'Geçerli bir miktar yaz.')],
            flags: MessageFlags.Ephemeral
        });
    }
    if (outcome.kind === 'too_small') {
        return interaction.reply({
            embeds: [createEmbed('warn', '❌ Düşük Miktar', `En az ${fmtMoney(outcome.min)} kredi çekebilirsin.`)],
            flags: MessageFlags.Ephemeral
        });
    }
    if (outcome.kind === 'over_limit') {
        return interaction.reply({
            embeds: [createEmbed('warn', '❌ Limit Aşıldı', `Bu miktar mevcut kredi limitini aşıyor. Şu an alabileceğin en yüksek tutar: ${fmtMoney(outcome.limit)}`)],
            flags: MessageFlags.Ephemeral
        });
    }

    const ratePct = (outcome.rate * 100).toFixed(1);
    const embed = createEmbed('success', '💳 Kredi Onaylandı',
        `Tamamdır, ${fmtMoney(outcome.principal)} kredi cüzdanına yatırıldı.`)
        .addFields(
            { name: 'Geri Ödenecek Toplam', value: fmtMoney(outcome.totalDue), inline: true },
            { name: 'Faiz Oranı', value: `**%${ratePct}**`, inline: true },
            { name: 'Vade', value: outcome.term.label, inline: true },
            { name: 'Son Ödeme', value: formatDateTime(outcome.dueAt), inline: false },
            { name: 'Kredi Numarası', value: `**#${outcome.loanId}**`, inline: true }
        )
        .setFooter({ text: 'Borcunu zamanında ödersen kredi puanın yükselir.' });
    return interaction.reply({ embeds: [embed] });
}

// ================== [ /kredi ode ] ==================
async function handleOde(interaction) {
    const loanId = interaction.options.getInteger('kredi');
    const requested = interaction.options.getInteger('miktar');

    if (!Number.isFinite(loanId) || loanId <= 0) {
        return interaction.reply({
            embeds: [createEmbed('error', '❌ Geçersiz Kredi', 'Geçerli bir kredi numarası yaz.')],
            flags: MessageFlags.Ephemeral
        });
    }
    if (!Number.isFinite(requested) || requested <= 0) {
        return interaction.reply({
            embeds: [createEmbed('error', '❌ Geçersiz Miktar', 'Ödeme miktarı sıfırdan büyük olmalı.')],
            flags: MessageFlags.Ephemeral
        });
    }

    const outcome = await withTx(async (db) => {
        const u = await ensureUser(interaction.user.id, db);
        const loan = await getLoanByIdForUpdate(loanId, interaction.user.id, db);
        if (!loan) return { kind: 'not_found' };
        if (loan.status === 'paid') return { kind: 'already_paid' };
        if (loan.status === 'defaulted') return { kind: 'defaulted' };

        const remaining = Number(loan.remaining) || 0;
        if (remaining <= 0) return { kind: 'already_paid' };

        const wallet = Number(u.wallet) || 0;
        // Kullanıcı kalan borçtan fazla istediyse otomatik tavanla.
        const payable = Math.min(Math.floor(requested), remaining);
        if (payable <= 0) return { kind: 'invalid_amount' };
        if (wallet < payable) return { kind: 'no_money' };

        // Cüzdandan düş, krediyi azalt
        await db.query(
            `UPDATE economy_users SET wallet = wallet - $1, total_repaid = total_repaid + $1 WHERE user_id = $2`,
            [payable, interaction.user.id]
        );
        await payLoan(loanId, interaction.user.id, payable, db);

        const newRemaining = remaining - payable;
        let scoreDelta = 0;
        let closed = false;
        if (newRemaining <= 0) {
            await markLoanPaid(loanId, interaction.user.id, db);
            scoreDelta = calculateCreditScoreChange('loan_paid_full');
            closed = true;
        } else {
            scoreDelta = calculateCreditScoreChange('loan_partial');
        }
        if (scoreDelta !== 0) {
            await updateCreditScore(interaction.user.id, scoreDelta, db);
        }
        await logTransaction(interaction.user.id, null, 'loan_pay', payable,
            `Kredi ödeme — #${loanId}${closed ? ' (kapandı)' : ''}`, db);

        return { kind: 'ok', paid: payable, remaining: newRemaining, closed, scoreDelta };
    });

    if (outcome.kind === 'not_found') {
        return interaction.reply({
            embeds: [createEmbed('error', '❌ Bulunamadı', 'Bu kredi sana ait değil veya numara yanlış.')],
            flags: MessageFlags.Ephemeral
        });
    }
    if (outcome.kind === 'invalid_amount') {
        return interaction.reply({
            embeds: [createEmbed('error', '❌ Geçersiz Miktar', 'Ödeme miktarı sıfırdan büyük olmalı.')],
            flags: MessageFlags.Ephemeral
        });
    }
    if (outcome.kind === 'already_paid') {
        return interaction.reply({
            embeds: [createEmbed('info', '💳 Kredi', 'Bu kredi zaten kapanmış.')],
            flags: MessageFlags.Ephemeral
        });
    }
    if (outcome.kind === 'defaulted') {
        return interaction.reply({
            embeds: [createEmbed('error', '💳 Kredi', 'Bu kredi karşılıksız olarak işaretlenmiş.')],
            flags: MessageFlags.Ephemeral
        });
    }
    if (outcome.kind === 'no_money') {
        return interaction.reply({
            embeds: [createEmbed('error', '❌ Yetersiz Bakiye', 'Cüzdanında bu ödeme için yeterli MetaCoin yok.')],
            flags: MessageFlags.Ephemeral
        });
    }

    if (outcome.closed) {
        const embed = createEmbed('success', '✅ Borç Kapandı', `Borç kapandı. Kredi puanın **+${outcome.scoreDelta}** yükseldi.`)
            .addFields({ name: 'Bu Ödeme', value: fmtMoney(outcome.paid), inline: true });
        return interaction.reply({ embeds: [embed] });
    }

    const embed = createEmbed('success', '💳 Ödeme Alındı', `Ödeme alındı. Kalan borcun: ${fmtMoney(outcome.remaining)}`)
        .addFields(
            { name: 'Bu Ödeme', value: fmtMoney(outcome.paid), inline: true },
            { name: 'Kredi Numarası', value: `**#${interaction.options.getInteger('kredi')}**`, inline: true }
        );
    return interaction.reply({ embeds: [embed] });
}

// ================== [ /kredi listele ] ==================
async function handleListele(interaction) {
    await ensureUser(interaction.user.id);
    const loans = await getUserLoans(interaction.user.id, 5);

    if (!loans.length) {
        return interaction.reply({
            embeds: [createEmbed('info', '💳 Kredilerin', 'Henüz hiç kredi çekmemişsin.')]
        });
    }

    const embed = createEmbed('info', `💳 ${interaction.user.username} — Son Kredilerin`,
        'En fazla son 5 kredin görünüyor.');
    for (const loan of loans) {
        const status = getLoanStatusText(loan);
        const lines = [
            `Kalan: ${fmtMoney(loan.remaining)}`,
            `Toplam Borç: ${fmtMoney(loan.total_due)}`,
            `Son Ödeme: ${formatDateTime(loan.due_at)}`,
            `Durum: **${status}**`
        ];
        embed.addFields({ name: `Kredi #${loan.id}`, value: lines.join('\n'), inline: false });
    }
    return interaction.reply({ embeds: [embed] });
}

// ================== [ /kredi puan ] ==================
async function handlePuan(interaction) {
    const u = await ensureUser(interaction.user.id);
    const summary = await getLoanSummary(interaction.user.id);
    const tier = getCreditTier(u.credit_score);

    const totalBorrowed = Number(u.total_borrowed) || 0;
    const totalRepaid = Number(u.total_repaid) || 0;
    const totalLateFees = Number(u.total_late_fees) || 0;

    let yorum;
    if (u.credit_score >= 800)      yorum = 'Puanın çok yüksek. Kredi koşulların oldukça iyi.';
    else if (u.credit_score >= 650) yorum = 'Puanın güvenilir seviyede. Düzenli ödemeyle daha da artırabilirsin.';
    else if (u.credit_score >= 500) yorum = 'Puanın normal seviyede. Borçlarını zamanında kapatırsan limitin artar.';
    else if (u.credit_score >= 350) yorum = 'Puanın düşük. Geciken borçların varsa öncelikle onları kapat.';
    else                             yorum = 'Puanın çok düşük. Şu an yeni kredi alamayabilirsin.';

    const acikBorcText = summary.activeDebt > 0
        ? `${fmtMoney(summary.activeDebt)}${summary.overdueCount > 0 ? ` (gecikmiş: ${summary.overdueCount})` : ''}`
        : 'Yok';

    const embed = createEmbed('info', `📊 ${interaction.user.username} — Kredi Puanı`, yorum)
        .addFields(
            { name: 'Kredi Puanı', value: `**${u.credit_score}** / 1000`, inline: true },
            { name: 'Risk Durumu', value: `**${tier.name}**`, inline: true },
            { name: 'Aktif Kredi', value: `${summary.activeCount} adet`, inline: true },
            { name: 'Toplam Çekilen', value: fmtMoney(totalBorrowed), inline: true },
            { name: 'Toplam Ödenen', value: fmtMoney(totalRepaid), inline: true },
            { name: 'Gecikme Cezası', value: fmtMoney(totalLateFees), inline: true },
            { name: 'Açık Borç', value: acikBorcText, inline: false }
        );
    return interaction.reply({ embeds: [embed] });
}
