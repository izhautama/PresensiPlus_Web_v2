// Logika saran pelanggaran otomatis. Fungsi MURNI (tanpa Firebase) agar dapat diuji unit; impor memakai ekstensi .ts
// supaya Node dapat mengeksekusinya langsung (tsconfig: allowImportingTsExtensions).
import type { AutoMap, Rule } from "./discipline.ts";
import { gabungTap, type ManualTap } from "./manual.ts";
import { namaHari, weekday } from "./time.ts";

export type TipeSaran = "terlambat" | "tanpaTapPulang" | "bolosJam" | "alfa" | "lupaKtm" | "ktmHilang";
export const TIPE_LABEL: Record<TipeSaran, string> = {
  terlambat: "Terlambat",
  tanpaTapPulang: "Tidak tap pulang",
  bolosJam: "Tidak masuk kelas (jam pelajaran)",
  alfa: "Alfa terverifikasi",
  lupaKtm: "Lupa membawa KTM",
  ktmHilang: "Menghilangkan KTM",
};

/** Bila autoMap belum memetakan tipe ini (data lama), cari aturan aktif berdasarkan namanya di master. */
const NAMA_BAWAAN: Partial<Record<TipeSaran, string>> = { lupaKtm: "lupa membawa ktm", ktmHilang: "menghilangkan ktm" };

type KodeJam = "S" | "I" | "D" | "A";
type Lessons = Record<string, { meta?: Record<string, { mapel?: string }>; absen?: Record<string, Record<string, KodeJam>> }>;

/** Data satu hari yang dibutuhkan untuk menghitung saran. */
export type DataHari = {
  log?: Record<string, { jam: string; nis: string; status: string }> | null;
  izin?: Record<string, string> | null;
  validasi?: Record<string, unknown> | null;
  lessons?: Lessons | null;
  manual?: Record<string, ManualTap> | null; // manualTap/{tgl}
};

export type SiswaMin = { nis: string; nama: string; kelas: string };

export type Saran = {
  key: string; // {tipe}_{nis}
  tanggal: string;
  tipe: TipeSaran;
  nis: string;
  nama: string;
  kelas: string;
  ruleId: string;
  recId: string; // {tanggal}_{tipe}: deterministik, mencegah dobel
  detail: string;
};

export const recIdSaran = (tanggal: string, tipe: TipeSaran) => `${tanggal}_${tipe}`;

export function hitungSaran(a: {
  tanggal: string[];
  today: string;
  nowHM: string;
  siswa: SiswaMin[];
  data: Record<string, DataHari>;
  autoMap: AutoMap;
  rules: Record<string, Rule>;
  putusan: Record<string, Record<string, unknown> | null | undefined>; // suggest/{tgl}
  records: Record<string, Record<string, unknown> | undefined>; // discipline/records
  batasPulang: (kelas: string, hari: string) => string; // "HH:MM" akhir jendela pulang
}): Saran[] {
  const out: Saran[] = [];
  const aturan = (tipe: TipeSaran): string | null => {
    let id: string | undefined = a.autoMap[tipe];
    if (!id && NAMA_BAWAAN[tipe]) id = Object.entries(a.rules).find(([, r]) => r.aktif && r.nama.trim().toLowerCase() === NAMA_BAWAAN[tipe])?.[0];
    return id && a.rules[id]?.aktif ? id : null; // autoMap kosong / aturan nonaktif -> tidak ada saran
  };

  for (const tgl of a.tanggal) {
    if (weekday(tgl) === 0) continue; // Minggu libur: tidak ada saran
    if (tgl > a.today) continue;
    const d = a.data[tgl] ?? {};
    const masuk: Record<string, { jam: string; status: string }> = {};
    const pulang: Record<string, true> = {};
    for (const [key, e] of Object.entries(d.log ?? {})) {
      if (key.endsWith("_M")) masuk[e.nis] = e; else if (key.endsWith("_P")) pulang[e.nis] = true;
    }

    for (const s of a.siswa) {
      // presensi manual: alat MENANG; manual hanya mengisi tap masuk/pulang yang kosong
      const gb = gabungTap(
        { masuk: masuk[s.nis] ? { jam: masuk[s.nis].jam, status: masuk[s.nis].status } : undefined, pulang: pulang[s.nis] ? { jam: "" } : undefined },
        d.manual?.[s.nis],
      );
      const m = gb.masuk ? { jam: gb.masuk.jam, status: gb.masuk.status } : undefined;
      const adaPulang = Boolean(gb.pulang);
      const manualEfektif = gb.manual && !gb.manual.diabaikan ? gb.manual.tap : undefined;
      const ket = d.izin?.[s.nis];
      // sel per jam siswa ini (nis unik; kelas bisa pindah, jadi cari di semua kelas)
      const sel: { jam: number; kode: KodeJam; mapel?: string }[] = [];
      for (const k of Object.values(d.lessons ?? {})) {
        for (const [jam, kode] of Object.entries(k.absen?.[s.nis] ?? {})) sel.push({ jam: Number(jam), kode, mapel: k.meta?.[jam]?.mapel });
      }
      const adaSID = sel.some((x) => x.kode === "S" || x.kode === "I" || x.kode === "D");
      const jamA = sel.filter((x) => x.kode === "A").sort((p, q) => p.jam - q.jam);

      const tambah = (tipe: TipeSaran, detail: string) => {
        const ruleId = aturan(tipe);
        if (!ruleId) return;
        const key = `${tipe}_${s.nis}`;
        const recId = recIdSaran(tgl, tipe);
        if (a.putusan[tgl]?.[key] || a.records[s.nis]?.[recId]) return; // sudah diputuskan / sudah tercatat
        out.push({ key, tanggal: tgl, tipe, nis: s.nis, nama: s.nama, kelas: s.kelas, ruleId, recId, detail });
      };

      if (m?.status === "Terlambat") tambah("terlambat", `Tap masuk ${m.jam.slice(0, 5)} (Terlambat)`);

      // Tanpa tap pulang: tidak disarankan bila ada izin pulang awal (sel S/I/D di jam mana pun) atau keterangan harian Izin/Sakit/Dispensasi
      // siswa yang presensinya dicatat manual (KTM lupa/hilang, kartu rusak, alat mati) tidak dapat tap pulang: tidak disarankan
      if (m && !adaPulang && !ket && !adaSID && !manualEfektif) {
        const lewat = tgl < a.today || a.nowHM > a.batasPulang(s.kelas, namaHari(tgl));
        if (lewat) tambah("tanpaTapPulang", `Tap masuk ${m.jam.slice(0, 5)}, tidak ada tap pulang`);
      }

      // Bolos jam: HANYA dari sel A (alfa) pada siswa yang sudah tap masuk
      if (m && jamA.length > 0) {
        tambah("bolosJam", `Tap masuk ${m.jam.slice(0, 5)} tetapi Alfa pada ${jamA.map((x) => `jam ke-${x.jam}${x.mapel ? ` (${x.mapel})` : ""}`).join(", ")}`);
      }

      // Lupa/hilang KTM tercatat manual (hanya bila entri manual dipakai, bukan diabaikan karena ada tap alat)
      if (manualEfektif?.masuk && manualEfektif.alasan === "Lupa KTM") tambah("lupaKtm", `Presensi manual (${manualEfektif.masuk.slice(0, 5)}): lupa membawa KTM`);
      if (manualEfektif?.masuk && manualEfektif.alasan === "KTM hilang") tambah("ktmHilang", `Presensi manual (${manualEfektif.masuk.slice(0, 5)}): KTM hilang`);

      if (d.validasi?.[s.nis]) tambah("alfa", "Alfa dikonfirmasi waka/kepala (tidak masuk tanpa keterangan)");
    }
  }
  return out.sort((x, y) => y.tanggal.localeCompare(x.tanggal) || x.nama.localeCompare(y.nama) || x.tipe.localeCompare(y.tipe));
}
