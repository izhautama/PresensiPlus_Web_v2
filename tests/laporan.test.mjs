// Uji unit v2.5.1: CSV (dua pemisah + escape), laporan wali/BK (rekap, % kehadiran, kolom terlarang), lencana Kepala/Waka, klaim aktif per BK.
import assert from "node:assert/strict";
import { formatCSV } from "../src/lib/attendance.ts";
import {
  HEADER_TETAP, barisCsv, detailLogEkspor, formatPersen, headerCsv, kolomPembinaan, namaBerkasLaporan, periksaRentang, salinanKeLessonsTgl, susunLaporan,
} from "../src/lib/laporanWaliBk.ts";
import { klaimAktifPerBk, lencanaKepala, lencanaPenugasanBk } from "../src/lib/pembinaan.ts";

// ---------------------------------------------------------------- CSV: pemisah dan escape
const BOM = "﻿";
const head = ["Nama", "Catatan"];
const rows = [["Andi; Budi", 'dia berkata "halo", lalu pergi'], ["Baris\nbaru", null], [12, undefined]];
const koma = formatCSV(head, rows);
assert.ok(koma.startsWith(BOM), "BOM");
assert.equal(koma, BOM + '"Nama","Catatan"\r\n"Andi; Budi","dia berkata ""halo"", lalu pergi"\r\n"Baris\nbaru",""\r\n"12",""', "pemisah bawaan koma; ; , \" dan baris baru aman di dalam kutip");
assert.equal(formatCSV(head, rows, ","), koma, "parameter koma = bawaan (laporan lama TIDAK berubah)");
const titik = formatCSV(head, rows, ";");
assert.equal(titik, BOM + '"Nama";"Catatan"\r\n"Andi; Budi";"dia berkata ""halo"", lalu pergi"\r\n"Baris\nbaru";""\r\n"12";""', "pemisah titik koma");
assert.ok(!titik.includes('",""'), "tidak ada koma sebagai pemisah pada mode ;");
assert.equal(titik.split("\r\n").length, 4, "CRLF antar baris (baris baru di dalam nilai tidak memecah baris karena dikutip)");
assert.equal(formatCSV([], [], ";"), BOM, "kosong");

// ---------------------------------------------------------------- laporan
const NOW = new Date("2026-10-31T09:00:00Z"); // 16:00 WIB
const efektif = (...t) => Object.fromEntries(t.map((x) => [x, { efektif: true, tap: 50, manual: 0, sumber: "otomatis" }]));
const HARI = ["2026-10-05", "2026-10-06", "2026-10-07", "2026-10-08", "2026-10-09"];
const peta = efektif(...HARI);
const levels = {
  lvW: { poin: 100, tindakan: "Teguran 1", penanggungJawab: "wali" },
  lvB: { poin: 200, tindakan: "Teguran 2", penanggungJawab: "bk" },
  lvK: { poin: 300, tindakan: "Teguran 3", penanggungJawab: "kepala" },
};
const hadir = { masuk: "06:55:00", status: "Hadir" };
const telat = { masuk: "07:20:00", status: "Terlambat" };
const siswa = [{ nis: "2", nama: "BUDI", kelas: "X" }, { nis: "1", nama: "ANDI", kelas: "X" }, { nis: "3", nama: "CITRA", kelas: "XI" }];
const rec = (poin, tanggal, jenis = "pelanggaran") => ({ jenis, nama: "x", poin, tanggal, ta: "2026-2027", sumber: "manual" });
const dasar = (peran) => ({
  peran, siswa, awal: "2026-10-05", akhir: "2026-10-09", ta: "2026-2027", hariEfektif: peta, schedule: [], now: NOW, levels,
  attendance: {
    1: Object.fromEntries(HARI.map((h) => [h, hadir])),
    2: { "2026-10-05": hadir, "2026-10-06": telat, "2026-10-07": { ket: "Sakit" }, "2026-10-08": { ket: "Dispensasi" } },       // 10-09 tanpa data = Alpha
    3: {},
  },
  manualTap: {}, validasi: {},
  lessons: {
    1: { "2026-10-05": { 3: { k: "A", mapel: "Fisika" }, 4: { k: "A" } } },
    2: { "2026-10-07": { 3: { k: "A" } }, "2026-10-09": { 2: { k: "I" } } },   // hari Sakit / Alpha: kode per jam diturunkan, tidak dihitung ganda
  },
  records: { 1: { a: rec(120, "2026-10-01"), b: rec(100, "2026-10-02") }, 2: { a: rec(50, "2026-10-01") } },       // ANDI: 220 (puncak 220); BUDI: 50
  pembinaan: { 1: { "2026-2027_lvW": { ta: "2026-2027", levelId: "lvW", status: "selesai", tanggal: "2026-10-03" }, "2026-2027_lvB": { ta: "2026-2027", levelId: "lvB", status: "dijadwalkan", tanggal: "2026-10-12" } } },
});
const w = susunLaporan(dasar("wali"));
assert.deepEqual(w.map((b) => b.nis), ["1", "2", "3"], "urut kelas lalu nama (ANDI, BUDI kelas X; CITRA XI)");
const [andi, budi, citra] = w;
assert.deepEqual({ e: andi.efektif, h: andi.hadir, t: andi.terlambat, a: andi.alpha, p: andi.persen }, { e: 5, h: 5, t: 0, a: 0, p: 100 });
assert.deepEqual({ e: budi.efektif, h: budi.hadir, t: budi.terlambat, i: budi.izin, s: budi.sakit, d: budi.dispensasi, a: budi.alpha, p: budi.persen }, { e: 5, h: 1, t: 1, i: 0, s: 1, d: 1, a: 1, p: 60 }, "Dispensasi dihitung HADIR: (1+1+1)/5 = 60%");
assert.equal(citra.alpha, 5, "tanpa data pada hari efektif = Alpha");
assert.equal(citra.persen, 0);
assert.deepEqual({ A: andi.jamA, I: andi.jamI }, { A: 2, I: 0 }, "per jam A dihitung dari salinan per siswa");
assert.deepEqual({ A: budi.jamA, I: budi.jamI }, { A: 0, I: 0 }, "kode per jam pada hari Sakit/Alpha diturunkan dari status harian (tidak dihitung ganda)");
assert.deepEqual({ pel: andi.poinPelanggaran, rem: andi.remisi, saldo: andi.saldo, puncak: andi.puncak }, { pel: 220, rem: 0, saldo: 220, puncak: 220 });
assert.equal(andi.levelTercapai, "Teguran 2", "level menurut puncak saldo");
assert.equal(budi.levelTercapai, "");
// wali hanya melihat level wali; BK melihat wali + bk; tidak pernah level kepala
assert.deepEqual(kolomPembinaan(levels, "wali").map((k) => k.levelId), ["lvW"]);
assert.deepEqual(kolomPembinaan(levels, "bk").map((k) => k.levelId), ["lvW", "lvB"]);
assert.deepEqual(Object.keys(andi.pembinaan), ["lvW"], "baris wali hanya memuat kolom level wali");
assert.equal(andi.pembinaan.lvW, "Selesai 2026-10-03", "status + tanggal saja");
const bk = susunLaporan(dasar("bk"));
assert.equal(bk[0].pembinaan.lvB, "Dijadwalkan 2026-10-12");
assert.equal(bk[1].pembinaan.lvW, "", "belum ada pembinaan = kosong");
assert.ok(!("lvK" in bk[0].pembinaan), "level kepala tidak pernah ada");

// ---- kolom terlarang: header dan isi CSV tidak memuat PIN, UID kartu, log tap, catatan, isi pembinaan, konseling, klaim, nama BK
const kolom = kolomPembinaan(levels, "bk");
const csv = formatCSV(headerCsv(kolom), barisCsv(bk, kolom), ";");
for (const dilarang of ["PIN", "UID", "Hasil", "Tindak lanjut", "Konseling", "Klaim", "Catatan"]) assert.ok(!csv.includes(dilarang), `CSV tidak boleh memuat '${dilarang}'`);
assert.equal(headerCsv(kolom).length, HEADER_TETAP.length + 2);
assert.equal(barisCsv(bk, kolom)[0].length, headerCsv(kolom).length, "jumlah kolom tiap baris = header");
assert.equal(formatPersen(60), "60"); assert.equal(formatPersen(85.5), "85,5"); assert.equal(formatPersen(null), "");
// isi pembinaan (hasil) yang ada di record tidak ikut: masukan hanya memuat status + tanggal, dan keluaran tidak bocor walau masukan membawanya
const bocor = dasar("bk");
bocor.pembinaan[1]["2026-2027_lvB"] = { ta: "2026-2027", levelId: "lvB", status: "selesai", tanggal: "2026-10-12", hasil: "RAHASIA-HASIL", tindakLanjut: "RAHASIA-TL", olehNama: "BK RAHASIA" };
assert.ok(!JSON.stringify(susunLaporan(bocor)).includes("RAHASIA"), "isi/nama pembina tidak masuk laporan");

// nama berkas, log, rentang
assert.equal(namaBerkasLaporan({ peran: "bk", kelas: "", awal: "2026-10-01", akhir: "2026-10-31" }), "laporan_bk_semua_2026-10-01_2026-10-31.csv");
assert.equal(namaBerkasLaporan({ peran: "wali", kelas: "XI IPS 1", awal: "2026-10-01", akhir: "2026-10-31" }), "laporan_wali_XI-IPS-1_2026-10-01_2026-10-31.csv");
const log = detailLogEkspor({ peran: "bk", kelas: "", awal: "2026-10-01", akhir: "2026-10-31", jumlah: 480, format: "csv" });
assert.equal(log, "CSV laporan bk, kelas semua, 2026-10-01 s.d. 2026-10-31, 480 siswa");
assert.ok(!/ANDI|BUDI|\b\d{4,}\b.*\b\d{4,}\b.*NIS/.test(log) && !log.includes("NIS"), "log tanpa NIS/nama");
assert.equal(periksaRentang("2026-10-01", "2026-10-31"), null);
assert.match(periksaRentang("2026-10-31", "2026-10-01"), /tidak boleh setelah/);
assert.match(periksaRentang("2025-01-01", "2026-10-01"), /maksimal 1 tahun/);
assert.equal(periksaRentang("2025-10-01", "2026-09-30"), null, "tepat satu tahun masih boleh");
assert.match(periksaRentang("", "2026-10-01"), /Isi tanggal/);

// adaptor salinan per siswa -> bentuk lessons (hanya dalam rentang)
const lt = salinanKeLessonsTgl({ 1: { "2026-10-05": { 3: { k: "A", mapel: "Fisika" } }, "2026-09-01": { 1: { k: "S" } } } }, () => "X", "2026-10-01", "2026-10-31");
assert.deepEqual(Object.keys(lt), ["2026-10-05"]);
assert.equal(lt["2026-10-05"].X.absen[1][3], "A"); assert.equal(lt["2026-10-05"].X.meta[3].mapel, "Fisika");

// ---------------------------------------------------------------- lencana (Kepala / Waka)
const item = (nis, levelId, status = "perlu") => ({ nis, levelId, level: levels[levelId], saldo: 300, puncak: 300, saldoTurun: false, status });
assert.equal(lencanaKepala([]), 0);
assert.equal(lencanaKepala([item("1", "lvK"), item("2", "lvK", "dijadwalkan")]), 2, "perlu + dijadwalkan (belum selesai) dihitung");
const klaim = { 1: { "2026-2027_lvB": { bkUid: "bk1", bkNama: "Bu A", sejak: 1, cara: "klaim", olehUid: "bk1", ta: "2026-2027", levelId: "lvB" } } };
assert.equal(lencanaPenugasanBk([item("1", "lvB"), item("2", "lvB")], klaim, "2026-2027"), 1, "yang sudah diklaim tidak dihitung");
assert.equal(lencanaPenugasanBk([item("1", "lvB")], {}, "2026-2027"), 1);
assert.equal(lencanaPenugasanBk([item("1", "lvB")], klaim, "2025-2026"), 1, "klaim TA lain tidak berlaku");
assert.equal(lencanaPenugasanBk([], klaim, "2026-2027"), 0);
// klaim aktif per BK: klaim dengan pembinaan SELESAI tidak dihitung
const klaimBanyak = {
  1: { "2026-2027_lvB": { bkUid: "bk1", levelId: "lvB", ta: "2026-2027" }, "2025-2026_lvB": { bkUid: "bk1", levelId: "lvB", ta: "2025-2026" } },
  2: { "2026-2027_lvB": { bkUid: "bk2", levelId: "lvB", ta: "2026-2027" } },
};
const pbBk = { 1: { "2025-2026_lvB": { status: "selesai" }, "2026-2027_lvB": { status: "dijadwalkan" } }, 2: { "2026-2027_lvB": { status: "selesai" } } };
const aktif = klaimAktifPerBk(klaimBanyak, pbBk);
assert.deepEqual(aktif.bk1.map((x) => `${x.nis}:${x.kunci}`), ["1:2026-2027_lvB"], "bk1: satu klaim aktif (dijadwalkan); yang selesai tidak dihitung");
assert.equal(aktif.bk2, undefined, "bk2: klaim sudah selesai = tidak aktif");
assert.deepEqual(klaimAktifPerBk(klaimBanyak, null).bk2.map((x) => x.nis), ["2"], "tanpa record pembinaan: klaim tetap aktif");
assert.deepEqual(klaimAktifPerBk(null, null), {});

console.log("laporan.test: semua lolos");
