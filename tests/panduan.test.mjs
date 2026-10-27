// Uji panduan: docs/*.md SELALU sama dengan sumber src/lib/panduan.ts, tiap peran maks. ~2 halaman, langkah bernomor, topik wajib ada.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PANDUAN, URUTAN_PANDUAN, hitungKata, keMarkdown } from "../src/lib/panduan.ts";

assert.deepEqual(URUTAN_PANDUAN, ["admin", "kepala", "waka", "piket", "wali", "bk", "ortu", "sop"]);
const BERKAS = { admin: "PANDUAN_ADMIN.md", kepala: "PANDUAN_KEPALA.md", waka: "PANDUAN_WAKA.md", piket: "PANDUAN_PIKET.md", wali: "PANDUAN_WALI.md", bk: "PANDUAN_BK.md", ortu: "PANDUAN_ORANG_TUA.md", sop: "SOP_HARIAN.md" };
for (const k of URUTAN_PANDUAN) {
  const p = PANDUAN[k];
  assert.equal(p.berkas, BERKAS[k]);
  const md = readFileSync(new URL(`../docs/${p.berkas}`, import.meta.url), "utf8");
  assert.equal(md, keMarkdown(p), `${p.berkas} tidak sinkron dengan src/lib/panduan.ts (jalankan: node scripts/buat-panduan.mjs)`);
  assert.ok(hitungKata(p) <= 700, `${p.berkas} terlalu panjang (${hitungKata(p)} kata; batas 2 halaman ~700)`);
  assert.ok(p.bagian.length >= 3, `${k}: minimal 3 bagian`);
  assert.equal(new Set(p.bagian.map((b) => b.judul)).size, p.bagian.length, `${k}: judul bagian harus unik (dipakai sebagai key React)`);
  for (const b of p.bagian) assert.ok(b.langkah.length >= 2, `${k}/${b.judul}: langkah bernomor minimal 2`);
  assert.ok(/^1\. /m.test(md) && /^2\. /m.test(md), `${p.berkas}: langkah harus bernomor`);
}
const teks = (k) => keMarkdown(PANDUAN[k]);
// topik wajib
assert.match(teks("ortu"), /NIS/); assert.match(teks("ortu"), /PIN/); assert.match(teks("ortu"), /Lupa PIN/); assert.match(teks("ortu"), /Dispensasi/); assert.match(teks("ortu"), /dicatat manual/);
for (const h of ["Pagi", "Siang", "Sore", "Sabtu", "alat mati"]) assert.match(teks("sop"), new RegExp(h, "i"), `SOP harus memuat '${h}'`);
assert.match(teks("sop"), /Mode alat bermasalah/);
assert.match(teks("piket"), /Mode alat bermasalah/); assert.match(teks("piket"), /Hadir manual/);
assert.match(teks("waka"), /Pemetaan saran/); assert.match(teks("waka"), /Kunci akun piket/);
assert.match(teks("admin"), /Backup/); assert.match(teks("admin"), /Ekspor JSON/);
assert.match(teks("kepala"), /Tata tertib/);
// hari efektif berbasis bukti & kalender
// v2.5.2: kalender (override, ambang, hitung ulang, migrasi) adalah tugas Waka/Kepala; TU hanya melihat dan mengingatkan lewat Kontrol kalender
assert.match(teks("admin"), /Kalender/); assert.match(teks("admin"), /Kontrol kalender/); assert.match(teks("admin"), /hanya dapat Anda lihat/);
assert.doesNotMatch(teks("admin"), /Simpan override|Hitung ulang|Terapkan migrasi/);
assert.match(teks("waka"), /Hitung ulang/); assert.match(teks("waka"), /dry-run/); assert.match(teks("waka"), /Ambang/); assert.match(teks("waka"), /Kontrol kalender/);
assert.match(teks("waka"), /Tap rendah/); assert.match(teks("waka"), /Konfirmasi hari ini normal/); assert.match(teks("waka"), /bukan hari efektif/);
assert.match(teks("kepala"), /Kalender/); assert.match(teks("ortu"), /Hari efektif ke-N/); assert.match(teks("ortu"), /tidak ada kegiatan presensi/);
assert.match(teks("sop"), /bukan hari efektif/); assert.match(teks("piket"), /hari efektif/);
// wali kelas: topik wajib (pembinaan, usulan remisi, wewenang terbatas)
assert.match(teks("wali"), /Perlu dibina/); assert.match(teks("wali"), /Catat pembinaan/); assert.match(teks("wali"), /Usulan remisi/);
assert.match(teks("wali"), /Dispensasi/); assert.match(teks("wali"), /kelas binaan/); assert.match(teks("wali"), /tidak dapat dihapus/);
// v2.5.2 satu tugas satu pengisi: wali memantau saja (Kehadiran kelas), tidak mencatat izin/pelanggaran
assert.match(teks("wali"), /Kehadiran kelas/); assert.match(teks("wali"), /tidak mencatat Izin, Sakit, Dispensasi, atau pelanggaran/);
assert.doesNotMatch(teks("wali"), /Izin & kehadiran|Catatan saya|tombol Izin dan Sakit/);
assert.match(teks("piket"), /Kabar izin dari orang tua atau wali kelas disampaikan ke piket/); assert.match(teks("ortu"), /Kabari piket sekolah/);
assert.match(teks("kepala"), /cadangan/);
// SOP: satu baris per peran (TU, Piket, Wakasis, Wali kelas, Guru BK, Kepala Madrasah)
for (const baris of [/^1\. TU \(admin\):/m, /^2\. Piket:/m, /^3\. Wakasis:/m, /^4\. Wali kelas:/m, /^5\. Guru BK:/m, /^6\. Kepala Madrasah:/m]) assert.match(teks("sop"), baris, `SOP harus memuat baris peran ${baris}`);
assert.match(teks("sop"), /Pembagian tugas: satu tugas satu pengisi/); assert.match(teks("sop"), /T1/); assert.match(teks("sop"), /T2/); assert.match(teks("sop"), /SP3/);
assert.match(teks("admin"), /Wali kelas/); assert.match(teks("admin"), /Indeks siswa-kelas/); assert.match(teks("waka"), /Wali kelas/);
// tidak ada rahasia/URL nyata di panduan
for (const k of URUTAN_PANDUAN) assert.doesNotMatch(teks(k), /AIza|firebaseio|password-uji|@gmail/i);
console.log("panduan.test: OK");

// v2.4-b: panduan BK memuat konseling rahasia; admin/kepala/waka menyebut Guru BK / Konseling
assert.match(teks("bk"), /Konseling/); assert.match(teks("bk"), /rahasia/i); assert.match(teks("bk"), /Perlu dibina/); assert.match(teks("bk"), /tidak dapat dihapus/i);
assert.match(teks("admin"), /Guru BK/); assert.match(teks("waka"), /Guru BK/); assert.match(teks("kepala"), /tidak oleh Kepala/); assert.match(teks("kepala"), /Penugasan BK/); assert.match(teks("kepala"), /Migrasi pembinaan/); assert.match(teks("waka"), /Izin ke orang tua/); assert.match(teks("bk"), /Klaim/);
// v2.5.1: laporan wali/BK, hapus akun permanen, lencana pembinaan kepala/waka
assert.match(teks("wali"), /Laporan/); assert.match(teks("wali"), /titik koma/); assert.match(teks("bk"), /Laporan/); assert.match(teks("bk"), /tanpa nama siswa/);
assert.match(teks("admin"), /Hapus akun permanen/); assert.match(teks("admin"), /HAPUS/); assert.match(teks("admin"), /tidak dapat dibatalkan/i); assert.match(teks("admin"), /klaim aktif/i);
assert.match(teks("kepala"), /Perlu dibina \(Kepala\)/); assert.match(teks("waka"), /Klaim aktif/); assert.match(teks("waka"), /lencana/i);
console.log("panduan v2.5.1 ok");
assert.match(teks("admin"), /centang Tandai juga untuk hapus permanen/); assert.match(teks("admin"), /Firebase Console, Authentication, Users/);
