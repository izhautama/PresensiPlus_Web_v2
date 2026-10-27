// Kontrol kalender (v2.5.2; fungsi MURNI): hari Senin-Sabtu pada tahun ajaran berjalan, sampai kemarin, yang TIDAK ada bukti hadir sama sekali
// (tap = 0 dan manual = 0) dan TIDAK punya override. Kemungkinan tanggal merah/kegiatan yang belum ditandai Wakasis. Hari tanpa ringkasan
// kalenderEfektif (belum dihitung) TIDAK dianggap kandidat: dilaporkan terpisah agar tidak salah tuduh.
import type { PetaHari } from "./hariEfektif.ts";
import { addDays, tahunAjaran, weekday } from "./time.ts";

export type HasilKontrol = {
  /** tanggal kandidat (urut naik): tap 0, manual 0, tanpa override, bukan Minggu */
  kandidat: string[];
  /** hari kerja yang belum punya ringkasan: tidak diketahui (perlu Hitung ulang) */
  belumDihitung: string[];
  awal: string;
  akhir: string;
};

/** Awal tahun ajaran berjalan (1 Juli) untuk tanggal `hariIni`. */
export const awalTahunAjaran = (hariIni: string) => `${tahunAjaran(hariIni)}-07-01`;

/**
 * @param peta       ringkasan kalenderEfektif (tanggal -> {tap, manual, ...}); hanya tanggal dalam rentang yang dipakai
 * @param override   node kalender (tanggal -> override); tanggal ber-override DIABAIKAN (sudah ditandai Wakasis)
 * @param hariIni    tanggal server hari ini (YYYY-MM-DD); rentang berakhir KEMARIN
 */
export function kontrolKalender(a: { peta: PetaHari | null | undefined; override: Record<string, unknown> | null | undefined; hariIni: string }): HasilKontrol {
  const awal = awalTahunAjaran(a.hariIni);
  const akhir = addDays(a.hariIni, -1);
  const kandidat: string[] = [], belumDihitung: string[] = [];
  for (let d = awal; d <= akhir; d = addDays(d, 1)) {
    if (weekday(d) === 0) continue;               // Minggu libur otomatis
    if (a.override?.[d]) continue;                // sudah ditandai (libur atau efektif)
    const x = a.peta?.[d];
    if (!x) { belumDihitung.push(d); continue; }
    if (x.sumber === "override") continue;        // jaga-jaga: ringkasan ber-sumber override
    if (x.tap === 0 && x.manual === 0) kandidat.push(d);
  }
  return { kandidat, belumDihitung, awal, akhir };
}
