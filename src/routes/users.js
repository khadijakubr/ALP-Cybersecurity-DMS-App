//Endpoint khusus admin untuk mengelola/melihat data user.

const express = require('express');
const { db } = require('../data');
const { authenticateToken, requireRole } = require('../middleware/auth');

const router = express.Router();

// Daftar seluruh user (khusus admin)
// requireRole butuh req.user yang baru diisi oleh authenticateToken.

router.get('/admin/users', authenticateToken, requireRole('admin'), (req, res) => {
  // Buang passwordHash dari setiap user sebelum dikirim ke client.
  const safeUsers = db.users.map(({ passwordHash, ...rest }) => rest);

  res.json({
    message: 'Daftar seluruh user (khusus admin)',
    total: safeUsers.length,
    users: safeUsers,
  });
});

// Detail user tertentu (khusus admin)
router.get('/admin/users/:id', authenticateToken, requireRole('admin'), (req, res) => {
  const id = parseInt(req.params.id, 10);
  const user = db.users.find((u) => u.id === id);

  if (!user) {
    return res.status(404).json({
      error: 'User not found',
      message: `User dengan id ${id} tidak ditemukan.`,
    });
  }

  const { passwordHash, ...safeUser } = user;
  res.json({ user: safeUser });
});

module.exports = router;
