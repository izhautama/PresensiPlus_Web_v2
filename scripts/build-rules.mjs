// Menghasilkan database.rules.json dari definisi di bawah.
// Realtime Database Rules tidak punya variabel/makro, jadi ekspresi peran dirakit di sini.
// Jalankan: npm run rules   (otomatis dipanggil oleh `npm run build`/`deploy`)
// Peran baru cukup ditambahkan di daftar di bawah (STAF_KESISWAAN / PEMBACA / PENULIS_JAM).
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const peran = (r) => `root.child('roles').child(auth.uid).val() === '${r}'`;

// ---- helper ekspresi -------------------------------------------------------
const isAdmin = peran("admin");
const isDevice = peran("device");
const isKepala = peran("kepala");
const isWaka = peran("waka");
const isPiket = peran("piket");

/** auth != null && (a || b || ...) — tanpa kurung bila hanya satu. */
const anyOf = (...e) => `auth != null && ${e.length === 1 ? e[0] : `(${e.join(" || ")})`}`;

/** Staf kesiswaan: pemegang hak tulis modul kesiswaan. Tambah `piket` di sini bila hak tulis sama. */
const STAF_KESISWAAN = [isWaka, isKepala];
/** Semua staf yang boleh MEMBACA data sekolah (siswa, kehadiran, log, izin). */
const PEMBACA = [isAdmin, isKepala, isWaka];

const adminSaja = anyOf(isAdmin);
const pembaca = anyOf(...PEMBACA);
const stafKesiswaan = anyOf(...STAF_KESISWAAN);
/** Penulis presensi per jam. Peran `piket` akan ditambahkan di sini dengan batasan sel sendiri. */
const PENULIS_JAM = [isWaka];
const penulisJam = anyOf(...PENULIS_JAM);

const orStafKes = STAF_KESISWAAN.join(" || ");
const orAdminDanStaf = [isAdmin, ...STAF_KESISWAAN, isPiket].join(" || ");
/** Pembaca tambahan untuk piket pada node yang memang diperlukan (granular; piket TIDAK masuk PEMBACA umum). */
const pembacaPiket = anyOf(isAdmin, isKepala, isWaka, isPiket);

const tglRe = "/^20[0-9]{2}-[01][0-9]-[0-3][0-9]$/";
const taRe = "/^20[0-9]{2}-20[0-9]{2}$/";
const str = (max, min = 1) => `newData.isString() && newData.val().length >= ${min} && newData.val().length <= ${max}`;
const bulat = (min, max) => `newData.isNumber() && newData.val() >= ${min} && newData.val() <= ${max} && newData.val() % 1 === 0`;
const jamRe = "/^[1-9]$/";
// ---- jendela waktu piket. Rules tidak punya fungsi tanggal; hariKe (epoch-day WIB) dibandingkan dengan `now`.
// Kecocokan hariKe dengan kunci tanggal TIDAK dapat diverifikasi rules (keterbatasan tanpa Cloud Functions); ditegakkan UI + log.
const hariIni = "((now + 25200000) / 86400000)";
const mundurN = "(root.child('discipline').child('settings').child('piketMundurHari').val() != null ? root.child('discipline').child('settings').child('piketMundurHari').val() : 2)";
/** hariKe sah: bilangan bulat dalam [hariIni - N, hariIni + batasDepan]. hariIni dihitung desimal (>= lantai), sehingga batas bawah efektif tepat N hari. */
const hariKeSah = (ex, depan) => `${ex}.isNumber() && ${ex}.val() % 1 === 0 && ${ex}.val() >= ${hariIni} - ${mundurN} - 1 && ${ex}.val() <= ${hariIni} + ${depan}`;
const AKSI_AKTIVITAS = "newData.isString() && newData.val().matches(/^(login|logout|pilih-petugas|izin-harian|izin-jam|hapus-izin|pelanggaran|hapus-pelanggaran|remisi|ubah-pelanggaran|pulihkan-pelanggaran|presensi-jam|validasi-alfa|batal-alfa|saran-setuju|saran-abaikan|kunci-akun|buka-kunci)$/)";
const KET_IZIN = "(newData.val() === 'Izin' || newData.val() === 'Sakit' || newData.val() === 'Dispensasi')";
const nisRe = "/^[0-9]{1,20}$/";
const KODE_JAM = "newData.val() === 'S' || newData.val() === 'I' || newData.val() === 'D' || newData.val() === 'A'";
const milikAnak = "auth != null && root.child('parents').child($nis).child('uid').val() === auth.uid";
const KATEGORI = "newData.val() === 'Sangat Berat' || newData.val() === 'Berat' || newData.val() === 'Sedang' || newData.val() === 'Ringan'";

/** Akses data BARU (setelah update ini) dari dalam rules `discipline/records|recordMeta/$nis/$recId`: tiga tingkat ke `discipline`. */
const dariDisc = "newData.parent().parent().parent()";
const metaBaru = (nis, id) => `${dariDisc}.child('recordMeta').child(${nis}).child(${id})`;
const recordBaru = (nis, id) => `${dariDisc}.child('records').child(${nis}).child(${id})`;
/** Bidang isi catatan publik (dipakai di records dan snapshot recordMeta). */
const isiRecord = () => ({
  jenis: { ".validate": "newData.val() === 'pelanggaran' || newData.val() === 'remisi'" },
  refId: { ".validate": str(60) },
  nama: { ".validate": str(200) },
  kategori: { ".validate": str(30) },
  poin: { ".validate": bulat(1, 1000) },
  tanggal: { ".validate": `newData.isString() && newData.val().matches(${tglRe})` },
  ta: { ".validate": `newData.isString() && newData.val().matches(${taRe})` },
  takziran: { ".validate": str(300) },
  sumber: { ".validate": "newData.val() === 'manual' || newData.val() === 'saran' || newData.val() === 'piket'" },
});

const TIPE_SARAN = "(terlambat|tanpaTapPulang|bolosJam|alfa)";
/** Catatan bersumber "saran" HANYA sah bila ada keputusan "diterima" pada update yang sama (id deterministik {tanggal}_{tipe}). */
const saranSah = () =>
  `$recId.matches(/^20[0-9]{2}-[01][0-9]-[0-3][0-9]_${TIPE_SARAN}$/) && $recId.beginsWith(newData.child('tanggal').val() + '_') && ${dariDisc}.child('suggest').child(newData.child('tanggal').val()).child($recId.replace(newData.child('tanggal').val() + '_', '') + '_' + $nis).child('keputusan').val() === 'diterima'`;

// ---- LOG AKTIVITAS WAJIB (piket) -------------------------------------------------------------------------------
// Setiap tulisan piket hanya sah bila UPDATE YANG SAMA menulis:
//   activityLast/{uid} = { id, ts, tgl }  dengan ts === now   (penanda "aksi ini baru terjadi")
//   activity/{tgl}/{id} dengan uid === auth.uid dan aksi yang sesuai jenis tulisan.
// `tgl` ditambahkan ke activityLast (di luar spec { id, ts }) karena rules tidak dapat menurunkan kunci tanggal dari id.
// Untuk izin, izinMeta HARUS dibuat pada update yang sama (kunci "<activityId>_<S|I|D|H>" dengan ts === now), sehingga
// meta lama tidak dapat dipakai ulang untuk menulis sel/ket baru.
/** newData naik n tingkat sampai root (n = jumlah tingkat dari node yang sedang ditulis). */
const nav = (n) => "newData" + ".parent()".repeat(n);
const ACT = (n) => `${nav(n)}.child('activityLast').child(auth.uid)`;
const ENT = (n) => `${nav(n)}.child('activity').child(${ACT(n)}.child('tgl').val()).child(${ACT(n)}.child('id').val())`;
const actOk = (n, aksi) => `${ACT(n)}.child('ts').val() === now && ${ENT(n)}.child('ts').val() === now && ${ENT(n)}.child('uid').val() === auth.uid && (${aksi.map((a) => `${ENT(n)}.child('aksi').val() === '${a}'`).join(" || ")})`;
/** izinMeta baru (ts === now) berkunci "<activityId>_<sufiks>" untuk (tgl, nis) pada update yang sama. */
const metaBaruPiket = (n, tgl, nis, sufiks) => `${nav(n)}.child('izinMeta').child(${tgl}).child(${nis}).child(${ACT(n)}.child('id').val() + '_' + ${sufiks}).child('ts').val() === now`;

/**
 * Hak tulis piket pada discipline/records/$nis/$recId. HANYA membuat pelanggaran dari master (aktif, kategori Ringan ATAU
 * bertakziran) dengan poin/nama/kategori/takziran identik master, sumber "piket", dan piketHarian yang jendelanya sah;
 * atau soft delete catatan piket sendiri (meta pada update yang sama menandai dihapus). Tidak ada edit, tidak ada remisi.
 */
const piketRecordOk = () => {
  const R = "root.child('discipline').child('rules').child(newData.child('refId').val())";
  const PH = `newData.parent().parent().parent().parent().child('piketHarian').child(newData.child('tanggal').val()).child($recId)`;
  const buat = [
    "!data.exists()",
    "newData.child('jenis').val() === 'pelanggaran'",
    "newData.child('sumber').val() === 'piket'",
    `${R}.child('aktif').val() === true`,
    `(${R}.child('kategori').val() === 'Ringan' || ${R}.child('takziran').val().length > 0)`,
    `newData.child('poin').val() === ${R}.child('poin').val()`,
    `newData.child('nama').val() === ${R}.child('nama').val()`,
    `newData.child('kategori').val() === ${R}.child('kategori').val()`,
    `newData.child('takziran').val() === ${R}.child('takziran').val()`,
    `${PH}.child('nis').val() === $nis`,
    hariKeSah(`${PH}.child('hariKe')`, 0),
    actOk(4, ["pelanggaran"]),
  ].join(" && ");
  const hapus = `data.child('sumber').val() === 'piket' && ${metaBaru('$nis', '$recId')}.child('dihapus').val() === true && ${actOk(4, ["hapus-pelanggaran"])}`;
  return `(newData.exists() ? (${buat}) : (${hapus}))`;
};

// ---- aturan ----------------------------------------------------------------
export function buildRules() {
  const rules = {
    ".read": false,
    ".write": false,

    // admin boleh membuat/mencabut HANYA akun kepala & waka (anti eskalasi hak akses)
    roles: {
      $uid: {
        ".read": `auth != null && (auth.uid === $uid || ${isAdmin})`,
        // admin: kelola kepala/waka/piket. waka: HANYA mengunci (hapus role) dan membuka kunci (set 'piket' bila staff/{uid}.role = piket) akun piket.
        ".write": `auth != null && $uid !== auth.uid && ((${isAdmin} && (data.val() === null || data.val() === 'kepala' || data.val() === 'waka' || data.val() === 'piket') && (!newData.exists() || newData.val() === 'kepala' || newData.val() === 'waka' || newData.val() === 'piket')) || (${isWaka} && ((data.val() === 'piket' && !newData.exists()) || (!data.exists() && newData.val() === 'piket' && root.child('staff').child($uid).child('role').val() === 'piket'))))`,
        ".validate": "newData.val() === 'kepala' || newData.val() === 'waka' || newData.val() === 'piket'",
      },
    },

    staff: {
      ".read": adminSaja,
      $uid: {
        ".read": `auth != null && (auth.uid === $uid || ${isAdmin})`,
        ".write": adminSaja,
        ".validate": "newData.hasChildren(['email', 'nama', 'role', 'dibuat'])",
        email: { ".validate": "newData.isString() && newData.val().length > 0 && newData.val().length <= 120" },
        nama: { ".validate": "newData.isString() && newData.val().length >= 1 && newData.val().length <= 60" },
        role: { ".validate": "newData.val() === 'kepala' || newData.val() === 'waka' || newData.val() === 'piket'" },
        dibuat: { ".validate": "newData.isNumber()" },
        $other: { ".validate": false },
      },
    },

    config: {
      ".read": anyOf(isAdmin, isDevice),
      ".write": adminSaja,
      schedule: { ".read": "auth != null" },
      students: {
        ".read": anyOf(isKepala, isWaka, isPiket),
        $cardUid: {
          ".validate": "$cardUid.matches(/^[0-9A-F]{8,20}$/) && newData.hasChildren(['nis', 'nama', 'kelas'])",
          nis: { ".validate": "newData.isString() && newData.val().matches(/^[0-9]{1,20}$/)" },
          nama: { ".validate": "newData.isString() && newData.val().length > 0 && newData.val().length <= 60" },
          kelas: { ".validate": "newData.isString() && newData.val().length > 0 && newData.val().length <= 15" },
          $other: { ".validate": false },
        },
      },
      version: {
        ".read": anyOf(isKepala, isWaka),
        ".validate": "newData.isNumber()",
      },
    },

    parents: {
      $nis: {
        ".read": adminSaja,
        ".write": adminSaja,
        ver: { ".read": true, ".validate": "newData.isNumber() && newData.val() >= 1" },
        uid: { ".validate": "newData.isString()" },
        $other: { ".validate": false },
      },
    },

    profiles: {
      ".read": pembaca,
      $nis: {
        ".read": "auth != null && root.child('parents').child($nis).child('uid').val() === auth.uid",
        ".write": adminSaja,
      },
    },

    attendance: {
      ".read": pembaca,
      $nis: {
        ".read": "auth != null && root.child('parents').child($nis).child('uid').val() === auth.uid",
        $date: {
          ".read": anyOf(isPiket), // hanya satu tanggal milik satu siswa (cek "sudah tap masuk" sebelum izin); bukan seluruh riwayat
          // Alat boleh MEMBUAT node tanggal baru secara utuh; perubahan berikutnya lewat anak (masuk/pulang/status) di bawah.
          // Tidak ada penghapusan oleh alat: node tanggal tidak dapat ditimpa/dihapus karena !data.exists().
          ".write": `auth != null && (${isAdmin} || (${isDevice} && newData.exists() && !data.exists()))`,
          ".validate": `$date.matches(${tglRe})`,
          masuk: {
            ".write": `auth != null && ${isDevice} && newData.exists()`,
            ".validate": "newData.isString() && newData.val().matches(/^[0-2][0-9]:[0-5][0-9]:[0-5][0-9]$/)",
          },
          pulang: {
            ".write": `auth != null && ${isDevice} && newData.exists()`,
            ".validate": "newData.isString() && newData.val().matches(/^[0-2][0-9]:[0-5][0-9]:[0-5][0-9]$/)",
          },
          status: {
            ".write": `auth != null && ${isDevice} && newData.exists()`,
            ".validate": "newData.val() === 'Hadir' || newData.val() === 'Terlambat'",
          },
          // Keterangan harian Izin/Sakit/Dispensasi: waka & kepala (admin lewat $date). Piket hanya bila belum ada validasi Alfa
          // dan ada izinMeta (keterangan + surat) pada update yang sama. Alat TIDAK punya hak ke ket/catatan.
          ket: {
            ".write": `auth != null && (${isWaka} || ${isKepala} || (${isPiket} && !root.child('validasi').child($date).child($nis).exists() && (newData.exists() ? (${actOk(4, ["izin-harian"])} && ${metaBaruPiket(4, '$date', '$nis', "'H'")}) : ${actOk(4, ["hapus-izin"])})))`,
            ".validate": `${KET_IZIN} && (${orAdminDanStaf})`,
          },
          catatan: {
            ".write": `auth != null && (${isWaka} || ${isKepala} || (${isPiket} && !root.child('validasi').child($date).child($nis).exists() && (newData.exists() ? (${actOk(4, ["izin-harian"])} && ${metaBaruPiket(4, '$date', '$nis', "'H'")}) : ${actOk(4, ["hapus-izin"])})))`,
            ".validate": `newData.isString() && newData.val().length <= 200 && (${orAdminDanStaf})`,
          },
          $other: { ".validate": false },
        },
      },
    },

    log: {
      ".read": pembaca,
      $date: {
        ".read": anyOf(isPiket), // piket membaca satu tanggal (status tap), bukan seluruh log
        ".indexOn": ["jam"],
        $key: {
          ".write": `auth != null && (${isAdmin} || (${isDevice} && newData.exists()))`,
          ".validate": "$key.matches(/^[0-9A-F]{8,20}_(M|P)$/) && newData.hasChildren(['jam', 'nis', 'status'])",
        },
      },
    },

    unknown: {
      ".read": adminSaja,
      $date: {
        $cardUid: {
          ".write": `auth != null && (${isAdmin} || (${isDevice} && newData.exists()))`,
        },
      },
    },

    device: {
      ".read": adminSaja,
      status: {
        ".read": anyOf(isKepala, isWaka),
        ".write": `${anyOf(isDevice)} && newData.exists()`, // alat menimpa/menambah, tidak menghapus
      },
      events: {
        ".indexOn": ["ts"],
        $id: {
          ".write": `auth != null && ((${isDevice} && !data.exists() && newData.exists()) || ${isAdmin})`,
        },
      },
      inbox: {
        ".read": anyOf(isDevice),
        ".write": adminSaja,
        command: {
          ".validate": "newData.hasChildren(['id', 'cmd', 'ts'])",
          cmd: { ".validate": "newData.val() === 'restart' || newData.val() === 'sync' || newData.val() === 'buzzer' || newData.val() === 'lcd' || newData.val() === 'diagnostik'" },
          arg: { ".validate": "newData.isString() && newData.val().length <= 64" },
          id: { ".validate": "newData.isString() && newData.val().length <= 32" },
          ts: { ".validate": "newData.isNumber()" },
          $other: { ".validate": false },
        },
        watching: { ".validate": "newData.isNumber()" },
        $other: { ".validate": false },
      },
      ack: {
        $id: { ".write": `${anyOf(isDevice)} && newData.exists()` },
      },
    },

    // ------------------------------------------------------------------ kesiswaan
    // Tulis: waka + kepala (STAF_KESISWAAN). Admin hanya membaca. Tidak ada penghapusan fisik (newData.exists()).
    discipline: {
      // Pengaturan piket: jendela input mundur (hari). Hanya waka yang mengubah.
      settings: {
        ".read": pembacaPiket,
        piketMundurHari: { ".write": anyOf(isWaka), ".validate": bulat(0, 14) },
        $other: { ".validate": false },
      },
      rules: {
        ".read": "auth != null",
        $ruleId: {
          ".write": `${stafKesiswaan} && newData.exists()`,
          ".validate": `$ruleId.matches(/^[A-Za-z0-9_-]{1,40}$/) && newData.hasChildren(['kategori', 'nama', 'poin', 'aktif', 'diubahOleh', 'diubahTs'])`,
          kategori: { ".validate": KATEGORI },
          nama: { ".validate": str(200) },
          poin: { ".validate": bulat(1, 1000) },
          takziran: { ".validate": str(300) },
          aktif: { ".validate": "newData.isBoolean()" },
          diubahOleh: { ".validate": "newData.val() === auth.uid" },
          diubahTs: { ".validate": "newData.isNumber()" },
          $other: { ".validate": false },
        },
      },
      remisi: {
        ".read": `auth != null && !(${isPiket})`,
        $remId: {
          ".write": `${stafKesiswaan} && newData.exists()`,
          ".validate": `$remId.matches(/^[A-Za-z0-9_-]{1,40}$/) && newData.hasChildren(['kelompok', 'nama', 'poin', 'aktif', 'diubahOleh', 'diubahTs'])`,
          kelompok: { ".validate": "newData.val() === 'Prestasi' || newData.val() === 'Tanpa prestasi'" },
          nama: { ".validate": str(200) },
          poin: { ".validate": bulat(1, 1000) },
          syarat: { ".validate": str(200) },
          aktif: { ".validate": "newData.isBoolean()" },
          diubahOleh: { ".validate": "newData.val() === auth.uid" },
          diubahTs: { ".validate": "newData.isNumber()" },
          $other: { ".validate": false },
        },
      },
      levels: {
        ".read": `auth != null && !(${isPiket})`,
        $lvlId: {
          ".write": stafKesiswaan, // ambang yang salah boleh dihapus (tercatat di audit)
          ".validate": `$lvlId.matches(/^[A-Za-z0-9_-]{1,40}$/) && newData.hasChildren(['poin', 'tindakan'])`,
          poin: { ".validate": bulat(1, 100000) },
          tindakan: { ".validate": str(200) },
          $other: { ".validate": false },
        },
      },
      autoMap: {
        ".read": `auth != null && !(${isPiket})`,
        ".write": stafKesiswaan,
        terlambat: { ".validate": str(40) },
        tanpaTapPulang: { ".validate": str(40) },
        bolosJam: { ".validate": str(40) },
        alfa: { ".validate": str(40) },
        $other: { ".validate": false },
      },
      // PUBLIK (orang tua boleh membaca anak sendiri): hanya isi pelanggaran/remisi. TANPA nama pencatat, TANPA item terhapus.
      // Setiap tulis ke sini WAJIB disertai recordMeta yang konsisten dalam update yang sama (dicek lewat newData.parent()).
      records: {
        ".read": pembaca,
        $nis: {
          ".read": milikAnak,
          ".validate": `$nis.matches(${nisRe})`,
          $recId: {
            // hapus (soft delete) hanya bila meta pada update yang sama menandai dihapus
            ".write": `auth != null && ((${STAF_KESISWAAN.join(" || ")}) && (newData.exists() || ${metaBaru('$nis', '$recId')}.child('dihapus').val() === true) || (${isPiket} && ${piketRecordOk()}))`,
            ".validate": `$recId.matches(/^[A-Za-z0-9_-]{1,60}$/) && newData.hasChildren(['jenis', 'nama', 'poin', 'tanggal', 'ta', 'sumber']) && ${metaBaru('$nis', '$recId')}.exists() && !${metaBaru('$nis', '$recId')}.child('dihapus').exists() && (newData.child('sumber').val() !== 'saran' || (${saranSah()})) && (newData.child('sumber').val() !== 'piket' || ${isPiket} || data.exists()) && (!data.exists() || (${metaBaru('$nis', '$recId')}.child('diubahOleh').val() === auth.uid && ${metaBaru('$nis', '$recId')}.child('diubahTs').val() !== root.child('discipline').child('recordMeta').child($nis).child($recId).child('diubahTs').val()))`,
            ...isiRecord(),
            $other: { ".validate": false },
          },
        },
      },
      // KHUSUS STAF: siapa mencatat/mengubah/menghapus + riwayat terhapus. Orang tua DITOLAK membaca.
      recordMeta: {
        ".read": pembaca,
        $nis: {
          ".validate": `$nis.matches(${nisRe})`,
          $recId: {
            ".write": `auth != null && newData.exists() && ((${STAF_KESISWAAN.join(" || ")}) || (${isPiket} && (${recordBaru('$nis', '$recId')}.child('sumber').val() === 'piket' || root.child('discipline').child('records').child($nis).child($recId).child('sumber').val() === 'piket') && (${actOk(4, ["pelanggaran"])} || ${actOk(4, ["hapus-pelanggaran"])})))`, // meta tidak pernah dihapus fisik: ia jejak pencatat & riwayat terhapus
            // Baru: dibuatOleh === pengguna. Lama: dibuatOleh & dibuatTs tidak boleh berubah (create kedua dengan id sama ditolak).
            // Dihapus: wajib alasan + snapshot dan record publik harus hilang. Tidak dihapus: record publik harus ada.
            ".validate": `$recId.matches(/^[A-Za-z0-9_-]{1,60}$/) && newData.hasChildren(['dibuatOleh', 'dibuatNama', 'dibuatTs']) && (data.exists() ? (newData.child('dibuatOleh').val() === data.child('dibuatOleh').val() && newData.child('dibuatTs').val() === data.child('dibuatTs').val()) : newData.child('dibuatOleh').val() === auth.uid) && (newData.child('dihapus').exists() ? (newData.child('alasanHapus').exists() && newData.child('snapshot').exists() && !${recordBaru('$nis', '$recId')}.exists()) : ${recordBaru('$nis', '$recId')}.exists())`,
            dibuatOleh: { ".validate": "newData.isString()" },
            dibuatNama: { ".validate": str(60) },
            dibuatTs: { ".validate": "newData.isNumber()" },
            diubahOleh: { ".validate": "newData.val() === auth.uid" },
            diubahTs: { ".validate": "newData.isNumber()" },
            dihapus: { ".validate": "newData.val() === true" },
            alasanHapus: { ".validate": str(200) },
            snapshot: {
              ".validate": "newData.hasChildren(['jenis', 'nama', 'poin', 'tanggal', 'ta', 'sumber'])",
              ...isiRecord(),
              $other: { ".validate": false },
            },
            $other: { ".validate": false },
          },
        },
      },
      // Keputusan atas saran otomatis. Create-only (satu keputusan per saran, selamanya): menahan persetujuan ganda bersamaan.
      suggest: {
        ".read": pembaca,
        $tgl: {
          ".validate": `$tgl.matches(${tglRe})`,
          $key: {
            ".write": `${stafKesiswaan} && !data.exists() && newData.exists()`,
            ".validate": `$key.matches(/^${TIPE_SARAN}_[0-9]{1,20}$/) && newData.hasChildren(['keputusan', 'oleh', 'ts', 'nis']) && $key.endsWith('_' + newData.child('nis').val()) && (newData.child('keputusan').val() === 'diterima' ? (newData.child('recId').val() === $tgl + '_' + $key.replace('_' + newData.child('nis').val(), '') && ${dariDisc}.child('records').child(newData.child('nis').val()).child(newData.child('recId').val()).exists()) : !newData.child('recId').exists())`,
            keputusan: { ".validate": "newData.val() === 'diterima' || newData.val() === 'diabaikan'" },
            nis: { ".validate": `newData.isString() && newData.val().matches(${nisRe})` },
            recId: { ".validate": str(70) },
            alasan: { ".validate": str(200) },
            oleh: { ".validate": "newData.val() === auth.uid" },
            ts: { ".validate": "newData.isNumber()" },
            $other: { ".validate": false },
          },
        },
      },
      // Catatan internal dipisah dari records agar orang tua (yang boleh membaca records anaknya) tidak bisa membacanya.
      notes: {
        ".read": pembaca,
        $nis: {
          $recId: {
            ".write": stafKesiswaan,
            ".validate": str(500),
          },
        },
      },
      // Jejak audit: hanya bisa ditambah (create-only), tidak bisa diubah/dihapus siapa pun lewat web.
      audit: {
        ".read": pembaca,
        ".indexOn": ["ts"],
        $id: {
          ".write": `${stafKesiswaan} && !data.exists() && newData.exists()`,
          ".validate": "newData.hasChildren(['aksi', 'path', 'oleh', 'olehNama', 'ts'])",
          aksi: { ".validate": "newData.val() === 'buat' || newData.val() === 'ubah' || newData.val() === 'hapus' || newData.val() === 'ubah-master'" },
          path: { ".validate": str(200) },
          sebelum: { ".validate": true },
          sesudah: { ".validate": true },
          oleh: { ".validate": "newData.val() === auth.uid" },
          olehNama: { ".validate": str(60) },
          ts: { ".validate": "newData.isNumber()" },
          $other: { ".validate": false },
        },
      },
    },

    // ------------------------------------------------------------------ log aktivitas akun (create-only)
    activity: {
      ".read": anyOf(isAdmin, isWaka),
      $tgl: {
        ".validate": `$tgl.matches(${tglRe})`,
        $id: {
          ".write": `${anyOf(isAdmin, isKepala, isWaka, isPiket)} && !data.exists() && newData.exists()`,
          ".validate": `$id.matches(/^[A-Za-z0-9_-]{1,40}$/) && newData.hasChildren(['uid', 'peran', 'akunEmail', 'aksi', 'detail', 'deviceId', 'deviceLabel', 'ts', 'hariKe']) && newData.child('peran').val() === root.child('roles').child(auth.uid).val() && (newData.child('peran').val() === 'piket' ? (newData.child('aksi').val() === 'login' || newData.child('petugas').exists()) : !newData.child('petugas').exists())`,
          uid: { ".validate": "newData.val() === auth.uid" },
          peran: { ".validate": "newData.val() === 'admin' || newData.val() === 'kepala' || newData.val() === 'waka' || newData.val() === 'piket'" },
          akunEmail: { ".validate": str(120) },
          petugas: { ".validate": str(60) },
          aksi: { ".validate": AKSI_AKTIVITAS },
          nis: { ".validate": `newData.isString() && newData.val().matches(${nisRe})` },
          detail: { ".validate": str(300, 0) },
          deviceId: { ".validate": str(64) },
          deviceLabel: { ".validate": str(100) },
          deviceNama: { ".validate": str(60) },
          ts: { ".validate": "newData.val() === now" },
          // hariKe harus tepat hari server saat ini (lantai dari now + 7 jam WIB): integer di (hariIni-1, hariIni]
          hariKe: { ".validate": `newData.isNumber() && newData.val() % 1 === 0 && newData.val() <= ${hariIni} && newData.val() > ${hariIni} - 1` },
          $other: { ".validate": false },
        },
      },
    },
    // Penanda aksi terakhir per akun: wajib ditulis pada update yang sama dengan setiap tulisan piket.
    activityLast: {
      $uid: {
        ".read": `auth != null && (auth.uid === $uid || ${isAdmin} || ${isWaka})`,
        ".write": `${anyOf(isAdmin, isKepala, isWaka, isPiket)} && auth.uid === $uid && newData.exists()`,
        ".validate": "newData.hasChildren(['id', 'ts', 'tgl'])",
        id: { ".validate": "newData.isString() && newData.val().matches(/^[A-Za-z0-9_-]{1,40}$/)" },
        ts: { ".validate": "newData.val() === now" },
        tgl: { ".validate": `newData.isString() && newData.val().matches(${tglRe})` },
        $other: { ".validate": false },
      },
    },
    // Cermin akun piket untuk waka (waka tidak boleh membaca staff/roles). Admin membuat/menghapus; waka hanya mengubah `terkunci`.
    // Otoritas penguncian tetap roles/{uid}; `terkunci` hanya penanda tampilan.
    piketAkun: {
      ".read": anyOf(isAdmin, isWaka),
      $uid: {
        ".write": adminSaja,
        ".validate": "newData.hasChildren(['email', 'nama'])",
        email: { ".validate": str(120) },
        nama: { ".validate": str(60) },
        terkunci: { ".write": anyOf(isWaka), ".validate": "newData.isBoolean()" },
        $other: { ".validate": false },
      },
    },
    // Pendaftaran perangkat yang dipakai akun piket (create-only) untuk lencana "Perangkat baru" di halaman log.
    piketPerangkat: {
      ".read": anyOf(isAdmin, isWaka),
      $id: {
        ".write": `${anyOf(isPiket)} && !data.exists() && newData.exists()`,
        ".validate": "$id.matches(/^[A-Za-z0-9_-]{8,64}$/) && newData.hasChildren(['uid', 'pertama', 'label'])",
        uid: { ".validate": "newData.val() === auth.uid" },
        pertama: { ".validate": "newData.val() === now" },
        label: { ".validate": str(100) },
        nama: { ".validate": str(60) },
        $other: { ".validate": false },
      },
    },
    // Pengingat backup manual (Export JSON di Firebase Console). Hanya admin.
    sistem: {
      ".read": adminSaja,
      ".write": adminSaja,
      backupTerakhir: { ".validate": "newData.isNumber() && newData.val() <= now" },
      $other: { ".validate": false },
    },

    // ------------------------------------------------------------------ presensi per jam pelajaran
    // Kode: S sakit, I izin, D dispensasi, A alfa. Sel kosong = hadir. Ditulis ganda ke lessonsByStudent (untuk portal orang tua).
    lessons: {
      ".read": pembacaPiket,
      $tgl: {
        ".validate": `$tgl.matches(${tglRe})`,
        $kelas: {
          ".write": penulisJam,
          ".validate": "$kelas.length >= 1 && $kelas.length <= 60",
          meta: {
            $jam: {
              ".validate": `$jam.matches(${jamRe})`,
              mapel: { ".validate": str(60) },
              guru: { ".validate": str(60) },
              $other: { ".validate": false },
            },
          },
          absen: {
            $nis: {
              ".validate": `$nis.matches(${nisRe})`,
              $jam: {
                // Piket: hanya S/I/D, tidak boleh membuat/mengubah/menghapus sel yang sudah A, dan wajib ada izinMeta untuk (tanggal, siswa).
                ".write": `auth != null && ${isPiket} && (!data.exists() || data.val() !== 'A') && ${actOk(6, ["izin-jam"])} && (!newData.exists() || ((newData.val() === 'S' || newData.val() === 'I' || newData.val() === 'D') && ${metaBaruPiket(6, '$tgl', '$nis', "newData.val()")}))`,
                ".validate": `$jam.matches(${jamRe}) && (${KODE_JAM})`,
              },
            },
          },
          oleh: { ".validate": "newData.val() === auth.uid" },
          ts: { ".validate": "newData.isNumber()" },
          $other: { ".validate": false },
        },
      },
    },
    lessonsByStudent: {
      ".read": pembaca,
      $nis: {
        ".read": milikAnak,
        ".validate": `$nis.matches(${nisRe})`,
        $tgl: {
          ".validate": `$tgl.matches(${tglRe})`,
          $jam: {
            ".write": `auth != null && (${PENULIS_JAM.join(" || ")} || (${isPiket} && (!data.exists() || data.child('k').val() !== 'A') && ${actOk(4, ["izin-jam"])} && (!newData.exists() || ((newData.child('k').val() === 'S' || newData.child('k').val() === 'I' || newData.child('k').val() === 'D') && ${metaBaruPiket(4, '$tgl', '$nis', "newData.child('k').val()")}))))`,
            ".validate": `$jam.matches(${jamRe}) && newData.hasChildren(['k'])`,
            k: { ".validate": KODE_JAM },
            mapel: { ".validate": str(60) },
            $other: { ".validate": false },
          },
        },
      },
    },

    // ------------------------------------------------------------------ validasi Alfa harian
    validasi: {
      ".read": pembacaPiket,
      $tgl: {
        ".validate": `$tgl.matches(${tglRe})`,
        $nis: {
          ".write": stafKesiswaan,
          ".validate": `$nis.matches(${nisRe}) && newData.hasChildren(['status', 'oleh', 'ts'])`,
          status: { ".validate": "newData.val() === 'Alfa'" },
          catatan: { ".validate": str(200) },
          oleh: { ".validate": "newData.val() === auth.uid" },
          ts: { ".validate": "newData.isNumber()" },
          $other: { ".validate": false },
        },
      },
    },
    // Salinan milik anak agar portal orang tua dapat menampilkan "Alfa (terverifikasi)" tanpa membuka node validasi.
    validasiByStudent: {
      ".read": pembaca,
      $nis: {
        ".read": milikAnak,
        ".validate": `$nis.matches(${nisRe})`,
        $tgl: {
          ".write": stafKesiswaan,
          ".validate": `$tgl.matches(${tglRe}) && newData.hasChildren(['status'])`,
          status: { ".validate": "newData.val() === 'Alfa'" },
          $other: { ".validate": false },
        },
      },
    },

    izin: {
      ".read": pembacaPiket,
      $date: {
        ".validate": `$date.matches(${tglRe})`,
        $nis: {
          ".write": `auth != null && (${isAdmin} || ${isKepala} || ${isWaka} || (${isPiket} && !root.child('validasi').child($date).child($nis).exists() && (newData.exists() ? (${actOk(3, ["izin-harian"])} && ${metaBaruPiket(3, '$date', '$nis', "'H'")}) : ${actOk(3, ["hapus-izin"])})))`,
          ".validate": "newData.val() === 'Izin' || newData.val() === 'Sakit' || newData.val() === 'Dispensasi'",
        },
      },
    },

    // Bukti/keterangan setiap izin yang diinput piket/waka (tanpa upload file; arsip surat fisik disimpan manual).
    // Piket hanya MEMBUAT atau mengubah entri miliknya sendiri; waka/kepala dapat mengubah atau menghapus.
    izinMeta: {
      ".read": pembacaPiket,
      $tgl: {
        ".validate": `$tgl.matches(${tglRe})`,
        $nis: {
          ".validate": `$nis.matches(${nisRe})`,
          $metaId: {
            ".write": `auth != null && (${isWaka} || ${isKepala} || (${isPiket} && newData.exists() && (!data.exists() || data.child('oleh').val() === auth.uid) && ${actOk(4, ["izin-harian", "izin-jam"])}))`,
            ".validate": `$metaId.matches(/^[A-Za-z0-9_-]{1,40}$/) && newData.hasChildren(['lingkup', 'ket', 'keterangan', 'suratDiterima', 'petugas', 'oleh', 'ts', 'hariKe']) && (newData.child('lingkup').val() === 'jam' ? newData.child('jam').exists() : !newData.child('jam').exists()) && (!(${isPiket}) || ($metaId.beginsWith(${ACT(4)}.child('id').val() + '_') && newData.child('ts').val() === now && ${hariKeSah("newData.child('hariKe')", 7)} && (newData.child('hariKe').val() <= ${hariIni} || newData.child('ket').val() !== 'Sakit')))`,
            lingkup: { ".validate": "newData.val() === 'harian' || newData.val() === 'jam'" },
            jam: { $i: { ".validate": bulat(1, 9) } },
            ket: { ".validate": KET_IZIN },
            keterangan: { ".validate": str(200, 3) },
            suratDiterima: { ".validate": "newData.isBoolean()" },
            petugas: { ".validate": str(60) },
            oleh: { ".validate": "newData.val() === auth.uid" },
            ts: { ".validate": "newData.isNumber()" },
            hariKe: { ".validate": "newData.isNumber()" },
            $other: { ".validate": false },
          },
        },
      },
    },

    // Ringkasan pelanggaran yang dicatat lewat akun piket (agar piket melihat "catatan piket" tanpa membaca discipline/records).
    // Menyimpan salinan yang cukup untuk soft delete (refId, poin, kategori). Piket: buat + tandai dihapus, tidak menghapus fisik.
    piketHarian: {
      ".read": pembacaPiket,
      $tgl: {
        ".validate": `$tgl.matches(${tglRe})`,
        $recId: {
          ".write": `auth != null && (${isWaka} || (${isPiket} && newData.exists() && (${actOk(3, ["pelanggaran"])} || ${actOk(3, ["hapus-pelanggaran"])})))`,
          ".validate": `$recId.matches(/^[A-Za-z0-9_-]{1,60}$/) && newData.hasChildren(['nis', 'nama', 'kelas', 'pelanggaran', 'petugas', 'hariKe', 'refId', 'poin']) && (!(${isPiket}) || (${hariKeSah("newData.child('hariKe')", 0)} && (!data.exists() || (newData.child('nis').val() === data.child('nis').val() && newData.child('pelanggaran').val() === data.child('pelanggaran').val() && newData.child('petugas').val() === data.child('petugas').val() && newData.child('hariKe').val() === data.child('hariKe').val()))))`,
          nis: { ".validate": `newData.isString() && newData.val().matches(${nisRe})` },
          nama: { ".validate": str(60) },
          kelas: { ".validate": str(15) },
          pelanggaran: { ".validate": str(200) },
          takziran: { ".validate": str(300) },
          petugas: { ".validate": str(60) },
          hariKe: { ".validate": "newData.isNumber()" },
          refId: { ".validate": str(60) },
          poin: { ".validate": bulat(1, 1000) },
          kategori: { ".validate": str(30) },
          dihapus: { ".validate": "newData.val() === true" },
          $other: { ".validate": false },
        },
      },
    },

    // Daftar nama petugas piket (deklarasi mandiri; akun piket dipakai bersama). Dikelola waka & admin; tidak dihapus fisik.
    piketRoster: {
      ".read": pembacaPiket,
      $id: {
        ".write": `${anyOf(isAdmin, isWaka)} && newData.exists()`,
        ".validate": `$id.matches(/^[A-Za-z0-9_-]{1,40}$/) && newData.hasChildren(['nama', 'aktif'])`,
        nama: { ".validate": str(60) },
        aktif: { ".validate": "newData.isBoolean()" },
        $other: { ".validate": false },
      },
    },
  };
  return { rules };
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const out = join(dirname(fileURLToPath(import.meta.url)), "..", "database.rules.json");
  writeFileSync(out, JSON.stringify(buildRules(), null, 2) + "\n");
  console.log("database.rules.json dibuat ulang");
}
