/** Hapus akun BK langsung dari aplikasi (v2.5.3): fungsi murni yang menyusun satu update atomik. */
export type MasukanHapusBk = {
  uid: string; email: string; nama: string; alasan: string; olehUid: string;
  /** hapusAkun/{uid} sudah ada (ditandai lebih dulu): tidak boleh ditulis ulang (rules: sekali tulis) */
  sudahDitandai: boolean;
  /** nilai ts untuk tanda baru (serverTimestamp di aplikasi; angka pada uji) */
  ts: unknown;
};
export type RencanaHapusBk = { updates: Record<string, unknown>; aksi: "tandai-hapus-akun" | "atur-bk"; detail: string };

/**
 * Akun BK yang sudah DICABUT dihilangkan dari aplikasi: node staff dan cermin bkAkun dihapus. Akun login (Firebase Authentication)
 * tidak dapat dihapus dari browser; tanda hapusAkun/{uid} dipertahankan/dibuat sebagai antrean untuk skrip hapus_akun.py (opsional, hanya
 * untuk membebaskan email). Jejak audit (log, pembinaan, konseling, klaim) tidak disentuh.
 */
export function rencanaHapusBk(a: MasukanHapusBk): RencanaHapusBk {
  const alasan = a.alasan.trim().slice(0, 300);
  const updates: Record<string, unknown> = { [`staff/${a.uid}`]: null, [`bkAkun/${a.uid}`]: null };
  if (!a.sudahDitandai) updates[`hapusAkun/${a.uid}`] = { email: a.email, nama: a.nama, peran: "bk", alasan, olehUid: a.olehUid, ts: a.ts };
  return {
    updates,
    aksi: a.sudahDitandai ? "atur-bk" : "tandai-hapus-akun",
    detail: `Hapus akun BK ${a.email} dari aplikasi: ${alasan}`.slice(0, 300),
  };
}

/** Peran yang tandanya masih bisa dibatalkan: akun masih ada di aplikasi (staff ada), atau peran pimpinan/piket yang memang tanpa staff setelah dicabut. */
export function tandaDapatDibatalkan(peran: string, adaStaff: boolean): boolean {
  return !(peran === "bk" || peran === "wali") || adaStaff;
}
