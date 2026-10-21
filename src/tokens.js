/**
 *   Pusat pembuatan JWT (access + refresh) dan penyimpanan daftar
 *   refresh token yang masih berlaku.
 */

const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('./middleware/auth');

// Access token pendek (1 jam); refresh token panjang (7 hari).
const ACCESS_TOKEN_TTL = '1h';
const REFRESH_TOKEN_TTL = '7d';

// Daftar refresh token yang masih berlaku (in-memory).
const refreshTokens = new Set();

// Access token = identitas untuk mengakses API
function generateAccessToken(user) {
  return jwt.sign(
    { id: user.id, username: user.username, role: user.role },
    JWT_SECRET,
    { expiresIn: ACCESS_TOKEN_TTL, issuer: 'dms-app', audience: 'dms-users' }
  );
}

// Refresh token = kunci untuk meminta access token baru
function generateRefreshToken(user) {
  return jwt.sign(
    { id: user.id, username: user.username, type: 'refresh' },
    JWT_SECRET,
    { expiresIn: REFRESH_TOKEN_TTL, issuer: 'dms-app' }
  );
}

module.exports = {
  ACCESS_TOKEN_TTL,
  REFRESH_TOKEN_TTL,
  refreshTokens,
  generateAccessToken,
  generateRefreshToken,
};
