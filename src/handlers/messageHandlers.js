const { Markup } = require('telegraf');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const config = require('../config');
const { USER_STATE, REPLY_MAP, activeUsers, checkAndSetCooldown, canCreateTicket } = require('../utils/stateUtils');
const { getTickets, saveTickets, getUsers, saveUsers, saveFileLocally, findTicket } = require('../utils/fileUtils');
const { handleAdminViewUser, handleViewTicketAdmin, displayTicketInfo } = require('./callbackHandlers');
const { getLocale } = require('../utils/localization');
const { logEvent } = require('../utils/logger');

function extractTicketId(text) {
  if (!text) return null;

  const ticketRegex = /(?:тикет|Тикет|ТИКЕТ|ticket|Ticket|TICKET)\s*#([a-zA-Z0-9]+)|#([a-zA-Z0-9]+)/i;
  const match = text.match(ticketRegex);

  if (match) {
    return match[1] || match[2];
  }

  return null;
}

async function handleMessage(ctx, bot) {
  const chatId = ctx.chat.id;
  const userId = String(ctx.from.id);
  const state = USER_STATE.get(userId);
  const msg = ctx.message;
  const isAdmin = config.ADMIN_IDS.includes(userId);
  const text = msg.text?.trim().toLowerCase();

  const replyToMessage = msg.reply_to_message;
  if (replyToMessage && 
      replyToMessage.text && 
      (replyToMessage.text.includes('🎫 Ticket #') || replyToMessage.text.includes('🎫 Тикет #')) && 
      (replyToMessage.text.includes('✍️ To write to this ticket') || replyToMessage.text.includes('✍️ Чтобы написать в этот тикет'))) {
    
    const ticketIdMatch = replyToMessage.text.match(/🎫 (?:Ticket|Тикет) #(\w+)/);
    if (ticketIdMatch) {
      const ticketId = ticketIdMatch[1];
      const tickets = getTickets();
      const ticket = tickets[ticketId];
      
      if (ticket && ticket.user_id === userId && ticket.status === 'open') {
        return handleReplyToMessage(ctx, userId, msg, bot, ticketId);
      }
    }
  }

  if (!checkAndSetCooldown(userId, 'message')) {
    return ctx.reply(ctx.locales.spam_cooldown_message);
  }

  if (state?.action === 'search_ticket' && isAdmin) {
    USER_STATE.delete(userId);
    
    const ticketId = String(msg.text?.trim() || "").replace(/^#/, '');
    
    const ticket = findTicket(ticketId);
    
    if (!ticket) {
      return ctx.reply(ctx.locales.ticket_not_found_check_id,
        Markup.inlineKeyboard([[Markup.button.callback(ctx.locales.button_back, 'admin_tickets')]])
      );
    }
    
    const customCtx = {
      reply: ctx.reply.bind(ctx),
      telegram: ctx.telegram
    };
    
    return await displayTicketInfo(customCtx, ticket, ticketId);
  }

  if (state?.action === 'search_user' && isAdmin) {
    USER_STATE.delete(userId);
    const userQuery = msg.text?.trim();

    if (!userQuery) {
      return ctx.reply(ctx.locales.enter_user_id_or_username);
    }

    const users = getUsers();
    let foundUserId = null;

    if (users[userQuery]) {
      foundUserId = userQuery;
    } else {
      const searchUserName = userQuery.toLowerCase();
      for (const uid in users) {
        if (users[uid].username &&
          users[uid].username.toLowerCase().includes(searchUserName)) {
          foundUserId = uid;
          break;
        }
      }
    }

    if (!foundUserId) {
      return ctx.reply(ctx.locales.user_not_found,
        Markup.inlineKeyboard([[Markup.button.callback(ctx.locales.button_back, 'admin_search_user')]])
      );
    }

    const customCtx = {
      reply: ctx.reply.bind(ctx),
      telegram: ctx.telegram
    };
    
    return await handleAdminViewUser(customCtx, foundUserId);
  }

  if (msg.reply_to_message && msg.chat.type === 'private') {
    const map = REPLY_MAP.get(userId);
    if (map && msg.reply_to_message.message_id === map.messageId) {
      await handleReplyToMessage(ctx, userId, msg, bot, map.ticketId);
      return;
    }

    const replyText = msg.reply_to_message.text || msg.reply_to_message.caption || '';
    const ticketId = extractTicketId(replyText);

    if (ticketId) {
      const tickets = getTickets();
      const ticket = tickets[ticketId];

      if (ticket && ticket.user_id === userId && ticket.status === 'open') {
        await handleReplyToMessage(ctx, userId, msg, bot, ticketId);
        return;
      }
    }
  }

  if (state?.action === 'reply') {
    await handleTicketReply(ctx, userId, state, msg);
    return;
  }

  if (chatId === config.SUPPORT_GROUP_ID && msg.message_thread_id) {
    await handleSupportReply(ctx, msg, text, bot);
    return;
  }

  if (ctx.chat.type === 'private' && activeUsers.has(userId)) {
    if (!canCreateTicket(userId)) {
      activeUsers.delete(userId);
      
      USER_STATE.delete(userId);
      
      return ctx.reply(ctx.locales.ticket_creation_limit_message, 
        Markup.keyboard([
          [ctx.locales.button_create_ticket],
          [ctx.locales.button_my_tickets],
          [ctx.locales.button_write_to_ticket]
        ]).resize());
    }

    await handleNewTicket(ctx, userId, msg, bot);
    return;
  }
}

async function handleReplyToMessage(ctx, userId, msg, bot, ticketId) {
  if (!checkAndSetCooldown(userId, 'message')) {
    return ctx.reply(ctx.locales.spam_cooldown_message);
  }

  const tickets = getTickets();
  const ticket = tickets[ticketId];
  if (!ticket || ticket.status !== 'open') return;

  const mediaFolder = path.join(config.MEDIA_DIR, ticket.id);
  if (!fs.existsSync(mediaFolder)) fs.mkdirSync(mediaFolder, { recursive: true });

  const entry = {
    from: 'user',
    content: msg.text || msg.caption || '[медиа]',
    time: Date.now()
  };

  let savedFilePath = null;
  if (msg.photo) {
    entry.file_id = msg.photo.at(-1).file_id;
    entry.file_type = 'photo';
    const filename = `${ticket.id}_${ticket.history.length}.jpg`;
    savedFilePath = path.join(mediaFolder, filename);
    await saveFileLocally(entry.file_id, savedFilePath, bot);
    entry.local_file_path = savedFilePath;
  } else if (msg.document) {
    entry.file_id = msg.document.file_id;
    entry.file_type = 'document';
    const filename = `${ticket.id}_${ticket.history.length}.bin`;
    savedFilePath = path.join(mediaFolder, filename);
    await saveFileLocally(entry.file_id, savedFilePath, bot);
    entry.local_file_path = savedFilePath;
  } else if (msg.animation) {
    entry.file_id = msg.animation.file_id;
    entry.file_type = 'animation';
    const filename = `${ticket.id}_${ticket.history.length}.gif`;
    savedFilePath = path.join(mediaFolder, filename);
    await saveFileLocally(entry.file_id, savedFilePath, bot);
    entry.local_file_path = savedFilePath;
  } else if (msg.video) {
    entry.file_id = msg.video.file_id;
    entry.file_type = 'video';
    const filename = `${ticket.id}_${ticket.history.length}.mp4`;
    savedFilePath = path.join(mediaFolder, filename);
    await saveFileLocally(entry.file_id, savedFilePath, bot);
    entry.local_file_path = savedFilePath;
  }

  ticket.history.push(entry);
  saveTickets(tickets);

  logEvent('ticket_user_reply', { 
    ticketId, 
    userId, 
    messageType: entry.file_type || 'text',
    contentLength: entry.content.length 
  }, 'INFO');

  const messageOptions = { message_thread_id: ticket.topic_id };
  if (msg.text) {
    await ctx.telegram.sendMessage(
      config.SUPPORT_GROUP_ID,
      `📨 Ответ по тикету #${ticket.id}:\n${msg.text}`,
      messageOptions
    );
  } else if (msg.photo) {
    await ctx.telegram.sendPhoto(
      config.SUPPORT_GROUP_ID,
      msg.photo.at(-1).file_id,
      {
        ...messageOptions,
        caption: `👤 ${msg.caption || '📷 Фото от пользователя'}`
      }
    );
  } else if (msg.document) {
    await ctx.telegram.sendDocument(
      config.SUPPORT_GROUP_ID,
      msg.document.file_id,
      {
        ...messageOptions,
        caption: `👤 ${msg.caption || 'Документ от пользователя'}`
      }
    );
  } else if (msg.animation) {
    await ctx.telegram.sendAnimation(
      config.SUPPORT_GROUP_ID,
      msg.animation.file_id,
      {
        ...messageOptions,
        caption: `👤 ${msg.caption || '🎬 Гифка от пользователя'}`
      }
    );
  } else if (msg.video) {
    await ctx.telegram.sendVideo(
      config.SUPPORT_GROUP_ID,
      msg.video.file_id,
      {
        ...messageOptions,
        caption: `👤 ${msg.caption || '🎥 Видео от пользователя'}`
      }
    );
  }

  if (ticket.history.filter(h => h.from === 'user').length === 0) {
    try {
      await ctx.telegram.sendMessage(
        config.SUPPORT_GROUP_ID,
        `🔒 Тикет #${ticket.id} закрыт пользователем\n\n` +
        `👤 Пользователь: ${ticket.username}\n` +
        `🆔 ID пользователя: ${ticket.user_id}\n` +
        `📅 Дата закрытия: ${new Date().toLocaleString('ru-RU')}`
      );
    } catch (e) {
      console.error('Error sending ticket closure notification:', e);
    }
  }

  return ctx.reply(ctx.locales.reply_sent_success.replace('${ticket.id}', ticket.id), Markup.keyboard([
    ['🆕 Создать тикет'],
    ['📁 Мои тикеты'],
    ['✍️ Написать в тикет']
  ]).resize());
}

async function handleTicketReply(ctx, userId, state, msg) {
  const tickets = getTickets();
  const ticket = tickets[state.ticketId];
  if (!ticket || ticket.user_id !== userId || ticket.status !== 'open') {
    USER_STATE.delete(userId);
    return ctx.reply(ctx.locales.ticket_unavailable_error);
  }

  const content = msg.text || msg.caption || '[медиа]';
  ticket.history.push({ from: 'user', content, time: Date.now() });
  saveTickets(tickets);

  const messageOptions = { message_thread_id: ticket.topic_id };

  if (msg.text) {
    await ctx.telegram.sendMessage(
      config.SUPPORT_GROUP_ID,
      `📨 Ответ по тикету #${ticket.id}:\n${msg.text}`,
      messageOptions
    );
  } else if (msg.photo) {
    await ctx.telegram.sendPhoto(
      config.SUPPORT_GROUP_ID,
      msg.photo.at(-1).file_id,
      {
        ...messageOptions,
        caption: `👤 ${msg.caption || '📷 Фото от пользователя'}`
      }
    );
  } else if (msg.document) {
    await ctx.telegram.sendDocument(
      config.SUPPORT_GROUP_ID,
      msg.document.file_id,
      {
        ...messageOptions,
        caption: `👤 ${msg.caption || 'Документ от пользователя'}`
      }
    );
  }

  USER_STATE.delete(userId);
  return ctx.reply(ctx.locales.reply_sent_success.replace('${ticket.id}', ticket.id), Markup.keyboard([
    [ctx.locales.button_create_ticket],
    [ctx.locales.button_my_tickets],
    [ctx.locales.button_write_to_ticket]
  ]).resize());
}

async function handleSupportReply(ctx, msg, text, bot) {
  const tickets = getTickets();

  let ticket = Object.values(tickets).find(t => t.topic_id === msg.message_thread_id);

  if (!ticket && msg.reply_to_message) {
    const replyText = msg.reply_to_message.text || msg.reply_to_message.caption || '';
    const ticketId = extractTicketId(replyText);

    if (ticketId) {
      ticket = tickets[ticketId];
    }
  }

  if (!ticket) return;

  if (msg.from?.is_bot) {
    return;
  }

  const uid = ticket.user_id;
  const content = msg.text || msg.caption || '[медиа]';
  let replyTo = msg.reply_to_message?.text || msg.reply_to_message?.caption || '';

  const systemPrefixRegex = /^📨 Ответ по тикету #\w+:\n/;
  if (systemPrefixRegex.test(replyTo)) {
    replyTo = replyTo.replace(systemPrefixRegex, '').trim();
  }

  const ticketIdHeader = `🎫 Тикет #${ticket.id}`;
  const replyContentFormatted = replyTo ? `💬 Ответ на: "${replyTo}"` : '';
  const supportLabel = `👨‍💻 Поддержка:`;

  if ((msg.text && (
    msg.text.startsWith(`[СИСТЕМА]`) ||
    msg.text.startsWith(`🎫 Тикет #`) ||
    msg.text.includes(`👤 Пользователь:`) ||
    msg.text.includes(`🆔 ID пользователя:`) ||
    msg.text.includes(`📨 Ответ от пользователя по тикету #`)
  )) ||
    (msg.caption)
  ) {
    return;
  }

  if (['/close', 'close', '/c', '/з', 'закрыть'].includes(text)) {
    return await handleCloseCommand(ctx, ticket, tickets, uid);
  }

  if (['/ban', 'ban', '/b', '/б', 'бан'].includes(text)) {
    return await handleBanCommand(ctx, ticket, tickets, uid);
  }

  let messageType = 'text';
  let fileId = null;

  if (msg.photo) {
    messageType = 'photo';
    fileId = msg.photo.at(-1).file_id;
  } else if (msg.document) {
    messageType = 'document';
    fileId = msg.document.file_id;
  } else if (msg.animation) {
    messageType = 'animation';
    fileId = msg.animation.file_id;
  } else if (msg.video) {
    messageType = 'video';
    fileId = msg.video.file_id;
  }

  const mediaFolder = path.join(config.MEDIA_DIR, ticket.id);
  if (!fs.existsSync(mediaFolder)) fs.mkdirSync(mediaFolder, { recursive: true });

  let savedFilePath = null;
  if (fileId) {
    const filename = `${ticket.id}_${ticket.history.length}.${
      messageType === 'photo' ? 'jpg' :
      messageType === 'animation' ? 'gif' :
      messageType === 'video' ? 'mp4' :
      'bin'
    }`;
    savedFilePath = path.join(mediaFolder, filename);
    await saveFileLocally(fileId, savedFilePath, bot);
  }

  const messageData = {
    ticketId: ticket.id,
    uid: uid,
    content: content,
    messageType: messageType,
    file_id: fileId,
    caption: msg.caption || '',
    local_file_path: savedFilePath,
    ticketIdHeader: ticketIdHeader,
    replyContentFormatted: replyContentFormatted,
    supportLabel: supportLabel,
  };

  const confirmId = Date.now().toString();
  global.confirmMessages = global.confirmMessages || new Map();
  global.confirmMessages.set(confirmId, messageData);
  logEvent('support_reply_confirm_created', { confirmId, ticketId: ticket.id, messageType }, 'INFO');

  let previewText;
  if (messageType === 'text') {
    previewText = `${ticketIdHeader}\n${replyContentFormatted ? replyContentFormatted + '\n' : ''}${supportLabel} ${msg.text}`;
  } else if (messageType === 'photo') {
    previewText = `${ticketIdHeader}\n${replyContentFormatted ? replyContentFormatted + '\n' : ''}${supportLabel} ${msg.caption || '📷 Фото от поддержки'}`;
  } else if (messageType === 'document') {
    previewText = `${ticketIdHeader}\n${replyContentFormatted ? replyContentFormatted + '\n' : ''}${supportLabel} ${msg.caption || 'Документ от поддержки'}`;
  } else if (messageType === 'animation') {
    previewText = `${ticketIdHeader}\n${replyContentFormatted ? replyContentFormatted + '\n' : ''}${supportLabel} ${msg.caption || '🎬 Гифка от поддержки'}`;
  } else if (messageType === 'video') {
    previewText = `${ticketIdHeader}\n${replyContentFormatted ? replyContentFormatted + '\n' : ''}${supportLabel} ${msg.caption || '🎥 Видео от поддержки'}`;
  }

  await ctx.reply(
    `⚠️ Проверьте сообщение перед отправкой:\n\n${previewText}`,
    Markup.inlineKeyboard([
      [
        Markup.button.callback('✅ Отправить', `confirm_send_${confirmId}`),
        Markup.button.callback('❌ Отменить', `confirm_cancel_${confirmId}`)
      ]
    ])
  );
}

async function handleCloseCommand(ctx, ticket, tickets, uid) {
  ticket.status = 'closed';
  ticket.history.push({ from: 'system', content: ctx.locales.ticket_closed_by_admin_panel, time: Date.now() });
  saveTickets(tickets);

  logEvent('ticket_closed_by_admin', { 
    ticketId: ticket.id, 
    userId: uid,
    adminId: String(ctx.from.id)
  }, 'INFO');

  try {
    await ctx.telegram.sendMessage(uid, ctx.locales.ticket_closed_user_message.replace('${ticket.id}', ticket.id));
  } catch (e) { }

  try {
    await ctx.telegram.callApi('deleteForumTopic', {
      chat_id: config.SUPPORT_GROUP_ID,
      message_thread_id: ticket.topic_id
    });
  } catch (e) { }

  return ctx.telegram.sendMessage(ctx.chat.id, `✅ Тикет #${ticket.id} закрыт.`).catch(() => {
    ctx.reply(`✅ Тикет ${ticket.id} закрыт.`);
  });
}

async function handleBanCommand(ctx, ticket, tickets, uid) {
  const userData = getUsers();
  userData[uid] = { ...userData[uid], banned: true };
  saveUsers(userData);

  ticket.status = 'closed';
  ticket.history.push({ from: 'system', content: 'Пользователь забанен и тикет закрыт', time: Date.now() });
  saveTickets(tickets);

  logEvent('user_banned_ticket_closed', { 
    ticketId: ticket.id, 
    userId: uid,
    adminId: String(ctx.from.id)
  }, 'WARN');

  try {
    await ctx.telegram.sendMessage(uid, `⛔ Вы были заблокированы. Дальнейшие обращения невозможны.`);
  } catch (e) { }

  try {
    await ctx.telegram.callApi('deleteForumTopic', {
      chat_id: config.SUPPORT_GROUP_ID,
      message_thread_id: ticket.topic_id
    });
  } catch (e) { }

  return ctx.telegram.sendMessage(ctx.chat.id, `🚫 Пользователь заблокирован. Тикет #${ticket.id} закрыт.`).catch(() => {
    ctx.reply(`🚫 Пользователь заблокирован. Тикет ${ticket.id} закрыт.`);
  });
}

async function handleNewTicket(ctx, userId, msg, bot) {
  if (!checkAndSetCooldown(userId, 'ticket_creation', 10000)) {
    return ctx.reply(ctx.locales.spam_cooldown_message);
  }

  if (!canCreateTicket(userId)) {
    return ctx.reply(ctx.locales.ticket_creation_limit_message);
  }

  if (!checkAndSetCooldown(userId, 'ticket_message')) {
    return ctx.reply(ctx.locales.spam_cooldown_message);
  }

  const ticketId = uuidv4().slice(0, 8);
  const username = `${ctx.from.first_name || ''} ${ctx.from.last_name || ''}`.trim();
  const usernameTag = ctx.from.username ? `@${ctx.from.username}` : '(нет username)';
  const fullUsername = `${username} (${usernameTag})`;
  const group = await ctx.telegram.getChat(config.SUPPORT_GROUP_ID);

  if (!group.is_forum) {
    activeUsers.delete(userId);
    return ctx.reply(ctx.locales.group_not_support_topics);
  }

  let topic;
  try {
    topic = await ctx.telegram.callApi('createForumTopic', {
      chat_id: config.SUPPORT_GROUP_ID,
      name: `🎫 #${ticketId} | ${usernameTag}`
    });
  } catch (e) {
    activeUsers.delete(userId);
    return ctx.reply(ctx.locales.failed_to_create_topic);
  }

  logEvent('ticket_created', { 
    ticketId, 
    userId, 
    username: fullUsername, 
    topicId: topic.message_thread_id 
  }, 'INFO');

  const users = getUsers();
  if (users[userId]) {
    users[userId].lastActivity = Date.now();
    users[userId].ticketCount = (users[userId].ticketCount || 0) + 1;
    saveUsers(users);
  }

  const tickets = getTickets();
  tickets[ticketId] = {
    id: ticketId,
    user_id: userId,
    username: fullUsername,
    status: 'open',
    topic_id: topic.message_thread_id,
    created: Date.now(),
    history: []
  };

  const mediaFolder = path.join(config.MEDIA_DIR, ticketId);
  if (!fs.existsSync(mediaFolder)) fs.mkdirSync(mediaFolder, { recursive: true });

  const entry = {
    from: 'user',
    content: msg.text || msg.caption || '[медиа]',
    time: Date.now()
  };

  if (msg.photo) {
    entry.file_id = msg.photo.at(-1).file_id;
    entry.file_type = 'photo';
    await saveFileLocally(entry.file_id, path.join(mediaFolder, `${ticketId}_0.jpg`), bot);
  } else if (msg.document) {
    entry.file_id = msg.document.file_id;
    entry.file_type = 'document';
    await saveFileLocally(entry.file_id, path.join(mediaFolder, `${ticketId}_0.bin`), bot);
  }

  tickets[ticketId].history.push(entry);
  saveTickets(tickets);
  activeUsers.delete(userId);

  const locales = getLocale('ru');
  await ctx.telegram.sendMessage(
    config.SUPPORT_GROUP_ID,
    `🎫 Тикет #${ticketId}\n👤 Пользователь: ${tickets[ticketId].username}\n🆔 ID пользователя: ${userId}\n${locales.ticket_language} ${users[userId]?.language || locales.ticket_language_not_set}`,
    { message_thread_id: topic.message_thread_id }
  );

  if (entry.file_type === 'photo') {
    await ctx.telegram.sendPhoto(config.SUPPORT_GROUP_ID, entry.file_id, {
      caption: `👤 ${msg.caption || ''}`,
      message_thread_id: topic.message_thread_id,
    });
  } else if (entry.file_type === 'document') {
    await ctx.telegram.sendDocument(config.SUPPORT_GROUP_ID, entry.file_id, {
      caption: `👤 ${msg.caption || ''}`,
      message_thread_id: topic.message_thread_id,
    });
  } else if (msg.text) {
    await ctx.telegram.sendMessage(
      config.SUPPORT_GROUP_ID,
      `📝 Сообщение: ${msg.text}`,
      { message_thread_id: topic.message_thread_id }
    );
  }

  const sentMessage = await ctx.reply(
    ctx.locales.ticket_created_success.replace('${ticketId}', ticketId),
    Markup.keyboard([
      [ctx.locales.button_create_ticket],
      [ctx.locales.button_my_tickets],
      [ctx.locales.button_write_to_ticket]
    ]).resize()
  );

  REPLY_MAP.set(userId, { ticketId, messageId: sentMessage.message_id });
}

function registerMessageHandlers(bot) {
  bot.on('message', (ctx) => handleMessage(ctx, bot));
}

module.exports = {
  handleMessage,
  handleReplyToMessage,
  handleTicketReply,
  handleSupportReply,
  handleCloseCommand,
  handleBanCommand,
  handleNewTicket,
  registerMessageHandlers,
  extractTicketId
}; 