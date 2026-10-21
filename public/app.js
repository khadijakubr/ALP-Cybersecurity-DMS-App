/* seluruh logika frontend (login, token, fetch API, render).
  Dipisah dari index.html agar HTML mudah dibaca. */

// Token key di localStorage. Jangan hardcode di kode, supaya bisa diganti di browser.
const TOKEN_KEY = 'dms_access_token';
const REFRESH_KEY = 'dms_refresh_token';

let currentUser = null;

const $ = (id) => document.getElementById(id);

// Helpers untuk menyimpan & mengambil token dari localStorage.
function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

function setTokens(accessToken, refreshToken) {
  if (accessToken) localStorage.setItem(TOKEN_KEY, accessToken);
  if (refreshToken) localStorage.setItem(REFRESH_KEY, refreshToken);
}

function clearTokens() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(REFRESH_KEY);
}

// Fungsi untuk menangkap token dari fragment URL setelah login OAuth. Dipanggil saat halaman dimuat.
(function captureOAuthToken() {
  if (!location.hash || !location.hash.includes('token=')) return;

  const params = new URLSearchParams(location.hash.slice(1));
  const accessToken = params.get('token');
  const refreshToken = params.get('refreshToken');

  if (accessToken) setTokens(accessToken, refreshToken);

  // Bersihkan token dari address bar.
  history.replaceState(null, '', location.pathname);
})();

// Digunakan untuk menampilkan teks aman di HTML. Dipakai saat render data user/dokumen.
function esc(value) {
  return String(value == null ? '' : value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

// Status box untuk menampilkan pesan sukses atau error.
function showStatus(kind, text) {
  const box = $('statusBox');
  box.hidden = false;
  box.className = 'status ' + kind;
  box.textContent = text;
}

function hideStatus() {
  $('statusBox').hidden = true;
}

function showLog(title, data) {
  $('logBox').textContent = title + '\n' + JSON.stringify(data, null, 2);
}

// Wrapper untuk fetch API yang menambahkan header Authorization: Bear
async function api(path, options = {}) {
  const headers = Object.assign({}, options.headers || {});
  if (options.body) headers['Content-Type'] = 'application/json';

  const token = getToken();
  if (token) headers['Authorization'] = 'Bearer ' + token;

  const res = await fetch(path, Object.assign({}, options, { headers }));

  let data = null;
  try {
    data = await res.json();
  } catch (_) {
    // Response bukan JSON (mis. halaman HTML error).
  }

  if (!res.ok) {
    const err = new Error((data && data.message) || res.statusText);
    err.status = res.status;
    err.data = data;
    throw err;
  }

  return data;
}

// Profiles user saat ini. Dipakai untuk menampilkan info user di UI.
async function loadProfile() {
  const data = await api('/user/profile');
  currentUser = data.user;

  $('userBar').textContent =
    `${currentUser.username} · ${currentUser.role} · ${currentUser.department}`;

  $('profileBox').innerHTML = `
    <p><strong>${esc(currentUser.username)}</strong> (${esc(currentUser.role)})</p>
    <p>Email: ${esc(currentUser.email)}</p>
    <p>Department: ${esc(currentUser.department)} · Clearance: ${esc(currentUser.clearance)}</p>
  `;

  // RBAC: section admin hanya muncul untuk role admin.
  $('adminSection').hidden = currentUser.role !== 'admin';
  if (currentUser.role === 'admin') await loadUsers();
}

// Dokumen yang dapat diakses user. Dipakai di GET /documents.
function renderDocuments(data) {
  const list = $('docList');
  list.innerHTML = '';

  $('docsCounter').textContent =
    `(${data.total} terlihat, ${data.totalHidden} disembunyikan)`;

  if (!data.documents.length) {
    list.innerHTML = '<li class="muted">Tidak ada dokumen yang dapat diakses.</li>';
    return;
  }

  for (const doc of data.documents) {
    const li = document.createElement('li');
    li.innerHTML = `
      <div>
        <strong>${esc(doc.title)}</strong>
        <div class="tag">
          [${esc(doc.classification)}] · id=${doc.id} ·
          dept=${esc(doc.department)} · pemilik=${esc(doc.ownerUsername)}
        </div>
      </div>
      <div>
        <button class="link" data-action="detail" data-id="${doc.id}">Detail</button>
        &middot;
        <button class="link" data-action="delete" data-id="${doc.id}">Hapus</button>
      </div>
    `;

    li.querySelector('[data-action="detail"]')
      .addEventListener('click', () => openDocument(doc.id));
    li.querySelector('[data-action="delete"]')
      .addEventListener('click', () => deleteDocument(doc.id, doc.title));

    list.appendChild(li);
  }
}

async function loadDocuments() {
  try {
    hideStatus();
    renderDocuments(await api('/documents'));
  } catch (err) {
    handleApiError(err);
  }
}

async function openDocument(id) {
  try {
    const data = await api('/documents/' + id);
    showLog(`GET /documents/${id} -> 200 OK`, data.document);
    showStatus('ok', `Dokumen #${id} boleh diakses.`);
  } catch (err) {
    handleApiError(err, `GET /documents/${id}`);
  }
}

async function deleteDocument(id, title) {
  if (!confirm(`Hapus dokumen #${id} "${title}"?`)) return;

  try {
    const data = await api('/documents/' + id, { method: 'DELETE' });
    showLog(`DELETE /documents/${id} -> 200 OK`, data);
    showStatus('ok', `Dokumen #${id} berhasil dihapus.`);
    await loadDocuments();
  } catch (err) {
    handleApiError(err, `DELETE /documents/${id}`);
  }
}

// Menampilkan daftar user (hanya untuk admin). Dipakai di GET /admin/users.
async function loadUsers() {
  try {
    const data = await api('/admin/users');
    const list = $('userList');
    list.innerHTML = '';

    for (const u of data.users) {
      const li = document.createElement('li');
      li.innerHTML = `
        <strong>${esc(u.username)}</strong> (${esc(u.role)})
        <div class="tag">
          dept=${esc(u.department)} · clearance=${esc(u.clearance)}
        </div>
      `;
      list.appendChild(li);
    }
  } catch (err) {
    handleApiError(err, 'GET /admin/users');
  }
}

// Penanganan error API. Dipakai di semua fetch API.
function handleApiError(err, context) {
  // 401 saat login = kredensial salah, bukan sesi berakhir.
  if (err.status === 401 && context !== 'POST /auth/login') {
    clearTokens();
    showLoggedOut();
    showStatus('err', 'Sesi berakhir. Silakan login ulang.');
    return;
  }

  const reason = err.data && err.data.reason ? `\nreason: ${err.data.reason}` : '';
  showStatus(
    'err',
    `${context ? context + ' -> ' : ''}HTTP ${err.status}\n${err.message}${reason}`
  );
  showLog(`ERROR ${context || ''}`, err.data || { message: err.message });
}

// Tampilan login vs app. Dipakai saat login/logout.
function showLoggedIn() {
  $('authPanel').hidden = true;
  $('appPanel').hidden = false;
}

function showLoggedOut() {
  currentUser = null;
  $('authPanel').hidden = false;
  $('appPanel').hidden = true;
  $('userBar').textContent = 'Belum login';
  clearTokens();
}

// Login form: POST /auth/login. Dipakai saat user login dengan username/password.
$('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  hideStatus();

  try {
    const data = await api('/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        username: $('username').value.trim(),
        password: $('password').value,
      }),
    });

    setTokens(data.accessToken, data.refreshToken);
    showLoggedIn();
    await loadProfile();
    await loadDocuments();
    showStatus('ok', `Login berhasil sebagai ${data.user.username} (${data.user.role}).`);
  } catch (err) {
    handleApiError(err, 'POST /auth/login');
  }
});

// Logout: POST /auth/logout. Dipakai saat user klik tombol logout.
$('logoutBtn').addEventListener('click', async () => {
  try {
    const refreshToken = localStorage.getItem(REFRESH_KEY);
    if (refreshToken) {
      await api('/auth/logout', {
        method: 'POST',
        body: JSON.stringify({ refreshToken }),
      });
    }
  } catch (_) {
    // Abaikan error logout; yang penting token lokal dihapus.
  }

  showLoggedOut();
  showStatus('ok', 'Logout berhasil.');
});

// Membuat dokumen baru. Dipakai di POST /documents.
$('createForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  hideStatus();

  const payload = {
    title: $('docTitle').value.trim(),
    classification: $('docClassification').value,
  };

  try {
    const data = await api('/documents', {
      method: 'POST',
      body: JSON.stringify(payload),
    });

    showStatus('ok', `Dokumen dibuat: #${data.document.id} ${data.document.title}`);
    showLog('POST /documents -> 201 Created', data);
    $('docTitle').value = '';
    await loadDocuments();
  } catch (err) {
    handleApiError(err, 'POST /documents');
  }
});

// Tombol refresh untuk memuat ulang daftar dokumen & user. Dipakai di GET /documents & GET /admin/users.
$('refreshDocs').addEventListener('click', loadDocuments);
$('refreshUsers').addEventListener('click', loadUsers);

// Inisialisasi saat halaman dimuat. Dipakai di awal load index.html.
(async function init() {
  if (!getToken()) return;

  try {
    showLoggedIn();
    await loadProfile();
    await loadDocuments();
  } catch (err) {
    handleApiError(err, 'init');
  }
})();
