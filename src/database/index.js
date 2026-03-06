import * as SQLite from 'expo-sqlite';

const db = SQLite.openDatabaseSync('alarm.db');

export const initDatabase = () => {
  db.execSync(
    'CREATE TABLE IF NOT EXISTS alarms (id INTEGER PRIMARY KEY AUTOINCREMENT, time TEXT, is_recurring INTEGER);'
  );

  db.execSync(
    'CREATE TABLE IF NOT EXISTS unlock_codes (id INTEGER PRIMARY KEY AUTOINCREMENT, code TEXT);'
  );

  const existingCodes = db.getAllSync('SELECT * FROM unlock_codes;');
  if (existingCodes.length === 0) {
    const initialCodes = [
        '二度寝は地獄',
        '太陽が昇ったぞ',
        '布団から出ろ',
        '遅刻確定ですよ',
        '顔を洗ってこい',
        '自分に打ち勝て',
        '限界を超えろ',
        'もう朝ですよ',
        'コーヒーを飲め',
        '気合いで起きろ'
    ];
    initialCodes.forEach(code => {
      db.runSync('INSERT INTO unlock_codes (code) VALUES (?);', [code]);
    });
  }
};

export const getAlarms = () => {
  return db.getAllSync('SELECT * FROM alarms;');
};

export const addAlarm = (time, isRecurring) => {
  db.runSync(
    'INSERT INTO alarms (time, is_recurring) VALUES (?, ?);', 
    [time, isRecurring ? 1 : 0]
  );
};

export const deleteAlarm = (id) => {
  db.runSync('DELETE FROM alarms WHERE id = ?;', [id]);
};

export const getUnlockCodes = () => {
  return db.getAllSync('SELECT * FROM unlock_codes;');
};
