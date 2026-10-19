// Uji kode per jam TURUNAN dari status harian (v2.3.1): Alfa seharian -> A jam 1-9; Izin/Sakit/Dispensasi seharian -> I/S/D.
import assert from "node:assert/strict";
import { barisHariSiswa, kodeTampil, turunanDariKategori, turunanSiswa } from "../src/lib/turunan.ts";

const wib = (iso) => new Date(`${iso}+07:00`);
const HARI = "2026-10-14"; // Rabu
const SEKARANG_SORE = wib("2026-10-14T16:00:00");
const SEKARANG_PAGI = wib("2026-10-14T06:00:00");
const BESOK = wib("2026-10-15T09:00:00");
const efektif = (...tgl) => Object.fromEntries(tgl.map((t) => [t, { efektif: true, tap: 6, manual: 0, sumber: "otomatis", dihitung: 1 }]));
const dasar = { tanggal: HARI, kelas: "X IPA", schedule: [], hariEfektif: efektif(HARI), now: BESOK };
const alat = { masuk: "06:55:00", status: "Hadir", pulang: "15:00:00" };

// ---- kategori -> turunan
assert.deepEqual(turunanDariKategori("Alpha"), { kode: "A", label: "Alfa seharian (otomatis)", sumber: "alfa-seharian" });
assert.equal(turunanDariKategori("Izin").kode, "I");
assert.equal(turunanDariKategori("Sakit").kode, "S");
assert.equal(turunanDariKategori("Dispensasi").kode, "D");
for (const k of ["Hadir", "Terlambat", "BelumTap", "TidakEfektif", undefined, null]) assert.equal(turunanDariKategori(k), null, `tanpa turunan: ${k}`);

// ---- hari lampau efektif tanpa tap/manual/keterangan = Alfa seharian: A jam 1-9
let t = turunanSiswa(dasar);
assert.equal(t?.kode, "A"); assert.equal(t?.label, "Alfa seharian (otomatis)");

// ---- keterangan harian (izin/{tgl}/{nis} atau attendance ket) -> I/S/D
assert.equal(turunanSiswa({ ...dasar, izin: "Izin" })?.kode, "I");
assert.equal(turunanSiswa({ ...dasar, izin: "Sakit" })?.kode, "S");
assert.equal(turunanSiswa({ ...dasar, izin: "Dispensasi" })?.kode, "D");
assert.equal(turunanSiswa({ ...dasar, alat: { ket: "Sakit" } })?.kode, "S", "ket di attendance juga");
assert.equal(turunanSiswa({ ...dasar, alat: { ket: "Izin" }, izin: "Sakit" })?.kode, "I", "attendance/ket menang atas izin/ (rumus rekap yang sama)");

// ---- HILANG begitu ada tap alat (hadir atau terlambat)
assert.equal(turunanSiswa({ ...dasar, alat }), null, "tap alat -> tidak ada turunan");
assert.equal(turunanSiswa({ ...dasar, alat: { masuk: "07:40:00", status: "Terlambat" } }), null);
// ... atau presensi manual
assert.equal(turunanSiswa({ ...dasar, manual: { masuk: "07:10:00", status: "Hadir", alasan: "Lupa KTM", oleh: "u", ts: 1, hariKe: 1 } }), null, "presensi manual -> tidak ada turunan");
// ... tap alat menang walau ada keterangan (hadir): tidak ada turunan
assert.equal(turunanSiswa({ ...dasar, alat, izin: "Izin" }), null, "hadir + keterangan: hadir menang");

// ---- hari yang bukan hari efektif / siswa belum aktif: tidak ada turunan
assert.equal(turunanSiswa({ ...dasar, hariEfektif: { [HARI]: { efektif: false, tap: 0, manual: 0, sumber: "override", dihitung: 1 } } }), null, "libur");
assert.equal(turunanSiswa({ ...dasar, hariEfektif: {} }), null, "tanpa ringkasan hari efektif (bukan bukti): bukan hari efektif");
assert.equal(turunanSiswa({ ...dasar, aktifSejak: "2026-10-15" }), null, "siswa baru: belum dihitung pada tanggal ini");
assert.equal(turunanSiswa({ ...dasar, hariEfektif: { [HARI]: { efektif: false, tap: 0, manual: 0, sumber: "override", dihitung: 1 } }, izin: "Sakit" }), null, "keterangan pada hari libur: tidak diturunkan");

// ---- HARI INI: sebelum batas jam terlambat = "Belum tap" (bisa diisi biasa); setelahnya Alfa seharian
const hariIni = { ...dasar, now: SEKARANG_PAGI };
assert.equal(barisHariSiswa(hariIni)?.kategori, "BelumTap");
assert.equal(turunanSiswa(hariIni), null, "sebelum batas jam terlambat: tidak ada turunan");
assert.equal(turunanSiswa({ ...hariIni, now: wib("2026-10-14T07:30:00") }), null, "masih dalam jendela terlambat");
const sore = { ...dasar, now: SEKARANG_SORE };
assert.equal(barisHariSiswa(sore)?.kategori, "Alpha");
assert.equal(turunanSiswa(sore)?.kode, "A", "setelah batas jam terlambat: Alfa seharian");
// lalu siswa tap -> turunan hilang
assert.equal(turunanSiswa({ ...sore, alat: { masuk: "15:00:00", status: "Terlambat" } }), null, "tap kemudian: hilang otomatis");
// hari ini tanpa ringkasan efektif: hanya efektif bila siswa sudah tercatat hadir -> tidak ada Alfa turunan
assert.equal(turunanSiswa({ ...sore, hariEfektif: {} }), null);

// ---- tanggal mendatang: tidak ada baris
assert.equal(barisHariSiswa({ ...dasar, tanggal: "2026-10-16", now: SEKARANG_SORE }), undefined);
assert.equal(turunanSiswa({ ...dasar, tanggal: "2026-10-16", hariEfektif: efektif("2026-10-16"), now: SEKARANG_SORE }), null);

// ---- kode yang ditampilkan: turunan menang atas isi tersimpan; tanpa turunan memakai isi tersimpan
assert.equal(kodeTampil({ kode: "A", label: "x", sumber: "alfa-seharian" }, "S"), "A");
assert.equal(kodeTampil({ kode: "I", label: "x", sumber: "keterangan-harian" }, ""), "I");
assert.equal(kodeTampil(null, "D"), "D");
assert.equal(kodeTampil(null, ""), "");

console.log("turunan.test: OK");
