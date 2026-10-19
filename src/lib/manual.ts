// Presensi manual (siswa lupa/hilang KTM, kartu rusak, alat bermasalah). Fungsi MURNI (tanpa Firebase) agar dapat diuji unit.
// Node `manualTap` TERPISAH dari `attendance`/`log` milik alat: jalur tulis firmware tidak berubah.
// ATURAN GABUNG (v2.4): BUKTI HADIR PALING AWAL menang. Jam masuk = yang paling awal antara tap alat dan presensi manual (seri = alat);
// Hadir/Terlambat dihitung ulang dari jam itu terhadap jadwal kelas (statusDariJam), bukan dari `status` alat. Jam pulang: alat menang, manual hanya
// mengisi bila alat kosong. Contoh: manual 07:05 (siswa lupa KTM) lalu tap alat 07:40 -> masuk 07:05 = Hadir (bukan Terlambat).
import { batasJam, kategori } from "./attendance.ts";
import type { DayRecord, KetHarian, Kategori, ScheduleRow } from "./types.ts";
import { namaHari } from "./time.ts";

export const ALASAN_MANUAL = ["Lupa KTM", "KTM hilang", "Kartu rusak", "Alat bermasalah", "Lainnya"] as const;
export type AlasanManual = (typeof ALASAN_MANUAL)[number];

/** manualTap/{tgl}/{nis} */
export type ManualTap = {
  masuk?: string; // "HH:MM:SS"
  pulang?: string; // "HH:MM:SS"
  status: "Hadir" | "Terlambat";
  alasan: AlasanManual;
  keterangan?: string;
  oleh: string;
  petugas?: string;
  /** Waktu DICATAT (server timestamp saat menyimpan). Jam yang diketik ada di `masuk`; selisihnya menentukan `mundur`. */
  ts: number;
  hariKe: number;
  /** Detik sejak tengah malam WIB dari `masuk` (diperiksa Security Rules terhadap `ts`); wajib bila ada `masuk` pada entri baru. */
  masukDetik?: number;
  /** true bila jam masuk dimundurkan lebih dari BATAS_MUNDUR_DETIK dari waktu dicatat (ditegakkan Security Rules). */
  mundur?: true;
};

/** Selisih (detik) antara waktu dicatat dan jam masuk yang diketik, di atas ini entri ditandai `mundur`. */
export const BATAS_MUNDUR_DETIK = 15 * 60;
/** "HH:MM:SS" -> detik sejak tengah malam. */
export const detikDariJam = (j: string) => Number(j.slice(0, 2)) * 3600 + Number(j.slice(3, 5)) * 60 + Number(j.slice(6, 8));
/** Detik sejak tengah malam WIB dari epoch ms. */
export const detikWIB = (ms: number) => Math.floor(((ms + 7 * 3600000) % 86400000) / 1000);

/** manualTapByStudent/{nis}/{tgl}: salinan untuk portal orang tua (tanpa nama petugas/uid pencatat). */
export type ManualTapAnak = { masuk?: string; pulang?: string; status: "Hadir" | "Terlambat"; alasan: AlasanManual };

export const adalahJam = (s: unknown): s is string => typeof s === "string" && /^([01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]$/.test(s);

/**
 * Status dari JAM tap dan jadwal kelas (bukan diketik bebas): masuk sampai batas akhir jendela "Masuk" = Hadir,
 * sesudahnya Terlambat. Sama dengan perilaku jendela firmware (Masuk 07:00–07:15, Terlambat 07:16 dst.).
 */
export function statusDariJam(masuk: string, schedule: ScheduleRow[], kelas: string, tanggal: string): "Hadir" | "Terlambat" {
  const batas = batasJam(schedule, kelas, namaHari(tanggal)).Masuk[1]; // "HH:MM"
  return masuk.slice(0, 5) <= batas ? "Hadir" : "Terlambat";
}

export type HasilJamManual = { ok: true; masukDetik: number; mundur: boolean; selisihMenit: number } | { ok: false; pesan: string };

/**
 * Periksa jam masuk yang DIKETIK piket terhadap waktu dicatat (server). Aturan (sama dengan Security Rules):
 *  - hari ini: jam tidak boleh melewati waktu dicatat; tanggal lampau: selalu `mundur`;
 *  - `mundur` bila selisih (dicatat - jam) > 15 menit;
 *  - tidak boleh sebelum awal jendela Masuk dikurangi 60 menit (`awalJendelaMasuk` = "HH:MM", diperiksa di klien).
 */
export function periksaJamManual(a: { masuk: string; tanggal: string; hariIni: string; sekarangMs: number; awalJendelaMasuk?: string }): HasilJamManual {
  if (!adalahJam(a.masuk)) return { ok: false, pesan: "Format jam tidak sah." };
  const d = detikDariJam(a.masuk);
  if (a.awalJendelaMasuk) {
    const batas = detikDariJam(`${a.awalJendelaMasuk}:00`) - 3600;
    if (d < batas) return { ok: false, pesan: `Jam masuk tidak boleh lebih awal dari ${Math.max(0, Math.floor(batas / 3600)).toString().padStart(2, "0")}:${Math.floor((Math.max(0, batas) % 3600) / 60).toString().padStart(2, "0")} (awal jendela Masuk dikurangi 60 menit).` };
  }
  if (a.tanggal > a.hariIni) return { ok: false, pesan: "Tanggal tidak boleh di masa depan." };
  if (a.tanggal < a.hariIni) return { ok: true, masukDetik: d, mundur: true, selisihMenit: Infinity };
  const sekarang = detikWIB(a.sekarangMs);
  if (d > sekarang) return { ok: false, pesan: `Jam masuk (${a.masuk.slice(0, 5)}) tidak boleh melewati waktu pencatatan sekarang.` };
  const selisih = sekarang - d;
  return { ok: true, masukDetik: d, mundur: selisih > BATAS_MUNDUR_DETIK, selisihMenit: Math.round(selisih / 60) };
}

/** Bagian manual yang DIPAKAI setelah dibandingkan dengan data alat. */
export type PemakaianManual = {
  tap: ManualTap;
  dipakai: ("masuk" | "pulang")[];
  diabaikan: boolean;
  /** Jam tap alat yang datang SETELAH presensi manual dipakai (alat tidak mengubah status): "Tap alat 07:40 setelah presensi manual 07:05". */
  alatSetelah?: string;
  /** Jam tap alat yang LEBIH AWAL sehingga masuk manual diabaikan. */
  alatLebihAwal?: string;
};

export type HasilGabung = {
  masuk?: { jam: string; status: string; manual?: AlasanManual };
  pulang?: { jam: string; manual?: AlasanManual };
  manual?: PemakaianManual;
};

/** Menghitung Hadir/Terlambat dari jam masuk terpilih (jadwal kelas). Tanpa ini, status entri terpilih dipakai apa adanya. */
export type HitungStatus = (jam: string) => "Hadir" | "Terlambat";
export const hitungStatusJadwal = (schedule: ScheduleRow[], kelas: string, tanggal: string): HitungStatus => (jam) => statusDariJam(jam, schedule, kelas, tanggal);

/**
 * Gabungkan tap alat (masuk/pulang) dengan entri manual. MASUK: bukti paling awal menang (seri = alat). PULANG: alat menang, manual mengisi yang kosong.
 * Bila `hitung` diberikan, status masuk dihitung ulang dari jam terpilih setiap kali ada entri manual yang bersaing (jadwal kelas = sumber tunggal).
 */
export function gabungTap(
  alat: { masuk?: { jam: string; status: string }; pulang?: { jam: string } },
  manual: ManualTap | null | undefined,
  hitung?: HitungStatus,
): HasilGabung {
  const hasil: HasilGabung = { masuk: alat.masuk, pulang: alat.pulang };
  if (!manual) return hasil;
  const dipakai: ("masuk" | "pulang")[] = [];
  const info: Pick<PemakaianManual, "alatSetelah" | "alatLebihAwal"> = {};
  if (manual.masuk) {
    // alat tanpa jam (status ada, jam kosong) = data lama: alat menang
    const alatAwal = alat.masuk && (alat.masuk.jam === "" || alat.masuk.jam <= manual.masuk);
    if (!alat.masuk || !alatAwal) {
      const jam = manual.masuk;
      hasil.masuk = { jam, status: hitung ? hitung(jam) : manual.status, manual: manual.alasan };
      dipakai.push("masuk");
      if (alat.masuk?.jam) info.alatSetelah = alat.masuk.jam;
    } else {
      if (alat.masuk.jam) info.alatLebihAwal = alat.masuk.jam;
      if (hitung && alat.masuk.jam) hasil.masuk = { ...alat.masuk, status: hitung(alat.masuk.jam) };
    }
  }
  if (manual.pulang && !alat.pulang) { hasil.pulang = { jam: manual.pulang, manual: manual.alasan }; dipakai.push("pulang"); }
  hasil.manual = { tap: manual, dipakai, diabaikan: dipakai.length === 0, ...info };
  return hasil;
}

/** Kalimat info untuk UI/laporan tentang hubungan tap alat dan presensi manual (kosong bila tidak relevan). */
export function infoGabung(m: PemakaianManual | undefined): string {
  if (!m) return "";
  const j = (x: string | undefined) => (x ?? "").slice(0, 5);
  if (m.alatSetelah && m.tap.masuk) return `Tap alat ${j(m.alatSetelah)} setelah presensi manual ${j(m.tap.masuk)} (jam masuk resmi mengikuti manual)`;
  if (m.alatLebihAwal && m.tap.masuk) return `Presensi manual ${j(m.tap.masuk)} tidak dipakai: tap alat ${j(m.alatLebihAwal)} lebih awal`;
  return "";
}

export type SumberHarian = "alat" | "manual" | "izin" | "tidak-ada";

export type StatusHarian = {
  kategori: Kategori;
  sumber: SumberHarian;
  masuk?: string;
  pulang?: string;
  /** DayRecord setelah digabung: dapat dipakai langsung oleh rekap()/rekapBulan(). */
  rec: DayRecord;
  manual?: PemakaianManual;
  /** Alfa sudah dikonfirmasi waka padahal ada kehadiran (alat/manual): perlu ditinjau. */
  konflikValidasi: boolean;
};

/**
 * FUNGSI TUNGGAL status harian satu siswa. Semua perhitungan (dashboard, belum tap, validasi, saran, rekap, laporan, CSV,
 * portal orang tua) memakai fungsi ini atau `gabungRec`. Urutan prioritas: bukti hadir (tap alat/manual, yang paling awal) > keterangan (izin/sakit/dispensasi) > Alpha/Belum Tap.
 */
export function statusHarian(a: {
  tanggal: string;
  kelas: string;
  schedule: ScheduleRow[];
  now?: Date;
  attendance?: DayRecord | null; // attendance/{nis}/{tgl} (alat + ket)
  manual?: ManualTap | null; // manualTap/{tgl}/{nis}
  izin?: KetHarian | null; // izin/{tgl}/{nis}
  validasi?: { status: "Alfa" } | null; // validasi/{tgl}/{nis}
}): StatusHarian {
  const rec0: DayRecord = { ...(a.attendance ?? {}) };
  if (a.izin && !rec0.ket) rec0.ket = a.izin;
  const g = gabungTap(
    { masuk: rec0.status || rec0.masuk ? { jam: rec0.masuk ?? "", status: rec0.status ?? "Hadir" } : undefined, pulang: rec0.pulang ? { jam: rec0.pulang } : undefined },
    a.manual,
    hitungStatusJadwal(a.schedule, a.kelas, a.tanggal),
  );
  const rec: DayRecord = { ...rec0 };
  const pakaiMasuk = g.manual?.dipakai.includes("masuk");
  if (pakaiMasuk && g.masuk) { rec.masuk = g.masuk.jam; rec.status = g.masuk.status as "Hadir" | "Terlambat"; }
  else if (g.manual && g.masuk && rec.masuk && g.masuk.status !== rec.status) rec.status = g.masuk.status as "Hadir" | "Terlambat"; // alat lebih awal: status dihitung ulang dari jadwal
  if (g.manual?.dipakai.includes("pulang") && g.pulang) rec.pulang = g.pulang.jam;
  const kat = kategori(rec, a.tanggal, a.schedule, a.kelas, a.now);
  const hadir = Boolean(rec.status);
  const sumber: SumberHarian = !hadir ? (rec.ket ? "izin" : "tidak-ada") : pakaiMasuk ? "manual" : "alat";
  return {
    kategori: kat, sumber, masuk: rec.masuk, pulang: rec.pulang, rec, manual: g.manual,
    konflikValidasi: Boolean(a.validasi) && hadir,
  };
}

/** Pintasan: DayRecord gabungan (untuk rekap bulanan/tahunan). */
export function gabungRec(attendance: DayRecord | undefined, manual: ManualTap | ManualTapAnak | null | undefined): DayRecord | undefined {
  if (!manual) return attendance;
  const m = manual as ManualTap;
  const g = gabungTap(
    { masuk: attendance?.status || attendance?.masuk ? { jam: attendance.masuk ?? "", status: attendance.status ?? "Hadir" } : undefined, pulang: attendance?.pulang ? { jam: attendance.pulang } : undefined },
    { ...m, oleh: "", ts: 0, hariKe: 0 },
  );
  if (!g.manual || g.manual.diabaikan) return attendance;
  const rec: DayRecord = { ...(attendance ?? {}) };
  if (g.manual.dipakai.includes("masuk") && g.masuk) { rec.masuk = g.masuk.jam; rec.status = g.masuk.status as "Hadir" | "Terlambat"; }
  if (g.manual.dipakai.includes("pulang") && g.pulang) rec.pulang = g.pulang.jam;
  return rec;
}

/** Gabungkan peta attendance (nis -> tgl -> rec) dengan manualTap (tgl -> nis -> tap) menjadi peta gabungan baru. */
export function gabungSemua(
  attendance: Record<string, Record<string, DayRecord>>,
  manualPerTgl: Record<string, Record<string, ManualTap>>,
): Record<string, Record<string, DayRecord>> {
  const out: Record<string, Record<string, DayRecord>> = {};
  for (const [nis, per] of Object.entries(attendance)) out[nis] = { ...per };
  for (const [tgl, perNis] of Object.entries(manualPerTgl)) {
    for (const [nis, tap] of Object.entries(perNis)) {
      const g = gabungRec(out[nis]?.[tgl], tap);
      if (g) (out[nis] ??= {})[tgl] = g;
    }
  }
  return out;
}

/** Label singkat untuk badge/portal. */
export const labelManual = (alasan: string) => `Manual: ${alasan}`;
