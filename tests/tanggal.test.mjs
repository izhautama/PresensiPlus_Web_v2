// Uji jangkar tanggal E2E: berlaku untuk SETIAP hari dalam seminggu.
import assert from "node:assert/strict";
import { hitungTanggal } from "./e2e/tanggal.mjs";

const hari = (iso) => new Date(`${iso}T00:00:00Z`).getUTCDay(); // 0 = Minggu
const selisih = (a, b) => Math.round((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86_400_000);
const wibIso = (ms) => new Date(ms + 7 * 3_600_000).toISOString().slice(0, 10);

for (let d = 0; d < 21; d++) {
  for (const jamUtc of [0, 5, 16, 17, 23]) { // termasuk sekitar pergantian hari WIB (17:00 UTC)
    const ms = Date.UTC(2026, 9, 5 + d, jamUtc, 30);
    const T = hitungTanggal(ms);
    const nyata = wibIso(ms);
    const ket = `ms=${new Date(ms).toISOString()}`;
    assert.notEqual(hari(T.hariIni), 0, `hariIni bukan Minggu (${ket})`);
    assert.notEqual(hari(T.kemarin), 0, `kemarin bukan Minggu (${ket})`);
    assert.equal(hari(T.minggu), 0, `minggu adalah hari Minggu (${ket})`);
    assert.ok(T.minggu > T.hariIni, `minggu setelah hariIni (${ket})`);
    assert.ok(selisih(nyata, T.hariIni) >= 0 && selisih(nyata, T.hariIni) <= 2, `jangkar maks. 2 hari di belakang hari nyata (${ket})`);
    assert.equal(selisih(T.max, T.hariIni), 7);
    assert.equal(selisih(T.hariIni, T.min), 2);
    assert.equal(selisih(T.besok, T.hariIni), 1);
    assert.equal(T.waktu.toISOString(), `${T.hariIni}T09:00:00.000Z`, "16:00 WIB pada tanggal jangkar");
    assert.equal(T.waktuMinggu.toISOString(), `${T.minggu}T09:00:00.000Z`);
  }
}
console.log("tanggal.test: OK");
