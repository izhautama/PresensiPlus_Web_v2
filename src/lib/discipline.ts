import { tahunAjaran } from "./time";

export type KategoriPelanggaran = "Sangat Berat" | "Berat" | "Sedang" | "Ringan";
export const KATEGORI_LIST: KategoriPelanggaran[] = ["Sangat Berat", "Berat", "Sedang", "Ringan"];
export type Kelompok = "Prestasi" | "Tanpa prestasi";

export type Rule = { kategori: KategoriPelanggaran; nama: string; poin: number; takziran?: string; aktif: boolean; diubahOleh: string; diubahTs: number };
export type Remisi = { kelompok: Kelompok; nama: string; poin: number; syarat?: string; aktif: boolean; diubahOleh: string; diubahTs: number };
export type Level = { poin: number; tindakan: string };
export type AutoMap = { terlambat?: string; tanpaTapPulang?: string; bolosJam?: string; alfa?: string; lupaKtm?: string; ktmHilang?: string };

/**
 * discipline/records/{nis}/{recId} — PUBLIK (orang tua boleh membaca anak sendiri).
 * Hanya isi catatan: tanpa nama pencatat dan tanpa item terhapus. `poin` selalu positif; tandanya dari `jenis`.
 */
export type DiscRecord = {
  jenis: "pelanggaran" | "remisi";
  refId?: string;
  nama: string;
  kategori?: string;
  poin: number;
  tanggal: string;
  ta: string;
  takziran?: string;
  sumber: "manual" | "saran";
};

/** discipline/recordMeta/{nis}/{recId} — KHUSUS STAF. `snapshot` = salinan isi catatan saat dihapus. */
export type RecordMeta = {
  dibuatOleh: string;
  dibuatNama: string;
  dibuatTs: number;
  diubahOleh?: string;
  diubahTs?: number;
  dihapus?: true;
  alasanHapus?: string;
  snapshot?: DiscRecord;
};

export type AuditEntry = {
  aksi: "buat" | "ubah" | "hapus" | "ubah-master";
  path: string;
  sebelum?: unknown;
  sesudah?: unknown;
  oleh: string;
  olehNama: string;
  ts: number;
};

export type RecordsByNis = Record<string, Record<string, DiscRecord>>;
export type MetaByNis = Record<string, Record<string, RecordMeta>>;

/** Tahun ajaran "2026-2027" (Juli–Juni) dari tanggal "YYYY-MM-DD". */
export function taKey(tanggal: string): string {
  const y = tahunAjaran(tanggal);
  return `${y}-${y + 1}`;
}
export const awalTa = (ta: string) => `${ta.slice(0, 4)}-07-01`;
export const akhirTa = (ta: string) => `${ta.slice(5, 9)}-06-30`;
export const labelTa = (ta: string) => `TA ${ta.replace("-", "/")}`;

export type Ringkas = { pel: number; rem: number; saldo: number; sangatBerat: boolean; jumlah: number };

/** Saldo = pelanggaran − remisi (catatan terhapus diabaikan), minimal 0. */
export function ringkas(recs: Record<string, DiscRecord> | null | undefined, ta: string): Ringkas {
  let pel = 0, rem = 0, jumlah = 0, sangatBerat = false;
  for (const x of Object.values(recs ?? {})) {
    if (x.ta !== ta) continue;
    jumlah++;
    if (x.jenis === "pelanggaran") { pel += x.poin; if (x.kategori === "Sangat Berat") sangatBerat = true; }
    else rem += x.poin;
  }
  return { pel, rem, saldo: Math.max(0, pel - rem), sangatBerat, jumlah };
}

export type LevelItem = [string, Level];
export const urutLevel = (levels: Record<string, Level> | null | undefined): LevelItem[] =>
  Object.entries(levels ?? {}).sort((a, b) => a[1].poin - b[1].poin);

/** Level saat ini = ambang tertinggi ≤ saldo; `berikut` = ambang di atasnya. */
export function levelDari(saldo: number, levels: LevelItem[]): { sekarang: LevelItem | null; berikut: LevelItem | null } {
  let sekarang: LevelItem | null = null;
  for (const l of levels) if (l[1].poin <= saldo) sekarang = l;
  const berikut = levels.find((l) => l[1].poin > saldo) ?? null;
  return { sekarang, berikut };
}

/** Siswa "perlu tindak lanjut": sudah mencapai ambang pertama, atau punya pelanggaran Sangat Berat. */
export const perluTindakLanjut = (r: Ringkas, levels: LevelItem[]) =>
  r.sangatBerat || levelDari(r.saldo, levels).sekarang !== null;

export type EntriRiwayat = { id: string; rec: DiscRecord; meta?: RecordMeta; dihapus: boolean };

/**
 * Riwayat satu siswa pada satu TA, terbaru dulu. Catatan aktif datang dari `records` (publik);
 * yang terhapus (hanya bila `denganTerhapus`) diambil dari snapshot di `recordMeta` (khusus staf).
 */
export function daftarRecord(
  recs: Record<string, DiscRecord> | null | undefined,
  meta: Record<string, RecordMeta> | null | undefined,
  ta: string,
  denganTerhapus: boolean,
): EntriRiwayat[] {
  const out: EntriRiwayat[] = [];
  for (const [id, rec] of Object.entries(recs ?? {})) if (rec.ta === ta) out.push({ id, rec, meta: meta?.[id], dihapus: false });
  if (denganTerhapus) {
    for (const [id, m] of Object.entries(meta ?? {})) if (m.dihapus && m.snapshot && m.snapshot.ta === ta) out.push({ id, rec: m.snapshot, meta: m, dihapus: true });
  }
  return out.sort((a, b) => b.rec.tanggal.localeCompare(a.rec.tanggal) || (b.meta?.dibuatTs ?? 0) - (a.meta?.dibuatTs ?? 0));
}

export const poinBertanda = (x: Pick<DiscRecord, "jenis" | "poin">) => (x.jenis === "remisi" ? -x.poin : x.poin);
