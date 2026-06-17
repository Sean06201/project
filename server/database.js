const { DatabaseSync } = require('node:sqlite');
const fs = require('fs');
const path = require('path');

const defaultDataDirectory = process.env.WEBSITE_INSTANCE_ID ? '/home/data' : __dirname;
const dataDirectory = process.env.DATA_DIR || defaultDataDirectory;
const uploadDirectory = path.join(dataDirectory, 'uploads');
const backupDirectory = path.join(dataDirectory, 'backups');

fs.mkdirSync(dataDirectory, { recursive: true });
fs.mkdirSync(uploadDirectory, { recursive: true });
fs.mkdirSync(backupDirectory, { recursive: true });

const databasePath = path.join(dataDirectory, 'campus_notes.db');
const migrationBackupPath = path.join(backupDirectory, 'campus_notes-before-collaboration-upgrade.db');
if (fs.existsSync(databasePath) && !fs.existsSync(migrationBackupPath)) {
  fs.copyFileSync(databasePath, migrationBackupPath);
  console.log(`升級前備份完成：${migrationBackupPath}`);
}
const database = new DatabaseSync(databasePath);
database.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;');
console.log(`SQLite 資料庫位置：${databasePath}`);

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

  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL UNIQUE COLLATE NOCASE,
    display_name TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'user',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    expires_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS bookmarks (
    user_id INTEGER NOT NULL,
    note_id INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, note_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (note_id) REFERENCES notes(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    note_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    reason TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (note_id) REFERENCES notes(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS flashcards (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    course_id INTEGER,
    front TEXT NOT NULL,
    back TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE SET NULL
  );
`);

function ensureColumn(table, name, definition) {
  const columns = database.prepare(`PRAGMA table_info(${table})`).all();
  if (!columns.some((column) => column.name === name)) {
    database.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${definition}`);
  }
}

ensureColumn('notes', 'user_id', 'INTEGER REFERENCES users(id)');
ensureColumn('notes', 'description', "TEXT NOT NULL DEFAULT ''");
ensureColumn('notes', 'status', "TEXT NOT NULL DEFAULT 'published'");
ensureColumn('notes', 'created_at', "TEXT NOT NULL DEFAULT ''");
database.exec(`
  UPDATE notes SET created_at = CURRENT_TIMESTAMP WHERE created_at = '';
  CREATE INDEX IF NOT EXISTS idx_notes_status_created ON notes(status, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_notes_course ON notes(course_id);
  CREATE INDEX IF NOT EXISTS idx_sessions_expiry ON sessions(expires_at);
`);

const { count } = database.prepare('SELECT count(*) AS count FROM courses').get();
if (count === 0) {
  database.exec(`
    INSERT INTO courses (name, professor) VALUES ('網頁程式設計', '張教授');
    INSERT INTO courses (name, professor) VALUES ('微積分(一)', '李微積');
    INSERT INTO notes (course_id, title, semester, type, link, contributor, description, status, created_at)
      VALUES (1, '114學年度期末網頁專題範例', '114-2', '課堂筆記', 'https://drive.google.com', '熱心學長', '網頁專題整理與範例資源。', 'published', CURRENT_TIMESTAMP);
    INSERT INTO notes (course_id, title, semester, type, link, contributor, description, status, created_at)
      VALUES (2, '113微積分期中考考古題解答', '113-1', '考古題', 'https://drive.google.com', '不具名學姊', '期中考題目與詳解。', 'published', CURRENT_TIMESTAMP);
  `);
}

function createBackup() {
  const stamp = new Date().toISOString().slice(0, 10);
  const backupPath = path.join(backupDirectory, `campus_notes-${stamp}.db`);
  if (!fs.existsSync(backupPath)) {
    const escapedPath = backupPath.replaceAll("'", "''");
    database.exec(`VACUUM INTO '${escapedPath}'`);
    console.log(`資料庫備份完成：${backupPath}`);
  }
  return backupPath;
}

try {
  createBackup();
} catch (error) {
  console.error('自動備份失敗：', error.message);
}

module.exports = {
  database,
  databasePath,
  dataDirectory,
  uploadDirectory,
  backupDirectory,
  createBackup
};
