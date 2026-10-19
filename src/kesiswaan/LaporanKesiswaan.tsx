import { useEffect, useMemo, useState } from "react";
import { get, orderByKey, query, startAt, endAt } from "firebase/database";
import Icon from "../components/Icon";
import { Empty, Spinner, StatusBadge } from "../components/ui";
import { useAdminData } from "../admin/AdminData";
import { downloadCSV } from "../lib/attendance";
import { awalTa, levelDari, labelTa, perluTindakLanjut, ringkas, taKey, type DiscRecord } from "../lib/discipline";
import { rekapPerJam, type LessonsTgl } from "../lib/rekapJam";
import { rekapSiswa } from "../lib/hariEfektif";
import type { ManualTap } from "../lib/manual";
import type { DayRecord } from "../lib/types";
import { useKalenderRentang } from "./useKalender";
import { BULAN, formatTanggal, lastDayOfMonth } from "../lib/time";
import { r } from "../services/db";
import { useDiscipline } from "./useDiscipline";

type Tab = "siswa" | "kelas" | "top" | "jam" | "izin";
type IzinMeta = { lingkup: "harian" | "jam"; jam?: Record<string, number>; ket: string; keterangan: string; suratDiterima: boolean; petugas: string };

/** Laporan kesiswaan: poin per siswa/kelas, top pelanggaran, rekap kehadiran per jam. CSV dan cetak tersedia. */
export default function LaporanKesiswaan() {
  const { today } = useAdminData();
  const [tab, setTab] = useState<Tab>("siswa");
  const [ta, setTa] = useState(taKey(today));
  const [bulan, setBulan] = useState(""); // "" = seluruh TA; selain itu "YYYY-MM"
  const [kelas, setKelas] = useState("");
  const d = useDiscipline();
  const { students, kelasList } = useAdminData();

  const taOpsi = useMemo(() => {
    const set = new Set<string>([taKey(today)]);
    for (const per of Object.values(d.records)) for (const x of Object.values(per)) set.add(x.ta);
    return [...set].sort().reverse();
  }, [d.records, today]);
  const bulanOpsi = useMemo(() => {
    const y = Number(ta.slice(0, 4));
    return Array.from({ length: 12 }, (_, i) => { const m = ((6 + i) % 12) + 1; const th = m >= 7 ? y : y + 1; return `${th}-${String(m).padStart(2, "0")}`; });
  }, [ta]);

  // catatan terfilter TA (+ bulan)
  const filtered = useMemo(() => {
    const out: Record<string, Record<string, DiscRecord>> = {};
    for (const [nis, per] of Object.entries(d.records)) {
      const sel = Object.fromEntries(Object.entries(per).filter(([, x]) => x.ta === ta && (!bulan || x.tanggal.startsWith(bulan))));
      if (Object.keys(sel).length) out[nis] = sel;
    }
    return out;
  }, [d.records, ta, bulan]);

  const periode = bulan ? `${BULAN[Number(bulan.slice(5)) - 1]} ${bulan.slice(0, 4)}` : labelTa(ta);
  const anak = useMemo(() => students.filter((s) => !kelas || s.kelas === kelas), [students, kelas]);

  const perSiswa = useMemo(() => anak.map((s) => {
    const x = ringkas(filtered[s.nis], ta);
    return { s, x, level: bulan ? null : levelDari(x.saldo, d.levelList).sekarang, perlu: !bulan && perluTindakLanjut(x, d.levelList) };
  }).sort((a, b) => b.x.saldo - a.x.saldo || a.s.nama.localeCompare(b.s.nama)), [anak, filtered, ta, bulan, d.levelList]);

  const perKelas = useMemo(() => {
    const m = new Map<string, { siswa: number; catatan: number; pel: number; rem: number; saldo: number; perlu: number }>();
    for (const { s, x, perlu } of perSiswa) {
      const k = m.get(s.kelas) ?? { siswa: 0, catatan: 0, pel: 0, rem: 0, saldo: 0, perlu: 0 };
      k.siswa++; k.catatan += x.jumlah; k.pel += x.pel; k.rem += x.rem; k.saldo += x.saldo; if (perlu) k.perlu++;
      m.set(s.kelas, k);
    }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [perSiswa]);

  const top = useMemo(() => {
    const m = new Map<string, { nama: string; kategori: string; kasus: number; poin: number; siswa: Set<string> }>();
    const boleh = new Set(anak.map((s) => s.nis));
    for (const [nis, per] of Object.entries(filtered)) {
      if (!boleh.has(nis)) continue;
      for (const x of Object.values(per)) {
        if (x.jenis !== "pelanggaran") continue;
        const k = m.get(x.nama) ?? { nama: x.nama, kategori: x.kategori ?? "-", kasus: 0, poin: 0, siswa: new Set<string>() };
        k.kasus++; k.poin += x.poin; k.siswa.add(nis);
        m.set(x.nama, k);
      }
    }
    return [...m.values()].sort((a, b) => b.kasus - a.kasus || b.poin - a.poin).slice(0, 20);
  }, [filtered, anak]);

  // ---- kehadiran per jam (dibaca sekali per bulan agar hemat kuota)
  const [bulanJam, setBulanJam] = useState(today.slice(0, 7));
  // ---- izin & bukti surat (izinMeta), dibaca sekali per bulan
  const [izinMeta, setIzinMeta] = useState<Record<string, Record<string, Record<string, IzinMeta>>> | null>(null);
  const [errIzin, setErrIzin] = useState("");
  const [tanpaSurat, setTanpaSurat] = useState(false);
  useEffect(() => {
    if (tab !== "izin") return;
    setIzinMeta(null); setErrIzin("");
    get(query(r("izinMeta"), orderByKey(), startAt(`${bulanJam}-01`), endAt(`${bulanJam}-31`)))
      .then((s) => setIzinMeta((s.val() ?? {}) as typeof izinMeta)).catch((e) => setErrIzin(e.message));
  }, [tab, bulanJam]);
  const izinBaris = useMemo(() => {
    const nama = new Map(students.map((x) => [x.nis, x]));
    const out: { tanggal: string; nis: string; nama: string; kelas: string; m: IzinMeta; id: string }[] = [];
    for (const [tgl, per] of Object.entries(izinMeta ?? {})) for (const [nis, entri] of Object.entries(per)) for (const [id, m] of Object.entries(entri)) {
      const sw = nama.get(nis);
      if ((kelas && sw?.kelas !== kelas) || (tanpaSurat && m.suratDiterima)) continue;
      out.push({ tanggal: tgl, nis, nama: sw?.nama ?? nis, kelas: sw?.kelas ?? "-", m, id });
    }
    return out.sort((a, b) => b.tanggal.localeCompare(a.tanggal) || a.nama.localeCompare(b.nama));
  }, [izinMeta, students, kelas, tanpaSurat]);
  const [lessons, setLessons] = useState<Record<string, LessonsTgl> | null>(null);
  const [errJam, setErrJam] = useState("");
  useEffect(() => {
    if (tab !== "jam") return;
    setLessons(null); setErrJam("");
    get(query(r("lessons"), orderByKey(), startAt(`${bulanJam}-01`), endAt(`${bulanJam}-31`)))
      .then((s) => setLessons((s.val() ?? {}) as Record<string, LessonsTgl>)).catch((e) => setErrJam(e.message));
  }, [tab, bulanJam]);

  // Status HARIAN bulan itu (rumus rekapSiswa yang sama dengan semua rekap): Alfa seharian dihitung sebagai HARI terpisah dari "A per jam (bolos)".
  const { schedule, now, aktifSejak } = useAdminData();
  const [attBulan, setAttBulan] = useState<Record<string, Record<string, DayRecord>> | null>(null);
  const [manualBln, setManualBln] = useState<Record<string, Record<string, ManualTap>> | null>(null);
  useEffect(() => {
    if (tab !== "jam") return;
    setAttBulan(null); setManualBln(null);
    get(r("attendance")).then((x) => setAttBulan((x.val() ?? {}) as Record<string, Record<string, DayRecord>>)).catch((e) => setErrJam(e.message));
    get(query(r("manualTap"), orderByKey(), startAt(`${bulanJam}-01`), endAt(`${bulanJam}-31`)))
      .then((x) => setManualBln((x.val() ?? {}) as Record<string, Record<string, ManualTap>>)).catch((e) => setErrJam(e.message));
  }, [tab, bulanJam]);
  const kalJam = useKalenderRentang(`${bulanJam}-01`, lastDayOfMonth(bulanJam));
  const harianJam = useMemo(() => {
    const out = new Map<string, { alfa: number; turunan: Set<string> }>();
    if (!attBulan || !manualBln || kalJam.loading) return null;
    for (const s of anak) {
      const manualSiswa: Record<string, ManualTap> = {};
      for (const [tgl, per] of Object.entries(manualBln)) if (per[s.nis]) manualSiswa[tgl] = per[s.nis];
      const rk = rekapSiswa({ hariEfektif: kalJam.peta, attendance: attBulan[s.nis], manualTap: manualSiswa, schedule, kelas: s.kelas, aktifSejak: aktifSejak[s.nis], awal: `${bulanJam}-01`, akhir: lastDayOfMonth(bulanJam), now });
      const turunan = new Set(rk.hari.filter((h) => h.kategori === "Alpha" || h.kategori === "Izin" || h.kategori === "Sakit" || h.kategori === "Dispensasi").map((h) => h.tanggal));
      if (rk.Alpha || turunan.size) out.set(s.nis, { alfa: rk.Alpha, turunan });
    }
    return out;
  }, [attBulan, manualBln, kalJam.loading, kalJam.peta, anak, schedule, aktifSejak, bulanJam, now]);

  const perJam = useMemo(() => {
    if (!lessons || !harianJam) return [];
    const m = rekapPerJam(lessons, (nis, tgl) => harianJam.get(nis)?.turunan.has(tgl) ?? false);
    const nisAda = new Set([...m.keys(), ...[...harianJam.entries()].filter(([, v]) => v.alfa > 0).map(([n]) => n)]);
    return anak.filter((s) => nisAda.has(s.nis)).map((s) => {
      const e = m.get(s.nis) ?? { A: 0, I: 0, S: 0, D: 0, mapelA: new Map<string, number>() };
      const mapel = [...e.mapelA.entries()].sort((a, b) => b[1] - a[1]).map(([n, c]) => `${n} ×${c}`);
      return { s, ...e, alfaHari: harianJam.get(s.nis)?.alfa ?? 0, mapel };
    }).sort((a, b) => b.alfaHari - a.alfaHari || b.A - a.A || (b.I + b.S + b.D) - (a.I + a.S + a.D));
  }, [lessons, harianJam, anak]);

  const csv = () => {
    const nama = `laporan_kesiswaan_${tab}_${bulan || ta}`;
    if (tab === "siswa") downloadCSV(`${nama}.csv`, ["NIS", "Nama", "Kelas", "Pelanggaran", "Remisi", "Saldo", "Level", "Jumlah catatan"], perSiswa.map(({ s, x, level }) => [s.nis, s.nama, s.kelas, x.pel, x.rem, x.saldo, level?.[1].tindakan ?? "", x.jumlah]));
    else if (tab === "kelas") downloadCSV(`${nama}.csv`, ["Kelas", "Siswa", "Catatan", "Poin pelanggaran", "Poin remisi", "Rata-rata saldo", "Perlu tindak lanjut"], perKelas.map(([k, v]) => [k, v.siswa, v.catatan, v.pel, v.rem, v.siswa ? Math.round((v.saldo / v.siswa) * 10) / 10 : 0, v.perlu]));
    else if (tab === "top") downloadCSV(`${nama}.csv`, ["Pelanggaran", "Kategori", "Kasus", "Total poin", "Siswa berbeda"], top.map((t) => [t.nama, t.kategori, t.kasus, t.poin, t.siswa.size]));
    else if (tab === "izin") downloadCSV(`laporan_izin_${bulanJam}.csv`, ["Tanggal", "NIS", "Nama", "Kelas", "Jenis", "Lingkup", "Jam", "Keterangan", "Surat fisik diterima", "Petugas"],
      izinBaris.map((x) => [x.tanggal, x.nis, x.nama, x.kelas, x.m.ket, x.m.lingkup, Object.values(x.m.jam ?? {}).join(" "), x.m.keterangan, x.m.suratDiterima ? "Ya" : "Belum", x.m.petugas]));
    else downloadCSV(`laporan_kesiswaan_per_jam_${bulanJam}.csv`, ["NIS", "Nama", "Kelas", "A per jam (bolos)", "Izin (jam)", "Sakit (jam)", "Dispensasi (jam)", "Alfa seharian (hari)", "Mapel paling sering A per jam"], perJam.map((x) => [x.s.nis, x.s.nama, x.s.kelas, x.A, x.I, x.S, x.D, x.alfaHari, x.mapel.join("; ")]));
  };

  const judul = { siswa: "Poin per siswa", kelas: "Poin per kelas", top: "Pelanggaran terbanyak", jam: "Kehadiran per jam", izin: "Izin & bukti surat" }[tab];
  const adaData = tab === "siswa" ? perSiswa.length : tab === "kelas" ? perKelas.length : tab === "top" ? top.length : tab === "izin" ? izinBaris.length : perJam.length;

  return (
    <section className="data-page">
      <div className="section-heading"><div><p>Laporan kesiswaan</p><span>Rekap poin pelanggaran/remisi dan kehadiran per jam · unduh CSV atau cetak</span></div></div>
      <div className="print-only print-head"><p>Laporan kesiswaan — {judul} · MA Nurul Huda</p><span>{tab === "jam" || tab === "izin" ? `${BULAN[Number(bulanJam.slice(5)) - 1]} ${bulanJam.slice(0, 4)}` : periode}{kelas ? ` · ${kelas}` : ""}</span></div>

      <div className="chip-group tabs no-print" role="tablist">
        {([["siswa", "Per siswa"], ["kelas", "Per kelas"], ["top", "Top pelanggaran"], ["jam", "Kehadiran per jam"], ["izin", "Izin & surat"]] as const).map(([k, l]) => (
          <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? "active" : ""} onClick={() => setTab(k)}>{l}</button>
        ))}
      </div>

      <div className="filter-bar no-print">
        {tab !== "jam" && tab !== "izin" ? (
          <>
            <select value={ta} onChange={(e) => { setTa(e.target.value); setBulan(""); }} aria-label="Tahun ajaran">{taOpsi.map((t) => <option key={t} value={t}>{labelTa(t)}</option>)}</select>
            <select value={bulan} onChange={(e) => setBulan(e.target.value)} aria-label="Bulan"><option value="">Seluruh tahun ajaran</option>{bulanOpsi.map((b) => <option key={b} value={b}>{BULAN[Number(b.slice(5)) - 1]} {b.slice(0, 4)}</option>)}</select>
          </>
        ) : (
          <input type="month" className="text-input auto" value={bulanJam} max={today.slice(0, 7)} onChange={(e) => e.target.value && setBulanJam(e.target.value)} aria-label="Bulan" />
        )}
        <select value={kelas} onChange={(e) => setKelas(e.target.value)} aria-label="Kelas"><option value="">Semua kelas</option>{kelasList.map((k) => <option key={k}>{k}</option>)}</select>
        {tab === "izin" && <label className="check-inline"><input type="checkbox" checked={tanpaSurat} onChange={(e) => setTanpaSurat(e.target.checked)} />Hanya tanpa surat fisik</label>}
        <button className="primary-button" onClick={csv} disabled={!adaData}><Icon name="download" size={15} />Unduh CSV</button>
        <button className="secondary-button" onClick={() => window.print()} disabled={!adaData}><Icon name="printer" size={15} />Cetak</button>
      </div>
      {tab !== "jam" && tab !== "izin" && bulan && <p className="caption-text">Periode bulan: saldo = pelanggaran − remisi pada bulan tersebut saja; level tidak ditampilkan.</p>}
      {tab !== "jam" && tab !== "izin" && <p className="caption-text">{periode} · awal TA {awalTa(ta)} · {labelTa(ta)}</p>}

      <div className="table-panel">
        {d.loading ? <div className="page-loader"><Spinner dark /></div> : tab === "siswa" ? (
          <>
            <div className="table-head lap-siswa"><span>Siswa</span><span>Kelas</span><span>Pelanggaran</span><span>Remisi</span><span>Saldo</span><span>Level</span></div>
            {perSiswa.length === 0 ? <Empty icon="users" title="Tidak ada siswa" /> : perSiswa.map(({ s, x, level, perlu }) => (
              <div className="table-row lap-siswa" key={s.nis}>
                <span className="student-cell"><span><b>{s.nama}</b><small>NIS {s.nis}</small></span></span><span>{s.kelas}</span>
                <span className="num">{x.pel || "—"}</span><span className="num">{x.rem ? `−${x.rem}` : "—"}</span><span><b className={`saldo ${perlu ? "bad" : ""}`}>{x.saldo}</b></span>
                <span>{x.sangatBerat ? <StatusBadge status="Sangat berat" /> : level ? <small>{level[1].tindakan}</small> : <small className="muted">—</small>}</span>
              </div>
            ))}
          </>
        ) : tab === "kelas" ? (
          <>
            <div className="table-head lap-kelas"><span>Kelas</span><span>Siswa</span><span>Catatan</span><span>Poin pelanggaran</span><span>Poin remisi</span><span>Rata-rata saldo</span><span>Perlu tindak lanjut</span></div>
            {perKelas.length === 0 ? <Empty icon="users" title="Tidak ada data" /> : perKelas.map(([k, v]) => (
              <div className="table-row lap-kelas" key={k}><span><b>{k}</b></span><span className="num">{v.siswa}</span><span className="num">{v.catatan}</span><span className="num">{v.pel}</span><span className="num">{v.rem ? `−${v.rem}` : 0}</span><span className="num">{v.siswa ? Math.round((v.saldo / v.siswa) * 10) / 10 : 0}</span><span className="num">{v.perlu}</span></div>
            ))}
          </>
        ) : tab === "top" ? (
          <>
            <div className="table-head lap-top"><span>Pelanggaran</span><span>Kategori</span><span>Kasus</span><span>Total poin</span><span>Siswa berbeda</span></div>
            {top.length === 0 ? <Empty icon="file" title="Belum ada pelanggaran pada periode ini" /> : top.map((t) => (
              <div className="table-row lap-top" key={t.nama}><span><b>{t.nama}</b></span><span>{t.kategori}</span><span className="num">{t.kasus}</span><span className="num">{t.poin}</span><span className="num">{t.siswa.size}</span></div>
            ))}
          </>
        ) : tab === "izin" ? (
          <>
            <div className="table-head lap-izin"><span>Siswa</span><span>Tanggal</span><span>Jenis</span><span>Keterangan</span><span>Surat fisik</span><span>Petugas</span></div>
            {errIzin ? <Empty icon="alert" title="Gagal memuat" text={errIzin} /> : !izinMeta ? <div className="page-loader"><Spinner dark /></div> : izinBaris.length === 0 ? (
              <Empty icon="file" title="Tidak ada izin pada bulan ini" text="Izin yang diinput piket/waka beserta keterangannya tampil di sini." />
            ) : izinBaris.map((x) => (
              <div className="table-row lap-izin" key={`${x.tanggal}-${x.nis}-${x.id}`}>
                <span className="student-cell"><span><b>{x.nama}</b><small>{x.kelas} · NIS {x.nis}</small></span></span>
                <span>{formatTanggal(x.tanggal, false)}</span>
                <span><StatusBadge status={x.m.ket} /><small className="muted block">{x.m.lingkup === "jam" ? `jam ke-${Object.values(x.m.jam ?? {}).join(", ")}` : "seharian"}</small></span>
                <span><small>{x.m.keterangan}</small></span>
                <span>{x.m.suratDiterima ? <StatusBadge status="Diterima" /> : <StatusBadge status="Belum" />}</span>
                <span><small>{x.m.petugas}</small></span>
              </div>
            ))}
          </>
        ) : (
          <>
            <div className="table-head lap-jam"><span>Siswa</span><span>Kelas</span><span title="Alfa pada jam tertentu saat siswa hadir (bolos)">A per jam (bolos)</span><span>Izin</span><span>Sakit</span><span>Disp.</span><span title="Hari tanpa tap, manual, maupun keterangan (otomatis)">Alfa seharian (hari)</span><span>Mapel paling sering A per jam</span></div>
            {errJam ? <Empty icon="alert" title="Gagal memuat" text={errJam} /> : !lessons || !harianJam ? <div className="page-loader"><Spinner dark /></div> : perJam.length === 0 ? (
              <Empty icon="clock" title="Tidak ada ketidakhadiran per jam" text={`Pada ${formatTanggal(`${bulanJam}-01`, false).replace(/^\d+ /, "")}.`} />
            ) : perJam.map((x) => (
              <div className="table-row lap-jam" key={x.s.nis}>
                <span className="student-cell"><span><b>{x.s.nama}</b><small>NIS {x.s.nis}</small></span></span><span>{x.s.kelas}</span>
                <span className={`num ${x.A ? "bad" : ""}`}>{x.A}</span><span className="num">{x.I}</span><span className="num">{x.S}</span><span className="num">{x.D}</span>
                <span className={`num ${x.alfaHari ? "bad" : ""}`} data-testid="alfa-seharian-hari">{x.alfaHari}</span>
                <span><small>{x.mapel.join(", ") || "—"}</small></span>
              </div>
            ))}
          </>
        )}
      </div>
    </section>
  );
}
