// Pusat aturan ABAC (Attribute-Based Access Control) untuk dokumen. 

const CLASSIFICATION_LEVELS = { public: 1, confidential: 2, secret: 3 };
const CLEARANCE_LEVELS = { low: 1, medium: 2, high: 3 };

// Helper hasilkan objek { allowed, reason, message } untuk memudahkan penanganan error.
function deny(reason, message) {
  return { allowed: false, reason, message };
}

function allow() {
  return { allowed: true, reason: 'allowed', message: 'Akses diizinkan.' };
}

// Aturan membaca dokumen (ABAC) (#3)
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

// Aturan membuat dokumen:
//   1. classification harus salah satu nilai yang dikenal.
//   2. classification tidak boleh melebihi clearance user.
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

// Aturan menghapus dokumen: hanya role tertentu yang boleh menghapus dokumen
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

// Aturan akses data sensitif: hanya role tertentu dengan clearance tinggi yang boleh mengakses data sensitif.
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
