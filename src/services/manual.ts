import { serverTimestamp } from "firebase/database";
import { hariKeDariTanggal } from "../lib/piket";
import { jamDariMs } from "../lib/time";
import { detikDariJam, periksaJamManual, statusDariJam, type AlasanManual, type ManualTap } from "../lib/manual";
import type { ScheduleRow } from "../lib/types";
import { kirimUpdate, sisipkanAktivitas } from "./aktivitas";
import { tambahAudit } from "./discipline";

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
  /** Waktu server (ms) saat disimpan, untuk menilai `mundur`; bawaan Date.now(). */
  sekarangMs?: number;
  /** Tanggal hari ini menurut jam server. */
  hariIni?: string;
  /** Awal jendela Masuk kelas ("HH:MM"); jam masuk tidak boleh lebih awal dari ini dikurangi 60 menit. */
  awalJendelaMasuk?: string;
};

/** Isi satu entri manualTap + salinan manualTapByStudent ke kumpulan update (pasangan WAJIB pada update yang sama). */
function sisipkanEntri(u: Updates, a: InputManual, p: PencatatManual, schedule: ScheduleRow[]) {
  if (!a.masuk && !a.pulang) throw new Error("Isi jam masuk dan/atau jam pulang.");
  // status dari JAM + jadwal kelas (bukan diketik). Entri hanya-pulang memakai "Hadir" (diabaikan karena masuk berasal dari alat/entri lain).
  const status = a.masuk ? statusDariJam(a.masuk, schedule, a.kelas, a.tanggal) : "Hadir";
  // jam masuk diketik piket: periksa (tidak melewati waktu dicatat, tidak terlalu pagi) lalu tandai `mundur` bila > 15 menit dari waktu dicatat
  let jamManual: { masukDetik: number; mundur: boolean; selisihMenit: number } | null = null;
  if (a.masuk) {
    const hasil = periksaJamManual({ masuk: a.masuk, tanggal: a.tanggal, hariIni: a.hariIni ?? a.tanggal, sekarangMs: a.sekarangMs ?? Date.now(), awalJendelaMasuk: a.awalJendelaMasuk });
    if (!hasil.ok) throw new Error(hasil.pesan);
    jamManual = hasil;
  }
  const tap: Record<string, unknown> = {
    ...(a.masuk ? { masuk: a.masuk, masukDetik: detikDariJam(a.masuk) } : {}), ...(a.pulang ? { pulang: a.pulang } : {}),
    ...(jamManual?.mundur ? { mundur: true } : {}),
    status, alasan: a.alasan, oleh: p.uid, petugas: p.petugas.slice(0, 60), ts: serverTimestamp(), hariKe: hariKeDariTanggal(a.tanggal),
  };
  if (a.keterangan?.trim()) tap.keterangan = a.keterangan.trim().slice(0, 200);
  u[`manualTap/${a.tanggal}/${a.nis}`] = tap;
  u[`manualTapByStudent/${a.nis}/${a.tanggal}`] = { ...(a.masuk ? { masuk: a.masuk } : {}), ...(a.pulang ? { pulang: a.pulang } : {}), status, alasan: a.alasan };
  return { status, jamManual };
}

/**
 * Waka mencatat manual untuk siswa yang Alfa-nya sudah divalidasi: validasi + salinan anak DIBATALKAN pada update yang SAMA,
 * dengan jejak audit. Piket tidak boleh (rules menolak karena Alfa sudah divalidasi).
 */
function sisipkanBatalAlfa(u: Updates, tanggal: string, nis: string, p: PencatatManual) {
  u[`validasi/${tanggal}/${nis}`] = null;
  u[`validasiByStudent/${nis}/${tanggal}`] = null;
  tambahAudit(u, { uid: p.uid, nama: p.petugas }, "hapus", `validasi/${tanggal}/${nis}`, { status: "Alfa" }, { dibatalkan: "otomatis: presensi manual" });
}

/** Catat presensi manual satu siswa (+ log aktivitas, wajib untuk piket). `batalAlfa` hanya untuk waka. */
export async function catatManual(a: InputManual, p: PencatatManual, schedule: ScheduleRow[], opsi: { batalAlfa?: boolean } = {}) {
  const u: Updates = {};
  const { status, jamManual } = sisipkanEntri(u, a, p, schedule);
  // log aktivitas memuat KEDUA jam: jam yang diketik dan waktu dicatat (server), serta tanda mundur
  const dicatatHM = jamDariMs(a.sekarangMs ?? Date.now()).slice(0, 5);
  const ringkas = `${a.alasan} ${a.tanggal}: ${status}${a.masuk ? ` masuk ${a.masuk.slice(0, 5)} (dicatat ${dicatatHM}${jamManual?.mundur ? ", JAM DIMUNDURKAN" : ""})` : ""}${a.pulang ? ` pulang ${a.pulang.slice(0, 5)}` : ""}${a.keterangan?.trim() ? ` — ${a.keterangan.trim()}` : ""}`;
  if (opsi.batalAlfa) {
    sisipkanBatalAlfa(u, a.tanggal, a.nis, p);
    sisipkanAktivitas(u, { aksi: "batal-alfa", nis: a.nis, detail: `Batal Alfa otomatis: presensi manual — ${ringkas}` });
  } else {
    sisipkanAktivitas(u, { aksi: "presensi-manual", nis: a.nis, detail: ringkas });
  }
  await kirimUpdate(u);
  return status;
}

/** Mode "alat bermasalah": tandai banyak siswa hadir sekaligus dalam SATU update (satu entri log). */
export async function catatManualMassal(
  a: { tanggal: string; masuk: string; kelas: string; siswa: { nis: string }[]; alasan: AlasanManual; keterangan?: string; batalAlfa?: string[]; sekarangMs?: number; hariIni?: string; awalJendelaMasuk?: string },
  p: PencatatManual,
  schedule: ScheduleRow[],
) {
  if (a.siswa.length === 0) throw new Error("Tidak ada siswa yang ditandai.");
  const u: Updates = {};
  for (const s of a.siswa) sisipkanEntri(u, { tanggal: a.tanggal, nis: s.nis, kelas: a.kelas, masuk: a.masuk, alasan: a.alasan, keterangan: a.keterangan, sekarangMs: a.sekarangMs, hariIni: a.hariIni, awalJendelaMasuk: a.awalJendelaMasuk }, p, schedule);
  const batal = (a.batalAlfa ?? []).filter((n) => a.siswa.some((s) => s.nis === n));
  for (const nis of batal) sisipkanBatalAlfa(u, a.tanggal, nis, p);
  sisipkanAktivitas(u, {
    aksi: batal.length ? "batal-alfa" : "presensi-manual",
    detail: `${batal.length ? `Batal Alfa otomatis (${batal.length} siswa): presensi manual — ` : ""}${a.alasan} ${a.tanggal}, kelas ${a.kelas}: ${a.siswa.length} siswa ditandai hadir (masuk ${a.masuk.slice(0, 5)}, dicatat ${jamDariMs(a.sekarangMs ?? Date.now()).slice(0, 5)})`,
  });
  await kirimUpdate(u);
}

/** Hapus entri manual (koreksi). Piket hanya dapat menghapus entri piket; ditegakkan rules. */
export async function hapusManual(tanggal: string, nis: string) {
  const u: Updates = { [`manualTap/${tanggal}/${nis}`]: null, [`manualTapByStudent/${nis}/${tanggal}`]: null };
  sisipkanAktivitas(u, { aksi: "hapus-manual", nis, detail: `Hapus presensi manual ${tanggal}` });
  await kirimUpdate(u);
}

export type { ManualTap };
