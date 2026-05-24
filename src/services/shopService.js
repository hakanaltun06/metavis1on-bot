const { SHOP_ITEMS } = require('../utils/constants');

function findItem(itemId) {
    if (!itemId) return undefined;
    return SHOP_ITEMS.find(i => i.id === itemId.toLowerCase());
}

function findItemById(itemId) {
    return SHOP_ITEMS.find(i => i.id === itemId);
}

module.exports = { SHOP_ITEMS, findItem, findItemById };
