// Pembinaan berperingkat (wali < BK < kepala), klaim BK, izin orang tua, dan usulan remisi (fungsi MURNI; dicerminkan di Security Rules).
import { ringkas, taKey, type DiscRecord, type Level, type PenanggungJawab, type RecordMeta, type Remisi } from "./discipline.ts";

export type { PenanggungJawab };
/** Yang ditawarkan UI Tata tertib (v2.5). `waka` tetap dikenali sebagai nilai lama agar data lama terbaca. */
export const PJ_LIST: PenanggungJawab[] = ["wali", "bk", "kepala"];
export const PJ_LABEL: Record<PenanggungJawab, string> = { wali: "Wali kelas", bk: "BK", kepala: "Kepala Madrasah", waka: "Waka Kesiswaan" };

/** Nilai bawaan untuk ambang lama yang belum punya penanggung jawab: lv01..lv06 dari data awal, atau menurut ambang 100/200/300/>=400. */
export function penanggungJawabBawaan(id: string, level: Pick<Level, "poin">): PenanggungJawab | null {
  const seed: Record<string, PenanggungJawab> = { lv01: "wali", lv02: "bk", lv03: "kepala", lv04: "kepala", lv05: "kepala", lv06: "kepala" };
  if (seed[id]) return seed[id];
  if (level.poin === 100) return "wali";
  if (level.poin === 200) return "bk";
  if (level.poin === 300) return "kepala";
  if (level.poin >= 400) return "kepala";
  return null;
}

export const METODE_PB = ["Tatap muka", "Telepon/WhatsApp", "Kunjungan rumah", "Lainnya"] as const;
export type MetodePB = (typeof METODE_PB)[number];
export type StatusPB = "dijadwalkan" | "selesai";

/** Peringkat peran untuk hak baca pembinaan: wali 1 < bk 2 < waka 3 < kepala 4. Admin TIDAK ikut hierarki (tidak membaca pembinaan). */
export type PeranPembinaan = "wali" | "bk" | "waka" | "kepala";
export const PERINGKAT: Record<PeranPembinaan, number> = { wali: 1, bk: 2, waka: 3, kepala: 4 };
/** Kelompok pembinaan/{pj} yang boleh dibaca peran: wali = wali; bk = wali+bk; waka = wali+bk (TIDAK kepala); kepala = semua. */
export function kelompokBaca(peran: PeranPembinaan | string | null | undefined): ("wali" | "bk" | "kepala")[] {
  if (peran === "wali") return ["wali"];
  if (peran === "bk" || peran === "waka") return ["wali", "bk"];
  if (peran === "kepala") return ["wali", "bk", "kepala"];
  return [];
}
/** Kelompok untuk sebuah nilai penanggung jawab: nilai lama `waka` dibaca bersama kelompok kepala bila belum dimigrasi tidak ada (path hanya wali|bk|kepala). */
export const kelompokPj = (pj: PenanggungJawab | undefined): "wali" | "bk" | "kepala" => (pj === "wali" || pj === "bk" ? pj : "kepala");
/** Boleh mengoreksi record 'selesai' berpenanggung jawab `pj`: hanya peringkat LEBIH TINGGI (waka untuk wali/bk, kepala untuk semua). */
export const bolehKoreksi = (peran: PeranPembinaan, pj: "wali" | "bk" | "kepala") => (peran === "waka" || peran === "kepala") && PERINGKAT[peran] > PERINGKAT[pj] && (peran === "kepala" || pj !== "kepala");

/** pembinaan/{pj}/{nis}/{ta}_{levelId}: satu catatan per (TA, ambang). Tidak dapat dihapus fisik. `pj` = salinan penanggung jawab ambang saat dibuat (tetap). */
export type Pembinaan = {
  pj?: "wali" | "bk" | "kepala"; ta: string; levelId: string; levelPoin: number; tindakan: string; tanggal: string; metode: MetodePB;
  hasil: string; tindakLanjut?: string; status: StatusPB; oleh: string; olehNama: string; dibuatTs: number; diubahOleh?: string; diubahTs?: number;
};

// ---------------------------------------------------------------- izin & proyeksi orang tua
export type ModeOrtu = "ringkas" | "lengkap";
export const MODE_ORTU_LABEL: Record<ModeOrtu, string> = { ringkas: "Hanya status dan tanggal", lengkap: "Status, tindakan, hasil, dan tindak lanjut" };
/** izinOrtu/{nis}/{ta}/{levelId} (dibaca waka & kepala). */
export type IzinOrtu = { mode: ModeOrtu; olehUid: string; olehPeran: "waka" | "kepala"; ts: number };
/** kunciOrtu/{nis}/{ta}/{levelId}: hanya kepala yang menulis. */
export type KunciOrtu = { olehUid: string; ts: number; alasan: string };
/** pembinaanOrtu/{nis}/{ta}/{levelId}: proyeksi yang dibaca orang tua. TIDAK PERNAH memuat nama pembina, uid, konseling, atau klaim. */
export type PembinaanOrtu = { status: StatusPB; tanggal: string; levelPoin: number; mode: ModeOrtu; tindakan?: string; hasil?: string; tindakLanjut?: string };
export function proyeksiOrtu(pb: Pick<Pembinaan, "status" | "tanggal" | "levelPoin" | "tindakan" | "hasil" | "tindakLanjut">, mode: ModeOrtu): PembinaanOrtu {
  const dasar: PembinaanOrtu = { status: pb.status, tanggal: pb.tanggal, levelPoin: pb.levelPoin, mode };
  if (mode === "ringkas") return dasar;
  return { ...dasar, tindakan: pb.tindakan, hasil: pb.hasil, ...(pb.tindakLanjut ? { tindakLanjut: pb.tindakLanjut } : {}) };
}
/** Siapa yang boleh memberi/mengubah izin untuk level berpenanggung jawab `pj`, dengan atau tanpa kunci. */
export function bolehBeriIzin(peran: "waka" | "kepala", pj: "wali" | "bk" | "kepala", terkunci: boolean): boolean {
  if (peran === "kepala") return true;
  return !terkunci && pj !== "kepala";
}
/** Waka mencabut hanya izin yang ia berikan dan belum terkunci; kepala mencabut semua. */
export const bolehCabutIzin = (peran: "waka" | "kepala", izin: Pick<IzinOrtu, "olehPeran" | "olehUid">, uid: string, terkunci: boolean) =>
  peran === "kepala" || (!terkunci && izin.olehPeran === "waka" && izin.olehUid === uid);

// ---------------------------------------------------------------- klaim BK
/** klaimBK/{nis}/{ta}_{levelId}: siapa cepat dia dapat. */
export type KlaimBk = { bkUid: string; bkNama: string; sejak: number; cara: "klaim" | "tunjuk"; olehUid: string; ta: string; levelId: string };

export const idPembinaan = (ta: string, levelId: string) => `${ta}_${levelId}`;

/** Saldo tertinggi yang pernah dicapai pada satu TA (catatan diurut tanggal, lalu waktu catat bila diketahui). Catatan terhapus sudah tidak ada di `recs`. */
export function puncakSaldo(recs: Record<string, DiscRecord> | null | undefined, meta: Record<string, RecordMeta> | null | undefined, ta: string): number {
  const urut = Object.entries(recs ?? {}).filter(([, x]) => x.ta === ta)
    .sort((a, b) => a[1].tanggal.localeCompare(b[1].tanggal) || (meta?.[a[0]]?.dibuatTs ?? 0) - (meta?.[b[0]]?.dibuatTs ?? 0) || a[0].localeCompare(b[0]));
  let jalan = 0, puncak = 0;
  for (const [, x] of urut) { jalan += x.jenis === "remisi" ? -x.poin : x.poin; if (jalan > puncak) puncak = jalan; }
  return puncak;
}

export type ItemDibina = {
  nis: string; levelId: string; level: Level; saldo: number; puncak: number;
  /** saldo sekarang sudah di bawah ambang, tetapi ambang pernah dilewati dan belum dibina */
  saldoTurun: boolean;
  status: "perlu" | "dijadwalkan";
  pembinaan?: Pembinaan;
};

/**
 * Siswa yang "perlu dibina": saldo pernah melewati ambang yang penanggung jawabnya `pj` (bawaan wali) pada TA berjalan DAN belum ada pembinaan
 * berstatus 'selesai' untuk (TA, ambang) itu. Tetap tampil bila saldo kemudian turun (label saldoTurun). Pembinaan 'dijadwalkan' tetap tampil.
 */
export function perluDibina(a: {
  nis: string; recs: Record<string, DiscRecord> | null | undefined; meta?: Record<string, RecordMeta> | null;
  levels: Record<string, Level> | null | undefined; pembinaan: Record<string, Pembinaan> | null | undefined; ta: string; pj?: PenanggungJawab;
}): ItemDibina[] {
  const pj = a.pj ?? "wali";
  const saldo = ringkas(a.recs, a.ta).saldo;
  const puncak = puncakSaldo(a.recs, a.meta, a.ta);
  const out: ItemDibina[] = [];
  for (const [levelId, level] of Object.entries(a.levels ?? {}).sort((x, y) => x[1].poin - y[1].poin)) {
    if (level.penanggungJawab !== pj) continue;
    if (puncak < level.poin) continue;
    const pb = a.pembinaan?.[idPembinaan(a.ta, levelId)];
    if (pb && pb.ta === a.ta && pb.status === "selesai") continue;
    out.push({ nis: a.nis, levelId, level, saldo, puncak, saldoTurun: saldo < level.poin, status: pb?.status === "dijadwalkan" ? "dijadwalkan" : "perlu", pembinaan: pb });
  }
  return out;
}

export type EntriSiswa = { nis: string; recs: Record<string, DiscRecord> | null | undefined; meta?: Record<string, RecordMeta> | null; pembinaan: Record<string, Pembinaan> | null | undefined };
export const daftarPerluDibina = (entri: EntriSiswa[], levels: Record<string, Level> | null | undefined, ta: string, pj: PenanggungJawab = "wali"): ItemDibina[] =>
  entri.flatMap((e) => perluDibina({ ...e, levels, ta, pj })).sort((x, y) => x.nis.localeCompare(y.nis, "id", { numeric: true }) || x.level.poin - y.level.poin);

/** TA berjalan dari tanggal hari ini (WIB). */
export const taBerjalan = (hariIni: string) => taKey(hariIni);

export type FormPembinaan = { tanggal: string; metode: string; hasil: string; tindakLanjut: string; status: string };
/** Validasi isian pembinaan (cermin rules): hasil 10..1000, tindak lanjut <= 500, metode dikenal, 'selesai' tidak boleh berdatum masa depan. */
export function validasiPembinaan(f: FormPembinaan, hariIni: string): Record<string, string> {
  const v: Record<string, string> = {};
  if (!/^20\d\d-[01]\d-[0-3]\d$/.test(f.tanggal)) v.tanggal = "Tanggal tidak valid";
  else if (f.status === "selesai" && f.tanggal > hariIni) v.tanggal = "Pembinaan yang sudah selesai tidak boleh bertanggal masa depan";
  if (!(METODE_PB as readonly string[]).includes(f.metode)) v.metode = "Pilih metode pembinaan";
  const hasil = f.hasil.trim();
  if (hasil.length < 10) v.hasil = "Uraikan hasil pembinaan (minimal 10 karakter)";
  else if (hasil.length > 1000) v.hasil = "Hasil maksimal 1000 karakter";
  if (f.tindakLanjut.trim().length > 500) v.tindakLanjut = "Tindak lanjut maksimal 500 karakter";
  if (f.status !== "dijadwalkan" && f.status !== "selesai") v.status = "Pilih status";
  return v;
}

// ---------------------------------------------------------------- usulan remisi
export type StatusUsul = "menunggu" | "disetujui" | "ditolak";
export type UsulRemisi = {
  nis: string; remId: string; nama: string; poin: number; alasan: string; oleh: string; ts: number; status: StatusUsul;
  diputuskanOleh?: string; diputuskanTs?: number; alasanKeputusan?: string; recId?: string;
};

/** Validasi usulan oleh wali. `punyaPelanggaranTa` = siswa punya catatan pelanggaran pada TA berjalan (syarat remisi "Tanpa prestasi"). */
export function validasiUsul(a: { remisi: Remisi | undefined; alasan: string; punyaPelanggaranTa: boolean; usulLain: Pick<UsulRemisi, "nis" | "remId" | "status">[]; nis: string; remId: string }): Record<string, string> {
  const v: Record<string, string> = {};
  if (!a.remisi || !a.remisi.aktif) v.remisi = "Pilih remisi yang aktif";
  else if (a.remisi.kelompok === "Tanpa prestasi" && !a.punyaPelanggaranTa) v.remisi = `Remisi "Tanpa prestasi" hanya untuk murid yang punya catatan pelanggaran di TA ini`;
  const al = a.alasan.trim();
  if (al.length < 10) v.alasan = "Jelaskan alasan usulan (minimal 10 karakter)";
  else if (al.length > 300) v.alasan = "Alasan maksimal 300 karakter";
  if (a.usulLain.some((u) => u.nis === a.nis && u.remId === a.remId && u.status === "menunggu")) v.remisi = "Usulan yang sama untuk siswa ini masih menunggu keputusan";
  return v;
}

/** Usulan yang masih menunggu, terlama dulu (antrean keputusan waka/kepala). */
export const antreanUsul = (usul: Record<string, UsulRemisi> | null | undefined) =>
  Object.entries(usul ?? {}).filter(([, u]) => u.status === "menunggu").sort((a, b) => a[1].ts - b[1].ts);
