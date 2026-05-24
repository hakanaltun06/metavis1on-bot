require('dotenv').config();

module.exports = {
    BOT_TOKEN: process.env.BOT_TOKEN,
    CLIENT_ID: process.env.CLIENT_ID,
    GUILD_ID: process.env.GUILD_ID || null,
    OWNER_ID: process.env.OWNER_ID,
    DATABASE_URL: process.env.DATABASE_URL,
    PORT: process.env.PORT || 3000
};
