// Uji unit aturan piket (tanpa emulator).
import assert from "node:assert/strict";
import { bolehDicatatPiket, hariKeDariTanggal, hariKeSekarang, ketBolehUntuk, opsiKet, rentangPiket, tanggalDiJendela } from "../src/lib/piket.ts";

// hariKe tanggal kalender == hariKe "sekarang" pada tengah hari WIB tanggal tsb
assert.equal(hariKeDariTanggal("1970-01-01"), 0);
assert.equal(hariKeDariTanggal("2026-10-14"), 20740);
const tengahHariWIB = Date.UTC(2026, 9, 14, 5, 0, 0); // 12:00 WIB
assert.equal(hariKeSekarang(tengahHariWIB), hariKeDariTanggal("2026-10-14"));
// batas hari WIB: 23:59 WIB masih hari yang sama, 00:00 WIB ganti hari (UTC+7)
assert.equal(hariKeSekarang(Date.UTC(2026, 9, 14, 16, 59, 59)), hariKeDariTanggal("2026-10-14")); // 23:59:59 WIB
assert.equal(hariKeSekarang(Date.UTC(2026, 9, 14, 17, 0, 0)), hariKeDariTanggal("2026-10-15")); // 00:00 WIB

// jendela: [hari ini - N, hari ini + 7]
assert.deepEqual(rentangPiket("2026-10-14", 2), { min: "2026-10-12", max: "2026-10-21" });
for (const [t, ok] of [["2026-10-11", false], ["2026-10-12", true], ["2026-10-14", true], ["2026-10-21", true], ["2026-10-22", false]]) {
  assert.equal(tanggalDiJendela(t, "2026-10-14", 2), ok, t);
}
assert.equal(tanggalDiJendela("2026-10-14", "2026-10-14", 0), true);
assert.equal(tanggalDiJendela("2026-10-13", "2026-10-14", 0), false);

// Sakit tidak boleh terencana; Izin & Dispensasi boleh
assert.equal(ketBolehUntuk("Sakit", "2026-10-15", "2026-10-14"), false);
assert.equal(ketBolehUntuk("Sakit", "2026-10-14", "2026-10-14"), true);
assert.equal(ketBolehUntuk("Izin", "2026-10-20", "2026-10-14"), true);
assert.equal(ketBolehUntuk("Dispensasi", "2026-10-20", "2026-10-14"), true);
assert.deepEqual(opsiKet("2026-10-20", "2026-10-14"), ["Izin", "Dispensasi"]);
assert.deepEqual(opsiKet("2026-10-13", "2026-10-14"), ["Sakit", "Izin", "Dispensasi"]);

// pelanggaran yang boleh dicatat piket
assert.equal(bolehDicatatPiket({ aktif: true, kategori: "Ringan" }), true);
assert.equal(bolehDicatatPiket({ aktif: true, kategori: "Sedang", takziran: "Bersihkan lorong" }), true);
assert.equal(bolehDicatatPiket({ aktif: true, kategori: "Sedang" }), false);
assert.equal(bolehDicatatPiket({ aktif: true, kategori: "Berat", takziran: "" }), false);
assert.equal(bolehDicatatPiket({ aktif: false, kategori: "Ringan" }), false);
assert.equal(bolehDicatatPiket({ aktif: false, kategori: "Sedang", takziran: "x" }), false);

console.log("piket.test: OK");
