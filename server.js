const express = require('express');
const cookieParser = require('cookie-parser');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const path = require('path');
const { pool, init } = require('./db');

const app = express();
const PORT = process.env.PORT || 4000;

const SUPERADMIN_USER = 'Superadmin';
const SUPERADMIN_PASS = ')z5fmwkQVrBKao5LvQ0kqhxm';
const SECRET = 'gu-secret-k9mP2xQ7rT4vL1nZ';
const AUTH_TOKEN = crypto.createHmac('sha256', SECRET).update(SUPERADMIN_PASS).digest('hex');

function validatePassword(p) {
  if (!p || p.length < 8) return 'Password troppo corta (min 8 caratteri)';
  if (!/[A-Z]/.test(p)) return 'Manca almeno una lettera maiuscola';
  if (!/[a-z]/.test(p)) return 'Manca almeno una lettera minuscola';
  if (!/[0-9]/.test(p)) return 'Manca almeno un numero';
  if (!/[^A-Za-z0-9]/.test(p)) return 'Manca almeno un carattere speciale';
  return null;
}

const COOKIE_OPTS = {
  httpOnly: true,
  maxAge: 8 * 60 * 60 * 1000,
  sameSite: 'lax',
  secure: process.env.NODE_ENV === 'production',
};

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public'), { extensions: ['html'] }));

function requireAuth(req, res, next) {
  if (req.cookies && req.cookies.gu_auth === AUTH_TOKEN) return next();
  res.status(401).json({ error: 'Non autorizzato' });
}

function getMailer() {
  if (!process.env.SMTP_HOST) throw new Error('SMTP non configurato. Imposta le variabili SMTP_HOST, SMTP_USER, SMTP_PASS su Vercel.');
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: process.env.SMTP_PORT === '465',
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
}

// Auth
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  if (username === SUPERADMIN_USER && password === SUPERADMIN_PASS) {
    res.cookie('gu_auth', AUTH_TOKEN, COOKIE_OPTS);
    res.json({ ok: true });
  } else {
    res.status(401).json({ error: 'Credenziali non valide' });
  }
});

app.post('/api/logout', (req, res) => {
  res.clearCookie('gu_auth');
  res.json({ ok: true });
});

app.get('/api/me', (req, res) => {
  res.json({ authenticated: !!(req.cookies && req.cookies.gu_auth === AUTH_TOKEN) });
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
  const hash = await bcrypt.hash(password || crypto.randomBytes(16).toString('hex'), 12);
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

// Change password (admin sets directly)
app.post('/api/users/:id/set-password', requireAuth, async (req, res) => {
  const { password } = req.body;
  const pwErr = validatePassword(password);
  if (pwErr) return res.status(400).json({ error: pwErr });
  const hash = await bcrypt.hash(password, 12);
  const { rows } = await pool.query(
    'UPDATE users SET password_hash=$1 WHERE id=$2 RETURNING id',
    [hash, req.params.id]
  );
  if (!rows.length) return res.status(404).json({ error: 'Utente non trovato' });
  res.json({ ok: true });
});

// Send reset email
app.post('/api/users/:id/send-reset', requireAuth, async (req, res) => {
  const { rows } = await pool.query('SELECT id, name, email FROM users WHERE id=$1', [req.params.id]);
  if (!rows.length) return res.status(404).json({ error: 'Utente non trovato' });
  const user = rows[0];

  // Invalida token precedenti
  await pool.query('UPDATE password_reset_tokens SET used=TRUE WHERE user_id=$1', [user.id]);

  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
  await pool.query(
    'INSERT INTO password_reset_tokens (user_id, token, expires_at) VALUES ($1,$2,$3)',
    [user.id, token, expiresAt]
  );

  const appUrl = (process.env.APP_URL || `http://localhost:${PORT}`).replace(/\/$/, '');
  const resetUrl = `${appUrl}/reset?token=${token}`;

  const mailer = getMailer();
  await mailer.sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to: user.email,
    subject: 'Imposta la tua password',
    html: `
      <div style="font-family:sans-serif;max-width:520px;margin:0 auto;background:#0f1117;color:#e2e8f0;border-radius:12px;padding:36px;border:1px solid #2e3250">
        <h2 style="margin:0 0 8px;color:#e2e8f0">Ciao ${user.name},</h2>
        <p style="color:#8892b0;margin:0 0 24px">Hai ricevuto questo messaggio perché è stata richiesta la reimpostazione della tua password.</p>
        <a href="${resetUrl}" style="display:inline-block;background:#6366f1;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600;font-size:15px">Imposta nuova password</a>
        <p style="color:#8892b0;margin:24px 0 0;font-size:13px">Il link è valido per <strong>24 ore</strong>. Se non hai richiesto il reset, ignora questa email.</p>
        <hr style="border:none;border-top:1px solid #2e3250;margin:24px 0">
        <p style="color:#4a5568;font-size:12px;margin:0">Gestione Utenti — link diretto: <a href="${resetUrl}" style="color:#6366f1">${resetUrl}</a></p>
      </div>
    `,
  });

  res.json({ ok: true });
});

// Password reset page
app.get('/reset', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'reset.html'));
});

// Validate token (public)
app.get('/api/reset-token', async (req, res) => {
  const { token } = req.query;
  if (!token) return res.status(400).json({ error: 'Token mancante' });
  const { rows } = await pool.query(
    `SELECT rt.id, u.name, u.email FROM password_reset_tokens rt
     JOIN users u ON u.id = rt.user_id
     WHERE rt.token=$1 AND rt.used=FALSE AND rt.expires_at > NOW()`,
    [token]
  );
  if (!rows.length) return res.status(400).json({ error: 'Link non valido o scaduto' });
  res.json({ name: rows[0].name, email: rows[0].email });
});

// Apply reset (public)
app.post('/api/reset-password', async (req, res) => {
  const { token, password } = req.body;
  if (!token || !password) return res.status(400).json({ error: 'Token e password obbligatori' });
  const pwErr = validatePassword(password);
  if (pwErr) return res.status(400).json({ error: pwErr });

  const { rows } = await pool.query(
    'SELECT * FROM password_reset_tokens WHERE token=$1 AND used=FALSE AND expires_at > NOW()',
    [token]
  );
  if (!rows.length) return res.status(400).json({ error: 'Link non valido o scaduto' });

  const hash = await bcrypt.hash(password, 12);
  await pool.query('UPDATE users SET password_hash=$1 WHERE id=$2', [hash, rows[0].user_id]);
  await pool.query('UPDATE password_reset_tokens SET used=TRUE WHERE id=$1', [rows[0].id]);

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
  await pool.query(
    'INSERT INTO user_tools (user_id, tool_id) VALUES ($1,$2) ON CONFLICT DO NOTHING',
    [req.params.userId, req.params.toolId]
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
  res.status(500).json({ error: err.message || 'Errore interno del server' });
});

if (require.main === module) {
  init().then(() => {
    app.listen(PORT, () => console.log(`Server avviato su http://localhost:${PORT}`));
  }).catch(err => { console.error(err); process.exit(1); });
} else {
  init().catch(console.error);
}

module.exports = app;
