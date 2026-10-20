// Penyaringan & ringkasan Log Aktivitas (murni, dapat diuji).
export type EntriLog = {
  id: string; uid: string; peran: string; akunEmail: string; petugas?: string; aksi: string; nis?: string;
  detail: string; deviceId: string; deviceLabel: string; deviceNama?: string; ts: number;
};
export type Filter = { peran: string; akun: string; petugas: string; perangkat: string; siswa: string; aksi: string };
export const FILTER_KOSONG: Filter = { peran: "", akun: "", petugas: "", perangkat: "", siswa: "", aksi: "" };

export const NAMA_AKSI: Record<string, string> = {
  login: "Masuk", logout: "Keluar", "pilih-petugas": "Pilih petugas", "izin-harian": "Izin harian", "izin-jam": "Izin per jam",
  "hapus-izin": "Hapus izin", pelanggaran: "Pelanggaran", "hapus-pelanggaran": "Hapus pelanggaran", remisi: "Remisi",
  "ubah-pelanggaran": "Ubah pelanggaran", "pulihkan-pelanggaran": "Pulihkan pelanggaran", "presensi-jam": "Presensi per jam", "presensi-manual": "Presensi manual", "atur-wali": "Atur wali kelas", "alfa-jam": "Alfa per jam", "perbaiki-indeks": "Perbaiki indeks kelas", "atur-penanggung-jawab": "Atur penanggung jawab level", "catat-pembinaan": "Catat pembinaan", "usul-remisi": "Usul remisi", "batal-usul": "Batalkan usulan remisi", "putuskan-usul": "Putuskan usulan remisi", "atur-kalender": "Atur kalender (override)", "hapus-kalender": "Hapus override kalender", "hitung-kalender": "Hitung hari efektif", "normal-kalender": "Konfirmasi hari normal", "ambang-kalender": "Ubah ambang hari efektif", "migrasi-kalender": "Migrasi kalender", "hapus-manual": "Hapus presensi manual",
  "validasi-alfa": "Validasi Alfa", "batal-alfa": "Batal Alfa", "saran-setuju": "Setujui saran", "saran-abaikan": "Abaikan saran",
  "kunci-akun": "Kunci akun", "buka-kunci": "Buka kunci akun", "catat-konseling": "Catat konseling", "ubah-konseling": "Ubah konseling", "atur-bk": "Atur akun BK",
};

export function saring(daftar: EntriLog[], f: Filter, namaSiswa: (nis: string) => string): EntriLog[] {
  const s = f.siswa.trim().toLowerCase();
  return daftar
    .filter((x) =>
      (!f.peran || x.peran === f.peran) && (!f.akun || x.akunEmail === f.akun) && (!f.petugas || x.petugas === f.petugas) &&
      (!f.perangkat || x.deviceId === f.perangkat) && (!f.aksi || x.aksi === f.aksi) &&
      (!s || (x.nis && `${x.nis} ${namaSiswa(x.nis)}`.toLowerCase().includes(s))))
    .sort((a, b) => b.ts - a.ts);
}

/** `perangkatBaru` = deviceId akun piket yang pertama kali muncul pada hari yang dilihat. */
export function ringkasan(daftar: EntriLog[], perangkatBaru: Set<string>) {
  const petugas = new Set(daftar.filter((x) => x.petugas).map((x) => x.petugas));
  const baru = new Set(daftar.filter((x) => x.peran === "piket" && perangkatBaru.has(x.deviceId)).map((x) => x.deviceId));
  return { aktivitas: daftar.length, petugas: petugas.size, perangkatBaru: baru.size };
}
export const teksRingkasan = (r: ReturnType<typeof ringkasan>) =>
  `${r.aktivitas} aktivitas, ${r.petugas} petugas, ${r.perangkatBaru} perangkat baru`;
