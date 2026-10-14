import { useMemo } from "react";
import { Link } from "react-router";
import Icon from "../components/Icon";
import { Empty, StatusBadge } from "../components/ui";
import { useAdminData } from "../admin/AdminData";
import { initials, toneOf } from "../lib/attendance";
import { labelTa, levelDari, perluTindakLanjut, poinBertanda, ringkas, taKey } from "../lib/discipline";
import { addDays, formatTanggal, salam, weekday } from "../lib/time";
import { useDiscipline } from "../kesiswaan/useDiscipline";
import { useLive } from "../services/db";
import { rentang, useSaran } from "../kesiswaan/useSaran";

/** Dashboard kesiswaan. */
export default function Dashboard() {
  const { students, byNis, today, now, ready } = useAdminData();
  const d = useDiscipline();
  const ta = taKey(today);
  const valLive = useLive<Record<string, unknown>>(`validasi/${today}`);

  const libur = weekday(today) === 0;
  const saranHari = useSaran(useMemo(() => rentang(addDays(today, -1), today), [today]));
  // Minggu = libur: tidak ada daftar belum tap
  const belumTap = useMemo(() => (libur ? 0 : students.filter((s) => !byNis[s.nis]?.masuk && !byNis[s.nis]?.ket).length), [students, byNis, libur]);
  // belum divalidasi = belum tap, belum ada keterangan izin/sakit, belum dikonfirmasi Alfa (bukan hari libur)
  const belumValidasi = useMemo(
    () => (weekday(today) === 0 ? 0 : students.filter((s) => !byNis[s.nis]?.masuk && !byNis[s.nis]?.ket && !valLive.data?.[s.nis]).length),
    [students, byNis, valLive.data, today],
  );
  const daftar = useMemo(() => students.map((s) => ({ s, r: ringkas(d.records[s.nis], ta) })), [students, d.records, ta]);
  const perlu = useMemo(() => daftar.filter((x) => perluTindakLanjut(x.r, d.levelList)).sort((a, b) => b.r.saldo - a.r.saldo), [daftar, d.levelList]);
  const top = useMemo(() => [...daftar].filter((x) => x.r.saldo > 0).sort((a, b) => b.r.saldo - a.r.saldo).slice(0, 10), [daftar]);
  const terbaru = useMemo(() => {
    const nama = new Map(students.map((s) => [s.nis, s]));
    return Object.entries(d.records)
      .flatMap(([nis, per]) => Object.entries(per).map(([id, x]) => ({ id, nis, siswa: nama.get(nis), ...x, dibuatTs: d.meta[nis]?.[id]?.dibuatTs ?? 0 })))
      .sort((a, b) => b.dibuatTs - a.dibuatTs)
      .slice(0, 10);
  }, [d.records, d.meta, students]);

  return (
    <>
      <section className="welcome">
        <div>
          <p className="eyebrow">KESISWAAN · {labelTa(ta).toUpperCase()}</p>
          <p className="welcome-title">{salam(now)}, Waka Kesiswaan</p>
          <p className="welcome-sub">{formatTanggal(today)}. Data diperbarui otomatis secara real-time.</p>
        </div>
        <Link className="primary-button" to="/waka/pelanggaran"><Icon name="plus" size={18} /><span>Catat pelanggaran</span></Link>
      </section>

      <section className="stats-grid">
        <article className="stat-card"><div className="stat-icon coral"><Icon name="clock" /></div><div><p>Belum tap hari ini</p><strong>{belumTap}</strong><span className="trend neutral">{libur ? "Hari Minggu — libur" : `dari ${students.length} siswa`}</span></div></article>
        <article className="stat-card"><div className="stat-icon amber"><Icon name="warning" /></div><div><p>Perlu tindak lanjut</p><strong>{perlu.length}</strong><span className="trend warn">mencapai ambang / sangat berat</span></div></article>
        <article className="stat-card"><div className="stat-icon green"><Icon name="check" /></div><div><p>Belum divalidasi</p><strong>{belumValidasi}</strong><span className="trend neutral"><Link to="/waka/validasi">Buka validasi harian</Link></span></div></article>
        <article className="stat-card"><div className="stat-icon teal"><Icon name="bell" /></div><div><p>Saran perlu ditinjau</p><strong data-testid="jumlah-saran">{saranHari.loading ? "…" : saranHari.saran.length}</strong><span className="trend neutral"><Link to="/waka/saran">Buka daftar saran</Link></span></div></article>
      </section>

      <section className="dashboard-grid">
        <article className="panel">
          <div className="panel-header"><div><p className="panel-title">Perlu tindak lanjut</p><span>Sudah mencapai ambang pembinaan atau punya pelanggaran Sangat Berat</span></div><Link className="ghost-button" to="/waka/pelanggaran">Semua <Icon name="arrow" size={16} /></Link></div>
          {!ready || d.loading ? null : perlu.length === 0 ? <Empty icon="check" title="Tidak ada siswa yang perlu tindak lanjut" /> : (
            <div className="activity-list">
              {perlu.slice(0, 8).map(({ s, r }) => (
                <div className="activity-row" key={s.nis}>
                  <span className={`avatar ${toneOf(s.nis)}`}>{initials(s.nama)}</span>
                  <div><b>{s.nama}</b><span>{s.kelas} · {levelDari(r.saldo, d.levelList).sekarang?.[1].tindakan ?? "Pelanggaran Sangat Berat"}</span></div>
                  <div className="activity-status"><b className="saldo bad">{r.saldo}</b>{r.sangatBerat && <StatusBadge status="Sangat berat" />}</div>
                </div>
              ))}
            </div>
          )}
        </article>

        <article className="panel">
          <div className="panel-header"><div><p className="panel-title">Saldo poin tertinggi</p><span>10 teratas · {labelTa(ta)}</span></div></div>
          {top.length === 0 ? <Empty icon="users" title="Belum ada saldo poin" /> : (
            <div className="simple-list">
              {top.map(({ s, r }, i) => <div key={s.nis}><b>{i + 1}. {s.nama}</b><small>{s.kelas}</small><b className="saldo">{r.saldo}</b></div>)}
            </div>
          )}
        </article>
      </section>

      <section className="panel" style={{ marginTop: 16 }}>
        <div className="panel-header"><div><p className="panel-title">Pelanggaran &amp; remisi terbaru</p><span>10 catatan terakhir</span></div></div>
        {terbaru.length === 0 ? <Empty icon="file" title="Belum ada catatan" /> : (
          <div className="simple-list">
            {terbaru.map((x) => (
              <div key={`${x.nis}-${x.id}`}>
                <b>{x.siswa?.nama ?? x.nis}</b><small>{x.nama}</small>
                <b className={x.jenis === "remisi" ? "saldo ok" : "saldo bad"}>{poinBertanda(x) > 0 ? "+" : "−"}{x.poin}</b>
              </div>
            ))}
          </div>
        )}
      </section>
    </>
  );
}
