const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const path = require('path');
const { pool, init } = require('./db');

const app = express();
const PORT = process.env.PORT || 4000;

const SUPERADMIN_USER = 'Superadmin';
const SUPERADMIN_PASS = ')z5fmwkQVrBKao5LvQ0kqhxm';

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret: 'gestioneutenti-secret-2024',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 8 * 60 * 60 * 1000 },
}));
app.use(express.static(path.join(__dirname, 'public')));

function requireAuth(req, res, next) {
  if (req.session.authenticated) return next();
  res.status(401).json({ error: 'Non autorizzato' });
}

// Auth
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  if (username === SUPERADMIN_USER && password === SUPERADMIN_PASS) {
    req.session.authenticated = true;
    res.json({ ok: true });
  } else {
    res.status(401).json({ error: 'Credenziali non valide' });
  }
});

app.post('/api/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

app.get('/api/me', (req, res) => {
  res.json({ authenticated: !!req.session.authenticated });
});

// Users
app.get('/api/users', requireAuth, async (req, res) => {
  const { rows } = await pool.query(`
    SELECT u.id, u.name, u.email, u.role, u.created_at,
      COALESCE(json_agg(json_build_object('id', t.id, 'name', t.name)) FILTER (WHERE t.id IS NOT NULL), '[]') AS tools
    FROM users u
    LEFT JOIN user_tools ut ON ut.user_id = u.id
    LEFT JOIN tools t ON t.id = ut.tool_id
    GROUP BY u.id ORDER BY u.created_at DESC
  `);
  res.json(rows);
});

app.post('/api/users', requireAuth, async (req, res) => {
  const { name, email, role, password } = req.body;
  if (!name || !email) return res.status(400).json({ error: 'Nome ed email obbligatori' });
  const hash = await bcrypt.hash(password || 'changeme123', 12);
  try {
    const { rows } = await pool.query(
      'INSERT INTO users (name, email, role, password_hash) VALUES ($1,$2,$3,$4) RETURNING id, name, email, role, created_at',
      [name, email, role || 'user', hash]
    );
    res.json(rows[0]);
  } catch (e) {
    if (e.code === '23505') return res.status(400).json({ error: 'Email già esistente' });
    throw e;
  }
});

app.put('/api/users/:id', requireAuth, async (req, res) => {
  const { name, email, role, password } = req.body;
  if (!name || !email) return res.status(400).json({ error: 'Nome ed email obbligatori' });
  let query, params;
  if (password) {
    const hash = await bcrypt.hash(password, 12);
    query = 'UPDATE users SET name=$1, email=$2, role=$3, password_hash=$4 WHERE id=$5 RETURNING id, name, email, role, created_at';
    params = [name, email, role || 'user', hash, req.params.id];
  } else {
    query = 'UPDATE users SET name=$1, email=$2, role=$3 WHERE id=$4 RETURNING id, name, email, role, created_at';
    params = [name, email, role || 'user', req.params.id];
  }
  const { rows } = await pool.query(query, params);
  if (!rows.length) return res.status(404).json({ error: 'Utente non trovato' });
  res.json(rows[0]);
});

app.delete('/api/users/:id', requireAuth, async (req, res) => {
  await pool.query('DELETE FROM users WHERE id=$1', [req.params.id]);
  res.json({ ok: true });
});

// Tools
app.get('/api/tools', requireAuth, async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM tools ORDER BY created_at DESC');
  res.json(rows);
});

app.post('/api/tools', requireAuth, async (req, res) => {
  const { name, slug, description, url } = req.body;
  if (!name || !slug) return res.status(400).json({ error: 'Nome e slug obbligatori' });
  try {
    const { rows } = await pool.query(
      'INSERT INTO tools (name, slug, description, url) VALUES ($1,$2,$3,$4) RETURNING *',
      [name, slug, description || null, url || null]
    );
    res.json(rows[0]);
  } catch (e) {
    if (e.code === '23505') return res.status(400).json({ error: 'Slug già esistente' });
    throw e;
  }
});

app.put('/api/tools/:id', requireAuth, async (req, res) => {
  const { name, slug, description, url } = req.body;
  if (!name || !slug) return res.status(400).json({ error: 'Nome e slug obbligatori' });
  const { rows } = await pool.query(
    'UPDATE tools SET name=$1, slug=$2, description=$3, url=$4 WHERE id=$5 RETURNING *',
    [name, slug, description || null, url || null, req.params.id]
  );
  if (!rows.length) return res.status(404).json({ error: 'Tool non trovato' });
  res.json(rows[0]);
});

app.delete('/api/tools/:id', requireAuth, async (req, res) => {
  await pool.query('DELETE FROM tools WHERE id=$1', [req.params.id]);
  res.json({ ok: true });
});

// User-Tool associations
app.post('/api/users/:userId/tools/:toolId', requireAuth, async (req, res) => {
  const { userId, toolId } = req.params;
  console.log(`ADD tool ${toolId} to user ${userId}`);
  await pool.query(
    'INSERT INTO user_tools (user_id, tool_id) VALUES ($1,$2) ON CONFLICT DO NOTHING',
    [userId, toolId]
  );
  res.json({ ok: true });
});

app.delete('/api/users/:userId/tools/:toolId', requireAuth, async (req, res) => {
  await pool.query(
    'DELETE FROM user_tools WHERE user_id=$1 AND tool_id=$2',
    [req.params.userId, req.params.toolId]
  );
  res.json({ ok: true });
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Errore interno del server' });
});

init().then(() => {
  app.listen(PORT, () => console.log(`Server avviato su http://localhost:${PORT}`));
}).catch(err => {
  console.error('Errore connessione DB:', err);
  process.exit(1);
});
