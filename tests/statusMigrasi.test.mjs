// Uji unit STATUS MIGRASI KALENDER v2.5.2 (lib/statusMigrasi.ts): penanda, terdeteksi dari data, atau belum.
import assert from "node:assert/strict";
import { statusMigrasi } from "../src/lib/statusMigrasi.ts";

const P = { oleh: "u1", ts: 1, dari: "2026-07-01", sampai: "2026-10-26" };
const semua = { 1001: { aktifSejak: "2026-07-13" }, 1002: { aktifSejak: "2026-07-13" }, 1003: { aktifSejak: "2026-07-14" } };
const s = (o) => statusMigrasi({ penanda: null, profil: semua, jumlahRingkasan: 45, ...o });

assert.equal(s({}), "terdeteksi", "tanpa penanda, semua profil punya aktifSejak, kalenderEfektif berisi -> terdeteksi");
assert.equal(s({ penanda: P }), "penanda", "penanda ada -> penanda (menang atas deteksi)");
assert.equal(s({ penanda: P, profil: {}, jumlahRingkasan: 0 }), "penanda", "penanda ada walau data kosong");
assert.equal(s({ penanda: undefined }), "terdeteksi", "penanda undefined sama dengan tidak ada");

// satu profil tanpa aktifSejak -> belum
assert.equal(s({ profil: { ...semua, 1004: { nama: "x" } } }), "belum", "satu profil tanpa aktifSejak -> belum");
assert.equal(s({ profil: { ...semua, 1004: {} } }), "belum", "profil kosong -> belum");
assert.equal(s({ profil: { ...semua, 1004: null } }), "belum", "profil null -> belum");
assert.equal(s({ profil: { ...semua, 1004: { aktifSejak: "" } } }), "belum", "aktifSejak string kosong -> belum");
assert.equal(s({ profil: { ...semua, 1004: { aktifSejak: "13-07-2026" } } }), "belum", "format tanggal salah -> belum");
assert.equal(s({ profil: { ...semua, 1004: { aktifSejak: 20260713 } } }), "belum", "bukan string -> belum");

// kalenderEfektif kosong -> belum
assert.equal(s({ jumlahRingkasan: 0 }), "belum", "kalenderEfektif kosong -> belum");
assert.equal(s({ jumlahRingkasan: 1 }), "terdeteksi", "satu entri cukup");

// tidak ada profil -> belum (jangan menyimpulkan dari data kosong)
assert.equal(s({ profil: {} }), "belum", "tanpa profil -> belum");
assert.equal(s({ profil: null }), "belum", "profil null -> belum");
assert.equal(s({ profil: undefined }), "belum", "profil undefined -> belum");

console.log("statusMigrasi: OK");
