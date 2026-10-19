/** Kode presensi per jam pelajaran. Sel kosong = hadir. (Tidak ada kode "B": bolos = sel A saat siswa sudah tap masuk.) */
export type KodeJam = "A" | "I" | "S" | "D";
export const JAM = [1, 2, 3, 4, 5, 6, 7, 8, 9] as const;

export const KODE_LABEL: Record<KodeJam, string> = { A: "Alfa", I: "Izin", S: "Sakit", D: "Dispensasi" };
/** Urutan putar klik pada sel (waka): kosong → A → I → S → D → kosong. */
export const SIKLUS_WAKA: (KodeJam | "")[] = ["", "A", "I", "S", "D"];

/** Siapa yang mengisi sel: `lessons/{tgl}/{kelas}/absenOleh/{nis}/{jam}`. Sel lama TANPA penanda diperlakukan "waka" (paling aman). */
export type Pengisi = "piket" | "waka";
/** Siapa/kapan piket mengisi sel A (hanya tampilan): `lessons/{tgl}/{kelas}/absenInfo/{nis}/{jam}`. */
export type InfoAlfa = { petugas: string; ts: number; hariKe: number };

export type MetaJam = { mapel?: string; guru?: string };

/** lessons/{tgl}/{kelasKey} */
export type LessonsKelas = {
  meta?: Record<string, MetaJam>;
  absen?: Record<string, Record<string, KodeJam>>;
  absenOleh?: Record<string, Record<string, Pengisi>>;
  absenInfo?: Record<string, Record<string, InfoAlfa>>;
  oleh?: string;
  ts?: number;
};

/** lessonsByStudent/{nis}/{tgl}/{jam} */
export type LessonsSiswa = { k: KodeJam; mapel?: string };

/** Key RTDB tidak boleh berisi . # $ [ ] / — karakter itu (dan %) di-encode %XX agar bisa dikembalikan. */
export const encodeKelas = (kelas: string) =>
  kelas.replace(/[%.#$[\]/]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase().padStart(2, "0")}`);
export const decodeKelas = (key: string) => key.replace(/%([0-9A-F]{2})/g, (_, h: string) => String.fromCharCode(parseInt(h, 16)));

/**
 * Siklus klik PIKET (v2.3.1): A (Alfa) HANYA untuk hari ini. Tanggal lampau: kosong → I → S → D (A terkunci); tanggal mendatang: kosong → I → D
 * (tidak ada Sakit/Alfa untuk hari yang belum terjadi).
 */
export const SIKLUS_PIKET_HARI_INI: (KodeJam | "")[] = ["", "A", "I", "S", "D"];
export const SIKLUS_PIKET_LAMPAU: (KodeJam | "")[] = ["", "I", "S", "D"];
export const SIKLUS_PIKET_MENDATANG: (KodeJam | "")[] = ["", "I", "D"];
export const siklusPiket = (tanggal: string, hariIni: string): (KodeJam | "")[] =>
  tanggal > hariIni ? SIKLUS_PIKET_MENDATANG : tanggal === hariIni ? SIKLUS_PIKET_HARI_INI : SIKLUS_PIKET_LAMPAU;

/** Pengisi sel (tanpa penanda = "waka"). */
export const pengisiSel = (absenOleh: LessonsKelas["absenOleh"] | undefined, nis: string, jam: number | string): Pengisi => absenOleh?.[nis]?.[jam] ?? "waka";

/** Sel A yang tidak boleh diubah piket: milik waka (atau tanpa penanda), atau bukan hari ini. Sel S/I/D/kosong selalu boleh (jendela waktu ditegakkan terpisah). */
export const selATerkunciPiket = (kode: KodeJam | "", pengisi: Pengisi, tanggal: string, hariIni: string) => kode === "A" && !(pengisi === "piket" && tanggal === hariIni);

/** Kode berikutnya untuk piket pada satu sel; null = terkunci (tidak berubah). */
export function berikutnyaPiket(sekarang: KodeJam | "", a: { pengisi: Pengisi; tanggal: string; hariIni: string }): KodeJam | "" | null {
  if (selATerkunciPiket(sekarang, a.pengisi, a.tanggal, a.hariIni)) return null;
  return berikutnya(sekarang, siklusPiket(a.tanggal, a.hariIni));
}

/** Berikutnya dalam siklus. */
export function berikutnya(sekarang: KodeJam | "", siklus: (KodeJam | "")[] = SIKLUS_WAKA): KodeJam | "" {
  const i = siklus.indexOf(sekarang);
  return siklus[(i + 1) % siklus.length];
}
