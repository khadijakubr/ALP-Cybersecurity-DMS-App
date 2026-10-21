/**
 * ============================================================
 * FILE: src/policies.js
 * ============================================================
 * FUNGSI:
 *   Pusat aturan ABAC (Attribute-Based Access Control) untuk
 *   dokumen. Semua keputusan "boleh/tidak" dibuat di sini, bukan
 *   di dalam route. Route cukup memanggil canRead() / canCreate().
 *
 * KENAPA DIPISAH?
 *   1. Satu sumber kebenaran (single source of truth): aturan tidak
 *      tersebar di banyak endpoint.
 *   2. Mudah diuji: fungsi murni (input -> output) tanpa HTTP.
 *   3. Mudah dibaca dosen: semua policy ada di satu file.
 *
 * BEDA RBAC vs ABAC:
 *   - RBAC  : keputusan berdasarkan PERAN (role).
 *   - ABAC  : keputusan berdasarkan ATRIBUT user & resource.
 *   Di file ini fokusnya atribut:
 *     user     -> scope (dari role), clearance, id
 *     dokumen  -> ownerId, department, classification
 *
 * ASAL KODE:
 *   [REUSE: abac/src/server.js] -> konsep `levels`, `clearances`,
 *   dan `abacPolicies` (perbandingan clearance vs classification).
 *   [BARU] -> fungsi canRead/canCreate yang mengembalikan ALASAN
 *   (bukan sekadar true/false) agar mudah didemokan & di-debug.
 * ============================================================
 */

/**
 * PEMETAAN LEVEL
 * Kenapa angka? Supaya perbandingan "cukup/tinggi" jadi sederhana:
 *   clearance >= classification  -> boleh baca.
 *
 * public (1) < confidential (2) < secret (3)
 * low   (1) < medium      (2) < high   (3)
 */
const CLASSIFICATION_LEVELS = { public: 1, confidential: 2, secret: 3 };
const CLEARANCE_LEVELS = { low: 1, medium: 2, high: 3 };

/**
 * HELPER HASIL KEPUTUSAN
 * Mengembalikan objek, bukan boolean, supaya route bisa memberi
 * pesan yang jelas: kenapa akses ditolak.
 */
function deny(reason, message) {
  return { allowed: false, reason, message };
}

function allow() {
  return { allowed: true, reason: 'allowed', message: 'Akses diizinkan.' };
}

/**
 * ============================================================
 * POLICY: canRead(user, doc)
 * ============================================================
 * Aturan baca dokumen (Requirement #3 - ABAC):
 *
 *   1. CAKUPAN (scope)
 *      - admin   : semua dokumen
 *      - manager : hanya dokumen di departemennya
 *      - staff   : hanya dokumen miliknya sendiri
 *      Scope ditentukan oleh role, tetapi PERBANDINGANNYA memakai
 *      atribut (ownerId / department). Inilah inti ABAC.
 *
 *   2. CLEARANCE
 *      clearance user harus >= classification dokumen.
 *      Contoh: staff (low) tidak boleh baca dokumen secret.
 *
 * KEDUA syarat harus terpenuhi (logika AND).
 */
function canRead(user, doc) {
  // ---- 1. Cakupan akses ----
  const isAdmin = user.role === 'admin';
  const isManagerOfDept = user.role === 'manager' && doc.department === user.department;
  const isOwner = doc.ownerId === user.id;

  if (!isAdmin && !isManagerOfDept && !isOwner) {
    return deny(
      'out_of_scope',
      'Dokumen berada di luar cakupan akses Anda (bukan milik Anda / bukan departemen Anda).'
    );
  }

  // ---- 2. Clearance vs classification ----
  const userLevel = CLEARANCE_LEVELS[user.clearance] || 0;
  const docLevel = CLASSIFICATION_LEVELS[doc.classification] || 0;

  // Nilai level yang tidak dikenal (0) otomatis ditolak.
  if (userLevel < docLevel) {
    return deny(
      'insufficient_clearance',
      `Clearance Anda (${user.clearance}) tidak cukup untuk dokumen ${doc.classification}.`
    );
  }

  return allow();
}

/**
 * ============================================================
 * POLICY: canCreate(user, data)
 * ============================================================
 * Aturan membuat dokumen:
 *   1. classification harus salah satu nilai yang dikenal.
 *   2. classification tidak boleh melebihi clearance user.
 *      (staff low hanya boleh membuat "public", dst.)
 *
 * Catatan: department & ownerId TIDAK diambil dari body, tetapi
 * dari data user yang login (lihat routes/documents.js). Ini
 * mencegah user memalsukan kepemilikan/departemen.
 */
function canCreate(user, { classification }) {
  if (!CLASSIFICATION_LEVELS[classification]) {
    return deny(
      'invalid_classification',
      'Classification harus salah satu dari: public, confidential, secret.'
    );
  }

  const userLevel = CLEARANCE_LEVELS[user.clearance] || 0;
  const requestedLevel = CLASSIFICATION_LEVELS[classification];

  if (userLevel < requestedLevel) {
    return deny(
      'insufficient_clearance',
      `Clearance Anda (${user.clearance}) tidak cukup untuk membuat dokumen ${classification}.`
    );
  }

  return allow();
}

/**
 * ============================================================
 * POLICY: canDelete(user, doc)  -> GABUNGAN RBAC + ABAC (#4)
 * ============================================================
 * Inilah contoh keputusan otorisasi yang memakai DUA dimensi:
 *
 *   RBAC  : role user harus admin atau manager.
 *   ABAC  : doc.department harus SAMA dengan user.department.
 *
 * Keduanya wajib benar (AND). Jadi:
 *   - manager HR boleh hapus dokumen HR
 *   - manager HR TIDAK boleh hapus dokumen IT
 *   - staff TIDAK boleh hapus apa pun (gagal di RBAC)
 *
 * Kenapa tidak memakai middleware requireRole saja?
 *   requireRole hanya menjawab "perannya boleh atau tidak".
 *   Ia tidak tahu dokumen mana yang disentuh. Untuk menggabungkan
 *   dengan atribut dokumen, kita butuh fungsi yang menerima
 *   (user, doc) sekaligus.
 */
const DELETE_ROLES = ['admin', 'manager'];

function canDelete(user, doc) {
  // ---- Dimensi RBAC ----
  if (!DELETE_ROLES.includes(user.role)) {
    return deny(
      'role_not_allowed',
      'Penghapusan hanya untuk role admin atau manager.'
    );
  }

  // ---- Dimensi ABAC ----
  if (doc.department !== user.department) {
    return deny(
      'department_mismatch',
      `Dokumen berasal dari departemen ${doc.department}, sedangkan Anda di ${user.department}.`
    );
  }

  return allow();
}

/**
 * ============================================================
 * POLICY: canAccessSensitive(user) -> GABUNGAN RBAC + ABAC (#4)
 * ============================================================
 * Contoh kedua: akses data sensitif hanya untuk role tertentu
 * DAN level otorisasi (clearance) yang sesuai.
 *
 *   RBAC  : role harus admin atau manager.
 *   ABAC  : clearance harus minimal "high" (setara level secret).
 *
 * Hasil yang diharapkan dari seed data:
 *   - admin   (admin, high)   -> ALLOW
 *   - manager (manager, medium) -> DENY (clearance kurang)
 *   - staff   (staff, low)    -> DENY (role tidak boleh)
 */
const SENSITIVE_ROLES = ['admin', 'manager'];

function canAccessSensitive(user) {
  if (!SENSITIVE_ROLES.includes(user.role)) {
    return deny(
      'role_not_allowed',
      'Data sensitif hanya untuk role admin atau manager.'
    );
  }

  const userLevel = CLEARANCE_LEVELS[user.clearance] || 0;
  if (userLevel < CLASSIFICATION_LEVELS.secret) {
    return deny(
      'insufficient_clearance',
      `Akses data sensitif membutuhkan clearance high, sedangkan Anda ${user.clearance}.`
    );
  }

  return allow();
}

module.exports = {
  CLASSIFICATION_LEVELS,
  CLEARANCE_LEVELS,
  canRead,
  canCreate,
  canDelete,
  canAccessSensitive,
};
