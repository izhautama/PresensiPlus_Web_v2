import { useEffect, useMemo, useState } from "react";
import { get, orderByKey, query, startAt, endAt } from "firebase/database";
import Icon from "../components/Icon";
import { Empty, Spinner, StatusBadge } from "../components/ui";
import { downloadCSV, maskUid, persenWarna } from "../lib/attendance";
import { rekapSiswa } from "../lib/hariEfektif";
import { formatTanggal, lastDayOfMonth, monthKey, monthLabel } from "../lib/time";
import { gabungTap, type ManualTap } from "../lib/manual";
import { useKalenderRentang } from "../kesiswaan/useKalender";
import type { DayRecord, LogEntry } from "../lib/types";
import { r, useLive } from "../services/db";
import { useAdminData } from "./AdminData";
import { usePanelMode } from "./AdminLayout";

type Tab = "bulanan" | "harian";

export default function Reports() {
  const [tab, setTab] = useState<Tab>("bulanan");
  return (
    <section className="data-page">
      <div className="section-heading">
        <div><p>Laporan kehadiran</p><span>Rekap bulanan per siswa dan log tap harian, dapat diunduh sebagai CSV (Excel) atau dicetak</span></div>
      </div>
      <div className="print-only print-head"><p>Laporan kehadiran · MA Nurul Huda</p><span>Dicetak dari Presensi+</span></div>
      <div className="chip-group tabs no-print" role="tablist">
        <button role="tab" aria-selected={tab === "bulanan"} className={tab === "bulanan" ? "active" : ""} onClick={() => setTab("bulanan")}>Rekap bulanan</button>
        <button role="tab" aria-selected={tab === "harian"} className={tab === "harian" ? "active" : ""} onClick={() => setTab("harian")}>Log harian</button>
      </div>
      {tab === "bulanan" ? <Bulanan /> : <Harian />}
    </section>
  );
}

function Bulanan() {
  const { students, schedule, today, kelasList, aktifSejak } = useAdminData();
  const [bulan, setBulan] = useState(monthKey(today));
  const [kelas, setKelas] = useState("");
  const [att, setAtt] = useState<Record<string, Record<string, DayRecord>> | null>(null);
  const [manualBulan, setManualBulan] = useState<Record<string, Record<string, ManualTap>> | null>(null);
  const [err, setErr] = useState("");
  const [muat, setMuat] = useState(0);

  // Dibaca sekali (bukan realtime) agar hemat kuota unduhan paket gratis
  useEffect(() => {
    setAtt(null); setErr("");
    get(r("attendance")).then((x) => setAtt((x.val() ?? {}) as Record<string, Record<string, DayRecord>>)).catch((e) => setErr(e.message));
  }, [muat]);
  // presensi manual: HANYA bulan yang dipilih (query rentang kunci tanggal), bukan seluruh node
  useEffect(() => {
    setManualBulan(null);
    get(query(r("manualTap"), orderByKey(), startAt(`${bulan}-01`), endAt(`${bulan}-31`)))
      .then((x) => setManualBulan((x.val() ?? {}) as Record<string, Record<string, ManualTap>>)).catch((e) => setErr(e.message));
  }, [muat, bulan]);
  // hari efektif berbasis bukti (kalenderEfektif) bulan terpilih; SATU rumus untuk semua: rekapSiswa (alat menang, manual mengisi yang kosong)
  const kal = useKalenderRentang(`${bulan}-01`, lastDayOfMonth(bulan));
  const data = att && manualBulan && !kal.loading ? att : null;

  const rows = useMemo(() => {
    if (!data) return [];
    return students.filter((s) => !kelas || s.kelas === kelas).map((s) => {
      const manualSiswa: Record<string, ManualTap> = {};
      for (const [tgl, per] of Object.entries(manualBulan ?? {})) if (per[s.nis]) manualSiswa[tgl] = per[s.nis];
      return { ...s, ...rekapSiswa({ hariEfektif: kal.peta, attendance: data[s.nis], manualTap: manualSiswa, schedule, kelas: s.kelas, aktifSejak: aktifSejak[s.nis], awal: `${bulan}-01`, akhir: lastDayOfMonth(bulan) }) };
    });
  }, [data, manualBulan, students, kelas, bulan, schedule, kal.peta, aktifSejak]);

  const hariSekolah = rows.reduce((m, x) => Math.max(m, x.HariSekolah), 0);
  const denganData = rows.filter((x) => x.Persen != null);
  const rata = denganData.length ? Math.round((denganData.reduce((t, x) => t + (x.Persen ?? 0), 0) / denganData.length) * 10) / 10 : null;

  const csv = () => downloadCSV(`rekap_${bulan}${kelas ? `_${kelas.replace(/\s+/g, "")}` : ""}.csv`,
    ["NIS", "Nama", "Kelas", "Hari Efektif (siswa)", "Hadir", "Terlambat", "Izin", "Sakit", "Dispensasi", "Alpha", "% Kehadiran"],
    rows.map((x) => [x.nis, x.nama, x.kelas, x.Efektif, x.Hadir, x.Terlambat, x.Izin, x.Sakit, x.Dispensasi, x.Alpha, x.Persen ?? ""]));

  return (
    <>
      <div className="filter-bar no-print">
        <input type="month" className="text-input auto" value={bulan} max={monthKey(today)} onChange={(e) => e.target.value && setBulan(e.target.value)} aria-label="Bulan" />
        <select className="text-input auto" value={kelas} onChange={(e) => setKelas(e.target.value)} aria-label="Kelas"><option value="">Semua kelas</option>{kelasList.map((k) => <option key={k}>{k}</option>)}</select>
        <button className="secondary-button" onClick={() => setMuat((x) => x + 1)}><Icon name="refresh" size={15} />Muat ulang</button>
        <button className="primary-button" onClick={csv} disabled={!rows.length}><Icon name="download" size={15} />Unduh CSV</button>
        <button className="secondary-button" onClick={() => window.print()} disabled={!rows.length}><Icon name="printer" size={15} />Cetak</button>
      </div>
      <p className="caption-text" data-testid="caption-rekap">{monthLabel(bulan)} · {hariSekolah} hari efektif (hari dengan bukti presensi atau ditetapkan di Kalender) · rata-rata kehadiran {rata ?? "-"}{rata == null ? "" : "%"} · % = (Hadir + Terlambat + Dispensasi) ÷ hari efektif siswa; hari tanpa kegiatan presensi tidak dihitung Alpha</p>
      <div className="table-panel">
        <div className="table-head report-grid"><span>Siswa</span><span>Kelas</span><span>Hadir</span><span>Telat</span><span>Izin</span><span>Sakit</span><span>Disp.</span><span>Alpha</span><span>%</span></div>
        {err || kal.error ? <Empty icon="alert" title="Gagal memuat" text={err || kal.error || ""} /> : !data ? <div className="page-loader"><Spinner dark /></div> : rows.length === 0 ? <Empty title="Tidak ada data" /> : rows.map((x) => (
          <div className="table-row report-grid" key={x.uid}>
            <span className="student-cell"><span><b>{x.nama}</b><small>NIS {x.nis}</small></span></span>
            <span>{x.kelas}</span><span className="num good">{x.Hadir}</span><span className="num warn">{x.Terlambat}</span>
            <span className="num">{x.Izin}</span><span className="num">{x.Sakit}</span><span className="num">{x.Dispensasi}</span><span className={`num ${x.Alpha ? "bad" : ""}`}>{x.Alpha}</span>
            <span><span className={`pct pct-${persenWarna(x.Persen)}`}>{x.Persen == null ? "-" : `${x.Persen}%`}</span></span>
          </div>
        ))}
      </div>
    </>
  );
}

function Harian() {
  const { today, studentMap } = useAdminData();
  const kepala = usePanelMode() !== "admin";
  const tampilUid = (uid: string) => (kepala ? maskUid(uid) : uid);
  const [tanggal, setTanggal] = useState(today);
  const live = useLive<Record<string, LogEntry>>(`log/${tanggal}`);
  const izin = useLive<Record<string, string>>(`izin/${tanggal}`);
  const manual = useLive<Record<string, ManualTap>>(`manualTap/${tanggal}`);
  const [q, setQ] = useState("");

  type Baris = { key: string; uid: string; jam: string; nis: string; nama?: string; kelas?: string; status: string; infoManual?: { alasan: string; petugas?: string; diabaikan: boolean } };
  const rows = useMemo<Baris[]>(() => {
    const qq = q.trim().toLowerCase();
    const alat: Baris[] = Object.entries(live.data ?? {}).map(([key, e]) => ({ key, uid: key.split("_")[0], ...e }));
    // entri manual digabung dengan tap alat lewat gabungTap yang sama (alat menang); yang diabaikan tetap tampil bertanda
    const perNis: Record<string, { masuk?: LogEntry; pulang?: LogEntry }> = {};
    for (const x of alat) { const slot = (perNis[x.nis] ??= {}); if (x.key.endsWith("_M")) slot.masuk = x; else slot.pulang = x; }
    const tambahan: Baris[] = [];
    for (const [nis, tap] of Object.entries(manual.data ?? {})) {
      const g = gabungTap({ masuk: perNis[nis]?.masuk, pulang: perNis[nis]?.pulang }, tap);
      const info = { alasan: tap.alasan, petugas: tap.petugas, diabaikan: Boolean(g.manual?.diabaikan) };
      const s = studentMap[Object.keys(studentMap).find((u) => studentMap[u].nis === nis) ?? ""];
      const dasar = { uid: "—", nis, nama: s?.nama, kelas: s?.kelas, infoManual: info };
      if (tap.masuk && (g.manual?.dipakai.includes("masuk") || perNis[nis]?.masuk)) tambahan.push({ ...dasar, key: `${nis}_manual_M`, jam: tap.masuk, status: tap.status, infoManual: { ...info, diabaikan: !g.manual?.dipakai.includes("masuk") } });
      if (tap.pulang) tambahan.push({ ...dasar, key: `${nis}_manual_P`, jam: tap.pulang, status: "Pulang", infoManual: { ...info, diabaikan: !g.manual?.dipakai.includes("pulang") } });
    }
    return [...alat, ...tambahan]
      .filter((x) => !qq || `${x.nama} ${x.nis}`.toLowerCase().includes(qq))
      .sort((a, b) => b.jam.localeCompare(a.jam));
  }, [live.data, manual.data, studentMap, q]);

  const sumber = (x: Baris) => (x.infoManual ? `Manual: ${x.infoManual.alasan}${x.infoManual.diabaikan ? " (diabaikan, ada tap alat)" : ""}` : "Alat");
  const csv = () => downloadCSV(`log_tap_${tanggal}.csv`, ["Tanggal", "Jam", "NIS", "Nama", "Kelas", "Status", "Sumber", "Petugas", "UID"],
    [...rows].reverse().map((x) => [tanggal, x.jam, x.nis, x.nama, x.kelas, x.status, sumber(x), x.infoManual?.petugas ?? "", tampilUid(x.uid)]));
  const nIzin = Object.keys(izin.data ?? {}).length;

  return (
    <>
      <div className="filter-bar no-print">
        <input type="date" className="text-input auto" value={tanggal} max={today} onChange={(e) => e.target.value && setTanggal(e.target.value)} aria-label="Tanggal" />
        <div className="search search-inline"><Icon name="search" size={18} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari nama atau NIS" aria-label="Cari" /></div>
        <button className="primary-button" onClick={csv} disabled={!rows.length}><Icon name="download" size={15} />Unduh CSV</button>
        <button className="secondary-button" onClick={() => window.print()} disabled={!rows.length}><Icon name="printer" size={15} />Cetak</button>
      </div>
      <p className="caption-text">{formatTanggal(tanggal)} · {rows.length} tap · {nIzin} izin/sakit/dispensasi · {tanggal === today ? "diperbarui real-time" : "arsip"}</p>
      <div className="table-panel">
        <div className="table-head log-grid"><span>Jam</span><span>Siswa</span><span>Kelas</span><span>Status</span><span>UID kartu</span></div>
        {live.loading || manual.loading ? <div className="page-loader"><Spinner dark /></div> : rows.length === 0 ? <Empty icon="card" title="Tidak ada tap pada tanggal ini" /> : rows.map((x) => (
          <div className="table-row log-grid" key={x.key}>
            <span className="mono">{x.jam}</span>
            <span className="student-cell"><span><b>{x.nama ?? studentMap[x.uid]?.nama ?? "—"}</b><small>NIS {x.nis}</small></span></span>
            <span>{x.kelas}</span>
            <span><StatusBadge status={x.status} />{x.infoManual && <small className="block"><span className="badge badge-ubah">Manual</span> {x.infoManual.alasan}{x.infoManual.petugas ? ` · ${x.infoManual.petugas}` : ""}{x.infoManual.diabaikan ? " · diabaikan (ada tap alat)" : ""}</small>}</span>
            <span className="mono muted">{x.infoManual ? "—" : tampilUid(x.uid)}</span>
          </div>
        ))}
      </div>
    </>
  );
}
