const fs = require('fs');
const fetch = require('node-fetch');
const config = require('../config');

if (!fs.existsSync(config.MEDIA_DIR)) {
  fs.mkdirSync(config.MEDIA_DIR, { recursive: true });
}

const loadJSON = (filePath) => fs.existsSync(filePath) ? JSON.parse(fs.readFileSync(filePath, 'utf8')) : {};

const saveJSON = (filePath, data) => fs.writeFileSync(filePath, JSON.stringify(data, null, 2));

const getTickets = () => loadJSON(config.TICKETS_PATH);

const saveTickets = (data) => saveJSON(config.TICKETS_PATH, data);

const getUsers = () => loadJSON(config.USERS_PATH);

const saveUsers = (data) => saveJSON(config.USERS_PATH, data);

const getConfig = () => loadJSON('./data/config.json');

const saveConfig = (data) => saveJSON('./data/config.json', data);

const saveFileLocally = async (fileId, filepath, bot) => {
  return bot.telegram.getFile(fileId).then(async (file) => {
    const urlPath = `https://api.telegram.org/file/bot${config.BOT_TOKEN}/${file.file_path}`;
    const res = await fetch(urlPath);
    const arrayBuffer = await res.arrayBuffer();
    fs.writeFileSync(filepath, Buffer.from(arrayBuffer));
  });
};

function getUserWithStats(userId) {
  const users = getUsers();
  const tickets = getTickets();
  const user = users[userId] || { banned: false };
  
  const userTickets = Object.values(tickets).filter(t => t.user_id === userId);
  const openTickets = userTickets.filter(t => t.status === 'open');
  const closedTickets = userTickets.filter(t => t.status === 'closed');
  
  let lastActivity = user.registrationDate || 0;
  
  userTickets.forEach(ticket => {
    ticket.history.forEach(entry => {
      if (entry.from === 'user' && entry.time > lastActivity) {
        lastActivity = entry.time;
      }
    });
  });
  
  return {
    ...user,
    ticketCount: userTickets.length,
    openTickets: openTickets.length,
    closedTickets: closedTickets.length,
    lastActivity: lastActivity,
    username: userTickets.length > 0 ? userTickets[0].username : 'Unknown',
    tickets: userTickets.map(t => ({
      id: t.id,
      status: t.status,
      created: t.history[0]?.time || 0,
      lastUpdated: t.history[t.history.length - 1]?.time || 0
    }))
  };
}

function registerOrUpdateUser(userId, username) {
  const users = getUsers();
  
  if (!users[userId]) {
    users[userId] = {
      banned: false,
      registrationDate: Date.now(),
      lastActivity: Date.now(),
      ticketCount: 0
    };
  }
  
  users[userId].lastActivity = Date.now();
  
  if (username) {
    users[userId].username = username;
  }
  
  saveUsers(users);
  return users[userId];
}

function findTicket(ticketId) {
  if (!ticketId) {
    return null;
  }

  const tickets = getTickets();
  const cleanId = String(ticketId)
    .replace(/^view_ticket_admin_/, '')
    .replace(/^admin_/, '')
    .replace(/^#/, '');

  if (tickets[cleanId]) {
    return tickets[cleanId];
  }

  for (const key in tickets) {
    const ticket = tickets[key];
    if (ticket && ticket.id && String(ticket.id).replace(/^#/, '') === cleanId) {
      return ticket;
    }
  }

  return null;
}

function dumpTicketDatabase() {
  const tickets = getTickets();
  return JSON.stringify(tickets, null, 2);
}

module.exports = {
  loadJSON,
  saveJSON,
  getTickets,
  saveTickets,
  getUsers,
  saveUsers,
  getConfig,
  saveConfig,
  saveFileLocally,
  getUserWithStats,
  registerOrUpdateUser,
  findTicket,
  dumpTicketDatabase
};