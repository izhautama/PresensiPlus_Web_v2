import { serverTimestamp } from "firebase/database";
import { hariKeDariTanggal } from "../lib/piket";
import { statusDariJam, type AlasanManual, type ManualTap } from "../lib/manual";
import type { ScheduleRow } from "../lib/types";
import { kirimUpdate, sisipkanAktivitas } from "./aktivitas";

type Updates = Record<string, unknown>;
/** Pencatat: piket (uid akun bersama + nama petugas pilihan) atau waka (uid + nama). */
export type PencatatManual = { uid: string; petugas: string };

export type InputManual = {
  tanggal: string;
  nis: string;
  kelas: string;
  masuk?: string; // "HH:MM:SS"; status dihitung dari jadwal kelas
  pulang?: string;
  alasan: AlasanManual;
  keterangan?: string;
};

/** Isi satu entri manualTap + salinan manualTapByStudent ke kumpulan update (pasangan WAJIB pada update yang sama). */
function sisipkanEntri(u: Updates, a: InputManual, p: PencatatManual, schedule: ScheduleRow[]) {
  if (!a.masuk && !a.pulang) throw new Error("Isi jam masuk dan/atau jam pulang.");
  // status dari JAM + jadwal kelas (bukan diketik). Entri hanya-pulang memakai "Hadir" (diabaikan karena masuk berasal dari alat/entri lain).
  const status = a.masuk ? statusDariJam(a.masuk, schedule, a.kelas, a.tanggal) : "Hadir";
  const tap: Record<string, unknown> = {
    ...(a.masuk ? { masuk: a.masuk } : {}), ...(a.pulang ? { pulang: a.pulang } : {}),
    status, alasan: a.alasan, oleh: p.uid, petugas: p.petugas.slice(0, 60), ts: serverTimestamp(), hariKe: hariKeDariTanggal(a.tanggal),
  };
  if (a.keterangan?.trim()) tap.keterangan = a.keterangan.trim().slice(0, 200);
  u[`manualTap/${a.tanggal}/${a.nis}`] = tap;
  u[`manualTapByStudent/${a.nis}/${a.tanggal}`] = { ...(a.masuk ? { masuk: a.masuk } : {}), ...(a.pulang ? { pulang: a.pulang } : {}), status, alasan: a.alasan };
  return status;
}

/** Catat presensi manual satu siswa (+ log aktivitas, wajib untuk piket). */
export async function catatManual(a: InputManual, p: PencatatManual, schedule: ScheduleRow[]) {
  const u: Updates = {};
  const status = sisipkanEntri(u, a, p, schedule);
  sisipkanAktivitas(u, { aksi: "presensi-manual", nis: a.nis, detail: `${a.alasan} ${a.tanggal}: ${status}${a.masuk ? ` masuk ${a.masuk.slice(0, 5)}` : ""}${a.pulang ? ` pulang ${a.pulang.slice(0, 5)}` : ""}${a.keterangan?.trim() ? ` — ${a.keterangan.trim()}` : ""}` });
  await kirimUpdate(u);
  return status;
}

/** Mode "alat bermasalah": tandai banyak siswa hadir sekaligus dalam SATU update (satu entri log). */
export async function catatManualMassal(
  a: { tanggal: string; masuk: string; kelas: string; siswa: { nis: string }[]; alasan: AlasanManual; keterangan?: string },
  p: PencatatManual,
  schedule: ScheduleRow[],
) {
  if (a.siswa.length === 0) throw new Error("Tidak ada siswa yang ditandai.");
  const u: Updates = {};
  for (const s of a.siswa) sisipkanEntri(u, { tanggal: a.tanggal, nis: s.nis, kelas: a.kelas, masuk: a.masuk, alasan: a.alasan, keterangan: a.keterangan }, p, schedule);
  sisipkanAktivitas(u, { aksi: "presensi-manual", detail: `${a.alasan} ${a.tanggal}, kelas ${a.kelas}: ${a.siswa.length} siswa ditandai hadir (masuk ${a.masuk.slice(0, 5)})` });
  await kirimUpdate(u);
}

/** Hapus entri manual (koreksi). Piket hanya dapat menghapus entri piket; ditegakkan rules. */
export async function hapusManual(tanggal: string, nis: string) {
  const u: Updates = { [`manualTap/${tanggal}/${nis}`]: null, [`manualTapByStudent/${nis}/${tanggal}`]: null };
  sisipkanAktivitas(u, { aksi: "hapus-manual", nis, detail: `Hapus presensi manual ${tanggal}` });
  await kirimUpdate(u);
}

export type { ManualTap };
