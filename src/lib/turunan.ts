// Kode per jam yang DITURUNKAN dari status harian (v2.3.1). Tidak pernah ditulis ke lessons/lessonsByStudent: dihitung saat tampil/hitung,
// sehingga otomatis hilang bila kemudian ada izin, presensi manual, atau tap alat.
//  * Alfa seharian (hari efektif, tanpa tap/manual/keterangan, batas jam terlambat lewat)  -> A jam 1-9
//  * Izin/Sakit/Dispensasi seharian (keterangan harian)                                      -> I/S/D jam 1-9
// Sebelum batas jam terlambat (BelumTap), hari bukan hari efektif, dan siswa yang hadir: TIDAK ada turunan.
import type { DayRecord, KetHarian, ScheduleRow } from "./types.ts";
import { rekapSiswa, type BarisHari, type KategoriHari, type PetaHari } from "./hariEfektif.ts";
import type { ManualTap } from "./manual.ts";
import type { KodeJam } from "./perjam.ts";

export type TurunanJam = { kode: KodeJam; label: string; sumber: "alfa-seharian" | "keterangan-harian" };

const LABEL_KET: Record<KetHarian, string> = { Izin: "Izin seharian (otomatis)", Sakit: "Sakit seharian (otomatis)", Dispensasi: "Dispensasi seharian (otomatis)" };
const KODE_KET: Record<KetHarian, KodeJam> = { Izin: "I", Sakit: "S", Dispensasi: "D" };

/** Kode turunan dari kategori harian; null = tidak ada turunan (sel per jam diisi seperti biasa). */
export function turunanDariKategori(k: KategoriHari | undefined | null): TurunanJam | null {
  if (k === "Alpha") return { kode: "A", label: "Alfa seharian (otomatis)", sumber: "alfa-seharian" };
  if (k === "Izin" || k === "Sakit" || k === "Dispensasi") return { kode: KODE_KET[k], label: LABEL_KET[k], sumber: "keterangan-harian" };
  return null;
}

/** Baris status harian satu siswa pada satu tanggal (rumus yang sama dengan rekap: rekapSiswa). `undefined` untuk tanggal mendatang. */
export function barisHariSiswa(a: {
  tanggal: string; kelas: string; schedule: ScheduleRow[]; hariEfektif: PetaHari; aktifSejak?: string; now: Date;
  alat?: DayRecord | null; manual?: ManualTap | null; izin?: KetHarian | null;
}): BarisHari | undefined {
  const rec: DayRecord = { ...(a.alat ?? {}) };
  if (a.izin && !rec.ket) rec.ket = a.izin;
  const r = rekapSiswa({
    hariEfektif: a.hariEfektif, attendance: { [a.tanggal]: rec }, manualTap: a.manual ? { [a.tanggal]: a.manual } : null, validasi: null,
    schedule: a.schedule, kelas: a.kelas, aktifSejak: a.aktifSejak, awal: a.tanggal, akhir: a.tanggal, now: a.now,
  });
  return r.hari[0];
}

/** Turunan jam siswa pada tanggal itu (atau null). */
export const turunanSiswa = (a: Parameters<typeof barisHariSiswa>[0]): TurunanJam | null => turunanDariKategori(barisHariSiswa(a)?.kategori);

/** Kode yang ditampilkan pada sel: turunan menang atas isi tersimpan. */
export const kodeTampil = (turunan: TurunanJam | null, tersimpan: KodeJam | ""): KodeJam | "" => (turunan ? turunan.kode : tersimpan);
