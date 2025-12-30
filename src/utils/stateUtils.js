const { logEvent } = require('./logger');
const config = require('../config');

const USER_STATE = new Map();
const REPLY_MAP = new Map();
const activeUsers = new Set();

const USER_COOLDOWNS = new Map();
const CALLBACK_COOLDOWNS = new Map();

function checkAndSetCooldown(userId, action, cooldownTime = 2000) {
  if (config.ADMIN_IDS.includes(userId) || config.MAIN_ADMIN_ID.includes(userId)) {
    return true;
  }

  if (action.startsWith('ticket_')) {
    return true;
  }

  const now = Date.now();
  const cooldownMap = action === 'callback' ? CALLBACK_COOLDOWNS : USER_COOLDOWNS;

  const lastActionTime = cooldownMap.get(userId) || 0;
  
  if (now - lastActionTime < cooldownTime) {
    logEvent('spam_prevention', { 
      userId, 
      action, 
      timeSinceLastAction: now - lastActionTime 
    }, 'WARN');
    return false;
  }

  cooldownMap.set(userId, now);
  return true;
}

function canCreateTicket(userId, maxActiveTickets = 3) {
  if (config.ADMIN_IDS.includes(userId) || config.MAIN_ADMIN_ID.includes(userId)) {
    return true;
  }

  const tickets = require('./fileUtils').getTickets();
  const activeUserTickets = Object.values(tickets).filter(
    ticket => ticket.user_id === userId && ticket.status === 'open'
  );

  if (activeUserTickets.length >= maxActiveTickets) {
    logEvent('ticket_creation_limit', { 
      userId, 
      activeTicketsCount: activeUserTickets.length 
    }, 'WARN');
    return false;
  }

  return true;
}

USER_STATE.set('timeout', false);
async function blockIfTimeout(ctx, next) {
  const userId = String(ctx.from.id);
  const adminIds = config.ADMIN_IDS;
  const mainAdminIds = config.MAIN_ADMIN_ID;
  
  if (getTimeoutStatus() && !adminIds.includes(userId) && !mainAdminIds.includes(userId)) {
    return ctx.reply(ctx.locales.timeout_message);
  }
  await next();
}

function getTimeoutStatus() {
  return USER_STATE.get('timeout') || false;
}

function toggleTimeout() {
  const newState = !getTimeoutStatus();
  USER_STATE.set('timeout', newState);
  return newState;
}

module.exports = {
  USER_STATE,
  REPLY_MAP,
  activeUsers,
  checkAndSetCooldown,
  canCreateTicket,
  blockIfTimeout,
  toggleTimeout,
  getTimeoutStatus
}; 