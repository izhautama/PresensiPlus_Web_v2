import { useMemo, useState } from "react";
import { Link } from "react-router";
import Icon from "../components/Icon";
import { Empty, Spinner } from "../components/ui";
import { initials, toneOf } from "../lib/attendance";
import { levelDari, ringkas, urutLevel } from "../lib/discipline";
import { useAdminData } from "../admin/AdminData";
import { useDisiplinKelas } from "../wali/DisiplinKelas";

/** Daftar SEMUA siswa (NIS, nama, kelas, saldo, level). Tanpa PIN dan tanpa UID kartu. */
export default function Siswa() {
  const { students, kelasList, ready } = useAdminData();
  const d = useDisiplinKelas();
  const [q, setQ] = useState("");
  const [kelas, setKelas] = useState("");
  const levels = useMemo(() => urutLevel(d.levels), [d.levels]);
  const baris = useMemo(() => {
    const qq = q.trim().toLowerCase();
    return students.filter((s) => (!kelas || s.kelas === kelas) && (!qq || `${s.nama} ${s.nis}`.toLowerCase().includes(qq))).slice(0, 300);
  }, [students, q, kelas]);

  return (
    <section className="data-page">
      <div className="section-heading"><div><p>Siswa</p><span>Semua kelas · saldo poin dan level TA berjalan · ketuk nama untuk detail</span></div></div>
      <div className="filter-bar">
        <div className="search search-inline"><Icon name="search" size={18} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari nama atau NIS..." aria-label="Cari siswa" /></div>
        <select className="text-input auto" value={kelas} onChange={(e) => setKelas(e.target.value)} aria-label="Filter kelas"><option value="">Semua kelas</option>{kelasList.map((k) => <option key={k}>{k}</option>)}</select>
      </div>
      <div className="table-panel">
        <div className="table-head students-grid"><span>Siswa</span><span>NIS</span><span>Kelas</span><span>Saldo poin</span><span>Level</span></div>
        {!ready ? <div className="page-loader"><Spinner dark /></div> : baris.length === 0 ? <Empty icon="users" title="Tidak ada siswa" text="Tidak ada siswa yang cocok, atau indeks siswa-kelas belum disinkronkan oleh admin." /> : baris.map((s) => {
          const r = ringkas(d.recs[s.nis], d.ta);
          const lv = levelDari(r.saldo, levels).sekarang;
          return (
            <div className="table-row students-grid" key={s.nis} data-nis={s.nis}>
              <span className="student-cell"><i className={`avatar ${toneOf(s.nis)}`}>{initials(s.nama)}</i><span><Link className="row-link" to={`/bk/siswa/${s.nis}`} aria-label={`Detail ${s.nama}`}><b>{s.nama}</b></Link></span></span>
              <span>{s.nis}</span>
              <span>{s.kelas}</span>
              <span className="num">{r.saldo}</span>
              <span>{lv ? `${lv[1].poin} poin` : "—"}</span>
            </div>
          );
        })}
      </div>
    </section>
  );
}
