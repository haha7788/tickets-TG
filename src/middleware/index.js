const config = require('../config');
const { getUsers, saveUsers } = require('../utils/fileUtils');
const { getLocale } = require('../utils/localization');
const { logEvent } = require('../utils/logger');

function localeMiddleware(ctx, next) {
  const userId = String(ctx.from?.id);
  if (userId && userId !== 'undefined') {
    const users = getUsers();
    const user = users[userId];
    const lang = user?.language;
    if (lang) {
      ctx.locales = getLocale(lang);
    } else {
      ctx.locales = getLocale('en');
    }
  } else {
    ctx.locales = getLocale('en');
  }
  return next();
}

function userTrackingMiddleware(ctx, next) {
  const id = String(ctx.from?.id);
  if (!id) return next();

  const users = getUsers();
  const username = `${ctx.from.first_name || ''} ${ctx.from.last_name || ''}`.trim();
  const usernameTag = ctx.from.username ? `@${ctx.from.username}` : '(нет username)';
  const fullUsername = `${username} (${usernameTag})`;

  if (!users[id]) {
    users[id] = {
      banned: false,
      registrationDate: Date.now(),
      lastActivity: Date.now(),
      username: fullUsername,
      ticketCount: 0
    };
    saveUsers(users);
    logEvent('user_registered', {
      user_id: id,
      username: fullUsername
    });
  } else {
    users[id].lastActivity = Date.now();

    if (fullUsername !== users[id].username) {
      users[id].username = fullUsername;
      saveUsers(users);
    }
  }

  const isAdmin = config.ADMIN_IDS.includes(id);

  if (users[id].banned && !isAdmin) {
    logEvent('user_banned_access_denied', { user_id: id });
    return;
  }

  return next();
}

module.exports = {
  localeMiddleware,
  userTrackingMiddleware
};
