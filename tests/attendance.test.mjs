// Uji unit kehadiran: Dispensasi (mewakili sekolah) DIHITUNG HADIR dalam persentase. Memakai rekapSiswa (satu-satunya rumus).
import assert from "node:assert/strict";
import { kategori } from "../src/lib/attendance.ts";
import { rekapSiswa } from "../src/lib/hariEfektif.ts";

const NOW = new Date("2026-11-30T09:00:00Z"); // jauh setelah tanggal uji: semua hari sudah "lewat"
// Senin 12 Okt .. Sabtu 17 Okt 2026 = hari efektif; Minggu 18 Okt bukan
const peta = Object.fromEntries(["12", "13", "14", "15", "16", "17"].map((d) => [`2026-10-${d}`, { efektif: true, tap: 30, manual: 0, sumber: "otomatis" }]));
const records = {
  "2026-10-12": { masuk: "07:00:00", status: "Hadir" },
  "2026-10-13": { masuk: "07:30:00", status: "Terlambat" },
  "2026-10-14": { ket: "Izin" },
  "2026-10-15": { ket: "Sakit" },
  "2026-10-16": { ket: "Dispensasi" },
  // 2026-10-17 (Sabtu): tidak ada data -> Alpha (hari efektif)
  "2026-10-18": { ket: "Dispensasi" }, // Minggu: bukan hari efektif, harus diabaikan
};
const rekap = (att, awal = "2026-10-12", akhir = "2026-10-18") => rekapSiswa({ hariEfektif: peta, attendance: att, schedule: [], kelas: "X", awal, akhir, now: NOW });

assert.equal(kategori(records["2026-10-16"], "2026-10-16", [], "X", NOW), "Dispensasi");
assert.equal(kategori(records["2026-10-18"], "2026-10-18", [], "X", NOW), "Libur");
assert.equal(kategori(undefined, "2026-10-17", [], "X", NOW), "Alpha");

const r = rekap(records);
assert.deepEqual({ H: r.Hadir, T: r.Terlambat, I: r.Izin, S: r.Sakit, D: r.Dispensasi, A: r.Alpha, E: r.Efektif },
  { H: 1, T: 1, I: 1, S: 1, D: 1, A: 1, E: 6 }, "Minggu tidak dihitung hari efektif");
assert.equal(r.Persen, 50, "hadir = Hadir + Terlambat + Dispensasi = 3 dari 6 = 50%");
assert.equal(r.Efektif, r.Hadir + r.Terlambat + r.Izin + r.Sakit + r.Dispensasi + r.Alpha, "identitas penjumlahan");

// tanpa Dispensasi hasilnya lebih rendah: bukti Dispensasi memang ikut sebagai hadir
assert.equal(rekap({ ...records, "2026-10-16": { ket: "Izin" } }).Persen, 33.3);

// Dispensasi + tap tetap Hadir (siswa tap lalu berangkat lomba): tidak dihitung ganda
const r2 = rekap({ "2026-10-12": { masuk: "07:00:00", status: "Hadir", ket: "Dispensasi" } }, "2026-10-12", "2026-10-12");
assert.deepEqual({ H: r2.Hadir, D: r2.Dispensasi, E: r2.Efektif, P: r2.Persen }, { H: 1, D: 0, E: 1, P: 100 });

// seluruh hari Dispensasi -> 100%
const semua = Object.fromEntries(["12", "13", "14", "15", "16", "17"].map((d) => [`2026-10-${d}`, { ket: "Dispensasi" }]));
assert.equal(rekap(semua, "2026-10-12", "2026-10-17").Persen, 100);

console.log("attendance.test: OK");
