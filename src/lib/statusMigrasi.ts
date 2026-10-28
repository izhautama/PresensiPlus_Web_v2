/** Status migrasi kalender (v2.5.2): fungsi murni, dipakai kartu Migrasi di menu Kalender. */
export type StatusMigrasi = "penanda" | "terdeteksi" | "belum";

export type MasukanStatusMigrasi = {
  /** isi sistem/migrasiKalender (null bila belum ada) */
  penanda: unknown;
  /** profiles: nis -> { aktifSejak? } (semua profil dianggap aktif; tidak ada penanda nonaktif di data siswa) */
  profil: Record<string, { aktifSejak?: string } | null> | null | undefined;
  /** jumlah entri kalenderEfektif yang sudah ada (cukup 0 atau lebih dari 0) */
  jumlahRingkasan: number;
};

const TGL = /^\d{4}-\d{2}-\d{2}$/;

/**
 * `penanda`    : sistem/migrasiKalender ada (migrasi dijalankan lewat aplikasi atau ditandai manual).
 * `terdeteksi` : penanda belum ada, tetapi SEMUA profil sudah punya aktifSejak (tanggal valid), ada minimal satu profil,
 *                dan kalenderEfektif sudah berisi data; migrasi dianggap sudah dijalankan (kasus produksi sebelum v2.5.2).
 * `belum`      : selain itu (migrasi masih berguna).
 */
export function statusMigrasi({ penanda, profil, jumlahRingkasan }: MasukanStatusMigrasi): StatusMigrasi {
  if (penanda) return "penanda";
  const daftar = Object.values(profil ?? {});
  if (daftar.length === 0 || jumlahRingkasan <= 0) return "belum";
  return daftar.every((p) => typeof p?.aktifSejak === "string" && TGL.test(p.aktifSejak)) ? "terdeteksi" : "belum";
}
