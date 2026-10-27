import { useMemo, useState } from "react";
import Icon from "../components/Icon";
import { Empty, StatusBadge } from "../components/ui";
import { useAdminData } from "../admin/AdminData";
import { initials, toneOf } from "../lib/attendance";
import { formatTanggal, weekday } from "../lib/time";

/**
 * Kehadiran kelas (v2.5.2, HANYA BACA): status hari ini tiap siswa kelas binaan. Wali kelas memantau; izin/sakit dicatat Guru Piket
 * (cadangan Waka/Kepala), bukan wali. Data memakai sumber yang sama dengan halaman lain (kehadiran hari ini per siswa binaan).
 */
export default function KehadiranKelas() {
  const { students, byNis, today, ready } = useAdminData();
  const [q, setQ] = useState("");
  const libur = weekday(today) === 0;

  const baris = useMemo(() => students.map((s) => {
    const e = byNis[s.nis];
    const status = e?.masuk ? e.masuk.status : e?.ket ?? "Belum tap";
    return { s, status, jam: e?.masuk?.jam ?? "", manual: Boolean(e?.masuk?.manual) };
  }), [students, byNis]);
  const hitung = (st: string[]) => baris.filter((b) => st.includes(b.status)).length;
  const tampil = baris.filter((b) => !q.trim() || `${b.s.nama} ${b.s.nis}`.toLowerCase().includes(q.trim().toLowerCase()));

  return (
    <section className="data-page" data-testid="kehadiran-kelas">
      <div className="section-heading">
        <div><p>Kehadiran kelas</p><span>{formatTanggal(today)} · status hari ini siswa kelas binaan (hanya melihat)</span></div>
      </div>
      <div className="notice" data-testid="catatan-kabar-izin" role="note"><Icon name="file" size={17} /><span>Kabar izin dari orang tua diteruskan ke Guru Piket. Wali kelas memantau kehadiran dan tidak mencatat izin.</span></div>

      <section className="stats-grid">
        <article className="stat-card"><div className="stat-icon teal"><Icon name="check" /></div><div><p>Hadir</p><strong data-testid="kk-hadir">{libur ? 0 : hitung(["Hadir", "Terlambat"])}</strong><span className="trend neutral">termasuk terlambat</span></div></article>
        <article className="stat-card"><div className="stat-icon amber"><Icon name="file" /></div><div><p>Izin / sakit / dispensasi</p><strong data-testid="kk-izin">{libur ? 0 : hitung(["Izin", "Sakit", "Dispensasi"])}</strong><span className="trend neutral">berketerangan</span></div></article>
        <article className="stat-card"><div className="stat-icon coral"><Icon name="clock" /></div><div><p>Belum tap</p><strong data-testid="kk-belum">{libur ? 0 : hitung(["Belum tap"])}</strong><span className="trend neutral">{libur ? "Hari Minggu — libur" : "dari siswa kelas binaan"}</span></div></article>
      </section>

      <div className="filter-bar">
        <div className="search search-inline"><Icon name="search" size={18} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari nama atau NIS..." aria-label="Cari siswa" /></div>
      </div>

      <div className="table-panel">
        <div className="table-head piket-grid"><span>Siswa</span><span>Kelas</span><span className="ta-right">Status hari ini</span></div>
        {!ready ? null : libur ? <Empty icon="calendar" title="Hari Minggu — libur" text="Tidak ada presensi hari ini." /> : tampil.length === 0 ? (
          <Empty icon="users" title="Tidak ada siswa" text="Tidak ada siswa yang cocok." />
        ) : tampil.map(({ s, status, jam, manual }) => (
          <div className="table-row piket-grid" key={s.nis} data-nis={s.nis} data-status={status}>
            <span className="student-cell"><i className={`avatar ${toneOf(s.nis)}`}>{initials(s.nama)}</i><span><b>{s.nama}</b><small>NIS {s.nis}</small></span></span>
            <span>{s.kelas}</span>
            <span className="aksi-cell"><StatusBadge status={status} />{jam && <small>{jam}{manual ? " · manual" : ""}</small>}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
