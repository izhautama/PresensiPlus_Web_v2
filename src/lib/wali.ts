// Wewenang WALI KELAS (fungsi MURNI; dicerminkan di Security Rules sebagai `waliDari($nis)`). Kunci kelas = encodeKelas(kelas).
import { decodeKelas, encodeKelas } from "./perjam.ts";

export { decodeKelas, encodeKelas };
/** staff/{uid} bagian pemetaan kelas. */
export type PetaKelasWali = { kelasUtama?: string | null; kelasTambahan?: Record<string, boolean> | null };

/** Semua kunci kelas binaan (utama + tambahan), utama lebih dulu. */
export function kelasBinaan(p: PetaKelasWali | null | undefined): string[] {
  const out: string[] = [];
  if (p?.kelasUtama) out.push(p.kelasUtama);
  for (const [k, v] of Object.entries(p?.kelasTambahan ?? {})) if (v === true && !out.includes(k)) out.push(k);
  return out;
}

/**
 * Persis aturan rules: siswa harus punya indeks siswaKelas (tanpa indeks = tidak dapat dibina siapa pun, sehingga
 * wali tanpa kelas utama tidak "cocok" dengan siswa tanpa indeks lewat null === null), lalu kelasnya = kelas utama ATAU tambahan.
 */
export function waliDari(nis: string, peta: PetaKelasWali | null | undefined, siswaKelas: Record<string, string> | null | undefined): boolean {
  const kelas = siswaKelas?.[nis];
  if (!kelas) return false;
  if (peta?.kelasUtama && peta.kelasUtama === kelas) return true;
  return peta?.kelasTambahan?.[kelas] === true;
}

/** Siswa binaan dari indeks. */
export const siswaBinaan = (peta: PetaKelasWali | null | undefined, siswaKelas: Record<string, string>) => Object.keys(siswaKelas).filter((n) => waliDari(n, peta, siswaKelas));

/** Wali lain yang sudah memegang kelas ini (utama atau tambahan), untuk peringatan "kelas sudah ada walinya". */
export function waliPemegangKelas<T extends PetaKelasWali & { aktif?: boolean }>(kelasKey: string, daftar: Record<string, T>, kecuali?: string): [string, T][] {
  return Object.entries(daftar).filter(([uid, w]) => uid !== kecuali && w.aktif !== false && (w.kelasUtama === kelasKey || w.kelasTambahan?.[kelasKey] === true));
}

/** Perbedaan indeks siswaKelas terhadap daftar siswa (untuk migrasi dry-run). */
export function bedaIndeks(siswa: { nis: string; kelas: string }[], indeks: Record<string, string>) {
  const baru: string[] = [], berubah: string[] = [], sama: string[] = [];
  const nisAda = new Set<string>();
  for (const s of siswa) {
    nisAda.add(s.nis);
    const k = encodeKelas(s.kelas);
    if (indeks[s.nis] === undefined) baru.push(s.nis); else if (indeks[s.nis] !== k) berubah.push(s.nis); else sama.push(s.nis);
  }
  const usang = Object.keys(indeks).filter((n) => !nisAda.has(n));
  return { baru, berubah, sama, usang };
}
