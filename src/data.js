/**
 *   "Database tiruan" (in-memory) untuk aplikasi DMS. Berisi daftar user dan dokumen beserta atribut-atributnya, plus beberapa
 *   helper untuk mencari data. Data ini dipakai bersama oleh banyak route, jadi cukup
 *   di-require sekali. Node akan meng-cache module ini sehingga seluruh aplikasi melihat objek yang SAMA (bukan salinan).
 */

const db = {
  users: [
    {
      id: 1,
      username: 'admin',
      passwordHash:
        '$2a$10$hSkOnXiBbJotLo7Ixeyg8OALR8WUqollrGks6iYfMi9BUd6m80D7a',
      email: 'admin@example.com',
      role: 'admin', // RBAC: akses penuh
      department: 'IT', // ABAC: hanya resource departemen IT
      clearance: 'high', // ABAC: boleh baca dokumen sampai level "secret"
      provider: 'local', // login via username + password
    },
    {
      id: 2,
      username: 'manager',
      passwordHash:
        '$2b$10$xm3qFPkcdbiEKpL28pKuq.ENo9rZ6juO1xUwjbAYXOA3xA.3bmRwq',
      email: 'manager@example.com',
      role: 'manager', // RBAC: boleh kelola dokumen departemennya
      department: 'HR', // ABAC: bertanggung jawab di HR
      clearance: 'medium', // ABAC: sampai level "confidential"
      provider: 'local',
    },
    {
      id: 3,
      username: 'staff',
      passwordHash:
        '$2b$10$MnjCZWtcoiyLlXHTedW15ujsea4Ju1suPqoPAFZpvWuR.I3RKMgs2',
      email: 'staff@example.com',
      role: 'staff', // RBAC: hanya data miliknya sendiri
      department: 'IT', // ABAC: berada di departemen IT
      clearance: 'low', // ABAC: hanya dokumen "public"
      provider: 'local',
    },
  ],

  documents: [
    {
      id: 1,
      title: 'Panduan Onboarding Karyawan',
      ownerId: 3,
      ownerUsername: 'staff',
      department: 'IT',
      classification: 'public',
    },
    {
      id: 2,
      title: 'Laporan Gaji Q3 2025',
      ownerId: 2,
      ownerUsername: 'manager',
      department: 'HR',
      classification: 'confidential',
    },
    {
      id: 3,
      title: 'Rencana Strategis 2026',
      ownerId: 1,
      ownerUsername: 'admin',
      department: 'IT',
      classification: 'secret',
    },
    {
      id: 4,
      title: 'Kontrak Vendor Cloud',
      ownerId: 2,
      ownerUsername: 'manager',
      department: 'HR',
      classification: 'confidential',
    },
    {
      id: 5,
      title: 'Catatan Rapat Tim IT',
      ownerId: 3,
      ownerUsername: 'staff',
      department: 'IT',
      classification: 'public',
    },
    {
      id: 6,
      title: 'Arsitektur Keamanan Sistem',
      ownerId: 1,
      ownerUsername: 'admin',
      department: 'IT',
      classification: 'secret',
    },
  ],

  // Counter untuk ID berikutnya. Nilainya adalah ID yang AKAN dipakai
  // pada pembuatan berikutnya, lalu di-increment di route dengan `db.nextX++`.
  // Kenapa tidak `users.length + 1`? Karena setelah ada data yang dihapus,
  // panjang array bisa mengecil dan ID lama bisa terpakai ulang (bentrok).
  // Nilai awal: 3 user seed + 1, dan 6 dokumen seed + 1.
  nextUserId: 4,
  nextDocId: 7,
};

// Helper untuk mencari user berdasarkan ID. Dipakai di route admin & profile.
function findUserById(id) {
  return db.users.find((u) => u.id === id);
}

// cari user berdasarkan username. Dipakai di route register & login.
function findUserByUsername(username) {
  return db.users.find((u) => u.username === username);
}

// Helper untuk mencari dokumen berdasarkan ID. Dipakai di route GET /documents/:id dan DELETE /documents/:id.
function findDocumentById(id) {
  return db.documents.find((d) => d.id === id);
}

module.exports = {
  db,
  findUserById,
  findUserByUsername,
  findDocumentById,
};
