// Laporan untuk wali kelas dan BK (v2.5.1): FUNGSI MURNI. Memakai ulang rumus yang sudah ada (rekapSiswa, rekapPerJam, ringkas, puncakSaldo);
// tidak ada rumus baru. Data masukan HANYA yang sudah boleh dibaca peran itu (salinan per siswa), tanpa PIN, UID kartu, log tap mentah,
// catatan internal, isi pembinaan, konseling, atau klaim BK.
import type { Level, DiscRecord, RecordMeta } from "./discipline.ts";
import { levelDari, ringkas, urutLevel } from "./discipline.ts";
import { rekapSiswa, type PetaHari } from "./hariEfektif.ts";
import type { ManualTapAnak } from "./manual.ts";
import { kelompokBaca, puncakSaldo, type Pembinaan } from "./pembinaan.ts";
import { rekapPerJam, type LessonsTgl } from "./rekapJam.ts";
import type { DayRecord, ScheduleRow } from "./types.ts";

export type PeranLaporan = "wali" | "bk";
export type SiswaLaporan = { nis: string; nama: string; kelas: string };
/** lessonsByStudent/{nis}/{tanggal}/{jam} = { k: kode, mapel? } (salinan per siswa; satu-satunya sumber per jam yang dapat dibaca wali/BK). */
export type SalinanJam = Record<string, Record<string, Record<string, { k: string; mapel?: string }>>>;
type PerSiswa<T> = Record<string, T>;

export type MasukanLaporan = {
  peran: PeranLaporan;
  siswa: SiswaLaporan[];
  awal: string; akhir: string; ta: string;
  hariEfektif: PetaHari; schedule: ScheduleRow[];
  aktifSejak?: PerSiswa<string | undefined>;
  attendance: PerSiswa<Record<string, DayRecord> | null | undefined>;
  manualTap: PerSiswa<Record<string, ManualTapAnak> | null | undefined>;
  validasi: PerSiswa<Record<string, unknown> | null | undefined>;
  lessons: SalinanJam;
  records: PerSiswa<Record<string, DiscRecord> | null | undefined>;
  meta?: PerSiswa<Record<string, RecordMeta> | null | undefined>;
  levels: Record<string, Level> | null | undefined;
  pembinaan: PerSiswa<Record<string, Pick<Pembinaan, "ta" | "levelId" | "status" | "tanggal">> | null | undefined>;
  now?: Date;
};

export type KolomPembinaan = { levelId: string; poin: number; label: string };
export type BarisLaporan = {
  nis: string; nama: string; kelas: string;
  efektif: number; hadir: number; terlambat: number; izin: number; sakit: number; dispensasi: number; alpha: number; persen: number | null;
  jamA: number; jamI: number; jamS: number; jamD: number;
  poinPelanggaran: number; remisi: number; saldo: number; puncak: number; levelTercapai: string;
  /** levelId -> "Selesai 2026-10-20" | "Dijadwalkan 2026-10-20" | "" (status + tanggal SAJA) */
  pembinaan: Record<string, string>;
};

/** Level yang boleh DIBACA peran: wali = ambang berpenanggung jawab wali; BK = wali + bk (kelompok baca pembinaan). */
export function kolomPembinaan(levels: Record<string, Level> | null | undefined, peran: PeranLaporan): KolomPembinaan[] {
  const boleh = new Set<string>(kelompokBaca(peran));
  return urutLevel(levels).filter(([, l]) => l.penanggungJawab && boleh.has(l.penanggungJawab)).map(([levelId, l]) => ({ levelId, poin: l.poin, label: `Pembinaan ${l.poin} poin` }));
}

/**
 * Ubah salinan per siswa menjadi bentuk lessons/{tanggal}/{kelas} agar `rekapPerJam` (rumus yang sama dengan laporan kesiswaan) dapat dipakai ulang.
 * Hanya tanggal dalam [awal, akhir].
 */
export function salinanKeLessonsTgl(salinan: SalinanJam, kelasDari: (nis: string) => string, awal: string, akhir: string): Record<string, LessonsTgl> {
  const out: Record<string, LessonsTgl> = {};
  for (const [nis, perTgl] of Object.entries(salinan)) {
    for (const [tgl, perJam] of Object.entries(perTgl ?? {})) {
      if (tgl < awal || tgl > akhir) continue;
      const kelas = kelasDari(nis) || "-";
      const k = ((out[tgl] ??= {})[kelas] ??= { absen: {}, meta: {} });
      for (const [jam, c] of Object.entries(perJam ?? {})) {
        ((k.absen ??= {})[nis] ??= {})[jam] = c.k;
        if (c.mapel) (k.meta ??= {})[jam] = { mapel: c.mapel };
      }
    }
  }
  return out;
}

/** Susun satu baris per siswa. Urutan: kelas, lalu nama. */
export function susunLaporan(m: MasukanLaporan): BarisLaporan[] {
  const levelList = urutLevel(m.levels);
  const kolom = kolomPembinaan(m.levels, m.peran);
  const kelasNis = new Map(m.siswa.map((s) => [s.nis, s.kelas]));
  const rekap = new Map(m.siswa.map((s) => [s.nis, rekapSiswa({
    hariEfektif: m.hariEfektif, attendance: m.attendance[s.nis], manualTap: m.manualTap[s.nis], validasi: m.validasi[s.nis],
    schedule: m.schedule, kelas: s.kelas, aktifSejak: m.aktifSejak?.[s.nis], awal: m.awal, akhir: m.akhir, now: m.now,
  })]));
  // Kode per jam pada hari yang status hariannya Alfa/Izin/Sakit/Dispensasi diturunkan dari status harian (sama dengan laporan kesiswaan): tidak dihitung ganda.
  const turunan = new Map<string, Set<string>>();
  for (const [nis, rk] of rekap) turunan.set(nis, new Set(rk.hari.filter((h) => h.kategori === "Alpha" || h.kategori === "Izin" || h.kategori === "Sakit" || h.kategori === "Dispensasi").map((h) => h.tanggal)));
  const perJam = rekapPerJam(salinanKeLessonsTgl(m.lessons, (n) => kelasNis.get(n) ?? "", m.awal, m.akhir), (nis, tgl) => turunan.get(nis)?.has(tgl) ?? false);

  return m.siswa.map((s): BarisLaporan => {
    const rk = rekap.get(s.nis)!;
    const pj = perJam.get(s.nis);
    const rs = ringkas(m.records[s.nis], m.ta);
    const puncak = puncakSaldo(m.records[s.nis], m.meta?.[s.nis], m.ta);
    const lv = levelDari(puncak, levelList).sekarang;
    const pb: Record<string, string> = {};
    for (const k of kolom) {
      const x = m.pembinaan[s.nis]?.[`${m.ta}_${k.levelId}`];
      pb[k.levelId] = x && x.ta === m.ta ? `${x.status === "selesai" ? "Selesai" : "Dijadwalkan"} ${x.tanggal}` : "";
    }
    return {
      nis: s.nis, nama: s.nama, kelas: s.kelas,
      efektif: rk.Efektif, hadir: rk.Hadir, terlambat: rk.Terlambat, izin: rk.Izin, sakit: rk.Sakit, dispensasi: rk.Dispensasi, alpha: rk.Alpha, persen: rk.Persen,
      jamA: pj?.A ?? 0, jamI: pj?.I ?? 0, jamS: pj?.S ?? 0, jamD: pj?.D ?? 0,
      poinPelanggaran: rs.pel, remisi: rs.rem, saldo: rs.saldo, puncak, levelTercapai: lv ? lv[1].tindakan : "",
      pembinaan: pb,
    };
  }).sort((a, b) => a.kelas.localeCompare(b.kelas, "id", { numeric: true }) || a.nama.localeCompare(b.nama, "id"));
}

export const HEADER_TETAP = [
  "NIS", "Nama", "Kelas", "Hari efektif", "Hadir", "Terlambat", "Izin", "Sakit", "Dispensasi", "Alpha", "% Kehadiran",
  "Per jam A", "Per jam I", "Per jam S", "Per jam D", "Poin pelanggaran TA", "Remisi TA", "Saldo", "Puncak saldo", "Level tercapai (puncak saldo)",
];
export const headerCsv = (kolom: KolomPembinaan[]) => [...HEADER_TETAP, ...kolom.map((k) => k.label)];
/** Persen memakai koma desimal ("85,5") agar terbaca sebagai angka di Excel berlocale Indonesia; kosong bila 0 hari efektif. */
export const formatPersen = (p: number | null) => (p === null ? "" : String(p).replace(".", ","));
export const barisCsv = (rows: BarisLaporan[], kolom: KolomPembinaan[]): (string | number)[][] => rows.map((b) => [
  b.nis, b.nama, b.kelas, b.efektif, b.hadir, b.terlambat, b.izin, b.sakit, b.dispensasi, b.alpha, formatPersen(b.persen),
  b.jamA, b.jamI, b.jamS, b.jamD, b.poinPelanggaran, b.remisi, b.saldo, b.puncak, b.levelTercapai,
  ...kolom.map((k) => b.pembinaan[k.levelId] ?? ""),
]);

/** laporan_<peran>_<kelas|semua>_<dari>_<sampai>.csv (karakter selain huruf/angka pada kelas diganti "-"). */
export const namaBerkasLaporan = (a: { peran: PeranLaporan; kelas: string; awal: string; akhir: string }) =>
  `laporan_${a.peran}_${a.kelas ? a.kelas.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "") || "kelas" : "semua"}_${a.awal}_${a.akhir}.csv`;

/** Detail log aktivitas "ekspor-laporan": peran, kelas, periode, jumlah siswa. TANPA NIS atau nama siswa. */
export const detailLogEkspor = (a: { peran: PeranLaporan; kelas: string; awal: string; akhir: string; jumlah: number; format: "csv" | "cetak" }) =>
  `${a.format === "csv" ? "CSV" : "Cetak"} laporan ${a.peran}, kelas ${a.kelas || "semua"}, ${a.awal} s.d. ${a.akhir}, ${a.jumlah} siswa`;

/** Rentang maksimal 1 tahun ajaran (366 hari) dan awal <= akhir; mengembalikan pesan galat atau null. */
export function periksaRentang(awal: string, akhir: string): string | null {
  if (!/^20\d\d-\d\d-\d\d$/.test(awal) || !/^20\d\d-\d\d-\d\d$/.test(akhir)) return "Isi tanggal awal dan akhir";
  if (awal > akhir) return "Tanggal awal tidak boleh setelah tanggal akhir";
  const hari = (Date.parse(`${akhir}T00:00:00Z`) - Date.parse(`${awal}T00:00:00Z`)) / 86_400_000;
  if (hari > 365) return "Rentang maksimal 1 tahun ajaran (366 hari)";
  return null;
}
