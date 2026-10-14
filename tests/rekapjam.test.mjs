// Uji unit rekap kehadiran per jam: hari Minggu diabaikan.
import assert from "node:assert/strict";
import { rekapPerJam } from "../src/lib/rekapJam.ts";
import { weekday } from "../src/lib/time.ts";

// 2026-10-18 = Minggu, 2026-10-19 = Senin
assert.equal(weekday("2026-10-18"), 0);
assert.equal(weekday("2026-10-19"), 1);

const kelas = (absen, meta) => ({ "X-A": { absen, meta } });
const lessons = {
  "2026-10-17": kelas({ 1001: { 1: "A", 2: "S" } }, { 1: { mapel: "Fikih" } }), // Sabtu
  "2026-10-18": kelas({ 1001: { 1: "A", 2: "A", 3: "I" }, 1002: { 1: "A" } }, { 1: { mapel: "Fikih" } }), // Minggu: diabaikan
  "2026-10-19": kelas({ 1001: { 1: "D" } }), // Senin
};
const m = rekapPerJam(lessons);
const a = m.get("1001");
assert.deepEqual({ A: a.A, I: a.I, S: a.S, D: a.D }, { A: 1, I: 0, S: 1, D: 1 }, "sel Minggu tidak boleh dihitung");
assert.deepEqual([...a.mapelA], [["Fikih", 1]]);
assert.equal(m.has("1002"), false, "siswa yang hanya punya sel di hari Minggu tidak muncul");

// hanya Minggu -> kosong
assert.equal(rekapPerJam({ "2026-10-18": kelas({ 1001: { 1: "A" } }) }).size, 0);
// tanpa nama mapel
assert.deepEqual([...rekapPerJam({ "2026-10-19": kelas({ 1: { 1: "A" } }) }).get("1").mapelA], [["(mapel tidak diisi)", 1]]);
console.log("rekapjam: ok");
