// Kritik admin işlemleri için Discord button tabanlı onay akışı.
// 8.15 /admin komutları ve sonrasında kullanılacak altyapı.
// Yetki kontrolü (requireOwner) komut tarafında yapılır; bu helper sadece onay akışını yönetir.

const { MessageFlags, ButtonBuilder, ButtonStyle, ActionRowBuilder } = require('discord.js');
const { createEmbed } = require('./embeds');

const CONFIRM_TIMEOUT_MS = 120_000; // 2 dakika

// ==================[ EMBED ]==================

function buildAdminConfirmEmbed(options = {}) {
    const {
        title      = '⚠️ İşlem Onayı',
        description = 'Bu işlemi onaylıyor musun?',
        target      = null,
        targetKey   = null,
        oldValue    = null,
        newValue    = null,
        reason      = null,
        riskLevel   = 'normal', // 'normal' | 'high'
    } = options;

    const embed = createEmbed('warn', title, description);

    if (target)            embed.addFields({ name: '🎯 Hedef',      value: String(target),    inline: true });
    if (targetKey)         embed.addFields({ name: '🔑 Ayar',       value: `\`${targetKey}\``, inline: true });
    if (oldValue !== null) embed.addFields({ name: '📤 Eski Değer', value: String(oldValue),  inline: true });
    if (newValue !== null) embed.addFields({ name: '📥 Yeni Değer', value: String(newValue),  inline: true });
    if (reason)            embed.addFields({ name: '📝 Sebep',      value: String(reason),    inline: false });

    const riskLine = riskLevel === 'high'
        ? '🔴 **Yüksek risk** — Bu işlem ekonomiyi doğrudan etkiler.'
        : '📋 Bu işlem loglanacak.';

    embed.addFields({ name: 'ℹ️ Bilgi', value: riskLine, inline: false });
    embed.setFooter({
        text: `${Math.floor(CONFIRM_TIMEOUT_MS / 1000)} saniye içinde yanıtlanmazsa iptal edilir.`
    });

    return embed;
}

// ==================[ BUTONLAR ]==================

function buildAdminConfirmButtons(interactionId) {
    const yes = new ButtonBuilder()
        .setCustomId(`admin_confirm:yes:${interactionId}`)
        .setLabel('✅ Onayla')
        .setStyle(ButtonStyle.Danger);

    const no = new ButtonBuilder()
        .setCustomId(`admin_confirm:no:${interactionId}`)
        .setLabel('❌ İptal Et')
        .setStyle(ButtonStyle.Secondary);

    return new ActionRowBuilder().addComponents(yes, no);
}

function disableAdminConfirmButtons(row) {
    const newRow = new ActionRowBuilder();
    newRow.addComponents(
        row.components.map(btn => ButtonBuilder.from(btn.toJSON()).setDisabled(true))
    );
    return newRow;
}

// ==================[ ONAY AKIŞI ]==================

// interaction: admin Discord interaction
// options: buildAdminConfirmEmbed'e geçirilecek seçenekler
// Döndürür: Promise<boolean> — true: onaylandı, false: iptal / timeout
async function awaitAdminConfirmation(interaction, options = {}) {
    const embed = buildAdminConfirmEmbed(options);
    const row   = buildAdminConfirmButtons(interaction.id);

    let message;
    try {
        if (interaction.deferred || interaction.replied) {
            message = await interaction.followUp({
                embeds:     [embed],
                components: [row],
                flags:      MessageFlags.Ephemeral,
                fetchReply: true
            });
        } else {
            message = await interaction.reply({
                embeds:     [embed],
                components: [row],
                flags:      MessageFlags.Ephemeral,
                fetchReply: true
            });
        }
    } catch (err) {
        console.error('adminConfirmation mesaj gönderilemedi:', err && err.message ? err.message : err);
        return false;
    }

    return new Promise((resolve) => {
        const collector = message.createMessageComponentCollector({
            time:   CONFIRM_TIMEOUT_MS,
            filter: i =>
                i.customId.startsWith('admin_confirm:') &&
                i.customId.endsWith(`:${interaction.id}`)
        });

        collector.on('collect', async (btn) => {
            if (btn.user.id !== interaction.user.id) {
                try {
                    await btn.reply({
                        content: 'Bu onay menüsü sana ait değil.',
                        flags:   MessageFlags.Ephemeral
                    });
                } catch {}
                return;
            }

            const confirmed = btn.customId.split(':')[1] === 'yes';
            collector.stop('user_choice');

            try {
                await btn.update({
                    embeds:     [embed],
                    components: [disableAdminConfirmButtons(row)]
                });
            } catch {}

            resolve(confirmed);
        });

        collector.on('end', async (_, reason) => {
            if (reason !== 'user_choice') {
                try {
                    await message.edit({ components: [disableAdminConfirmButtons(row)] });
                } catch {}
                resolve(false);
            }
        });
    });
}

module.exports = {
    buildAdminConfirmEmbed,
    buildAdminConfirmButtons,
    disableAdminConfirmButtons,
    awaitAdminConfirmation,
    CONFIRM_TIMEOUT_MS,
};
