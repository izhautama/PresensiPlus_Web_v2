// Uji unit pembinaan wali kelas: "Perlu dibina", penanggung jawab, validasi, usulan remisi.
import assert from "node:assert/strict";
import { htmlLembar } from "../src/lib/lembar.ts";
import { antreanUsul, daftarPerluDibina, idPembinaan, penanggungJawabBawaan, perluDibina, puncakSaldo, validasiPembinaan, validasiUsul } from "../src/lib/pembinaan.ts";

const TA = "2026-2027";
const levels = {
  lv01: { poin: 100, tindakan: "Teguran 1", penanggungJawab: "wali" },
  lv02: { poin: 200, tindakan: "Teguran 2", penanggungJawab: "bk" },
  lv03: { poin: 300, tindakan: "Teguran 3", penanggungJawab: "kepala" },
  lv04: { poin: 400, tindakan: "SP1", penanggungJawab: "waka" },
};
const pel = (poin, tanggal, o = {}) => ({ jenis: "pelanggaran", nama: "x", poin, tanggal, ta: TA, sumber: "manual", ...o });
const rem = (poin, tanggal, o = {}) => ({ jenis: "remisi", nama: "r", poin, tanggal, ta: TA, sumber: "manual", ...o });
const pb = (o = {}) => ({ ta: TA, levelId: "lv01", levelPoin: 100, tindakan: "t", tanggal: "2026-10-20", metode: "Tatap muka", hasil: "Sudah dibina dengan baik", status: "selesai", oleh: "u", olehNama: "Bu W", dibuatTs: 1, ...o });
const cari = (recs, extra = {}) => perluDibina({ nis: "1", recs, levels, pembinaan: null, ta: TA, ...extra });

// ---- belum melewati ambang
assert.deepEqual(cari({}), []);
assert.deepEqual(cari({ a: pel(99, "2026-09-01") }), [], "99 poin: belum");
// ---- tepat di ambang (>=)
let r = cari({ a: pel(100, "2026-09-01") });
assert.equal(r.length, 1); assert.equal(r[0].levelId, "lv01"); assert.equal(r[0].status, "perlu"); assert.equal(r[0].saldoTurun, false);
// ---- hanya ambang milik wali: saldo 250 tetap hanya lv01 untuk wali (lv02 milik BK)
r = cari({ a: pel(250, "2026-09-01") });
assert.deepEqual(r.map((x) => x.levelId), ["lv01"]);
assert.deepEqual(cari({ a: pel(250, "2026-09-01") }, { pj: "bk" }).map((x) => x.levelId), ["lv02"]);
assert.deepEqual(cari({ a: pel(450, "2026-09-01") }, { pj: "waka" }).map((x) => x.levelId), ["lv04"]);
assert.deepEqual(cari({ a: pel(350, "2026-09-01") }, { pj: "kepala" }).map((x) => x.levelId), ["lv03"]);

// ---- pembinaan SELESAI menghilangkan; dijadwalkan tetap; TA berbeda tidak berlaku
const rec100 = { a: pel(120, "2026-09-01") };
assert.deepEqual(cari(rec100, { pembinaan: { [idPembinaan(TA, "lv01")]: pb() } }), [], "selesai -> hilang");
r = cari(rec100, { pembinaan: { [idPembinaan(TA, "lv01")]: pb({ status: "dijadwalkan" }) } });
assert.equal(r.length, 1); assert.equal(r[0].status, "dijadwalkan");
r = cari(rec100, { pembinaan: { [idPembinaan("2025-2026", "lv01")]: pb({ ta: "2025-2026" }) } });
assert.equal(r.length, 1, "pembinaan TA lalu tidak menutup TA berjalan");
assert.equal(cari(rec100, { pembinaan: { [idPembinaan(TA, "lv02")]: pb({ levelId: "lv02" }) } }).length, 1, "pembinaan ambang lain tidak menutup lv01");

// ---- catatan TA lain tidak dihitung
assert.deepEqual(cari({ a: pel(300, "2026-01-10", { ta: "2025-2026" }) }), []);

// ---- saldo TURUN: tetap tampil dengan label, sampai selesai dibina
const turun = { a: pel(100, "2026-09-01"), b: rem(40, "2026-09-10") };
r = cari(turun);
assert.equal(r.length, 1); assert.equal(r[0].saldo, 60); assert.equal(r[0].puncak, 100); assert.equal(r[0].saldoTurun, true);
assert.deepEqual(cari(turun, { pembinaan: { [idPembinaan(TA, "lv01")]: pb() } }), [], "turun lalu dibina selesai -> hilang");
// remisi lebih dulu daripada pelanggaran tidak membuat puncak palsu
const urutan = { a: rem(50, "2026-08-01"), b: pel(120, "2026-09-01") };
assert.equal(puncakSaldo(urutan, null, TA), 70);
assert.deepEqual(cari(urutan), [], "120 - 50 = 70 < 100: belum melewati");
// puncak dihitung berurutan waktu, bukan akhir saja
assert.equal(puncakSaldo({ a: pel(150, "2026-09-01"), b: rem(150, "2026-09-02"), c: pel(30, "2026-09-03") }, null, TA), 150);
// urutan sehari yang sama memakai waktu catat (meta.dibuatTs)
const meta = { a: { dibuatOleh: "u", dibuatNama: "n", dibuatTs: 2 }, b: { dibuatOleh: "u", dibuatNama: "n", dibuatTs: 1 } };
assert.equal(puncakSaldo({ a: pel(100, "2026-09-01"), b: rem(100, "2026-09-01") }, meta, TA), 0, "remisi dicatat lebih dulu lalu pelanggaran: tidak pernah melewati 0");
const meta2 = { a: { dibuatOleh: "u", dibuatNama: "n", dibuatTs: 1 }, b: { dibuatOleh: "u", dibuatNama: "n", dibuatTs: 2 } };
assert.equal(puncakSaldo({ a: pel(100, "2026-09-01"), b: rem(100, "2026-09-01") }, meta2, TA), 100, "pelanggaran dicatat lebih dulu: puncak 100");

// ---- ambang diubah: pencocokan lewat levelId (bukan poin)
const levelBaru = { ...levels, lv01: { poin: 80, tindakan: "Teguran 1", penanggungJawab: "wali" } };
r = perluDibina({ nis: "1", recs: { a: pel(90, "2026-09-01") }, levels: levelBaru, pembinaan: null, ta: TA });
assert.equal(r.length, 1, "ambang diturunkan ke 80: 90 poin kini melewati");
assert.deepEqual(perluDibina({ nis: "1", recs: { a: pel(90, "2026-09-01") }, levels: levelBaru, pembinaan: { [idPembinaan(TA, "lv01")]: pb({ levelPoin: 100 }) }, ta: TA }), [], "snapshot levelPoin lama tidak mengubah status selesai");
const levelNaik = { ...levels, lv01: { poin: 150, tindakan: "Teguran 1", penanggungJawab: "wali" } };
assert.deepEqual(perluDibina({ nis: "1", recs: { a: pel(120, "2026-09-01") }, levels: levelNaik, pembinaan: null, ta: TA }), [], "ambang dinaikkan ke 150: 120 belum melewati");

// ---- penanggungJawab hilang/diubah
const tanpaPj = { lv01: { poin: 100, tindakan: "T" } };
assert.deepEqual(perluDibina({ nis: "1", recs: { a: pel(500, "2026-09-01") }, levels: tanpaPj, pembinaan: null, ta: TA }), [], "tanpa penanggungJawab eksplisit: tidak ada daftar");
const pjGanti = { lv01: { poin: 100, tindakan: "T", penanggungJawab: "bk" } };
assert.deepEqual(perluDibina({ nis: "1", recs: { a: pel(500, "2026-09-01") }, levels: pjGanti, pembinaan: null, ta: TA }), [], "ambang dialihkan ke BK: bukan urusan wali");
const duaWali = { lv01: { poin: 100, tindakan: "A", penanggungJawab: "wali" }, lvX: { poin: 150, tindakan: "B", penanggungJawab: "wali" } };
assert.deepEqual(perluDibina({ nis: "1", recs: { a: pel(160, "2026-09-01") }, levels: duaWali, pembinaan: null, ta: TA }).map((x) => x.levelId), ["lv01", "lvX"], "dua ambang wali -> dua item terurut");
assert.deepEqual(perluDibina({ nis: "1", recs: { a: pel(160, "2026-09-01") }, levels: null, pembinaan: null, ta: TA }), []);

// ---- daftar banyak siswa, terurut NIS numerik
const d = daftarPerluDibina([
  { nis: "20", recs: { a: pel(100, "2026-09-01") }, pembinaan: null },
  { nis: "3", recs: { a: pel(100, "2026-09-01") }, pembinaan: null },
  { nis: "7", recs: { a: pel(50, "2026-09-01") }, pembinaan: null },
], levels, TA);
assert.deepEqual(d.map((x) => x.nis), ["3", "20"]);

// ---- penanggung jawab bawaan untuk data lama
assert.equal(penanggungJawabBawaan("lv01", { poin: 100 }), "wali");
assert.equal(penanggungJawabBawaan("lv02", { poin: 200 }), "bk");
assert.equal(penanggungJawabBawaan("lv03", { poin: 300 }), "kepala");
assert.equal(penanggungJawabBawaan("lv05", { poin: 500 }), "kepala", "v2.5: lv04-lv06 menjadi kepala");
assert.equal(penanggungJawabBawaan("lv04", { poin: 400 }), "kepala");
assert.equal(penanggungJawabBawaan("xyz", { poin: 100 }), "wali", "id kustom: menurut ambang 100");
assert.equal(penanggungJawabBawaan("xyz", { poin: 450 }), "kepala");
assert.equal(penanggungJawabBawaan("xyz", { poin: 150 }), null, "ambang tak lazim: dibiarkan (diatur manual)");

// ---- validasi pembinaan
const ok = { tanggal: "2026-10-20", metode: "Tatap muka", hasil: "Siswa sudah diberi nasihat", tindakLanjut: "", status: "selesai" };
assert.deepEqual(validasiPembinaan(ok, "2026-10-20"), {});
assert.ok(validasiPembinaan({ ...ok, hasil: "pendek" }, "2026-10-20").hasil, "hasil < 10");
assert.ok(validasiPembinaan({ ...ok, hasil: "x".repeat(1001) }, "2026-10-20").hasil, "hasil > 1000");
assert.deepEqual(validasiPembinaan({ ...ok, hasil: "x".repeat(1000) }, "2026-10-20"), {});
assert.ok(validasiPembinaan({ ...ok, tindakLanjut: "x".repeat(501) }, "2026-10-20").tindakLanjut);
assert.ok(validasiPembinaan({ ...ok, metode: "Surat" }, "2026-10-20").metode);
assert.ok(validasiPembinaan({ ...ok, tanggal: "2026-10-21" }, "2026-10-20").tanggal, "selesai bertanggal masa depan");
assert.deepEqual(validasiPembinaan({ ...ok, tanggal: "2026-10-21", status: "dijadwalkan" }, "2026-10-20"), {}, "dijadwalkan boleh masa depan");
assert.ok(validasiPembinaan({ ...ok, tanggal: "21-10-2026" }, "2026-10-20").tanggal);
assert.ok(validasiPembinaan({ ...ok, status: "batal" }, "2026-10-20").status);

// ---- usulan remisi
const rm = (o = {}) => ({ kelompok: "Prestasi", nama: "Juara", poin: 50, aktif: true, diubahOleh: "u", diubahTs: 1, ...o });
const base = { remisi: rm(), alasan: "Juara lomba tingkat kota", punyaPelanggaranTa: false, usulLain: [], nis: "1", remId: "rm1" };
assert.deepEqual(validasiUsul(base), {});
assert.ok(validasiUsul({ ...base, remisi: undefined }).remisi);
assert.ok(validasiUsul({ ...base, remisi: rm({ aktif: false }) }).remisi, "remisi nonaktif");
assert.ok(validasiUsul({ ...base, alasan: "singkat" }).alasan);
assert.ok(validasiUsul({ ...base, alasan: "x".repeat(301) }).alasan);
assert.deepEqual(validasiUsul({ ...base, alasan: "x".repeat(300) }), {});
assert.ok(validasiUsul({ ...base, remisi: rm({ kelompok: "Tanpa prestasi" }) }).remisi, "Tanpa prestasi butuh catatan pelanggaran");
assert.deepEqual(validasiUsul({ ...base, remisi: rm({ kelompok: "Tanpa prestasi" }), punyaPelanggaranTa: true }), {});
assert.ok(validasiUsul({ ...base, usulLain: [{ nis: "1", remId: "rm1", status: "menunggu" }] }).remisi, "duplikat menunggu");
assert.deepEqual(validasiUsul({ ...base, usulLain: [{ nis: "1", remId: "rm1", status: "ditolak" }] }), {}, "usulan lama yang ditolak boleh diajukan lagi");
assert.deepEqual(validasiUsul({ ...base, usulLain: [{ nis: "2", remId: "rm1", status: "menunggu" }] }), {}, "siswa lain tidak bentrok");

// ---- antrean usulan: hanya menunggu, terlama dulu
const aq = antreanUsul({ b: { status: "menunggu", ts: 20 }, a: { status: "menunggu", ts: 10 }, c: { status: "disetujui", ts: 5 }, d: { status: "ditolak", ts: 1 } });
assert.deepEqual(aq.map((x) => x[0]), ["a", "b"]);
assert.deepEqual(antreanUsul(null), []);

// ---- lembar pembinaan memuat riwayat pembinaan (dan meng-escape isi)
const html = htmlLembar({
  nama: "Andi", nis: "1", kelas: "X", ta: TA, ringkas: { pel: 120, rem: 0, saldo: 120, sangatBerat: false, jumlah: 1 }, sekarang: null, berikut: null, riwayat: [], perJam: [],
  pembinaan: [pb({ hasil: "Dinasihati <script>x</script>", tindakLanjut: "Pantau 2 minggu", olehNama: "Bu Wali" })], dicetak: "sekarang", dicetakOleh: "Waka",
});
assert.match(html, /Riwayat pembinaan/); assert.match(html, /Bu Wali/); assert.match(html, /Pantau 2 minggu/); assert.match(html, /Selesai/);
assert.ok(!html.includes("<script>x</script>"), "isi pembinaan harus di-escape");
assert.match(htmlLembar({ nama: "A", nis: "1", kelas: "X", ta: TA, ringkas: { pel: 0, rem: 0, saldo: 0, sangatBerat: false, jumlah: 0 }, sekarang: null, berikut: null, riwayat: [], perJam: [], dicetak: "s", dicetakOleh: "w" }), /Belum ada pembinaan tercatat/);

console.log("pembinaan.test: OK");
