const path = require('path');
const fs = require('fs');

const localesDir = path.join(__dirname, '../../data/locales');

let locales = {};

const loadLocales = () => {
  try {
    const files = fs.readdirSync(localesDir);
    files.forEach(file => {
      if (file.endsWith('.json')) {
        const lang = file.replace('.json', '');
        const filePath = path.join(localesDir, file);
        locales[lang] = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      }
    });
  } catch (error) {
    throw new Error(`Error loading locales: ${error.message}`);
  }
};

const getLocale = (lang) => {
  return locales[lang] || locales['en'] || {};
};

module.exports = {
  loadLocales,
  getLocale
}; 