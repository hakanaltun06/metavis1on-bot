const { CURRENCY, CURRENCY_NAME } = require('./constants');

const formatNumber = (num) => Intl.NumberFormat('en-US', { notation: 'compact', compactDisplay: 'short' }).format(num);
const formatFull = (num) => new Intl.NumberFormat('tr-TR').format(num);

const fmtMoney = (n) => `**${formatFull(n)} ${CURRENCY_NAME}** ${CURRENCY}`;
const fmtMoneyShort = (n) => `**${formatNumber(n)} ${CURRENCY_NAME}** ${CURRENCY}`;

const formatDateTime = (date) => {
    if (!date) return null;
    return new Date(date).toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' });
};

const formatDate = (date) => {
    if (!date) return null;
    return new Date(date).toLocaleDateString('tr-TR');
};

module.exports = { formatNumber, formatFull, fmtMoney, fmtMoneyShort, formatDateTime, formatDate };
