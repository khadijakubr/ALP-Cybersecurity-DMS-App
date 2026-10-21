/**
 * Endpoint CRUD dokumen dengan otorisasi ABAC:
 *     GET  /documents      -> daftar dokumen yang boleh dilihat user
 *     GET  /documents/:id  -> detail satu dokumen (dengan cek ABAC)
 *     POST /documents      -> buat dokumen baru (dengan cek ABAC)
 */

const express = require('express');
const { db, findDocumentById } = require('../data');
const { authenticateToken } = require('../middleware/auth');
const {
  canRead,
  canCreate,
  canDelete,
  canAccessSensitive,
} = require('../policies');

const router = express.Router();

// Daftar dokumen yang boleh diakses user. Dipakai di GET /documents.
router.get('/documents', authenticateToken, (req, res) => {
  const visible = db.documents.filter((doc) => canRead(req.user, doc).allowed);

  res.json({
    message: 'Dokumen yang dapat Anda akses',
    user: {
      username: req.user.username,
      role: req.user.role,
      department: req.user.department,
      clearance: req.user.clearance,
    },
    total: visible.length,
    // totalHidden untuk melihat berapa dokumen yang tersaring.
    totalHidden: db.documents.length - visible.length,
    documents: visible,
  });
});

// Menampilkan dokumen rahasia (secret) yang hanya bisa diakses oleh role tertentu + clearance tinggi. Dipakai di GET /documents/secret.
router.get('/documents/secret', authenticateToken, (req, res) => {
  // Keputusan gabungan RBAC + ABAC.
  const decision = canAccessSensitive(req.user);
  if (!decision.allowed) {
    return res.status(403).json({
      error: 'Forbidden',
      reason: decision.reason,
      message: decision.message,
    });
  }

  // Hanya dokumen berklasifikasi "secret" yang boleh dibaca user.
  const secretDocs = db.documents.filter(
    (doc) => doc.classification === 'secret' && canRead(req.user, doc).allowed
  );

  res.json({
    message: 'Data sensitif (role tertentu + clearance high)',
    total: secretDocs.length,
    documents: secretDocs,
  });
});

// Menampilkan detail dokumen tertentu. Dipakai di GET /documents/:id.
router.get('/documents/:id', authenticateToken, (req, res) => {
  const id = parseInt(req.params.id, 10);

  if (Number.isNaN(id)) {
    return res.status(400).json({
      error: 'Invalid ID',
      message: 'ID dokumen harus berupa angka.',
    });
  }

  const doc = findDocumentById(id);
  if (!doc) {
    return res.status(404).json({
      error: 'Document not found',
      message: `Dokumen dengan id ${id} tidak ditemukan.`,
    });
  }

  // Keputusan ABAC dibuat.
  const decision = canRead(req.user, doc);
  if (!decision.allowed) {
    return res.status(403).json({
      error: 'Forbidden',
      reason: decision.reason,
      message: decision.message,
    });
  }

  res.json({ document: doc });
});

// Membuat dokumen baru. Dipakai di POST /documents.
router.post('/documents', authenticateToken, (req, res) => {
  const { title, classification = 'public' } = req.body || {};

  // Validasi judul.
  if (!title || typeof title !== 'string' || title.trim() === '') {
    return res.status(400).json({
      error: 'Invalid input',
      message: 'Title wajib diisi dan berupa teks.',
    });
  }

  // Validasi atribut dokumen lewat policy.
  const decision = canCreate(req.user, { classification });
  if (!decision.allowed) {
    return res.status(403).json({
      error: 'Forbidden',
      reason: decision.reason,
      message: decision.message,
    });
  }

  const newDoc = {
    id: db.nextDocId++, // pakai ID sekarang, lalu naikkan counter
    title: title.trim(),
    ownerId: req.user.id, // dari token, bukan body
    ownerUsername: req.user.username,
    department: req.user.department, // mengikuti departemen user
    classification,
  };

  db.documents.push(newDoc);

  res.status(201).json({
    message: 'Dokumen berhasil dibuat',
    document: newDoc,
  });
});

// Hapus dokumen tertentu. Dipakai di DELETE /documents/:id.
router.delete('/documents/:id', authenticateToken, (req, res) => {
  const id = parseInt(req.params.id, 10);

  if (Number.isNaN(id)) {
    return res.status(400).json({
      error: 'Invalid ID',
      message: 'ID dokumen harus berupa angka.',
    });
  }

  const doc = findDocumentById(id);
  if (!doc) {
    return res.status(404).json({
      error: 'Document not found',
      message: `Dokumen dengan id ${id} tidak ditemukan.`,
    });
  }

  const decision = canDelete(req.user, doc);
  if (!decision.allowed) {
    return res.status(403).json({
      error: 'Forbidden',
      reason: decision.reason,
      message: decision.message,
    });
  }

  // Hapus dari array in-memory.
  const index = db.documents.findIndex((d) => d.id === id);
  db.documents.splice(index, 1);

  res.json({
    message: 'Dokumen berhasil dihapus',
    deleted: doc,
    deletedBy: {
      username: req.user.username,
      role: req.user.role,
      department: req.user.department,
    },
  });
});

module.exports = router;
