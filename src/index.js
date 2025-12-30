const { Telegraf } = require('telegraf');
const fs = require('fs');
const path = require('path');
const config = require('./config');
const { logEvent } = require('./utils/logger');
const { loadLocales, getLocale } = require('./utils/localization');
const { localeMiddleware, userTrackingMiddleware } = require('./middleware');

const {
  handleStart,
  handleCreateTicket,
  handleCancel,
  handleWriteToTicket,
  handleMyTickets,
  handleAdminCommand,
  handleLanguageCommand,
  blockIfTimeout
} = require('./handlers/commandHandlers');

const { registerMessageHandlers } = require('./handlers/messageHandlers');
const { registerCallbackHandlers } = require('./handlers/callbackHandlers');

const bot = new Telegraf(config.BOT_TOKEN);

loadLocales();

const enLocales = getLocale('en');
const ruLocales = getLocale('ru');

const createTicketButtons = [enLocales.button_create_ticket, ruLocales.button_create_ticket];
const cancelButtons = [enLocales.button_cancel, ruLocales.button_cancel];
const writeToTicketButtons = [enLocales.button_write_to_ticket, ruLocales.button_write_to_ticket];
const myTicketsButtons = [enLocales.button_my_tickets, ruLocales.button_my_tickets];

const dataDir = path.join(__dirname, '../data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

if (!fs.existsSync(config.MEDIA_DIR)) {
  fs.mkdirSync(config.MEDIA_DIR, { recursive: true });
}

logEvent('bot_init', {
  SUPPORT_GROUP_ID: config.SUPPORT_GROUP_ID,
  ADMIN_COUNT: config.ADMIN_IDS.length
});

bot.use(localeMiddleware);
bot.use(userTrackingMiddleware);

bot.start(handleStart);
bot.command('lang', handleLanguageCommand);
bot.hears(createTicketButtons, blockIfTimeout, handleCreateTicket);
bot.hears(cancelButtons, handleCancel);
bot.hears(writeToTicketButtons, blockIfTimeout, handleWriteToTicket);
bot.hears(myTicketsButtons, handleMyTickets);

bot.hears('/admin', handleAdminCommand);

registerCallbackHandlers(bot);

registerMessageHandlers(bot);

bot.launch();

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
