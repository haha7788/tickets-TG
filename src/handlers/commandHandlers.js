const { Markup } = require('telegraf');
const config = require('../config');
const { USER_STATE, REPLY_MAP, activeUsers, blockIfTimeout, getTimeoutStatus } = require('../utils/stateUtils');
const { getTickets, getUsers, registerOrUpdateUser } = require('../utils/fileUtils');
const { getLocale } = require('../utils/localization');

async function handleStart(ctx) {
  if (ctx.chat.type !== 'private') return;

  const userId = String(ctx.from.id);
  const user = registerOrUpdateUser(userId, {
    first_name: ctx.from.first_name,
    last_name: ctx.from.last_name,
    username: ctx.from.username
  });

  if (!user.language) {
    const locales = getLocale('en');
    await ctx.reply(
      locales.language_select_prompt,
      Markup.inlineKeyboard([
        [Markup.button.callback(locales.language_button_ru, 'set_lang_ru'), Markup.button.callback(locales.language_button_en, 'set_lang_en')]
      ])
    );
    return;
  }

  const locales = getLocale(user.language);
  await ctx.reply(
    locales.start_message,
    {
      parse_mode: 'Markdown',
      ...Markup.keyboard([
        [locales.button_create_ticket],
        [locales.button_my_tickets],
        [locales.button_write_to_ticket]
      ]).resize()
    }
  );
}

function handleCreateTicket(ctx) {
  if (ctx.chat.type !== 'private') return;
  const id = String(ctx.from.id);
  
  if (activeUsers.has(id)) {
    const users = getUsers();
    const user = users[id];
    const locales = getLocale(user?.language || 'en');
    return ctx.reply(locales.create_ticket_active_error);
  }
  activeUsers.add(id);

  const users = getUsers();
  const user = users[id];
  const locales = getLocale(user?.language || 'en');

  ctx.reply(
    locales.create_ticket_prompt,
    Markup.keyboard([[locales.button_cancel]]).resize()
  );
}

function handleCancel(ctx) {
  const id = String(ctx.from.id);
  const wasCreating = activeUsers.delete(id);
  const wasReplying = USER_STATE.has(id);
  USER_STATE.delete(id);
  REPLY_MAP.delete(id);

  const users = getUsers();
  const user = users[id];
  const locales = getLocale(user?.language || 'en');
  
  const replyText = wasCreating || wasReplying ? locales.cancel_success : locales.cancel_nothing_to_cancel;
  ctx.reply(replyText, Markup.keyboard([
    [locales.button_create_ticket],
    [locales.button_my_tickets],
    [locales.button_write_to_ticket]
  ]).resize());
}

function handleWriteToTicket(ctx) {
  const userId = String(ctx.from.id);

  const tickets = Object.values(getTickets()).filter(t => t.user_id === userId && t.status === 'open');
  if (!tickets.length) {
    const users = getUsers();
    const user = users[userId];
    const locales = getLocale(user?.language || 'en');
    return ctx.reply(locales.write_to_ticket_no_open, Markup.keyboard([
      [locales.button_create_ticket],
      [locales.button_my_tickets],
      [locales.button_write_to_ticket]
    ]).resize());
  }
  if (tickets.length === 1) {
    USER_STATE.set(userId, { action: 'reply', ticketId: tickets[0].id });
    const users = getUsers();
    const user = users[userId];
    const locales = getLocale(user?.language || 'en');
    return ctx.reply(locales.write_to_ticket_prompt, Markup.keyboard([['❌ Отменить']]).resize());
  }

  const users = getUsers();
  const user = users[userId];
  const locales = getLocale(user?.language || 'en');
  const buttons = tickets.map(t => [Markup.button.callback(`${locales.my_tickets_button_open.replace('${t.id}', t.id)}`, `select_reply_${t.id}`)]);
  ctx.reply(locales.write_to_ticket_select, Markup.inlineKeyboard(buttons));
}

async function handleMyTickets(ctx) {
  if (ctx.chat.type !== 'private') return;
  const userId = String(ctx.from.id);
  const tickets = Object.values(getTickets()).filter(t => t.user_id === userId);

  if (!tickets.length) {
    const users = getUsers();
    const user = users[userId];
    const locales = getLocale(user?.language || 'en');
    return ctx.reply(locales.my_tickets_no_tickets, Markup.keyboard([
      [locales.button_create_ticket],
      [locales.button_my_tickets],
      [locales.button_write_to_ticket]
    ]).resize());
  }

  const openTickets = tickets.filter(t => t.status === 'open');
  const closedTickets = tickets.filter(t => t.status === 'closed');

  const users = getUsers();
  const user = users[userId];
  const locales = getLocale(user?.language || 'en');

  await ctx.reply(locales.my_tickets_summary.replace('${tickets.length}', tickets.length).replace('${openTickets.length}', openTickets.length).replace('${closedTickets.length}', closedTickets.length), Markup.inlineKeyboard([
    ...openTickets.map(t => [Markup.button.callback(locales.my_tickets_button_open.replace('${t.id}', t.id), `view_ticket_${t.id}`)]),
    ...closedTickets.map(t => [Markup.button.callback(locales.my_tickets_button_closed.replace('${t.id}', t.id), `view_ticket_${t.id}`)])
  ]));
}

async function handleAdminCommand(ctx) {
  const chatId = ctx.chat.id;
  const userId = String(ctx.from.id);
  const isAdmin = config.ADMIN_IDS.includes(userId);
  const isMainAdmin = config.MAIN_ADMIN_ID.includes(userId);

  if (chatId === config.SUPPORT_GROUP_ID && !ctx.message.is_topic_message && isAdmin) {
    const tickets = Object.values(getTickets());
    const users = Object.keys(getUsers());
    const openTickets = tickets.filter(t => t.status === 'open').length;
    const activeUsersCount = activeUsers.size;
    const timeoutStatus = getTimeoutStatus() ? '✅ Включен' : '❌ Выключен';
    
    const statusMessage = `👮 Админ-панель\n\n` +
      `📊 Статистика:\n` +
      `🎫 Активных тикетов: ${openTickets}\n` + 
      `👥 Всего пользователей: ${users.length}\n` +
      `🔄 Активных сессий: ${activeUsersCount}\n` +
      `⏸ Статус таймаута: ${timeoutStatus}\n\n` +
      `${new Date().toLocaleString('ru-RU')}`;
    
    const buttons = [
      [Markup.button.callback('📂 Все тикеты', 'admin_tickets')],
      [Markup.button.callback('👥 Управление пользователями', 'admin_users')],
      [Markup.button.callback('🔍 Поиск тикета', 'admin_search_ticket')],
      [Markup.button.callback('🔍 Поиск пользователя', 'admin_search_user')],
      [Markup.button.callback('⏸ Таймаут-режим', 'admin_timeout')]
    ];

    await ctx.reply(statusMessage, Markup.inlineKeyboard(buttons));
  }
}

async function handleLanguageCommand(ctx) {
  if (ctx.chat.type !== 'private') return;

  const locales = getLocale('en');
  return ctx.reply(
    locales.language_select_prompt,
    Markup.inlineKeyboard([
      [Markup.button.callback(locales.language_button_ru, 'set_lang_ru'), Markup.button.callback(locales.language_button_en, 'set_lang_en')]
    ])
  );
}

module.exports = {
  handleStart,
  handleCreateTicket,
  handleCancel,
  handleWriteToTicket,
  handleMyTickets,
  handleAdminCommand,
  handleLanguageCommand,
  blockIfTimeout
}; 