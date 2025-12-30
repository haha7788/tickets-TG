const fs = require('fs');
const config = require('../config');

const logStream = fs.createWriteStream(config.LOG_PATH, { flags: 'a' });

function logEvent(event, data, level = 'INFO') {
  try {
    const log = {
      timestamp: new Date().toISOString(),
      level,
      event,
      data: typeof data === 'object' ? JSON.stringify(data) : data
    };
    const logEntry = JSON.stringify(log) + '\n';
    logStream.write(logEntry);
    
    console.log(`[${log.level}] ${log.event}: ${log.data}`);
  } catch (e) {
    console.error('Ошибка при записи лога:', e);
  }
}

function getLastLogLines(lines = 250) {
  try {
    const logPath = config.LOG_PATH;
    const fileContent = fs.readFileSync(logPath, 'utf-8');
    const logLines = fileContent.split('\n').filter(line => line.trim() !== '');
    return logLines.slice(-lines).join('\n');
  } catch (error) {
    console.error('Ошибка чтения лог-файла:', error);
    return `Ошибка чтения лог-файла: ${error.message}`;
  }
}

module.exports = {
  logEvent,
  getLastLogLines
}; 