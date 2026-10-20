import { useMemo } from "react";
import { Link } from "react-router";
import { equalTo, orderByChild, query } from "firebase/database";
import Icon from "../components/Icon";
import { Spinner } from "../components/ui";
import { useAdminData } from "../admin/AdminData";
import { useAuth } from "../auth/AuthContext";
import { formatTanggal, salam } from "../lib/time";
import type { UsulRemisi } from "../lib/pembinaan";
import type { Konseling } from "../lib/konseling";
import { useLive } from "../services/db";
import { useDisiplinKelas } from "../wali/DisiplinKelas";

/** Beranda BK: siswa yang perlu dibina (ambang BK), usulan remisi menunggu, dan jumlah catatan konseling saya. */
export default function Dashboard() {
  const { session } = useAuth();
  const uid = session?.role === "bk" ? session.uid : "";
  const nama = session?.role === "bk" ? session.nama : "";
  const { students, today, now, ready } = useAdminData();
  const d = useDisiplinKelas();
  const usul = useLive<Record<string, UsulRemisi>>(uid ? "usulRemisi" : null, (ref) => query(ref, orderByChild("oleh"), equalTo(uid)));
  const kons = useLive<Record<string, Record<string, Konseling>>>(uid ? "konseling" : null);
  const menunggu = Object.values(usul.data ?? {}).filter((u) => u.status === "menunggu").length;
  const saya = useMemo(() => Object.values(kons.data ?? {}).reduce((n, per) => n + Object.values(per).filter((k) => k.oleh === uid).length, 0), [kons.data, uid]);

  return (
    <>
      <section className="welcome">
        <div>
          <p className="eyebrow">BIMBINGAN KONSELING · SEMUA KELAS</p>
          <p className="welcome-title">{salam(now)}, {nama || "Guru BK"}</p>
          <p className="welcome-sub">{formatTanggal(today)}</p>
        </div>
        <Link className="primary-button" to="/bk/konseling"><Icon name="plus" size={18} /><span>Catatan konseling</span></Link>
      </section>
      {!ready ? <div className="page-loader"><Spinner dark /></div> : (
        <>
          <section className="stats-grid" data-testid="ringkasan-bk">
            <article className="stat-card"><div className="stat-icon green"><Icon name="users" /></div><div><p>Siswa</p><strong data-testid="bk-jumlah-siswa">{students.length}</strong><span className="trend neutral"><small>semua kelas</small></span></div></article>
            <Link className="stat-card" to="/bk/pembinaan" data-testid="kartu-perlu-dibina"><div className="stat-icon coral"><Icon name="bell" /></div><div><p>Perlu dibina (BK)</p><strong data-testid="bk-perlu-dibina">{d.memuat ? "…" : d.items.length}</strong><span className="trend neutral"><small>ambang tanggung jawab BK</small></span></div></Link>
            <Link className="stat-card" to="/bk/usulan" data-testid="kartu-usulan"><div className="stat-icon teal"><Icon name="file" /></div><div><p>Usulan remisi menunggu</p><strong>{usul.loading ? "…" : menunggu}</strong><span className="trend neutral"><small>keputusan di Waka/Kepala</small></span></div></Link>
            <Link className="stat-card" to="/bk/konseling" data-testid="kartu-konseling"><div className="stat-icon amber"><Icon name="eye" /></div><div><p>Catatan konseling saya</p><strong data-testid="bk-jumlah-konseling">{kons.loading ? "…" : saya}</strong><span className="trend neutral"><small>rahasia</small></span></div></Link>
          </section>
          {d.items.length > 0 && (
            <article className="panel" data-testid="dashboard-perlu-dibina">
              <div className="panel-header"><div><p className="panel-title">Perlu dibina</p><span>Saldo poin mencapai ambang pembinaan BK</span></div></div>
              <div className="simple-list">
                {d.items.slice(0, 5).map((it) => {
                  const st = students.find((x) => x.nis === it.nis);
                  return (
                    <div key={`${it.nis}-${it.levelId}`}><span><b>{st?.nama ?? it.nis}</b><small>{st?.kelas}</small></span><span><small>Ambang {it.level.poin} poin · saldo {it.saldo}{it.saldoTurun ? " (sudah turun)" : ""}</small></span></div>
                  );
                })}
              </div>
              <Link className="ghost-button" to="/bk/pembinaan"><Icon name="arrow" size={15} />Buka halaman pembinaan</Link>
            </article>
          )}
        </>
      )}
    </>
  );
}
