// Uji unit presensi manual: statusHarian (alat > manual > izin), Terlambat dari jadwal, gabungSemua + rekap.
import assert from "node:assert/strict";
import { gabungRec, gabungSemua, gabungTap, statusDariJam, statusHarian } from "../src/lib/manual.ts";
import { rekapSiswa } from "../src/lib/hariEfektif.ts";

const now = new Date("2026-10-14T09:00:00Z"); // Rabu 16:00 WIB
const T = "2026-10-13"; // Selasa (lampau)
const kelas = "X IPA";
const schedule = [];
const tap = (o = {}) => ({ masuk: "07:10:00", status: "Hadir", alasan: "Lupa KTM", oleh: "u1", ts: 1, hariKe: 1, ...o });
const sh = (o) => statusHarian({ tanggal: T, kelas, schedule, now, ...o });

// ---- Terlambat dihitung dari JADWAL, bukan diketik
assert.equal(statusDariJam("07:00:00", schedule, kelas, T), "Hadir");
assert.equal(statusDariJam("07:15:59", schedule, kelas, T), "Hadir", "batas memakai HH:MM (07:15 masih Hadir)");
assert.equal(statusDariJam("07:16:00", schedule, kelas, T), "Terlambat");
assert.equal(statusDariJam("10:30:00", schedule, kelas, T), "Terlambat");
// jadwal kelas khusus mengalahkan bawaan: batas masuk 07:30 untuk X IPA hari Selasa
const jadwalKhusus = [{ kelas: "X IPA", hari: "Selasa", jenis: "Masuk", mulai: "07:00", selesai: "07:30" }];
assert.equal(statusDariJam("07:25:00", jadwalKhusus, "X IPA", T), "Hadir");
assert.equal(statusDariJam("07:25:00", jadwalKhusus, "X IPA", "2026-10-14"), "Terlambat", "hari lain memakai bawaan");
assert.equal(statusDariJam("07:25:00", jadwalKhusus, "XI IPS", T), "Terlambat", "kelas lain memakai bawaan");

// ---- tanpa data apa pun: Alpha (hari lampau) ; manual mengubahnya menjadi Hadir
assert.equal(sh({}).kategori, "Alpha");
assert.equal(sh({}).sumber, "tidak-ada");
let h = sh({ manual: tap() });
assert.equal(h.kategori, "Hadir");
assert.equal(h.sumber, "manual");
assert.equal(h.masuk, "07:10:00");
assert.deepEqual(h.manual.dipakai, ["masuk"]);
assert.equal(h.manual.diabaikan, false);
h = sh({ manual: tap({ masuk: "08:00:00", status: "Terlambat" }) });
assert.equal(h.kategori, "Terlambat");

// ---- ALAT MENANG
h = sh({ attendance: { masuk: "07:05:00", status: "Hadir" }, manual: tap({ masuk: "09:00:00", status: "Terlambat" }) });
assert.equal(h.kategori, "Hadir", "alat Hadir mengalahkan manual Terlambat");
assert.equal(h.masuk, "07:05:00");
assert.equal(h.sumber, "alat");
assert.equal(h.manual.diabaikan, true, "manual ditandai diabaikan (ada tap alat)");
assert.deepEqual(h.manual.dipakai, []);
h = sh({ attendance: { masuk: "07:40:00", status: "Terlambat" }, manual: tap({ masuk: "07:00:00", status: "Hadir" }) });
assert.equal(h.kategori, "Terlambat", "alat Terlambat tidak diperbaiki oleh manual");

// ---- manual pulang mengisi pulang yang kosong, masuk alat tetap
h = sh({ attendance: { masuk: "07:05:00", status: "Hadir" }, manual: tap({ masuk: undefined, pulang: "15:01:00" }) });
assert.equal(h.pulang, "15:01:00");
assert.equal(h.masuk, "07:05:00");
assert.deepEqual(h.manual.dipakai, ["pulang"]);
assert.equal(h.manual.diabaikan, false);
// pulang alat ada -> pulang manual diabaikan
h = sh({ attendance: { masuk: "07:05:00", status: "Hadir", pulang: "15:10:00" }, manual: tap({ masuk: undefined, pulang: "15:01:00" }) });
assert.equal(h.pulang, "15:10:00");
assert.equal(h.manual.diabaikan, true);

// ---- manual mengalahkan izin/keterangan; izin tetap bila tidak ada kehadiran
assert.equal(sh({ izin: "Sakit" }).kategori, "Sakit");
assert.equal(sh({ izin: "Sakit", manual: tap() }).kategori, "Hadir");
assert.equal(sh({ attendance: { ket: "Izin" }, manual: tap() }).kategori, "Hadir");

// ---- validasi Alfa + kehadiran = konflik (perlu ditinjau); tanpa kehadiran bukan konflik
assert.equal(sh({ validasi: { status: "Alfa" }, manual: tap() }).konflikValidasi, true);
assert.equal(sh({ validasi: { status: "Alfa" } }).konflikValidasi, false);

// ---- Minggu = Libur walau ada data
assert.equal(statusHarian({ tanggal: "2026-10-18", kelas, schedule, now, manual: tap() }).kategori, "Libur");

// ---- hari ini sebelum batas: Belum Tap -> manual: Hadir
const pagi = new Date("2026-10-14T01:00:00Z"); // 08:00 WIB (< 14:10)
assert.equal(statusHarian({ tanggal: "2026-10-14", kelas, schedule, now: pagi }).kategori, "Belum Tap");
assert.equal(statusHarian({ tanggal: "2026-10-14", kelas, schedule, now: pagi, manual: tap() }).kategori, "Hadir");

// ---- gabungTap murni
assert.equal(gabungTap({}, null).manual, undefined);
assert.equal(gabungTap({}, tap()).masuk.manual, "Lupa KTM");
assert.equal(gabungTap({ masuk: { jam: "07:00:00", status: "Hadir" } }, tap()).masuk.manual, undefined);

// ---- gabungRec / gabungSemua / rekapBulan (laporan, CSV, portal ortu)
assert.equal(gabungRec(undefined, undefined), undefined);
assert.deepEqual(gabungRec({ ket: "Izin" }, tap()), { ket: "Izin", masuk: "07:10:00", status: "Hadir" });
assert.deepEqual(gabungRec({ masuk: "07:00:00", status: "Hadir" }, tap({ masuk: "09:00:00", status: "Terlambat" })), { masuk: "07:00:00", status: "Hadir" }, "alat menang");
const att = { 111: { "2026-10-12": { masuk: "07:00:00", status: "Hadir" } } };
const man = { "2026-10-12": { 222: tap() }, "2026-10-13": { 111: tap({ masuk: "07:20:00", status: "Terlambat" }), 222: tap() } };
const g = gabungSemua(att, man);
assert.equal(g[111]["2026-10-13"].status, "Terlambat");
assert.equal(g[222]["2026-10-12"].status, "Hadir");
assert.equal(att[111]["2026-10-13"], undefined, "input tidak diubah");
// rekapSiswa (hari efektif: 12 & 13 Okt, Senin-Selasa): manual mengurangi Alpha menjadi Hadir
const peta = { "2026-10-12": { efektif: true, tap: 5, manual: 0, sumber: "otomatis" }, "2026-10-13": { efektif: true, tap: 5, manual: 0, sumber: "otomatis" } };
const hit = (att) => rekapSiswa({ hariEfektif: peta, attendance: att, schedule, kelas, awal: "2026-10-12", akhir: "2026-10-13", now });
const rk0 = hit({});
const rk1 = hit(g[222]);
assert.ok(rk0.Alpha === 2 && rk1.Alpha === 0 && rk1.Hadir === 2, `manual mengurangi Alpha (Alpha ${rk0.Alpha} -> ${rk1.Alpha}, Hadir ${rk1.Hadir})`);
assert.equal(hit(g[111]).Terlambat, 1);

console.log("manual.test: OK");
