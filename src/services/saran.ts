import { get, serverTimestamp } from "firebase/database";
import { taKey, type DiscRecord, type Rule } from "../lib/discipline";
import type { Saran } from "../lib/saran";
import { kirimUpdate, sisipkanAktivitas } from "./aktivitas";
import { r } from "./db";
import { tambahAudit, type Actor } from "./discipline";

type Updates = Record<string, unknown>;

/** Saran sudah diputuskan staf lain (penolakan Security Rules pada kunci deterministik). */
export class SudahDiputuskan extends Error {
  constructor() { super("Saran ini sudah diputuskan oleh staf lain."); }
}
const ditolak = (e: unknown) => /permission|PERMISSION_DENIED/i.test(`${(e as { code?: string })?.code ?? ""} ${(e as Error)?.message ?? ""}`);

/**
 * Kirim keputusan saran TANPA percobaan ulang tanpa-log (satu penolakan = satu kejadian nyata). Bila ditolak, periksa apakah
 * keputusan memang sudah ada (kalah balapan -> SudahDiputuskan); jika belum, penolakan berasal dari hal lain dan dilempar apa adanya.
 */
async function kirimKeputusan(u: Updates, s: Saran) {
  try { await kirimUpdate(u, { cadangan: false }); }
  catch (e) {
    if (!ditolak(e)) throw e;
    const ada = await get(r(`discipline/suggest/${s.tanggal}/${s.key}`)).then((x) => x.exists()).catch(() => false);
    throw ada ? new SudahDiputuskan() : e;
  }
}

/**
 * Setujui satu saran: catatan (records publik + recordMeta, sumber "saran", id deterministik {tanggal}_{tipe})
 * + keputusan + audit dalam SATU update. Bila dua staf menyetujui bersamaan, rules hanya meloloskan satu.
 */
export async function setujuiSaran(s: Saran, rule: Rule, a: Actor) {
  const u: Updates = {};
  const rec: DiscRecord = {
    jenis: "pelanggaran", refId: s.ruleId, nama: rule.nama, kategori: rule.kategori, poin: rule.poin,
    tanggal: s.tanggal, ta: taKey(s.tanggal), sumber: "saran",
    ...(rule.takziran ? { takziran: rule.takziran } : {}),
  };
  const path = `discipline/records/${s.nis}/${s.recId}`;
  u[path] = rec;
  u[`discipline/recordMeta/${s.nis}/${s.recId}`] = { dibuatOleh: a.uid, dibuatNama: a.nama, dibuatTs: serverTimestamp() };
  u[`discipline/suggest/${s.tanggal}/${s.key}`] = { keputusan: "diterima", oleh: a.uid, ts: serverTimestamp(), nis: s.nis, recId: s.recId };
  tambahAudit(u, a, "buat", path, null, { ...rec, saran: s.tipe });
  sisipkanAktivitas(u, { aksi: "saran-setuju", nis: s.nis, detail: `${s.tipe} ${s.tanggal}: ${rule.nama}` });
  await kirimKeputusan(u, s);
}

export async function abaikanSaran(s: Saran, alasan: string, a: Actor) {
  const u: Updates = {};
  const body: Record<string, unknown> = { keputusan: "diabaikan", oleh: a.uid, ts: serverTimestamp(), nis: s.nis };
  if (alasan.trim()) body.alasan = alasan.trim().slice(0, 200);
  u[`discipline/suggest/${s.tanggal}/${s.key}`] = body;
  tambahAudit(u, a, "buat", `discipline/suggest/${s.tanggal}/${s.key}`, null, { keputusan: "diabaikan", alasan: alasan.trim() || null });
  sisipkanAktivitas(u, { aksi: "saran-abaikan", nis: s.nis, detail: `${s.tipe} ${s.tanggal}${alasan.trim() ? `: ${alasan.trim()}` : ""}` });
  await kirimKeputusan(u, s);
}
