import { useMemo } from "react";
import { Link } from "react-router";
import { equalTo, orderByChild, query } from "firebase/database";
import Icon from "../components/Icon";
import { Spinner } from "../components/ui";
import { useAdminData } from "../admin/AdminData";
import { useAuth } from "../auth/AuthContext";
import { formatTanggal, salam } from "../lib/time";
import type { UsulRemisi } from "../lib/pembinaan";
import { useLive } from "../services/db";
import { useDisiplinKelas } from "./DisiplinKelas";
import { useKelasWali } from "./WaliData";
import { decodeKelas } from "../lib/wali";

/** Beranda wali kelas: ringkasan kelas binaan hari ini, siswa yang perlu dibina, dan usulan remisi yang menunggu. */
export default function Dashboard() {
  const { session } = useAuth();
  const uid = session?.role === "wali" ? session.uid : "";
  const nama = session?.role === "wali" ? session.nama : "";
  const { students, byNis, today, now, ready } = useAdminData();
  const { aktif } = useKelasWali();
  const d = useDisiplinKelas();
  const usul = useLive<Record<string, UsulRemisi>>(uid ? "usulRemisi" : null, (ref) => query(ref, orderByChild("oleh"), equalTo(uid)));
  const menunggu = Object.values(usul.data ?? {}).filter((u) => u.status === "menunggu").length;

  const s = useMemo(() => {
    let masuk = 0, telat = 0, izin = 0, belum = 0;
    for (const st of students) {
      const e = byNis[st.nis];
      if (e?.masuk) { masuk++; if (e.masuk.status === "Terlambat") telat++; } else if (e?.ket) izin++; else belum++;
    }
    return { total: students.length, masuk, telat, izin, belum };
  }, [students, byNis]);

  return (
    <>
      <section className="welcome">
        <div>
          <p className="eyebrow">KELAS BINAAN{aktif ? ` · ${decodeKelas(aktif)}` : ""}</p>
          <p className="welcome-title">{salam(now)}, {nama || "Wali Kelas"}</p>
          <p className="welcome-sub">{formatTanggal(today)}</p>
        </div>
      </section>
      {!ready ? <div className="page-loader"><Spinner dark /></div> : (
        <>
          <section className="stats-grid" data-testid="ringkasan-wali">
            <article className="stat-card"><div className="stat-icon green"><Icon name="users" /></div><div><p>Siswa binaan</p><strong data-testid="wali-jumlah-siswa">{s.total}</strong><span className="trend neutral"><small>kelas yang Anda bina</small></span></div></article>
            <article className="stat-card"><div className="stat-icon teal"><Icon name="check" /></div><div><p>Sudah tap masuk</p><strong>{s.masuk}</strong><span className="trend warn">{s.telat} <small>terlambat</small></span></div></article>
            <article className="stat-card"><div className="stat-icon amber"><Icon name="clock" /></div><div><p>Izin / sakit</p><strong>{s.izin}</strong><span className="trend neutral"><small>hari ini</small></span></div></article>
            <article className="stat-card"><div className="stat-icon coral"><Icon name="warning" /></div><div><p>Belum tap</p><strong>{s.belum}</strong><span className="trend neutral"><small>hari ini</small></span></div></article>
          </section>
          <section className="stats-grid">
            <Link className="stat-card" to="/wali/pembinaan" data-testid="kartu-perlu-dibina"><div className="stat-icon coral"><Icon name="bell" /></div><div><p>Perlu dibina</p><strong data-testid="wali-perlu-dibina">{d.memuat ? "…" : d.items.length}</strong><span className="trend neutral"><small>lihat dan catat pembinaan</small></span></div></Link>
            <Link className="stat-card" to="/wali/usulan" data-testid="kartu-usulan"><div className="stat-icon teal"><Icon name="file" /></div><div><p>Usulan remisi menunggu</p><strong>{usul.loading ? "…" : menunggu}</strong><span className="trend neutral"><small>usulan saya</small></span></div></Link>
          </section>
          {d.items.length > 0 && (
            <article className="panel" data-testid="dashboard-perlu-dibina">
              <div className="panel-header"><div><p className="panel-title">Perlu dibina</p><span>Saldo poin mencapai ambang pembinaan wali kelas</span></div></div>
              <div className="simple-list">
                {d.items.slice(0, 5).map((it) => {
                  const st = students.find((x) => x.nis === it.nis);
                  return (
                    <div key={`${it.nis}-${it.levelId}`}><span><b>{st?.nama ?? it.nis}</b><small>{st?.kelas}</small></span><span><small>Ambang {it.level.poin} poin · saldo {it.saldo}{it.saldoTurun ? " (sudah turun)" : ""}</small></span></div>
                  );
                })}
              </div>
              <Link className="ghost-button" to="/wali/pembinaan"><Icon name="arrow" size={15} />Buka halaman pembinaan</Link>
            </article>
          )}
        </>
      )}
    </>
  );
}
