import type { DayRecord, Jenis, Kategori, ScheduleRow } from "./types.ts";
import { namaHari, nowHM, todayWIB, weekday } from "./time.ts";

/** Fallback identik firmware bila Data_Jadwal tidak lengkap (420,435,436,850,855,900 menit). */
export const JAM_DEFAULT: Record<Jenis, [string, string]> = {
  Masuk: ["07:00", "07:15"],
  Terlambat: ["07:16", "14:10"],
  Pulang: ["14:15", "15:00"],
};

/** Prioritas: baris Kelas & Hari spesifik > baris "Semua" — sama dgn cariJadwal() firmware. */
export function batasJam(schedule: ScheduleRow[], kelas: string, hari: string): Record<Jenis, [string, string]> {
  const hasil = { ...JAM_DEFAULT };
  (Object.keys(JAM_DEFAULT) as Jenis[]).forEach((jenis) => {
    let pilih: ScheduleRow | undefined;
    let cadangan: ScheduleRow | undefined;
    for (const r of schedule) {
      if (r.jenis !== jenis) continue;
      const ks = r.kelas === "Semua", hs = r.hari === "Semua";
      if ((ks || r.kelas === kelas) && (hs || r.hari === hari)) {
        if (!ks && !hs) { pilih = r; break; }
        cadangan ??= r;
      }
    }
    const r = pilih ?? cadangan;
    if (r) hasil[jenis] = [r.mulai.slice(0, 5), r.selesai.slice(0, 5)];
  });
  return hasil;
}

export function kategori(rec: DayRecord | undefined, tanggal: string, schedule: ScheduleRow[], kelas: string, now = new Date()): Kategori {
  if (weekday(tanggal) === 0) return "Libur";
  if (rec?.status) return rec.status;
  if (rec?.ket) return rec.ket;
  const today = todayWIB(now);
  if (tanggal < today) return "Alpha";
  if (tanggal > today) return "Mendatang";
  const akhirTelat = batasJam(schedule, kelas, namaHari(tanggal)).Terlambat[1];
  return nowHM(now) > akhirTelat ? "Alpha" : "Belum Tap";
}

// rekap()/rekapBulan() lama DIHAPUS: semua rekap kini memakai rekapSiswa() di lib/hariEfektif.ts (hari efektif berbasis bukti).

export function toneOf(key: string): string {
  const tones = ["mint", "blue", "amber", "violet", "rose", "gray"];
  let h = 0;
  for (const ch of key) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return tones[h % tones.length];
}

export function initials(nama: string): string {
  return nama.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "?";
}

export function persenWarna(p: number | null): "good" | "warn" | "bad" | "none" {
  if (p === null) return "none";
  if (p >= 90) return "good";
  if (p >= 75) return "warn";
  return "bad";
}

/**
 * Teks CSV: tiap nilai dibungkus tanda kutip (tanda kutip ganda di dalamnya digandakan), sehingga pemisah, kutip, dan baris baru di dalam nilai aman.
 * `pemisah` bawaan "," (laporan lama tidak berubah); laporan wali/BK memakai ";" agar langsung rapi di Excel berlocale Indonesia. BOM + CRLF.
 */
export function formatCSV(header: string[], rows: (string | number | null | undefined)[][], pemisah: "," | ";" = ","): string {
  const q = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  return "\uFEFF" + [header, ...rows].map((r) => r.map(q).join(pemisah)).join("\r\n"); // BOM: Excel baca UTF-8
}

export function downloadCSV(nama: string, header: string[], rows: (string | number | null | undefined)[][], pemisah: "," | ";" = ",") {
  const url = URL.createObjectURL(new Blob([formatCSV(header, rows, pemisah)], { type: "text/csv;charset=utf-8" }));
  const a = Object.assign(document.createElement("a"), { href: url, download: nama });
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** Sembunyikan UID kartu untuk peran pantau: tampilkan 4 karakter pertama saja. */
export function maskUid(uid: string): string {
  return `${uid.slice(0, 4)}••••`;
}
