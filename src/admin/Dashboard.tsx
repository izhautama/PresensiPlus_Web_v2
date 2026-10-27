import { useMemo } from "react";
import { Link } from "react-router";
import Icon from "../components/Icon";
import { Empty, StatusBadge } from "../components/ui";
import { batasJam, initials, toneOf } from "../lib/attendance";
import { namaHari, nowHM, relatif, salam, weekday } from "../lib/time";
import { useAdminData } from "./AdminData";
import BannerTapRendah from "../kesiswaan/BannerTapRendah";
import KontrolKalender from "../kesiswaan/KontrolKalender";
import KartuIndeks from "../kesiswaan/KartuIndeks";
import { useKalenderOtomatis } from "../kesiswaan/useKalender";
import { usePanelBase, usePanelMode } from "./AdminLayout";

export default function Dashboard() {
  const { students, byNis, log, schedule, today, now, device, online, serverNow, ready } = useAdminData();
  useKalenderOtomatis(); // hitung hari efektif (kemarin & hari-hari yang belum punya ringkasan; hari ini bila berubah)
  const kepala = usePanelMode() === "kepala";
  const base = usePanelBase();
  const libur = weekday(today) === 0;

  const s = useMemo(() => {
    let hadir = 0, telat = 0, izin = 0, pulang = 0, belum = 0;
    const perKelas: Record<string, { total: number; masuk: number }> = {};
    for (const st of students) {
      const e = byNis[st.nis];
      const k = (perKelas[st.kelas] ??= { total: 0, masuk: 0 });
      k.total++;
      if (e?.masuk) { k.masuk++; if (e.masuk.status === "Terlambat") telat++; else hadir++; }
      else if (e?.ket) izin++;
      else belum++;
      if (e?.pulang) pulang++;
    }
    return { total: students.length, hadir, telat, izin, pulang, belum, perKelas };
  }, [students, byNis]);

  const feed = useMemo(
    () => [
      ...Object.entries(log).map(([key, e]) => ({ key, ...e })),
      // presensi manual hari ini (tanpa tap alat) ikut tampil dengan penanda "Manual"
      ...students.filter((st) => byNis[st.nis]?.masuk?.manual).map((st) => ({ key: `${st.nis}_manual`, ...byNis[st.nis].masuk!, nama: st.nama, kelas: st.kelas })),
    ].sort((a, b) => b.jam.localeCompare(a.jam)).slice(0, 8),
    [log, students, byNis],
  );

  const pct = (n: number) => (s.total ? Math.round((n / s.total) * 1000) / 10 : 0);
  const pHadir = pct(s.hadir), pTelat = pct(s.telat), pIzin = pct(s.izin);
  const masukPct = Math.round((pHadir + pTelat) * 10) / 10;
  const batasMasuk = batasJam(schedule, "Semua", namaHari(today)).Masuk[1];
  const sudahLewat = nowHM(now) > batasJam(schedule, "Semua", namaHari(today)).Terlambat[1];

  return (
    <>
      <BannerTapRendah />
      <KontrolKalender />
      {!kepala && <KartuIndeks />} {/* admin: pemeriksa konsistensi indeks siswa-kelas & cermin wali, otomatis saat dibuka */}
      <section className="welcome">
        <div>
          <p className="eyebrow">MONITORING HARI INI</p>
          <p className="welcome-title">{salam(now)}, {kepala ? "Kepala Madrasah" : "Admin"}</p>
          <p className="welcome-sub">{libur ? "Hari Minggu — libur, alat menolak tap." : `Batas masuk hari ini pukul ${batasMasuk} WIB. Data diperbarui otomatis secara real-time.`}</p>
        </div>
        {!kepala && <Link className="primary-button" to={`${base}/siswa`}><Icon name="plus" size={18} /><span>Tambah siswa</span></Link>}
      </section>

      <section className="stats-grid">
        <article className="stat-card">
          <div className="stat-icon green"><Icon name="users" /></div>
          <div><p>Total siswa</p><strong>{s.total}</strong><span className="trend up">{s.izin} <small>izin / sakit / dispensasi hari ini</small></span></div>
        </article>
        <article className="stat-card">
          <div className="stat-icon teal"><Icon name="check" /></div>
          <div><p>Tepat waktu</p><strong>{s.hadir}</strong><span className="trend up">{pHadir}% <small>dari total siswa</small></span></div>
        </article>
        <article className="stat-card">
          <div className="stat-icon amber"><Icon name="clock" /></div>
          <div><p>Terlambat</p><strong>{s.telat}</strong><span className="trend warn">{pTelat}% <small>dari total siswa</small></span></div>
        </article>
        <article className="stat-card">
          <div className="stat-icon coral"><Icon name="warning" /></div>
          <div><p>{sudahLewat ? "Tidak hadir (Alpha)" : "Belum hadir"}</p><strong>{s.belum}</strong><span className="trend neutral">{pct(s.belum)}% <small>dari total siswa</small></span></div>
        </article>
      </section>

      <section className="dashboard-grid">
        <article className="panel attendance-panel">
          <div className="panel-header"><div><p className="panel-title">Kehadiran hari ini</p><span>Ringkasan seluruh kelas</span></div><Link className="ghost-button" to={`${base}/siswa`}>Lihat detail <Icon name="arrow" size={16} /></Link></div>
          <div className="attendance-content">
            <div className="donut" role="img" aria-label={`${masukPct} persen sudah masuk`}
              style={{ background: `conic-gradient(#2c9a70 0 ${pHadir}%, #d6a34d ${pHadir}% ${pHadir + pTelat}%, #6f93c4 ${pHadir + pTelat}% ${pHadir + pTelat + pIzin}%, #e7ebe8 ${pHadir + pTelat + pIzin}% 100%)` }}>
              <div><strong>{masukPct.toLocaleString("id-ID")}%</strong><span>Sudah masuk</span></div>
            </div>
            <div className="legend">
              <div><span className="legend-dot hadir" /><p><b>{s.hadir}</b><span>Tepat waktu</span></p></div>
              <div><span className="legend-dot terlambat" /><p><b>{s.telat}</b><span>Terlambat</span></p></div>
              <div><span className="legend-dot izin" /><p><b>{s.izin}</b><span>Izin / sakit / dispensasi</span></p></div>
              <div><span className="legend-dot belum" /><p><b>{s.belum}</b><span>{sudahLewat ? "Alpha" : "Belum hadir"}</span></p></div>
            </div>
          </div>
          <div className="sync-note"><Icon name="check" size={16} /><span>{s.pulang} siswa sudah tap pulang · {Object.keys(log).length} tap tercatat hari ini</span></div>
        </article>

        <article className="panel live-panel">
          <div className="panel-header"><div><p className="panel-title">Aktivitas terkini</p><span>Tap kartu terbaru</span></div><div className="live-label"><span /> LIVE</div></div>
          {feed.length === 0 ? (
            <Empty icon="card" title={ready ? "Belum ada tap hari ini" : "Memuat..."} text={libur ? "Hari libur" : "Tap kartu akan muncul di sini secara otomatis."} />
          ) : (
            <div className="activity-list">
              {feed.map((e) => (
                <div className="activity-row" key={e.key}>
                  <span className={`avatar ${toneOf(e.nis)}`}>{initials(e.nama ?? e.nis)}</span>
                  <div><b>{e.nama ?? "—"}</b><span>{e.kelas ?? "-"} · NIS {e.nis}</span></div>
                  <div className="activity-status"><StatusBadge status={e.status} />{e.manual && <span className="badge badge-ubah" title={`Dicatat manual: ${e.manual}`}>Manual · {e.manual}</span>}<time>{e.jam.slice(0, 5)}</time></div>
                </div>
              ))}
            </div>
          )}
        </article>
      </section>

      <section className="bottom-grid">
        <article className="panel class-panel">
          <div className="panel-header"><div><p className="panel-title">Kehadiran per kelas</p><span>Siswa yang sudah tap masuk hari ini</span></div></div>
          {Object.keys(s.perKelas).length === 0 ? <Empty icon="users" title="Belum ada data siswa" /> : (
            <div className="class-list">
              {Object.entries(s.perKelas).sort().map(([kelas, v]) => {
                const p = v.total ? Math.round((v.masuk / v.total) * 100) : 0;
                return (
                  <div className="class-row" key={kelas}>
                    <div><b>{kelas}</b><span>{v.masuk}/{v.total} siswa</span></div>
                    <div className="progress" role="progressbar" aria-valuenow={p} aria-valuemin={0} aria-valuemax={100} aria-label={kelas}><span style={{ width: `${p}%` }} /></div>
                    <strong>{p}%</strong>
                  </div>
                );
              })}
            </div>
          )}
        </article>
        <article className="panel system-panel">
          <div className="panel-header"><div><p className="panel-title">Status sistem</p><span>{device?.lastSeen ? `Laporan alat ${relatif(device.lastSeen, serverNow())}` : "Alat belum pernah melapor"}</span></div><Link className="ghost-button" to={kepala ? `${base}/alat` : `${base}/perangkat`}>Detail <Icon name="arrow" size={16} /></Link></div>
          <div className="system-list">
            <div><span className="system-icon"><Icon name="device" size={18} /></span><p><b>Pembaca RFID</b><small>ESP32-RFID-01 · {device?.firmware ?? "-"}</small></p><StatusBadge status={online ? (device?.rfid === false ? "Gangguan" : "Online") : "Offline"} /></div>
            <div><span className="system-icon"><Icon name="wifi" size={18} /></span><p><b>Koneksi WiFi</b><small>{device?.ssid ?? "-"} · {device?.rssi != null ? `${device.rssi} dBm` : "-"}</small></p><StatusBadge status={!online ? "Offline" : (device?.rssi ?? -100) > -70 ? "Stabil" : "Lemah"} /></div>
            <div><span className="system-icon"><Icon name="refresh" size={18} /></span><p><b>Antrian kirim</b><small>{device?.antrian ?? 0} antri · {device?.dead ?? 0} tertunda</small></p><StatusBadge status={(device?.antrian ?? 0) + (device?.dead ?? 0) > 0 ? "Antri" : "Aman"} /></div>
          </div>
        </article>
      </section>
    </>
  );
}
