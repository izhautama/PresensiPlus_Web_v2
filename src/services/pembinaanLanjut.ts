// v2.5: klaim BK, izin/kunci tampil ke orang tua, pembacaan pembinaan per kelompok, dan migrasi data lama (kepala).
import { get, serverTimestamp } from "firebase/database";
import type { Level } from "../lib/discipline";
import { idPembinaan, kelompokBaca, kelompokPj, penanggungJawabBawaan, proyeksiOrtu, type KlaimBk, type ModeOrtu, type Pembinaan, type PeranPembinaan } from "../lib/pembinaan";
import { kirimUpdate, sisipkanAktivitas } from "./aktivitas";
import { r } from "./db";
import type { Actor } from "./discipline";

type Updates = Record<string, unknown>;
const k = (s: string, n: number) => s.trim().slice(0, n);

// ------------------------------------------------------------------ pembacaan
/**
 * Pembinaan seorang siswa dari semua kelompok yang boleh dibaca `peran` (wali: wali; bk/waka: wali+bk; kepala: semua), digabung menjadi
 * { "{ta}_{levelId}": Pembinaan }. Hanya meminta jalur yang diizinkan, sehingga tidak ada permission denied yang tidak perlu.
 */
export async function bacaPembinaanSiswa(nis: string, peran: PeranPembinaan | string | null | undefined): Promise<Record<string, Pembinaan>> {
  const hasil: Record<string, Pembinaan> = {};
  await Promise.all(kelompokBaca(peran).map(async (g) => {
    const snap = await get(r(`pembinaan/${g}/${nis}`)).catch(() => null);
    const v = snap?.val() as Record<string, Pembinaan> | null | undefined;
    if (v) Object.assign(hasil, v);
  }));
  return hasil;
}

// ------------------------------------------------------------------ klaim BK
const kunciKlaim = (ta: string, levelId: string) => idPembinaan(ta, levelId);

/** BK mengklaim siswa untuk pembinaan ambang BK. Rules: hanya bila belum ada klaim (tepat satu BK yang menang). */
export async function klaimSiswa(a: { nis: string; nama: string; ta: string; levelId: string }, bk: Actor) {
  const klaim: Omit<KlaimBk, "sejak"> & { sejak: unknown } = { bkUid: bk.uid, bkNama: k(bk.nama, 60), sejak: serverTimestamp(), cara: "klaim", olehUid: bk.uid, ta: a.ta, levelId: a.levelId };
  const u: Updates = { [`klaimBK/${a.nis}/${kunciKlaim(a.ta, a.levelId)}`]: klaim };
  sisipkanAktivitas(u, { aksi: "klaim-bk", nis: a.nis, detail: `Klaim ${a.nama} (${a.ta}, ${a.levelId})` });
  await kirimUpdate(u, { cadangan: false });
}

/** BK melepas klaim sendiri (pembinaan belum selesai). Alasan 10-300 karakter = isi `detail` log (murni). */
export async function lepasKlaim(a: { nis: string; ta: string; levelId: string; alasan: string }) {
  const u: Updates = { [`klaimBK/${a.nis}/${kunciKlaim(a.ta, a.levelId)}`]: null };
  sisipkanAktivitas(u, { aksi: "lepas-klaim-bk", nis: a.nis, detail: k(a.alasan, 300) });
  await kirimUpdate(u, { cadangan: false });
}

/** Waka/kepala menunjuk BK untuk siswa yang belum diklaim, atau memindahkan (alasan = detail log murni). */
export async function tunjukBk(a: { nis: string; ta: string; levelId: string; bkUid: string; bkNama: string; pindah?: { alasan: string } }, oleh: Actor) {
  const klaim = { bkUid: a.bkUid, bkNama: k(a.bkNama, 60), sejak: serverTimestamp(), cara: "tunjuk", olehUid: oleh.uid, ta: a.ta, levelId: a.levelId };
  const u: Updates = { [`klaimBK/${a.nis}/${kunciKlaim(a.ta, a.levelId)}`]: klaim };
  if (a.pindah) sisipkanAktivitas(u, { aksi: "pindah-bk", nis: a.nis, detail: k(a.pindah.alasan, 300) });
  else sisipkanAktivitas(u, { aksi: "tunjuk-bk", nis: a.nis, detail: `Tunjuk ${k(a.bkNama, 60)} (${a.ta}, ${a.levelId})` });
  await kirimUpdate(u, { cadangan: false });
}

// ------------------------------------------------------------------ izin tampil ke orang tua
type KunciIzin = { nis: string; ta: string; levelId: string };
const pIzin = (a: KunciIzin) => `${a.nis}/${a.ta}/${a.levelId}`;

/**
 * Waka/kepala memberi atau mengubah izin. Penanda baca-saja izinOrtuAda ditulis bersama; bila record pembinaan sudah ada, proyeksi
 * pembinaanOrtu ditulis pada update yang sama (rules menolak bila tidak konsisten).
 */
export async function beriIzinOrtu(a: KunciIzin & { mode: ModeOrtu; peran: "waka" | "kepala"; record?: Pembinaan | null; nama: string }, oleh: Actor) {
  const u: Updates = {
    [`izinOrtu/${pIzin(a)}`]: { mode: a.mode, olehUid: oleh.uid, olehPeran: a.peran, ts: serverTimestamp() },
    [`izinOrtuAda/${pIzin(a)}`]: a.mode,
  };
  if (a.record) u[`pembinaanOrtu/${pIzin(a)}`] = proyeksiOrtu(a.record, a.mode);
  sisipkanAktivitas(u, { aksi: "izin-ortu", nis: a.nis, detail: `Izin ${a.mode} tampil ke orang tua: ${k(a.nama, 60)} (${a.ta}, ${a.levelId})` });
  await kirimUpdate(u, { cadangan: false });
}

/** Cabut izin (dan proyeksi). Kepala yang membatalkan izin buatan waka WAJIB mengunci level itu (alasan 10-300). */
export async function cabutIzinOrtu(a: KunciIzin & { nama: string; kunciAlasan?: string }, oleh: Actor) {
  const u: Updates = { [`izinOrtu/${pIzin(a)}`]: null, [`izinOrtuAda/${pIzin(a)}`]: null, [`pembinaanOrtu/${pIzin(a)}`]: null };
  if (a.kunciAlasan) u[`kunciOrtu/${pIzin(a)}`] = { olehUid: oleh.uid, ts: serverTimestamp(), alasan: k(a.kunciAlasan, 300) };
  sisipkanAktivitas(u, { aksi: "cabut-izin-ortu", nis: a.nis, detail: `Cabut izin tampil ke orang tua: ${k(a.nama, 60)} (${a.ta}, ${a.levelId})${a.kunciAlasan ? " — level dikunci" : ""}` });
  await kirimUpdate(u, { cadangan: false });
}

/** Kepala memasang kunci tanpa mencabut izin (level belum diberi izin) atau membuka kunci. */
export async function aturKunciOrtu(a: KunciIzin & { nama: string; kunci: boolean; alasan?: string }, kepala: Actor) {
  const u: Updates = { [`kunciOrtu/${pIzin(a)}`]: a.kunci ? { olehUid: kepala.uid, ts: serverTimestamp(), alasan: k(a.alasan ?? "", 300) } : null };
  sisipkanAktivitas(u, { aksi: a.kunci ? "kunci-ortu" : "buka-kunci-ortu", nis: a.nis, detail: `${a.kunci ? "Kunci" : "Buka kunci"} tampil ke orang tua: ${k(a.nama, 60)} (${a.ta}, ${a.levelId})` });
  await kirimUpdate(u, { cadangan: false });
}

// ------------------------------------------------------------------ migrasi data lama (khusus kepala)
export type RencanaMigrasi = {
  levelDiubah: { id: string; dari: string | null; ke: "wali" | "bk" | "kepala" }[];
  record: { nis: string; id: string; ke: "wali" | "bk" | "kepala"; data: Record<string, unknown> }[];
  tidakBisa: { nis: string; id: string; alasan: string }[];
  perKelompok: Record<"wali" | "bk" | "kepala", number>;
  levelTerpakai: string[];
  /** ambang yang SUDAH bertanda terpakai (tidak ditulis ulang: rules create-only) */
  terpakaiAda: string[];
  statusLama: number;
};
const NIS_RE = /^[0-9]{1,20}$/;

/** Pratinjau (dry-run): tidak menulis apa pun. */
export async function pratinjauMigrasi(levels: Record<string, Level>): Promise<RencanaMigrasi> {
  const [pb, st, tp] = await Promise.all([get(r("pembinaan")), get(r("pembinaanStatus")).catch(() => null), get(r("discipline/levelTerpakai")).catch(() => null)]);
  const semua = (pb.val() ?? {}) as Record<string, unknown>;
  const levelDiubah: RencanaMigrasi["levelDiubah"] = [];
  const pjLevel: Record<string, "wali" | "bk" | "kepala"> = {};
  for (const [id, lv] of Object.entries(levels)) {
    const baru = lv.penanggungJawab === "waka" || !lv.penanggungJawab ? (penanggungJawabBawaan(id, lv) ?? "kepala") : lv.penanggungJawab;
    const ke = kelompokPj(baru);
    pjLevel[id] = ke;
    if (lv.penanggungJawab !== ke) levelDiubah.push({ id, dari: lv.penanggungJawab ?? null, ke });
  }
  const record: RencanaMigrasi["record"] = [], tidakBisa: RencanaMigrasi["tidakBisa"] = [];
  const perKelompok = { wali: 0, bk: 0, kepala: 0 };
  const terpakai = new Set<string>();
  for (const [nis, isi] of Object.entries(semua)) {
    if (!NIS_RE.test(nis) || !isi || typeof isi !== "object") continue;
    for (const [id, v] of Object.entries(isi as Record<string, Pembinaan>)) {
      const ke = pjLevel[v.levelId];
      if (!ke) { tidakBisa.push({ nis, id, alasan: `Ambang ${v.levelId} sudah tidak ada` }); continue; }
      record.push({ nis, id, ke, data: { ...v, pj: ke } });
      perKelompok[ke]++;
      terpakai.add(v.levelId);
    }
  }
  const statusLama = Object.keys((st?.val() ?? {}) as object).length;
  return { levelDiubah, record, tidakBisa, perKelompok, levelTerpakai: [...terpakai], terpakaiAda: Object.keys((tp?.val() ?? {}) as object), statusLama };
}

/**
 * Terapkan migrasi: (1) ambang waka/kosong -> pj baru; (2) record dipindah per batch dalam SATU update (tulis path baru + hapus path lama,
 * penanda ambang terpakai pada batch pertama yang memakainya); (3) hapus pembinaanStatus. Setiap update berlog 'migrasi-pembinaan'.
 */
export async function terapkanMigrasi(rencana: RencanaMigrasi, ctx: Actor, onProgres?: (selesai: number, total: number) => void, ukuranBatch = 20) {
  if (rencana.levelDiubah.length) {
    const u: Updates = {};
    for (const l of rencana.levelDiubah) u[`discipline/levels/${l.id}/penanggungJawab`] = l.ke;
    sisipkanAktivitas(u, { aksi: "migrasi-pembinaan", detail: `Ambang diubah ke penanggung jawab baru (${rencana.levelDiubah.length})` });
    await kirimUpdate(u);
  }
  const sudahTerpakai = new Set<string>(rencana.terpakaiAda);
  let selesai = 0;
  for (let i = 0; i < rencana.record.length; i += ukuranBatch) {
    const batch = rencana.record.slice(i, i + ukuranBatch);
    const u: Updates = {};
    for (const x of batch) {
      u[`pembinaan/${x.ke}/${x.nis}/${x.id}`] = x.data;
      u[`pembinaan/${x.nis}/${x.id}`] = null;
      const lv = String(x.data.levelId);
      if (!sudahTerpakai.has(lv)) { u[`discipline/levelTerpakai/${lv}`] = true; sudahTerpakai.add(lv); }
    }
    sisipkanAktivitas(u, { aksi: "migrasi-pembinaan", detail: `Pindah ${batch.length} record pembinaan ke jalur berperingkat` });
    await kirimUpdate(u);
    selesai += batch.length;
    onProgres?.(selesai, rencana.record.length);
  }
  if (rencana.statusLama) {
    const u: Updates = { pembinaanStatus: null };
    sisipkanAktivitas(u, { aksi: "migrasi-pembinaan", detail: `Hapus salinan status lama (${rencana.statusLama} siswa)` });
    await kirimUpdate(u);
  }
  return { record: rencana.record.length, level: rencana.levelDiubah.length, statusDihapus: rencana.statusLama };
}
