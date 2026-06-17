const express = require('express');
const cors = require('cors');
const path = require('path');
const db = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.get('/api/courses', (req, res) => {
  db.all("SELECT * FROM courses", [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.post('/api/courses', (req, res) => {
  const { name, professor } = req.body;
  if (!name || !professor) {
    return res.status(400).json({ error: '課程名稱與教授皆為必填' });
  }
  db.run("INSERT INTO courses (name, professor) VALUES (?, ?)", [name, professor], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ id: this.lastID, name, professor });
  });
});

app.get('/api/notes', (req, res) => {
  const { course_id } = req.query;
  let sql = "SELECT notes.*, courses.name as course_name FROM notes JOIN courses ON notes.course_id = courses.id";
  let params = [];

  if (course_id) {
    sql += " WHERE notes.course_id = ?";
    params.push(course_id);
  }

  db.all(sql, params, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.post('/api/notes', (req, res) => {
  const { course_id, title, semester, type, link, contributor } = req.body;
  if (!course_id || !title || !semester || !type || !link) {
    return res.status(400).json({ error: '請填寫所有必填欄位' });
  }
  const sql = "INSERT INTO notes (course_id, title, semester, type, link, contributor) VALUES (?, ?, ?, ?, ?, ?)";
  
  db.run(sql, [course_id, title, semester, type, link, contributor || '匿名學長姐'], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ id: this.lastID, msg: "分享成功！" });
  });
});

const publicDirectory = path.join(__dirname, 'public');
app.use(express.static(publicDirectory));

// Vue is a single-page app. Non-API routes should render its entry page.
app.get('/{*splat}', (_req, res) => {
  res.sendFile(path.join(publicDirectory, 'index.html'));
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`🚀 後端伺服器已成功啟動：http://localhost:${PORT}`);
  });
}

module.exports = app;
