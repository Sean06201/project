const test = require('node:test');
const assert = require('node:assert/strict');
const { database } = require('./database');

test('keeps existing content and applies collaboration schema migrations', () => {
  const tables = database.prepare(`
    SELECT name FROM sqlite_master WHERE type = 'table'
  `).all().map((row) => row.name);

  for (const table of ['courses', 'notes', 'users', 'sessions', 'bookmarks', 'reports', 'flashcards']) {
    assert.ok(tables.includes(table), `missing table: ${table}`);
  }

  const noteColumns = database.prepare('PRAGMA table_info(notes)').all().map((column) => column.name);
  for (const column of ['user_id', 'description', 'status', 'created_at']) {
    assert.ok(noteColumns.includes(column), `missing notes column: ${column}`);
  }

  assert.ok(database.prepare('SELECT COUNT(*) AS count FROM courses').get().count >= 2);
  assert.ok(database.prepare("SELECT COUNT(*) AS count FROM notes WHERE status = 'published'").get().count >= 2);
});
