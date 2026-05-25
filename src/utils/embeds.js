const { EmbedBuilder } = require('discord.js');
const {
    COLOR_SUCCESS,
    COLOR_ERROR,
    COLOR_INFO,
    COLOR_WARNING,
    COLOR_PREMIUM,
    COLOR_BANK,
    COLOR_MARKET,
    COLOR_CREDIT,
    COLOR_ECONOMY,
    COLOR_INFLATION,
    COLOR_ADMIN,
    COLOR_RISK,
    COLOR_REWARD
} = require('./constants');

const EMBED_COLORS = {
    success:   COLOR_SUCCESS,
    error:     COLOR_ERROR,
    info:      COLOR_INFO,
    warn:      COLOR_WARNING,
    premium:   COLOR_PREMIUM,
    bank:      COLOR_BANK,
    market:    COLOR_MARKET,
    credit:    COLOR_CREDIT,
    economy:   COLOR_ECONOMY,
    inflation: COLOR_INFLATION,
    admin:     COLOR_ADMIN,
    risk:      COLOR_RISK,
    reward:    COLOR_REWARD
};

function safeText(value, fallback = '—') {
    if (value == null || value === '') return fallback;
    return String(value);
}

function trimField(value, maxLength = 1024) {
    const text = safeText(value);
    if (text.length <= maxLength) return text;
    return text.slice(0, maxLength - 3) + '…';
}

function safeField(name, value, inline = false) {
    return {
        name: safeText(name, 'Alan'),
        value: trimField(value),
        inline: !!inline
    };
}

function addFieldsSafe(embed, fields) {
    if (!Array.isArray(fields)) return embed;
    for (const f of fields) {
        embed.addFields(safeField(f.name, f.value, f.inline));
    }
    return embed;
}

function addFooterNote(embed, text) {
    if (text) embed.setFooter({ text: String(text) });
    return embed;
}

function createEmbed(type, title, desc = '') {
    const embed = new EmbedBuilder();
    if (title) embed.setTitle(String(title));
    if (desc) embed.setDescription(String(desc));
    const color = EMBED_COLORS[type] || EMBED_COLORS.info;
    embed.setColor(color);
    return embed;
}

function createBankEmbed(title, desc)      { return createEmbed('bank', title, desc); }
function createMarketEmbed(title, desc)    { return createEmbed('market', title, desc); }
function createCreditEmbed(title, desc)    { return createEmbed('credit', title, desc); }
function createEconomyEmbed(title, desc)   { return createEmbed('economy', title, desc); }
function createInflationEmbed(title, desc) { return createEmbed('inflation', title, desc); }
function createAdminEmbed(title, desc)     { return createEmbed('admin', title, desc); }
function createRiskEmbed(title, desc)      { return createEmbed('risk', title, desc); }
function createRewardEmbed(title, desc)    { return createEmbed('reward', title, desc); }
function createSuccessEmbed(title, desc)   { return createEmbed('success', title, desc); }
function createErrorEmbed(title, desc)     { return createEmbed('error', title, desc); }
function createWarningEmbed(title, desc)   { return createEmbed('warn', title, desc); }
function createInfoEmbed(title, desc)      { return createEmbed('info', title, desc); }

function genericErrorEmbed() {
    return createEmbed('error', '⚠️ Bir Aksilik Oldu', 'Bu komut işlenirken bir sorun çıktı. Biraz sonra tekrar dener misin?');
}

module.exports = {
    createEmbed,
    createBankEmbed,
    createMarketEmbed,
    createCreditEmbed,
    createEconomyEmbed,
    createInflationEmbed,
    createAdminEmbed,
    createRiskEmbed,
    createRewardEmbed,
    createSuccessEmbed,
    createErrorEmbed,
    createWarningEmbed,
    createInfoEmbed,
    genericErrorEmbed,
    safeField,
    addFieldsSafe,
    safeText,
    trimField,
    addFooterNote
};
