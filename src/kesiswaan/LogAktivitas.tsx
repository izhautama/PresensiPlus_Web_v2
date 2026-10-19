import { useMemo, useState } from "react";
import Icon from "../components/Icon";
import { Empty, Spinner } from "../components/ui";
import { useAdminData } from "../admin/AdminData";
import { downloadCSV } from "../lib/attendance";
import { FILTER_KOSONG, NAMA_AKSI, ringkasan, saring, teksRingkasan, type EntriLog, type Filter } from "../lib/logAktivitas";
import { todayWIB } from "../lib/time";
import { useLive } from "../services/db";

type Perangkat = { uid: string; pertama: number; label: string; nama?: string };
const jam = (ms: number) => new Date(ms).toLocaleTimeString("id-ID", { timeZone: "Asia/Jakarta", hour: "2-digit", minute: "2-digit", second: "2-digit" });

/** Log aktivitas akun staf (admin & waka, hanya baca). Satu hari per tampilan. */
export default function LogAktivitas() {
  const { students, today } = useAdminData();
  // default = tanggal SERVER (mengikuti perubahan hari); tanggal pilihan pengguna menimpanya
  const [tglPilihan, setTgl] = useState<string | null>(null);
  const tgl = tglPilihan ?? today;
  const [f, setF] = useState<Filter>(FILTER_KOSONG);
  const live = useLive<Record<string, Omit<EntriLog, "id">>>(tgl ? `activity/${tgl}` : null);
  const perangkat = useLive<Record<string, Perangkat>>("piketPerangkat");
  const nama = useMemo(() => new Map(students.map((s) => [s.nis, s.nama])), [students]);

  const semua = useMemo<EntriLog[]>(() => Object.entries(live.data ?? {}).map(([id, x]) => ({ id, ...x })), [live.data]);
  const baruHariIni = useMemo(
    () => new Set(Object.entries(perangkat.data ?? {}).filter(([, p]) => todayWIB(new Date(p.pertama)) === tgl).map(([id]) => id)),
    [perangkat.data, tgl],
  );
  const rows = useMemo(() => saring(semua, f, (n) => nama.get(n) ?? ""), [semua, f, nama]);
  const ring = useMemo(() => ringkasan(rows, baruHariIni), [rows, baruHariIni]);
  const pilihan = (k: "akunEmail" | "petugas" | "deviceId") => [...new Set(semua.map((x) => x[k]).filter(Boolean) as string[])].sort();
  const set = (k: keyof Filter) => (v: string) => setF((s) => ({ ...s, [k]: v }));
  const labelPerangkat = (id: string) => { const x = semua.find((e) => e.deviceId === id); return x ? `${x.deviceNama ? `${x.deviceNama} · ` : ""}${x.deviceLabel}` : id.slice(0, 8); };

  const csv = () => downloadCSV(`log_aktivitas_${tgl}.csv`,
    ["Waktu", "Peran", "Akun", "Petugas (dipilih sendiri)", "Aksi", "NIS", "Siswa", "Detail", "Perangkat", "ID perangkat"],
    rows.map((x) => [jam(x.ts), x.peran, x.akunEmail, x.petugas ?? "", NAMA_AKSI[x.aksi] ?? x.aksi, x.nis ?? "", x.nis ? nama.get(x.nis) ?? "" : "", x.detail, `${x.deviceNama ? `${x.deviceNama} · ` : ""}${x.deviceLabel}`, x.deviceId]));

  const pilih = (k: keyof Filter, label: string, opsi: string[], tampil?: (v: string) => string) => (
    <select value={f[k]} onChange={(e) => set(k)(e.target.value)} aria-label={label}>
      <option value="">{label}: semua</option>
      {opsi.map((o) => <option key={o} value={o}>{tampil ? tampil(o) : o}</option>)}
    </select>
  );

  return (
    <section className="data-page">
      <div className="section-heading"><div><p>Log aktivitas</p><span>Nama petugas dipilih sendiri oleh pengguna (akun piket dipakai bersama) — bukan autentikasi individu. Perangkat dikenali dari ID acak lokal, bukan lokasi/IP.</span></div></div>
      <div className="filter-bar no-print">
        <input type="date" className="text-input auto" value={tgl} onChange={(e) => setTgl(e.target.value)} aria-label="Tanggal" />
        {pilih("peran", "Peran", ["admin", "kepala", "waka", "piket"])}
        {pilih("akun", "Akun", pilihan("akunEmail"))}
        {pilih("petugas", "Petugas", pilihan("petugas"))}
        {pilih("perangkat", "Perangkat", pilihan("deviceId"), labelPerangkat)}
        {pilih("aksi", "Jenis aksi", [...new Set(semua.map((x) => x.aksi))].sort(), (a) => NAMA_AKSI[a] ?? a)}
        <div className="search search-inline"><Icon name="search" size={18} /><input value={f.siswa} onChange={(e) => set("siswa")(e.target.value)} placeholder="Cari siswa (nama/NIS)..." aria-label="Cari siswa" /></div>
        <button className="primary-button" onClick={csv} disabled={!rows.length}><Icon name="download" size={15} />Unduh CSV</button>
      </div>
      <p className="log-ringkas" data-testid="log-ringkasan"><b>{teksRingkasan(ring)}</b></p>
      <div className="table-panel">
        <div className="table-head log-grid"><span>Waktu</span><span>Akun / petugas</span><span>Aksi</span><span>Detail</span><span>Perangkat</span></div>
        {live.error ? <Empty icon="alert" title="Gagal memuat" text={live.error} /> : live.loading ? <div className="page-loader"><Spinner dark /></div> : rows.length === 0 ? (
          <Empty icon="activity" title="Tidak ada aktivitas" text="Belum ada aktivitas pada tanggal ini atau tidak cocok dengan filter." />
        ) : rows.map((x) => (
          <div className="table-row log-grid" key={x.id}>
            <span className="mono small">{jam(x.ts)}</span>
            <span className="student-cell"><span><b>{x.petugas ?? x.akunEmail}</b><small>{x.petugas ? `${x.akunEmail} · ` : ""}{x.peran}</small></span></span>
            <span>{NAMA_AKSI[x.aksi] ?? x.aksi}</span>
            <span className="audit-diff"><small>{x.detail || "—"}</small>{x.nis && <small className="mono">{x.nis} · {nama.get(x.nis) ?? ""}</small>}</span>
            <span className="audit-diff">
              <small>{x.deviceNama ? `${x.deviceNama} · ` : ""}{x.deviceLabel}</small>
              {x.peran === "piket" && baruHariIni.has(x.deviceId) && <small><span className="badge badge-perlu">Perangkat baru</span></small>}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
