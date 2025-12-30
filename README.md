# 🎫 Telegram Support Bot

<div align="center">

[![Node.js](https://img.shields.io/badge/node-%3E%3D14.0.0-brightgreen.svg)](https://nodejs.org/)
[![Telegraf](https://img.shields.io/badge/telegraf-4.12.2-blue.svg)](https://telegraf.js.org/)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](https://github.com)

**Professional ticket support system for Telegram with multi-language support and admin panel**

[English](#english) • [Русский](#russian)

</div>

---

## English

### 📋 Table of Contents

- [Features](#features)
- [Installation](#installation)
- [Configuration](#configuration)
- [Project Structure](#project-structure)
- [Usage](#usage)
- [Commands](#commands)
- [Development](#development)
- [Contributing](#contributing)
- [License](#license)

### ✨ Features

- 🎫 **Ticket System** - Forum-based ticket management with automatic topic creation
- 🌍 **Multi-language** - Built-in English and Russian support
- 👨‍💼 **Admin Panel** - Comprehensive admin controls via inline keyboard
- 📎 **Media Support** - Handle photos, videos, documents, GIFs, and animations
- 👥 **User Management** - Ban/unban users, track activity, view detailed statistics
- 📊 **Logging System** - Structured JSON logging for debugging and monitoring
- 🛡️ **Spam Protection** - Cooldown mechanisms and ticket creation limits
- ⏸️ **Timeout Mode** - Temporarily disable ticket creation for non-admins
- 🔍 **Search** - Search tickets and users by ID or username
- 📈 **Statistics** - Real-time stats on tickets, users, and bot activity
- 💾 **Local Storage** - All media files saved locally for persistence

### 🚀 Installation

#### Prerequisites

- Node.js 14.x or higher
- npm or yarn
- Telegram Bot Token (from [@BotFather](https://t.me/BotFather))
- Telegram Group with Forum Topics enabled

#### Quick Start

```bash
# Clone the repository
git clone https://github.com/haha7788/tickets-TG
cd support

# Install dependencies
npm install

# Configure environment
cp .env.example .env

# Edit .env with your configuration
nano .env

# Start the bot
npm start
```

### ⚙️ Configuration

Create a `.env` file in the root directory:

```env
# Bot Configuration
SUPPORT_BOT_TOKEN=your_bot_token_here
SUPPORT_GROUP_ID=-1001234567890
SUPPORT_GENERAL_TOPIC_ID=1

# Admin Configuration
SUPPORT_ADMIN_IDS=123456789,987654321
SUPPORT_MAIN_ADMIN_IDS=123456789

# Paths
SUPPORT_TICKETS_PATH=./data/tickets.json
SUPPORT_USERS_PATH=./data/users.json
SUPPORT_LOG_PATH=./data/logs.json
SUPPORT_MEDIA_DIR=./data/media
```

#### Getting Your Configuration Values

1. **BOT_TOKEN**: Message [@BotFather](https://t.me/BotFather) and create a new bot
2. **GROUP_ID**: Add [@RawDataBot](https://t.me/RawDataBot) to your group to get the ID
3. **ADMIN_IDS**: Your Telegram user ID (get from [@userinfobot](https://t.me/userinfobot))

### 📁 Project Structure

```
support/
├── src/
│   ├── handlers/              # Message and callback handlers
│   │   ├── callbackHandlers.js    # Inline button handlers
│   │   ├── commandHandlers.js     # Bot commands (/start, /admin)
│   │   └── messageHandlers.js     # Message processing
│   ├── helpers/               # Utility helpers
│   │   ├── mediaHelper.js         # Media file handling
│   │   └── ticketHelper.js        # Ticket operations
│   ├── middleware/            # Bot middleware
│   │   └── index.js              # Locale and user tracking
│   ├── utils/                 # Core utilities
│   │   ├── fileUtils.js          # File operations
│   │   ├── localization.js       # Multi-language support
│   │   ├── logger.js             # Structured logging
│   │   └── stateUtils.js         # State management
│   ├── config.js              # Configuration loader
│   └── index.js               # Application entry point
├── data/
│   ├── locales/               # Language files
│   │   ├── en.json               # English translations
│   │   └── ru.json               # Russian translations
│   ├── tickets.json           # Ticket database (auto-created)
│   └── users.json             # User database (auto-created)
├── logs/                      # Application logs
├── media/                     # Uploaded media files
├── .env                       # Environment variables (not in git)
├── .env.example               # Environment template
├── .gitignore                 # Git ignore rules
├── package.json               # Dependencies and scripts
└── README.md                  # This file
```

### 📖 Usage

#### For Users

1. **Start the bot**
   ```
   /start
   ```

2. **Select language**
   - Choose between English and Russian

3. **Create a ticket**
   - Click "🆕 Create Ticket" button
   - Send your message (text, photo, video, document)
   - Ticket will be created in support group

4. **Reply to tickets**
   - Use "✍️ Write to Ticket" button
   - Or reply directly to ticket notification messages

5. **View tickets**
   - Click "📁 My Tickets" to see all your tickets
   - Click on a ticket to view history

6. **Change language**
   ```
   /lang
   ```

#### For Admins

Access admin panel in the support group:

```
/admin
```

**Admin Panel Features:**

- 📂 **All Tickets** - View and manage all tickets
  - Open tickets with live links
  - Closed tickets with full history
  - Search by ticket ID

- 👥 **User Management**
  - View all users with activity
  - Ban/unban users
  - View user statistics
  - Search users by ID or @username

- 🔍 **Search Functions**
  - Quick ticket lookup by ID
  - User search with detailed info

- ⏸️ **Timeout Mode**
  - Disable ticket creation for non-admins
  - Emergency pause feature

**In Support Group:**

- Reply to any message in ticket thread to respond
- Type `/close` or `close` to close ticket
- Type `/ban` or `ban` to ban user and close ticket

### 🔧 Commands

#### User Commands

| Command | Description |
|---------|-------------|
| `/start` | Start the bot and show main menu |
| `/lang` | Change language preference |

#### Admin Commands (Support Group)

| Command | Description |
|---------|-------------|
| `/admin` | Open admin panel |
| `close` or `/close` | Close current ticket |
| `ban` or `/ban` | Ban user and close ticket |

### 👨‍💻 Development

#### Run in development mode

```bash
npm run dev
```

This uses nodemon for automatic restart on file changes.

#### File Structure

- **Handlers** - All user interaction logic
- **Helpers** - Reusable utility functions
- **Middleware** - Request preprocessing
- **Utils** - Core functionality (files, logging, state)

### 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

### 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

### 💬 Support

If you have any questions or issues, please open an issue on GitHub.

---

## Russian

### 📋 Содержание

- [Возможности](#возможности)
- [Установка](#установка)
- [Настройка](#настройка)
- [Структура проекта](#структура-проекта)
- [Использование](#использование)
- [Команды](#команды-ru)
- [Разработка](#разработка)
- [Вклад в проект](#вклад-в-проект)
- [Лицензия](#лицензия-ru)

### ✨ Возможности

- 🎫 **Система тикетов** - Управление обращениями через топики форума с автоматическим созданием
- 🌍 **Мультиязычность** - Встроенная поддержка английского и русского языков
- 👨‍💼 **Админ-панель** - Полный контроль через inline-клавиатуру
- 📎 **Поддержка медиа** - Обработка фото, видео, документов, GIF и анимаций
- 👥 **Управление пользователями** - Бан/разбан, отслеживание активности, детальная статистика
- 📊 **Система логирования** - Структурированные JSON-логи для отладки и мониторинга
- 🛡️ **Защита от спама** - Механизмы задержки и лимиты на создание тикетов
- ⏸️ **Режим паузы** - Временное отключение создания тикетов для обычных пользователей
- 🔍 **Поиск** - Поиск тикетов и пользователей по ID или username
- 📈 **Статистика** - Статистика в реальном времени по тикетам, пользователям и активности бота
- 💾 **Локальное хранилище** - Все медиа-файлы сохраняются локально

### 🚀 Установка

#### Требования

- Node.js 14.x или выше
- npm или yarn
- Токен Telegram бота (от [@BotFather](https://t.me/BotFather))
- Группа Telegram с включенными топиками форума

#### Быстрый старт

```bash
# Клонировать репозиторий
git clone https://github.com/haha7788/tickets-TG
cd support

# Установить зависимости
npm install

# Настроить окружение
cp .env.example .env

# Отредактировать .env вашими данными
nano .env

# Запустить бота
npm start
```

### ⚙️ Настройка

Создайте файл `.env` в корневой директории:

```env
# Конфигурация бота
SUPPORT_BOT_TOKEN=ваш_токен_бота
SUPPORT_GROUP_ID=-1001234567890
SUPPORT_GENERAL_TOPIC_ID=1

# Конфигурация админов
SUPPORT_ADMIN_IDS=123456789,987654321
SUPPORT_MAIN_ADMIN_IDS=123456789

# Пути
SUPPORT_TICKETS_PATH=./data/tickets.json
SUPPORT_USERS_PATH=./data/users.json
SUPPORT_LOG_PATH=./data/logs.json
SUPPORT_MEDIA_DIR=./data/media
```

#### Получение конфигурационных данных

1. **BOT_TOKEN**: Напишите [@BotFather](https://t.me/BotFather) и создайте нового бота
2. **GROUP_ID**: Добавьте [@RawDataBot](https://t.me/RawDataBot) в вашу группу для получения ID
3. **ADMIN_IDS**: Ваш Telegram ID (получите от [@userinfobot](https://t.me/userinfobot))

### 📁 Структура проекта

```
support/
├── src/
│   ├── handlers/              # Обработчики сообщений и callback'ов
│   │   ├── callbackHandlers.js    # Обработчики inline-кнопок
│   │   ├── commandHandlers.js     # Команды бота (/start, /admin)
│   │   └── messageHandlers.js     # Обработка сообщений
│   ├── helpers/               # Вспомогательные функции
│   │   ├── mediaHelper.js         # Обработка медиа-файлов
│   │   └── ticketHelper.js        # Операции с тикетами
│   ├── middleware/            # Middleware бота
│   │   └── index.js              # Локализация и отслеживание пользователей
│   ├── utils/                 # Основные утилиты
│   │   ├── fileUtils.js          # Операции с файлами
│   │   ├── localization.js       # Поддержка языков
│   │   ├── logger.js             # Структурированное логирование
│   │   └── stateUtils.js         # Управление состоянием
│   ├── config.js              # Загрузчик конфигурации
│   └── index.js               # Точка входа в приложение
├── data/
│   ├── locales/               # Языковые файлы
│   │   ├── en.json               # Английские переводы
│   │   └── ru.json               # Русские переводы
│   ├── tickets.json           # База данных тикетов (создается автоматически)
│   └── users.json             # База данных пользователей (создается автоматически)
├── logs/                      # Логи приложения
├── media/                     # Загруженные медиа-файлы
├── .env                       # Переменные окружения (не в git)
├── .env.example               # Шаблон окружения
├── .gitignore                 # Правила игнорирования git
├── package.json               # Зависимости и скрипты
└── README.md                  # Этот файл
```

### 📖 Использование

#### Для пользователей

1. **Запустите бота**
   ```
   /start
   ```

2. **Выберите язык**
   - Выберите между английским и русским

3. **Создайте тикет**
   - Нажмите кнопку "🆕 Создать тикет"
   - Отправьте ваше сообщение (текст, фото, видео, документ)
   - Тикет будет создан в группе поддержки

4. **Отвечайте в тикетах**
   - Используйте кнопку "✍️ Написать в тикет"
   - Или отвечайте напрямую на уведомления о тикетах

5. **Просмотр тикетов**
   - Нажмите "📁 Мои тикеты" для просмотра всех ваших тикетов
   - Нажмите на тикет для просмотра истории

6. **Смена языка**
   ```
   /lang
   ```

#### Для администраторов

Доступ к админ-панели в группе поддержки:

```
/admin
```

**Возможности админ-панели:**

- 📂 **Все тикеты** - Просмотр и управление всеми тикетами
  - Открытые тикеты с прямыми ссылками
  - Закрытые тикеты с полной историей
  - Поиск по ID тикета

- 👥 **Управление пользователями**
  - Просмотр всех пользователей с активностью
  - Бан/разбан пользователей
  - Просмотр статистики пользователей
  - Поиск пользователей по ID или @username

- 🔍 **Функции поиска**
  - Быстрый поиск тикета по ID
  - Поиск пользователей с детальной информацией

- ⏸️ **Режим паузы**
  - Отключение создания тикетов для обычных пользователей
  - Функция экстренной паузы

**В группе поддержки:**

- Ответьте на любое сообщение в треде тикета для ответа
- Напишите `/close` или `close` для закрытия тикета
- Напишите `/ban` или `ban` для бана пользователя и закрытия тикета

### 🔧 Команды {#команды-ru}

#### Команды пользователей

| Команда | Описание |
|---------|----------|
| `/start` | Запустить бота и показать главное меню |
| `/lang` | Изменить язык |

#### Команды администраторов (группа поддержки)

| Команда | Описание |
|---------|----------|
| `/admin` | Открыть админ-панель |
| `close` или `/close` | Закрыть текущий тикет |
| `ban` или `/ban` | Забанить пользователя и закрыть тикет |

### 👨‍💻 Разработка

#### Запуск в режиме разработки

```bash
npm run dev
```

Использует nodemon для автоматической перезагрузки при изменении файлов.

#### Структура файлов

- **Handlers** - Вся логика взаимодействия с пользователем
- **Helpers** - Переиспользуемые вспомогательные функции
- **Middleware** - Предобработка запросов
- **Utils** - Основной функционал (файлы, логирование, состояние)

### 🤝 Вклад в проект

Вклад приветствуется! Пожалуйста, не стесняйтесь отправлять Pull Request.

1. Сделайте Fork репозитория
2. Создайте ветку для вашей функции (`git checkout -b feature/AmazingFeature`)
3. Закоммитьте ваши изменения (`git commit -m 'Add some AmazingFeature'`)
4. Запушьте в ветку (`git push origin feature/AmazingFeature`)
5. Откройте Pull Request

### 📄 Лицензия {#лицензия-ru}

Этот проект лицензирован под лицензией MIT - см. файл [LICENSE](LICENSE) для деталей.

### 💬 Поддержка

Если у вас есть вопросы или проблемы, пожалуйста, откройте issue на GitHub.

---

<div align="center">

**Made with ❤️ for Telegram Support**

[⬆ Back to top](#-telegram-support-bot)

</div>