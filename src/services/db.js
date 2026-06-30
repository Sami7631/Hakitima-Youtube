const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, '../../db.json');

// Varsayılan boş veritabanı şablonu
const defaultData = {
  guilds: {},
  reminders: []
};

// Veritabanını oku
function readDb() {
  try {
    if (!fs.existsSync(DB_PATH)) {
      writeDb(defaultData);
      return defaultData;
    }
    const raw = fs.readFileSync(DB_PATH, 'utf8');
    return JSON.parse(raw);
  } catch (error) {
    console.error('db.json okuma hatası, sıfırlanıyor:', error.message);
    return defaultData;
  }
}

// Veritabanına yaz
function writeDb(data) {
  try {
    fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2), 'utf8');
  } catch (error) {
    console.error('db.json yazma hatası:', error.message);
  }
}

// Belirli bir sunucu (guild) verisini getir
function getGuildData(guildId) {
  const db = readDb();
  if (!db.guilds[guildId]) {
    db.guilds[guildId] = {
      youtubeChannelId: null,
      notifyChannelId: null,
      lastVideoId: null,
      subscriberCounterChannelId: null,
      subscriberGoal: null,
      subscriberGoalValue: 1000,
      aiProvider: 'gemini',
      aiApiKey: null
    };
    writeDb(db);
  }
  return db.guilds[guildId];
}

// Belirli bir sunucu verisini güncelle
function updateGuildData(guildId, updates) {
  const db = readDb();
  db.guilds[guildId] = {
    ...getGuildData(guildId),
    ...updates
  };
  writeDb(db);
  return db.guilds[guildId];
}

// Hatırlatıcı ekle
function addReminder(reminder) {
  const db = readDb();
  db.reminders.push(reminder);
  writeDb(db);
}

// Süresi gelen hatırlatıcıları getir ve veritabanından sil
function checkReminders() {
  const db = readDb();
  const now = Date.now();
  const triggered = db.reminders.filter(r => r.timestamp <= now);
  db.reminders = db.reminders.filter(r => r.timestamp > now);
  if (triggered.length > 0) {
    writeDb(db);
  }
  return triggered;
}

module.exports = {
  readDb,
  writeDb,
  getGuildData,
  updateGuildData,
  addReminder,
  checkReminders
};
