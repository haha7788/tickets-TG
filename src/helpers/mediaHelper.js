const path = require('path');
const fs = require('fs');
const config = require('../config');
const { saveFileLocally } = require('../utils/fileUtils');

async function handleMediaMessage(msg, ticket, bot) {
  const mediaFolder = path.join(config.MEDIA_DIR, ticket.id);
  if (!fs.existsSync(mediaFolder)) {
    fs.mkdirSync(mediaFolder, { recursive: true });
  }

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

  return entry;
}

async function sendMediaToGroup(telegram, msg, ticket, messageOptions) {
  if (msg.text) {
    await telegram.sendMessage(
      config.SUPPORT_GROUP_ID,
      `📨 Ответ по тикету #${ticket.id}:\n${msg.text}`,
      messageOptions
    );
  } else if (msg.photo) {
    await telegram.sendPhoto(
      config.SUPPORT_GROUP_ID,
      msg.photo.at(-1).file_id,
      {
        ...messageOptions,
        caption: `👤 ${msg.caption || '📷 Фото от пользователя'}`
      }
    );
  } else if (msg.document) {
    await telegram.sendDocument(
      config.SUPPORT_GROUP_ID,
      msg.document.file_id,
      {
        ...messageOptions,
        caption: `👤 ${msg.caption || 'Документ от пользователя'}`
      }
    );
  } else if (msg.animation) {
    await telegram.sendAnimation(
      config.SUPPORT_GROUP_ID,
      msg.animation.file_id,
      {
        ...messageOptions,
        caption: `👤 ${msg.caption || '🎬 Гифка от пользователя'}`
      }
    );
  } else if (msg.video) {
    await telegram.sendVideo(
      config.SUPPORT_GROUP_ID,
      msg.video.file_id,
      {
        ...messageOptions,
        caption: `👤 ${msg.caption || '🎥 Видео от пользователя'}`
      }
    );
  }
}

module.exports = {
  handleMediaMessage,
  sendMediaToGroup
};
