// Uji penentuan "hari ini" berbasis jam server, termasuk selisih positif/negatif yang melewati tengah malam WIB.
import assert from "node:assert/strict";
import { hariKerjaSebelum } from "../src/lib/time.ts";
import { BATAS_SELISIH_MENIT, jamPerangkatBeda, pesanJamBeda, selisihMenit, tanggalServerDari, waktuServerDari } from "../src/lib/waktu.ts";

const MENIT = 60_000, JAM = 3_600_000, HARI = 86_400_000;
/** epoch ms untuk tanggal-jam WIB (UTC+7) */
const wib = (iso) => Date.parse(`${iso}+07:00`);

// ---- tanpa selisih: tanggal = tanggal WIB perangkat
assert.equal(tanggalServerDari(wib("2026-10-14T16:00:00"), 0), "2026-10-14");
assert.equal(tanggalServerDari(wib("2026-10-14T00:00:00"), 0), "2026-10-14", "tepat tengah malam WIB = hari baru");
assert.equal(tanggalServerDari(wib("2026-10-13T23:59:59"), 0), "2026-10-13");

// ---- server LEBIH MAJU (selisih positif) melewati tengah malam WIB: perangkat masih kemarin, server sudah hari baru
assert.equal(tanggalServerDari(wib("2026-10-13T23:50:00"), 20 * MENIT), "2026-10-14", "perangkat 23:50, server 00:10 keesokan harinya");
assert.equal(tanggalServerDari(wib("2026-10-13T23:50:00"), 9 * MENIT), "2026-10-13", "belum melewati tengah malam");
assert.equal(tanggalServerDari(wib("2026-10-13T23:50:00"), 10 * MENIT), "2026-10-14", "tepat tengah malam menurut server");
assert.equal(tanggalServerDari(wib("2026-12-31T23:55:00"), 10 * MENIT), "2027-01-01", "lintas tahun");
assert.equal(tanggalServerDari(wib("2028-02-28T23:55:00"), 10 * MENIT), "2028-02-29", "lintas ke 29 Februari (kabisat)");

// ---- server LEBIH MUNDUR (selisih negatif): perangkat sudah hari baru, server masih kemarin
assert.equal(tanggalServerDari(wib("2026-10-14T00:10:00"), -20 * MENIT), "2026-10-13", "perangkat 00:10, server 23:50 sebelumnya");
assert.equal(tanggalServerDari(wib("2026-10-14T00:10:00"), -9 * MENIT), "2026-10-14");
assert.equal(tanggalServerDari(wib("2026-10-14T00:10:00"), -10 * MENIT - 1), "2026-10-13", "1 ms sebelum tengah malam menurut server");
assert.equal(tanggalServerDari(wib("2027-01-01T00:05:00"), -10 * MENIT), "2026-12-31");

// ---- selisih besar (jam perangkat sangat salah): tanggal tetap mengikuti server
assert.equal(tanggalServerDari(wib("2026-10-17T16:00:00"), 3 * HARI), "2026-10-20", "perangkat tertinggal 3 hari");
assert.equal(tanggalServerDari(wib("2026-10-20T16:00:00"), -3 * HARI), "2026-10-17", "perangkat maju 3 hari");
assert.equal(tanggalServerDari(wib("2026-10-14T16:00:00"), 7 * JAM), "2026-10-14", "zona waktu perangkat salah 7 jam: 23:00 WIB masih hari yang sama");
assert.equal(tanggalServerDari(wib("2026-10-14T16:00:00"), 8 * JAM), "2026-10-15", "selisih 8 jam melewati tengah malam");

// ---- waktu server
assert.equal(waktuServerDari(1000, 500), 1500);
assert.equal(waktuServerDari(1000, -500), 500);
// nilai tidak sah dianggap 0 (belum ada selisih)
assert.equal(waktuServerDari(1000, NaN), 1000);
assert.equal(waktuServerDari(1000, Infinity), 1000);
assert.equal(tanggalServerDari(wib("2026-10-14T16:00:00"), NaN), "2026-10-14");

// ---- peringatan jam perangkat: batas > 5 menit
assert.equal(BATAS_SELISIH_MENIT, 5);
assert.equal(selisihMenit(0), 0);
assert.equal(selisihMenit(5 * MENIT), 5);
assert.equal(selisihMenit(-5 * MENIT), 5, "mutlak");
assert.equal(jamPerangkatBeda(5 * MENIT), false, "tepat 5 menit belum diperingatkan");
assert.equal(jamPerangkatBeda(-5 * MENIT), false);
assert.equal(jamPerangkatBeda(5 * MENIT + 31_000), true, "5,5 menit dibulatkan 6 > 5");
assert.equal(jamPerangkatBeda(5 * MENIT + 29_000), false, "5,48 menit dibulatkan 5");
assert.equal(jamPerangkatBeda(-6 * MENIT), true);
assert.equal(jamPerangkatBeda(3 * HARI), true);
assert.equal(jamPerangkatBeda(NaN), false);
assert.equal(jamPerangkatBeda(120_000, 1), true, "batas dapat diubah");
assert.equal(pesanJamBeda(12 * MENIT), "Jam perangkat Anda tidak sesuai (selisih 12 menit). Tanggal mengikuti server.");
assert.equal(pesanJamBeda(-3 * HARI), "Jam perangkat Anda tidak sesuai (selisih 4320 menit). Tanggal mengikuti server.");

// ---- hari kerja terakhir sebelum hari ini (Senin -> Sabtu, melewati Minggu)
assert.equal(hariKerjaSebelum("2026-10-19"), "2026-10-17", "Senin -> Sabtu");
assert.equal(hariKerjaSebelum("2026-10-20"), "2026-10-19", "Selasa -> Senin");
assert.equal(hariKerjaSebelum("2026-10-18"), "2026-10-17", "Minggu -> Sabtu");
assert.equal(hariKerjaSebelum("2026-10-17"), "2026-10-16", "Sabtu -> Jumat");
assert.equal(hariKerjaSebelum("2026-03-02"), "2026-02-28", "lintas bulan (Senin 2 Maret -> Sabtu 28 Februari)");

console.log("waktu.test: OK");
