const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const app = require('./index');

test('registers the public, account and content-management routes', () => {
  const routes = app.router.stack
    .filter((layer) => layer.route)
    .map((layer) => layer.route.path);

  assert.ok(routes.includes('/api/health'));
  assert.ok(routes.includes('/api/courses'));
  assert.ok(routes.includes('/api/notes'));
  assert.ok(routes.includes('/api/auth/register'));
  assert.ok(routes.includes('/api/auth/login'));
  assert.ok(routes.includes('/api/profile'));
  assert.ok(routes.includes('/api/flashcards'));
  assert.ok(routes.includes('/api/admin/reports'));
  assert.ok(routes.includes('/{*splat}'));

  const indexHtml = fs.readFileSync(
    path.join(__dirname, 'public', 'index.html'),
    'utf8'
  );
  assert.match(indexHtml, /<div id="app"><\/div>/);
  assert.match(indexHtml, /NotesBuddy/);
});
