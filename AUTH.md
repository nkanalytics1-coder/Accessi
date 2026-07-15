# Autenticazione Centralizzata — Accessi

Tutti i tool devono autenticare gli utenti tramite questo sistema centralizzato.
Le credenziali degli utenti e i permessi per tool sono gestiti su [accessi.vercel.app](https://accessi.vercel.app).

La password viaggia **una sola volta** (al primo login). Le sessioni successive usano un **JWT firmato** restituito al login, senza più trasmettere la password.

---

## Flusso consigliato

```
1. Prima autenticazione  →  POST /api/user-login   (email + password + tool_slug)
                         ←  { ok, user, tools, token }

2. Sessioni successive   →  POST /api/verify-token  (token + tool_slug)
                         ←  { ok, user, tools, token }
```

Salva il `token` nel cookie di sessione o nel localStorage del tool. Il token è valido **7 giorni**.

---

## 1. Login (prima volta)

```
POST https://accessi.vercel.app/api/user-login
Content-Type: application/json
```

### Body

```json
{
  "email": "utente@email.com",
  "password": "password",
  "tool_slug": "entity-matrix"
}
```

### Risposta `200`

```json
{
  "ok": true,
  "user": { "id": 2, "name": "Rino Sassi", "email": "rino.sassi@parsec.agency", "role": "user" },
  "tools": [
    { "id": 1, "name": "Entity Matrix", "slug": "entity-matrix", "url": "https://entity-matrix.vercel.app/" }
  ],
  "token": "eyJhbGci..."
}
```

### Errori

| Codice | Motivo |
|--------|--------|
| `400`  | `email`, `password` o `tool_slug` mancante, oppure `tool_slug` non riconosciuto |
| `401`  | Email o password errati |
| `403`  | Utente senza accesso al tool richiesto |

---

## 2. Verifica token (sessioni successive)

```
POST https://accessi.vercel.app/api/verify-token
Content-Type: application/json
```

### Body

```json
{
  "token": "eyJhbGci...",
  "tool_slug": "entity-matrix"
}
```

Stessa risposta del login (`200` con `user`, `tools`, `token`).

### Errori

| Codice | Motivo |
|--------|--------|
| `400`  | `token` o `tool_slug` mancante / `tool_slug` non riconosciuto |
| `401`  | Token non valido o scaduto → rimandare al login |
| `403`  | Utente senza accesso al tool |

---

## Implementazione (JavaScript)

```js
const TOOL_SLUG = 'INSERIRE_SLUG_DEL_TOOL'; // vedi tabella sotto
const API_BASE  = 'https://accessi.vercel.app';

async function apiPost(path, body) {
  const res = await fetch(API_BASE + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error);
  return data;
}

// Prima autenticazione — chiamare con le credenziali dell'utente
async function login(email, password) {
  const data = await apiPost('/api/user-login', { email, password, tool_slug: TOOL_SLUG });
  saveToken(data.token); // salva in cookie / localStorage
  return data;
}

// Sessioni successive — la password non serve più
async function verifySession() {
  const token = getToken(); // leggi da cookie / localStorage
  if (!token) throw new Error('Non autenticato');
  try {
    return await apiPost('/api/verify-token', { token, tool_slug: TOOL_SLUG });
  } catch (e) {
    if (e.message === 'Token non valido o scaduto') {
      clearToken();
      redirectToLogin();
    }
    throw e;
  }
}
```

---

## Valori di `tool_slug`

| Tool | `tool_slug` |
|------|-------------|
| Entity Matrix   | `entity-matrix`   |
| Feed Matrix     | `feed-matrix`     |
| Answer Matrix   | `answer-matrix`   |
| RobotsWatch     | `robotswatch`     |
| Sitemap Matrix  | `sitemap-matrix`  |
| Discover Matrix | `discover-matrix` |
| Todo Board      | `todo-board`      |
| Token Matrix    | `token-matrix`    |
| StorageGSC      | `storagegsc`      |
