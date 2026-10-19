// Uji unit wewenang wali kelas (cermin Security Rules `waliDari`) + pembantu pemetaan.
import assert from "node:assert/strict";
import { bedaIndeks, encodeKelas, kelasBinaan, siswaBinaan, waliDari, waliPemegangKelas } from "../src/lib/wali.ts";

const indeks = { 101: "X", 102: "X", 103: "XI", 104: "XII", 105: encodeKelas("X-A/1") };
const utamaX = { kelasUtama: "X" };
const dua = { kelasUtama: "XI", kelasTambahan: { XII: true } };

// kelas utama & tambahan
assert.equal(waliDari("101", utamaX, indeks), true);
assert.equal(waliDari("103", utamaX, indeks), false, "kelas lain ditolak");
assert.equal(waliDari("103", dua, indeks), true, "kelas utama XI");
assert.equal(waliDari("104", dua, indeks), true, "kelas tambahan XII");
assert.equal(waliDari("101", dua, indeks), false);
// null === null TIDAK boleh membuka apa pun
assert.equal(waliDari("999", utamaX, indeks), false, "siswa tanpa indeks");
assert.equal(waliDari("999", {}, indeks), false, "wali tanpa kelas + siswa tanpa indeks");
assert.equal(waliDari("101", {}, indeks), false, "wali tanpa kelas");
assert.equal(waliDari("101", { kelasUtama: null }, indeks), false);
assert.equal(waliDari("101", null, indeks), false);
assert.equal(waliDari("101", utamaX, null), false);
// tambahan hanya bila bernilai true
assert.equal(waliDari("104", { kelasUtama: "XI", kelasTambahan: { XII: false } }, indeks), false);
// kunci kelas ber-encode
assert.equal(encodeKelas("X-A/1"), "X-A%2F1");
assert.equal(waliDari("105", { kelasUtama: encodeKelas("X-A/1") }, indeks), true);
assert.equal(waliDari("105", { kelasUtama: "X-A/1" }, indeks), false, "harus memakai kunci ter-encode");
// daftar binaan
assert.deepEqual(kelasBinaan(dua), ["XI", "XII"]);
assert.deepEqual(kelasBinaan({}), []);
assert.deepEqual(kelasBinaan({ kelasUtama: "X", kelasTambahan: { X: true, XI: true, XII: false } }), ["X", "XI"], "tanpa duplikat; false diabaikan");
assert.deepEqual(siswaBinaan(utamaX, indeks).sort(), ["101", "102"]);
assert.deepEqual(siswaBinaan(dua, indeks).sort(), ["103", "104"]);
// peringatan "kelas sudah ada walinya"
const daftar = { a: { kelasUtama: "X", aktif: true }, b: { kelasUtama: "XI", kelasTambahan: { X: true }, aktif: true }, c: { kelasUtama: "X", aktif: false } };
assert.deepEqual(waliPemegangKelas("X", daftar).map(([u]) => u).sort(), ["a", "b"], "nonaktif tidak dihitung");
assert.deepEqual(waliPemegangKelas("X", daftar, "a").map(([u]) => u), ["b"], "kecuali diri sendiri");
assert.deepEqual(waliPemegangKelas("XII", daftar), []);
// beda indeks (migrasi)
const d = bedaIndeks([{ nis: "101", kelas: "X" }, { nis: "103", kelas: "XII" }, { nis: "200", kelas: "X" }], { 101: "X", 103: "XI", 300: "X" });
assert.deepEqual(d, { baru: ["200"], berubah: ["103"], sama: ["101"], usang: ["300"] });
console.log("wali.test: OK");
