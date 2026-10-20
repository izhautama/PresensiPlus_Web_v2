// Catatan konseling RAHASIA (BK). Fungsi MURNI; aturan yang sama ditegakkan Security Rules (konseling, konselingAudit).
export const TOPIK_KONSELING = ["Akademik", "Pribadi", "Sosial", "Karier", "Keluarga", "Lainnya"] as const;
export type TopikKonseling = (typeof TOPIK_KONSELING)[number];

/** konseling/{nis}/{id}. Baca: BK dan Kepala. Tulis: BK pembuat. Tidak dapat dihapus fisik. */
export type Konseling = {
  tanggal: string; topik: TopikKonseling; isi: string; tindakLanjut?: string; rahasia: true;
  oleh: string; olehNama: string; dibuatTs: number; diubahTs?: number; diubahOleh?: string;
};
/** konselingAudit/{nis}/{idLog}: isi LAMA sebelum koreksi; hanya BK dan Kepala yang membaca. */
export type AuditKonseling = {
  konselingId: string; oleh: string; olehNama: string; ts: number;
  sebelum: { tanggal: string; topik: TopikKonseling; isi: string; tindakLanjut?: string };
};
export type FormKonseling = { tanggal: string; topik: string; isi: string; tindakLanjut: string };

export const BATAS_ISI = { min: 10, max: 2000, tindakLanjut: 500 } as const;

export function validasiKonseling(f: FormKonseling, hariIni: string): Record<string, string> {
  const v: Record<string, string> = {};
  if (!/^20\d\d-[01]\d-[0-3]\d$/.test(f.tanggal)) v.tanggal = "Tanggal tidak valid";
  else if (f.tanggal > hariIni) v.tanggal = "Tanggal konseling tidak boleh di masa depan";
  if (!(TOPIK_KONSELING as readonly string[]).includes(f.topik)) v.topik = "Pilih topik";
  const isi = f.isi.trim();
  if (isi.length < BATAS_ISI.min) v.isi = `Uraikan isi konseling (minimal ${BATAS_ISI.min} karakter)`;
  else if (isi.length > BATAS_ISI.max) v.isi = `Isi maksimal ${BATAS_ISI.max} karakter`;
  if (f.tindakLanjut.trim().length > BATAS_ISI.tindakLanjut) v.tindakLanjut = `Tindak lanjut maksimal ${BATAS_ISI.tindakLanjut} karakter`;
  return v;
}

/** Ringkasan untuk daftar: potong isi tanpa memotong kata di tengah. */
export function ringkasIsi(isi: string, maks = 120): string {
  const t = isi.trim().replace(/\s+/g, " ");
  if (t.length <= maks) return t;
  const potong = t.slice(0, maks);
  const spasi = potong.lastIndexOf(" ");
  return `${(spasi > maks * 0.6 ? potong.slice(0, spasi) : potong).trimEnd()}…`;
}

/** Catatan terbaru lebih dulu (tanggal konseling, lalu waktu dibuat). */
export function urutKonseling<T extends { k: Konseling }>(daftar: T[]): T[] {
  return daftar.slice().sort((a, b) => b.k.tanggal.localeCompare(a.k.tanggal) || b.k.dibuatTs - a.k.dibuatTs);
}
