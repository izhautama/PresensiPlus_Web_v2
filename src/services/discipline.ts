import { push, serverTimestamp, update } from "firebase/database";
import { SEED_AUTOMAP, SEED_LEVELS, SEED_REMISI, SEED_RULES } from "../kesiswaan/seed";
import type { AuditEntry, DiscRecord, Kelompok, KategoriPelanggaran, Level, RecordMeta } from "../lib/discipline";
import { kirimUpdate, sisipkanAktivitas } from "./aktivitas";
import { r } from "./db";

/** Pelaku perubahan: uid + nama untuk jejak audit. */
export type Actor = { uid: string; nama: string };

const DB = "discipline";
type Updates = Record<string, unknown>;

/** Hilangkan `undefined` agar aman untuk RTDB dan untuk disalin ke audit. */
const bersih = <T,>(x: T): T => JSON.parse(JSON.stringify(x ?? null));
export const newKey = (path: string) => push(r(path)).key as string;

export function tambahAudit(u: Updates, a: Actor, aksi: AuditEntry["aksi"], path: string, sebelum: unknown, sesudah: unknown) {
  const entry: Record<string, unknown> = { aksi, path, oleh: a.uid, olehNama: a.nama, ts: serverTimestamp() };
  if (sebelum !== undefined && sebelum !== null) entry.sebelum = bersih(sebelum);
  if (sesudah !== undefined && sesudah !== null) entry.sesudah = bersih(sesudah);
  u[`${DB}/audit/${newKey(`${DB}/audit`)}`] = entry;
}

// ------------------------------------------------------------------ catatan pelanggaran / remisi
export type InputRecord = {
  jenis: "pelanggaran" | "remisi";
  refId?: string;
  nama: string;
  kategori?: string;
  poin: number;
  tanggal: string;
  ta: string;
  takziran?: string;
  sumber?: DiscRecord["sumber"];
  catatan?: string; // catatan internal -> discipline/notes
};

/**
 * Catat 1 pelanggaran/remisi untuk banyak siswa dalam satu update atomik:
 * records (publik, bersih) + recordMeta (pencatat, khusus staf) + catatan internal + audit.
 */
export async function catatRecords(nisList: string[], input: InputRecord, a: Actor, recIdFor?: (nis: string) => string) {
  const u: Updates = {};
  const hasil: { nis: string; recId: string }[] = [];
  for (const nis of nisList) {
    const recId = recIdFor ? recIdFor(nis) : newKey(`${DB}/records/${nis}`);
    const rec: DiscRecord = {
      jenis: input.jenis, nama: input.nama, poin: input.poin, tanggal: input.tanggal, ta: input.ta, sumber: input.sumber ?? "manual",
      ...(input.refId ? { refId: input.refId } : {}),
      ...(input.kategori ? { kategori: input.kategori } : {}),
      ...(input.takziran ? { takziran: input.takziran } : {}),
    };
    u[`${DB}/records/${nis}/${recId}`] = rec;
    u[`${DB}/recordMeta/${nis}/${recId}`] = { dibuatOleh: a.uid, dibuatNama: a.nama, dibuatTs: serverTimestamp() };
    if (input.catatan) u[`${DB}/notes/${nis}/${recId}`] = input.catatan;
    tambahAudit(u, a, "buat", `${DB}/records/${nis}/${recId}`, null, rec);
    hasil.push({ nis, recId });
  }
  sisipkanAktivitas(u, {
    aksi: input.jenis === "remisi" ? "remisi" : "pelanggaran", nis: nisList.length === 1 ? nisList[0] : undefined,
    detail: `${input.nama} (${input.poin} poin) · ${nisList.length} siswa`,
  });
  await kirimUpdate(u);
  return hasil;
}

export type PerubahanRecord = Partial<Pick<DiscRecord, "nama" | "poin" | "tanggal" | "ta" | "takziran" | "refId" | "kategori">>;

export async function ubahRecord(nis: string, recId: string, sebelum: DiscRecord, perubahan: PerubahanRecord, a: Actor) {
  const u: Updates = {};
  const path = `${DB}/records/${nis}/${recId}`;
  const sesudah: Record<string, unknown> = {};
  const sebelumDiff: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(perubahan)) {
    const lama = (sebelum as Record<string, unknown>)[k];
    const baru = v === "" ? undefined : v;
    if (lama === baru || (lama === undefined && baru === undefined)) continue;
    u[`${path}/${k}`] = baru ?? null;
    sebelumDiff[k] = lama ?? null;
    sesudah[k] = baru ?? null;
  }
  if (!Object.keys(sesudah).length) return;
  u[`${DB}/recordMeta/${nis}/${recId}/diubahOleh`] = a.uid;
  u[`${DB}/recordMeta/${nis}/${recId}/diubahTs`] = serverTimestamp();
  tambahAudit(u, a, "ubah", path, sebelumDiff, sesudah);
  sisipkanAktivitas(u, { aksi: "ubah-pelanggaran", nis, detail: `Ubah ${sebelum.nama}` });
  await kirimUpdate(u);
}

/**
 * Soft delete: catatan DIHAPUS dari node publik; alasan + snapshot disimpan di recordMeta (khusus staf),
 * semuanya dalam satu update bersama entri audit. Riwayat staf tetap menampilkannya (dicoret).
 */
export async function hapusRecord(nis: string, recId: string, sebelum: DiscRecord, alasan: string, a: Actor) {
  const u: Updates = {};
  const path = `${DB}/records/${nis}/${recId}`;
  const meta = `${DB}/recordMeta/${nis}/${recId}`;
  const alasanBersih = alasan.trim().slice(0, 200);
  u[path] = null;
  u[`${meta}/dihapus`] = true;
  u[`${meta}/alasanHapus`] = alasanBersih;
  u[`${meta}/snapshot`] = bersih(sebelum);
  u[`${meta}/diubahOleh`] = a.uid;
  u[`${meta}/diubahTs`] = serverTimestamp();
  tambahAudit(u, a, "hapus", path, sebelum, { dihapus: true, alasanHapus: alasanBersih });
  sisipkanAktivitas(u, { aksi: "hapus-pelanggaran", nis, detail: `Hapus ${sebelum.nama}: ${alasanBersih}` });
  await kirimUpdate(u);
}

/** Pulihkan catatan terhapus: tulis ulang ke node publik dari snapshot, bersihkan penanda hapus di meta. */
export async function pulihkanRecord(nis: string, recId: string, meta: RecordMeta, a: Actor) {
  if (!meta.snapshot) throw new Error("Snapshot catatan tidak ditemukan");
  const u: Updates = {};
  const path = `${DB}/records/${nis}/${recId}`;
  const m = `${DB}/recordMeta/${nis}/${recId}`;
  u[path] = bersih(meta.snapshot);
  u[`${m}/dihapus`] = null;
  u[`${m}/alasanHapus`] = null;
  u[`${m}/snapshot`] = null;
  u[`${m}/diubahOleh`] = a.uid;
  u[`${m}/diubahTs`] = serverTimestamp();
  tambahAudit(u, a, "ubah", path, { dihapus: true }, { dipulihkan: true });
  sisipkanAktivitas(u, { aksi: "pulihkan-pelanggaran", nis, detail: `Pulihkan ${meta.snapshot.nama}` });
  await kirimUpdate(u);
}

export async function simpanCatatanInternal(nis: string, recId: string, teks: string, lama: string | undefined, a: Actor) {
  const u: Updates = {};
  const path = `${DB}/notes/${nis}/${recId}`;
  const baru = teks.trim().slice(0, 500);
  u[path] = baru || null;
  tambahAudit(u, a, "ubah", path, lama ?? null, baru || null);
  await update(r("/"), u);
}

// ------------------------------------------------------------------ master tata tertib
export type MasterJenis = "rules" | "remisi" | "levels";

/** Simpan 1 entri master (baru bila id kosong). Tidak ada hapus fisik: gunakan aktif=false. */
export async function simpanMaster(jenis: MasterJenis, id: string | null, data: Record<string, unknown>, sebelum: unknown, a: Actor) {
  const key = id ?? newKey(`${DB}/${jenis}`);
  const body: Record<string, unknown> = { ...data };
  if (jenis !== "levels") { body.diubahOleh = a.uid; body.diubahTs = serverTimestamp(); }
  for (const k of Object.keys(body)) if (body[k] === undefined || body[k] === "") delete body[k];
  const u: Updates = {};
  const path = `${DB}/${jenis}/${key}`;
  u[path] = body;
  const { diubahTs: _t, ...sesudah } = body;
  void _t;
  tambahAudit(u, a, "ubah-master", path, sebelum, sesudah);
  await update(r("/"), u);
  return key;
}

/** Ambang yang salah boleh dihapus (entri pelanggaran/remisi cukup dinonaktifkan). Tercatat di audit. */
export async function hapusLevel(id: string, sebelum: unknown, a: Actor) {
  const u: Updates = {};
  const path = `${DB}/levels/${id}`;
  u[path] = null;
  tambahAudit(u, a, "ubah-master", path, sebelum, null);
  await update(r("/"), u);
}

/** Pemetaan jenis saran -> id aturan (autoMap). `ruleId` null = hapus pemetaan. Tercatat di audit. */
export async function simpanAutoMap(tipe: string, ruleId: string | null, sebelum: string | undefined, a: Actor) {
  const u: Updates = {};
  const path = `${DB}/autoMap/${tipe}`;
  u[path] = ruleId;
  tambahAudit(u, a, "ubah-master", path, sebelum ?? null, ruleId);
  await update(r("/"), u);
}

/** Isi data tata tertib awal (hanya dipanggil saat master masih kosong). */
/**
 * Isi data tata tertib awal. v2.5: hanya KEPALA yang boleh menulis penanggungJawab ambang; saat waka yang mengisi, ambang ditulis TANPA penanggung jawab
 * (kepala mengisinya lewat "Isi penanggung jawab bawaan").
 */
export async function isiDataAwal(a: Actor, denganPenanggungJawab = true) {
  const u: Updates = {};
  const meta = { diubahOleh: a.uid, diubahTs: serverTimestamp() };
  for (const [id, x] of Object.entries(SEED_RULES)) u[`${DB}/rules/${id}`] = { ...x, aktif: true, ...meta };
  for (const [id, x] of Object.entries(SEED_REMISI)) u[`${DB}/remisi/${id}`] = { ...x, aktif: true, ...meta };
  for (const [id, x] of Object.entries(SEED_LEVELS)) u[`${DB}/levels/${id}`] = denganPenanggungJawab ? x : { poin: x.poin, tindakan: x.tindakan };
  for (const [k, v] of Object.entries(SEED_AUTOMAP)) u[`${DB}/autoMap/${k}`] = v;
  tambahAudit(u, a, "ubah-master", `${DB}/*`, null, {
    isiDataAwal: true, pelanggaran: Object.keys(SEED_RULES).length, remisi: Object.keys(SEED_REMISI).length, ambang: Object.keys(SEED_LEVELS).length,
  });
  await update(r("/"), u);
}

export type { Kelompok, KategoriPelanggaran, Level };
