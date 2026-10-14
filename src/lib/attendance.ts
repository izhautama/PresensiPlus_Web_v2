import type { DayRecord, Jenis, Kategori, ScheduleRow } from "./types.ts";
import { addDays, lastDayOfMonth, namaHari, nowHM, todayWIB, weekday } from "./time.ts";

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

export type Rekap = { Hadir: number; Terlambat: number; Izin: number; Sakit: number; Dispensasi: number; Alpha: number; Efektif: number; Persen: number | null };

/** Hari efektif = Senin–Sabtu s.d. hari ini (hari ini dihitung hanya jika sudah ada kepastian). */
export function rekap(records: Record<string, DayRecord> | undefined, awal: string, akhir: string, schedule: ScheduleRow[], kelas: string, now = new Date()): Rekap {
  const c: Rekap = { Hadir: 0, Terlambat: 0, Izin: 0, Sakit: 0, Dispensasi: 0, Alpha: 0, Efektif: 0, Persen: null };
  const batas = akhir < todayWIB(now) ? akhir : todayWIB(now);
  for (let d = awal; d <= batas; d = addDays(d, 1)) {
    const k = kategori(records?.[d], d, schedule, kelas, now);
    if (k === "Hadir" || k === "Terlambat" || k === "Izin" || k === "Sakit" || k === "Dispensasi" || k === "Alpha") c[k]++;
  }
  c.Efektif = c.Hadir + c.Terlambat + c.Izin + c.Sakit + c.Dispensasi + c.Alpha;
  // Dispensasi (mewakili sekolah) dihitung HADIR: hadir = Hadir + Terlambat + Dispensasi
  c.Persen = c.Efektif ? Math.round(((c.Hadir + c.Terlambat + c.Dispensasi) / c.Efektif) * 1000) / 10 : null;
  return c;
}

export function rekapBulan(records: Record<string, DayRecord> | undefined, ym: string, schedule: ScheduleRow[], kelas: string, now = new Date()) {
  return rekap(records, `${ym}-01`, lastDayOfMonth(ym), schedule, kelas, now);
}

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

export function downloadCSV(nama: string, header: string[], rows: (string | number | null | undefined)[][]) {
  const q = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const isi = "﻿" + [header, ...rows].map((r) => r.map(q).join(",")).join("\r\n"); // BOM: Excel baca UTF-8
  const url = URL.createObjectURL(new Blob([isi], { type: "text/csv;charset=utf-8" }));
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
