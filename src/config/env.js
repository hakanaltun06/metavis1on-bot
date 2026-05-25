require('dotenv').config();

function parseOwnerIds() {
    const ids = new Set();
    const single = (process.env.OWNER_ID || '').trim();
    if (single) ids.add(single);
    const multi = (process.env.OWNER_IDS || '').split(',').map(s => s.trim()).filter(Boolean);
    for (const id of multi) ids.add(id);
    return [...ids];
}

const OWNER_IDS = parseOwnerIds();

module.exports = {
    BOT_TOKEN: process.env.BOT_TOKEN,
    CLIENT_ID: process.env.CLIENT_ID,
    GUILD_ID: process.env.GUILD_ID || null,
    OWNER_ID: process.env.OWNER_ID,
    OWNER_IDS,
    DATABASE_URL: process.env.DATABASE_URL,
    PORT: process.env.PORT || 3000
};
