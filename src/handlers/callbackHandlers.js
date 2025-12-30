const { Markup } = require('telegraf');
const config = require('../config');
const { USER_STATE, toggleTimeout, activeUsers, getTimeoutStatus, checkAndSetCooldown } = require('../utils/stateUtils');
const { getTickets, saveTickets, getUsers, saveUsers, findTicket, saveFileLocally } = require('../utils/fileUtils');
const path = require('path');
const fs = require('fs');
const { handleStart } = require('./commandHandlers');
const { getLocale } = require('../utils/localization');
const { logEvent } = require('../utils/logger');
const { formatLifetime, closeTicketCommon } = require('../helpers/ticketHelper');

async function handleSelectReply(ctx, ticketId) {
  await ctx.answerCbQuery();
  const userId = String(ctx.from.id);
  logEvent('handleSelectReply_called', { ticketId, userId }, 'INFO');
  const ticket = findTicket(ticketId);
  if (!ticket) {
    logEvent('handleSelectReply_ticket_not_found', { ticketId }, 'WARN');
    return ctx.reply(ctx.locales.ticket_not_found_user);
  }
  if (ticket.user_id !== userId) {
    logEvent('handleSelectReply_user_mismatch', { ticketUserId: ticket.user_id, userId }, 'WARN');
    return ctx.reply(ctx.locales.ticket_cannot_write);
  }
  if (ticket.status !== 'open') {
    logEvent('handleSelectReply_ticket_not_open', { ticketId, status: ticket.status }, 'WARN');
    return ctx.reply(ctx.locales.ticket_cannot_write);
  }

  USER_STATE.set(userId, { action: 'reply', ticketId });
  ctx.reply(ctx.locales.write_to_ticket_prompt, Markup.keyboard([[ctx.locales.button_cancel]]).resize());
}

async function handleViewTicket(ctx, ticketId) {
  await ctx.answerCbQuery();
  logEvent('handleViewTicket_called', { ticketId }, 'INFO');
  const ticket = findTicket(ticketId);
  if (!ticket) {
    logEvent('handleViewTicket_ticket_not_found', { ticketId }, 'WARN');
    return ctx.reply(ctx.locales.ticket_not_found_user);
  }

  await ctx.reply(`${ctx.locales.ticket_info_header}${ticket.id}\n${ctx.locales.status_label} ${ticket.status}`);

  const mediaFolder = path.join(config.MEDIA_DIR, ticket.id);
  if (!fs.existsSync(mediaFolder)) fs.mkdirSync(mediaFolder, { recursive: true });

  for (let i = 0; i < ticket.history.length; i++) {
    const h = ticket.history[i];
    const role = h.from === 'user' ? ctx.locales.role_user : h.from === 'support' ? ctx.locales.role_support : ctx.locales.role_system;
    const filename = `${ticket.id}_${i}`;
    const filepath = path.join(mediaFolder, `${filename}.${h.file_type === 'photo' ? 'jpg' : 'bin'}`);

    if (h.file_id && h.file_type) {
      if (h.file_type === 'photo') {
        await ctx.telegram.sendPhoto(ctx.chat.id, h.file_id, { caption: `${role} ${h.content}` });
      } else if (h.file_type === 'document') {
        await ctx.telegram.sendDocument(ctx.chat.id, h.file_id, { caption: `${role} ${h.content}` });
      }
    } else {
      await ctx.reply(`${role} ${h.content}`);
    }
  }

  if (ticket.status === 'open') {
    await ctx.reply(ctx.locales.close_ticket_prompt, Markup.inlineKeyboard([
      [Markup.button.callback(ctx.locales.button_close_ticket, `close_ticket_${ticket.id}`)]
    ]));
  }
}

async function handleCloseTicket(ctx, ticketId) {
  await ctx.answerCbQuery();
  const ticket = findTicket(ticketId);

  if (!ticket) {
    logEvent('ticket_close_failed', {
      reason: 'ticket_not_found',
      ticketId,
      userId: String(ctx.from.id)
    }, 'WARN');
    return ctx.reply('❗ Тикет не найден.');
  }

  logEvent('ticket_closed_by_user', {
    ticketId: ticket.id,
    userId: ticket.user_id
  }, 'INFO');

  await closeTicketCommon(ticket, ctx.telegram, ctx.locales, 'user');
}

async function handleAdminOpenTickets(ctx) {
  await ctx.answerCbQuery();
  const tickets = getTickets();
  const open = Object.values(tickets).filter(t => t.status === 'open');

  if (open.length === 0) {
    return ctx.editMessageText('📭 Открытых тикетов пока нет.',
      Markup.inlineKeyboard([[Markup.button.callback('⬅️ Назад', 'admin_tickets')]])
    );
  }

  open.sort((a, b) => {
    const aLastUpdate = a.history.length > 0 ? a.history[a.history.length - 1].time : a.created || 0;
    const bLastUpdate = b.history.length > 0 ? b.history[b.history.length - 1].time : b.created || 0;
    return bLastUpdate - aLastUpdate;
  });

  const recentOpen = open.slice(0, 15);
  let message = `🟢 Открытые тикеты (${open.length})\n\n`;

  recentOpen.forEach((t, i) => {
    const lastActivityTime = t.history.length > 0 ?
      new Date(t.history[t.history.length - 1].time).toLocaleDateString('ru-RU') :
      'Нет сообщений';
    const messageCount = t.history.length;

    message += `${i + 1}. #${t.id} | ${lastActivityTime} | ${t.username?.slice(0, 20) || 'Неизвестно'} | ${messageCount} сообщ.\n`;
  });

  const buttons = [];
  const buttonsPerRow = 3;
  const rows = Math.ceil(Math.min(recentOpen.length, 15) / buttonsPerRow);

  for (let i = 0; i < rows; i++) {
    const rowButtons = [];
    for (let j = 0; j < buttonsPerRow; j++) {
      const index = i * buttonsPerRow + j;
      if (index < recentOpen.length) {
        rowButtons.push(Markup.button.url(
          `🟢 #${recentOpen[index].id}`,
          `https://t.me/c/${String(config.SUPPORT_GROUP_ID).replace('-100', '')}/${recentOpen[index].topic_id}`
        ));
      }
    }
    buttons.push(rowButtons);
  }

  buttons.push([Markup.button.callback('⬅️ Назад', 'admin_tickets')]);
  return ctx.editMessageText(message, Markup.inlineKeyboard(buttons));
}

async function handleClose(ctx, ticketId) {
  await ctx.answerCbQuery();
  logEvent('handleClose_called', { ticketId }, 'INFO');
  const ticket = findTicket(ticketId);
  if (!ticket) {
    logEvent('handleClose_ticket_not_found', { ticketId }, 'WARN');
    return;
  }

  await closeTicketCommon(ticket, ctx.telegram, ctx.locales, 'user');
}

async function handleAdminTickets(ctx) {
  await ctx.answerCbQuery();
  const tickets = getTickets();
  const ticketList = Object.values(tickets);
  const open = ticketList.filter(t => t.status === 'open');
  const closed = ticketList.filter(t => t.status === 'closed');

  if (ticketList.length === 0) {
    return ctx.editMessageText('📭 Тикетов пока нет.',
      Markup.inlineKeyboard([[Markup.button.callback('⬅️ Назад', 'admin_back')]])
    );
  }

  open.sort((a, b) => {
    const aLastUpdate = a.history.length > 0 ? a.history[a.history.length - 1].time : a.created || 0;
    const bLastUpdate = b.history.length > 0 ? b.history[b.history.length - 1].time : b.created || 0;
    return bLastUpdate - aLastUpdate;
  });

  closed.sort((a, b) => {
    const aLastUpdate = a.history.length > 0 ? a.history[a.history.length - 1].time : a.created || 0;
    const bLastUpdate = b.history.length > 0 ? b.history[b.history.length - 1].time : b.created || 0;
    return bLastUpdate - aLastUpdate;
  });

  const recentOpen = open.slice(0, 10);
  const recentClosed = closed.slice(0, 5);
  let message = `📊 Статистика тикетов:\n` +
    `🟢 Открытых: ${open.length}\n` +
    `🔒 Закрытых: ${closed.length}\n` +
    `📋 Всего: ${ticketList.length}\n\n`;

  if (recentOpen.length > 0) {
    message += '🟢 Последние открытые тикеты:\n';
    recentOpen.forEach(t => {
      const lastActivityTime = t.history.length > 0 ?
        new Date(t.history[t.history.length - 1].time).toLocaleDateString('ru-RU') :
        'Нет сообщений';
      message += `- #${t.id} | ${lastActivityTime} | ${t.username?.slice(0, 20) || 'Неизвестно'}\n`;
    });
  }

  if (recentClosed.length > 0) {
    message += '\n🔒 Последние закрытые тикеты:\n';
    recentClosed.forEach(t => {
      const lastActivityTime = t.history.length > 0 ?
        new Date(t.history[t.history.length - 1].time).toLocaleDateString('ru-RU') :
        'Нет сообщений';
      message += `- #${t.id} | ${lastActivityTime} | ${t.username?.slice(0, 20) || 'Неизвестно'}\n`;
    });
  }

  const buttons = [];

  buttons.push([Markup.button.callback('🟢 Все открытые тикеты', 'admin_open_tickets')]);
  buttons.push([Markup.button.callback('📊 Все закрытые тикеты', 'admin_closed_tickets')]);
  buttons.push([Markup.button.callback('🔍 Поиск по тикетам', 'admin_search_ticket')]);
  buttons.push([Markup.button.callback('⬅️ Назад', 'admin_back')]);

  return ctx.editMessageText(message, Markup.inlineKeyboard(buttons));
}

async function handleAdminClosedTickets(ctx) {
  await ctx.answerCbQuery();
  const tickets = getTickets();
  const closed = Object.values(tickets).filter(t => t.status === 'closed');

  if (closed.length === 0) {
    return ctx.editMessageText('📭 Закрытых тикетов пока нет.',
      Markup.inlineKeyboard([[Markup.button.callback('⬅️ Назад', 'admin_tickets')]])
    );
  }

  closed.sort((a, b) => {
    const aLastUpdate = a.history.length > 0 ? a.history[a.history.length - 1].time : a.created || 0;
    const bLastUpdate = b.history.length > 0 ? b.history[b.history.length - 1].time : b.created || 0;
    return bLastUpdate - aLastUpdate;
  });

  const recentClosed = closed.slice(0, 15);
  let message = `🔒 Закрытые тикеты (${closed.length})\n\n`;

  recentClosed.forEach((t, i) => {
    const lastActivityTime = t.history.length > 0 ?
      new Date(t.history[t.history.length - 1].time).toLocaleDateString('ru-RU') :
      'Нет сообщений';
    const messageCount = t.history.length;
    message += `${i + 1}. #${t.id} | ${lastActivityTime} | ${t.username?.slice(0, 20) || 'Неизвестно'} | ${messageCount} сообщ.\n`;
  });

  const buttons = [];
  const buttonsPerRow = 3;
  const rows = Math.ceil(Math.min(recentClosed.length, 15) / buttonsPerRow);

  for (let i = 0; i < rows; i++) {
    const rowButtons = [];
    for (let j = 0; j < buttonsPerRow; j++) {
      const index = i * buttonsPerRow + j;
      if (index < recentClosed.length) {
        const ticket = recentClosed[index];
        rowButtons.push(Markup.button.callback(`🔒 #${ticket.id}`, `view_ticket_admin_${ticket.id}`));
      }
    }
    buttons.push(rowButtons);
  }

  buttons.push([Markup.button.callback('⬅️ Назад', 'admin_tickets')]);
  return ctx.editMessageText(message, Markup.inlineKeyboard(buttons));
}

async function handleAdminTimeout(ctx) {
  await ctx.answerCbQuery();
  const newState = toggleTimeout();
  const tickets = Object.values(getTickets());
  const users = Object.keys(getUsers());
  const openTickets = tickets.filter(t => t.status === 'open').length;
  const activeUsersCount = activeUsers.size;
  const timeoutStatus = newState ? '✅ Включен' : '❌ Выключен';

  const statusMessage = `👮 Админ-панель\n\n` +
    `⏸ Таймаут-режим ${newState ? 'включен' : 'выключен'}!\n\n` +
    `📊 Статистика:\n` +
    `🎫 Активных тикетов: ${openTickets}\n` +
    `👥 Всего пользователей: ${users.length}\n` +
    `🔄 Активных сессий: ${activeUsersCount}\n` +
    `⏸ Статус таймаута: ${timeoutStatus}\n\n` +
    `${new Date().toLocaleString('ru-RU')}`;

  await ctx.editMessageText(statusMessage, Markup.inlineKeyboard([
    [Markup.button.callback('⬅️ Назад', 'admin_back')]
  ]));
}

async function handleAdminUsers(ctx) {
  await ctx.answerCbQuery();
  const users = getUsers();
  const userIds = Object.keys(users);

  if (userIds.length === 0) {
    return ctx.editMessageText('👥 Пользователей пока нет.',
      Markup.inlineKeyboard([[Markup.button.callback('⬅️ Назад', 'admin_back')]])
    );
  }

  const sortedUsers = userIds
    .map(id => ({
      id,
      ...users[id],
      lastActivity: users[id].lastActivity || 0
    }))
    .sort((a, b) => b.lastActivity - a.lastActivity);

  const recentUsers = sortedUsers.slice(0, 10);
  let message = `📊 Статистика пользователей:\n` +
    `👥 Всего пользователей: ${userIds.length}\n` +
    `🚫 Забаненных: ${userIds.filter(id => users[id].banned).length}\n\n` +
    `👥 Последние активные пользователи:\n`;

  recentUsers.forEach(user => {
    const lastActivity = user.lastActivity ?
      new Date(user.lastActivity).toLocaleDateString('ru-RU') : 'Неизвестно';
    message += `- ${user.banned ? '🚫' : '👤'} ${user.username || `ID: ${user.id}`} ${user.ticketCount ? `(${user.ticketCount} тикетов)` : ''} | ${lastActivity}\n`;
  });

  const userButtons = recentUsers.slice(0, 5).map(user => [
    Markup.button.url(
      `${user.banned ? '🚫' : '👤'} ${user.username?.slice(0, 15) || `ID: ${user.id}`}`,
      `tg://user?id=${user.id}`
    ),
    Markup.button.callback(
      '👤 Подробнее',
      `admin_view_user_${user.id}`
    )
  ]);

  const keyboard = [
    ...userButtons,
    [Markup.button.callback('🔍 Найти пользователя', 'admin_search_user')],
    [Markup.button.callback('⬅️ Назад', 'admin_back')]
  ];

  return ctx.editMessageText(message, Markup.inlineKeyboard(keyboard));
}

async function handleAdminViewUser(ctx, userId) {
  if (ctx.answerCbQuery) {
    await ctx.answerCbQuery();
  }

  const tickets = getTickets();
  const users = getUsers();
  const user = users[userId] || { banned: false };

  if (!user) {
    return ctx.editMessageText('❌ Пользователь не найден.',
      Markup.inlineKeyboard([[Markup.button.callback('⬅️ Назад', 'admin_users')]])
    );
  }

  const userTickets = Object.values(tickets).filter(t => t.user_id === userId);
  const openTickets = userTickets.filter(t => t.status === 'open');
  const closedTickets = userTickets.filter(t => t.status === 'closed');

  const registrationDate = user.registrationDate ?
    new Date(user.registrationDate).toLocaleString('ru-RU') : 'Неизвестно';
  const lastActivity = user.lastActivity ?
    new Date(user.lastActivity).toLocaleString('ru-RU') : 'Неизвестно';

  const userInfo = `👤 Информация о пользователе:\n` +
    `🆔 ID: ${userId}\n` +
    `👤 Имя: ${user.username || 'Неизвестно'}\n` +
    `📆 Дата регистрации: ${registrationDate}\n` +
    `⏱ Последняя активность: ${lastActivity}\n` +
    `🎫 Всего тикетов: ${userTickets.length}\n` +
    `🟢 Открытых тикетов: ${openTickets.length}\n` +
    `🔒 Закрытых тикетов: ${closedTickets.length}\n` +
    `⛔ Статус: ${user.banned ? 'Забанен' : 'Активен'}`;

  const reply = ctx.editMessageText || ctx.reply;
  return reply.call(ctx, userInfo, Markup.inlineKeyboard([
    [Markup.button.callback(user.banned ? '✅ Разбанить' : '🚫 Забанить', `admin_toggle_ban_${userId}`)],
    [Markup.button.callback('🎫 Тикеты пользователя', `admin_user_tickets_${userId}`)],
    [Markup.button.callback('⬅️ Назад', 'admin_users')]
  ]));
}

async function handleAdminUserTickets(ctx, userId) {
  await ctx.answerCbQuery();
  const tickets = getTickets();
  const userTickets = Object.values(tickets).filter(t => t.user_id === userId);

  if (userTickets.length === 0) {
    return ctx.editMessageText('📭 У пользователя нет тикетов.',
      Markup.inlineKeyboard([[Markup.button.callback('⬅️ Назад', `admin_view_user_${userId}`)]])
    );
  }

  userTickets.sort((a, b) => {
    const aLastUpdate = a.history.length > 0 ? a.history[a.history.length - 1].time : 0;
    const bLastUpdate = b.history.length > 0 ? b.history[b.history.length - 1].time : 0;
    return bLastUpdate - aLastUpdate;
  });

  const openTickets = userTickets.filter(t => t.status === 'open');
  const closedTickets = userTickets.filter(t => t.status === 'closed');

  let message = `🎫 Тикеты пользователя:\n` +
    `🟢 Открытых: ${openTickets.length}\n` +
    `🔒 Закрытых: ${closedTickets.length}\n` +
    `📋 Всего: ${userTickets.length}\n\n`;

  if (openTickets.length > 0) {
    message += '🟢 Открытые тикеты:\n';
    openTickets.forEach(t => {
      const date = new Date(t.created).toLocaleDateString('ru-RU');
      message += `- #${t.id} - ${date}\n`;
    });
  }

  if (closedTickets.length > 0) {
    message += '\n🔒 Закрытые тикеты (последние 5):\n';
    closedTickets.slice(0, 5).forEach(t => {
      const date = new Date(t.created).toLocaleDateString('ru-RU');
      message += `- #${t.id} - ${date}\n`;
    });
  }

  const buttons = [];
  if (openTickets.length > 0) {
    buttons.push(...openTickets.slice(0, 3).map(ticket => [
      Markup.button.url(
        `🟢 #${ticket.id}`,
        `https://t.me/c/${String(config.SUPPORT_GROUP_ID).replace('-100', '')}/${ticket.topic_id}`
      )
    ]));
  }

  if (closedTickets.length > 0) {
    buttons.push(...closedTickets.slice(0, 3).map(ticket => [
      Markup.button.callback(`🔒 #${ticket.id}`, `view_ticket_admin_${ticket.id}`)
    ]));
  }

  buttons.push([Markup.button.callback('⬅️ Назад', `admin_view_user_${userId}`)]);
  return ctx.editMessageText(message, Markup.inlineKeyboard(buttons));
}

async function handleAdminToggleBan(ctx, userId) {
  await ctx.answerCbQuery();
  const users = getUsers();
  if (!users[userId]) {
    logEvent('admin_toggle_ban_failed', { reason: 'user_not_found', userId }, 'WARN');
    return ctx.editMessageText('❌ Пользователь не найден.');
  }

  if (config.ADMIN_IDS.includes(userId)) {
    logEvent('admin_toggle_ban_failed', { reason: 'cannot_ban_admin', userId }, 'WARN');
    return ctx.editMessageText('❌ Нельзя заблокировать администратора поддержки.');
  }

  const newBannedStatus = !users[userId].banned;
  users[userId].banned = newBannedStatus;
  saveUsers(users);

  logEvent('admin_toggle_ban', { 
    userId, 
    newBannedStatus, 
    adminId: String(ctx.from.id) 
  }, 'INFO');

  return handleAdminViewUser(ctx, userId);
}

async function handleAdminSearchTicket(ctx) {
  await ctx.answerCbQuery();
  USER_STATE.set(String(ctx.from.id), { action: 'search_ticket' });
  await ctx.editMessageText('🔍 Введите ID тикета для поиска (можно с # или без):',
    Markup.inlineKeyboard([[Markup.button.callback('⬅️ Отмена', 'admin_back')]])
  );
}

async function handleAdminSearchUser(ctx) {
  await ctx.answerCbQuery();
  USER_STATE.set(String(ctx.from.id), { action: 'search_user' });
  await ctx.editMessageText('🔍 Введите ID пользователя или @username для поиска:',
    Markup.inlineKeyboard([[Markup.button.callback('⬅️ Отмена', 'admin_back')]])
  );
}

async function handleAdminBack(ctx) {
  await ctx.answerCbQuery();
  USER_STATE.delete(String(ctx.from.id));

  const tickets = Object.values(getTickets());
  const users = Object.keys(getUsers());
  const openTickets = tickets.filter(t => t.status === 'open').length;
  const closedTickets = tickets.filter(t => t.status === 'closed').length;
  const activeUsersCount = activeUsers.size;
  const timeoutStatus = getTimeoutStatus() ? '✅ Включен' : '❌ Выключен';

  const statusMessage = `👮 Админ-панель\n\n` +
    `📊 Статистика:\n` +
    `🎫 Активных тикетов: ${openTickets}\n` +
    `🎫 Закрытых тикетов: ${closedTickets}\n` +
    `👥 Всего пользователей: ${users.length}\n` +
    `🔄 Активных сессий: ${activeUsersCount}\n` +
    `⏸ Статус таймаута: ${timeoutStatus}\n\n` +
    `${new Date().toLocaleString('ru-RU')}`;

  await ctx.editMessageText(statusMessage, Markup.inlineKeyboard([
    [Markup.button.callback('📂 Все тикеты', 'admin_tickets')],
    [Markup.button.callback('👥 Управление пользователями', 'admin_users')],
    [Markup.button.callback('🔍 Поиск тикета', 'admin_search_ticket')],
    [Markup.button.callback('🔍 Поиск пользователя', 'admin_search_user')],
    [Markup.button.callback('⏸ Таймаут-режим', 'admin_timeout')],
  ]));
}

async function handleViewTicketAdmin(ctx, ticketId) {
  try {
    await ctx.answerCbQuery();

    const cleanTicketId = ticketId.replace(/^view_ticket_admin_/, '');

    const ticket = findTicket(cleanTicketId);
    if (!ticket) {
      return ctx.editMessageText(`❗ Тикет #${cleanTicketId} не найден.`,
        Markup.inlineKeyboard([
          [Markup.button.callback('🔍 Искать тикет', 'admin_search_ticket')],
          [Markup.button.callback('⬅️ Назад', 'admin_tickets')]
        ])
      );
    }

    return displayTicketInfo(ctx, ticket, cleanTicketId);
  } catch (error) {
    console.error('Error in view_ticket_admin:', error);
    return ctx.editMessageText(`❗ Ошибка при просмотре тикета: ${error.message}`,
      Markup.inlineKeyboard([[Markup.button.callback('⬅️ Назад', 'admin_tickets')]])
    );
  }
}

async function displayTicketInfo(ctx, ticket, ticketId) {
  try {

    if (!ticket) {
      return ctx.editMessageText(`❗ Тикет #${ticketId} не найден.`,
        Markup.inlineKeyboard([[Markup.button.callback('⬅️ Назад', 'admin_tickets')]])
      );
    }

    const user = getUsers()[ticket.user_id] || { banned: false };
    const createdTime = ticket.created || 0;
    const lastUpdateTime = ticket.history && ticket.history.length > 0 ?
      ticket.history[ticket.history.length - 1].time : createdTime;
    const closedTime = ticket.status === 'closed' ? lastUpdateTime : Date.now();
    const lifeTime = closedTime - createdTime;
    const lifeTimeFormatted = formatLifetime(lifeTime);
    const messageCount = ticket.history ? ticket.history.length : 0;
    const userMessages = ticket.history ? ticket.history.filter(h => h.from === 'user').length : 0;
    const supportMessages = ticket.history ? ticket.history.filter(h => h.from === 'support').length : 0;

    const safeTicketId = String(ticket.id).replace(/^#/, '');
    const ticketInfo = `🎫 Тикет #${safeTicketId}\n` +
      `👤 Пользователь: ${ticket.username || 'Неизвестно'}\n` +
      `🆔 ID пользователя: ${ticket.user_id}\n` +
      `📆 Создан: ${new Date(createdTime).toLocaleString('ru-RU')}\n` +
      `🔄 Обновлен: ${new Date(lastUpdateTime).toLocaleString('ru-RU')}\n` +
      `⏱ Время жизни: ${lifeTimeFormatted}\n` +
      `📝 Сообщений: ${messageCount}\n` +
      `👤 От пользователя: ${userMessages}\n` +
      `👨‍💻 От поддержки: ${supportMessages}\n` +
      `🚦 Статус: ${ticket.status === 'open' ? '🟢 Открыт' : '🔒 Закрыт'}\n` +
      `👤 Статус пользователя: ${user.banned ? '🚫 Забанен' : '✅ Активен'}`;

    const buttons = [];
    if (ticket.status === 'open' && ticket.topic_id) {
      buttons.push([
        Markup.button.url('🔗 Перейти к диалогу',
          `https://t.me/c/${String(config.SUPPORT_GROUP_ID).replace('-100', '')}/${ticket.topic_id}`),
        Markup.button.url('👤 Профиль пользователя', `tg://user?id=${ticket.user_id}`)
      ]);
      buttons.push([Markup.button.callback('🔒 Закрыть тикет', `admin_close_ticket_${safeTicketId}`)]);
    } else {
      buttons.push([
        Markup.button.url('👤 Профиль пользователя', `tg://user?id=${ticket.user_id}`)
      ]);
    }

    buttons.push([Markup.button.callback('👤 Информация о пользователе', `admin_view_user_${ticket.user_id}`)]);
    buttons.push([Markup.button.callback('📝 История сообщений', `admin_ticket_history_${safeTicketId}`)]);
    buttons.push([Markup.button.callback('⬅️ Назад', 'admin_tickets')]);

    const reply = ctx.editMessageText || ctx.reply;
    return reply.call(ctx, ticketInfo, Markup.inlineKeyboard(buttons));
  } catch (error) {
    console.error('Error in displayTicketInfo:', error);
    return ctx.editMessageText(`❗ Ошибка при отображении тикета: ${error.message}`,
      Markup.inlineKeyboard([[Markup.button.callback('⬅️ Назад', 'admin_tickets')]])
    );
  }
}

async function handleAdminTicketHistory(ctx, ticketId) {
  await ctx.answerCbQuery();

  const ticket = findTicket(ticketId);
  if (!ticket) {
    return ctx.editMessageText(`❗ Тикет #${ticketId} не найден.`,
      Markup.inlineKeyboard([[Markup.button.callback('⬅️ Назад', 'admin_tickets')]])
    );
  }

  if (!ticket.history || ticket.history.length === 0) {
    const safeTicketId = String(ticket.id).replace(/^#/, '');
    return ctx.editMessageText('📭 История сообщений пуста.',
      Markup.inlineKeyboard([[Markup.button.callback('⬅️ Назад', `view_ticket_admin_${safeTicketId}`)]])
    );
  }

  return showTicketHistory(ctx, ticket);
}

async function showTicketHistory(ctx, ticket) {
  try {

    if (!ticket.history || ticket.history.length === 0) {
      return ctx.reply('📭 История сообщений пуста.',
        Markup.inlineKeyboard([[Markup.button.callback('⬅️ Назад к тикетам', 'admin_tickets')]])
      );
    }

    const maxMessages = 10;
    const historyToShow = ticket.history.length > maxMessages ?
      ticket.history.slice(ticket.history.length - maxMessages) : ticket.history;
    const safeTicketId = String(ticket.id).replace(/^#/, '');

    await ctx.reply(
      `🎫 Тикет #${safeTicketId}\n\n` +
      (ticket.history.length > maxMessages ?
        `📝 История сообщений (последние ${maxMessages} из ${ticket.history.length}):` :
        '📝 История сообщений:')
    );

    const mediaFolder = path.join(config.MEDIA_DIR, safeTicketId);
    if (!fs.existsSync(mediaFolder)) fs.mkdirSync(mediaFolder, { recursive: true });

    for (let i = 0; i < historyToShow.length; i++) {
      const h = historyToShow[i];
      const author = h.from === 'user' ? '👤 Пользователь' :
        h.from === 'support' ? '👨‍💻 Поддержка' : '⚙️ Система';
      const time = new Date(h.time).toLocaleString('ru-RU');
      const content = h.content.slice(0, 100) + (h.content.length > 100 ? '...' : '');
      const caption = `${author} (${time}):\n${content}`;
      const filename = `${safeTicketId}_${i}`;

      if (h.file_id && h.file_type) {
        if (h.file_type === 'photo') {
          await ctx.telegram.sendPhoto(ctx.chat.id, h.file_id, { caption });
        } else if (h.file_type === 'document') {
          await ctx.telegram.sendDocument(ctx.chat.id, h.file_id, { caption });
        }
      } else {
        await ctx.reply(caption);
      }
    }

    await ctx.reply(
      '⬅️ Назад к тикетам',
      Markup.inlineKeyboard([[Markup.button.callback('⬅️ Назад', 'admin_tickets')]])
    );

    return;
  } catch (error) {
    console.error('Error in showTicketHistory:', error);
    return ctx.reply(
      `❗ Ошибка при отображении истории: ${error.message}`,
      Markup.inlineKeyboard([[Markup.button.callback('⬅️ Назад', 'admin_tickets')]])
    );
  }
}

async function handleAdminCloseTicket(ctx, ticketId) {
  await ctx.answerCbQuery();

  const ticket = findTicket(ticketId);

  if (!ticket) {
    logEvent('admin_ticket_close_failed', {
      reason: 'ticket_not_found',
      ticketId,
      adminId: String(ctx.from.id)
    }, 'WARN');
    return ctx.editMessageText(`❗ Тикет #${ticketId} не найден.`,
      Markup.inlineKeyboard([[Markup.button.callback('⬅️ Назад', 'admin_tickets')]])
    );
  }

  if (ticket.status === 'closed') {
    logEvent('admin_ticket_close_failed', {
      reason: 'already_closed',
      ticketId,
      adminId: String(ctx.from.id)
    }, 'WARN');
    return ctx.editMessageText(`⚠️ Тикет #${ticket.id} уже закрыт.`,
      Markup.inlineKeyboard([
        [Markup.button.callback('👁 Просмотреть тикет', `view_ticket_admin_${ticket.id}`)],
        [Markup.button.callback('⬅️ Назад', 'admin_tickets')]
      ])
    );
  }

  const adminName = ctx.from.username ? `@${ctx.from.username}` :
    `${ctx.from.first_name || ''} ${ctx.from.last_name || ''}`.trim();

  logEvent('admin_ticket_closed', {
    ticketId: ticket.id,
    userId: ticket.user_id,
    adminId: String(ctx.from.id)
  }, 'INFO');

  await closeTicketCommon(ticket, ctx.telegram, ctx.locales, 'admin', adminName);

  return handleViewTicketAdmin(ctx, ticket.id);
}

async function handleConfirmSend(ctx, confirmId) {
  await ctx.answerCbQuery();
  const messageData = global.confirmMessages?.get(confirmId);
  if (!messageData) {
    logEvent('ticket_reply_failed', { 
      reason: 'message_not_found', 
      confirmId,
      adminId: String(ctx.from.id)
    }, 'WARN');
    return ctx.reply('❌ Сообщение не найдено или истекло время ожидания.');
  }

  const tickets = getTickets();
  const ticket = tickets[messageData.ticketId];
  if (!ticket) {
    logEvent('ticket_reply_failed', { 
      reason: 'ticket_not_found', 
      ticketId: messageData.ticketId,
      adminId: String(ctx.from.id)
    }, 'WARN');
    global.confirmMessages?.delete(confirmId);
    return ctx.reply('❌ Тикет не найден.');
  }

  const mediaFolder = path.join(config.MEDIA_DIR, ticket.id);
  if (!fs.existsSync(mediaFolder)) fs.mkdirSync(mediaFolder, { recursive: true });

  let sendResult;
  try {
    logEvent('ticket_reply_sent', { 
      ticketId: ticket.id, 
      userId: messageData.uid,
      adminId: String(ctx.from.id),
      messageType: messageData.messageType,
      contentLength: messageData.content.length
    }, 'INFO');

    const formattedMessage = messageData.ticketIdHeader + 
                             (messageData.replyContentFormatted ? '\n' + messageData.replyContentFormatted : '') + 
                             '\n' + messageData.supportLabel + ' ' + messageData.content;

    let savedFilePath = null;
    if (messageData.file_id) {
      const filename = `${ticket.id}_${ticket.history.length}.${
        messageData.messageType === 'photo' ? 'jpg' : 
        messageData.messageType === 'animation' ? 'gif' : 
        messageData.messageType === 'video' ? 'mp4' : 
        'bin'
      }`;
      savedFilePath = path.join(mediaFolder, filename);
      
      if (ctx.telegram && ctx.telegram.getFile) {
        try {
          await saveFileLocally(messageData.file_id, savedFilePath, ctx.telegram);
        } catch (saveError) {
          console.warn('Не удалось сохранить файл:', saveError);
        }
      } else {
        console.warn('Не удалось сохранить файл: отсутствует ctx.telegram');
      }
    }

    if (!ctx.telegram || !ctx.telegram.sendMessage) {
      throw new Error('Отсутствует возможность отправки сообщений');
    }

    switch (messageData.messageType) {
      case 'text':
        sendResult = await ctx.telegram.sendMessage(
          messageData.uid,
          formattedMessage
        );
        break;
      case 'photo':
        sendResult = await ctx.telegram.sendPhoto(
          messageData.uid,
          messageData.file_id,
          { caption: formattedMessage }
        );
        break;
      case 'document':
        sendResult = await ctx.telegram.sendDocument(
          messageData.uid,
          messageData.file_id,
          { caption: formattedMessage }
        );
        break;
      case 'animation':
        sendResult = await ctx.telegram.sendAnimation(
          messageData.uid,
          messageData.file_id,
          { caption: formattedMessage }
        );
        break;
      case 'video':
        sendResult = await ctx.telegram.sendVideo(
          messageData.uid,
          messageData.file_id,
          { caption: formattedMessage }
        );
        break;
      default:
        throw new Error(`Неподдерживаемый тип медиа: ${messageData.messageType}`);
    }

    const entry = {
      from: 'support',
      content: messageData.content,
      time: Date.now()
    };

    if (messageData.messageType !== 'text') {
      entry.file_id = messageData.file_id;
      entry.file_type = messageData.messageType;
      entry.local_file_path = savedFilePath;
    }

    ticket.history.push(entry);
    tickets[ticket.id] = ticket;
    saveTickets(tickets);

    await ctx.editMessageText(`✅ Сообщение отправлено в тикет #${ticket.id}.`);
  } catch (e) {
    logEvent('ticket_reply_failed', { 
      reason: 'send_error', 
      ticketId: ticket.id,
      userId: messageData.uid,
      adminId: String(ctx.from.id),
      error: e.message
    }, 'ERROR');
    await ctx.editMessageText(`❌ Ошибка отправки в тикет #${ticket.id}: ${e.description || 'Пользователь мог заблокировать бота'}`);
  } finally {
    global.confirmMessages?.delete(confirmId);
  }
}

async function handleConfirmCancel(ctx, confirmId) {
  await ctx.answerCbQuery();
  global.confirmMessages?.delete(confirmId);
  await ctx.editMessageText('🚫 Отправка сообщения отменена.');
}

async function handleSetLanguage(ctx) {
  await ctx.answerCbQuery();
  const userId = String(ctx.from.id);
  const lang = ctx.match[1];

  const users = getUsers();
  if (users[userId]) {
    users[userId].language = lang;
    saveUsers(users);
    console.log(`User ${userId} set language to ${lang}`);
  }

  ctx.locales = getLocale(lang);

  await ctx.editMessageReplyMarkup({});

  await handleStart(ctx);
}

function callbackCooldownMiddleware(ctx, next) {
  const userId = String(ctx.from.id);
  
  if (!checkAndSetCooldown(userId, 'callback')) {
    logEvent('callback_spam_prevented', { 
      userId, 
      callbackData: ctx.callbackQuery.data 
    }, 'WARN');
    return ctx.answerCbQuery(ctx.locales.spam_cooldown_message);
  }

  return next();
}

function registerCallbackHandlers(bot) {
  bot.use(async (ctx, next) => {
    if (ctx.callbackQuery) {
      return callbackCooldownMiddleware(ctx, next);
    }
    return next();
  });

  bot.on('callback_query', (ctx, next) => {
    const callbackData = ctx.callbackQuery.data;
    return next();
  });

  bot.action(/^select_reply_(.+)$/, (ctx) => handleSelectReply(ctx, ctx.match[1]));
  bot.action(/^view_ticket_(.+)$/, (ctx) => handleViewTicket(ctx, ctx.match[1]));
  bot.action(/^close_ticket_(.+)$/, (ctx) => handleCloseTicket(ctx, ctx.match[1]));
  bot.action(/^close_(.+)$/, (ctx) => handleClose(ctx, ctx.match[1]));
  bot.action('admin_open_tickets', handleAdminOpenTickets);
  bot.action('admin_tickets', handleAdminTickets);
  bot.action('admin_closed_tickets', handleAdminClosedTickets);
  bot.action('admin_users', handleAdminUsers);
  bot.action('admin_search_ticket', handleAdminSearchTicket);
  bot.action('admin_search_user', handleAdminSearchUser);
  bot.action('admin_back', handleAdminBack);
  bot.action('admin_timeout', handleAdminTimeout);
  bot.action(/^admin_view_user_(.+)$/, (ctx) => handleAdminViewUser(ctx, ctx.match[1]));
  bot.action(/^admin_user_tickets_(.+)$/, (ctx) => handleAdminUserTickets(ctx, ctx.match[1]));
  bot.action(/^admin_toggle_ban_(.+)$/, (ctx) => handleAdminToggleBan(ctx, ctx.match[1]));
  bot.action(/^view_ticket_admin_(.+)$/, (ctx) => handleViewTicketAdmin(ctx, ctx.match[1]));
  bot.action(/^admin_ticket_history_(.+)$/, (ctx) => handleAdminTicketHistory(ctx, ctx.match[1]));
  bot.action(/^admin_close_ticket_(.+)$/, (ctx) => handleAdminCloseTicket(ctx, ctx.match[1]));
  bot.action(/^confirm_send_(.+)$/, (ctx) => handleConfirmSend(ctx, ctx.match[1]));
  bot.action(/^confirm_cancel_(.+)$/, (ctx) => handleConfirmCancel(ctx, ctx.match[1]));
  bot.action(/^set_lang_(.+)$/, handleSetLanguage);
}

module.exports = {
  handleAdminOpenTickets,
  handleSelectReply,
  handleViewTicket,
  handleCloseTicket,
  handleClose,
  handleAdminTickets,
  handleAdminClosedTickets,
  handleAdminTimeout,
  handleAdminUsers,
  handleAdminViewUser,
  handleAdminUserTickets,
  handleAdminToggleBan,
  handleAdminSearchTicket,
  handleAdminSearchUser,
  handleAdminBack,
  handleViewTicketAdmin,
  handleAdminTicketHistory,
  handleAdminCloseTicket,
  handleConfirmSend,
  handleConfirmCancel,
  registerCallbackHandlers,
  displayTicketInfo,
  findTicketById: findTicket
};