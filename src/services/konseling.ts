import { push, serverTimestamp } from "firebase/database";
import { BATAS_ISI, type FormKonseling, type Konseling, type TopikKonseling } from "../lib/konseling";
import { kirimUpdate, sisipkanAktivitas } from "./aktivitas";
import { r } from "./db";

type Updates = Record<string, unknown>;
const k = (s: string, n: number) => s.trim().slice(0, n);
export type KonteksBk = { uid: string; nama: string };

/**
 * Catat konseling baru. Log aktivitas WAJIB (rules) tetapi TIDAK memuat isi, topik, nama siswa, maupun NIS: log aktivitas dibaca waka dan admin,
 * sedangkan catatan konseling hanya boleh dibaca BK dan Kepala.
 */
export async function buatKonseling(a: { nis: string; form: FormKonseling }, ctx: KonteksBk) {
  const id = push(r(`konseling/${a.nis}`)).key as string;
  const data: Record<string, unknown> = {
    tanggal: a.form.tanggal, topik: a.form.topik as TopikKonseling, isi: k(a.form.isi, BATAS_ISI.max), rahasia: true,
    oleh: ctx.uid, olehNama: k(ctx.nama, 60), dibuatTs: serverTimestamp(),
  };
  const tl = k(a.form.tindakLanjut, BATAS_ISI.tindakLanjut);
  if (tl) data.tindakLanjut = tl;
  const u: Updates = { [`konseling/${a.nis}/${id}`]: data };
  sisipkanAktivitas(u, { aksi: "catat-konseling", detail: "Catatan konseling dibuat (rahasia)" });
  await kirimUpdate(u, { cadangan: false });
  return id;
}

/**
 * Koreksi catatan konseling milik sendiri: perubahan + entri konselingAudit (isi LAMA) pada update yang SAMA. Kunci audit = id entri log aktivitas,
 * yang juga dipakai rules untuk memastikan pasangan audit-perubahan. Tidak ada penghapusan fisik.
 */
export async function ubahKonseling(a: { nis: string; id: string; lama: Konseling; form: FormKonseling }, ctx: KonteksBk) {
  const u: Updates = {};
  const base = `konseling/${a.nis}/${a.id}`;
  u[`${base}/tanggal`] = a.form.tanggal;
  u[`${base}/topik`] = a.form.topik;
  u[`${base}/isi`] = k(a.form.isi, BATAS_ISI.max);
  const tl = k(a.form.tindakLanjut, BATAS_ISI.tindakLanjut);
  u[`${base}/tindakLanjut`] = tl || null;
  u[`${base}/diubahTs`] = serverTimestamp();
  u[`${base}/diubahOleh`] = ctx.uid;
  const idLog = sisipkanAktivitas(u, { aksi: "ubah-konseling", detail: "Catatan konseling dikoreksi (rahasia)" });
  if (!idLog) throw new Error("Sesi tidak valid. Muat ulang halaman lalu masuk kembali.");
  u[`konselingAudit/${a.nis}/${idLog}`] = {
    konselingId: a.id, oleh: ctx.uid, olehNama: k(ctx.nama, 60), ts: serverTimestamp(),
    sebelum: { tanggal: a.lama.tanggal, topik: a.lama.topik, isi: a.lama.isi, ...(a.lama.tindakLanjut ? { tindakLanjut: a.lama.tindakLanjut } : {}) },
  };
  await kirimUpdate(u, { cadangan: false });
}
