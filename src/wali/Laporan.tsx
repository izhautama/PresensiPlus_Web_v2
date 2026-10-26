import { useMemo, useState } from "react";
import { get, orderByKey, query, startAt, endAt } from "firebase/database";
import Icon from "../components/Icon";
import { Empty, Spinner } from "../components/ui";
import { useAdminData } from "../admin/AdminData";
import { useAuth } from "../auth/AuthContext";
import { useKalenderRentang } from "../kesiswaan/useKalender";
import { downloadCSV } from "../lib/attendance";
import { labelTa, taKey } from "../lib/discipline";
import type { PetaHari } from "../lib/hariEfektif";
import {
  barisCsv, detailLogEkspor, formatPersen, headerCsv, kolomPembinaan, namaBerkasLaporan, periksaRentang, susunLaporan,
  type BarisLaporan, type MasukanLaporan, type SalinanJam,
} from "../lib/laporanWaliBk";
import type { ManualTapAnak } from "../lib/manual";
import { formatTanggal } from "../lib/time";
import type { DayRecord } from "../lib/types";
import { catatAktivitas } from "../services/aktivitas";
import { r } from "../services/db";
import { useDisiplinKelas } from "./DisiplinKelas";

type Hasil = { baris: BarisLaporan[]; kolom: ReturnType<typeof kolomPembinaan>; kelas: string; awal: string; akhir: string; ta: string };
const PARALEL = 16;

/** Jalankan `kerja` untuk tiap item dengan paling banyak PARALEL permintaan bersamaan (satu koneksi websocket; hemat memori). */
async function dalamBatch<T>(items: T[], kerja: (x: T) => Promise<void>) {
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(PARALEL, items.length) }, async () => { while (i < items.length) { const x = items[i++]; await kerja(x); } }));
}

/**
 * Laporan wali kelas / BK (satu baris per siswa). Data dibaca SEKALI saat "Tampilkan" ditekan (query rentang tanggal per siswa pada salinan per siswa
 * yang sudah boleh dibaca peran ini); catatan disiplin dan pembinaan dari langganan panel (tanpa langganan baru). Rumus = rekapSiswa/rekapPerJam yang sama.
 */
export default function Laporan() {
  const { session } = useAuth();
  const { students, kelasList, today, schedule, aktifSejak } = useAdminData();
  const d = useDisiplinKelas();
  const peran = session?.role === "bk" ? "bk" : "wali";
  const namaAkun = session && session.role !== "ortu" && session.role !== "admin" ? session.nama : "";
  const taOpsi = useMemo(() => {
    const set = new Set<string>([taKey(today)]);
    for (const per of Object.values(d.recs)) for (const x of Object.values(per)) set.add(x.ta);
    return [...set].sort().reverse();
  }, [d.recs, today]);
  const [ta, setTa] = useState(taKey(today));
  const [awal, setAwal] = useState(`${today.slice(0, 7)}-01`);
  const [akhir, setAkhir] = useState(today);
  const [kelasPilih, setKelasPilih] = useState("");
  const [hasil, setHasil] = useState<Hasil | null>(null);
  const [memuat, setMemuat] = useState(false);
  const [galat, setGalat] = useState("");
  const kal = useKalenderRentang(awal, akhir);

  // Wali: siswa = kelas yang sedang dipilih di KelasBar (konteks panel). BK: semua siswa terindeks, dengan filter kelas.
  const lingkup = useMemo(() => (peran === "bk" && kelasPilih ? students.filter((s) => s.kelas === kelasPilih) : students), [students, peran, kelasPilih]);
  const kelasLabel = peran === "bk" ? kelasPilih : (students[0]?.kelas ?? "");
  const salahRentang = periksaRentang(awal, akhir);

  const tampilkan = async () => {
    if (salahRentang) { setGalat(salahRentang); return; }
    setGalat(""); setMemuat(true); setHasil(null);
    try {
      const att: MasukanLaporan["attendance"] = {}, man: MasukanLaporan["manualTap"] = {}, val: MasukanLaporan["validasi"] = {}, jam: SalinanJam = {};
      const rentang = (p: string) => query(r(p), orderByKey(), startAt(awal), endAt(akhir));
      await dalamBatch(lingkup, async (s) => {
        const [a, m, v, j] = await Promise.all([
          get(rentang(`attendance/${s.nis}`)), get(rentang(`manualTapByStudent/${s.nis}`)), get(rentang(`validasiByStudent/${s.nis}`)), get(rentang(`lessonsByStudent/${s.nis}`)),
        ]);
        att[s.nis] = a.val() as Record<string, DayRecord> | null;
        man[s.nis] = m.val() as Record<string, ManualTapAnak> | null;
        val[s.nis] = v.val() as Record<string, unknown> | null;
        jam[s.nis] = (j.val() ?? {}) as SalinanJam[string];
      });
      const baris = susunLaporan({
        peran, siswa: lingkup, awal, akhir, ta, hariEfektif: kal.peta as PetaHari, schedule, aktifSejak,
        attendance: att, manualTap: man, validasi: val, lessons: jam, records: d.recs, meta: d.meta, levels: d.levels, pembinaan: d.pembinaan,
      });
      setHasil({ baris, kolom: kolomPembinaan(d.levels, peran), kelas: kelasLabel, awal, akhir, ta });
    } catch (e) { setGalat((e as Error).message || "Gagal memuat data laporan"); } finally { setMemuat(false); }
  };

  const log = (format: "csv" | "cetak") => hasil && catatAktivitas("ekspor-laporan", detailLogEkspor({ peran, kelas: hasil.kelas, awal: hasil.awal, akhir: hasil.akhir, jumlah: hasil.baris.length, format }));
  const unduh = () => {
    if (!hasil) return;
    downloadCSV(namaBerkasLaporan({ peran, kelas: hasil.kelas, awal: hasil.awal, akhir: hasil.akhir }), headerCsv(hasil.kolom), barisCsv(hasil.baris, hasil.kolom), ";");
    void log("csv");
  };
  const cetak = () => { void log("cetak"); window.print(); };
  const siap = !d.memuat && !kal.loading;

  return (
    <section className="data-page" data-testid="laporan-wali-bk">
      <div className="section-heading no-print">
        <div><p>Laporan</p><span>{peran === "bk" ? "Semua siswa terindeks" : `Siswa kelas binaan${kelasLabel ? ` · ${kelasLabel}` : ""} (ikuti pilihan kelas di atas)`} · satu baris per siswa</span></div>
      </div>
      <div className="filter-bar no-print">
        <select className="text-input auto" value={ta} onChange={(e) => setTa(e.target.value)} aria-label="Tahun ajaran">{taOpsi.map((t) => <option key={t} value={t}>{labelTa(t)}</option>)}</select>
        <input type="date" className="text-input auto" value={awal} max={akhir} onChange={(e) => setAwal(e.target.value)} aria-label="Dari tanggal" />
        <input type="date" className="text-input auto" value={akhir} max={today} onChange={(e) => setAkhir(e.target.value)} aria-label="Sampai tanggal" />
        {peran === "bk" && (
          <select className="text-input auto" value={kelasPilih} onChange={(e) => setKelasPilih(e.target.value)} aria-label="Kelas"><option value="">Semua kelas</option>{kelasList.map((k) => <option key={k}>{k}</option>)}</select>
        )}
        <button className="primary-button" onClick={tampilkan} disabled={memuat || !siap || !lingkup.length} data-testid="tampilkan-laporan">{memuat ? <Spinner /> : null}Tampilkan</button>
        <button className="secondary-button" onClick={unduh} disabled={!hasil} data-testid="unduh-laporan"><Icon name="download" size={15} />Unduh CSV</button>
        <button className="secondary-button" onClick={cetak} disabled={!hasil} data-testid="cetak-laporan"><Icon name="printer" size={15} />Cetak</button>
      </div>
      {galat && <div className="notice warn no-print" role="alert"><Icon name="warning" size={17} /><span>{galat}</span></div>}
      <p className="caption-text no-print">Hari efektif mengikuti kalender akademik; Dispensasi dihitung hadir. Status pembinaan hanya menampilkan status dan tanggal (bukan isinya). Level tercapai menurut puncak saldo pada tahun ajaran terpilih.</p>

      {hasil ? (
        <div data-testid="hasil-laporan">
          <div className="print-only print-head" style={{ display: "none" }}>
            <p>Laporan {peran === "bk" ? "Guru BK" : "Wali Kelas"} — {labelTa(hasil.ta)}</p>
            <span>Periode {formatTanggal(hasil.awal)} s.d. {formatTanggal(hasil.akhir)} · Kelas {hasil.kelas || "semua"} · {hasil.baris.length} siswa · Akun {namaAkun || "-"} · Dicetak {formatTanggal(today)}</span>
          </div>
          <div className="table-panel laporan-scroll">
            <table className="laporan-tabel">
              <thead>
                <tr>
                  <th>NIS</th><th>Nama</th><th>Kelas</th><th>Hari efektif</th><th>Hadir</th><th>Terlambat</th><th>Izin</th><th>Sakit</th><th>Dispensasi</th><th>Alpha</th><th>% Hadir</th>
                  <th>A</th><th>I</th><th>S</th><th>D</th><th>Poin</th><th>Remisi</th><th>Saldo</th><th>Puncak</th><th>Level</th>
                  {hasil.kolom.map((k) => <th key={k.levelId}>{k.label}</th>)}
                </tr>
              </thead>
              <tbody>
                {hasil.baris.map((b) => (
                  <tr key={b.nis} data-nis={b.nis}>
                    <td>{b.nis}</td><td>{b.nama}</td><td>{b.kelas}</td><td>{b.efektif}</td><td>{b.hadir}</td><td>{b.terlambat}</td><td>{b.izin}</td><td>{b.sakit}</td><td>{b.dispensasi}</td><td>{b.alpha}</td><td>{formatPersen(b.persen) || "—"}</td>
                    <td>{b.jamA}</td><td>{b.jamI}</td><td>{b.jamS}</td><td>{b.jamD}</td><td>{b.poinPelanggaran}</td><td>{b.remisi}</td><td>{b.saldo}</td><td>{b.puncak}</td><td>{b.levelTercapai || "—"}</td>
                    {hasil.kolom.map((k) => <td key={k.levelId}>{b.pembinaan[k.levelId] || "—"}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : memuat ? <div className="page-loader"><Spinner dark /></div> : (
        <Empty icon="file" title="Belum ada laporan" text="Pilih periode lalu tekan Tampilkan. Data dibaca sekali agar hemat kuota." />
      )}
    </section>
  );
}
