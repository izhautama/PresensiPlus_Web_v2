/** Kode presensi per jam pelajaran. Sel kosong = hadir. (Tidak ada kode "B": bolos = sel A saat siswa sudah tap masuk.) */
export type KodeJam = "A" | "I" | "S" | "D";
export const JAM = [1, 2, 3, 4, 5, 6, 7, 8, 9] as const;

export const KODE_LABEL: Record<KodeJam, string> = { A: "Alfa", I: "Izin", S: "Sakit", D: "Dispensasi" };
/** Urutan putar klik pada sel (waka): kosong → A → I → S → D → kosong. */
export const SIKLUS_WAKA: (KodeJam | "")[] = ["", "A", "I", "S", "D"];

export type MetaJam = { mapel?: string; guru?: string };

/** lessons/{tgl}/{kelasKey} */
export type LessonsKelas = {
  meta?: Record<string, MetaJam>;
  absen?: Record<string, Record<string, KodeJam>>;
  oleh?: string;
  ts?: number;
};

/** lessonsByStudent/{nis}/{tgl}/{jam} */
export type LessonsSiswa = { k: KodeJam; mapel?: string };

/** Key RTDB tidak boleh berisi . # $ [ ] / — karakter itu (dan %) di-encode %XX agar bisa dikembalikan. */
export const encodeKelas = (kelas: string) =>
  kelas.replace(/[%.#$[\]/]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase().padStart(2, "0")}`);
export const decodeKelas = (key: string) => key.replace(/%([0-9A-F]{2})/g, (_, h: string) => String.fromCharCode(parseInt(h, 16)));

/** Berikutnya dalam siklus. */
export function berikutnya(sekarang: KodeJam | "", siklus: (KodeJam | "")[] = SIKLUS_WAKA): KodeJam | "" {
  const i = siklus.indexOf(sekarang);
  return siklus[(i + 1) % siklus.length];
}
