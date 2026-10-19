import { useMemo, useState } from "react";
import { Link } from "react-router";
import Icon from "../components/Icon";
import { Empty, Spinner, StatusBadge } from "../components/ui";
import { initials, toneOf } from "../lib/attendance";
import { statusHariIni, useAdminData } from "../admin/AdminData";
import { useKelasWali } from "./WaliData";

/** Daftar siswa kelas binaan (NIS, nama, kelas) + status presensi hari ini. Tanpa PIN dan tanpa UID kartu. */
export default function SiswaKelas() {
  const { students, byNis, ready } = useAdminData();
  const { kelas, memuat } = useKelasWali();
  const [q, setQ] = useState("");
  const baris = useMemo(() => {
    const qq = q.trim().toLowerCase();
    return students.filter((s) => !qq || `${s.nama} ${s.nis}`.toLowerCase().includes(qq));
  }, [students, q]);

  return (
    <section className="data-page">
      <div className="section-heading"><div><p>Siswa kelas</p><span>Siswa kelas binaan Anda · status presensi hari ini · ketuk nama untuk detail</span></div></div>
      {!memuat && kelas.length === 0 && <div className="notice warn" role="alert"><Icon name="warning" size={17} /><span>Akun Anda belum dipetakan ke kelas. Hubungi admin atau waka kesiswaan.</span></div>}
      <div className="filter-bar">
        <div className="search search-inline"><Icon name="search" size={18} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari nama atau NIS..." aria-label="Cari siswa" /></div>
      </div>
      <div className="table-panel">
        <div className="table-head students-grid"><span>Siswa</span><span>NIS</span><span>Kelas</span><span>Masuk</span><span>Pulang</span><span>Status</span></div>
        {!ready ? <div className="page-loader"><Spinner dark /></div> : baris.length === 0 ? <Empty icon="users" title="Belum ada siswa" text="Belum ada siswa pada kelas binaan, atau pemetaan siswa-kelas belum disinkronkan oleh admin." /> : baris.map((s) => {
          const e = byNis[s.nis];
          return (
            <div className="table-row students-grid" key={s.nis} data-nis={s.nis}>
              <span className="student-cell"><i className={`avatar ${toneOf(s.nis)}`}>{initials(s.nama)}</i><span><Link className="row-link" to={`/wali/siswa/${s.nis}`} aria-label={`Detail ${s.nama}`}><b>{s.nama}</b></Link></span></span>
              <span>{s.nis}</span>
              <span>{s.kelas}</span>
              <span>{e?.masuk?.jam.slice(0, 5) ?? "—"}{e?.masuk?.manual && <small className="badge badge-ubah">Manual</small>}</span>
              <span>{e?.pulang?.jam.slice(0, 5) ?? "—"}</span>
              <span><StatusBadge status={statusHariIni(e, false)} /></span>
            </div>
          );
        })}
      </div>
    </section>
  );
}
