import { push, serverTimestamp } from "firebase/database";
import type { Level, PenanggungJawab, Remisi } from "../lib/discipline";
import { idPembinaan, kelompokPj, penanggungJawabBawaan, proyeksiOrtu, type FormPembinaan, type MetodePB, type ModeOrtu, type Pembinaan, type StatusPB, type UsulRemisi } from "../lib/pembinaan";
import { kirimUpdate, sisipkanAktivitas } from "./aktivitas";
import { r } from "./db";
import { tambahAudit, type Actor } from "./discipline";

type Updates = Record<string, unknown>;
const k = (s: string, n: number) => s.trim().slice(0, n);

/**
 * Simpan pembinaan (buat/ubah) di pembinaan/{pj}/{nis}/{ta}_{levelId}, penanda ambang terpakai (record pertama) dan proyeksi orang tua
 * (bila ada izin aktif) dalam SATU update + log aktivitas. `alasanKoreksi` mengubah aksi menjadi koreksi pembinaan 'selesai' (waka/kepala; log = alasan murni).
 * Id deterministik {ta}_{levelId}: satu catatan per (TA, ambang); tidak ada penghapusan fisik.
 * Pada ubah, kolom tetap (oleh, dibuatTs, levelPoin) dipertahankan; rules menolak perubahan atasnya.
 */
export async function simpanPembinaan(
  a: { nis: string; nama: string; ta: string; levelId: string; level: Level; form: FormPembinaan; ada?: Pembinaan | null; levelTerpakai?: boolean; izinMode?: ModeOrtu | null; alasanKoreksi?: string },
  ctx: Actor,
) {
  const id = idPembinaan(a.ta, a.levelId);
  const lama = a.ada ?? null;
  const tindakLanjut = k(a.form.tindakLanjut, 500);
  const pj = lama?.pj ?? kelompokPj(a.level.penanggungJawab);
  const data: Record<string, unknown> = {
    pj, ta: a.ta, levelId: a.levelId, levelPoin: lama?.levelPoin ?? a.level.poin, tindakan: lama?.tindakan ?? k(a.level.tindakan, 200),
    tanggal: a.form.tanggal, metode: a.form.metode as MetodePB, hasil: k(a.form.hasil, 1000), status: a.form.status as StatusPB,
    oleh: lama?.oleh ?? ctx.uid, olehNama: lama?.olehNama ?? k(ctx.nama, 60), dibuatTs: lama?.dibuatTs ?? serverTimestamp(),
  };
  if (tindakLanjut) data.tindakLanjut = tindakLanjut;
  if (lama) { data.diubahOleh = ctx.uid; data.diubahTs = serverTimestamp(); }
  const u: Updates = { [`pembinaan/${pj}/${a.nis}/${id}`]: data };
  if (!a.levelTerpakai) u[`discipline/levelTerpakai/${a.levelId}`] = true; // rules: wajib ada bila record dibuat; hanya ditulis sekali
  if (a.izinMode) u[`pembinaanOrtu/${a.nis}/${a.ta}/${a.levelId}`] = proyeksiOrtu({ status: a.form.status as StatusPB, tanggal: a.form.tanggal, levelPoin: data.levelPoin as number, tindakan: data.tindakan as string, hasil: data.hasil as string, tindakLanjut: tindakLanjut || undefined }, a.izinMode);
  if (a.alasanKoreksi) sisipkanAktivitas(u, { aksi: "koreksi-pembinaan", nis: a.nis, detail: k(a.alasanKoreksi, 300) });
  else sisipkanAktivitas(u, { aksi: "catat-pembinaan", nis: a.nis, detail: `${lama ? "Ubah" : "Catat"} pembinaan ${a.nama} (${a.level.poin} poin, ${a.form.status}) ${a.form.tanggal}` });
  await kirimUpdate(u);
  return id;
}

// ------------------------------------------------------------------ usulan remisi
/** Wali mengusulkan remisi (status "menunggu"); nama & poin disalin dari master (rules mencocokkan). */
export async function buatUsulRemisi(a: { nis: string; nama: string; remId: string; remisi: Remisi; alasan: string; klaimKey?: string }, ctx: Actor) {
  const id = push(r("usulRemisi")).key as string;
  const u: Updates = {
    [`usulRemisi/${id}`]: { nis: a.nis, remId: a.remId, nama: a.remisi.nama, poin: a.remisi.poin, alasan: k(a.alasan, 300), oleh: ctx.uid, ts: serverTimestamp(), status: "menunggu", ...(a.klaimKey ? { klaimKey: a.klaimKey } : {}) },
  };
  sisipkanAktivitas(u, { aksi: "usul-remisi", nis: a.nis, detail: `Usul remisi ${a.remisi.nama} (${a.remisi.poin} poin) untuk ${a.nama}` });
  await kirimUpdate(u, { cadangan: false });
  return id;
}

/** Wali membatalkan usulan SENDIRI yang masih menunggu (hapus). */
export async function batalkanUsul(a: { id: string; usul: UsulRemisi; nama: string }) {
  const u: Updates = { [`usulRemisi/${a.id}`]: null };
  sisipkanAktivitas(u, { aksi: "batal-usul", nis: a.usul.nis, detail: `Batalkan usulan remisi ${a.usul.nama} untuk ${a.nama}` });
  await kirimUpdate(u, { cadangan: false });
}

/**
 * Waka/kepala memutuskan usulan SEKALI. Setuju: record remisi bersumber "usul-wali" (id = id usulan, deterministik) + recordMeta + audit
 * + keputusan dalam satu update; tolak: hanya keputusan (alasan wajib). Keputusan kedua (mis. serentak) ditolak rules.
 */
export async function putuskanUsul(a: { id: string; usul: UsulRemisi; namaSiswa: string; setuju: boolean; alasan?: string; tanggal: string; ta: string }, ctx: Actor) {
  const u: Updates = {};
  const base = `usulRemisi/${a.id}`;
  const keputusan: Updates = {
    status: a.setuju ? "disetujui" : "ditolak", diputuskanOleh: ctx.uid, diputuskanTs: serverTimestamp(),
    ...(a.alasan?.trim() ? { alasanKeputusan: k(a.alasan, 300) } : {}),
    ...(a.setuju ? { recId: a.id } : {}),
  };
  for (const [f, v] of Object.entries(keputusan)) u[`${base}/${f}`] = v;
  if (a.setuju) {
    const rec = { jenis: "remisi", refId: a.usul.remId, nama: a.usul.nama, poin: a.usul.poin, tanggal: a.tanggal, ta: a.ta, sumber: "usul-wali" };
    u[`discipline/records/${a.usul.nis}/${a.id}`] = rec;
    u[`discipline/recordMeta/${a.usul.nis}/${a.id}`] = { dibuatOleh: ctx.uid, dibuatNama: k(ctx.nama, 60), dibuatTs: serverTimestamp() };
    tambahAudit(u, ctx, "buat", `discipline/records/${a.usul.nis}/${a.id}`, null, rec);
  }
  sisipkanAktivitas(u, { aksi: "putuskan-usul", nis: a.usul.nis, detail: `${a.setuju ? "Setujui" : "Tolak"} usulan remisi ${a.usul.nama} (${a.usul.poin} poin) untuk ${a.namaSiswa}` });
  await kirimUpdate(u);
}

// ------------------------------------------------------------------ penanggung jawab ambang
/** Isi penanggung jawab bawaan untuk ambang lama yang belum punya (hanya yang kosong; yang sudah diatur tidak disentuh). Mengembalikan jumlah yang diisi. */
export async function isiPenanggungJawabBawaan(levels: Record<string, Level>, ctx: Actor): Promise<number> {
  const u: Updates = {};
  let n = 0;
  for (const [id, lv] of Object.entries(levels)) {
    if (lv.penanggungJawab) continue;
    const pj = penanggungJawabBawaan(id, lv);
    if (!pj) continue;
    u[`discipline/levels/${id}/penanggungJawab`] = pj;
    tambahAudit(u, ctx, "ubah-master", `discipline/levels/${id}`, { penanggungJawab: null }, { penanggungJawab: pj });
    n++;
  }
  if (!n) return 0;
  sisipkanAktivitas(u, { aksi: "atur-penanggung-jawab", detail: `Penanggung jawab bawaan diisi untuk ${n} ambang` });
  await kirimUpdate(u);
  return n;
}
export type { PenanggungJawab };
