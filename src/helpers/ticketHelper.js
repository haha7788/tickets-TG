const config = require('../config');
const { logEvent } = require('../utils/logger');
const { getTickets, saveTickets } = require('../utils/fileUtils');

function formatLifetime(timeMs) {
  const seconds = Math.floor(timeMs / 1000);
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = seconds % 60;
  return `${hours}ч ${minutes}м ${remainingSeconds}с`;
}

async function closeTicketCommon(ticket, telegram, locales, closedBy = 'system', adminInfo = null) {
  const tickets = getTickets();

  ticket.status = 'closed';
  ticket.history.push({
    from: 'system',
    content: locales.ticket_closed_by_admin_panel || 'Тикет закрыт',
    time: Date.now()
  });

  tickets[ticket.id] = ticket;
  saveTickets(tickets);

  try {
    await telegram.sendMessage(
      ticket.user_id,
      locales.ticket_closed_user_message.replace('${ticket.id}', ticket.id)
    );
  } catch (e) {
    logEvent('failed_to_notify_user_ticket_closed', { ticketId: ticket.id, error: e.message }, 'WARN');
  }

  try {
    await telegram.callApi('deleteForumTopic', {
      chat_id: config.SUPPORT_GROUP_ID,
      message_thread_id: ticket.topic_id
    });
  } catch (e) {
    logEvent('failed_to_delete_forum_topic', { ticketId: ticket.id, error: e.message }, 'WARN');
  }

  try {
    const userName = ticket.username || 'Неизвестный пользователь';
    const messageCount = ticket.history.length;
    const ticketAge = Date.now() - (ticket.created || Date.now());
    const lifeTimeFormatted = formatLifetime(ticketAge);

    let closureMessage = `🔒 Тикет #${ticket.id} закрыт`;

    if (closedBy === 'user') {
      closureMessage += ' пользователем';
    } else if (closedBy === 'admin' && adminInfo) {
      closureMessage += ` администратором ${adminInfo}`;
    }

    closureMessage += `\n\n` +
      `👤 Пользователь: ${userName}\n` +
      `🆔 ID пользователя: ${ticket.user_id}\n` +
      `⏱ Время жизни тикета: ${lifeTimeFormatted}\n` +
      `📝 Всего сообщений: ${messageCount}\n` +
      `📅 Дата создания: ${new Date(ticket.created || Date.now()).toLocaleString('ru-RU')}\n` +
      `📅 Дата закрытия: ${new Date().toLocaleString('ru-RU')}`;

    await telegram.sendMessage(config.SUPPORT_GROUP_ID, closureMessage);
  } catch (e) {
    logEvent('failed_to_send_closure_notification', { ticketId: ticket.id, error: e.message }, 'WARN');
  }

  return ticket;
}

module.exports = {
  formatLifetime,
  closeTicketCommon
};
