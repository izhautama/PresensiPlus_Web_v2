import { goOffline, goOnline } from "firebase/database";
import { fb } from "../lib/firebase";

// Paket Spark: maksimal 100 koneksi realtime serentak. Orang tua bisa sangat banyak, jadi portal orang tua TIDAK menahan koneksi:
// koneksi dibuka hanya selama pembacaan (get) lalu ditutup. Halaman staf tetap realtime (koneksi dibiarkan terbuka).

let aktif = 0;       // jumlah pembacaan sekali-baca yang sedang berjalan
let tetapOnline = false; // sesi staf: jangan pernah menutup koneksi

/** Sesi staf dimulai: koneksi harus terbuka terus-menerus. */
export function mulaiRealtimeStaf() {
  tetapOnline = true;
  try { goOnline(fb().db); } catch { /* konfigurasi belum siap */ }
}
/** Sesi staf berakhir: pembacaan sekali-baca berikutnya kembali menutup koneksi setelah selesai. */
export function akhiriRealtimeStaf() { tetapOnline = false; }

/**
 * Jalankan pembacaan sekali-baca: buka koneksi, baca, lalu tutup lagi (goOffline) setelah SEMUA pembacaan serentak selesai.
 * Aman dipanggil bertumpuk (interval 60 detik + visibilitychange + tombol segarkan).
 */
export async function bacaSekali<T>(fn: () => Promise<T>): Promise<T> {
  const { db } = fb();
  aktif++;
  goOnline(db);
  try {
    return await fn();
  } finally {
    aktif--;
    if (aktif === 0 && !tetapOnline) goOffline(db);
  }
}
