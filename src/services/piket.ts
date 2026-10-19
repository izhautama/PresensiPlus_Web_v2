import { serverTimestamp, update } from "firebase/database";
import { taKey } from "../lib/discipline";
import { KET_DARI_KODE, hariKeDariTanggal, type KetPiket, type KodeIzin } from "../lib/piket";
import { encodeKelas, type KodeJam } from "../lib/perjam";
import type { Rule } from "../lib/discipline";
import { kirimUpdate, sisipkanAktivitas, type AksiLog } from "./aktivitas";
import { r } from "./db";
import { newKey } from "./discipline";

type Updates = Record<string, unknown>;

/** Konteks tulis piket: akun (uid) + NAMA PETUGAS yang dipilih sendiri di layar "Siapa yang bertugas?". */
export type PiketCtx = { uid: string; petugas: string };

/** Penolakan Security Rules diterjemahkan menjadi pesan yang dapat ditindaklanjuti petugas. */
export function pesanPiket(e: unknown): string {
  const t = `${(e as { code?: string })?.code ?? ""} ${(e as Error)?.message ?? ""}`;
  if (/permission|PERMISSION_DENIED/i.test(t)) {
    return "Ditolak oleh aturan keamanan. Kemungkinan: tanggal di luar jendela waktu, siswa sudah dikonfirmasi Alfa oleh Waka, sel jam berisi Alfa milik Waka atau Alfa piket pada tanggal lampau (hanya Waka yang dapat mengubahnya), Alfa untuk tanggal selain hari ini, siswa sudah berketerangan harian, atau jam perangkat sangat tidak akurat.";
  }
  return (e as Error)?.message ?? "Terjadi kesalahan";
}

/** Log aktivitas WAJIB untuk piket (ditegakkan rules). Mengembalikan id log: dipakai sebagai awalan kunci izinMeta. */
function logWajib(u: Updates, aksi: AksiLog, nis: string | undefined, detail: string): string {
  const id = sisipkanAktivitas(u, { aksi, nis, detail });
  if (!id) throw new Error("Sesi tidak valid. Silakan login ulang.");
  return id;
}

const metaIzin = (ctx: PiketCtx, tanggal: string, a: { lingkup: "harian" | "jam"; ket: KetPiket; keterangan: string; suratDiterima: boolean; jam?: number[] }) => ({
  lingkup: a.lingkup,
  ...(a.jam ? { jam: Object.fromEntries(a.jam.map((j, i) => [i, j])) } : {}),
  ket: a.ket,
  keterangan: a.keterangan.trim().slice(0, 200),
  suratDiterima: a.suratDiterima,
  petugas: ctx.petugas,
  oleh: ctx.uid,
  ts: serverTimestamp(), // rules mewajibkan ts === now: meta HARUS dibuat pada update ini (tidak dapat memakai ulang meta lama)
  hariKe: hariKeDariTanggal(tanggal), // ditegakkan terhadap `now` oleh Security Rules (jendela N hari)
});

/** Izin/Sakit/Dispensasi seharian + izinMeta (kunci "<idLog>_H") + log aktivitas dalam SATU update. */
export async function izinHarianPiket(a: { tanggal: string; nis: string; ket: KetPiket; keterangan: string; suratDiterima: boolean }, ctx: PiketCtx) {
  const u: Updates = {};
  const aid = logWajib(u, "izin-harian", a.nis, `${a.ket} ${a.tanggal}: ${a.keterangan.trim()}${a.suratDiterima ? " (surat diterima)" : ""}`);
  u[`izin/${a.tanggal}/${a.nis}`] = a.ket;
  u[`attendance/${a.nis}/${a.tanggal}/ket`] = a.ket;
  u[`attendance/${a.nis}/${a.tanggal}/catatan`] = a.keterangan.trim().slice(0, 200);
  u[`izinMeta/${a.tanggal}/${a.nis}/${aid}_H`] = metaIzin(ctx, a.tanggal, { lingkup: "harian", ket: a.ket, keterangan: a.keterangan, suratDiterima: a.suratDiterima });
  await kirimUpdate(u);
}

/** Hapus keterangan harian (ditolak bila Waka sudah mengonfirmasi Alfa). izinMeta dibiarkan sebagai jejak. */
export async function hapusIzinHarianPiket(tanggal: string, nis: string) {
  const u: Updates = { [`izin/${tanggal}/${nis}`]: null, [`attendance/${nis}/${tanggal}/ket`]: null, [`attendance/${nis}/${tanggal}/catatan`]: null };
  logWajib(u, "hapus-izin", nis, `Hapus keterangan ${tanggal}`);
  await kirimUpdate(u);
}

/** `lama` = kode tersimpan sebelum perubahan (menentukan jalur: A diatur aturan terpisah, aksi log "alfa-jam"). */
export type SelPiket = { nis: string; jam: number; kode: KodeIzin | "A" | null; lama?: KodeJam | "" };

/** Sel yang termasuk jalur ALFA: mengisi A atau mengosongkan A milik piket sendiri. Log aksi "alfa-jam", tanpa izinMeta. */
export const selJalurAlfa = (s: SelPiket) => s.kode === "A" || (s.lama === "A" && s.kode === null);

/**
 * Simpan perubahan per jam oleh piket. Dua jalur terpisah (aturan log berbeda, jadi dua update):
 *  - ALFA (A hari ini / kosongkan A sendiri): lessons + penanda `absenOleh`="piket" + `absenInfo` (nama petugas, waktu) + salinan siswa + log "alfa-jam".
 *  - S/I/D (termasuk mengganti A sendiri menjadi S/I/D): seperti sebelumnya, wajib keterangan + izinMeta + log "izin-jam".
 * Jalur Alfa dijalankan lebih dulu; bila jalur kedua gagal, jalur pertama sudah tersimpan (pesan galat menyebutnya).
 */
export async function izinPerJamPiket(a: {
  tanggal: string; kelas: string; sel: SelPiket[]; mapelByJam: Record<number, string | undefined>; keterangan: string; suratDiterima: boolean;
}, ctx: PiketCtx) {
  const alfa = a.sel.filter(selJalurAlfa);
  const sid = a.sel.filter((s) => !selJalurAlfa(s));
  let alfaTersimpan = 0;
  if (alfa.length) {
    await simpanAlfaPiket({ ...a, sel: alfa }, ctx);
    alfaTersimpan = alfa.length;
  }
  if (sid.length) {
    try { await simpanSidPiket({ ...a, sel: sid }, ctx); }
    catch (e) { if (alfaTersimpan) throw new Error(`${alfaTersimpan} sel Alfa sudah tersimpan, tetapi perubahan Izin/Sakit/Dispensasi gagal: ${pesanPiket(e)}`); throw e; }
  }
}

/** Alfa per jam oleh piket (hanya hari ini; rules menegakkan). Tanpa keterangan dan tanpa izinMeta: Alfa = tidak hadir tanpa keterangan. */
async function simpanAlfaPiket(a: { tanggal: string; kelas: string; sel: SelPiket[]; mapelByJam: Record<number, string | undefined> }, ctx: PiketCtx) {
  const base = `lessons/${a.tanggal}/${encodeKelas(a.kelas)}`;
  const u: Updates = {};
  for (const s of a.sel) {
    const isi = s.kode === "A";
    u[`${base}/absen/${s.nis}/${s.jam}`] = isi ? "A" : null;
    u[`${base}/absenOleh/${s.nis}/${s.jam}`] = isi ? "piket" : null;
    u[`${base}/absenInfo/${s.nis}/${s.jam}`] = isi ? { petugas: ctx.petugas.slice(0, 60), ts: serverTimestamp(), hariKe: hariKeDariTanggal(a.tanggal) } : null; // hariKe: klaim hari sel, rules wajibkan = hari server
    const mapel = a.mapelByJam[s.jam];
    u[`lessonsByStudent/${s.nis}/${a.tanggal}/${s.jam}`] = isi ? { k: "A", ...(mapel ? { mapel } : {}) } : null;
  }
  const nisUnik = [...new Set(a.sel.map((s) => s.nis))];
  const ringkas = a.sel.map((s) => `${s.nis} jam ${s.jam} ${s.kode === "A" ? "Alfa" : "kosongkan A"}`).join("; ");
  logWajib(u, "alfa-jam", nisUnik.length === 1 ? nisUnik[0] : undefined, `${a.kelas} ${a.tanggal}: ${ringkas}`);
  await kirimUpdate(u);
}

/** S/I/D per jam + izinMeta (kunci "<idLog>_<kode>") + log "izin-jam" dalam satu update. Penanda `absenOleh`="piket" untuk sel yang terisi. */
async function simpanSidPiket(a: {
  tanggal: string; kelas: string; sel: SelPiket[]; mapelByJam: Record<number, string | undefined>; keterangan: string; suratDiterima: boolean;
}, ctx: PiketCtx) {
  const base = `lessons/${a.tanggal}/${encodeKelas(a.kelas)}`;
  const u: Updates = {};
  const grup = new Map<string, { nis: string; kode: KodeIzin; jam: number[] }>();
  for (const s of a.sel) {
    const kode = s.kode === "A" ? null : s.kode; // jalur ini tidak pernah menulis A
    u[`${base}/absen/${s.nis}/${s.jam}`] = kode;
    u[`${base}/absenOleh/${s.nis}/${s.jam}`] = kode ? "piket" : null;
    if (s.lama === "A") u[`${base}/absenInfo/${s.nis}/${s.jam}`] = null; // A milik piket diganti: info Alfa ikut dihapus
    const mapel = a.mapelByJam[s.jam];
    u[`lessonsByStudent/${s.nis}/${a.tanggal}/${s.jam}`] = kode ? { k: kode, ...(mapel ? { mapel } : {}) } : null;
    if (kode) {
      const g = grup.get(`${s.nis}|${kode}`) ?? { nis: s.nis, kode, jam: [] };
      g.jam.push(s.jam);
      grup.set(`${s.nis}|${kode}`, g);
    }
  }
  const nisUnik = [...new Set(a.sel.map((s) => s.nis))];
  const ringkas = [...grup.values()].map((g) => `${g.nis} jam ${g.jam.sort((x, y) => x - y).join(",")} ${KET_DARI_KODE[g.kode]}`).join("; ");
  const aid = logWajib(u, "izin-jam", nisUnik.length === 1 ? nisUnik[0] : undefined, `${a.kelas} ${a.tanggal}: ${ringkas || "kosongkan sel"} — ${a.keterangan.trim()}`);
  for (const g of grup.values()) {
    const jam = g.jam.sort((x, y) => x - y);
    u[`izinMeta/${a.tanggal}/${g.nis}/${aid}_${g.kode}`] = metaIzin(ctx, a.tanggal, {
      lingkup: "jam", jam, ket: KET_DARI_KODE[g.kode], keterangan: a.keterangan, suratDiterima: a.suratDiterima,
    });
  }
  await kirimUpdate(u);
}

// ------------------------------------------------------------------ pelanggaran ringan / bertakziran
export type SiswaMin = { nis: string; nama: string; kelas: string };
export type PiketHarian = {
  nis: string; nama: string; kelas: string; pelanggaran: string; takziran?: string; petugas: string; hariKe: number;
  refId: string; poin: number; kategori?: string; dihapus?: true;
};

/**
 * Catat pelanggaran dari MASTER (poin/nama/kategori/takziran diambil persis dari master; tidak dapat diubah piket).
 * Satu update: records (publik) + recordMeta (nama petugas) + piketHarian (ringkasan) + log aktivitas.
 */
export async function pelanggaranPiket(a: { siswa: SiswaMin[]; ruleId: string; rule: Rule; tanggal: string }, ctx: PiketCtx) {
  const u: Updates = {};
  logWajib(u, "pelanggaran", a.siswa.length === 1 ? a.siswa[0].nis : undefined, `${a.rule.nama} (${a.rule.poin} poin) ${a.tanggal}: ${a.siswa.map((s) => s.nama).join(", ")}`);
  for (const s of a.siswa) {
    const id = newKey(`discipline/records/${s.nis}`);
    u[`discipline/records/${s.nis}/${id}`] = {
      jenis: "pelanggaran", refId: a.ruleId, nama: a.rule.nama, kategori: a.rule.kategori, poin: a.rule.poin,
      tanggal: a.tanggal, ta: taKey(a.tanggal), sumber: "piket", ...(a.rule.takziran ? { takziran: a.rule.takziran } : {}),
    };
    u[`discipline/recordMeta/${s.nis}/${id}`] = { dibuatOleh: ctx.uid, dibuatNama: ctx.petugas, dibuatTs: serverTimestamp() };
    const ph: PiketHarian = {
      nis: s.nis, nama: s.nama, kelas: s.kelas, pelanggaran: a.rule.nama, petugas: ctx.petugas, hariKe: hariKeDariTanggal(a.tanggal),
      refId: a.ruleId, poin: a.rule.poin, kategori: a.rule.kategori, ...(a.rule.takziran ? { takziran: a.rule.takziran } : {}),
    };
    u[`piketHarian/${a.tanggal}/${id}`] = ph;
  }
  await kirimUpdate(u);
}

/** Hapus-lunak catatan piket sendiri: hilang dari node publik, alasan + snapshot di recordMeta, penanda di piketHarian. */
export async function hapusPelanggaranPiket(a: { tanggal: string; id: string; item: PiketHarian; alasan: string }, ctx: PiketCtx) {
  const { item } = a;
  const m = `discipline/recordMeta/${item.nis}/${a.id}`;
  const u: Updates = {};
  logWajib(u, "hapus-pelanggaran", item.nis, `Hapus ${item.pelanggaran} (${item.nama}): ${a.alasan.trim()}`);
  u[`discipline/records/${item.nis}/${a.id}`] = null;
  u[`${m}/dihapus`] = true;
  u[`${m}/alasanHapus`] = a.alasan.trim().slice(0, 200);
  u[`${m}/snapshot`] = {
    jenis: "pelanggaran", refId: item.refId, nama: item.pelanggaran, ...(item.kategori ? { kategori: item.kategori } : {}), poin: item.poin,
    tanggal: a.tanggal, ta: taKey(a.tanggal), sumber: "piket", ...(item.takziran ? { takziran: item.takziran } : {}),
  };
  u[`${m}/diubahOleh`] = ctx.uid;
  u[`${m}/diubahTs`] = serverTimestamp();
  u[`piketHarian/${a.tanggal}/${a.id}/dihapus`] = true;
  await kirimUpdate(u);
}

// ------------------------------------------------------------------ roster & pengaturan (waka/admin)
export async function simpanPetugas(id: string | null, data: { nama: string; aktif: boolean }) {
  const key = id ?? newKey("piketRoster");
  await update(r("/"), { [`piketRoster/${key}`]: { nama: data.nama.trim().slice(0, 60), aktif: data.aktif } });
}
export const simpanJendelaMundur = (hari: number) => update(r("/"), { "discipline/settings/piketMundurHari": hari });
