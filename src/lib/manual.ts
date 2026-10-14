// Presensi manual (siswa lupa/hilang KTM, kartu rusak, alat bermasalah). Fungsi MURNI (tanpa Firebase) agar dapat diuji unit.
// Node `manualTap` TERPISAH dari `attendance`/`log` milik alat: jalur tulis firmware tidak berubah.
// ATURAN GABUNG: data ALAT selalu menang. Bila alat sudah punya tap masuk, bagian "masuk" manual diabaikan (begitu pula "pulang").
import { batasJam, kategori } from "./attendance.ts";
import type { DayRecord, KetHarian, Kategori, ScheduleRow } from "./types.ts";
import { namaHari } from "./time.ts";

export const ALASAN_MANUAL = ["Lupa KTM", "KTM hilang", "Kartu rusak", "Alat bermasalah", "Lainnya"] as const;
export type AlasanManual = (typeof ALASAN_MANUAL)[number];

/** manualTap/{tgl}/{nis} */
export type ManualTap = {
  masuk?: string; // "HH:MM:SS"
  pulang?: string; // "HH:MM:SS"
  status: "Hadir" | "Terlambat";
  alasan: AlasanManual;
  keterangan?: string;
  oleh: string;
  petugas?: string;
  ts: number;
  hariKe: number;
};

/** manualTapByStudent/{nis}/{tgl}: salinan untuk portal orang tua (tanpa nama petugas/uid pencatat). */
export type ManualTapAnak = { masuk?: string; pulang?: string; status: "Hadir" | "Terlambat"; alasan: AlasanManual };

export const adalahJam = (s: unknown): s is string => typeof s === "string" && /^([01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]$/.test(s);

/**
 * Status dari JAM tap dan jadwal kelas (bukan diketik bebas): masuk sampai batas akhir jendela "Masuk" = Hadir,
 * sesudahnya Terlambat. Sama dengan perilaku jendela firmware (Masuk 07:00–07:15, Terlambat 07:16 dst.).
 */
export function statusDariJam(masuk: string, schedule: ScheduleRow[], kelas: string, tanggal: string): "Hadir" | "Terlambat" {
  const batas = batasJam(schedule, kelas, namaHari(tanggal)).Masuk[1]; // "HH:MM"
  return masuk.slice(0, 5) <= batas ? "Hadir" : "Terlambat";
}

/** Bagian manual yang DIPAKAI setelah dibandingkan dengan data alat. */
export type PemakaianManual = { tap: ManualTap; dipakai: ("masuk" | "pulang")[]; diabaikan: boolean };

export type HasilGabung = {
  masuk?: { jam: string; status: string; manual?: AlasanManual };
  pulang?: { jam: string; manual?: AlasanManual };
  manual?: PemakaianManual;
};

/** Gabungkan tap alat (masuk/pulang) dengan entri manual. Alat menang; manual hanya mengisi bagian yang KOSONG. */
export function gabungTap(
  alat: { masuk?: { jam: string; status: string }; pulang?: { jam: string } },
  manual: ManualTap | null | undefined,
): HasilGabung {
  const hasil: HasilGabung = { masuk: alat.masuk, pulang: alat.pulang };
  if (!manual) return hasil;
  const dipakai: ("masuk" | "pulang")[] = [];
  if (manual.masuk && !alat.masuk) { hasil.masuk = { jam: manual.masuk, status: manual.status, manual: manual.alasan }; dipakai.push("masuk"); }
  if (manual.pulang && !alat.pulang) { hasil.pulang = { jam: manual.pulang, manual: manual.alasan }; dipakai.push("pulang"); }
  hasil.manual = { tap: manual, dipakai, diabaikan: dipakai.length === 0 };
  return hasil;
}

export type SumberHarian = "alat" | "manual" | "izin" | "tidak-ada";

export type StatusHarian = {
  kategori: Kategori;
  sumber: SumberHarian;
  masuk?: string;
  pulang?: string;
  /** DayRecord setelah digabung: dapat dipakai langsung oleh rekap()/rekapBulan(). */
  rec: DayRecord;
  manual?: PemakaianManual;
  /** Alfa sudah dikonfirmasi waka padahal ada kehadiran (alat/manual): perlu ditinjau. */
  konflikValidasi: boolean;
};

/**
 * FUNGSI TUNGGAL status harian satu siswa. Semua perhitungan (dashboard, belum tap, validasi, saran, rekap, laporan, CSV,
 * portal orang tua) memakai fungsi ini atau `gabungRec`. Urutan prioritas: tap alat > manual > keterangan (izin/sakit/dispensasi) > Alpha/Belum Tap.
 */
export function statusHarian(a: {
  tanggal: string;
  kelas: string;
  schedule: ScheduleRow[];
  now?: Date;
  attendance?: DayRecord | null; // attendance/{nis}/{tgl} (alat + ket)
  manual?: ManualTap | null; // manualTap/{tgl}/{nis}
  izin?: KetHarian | null; // izin/{tgl}/{nis}
  validasi?: { status: "Alfa" } | null; // validasi/{tgl}/{nis}
}): StatusHarian {
  const rec0: DayRecord = { ...(a.attendance ?? {}) };
  if (a.izin && !rec0.ket) rec0.ket = a.izin;
  const g = gabungTap(
    { masuk: rec0.status || rec0.masuk ? { jam: rec0.masuk ?? "", status: rec0.status ?? "Hadir" } : undefined, pulang: rec0.pulang ? { jam: rec0.pulang } : undefined },
    a.manual,
  );
  const rec: DayRecord = { ...rec0 };
  const pakaiMasuk = g.manual?.dipakai.includes("masuk");
  if (pakaiMasuk && g.masuk) { rec.masuk = g.masuk.jam; rec.status = g.masuk.status as "Hadir" | "Terlambat"; }
  if (g.manual?.dipakai.includes("pulang") && g.pulang) rec.pulang = g.pulang.jam;
  const kat = kategori(rec, a.tanggal, a.schedule, a.kelas, a.now);
  const hadir = Boolean(rec.status);
  const sumber: SumberHarian = !hadir ? (rec.ket ? "izin" : "tidak-ada") : pakaiMasuk ? "manual" : "alat";
  return {
    kategori: kat, sumber, masuk: rec.masuk, pulang: rec.pulang, rec, manual: g.manual,
    konflikValidasi: Boolean(a.validasi) && hadir,
  };
}

/** Pintasan: DayRecord gabungan (untuk rekap bulanan/tahunan). */
export function gabungRec(attendance: DayRecord | undefined, manual: ManualTap | ManualTapAnak | null | undefined): DayRecord | undefined {
  if (!manual) return attendance;
  const m = manual as ManualTap;
  const g = gabungTap(
    { masuk: attendance?.status || attendance?.masuk ? { jam: attendance.masuk ?? "", status: attendance.status ?? "Hadir" } : undefined, pulang: attendance?.pulang ? { jam: attendance.pulang } : undefined },
    { ...m, oleh: "", ts: 0, hariKe: 0 },
  );
  if (!g.manual || g.manual.diabaikan) return attendance;
  const rec: DayRecord = { ...(attendance ?? {}) };
  if (g.manual.dipakai.includes("masuk") && g.masuk) { rec.masuk = g.masuk.jam; rec.status = g.masuk.status as "Hadir" | "Terlambat"; }
  if (g.manual.dipakai.includes("pulang") && g.pulang) rec.pulang = g.pulang.jam;
  return rec;
}

/** Gabungkan peta attendance (nis -> tgl -> rec) dengan manualTap (tgl -> nis -> tap) menjadi peta gabungan baru. */
export function gabungSemua(
  attendance: Record<string, Record<string, DayRecord>>,
  manualPerTgl: Record<string, Record<string, ManualTap>>,
): Record<string, Record<string, DayRecord>> {
  const out: Record<string, Record<string, DayRecord>> = {};
  for (const [nis, per] of Object.entries(attendance)) out[nis] = { ...per };
  for (const [tgl, perNis] of Object.entries(manualPerTgl)) {
    for (const [nis, tap] of Object.entries(perNis)) {
      const g = gabungRec(out[nis]?.[tgl], tap);
      if (g) (out[nis] ??= {})[tgl] = g;
    }
  }
  return out;
}

/** Label singkat untuk badge/portal. */
export const labelManual = (alasan: string) => `Manual: ${alasan}`;
