// Aturan jendela waktu & keterangan untuk Guru Piket. Fungsi MURNI (impor .ts agar dapat diuji unit di Node).
import { addDays } from "./time.ts";

export type KodeIzin = "S" | "I" | "D";
export type KetPiket = "Izin" | "Sakit" | "Dispensasi";
export const KET_DARI_KODE: Record<KodeIzin, KetPiket> = { S: "Sakit", I: "Izin", D: "Dispensasi" };
export const MUNDUR_DEFAULT = 2; // hari ke belakang (diatur waka: discipline/settings/piketMundurHari)
export const MAJU_MAKS = 7; // Izin/Dispensasi terencana maksimal 7 hari ke depan

/** Nomor hari sejak epoch untuk tanggal kalender "YYYY-MM-DD" (sama dengan hariKe yang dicek Security Rules). */
export function hariKeDariTanggal(tanggal: string): number {
  const [y, m, d] = tanggal.split("-").map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / 86400000);
}

/** hariKe "sekarang" menurut rules: floor((now + 7 jam WIB) / 1 hari). */
export const hariKeSekarang = (nowMs: number) => Math.floor((nowMs + 7 * 3600_000) / 86400_000);

/** Rentang tanggal yang boleh dipilih piket: [hari ini − N, hari ini + 7]. */
export function rentangPiket(today: string, mundur: number): { min: string; max: string } {
  return { min: addDays(today, -mundur), max: addDays(today, MAJU_MAKS) };
}

export const tanggalDiJendela = (tanggal: string, today: string, mundur: number) => {
  const { min, max } = rentangPiket(today, mundur);
  return tanggal >= min && tanggal <= max;
};

/** Sakit hanya untuk hari ini/lampau (tidak ada "sakit terencana"); Izin & Dispensasi boleh terencana. */
export const ketBolehUntuk = (ket: KetPiket, tanggal: string, today: string) => ket !== "Sakit" || tanggal <= today;

export function opsiKet(tanggal: string, today: string): KetPiket[] {
  return (["Sakit", "Izin", "Dispensasi"] as KetPiket[]).filter((k) => ketBolehUntuk(k, tanggal, today));
}

/** Pelanggaran yang boleh dicatat piket: master aktif dengan kategori Ringan ATAU yang memiliki takziran. */
export function bolehDicatatPiket(r: { aktif: boolean; kategori: string; takziran?: string }): boolean {
  return r.aktif && (r.kategori === "Ringan" || Boolean(r.takziran && r.takziran.length > 0));
}
