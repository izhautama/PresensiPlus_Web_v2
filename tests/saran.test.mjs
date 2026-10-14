// Uji unit logika saran otomatis (tanpa emulator).
import assert from "node:assert/strict";
import { hitungSaran } from "../src/lib/saran.ts";

const RULES = {
  rTerlambat: { kategori: "Ringan", nama: "Datang terlambat", poin: 5, aktif: true },
  rPulang: { kategori: "Ringan", nama: "Tidak tap pulang", poin: 5, aktif: true },
  rBolos: { kategori: "Sedang", nama: "Tidak masuk kelas", poin: 30, aktif: true },
};
const AUTO = { terlambat: "rTerlambat", tanpaTapPulang: "rPulang", bolosJam: "rBolos" }; // alfa sengaja kosong
const SISWA = [
  { nis: "1", nama: "ANDI", kelas: "X" }, { nis: "2", nama: "BUDI", kelas: "X" }, { nis: "3", nama: "CITRA", kelas: "X" },
  { nis: "4", nama: "DINA", kelas: "X" }, { nis: "5", nama: "EKO", kelas: "X" },
];
const M = (uid, nis, jam, status = "Hadir") => ({ [`${uid}_M`]: { jam, nis, status } });
const P = (uid, nis, jam) => ({ [`${uid}_P`]: { jam, nis, status: "Pulang" } });
const lessons = (absen, meta = {}) => ({ X: { meta, absen } });

// 2026-10-13 Selasa, 2026-10-14 Rabu, 2026-10-18 Minggu
const hitung = (o) => hitungSaran({
  tanggal: ["2026-10-13", "2026-10-14"], today: "2026-10-14", nowHM: "16:00", siswa: SISWA, data: {}, autoMap: AUTO, rules: RULES,
  putusan: {}, records: {}, batasPulang: () => "15:00", ...o,
});
const ringkas = (s) => s.map((x) => `${x.tanggal}:${x.tipe}:${x.nis}`).sort();

// ---- dasar: terlambat
{
  const s = hitung({ data: { "2026-10-13": { log: { ...M("A1", "1", "07:30:00", "Terlambat"), ...P("A1", "1", "15:00:00") } } } });
  assert.deepEqual(ringkas(s), ["2026-10-13:terlambat:1"]);
  assert.equal(s[0].recId, "2026-10-13_terlambat");
  assert.equal(s[0].ruleId, "rTerlambat");
}

// ---- tanpaTapPulang: muncul bila tap masuk, tidak tap pulang, tanpa izin
{
  const s = hitung({ data: { "2026-10-13": { log: M("A1", "1", "07:00:00") } } });
  assert.deepEqual(ringkas(s), ["2026-10-13:tanpaTapPulang:1"]);
}
// ... TIDAK muncul bila ada sel S, I, atau D di jam mana pun (izin pulang awal)
for (const kode of ["S", "I", "D"]) {
  const s = hitung({ data: { "2026-10-13": { log: M("A1", "1", "07:00:00"), lessons: lessons({ 1: { 6: kode } }) } } });
  assert.deepEqual(ringkas(s), [], `sel ${kode} -> tanpaTapPulang tidak disarankan`);
}
// ... TIDAK muncul bila ada keterangan harian Izin/Sakit
for (const ket of ["Izin", "Sakit"]) {
  const s = hitung({ data: { "2026-10-13": { log: M("A1", "1", "07:00:00"), izin: { 1: ket } } } });
  assert.deepEqual(ringkas(s), [], `ket harian ${ket} -> tanpaTapPulang tidak disarankan`);
}
// ... tetap muncul bila yang ada hanya sel A (bukan izin pulang awal) -- dan A memicu bolosJam
{
  const s = hitung({ data: { "2026-10-13": { log: M("A1", "1", "07:00:00"), lessons: lessons({ 1: { 2: "A" } }, { 2: { mapel: "Matematika" } }) } } });
  assert.deepEqual(ringkas(s), ["2026-10-13:bolosJam:1", "2026-10-13:tanpaTapPulang:1"]);
  assert.match(s.find((x) => x.tipe === "bolosJam").detail, /jam ke-2 \(Matematika\)/);
}
// ... sudah tap pulang -> tidak ada
{
  const s = hitung({ data: { "2026-10-13": { log: { ...M("A1", "1", "07:00:00"), ...P("A1", "1", "15:05:00") } } } });
  assert.deepEqual(ringkas(s), []);
}

// ---- bolosJam hanya dari sel A, dan hanya bila siswa sudah tap masuk
{
  const tapPulang = { ...P("A1", "1", "15:00:00") };
  const hanyaSID = hitung({ data: { "2026-10-13": { log: { ...M("A1", "1", "07:00:00"), ...tapPulang }, lessons: lessons({ 1: { 3: "S", 4: "I", 5: "D" } }) } } });
  assert.deepEqual(ringkas(hanyaSID), [], "sel S/I/D tidak memicu bolosJam");
  const adaA = hitung({ data: { "2026-10-13": { log: { ...M("A1", "1", "07:00:00"), ...tapPulang }, lessons: lessons({ 1: { 3: "A", 4: "A" } }) } } });
  assert.deepEqual(ringkas(adaA), ["2026-10-13:bolosJam:1"], "beberapa sel A -> satu saran per siswa/hari");
  const tanpaTap = hitung({ data: { "2026-10-13": { lessons: lessons({ 1: { 3: "A" } }) } } });
  assert.deepEqual(ringkas(tanpaTap), [], "A tanpa tap masuk bukan bolos jam");
}

// ---- alfa: tanpa autoMap.alfa tidak ada saran; dengan autoMap ada
{
  const data = { "2026-10-13": { validasi: { 5: { status: "Alfa" } } } };
  assert.deepEqual(ringkas(hitung({ data })), [], "autoMap.alfa kosong -> tidak ada saran");
  const s = hitung({ data, autoMap: { ...AUTO, alfa: "rBolos" } });
  assert.deepEqual(ringkas(s), ["2026-10-13:alfa:5"]);
}

// ---- hari ini: saran pulang menunggu jendela pulang berakhir
{
  const data = { "2026-10-14": { log: M("A1", "1", "07:00:00") } };
  assert.deepEqual(ringkas(hitung({ data, nowHM: "14:00" })), [], "sebelum jendela pulang berakhir");
  assert.deepEqual(ringkas(hitung({ data, nowHM: "15:01" })), ["2026-10-14:tanpaTapPulang:1"], "setelah jendela pulang berakhir");
}

// ---- Minggu (libur): tidak ada saran apa pun, walau ada data
{
  const data = { "2026-10-18": { log: M("A1", "1", "07:30:00", "Terlambat"), validasi: { 5: { status: "Alfa" } }, lessons: lessons({ 1: { 2: "A" } }) } };
  const s = hitung({ tanggal: ["2026-10-17", "2026-10-18"], today: "2026-10-18", data, autoMap: { ...AUTO, alfa: "rBolos" } });
  assert.deepEqual(s, [], "hari Minggu: tidak ada saran");
}
// ---- tanggal mendatang diabaikan
assert.deepEqual(hitung({ tanggal: ["2026-10-15"], data: { "2026-10-15": { log: M("A1", "1", "07:30:00", "Terlambat") } } }), []);

// ---- sudah diputuskan / sudah tercatat tidak muncul lagi
{
  const data = { "2026-10-13": { log: M("A1", "1", "07:30:00", "Terlambat") } };
  assert.equal(hitung({ data }).length, 2, "terlambat + tanpaTapPulang");
  assert.deepEqual(ringkas(hitung({ data, putusan: { "2026-10-13": { terlambat_1: { keputusan: "diabaikan" } } } })), ["2026-10-13:tanpaTapPulang:1"]);
  assert.deepEqual(ringkas(hitung({ data, records: { 1: { "2026-10-13_terlambat": {}, "2026-10-13_tanpaTapPulang": {} } } })), []);
}

// ---- aturan kosong / nonaktif -> tidak ditampilkan
{
  const data = { "2026-10-13": { log: M("A1", "1", "07:30:00", "Terlambat") } };
  assert.deepEqual(ringkas(hitung({ data, autoMap: { tanpaTapPulang: "rPulang" } })), ["2026-10-13:tanpaTapPulang:1"], "autoMap.terlambat kosong");
  assert.deepEqual(ringkas(hitung({ data, rules: { ...RULES, rPulang: { ...RULES.rPulang, aktif: false } } })), ["2026-10-13:terlambat:1"], "aturan nonaktif");
  assert.deepEqual(ringkas(hitung({ data, autoMap: { terlambat: "tidakAda" } })), [], "ruleId tidak ada");
}

console.log("saran.test: OK");
