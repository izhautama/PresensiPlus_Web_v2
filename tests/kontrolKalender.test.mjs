// Uji unit KONTROL KALENDER v2.5.2 (lib/kontrolKalender.ts): kandidat tanggal merah/kegiatan yang belum ditandai Wakasis.
import assert from "node:assert/strict";
import { awalTahunAjaran, kontrolKalender } from "../src/lib/kontrolKalender.ts";

const H = (o = {}) => ({ efektif: true, tap: 5, manual: 0, sumber: "otomatis", normal: false, rendah: false, dihitung: 1, ...o });
// 2026-07-01 Rabu; rentang untuk hariIni 2026-07-08 = 01..07 Juli (Rab Kam Jum Sab Min Sen Sel)
const HARI_INI = "2026-07-08";

assert.equal(awalTahunAjaran("2026-10-27"), "2026-07-01", "Okt 2026 -> TA 2026/2027 mulai 1 Juli 2026");
assert.equal(awalTahunAjaran("2027-03-10"), "2026-07-01", "Mar 2027 -> TA masih 2026/2027");
assert.equal(awalTahunAjaran("2026-07-01"), "2026-07-01", "1 Juli = awal TA baru");
assert.equal(awalTahunAjaran("2026-06-30"), "2025-07-01", "30 Juni masih TA sebelumnya");

// tanpa data sama sekali: semua hari kerja belum dihitung, Minggu 05 diabaikan, tidak ada kandidat
let h = kontrolKalender({ peta: {}, override: {}, hariIni: HARI_INI });
assert.deepEqual(h.kandidat, []);
assert.deepEqual(h.belumDihitung, ["2026-07-01", "2026-07-02", "2026-07-03", "2026-07-04", "2026-07-06", "2026-07-07"], "Minggu diabaikan; hari tanpa ringkasan = belum dihitung");
assert.equal(h.awal, "2026-07-01"); assert.equal(h.akhir, "2026-07-07", "rentang berakhir kemarin");

// kandidat: tap 0 & manual 0, bukan Minggu, tanpa override
h = kontrolKalender({
  hariIni: HARI_INI, override: {},
  peta: { "2026-07-01": H(), "2026-07-02": H({ tap: 0, efektif: false }), "2026-07-03": H({ tap: 0, manual: 2 }), "2026-07-04": H({ tap: 0, manual: 0, efektif: false }),
          "2026-07-05": H({ tap: 0, efektif: false }), "2026-07-06": H({ tap: 3 }), "2026-07-07": H({ tap: 0, manual: 0, efektif: false }) },
});
assert.deepEqual(h.kandidat, ["2026-07-02", "2026-07-04", "2026-07-07"], "hanya tap 0 & manual 0; Minggu (05) tidak pernah kandidat");
assert.deepEqual(h.belumDihitung, []);

// hari dengan tap ATAU manual tidak jadi kandidat
h = kontrolKalender({ hariIni: HARI_INI, override: {}, peta: { "2026-07-02": H({ tap: 1, manual: 0 }), "2026-07-03": H({ tap: 0, manual: 1 }) } });
assert.ok(!h.kandidat.includes("2026-07-02") && !h.kandidat.includes("2026-07-03"));

// override (libur maupun efektif) mengeluarkan hari dari kandidat dan dari belumDihitung
h = kontrolKalender({
  hariIni: HARI_INI,
  override: { "2026-07-02": { status: "libur", alasan: "x" }, "2026-07-04": { status: "efektif", alasan: "y" } },
  peta: { "2026-07-02": H({ tap: 0, efektif: false }), "2026-07-04": H({ tap: 0, efektif: false }), "2026-07-07": H({ tap: 0, efektif: false }) },
});
assert.deepEqual(h.kandidat, ["2026-07-07"], "tanggal ber-override tidak diperingatkan lagi");
assert.ok(!h.belumDihitung.includes("2026-07-02") && !h.belumDihitung.includes("2026-07-04"));

// ringkasan bersumber override dilewati walau tap 0
h = kontrolKalender({ hariIni: HARI_INI, override: {}, peta: { "2026-07-02": H({ tap: 0, sumber: "override", efektif: false }) } });
assert.ok(!h.kandidat.includes("2026-07-02"), "ringkasan sumber override tidak jadi kandidat");

// hari tanpa ringkasan TIDAK dituduh: dilaporkan terpisah
h = kontrolKalender({ hariIni: HARI_INI, override: {}, peta: { "2026-07-01": H(), "2026-07-02": H() } });
assert.deepEqual(h.kandidat, []);
assert.deepEqual(h.belumDihitung, ["2026-07-03", "2026-07-04", "2026-07-06", "2026-07-07"]);

// batas tahun ajaran: tanggal sebelum 1 Juli tidak ikut walau ada di peta; hari ini sendiri tidak ikut
h = kontrolKalender({ hariIni: HARI_INI, override: {}, peta: { "2026-06-30": H({ tap: 0, efektif: false }), "2026-07-08": H({ tap: 0, efektif: false }) } });
assert.ok(!h.kandidat.includes("2026-06-30") && !h.kandidat.includes("2026-07-08"), "di luar [awal TA, kemarin] diabaikan");
// 1 Juli sebagai hariIni: rentang kosong
h = kontrolKalender({ hariIni: "2026-07-01", override: {}, peta: {} });
assert.deepEqual(h.kandidat, []); assert.deepEqual(h.belumDihitung, []);
// null/undefined aman
h = kontrolKalender({ hariIni: HARI_INI, peta: null, override: undefined });
assert.equal(h.kandidat.length, 0); assert.equal(h.belumDihitung.length, 6);

console.log("kontrolKalender: semua uji lolos");
