/**
 *  Login menggunakan OAuth 2.0 dengan Google.
 *     GET /auth/google           -> arahkan user ke halaman Google
 *     GET /auth/google/callback  -> Google mengembalikan profil user
 *     GET /auth/google/status    -> cek status login (untuk demo)
 */

const express = require('express');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;

const { db } = require('../data');
const {
  generateAccessToken,
  generateRefreshToken,
  refreshTokens,
} = require('../tokens');

const router = express.Router();

// Konfigurasi Passport untuk login Google. Dipakai di route GET /auth/google.

passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: process.env.CALLBACK_URL,
      scope: ['profile', 'email'],
    },
    // Callback ini dipanggil Passport setelah profil Google didapat.
    // Parameter `done(err, user)` meneruskan user ke langkah berikut.
    function (accessTokenGoogle, refreshTokenGoogle, profile, done) {
      const email =
        (profile.emails && profile.emails[0] && profile.emails[0].value) || null;

      // Cari user berdasarkan googleId, atau berdasarkan email
      // (untuk menautkan akun lokal yang sudah ada dengan Google).
      let user =
        db.users.find((u) => u.googleId === profile.id) ||
        (email ? db.users.find((u) => u.email === email) : null);

      if (user) {
        // User sudah ada -> tautkan googleId jika belum.
        if (!user.googleId) user.googleId = profile.id;
      } else {
        // User baru dari Google -> beri atribut default yang AMAN.
        user = {
          id: db.nextUserId++, // pakai ID sekarang, lalu naikkan counter
          username: uniqueUsername(profile, email),
          // Tidak ada password lokal; login hanya lewat Google.
          googleId: profile.id,
          email,
          provider: 'google',
          role: 'staff', // default aman
          department: 'IT', //default aman
          clearance: 'low',
          displayName: profile.displayName,
          picture:
            (profile.photos && profile.photos[0] && profile.photos[0].value) ||
            null,
        };
        db.users.push(user);
      }

      // Tidak ada error -> teruskan user.
      return done(null, user);
    }
  )
);

// Helper untuk membuat username unik dari profil Google. Dipakai saat user baru login pertama kali.
function uniqueUsername(profile, email) {
  const dasar =
    (email ? email.split('@')[0] : profile.displayName || 'googleuser')
      .replace(/[^a-zA-Z0-9]/g, '')
      .toLowerCase() || 'googleuser';

  let username = dasar;
  let counter = 1;
  while (db.users.some((u) => u.username === username)) {
    username = `${dasar}${counter++}`;
  }
  return username;
}

// Searialize dan deserialize user untuk session Passport. Dipakai di route GET /auth/google/status.
passport.serializeUser((user, done) => {
  done(null, user.id);
});

passport.deserializeUser((id, done) => {
  const user = db.users.find((u) => u.id === id);
  done(null, user || false);
});

// Route untuk mengarahkan user ke halaman login Google. Dipakai di GET /auth/google.
router.get(
  '/auth/google',
  passport.authenticate('google', {
    scope: ['profile', 'email'],
    prompt: 'select_account',
  })
);

// callback route yang dipanggil Google setelah user login. Dipakai di GET /auth/google/callback.
router.get(
  '/auth/google/callback',
  passport.authenticate('google', { failureRedirect: '/login-failed' }),
  (req, res) => {
    const accessToken = generateAccessToken(req.user);
    const refreshToken = generateRefreshToken(req.user);
    refreshTokens.add(refreshToken);

    // Kirim token lewat fragment (#...). Fragment tidak dikirim ke
    // server, jadi tidak muncul di log akses server.
    const fragment = `token=${encodeURIComponent(
      accessToken
    )}&refreshToken=${encodeURIComponent(refreshToken)}`;
    res.redirect(`/#${fragment}`);
  }
);

// Login status route. Dipakai di GET /auth/google/status.
router.get('/auth/google/status', (req, res) => {
  res.json({
    authenticated: typeof req.isAuthenticated === 'function' && req.isAuthenticated(),
    sessionUser: req.user
      ? { id: req.user.id, username: req.user.username, provider: req.user.provider }
      : null,
  });
});

// Halaman login gagal. Dipakai di GET /login-failed.
router.get('/login-failed', (req, res) => {
  res.status(401).render('login-failed', {
    title: 'Login Gagal',
    error: req.query.error || null,
  });
});

module.exports = router;
