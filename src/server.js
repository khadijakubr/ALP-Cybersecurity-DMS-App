// entry point aplikasi. Server Express dibuat, middleware global dipasang, dan route didaftarkan.
require('dotenv').config();

const express = require('express');
const path = require('path');

// Session & Passport untuk OAuth.
const session = require('express-session');
const passport = require('passport');

// Data in-memory dipisah di module lain agar route tetap fokus pada logika HTTP.
const { db } = require('./data');

// Endpoint auth dipisah ke router sendiri.
const authRoutes = require('./routes/auth');

// Endpoint admin (RBAC) dipisah juga.
const userRoutes = require('./routes/users');

// Endpoint dokumen dengan aturan ABAC.
const documentRoutes = require('./routes/documents');

// Endpoint OAuth Google.
// file ini juga mengonfigurasi Passport saat di-require,
// jadi harus di-require sebelum passport.initialize() dipakai.
const oauthRoutes = require('./routes/oauth');

const app = express();

// PORT diambil dari .env
const PORT = process.env.PORT || 3000;

// Konfigurasi view engine untuk halaman OAuth (mis. login-failed.ejs).
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '..', 'views'));

// Middleware global untuk parsing JSON & urlencoded. Dipakai di semua route.
app.use(express.json());
// urlencoded dipakai saat form HTML dikirim (dibutuhkan alur OAuth).
app.use(express.urlencoded({ extended: true }));

// Session middleware untuk menyimpan session Passport di server. Cookie session dikirim ke browser.
app.use(
  session({
    secret: process.env.SESSION_SECRET || 'dev-session-secret',
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: false, 
      maxAge: 24 * 60 * 60 * 1000, // 24 jam
    },
  })
);

// Inisialisasi Passport. 
app.use(passport.initialize());
app.use(passport.session());

// Menyajikan file statis di folder public/ 
app.use(express.static(path.join(__dirname, '..', 'public')));

// Pasang router auth. Karena router sudah mendefinisikan path lengkap.
app.use('/', authRoutes);
app.use('/', userRoutes);
app.use('/', documentRoutes);
app.use('/', oauthRoutes);

// Endpoint root untuk menampilkan info aplikasi & daftar endpoint. Dipakai di GET /.
app.get('/', (req, res) => {
  res.json({
    app: 'Document Management System (DMS)',
    status: 'running',
    checkpoint: 'CP6 - OAuth 2.0 Google',
    endpoints: {
      info: 'GET /',
      health: 'GET /health',
      seed: 'GET /dev/seed',
      register: 'POST /auth/register',
      login: 'POST /auth/login',
      refresh: 'POST /auth/refresh',
      logout: 'POST /auth/logout',
      profile: 'GET /user/profile',
      adminUsers: 'GET /admin/users (admin only)',
      adminUserDetail: 'GET /admin/users/:id (admin only)',
      documents: 'GET /documents (disaring ABAC)',
      documentDetail: 'GET /documents/:id (disaring ABAC)',
      createDocument: 'POST /documents (divalidasi ABAC)',
      secretDocuments: 'GET /documents/secret (role admin/manager DAN clearance high)',
      deleteDocument: 'DELETE /documents/:id (role admin/manager DAN departemen sama)',
      googleLogin: 'GET /auth/google (OAuth 2.0)',
      googleCallback: 'GET /auth/google/callback',
      googleStatus: 'GET /auth/google/status',
    },
  });
});

// Endpoint health check untuk memastikan server hidup. Dipakai di GET /health.
app.get('/health', (req, res) => {
  res.json({ ok: true, uptime: process.uptime() });
});

// Endpoint dev/seed untuk menampilkan data awal (users & documents) tanpa password. Dipakai di GET /dev/seed.
app.get('/dev/seed', (req, res) => {
  // Ambil semua user, buang passwordHash, sisakan field lain.
  const safeUsers = db.users.map(({ passwordHash, ...rest }) => rest);

  res.json({
    warning: 'Endpoint demo lokal.',
    testAccounts: [
      { username: 'admin', password: 'admin123', role: 'admin' },
      { username: 'manager', password: 'manager123', role: 'manager' },
      { username: 'staff', password: 'staff123', role: 'staff' },
    ],
    users: safeUsers,
    documents: db.documents,
  });
});

// Jalankan server hanya jika file ini dijalankan langsung (bukan di-require oleh module lain).
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`DMS App running: http://localhost:${PORT}`)
  });
}

module.exports = app;