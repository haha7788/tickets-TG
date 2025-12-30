require('dotenv').config();

module.exports = {
    BOT_TOKEN: process.env.SUPPORT_BOT_TOKEN,
    SUPPORT_GROUP_ID: Number(process.env.SUPPORT_GROUP_ID),
    GENERAL_TOPIC_ID: Number(process.env.SUPPORT_GENERAL_TOPIC_ID),
    ADMIN_IDS: process.env.SUPPORT_ADMIN_IDS.split(','),
    MAIN_ADMIN_ID: process.env.SUPPORT_MAIN_ADMIN_IDS.split(','),
    TICKETS_PATH: process.env.SUPPORT_TICKETS_PATH,
    USERS_PATH: process.env.SUPPORT_USERS_PATH,
    LOG_PATH: process.env.SUPPORT_LOG_PATH,
    MEDIA_DIR: process.env.SUPPORT_MEDIA_DIR,
};