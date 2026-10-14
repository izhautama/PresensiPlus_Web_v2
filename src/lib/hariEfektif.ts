// HARI EFEKTIF BERBASIS BUKTI. Fungsi MURNI (tanpa Firebase) agar dapat diuji unit; impor memakai ekstensi .ts.
//
// Sebuah tanggal adalah hari efektif sekolah HANYA bila ada bukti sekolah berlangsung DAN sistem merekam:
//   1. Override kalender (`kalender/{tgl}`: libur | efektif) menang atas semua aturan otomatis.
//   2. Tanpa override: Minggu = libur; selain itu efektif bila (tap masuk alat + presensi manual hadir) >= ambang (bawaan 1).
//   3. Tanpa bukti = bukan hari efektif: siswa TIDAK dihitung Alpha (libur, alat mati seharian, sistem belum dipakai).
// Izin/Sakit/Dispensasi saja TIDAK menjadikan hari efektif.
import { batasJam } from "./attendance.ts";
import { statusHarian, type ManualTap, type ManualTapAnak } from "./manual.ts";
import { addDays, namaHari, nowHM, todayWIB, weekday } from "./time.ts";
import type { DayRecord, KetHarian, ScheduleRow } from "./types.ts";

export const AMBANG_BAWAAN = 1;
export const AMBANG_MIN = 1;
export const AMBANG_MAKS = 500;
export const RENDAH_NISBAH = 0.5; // tap < 50% median 10 hari efektif sebelumnya
export const RENDAH_HARI_PEMBANDING = 10;
export const RENDAH_MIN_PEMBANDING = 3; // butuh minimal 3 hari efektif pembanding agar tidak berisik di awal pemakaian
export const BATAS_HITUNG_MUNDUR = 31; // hitung otomatis maks. 31 hari ke belakang

export type OverrideKalender = { status: "libur" | "efektif"; alasan: string; oleh?: string; ts?: number };
/** kalenderEfektif/{tgl}: ringkasan AGREGAT per tanggal (tanpa data siswa; aman dibaca orang tua). */
export type RingkasanHari = {
  efektif: boolean;
  tap: number; // jumlah siswa dengan tap masuk alat
  manual: number; // jumlah siswa hadir HANYA lewat presensi manual (tanpa tap alat)
  sumber: "otomatis" | "override";
  rendah?: boolean; // tap < 50% median 10 hari efektif sebelumnya
  normal?: boolean; // waka menandai "hari ini normal" (menahan hold Alfa)
  dihitung?: number;
};
export type PetaHari = Record<string, RingkasanHari>;

export const validAmbang = (n: unknown): n is number => typeof n === "number" && Number.isInteger(n) && n >= AMBANG_MIN && n <= AMBANG_MAKS;

/** Keputusan efektif/tidak untuk satu tanggal dari bukti + override. */
export function tentukanEfektif(a: { tanggal: string; override?: Pick<OverrideKalender, "status"> | null; tap: number; manual: number; ambang?: number }): { efektif: boolean; sumber: "otomatis" | "override" } {
  if (a.override) return { efektif: a.override.status === "efektif", sumber: "override" };
  if (weekday(a.tanggal) === 0) return { efektif: false, sumber: "otomatis" };
  return { efektif: a.tap + a.manual >= (validAmbang(a.ambang) ? a.ambang : AMBANG_BAWAAN), sumber: "otomatis" };
}

/** Hitung tap & manual dari data mentah satu tanggal. `log` = log/{tgl}, `manual` = manualTap/{tgl}. */
export function hitungBukti(log: Record<string, { nis: string }> | null | undefined, manual: Record<string, Partial<ManualTap>> | null | undefined) {
  const tapNis = new Set<string>();
  for (const [k, e] of Object.entries(log ?? {})) if (k.endsWith("_M") && e?.nis) tapNis.add(String(e.nis));
  let hanyaManual = 0;
  for (const [nis, m] of Object.entries(manual ?? {})) if (m?.masuk && !tapNis.has(nis)) hanyaManual++;
  return { tap: tapNis.size, manual: hanyaManual };
}

/** Ringkasan satu tanggal (tanpa penanda rendah/normal). */
export function bangunRingkasan(a: { tanggal: string; override?: OverrideKalender | null; log?: Record<string, { nis: string }> | null; manual?: Record<string, Partial<ManualTap>> | null; ambang?: number }): RingkasanHari {
  const { tap, manual } = hitungBukti(a.log, a.manual);
  const { efektif, sumber } = tentukanEfektif({ tanggal: a.tanggal, override: a.override, tap, manual, ambang: a.ambang });
  return { efektif, tap, manual, sumber };
}

const median = (xs: number[]) => {
  const s = [...xs].sort((p, q) => p - q);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/** `rendah` = tap hari ini < 50% median `tap` 10 hari efektif sebelumnya (butuh >= 3 pembanding). Hanya untuk hari efektif. */
export function tandaiRendah(tanggal: string, ringkasan: Pick<RingkasanHari, "efektif" | "tap">, peta: PetaHari): boolean {
  if (!ringkasan.efektif) return false;
  const pembanding = Object.entries(peta)
    .filter(([t, x]) => t < tanggal && x.efektif)
    .sort((p, q) => q[0].localeCompare(p[0]))
    .slice(0, RENDAH_HARI_PEMBANDING)
    .map(([, x]) => x.tap);
  if (pembanding.length < RENDAH_MIN_PEMBANDING) return false;
  return ringkasan.tap < median(pembanding) * RENDAH_NISBAH;
}

/** Hold validasi Alfa & saran Alfa: hari rendah yang BELUM dikonfirmasi normal oleh waka. */
export const tertahan = (h: Pick<RingkasanHari, "rendah" | "normal"> | null | undefined) => Boolean(h?.rendah && !h?.normal);

/** Hitung berurutan (tanggal naik) agar `rendah` memakai pembanding hari-hari sebelumnya dalam rentang yang sama. Deterministik. */
export function hitungRentang(a: {
  tanggal: string[];
  peta?: PetaHari; // ringkasan yang SUDAH ada (pembanding rendah)
  override: Record<string, OverrideKalender | undefined>;
  log: Record<string, Record<string, { nis: string }> | null | undefined>;
  manual: Record<string, Record<string, Partial<ManualTap>> | null | undefined>;
  ambang?: number;
}): PetaHari {
  const hasil: PetaHari = {};
  const bergulir: PetaHari = { ...(a.peta ?? {}) };
  for (const tgl of [...a.tanggal].sort()) {
    const r = bangunRingkasan({ tanggal: tgl, override: a.override[tgl], log: a.log[tgl], manual: a.manual[tgl], ambang: a.ambang });
    const rendah = tandaiRendah(tgl, r, bergulir);
    const x: RingkasanHari = { ...r, ...(rendah ? { rendah: true } : {}) };
    hasil[tgl] = x;
    bergulir[tgl] = { ...x, ...(bergulir[tgl]?.normal ? { normal: true } : {}) };
  }
  return hasil;
}

// ---------------------------------------------------------------------------------------------- per siswa
export type KategoriHari = "Hadir" | "Terlambat" | "Izin" | "Sakit" | "Dispensasi" | "Alpha" | "BelumTap" | "TidakEfektif";
export type BarisHari = {
  tanggal: string;
  kategori: KategoriHari;
  efektif: boolean;
  /** tap/presensi ada pada hari yang BUKAN hari efektif (tidak masuk rekap) */
  diHariLibur?: boolean;
  manualAlasan?: string;
  alfaTerverifikasi?: boolean;
  masuk?: string;
  pulang?: string;
  ket?: KetHarian;
  catatan?: string;
};
export type RekapSiswa = {
  Hadir: number; Terlambat: number; Izin: number; Sakit: number; Dispensasi: number; Alpha: number;
  /** hari efektif yang DIHITUNG untuk siswa ini = Hadir + Terlambat + Izin + Sakit + Dispensasi + Alpha (identitas wajib) */
  Efektif: number;
  /** persen = (Hadir + Terlambat + Dispensasi) / Efektif; null bila 0 hari efektif */
  Persen: number | null;
  /** jumlah hari efektif SEKOLAH pada rentang (s.d. hari ini), tidak bergantung pada siswa */
  HariSekolah: number;
  hari: BarisHari[];
};

export function rekapSiswa(a: {
  hariEfektif: PetaHari;
  attendance?: Record<string, DayRecord> | null;
  manualTap?: Record<string, ManualTap | ManualTapAnak> | null;
  validasi?: Record<string, unknown> | null;
  schedule: ScheduleRow[];
  kelas: string;
  aktifSejak?: string;
  awal: string;
  akhir: string;
  now?: Date;
}): RekapSiswa {
  const now = a.now ?? new Date();
  const today = todayWIB(now);
  const batas = a.akhir < today ? a.akhir : today;
  const out: RekapSiswa = { Hadir: 0, Terlambat: 0, Izin: 0, Sakit: 0, Dispensasi: 0, Alpha: 0, Efektif: 0, Persen: null, HariSekolah: 0, hari: [] };

  for (let d = a.awal; d <= batas; d = addDays(d, 1)) {
    const rec = a.attendance?.[d];
    const man = a.manualTap?.[d];
    const sh = statusHarian({ tanggal: d, kelas: a.kelas, schedule: a.schedule, now, attendance: rec, manual: man as ManualTap | undefined });
    const adaTap = Boolean(sh.rec.status);
    const info = a.hariEfektif[d];
    // hari ini tanpa ringkasan: sementara dianggap efektif bila siswa ini sudah tercatat hadir (bukti paling sedikit 1)
    const efektif = info ? info.efektif : d === today ? adaTap : false;
    if (efektif) out.HariSekolah++;
    const dasar = { tanggal: d, efektif, masuk: sh.rec.masuk, pulang: sh.rec.pulang, ket: sh.rec.ket, catatan: sh.rec.catatan, ...(sh.sumber === "manual" && man ? { manualAlasan: (man as ManualTap).alasan } : {}) };
    if (!efektif || (a.aktifSejak && d < a.aktifSejak)) {
      out.hari.push({ ...dasar, kategori: "TidakEfektif", ...(adaTap && !efektif ? { diHariLibur: true } : {}) });
      continue;
    }
    let kat: KategoriHari;
    if (sh.rec.status === "Hadir") kat = "Hadir";
    else if (sh.rec.status === "Terlambat") kat = "Terlambat";
    else if (sh.rec.ket) kat = sh.rec.ket;
    else if (d < today) kat = "Alpha";
    else kat = nowHM(now) > batasJam(a.schedule, a.kelas, namaHari(d)).Terlambat[1] ? "Alpha" : "BelumTap";
    out.hari.push({ ...dasar, kategori: kat, ...(kat === "Alpha" && a.validasi?.[d] ? { alfaTerverifikasi: true } : {}) });
    if (kat !== "BelumTap") out[kat]++;
  }
  out.Efektif = out.Hadir + out.Terlambat + out.Izin + out.Sakit + out.Dispensasi + out.Alpha;
  out.Persen = out.Efektif ? Math.round(((out.Hadir + out.Terlambat + out.Dispensasi) / out.Efektif) * 1000) / 10 : null;
  return out;
}

/** Jumlah hari efektif SEKOLAH pada rentang (s.d. hari ini). Untuk "Hari efektif ke-N". */
export function hariEfektifSekolah(peta: PetaHari, awal: string, akhir: string, now = new Date()): number {
  const batas = akhir < todayWIB(now) ? akhir : todayWIB(now);
  let n = 0;
  for (let d = awal; d <= batas; d = addDays(d, 1)) if (peta[d]?.efektif) n++;
  return n;
}

