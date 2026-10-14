// Uji mutasi Security Rules: rusak rules satu per satu, suite uji HARUS gagal untuk masing-masing.
// Jalankan: npm run test:mutation  (di dalam emulator; rules asli di repo tidak diubah).
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildRules } from "../scripts/build-rules.mjs";

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
    n[".write"] = ganti(n[".write"], "(!newData.exists() || newData.val() === 'kepala' || newData.val() === 'waka' || newData.val() === 'piket')", "(!newData.exists() || newData.val() === 'kepala' || newData.val() === 'waka' || newData.val() === 'piket' || newData.val() === 'admin')");
    n[".validate"] = "newData.val() === 'kepala' || newData.val() === 'waka' || newData.val() === 'piket' || newData.val() === 'admin'";
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
  { nama: "piket boleh mengisi sel per jam 'A'", ubah: (r) => {
    const n = r.lessons.$tgl.$kelas.absen.$nis.$jam;
    n[".write"] = ganti(n[".write"], "newData.val() === 'D')", "newData.val() === 'D' || newData.val() === 'A')");
  } },
  { nama: "piket boleh mengubah/menimpa sel yang sudah 'A'", ubah: (r) => {
    const n = r.lessons.$tgl.$kelas.absen.$nis.$jam;
    n[".write"] = ganti(n[".write"], "(!data.exists() || data.val() !== 'A') && ", "");
  } },
  { nama: "piket boleh mengubah salinan lessonsByStudent yang sudah 'A'", ubah: (r) => {
    const n = r.lessonsByStudent.$nis.$tgl.$jam;
    n[".write"] = ganti(n[".write"], " && (!data.exists() || data.child('k').val() !== 'A')", "");
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
    const baru = n[".validate"].replace(/ && \(!\(root\.child\('roles'\)\.child\(auth\.uid\)\.val\(\) === 'piket'\) \|\| \([^]*\)\)$/, "");
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
    c[".write"] = ganti(c[".write"], ` && ${actOk(6, ["izin-jam"])}`, "");
    const k = r.lessonsByStudent.$nis.$tgl.$jam;
    k[".write"] = ganti(k[".write"], ` && ${actOk(4, ["izin-jam"])}`, "");
    const m = r.izinMeta.$tgl.$nis.$metaId;
    m[".write"] = ganti(m[".write"], ` && ${actOk(4, ["izin-harian", "izin-jam"])}`, "");
  } },
  { nama: "log: sel piket tanpa izinMeta BARU pada sel (lessons)", ubah: (r) => {
    const c = r.lessons.$tgl.$kelas.absen.$nis.$jam;
    c[".write"] = ganti(c[".write"], ` && ${metaBaruPiket(6, "$tgl", "$nis", "newData.val()")}`, "");
  } },
  { nama: "log: sel piket tanpa izinMeta BARU pada salinan (lessonsByStudent)", ubah: (r) => {
    const k = r.lessonsByStudent.$nis.$tgl.$jam;
    k[".write"] = ganti(k[".write"], ` && ${metaBaruPiket(4, "$tgl", "$nis", "newData.child('k').val()")}`, "");
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
  { nama: "sistem: backupTerakhir dapat ditulis waka", ubah: (r) => { r.sistem[".write"] = `(${r.sistem[".write"]}) || (auth != null && ${WAKA})`; } },
  { nama: "sistem: backupTerakhir boleh di masa depan", ubah: (r) => { r.sistem.backupTerakhir[".validate"] = "newData.isNumber()"; } },
  { nama: "piketPerangkat: pendaftaran boleh ditimpa", ubah: (r) => { const n = r.piketPerangkat.$id; n[".write"] = ganti(n[".write"], " && !data.exists()", ""); } },
  { nama: "piketPerangkat: dapat dibaca kepala", ubah: (r) => { r.piketPerangkat[".read"] = `(${r.piketPerangkat[".read"]}) || (auth != null && ${KEPALA})`; } },
  { nama: "piketPerangkat: uid tidak wajib pengguna sendiri", ubah: (r) => { r.piketPerangkat.$id.uid[".validate"] = "newData.isString()"; } },
  { nama: "admin boleh tulis validasi Alfa",ubah: (r) => { const n = r.validasi.$tgl.$nis; n[".write"] = `(${n[".write"]}) || (auth != null && ${ADMIN})`; } },
];

function ganti(teks, dari, ke) {
  if (!teks.includes(dari)) throw new Error(`mutasi tidak menemukan teks target: ${dari.slice(0, 60)}`);
  return teks.replace(dari, ke);
}

const dir = mkdtempSync(join(tmpdir(), "mutasi-"));
let selamat = 0;
const hanya = process.env.MUTASI_HANYA ? new Set(process.env.MUTASI_HANYA.split(",").map(Number)) : null;
console.log(`Uji mutasi (${mutasi.length} mutasi)\n`);
for (const [i, m] of mutasi.entries()) {
  const rules = JSON.parse(JSON.stringify(buildRules()));
  const sebelum = JSON.stringify(rules);
  try { m.ubah(rules.rules); } catch (e) { throw new Error(`[${i + 1}] "${m.nama}": ${e.message}`); }
  if (JSON.stringify(rules) === sebelum) throw new Error(`mutasi "${m.nama}" tidak mengubah apa pun`);
  if (hanya && !hanya.has(i + 1)) continue; // MUTASI_HANYA=39,56 : jalankan subset saja (iterasi cepat)
  if (process.env.MUTASI_KERING) { console.log(`  pola OK [${i + 1}] ${m.nama}`); continue; } // hanya validasi pola, tanpa emulator
  const file = join(dir, `m${i}.json`);
  writeFileSync(file, JSON.stringify(rules));
  const r = spawnSync(process.execPath, ["tests/rules.test.mjs"], { env: { ...process.env, RULES_FILE: file }, encoding: "utf8" });
  const gagal = r.stdout.split("\n").filter((l) => l.startsWith("  ✗")).map((l) => l.replace("  ✗ ", ""));
  const tertangkap = r.status === 1 && gagal.length > 0;
  if (!tertangkap && !m.ekuivalen) selamat++;
  const label = tertangkap ? "✓ TERTANGKAP" : m.ekuivalen ? "≈ EKUIVALEN (tidak dapat dieksploitasi; lapisan kedua menahan)" : "✗ LOLOS (suite TIDAK mendeteksi!)";
  console.log(`${label}  [${i + 1}] ${m.nama}`);
  if (tertangkap) console.log(`    ${gagal.length} uji gagal, mis.: ${gagal.slice(0, 2).join(" | ")}`);
  else console.log(`    status keluar ${r.status}${m.ekuivalen ? " (seluruh uji lain tetap lolos)" : `\n${r.stderr?.slice(0, 300) ?? ""}`}`);
}
const ekuivalen = mutasi.filter((m) => m.ekuivalen).length;
console.log(`\n${mutasi.length - ekuivalen - selamat}/${mutasi.length - ekuivalen} mutasi non-ekuivalen tertangkap (${ekuivalen} ekuivalen terdokumentasi)`);
process.exit(selamat ? 1 : 0);
