import { weekday } from "./time.ts";

export type LessonsKelas = { meta?: Record<string, { mapel?: string }>; absen?: Record<string, Record<string, string>> };
export type LessonsTgl = Record<string, LessonsKelas>;
export type RekapJam = { A: number; I: number; S: number; D: number; mapelA: Map<string, number> };

/**
 * Rekap kehadiran per jam per siswa dari node `lessons/{tanggal}/{kelas}`.
 * Hari Minggu = libur: sel pada tanggal Minggu TIDAK dihitung (konsisten dengan saran otomatis).
 * `abaikan(nis, tanggal)` = true -> sel siswa pada tanggal itu tidak dihitung (A turunan dari Alfa seharian dihitung TERPISAH sebagai hari).
 */
export function rekapPerJam(lessons: Record<string, LessonsTgl>, abaikan?: (nis: string, tanggal: string) => boolean): Map<string, RekapJam> {
  const m = new Map<string, RekapJam>();
  for (const [tgl, kelasNode] of Object.entries(lessons)) {
    if (weekday(tgl) === 0) continue;
    for (const k of Object.values(kelasNode)) {
      for (const [nis, cells] of Object.entries(k.absen ?? {})) {
        // hari yang status hariannya Alfa seharian / Izin / Sakit / Dispensasi: kode per jam DITURUNKAN dari status harian, sel yang terlanjur tertulis diabaikan
        if (abaikan?.(nis, tgl)) continue;
        const e = m.get(nis) ?? { A: 0, I: 0, S: 0, D: 0, mapelA: new Map() };
        for (const [jam, kode] of Object.entries(cells)) {
          if (kode === "A" || kode === "I" || kode === "S" || kode === "D") e[kode]++;
          if (kode === "A") { const mp = k.meta?.[jam]?.mapel || "(mapel tidak diisi)"; e.mapelA.set(mp, (e.mapelA.get(mp) ?? 0) + 1); }
        }
        m.set(nis, e);
      }
    }
  }
  return m;
}
