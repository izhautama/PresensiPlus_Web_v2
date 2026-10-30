// Uji unit HARI EFEKTIF BERBASIS BUKTI (lib/hariEfektif.ts).
import assert from "node:assert/strict";
import { AMBANG_BAWAAN, bangunRingkasan, hariEfektifSekolah, hitungBukti, hitungRentang, rekapSiswa, tandaiRendah, tentukanEfektif, tertahan, validAmbang } from "../src/lib/hariEfektif.ts";

const NOW = new Date("2026-10-31T09:00:00Z"); // 16:00 WIB, akhir Oktober: semua tanggal sebelumnya sudah lewat
const M = (nis) => [`UID${nis}_M`, { nis, jam: "07:00:00", status: "Hadir" }];
const logDari = (...nis) => Object.fromEntries(nis.map(M));
const manual = (...nis) => Object.fromEntries(nis.map((n) => [n, { masuk: "07:10:00", status: "Hadir", alasan: "Lupa KTM" }]));

// ---------------------------------------------------------------- tentukan efektif
assert.equal(AMBANG_BAWAAN, 1);
assert.deepEqual(tentukanEfektif({ tanggal: "2026-10-13", tap: 0, manual: 0 }), { efektif: false, sumber: "otomatis" }, "tanpa bukti bukan hari efektif");
assert.equal(tentukanEfektif({ tanggal: "2026-10-13", tap: 1, manual: 0 }).efektif, true, "1 tap -> efektif (ambang 1)");
assert.equal(tentukanEfektif({ tanggal: "2026-10-13", tap: 0, manual: 1 }).efektif, true, "manual hadir menjadikan hari efektif");
assert.equal(tentukanEfektif({ tanggal: "2026-10-13", tap: 3, manual: 1, ambang: 5 }).efektif, false, "ambang 5: 4 bukti belum cukup");
assert.equal(tentukanEfektif({ tanggal: "2026-10-13", tap: 3, manual: 2, ambang: 5 }).efektif, true, "ambang 5: 5 bukti cukup");
assert.equal(tentukanEfektif({ tanggal: "2026-10-13", tap: 4, manual: 0, ambang: 0 }).efektif, true, "ambang tidak valid -> bawaan 1");
assert.equal(tentukanEfektif({ tanggal: "2026-10-18", tap: 40, manual: 0 }).efektif, false, "Minggu = libur walau ada tap");
assert.deepEqual(tentukanEfektif({ tanggal: "2026-10-13", override: { status: "libur" }, tap: 40, manual: 3 }), { efektif: false, sumber: "override" }, "override libur menang atas tap");
assert.deepEqual(tentukanEfektif({ tanggal: "2026-10-18", override: { status: "efektif" }, tap: 0, manual: 0 }), { efektif: true, sumber: "override" }, "override efektif menang atas Minggu & tanpa bukti");
assert.ok(validAmbang(1) && validAmbang(500) && !validAmbang(0) && !validAmbang(501) && !validAmbang(2.5) && !validAmbang("5"));

// ---------------------------------------------------------------- bukti & ringkasan
assert.deepEqual(hitungBukti({ ...logDari("1", "2"), A_P: { nis: "3" } }, manual("2", "4")), { tap: 2, manual: 1 }, "pulang tidak dihitung; manual yang tumpang tindih dengan tap tidak dihitung ganda");
assert.deepEqual(hitungBukti({ ...logDari("1"), UID1x_M: { nis: "1" } }, null), { tap: 1, manual: 0 }, "nis sama = 1 siswa");
assert.deepEqual(hitungBukti(null, { 5: { pulang: "15:00:00" } }), { tap: 0, manual: 0 }, "manual tanpa jam masuk bukan bukti hadir");
assert.deepEqual(bangunRingkasan({ tanggal: "2026-10-13", log: logDari("1"), manual: manual("9") }), { efektif: true, tap: 1, manual: 1, sumber: "otomatis" });
// izin/sakit saja (di tanggal mendatang) tidak membuat hari efektif: tidak ada log/manual
assert.equal(bangunRingkasan({ tanggal: "2026-10-20", log: null, manual: null }).efektif, false);

// ---------------------------------------------------------------- rendah (tap < 50% median 10 hari efektif sebelumnya)
const hariTap = (n) => ({ efektif: true, tap: n, manual: 0, sumber: "otomatis" });
const sebelumnya = { "2026-10-01": hariTap(100), "2026-10-02": hariTap(100), "2026-10-03": hariTap(100), "2026-10-05": hariTap(100) };
assert.equal(tandaiRendah("2026-10-06", hariTap(49), sebelumnya), true, "49 < 50% x 100");
assert.equal(tandaiRendah("2026-10-06", hariTap(50), sebelumnya), false, "tepat 50% bukan rendah");
assert.equal(tandaiRendah("2026-10-06", { efektif: false, tap: 0 }, sebelumnya), false, "hari tidak efektif tidak ditandai rendah");
assert.equal(tandaiRendah("2026-10-06", hariTap(1), { "2026-10-01": hariTap(100), "2026-10-02": hariTap(100) }), false, "kurang dari 3 pembanding: tidak ditandai");
assert.equal(tandaiRendah("2026-10-06", hariTap(40), { ...sebelumnya, "2026-10-04": { efektif: false, tap: 0, manual: 0, sumber: "otomatis" } }), true, "hari tidak efektif tidak ikut median");
// median 10 hari terakhir saja
const banyak = Object.fromEntries(Array.from({ length: 12 }, (_, i) => [`2026-09-${String(i + 1).padStart(2, "0")}`, hariTap(i < 2 ? 1000 : 100)]));
assert.equal(tandaiRendah("2026-10-06", hariTap(60), banyak), false, "dua hari tertua (1000) di luar 10 hari pembanding");
assert.equal(tertahan({ rendah: true }), true); assert.equal(tertahan({ rendah: true, normal: true }), false); assert.equal(tertahan({}), false); assert.equal(tertahan(undefined), false);

// hitungRentang: deterministik, memakai pembanding berurutan & override tidak ditimpa
const rentang = ["2026-10-01", "2026-10-02", "2026-10-03", "2026-10-05", "2026-10-06", "2026-10-07"];
const log = Object.fromEntries(rentang.map((t, i) => [t, logDari(...Array.from({ length: i === 4 ? 10 : 100 }, (_, k) => `n${k}`))]));
const override = { "2026-10-07": { status: "libur", alasan: "ujian" } };
const hr1 = hitungRentang({ tanggal: rentang, override, log, manual: {} });
const hr2 = hitungRentang({ tanggal: [...rentang].reverse(), override, log, manual: {} });
assert.deepEqual(hr1, hr2, "urutan masukan tidak mengubah hasil (deterministik)");
assert.equal(hr1["2026-10-06"].rendah, true, "10 tap vs median 100");
assert.equal(hr1["2026-10-05"].rendah, undefined);
assert.deepEqual({ e: hr1["2026-10-07"].efektif, s: hr1["2026-10-07"].sumber }, { e: false, s: "override" });
assert.equal(hr1["2026-10-02"].rendah, undefined, "pembanding < 3 -> tidak rendah");

// ---------------------------------------------------------------- rekap siswa
const efektif = (...t) => Object.fromEntries(t.map((x) => [x, { efektif: true, tap: 50, manual: 0, sumber: "otomatis" }]));
const rs = (o) => rekapSiswa({ schedule: [], kelas: "X", now: NOW, ...o });

// SKENARIO DATA NYATA: Juli-September tanpa tap = 0 hari efektif, 0 Alpha (bukan 27/26/26 Alpha)
for (const [awal, akhir] of [["2026-07-01", "2026-07-31"], ["2026-08-01", "2026-08-31"], ["2026-09-01", "2026-09-30"]]) {
  const r = rs({ hariEfektif: {}, attendance: {}, awal, akhir });
  assert.deepEqual({ A: r.Alpha, E: r.Efektif, H: r.HariSekolah, P: r.Persen }, { A: 0, E: 0, H: 0, P: null }, `${awal}: tanpa kegiatan`);
}
// Oktober: hanya satu hari ber-tap (13 Okt) -> "Hari efektif ke-1", persentase dari 1 hari
const petaOkt = efektif("2026-10-13");
const okt = rs({ hariEfektif: petaOkt, attendance: { "2026-10-13": { masuk: "07:00:00", status: "Hadir" } }, awal: "2026-10-01", akhir: "2026-10-31" });
assert.deepEqual({ E: okt.Efektif, S: okt.HariSekolah, H: okt.Hadir, A: okt.Alpha, P: okt.Persen }, { E: 1, S: 1, H: 1, A: 0, P: 100 });
assert.equal(hariEfektifSekolah(petaOkt, "2026-10-01", "2026-10-31", NOW), 1);
// siswa lain yang tidak tap pada hari efektif itu = 1 Alpha (bukan 11)
const alpha1 = rs({ hariEfektif: petaOkt, attendance: {}, awal: "2026-10-01", akhir: "2026-10-31" });
assert.deepEqual({ A: alpha1.Alpha, E: alpha1.Efektif, P: alpha1.Persen }, { A: 1, E: 1, P: 0 });

// identitas penjumlahan + semua kategori
const petaCampur = efektif("2026-10-12", "2026-10-13", "2026-10-14", "2026-10-15", "2026-10-16", "2026-10-17");
const att = {
  "2026-10-12": { masuk: "07:00:00", status: "Hadir" }, "2026-10-13": { masuk: "07:30:00", status: "Terlambat" },
  "2026-10-14": { ket: "Izin" }, "2026-10-15": { ket: "Sakit" }, "2026-10-16": { ket: "Dispensasi" },
};
const rc = rs({ hariEfektif: petaCampur, attendance: att, awal: "2026-10-12", akhir: "2026-10-18" });
assert.deepEqual({ H: rc.Hadir, T: rc.Terlambat, I: rc.Izin, S: rc.Sakit, D: rc.Dispensasi, A: rc.Alpha, E: rc.Efektif }, { H: 1, T: 1, I: 1, S: 1, D: 1, A: 1, E: 6 });
assert.equal(rc.Efektif, rc.Hadir + rc.Terlambat + rc.Izin + rc.Sakit + rc.Dispensasi + rc.Alpha, "IDENTITAS: jumlah kategori = hari efektif siswa");
assert.equal(rc.Persen, 50);
assert.equal(rc.HariSekolah, 6);

// Alfa terverifikasi diberi label
assert.equal(rs({ hariEfektif: efektif("2026-10-17"), attendance: {}, validasi: { "2026-10-17": { status: "Alfa" } }, awal: "2026-10-17", akhir: "2026-10-17" }).hari[0].alfaTerverifikasi, true);

// izin pada hari NON efektif (tanggal mendatang / libur) tidak dihitung; ada tap pada hari libur: terlihat "di hari libur", tidak masuk rekap
const rl = rs({ hariEfektif: { "2026-10-13": { efektif: false, tap: 0, manual: 0, sumber: "override" } }, attendance: { "2026-10-13": { masuk: "07:00:00", status: "Hadir" }, "2026-10-14": { ket: "Izin" } }, awal: "2026-10-13", akhir: "2026-10-14" });
assert.deepEqual({ E: rl.Efektif, I: rl.Izin, H: rl.Hadir }, { E: 0, I: 0, H: 0 });
assert.equal(rl.hari[0].kategori, "TidakEfektif"); assert.equal(rl.hari[0].diHariLibur, true);
assert.equal(rl.hari[1].kategori, "TidakEfektif"); assert.equal(rl.hari[1].diHariLibur, undefined);

// override efektif tanpa bukti -> siswa tanpa data = Alpha
const ro = rs({ hariEfektif: { "2026-10-14": { efektif: true, tap: 0, manual: 0, sumber: "override" } }, attendance: {}, awal: "2026-10-14", akhir: "2026-10-14" });
assert.deepEqual({ A: ro.Alpha, E: ro.Efektif }, { A: 1, E: 1 });
// override efektif pada hari Minggu: dihitung normal
assert.equal(rs({ hariEfektif: { "2026-10-18": { efektif: true, tap: 0, manual: 0, sumber: "override" } }, attendance: { "2026-10-18": { masuk: "07:00:00", status: "Hadir" } }, awal: "2026-10-18", akhir: "2026-10-18" }).Hadir, 1);

// manual tap + alat menang
const rm = rs({ hariEfektif: efektif("2026-10-12", "2026-10-13"), attendance: { "2026-10-13": { masuk: "07:00:00", status: "Hadir" } },
  manualTap: { "2026-10-12": { masuk: "07:10:00", status: "Hadir", alasan: "Lupa KTM", oleh: "u", ts: 1, hariKe: 1 }, "2026-10-13": { masuk: "09:00:00", status: "Terlambat", alasan: "Lupa KTM", oleh: "u", ts: 1, hariKe: 1 } },
  awal: "2026-10-12", akhir: "2026-10-13" });
assert.deepEqual({ H: rm.Hadir, T: rm.Terlambat, A: rm.Alpha }, { H: 2, T: 0, A: 0 }, "manual hadir; alat (Hadir) mengalahkan manual (Terlambat)");
assert.equal(rm.hari[0].manualAlasan, "Lupa KTM"); assert.equal(rm.hari[1].manualAlasan, undefined);

// siswa baru: aktifSejak
const rb = rs({ hariEfektif: efektif("2026-10-12", "2026-10-13", "2026-10-14"), attendance: {}, aktifSejak: "2026-10-14", awal: "2026-10-12", akhir: "2026-10-14" });
assert.deepEqual({ A: rb.Alpha, E: rb.Efektif, S: rb.HariSekolah }, { A: 1, E: 1, S: 3 }, "sebelum aktifSejak tidak dihitung untuk siswa; hari sekolah tetap 3");
assert.equal(rb.hari[0].kategori, "TidakEfektif");
// TANPA aktifSejak (data lama atau impor di luar aplikasi): semua hari efektif sejak awal rentang dihitung, jadi hari sebelum siswa terdaftar menjadi Alpha.
// Karena itu penambahan siswa WAJIB mengisi aktifSejak (pagar statis di bawah).
const rtanpa = rs({ hariEfektif: efektif("2026-10-12", "2026-10-13", "2026-10-14"), attendance: {}, awal: "2026-10-12", akhir: "2026-10-14" });
assert.deepEqual({ A: rtanpa.Alpha, E: rtanpa.Efektif }, { A: 3, E: 3 }, "tanpa aktifSejak: 3 hari efektif tanpa bukti = 3 Alpha");
{
  const { readFileSync } = await import("node:fs");
  const src = readFileSync(new URL("../src/services/db.ts", import.meta.url), "utf8");
  const badan = (nama) => { const a = src.indexOf(`export async function ${nama}(`); const b = src.indexOf("\nexport ", a + 1); return src.slice(a, b < 0 ? undefined : b); };
  assert.match(badan("tambahSiswa"), /\[`profiles\/\$\{s\.nis\}`\]: \{[^}]*aktifSejak: todayWIB\(new Date\(waktuServer\(\)\)\)/, "tambahSiswa mengisi profiles/{nis}/aktifSejak = hari ini (waktu SERVER) pada update yang sama");
  assert.doesNotMatch(badan("ubahSiswa"), /profiles\/\$\{s\.nis\}`\]:/, "ubahSiswa menulis per-field dan tidak menimpa node profil (aktifSejak aman)");
}

// HARI INI berjalan
const PAGI = new Date("2026-10-14T01:00:00Z"); // 08:00 WIB
const SIANG = new Date("2026-10-14T09:00:00Z"); // 16:00 WIB (lewat batas terlambat bawaan 14:10)
const hi = (o) => rekapSiswa({ hariEfektif: efektif("2026-10-14"), attendance: {}, schedule: [], kelas: "X", awal: "2026-10-14", akhir: "2026-10-14", ...o });
assert.deepEqual({ E: hi({ now: PAGI }).Efektif, A: hi({ now: PAGI }).Alpha, k: hi({ now: PAGI }).hari[0].kategori }, { E: 0, A: 0, k: "BelumTap" }, "hari ini sebelum batas: Belum tap, bukan Alpha");
assert.equal(hi({ now: SIANG }).Alpha, 1, "hari efektif + batas terlambat lewat -> Alpha");
assert.equal(hi({ now: PAGI, hariEfektif: {} }).hari[0].kategori, "TidakEfektif", "hari ini belum efektif (tanpa ringkasan & tanpa tap): bukan Alpha/Belum tap");
assert.equal(hi({ now: PAGI, hariEfektif: {}, attendance: { "2026-10-14": { masuk: "07:00:00", status: "Hadir" } } }).Hadir, 1, "hari ini tanpa ringkasan tetapi siswa sudah tap = efektif sementara");
assert.equal(hi({ now: SIANG, hariEfektif: { "2026-10-14": { efektif: false, tap: 0, manual: 0, sumber: "otomatis" } } }).Alpha, 0, "hari ini belum mencapai ambang: tidak Alpha");

// persen "-" (null) bila 0 hari efektif; total berjalan bukan rata-rata bulan
assert.equal(rs({ hariEfektif: {}, awal: "2026-10-01", akhir: "2026-10-31" }).Persen, null);
const bulanA = rs({ hariEfektif: efektif("2026-10-01"), attendance: { "2026-10-01": { masuk: "07:00:00", status: "Hadir" } }, awal: "2026-10-01", akhir: "2026-10-31" });
const bulanB = rs({ hariEfektif: efektif("2026-10-02", "2026-10-03", "2026-10-05", "2026-10-06"), attendance: {}, awal: "2026-10-01", akhir: "2026-10-31" });
const totalH = bulanA.Hadir + bulanB.Hadir + bulanA.Terlambat + bulanB.Terlambat + bulanA.Dispensasi + bulanB.Dispensasi;
const totalE = bulanA.Efektif + bulanB.Efektif;
assert.equal(Math.round((totalH / totalE) * 1000) / 10, 20, "total = 1 hadir dari 5 hari (bukan rata-rata 100% & 0% = 50%)");

console.log("hariEfektif.test: OK");
