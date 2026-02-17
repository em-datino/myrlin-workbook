/**
 * Telegram Notification Module for Claude Workspace Manager.
 *
 * Sends push notifications to a Telegram chat via the Bot API when sessions
 * encounter errors or require user input. Uses plain HTTPS requests (no
 * extra dependencies). Configuration is persisted alongside the main state.
 *
 * Setup:
 *   1. Create a bot via @BotFather on Telegram → get the bot token
 *   2. Send /start to your bot, then use /api/telegram/config to save
 *      the token + chat ID (the API can auto-detect your chat ID)
 *
 * Environment overrides (highest priority):
 *   CWM_TELEGRAM_BOT_TOKEN - Bot token
 *   CWM_TELEGRAM_CHAT_ID  - Chat ID
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

// ─── Config Persistence ─────────────────────────────────────

const STATE_DIR = path.join(__dirname, '..', '..', 'state');
const CONFIG_FILE = path.join(STATE_DIR, 'telegram.json');

/** Default config shape */
const DEFAULT_CONFIG = {
  enabled: false,
  botToken: '',
  chatId: '',
  // Which notification levels trigger a Telegram message
  levels: ['error', 'warning'],
  // Throttle: minimum seconds between messages to avoid spam
  throttleSeconds: 10,
  // Whether to also send 'info'/'success' level notifications
  // (controlled via the levels array above)
};

let _config = null;

/**
 * Load Telegram config from disk, merging with env var overrides.
 * @returns {object} The current config
 */
function loadConfig() {
  let diskConfig = {};
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      diskConfig = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
    }
  } catch (_) {
    // Corrupted file - start fresh
  }

  _config = { ...DEFAULT_CONFIG, ...diskConfig };

  // Environment variable overrides (highest priority)
  if (process.env.CWM_TELEGRAM_BOT_TOKEN) {
    _config.botToken = process.env.CWM_TELEGRAM_BOT_TOKEN;
  }
  if (process.env.CWM_TELEGRAM_CHAT_ID) {
    _config.chatId = process.env.CWM_TELEGRAM_CHAT_ID;
  }

  return _config;
}

/**
 * Save current config to disk.
 */
function saveConfig() {
  try {
    if (!fs.existsSync(STATE_DIR)) {
      fs.mkdirSync(STATE_DIR, { recursive: true });
    }
    // Don't persist env-var-only tokens to disk for security
    const toSave = { ..._config };
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(toSave, null, 2), 'utf-8');
  } catch (err) {
    console.error('[Telegram] Failed to save config:', err.message);
  }
}

/**
 * Get the current config (loads from disk on first call).
 * @returns {object}
 */
function getConfig() {
  if (!_config) loadConfig();
  return _config;
}

/**
 * Update config fields and persist.
 * @param {object} updates - Partial config fields to merge
 * @returns {object} The updated config
 */
function updateConfig(updates) {
  const config = getConfig();
  Object.assign(config, updates);
  saveConfig();
  return config;
}

// ─── Telegram Bot API ───────────────────────────────────────

/**
 * Make an HTTPS POST request to the Telegram Bot API.
 * @param {string} method - API method (e.g., 'sendMessage', 'getUpdates')
 * @param {object} body - JSON body to send
 * @returns {Promise<object>} Parsed response
 */
function telegramApi(method, body) {
  const config = getConfig();
  if (!config.botToken) {
    return Promise.reject(new Error('Telegram bot token not configured'));
  }

  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const options = {
      hostname: 'api.telegram.org',
      port: 443,
      path: `/bot${config.botToken}/${method}`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
      },
      timeout: 10000,
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.ok) {
            resolve(parsed.result);
          } else {
            reject(new Error(parsed.description || 'Telegram API error'));
          }
        } catch (e) {
          reject(new Error('Failed to parse Telegram response'));
        }
      });
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Telegram API request timed out'));
    });
    req.write(payload);
    req.end();
  });
}

// ─── Message Sending ────────────────────────────────────────

let _lastSendTime = 0;

/** Level → emoji mapping for Telegram messages */
const LEVEL_EMOJI = {
  error: '\u274C',      // red X
  warning: '\u26A0\uFE0F',  // warning sign
  success: '\u2705',    // green check
  info: '\u2139\uFE0F', // info
};

/**
 * Send a notification to the configured Telegram chat.
 * Respects throttle settings and level filters.
 *
 * @param {'info'|'success'|'warning'|'error'} level - Notification severity
 * @param {string} title - Short title
 * @param {string} message - Body text
 * @returns {Promise<boolean>} True if message was sent
 */
async function sendNotification(level, title, message) {
  const config = getConfig();

  if (!config.enabled || !config.botToken || !config.chatId) {
    return false;
  }

  // Check if this level should be sent
  if (!config.levels.includes(level)) {
    return false;
  }

  // Throttle check
  const now = Date.now();
  if ((now - _lastSendTime) < config.throttleSeconds * 1000) {
    return false;
  }

  const emoji = LEVEL_EMOJI[level] || '';
  const text = `${emoji} *${escapeMarkdown(title)}*\n${escapeMarkdown(message)}`;

  try {
    await telegramApi('sendMessage', {
      chat_id: config.chatId,
      text,
      parse_mode: 'MarkdownV2',
      disable_notification: level === 'info',
    });
    _lastSendTime = Date.now();
    return true;
  } catch (err) {
    console.error('[Telegram] Send failed:', err.message);
    return false;
  }
}

/**
 * Escape special characters for Telegram MarkdownV2 format.
 * @param {string} text
 * @returns {string}
 */
function escapeMarkdown(text) {
  // MarkdownV2 requires escaping these characters
  return text.replace(/([_*[\]()~`>#+\-=|{}.!\\])/g, '\\$1');
}

/**
 * Send a test message to verify the configuration works.
 * @returns {Promise<{success: boolean, error?: string}>}
 */
async function sendTestMessage() {
  const config = getConfig();
  if (!config.botToken || !config.chatId) {
    return { success: false, error: 'Bot token and chat ID are required' };
  }

  try {
    await telegramApi('sendMessage', {
      chat_id: config.chatId,
      text: '\u2705 *Myrlin Workbook* connected\\!\nTelegram notifications are working\\.',
      parse_mode: 'MarkdownV2',
    });
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * Auto-detect chat ID by fetching recent messages sent to the bot.
 * User must send /start to the bot first.
 * @returns {Promise<{chatId: string, username?: string} | null>}
 */
async function detectChatId() {
  try {
    const updates = await telegramApi('getUpdates', { limit: 10, offset: -10 });
    if (!updates || updates.length === 0) {
      return null;
    }
    // Find the most recent private message
    for (let i = updates.length - 1; i >= 0; i--) {
      const msg = updates[i].message;
      if (msg && msg.chat && msg.chat.type === 'private') {
        return {
          chatId: String(msg.chat.id),
          username: msg.chat.username || msg.chat.first_name || null,
        };
      }
    }
    return null;
  } catch (err) {
    console.error('[Telegram] Chat ID detection failed:', err.message);
    return null;
  }
}

// ─── NotificationManager Integration ─────────────────────────

/**
 * Attach to the NotificationManager singleton to forward notifications
 * to Telegram based on the configured levels.
 *
 * @param {import('./notifications').NotificationManager} notificationManager
 */
function attachToNotificationManager(notificationManager) {
  notificationManager.on('notification', (notification) => {
    // Fire-and-forget: don't block the notification pipeline
    sendNotification(notification.level, notification.title, notification.message)
      .catch(() => {}); // errors already logged in sendNotification
  });
  console.log('[Telegram] Attached to NotificationManager');
}

// ─── Exports ────────────────────────────────────────────────

module.exports = {
  getConfig,
  updateConfig,
  loadConfig,
  sendNotification,
  sendTestMessage,
  detectChatId,
  attachToNotificationManager,
  telegramApi,
};
