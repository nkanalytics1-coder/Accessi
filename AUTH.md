# Autenticazione Centralizzata — Accessi

Tutti i tool devono autenticare gli utenti tramite questo endpoint centralizzato.
Le credenziali degli utenti e i permessi per tool sono gestiti su [accessi.vercel.app](https://accessi.vercel.app).

---

## Endpoint

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

### Logica

1. Verifica che `tool_slug` esista nel sistema → altrimenti `400`
2. Verifica email + password → altrimenti `401`
3. Verifica che l'utente abbia accesso a quel tool → altrimenti `403`
4. Logga l'accesso (riuscito o fallito) con IP e timestamp
5. Se tutto ok → `200` con profilo utente e lista tool abilitati

### Risposte

**`200` — Login riuscito**
```json
{
  "ok": true,
  "user": {
    "id": 2,
    "name": "Rino Sassi",
    "email": "rino.sassi@parsec.agency",
    "role": "user"
  },
  "tools": [
    { "id": 1, "name": "Entity Matrix", "slug": "entity-matrix", "url": "https://entity-matrix.vercel.app/" }
  ]
}
```

**`400`** — `tool_slug` mancante o non riconosciuto  
**`401`** — Email o password errate  
**`403`** — Utente senza accesso al tool richiesto  

---

## Implementazione (JavaScript)

```js
async function login(email, password) {
  const res = await fetch('https://accessi.vercel.app/api/user-login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email,
      password,
      tool_slug: 'INSERIRE_SLUG_DEL_TOOL', // vedi tabella sotto
    }),
  });

  const data = await res.json();

  if (!res.ok) {
    // data.error contiene il messaggio da mostrare all'utente
    throw new Error(data.error);
  }

  // data.user  → profilo utente autenticato
  // data.tools → lista di tutti i tool a cui l'utente ha accesso
  return data;
}
```

---

## Valori di `tool_slug`

| Tool | `tool_slug` |
|------|-------------|
| Entity Matrix | `entity-matrix` |
| Feed Matrix | `feed-matrix` |
| Answer Matrix | `answer-matrix` |
| RobotsWatch | `robotswatch` |
| Sitemap Matrix | `sitemap-matrix` |
| Discover Matrix | `discover-matrix` |
| Todo Board | `todo-board` |
| Token Matrix | `token-matrix` |
| StorageGSC | `storagegsc` |
