// Uji mutasi Security Rules: rusak rules satu per satu, suite uji HARUS gagal untuk masing-masing.
// Jalankan: npm run test:mutation  (mengelola emulatornya sendiri: restart berkala + batas waktu per mutan; rules asli di repo tidak diubah).
import { spawn, spawnSync, execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildRules } from "../scripts/build-rules.mjs";
import { hashRules } from "./emu.mjs";

const ADMIN = "root.child('roles').child(auth.uid).val() === 'admin'";
const PIKET = "root.child('roles').child(auth.uid).val() === 'piket'";
const WAKA = "root.child('roles').child(auth.uid).val() === 'waka'";
const DEVICE = "root.child('roles').child(auth.uid).val() === 'device'";
const KEPALA = "root.child('roles').child(auth.uid).val() === 'kepala'";
// Salinan helper generator (harus identik dengan scripts/build-rules.mjs) untuk menyusun teks yang akan dibuang oleh mutasi
const nav = (n) => "newData" + ".parent()".repeat(n);
const ACT = (n) => `${nav(n)}.child('activityLast').child(auth.uid)`;
const ENT = (n) => `${nav(n)}.child('activity').child(${ACT(n)}.child('tgl').val()).child(${ACT(n)}.child('id').val())`;
const actOk = (n, aksi) => `${ACT(n)}.child('ts').val() === now && ${ENT(n)}.child('ts').val() === now && ${ENT(n)}.child('uid').val() === auth.uid && (${aksi.map((a) => `${ENT(n)}.child('aksi').val() === '${a}'`).join(" || ")})`;
const metaBaruPiket = (n, tgl, nis, sufiks) => `${nav(n)}.child('izinMeta').child(${tgl}).child(${nis}).child(${ACT(n)}.child('id').val() + '_' + ${sufiks}).child('ts').val() === now`;
const MILIK_ANAK = "auth != null && root.child('parents').child($nis).child('uid').val() === auth.uid";


// ---- pembantu mutasi WALI (salinan helper rules; harus identik dengan scripts/build-rules.mjs)
const WALI = "root.child('roles').child(auth.uid).val() === 'wali'";
const STFT = "root.child('staff').child(auth.uid)";
const SKT = (nis) => `root.child('siswaKelas').child(${nis})`;
const waliDariT = (nis) => `(${WALI} && ${SKT(nis)}.exists() && (${STFT}.child('kelasUtama').val() === ${SKT(nis)}.val() || ${STFT}.child('kelasTambahan').child(${SKT(nis)}.val()).val() === true))`;
const waliIzinT = (n, tgl, cekKet) => `(${WALI} && ${waliDariT("$nis")} && !root.child('validasi').child(${tgl}).child($nis).exists() && (newData.exists() ? (${cekKet ? "newData.val() !== 'Dispensasi' && " : ""}${actOk(n, ["izin-harian"])} && ${metaBaruPiket(n, tgl, "$nis", "'H'")}) : ${actOk(n, ["hapus-izin"])}))`;
// ---- pembantu mutasi PEMBINAAN / USUL REMISI (salinan helper rules; harus identik dengan scripts/build-rules.mjs)
const LEVEL_WALI_T = (lvl) => `root.child('discipline').child('levels').child(${lvl}).child('penanggungJawab').val() === 'wali'`;
const PS_DARI_PB = `${nav(3)}.child('pembinaanStatus').child($nis).child(newData.child('ta').val()).child(newData.child('levelId').val())`;
const PB_DARI_PS = `${nav(4)}.child('pembinaan').child($nis).child($ta + '_' + $levelId)`;
const REC_USUL_T = `${nav(2)}.child('discipline').child('records').child(newData.child('nis').val()).child($id)`;
const MASTER_REMISI_T = "root.child('discipline').child('remisi').child(newData.child('remId').val())";
const USUL_BARU_FN = (id) => `${nav(3)}.parent().child('usulRemisi').child(${id})`;
const USUL_BARU_T = USUL_BARU_FN('$recId');
const USUL_SAH_T = `root.child('usulRemisi').child($recId).child('status').val() === 'menunggu' && ${USUL_BARU_T}.child('status').val() === 'disetujui' && ${USUL_BARU_T}.child('recId').val() === $recId && ${USUL_BARU_T}.child('diputuskanOleh').val() === auth.uid && ${USUL_BARU_T}.child('nis').val() === $nis && newData.child('jenis').val() === 'remisi' && newData.child('refId').val() === ${USUL_BARU_T}.child('remId').val() && newData.child('poin').val() === ${USUL_BARU_T}.child('poin').val() && newData.child('nama').val() === ${USUL_BARU_T}.child('nama').val()`;
// ---- pembantu mutasi PER JAM v2.3.1 (salinan helper rules; harus identik dengan scripts/build-rules.mjs)
const HARI_INI_X = "((now + 25200000) / 86400000)";
const HARI_INI_T = (x) => `${x}.isNumber() && ${x}.val() % 1 === 0 && ${x}.val() > ${HARI_INI_X} - 1 && ${x}.val() <= ${HARI_INI_X}`;
const SEL_SID_T = "(newData.val() === 'S' || newData.val() === 'I' || newData.val() === 'D')";
const SEL_SID_K_T = "(newData.child('k').val() === 'S' || newData.child('k').val() === 'I' || newData.child('k').val() === 'D')";
const KELAS_BARU_T = `${nav(6)}.child('lessons').child($tgl).child($kelas)`;
const KELAS_LAMA_T = "root.child('lessons').child($tgl).child($kelas)";
const MARK_BARU_T = `${KELAS_BARU_T}.child('absenOleh').child($nis).child($jam)`;
const MARK_LAMA_T = `${KELAS_LAMA_T}.child('absenOleh').child($nis).child($jam)`;
const CELL_BARU_T = `${KELAS_BARU_T}.child('absen').child($nis).child($jam)`;
const CELL_LAMA_T = `${KELAS_LAMA_T}.child('absen').child($nis).child($jam)`;
const INFO_BARU_T = `${KELAS_BARU_T}.child('absenInfo').child($nis).child($jam)`;
const INFO_LAMA_T = `${KELAS_LAMA_T}.child('absenInfo').child($nis).child($jam)`;
const KET6_T = `${nav(6)}.child('attendance').child($nis).child($tgl).child('ket')`;
const KET4_T = `${nav(4)}.child('attendance').child($nis).child($tgl).child('ket')`;
const KUNCI_S_T = "root.child('siswaKelas').child($nis).val()";
const MARK_S_BARU_T = `${nav(4)}.child('lessons').child($tgl).child(${KUNCI_S_T}).child('absenOleh').child($nis).child($jam)`;
const MARK_S_LAMA_T = `root.child('lessons').child($tgl).child(${KUNCI_S_T}).child('absenOleh').child($nis).child($jam)`;
const INFO_S_BARU_T = `${nav(4)}.child('lessons').child($tgl).child(${KUNCI_S_T}).child('absenInfo').child($nis).child($jam)`;
const INFO_S_LAMA_T = `root.child('lessons').child($tgl).child(${KUNCI_S_T}).child('absenInfo').child($nis).child($jam)`;
/** hapus SEMUA kemunculan teks dari satu aturan */
const buangSemua = (teks, dari) => { if (!teks.includes(dari)) throw new Error(`mutasi tidak menemukan teks target: ${dari.slice(0, 60)}`); return teks.split(dari).join(""); };
const RULE = "root.child('discipline').child('rules').child(newData.child('refId').val())";
/** ganti SEMUA kemunculan teks pada seluruh rules (JSON) */
function ubahJson(r, dari, ke) {
  const s = JSON.stringify(r);
  if (!s.includes(dari)) throw new Error(`teks target tidak ditemukan: ${dari.slice(0, 60)}`);
  const baru = JSON.parse(s.split(dari).join(ke));
  Object.keys(r).forEach((k) => delete r[k]); Object.assign(r, baru);
}
/** ubah `dari` -> `ke` HANYA pada kemunculan pertama SETELAH `jangkar` di dalam teks aturan node[kunci] */
function ubahTeksSetelah(teks, jangkar, dari, ke) {
  const i = teks.indexOf(jangkar);
  if (i < 0) throw new Error(`jangkar tidak ditemukan: ${jangkar.slice(0, 60)}`);
  const j = teks.indexOf(dari, i);
  if (j < 0) throw new Error(`teks target tidak ditemukan setelah jangkar: ${dari.slice(0, 60)}`);
  return teks.slice(0, j) + ke + teks.slice(j + dari.length);
}
function ubahSetelah(node, kunci, jangkar, dari, ke) { node[kunci] = ubahTeksSetelah(node[kunci], jangkar, dari, ke); }

/** Setiap mutasi mengubah objek rules hasil build (salinan segar) dan WAJIB benar-benar mengubah sesuatu. */
const mutasi = [
  { nama: "ortu boleh baca discipline/notes", ubah: (r) => { r.discipline.notes.$nis[".read"] = MILIK_ANAK; } },
  // Ekuivalen: records mewajibkan recordMeta pada update yang sama, dan recordMeta hanya bisa ditulis waka/kepala,
  // jadi merusak SATU lapisan saja tidak membuka celah (pertahanan berlapis). Uji "admin TIDAK bisa tulis records" membuktikannya.
  { nama: "admin boleh tulis discipline/records (hanya lapisan records)", ekuivalen: true, ubah: (r) => { const n = r.discipline.records.$nis.$recId; n[".write"] = `(${n[".write"]}) || (auth != null && ${ADMIN})`; } },
  { nama: "admin boleh tulis discipline/records DAN recordMeta (kedua lapisan)", ubah: (r) => {
    const a = r.discipline.records.$nis.$recId; a[".write"] = `(${a[".write"]}) || (auth != null && ${ADMIN})`;
    const b = r.discipline.recordMeta.$nis.$recId; b[".write"] = `(${b[".write"]}) || (auth != null && ${ADMIN})`;
  } },
  { nama: "sel per jam kode 'B' diterima (lessons)", ubah: (r) => { const n = r.lessons.$tgl.$kelas.absen.$nis.$jam; n[".validate"] = ganti(n[".validate"], "newData.val() === 'A'", "newData.val() === 'A' || newData.val() === 'B'"); } },
  { nama: "kode 'B' diterima di salinan lessonsByStudent", ubah: (r) => { const n = r.lessonsByStudent.$nis.$tgl.$jam.k; n[".validate"] = ganti(n[".validate"], "newData.val() === 'A'", "newData.val() === 'A' || newData.val() === 'B'"); } },
  { nama: "kepala boleh tulis lessons", ubah: (r) => { const n = r.lessons.$tgl.$kelas; n[".write"] = "auth != null && (root.child('roles').child(auth.uid).val() === 'waka' || root.child('roles').child(auth.uid).val() === 'kepala')"; } },
  { nama: "ortu boleh baca discipline/recordMeta (nama staf)", ubah: (r) => { r.discipline.recordMeta.$nis[".read"] = MILIK_ANAK; } },
  { nama: "admin boleh membuat role 'admin' (eskalasi)", ubah: (r) => {
    const n = r.roles.$uid;
    n[".write"] = ganti(n[".write"], "(!newData.exists() || newData.val() === 'kepala' || newData.val() === 'waka' || newData.val() === 'piket' || newData.val() === 'wali')", "(!newData.exists() || newData.val() === 'kepala' || newData.val() === 'waka' || newData.val() === 'piket' || newData.val() === 'wali' || newData.val() === 'admin')");
    n[".validate"] = "newData.val() === 'kepala' || newData.val() === 'waka' || newData.val() === 'piket' || newData.val() === 'wali' || newData.val() === 'admin'";
  } },
  { nama: "recordMeta: dibuatOleh/dibuatTs boleh diubah", ubah: (r) => {
    const n = r.discipline.recordMeta.$nis.$recId;
    n[".validate"] = ganti(n[".validate"], "(newData.child('dibuatOleh').val() === data.child('dibuatOleh').val() && newData.child('dibuatTs').val() === data.child('dibuatTs').val())", "true");
  } },
  { nama: "audit boleh ditimpa (bukan create-only)", ubah: (r) => { const n = r.discipline.audit.$id; n[".write"] = ganti(n[".write"], " && !data.exists()", ""); } },
  { nama: "record publik boleh dibuat TANPA recordMeta", ubah: (r) => {
    const n = r.discipline.records.$nis.$recId;
    n[".validate"] = ganti(n[".validate"], " && newData.parent().parent().parent().child('recordMeta').child($nis).child($recId).exists() && !newData.parent().parent().parent().child('recordMeta').child($nis).child($recId).child('dihapus').exists()", "");
  } },
  { nama: "recordMeta boleh dihapus fisik", ubah: (r) => { const n = r.discipline.recordMeta.$nis.$recId; n[".write"] = ganti(n[".write"], " && newData.exists()", ""); } },
  // ---- Tahap 3: saran otomatis
  { nama: "suggest: keputusan boleh ditimpa (bukan create-only)", ubah: (r) => { const n = r.discipline.suggest.$tgl.$key; n[".write"] = ganti(n[".write"], " && !data.exists()", ""); } },
  // Ekuivalen: penghapusan tetap ditahan oleh `!data.exists()` (lapisan kedua).
  { nama: "suggest: hanya `newData.exists()` dilepas (penghapusan)", ekuivalen: true, ubah: (r) => { const n = r.discipline.suggest.$tgl.$key; n[".write"] = ganti(n[".write"], " && newData.exists()", ""); } },
  { nama: "suggest: keputusan boleh dihapus (kedua lapisan dilepas)", ubah: (r) => { const n = r.discipline.suggest.$tgl.$key; n[".write"] = ganti(ganti(n[".write"], " && newData.exists()", ""), " && !data.exists()", ""); } },
  { nama: "suggest 'diterima' tanpa record diterima", ubah: (r) => {
    const n = r.discipline.suggest.$tgl.$key;
    n[".validate"] = ganti(n[".validate"], " && newData.parent().parent().parent().child('records').child(newData.child('nis').val()).child(newData.child('recId').val()).exists()", "");
  } },
  { nama: "suggest: recId keputusan tak wajib cocok {tanggal}_{tipe}", ubah: (r) => {
    const n = r.discipline.suggest.$tgl.$key;
    n[".validate"] = ganti(n[".validate"], "newData.child('recId').val() === $tgl + '_' + $key.replace('_' + newData.child('nis').val(), '') && ", "");
  } },
  { nama: "suggest 'diabaikan' boleh membawa recId", ubah: (r) => { const n = r.discipline.suggest.$tgl.$key; n[".validate"] = ganti(n[".validate"], " : !newData.child('recId').exists())", " : true)"); } },
  { nama: "record sumber 'saran' tanpa keputusan diterima", ubah: (r) => {
    const n = r.discipline.records.$nis.$recId;
    const baru = n[".validate"].replace(/ && \(newData\.child\('sumber'\)\.val\(\) !== 'saran' \|\| \(.*?\)\) && \(!data\.exists\(\)/, " && (!data.exists()");
    if (baru === n[".validate"]) throw new Error("mutasi saran: pola tidak ditemukan");
    n[".validate"] = baru;
  } },
  { nama: "admin boleh menulis keputusan saran", ubah: (r) => { const n = r.discipline.suggest.$tgl.$key; n[".write"] = `(${n[".write"]}) || (auth != null && ${ADMIN} && !data.exists())`; } },
  { nama: "ortu boleh membaca suggest", ubah: (r) => { r.discipline.suggest[".read"] = "auth != null"; } },
  // ---- Piket + Dispensasi + jalur alat (firmware v12)
  { nama: "piket boleh mengubah/menimpa sel yang sudah 'A' (jalur S/I/D menyentuh A milik waka)", ubah: (r) => {
    const n = r.lessons.$tgl.$kelas.absen.$nis.$jam;
    n[".write"] = ganti(n[".write"], "((!data.exists() || data.val() !== 'A') && (", "(true && (");
  } },
  { nama: "piket boleh mengubah salinan lessonsByStudent yang sudah 'A' (jalur S/I/D menyentuh A milik waka)", ubah: (r) => {
    const n = r.lessonsByStudent.$nis.$tgl.$jam;
    n[".write"] = ganti(n[".write"], "((!data.exists() || data.child('k').val() !== 'A') && (", "(true && (");
  } },
  { nama: "piket boleh membaca discipline/records", ubah: (r) => { const n = r.discipline.records; n[".read"] = `(${n[".read"]}) || (auth != null && ${PIKET})`; } },
  { nama: "piket boleh membaca discipline/levels", ubah: (r) => { const n = r.discipline.levels; n[".read"] = ganti(n[".read"], " && !(root.child('roles').child(auth.uid).val() === 'piket')", ""); } },
  { nama: "piket boleh membaca seluruh attendance", ubah: (r) => { r.attendance[".read"] = `(${r.attendance[".read"]}) || (auth != null && ${PIKET})`; } },
  { nama: "piket boleh mencatat pelanggaran Sedang/Berat tanpa takziran", ubah: (r) => {
    const n = r.discipline.records.$nis.$recId;
    const R = "root.child('discipline').child('rules').child(newData.child('refId').val())";
    n[".write"] = ganti(n[".write"], `(${R}.child('kategori').val() === 'Ringan' || ${R}.child('takziran').val().length > 0)`, "true");
  } },
  { nama: "piket boleh mengubah poin dari master", ubah: (r) => {
    const n = r.discipline.records.$nis.$recId;
    n[".write"] = ganti(n[".write"], " && newData.child('poin').val() === root.child('discipline').child('rules').child(newData.child('refId').val()).child('poin').val()", "");
  } },
  { nama: "piket boleh mencatat pelanggaran dari master NONAKTIF", ubah: (r) => {
    const n = r.discipline.records.$nis.$recId;
    n[".write"] = ganti(n[".write"], " && root.child('discipline').child('rules').child(newData.child('refId').val()).child('aktif').val() === true", "");
  } },
  // Ekuivalen: catatan non-'piket' tetap ditolak oleh aturan recordMeta (piket hanya boleh menulis meta catatan bersumber 'piket').
  { nama: "piket boleh mencatat sumber selain 'piket' (hanya lapisan records)", ekuivalen: true, ubah: (r) => {
    const n = r.discipline.records.$nis.$recId;
    n[".write"] = ganti(n[".write"], " && newData.child('sumber').val() === 'piket'", "");
  } },
  { nama: "piket boleh mencatat sumber selain 'piket' (records DAN recordMeta)", ubah: (r) => {
    const n = r.discipline.records.$nis.$recId;
    n[".write"] = ganti(n[".write"], " && newData.child('sumber').val() === 'piket'", "");
    const m = r.discipline.recordMeta.$nis.$recId;
    const baru = m[".write"].replace(/\(root\.child\('roles'\)\.child\(auth\.uid\)\.val\(\) === 'piket' && \(newData[^]*?\)\)\)$/, "(root.child('roles').child(auth.uid).val() === 'piket'))");
    if (baru === m[".write"]) throw new Error("pola recordMeta piket tidak ditemukan");
    m[".write"] = baru;
  } },
  { nama: "piket boleh MENGEDIT catatan yang sudah ada", ubah: (r) => {
    const n = r.discipline.records.$nis.$recId;
    n[".write"] = ganti(n[".write"], "(!data.exists() && newData.child('jenis')", "(newData.child('jenis')");
  } },
  { nama: "waka boleh memalsukan catatan bersumber 'piket'", ubah: (r) => {
    const n = r.discipline.records.$nis.$recId;
    n[".validate"] = ganti(n[".validate"], " && (newData.child('sumber').val() !== 'piket' || root.child('roles').child(auth.uid).val() === 'piket' || data.exists())", "");
  } },
  { nama: "piket boleh menulis recordMeta catatan milik waka", ubah: (r) => {
    const n = r.discipline.recordMeta.$nis.$recId;
    const baru = n[".write"].replace(/\(root\.child\('roles'\)\.child\(auth\.uid\)\.val\(\) === 'piket' && \(newData[^]*?\)\)\)$/, "(root.child('roles').child(auth.uid).val() === 'piket'))");
    if (baru === n[".write"]) throw new Error("pola recordMeta piket tidak ditemukan");
    n[".write"] = baru;
  } },
  { nama: "piket boleh menulis izin walau Alfa sudah dikonfirmasi (validasi)", ubah: (r) => {
    for (const n of [r.izin.$date.$nis, r.attendance.$nis.$date.ket, r.attendance.$nis.$date.catatan]) n[".write"] = ganti(n[".write"], " && !root.child('validasi').child($date).child($nis).exists()", "");
  } },
  { nama: "izinMeta: jendela hariKe piket tidak ditegakkan", ubah: (r) => {
    const n = r.izinMeta.$tgl.$nis.$metaId;
    const baru = n[".validate"].replace(/ && \(!\(root\.child\('roles'\)\.child\(auth\.uid\)\.val\(\) === 'piket' \|\| root\.child\('roles'\)\.child\(auth\.uid\)\.val\(\) === 'wali'\) \|\| \([^]*\)\)$/, "");
    if (baru === n[".validate"]) throw new Error("pola jendela izinMeta tidak ditemukan");
    n[".validate"] = baru;
  } },
  { nama: "izinMeta: piket boleh 'Sakit' untuk hari depan", ubah: (r) => {
    const n = r.izinMeta.$tgl.$nis.$metaId;
    n[".validate"] = ganti(n[".validate"], " && (newData.child('hariKe').val() <= ((now + 25200000) / 86400000) || newData.child('ket').val() !== 'Sakit')", "");
  } },
  // Ekuivalen: kunci izinMeta piket WAJIB berawalan id log yang dibuat pada update ini (create-only, ts === now), sehingga kunci
  // yang sudah ada tidak pernah dapat dituju; aturan "milik sendiri" hanya lapisan kedua. Uji "tidak bisa menimpa milik waka" terisolasi oleh awalan kunci.
  { nama: "izinMeta: piket boleh menimpa entri milik orang lain (hanya lapisan kepemilikan)", ekuivalen: true, ubah: (r) => {
    const n = r.izinMeta.$tgl.$nis.$metaId;
    n[".write"] = ganti(n[".write"], " && (!data.exists() || data.child('oleh').val() === auth.uid)", "");
  } },
  { nama: "piketHarian: jendela hariKe piket tidak ditegakkan", ubah: (r) => {
    const n = r.piketHarian.$tgl.$recId;
    const baru = n[".validate"].replace(/ && \(!\(root\.child\('roles'\)\.child\(auth\.uid\)\.val\(\) === 'piket'\) \|\| \([^]*\)\)$/, "");
    if (baru === n[".validate"]) throw new Error("pola jendela piketHarian tidak ditemukan");
    n[".validate"] = baru;
  } },
  { nama: "discipline/settings: piket boleh mengubah jendela mundur", ubah: (r) => { const n = r.discipline.settings.piketMundurHari; n[".write"] = `(${n[".write"]}) || (auth != null && ${PIKET})`; } },
  { nama: "piketRoster: piket boleh menulis", ubah: (r) => { const n = r.piketRoster.$id; n[".write"] = `(${n[".write"]}) || (auth != null && ${PIKET})`; } },
  { nama: "waka boleh menetapkan role 'piket' (eskalasi)", ubah: (r) => { const n = r.roles.$uid; n[".write"] = `(${n[".write"]}) || (auth != null && ${WAKA} && $uid !== auth.uid)`; } },
  { nama: "alat boleh menghapus attendance/.../masuk", ubah: (r) => { const n = r.attendance.$nis.$date.masuk; n[".write"] = ganti(n[".write"], " && newData.exists()", ""); } },
  { nama: "alat boleh menghapus attendance/.../pulang", ubah: (r) => { const n = r.attendance.$nis.$date.pulang; n[".write"] = ganti(n[".write"], " && newData.exists()", ""); } },
  { nama: "alat boleh menimpa/menghapus node attendance/{nis}/{tgl} utuh", ubah: (r) => { const n = r.attendance.$nis.$date; n[".write"] = ganti(n[".write"], " && !data.exists()", ""); } },
  { nama: "alat boleh menulis attendance/.../ket (kedua lapisan: write + validate)", ubah: (r) => {
    const n = r.attendance.$nis.$date.ket;
    n[".write"] = `(${n[".write"]}) || (auth != null && ${DEVICE})`;
    n[".validate"] = `(newData.val() === 'Izin' || newData.val() === 'Sakit' || newData.val() === 'Dispensasi')`;
  } },
  { nama: "alat boleh menghapus device/status", ubah: (r) => { const n = r.device.status; n[".write"] = ganti(n[".write"], " && newData.exists()", ""); } },
  { nama: "alat boleh menghapus device/ack/{id}", ubah: (r) => { const n = r.device.ack.$id; n[".write"] = ganti(n[".write"], " && newData.exists()", ""); } },
  { nama: "alat boleh menghapus device/events/{id}", ubah: (r) => { const n = r.device.events.$id; n[".write"] = ganti(ganti(n[".write"], " && !data.exists()", ""), " && newData.exists()", ""); } },
  { nama: "izin menolak nilai 'Dispensasi' lagi (regresi fitur)", ubah: (r) => { const n = r.izin.$date.$nis; n[".validate"] = "newData.val() === 'Izin' || newData.val() === 'Sakit'"; } },
  // ---- Tahap B: log aktivitas WAJIB (ditegakkan rules), kunci akun, backup, perangkat
  { nama: "log: izin harian piket tidak lagi mewajibkan log (izin, ket, catatan, izinMeta)", ubah: (r) => {
    for (const n of [r.izin.$date.$nis, r.attendance.$nis.$date.ket, r.attendance.$nis.$date.catatan]) {
      n[".write"] = ganti(n[".write"], ` && (newData.exists() ? (${actOk(n === r.izin.$date.$nis ? 3 : 4, ["izin-harian"])} && `, ` && (newData.exists() ? (true && `);
      n[".write"] = ganti(n[".write"], ` : ${actOk(n === r.izin.$date.$nis ? 3 : 4, ["hapus-izin"])})`, " : true)");
    }
    const m = r.izinMeta.$tgl.$nis.$metaId;
    m[".write"] = ganti(m[".write"], ` && ${actOk(4, ["izin-harian", "izin-jam"])}`, "");
  } },
  { nama: "log: izin harian piket tanpa izinMeta BARU (meta lama cukup) pada izin/", ubah: (r) => {
    const n = r.izin.$date.$nis;
    n[".write"] = ganti(n[".write"], ` && ${metaBaruPiket(3, "$date", "$nis", "'H'")}`, "");
  } },
  { nama: "log: izin harian piket tanpa izinMeta BARU pada attendance/ket", ubah: (r) => {
    const n = r.attendance.$nis.$date.ket;
    n[".write"] = ganti(n[".write"], ` && ${metaBaruPiket(4, "$date", "$nis", "'H'")}`, "");
  } },
  { nama: "log: izin harian piket tanpa izinMeta BARU pada attendance/catatan", ubah: (r) => {
    const n = r.attendance.$nis.$date.catatan;
    n[".write"] = ganti(n[".write"], ` && ${metaBaruPiket(4, "$date", "$nis", "'H'")}`, "");
  } },
  { nama: "log: hapus keterangan piket tidak lagi mewajibkan log 'hapus-izin' (izin/)", ubah: (r) => {
    const n = r.izin.$date.$nis;
    n[".write"] = ganti(n[".write"], ` : ${actOk(3, ["hapus-izin"])})`, " : true)");
  } },
  { nama: "log: sel per jam piket tidak lagi mewajibkan log (sel, salinan, izinMeta)", ubah: (r) => {
    const c = r.lessons.$tgl.$kelas.absen.$nis.$jam;
    c[".write"] = buangSemua(c[".write"], ` && ${actOk(6, ["izin-jam"])}`);
    const k = r.lessonsByStudent.$nis.$tgl.$jam;
    k[".write"] = buangSemua(k[".write"], ` && ${actOk(4, ["izin-jam"])}`);
    const m = r.izinMeta.$tgl.$nis.$metaId;
    m[".write"] = ganti(m[".write"], ` && ${actOk(4, ["izin-harian", "izin-jam"])}`, "");
  } },
  { nama: "log: sel piket tanpa izinMeta BARU pada sel (lessons)", ubah: (r) => {
    const c = r.lessons.$tgl.$kelas.absen.$nis.$jam;
    c[".write"] = buangSemua(c[".write"], ` && ${metaBaruPiket(6, "$tgl", "$nis", "newData.val()")}`);
  } },
  { nama: "log: sel piket tanpa izinMeta BARU pada salinan (lessonsByStudent)", ubah: (r) => {
    const k = r.lessonsByStudent.$nis.$tgl.$jam;
    k[".write"] = buangSemua(k[".write"], ` && ${metaBaruPiket(4, "$tgl", "$nis", "newData.child('k').val()")}`);
  } },
  { nama: "log: pelanggaran piket tidak lagi mewajibkan log (records, recordMeta, piketHarian)", ubah: (r) => {
    const rc = r.discipline.records.$nis.$recId;
    rc[".write"] = ganti(rc[".write"], ` && ${actOk(4, ["pelanggaran"])}`, "");
    rc[".write"] = ganti(rc[".write"], ` && ${actOk(4, ["hapus-pelanggaran"])}`, "");
    const mt = r.discipline.recordMeta.$nis.$recId;
    mt[".write"] = ganti(mt[".write"], ` && (${actOk(4, ["pelanggaran"])} || ${actOk(4, ["hapus-pelanggaran"])})`, "");
    const ph = r.piketHarian.$tgl.$recId;
    ph[".write"] = ganti(ph[".write"], ` && (${actOk(3, ["pelanggaran"])} || ${actOk(3, ["hapus-pelanggaran"])})`, "");
  } },
  { nama: "log: aturan 'aksi' log diabaikan (semua tulisan piket)", ubah: (r) => {
    const s = JSON.stringify(r);
    // hanya perbandingan aksi milik ENTRI log yang dirujuk activityLast (bukan aturan validasi node activity)
    const baru = s.replace(/(\.child\('id'\)\.val\(\)\)\.child\('aksi'\)\.val\(\)) === '[a-z-]+'/g, "$1 !== 'zzz'");
    if (baru === s) throw new Error("pola aksi tidak ditemukan");
    Object.keys(r).forEach((k) => delete r[k]); Object.assign(r, JSON.parse(baru));
  } },
  // Ekuivalen: sejak entri log yang dirujuk WAJIB `ts === now` (entri create-only, jadi hanya entri yang dibuat pada update ini yang lolos)
  // dan node activityLast sendiri memvalidasi `ts === now` setiap kali ditulis, pemeriksaan ts di activityLast pada sisi tulis piket tinggal lapisan kedua.
  // Uji "activityLast.ts basi ditolak" tetap menolak lewat validasi node activityLast.
  { nama: "log: activityLast.ts === now tidak diwajibkan (hanya lapisan sisi tulis piket)", ekuivalen: true, ubah: (r) => {
    const s = JSON.stringify(r).split("newData.parent().parent().parent().parent().parent().parent().child('activityLast').child(auth.uid).child('ts').val() === now && ").join("").split("newData.parent().parent().parent().parent().child('activityLast').child(auth.uid).child('ts').val() === now && ").join("").split("newData.parent().parent().parent().child('activityLast').child(auth.uid).child('ts').val() === now && ").join("");
    const baru = JSON.parse(s);
    if (s === JSON.stringify(r)) throw new Error("pola ts tidak ditemukan");
    Object.keys(r).forEach((k) => delete r[k]); Object.assign(r, baru);
  } },
  { nama: "activity: log boleh ditimpa (bukan create-only)", ubah: (r) => { const n = r.activity.$tgl.$id; n[".write"] = ganti(n[".write"], " && !data.exists()", ""); } },
  { nama: "activity: ts tidak wajib 'sekarang'", ubah: (r) => { r.activity.$tgl.$id.ts[".validate"] = "newData.isNumber()"; } },
  { nama: "activity: hariKe tidak wajib hari server", ubah: (r) => { r.activity.$tgl.$id.hariKe[".validate"] = "newData.isNumber()"; } },
  { nama: "activity: uid tidak wajib pengguna sendiri", ubah: (r) => { r.activity.$tgl.$id.uid[".validate"] = "newData.isString()"; } },
  { nama: "activity: peran tidak dicocokkan dengan role sebenarnya", ubah: (r) => {
    const n = r.activity.$tgl.$id;
    n[".validate"] = ganti(n[".validate"], " && newData.child('peran').val() === root.child('roles').child(auth.uid).val()", "");
  } },
  { nama: "activity: piket boleh tanpa nama petugas", ubah: (r) => {
    const n = r.activity.$tgl.$id;
    n[".validate"] = ganti(n[".validate"], " && (newData.child('peran').val() === 'piket' ? (newData.child('aksi').val() === 'login' || newData.child('petugas').exists()) : !newData.child('petugas').exists())", "");
  } },
  { nama: "activity: dapat dibaca kepala", ubah: (r) => { r.activity[".read"] = `(${r.activity[".read"]}) || (auth != null && ${KEPALA})`; } },
  { nama: "activity: dapat dibaca piket", ubah: (r) => { r.activity[".read"] = `(${r.activity[".read"]}) || (auth != null && ${PIKET})`; } },
  { nama: "activity: dapat dibaca ortu (semua yang login)", ubah: (r) => { r.activity[".read"] = "auth != null"; } },
  { nama: "activity: aksi bebas (tanpa daftar)", ubah: (r) => { r.activity.$tgl.$id.aksi[".validate"] = "newData.isString()"; } },
  { nama: "activityLast: boleh menulis milik uid lain", ubah: (r) => { const n = r.activityLast.$uid; n[".write"] = ganti(n[".write"], " && auth.uid === $uid", ""); } },
  { nama: "activityLast: ts tidak wajib 'sekarang'", ubah: (r) => { r.activityLast.$uid.ts[".validate"] = "newData.isNumber()"; } },
  { nama: "activityLast: piket lain dapat membaca", ubah: (r) => { r.activityLast.$uid[".read"] = "auth != null"; } },
  { nama: "izinMeta: kunci piket tidak wajib berawalan id log (tulis langsung)", ubah: (r) => {
    const n = r.izinMeta.$tgl.$nis.$metaId;
    n[".validate"] = ganti(n[".validate"], `$metaId.beginsWith(${nav(4)}.child('activityLast').child(auth.uid).child('id').val() + '_') && `, "");
  } },
  { nama: "log: entri log LAMA boleh dipakai ulang (ts entri tidak wajib now)", ubah: (r) => {
    const s = JSON.stringify(r);
    const baru = s.replace(/ && newData(?:\.parent\(\))+\.child\('activity'\)\.child\(newData(?:\.parent\(\))+\.child\('activityLast'\)\.child\(auth\.uid\)\.child\('tgl'\)\.val\(\)\)\.child\(newData(?:\.parent\(\))+\.child\('activityLast'\)\.child\(auth\.uid\)\.child\('id'\)\.val\(\)\)\.child\('ts'\)\.val\(\) === now/g, "");
    if (baru === s) throw new Error("pola ts entri tidak ditemukan");
    Object.keys(r).forEach((k) => delete r[k]); Object.assign(r, JSON.parse(baru));
  } },
  { nama: "izinMeta: ts piket tidak wajib 'sekarang' (tulis langsung)", ubah: (r) => {
    const n = r.izinMeta.$tgl.$nis.$metaId;
    n[".validate"] = ganti(n[".validate"], " && newData.child('ts').val() === now && ", " && ");
  } },
  { nama: "kunci akun: waka boleh menghapus role APA SAJA (bukan hanya piket)", ubah: (r) => {
    const n = r.roles.$uid;
    n[".write"] = ganti(n[".write"], "(data.val() === 'piket' && !newData.exists())", "(!newData.exists())");
  } },
  { nama: "kunci akun: waka boleh membuka kunci tanpa cek staff.role = piket", ubah: (r) => {
    const n = r.roles.$uid;
    n[".write"] = ganti(n[".write"], " && root.child('staff').child($uid).child('role').val() === 'piket'", "");
  } },
  { nama: "kunci akun: waka boleh mengubah role piket menjadi role lain", ubah: (r) => {
    const n = r.roles.$uid;
    n[".write"] = ganti(n[".write"], "(data.val() === 'piket' && !newData.exists())", "(data.val() === 'piket')");
  } },
  { nama: "piketAkun: waka boleh menulis seluruh entri (email, nama)", ubah: (r) => { const n = r.piketAkun.$uid; n[".write"] = `(${n[".write"]}) || (auth != null && ${WAKA})`; } },
  { nama: "piketAkun: dapat dibaca kepala", ubah: (r) => { r.piketAkun[".read"] = `(${r.piketAkun[".read"]}) || (auth != null && ${KEPALA})`; } },
  { nama: "sistem: backupTerakhir dapat dibaca waka", ubah: (r) => { r.sistem[".read"] = `(${r.sistem[".read"]}) || (auth != null && ${WAKA})`; } },
  { nama: "sistem: backupTerakhir dapat ditulis waka", ubah: (r) => { r.sistem[".write"] = `auth != null && ${WAKA}`; } }, // waka menulis di tingkat node sistem (mencakup backupTerakhir)
  { nama: "sistem: backupTerakhir boleh di masa depan", ubah: (r) => { r.sistem.backupTerakhir[".validate"] = "newData.isNumber()"; } },
  { nama: "piketPerangkat: pendaftaran boleh ditimpa", ubah: (r) => { const n = r.piketPerangkat.$id; n[".write"] = ganti(n[".write"], " && !data.exists()", ""); } },
  { nama: "piketPerangkat: dapat dibaca kepala", ubah: (r) => { r.piketPerangkat[".read"] = `(${r.piketPerangkat[".read"]}) || (auth != null && ${KEPALA})`; } },
  { nama: "piketPerangkat: uid tidak wajib pengguna sendiri", ubah: (r) => { r.piketPerangkat.$id.uid[".validate"] = "newData.isString()"; } },
  // ---------------------------------------------------------------- PRESENSI MANUAL (manualTap + manualTapByStudent)
  // Pasangan asli<->salinan memvalidasi isi yang sama di DUA lapisan; mutasi yang merusak satu lapisan saja ekuivalen, jadi lapisan dirusak bersamaan.
  { nama: "manual: piket menulis TANPA log aktivitas (tulis)", ubah: (r) => {
    const n = r.manualTap.$tgl.$nis;
    n[".write"] = ganti(n[".write"], `(newData.exists() ? ${actOk(3, ["presensi-manual"])} : `, "(newData.exists() ? true : ");
  } },
  { nama: "manual: aksi log bebas pada tulis (bukan 'presensi-manual')", ubah: (r) => {
    const n = r.manualTap.$tgl.$nis;
    n[".write"] = ganti(n[".write"], `(${ENT(3)}.child('aksi').val() === 'presensi-manual')`, `(${ENT(3)}.child('aksi').exists())`);
  } },
  { nama: "manual: piket menghapus TANPA log aktivitas", ubah: (r) => {
    const n = r.manualTap.$tgl.$nis;
    n[".write"] = ganti(n[".write"], ` : ${actOk(3, ["hapus-manual"])})`, " : true)");
  } },
  { nama: "manual: aksi log bebas pada hapus (bukan 'hapus-manual')", ubah: (r) => {
    const n = r.manualTap.$tgl.$nis;
    n[".write"] = ganti(n[".write"], `(${ENT(3)}.child('aksi').val() === 'hapus-manual')`, `(${ENT(3)}.child('aksi').exists())`);
  } },
  { nama: "manual: piket boleh menimpa entri milik waka", ubah: (r) => {
    const n = r.manualTap.$tgl.$nis;
    n[".write"] = ganti(n[".write"], " && (!data.exists() || root.child('roles').child(data.child('oleh').val()).val() === 'piket')", "");
  } },
  { nama: "manual: piket boleh menulis walau Alfa sudah divalidasi", ubah: (r) => {
    const n = r.manualTap.$tgl.$nis;
    n[".write"] = ganti(n[".write"], " && !root.child('validasi').child($tgl).child($nis).exists()", "");
  } },
  { nama: "manual: status 'Alfa'/bebas diterima (asli + salinan)", ubah: (r) => {
    r.manualTap.$tgl.$nis.status[".validate"] = "newData.isString()";
    r.manualTapByStudent.$nis.$tgl.status[".validate"] = "newData.isString()";
  } },
  { nama: "manual: alasan bebas diterima (asli + salinan)", ubah: (r) => {
    r.manualTap.$tgl.$nis.alasan[".validate"] = "newData.isString()";
    r.manualTapByStudent.$nis.$tgl.alasan[".validate"] = "newData.isString()";
  } },
  { nama: "manual: format jam masuk tidak diperiksa (asli + salinan)", ubah: (r) => {
    r.manualTap.$tgl.$nis.masuk[".validate"] = "newData.isString()";
    r.manualTapByStudent.$nis.$tgl.masuk[".validate"] = "newData.isString()";
  } },
  { nama: "manual: format jam pulang tidak diperiksa (asli + salinan)", ubah: (r) => {
    r.manualTap.$tgl.$nis.pulang[".validate"] = "newData.isString()";
    r.manualTapByStudent.$nis.$tgl.pulang[".validate"] = "newData.isString()";
  } },
  { nama: "manual: masa depan diterima (waka; hariKe <= hari ini dilepas)", ubah: (r) => {
    const n = r.manualTap.$tgl.$nis;
    n[".validate"] = ganti(n[".validate"], " && newData.child('hariKe').val() <= ((now + 25200000) / 86400000) && (newData", " && (newData");
  } },
  { nama: "manual: jendela mundur piket tidak ditegakkan", ubah: (r) => {
    const n = r.manualTap.$tgl.$nis;
    const baru = n[".validate"].replace(/ && newData\.child\('hariKe'\)\.val\(\) >= [^]*? - 1 && newData\.child\('hariKe'\)\.val\(\) <= \(\(now \+ 25200000\) \/ 86400000\) \+ 0/, " && newData.child('hariKe').val() <= ((now + 25200000) / 86400000) + 0");
    if (baru === n[".validate"]) throw new Error("pola jendela manual tidak ditemukan");
    n[".validate"] = baru;
  } },
  { nama: "manual: hari Minggu diterima", ubah: (r) => {
    const n = r.manualTap.$tgl.$nis;
    n[".validate"] = ganti(n[".validate"], " && (newData.child('hariKe').val() + 4) % 7 !== 0", "");
  } },
  { nama: "manual: pasangan salinan TIDAK diwajibkan pada tulis entri asli", ubah: (r) => {
    const n = r.manualTap.$tgl.$nis;
    const i = n[".write"].indexOf(" && (newData.exists() ? (" + nav(3) + ".child('manualTapByStudent')");
    if (i < 0) throw new Error("pola pasangan tidak ditemukan");
    n[".write"] = n[".write"].slice(0, i);
  } },
  { nama: "manual: salinan boleh ditulis tanpa entri asli yang cocok", ubah: (r) => {
    const n = r.manualTapByStudent.$nis.$tgl;
    const i = n[".write"].indexOf(" && (newData.exists() ? (");
    if (i < 0) throw new Error("pola pasangan salinan tidak ditemukan");
    n[".write"] = n[".write"].slice(0, i);
  } },
  { nama: "manual: jam masuk salinan tidak dibandingkan dengan entri asli (kedua lapisan)", ubah: (r) => {
    const a = r.manualTap.$tgl.$nis;
    a[".write"] = ganti(a[".write"], ` && ${nav(3)}.child('manualTapByStudent').child($nis).child($tgl).child('masuk').val() === newData.child('masuk').val()`, "");
    const b = r.manualTapByStudent.$nis.$tgl;
    b[".write"] = ganti(b[".write"], ` && ${nav(3)}.child('manualTap').child($tgl).child($nis).child('masuk').val() === newData.child('masuk').val()`, "");
  } },
  { nama: "manual: alasan salinan tidak dibandingkan dengan entri asli (kedua lapisan)", ubah: (r) => {
    const a = r.manualTap.$tgl.$nis;
    a[".write"] = ganti(a[".write"], ` && ${nav(3)}.child('manualTapByStudent').child($nis).child($tgl).child('alasan').val() === newData.child('alasan').val()`, "");
    const b = r.manualTapByStudent.$nis.$tgl;
    b[".write"] = ganti(b[".write"], ` && ${nav(3)}.child('manualTap').child($tgl).child($nis).child('alasan').val() === newData.child('alasan').val()`, "");
  } },
  { nama: "manual: ortu boleh membaca manualTap", ubah: (r) => { r.manualTap[".read"] = "auth != null"; } },
  { nama: "manual: ortu boleh membaca seluruh manualTapByStudent", ubah: (r) => { r.manualTapByStudent[".read"] = "auth != null"; } },
  { nama: "manual: ortu boleh membaca salinan anak orang lain", ubah: (r) => { r.manualTapByStudent.$nis[".read"] = "auth != null"; } },
  { nama: "manual: piket boleh membaca manualTapByStudent", ubah: (r) => { r.manualTapByStudent[".read"] = `(${r.manualTapByStudent[".read"]}) || (auth != null && ${PIKET})`; } },
  { nama: "manual: kepala boleh menulis (asli + salinan)", ubah: (r) => {
    const a = r.manualTap.$tgl.$nis; a[".write"] = ganti(a[".write"], `(${WAKA} || (`, `(${WAKA} || ${KEPALA} || (`);
    const b = r.manualTapByStudent.$nis.$tgl; b[".write"] = ganti(b[".write"], `(${WAKA} || ${PIKET})`, `(${WAKA} || ${PIKET} || ${KEPALA})`);
  } },
  { nama: "manual: admin boleh menulis (asli + salinan)", ubah: (r) => {
    const a = r.manualTap.$tgl.$nis; a[".write"] = ganti(a[".write"], `(${WAKA} || (`, `(${WAKA} || ${ADMIN} || (`);
    const b = r.manualTapByStudent.$nis.$tgl; b[".write"] = ganti(b[".write"], `(${WAKA} || ${PIKET})`, `(${WAKA} || ${PIKET} || ${ADMIN})`);
  } },
  { nama: "manual: 'oleh' bukan pengguna sendiri diterima", ubah: (r) => { r.manualTap.$tgl.$nis.oleh[".validate"] = "newData.isString()"; } },
  { nama: "manual: ts bukan 'sekarang' diterima", ubah: (r) => { r.manualTap.$tgl.$nis.ts[".validate"] = "newData.isNumber()"; } },
  { nama: "manual: piket tanpa nama petugas diterima", ubah: (r) => {
    const n = r.manualTap.$tgl.$nis;
    n[".validate"] = ganti(n[".validate"], "(newData.child('petugas').exists() && ", "(");
  } },
  { nama: "manual: entri tanpa masuk DAN pulang diterima (asli + salinan)", ubah: (r) => {
    const a = r.manualTap.$tgl.$nis; a[".validate"] = ganti(a[".validate"], " && (newData.child('masuk').exists() || newData.child('pulang').exists())", "");
    const b = r.manualTapByStudent.$nis.$tgl; b[".validate"] = ganti(b[".validate"], " && (newData.child('masuk').exists() || newData.child('pulang').exists())", "");
  } },
  { nama: "manual: field asing pada entri asli diterima", ubah: (r) => { delete r.manualTap.$tgl.$nis.$other; } },
  { nama: "manual: field asing pada salinan diterima", ubah: (r) => { delete r.manualTapByStudent.$nis.$tgl.$other; } },
  { nama: "saran: tipe 'lupaKtm'/'ktmHilang' tidak dikenal rules", ubah: (r) => {
    const s = JSON.stringify(r);
    const baru = s.split("|lupaKtm|ktmHilang").join("");
    if (baru === s) throw new Error("pola tipe saran tidak ditemukan");
    Object.keys(r).forEach((k) => delete r[k]); Object.assign(r, JSON.parse(baru));
  } },
  { nama: "autoMap: kunci 'lupaKtm' tidak diizinkan", ubah: (r) => { delete r.discipline.autoMap.lupaKtm; } },
  { nama: "autoMap: kunci asing diterima", ubah: (r) => { delete r.discipline.autoMap.$other; } },
  // ---------------------------------------------------------------- KALENDER HARI EFEKTIF
  { nama: "kalender: kepala boleh mengatur override", ubah: (r) => { const n = r.kalender.$tgl; n[".write"] = `(${n[".write"]}) || (auth != null && ${KEPALA})`; } },
  { nama: "kalender: piket boleh mengatur override", ubah: (r) => { const n = r.kalender.$tgl; n[".write"] = `(${n[".write"]}) || (auth != null && ${PIKET})`; } },
  { nama: "kalender: siapa pun yang login boleh mengatur override", ubah: (r) => { r.kalender.$tgl[".write"] = "auth != null"; } },
  { nama: "kalender: status override bebas", ubah: (r) => { r.kalender.$tgl.status[".validate"] = "newData.isString()"; } },
  { nama: "kalender: alasan override tidak diperiksa panjangnya", ubah: (r) => { r.kalender.$tgl.alasan[".validate"] = "newData.isString()"; } },
  { nama: "kalender: 'oleh' bukan pengguna sendiri diterima", ubah: (r) => { r.kalender.$tgl.oleh[".validate"] = "newData.isString()"; } },
  { nama: "kalender: ts bukan 'sekarang' diterima", ubah: (r) => { r.kalender.$tgl.ts[".validate"] = "newData.isNumber()"; } },
  { nama: "kalender: field asing diterima", ubah: (r) => { delete r.kalender.$tgl.$other; } },
  { nama: "kalender: anonim boleh membaca", ubah: (r) => { r.kalender[".read"] = "true"; } },
  { nama: "kalenderEfektif: siapa pun yang login boleh menulis", ubah: (r) => { r.kalenderEfektif.$tgl[".write"] = "auth != null"; } },
  { nama: "kalenderEfektif: piket menulis TANPA log aktivitas", ubah: (r) => {
    const n = r.kalenderEfektif.$tgl;
    n[".write"] = ganti(n[".write"], `(${PIKET} && ${actOk(2, ["hitung-kalender"])})`, `(${PIKET})`);
  } },
  { nama: "kalenderEfektif: aksi log piket bebas (bukan 'hitung-kalender')", ubah: (r) => {
    const n = r.kalenderEfektif.$tgl;
    n[".write"] = ganti(n[".write"], `(${ENT(2)}.child('aksi').val() === 'hitung-kalender')`, `(${ENT(2)}.child('aksi').exists())`);
  } },
  { nama: "kalenderEfektif: efektif TANPA bukti diterima (otomatis)", ubah: (r) => {
    const n = r.kalenderEfektif.$tgl;
    const baru = n[".validate"].replace(/\(newData\.child\('efektif'\)\.val\(\) === false \|\| newData\.child\('tap'\)\.val\(\) \+ newData\.child\('manual'\)\.val\(\) >= \([^]*?: 1\)\)/, "true");
    if (baru === n[".validate"]) throw new Error("pola bukti tidak ditemukan");
    n[".validate"] = baru;
  } },
  { nama: "kalenderEfektif: ambang diabaikan (selalu 1)", ubah: (r) => {
    const n = r.kalenderEfektif.$tgl;
    const baru = n[".validate"].replace(/\(newData\.parent\(\)\.parent\(\)\.child\('sistem'\)\.child\('ambangHariEfektif'\)\.val\(\) != null \? [^]*?: 1\)/, "1");
    if (baru === n[".validate"]) throw new Error("pola ambang tidak ditemukan");
    n[".validate"] = baru;
  } },
  { nama: "kalenderEfektif: override tidak ditegakkan (hitungan otomatis boleh menimpa)", ubah: (r) => {
    const n = r.kalenderEfektif.$tgl;
    const baru = n[".validate"].split(`${nav(2)}.child('kalender').child($tgl).exists()`).join("false");
    if (baru === n[".validate"]) throw new Error("pola override tidak ditemukan");
    n[".validate"] = baru;
  } },
  { nama: "kalenderEfektif: efektif tidak dicocokkan dengan override", ubah: (r) => {
    const n = r.kalenderEfektif.$tgl;
    n[".validate"] = ganti(n[".validate"], ` && newData.child('efektif').val() === (${nav(2)}.child('kalender').child($tgl).child('status').val() === 'efektif')`, "");
  } },
  { nama: "kalenderEfektif: sumber 'override' diterima tanpa override", ubah: (r) => {
    const n = r.kalenderEfektif.$tgl;
    n[".validate"] = ganti(n[".validate"], "(newData.child('sumber').val() === 'otomatis' && (", "((");
  } },
  { nama: "kalenderEfektif: tap bukan bilangan bulat >= 0", ubah: (r) => { r.kalenderEfektif.$tgl.tap[".validate"] = "newData.isNumber()"; } },
  { nama: "kalenderEfektif: manual bukan bilangan bulat >= 0", ubah: (r) => { r.kalenderEfektif.$tgl.manual[".validate"] = "newData.isNumber()"; } },
  { nama: "kalenderEfektif: dihitung bukan 'sekarang' diterima", ubah: (r) => { r.kalenderEfektif.$tgl.dihitung[".validate"] = "newData.isNumber()"; } },
  { nama: "kalenderEfektif: penanda 'normal' dapat diatur siapa pun yang boleh menulis", ubah: (r) => { r.kalenderEfektif.$tgl.normal[".validate"] = "newData.val() === true"; } },
  { nama: "kalenderEfektif: 'normal' bernilai false diterima", ubah: (r) => { r.kalenderEfektif.$tgl.normal[".validate"] = ganti(r.kalenderEfektif.$tgl.normal[".validate"], "newData.val() === true && ", ""); } },
  { nama: "kalenderEfektif: field asing diterima", ubah: (r) => { delete r.kalenderEfektif.$tgl.$other; } },
  { nama: "kalenderEfektif: anonim boleh membaca", ubah: (r) => { r.kalenderEfektif[".read"] = "true"; } },
  { nama: "ambang: kepala boleh mengubah", ubah: (r) => { const n = r.sistem.ambangHariEfektif; n[".write"] = `(${n[".write"]}) || (auth != null && ${KEPALA})`; } },
  { nama: "ambang: nilai bebas (tidak 1..500 bulat)", ubah: (r) => { r.sistem.ambangHariEfektif[".validate"] = "newData.isNumber()"; } },
  { nama: "ambang: ortu boleh membaca", ubah: (r) => { r.sistem.ambangHariEfektif[".read"] = "auth != null"; } },
  { nama: "sistem: waka boleh membaca seluruh node sistem", ubah: (r) => { r.sistem[".read"] = `(${r.sistem[".read"]}) || (auth != null && ${WAKA})`; } },
  { nama: "sistem: waka boleh menulis backupTerakhir", ubah: (r) => { const n = r.sistem.backupTerakhir; n[".write"] = `(${n[".write"]}) || (auth != null && ${WAKA})`; } },
  { nama: "profiles: aktifSejak format bebas", ubah: (r) => { r.profiles.$nis.aktifSejak[".validate"] = "newData.isString()"; } },
  // ---------------------------------------------------------------- WALI KELAS (grup "wali")
  // Salinan helper rules (harus identik dengan scripts/build-rules.mjs) untuk menyusun teks yang dirusak mutasi.
  { nama: "wali: indeks siswaKelas tidak diperiksa ada (null === null membuka siswa tanpa indeks)", ubah: (r) => ubahJson(r, "root.child('siswaKelas').child($nis).exists() && ", "") },
  { nama: "wali: kelas utama tidak dicocokkan (semua siswa terindeks terbuka)", ubah: (r) => ubahJson(r, "root.child('staff').child(auth.uid).child('kelasUtama').val() === root.child('siswaKelas').child($nis).val()", "true") },
  { nama: "wali: kelas tambahan tidak dicocokkan", ubah: (r) => ubahJson(r, "root.child('staff').child(auth.uid).child('kelasTambahan').child(root.child('siswaKelas').child($nis).val()).val() === true", "true") },
  { nama: "wali: peran 'wali' tidak diperiksa (akun lain dengan kelasUtama)", ubah: (r) => ubahJson(r, `(${WALI} && root.child('siswaKelas').child($nis).exists()`, "(true && root.child('siswaKelas').child($nis).exists()") },
  { nama: "wali izin: kelas binaan tidak diperiksa (semua jalur izin)", ubah: (r) => {
    for (const [lok, n, tgl, cek] of [[r.izin.$date.$nis, 3, "$date", true], [r.attendance.$nis.$date.ket, 4, "$date", true], [r.attendance.$nis.$date.catatan, 4, "$date", false]]) lok[".write"] = ganti(lok[".write"], waliIzinT(n, tgl, cek), waliIzinT(n, tgl, cek).replace(waliDariT("$nis"), "true"));
    const m = r.izinMeta.$tgl.$nis.$metaId; m[".write"] = ganti(m[".write"], `(${waliDariT("$nis")} && newData.exists()`, "(true && newData.exists()");
  } },
  { nama: "wali izin: Alfa yang sudah divalidasi diabaikan", ubah: (r) => {
    for (const [lok, n, tgl, cek] of [[r.izin.$date.$nis, 3, "$date", true], [r.attendance.$nis.$date.ket, 4, "$date", true], [r.attendance.$nis.$date.catatan, 4, "$date", false]]) lok[".write"] = ganti(lok[".write"], waliIzinT(n, tgl, cek), waliIzinT(n, tgl, cek).replace(`!root.child('validasi').child(${tgl}).child($nis).exists() && `, ""));
  } },
  { nama: "wali izin: Dispensasi diterima (semua lapisan)", ubah: (r) => {
    for (const [lok, n, tgl, cek] of [[r.izin.$date.$nis, 3, "$date", true], [r.attendance.$nis.$date.ket, 4, "$date", true]]) lok[".write"] = ganti(lok[".write"], waliIzinT(n, tgl, cek), waliIzinT(n, tgl, cek).replace("newData.val() !== 'Dispensasi' && ", ""));
    const m = r.izinMeta.$tgl.$nis.$metaId; m[".validate"] = ganti(m[".validate"], " && newData.child('ket').val() !== 'Dispensasi')))", ")))");
  } },
  { nama: "wali izin: log aktivitas tidak wajib (semua jalur)", ubah: (r) => {
    for (const [lok, n, tgl, cek] of [[r.izin.$date.$nis, 3, "$date", true], [r.attendance.$nis.$date.ket, 4, "$date", true], [r.attendance.$nis.$date.catatan, 4, "$date", false]]) {
      const t = waliIzinT(n, tgl, cek);
      lok[".write"] = ganti(lok[".write"], t, t.replace(`${actOk(n, ["izin-harian"])} && `, "").replace(actOk(n, ["hapus-izin"]), "true"));
    }
    const m = r.izinMeta.$tgl.$nis.$metaId; m[".write"] = ganti(m[".write"], `data.child('oleh').val() === auth.uid) && ${actOk(4, ["izin-harian"])}))`, "data.child('oleh').val() === auth.uid)))");
  } },
  { nama: "wali izin: izinMeta baru tidak wajib (izin tanpa keterangan/surat)", ubah: (r) => {
    for (const [lok, n, tgl, cek] of [[r.izin.$date.$nis, 3, "$date", true], [r.attendance.$nis.$date.ket, 4, "$date", true], [r.attendance.$nis.$date.catatan, 4, "$date", false]]) {
      const t = waliIzinT(n, tgl, cek);
      lok[".write"] = ganti(lok[".write"], t, t.replace(` && ${metaBaruPiket(n, tgl, "$nis", "'H'")}`, ""));
    }
  } },
  { nama: "wali izin: izinMeta berlingkup 'jam' diterima", ubah: (r) => { const m = r.izinMeta.$tgl.$nis.$metaId; m[".validate"] = ganti(m[".validate"], "(!(" + WALI + ") || (newData.child('lingkup').val() === 'harian' && ", "(!(" + WALI + ") || (true && "); } },
  { nama: "wali pelanggaran: kelas binaan tidak diperiksa", ubah: (r) => {
    const n = r.discipline.records.$nis.$recId; n[".write"] = ganti(n[".write"], `(newData.exists() ? (!data.exists() && ${waliDariT("$nis")} && `, "(newData.exists() ? (!data.exists() && true && ");
    n[".write"] = ganti(n[".write"], `: (${waliDariT("$nis")} && data.child('sumber').val() === 'wali'`, ": (true && data.child('sumber').val() === 'wali'");
    const m = r.discipline.recordMeta.$nis.$recId; m[".write"] = ganti(m[".write"], `|| (${waliDariT("$nis")} && (`, "|| (true && (");
  } },
  { nama: "wali pelanggaran: Sedang/Berat tanpa takziran diterima", ubah: (r) => ubahSetelah(r.discipline.records.$nis.$recId, ".write", "newData.child('sumber').val() === 'wali' && ", ` && (${RULE}.child('kategori').val() === 'Ringan' || ${RULE}.child('takziran').val().length > 0)`, "") },
  { nama: "wali pelanggaran: aturan nonaktif diterima", ubah: (r) => ubahSetelah(r.discipline.records.$nis.$recId, ".write", "newData.child('sumber').val() === 'wali' && ", ` && ${RULE}.child('aktif').val() === true`, "") },
  { nama: "wali pelanggaran: poin tidak dicocokkan dengan master", ubah: (r) => ubahSetelah(r.discipline.records.$nis.$recId, ".write", "newData.child('sumber').val() === 'wali' && ", ` && newData.child('poin').val() === ${RULE}.child('poin').val()`, "") },
  { nama: "wali pelanggaran: nama tidak dicocokkan dengan master", ubah: (r) => ubahSetelah(r.discipline.records.$nis.$recId, ".write", "newData.child('sumber').val() === 'wali' && ", ` && newData.child('nama').val() === ${RULE}.child('nama').val()`, "") },
  { nama: "wali pelanggaran: kategori tidak dicocokkan dengan master", ubah: (r) => ubahSetelah(r.discipline.records.$nis.$recId, ".write", "newData.child('sumber').val() === 'wali' && ", ` && newData.child('kategori').val() === ${RULE}.child('kategori').val()`, "") },
  { nama: "wali pelanggaran: takziran tidak dicocokkan dengan master", ubah: (r) => ubahSetelah(r.discipline.records.$nis.$recId, ".write", "newData.child('sumber').val() === 'wali' && ", ` && newData.child('takziran').val() === ${RULE}.child('takziran').val()`, "") },
  { nama: "wali pelanggaran: sumber tidak dikunci 'wali' (hanya lapisan records; recordMeta mengunci sumber 'wali' juga)", ekuivalen: true, ubah: (r) => { const n = r.discipline.records.$nis.$recId; n[".write"] = ganti(n[".write"], " && newData.child('sumber').val() === 'wali' && " + RULE + ".child('aktif')", " && " + RULE + ".child('aktif')"); } },
  { nama: "wali pelanggaran: REMISI diterima (jenis tidak dikunci)", ubah: (r) => ubahSetelah(r.discipline.records.$nis.$recId, ".write", "(newData.exists() ? (!data.exists() && " + waliDariT("$nis") + " && ", "newData.child('jenis').val() === 'pelanggaran' && ", "") },
  { nama: "wali pelanggaran: log aktivitas tidak wajib", ubah: (r) => {
    const n = r.discipline.records.$nis.$recId;
    n[".write"] = ubahTeksSetelah(n[".write"], "newData.child('sumber').val() === 'wali' && ", ` && ${actOk(4, ["pelanggaran"])}`, "");
    const m = r.discipline.recordMeta.$nis.$recId;
    m[".write"] = ubahTeksSetelah(m[".write"], `|| (${waliDariT("$nis")} && (`, `(${actOk(4, ["pelanggaran"])} || ${actOk(4, ["hapus-pelanggaran"])})`, "true");
  } },
  { nama: "wali pelanggaran: jendela hariKe tidak ditegakkan (recordMeta.hariKe)", ubah: (r) => {
    const n = r.discipline.records.$nis.$recId;
    const baru = n[".write"].replace(/ && newData\.parent\(\)\.parent\(\)\.parent\(\)\.child\('recordMeta'\)\.child\(\$nis\)\.child\(\$recId\)\.child\('hariKe'\)\.isNumber\(\)[^]*?<= \(\(now \+ 25200000\) \/ 86400000\) \+ 0/, "");
    if (baru === n[".write"]) throw new Error("pola hariKe wali tidak ditemukan");
    n[".write"] = baru;
  } },
  { nama: "wali hapus: catatan milik wali lain boleh dihapus", ubah: (r) => { const n = r.discipline.records.$nis.$recId; n[".write"] = ganti(n[".write"], " && root.child('discipline').child('recordMeta').child($nis).child($recId).child('dibuatOleh').val() === auth.uid && ", " && "); } },
  { nama: "wali hapus: catatan non-wali (waka/piket) boleh dihapus", ubah: (r) => {
    const n = r.discipline.records.$nis.$recId; n[".write"] = ganti(n[".write"], ` && data.child('sumber').val() === 'wali' && root.child('discipline')`, " && root.child('discipline')");
    const m = r.discipline.recordMeta.$nis.$recId; m[".write"] = ganti(m[".write"], " || root.child('discipline').child('records').child($nis).child($recId).child('sumber').val() === 'wali')", " || true)");
  } },
  { nama: "wali: recordMeta siswa lain terbaca", ubah: (r) => { r.discipline.recordMeta.$nis[".read"] = `auth != null && ${WALI}`; } },
  { nama: "wali: catatan internal (notes) siswa lain terbaca", ubah: (r) => { r.discipline.notes.$nis[".read"] = `auth != null && ${WALI}`; } },
  { nama: "wali: siswaKelas dapat dibaca utuh tanpa query", ubah: (r) => { r.siswaKelas[".read"] = `(${r.siswaKelas[".read"]}) || (auth != null && ${WALI})`; } },
  { nama: "wali: query siswaKelas kelas lain diterima", ubah: (r) => { r.siswaKelas[".read"] = ganti(r.siswaKelas[".read"], "(query.equalTo === root.child('staff').child(auth.uid).child('kelasUtama').val() || root.child('staff').child(auth.uid).child('kelasTambahan').child(query.equalTo).val() === true)", "true"); } },
  { nama: "wali: waka boleh menulis siswaKelas", ubah: (r) => { const n = r.siswaKelas.$nis; n[".write"] = `(${n[".write"]}) || (auth != null && ${WAKA})`; } },
  { nama: "wali: nilai siswaKelas bebas", ubah: (r) => { r.siswaKelas.$nis[".validate"] = "true"; } },
  { nama: "wali: waka boleh menambah kelasTambahan", ubah: (r) => { const n = r.staff.$uid.kelasTambahan.$kelas; n[".write"] = `(${n[".write"]}) || (auth != null && ${WAKA})`; } },
  { nama: "wali: waka boleh mengatur kelasUtama akun non-wali", ubah: (r) => { const n = r.staff.$uid.kelasUtama; n[".write"] = ganti(n[".write"], "newData.parent().child('role').val() === 'wali' && ", ""); } },
  { nama: "wali: waka boleh menghapus kelasUtama", ubah: (r) => { const n = r.staff.$uid.kelasUtama; n[".write"] = ganti(n[".write"], " && newData.exists()", ""); } },
  { nama: "wali: format kelasUtama bebas", ubah: (r) => { r.staff.$uid.kelasUtama[".validate"] = "newData.isString()"; } },
  { nama: "wali: nilai kelasTambahan bebas (bukan true)", ubah: (r) => { const n = r.staff.$uid.kelasTambahan.$kelas; n[".validate"] = ganti(n[".validate"], "newData.val() === true && ", ""); } },
  { nama: "wali: waka boleh membuat entri staff untuk role selain wali (hanya lapisan field role; email/nama/dibuat tetap mensyaratkan role wali)", ekuivalen: true, ubah: (r) => { const n = r.staff.$uid.role; n[".write"] = ganti(n[".write"], " && newData.val() === 'wali'", ""); } },
  { nama: "wali: waka boleh memberi role tanpa entri staff wali", ubah: (r) => { const n = r.roles.$uid; n[".write"] = ganti(n[".write"], " && newData.parent().parent().child('staff').child($uid).child('role').val() === 'wali'", ""); } },
  { nama: "wali: waka boleh memberi role selain wali (staff wali ada)", ubah: (r) => { const n = r.roles.$uid; n[".write"] = ganti(n[".write"], "(!data.exists() && newData.val() === 'wali' && newData.parent()", "(!data.exists() && newData.parent()"); } },
  { nama: "wali: waka boleh mencabut role apa pun", ubah: (r) => { const n = r.roles.$uid; n[".write"] = ganti(n[".write"], "(data.val() === 'wali' && !newData.exists())", "(!newData.exists())"); } },
  { nama: "wali: waka boleh menimpa role wali yang ada", ubah: (r) => { const n = r.roles.$uid; n[".write"] = ganti(n[".write"], "(!data.exists() && newData.val() === 'wali' && newData.parent()", "(newData.val() === 'wali' && newData.parent()"); } },
  { nama: "wali: waliAkun kelasUtama cermin tidak dicocokkan dengan staff", ubah: (r) => { const n = r.waliAkun.$uid.kelasUtama; n[".write"] = ganti(n[".write"], " && newData.val() === newData.parent().parent().parent().child('staff').child($uid).child('kelasUtama').val()", ""); } },
  { nama: "wali: waka boleh menulis cermin waliAkun akun non-wali", ubah: (r) => {
    for (const k of ["email", "nama"]) { const n = r.waliAkun.$uid[k]; n[".write"] = ganti(n[".write"], " && newData.parent().parent().parent().child('staff').child($uid).child('role').val() === 'wali'", ""); }
    for (const k of ["kelasUtama", "aktif"]) { const n = r.waliAkun.$uid[k]; n[".write"] = ganti(n[".write"], " && newData.parent().parent().parent().child('staff').child($uid).child('role').val() === 'wali'", ""); }
  } },
  { nama: "wali: waka boleh menulis kelasTambahan cermin", ubah: (r) => { const n = r.waliAkun.$uid.kelasTambahan.$kelas; n[".write"] = `(${n[".write"]}) || (auth != null && ${WAKA})`; } },
  { nama: "wali: waliAkun dapat dibaca wali/piket", ubah: (r) => { r.waliAkun[".read"] = "auth != null"; } },
  // ---------------------------------------------------------------- v2.3 Tahap 2: pembinaan, pembinaanStatus, usulRemisi, penanggung jawab ambang
  // pembinaan dan salinan pembinaanStatus selalu ditulis bersama dan masing-masing memeriksa kelas binaan/ambang wali/peran: merusak satu lapisan saja ekuivalen, jadi kedua lapisan dirusak bersamaan.
  { nama: "pembinaan: kelas binaan tidak diperiksa (pembinaan + status)", ubah: (r) => { const n = r.pembinaan.$nis.$id; n[".write"] = ganti(n[".write"], waliDariT("$nis"), WALI); const t = r.pembinaanStatus.$nis.$ta.$levelId; t[".write"] = ganti(t[".write"], waliDariT("$nis"), WALI); } },
  { nama: "pembinaan: ambang bukan tanggung jawab wali diterima (pembinaan + status)", ubah: (r) => { const n = r.pembinaan.$nis.$id; n[".write"] = ganti(n[".write"], ` && ${LEVEL_WALI_T("newData.child('levelId').val()")}`, ""); const t = r.pembinaanStatus.$nis.$ta.$levelId; t[".write"] = ganti(t[".write"], ` && ${LEVEL_WALI_T("$levelId")}`, ""); } },
  { nama: "pembinaan: log aktivitas tidak wajib", ubah: (r) => { const n = r.pembinaan.$nis.$id; n[".write"] = ganti(n[".write"], ` && ${actOk(3, ["catat-pembinaan"])}`, ""); } },
  { nama: "pembinaan: log aksi apa pun diterima", ubah: (r) => { const n = r.pembinaan.$nis.$id; n[".write"] = ganti(n[".write"], `(${ENT(3)}.child('aksi').val() === 'catat-pembinaan')`, "true"); } },
  { nama: "pembinaan: pembinaan selesai dapat diubah wali (kunci selesai dibuang)", ubah: (r) => { const n = r.pembinaan.$nis.$id; n[".write"] = ganti(n[".write"], ` && (!data.exists() || data.child('status').val() !== 'selesai' || ${WAKA} || ${KEPALA})`, ""); } },
  { nama: "pembinaan: admin boleh menulis (pembinaan + status)", ubah: (r) => { for (const n of [r.pembinaan.$nis.$id, r.pembinaanStatus.$nis.$ta.$levelId]) n[".write"] = ganti(n[".write"], `((${WAKA} || ${KEPALA}) || (`, `((${WAKA} || ${KEPALA} || ${ADMIN}) || (`); } },
  { nama: "pembinaan: piket boleh menulis (pembinaan + status)", ubah: (r) => { for (const n of [r.pembinaan.$nis.$id, r.pembinaanStatus.$nis.$ta.$levelId]) n[".write"] = ganti(n[".write"], `((${WAKA} || ${KEPALA}) || (`, `((${WAKA} || ${KEPALA} || ${PIKET}) || (`); } },
  { nama: "pembinaan: hapus fisik diizinkan", ubah: (r) => { const n = r.pembinaan.$nis.$id; n[".write"] = ganti(n[".write"], "auth != null && newData.exists() && ((", "auth != null && (("); } },
  { nama: "pembinaan: id bukan {ta}_{levelId} diterima (hanya lapisan id pembinaan; salinan status memaksa id yang sama)", ekuivalen: true, ubah: (r) => { const n = r.pembinaan.$nis.$id; n[".validate"] = ganti(n[".validate"], " && $id === newData.child('ta').val() + '_' + newData.child('levelId').val()", ""); } },
  { nama: "pembinaan: salinan status id tidak dicocokkan (hanya lapisan pembinaan; lapisan status memeriksa id yang sama)", ekuivalen: true, ubah: (r) => { const n = r.pembinaan.$nis.$id; n[".validate"] = ganti(n[".validate"], ` && ${PS_DARI_PB}.child('id').val() === $id`, ""); } },
  { nama: "pembinaan: salinan status tidak dicocokkan (status)", ubah: (r) => { const n = r.pembinaan.$nis.$id; n[".validate"] = ganti(n[".validate"], ` && ${PS_DARI_PB}.child('status').val() === newData.child('status').val()`, ""); } },
  { nama: "pembinaan: salinan status tidak dicocokkan (tanggal)", ubah: (r) => { const n = r.pembinaan.$nis.$id; n[".validate"] = ganti(n[".validate"], ` && ${PS_DARI_PB}.child('tanggal').val() === newData.child('tanggal').val()`, ""); } },
  { nama: "pembinaan: salinan status tidak dicocokkan (levelPoin; hanya lapisan pembinaan, status + immutabilitas menahan)", ekuivalen: true, ubah: (r) => { const n = r.pembinaan.$nis.$id; n[".validate"] = ganti(n[".validate"], ` && ${PS_DARI_PB}.child('levelPoin').val() === newData.child('levelPoin').val()`, ""); } },
  { nama: "pembinaan: ubah: 'oleh' dapat diganti", ubah: (r) => { const n = r.pembinaan.$nis.$id; n[".validate"] = ganti(n[".validate"], "(newData.child('oleh').val() === data.child('oleh').val() && ", "("); } },
  { nama: "pembinaan: ubah: dibuatTs dapat diganti", ubah: (r) => { const n = r.pembinaan.$nis.$id; n[".validate"] = ganti(n[".validate"], "newData.child('dibuatTs').val() === data.child('dibuatTs').val() && newData.child('levelPoin')", "newData.child('levelPoin')"); } },
  { nama: "pembinaan: ubah: levelPoin dapat diganti", ubah: (r) => { const n = r.pembinaan.$nis.$id; n[".validate"] = ganti(n[".validate"], "newData.child('levelPoin').val() === data.child('levelPoin').val() && newData.child('diubahOleh')", "newData.child('diubahOleh')"); } },
  { nama: "pembinaan: ubah: diubahOleh tidak diwajibkan", ubah: (r) => { const n = r.pembinaan.$nis.$id; n[".validate"] = ganti(n[".validate"], "newData.child('diubahOleh').val() === auth.uid && ", ""); } },
  { nama: "pembinaan: ubah: diubahTs tidak diwajibkan now", ubah: (r) => { const n = r.pembinaan.$nis.$id; n[".validate"] = ganti(n[".validate"], " && newData.child('diubahTs').val() === now", ""); } },
  { nama: "pembinaan: buat: 'oleh' dapat dipalsukan", ubah: (r) => { const n = r.pembinaan.$nis.$id; n[".validate"] = ganti(n[".validate"], "(newData.child('oleh').val() === auth.uid && newData.child('dibuatTs')", "(newData.child('dibuatTs')"); } },
  { nama: "pembinaan: buat: dibuatTs bukan waktu server diterima", ubah: (r) => { const n = r.pembinaan.$nis.$id; n[".validate"] = ganti(n[".validate"], "newData.child('dibuatTs').val() === now && root.child('discipline')", "root.child('discipline')"); } },
  { nama: "pembinaan: buat: levelPoin tidak dicocokkan dengan ambang master", ubah: (r) => { const n = r.pembinaan.$nis.$id; n[".validate"] = ganti(n[".validate"], " && root.child('discipline').child('levels').child(newData.child('levelId').val()).child('poin').val() === newData.child('levelPoin').val()", ""); } },
  { nama: "pembinaan: hasil minimal 10 karakter tidak ditegakkan", ubah: (r) => { const n = r.pembinaan.$nis.$id.hasil; n[".validate"] = ganti(n[".validate"], ">= 10", ">= 1"); } },
  { nama: "pembinaan: hasil maksimal 1000 karakter tidak ditegakkan", ubah: (r) => { const n = r.pembinaan.$nis.$id.hasil; n[".validate"] = ganti(n[".validate"], "<= 1000", "<= 1000000"); } },
  { nama: "pembinaan: tindak lanjut maksimal 500 karakter tidak ditegakkan", ubah: (r) => { const n = r.pembinaan.$nis.$id.tindakLanjut; n[".validate"] = ganti(n[".validate"], "<= 500", "<= 500000"); } },
  { nama: "pembinaan: metode bebas", ubah: (r) => { r.pembinaan.$nis.$id.metode[".validate"] = "newData.isString()"; } },
  { nama: "pembinaan: status bebas (hanya lapisan pembinaan; pembinaanStatus menahan karena salinan status wajib sama)", ekuivalen: true, ubah: (r) => { r.pembinaan.$nis.$id.status[".validate"] = "newData.isString()"; } },
  { nama: "pembinaan: status bebas (kedua lapisan: pembinaan dan salinan pembinaanStatus)", ubah: (r) => { r.pembinaan.$nis.$id.status[".validate"] = "newData.isString()"; r.pembinaanStatus.$nis.$ta.$levelId.status[".validate"] = "newData.isString()"; } },
  { nama: "pembinaan: field tak dikenal diterima", ubah: (r) => { r.pembinaan.$nis.$id.$other[".validate"] = true; } },
  { nama: "pembinaan: baca: wali kelas binaan tidak diizinkan membaca", ubah: (r) => { const n = r.pembinaan.$nis; n[".read"] = ganti(n[".read"], ` || ${waliDariT("$nis")}`, ""); } },
  { nama: "pembinaan: baca: siapa pun yang login membaca isi pembinaan", ubah: (r) => { r.pembinaan.$nis[".read"] = "auth != null"; } },
  { nama: "pembinaan: baca: piket membaca seluruh node", ubah: (r) => { r.pembinaan[".read"] = `(${r.pembinaan[".read"]}) || (auth != null && ${PIKET})`; } },
  { nama: "pembinaanStatus: wali boleh menulis status ambang non-wali", ubah: (r) => { const n = r.pembinaanStatus.$nis.$ta.$levelId; n[".write"] = ganti(n[".write"], ` && ${LEVEL_WALI_T("$levelId")}`, ""); } },
  { nama: "pembinaanStatus: kelas binaan tidak diperiksa", ubah: (r) => { const n = r.pembinaanStatus.$nis.$ta.$levelId; n[".write"] = ganti(n[".write"], waliDariT("$nis"), WALI); } },
  { nama: "pembinaanStatus: status tidak dicocokkan dengan pembinaan", ubah: (r) => { const n = r.pembinaanStatus.$nis.$ta.$levelId; n[".validate"] = ganti(n[".validate"], ` && ${PB_DARI_PS}.child('status').val() === newData.child('status').val()`, ""); } },
  { nama: "pembinaanStatus: tanggal tidak dicocokkan dengan pembinaan", ubah: (r) => { const n = r.pembinaanStatus.$nis.$ta.$levelId; n[".validate"] = ganti(n[".validate"], ` && ${PB_DARI_PS}.child('tanggal').val() === newData.child('tanggal').val()`, ""); } },
  { nama: "pembinaanStatus: levelPoin tidak dicocokkan dengan pembinaan", ubah: (r) => { const n = r.pembinaanStatus.$nis.$ta.$levelId; n[".validate"] = ganti(n[".validate"], ` && ${PB_DARI_PS}.child('levelPoin').val() === newData.child('levelPoin').val()`, ""); } },
  { nama: "pembinaanStatus: id tidak dicocokkan", ubah: (r) => { const n = r.pembinaanStatus.$nis.$ta.$levelId; n[".validate"] = ganti(n[".validate"], " && newData.child('id').val() === $ta + '_' + $levelId", ""); } },
  { nama: "pembinaanStatus: hapus fisik diizinkan", ubah: (r) => { const n = r.pembinaanStatus.$nis.$ta.$levelId; n[".write"] = ganti(n[".write"], "auth != null && newData.exists() && ((", "auth != null && (("); } },
  { nama: "pembinaanStatus: field tambahan (isi/nama) diterima", ubah: (r) => { r.pembinaanStatus.$nis.$ta.$levelId.$other[".validate"] = true; } },
  { nama: "pembinaanStatus: baca: ortu membaca status anak lain", ubah: (r) => { r.pembinaanStatus.$nis[".read"] = "auth != null"; } },
  { nama: "pembinaanStatus: baca: seluruh node dapat dibaca ortu", ubah: (r) => { r.pembinaanStatus[".read"] = "auth != null"; } },
  { nama: "usul: buat: kelas binaan tidak diperiksa", ubah: (r) => { const n = r.usulRemisi.$id; n[".write"] = ganti(n[".write"], waliDariT("newData.child('nis').val()"), WALI); } },
  { nama: "usul: buat: log aktivitas tidak wajib", ubah: (r) => { const n = r.usulRemisi.$id; n[".write"] = ganti(n[".write"], ` && ${actOk(2, ["usul-remisi"])}`, ""); } },
  { nama: "usul: batal: usulan wali lain dapat dihapus", ubah: (r) => { const n = r.usulRemisi.$id; n[".write"] = ganti(n[".write"], "!newData.exists() && data.child('oleh').val() === auth.uid && ", "!newData.exists() && "); } },
  { nama: "usul: batal: usulan yang sudah diputuskan dapat dihapus", ubah: (r) => { const n = r.usulRemisi.$id; n[".write"] = ganti(n[".write"], "data.child('oleh').val() === auth.uid && data.child('status').val() === 'menunggu' && ", "data.child('oleh').val() === auth.uid && "); } },
  { nama: "usul: batal: log aktivitas tidak wajib", ubah: (r) => { const n = r.usulRemisi.$id; n[".write"] = ganti(n[".write"], ` && ${actOk(2, ["batal-usul"])}`, ""); } },
  { nama: "usul: keputusan: admin boleh memutuskan", ubah: (r) => { const n = r.usulRemisi.$id; n[".write"] = ganti(n[".write"], `((${WAKA} || ${KEPALA}) && data.exists()`, `((${WAKA} || ${KEPALA} || ${ADMIN}) && data.exists()`); } },
  { nama: "usul: keputusan: dapat diputuskan berkali-kali (data.status menunggu tidak diwajibkan)", ubah: (r) => { const n = r.usulRemisi.$id; n[".write"] = ganti(n[".write"], " && data.child('status').val() === 'menunggu' && newData.child('status').val() !== 'menunggu'", ""); } },
  { nama: "usul: buat: nama tidak dicocokkan dengan master", ubah: (r) => { const n = r.usulRemisi.$id; n[".validate"] = ganti(n[".validate"], ` && ${MASTER_REMISI_T}.child('nama').val() === newData.child('nama').val()`, ""); } },
  { nama: "usul: buat: poin tidak dicocokkan dengan master", ubah: (r) => { const n = r.usulRemisi.$id; n[".validate"] = ganti(n[".validate"], ` && ${MASTER_REMISI_T}.child('poin').val() === newData.child('poin').val()`, ""); } },
  { nama: "usul: buat: remisi nonaktif diterima", ubah: (r) => { const n = r.usulRemisi.$id; n[".validate"] = ganti(n[".validate"], `${MASTER_REMISI_T}.child('aktif').val() === true && `, ""); } },
  { nama: "usul: buat: oleh dapat dipalsukan", ubah: (r) => { r.usulRemisi.$id.oleh[".validate"] = "true"; } },
  { nama: "usul: buat: ts bukan waktu server diterima", ubah: (r) => { r.usulRemisi.$id.ts[".validate"] = "true"; } },
  { nama: "usul: alasan minimal 10 karakter tidak ditegakkan", ubah: (r) => { const n = r.usulRemisi.$id.alasan; n[".validate"] = ganti(n[".validate"], ">= 10", ">= 1"); } },
  { nama: "usul: alasan maksimal 300 karakter tidak ditegakkan", ubah: (r) => { const n = r.usulRemisi.$id.alasan; n[".validate"] = ganti(n[".validate"], "<= 300", "<= 300000"); } },
  { nama: "usul: field tak dikenal diterima", ubah: (r) => { r.usulRemisi.$id.$other[".validate"] = true; } },
  { nama: "usul: nis usulan dapat diubah saat keputusan", ubah: (r) => { const n = r.usulRemisi.$id.nis; n[".validate"] = ganti(n[".validate"], " && (!data.exists() || newData.val() === data.val())", ""); } },
  { nama: "usul: poin usulan dapat diubah saat keputusan", ubah: (r) => { const n = r.usulRemisi.$id.poin; n[".validate"] = ganti(n[".validate"], " && (!data.exists() || newData.val() === data.val())", ""); } },
  { nama: "usul: alasan usulan dapat diubah saat keputusan", ubah: (r) => { const n = r.usulRemisi.$id.alasan; n[".validate"] = ganti(n[".validate"], " && (!data.exists() || newData.val() === data.val())", ""); } },
  { nama: "usul: keputusan: diputuskanOleh dapat dipalsukan", ubah: (r) => { r.usulRemisi.$id.diputuskanOleh[".validate"] = "true"; const n = r.usulRemisi.$id; n[".validate"] = ganti(n[".validate"], "newData.child('diputuskanOleh').val() === auth.uid && ", ""); } },
  { nama: "usul: keputusan: setuju dengan recId bukan id usulan (kedua lapisan)", ubah: (r) => { const n = r.usulRemisi.$id; n[".validate"] = ganti(n[".validate"], "newData.child('recId').val() === $id && ", ""); const k = r.discipline.records.$nis.$recId; k[".validate"] = ganti(k[".validate"], `${USUL_BARU_T}.child('recId').val() === $recId && `, ""); } },
  { nama: "usul: keputusan: setuju tanpa record remisi usul-wali", ubah: (r) => { const n = r.usulRemisi.$id; n[".validate"] = ganti(n[".validate"], ` && ${REC_USUL_T}.child('sumber').val() === 'usul-wali' && ${REC_USUL_T}.child('jenis').val() === 'remisi'`, ""); } },
  { nama: "usul: keputusan: tolak tanpa alasan", ubah: (r) => { const n = r.usulRemisi.$id; n[".validate"] = ganti(n[".validate"], "(newData.child('alasanKeputusan').exists() && !newData.child('recId').exists())", "(!newData.child('recId').exists())"); } },
  { nama: "usul: keputusan: tolak dengan recId", ubah: (r) => { const n = r.usulRemisi.$id; n[".validate"] = ganti(n[".validate"], "(newData.child('alasanKeputusan').exists() && !newData.child('recId').exists())", "(newData.child('alasanKeputusan').exists())"); } },
  { nama: "usul: baca: wali meng-query usulan wali lain", ubah: (r) => { r.usulRemisi[".read"] = ganti(r.usulRemisi[".read"], " && query.equalTo === auth.uid", ""); } },
  { nama: "usul: baca: usulan wali lain dapat dibaca per id", ubah: (r) => { r.usulRemisi.$id[".read"] = ganti(r.usulRemisi.$id[".read"], " && data.child('oleh').val() === auth.uid", ""); } },
  { nama: "usul: baca: seluruh node dapat dibaca piket", ubah: (r) => { r.usulRemisi[".read"] = `(${r.usulRemisi[".read"]}) || (auth != null && ${PIKET})`; } },
  { nama: "usul: record usul-wali tanpa usulan sah (validasi sumber dibuang)", ubah: (r) => { const n = r.discipline.records.$nis.$recId; n[".validate"] = ganti(n[".validate"], `(newData.child('sumber').val() !== 'usul-wali' || data.exists() || (${USUL_SAH_T})) && `, ""); } },
  { nama: "usul: record usul-wali: usulan harus berstatus menunggu SEBELUM update", ubah: (r) => { const n = r.discipline.records.$nis.$recId; n[".validate"] = ganti(n[".validate"], "root.child('usulRemisi').child($recId).child('status').val() === 'menunggu' && ", ""); } },
  { nama: "usul: record usul-wali: usulan harus disetujui pada update yang sama (hanya lapisan record; recId===id + diputuskanOleh hanya sah pada status disetujui)", ekuivalen: true, ubah: (r) => { const n = r.discipline.records.$nis.$recId; n[".validate"] = ganti(n[".validate"], `${USUL_BARU_T}.child('status').val() === 'disetujui' && `, ""); } },
  { nama: "usul: record usul-wali: poin tidak dicocokkan dengan usulan", ubah: (r) => { const n = r.discipline.records.$nis.$recId; n[".validate"] = ganti(n[".validate"], ` && newData.child('poin').val() === ${USUL_BARU_T}.child('poin').val()`, ""); } },
  { nama: "usul: record usul-wali: nama tidak dicocokkan dengan usulan", ubah: (r) => { const n = r.discipline.records.$nis.$recId; n[".validate"] = ganti(n[".validate"], ` && newData.child('nama').val() === ${USUL_BARU_T}.child('nama').val()`, ""); } },
  { nama: "usul: record usul-wali: refId tidak dicocokkan dengan remisi usulan", ubah: (r) => { const n = r.discipline.records.$nis.$recId; n[".validate"] = ganti(n[".validate"], ` && newData.child('refId').val() === ${USUL_BARU_T}.child('remId').val()`, ""); } },
  { nama: "usul: record usul-wali: jenis harus remisi (hanya lapisan record; usulan memeriksa jenis record yang sama)", ekuivalen: true, ubah: (r) => { const n = r.discipline.records.$nis.$recId; n[".validate"] = ganti(n[".validate"], " && newData.child('jenis').val() === 'remisi' && newData.child('refId')", " && newData.child('refId')"); } },
  { nama: "usul: record usul-wali: siswa harus sama dengan usulan (hanya lapisan record; usulan mencari record di siswa yang sama)", ekuivalen: true, ubah: (r) => { const n = r.discipline.records.$nis.$recId; n[".validate"] = ganti(n[".validate"], ` && ${USUL_BARU_T}.child('nis').val() === $nis`, ""); } },
  { nama: "ambang: penanggung jawab bebas", ubah: (r) => { r.discipline.levels.$lvlId.penanggungJawab[".validate"] = "newData.isString()"; } },
  // ---------------------------------------------------------------- v2.3.1: piket boleh memberi A per jam HANYA hari ini
  // Catatan lapisan: set A hari ini ditegakkan di sel (write) DAN absenInfo (validate hariKe); mutan yang membuka celah merusak keduanya.
  { nama: "alfa-jam: piket mengisi A bukan hari ini (hariKe tidak diperiksa di SEMUA lapisan: sel + absenInfo + salinan)", ubah: (r) => {
    const c = r.lessons.$tgl.$kelas.absen.$nis.$jam; c[".write"] = ganti(c[".write"], ` && ${HARI_INI_T(`${INFO_BARU_T}.child('hariKe')`)})`, ")");
    r.lessons.$tgl.$kelas.absenInfo.$nis.$jam.hariKe[".validate"] = "newData.isNumber()";
    const k = r.lessonsByStudent.$nis.$tgl.$jam; k[".write"] = ganti(k[".write"], ` && ${HARI_INI_T(`${INFO_S_BARU_T}.child('hariKe')`)})`, ")");
  } },
  { nama: "alfa-jam: piket mengisi A tanpa info (hariKe tak terbukti; exists() dan HARI_INI(info.hariKe) di sel, keduanya saling menutup)", ubah: (r) => { const c = r.lessons.$tgl.$kelas.absen.$nis.$jam; c[".write"] = ganti(c[".write"], ` && ${INFO_BARU_T}.exists() && ${HARI_INI_T(`${INFO_BARU_T}.child('hariKe')`)})`, ")"); } },
  { nama: "alfa-jam: piket mengisi A tanpa penanda 'piket' (sel + absenInfo.write)", ubah: (r) => {
    const c = r.lessons.$tgl.$kelas.absen.$nis.$jam; c[".write"] = ganti(c[".write"], `${actOk(6, ["alfa-jam"])} && ${MARK_BARU_T}.val() === 'piket' && `, `${actOk(6, ["alfa-jam"])} && `);
    const m = r.lessons.$tgl.$kelas.absenInfo.$nis.$jam; m[".write"] = ganti(m[".write"], `${MARK_BARU_T}.val() === 'piket' && ${CELL_LAMA_T}`, `${CELL_LAMA_T}`);
  } },
  { nama: "alfa-jam: piket mengisi A tanpa log aktivitas", ubah: (r) => { const c = r.lessons.$tgl.$kelas.absen.$nis.$jam; c[".write"] = ganti(c[".write"], `(newData.val() === 'A' && ${actOk(6, ["alfa-jam"])} && `, "(newData.val() === 'A' && "); } },
  { nama: "alfa-jam: piket mengisi A dengan log aksi apa pun", ubah: (r) => { const c = r.lessons.$tgl.$kelas.absen.$nis.$jam; c[".write"] = ganti(c[".write"], `(newData.val() === 'A' && ${actOk(6, ["alfa-jam"])}`, `(newData.val() === 'A' && ${ACT(6)}.child('ts').val() === now && ${ENT(6)}.child('ts').val() === now && ${ENT(6)}.child('uid').val() === auth.uid`); } },
  { nama: "alfa-jam: piket mengubah/menghapus A milik waka (penanda lama tidak diperiksa)", ubah: (r) => { const c = r.lessons.$tgl.$kelas.absen.$nis.$jam; c[".write"] = ganti(c[".write"], `(data.val() === 'A' && ${MARK_LAMA_T}.val() === 'piket' && `, "(data.val() === 'A' && "); } },
  { nama: "alfa-jam: piket mengubah/menghapus A piket yang diisi hari sebelumnya (hariKe tersimpan tidak diperiksa)", ubah: (r) => { const c = r.lessons.$tgl.$kelas.absen.$nis.$jam; c[".write"] = ganti(c[".write"], ` && ${HARI_INI_T(`${INFO_LAMA_T}.child('hariKe')`)} && (`, " && ("); } },
  { nama: "alfa-jam: piket menghapus A tanpa log aksi 'alfa-jam'", ubah: (r) => { const c = r.lessons.$tgl.$kelas.absen.$nis.$jam; c[".write"] = ganti(c[".write"], `(!newData.exists() && ${actOk(6, ["alfa-jam"])} && !${MARK_BARU_T}.exists())`, `(!newData.exists() && !${MARK_BARU_T}.exists())`); } },
  { nama: "alfa-jam: piket menghapus A tanpa menghapus penanda", ubah: (r) => { const c = r.lessons.$tgl.$kelas.absen.$nis.$jam; c[".write"] = ganti(c[".write"], ` && !${MARK_BARU_T}.exists())`, ")"); } },
  { nama: "alfa-jam: piket mengganti A miliknya menjadi S/I/D tanpa izinMeta", ubah: (r) => { const c = r.lessons.$tgl.$kelas.absen.$nis.$jam; c[".write"] = ganti(c[".write"], `${MARK_LAMA_T}.val() === 'piket' && ${HARI_INI_T(`${INFO_LAMA_T}.child('hariKe')`)} && (`, `${MARK_LAMA_T}.val() === 'piket' && ${HARI_INI_T(`${INFO_LAMA_T}.child('hariKe')`)} && (true || `); } },
  { nama: "alfa-jam: piket mengisi A tanpa log lewat jalur ganti S->A (log 'izin-jam' diterima untuk A)", ubah: (r) => { const c = r.lessons.$tgl.$kelas.absen.$nis.$jam; c[".write"] = ganti(c[".write"], `(newData.val() === 'A' && ${actOk(6, ["alfa-jam"])}`, `(newData.val() === 'A' && ${actOk(6, ["alfa-jam", "izin-jam"])}`); } },
  { nama: "alfa-jam: peran lain (wali) dapat mengisi A (sel + penanda + info + salinan)", ubah: (r) => {
    const sw = (n) => { n[".write"] = ganti(n[".write"], `auth != null && ${PIKET} && (`, `auth != null && (${PIKET} || ${WALI}) && (`); };
    const sel = r.lessons.$tgl.$kelas.absen.$nis.$jam; sel[".validate"] = ganti(sel[".validate"], ` && (${PIKET} || ${MARK_BARU_T}.val() !== 'piket')`, ""); // validate sel: penanda 'piket' hanya dari peran piket
    sw(r.lessons.$tgl.$kelas.absen.$nis.$jam); sw(r.lessons.$tgl.$kelas.absenOleh.$nis.$jam); sw(r.lessons.$tgl.$kelas.absenInfo.$nis.$jam);
    const k = r.lessonsByStudent.$nis.$tgl.$jam; k[".write"] = ganti(k[".write"], `(${PIKET} && (`, `((${PIKET} || ${WALI}) && (`);
  } },
  { nama: "alfa-jam: sel per jam diterima untuk siswa berketerangan harian (sel)", ubah: (r) => { const c = r.lessons.$tgl.$kelas.absen.$nis.$jam; c[".validate"] = ganti(c[".validate"], ` && !${KET6_T}.exists()`, ""); } },
  { nama: "alfa-jam: salinan per jam diterima untuk siswa berketerangan harian (lessonsByStudent)", ubah: (r) => { const k = r.lessonsByStudent.$nis.$tgl.$jam; k[".validate"] = ganti(k[".validate"], ` && !${KET4_T}.exists()`, ""); } },
  { nama: "alfa-jam: penanda 'piket' basi dapat tertinggal pada sel waka", ubah: (r) => { const c = r.lessons.$tgl.$kelas.absen.$nis.$jam; c[".validate"] = ganti(c[".validate"], ` && (${PIKET} || ${MARK_BARU_T}.val() !== 'piket')`, ""); } },
  { nama: "alfa-jam: piket menulis penanda 'waka'", ubah: (r) => { const m = r.lessons.$tgl.$kelas.absenOleh.$nis.$jam; m[".write"] = ganti(m[".write"], "(newData.val() === 'piket' && ", "(true && "); } },
  { nama: "alfa-jam: piket menulis penanda tanpa mengubah sel (mencuri A milik waka)", ubah: (r) => { const m = r.lessons.$tgl.$kelas.absenOleh.$nis.$jam; m[".write"] = ganti(m[".write"], ` && ${CELL_BARU_T}.val() !== ${CELL_LAMA_T}.val()`, ""); } },
  { nama: "alfa-jam: piket menghapus penanda tanpa mengosongkan sel", ubah: (r) => { const m = r.lessons.$tgl.$kelas.absenOleh.$nis.$jam; m[".write"] = ganti(m[".write"], `: !${CELL_BARU_T}.exists())`, ": true)"); } },
  { nama: "alfa-jam: penanda bernilai liar diterima", ubah: (r) => { const m = r.lessons.$tgl.$kelas.absenOleh.$nis.$jam; m[".validate"] = ganti(m[".validate"], "(newData.val() === 'piket' || newData.val() === 'waka')", "newData.isString()"); } },
  { nama: "alfa-jam: penanda tanpa sel diterima", ubah: (r) => { const m = r.lessons.$tgl.$kelas.absenOleh.$nis.$jam; m[".validate"] = ganti(m[".validate"], ` && ${CELL_BARU_T}.exists()`, ""); } },
  { nama: "alfa-jam: piket menulis info pada sel yang bukan A miliknya", ubah: (r) => { const m = r.lessons.$tgl.$kelas.absenInfo.$nis.$jam; m[".write"] = ganti(m[".write"], `(${CELL_BARU_T}.val() === 'A' && ${MARK_BARU_T}.val() === 'piket' && ${CELL_LAMA_T}.val() !== 'A')`, "true"); } },
  { nama: "alfa-jam: info ts bukan waktu server diterima", ubah: (r) => { r.lessons.$tgl.$kelas.absenInfo.$nis.$jam.ts[".validate"] = "newData.isNumber()"; } },
  { nama: "alfa-jam: info petugas tanpa batas panjang", ubah: (r) => { r.lessons.$tgl.$kelas.absenInfo.$nis.$jam.petugas[".validate"] = "newData.isString()"; } },
  { nama: "alfa-jam: info tanpa hariKe diterima (hasChildren + pemeriksaan hariKe di sel)", ubah: (r) => {
    const m = r.lessons.$tgl.$kelas.absenInfo.$nis.$jam; m[".validate"] = ganti(m[".validate"], "['petugas', 'ts', 'hariKe']", "['petugas', 'ts']");
    const c = r.lessons.$tgl.$kelas.absen.$nis.$jam; c[".write"] = ganti(c[".write"], ` && ${HARI_INI_T(`${INFO_BARU_T}.child('hariKe')`)})`, ")");
  } },
  { nama: "alfa-jam: info field asing diterima", ubah: (r) => { r.lessons.$tgl.$kelas.absenInfo.$nis.$jam.$other[".validate"] = true; } },
  // salinan lessonsByStudent (kunci kelas dari siswaKelas)
  { nama: "alfa-jam: salinan A tanpa penanda 'piket' (lessonsByStudent)", ubah: (r) => { const k = r.lessonsByStudent.$nis.$tgl.$jam; k[".write"] = ganti(k[".write"], `${actOk(4, ["alfa-jam"])} && ${MARK_S_BARU_T}.val() === 'piket' && `, `${actOk(4, ["alfa-jam"])} && `); } },
  { nama: "alfa-jam: salinan A bukan hari ini (hariKe info tidak diperiksa, lessonsByStudent)", ubah: (r) => { const k = r.lessonsByStudent.$nis.$tgl.$jam; k[".write"] = ganti(k[".write"], ` && ${HARI_INI_T(`${INFO_S_BARU_T}.child('hariKe')`)})`, ")"); } },
  { nama: "alfa-jam: salinan A tanpa log aktivitas (lessonsByStudent)", ubah: (r) => { const k = r.lessonsByStudent.$nis.$tgl.$jam; k[".write"] = ganti(k[".write"], `(newData.child('k').val() === 'A' && ${actOk(4, ["alfa-jam"])} && `, "(newData.child('k').val() === 'A' && "); } },
  { nama: "alfa-jam: piket mengubah/menghapus salinan A milik waka (penanda lama tidak diperiksa)", ubah: (r) => { const k = r.lessonsByStudent.$nis.$tgl.$jam; k[".write"] = ganti(k[".write"], `(data.child('k').val() === 'A' && ${MARK_S_LAMA_T}.val() === 'piket' && `, "(data.child('k').val() === 'A' && "); } },
  { nama: "alfa-jam: piket mengubah/menghapus salinan A piket kemarin (hariKe tersimpan tidak diperiksa)", ubah: (r) => { const k = r.lessonsByStudent.$nis.$tgl.$jam; k[".write"] = ganti(k[".write"], ` && ${HARI_INI_T(`${INFO_S_LAMA_T}.child('hariKe')`)} && (`, " && ("); } },
  // ---- v2.4: jam manual diketik piket (masukDetik / mundur) dan KUNCI TAP PERTAMA alat
  { nama: "manual: jam masukDetik tidak diwajibkan (seluruh pemeriksaan jam manual dibuang)", ubah: (r) => { const n = r.manualTap.$tgl.$nis; const a = n[".validate"].indexOf(" && (!newData.child('masuk').exists() ? (!newData.child('masukDetik')"); const b = n[".validate"].indexOf(" && (!(" + PIKET + ") ||", a); if (a < 0 || b < 0) throw new Error("pola tidak ditemukan"); n[".validate"] = n[".validate"].slice(0, a) + n[".validate"].slice(b); } },
  { nama: "manual: masukDetik tidak dicocokkan dengan JAM pada masuk", ubah: (r) => { const n = r.manualTap.$tgl.$nis; n[".validate"] = hapusSemua(n[".validate"], /\(newData\.child\('masuk'\)\.val\(\)\.substring\(0, 2\) !== '\d\d' \|\| \(newData\.child\('masukDetik'\)\.val\(\) >= \d+ && newData\.child\('masukDetik'\)\.val\(\) < \d+\)\) && /g); } },
  { nama: "manual: masukDetik tidak dicocokkan dengan MENIT pada masuk", ubah: (r) => { const n = r.manualTap.$tgl.$nis; n[".validate"] = hapusSemua(n[".validate"], /\(newData\.child\('masuk'\)\.val\(\)\.substring\(3, 5\) !== '\d\d' \|\| \(newData\.child\('masukDetik'\)\.val\(\) % 3600 >= \d+ && newData\.child\('masukDetik'\)\.val\(\) % 3600 < \d+\)\) && /g); } },
  { nama: "manual: masukDetik tidak dicocokkan dengan DETIK pada masuk", ubah: (r) => { const n = r.manualTap.$tgl.$nis; n[".validate"] = hapusSemua(n[".validate"], /\(newData\.child\('masuk'\)\.val\(\)\.substring\(6, 8\) !== '\d\d' \|\| newData\.child\('masukDetik'\)\.val\(\) % 60 === \d+\) && /g); } },
  { nama: "manual: jam masuk boleh melewati waktu dicatat (batas masa depan dibuang)", ubah: (r) => { const n = r.manualTap.$tgl.$nis; n[".validate"] = ganti(n[".validate"], "newData.child('masukDetik').val() <= (((now + 25200000) % 86400000) / 1000) + 60 && ", ""); } },
  { nama: "manual: mundur TIDAK wajib bila selisih > 15 menit", ubah: (r) => { const n = r.manualTap.$tgl.$nis; n[".validate"] = ganti(n[".validate"], "> 960 ? newData.child('mundur').val() === true :", "> 960 ? true :"); } },
  { nama: "manual: mundur boleh dipasang walau selisih < 14 menit", ubah: (r) => { const n = r.manualTap.$tgl.$nis; n[".validate"] = ganti(n[".validate"], "< 840 ? !newData.child('mundur').exists() : true", "< 840 ? true : true"); } },
  { nama: "manual: mundur TIDAK wajib pada tanggal lampau", ubah: (r) => { const n = r.manualTap.$tgl.$nis; n[".validate"] = ganti(n[".validate"], " : newData.child('mundur').val() === true)))) && (!(" + PIKET + ")", " : true)))) && (!(" + PIKET + ")"); } },
  { nama: "manual: waka ikut dibatasi aturan jam (pengecualian koreksi waka dibuang)", ubah: (r) => { const n = r.manualTap.$tgl.$nis; n[".validate"] = ganti(n[".validate"], "&& (" + WAKA + " || (newData.child('hariKe').isNumber()", "&& (false || (newData.child('hariKe').isNumber()"); } },
  { nama: "manual: mundur boleh bernilai false", ubah: (r) => { r.manualTap.$tgl.$nis.mundur[".validate"] = "newData.isBoolean()"; } },
  { nama: "manual: masukDetik/mundur boleh ada tanpa masuk (entri hanya-pulang)", ubah: (r) => { const n = r.manualTap.$tgl.$nis; n[".validate"] = ganti(n[".validate"], "(!newData.child('masukDetik').exists() && !newData.child('mundur').exists())", "true"); } },
  { nama: "manual: masukDetik wajib berupa angka (isNumber dibuang)", ubah: (r) => { const n = r.manualTap.$tgl.$nis; n[".validate"] = ganti(n[".validate"], "newData.child('masukDetik').isNumber() && ", ""); } },
  { nama: "manual: masukDetik tanpa batas rentang 0..86399 (hanya lapisan ini; pencocokan jam/menit/detik menahan)", ekuivalen: true, ubah: (r) => { const n = r.manualTap.$tgl.$nis; n[".validate"] = ganti(n[".validate"], " && newData.child('masukDetik').val() >= 0 && newData.child('masukDetik').val() < 86400", ""); } },
  { nama: "manual: masukDetik boleh pecahan (hanya lapisan bilangan bulat; pencocokan detik menahan)", ekuivalen: true, ubah: (r) => { const n = r.manualTap.$tgl.$nis; n[".validate"] = ganti(n[".validate"], " && newData.child('masukDetik').val() % 1 === 0", ""); } },
  { nama: "alat-kunci: attendance/masuk dapat ditimpa tap kedua", ubah: (r) => { const n = r.attendance.$nis.$date.masuk; n[".write"] = ganti(n[".write"], " && (!data.exists() || data.val() === newData.val())", ""); } },
  { nama: "alat-kunci: attendance/pulang dapat ditimpa tap kedua", ubah: (r) => { const n = r.attendance.$nis.$date.pulang; n[".write"] = ganti(n[".write"], " && (!data.exists() || data.val() === newData.val())", ""); } },
  { nama: "alat-kunci: attendance/status dapat ditimpa tap kedua", ubah: (r) => { const n = r.attendance.$nis.$date.status; n[".write"] = ganti(n[".write"], " && (!data.exists() || data.val() === newData.val())", ""); } },
  { nama: "alat-kunci: log _M/_P dapat ditimpa tap kedua (seluruh pemeriksaan dibuang)", ubah: (r) => { const n = r.log.$date.$key; const a = n[".write"].indexOf(" && (!data.exists() || (data.child('jam')"); if (a < 0) throw new Error("pola tidak ditemukan"); n[".write"] = n[".write"].slice(0, a) + ")))"; } },
  { nama: "alat-kunci: log retry tidak mencocokkan JAM", ubah: (r) => { const n = r.log.$date.$key; n[".write"] = ganti(n[".write"], "data.child('jam').val() === newData.child('jam').val() && ", ""); } },
  { nama: "alat-kunci: log retry tidak mencocokkan NIS", ubah: (r) => { const n = r.log.$date.$key; n[".write"] = ganti(n[".write"], "data.child('nis').val() === newData.child('nis').val() && ", ""); } },
  { nama: "alat-kunci: log retry tidak mencocokkan STATUS", ubah: (r) => { const n = r.log.$date.$key; n[".write"] = ganti(n[".write"], " && data.child('status').val() === newData.child('status').val()", ""); } },
  { nama: "admin boleh tulis validasi Alfa",ubah: (r) => { const n = r.validasi.$tgl.$nis; n[".write"] = `(${n[".write"]}) || (auth != null && ${ADMIN})`; } },
];

/** Hapus semua kemunculan pola dari teks; melempar bila tidak ada yang cocok. */
function hapusSemua(teks, re) {
  const hasil = teks.replace(re, "");
  if (hasil === teks) throw new Error(`mutasi tidak menemukan pola: ${re}`);
  return hasil;
}

function ganti(teks, dari, ke) {
  if (!teks.includes(dari)) throw new Error(`mutasi tidak menemukan teks target: ${dari.slice(0, 60)}`);
  return teks.replace(dari, ke);
}

const dir = mkdtempSync(join(tmpdir(), "mutasi-"));
let selamat = 0;
const tidakTerverifikasi = [];
let dijalankan = 0, dijalankanEkuivalen = 0;
// Kelompok mutasi (iterasi cepat): `npm run test:mutation --grup=manual` (juga MUTASI_GRUP=manual atau argumen --grup=manual).
// Kelompok: manual | piket | saran | kalender | wali | dasar (sisanya) | semua. Mutasi penuh (~120 kasus) memakan +-90 menit dan dapat membuat emulator macet.
const GRUP = (nama) => /^alfa-jam/.test(nama) ? "perjam" : /^alat-kunci/.test(nama) ? "alat" : /^(pembinaan|usul|ambang: penanggung)/.test(nama) ? "pembinaan" : /^wali/.test(nama) ? "wali" : /^kalender|^ambang:|^sistem:|^profiles:/.test(nama) ? "kalender" : /^manual:|^saran:|^autoMap:/.test(nama) ? (/^manual:/.test(nama) ? "manual" : "saran") : /izinMeta|piket|log:|activity|manual|kunci akun|sistem|backup/i.test(nama) ? "piket" : "dasar";
const grupDipilih = (process.argv.find((a) => a.startsWith("--grup="))?.slice(7) ?? process.env.MUTASI_GRUP ?? process.env.npm_config_grup ?? "semua").toLowerCase();
if (grupDipilih !== "semua" && !["manual", "piket", "saran", "kalender", "wali", "pembinaan", "perjam", "alat", "dasar"].includes(grupDipilih)) throw new Error(`grup tidak dikenal: ${grupDipilih}`);
const hanya = process.env.MUTASI_HANYA ? new Set(process.env.MUTASI_HANYA.split(",").map(Number)) : null;
// ---- Pengelola emulator: mutasi memakai emulator SENDIRI (bukan firebase emulators:exec) supaya dapat direstart ----
// Penyebab macet sebelumnya: satu emulator Java melayani ratusan run suite; memorinya menumpuk (+-3 GB) hingga tiap suite timeout.
//  * restart tiap MUTASI_RESTART_N mutan (bawaan 15) dan tiap pindah grup;
//  * namespace uji dihapus setelah tiap mutan;
//  * batas waktu per mutan MUTASI_TIMEOUT_MS (bawaan 90 dtk) -> TIDAK TERVERIFIKASI, emulator direstart, mutan lain lanjut;
//  * di akhir, mutan TIDAK TERVERIFIKASI diulang otomatis (satu kali) pada emulator baru.
const DB_URL = process.env.DB_URL ?? "http://127.0.0.1:9000";
const AUTH_URL = process.env.AUTH_URL ?? "http://127.0.0.1:9099";
const RESTART_N = Number(process.env.MUTASI_RESTART_N ?? 15);
const TIMEOUT_MS = Number(process.env.MUTASI_TIMEOUT_MS ?? 90000);
const kelola = !process.env.FIREBASE_DATABASE_EMULATOR_HOST && !process.env.MUTASI_KERING; // di dalam emulators:exec: perilaku lama (tanpa restart)
const tidur = (ms) => new Promise((s) => setTimeout(s, ms));
let emu = null, restartKe = 0;

const hidup = async (url) => { try { await fetch(url, { signal: AbortSignal.timeout(1500) }); return true; } catch { return false; } }; // respons HTTP apa pun = server hidup
function bunuhPohon(pid) { try { execFileSync("taskkill", ["/PID", String(pid), "/T", "/F"], { stdio: "ignore" }); } catch { /* sudah mati */ } }
function bunuhPort(port) {
  try {
    const out = execFileSync("netstat", ["-ano", "-p", "TCP"], { encoding: "utf8" });
    const pid = out.split(/\r?\n/).find((l) => l.includes(`:${port} `) && /LISTENING/i.test(l))?.trim().split(/\s+/).pop();
    if (pid && pid !== "0") bunuhPohon(pid);
  } catch { /* tidak ada pemilik */ }
}
async function matikanEmulator() {
  if (!emu) return;
  bunuhPohon(emu.pid);
  emu = null;
  for (let k = 0; k < 20; k++) {
    if (!(await hidup(`${DB_URL}/`)) && !(await hidup(`${AUTH_URL}/`))) return;
    if (k === 5) { bunuhPort(9000); bunuhPort(9099); }
    await tidur(1000);
  }
  throw new Error("emulator tidak mau berhenti (port 9000/9099 masih dipakai)");
}
async function mulaiEmulator(alasan) {
  if (!kelola) return;
  await matikanEmulator();
  emu = spawn("npx firebase-tools emulators:start --only auth,database --project demo-presensi", { shell: true, stdio: "ignore", windowsHide: true });
  for (let k = 0; k < 90; k++) {
    if (await hidup(`${DB_URL}/`) && await hidup(`${AUTH_URL}/`)) { restartKe++; console.log(`  ↻ emulator ${restartKe === 1 ? "dimulai" : "direstart"} (${alasan})`); return; }
    await tidur(1000);
  }
  throw new Error("emulator tidak siap dalam 90 detik");
}
process.on("exit", () => { if (emu) bunuhPohon(emu.pid); });

/** Hapus data namespace uji supaya memori emulator tidak menumpuk. */
async function bersihkanNs(ns) {
  if (!ns) return;
  try { await fetch(`${DB_URL}/.json?ns=${ns}`, { method: "DELETE", headers: { Authorization: "Bearer owner" }, signal: AbortSignal.timeout(5000) }); } catch { /* abaikan */ }
}

/** Jalankan suite rules.test dengan rules tertentu; kembalikan hasil + pemeriksaan hash rules yang dimuat emulator. */
async function jalankanSuite(rules, nama) {
  const file = join(dir, `${nama}.json`);
  const teks = JSON.stringify(rules);
  writeFileSync(file, teks);
  const r = spawnSync(process.execPath, ["tests/rules.test.mjs"], { env: { ...process.env, RULES_FILE: file }, encoding: "utf8", timeout: TIMEOUT_MS, killSignal: "SIGKILL", maxBuffer: 64 * 1024 * 1024 });
  const stdout = r.stdout ?? "", stderr = r.stderr ?? "";
  await bersihkanNs(/Namespace uji: (rules-[0-9a-f]+)/.exec(stdout)?.[1]);
  const gagal = stdout.split("\n").filter((l) => l.startsWith("  ✗")).map((l) => l.replace("  ✗ ", ""));
  const tertangkap = r.status === 1 && gagal.length > 0;
  const waktuHabis = r.error?.code === "ETIMEDOUT" || r.signal === "SIGKILL";
  const infra = !tertangkap && (waktuHabis || (r.status !== 0 && gagal.length === 0 && /fetch failed|Timeout|ECONNREFUSED|ECONNRESET/i.test(`${stderr}${stdout.slice(-400)}`)));
  const hDiuji = hashRules(teks);
  const hMuat = /RULES_SHA256=([0-9a-f]{64})/.exec(stdout)?.[1];
  return { r: { status: r.status, stderr }, gagal, tertangkap, infra, hashOk: hMuat === hDiuji, hDiuji, hMuat };
}

/**
 * MUTAN KONTROL (canary): dijalankan SEBELUM mutan sungguhan. Rules yang jelas-jelas bocor HARUS tertangkap suite. Bila tidak,
 * lingkungan uji rusak (mis. emulator sisa memakai rules lama), seluruh hasil run tidak valid, dan run dibatalkan.
 */
const CANARY = [
  { nama: "CANARY: semua boleh baca root", ubah: (r) => { r[".read"] = true; } },
  { nama: "CANARY: semua boleh tulis root", ubah: (r) => { r[".write"] = true; } },
];
const mulaiWaktu = Date.now();
if (!process.env.MUTASI_KERING) {
  await mulaiEmulator("awal");
  for (const [i, c] of CANARY.entries()) {
    const rules = JSON.parse(JSON.stringify(buildRules()));
    if (!process.env.MUTASI_CANARY_NETRAL) c.ubah(rules.rules); // MUTASI_CANARY_NETRAL=1: hanya untuk membuktikan bahwa run DIBATALKAN bila canary tidak tertangkap
    const x = await jalankanSuite(rules, `canary${i}`);
    if (!(x.tertangkap && x.hashOk)) {
      console.error(`\n✗✗ ${c.nama} TIDAK TERTANGKAP${x.hashOk ? "" : " (hash rules di emulator tidak cocok)"}: RUN TIDAK VALID.`);
      console.error("   Seluruh hasil mutasi pada run ini TIDAK VALID dan tidak ditampilkan. Periksa emulator sisa (taskkill /F /IM java.exe), lalu ulangi.");
      await matikanEmulator();
      process.exit(3);
    }
    console.log(`✓ ${c.nama}: tertangkap (${x.gagal.length} uji gagal), hash rules ${x.hDiuji.slice(0, 12)}… cocok`);
  }
}
console.log(`Uji mutasi (${mutasi.length} mutasi)\n`);

let sejakRestart = 0, grupSebelumnya = null;
/** Jalankan satu mutan. Kembalikan "tertangkap" | "ekuivalen" | "lolos" | "infra". */
async function jalankanMutan(i, m, rules, { ulang = false } = {}) {
  const { r, gagal, tertangkap, infra, hashOk, hDiuji, hMuat } = await jalankanSuite(rules, `m${i}`);
  sejakRestart++;
  // suite yang MATI (emulator kelebihan beban/timeout) bukan bukti mutasi lolos maupun tertangkap: laporkan terpisah agar tidak salah tafsir
  if (infra) { console.log(`? TIDAK TERVERIFIKASI${ulang ? " (setelah diulang)" : ""} (emulator macet/lewat ${TIMEOUT_MS / 1000} dtk; MUTASI_HANYA=${i + 1})  [${i + 1}] ${m.nama}`); return "infra"; }
  // rules yang dimuat emulator HARUS sama dengan mutan yang dimaksud; bila tidak, hasil run ini tidak valid
  if (!hashOk) { console.log(`? TIDAK VALID (hash rules di emulator ${hMuat?.slice(0, 12) ?? "tidak ada"} != mutan ${hDiuji.slice(0, 12)}; emulator sisa?)  [${i + 1}] ${m.nama}`); return "infra"; }
  const label = tertangkap ? "✓ TERTANGKAP" : m.ekuivalen ? "≈ EKUIVALEN (tidak dapat dieksploitasi; lapisan kedua menahan)" : "✗ LOLOS (suite TIDAK mendeteksi!)";
  console.log(`${ulang ? "  (ulang) " : ""}${label}  [${i + 1}] ${m.nama}`);
  if (tertangkap) console.log(`    ${gagal.length} uji gagal, mis.: ${gagal.slice(0, 2).join(" | ")}`);
  else console.log(`    status keluar ${r.status}${m.ekuivalen ? " (seluruh uji lain tetap lolos)" : `\n${r.stderr?.slice(0, 300) ?? ""}`}`);
  return tertangkap ? "tertangkap" : m.ekuivalen ? "ekuivalen" : "lolos";
}

const antreanUlang = [];
for (const [i, m] of mutasi.entries()) {
  const rules = JSON.parse(JSON.stringify(buildRules()));
  const sebelum = JSON.stringify(rules);
  try { m.ubah(rules.rules); } catch (e) { throw new Error(`[${i + 1}] "${m.nama}": ${e.message}`); }
  if (JSON.stringify(rules) === sebelum) throw new Error(`mutasi "${m.nama}" tidak mengubah apa pun`);
  if (grupDipilih !== "semua" && GRUP(m.nama) !== grupDipilih) continue;
  if (hanya && !hanya.has(i + 1)) continue; // MUTASI_HANYA=39,56 : jalankan subset saja (iterasi cepat)
  if (process.env.MUTASI_KERING) { console.log(`  pola OK [${i + 1}] ${m.nama}`); continue; } // hanya validasi pola, tanpa emulator
  const g = GRUP(m.nama);
  if (kelola && ((grupSebelumnya && g !== grupSebelumnya) || sejakRestart >= RESTART_N)) { await mulaiEmulator(g !== grupSebelumnya && grupSebelumnya ? `pindah grup ${grupSebelumnya} → ${g}` : `setiap ${RESTART_N} mutan`); sejakRestart = 0; }
  grupSebelumnya = g;
  dijalankan++; if (m.ekuivalen) dijalankanEkuivalen++;
  const hasil = await jalankanMutan(i, m, rules);
  if (hasil === "infra") { antreanUlang.push(i); if (kelola) { await mulaiEmulator("setelah mutan macet"); sejakRestart = 0; } }
  else if (hasil === "lolos") selamat++;
}

// Ulangi otomatis (satu kali) mutan yang TIDAK TERVERIFIKASI pada emulator baru.
if (antreanUlang.length && kelola) {
  console.log(`\nMengulang ${antreanUlang.length} mutan TIDAK TERVERIFIKASI pada emulator baru…`);
  await mulaiEmulator("ulang mutan tak terverifikasi"); sejakRestart = 0;
  for (const i of antreanUlang) {
    const m = mutasi[i];
    const rules = JSON.parse(JSON.stringify(buildRules()));
    m.ubah(rules.rules);
    if (sejakRestart >= RESTART_N) { await mulaiEmulator(`setiap ${RESTART_N} mutan`); sejakRestart = 0; }
    const hasil = await jalankanMutan(i, m, rules, { ulang: true });
    if (hasil === "infra") { tidakTerverifikasi.push(`[${i + 1}] ${m.nama}`); await mulaiEmulator("setelah mutan macet"); sejakRestart = 0; }
    else if (hasil === "lolos") selamat++;
  }
} else for (const i of antreanUlang) tidakTerverifikasi.push(`[${i + 1}] ${mutasi[i].nama}`);

await matikanEmulator();
const menit = ((Date.now() - mulaiWaktu) / 60000).toFixed(1);
console.log(`
${dijalankan - dijalankanEkuivalen - selamat}/${dijalankan - dijalankanEkuivalen} mutasi non-ekuivalen tertangkap (${dijalankanEkuivalen} ekuivalen terdokumentasi) [grup: ${grupDipilih}${process.env.MUTASI_HANYA ? ", subset" : ""}]`);
console.log(`Durasi: ${menit} menit, emulator dimulai/direstart ${restartKe}×`);
if (tidakTerverifikasi.length) console.log(`
${tidakTerverifikasi.length} mutasi TIDAK TERVERIFIKASI (emulator macet, juga setelah diulang): jalankan ulang, mis. MUTASI_HANYA=${tidakTerverifikasi.map((x) => x.match(/\d+/)[0]).join(",")}`);
process.exit(selamat ? 1 : tidakTerverifikasi.length ? 2 : 0);
