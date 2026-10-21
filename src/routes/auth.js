/**
 *   Kumpulan endpoint autentikasi berbasis JWT:
 *     POST /auth/register  -> daftar akun baru
 *     POST /auth/login     -> login, dapat access + refresh token
 *     POST /auth/refresh   -> tukar refresh token jadi access token baru
 *     POST /auth/logout    -> cabut refresh token
 *     GET  /user/profile   -> profil user yang sedang login
 */

const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

// Data user in-memory 
const { db, findUserByUsername, findUserById } = require('../data');

// Middleware + secret yang sama dengan yang dipakai untuk verifikasi.
const { authenticateToken, JWT_SECRET } = require('../middleware/auth');

// Router yang bisa dipasang ke app utama di server.js.
const router = express.Router();

// Token helpers untuk membuat access token & refresh token.
const {
  generateAccessToken,
  generateRefreshToken,
  refreshTokens,
} = require('../tokens');

// Register route: POST /auth/register
router.post('/auth/register', async (req, res) => {
  try {
    const { username, password, email, department } = req.body;

    // Validasi field wajib.
    if (!username || !password || !email) {
      return res.status(400).json({
        error: 'Missing required fields',
        message: 'Username, password, dan email wajib diisi.',
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        error: 'Invalid password',
        message: 'Password minimal 6 karakter.',
      });
    }

    // Cegah duplikat username / email.
    if (findUserByUsername(username)) {
      return res.status(409).json({
        error: 'User already exists',
        message: 'Username sudah dipakai.',
      });
    }
    if (db.users.find((u) => u.email === email)) {
      return res.status(409).json({
        error: 'Email already exists',
        message: 'Email sudah terdaftar.',
      });
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 10);

    // Buat user baru dengan atribut default yang aman.
    const newUser = {
      id: db.nextUserId++, // pakai ID sekarang, lalu naikkan counter
      username,
      passwordHash,
      email,
      role: 'staff', // dipaksa, bukan dari body
      department: department || 'IT', // boleh dipilih, default IT
      clearance: 'low', // pendaftar baru selalu low
      provider: 'local', // login via password
    };

    db.users.push(newUser);

    // Langsung beri token supaya user tidak perlu login dua kali.
    const accessToken = generateAccessToken(newUser);
    const refreshToken = generateRefreshToken(newUser);
    refreshTokens.add(refreshToken);

    res.status(201).json({
      message: 'Registrasi berhasil',
      user: {
        id: newUser.id,
        username: newUser.username,
        email: newUser.email,
        role: newUser.role,
        department: newUser.department,
        clearance: newUser.clearance,
      },
      accessToken,
      refreshToken,
    });
  } catch (error) {
    res.status(500).json({
      error: 'Registration failed',
      message: error.message,
    });
  }
});

// Login route: POST /auth/login
router.post('/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({
        error: 'Missing credentials',
        message: 'Username dan password wajib diisi.',
      });
    }

    const user = findUserByUsername(username);

    if (!user) {
      return res.status(401).json({
        error: 'Invalid credentials',
        message: 'Username atau password salah.',
      });
    }

    const isValidPassword = await bcrypt.compare(password, user.passwordHash);
    if (!isValidPassword) {
      return res.status(401).json({
        error: 'Invalid credentials',
        message: 'Username atau password salah.',
      });
    }

    const accessToken = generateAccessToken(user);
    const refreshToken = generateRefreshToken(user);
    refreshTokens.add(refreshToken);

    res.json({
      message: 'Login berhasil',
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
        department: user.department,
        clearance: user.clearance,
      },
      accessToken,
      refreshToken,
    });
  } catch (error) {
    res.status(500).json({
      error: 'Login failed',
      message: error.message,
    });
  }
});

// Refresh token route: POST /auth/refresh
router.post('/auth/refresh', (req, res) => {
  const { refreshToken } = req.body;

  if (!refreshToken) {
    return res.status(401).json({
      error: 'Refresh token required',
      message: 'Sertakan refreshToken.',
    });
  }

  if (!refreshTokens.has(refreshToken)) {
    return res.status(403).json({
      error: 'Invalid refresh token',
      message: 'Refresh token tidak dikenal atau sudah dicabut.',
    });
  }

  jwt.verify(refreshToken, JWT_SECRET, (err, decoded) => {
    if (err) {
      // Token rusak/kedaluwarsa -> hapus dari daftar.
      refreshTokens.delete(refreshToken);
      return res.status(403).json({
        error: 'Invalid refresh token',
        message: 'Refresh token tidak valid atau kedaluwarsa.',
      });
    }

    const user = findUserById(decoded.id);
    if (!user) {
      refreshTokens.delete(refreshToken);
      return res.status(403).json({
        error: 'User not found',
        message: 'User pemilik token tidak ada.',
      });
    }

    // Hanya access token baru; refresh token lama tetap berlaku.
    res.json({
      message: 'Token berhasil diperbarui',
      accessToken: generateAccessToken(user),
    });
  });
});

// Logout route: POST /auth/logout
router.post('/auth/logout', (req, res) => {
  const { refreshToken } = req.body;
  if (refreshToken) refreshTokens.delete(refreshToken);

  res.json({ message: 'Logout berhasil' });
});

// Profile route: GET /user/profile
router.get('/user/profile', authenticateToken, (req, res) => {
  res.json({
    message: 'Profil user yang sedang login',
    user: req.user,
  });
});

module.exports = router;
