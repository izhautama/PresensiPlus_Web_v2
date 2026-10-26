import { serverTimestamp } from "firebase/database";
import { kirimUpdate, sisipkanAktivitas } from "./aktivitas";

type Updates = Record<string, unknown>;
export type PeranHapus = "kepala" | "waka" | "piket" | "wali" | "bk";
export type HapusAkun = { email: string; nama: string; peran: PeranHapus; alasan: string; olehUid: string; ts: number };

/**
 * Admin MENANDAI akun untuk dihapus permanen (satu update atomik + log). Penghapusan Auth + node dilakukan skrip lokal scripts/hapus_akun.py.
 * `sekalianCabut`: untuk kepala/waka/piket, "Cabut akses" menghapus staff/{uid} sehingga tanda harus ditulis pada update yang SAMA
 * (rules membaca staff lama; roles baru harus sudah tidak ada).
 */
export async function tandaiHapusAkun(a: { uid: string; email: string; nama: string; peran: PeranHapus; alasan: string; olehUid: string; sekalianCabut?: boolean }) {
  const u: Updates = { [`hapusAkun/${a.uid}`]: { email: a.email, nama: a.nama, peran: a.peran, alasan: a.alasan.trim().slice(0, 300), olehUid: a.olehUid, ts: serverTimestamp() } };
  if (a.sekalianCabut) { u[`roles/${a.uid}`] = null; u[`staff/${a.uid}`] = null; u[`piketAkun/${a.uid}`] = null; }
  sisipkanAktivitas(u, { aksi: "tandai-hapus-akun", detail: `Tandai hapus permanen ${a.peran} ${a.email}`.slice(0, 300) });
  await kirimUpdate(u, { cadangan: false });
}

/** Batalkan tanda (hapus node) sebelum skrip dijalankan. Tidak mengembalikan akses: akun tetap tercabut. */
export async function batalTandaHapus(uid: string, email: string) {
  const u: Updates = { [`hapusAkun/${uid}`]: null };
  sisipkanAktivitas(u, { aksi: "batal-hapus-akun", detail: `Batalkan tanda hapus ${email}`.slice(0, 300) });
  await kirimUpdate(u, { cadangan: false });
}
