// Uji unit pemeriksa konsistensi: indeks siswaKelas vs config/students, cermin waliAkun vs staff + roles.
import assert from "node:assert/strict";
import { kelasWaliKosong, rencanaPerbaikan, selisihCermin, selisihIndeks, totalSelisih } from "../src/lib/konsistensi.ts";
import { encodeKelas } from "../src/lib/wali.ts";

const siswa = [
  { nis: "101", nama: "A", kelas: "X IPA" },
  { nis: "102", nama: "B", kelas: "X IPA" },
  { nis: "103", nama: "C", kelas: "XI/IPS.1" },
];
const idxOk = { 101: "X IPA", 102: "X IPA", 103: encodeKelas("XI/IPS.1") };

// ---- indeks siswaKelas
assert.deepEqual(selisihIndeks(siswa, idxOk), [], "konsisten = tanpa selisih");
assert.equal(encodeKelas("XI/IPS.1"), "XI%2FIPS%2E1");

let d = selisihIndeks(siswa, { 101: "X IPA", 103: encodeKelas("XI/IPS.1") });
assert.deepEqual(d.map((x) => [x.nis, x.jenis]), [["102", "baru"]]);
assert.equal(d[0].seharusnya, "X IPA");
assert.equal(d[0].sekarang, null);

d = selisihIndeks(siswa, { ...idxOk, 102: "XI IPS" });
assert.deepEqual(d.map((x) => [x.nis, x.jenis, x.sekarang, x.seharusnya]), [["102", "berubah", "XI IPS", "X IPA"]]);

d = selisihIndeks(siswa, { ...idxOk, 999: "X IPA" });
assert.deepEqual(d.map((x) => [x.nis, x.jenis, x.seharusnya]), [["999", "usang", null]]);
assert.equal(d[0].nama, "(siswa sudah tidak ada)");

// kelas dengan karakter khusus harus memakai kunci ter-encode yang SAMA dengan web
d = selisihIndeks(siswa, { ...idxOk, 103: "XI/IPS.1" });
assert.deepEqual(d.map((x) => [x.nis, x.jenis]), [["103", "berubah"]], "kunci tak ter-encode dianggap beda");

// indeks null/kosong: semua siswa 'baru'
assert.equal(selisihIndeks(siswa, null).length, 3);
assert.equal(selisihIndeks([], null).length, 0);
// NIS ganda di config tidak melipatgandakan selisih
assert.equal(selisihIndeks([...siswa, { nis: "101", nama: "dobel", kelas: "X IPA" }], idxOk).length, 0);
// urutan numerik menurut NIS
assert.deepEqual(selisihIndeks([{ nis: "20", nama: "x", kelas: "X" }, { nis: "3", nama: "y", kelas: "X" }], {}).map((x) => x.nis), ["3", "20"]);

// ---- cermin waliAkun
const stf = (o = {}) => ({ email: "w@x.id", nama: "Bu W", role: "wali", kelasUtama: "X IPA", ...o });
const cm = (o = {}) => ({ email: "w@x.id", nama: "Bu W", kelasUtama: "X IPA", aktif: true, ...o });

assert.deepEqual(selisihCermin({ u1: stf() }, { u1: cm() }, { u1: "wali" }), [], "konsisten");
assert.deepEqual(selisihCermin({ u1: stf({ kelasTambahan: { "XI IPS": true } }) }, { u1: cm({ kelasTambahan: { "XI IPS": true } }) }, { u1: "wali" }), []);
assert.deepEqual(selisihCermin({}, {}, {}), []);
assert.deepEqual(selisihCermin(null, null, {}), []);

// cermin hilang -> dibuat utuh
let a = selisihCermin({ u1: stf({ kelasTambahan: { "XI IPS": true } }) }, {}, { u1: "wali" });
assert.equal(a.length, 1); assert.equal(a[0].jenis, "tanpa-cermin");
assert.deepEqual(a[0].perbaikan, { "waliAkun/u1": { email: "w@x.id", nama: "Bu W", kelasUtama: "X IPA", aktif: true, kelasTambahan: { "XI IPS": true } } });
// dicabut -> aktif false pada cermin baru
a = selisihCermin({ u1: stf() }, {}, { u1: null });
assert.equal(a[0].perbaikan["waliAkun/u1"].aktif, false);

// kelas utama beda -> hanya field itu
a = selisihCermin({ u1: stf({ kelasUtama: "XI IPS" }) }, { u1: cm() }, { u1: "wali" });
assert.equal(a[0].jenis, "beda"); assert.deepEqual(a[0].perbaikan, { "waliAkun/u1/kelasUtama": "XI IPS" });
// email/nama beda
a = selisihCermin({ u1: stf({ nama: "Pak Baru", email: "b@x.id" }) }, { u1: cm() }, { u1: "wali" });
assert.deepEqual(a[0].perbaikan, { "waliAkun/u1/email": "b@x.id", "waliAkun/u1/nama": "Pak Baru" });
// tambahan beda (ditambah / dihapus)
a = selisihCermin({ u1: stf({ kelasTambahan: { "XI IPS": true } }) }, { u1: cm() }, { u1: "wali" });
assert.deepEqual(a[0].perbaikan, { "waliAkun/u1/kelasTambahan": { "XI IPS": true } });
a = selisihCermin({ u1: stf() }, { u1: cm({ kelasTambahan: { "XI IPS": true } }) }, { u1: "wali" });
assert.deepEqual(a[0].perbaikan, { "waliAkun/u1/kelasTambahan": null });
// tambahan bernilai false di staff tidak dihitung
assert.deepEqual(selisihCermin({ u1: stf({ kelasTambahan: { "XI IPS": false } }) }, { u1: cm() }, { u1: "wali" }), []);
// status: role dicabut tetapi cermin masih aktif (dan sebaliknya)
a = selisihCermin({ u1: stf() }, { u1: cm() }, { u1: null });
assert.deepEqual(a[0].perbaikan, { "waliAkun/u1/aktif": false });
a = selisihCermin({ u1: stf() }, { u1: cm({ aktif: false }) }, { u1: "wali" });
assert.deepEqual(a[0].perbaikan, { "waliAkun/u1/aktif": true });
// cermin yatim (tanpa staff wali / staff non-wali)
a = selisihCermin({}, { u9: cm() }, {});
assert.equal(a[0].jenis, "cermin-usang"); assert.deepEqual(a[0].perbaikan, { "waliAkun/u9": null });
a = selisihCermin({ u9: stf({ role: "piket" }) }, { u9: cm() }, {});
assert.equal(a[0].jenis, "cermin-usang");
// staf non-wali tidak pernah memicu cermin
assert.deepEqual(selisihCermin({ p: stf({ role: "piket" }), k: stf({ role: "kepala" }) }, {}, {}), []);
// wali tanpa kelas utama: dilaporkan tetapi tidak dapat diperbaiki otomatis
a = selisihCermin({ u1: stf({ kelasUtama: undefined }) }, {}, { u1: "wali" });
assert.equal(a[0].jenis, "tanpa-kelas"); assert.equal(a[0].perbaikan, null);

// ---- kelas wali tanpa siswa (peringatan naik kelas)
const kosong = kelasWaliKosong({ u1: stf({ kelasUtama: "XII IPA", kelasTambahan: { "X IPA": true, "XIII": true } }), p: stf({ role: "piket", kelasUtama: "ZZZ" }) }, siswa);
assert.deepEqual(kosong.map((k) => k.kelas).sort(), ["XII IPA", "XIII"]);
assert.deepEqual(kelasWaliKosong({ u1: stf() }, siswa), []);

// ---- rencana perbaikan + hitungan total
const h = {
  siswa: selisihIndeks(siswa, { 101: "XI", 999: "X IPA", 103: encodeKelas("XI/IPS.1") }),
  akun: [...selisihCermin({ u1: stf({ kelasUtama: "XI IPS" }), u2: stf({ kelasUtama: undefined }) }, { u1: cm(), u9: cm() }, { u1: "wali", u2: "wali" })],
};
assert.equal(totalSelisih(h), h.siswa.length + h.akun.length);
const r = rencanaPerbaikan(h);
assert.equal(r["siswaKelas/101"], "X IPA", "berubah -> kelas seharusnya");
assert.equal(r["siswaKelas/102"], "X IPA", "baru -> tulis");
assert.equal(r["siswaKelas/999"], null, "usang -> hapus");
assert.equal(r["waliAkun/u1/kelasUtama"], "XI IPS");
assert.equal(r["waliAkun/u9"], null);
assert.ok(!Object.keys(r).some((k) => k.includes("u2")), "akun tanpa kelas utama tidak diperbaiki otomatis");
assert.equal(totalSelisih(null), 0);
// idempoten: setelah rencana diterapkan, tidak ada selisih lagi
const idxBaru = { 101: "X IPA", 102: "X IPA", 103: encodeKelas("XI/IPS.1") };
assert.deepEqual(selisihIndeks(siswa, idxBaru), []);

console.log("konsistensi.test: OK");
