/**
 *   Middleware autentikasi JWT untuk memeriksa header
 *   `Authorization: Bearer <token>` pada setiap request yang
 *   dilindungi. agar pengecekan token TIDAK ditulis ulang di setiap route.
 *   Cukup pasang `authenticateToken` di depan route yang butuh login.
 */

const jwt = require('jsonwebtoken');
const { findUserById } = require('../data');

// SECRET KEY Dipakai untuk menandatangani (sign) dan memverifikasi (verify) token. Diambil dari .env agar tidak hardcode di kode.
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';

// Fungsi middleware untuk memeriksa token JWT di header Authorization.
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  // Tidak ada token -> user belum login.
  if (!token) {
    return res.status(401).json({
      error: 'Access token required',
      message: 'Sertakan header Authorization: Bearer <token>',
    });
  }

  // jwt.verify memeriksa validitas dan waktu kedaluwarsa (exp).
  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (err) {
      if (err.name === 'TokenExpiredError') {
        return res.status(401).json({
          error: 'Token expired',
          message: 'Access token sudah kedaluwarsa. Silakan refresh token.',
        });
      }

      if (err.name === 'JsonWebTokenError') {
        return res.status(403).json({
          error: 'Invalid token',
          message: 'Token tidak valid atau rusak.',
        });
      }

      return res.status(403).json({
        error: 'Token verification failed',
        message: err.message,
      });
    }

    // Token valid, tapi user bisa saja sudah dihapus dari db.
    const user = findUserById(decoded.id);
    if (!user) {
      return res.status(401).json({
        error: 'User not found',
        message: 'User pemilik token sudah tidak ada.',
      });
    }

    // Buang passwordHash sebelum ditempel ke req.user.
    // diambil dari db, supaya perubahan atribut user langsung berlaku. 
    const { passwordHash, ...safeUser } = user;
    req.user = safeUser;

    // Lanjut ke route/handler berikutnya.
    next();
  });
}

// Membatasi route hanya untuk peran (role) tertentu. Dipakai SETELAH authenticateToken, karena butuh req.user.
function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Harus login terlebih dahulu.',
      });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        error: 'Forbidden',
        message: `Aksi ini hanya untuk role: ${allowedRoles.join(', ')}.`,
        yourRole: req.user.role, // membantu debugging & demo
      });
    }
    next();
  };
}

module.exports = {
  authenticateToken,
  requireRole,
  JWT_SECRET, // dipakai juga oleh routes/auth.js saat membuat token
};
