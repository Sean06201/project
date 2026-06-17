const express = require('express');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const {
  database,
  uploadDirectory,
  backupDirectory,
  createBackup
} = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;
const SESSION_DAYS = 14;
const allowedTypes = ['考古題', '課堂筆記', '精華總整理'];

app.disable('x-powered-by');
app.use(express.json({ limit: '5mb' }));
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  next();
});

const attempts = new Map();
function rateLimit(keyPrefix, max, windowMs) {
  return (req, res, next) => {
    const key = `${keyPrefix}:${req.ip}`;
    const now = Date.now();
    const entry = attempts.get(key);
    if (!entry || entry.resetAt < now) {
      attempts.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }
    entry.count += 1;
    if (entry.count > max) {
      return res.status(429).json({ error: '操作太頻繁，請稍後再試' });
    }
    next();
  };
}

function route(handler) {
  return (req, res, next) => {
    try {
      const result = handler(req, res, next);
      if (result?.catch) result.catch(next);
    } catch (error) {
      next(error);
    }
  };
}

function text(value, maxLength) {
  return String(value || '').trim().slice(0, maxLength);
}

function parseCookies(req) {
  return Object.fromEntries(
    String(req.headers.cookie || '')
      .split(';')
      .map((part) => part.trim().split('='))
      .filter(([key, value]) => key && value)
      .map(([key, value]) => [key, decodeURIComponent(value)])
  );
}

function tokenHash(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  const [salt, expected] = String(stored).split(':');
  if (!salt || !expected) return false;
  const actual = crypto.scryptSync(password, salt, 64);
  const expectedBuffer = Buffer.from(expected, 'hex');
  return actual.length === expectedBuffer.length && crypto.timingSafeEqual(actual, expectedBuffer);
}

function publicUser(user) {
  return user && {
    id: Number(user.id),
    email: user.email,
    display_name: user.display_name,
    role: user.role,
    created_at: user.created_at
  };
}

function optionalAuth(req, _res, next) {
  const token = parseCookies(req).session;
  if (token) {
    req.user = database.prepare(`
      SELECT users.* FROM sessions
      JOIN users ON users.id = sessions.user_id
      WHERE sessions.token_hash = ? AND sessions.expires_at > CURRENT_TIMESTAMP
    `).get(tokenHash(token));
  }
  next();
}

function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ error: '請先登入' });
  next();
}

function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') return res.status(403).json({ error: '需要管理員權限' });
  next();
}

function setSession(res, userId) {
  const token = crypto.randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86400000);
  database.prepare('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)')
    .run(tokenHash(token), userId, expiresAt.toISOString());
  const secure = process.env.WEBSITE_INSTANCE_ID ? '; Secure' : '';
  res.setHeader('Set-Cookie', `session=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_DAYS * 86400}${secure}`);
}

app.use('/api', optionalAuth);

app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));

app.get('/api/stats', route((_req, res) => {
  const stats = database.prepare(`
    SELECT
      (SELECT COUNT(*) FROM notes WHERE status = 'published') AS notes,
      (SELECT COUNT(*) FROM courses) AS courses,
      (SELECT COUNT(*) FROM users) AS members
  `).get();
  res.json(stats);
}));

app.post('/api/auth/register', rateLimit('register', 8, 3600000), route((req, res) => {
  const email = text(req.body.email, 120).toLowerCase();
  const displayName = text(req.body.display_name, 40);
  const password = String(req.body.password || '');
  if (!/^\S+@\S+\.\S+$/.test(email)) return res.status(400).json({ error: 'Email 格式不正確' });
  if (displayName.length < 2) return res.status(400).json({ error: '暱稱至少需要 2 個字' });
  if (password.length < 8) return res.status(400).json({ error: '密碼至少需要 8 個字元' });
  if (database.prepare('SELECT id FROM users WHERE email = ?').get(email)) {
    return res.status(409).json({ error: '這個 Email 已經註冊' });
  }
  const inviteCode = String(req.body.admin_code || '');
  const hasAdmin = database.prepare("SELECT id FROM users WHERE role = 'admin'").get();
  const role = process.env.ADMIN_INVITE_CODE && !hasAdmin && inviteCode === process.env.ADMIN_INVITE_CODE ? 'admin' : 'user';
  const result = database.prepare(`
    INSERT INTO users (email, display_name, password_hash, role) VALUES (?, ?, ?, ?)
  `).run(email, displayName, hashPassword(password), role);
  setSession(res, Number(result.lastInsertRowid));
  const user = database.prepare('SELECT * FROM users WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json({ user: publicUser(user) });
}));

app.post('/api/auth/login', rateLimit('login', 20, 3600000), route((req, res) => {
  const email = text(req.body.email, 120).toLowerCase();
  const user = database.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!user || !verifyPassword(String(req.body.password || ''), user.password_hash)) {
    return res.status(401).json({ error: 'Email 或密碼不正確' });
  }
  database.prepare('DELETE FROM sessions WHERE expires_at <= CURRENT_TIMESTAMP').run();
  setSession(res, user.id);
  res.json({ user: publicUser(user) });
}));

app.post('/api/auth/logout', route((req, res) => {
  const token = parseCookies(req).session;
  if (token) database.prepare('DELETE FROM sessions WHERE token_hash = ?').run(tokenHash(token));
  res.setHeader('Set-Cookie', 'session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0');
  res.json({ ok: true });
}));

app.get('/api/auth/me', route((req, res) => {
  res.json({ user: publicUser(req.user) || null });
}));

app.get('/api/courses', route((_req, res) => {
  res.json(database.prepare(`
    SELECT courses.*, COUNT(notes.id) AS note_count
    FROM courses LEFT JOIN notes ON notes.course_id = courses.id AND notes.status = 'published'
    GROUP BY courses.id ORDER BY courses.name
  `).all());
}));

app.post('/api/courses', requireAdmin, route((req, res) => {
  const name = text(req.body.name, 80);
  const professor = text(req.body.professor, 50);
  if (!name || !professor) return res.status(400).json({ error: '課程名稱與教授皆為必填' });
  const result = database.prepare('INSERT INTO courses (name, professor) VALUES (?, ?)').run(name, professor);
  res.status(201).json({ id: Number(result.lastInsertRowid), name, professor });
}));

app.get('/api/notes', route((req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(24, Math.max(1, Number(req.query.limit) || 9));
  const conditions = [];
  const params = [];
  const isAdminView = req.user?.role === 'admin' && req.query.status;
  conditions.push(isAdminView ? 'notes.status = ?' : "notes.status = 'published'");
  if (isAdminView) params.push(req.query.status);
  if (req.query.course_id) { conditions.push('notes.course_id = ?'); params.push(Number(req.query.course_id)); }
  if (req.query.type) { conditions.push('notes.type = ?'); params.push(text(req.query.type, 20)); }
  if (req.query.semester) { conditions.push('notes.semester = ?'); params.push(text(req.query.semester, 20)); }
  if (req.query.q) {
    conditions.push('(notes.title LIKE ? OR notes.description LIKE ? OR courses.name LIKE ? OR courses.professor LIKE ?)');
    const query = `%${text(req.query.q, 80)}%`;
    params.push(query, query, query, query);
  }
  if (req.query.mine === '1' && req.user) { conditions.push('notes.user_id = ?'); params.push(req.user.id); }
  if (req.query.bookmarked === '1' && req.user) { conditions.push('bookmarks.user_id = ?'); params.push(req.user.id); }

  const joins = `
    JOIN courses ON courses.id = notes.course_id
    LEFT JOIN users ON users.id = notes.user_id
    LEFT JOIN bookmarks ON bookmarks.note_id = notes.id${req.user ? ' AND bookmarks.user_id = ?' : ' AND 1 = 0'}
  `;
  const joinParams = req.user ? [req.user.id] : [];
  const where = `WHERE ${conditions.join(' AND ')}`;
  const sort = req.query.sort === 'oldest' ? 'notes.created_at ASC' : req.query.sort === 'title' ? 'notes.title ASC' : 'notes.created_at DESC';
  const total = database.prepare(`SELECT COUNT(DISTINCT notes.id) AS count FROM notes ${joins} ${where}`)
    .get(...joinParams, ...params).count;
  const items = database.prepare(`
    SELECT notes.*, courses.name AS course_name, courses.professor,
      COALESCE(users.display_name, notes.contributor, '匿名學長姐') AS contributor_name,
      CASE WHEN bookmarks.user_id IS NULL THEN 0 ELSE 1 END AS bookmarked
    FROM notes ${joins} ${where}
    GROUP BY notes.id ORDER BY ${sort} LIMIT ? OFFSET ?
  `).all(...joinParams, ...params, limit, (page - 1) * limit);
  res.json({ items, page, pages: Math.max(1, Math.ceil(Number(total) / limit)), total: Number(total) });
}));

function validateNote(body) {
  const note = {
    course_id: Number(body.course_id),
    title: text(body.title, 120),
    semester: text(body.semester, 20),
    type: text(body.type, 20),
    link: text(body.link, 600),
    description: text(body.description, 500)
  };
  if (!note.course_id || !note.title || !note.semester || !allowedTypes.includes(note.type) || !note.link) {
    return { error: '請完整填寫課程、標題、學期、類型與資源' };
  }
  if (!note.link.startsWith('/uploads/')) {
    try {
      const url = new URL(note.link);
      if (!['http:', 'https:'].includes(url.protocol)) throw new Error();
    } catch {
      return { error: '資源連結格式不正確' };
    }
  }
  return { note };
}

app.post('/api/notes', requireAuth, rateLimit('notes', 20, 3600000), route((req, res) => {
  const { note, error } = validateNote(req.body);
  if (error) return res.status(400).json({ error });
  const result = database.prepare(`
    INSERT INTO notes (course_id, title, semester, type, link, contributor, user_id, description, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'published', CURRENT_TIMESTAMP)
  `).run(note.course_id, note.title, note.semester, note.type, note.link, req.user.display_name, req.user.id, note.description);
  res.status(201).json({ id: Number(result.lastInsertRowid), message: '分享成功' });
}));

app.put('/api/notes/:id', requireAuth, route((req, res) => {
  const existing = database.prepare('SELECT * FROM notes WHERE id = ?').get(Number(req.params.id));
  if (!existing) return res.status(404).json({ error: '找不到資源' });
  if (existing.user_id !== req.user.id && req.user.role !== 'admin') return res.status(403).json({ error: '沒有編輯權限' });
  const { note, error } = validateNote(req.body);
  if (error) return res.status(400).json({ error });
  database.prepare(`UPDATE notes SET course_id=?, title=?, semester=?, type=?, link=?, description=? WHERE id=?`)
    .run(note.course_id, note.title, note.semester, note.type, note.link, note.description, existing.id);
  res.json({ ok: true });
}));

app.delete('/api/notes/:id', requireAuth, route((req, res) => {
  const existing = database.prepare('SELECT * FROM notes WHERE id = ?').get(Number(req.params.id));
  if (!existing) return res.status(404).json({ error: '找不到資源' });
  if (existing.user_id !== req.user.id && req.user.role !== 'admin') return res.status(403).json({ error: '沒有刪除權限' });
  database.prepare('DELETE FROM notes WHERE id = ?').run(existing.id);
  res.json({ ok: true });
}));

app.post('/api/notes/:id/bookmark', requireAuth, route((req, res) => {
  const noteId = Number(req.params.id);
  const existing = database.prepare('SELECT 1 FROM bookmarks WHERE user_id = ? AND note_id = ?').get(req.user.id, noteId);
  if (existing) database.prepare('DELETE FROM bookmarks WHERE user_id = ? AND note_id = ?').run(req.user.id, noteId);
  else database.prepare('INSERT INTO bookmarks (user_id, note_id) VALUES (?, ?)').run(req.user.id, noteId);
  res.json({ bookmarked: !existing });
}));

app.post('/api/notes/:id/report', requireAuth, rateLimit('reports', 10, 3600000), route((req, res) => {
  const reason = text(req.body.reason, 300);
  if (reason.length < 5) return res.status(400).json({ error: '請簡短說明檢舉原因' });
  if (!database.prepare("SELECT id FROM notes WHERE id = ? AND status = 'published'").get(Number(req.params.id))) {
    return res.status(404).json({ error: '找不到資源' });
  }
  database.prepare('INSERT INTO reports (note_id, user_id, reason) VALUES (?, ?, ?)')
    .run(Number(req.params.id), req.user.id, reason);
  res.status(201).json({ ok: true });
}));

app.post('/api/uploads', requireAuth, rateLimit('uploads', 10, 3600000), route((req, res) => {
  const mime = text(req.body.mime, 80);
  const extensions = { 'application/pdf': 'pdf', 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' };
  const extension = extensions[mime];
  if (!extension) return res.status(400).json({ error: '僅支援 PDF、PNG、JPG 或 WebP' });
  const payload = String(req.body.data || '').replace(/^data:[^;]+;base64,/, '');
  const buffer = Buffer.from(payload, 'base64');
  if (!buffer.length || buffer.length > 3 * 1024 * 1024) return res.status(400).json({ error: '檔案需小於 3MB' });
  const filename = `${Date.now()}-${crypto.randomBytes(8).toString('hex')}.${extension}`;
  fs.writeFileSync(path.join(uploadDirectory, filename), buffer, { flag: 'wx' });
  res.status(201).json({ url: `/uploads/${filename}` });
}));

app.get('/api/profile', requireAuth, route((req, res) => {
  const stats = database.prepare(`
    SELECT
      (SELECT COUNT(*) FROM notes WHERE user_id = ?) AS contributions,
      (SELECT COUNT(*) FROM bookmarks WHERE user_id = ?) AS bookmarks,
      (SELECT COUNT(*) FROM flashcards WHERE user_id = ?) AS flashcards
  `).get(req.user.id, req.user.id, req.user.id);
  res.json({ user: publicUser(req.user), stats });
}));

app.get('/api/flashcards', requireAuth, route((req, res) => {
  res.json(database.prepare(`
    SELECT flashcards.*, courses.name AS course_name FROM flashcards
    LEFT JOIN courses ON courses.id = flashcards.course_id
    WHERE user_id = ? ORDER BY created_at DESC
  `).all(req.user.id));
}));

app.post('/api/flashcards', requireAuth, route((req, res) => {
  const front = text(req.body.front, 300);
  const back = text(req.body.back, 600);
  const courseId = Number(req.body.course_id) || null;
  if (!front || !back) return res.status(400).json({ error: '卡片正反面皆為必填' });
  const result = database.prepare('INSERT INTO flashcards (user_id, course_id, front, back) VALUES (?, ?, ?, ?)')
    .run(req.user.id, courseId, front, back);
  res.status(201).json({ id: Number(result.lastInsertRowid) });
}));

app.delete('/api/flashcards/:id', requireAuth, route((req, res) => {
  database.prepare('DELETE FROM flashcards WHERE id = ? AND user_id = ?').run(Number(req.params.id), req.user.id);
  res.json({ ok: true });
}));

app.get('/api/admin/reports', requireAdmin, route((_req, res) => {
  res.json(database.prepare(`
    SELECT reports.*, notes.title AS note_title, users.display_name AS reporter
    FROM reports JOIN notes ON notes.id = reports.note_id JOIN users ON users.id = reports.user_id
    ORDER BY reports.created_at DESC
  `).all());
}));

app.patch('/api/admin/reports/:id', requireAdmin, route((req, res) => {
  const status = ['pending', 'resolved', 'dismissed'].includes(req.body.status) ? req.body.status : 'pending';
  database.prepare('UPDATE reports SET status = ? WHERE id = ?').run(status, Number(req.params.id));
  res.json({ ok: true });
}));

app.patch('/api/admin/notes/:id', requireAdmin, route((req, res) => {
  const status = ['published', 'hidden'].includes(req.body.status) ? req.body.status : 'published';
  database.prepare('UPDATE notes SET status = ? WHERE id = ?').run(status, Number(req.params.id));
  res.json({ ok: true });
}));

app.post('/api/admin/backup', requireAdmin, route((_req, res) => {
  const backupPath = createBackup();
  res.json({ file: path.basename(backupPath) });
}));

app.get('/api/admin/backups/:name', requireAdmin, route((req, res) => {
  const safeName = path.basename(req.params.name);
  const filePath = path.join(backupDirectory, safeName);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: '找不到備份' });
  res.download(filePath);
}));

app.use('/uploads', express.static(uploadDirectory, {
  fallthrough: false,
  setHeaders(res, filePath) {
    if (path.extname(filePath).toLowerCase() === '.pdf') res.setHeader('Content-Disposition', 'attachment');
  }
}));

const publicDirectory = path.join(__dirname, 'public');
app.use(express.static(publicDirectory));
app.get('/{*splat}', (_req, res) => res.sendFile(path.join(publicDirectory, 'index.html')));

app.use((error, _req, res, _next) => {
  console.error(error);
  if (res.headersSent) return;
  res.status(500).json({ error: '伺服器暫時無法處理，請稍後再試' });
});

if (require.main === module) {
  app.listen(PORT, () => console.log(`🚀 伺服器已啟動：http://localhost:${PORT}`));
}

module.exports = app;
