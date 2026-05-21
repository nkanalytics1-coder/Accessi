let allUsers = [];
let allTools = [];

async function api(method, path, body) {
  const res = await fetch(path, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Errore sconosciuto');
  return data;
}

function showToast(msg, type = 'success') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = `toast toast-${type}`;
  t.classList.remove('hidden');
  setTimeout(() => t.classList.add('hidden'), 3000);
}

// Auth
document.getElementById('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const errEl = document.getElementById('login-error');
  errEl.classList.add('hidden');
  try {
    await api('POST', '/api/login', {
      username: document.getElementById('login-username').value,
      password: document.getElementById('login-password').value,
    });
    showApp();
  } catch (err) {
    errEl.textContent = err.message;
    errEl.classList.remove('hidden');
  }
});

document.getElementById('logout-btn').addEventListener('click', async () => {
  await api('POST', '/api/logout');
  document.getElementById('app-screen').classList.add('hidden');
  document.getElementById('login-screen').classList.remove('hidden');
  document.getElementById('login-username').value = '';
  document.getElementById('login-password').value = '';
});

async function checkAuth() {
  const { authenticated } = await api('GET', '/api/me');
  if (authenticated) showApp();
  else document.getElementById('login-screen').classList.remove('hidden');
}

async function showApp() {
  document.getElementById('login-screen').classList.add('hidden');
  document.getElementById('app-screen').classList.remove('hidden');
  await Promise.all([loadUsers(), loadTools()]);
}

// Tabs
document.querySelectorAll('.nav-item').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const tab = btn.dataset.tab;
    document.querySelectorAll('.tab-pane').forEach(p => p.classList.add('hidden'));
    document.getElementById(`tab-${tab}`).classList.remove('hidden');
    if (tab === 'associations') Promise.all([loadUsers(), loadTools()]).then(renderAssociations);
  });
});

// Users
async function loadUsers() {
  allUsers = await api('GET', '/api/users');
  renderUsers();
}

function renderUsers() {
  const tbody = document.getElementById('users-tbody');
  if (!allUsers.length) {
    tbody.innerHTML = '<tr class="empty-row"><td colspan="6">Nessun utente presente</td></tr>';
    return;
  }
  tbody.innerHTML = allUsers.map(u => `
    <tr>
      <td><strong>${esc(u.name)}</strong></td>
      <td>${esc(u.email)}</td>
      <td><span class="badge badge-${u.role}">${u.role}</span></td>
      <td>${(u.tools || []).map(t => `<span class="tag">${esc(t.name)}</span>`).join('') || '<span style="color:var(--text-muted)">—</span>'}</td>
      <td style="color:var(--text-muted)">${new Date(u.created_at).toLocaleDateString('it-IT')}</td>
      <td>
        <div class="actions">
          <button class="btn btn-ghost btn-sm" onclick="openUserModal(${u.id})">Modifica</button>
          <button class="btn btn-danger btn-sm" onclick="deleteUser(${u.id}, '${esc(u.name)}')">Elimina</button>
        </div>
      </td>
    </tr>
  `).join('');
}

function openUserModal(id) {
  const user = id ? allUsers.find(u => u.id === id) : null;
  document.getElementById('user-modal-title').textContent = user ? 'Modifica Utente' : 'Nuovo Utente';
  document.getElementById('user-id').value = user ? user.id : '';
  document.getElementById('user-name').value = user ? user.name : '';
  document.getElementById('user-email').value = user ? user.email : '';
  document.getElementById('user-role').value = user ? user.role : 'user';
  document.getElementById('user-password').value = '';
  document.getElementById('password-hint').style.display = user ? '' : 'none';
  document.getElementById('user-form-error').classList.add('hidden');
  document.getElementById('user-modal').classList.remove('hidden');
}

function closeUserModal() {
  document.getElementById('user-modal').classList.add('hidden');
}

document.getElementById('user-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const errEl = document.getElementById('user-form-error');
  errEl.classList.add('hidden');
  const id = document.getElementById('user-id').value;
  const password = document.getElementById('user-password').value;
  const payload = {
    name: document.getElementById('user-name').value.trim(),
    email: document.getElementById('user-email').value.trim(),
    role: document.getElementById('user-role').value,
    ...(password ? { password } : {}),
  };
  try {
    if (id) await api('PUT', `/api/users/${id}`, payload);
    else await api('POST', '/api/users', payload);
    closeUserModal();
    await loadUsers();
    if (document.querySelector('.nav-item.active').dataset.tab === 'associations') renderAssociations();
    showToast(id ? 'Utente aggiornato' : 'Utente creato');
  } catch (err) {
    errEl.textContent = err.message;
    errEl.classList.remove('hidden');
  }
});

async function deleteUser(id, name) {
  if (!confirm(`Eliminare l'utente "${name}"?`)) return;
  await api('DELETE', `/api/users/${id}`);
  await loadUsers();
  if (document.querySelector('.nav-item.active').dataset.tab === 'associations') renderAssociations();
  showToast('Utente eliminato');
}

// Tools
async function loadTools() {
  allTools = await api('GET', '/api/tools');
  renderTools();
}

function renderTools() {
  const tbody = document.getElementById('tools-tbody');
  if (!allTools.length) {
    tbody.innerHTML = '<tr class="empty-row"><td colspan="6">Nessun tool presente</td></tr>';
    return;
  }
  tbody.innerHTML = allTools.map(t => `
    <tr>
      <td><strong>${esc(t.name)}</strong></td>
      <td><code style="color:var(--text-muted);font-size:12px">${esc(t.slug)}</code></td>
      <td>${t.description ? esc(t.description) : '<span style="color:var(--text-muted)">—</span>'}</td>
      <td>${t.url ? `<a href="${esc(t.url)}" target="_blank" style="color:var(--accent)">${esc(t.url)}</a>` : '<span style="color:var(--text-muted)">—</span>'}</td>
      <td style="color:var(--text-muted)">${new Date(t.created_at).toLocaleDateString('it-IT')}</td>
      <td>
        <div class="actions">
          <button class="btn btn-ghost btn-sm" onclick="openToolModal(${t.id})">Modifica</button>
          <button class="btn btn-danger btn-sm" onclick="deleteTool(${t.id}, '${esc(t.name)}')">Elimina</button>
        </div>
      </td>
    </tr>
  `).join('');
}

function openToolModal(id) {
  const tool = id ? allTools.find(t => t.id === id) : null;
  document.getElementById('tool-modal-title').textContent = tool ? 'Modifica Tool' : 'Nuovo Tool';
  document.getElementById('tool-id').value = tool ? tool.id : '';
  document.getElementById('tool-name').value = tool ? tool.name : '';
  document.getElementById('tool-slug').value = tool ? tool.slug : '';
  document.getElementById('tool-description').value = tool ? (tool.description || '') : '';
  document.getElementById('tool-url').value = tool ? (tool.url || '') : '';
  document.getElementById('tool-form-error').classList.add('hidden');
  document.getElementById('tool-modal').classList.remove('hidden');
}

function closeToolModal() {
  document.getElementById('tool-modal').classList.add('hidden');
}

document.getElementById('tool-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const errEl = document.getElementById('tool-form-error');
  errEl.classList.add('hidden');
  const id = document.getElementById('tool-id').value;
  const payload = {
    name: document.getElementById('tool-name').value.trim(),
    slug: document.getElementById('tool-slug').value.trim(),
    description: document.getElementById('tool-description').value.trim(),
    url: document.getElementById('tool-url').value.trim(),
  };
  try {
    if (id) await api('PUT', `/api/tools/${id}`, payload);
    else await api('POST', '/api/tools', payload);
    closeToolModal();
    await loadTools();
    if (document.querySelector('.nav-item.active').dataset.tab === 'associations') renderAssociations();
    showToast(id ? 'Tool aggiornato' : 'Tool creato');
  } catch (err) {
    errEl.textContent = err.message;
    errEl.classList.remove('hidden');
  }
});

async function deleteTool(id, name) {
  if (!confirm(`Eliminare il tool "${name}"?`)) return;
  await api('DELETE', `/api/tools/${id}`);
  await loadTools();
  if (document.querySelector('.nav-item.active').dataset.tab === 'associations') renderAssociations();
  showToast('Tool eliminato');
}

// Associations
function renderAssociations() {
  const container = document.getElementById('assoc-container');
  if (!allUsers.length) {
    container.innerHTML = '<p style="color:var(--text-muted)">Nessun utente presente.</p>';
    return;
  }
  container.innerHTML = allUsers.map(u => {
    const userToolIds = (u.tools || []).map(t => t.id);
    const available = allTools.filter(t => !userToolIds.includes(t.id));
    return `
      <div class="assoc-card">
        <div class="assoc-card-header">
          <strong>${esc(u.name)}</strong>
          <span style="color:var(--text-muted);font-size:12px">${esc(u.email)}</span>
          <span class="badge badge-${u.role}">${u.role}</span>
        </div>
        <div class="assoc-tools">
          ${(u.tools || []).map(t => `
            <span class="tool-chip">
              ${esc(t.name)}
              <button onclick="removeToolFromUser(${u.id}, ${t.id})" title="Rimuovi">&#x2715;</button>
            </span>
          `).join('')}
          ${available.length ? `
            <select class="add-tool-select" onchange="addToolToUser(${u.id}, this)">
              <option value="">+ Aggiungi tool...</option>
              ${available.map(t => `<option value="${t.id}">${esc(t.name)}</option>`).join('')}
            </select>
          ` : (!allTools.length
            ? '<span style="color:var(--text-muted);font-size:12px">Nessun tool disponibile</span>'
            : '<span style="color:var(--text-muted);font-size:12px">Tutti i tool assegnati</span>'
          )}
        </div>
      </div>
    `;
  }).join('');
}

async function addToolToUser(userId, selectEl) {
  const toolId = selectEl.value;
  if (!toolId) return;
  try {
    await api('POST', `/api/users/${userId}/tools/${toolId}`);
    await Promise.all([loadUsers(), loadTools()]);
    renderAssociations();
    showToast('Tool associato');
  } catch (err) {
    showToast(err.message, 'error');
    selectEl.value = '';
  }
}

async function removeToolFromUser(userId, toolId) {
  try {
    await api('DELETE', `/api/users/${userId}/tools/${toolId}`);
    await Promise.all([loadUsers(), loadTools()]);
    renderAssociations();
    showToast('Associazione rimossa');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// Close modals on overlay click
document.getElementById('user-modal').addEventListener('click', (e) => { if (e.target === e.currentTarget) closeUserModal(); });
document.getElementById('tool-modal').addEventListener('click', (e) => { if (e.target === e.currentTarget) closeToolModal(); });

function esc(str) {
  if (str == null) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

checkAuth();
