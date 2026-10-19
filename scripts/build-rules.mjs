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
const isWali = peran("wali");

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
const orAdminDanStaf = [isAdmin, ...STAF_KESISWAAN, isPiket, isWali].join(" || ");
/** Pembaca tambahan untuk piket pada node yang memang diperlukan (granular; piket TIDAK masuk PEMBACA umum). */
const pembacaPiket = anyOf(isAdmin, isKepala, isWaka, isPiket);
/** pengaturan umum yang juga dibaca wali (jendela mundur, ambang hari efektif) */
const pembacaStafLuas = anyOf(isAdmin, isKepala, isWaka, isPiket, isWali);

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
const AKSI_AKTIVITAS = "newData.isString() && newData.val().matches(/^(login|logout|pilih-petugas|izin-harian|izin-jam|hapus-izin|pelanggaran|hapus-pelanggaran|remisi|ubah-pelanggaran|pulihkan-pelanggaran|presensi-jam|presensi-manual|hapus-manual|atur-wali|alfa-jam|perbaiki-indeks|atur-penanggung-jawab|catat-pembinaan|usul-remisi|batal-usul|putuskan-usul|atur-kalender|hapus-kalender|hitung-kalender|normal-kalender|ambang-kalender|migrasi-kalender|validasi-alfa|batal-alfa|saran-setuju|saran-abaikan|kunci-akun|buka-kunci)$/)";
const KET_IZIN = "(newData.val() === 'Izin' || newData.val() === 'Sakit' || newData.val() === 'Dispensasi')";
const nisRe = "/^[0-9]{1,20}$/";
const KODE_JAM = "newData.val() === 'S' || newData.val() === 'I' || newData.val() === 'D' || newData.val() === 'A'";
// ---- WALI KELAS: guru per akun (bukan akun bersama). Wewenang HANYA untuk siswa kelas binaannya, dicocokkan lewat indeks siswaKelas/{nis}.
//   staff/{uid}/kelasUtama (waka/admin) dan staff/{uid}/kelasTambahan/{kelasKey}: true (HANYA admin). Rules tidak bisa menghitung anak,
//   jadi "1 kelas utama" ditegakkan oleh bentuk datanya (satu nilai), dan "kelas tambahan hanya admin" oleh `.write` pada anak kelasTambahan.
const KELAS_KEY_RE = "/^[^.#$\\[\\]\\/]{1,45}$/";
const STF = "root.child('staff').child(auth.uid)";
const SK = (nis) => `root.child('siswaKelas').child(${nis})`;
/** wali yang membina kelas tempat siswa $nis berada (kelas utama ATAU tambahan). Siswa tanpa indeks = tidak dapat dibina siapa pun. */
const waliDari = (nis) => `(${isWali} && ${SK(nis)}.exists() && (${STF}.child('kelasUtama').val() === ${SK(nis)}.val() || ${STF}.child('kelasTambahan').child(${SK(nis)}.val()).val() === true))`;
/** staff/$uid pada update yang sama (newData) dilihat dari waliAkun/$uid/<field> (3 tingkat ke root). */
const STF_BARU = "newData.parent().parent().parent().child('staff').child($uid)";
const WALI_CERMIN_BUAT = `auth != null && ${isWaka} && !data.exists() && ${STF_BARU}.child('role').val() === 'wali'`;
/** waka membuat entri akun wali: create-only per field, hanya untuk role 'wali' */
const WALI_DIBUAT = `auth != null && ${isWaka} && !data.exists() && newData.parent().child('role').val() === 'wali'`;
const milikAnak = `auth != null && (root.child('parents').child($nis).child('uid').val() === auth.uid || ${waliDari("$nis")})`;
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
  sumber: { ".validate": "newData.val() === 'manual' || newData.val() === 'saran' || newData.val() === 'piket' || newData.val() === 'wali' || newData.val() === 'usul-wali'" },
});

const TIPE_SARAN = "(terlambat|tanpaTapPulang|bolosJam|alfa|lupaKtm|ktmHilang)";
/** Catatan bersumber "saran" HANYA sah bila ada keputusan "diterima" pada update yang sama (id deterministik {tanggal}_{tipe}). */
const saranSah = () =>
  `$recId.matches(/^20[0-9]{2}-[01][0-9]-[0-3][0-9]_${TIPE_SARAN}$/) && $recId.beginsWith(newData.child('tanggal').val() + '_') && ${dariDisc}.child('suggest').child(newData.child('tanggal').val()).child($recId.replace(newData.child('tanggal').val() + '_', '') + '_' + $nis).child('keputusan').val() === 'diterima'`;

/** Record remisi bersumber "usul-wali" HANYA sah bila usulan (id = recId) berstatus menunggu SEBELUM update ini dan disetujui oleh pengguna pada update yang sama. */
const USUL_BARU = (id) => `${dariDisc}.parent().child('usulRemisi').child(${id})`;
const usulSah = () =>
  `root.child('usulRemisi').child($recId).child('status').val() === 'menunggu' && ${USUL_BARU('$recId')}.child('status').val() === 'disetujui' && ${USUL_BARU('$recId')}.child('recId').val() === $recId && ${USUL_BARU('$recId')}.child('diputuskanOleh').val() === auth.uid && ${USUL_BARU('$recId')}.child('nis').val() === $nis && newData.child('jenis').val() === 'remisi' && newData.child('refId').val() === ${USUL_BARU('$recId')}.child('remId').val() && newData.child('poin').val() === ${USUL_BARU('$recId')}.child('poin').val() && newData.child('nama').val() === ${USUL_BARU('$recId')}.child('nama').val()`;

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
/** Izin harian oleh wali (HANYA Izin/Sakit; Dispensasi ditolak) untuk siswa binaan; log aktivitas + izinMeta baru (kunci "<idLog>_H") wajib. */
const waliIzin = (n, tgl, cekKet) => `(${isWali} && ${waliDari('$nis')} && !root.child('validasi').child(${tgl}).child($nis).exists() && (newData.exists() ? (${cekKet ? "newData.val() !== 'Dispensasi' && " : ""}${actOk(n, ["izin-harian"])} && ${metaBaruPiket(n, tgl, '$nis', "'H'")}) : ${actOk(n, ["hapus-izin"])}))`;
const metaBaruPiket = (n, tgl, nis, sufiks) => `${nav(n)}.child('izinMeta').child(${tgl}).child(${nis}).child(${ACT(n)}.child('id').val() + '_' + ${sufiks}).child('ts').val() === now`;

/** override kalender untuk $tgl dari node kalenderEfektif/$tgl (n tingkat ke root). */
const KAL_OVR = (n) => `${nav(n)}.child('kalender').child($tgl)`;

// ---- presensi manual: pasangan manualTap <-> manualTapByStudent (n = tingkat dari node yang ditulis sampai root)
const waktuRe = "/^([01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]$/";
const ALASAN_MANUAL = "newData.val() === 'Lupa KTM' || newData.val() === 'KTM hilang' || newData.val() === 'Kartu rusak' || newData.val() === 'Alat bermasalah' || newData.val() === 'Lainnya'";
/** Dari manualTap/$tgl/$nis: salinan manualTapByStudent/$nis/$tgl. */
const MS_COPY = (n) => `${nav(n)}.child('manualTapByStudent').child($nis).child($tgl)`;
/** Dari manualTapByStudent/$nis/$tgl: entri asli manualTap/$tgl/$nis. */
const MS_ASLI = (n) => `${nav(n)}.child('manualTap').child($tgl).child($nis)`;

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

/**
 * Hak tulis WALI pada discipline/records/$nis/$recId: sama seperti piket (pelanggaran dari master, aktif, Ringan ATAU bertakziran,
 * poin/nama/kategori/takziran identik master) tetapi sumber "wali", HANYA untuk siswa binaan, tanpa piketHarian: jendela waktu
 * ditegakkan lewat recordMeta.hariKe (hariKeSah, tanpa masa depan). Soft delete hanya catatan wali itu sendiri.
 */
const waliRecordOk = () => {
  const R = "root.child('discipline').child('rules').child(newData.child('refId').val())";
  const MB = metaBaru('$nis', '$recId');
  const buat = [
    "!data.exists()",
    `${waliDari('$nis')}`,
    "newData.child('jenis').val() === 'pelanggaran'",
    "newData.child('sumber').val() === 'wali'",
    `${R}.child('aktif').val() === true`,
    `(${R}.child('kategori').val() === 'Ringan' || ${R}.child('takziran').val().length > 0)`,
    `newData.child('poin').val() === ${R}.child('poin').val()`,
    `newData.child('nama').val() === ${R}.child('nama').val()`,
    `newData.child('kategori').val() === ${R}.child('kategori').val()`,
    `newData.child('takziran').val() === ${R}.child('takziran').val()`,
    hariKeSah(`${MB}.child('hariKe')`, 0),
    actOk(4, ["pelanggaran"]),
  ].join(" && ");
  const hapus = `${waliDari('$nis')} && data.child('sumber').val() === 'wali' && root.child('discipline').child('recordMeta').child($nis).child($recId).child('dibuatOleh').val() === auth.uid && ${MB}.child('dihapus').val() === true && ${actOk(4, ["hapus-pelanggaran"])}`;
  return `(newData.exists() ? (${buat}) : (${hapus}))`;
};

// ---- PEMBINAAN (wali kelas) + USUL REMISI ----------------------------------------------------------------------
/** Ambang yang penanggung jawabnya wali kelas (field eksplisit; tanpa nilai bawaan tersembunyi). */
const LEVEL_WALI = (lvl) => `root.child('discipline').child('levels').child(${lvl}).child('penanggungJawab').val() === 'wali'`;
const METODE_PB = ["Tatap muka", "Telepon/WhatsApp", "Kunjungan rumah", "Lainnya"].map((m) => `newData.val() === '${m}'`).join(" || ");
/** pembinaan/$nis/$id (3 tingkat ke root) -> salinan status pembinaanStatus/$nis/$ta/$levelId pada update yang sama. */
const PS_DARI_PB = `${nav(3)}.child('pembinaanStatus').child($nis).child(newData.child('ta').val()).child(newData.child('levelId').val())`;
const PB_DARI_PS = `${nav(4)}.child('pembinaan').child($nis).child($ta + '_' + $levelId)`;
const pembinaanBlok = () => ({
  ".read": anyOf(isAdmin, isKepala, isWaka),
  $nis: {
    ".read": `auth != null && (${isAdmin} || ${isKepala} || ${isWaka} || ${waliDari("$nis")})`,
    ".validate": `$nis.matches(${nisRe})`,
    $id: {
      // Tidak dapat dihapus fisik (newData.exists()). Wali: siswa binaan + ambang yang penanggung jawabnya wali + log aktivitas.
      // Setelah 'selesai' hanya waka/kepala yang boleh mengoreksi. Satu catatan per (TA, ambang): id = {ta}_{levelId}.
      ".write": `auth != null && newData.exists() && ((${isWaka} || ${isKepala}) || (${waliDari("$nis")} && ${LEVEL_WALI("newData.child('levelId').val()")} && ${actOk(3, ["catat-pembinaan"])})) && (!data.exists() || data.child('status').val() !== 'selesai' || ${isWaka} || ${isKepala})`,
      ".validate": `$id.matches(/^20[0-9]{2}-20[0-9]{2}_[A-Za-z0-9_-]{1,40}$/) && newData.hasChildren(['ta', 'levelId', 'levelPoin', 'tindakan', 'tanggal', 'metode', 'hasil', 'status', 'oleh', 'olehNama', 'dibuatTs']) && $id === newData.child('ta').val() + '_' + newData.child('levelId').val() && ${PS_DARI_PB}.child('id').val() === $id && ${PS_DARI_PB}.child('status').val() === newData.child('status').val() && ${PS_DARI_PB}.child('tanggal').val() === newData.child('tanggal').val() && ${PS_DARI_PB}.child('levelPoin').val() === newData.child('levelPoin').val() && (data.exists() ? (newData.child('oleh').val() === data.child('oleh').val() && newData.child('dibuatTs').val() === data.child('dibuatTs').val() && newData.child('levelPoin').val() === data.child('levelPoin').val() && newData.child('diubahOleh').val() === auth.uid && newData.child('diubahTs').val() === now) : (newData.child('oleh').val() === auth.uid && newData.child('dibuatTs').val() === now && root.child('discipline').child('levels').child(newData.child('levelId').val()).child('poin').val() === newData.child('levelPoin').val()))`,
      ta: { ".validate": `newData.isString() && newData.val().matches(${taRe})` },
      levelId: { ".validate": "newData.isString() && newData.val().matches(/^[A-Za-z0-9_-]{1,40}$/)" },
      levelPoin: { ".validate": bulat(1, 100000) },
      tindakan: { ".validate": str(200) },
      tanggal: { ".validate": `newData.isString() && newData.val().matches(${tglRe})` },
      metode: { ".validate": METODE_PB },
      hasil: { ".validate": str(1000, 10) },
      tindakLanjut: { ".validate": str(500) },
      status: { ".validate": "newData.val() === 'dijadwalkan' || newData.val() === 'selesai'" },
      oleh: { ".validate": "newData.isString()" },
      olehNama: { ".validate": str(60) },
      dibuatTs: { ".validate": "newData.isNumber()" },
      diubahOleh: { ".validate": "newData.isString()" },
      diubahTs: { ".validate": "newData.isNumber()" },
      $other: { ".validate": false },
    },
  },
});
/** Salinan status untuk portal orang tua: tanpa isi pembinaan dan tanpa nama. Harus konsisten dengan pembinaan pada update yang sama. */
const pembinaanStatusBlok = () => ({
  ".read": anyOf(isAdmin, isKepala, isWaka),
  $nis: {
    ".read": milikAnak,
    ".validate": `$nis.matches(${nisRe})`,
    $ta: {
      ".validate": `$ta.matches(${taRe})`,
      $levelId: {
        ".write": `auth != null && newData.exists() && ((${isWaka} || ${isKepala}) || (${waliDari("$nis")} && ${LEVEL_WALI("$levelId")}))`,
        ".validate": `$levelId.matches(/^[A-Za-z0-9_-]{1,40}$/) && newData.hasChildren(['id', 'status', 'tanggal', 'levelPoin']) && newData.child('id').val() === $ta + '_' + $levelId && ${PB_DARI_PS}.child('ta').val() === $ta && ${PB_DARI_PS}.child('levelId').val() === $levelId && ${PB_DARI_PS}.child('status').val() === newData.child('status').val() && ${PB_DARI_PS}.child('tanggal').val() === newData.child('tanggal').val() && ${PB_DARI_PS}.child('levelPoin').val() === newData.child('levelPoin').val()`,
        id: { ".validate": "newData.isString()" },
        status: { ".validate": "newData.val() === 'dijadwalkan' || newData.val() === 'selesai'" },
        tanggal: { ".validate": `newData.isString() && newData.val().matches(${tglRe})` },
        levelPoin: { ".validate": bulat(1, 100000) },
        $other: { ".validate": false },
      },
    },
  },
});
/** usulRemisi/$id (2 tingkat ke root) -> record remisi pada update yang sama bila disetujui. */
const REC_USUL = `${nav(2)}.child('discipline').child('records').child(newData.child('nis').val()).child($id)`;
const MASTER_REMISI = "root.child('discipline').child('remisi').child(newData.child('remId').val())";
const usulRemisiBlok = () => ({
  ".read": `auth != null && (${isAdmin} || ${isKepala} || ${isWaka} || (${isWali} && query.orderByChild === 'oleh' && query.equalTo === auth.uid))`,
  ".indexOn": ["oleh", "status"],
  $id: {
    ".read": `auth != null && ${isWali} && data.child('oleh').val() === auth.uid`,
    // wali: buat (menunggu, siswa binaan, snapshot master) atau batalkan usulan SENDIRI yang masih menunggu (hapus), keduanya dengan log aktivitas.
    // waka/kepala: memutuskan SEKALI (data.status === 'menunggu' -> disetujui|ditolak); keputusan kedua (mis. serentak) ditolak.
    ".write": `auth != null && ((${isWali} && !data.exists() && newData.exists() && ${waliDari("newData.child('nis').val()")} && ${actOk(2, ["usul-remisi"])}) || (${isWali} && data.exists() && !newData.exists() && data.child('oleh').val() === auth.uid && data.child('status').val() === 'menunggu' && ${waliDari("data.child('nis').val()")} && ${actOk(2, ["batal-usul"])}) || ((${isWaka} || ${isKepala}) && data.exists() && newData.exists() && data.child('status').val() === 'menunggu' && newData.child('status').val() !== 'menunggu'))`,
    ".validate": `$id.matches(/^[A-Za-z0-9_-]{1,60}$/) && newData.hasChildren(['nis', 'remId', 'nama', 'poin', 'alasan', 'oleh', 'ts', 'status']) && (data.exists() || (${MASTER_REMISI}.child('aktif').val() === true && ${MASTER_REMISI}.child('nama').val() === newData.child('nama').val() && ${MASTER_REMISI}.child('poin').val() === newData.child('poin').val())) && (newData.child('status').val() === 'menunggu' ? (!newData.child('diputuskanOleh').exists() && !newData.child('diputuskanTs').exists() && !newData.child('alasanKeputusan').exists() && !newData.child('recId').exists()) : (newData.child('diputuskanOleh').val() === auth.uid && newData.child('diputuskanTs').val() === now && (newData.child('status').val() === 'disetujui' ? (newData.child('recId').val() === $id && ${REC_USUL}.child('sumber').val() === 'usul-wali' && ${REC_USUL}.child('jenis').val() === 'remisi') : (newData.child('alasanKeputusan').exists() && !newData.child('recId').exists()))))`,
    nis: { ".validate": `newData.isString() && newData.val().matches(${nisRe}) && (!data.exists() || newData.val() === data.val())` },
    remId: { ".validate": `newData.isString() && newData.val().length <= 40 && (!data.exists() || newData.val() === data.val())` },
    nama: { ".validate": `newData.isString() && newData.val().length >= 1 && newData.val().length <= 200 && (!data.exists() || newData.val() === data.val())` },
    poin: { ".validate": `${bulat(1, 1000)} && (!data.exists() || newData.val() === data.val())` },
    alasan: { ".validate": `newData.isString() && newData.val().length >= 10 && newData.val().length <= 300 && (!data.exists() || newData.val() === data.val())` },
    oleh: { ".validate": "data.exists() ? newData.val() === data.val() : newData.val() === auth.uid" },
    ts: { ".validate": "data.exists() ? newData.val() === data.val() : newData.val() === now" },
    status: { ".validate": "(newData.val() === 'menunggu' && !data.exists()) || newData.val() === 'disetujui' || newData.val() === 'ditolak'" },
    diputuskanOleh: { ".validate": "newData.val() === auth.uid" },
    diputuskanTs: { ".validate": "newData.val() === now" },
    alasanKeputusan: { ".validate": str(300, 5) },
    recId: { ".validate": str(60) },
    $other: { ".validate": false },
  },
});

// ---- PRESENSI PER JAM v2.3.1: guru piket boleh memberi A (Alfa) HANYA untuk HARI INI ---------------------------------------------------
// Penanda pengisi per sel: lessons/{tgl}/{kelas}/absenOleh/{nis}/{jam} = "piket" | "waka" (ditulis dalam update yang sama dengan sel; sel lama tanpa
// penanda diperlakukan "waka"). absenInfo = {petugas, ts (=== now), hariKe}: hariKe adalah klaim klien atas hari milik sel (epoch-day WIB), yang rules
// wajibkan === hari server saat ini pada saat A diisi; ubah/hapus A oleh piket hanya bila hariKe TERSIMPAN itu masih hari ini (jadi A kemarin terkunci).
// Keterbatasan (sama dengan jendela piket lain): rules tidak dapat memverifikasi bahwa kunci tanggal sel cocok dengan hariKe yang diklaim.
const SEL_SID = "(newData.val() === 'S' || newData.val() === 'I' || newData.val() === 'D')";
const SEL_SID_K = "(newData.child('k').val() === 'S' || newData.child('k').val() === 'I' || newData.child('k').val() === 'D')";
/** x (node hariKe) adalah bilangan bulat tepat hari server saat ini: (hariIni-1, hariIni]. */
const HARI_INI = (x) => `${x}.isNumber() && ${x}.val() % 1 === 0 && ${x}.val() > ${hariIni} - 1 && ${x}.val() <= ${hariIni}`;
const KELAS_BARU = `${nav(6)}.child('lessons').child($tgl).child($kelas)`; // dari sel/penanda (6 tingkat ke root)
const KELAS_LAMA = "root.child('lessons').child($tgl).child($kelas)";
const MARK_BARU = `${KELAS_BARU}.child('absenOleh').child($nis).child($jam)`;
const MARK_LAMA = `${KELAS_LAMA}.child('absenOleh').child($nis).child($jam)`;
const CELL_BARU = `${KELAS_BARU}.child('absen').child($nis).child($jam)`;
const CELL_LAMA = `${KELAS_LAMA}.child('absen').child($nis).child($jam)`;
const INFO_BARU = `${KELAS_BARU}.child('absenInfo').child($nis).child($jam)`;
const INFO_LAMA = `${KELAS_LAMA}.child('absenInfo').child($nis).child($jam)`;
/** Keterangan harian Izin/Sakit/Dispensasi pada siswa/tanggal itu (dilihat dari sel 6 tingkat ke root): sel per jam tidak boleh ditulis. */
const KET_HARIAN_6 = `${nav(6)}.child('attendance').child($nis).child($tgl).child('ket')`;
const KET_HARIAN_4 = `${nav(4)}.child('attendance').child($nis).child($tgl).child('ket')`;
const piketSelJam = `${isPiket} && (
  ((!data.exists() || data.val() !== 'A') && (
    (!newData.exists() && ${actOk(6, ["izin-jam"])})
    || (${SEL_SID} && ${actOk(6, ["izin-jam"])} && ${metaBaruPiket(6, '$tgl', '$nis', "newData.val()")})
    || (newData.val() === 'A' && ${actOk(6, ["alfa-jam"])} && ${MARK_BARU}.val() === 'piket' && ${INFO_BARU}.exists() && ${HARI_INI(`${INFO_BARU}.child('hariKe')`)})
  ))
  || (data.val() === 'A' && ${MARK_LAMA}.val() === 'piket' && ${HARI_INI(`${INFO_LAMA}.child('hariKe')`)} && (
    (!newData.exists() && ${actOk(6, ["alfa-jam"])} && !${MARK_BARU}.exists())
    || (${SEL_SID} && ${actOk(6, ["izin-jam"])} && ${metaBaruPiket(6, '$tgl', '$nis', "newData.val()")})
  ))
)`.replace(/\n\s*/g, " ");
// salinan lessonsByStudent: kunci kelas diambil dari indeks siswaKelas (penanda ada di lessons/{tgl}/{kelas})
const KUNCI_KELAS_SISWA = "root.child('siswaKelas').child($nis).val()";
const MARK_S_BARU = `${nav(4)}.child('lessons').child($tgl).child(${KUNCI_KELAS_SISWA}).child('absenOleh').child($nis).child($jam)`;
const MARK_S_LAMA = `root.child('lessons').child($tgl).child(${KUNCI_KELAS_SISWA}).child('absenOleh').child($nis).child($jam)`;
const INFO_S_BARU = `${nav(4)}.child('lessons').child($tgl).child(${KUNCI_KELAS_SISWA}).child('absenInfo').child($nis).child($jam)`;
const INFO_S_LAMA = `root.child('lessons').child($tgl).child(${KUNCI_KELAS_SISWA}).child('absenInfo').child($nis).child($jam)`;
const piketSalinanJam = `${isPiket} && (
  ((!data.exists() || data.child('k').val() !== 'A') && (
    (!newData.exists() && ${actOk(4, ["izin-jam"])})
    || (${SEL_SID_K} && ${actOk(4, ["izin-jam"])} && ${metaBaruPiket(4, '$tgl', '$nis', "newData.child('k').val()")})
    || (newData.child('k').val() === 'A' && ${actOk(4, ["alfa-jam"])} && ${MARK_S_BARU}.val() === 'piket' && ${INFO_S_BARU}.exists() && ${HARI_INI(`${INFO_S_BARU}.child('hariKe')`)})
  ))
  || (data.child('k').val() === 'A' && ${MARK_S_LAMA}.val() === 'piket' && ${HARI_INI(`${INFO_S_LAMA}.child('hariKe')`)} && (
    (!newData.exists() && ${actOk(4, ["alfa-jam"])})
    || (${SEL_SID_K} && ${actOk(4, ["izin-jam"])} && ${metaBaruPiket(4, '$tgl', '$nis', "newData.child('k').val()")})
  ))
)`.replace(/\n\s*/g, " ");

// ---- aturan ----------------------------------------------------------------
export function buildRules() {
  const rules = {
    ".read": false,
    ".write": false,

    // admin boleh membuat/mencabut HANYA akun kepala & waka (anti eskalasi hak akses)
    roles: {
      $uid: {
        ".read": `auth != null && (auth.uid === $uid || ${isAdmin})`,
        // admin: kelola kepala/waka/piket/wali. waka: kunci/buka-kunci akun piket (hapus role / pasang 'piket' bila staff.role = piket) dan
        // buat/cabut akun WALI (set 'wali' hanya bila staff/{uid}.role = 'wali' pada update yang sama atau sudah ada; hapus role 'wali').
        // Tidak ada yang dapat memberi 'admin'/'device' atau mengubah role dirinya sendiri.
        ".write": `auth != null && $uid !== auth.uid && ((${isAdmin} && (data.val() === null || data.val() === 'kepala' || data.val() === 'waka' || data.val() === 'piket' || data.val() === 'wali') && (!newData.exists() || newData.val() === 'kepala' || newData.val() === 'waka' || newData.val() === 'piket' || newData.val() === 'wali')) || (${isWaka} && ((data.val() === 'piket' && !newData.exists()) || (!data.exists() && newData.val() === 'piket' && root.child('staff').child($uid).child('role').val() === 'piket') || (data.val() === 'wali' && !newData.exists()) || (!data.exists() && newData.val() === 'wali' && newData.parent().parent().child('staff').child($uid).child('role').val() === 'wali'))))`,
        ".validate": "newData.val() === 'kepala' || newData.val() === 'waka' || newData.val() === 'piket' || newData.val() === 'wali'",
      },
    },
    // Admin menulis semua. Waka HANYA: membuat entri akun wali (create-only per field) dan mengatur kelasUtama akun wali.
    // kelasTambahan: HANYA admin (struktur anak-per-kelas agar dapat ditegakkan tanpa menghitung).
    staff: {
      ".read": adminSaja,
      $uid: {
        ".read": `auth != null && (auth.uid === $uid || ${isAdmin})`,
        ".write": adminSaja,
        ".validate": "newData.hasChildren(['email', 'nama', 'role', 'dibuat'])",
        email: { ".write": WALI_DIBUAT, ".validate": "newData.isString() && newData.val().length > 0 && newData.val().length <= 120" },
        nama: { ".write": WALI_DIBUAT, ".validate": "newData.isString() && newData.val().length >= 1 && newData.val().length <= 60" },
        role: { ".write": `${WALI_DIBUAT} && newData.val() === 'wali'`, ".validate": "newData.val() === 'kepala' || newData.val() === 'waka' || newData.val() === 'piket' || newData.val() === 'wali'" },
        dibuat: { ".write": WALI_DIBUAT, ".validate": "newData.isNumber()" },
        kelasUtama: { ".write": `auth != null && (${isAdmin} || (${isWaka} && newData.parent().child('role').val() === 'wali' && newData.exists()))`, ".validate": `newData.isString() && newData.val().matches(${KELAS_KEY_RE})` },
        kelasTambahan: {
          $kelas: { ".write": adminSaja, ".validate": `newData.val() === true && $kelas.matches(${KELAS_KEY_RE})` },
        },
        $other: { ".validate": false },
      },
    },
    // Cermin akun wali untuk TAMPILAN waka/kepala (waka tidak boleh membaca node staff). Otoritas tetap roles + staff.
    // Admin menulis bebas. Waka: create-only email/nama, kelasUtama (harus sama dengan staff/{uid}/kelasUtama pada update yang sama),
    // aktif (cabut/pasang kembali), HANYA untuk akun yang staff.role = 'wali'. kelasTambahan: HANYA admin.
    waliAkun: {
      ".read": anyOf(isAdmin, isKepala, isWaka),
      $uid: {
        ".write": adminSaja,
        ".validate": "newData.hasChildren(['email', 'nama', 'kelasUtama', 'aktif'])",
        email: { ".write": WALI_CERMIN_BUAT, ".validate": "newData.isString() && newData.val().length > 0 && newData.val().length <= 120" },
        nama: { ".write": WALI_CERMIN_BUAT, ".validate": "newData.isString() && newData.val().length >= 1 && newData.val().length <= 60" },
        kelasUtama: { ".write": `auth != null && ${isWaka} && newData.exists() && ${STF_BARU}.child('role').val() === 'wali' && newData.val() === ${STF_BARU}.child('kelasUtama').val()`, ".validate": `newData.isString() && newData.val().matches(${KELAS_KEY_RE})` },
        aktif: { ".write": `auth != null && ${isWaka} && newData.exists() && ${STF_BARU}.child('role').val() === 'wali'`, ".validate": "newData.isBoolean()" },
        kelasTambahan: { $kelas: { ".write": adminSaja, ".validate": `newData.val() === true && $kelas.matches(${KELAS_KEY_RE})` } },
        $other: { ".validate": false },
      },
    },
    // Indeks siswa -> kelas (kunci kelas = encodeKelas). Ditulis admin dalam update yang sama saat tambah/ubah/hapus siswa.
    // Wali hanya boleh meng-QUERY (orderByValue + equalTo) kelas binaannya sendiri; staf pembaca membaca seluruh node.
    siswaKelas: {
      ".indexOn": [".value"],
      ".read": `auth != null && (${isAdmin} || ${isKepala} || ${isWaka} || (${isWali} && query.orderByValue === true && query.equalTo != null && (query.equalTo === ${STF}.child('kelasUtama').val() || ${STF}.child('kelasTambahan').child(query.equalTo).val() === true)))`,
      $nis: {
        ".write": adminSaja,
        ".validate": `$nis.matches(${nisRe}) && newData.isString() && newData.val().matches(${KELAS_KEY_RE})`,
      },
    },
    pembinaan: pembinaanBlok(),
    pembinaanStatus: pembinaanStatusBlok(),
    usulRemisi: usulRemisiBlok(),

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
        ".read": milikAnak,
        ".write": adminSaja,
        // tanggal mulai dihitung hari efektif untuk siswa ini (siswa baru / pindahan); terbaca orang tua milik anak
        aktifSejak: { ".validate": `newData.isString() && newData.val().matches(${tglRe})` },
      },
    },

    attendance: {
      ".read": pembaca,
      $nis: {
        ".read": milikAnak,
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
            ".write": `auth != null && (${isWaka} || ${isKepala} || (${isPiket} && !root.child('validasi').child($date).child($nis).exists() && (newData.exists() ? (${actOk(4, ["izin-harian"])} && ${metaBaruPiket(4, '$date', '$nis', "'H'")}) : ${actOk(4, ["hapus-izin"])})) || ${waliIzin(4, '$date', true)})`,
            ".validate": `${KET_IZIN} && (${orAdminDanStaf})`,
          },
          catatan: {
            ".write": `auth != null && (${isWaka} || ${isKepala} || (${isPiket} && !root.child('validasi').child($date).child($nis).exists() && (newData.exists() ? (${actOk(4, ["izin-harian"])} && ${metaBaruPiket(4, '$date', '$nis', "'H'")}) : ${actOk(4, ["hapus-izin"])})) || ${waliIzin(4, '$date', false)})`,
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
        ".read": pembacaStafLuas,
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
          penanggungJawab: { ".validate": "newData.val() === 'wali' || newData.val() === 'bk' || newData.val() === 'kepala' || newData.val() === 'waka'" },
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
        lupaKtm: { ".validate": str(40) },
        ktmHilang: { ".validate": str(40) },
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
            ".write": `auth != null && ((${STAF_KESISWAAN.join(" || ")}) && (newData.exists() || ${metaBaru('$nis', '$recId')}.child('dihapus').val() === true) || (${isPiket} && ${piketRecordOk()}) || (${isWali} && ${waliRecordOk()}))`,
            ".validate": `$recId.matches(/^[A-Za-z0-9_-]{1,60}$/) && newData.hasChildren(['jenis', 'nama', 'poin', 'tanggal', 'ta', 'sumber']) && ${metaBaru('$nis', '$recId')}.exists() && !${metaBaru('$nis', '$recId')}.child('dihapus').exists() && (newData.child('sumber').val() !== 'saran' || (${saranSah()})) && (newData.child('sumber').val() !== 'piket' || ${isPiket} || data.exists()) && (newData.child('sumber').val() !== 'wali' || ${isWali} || data.exists()) && (newData.child('sumber').val() !== 'usul-wali' || data.exists() || (${usulSah()})) && (!data.exists() || (${metaBaru('$nis', '$recId')}.child('diubahOleh').val() === auth.uid && ${metaBaru('$nis', '$recId')}.child('diubahTs').val() !== root.child('discipline').child('recordMeta').child($nis).child($recId).child('diubahTs').val()))`,
            ...isiRecord(),
            $other: { ".validate": false },
          },
        },
      },
      // KHUSUS STAF: siapa mencatat/mengubah/menghapus + riwayat terhapus. Orang tua DITOLAK membaca.
      recordMeta: {
        ".read": pembaca,
        $nis: {
          ".read": waliDari("$nis"), // catatan pencatat/riwayat terhapus siswa binaan terbaca wali kelasnya
          ".validate": `$nis.matches(${nisRe})`,
          $recId: {
            ".write": `auth != null && newData.exists() && ((${STAF_KESISWAAN.join(" || ")}) || (${isPiket} && (${recordBaru('$nis', '$recId')}.child('sumber').val() === 'piket' || root.child('discipline').child('records').child($nis).child($recId).child('sumber').val() === 'piket') && (${actOk(4, ["pelanggaran"])} || ${actOk(4, ["hapus-pelanggaran"])})) || (${waliDari('$nis')} && (${recordBaru('$nis', '$recId')}.child('sumber').val() === 'wali' || root.child('discipline').child('records').child($nis).child($recId).child('sumber').val() === 'wali') && (${actOk(4, ["pelanggaran"])} || ${actOk(4, ["hapus-pelanggaran"])})))`, // meta tidak pernah dihapus fisik: ia jejak pencatat & riwayat terhapus
            // Baru: dibuatOleh === pengguna. Lama: dibuatOleh & dibuatTs tidak boleh berubah (create kedua dengan id sama ditolak).
            // Dihapus: wajib alasan + snapshot dan record publik harus hilang. Tidak dihapus: record publik harus ada.
            ".validate": `$recId.matches(/^[A-Za-z0-9_-]{1,60}$/) && newData.hasChildren(['dibuatOleh', 'dibuatNama', 'dibuatTs']) && (data.exists() ? (newData.child('dibuatOleh').val() === data.child('dibuatOleh').val() && newData.child('dibuatTs').val() === data.child('dibuatTs').val()) : newData.child('dibuatOleh').val() === auth.uid) && (newData.child('dihapus').exists() ? (newData.child('alasanHapus').exists() && newData.child('snapshot').exists() && !${recordBaru('$nis', '$recId')}.exists()) : ${recordBaru('$nis', '$recId')}.exists())`,
            dibuatOleh: { ".validate": "newData.isString()" },
            dibuatNama: { ".validate": str(60) },
            dibuatTs: { ".validate": "newData.isNumber()" },
            diubahOleh: { ".validate": "newData.val() === auth.uid" },
            diubahTs: { ".validate": "newData.isNumber()" },
            hariKe: { ".validate": "newData.isNumber() && newData.val() % 1 === 0" }, // wali: jendela waktu (hariKeSah) pada pembuatan catatan
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
          ".read": waliDari("$nis"),
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
          ".write": `${anyOf(isAdmin, isKepala, isWaka, isPiket, isWali)} && !data.exists() && newData.exists()`,
          ".validate": `$id.matches(/^[A-Za-z0-9_-]{1,40}$/) && newData.hasChildren(['uid', 'peran', 'akunEmail', 'aksi', 'detail', 'deviceId', 'deviceLabel', 'ts', 'hariKe']) && newData.child('peran').val() === root.child('roles').child(auth.uid).val() && (newData.child('peran').val() === 'piket' ? (newData.child('aksi').val() === 'login' || newData.child('petugas').exists()) : !newData.child('petugas').exists())`,
          uid: { ".validate": "newData.val() === auth.uid" },
          peran: { ".validate": "newData.val() === 'admin' || newData.val() === 'kepala' || newData.val() === 'waka' || newData.val() === 'piket' || newData.val() === 'wali'" },
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
        ".write": `${anyOf(isAdmin, isKepala, isWaka, isPiket, isWali)} && auth.uid === $uid && newData.exists()`,
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
      backupTerakhir: { ".write": adminSaja, ".validate": "newData.isNumber() && newData.val() <= now" },
      // ambang hari efektif (bukti hadir minimal agar tanggal menjadi hari efektif); dibaca semua staf, diubah waka/admin
      ambangHariEfektif: { ".read": pembacaStafLuas, ".write": anyOf(isAdmin, isWaka), ".validate": bulat(1, 500) },
      $other: { ".validate": false },
    },

    // ------------------------------------------------------------------ KALENDER HARI EFEKTIF (berbasis bukti)
    // kalender/{tgl}: OVERRIDE manual (libur | efektif + alasan) oleh waka/admin. Menang atas semua aturan otomatis.
    kalender: {
      ".read": "auth != null",
      $tgl: {
        ".write": anyOf(isAdmin, isWaka),
        ".validate": `$tgl.matches(${tglRe}) && newData.hasChildren(['status', 'alasan', 'oleh', 'ts'])`,
        status: { ".validate": "newData.val() === 'libur' || newData.val() === 'efektif'" },
        alasan: { ".validate": str(200, 3) },
        oleh: { ".validate": "newData.val() === auth.uid" },
        ts: { ".validate": "newData.val() === now" },
        $other: { ".validate": false },
      },
    },
    // kalenderEfektif/{tgl}: RINGKASAN AGREGAT per tanggal (tanpa data siswa; ortu boleh membaca). Dihitung klien staf (tanpa Cloud Functions).
    // Konsistensi ditegakkan rules: bila ada override -> sumber 'override' dan efektif sama dengan override (override TIDAK dapat ditimpa
    // hitungan otomatis); bila tidak -> sumber 'otomatis' dan efektif=true hanya bila tap+manual >= ambang. Piket: log aktivitas wajib.
    kalenderEfektif: {
      ".read": "auth != null",
      $tgl: {
        ".write": `auth != null && (${isAdmin} || ${isWaka} || ${isKepala} || (${isPiket} && ${actOk(2, ["hitung-kalender"])}))`,
        ".validate": `$tgl.matches(${tglRe}) && newData.hasChildren(['efektif', 'tap', 'manual', 'sumber', 'dihitung']) && (${KAL_OVR(2)}.exists() ? (newData.child('sumber').val() === 'override' && newData.child('efektif').val() === (${KAL_OVR(2)}.child('status').val() === 'efektif')) : (newData.child('sumber').val() === 'otomatis' && (newData.child('efektif').val() === false || newData.child('tap').val() + newData.child('manual').val() >= (${nav(2)}.child('sistem').child('ambangHariEfektif').val() != null ? ${nav(2)}.child('sistem').child('ambangHariEfektif').val() : 1))))`,
        efektif: { ".validate": "newData.isBoolean()" },
        tap: { ".validate": bulat(0, 5000) },
        manual: { ".validate": bulat(0, 5000) },
        sumber: { ".validate": "newData.val() === 'otomatis' || newData.val() === 'override'" },
        rendah: { ".validate": "newData.isBoolean()" },
        // konfirmasi "hari ini normal": hanya waka/admin
        normal: { ".validate": `newData.val() === true && (${isWaka} || ${isAdmin})` },
        dihitung: { ".validate": "newData.val() === now" },
        $other: { ".validate": false },
      },
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
                // Piket: S/I/D (wajib izinMeta) kapan pun dalam jendela; A (Alfa) HANYA hari ini, bertanda "piket", log "alfa-jam", tanpa izinMeta;
                // ubah/hapus A hanya bila milik piket (penanda) DAN hari ini; A milik waka / tanpa penanda tidak dapat disentuh.
                ".write": `auth != null && ${piketSelJam}`,
                // Siswa berketerangan harian (Izin/Sakit/Dispensasi) tidak boleh punya sel per jam baru; penanda "piket" hanya untuk penulis piket.
                ".validate": `$jam.matches(${jamRe}) && (${KODE_JAM}) && !${KET_HARIAN_6}.exists() && (${isPiket} || ${MARK_BARU}.val() !== 'piket')`,
              },
            },
          },
          // Penanda pengisi sel: waka (cascade $kelas) menulis "waka"; piket hanya "piket" dan hanya bersama perubahan sel yang sama.
          absenOleh: {
            $nis: {
              ".validate": `$nis.matches(${nisRe})`,
              $jam: {
                ".write": `auth != null && ${isPiket} && (newData.exists() ? (newData.val() === 'piket' && ${CELL_BARU}.exists() && ${CELL_BARU}.val() !== ${CELL_LAMA}.val()) : !${CELL_BARU}.exists())`,
                ".validate": `$jam.matches(${jamRe}) && (newData.val() === 'piket' || newData.val() === 'waka') && ${CELL_BARU}.exists()`,
              },
            },
          },
          // Nama petugas + waktu pengisian A oleh piket (hanya tampilan; tooltip "Diisi piket: <nama>, <jam>").
          absenInfo: {
            $nis: {
              ".validate": `$nis.matches(${nisRe})`,
              $jam: {
                ".write": `auth != null && ${isPiket} && (newData.exists() ? (${CELL_BARU}.val() === 'A' && ${MARK_BARU}.val() === 'piket' && ${CELL_LAMA}.val() !== 'A') : ${CELL_BARU}.val() !== 'A')`,
                ".validate": `$jam.matches(${jamRe}) && newData.hasChildren(['petugas', 'ts', 'hariKe']) && ${CELL_BARU}.val() === 'A'`,
                petugas: { ".validate": str(60) },
                ts: { ".validate": "newData.val() === now" },
                hariKe: { ".validate": HARI_INI("newData") },
                $other: { ".validate": false },
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
            ".write": `auth != null && (${PENULIS_JAM.join(" || ")} || (${piketSalinanJam}))`,
            ".validate": `$jam.matches(${jamRe}) && newData.hasChildren(['k']) && !${KET_HARIAN_4}.exists()`,
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
          ".write": `auth != null && (${isAdmin} || ${isKepala} || ${isWaka} || (${isPiket} && !root.child('validasi').child($date).child($nis).exists() && (newData.exists() ? (${actOk(3, ["izin-harian"])} && ${metaBaruPiket(3, '$date', '$nis', "'H'")}) : ${actOk(3, ["hapus-izin"])})) || ${waliIzin(3, '$date', true)})`,
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
            ".write": `auth != null && (${isWaka} || ${isKepala} || (${isPiket} && newData.exists() && (!data.exists() || data.child('oleh').val() === auth.uid) && ${actOk(4, ["izin-harian", "izin-jam"])}) || (${waliDari('$nis')} && newData.exists() && (!data.exists() || data.child('oleh').val() === auth.uid) && ${actOk(4, ["izin-harian"])}))`,
            ".validate": `$metaId.matches(/^[A-Za-z0-9_-]{1,40}$/) && newData.hasChildren(['lingkup', 'ket', 'keterangan', 'suratDiterima', 'petugas', 'oleh', 'ts', 'hariKe']) && (newData.child('lingkup').val() === 'jam' ? newData.child('jam').exists() : !newData.child('jam').exists()) && (!(${isPiket} || ${isWali}) || ($metaId.beginsWith(${ACT(4)}.child('id').val() + '_') && newData.child('ts').val() === now && ${hariKeSah("newData.child('hariKe')", 7)} && (newData.child('hariKe').val() <= ${hariIni} || newData.child('ket').val() !== 'Sakit')) && (!(${isWali}) || (newData.child('lingkup').val() === 'harian' && newData.child('ket').val() !== 'Dispensasi')))`,
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
    // ------------------------------------------------------------------ PRESENSI MANUAL (siswa lupa/hilang KTM, kartu rusak, alat bermasalah)
    // Node TERPISAH dari attendance/log milik alat (jalur tulis firmware tidak berubah). Penulis: waka (bebas) dan piket
    // (jendela N hari, TANPA masa depan, log aktivitas wajib, tidak boleh menimpa entri milik waka, tidak boleh bila Alfa sudah divalidasi).
    // Hari Minggu ditolak berdasarkan `hariKe` (rules tidak dapat memastikan hariKe cocok dengan kunci tanggal: keterbatasan yang sama dengan izinMeta).
    // Setiap tulis WAJIB disertai salinan manualTapByStudent yang konsisten pada update yang sama (dibaca orang tua).
    // Tidak ada yang dapat menulis ke attendance/*/masuk|status|pulang: data ALAT menang saat penggabungan di klien (lib/manual.ts).
    manualTap: {
      ".read": pembacaPiket,
      $tgl: {
        ".validate": `$tgl.matches(${tglRe})`,
        $nis: {
          ".write": `auth != null && (${isWaka} || (${isPiket} && !root.child('validasi').child($tgl).child($nis).exists() && (!data.exists() || root.child('roles').child(data.child('oleh').val()).val() === 'piket') && (newData.exists() ? ${actOk(3, ["presensi-manual"])} : ${actOk(3, ["hapus-manual"])}))) && (newData.exists() ? (${MS_COPY(3)}.child('status').val() === newData.child('status').val() && ${MS_COPY(3)}.child('masuk').val() === newData.child('masuk').val() && ${MS_COPY(3)}.child('pulang').val() === newData.child('pulang').val() && ${MS_COPY(3)}.child('alasan').val() === newData.child('alasan').val()) : !${MS_COPY(3)}.exists())`,
          ".validate": `$nis.matches(${nisRe}) && newData.hasChildren(['status', 'alasan', 'oleh', 'ts', 'hariKe']) && (newData.child('masuk').exists() || newData.child('pulang').exists()) && (!(${isPiket}) || (newData.child('petugas').exists() && ${hariKeSah("newData.child('hariKe')", 0)})) && newData.child('hariKe').val() <= ${hariIni} && (newData.child('hariKe').val() + 4) % 7 !== 0`,
          masuk: { ".validate": `newData.isString() && newData.val().matches(${waktuRe})` },
          pulang: { ".validate": `newData.isString() && newData.val().matches(${waktuRe})` },
          status: { ".validate": "newData.val() === 'Hadir' || newData.val() === 'Terlambat'" },
          alasan: { ".validate": ALASAN_MANUAL },
          keterangan: { ".validate": str(200) },
          oleh: { ".validate": "newData.val() === auth.uid" },
          petugas: { ".validate": str(60) },
          ts: { ".validate": "newData.val() === now" },
          hariKe: { ".validate": "newData.isNumber() && newData.val() % 1 === 0" },
          $other: { ".validate": false },
        },
      },
    },
    // Salinan per anak untuk portal orang tua (tanpa uid/nama petugas). Hanya sah berpasangan dengan manualTap yang konsisten.
    manualTapByStudent: {
      ".read": pembaca,
      $nis: {
        ".read": milikAnak,
        ".validate": `$nis.matches(${nisRe})`,
        $tgl: {
          ".write": `auth != null && (${isWaka} || ${isPiket}) && (newData.exists() ? (${MS_ASLI(3)}.child('status').val() === newData.child('status').val() && ${MS_ASLI(3)}.child('masuk').val() === newData.child('masuk').val() && ${MS_ASLI(3)}.child('pulang').val() === newData.child('pulang').val() && ${MS_ASLI(3)}.child('alasan').val() === newData.child('alasan').val()) : !${MS_ASLI(3)}.exists())`,
          ".validate": `$tgl.matches(${tglRe}) && newData.hasChildren(['status', 'alasan']) && (newData.child('masuk').exists() || newData.child('pulang').exists())`,
          masuk: { ".validate": `newData.isString() && newData.val().matches(${waktuRe})` },
          pulang: { ".validate": `newData.isString() && newData.val().matches(${waktuRe})` },
          status: { ".validate": "newData.val() === 'Hadir' || newData.val() === 'Terlambat'" },
          alasan: { ".validate": ALASAN_MANUAL },
          $other: { ".validate": false },
        },
      },
    },
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
