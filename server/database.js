const { DatabaseSync } = require('node:sqlite');
const fs = require('fs');
const path = require('path');

// Azure App Service keeps /home between deployments. Locally, keep using the
// database beside this file so existing development data continues to work.
const defaultDataDirectory = process.env.WEBSITE_INSTANCE_ID
  ? '/home/data'
  : __dirname;
const dataDirectory = process.env.DATA_DIR || defaultDataDirectory;
fs.mkdirSync(dataDirectory, { recursive: true });

const databasePath = path.join(dataDirectory, 'campus_notes.db');
const database = new DatabaseSync(databasePath);
console.log(`SQLite 資料庫位置：${databasePath}`);

// Keep the small callback API used by the Express routes while using Node's
// built-in SQLite driver (available in the Node 22 runtime on Azure).
const db = {
  all(sql, params = [], callback) {
    try {
      callback(null, database.prepare(sql).all(...params));
    } catch (error) {
      callback(error);
    }
  },
  get(sql, params = [], callback) {
    try {
      callback(null, database.prepare(sql).get(...params));
    } catch (error) {
      callback(error);
    }
  },
  run(sql, params = [], callback = () => {}) {
    try {
      const result = database.prepare(sql).run(...params);
      callback.call({ lastID: Number(result.lastInsertRowid) }, null);
    } catch (error) {
      callback(error);
    }
  }
};

database.exec(`
    CREATE TABLE IF NOT EXISTS courses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      professor TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS notes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      course_id INTEGER,
      title TEXT NOT NULL,
      semester TEXT NOT NULL,
      type TEXT NOT NULL,
      link TEXT NOT NULL,
      contributor TEXT,
      FOREIGN KEY (course_id) REFERENCES courses(id)
    );
  `);

const { count } = database.prepare('SELECT count(*) AS count FROM courses').get();
if (count === 0) {
  database.exec(`
    INSERT INTO courses (name, professor) VALUES ('網頁程式設計', '張教授');
    INSERT INTO courses (name, professor) VALUES ('微積分(一)', '李微積');
    INSERT INTO notes (course_id, title, semester, type, link, contributor)
      VALUES (1, '114學年度期末網頁專題範例', '114-2', '課堂筆記', 'https://drive.google.com', '熱心學長');
    INSERT INTO notes (course_id, title, semester, type, link, contributor)
      VALUES (2, '113微積分期中考考古題解答', '113-1', '考古題', 'https://drive.google.com', '不具名學姊');
  `);
  console.log('🎉 SQLite 測試資料初始化成功！');
}

module.exports = db;
