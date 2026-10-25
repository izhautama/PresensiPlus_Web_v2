// Uji unit v2.5: hierarki baca pembinaan, koreksi, proyeksi & izin orang tua, pengelompokan klaim BK, daftarPerluDibina untuk pj "bk".
import assert from "node:assert/strict";
import {
  PERINGKAT, bolehBeriIzin, bolehCabutIzin, bolehKoreksi, daftarPerluDibina, kelompokBaca, kelompokPj, proyeksiOrtu, penanggungJawabBawaan,
} from "../src/lib/pembinaan.ts";

// ---- peringkat & kelompok baca (§2)
assert.deepEqual(PERINGKAT, { wali: 1, bk: 2, waka: 3, kepala: 4 });
assert.deepEqual(kelompokBaca("wali"), ["wali"]);
assert.deepEqual(kelompokBaca("bk"), ["wali", "bk"]);
assert.deepEqual(kelompokBaca("waka"), ["wali", "bk"], "waka TIDAK membaca kelompok kepala");
assert.deepEqual(kelompokBaca("kepala"), ["wali", "bk", "kepala"]);
for (const p of ["admin", "piket", "ortu", "", null, undefined]) assert.deepEqual(kelompokBaca(p), [], `${p}: tidak membaca pembinaan`);
assert.equal(kelompokPj("waka"), "kepala", "nilai lama waka dibaca sebagai kepala");
assert.equal(kelompokPj(undefined), "kepala");
assert.equal(kelompokPj("bk"), "bk");

// ---- koreksi sesudah selesai: hanya peringkat lebih tinggi; waka tidak menyentuh pj kepala
assert.equal(bolehKoreksi("waka", "wali"), true);
assert.equal(bolehKoreksi("waka", "bk"), true);
assert.equal(bolehKoreksi("waka", "kepala"), false);
assert.equal(bolehKoreksi("kepala", "kepala"), false, "peringkat sama tidak 'lebih tinggi'; kepala mengubah miliknya lewat jalur penulis");
assert.equal(bolehKoreksi("kepala", "bk"), true);
assert.equal(bolehKoreksi("bk", "wali"), false, "BK tidak mengoreksi record selesai");
assert.equal(bolehKoreksi("wali", "wali"), false);

// ---- bawaan penanggung jawab v2.5
assert.equal(penanggungJawabBawaan("lv04", { poin: 400 }), "kepala");
assert.equal(penanggungJawabBawaan("lv06", { poin: 600 }), "kepala");
assert.equal(penanggungJawabBawaan("lv01", { poin: 100 }), "wali");
assert.equal(penanggungJawabBawaan("lv02", { poin: 200 }), "bk");

// ---- proyeksi orang tua (§5.1): ringkas tanpa isi; lengkap + tindakan/hasil/tindak lanjut; tanpa pembina/uid/klaim
const pb = { status: "selesai", tanggal: "2026-10-20", levelPoin: 100, tindakan: "Teguran 1", hasil: "Sudah dinasihati dengan baik", tindakLanjut: "Pantau 2 minggu", oleh: "uid1", olehNama: "Pak Wali" };
const r1 = proyeksiOrtu(pb, "ringkas");
assert.deepEqual(r1, { status: "selesai", tanggal: "2026-10-20", levelPoin: 100, mode: "ringkas" });
const r2 = proyeksiOrtu(pb, "lengkap");
assert.deepEqual(r2, { status: "selesai", tanggal: "2026-10-20", levelPoin: 100, mode: "lengkap", tindakan: "Teguran 1", hasil: "Sudah dinasihati dengan baik", tindakLanjut: "Pantau 2 minggu" });
for (const r of [r1, r2]) { assert.ok(!("oleh" in r) && !("olehNama" in r)); assert.ok(!JSON.stringify(r).includes("Pak Wali")); }
assert.ok(!("tindakLanjut" in proyeksiOrtu({ ...pb, tindakLanjut: undefined }, "lengkap")), "tindak lanjut kosong tidak ditulis");

// ---- izin: waka hanya wali/bk dan tidak terkunci; kepala semua (§5.2)
assert.equal(bolehBeriIzin("waka", "wali", false), true);
assert.equal(bolehBeriIzin("waka", "bk", false), true);
assert.equal(bolehBeriIzin("waka", "kepala", false), false);
assert.equal(bolehBeriIzin("waka", "wali", true), false, "terkunci");
assert.equal(bolehBeriIzin("kepala", "kepala", true), true);
assert.equal(bolehCabutIzin("kepala", { olehPeran: "waka", olehUid: "w1" }, "k1", false), true);
assert.equal(bolehCabutIzin("waka", { olehPeran: "waka", olehUid: "w1" }, "w1", false), true);
assert.equal(bolehCabutIzin("waka", { olehPeran: "waka", olehUid: "w2" }, "w1", false), false, "izin waka lain");
assert.equal(bolehCabutIzin("waka", { olehPeran: "kepala", olehUid: "k1" }, "w1", false), false, "izin kepala");
assert.equal(bolehCabutIzin("waka", { olehPeran: "waka", olehUid: "w1" }, "w1", true), false, "terkunci");

// ---- daftar perlu dibina untuk BK (lv02) tetap tampil sampai pembinaan selesai, walau saldo turun (§3.4)
const TA = "2026-2027";
const levels = { lv01: { poin: 100, tindakan: "T1", penanggungJawab: "wali" }, lv02: { poin: 200, tindakan: "T2", penanggungJawab: "bk" }, lv03: { poin: 300, tindakan: "T3", penanggungJawab: "kepala" } };
const rec = (poin, jenis = "pelanggaran", tanggal = "2026-08-01") => ({ jenis, nama: "x", poin, tanggal, ta: TA, sumber: "manual" });
const naik = { a: rec(120), b: rec(100, "pelanggaran", "2026-08-02") };                                  // 220
const turun = { ...naik, c: rec(150, "remisi", "2026-08-03") };                                          // puncak 220, saldo 70
let d = daftarPerluDibina([{ nis: "1", recs: naik, pembinaan: {} }], levels, TA, "bk");
assert.deepEqual(d.map((x) => x.levelId), ["lv02"]);
d = daftarPerluDibina([{ nis: "1", recs: turun, pembinaan: {} }], levels, TA, "bk");
assert.equal(d.length, 1); assert.equal(d[0].saldoTurun, true);
const selesai = { [`${TA}_lv02`]: { ta: TA, levelId: "lv02", status: "selesai" } };
assert.equal(daftarPerluDibina([{ nis: "1", recs: turun, pembinaan: selesai }], levels, TA, "bk").length, 0);
assert.deepEqual(daftarPerluDibina([{ nis: "1", recs: naik, pembinaan: {} }], levels, TA, "wali").map((x) => x.levelId), ["lv01"], "wali tidak melihat ambang BK");

console.log("bk.test: semua lolos");
