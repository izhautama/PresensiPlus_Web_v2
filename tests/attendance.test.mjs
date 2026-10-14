// Uji unit perhitungan kehadiran: Dispensasi (mewakili sekolah) DIHITUNG HADIR dalam persentase.
import assert from "node:assert/strict";
import { kategori, rekap } from "../src/lib/attendance.ts";

const NOW = new Date("2026-11-30T09:00:00Z"); // jauh setelah tanggal uji: semua hari sudah "lewat"
const rec = (o) => o;
// Senin 12 Okt .. Sabtu 17 Okt 2026, Minggu 18 Okt (libur)
const records = {
  "2026-10-12": rec({ masuk: "07:00:00", status: "Hadir" }),
  "2026-10-13": rec({ masuk: "07:30:00", status: "Terlambat" }),
  "2026-10-14": rec({ ket: "Izin" }),
  "2026-10-15": rec({ ket: "Sakit" }),
  "2026-10-16": rec({ ket: "Dispensasi" }),
  // 2026-10-17 (Sabtu): tidak ada data -> Alpha
  "2026-10-18": rec({ ket: "Dispensasi" }), // Minggu: libur, harus diabaikan
};

assert.equal(kategori(records["2026-10-16"], "2026-10-16", [], "X", NOW), "Dispensasi");
assert.equal(kategori(records["2026-10-18"], "2026-10-18", [], "X", NOW), "Libur");
assert.equal(kategori(undefined, "2026-10-17", [], "X", NOW), "Alpha");

const r = rekap(records, "2026-10-12", "2026-10-18", [], "X", NOW);
assert.deepEqual({ H: r.Hadir, T: r.Terlambat, I: r.Izin, S: r.Sakit, D: r.Dispensasi, A: r.Alpha, E: r.Efektif },
  { H: 1, T: 1, I: 1, S: 1, D: 1, A: 1, E: 6 }, "Minggu tidak dihitung hari efektif");
assert.equal(r.Persen, 50, "hadir = Hadir + Terlambat + Dispensasi = 3 dari 6 = 50%");

// tanpa Dispensasi hasilnya lebih rendah: bukti Dispensasi memang ikut sebagai hadir
const tanpaDisp = { ...records, "2026-10-16": rec({ ket: "Izin" }) };
assert.equal(rekap(tanpaDisp, "2026-10-12", "2026-10-18", [], "X", NOW).Persen, 33.3);

// Dispensasi + tap tetap Hadir (siswa tap lalu berangkat lomba): tidak dihitung ganda
const dispTap = { "2026-10-12": rec({ masuk: "07:00:00", status: "Hadir", ket: "Dispensasi" }) };
const r2 = rekap(dispTap, "2026-10-12", "2026-10-12", [], "X", NOW);
assert.deepEqual({ H: r2.Hadir, D: r2.Dispensasi, E: r2.Efektif, P: r2.Persen }, { H: 1, D: 0, E: 1, P: 100 });

// seluruh hari Dispensasi -> 100%
const semua = Object.fromEntries(["12", "13", "14", "15", "16", "17"].map((d) => [`2026-10-${d}`, rec({ ket: "Dispensasi" })]));
assert.equal(rekap(semua, "2026-10-12", "2026-10-17", [], "X", NOW).Persen, 100);

console.log("attendance.test: OK");
