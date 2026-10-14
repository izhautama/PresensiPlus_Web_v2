import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { get } from "firebase/database";
import Icon from "../components/Icon";
import { Spinner, StatusBadge } from "../components/ui";
import { batasJam, initials, kategori, persenWarna, rekap, rekapBulan, toneOf } from "../lib/attendance";
import {
  BULAN, addDays, formatTanggal, lastDayOfMonth, monthKey, monthLabel, namaHari, tahunAjaran, todayWIB, weekday,
} from "../lib/time";
import { daftarRecord, labelTa, levelDari, poinBertanda, ringkas, urutLevel, type DiscRecord, type Level } from "../lib/discipline";
import { KODE_LABEL, type LessonsSiswa } from "../lib/perjam";
import type { DayRecord, Kategori, ScheduleRow } from "../lib/types";
import { gabungRec, type ManualTapAnak } from "../lib/manual";
import { logout } from "../services/auth";
import { r } from "../services/db";
import { bacaSekali } from "../services/koneksi";

type Disiplin = { records: Record<string, DiscRecord>; levels: Record<string, Level> };
type PerJamData = { jam: Record<string, Record<string, LessonsSiswa>>; alfa: Record<string, { status: "Alfa" }> };
/** manualDipakai: tanggal -> alasan, hanya bila presensi manual DIPAKAI (tidak ada tap alat pada bagian itu) */
type Data = { profil: { nama: string; kelas: string }; records: Record<string, DayRecord>; manualDipakai: Record<string, string>; schedule: ScheduleRow[]; disiplin: Disiplin; perJam: PerJamData };

const LABEL: Partial<Record<Kategori, string>> = { Hadir: "Tepat waktu", Alpha: "Tanpa keterangan", "Belum Tap": "Belum tap" };

export default function StudentPage() {
  const { nis = "" } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState<Data | null>(null);
  const [err, setErr] = useState("");
  const [updated, setUpdated] = useState<Date | null>(null);
  const [ta, setTa] = useState<number | null>(null);
  const [mode, setMode] = useState<"minggu" | "bulan">("minggu");

  // get() sekali + refresh berkala; koneksi realtime DITUTUP (goOffline) di antara pembacaan: batas 100 koneksi serentak paket gratis
  const muat = useCallback(async () => {
    try {
      // Data kedisiplinan bersifat tambahan: gagal memuat tidak boleh merusak halaman presensi
      const [p, a, s, dr, dl, lj, va, mn] = await bacaSekali(() => Promise.all([
        get(r(`profiles/${nis}`)), get(r(`attendance/${nis}`)), get(r("config/schedule")),
        get(r(`discipline/records/${nis}`)).catch(() => null), get(r("discipline/levels")).catch(() => null),
        get(r(`lessonsByStudent/${nis}`)).catch(() => null), get(r(`validasiByStudent/${nis}`)).catch(() => null),
        get(r(`manualTapByStudent/${nis}`)).catch(() => null),
      ]));
      if (!p.exists()) { setErr("Data siswa tidak ditemukan. Hubungi TU sekolah."); return; }
      // presensi manual digabung dengan data alat lewat fungsi tunggal (alat menang)
      const alat = (a.val() ?? {}) as Record<string, DayRecord>;
      const manual = (mn?.val() ?? {}) as Record<string, ManualTapAnak>;
      const records: Record<string, DayRecord> = { ...alat };
      const manualDipakai: Record<string, string> = {};
      for (const [tgl, m] of Object.entries(manual)) {
        const g = gabungRec(alat[tgl], m);
        if (g) { records[tgl] = g; if (g !== alat[tgl] && (m.masuk && !alat[tgl]?.status ? true : Boolean(m.pulang && !alat[tgl]?.pulang))) manualDipakai[tgl] = m.alasan; }
      }
      setData({ profil: p.val(), records, manualDipakai, schedule: Object.values(s.val() ?? {}) as ScheduleRow[], disiplin: { records: dr?.val() ?? {}, levels: dl?.val() ?? {} }, perJam: { jam: lj?.val() ?? {}, alfa: va?.val() ?? {} } });
      setUpdated(new Date());
      setErr("");
    } catch (e) {
      const code = (e as { code?: string }).code ?? "";
      setErr(code.includes("permission") ? "Akses ditolak. PIN mungkin telah diganti — silakan login ulang." : "Gagal memuat data. Periksa koneksi internet.");
    }
  }, [nis]);

  useEffect(() => {
    muat();
    const t = window.setInterval(() => document.visibilityState === "visible" && muat(), 60000);
    const onVis = () => document.visibilityState === "visible" && muat();
    document.addEventListener("visibilitychange", onVis);
    return () => { window.clearInterval(t); document.removeEventListener("visibilitychange", onVis); };
  }, [muat]);

  const keluar = async () => { await logout(); navigate("/login", { replace: true }); };

  if (err && !data) {
    return (
      <main className="student-page">
        <Header onLogout={keluar} />
        <section className="student-content"><div className="notice warn"><Icon name="warning" size={17} /><span>{err}</span></div></section>
      </main>
    );
  }
  if (!data) return <div className="route-loader"><Spinner dark /></div>;
  return <Portal nis={nis} data={data} updated={updated} onRefresh={muat} onLogout={keluar} ta={ta} setTa={setTa} mode={mode} setMode={setMode} />;
}

function Header({ onLogout, nama, nis }: { onLogout: () => void; nama?: string; nis?: string }) {
  return (
    <header className="student-header no-print">
      <div className="login-logo">
        <div className="brand-mark"><span>NH</span></div>
        <div><p className="brand-name">Presensi<span>+</span></p><p className="brand-school">MA Nurul Huda</p></div>
      </div>
      <div className="student-header-right">
        {nama && <div className="student-chip"><span className={`avatar ${toneOf(nis ?? "")}`}>{initials(nama)}</span><span><b>{nama}</b><small>NIS {nis}</small></span></div>}
        <Link className="student-logout" to="/panduan"><Icon name="file" size={17} />Panduan</Link>
        <button className="student-logout" onClick={onLogout}><Icon name="logout" size={17} />Keluar</button>
      </div>
    </header>
  );
}

function Portal({ nis, data, updated, onRefresh, onLogout, ta, setTa, mode, setMode }: {
  nis: string; data: Data; updated: Date | null; onRefresh: () => void; onLogout: () => void;
  ta: number | null; setTa: (n: number) => void; mode: "minggu" | "bulan"; setMode: (m: "minggu" | "bulan") => void;
}) {
  const { profil, records, manualDipakai, schedule, disiplin, perJam } = data;
  const today = todayWIB();
  const now = new Date();
  const hari = namaHari(today);
  const batas = batasJam(schedule, profil.kelas, hari);
  const recToday = records[today];
  const kToday = kategori(recToday, today, schedule, profil.kelas, now);
  const ym = monthKey(today);
  const bulanIni = rekapBulan(records, ym, schedule, profil.kelas, now);

  const taNow = tahunAjaran(today);
  const taOpsi = useMemo(() => [...new Set([taNow, ...Object.keys(records).map(tahunAjaran)])].sort((a, b) => b - a), [records, taNow]);
  const taPilih = ta ?? taNow;

  const tahunan = useMemo(() => {
    const out: { ym: string; r: ReturnType<typeof rekap> }[] = [];
    for (let i = 0; i < 12; i++) {
      const y = i < 6 ? taPilih : taPilih + 1;
      const m = i < 6 ? 7 + i : i - 5;
      const key = `${y}-${String(m).padStart(2, "0")}`;
      if (key > ym) break;
      out.push({ ym: key, r: rekapBulan(records, key, schedule, profil.kelas, now) });
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [records, schedule, profil.kelas, taPilih, ym]);
  const totalTa = tahunan.reduce((t, x) => ({ h: t.h + x.r.Hadir + x.r.Terlambat + x.r.Dispensasi, e: t.e + x.r.Efektif }), { h: 0, e: 0 });

  // Grafik minggu ini: jam masuk Senin–Sabtu
  const senin = addDays(today, -((weekday(today) + 6) % 7));
  const minggu = Array.from({ length: 6 }, (_, i) => {
    const d = addDays(senin, i);
    return { d, hari: namaHari(d).slice(0, 3), rec: records[d], k: kategori(records[d], d, schedule, profil.kelas, now) };
  });
  // Grafik bulan ini: per minggu
  const perMinggu: { label: string; tepat: number; telat: number; tidak: number }[] = [];
  for (let d = `${ym}-01`, ke = 1; d <= lastDayOfMonth(ym); ke++) {
    const akhir = [addDays(d, 6 - ((weekday(d) + 6) % 7)), lastDayOfMonth(ym)].sort()[0];
    const x = rekap(records, d, akhir, schedule, profil.kelas, now);
    perMinggu.push({ label: `Mg ${ke}`, tepat: x.Hadir + x.Dispensasi, telat: x.Terlambat, tidak: x.Izin + x.Sakit + x.Alpha }); // dispensasi dihitung hadir
    d = addDays(akhir, 1);
  }
  const maxMinggu = Math.max(6, ...perMinggu.map((x) => x.tepat + x.telat + x.tidak));

  const selisih = (() => {
    if (!recToday?.masuk) return null;
    const toM = (s: string) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3, 5));
    return toM(batas.Masuk[1]) - toM(recToday.masuk);
  })();

  const riwayat = Object.entries(records).filter(([d]) => d <= today).sort((a, b) => b[0].localeCompare(a[0])).slice(0, 10);

  return (
    <main className="student-page">
      <Header onLogout={onLogout} nama={profil.nama} nis={nis} />
      <section className="student-content">
        <div className="parent-hero no-print">
          <div>
            <span className="hero-chip">Tahun Ajaran {taNow}/{taNow + 1}</span>
            <p>{profil.nama}</p>
            <small>Kelas {profil.kelas} · NIS {nis}</small>
          </div>
          <div className="hero-date">
            <span>Hari ini</span>
            <b>{formatTanggal(today)}</b>
            <button onClick={onRefresh}><Icon name="refresh" size={14} />Diperbarui {updated?.toLocaleTimeString("id-ID", { timeZone: "Asia/Jakarta", hour: "2-digit", minute: "2-digit" })}</button>
          </div>
        </div>

        <h2 className="section-title no-print"><Icon name="clock" size={18} />Status presensi hari ini</h2>
        <div className="today-grid no-print">
          <article className="today-card">
            <div className="today-head"><span>Tap kartu masuk</span><StatusBadge status={LABEL[kToday] ?? kToday} /></div>
            {manualDipakai[today] && <p className="muted small" data-testid="ortu-manual-hari-ini">Hadir (dicatat manual: {manualDipakai[today]})</p>}
            <div className="today-main"><span className="today-icon green"><Icon name="arrow" /></span><div><strong>{recToday?.masuk ? `${recToday.masuk.slice(0, 5)} WIB` : "--:--"}</strong><small>{kToday === "Libur" ? "Hari Minggu — libur" : recToday?.ket ? `Tercatat ${recToday.ket}${recToday.catatan ? ` · ${recToday.catatan}` : ""}` : recToday?.masuk ? (manualDipakai[today] ? `Dicatat manual (${manualDipakai[today]})` : "Tap kartu RFID tercatat") : kToday === "Alpha" ? "Tidak ada tap masuk hari ini" : "Menunggu tap kartu"}</small></div></div>
            <div className="today-foot"><span>{kToday === "Libur" ? "Libur" : `Batas masuk ${batas.Masuk[1]} WIB`}</span>{selisih != null && <b className={selisih >= 0 ? "good" : "warn"}>{selisih >= 0 ? `${selisih} menit sebelum batas` : `Terlambat ${-selisih} menit`}</b>}</div>
          </article>
          <article className="today-card">
            <div className="today-head"><span>Tap kartu pulang</span><StatusBadge status={kToday === "Libur" ? "Libur" : recToday?.pulang ? "Pulang" : "Belum tap"} /></div>
            <div className="today-main"><span className="today-icon blue"><Icon name="logout" /></span><div><strong>{recToday?.pulang ? `${recToday.pulang.slice(0, 5)} WIB` : "--:--"}</strong><small>{recToday?.pulang ? "Tap kartu RFID tercatat" : kToday === "Libur" ? "Hari Minggu — libur" : "Menunggu jam kepulangan"}</small></div></div>
            <div className="today-foot"><span>{kToday === "Libur" ? "Libur" : `Jadwal pulang ${batas.Pulang[0]}–${batas.Pulang[1]} WIB`}</span></div>
          </article>
        </div>

        <h2 className="section-title no-print"><Icon name="grid" size={18} />Rekap {monthLabel(ym)}</h2>
        <div className="recap-grid no-print">
          <article className="panel recap-card">
            <p className="panel-title">{bulanIni.Efektif} hari efektif</p>
            {([["Tepat waktu", bulanIni.Hadir, "hadir"], ["Terlambat", bulanIni.Terlambat, "terlambat"], ["Dispensasi (dihitung hadir)", bulanIni.Dispensasi, "hadir"], ["Izin / sakit", bulanIni.Izin + bulanIni.Sakit, "izin"], ["Tanpa keterangan", bulanIni.Alpha, "alpha"]] as const).map(([l, n, c]) => (
              <div className="recap-row" key={l}><span className={`legend-dot ${c}`} /><span>{l}</span><b>{n} hari</b></div>
            ))}
            <div className="recap-total">Persentase kehadiran <b className={`pct pct-${persenWarna(bulanIni.Persen)}`}>{bulanIni.Persen == null ? "-" : `${bulanIni.Persen}%`}</b></div>
          </article>
          <article className="panel chart-card">
            <div className="panel-header">
              <div><p className="panel-title">{mode === "minggu" ? "Jam masuk minggu ini" : "Kehadiran per minggu"}</p><span>{mode === "minggu" ? "Semakin pendek batang = semakin pagi" : monthLabel(ym)}</span></div>
              <div className="chip-group small">
                <button className={mode === "minggu" ? "active" : ""} onClick={() => setMode("minggu")}>Mingguan</button>
                <button className={mode === "bulan" ? "active" : ""} onClick={() => setMode("bulan")}>Bulanan</button>
              </div>
            </div>
            {mode === "minggu" ? (
              <div className="bar-chart" role="img" aria-label="Grafik jam masuk minggu ini">
                {minggu.map((x) => {
                  const m = x.rec?.masuk ? Number(x.rec.masuk.slice(0, 2)) * 60 + Number(x.rec.masuk.slice(3, 5)) : null;
                  const h = m == null ? 0 : Math.min(100, Math.max(8, ((m - 360) / 120) * 100)); // skala 06:00–08:00
                  return (
                    <div className="bar-col" key={x.d} title={`${namaHari(x.d)}: ${x.rec?.masuk?.slice(0, 5) ?? x.k}`}>
                      <span className="bar-val">{x.rec?.masuk?.slice(0, 5) ?? (x.k === "Mendatang" ? "" : x.k === "Izin" || x.k === "Sakit" || x.k === "Dispensasi" ? x.k : "—")}</span>
                      <div className="bar-track"><span className={`bar ${x.k === "Terlambat" ? "warn" : "good"}`} style={{ height: `${h}%` }} /></div>
                      <span className={`bar-label ${x.d === today ? "today" : ""}`}>{x.hari}</span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="bar-chart" role="img" aria-label="Grafik kehadiran per minggu">
                {perMinggu.map((x) => (
                  <div className="bar-col" key={x.label} title={`${x.label}: ${x.tepat} tepat, ${x.telat} telat, ${x.tidak} tidak hadir`}>
                    <span className="bar-val">{x.tepat + x.telat}/{x.tepat + x.telat + x.tidak}</span>
                    <div className="bar-track stack">
                      <span className="bar bad" style={{ height: `${(x.tidak / maxMinggu) * 100}%` }} />
                      <span className="bar warn" style={{ height: `${(x.telat / maxMinggu) * 100}%` }} />
                      <span className="bar good" style={{ height: `${(x.tepat / maxMinggu) * 100}%` }} />
                    </div>
                    <span className="bar-label">{x.label}</span>
                  </div>
                ))}
              </div>
            )}
            <div className="chart-legend"><span><i className="good" />Tepat waktu</span><span><i className="warn" />Terlambat</span>{mode === "bulan" && <span><i className="bad" />Tidak hadir</span>}</div>
          </article>
        </div>

        <section className="panel yearly">
          <div className="print-only print-head">
            <p>Rekap Presensi — MA Nurul Huda Mergosono</p>
            <span>{profil.nama} · NIS {nis} · Kelas {profil.kelas} · Tahun Ajaran {taPilih}/{taPilih + 1}</span>
          </div>
          <div className="panel-header">
            <div><p className="panel-title">Rekap tahunan</p><span>Per bulan, tahun ajaran Juli–Juni · hari efektif Senin–Sabtu</span></div>
            <div className="heading-actions no-print">
              <select className="text-input auto" value={taPilih} onChange={(e) => setTa(Number(e.target.value))} aria-label="Tahun ajaran">
                {taOpsi.map((t) => <option key={t} value={t}>TA {t}/{t + 1}</option>)}
              </select>
              <button className="primary-button" onClick={() => window.print()}><Icon name="printer" size={15} />Unduh PDF</button>
            </div>
          </div>
          <div className="table-scroll">
            <table className="year-table">
              <thead><tr><th>Bulan</th><th>Efektif</th><th>Tepat</th><th>Terlambat</th><th>Izin/Sakit</th><th>Disp.</th><th>Alpha</th><th>%</th></tr></thead>
              <tbody>
                {tahunan.length === 0 ? <tr><td colSpan={8} className="muted">Belum ada data</td></tr> : tahunan.map(({ ym: k, r: x }) => (
                  <tr key={k}>
                    <td><b>{BULAN[Number(k.slice(5)) - 1]} {k.slice(0, 4)}</b></td><td>{x.Efektif}</td>
                    <td className="good">{x.Hadir}</td><td className="warn">{x.Terlambat}</td><td>{x.Izin + x.Sakit}</td><td className="good">{x.Dispensasi}</td>
                    <td className={x.Alpha ? "bad" : ""}>{x.Alpha}</td>
                    <td><span className={`pct pct-${persenWarna(x.Persen)}`}>{x.Persen == null ? "-" : `${x.Persen}%`}</span></td>
                  </tr>
                ))}
              </tbody>
              {tahunan.length > 0 && <tfoot><tr><td>Total</td><td>{totalTa.e}</td><td colSpan={5} /><td><b>{totalTa.e ? `${Math.round((totalTa.h / totalTa.e) * 1000) / 10}%` : "-"}</b></td></tr></tfoot>}
            </table>
          </div>
          <p className="caption-text">% = (Tepat + Terlambat + Dispensasi) ÷ hari efektif. Dispensasi = mewakili sekolah, dihitung hadir. Alpha = tidak tap masuk & tidak ada keterangan izin/sakit dari sekolah.</p>
        </section>

        <KehadiranPerJam data={perJam} today={today} />

        <Kedisiplinan disiplin={disiplin} ta={`${taPilih}-${taPilih + 1}`} />

        <section className="panel no-print">
          <div className="panel-header"><div><p className="panel-title">Riwayat terbaru</p><span>10 hari tercatat terakhir</span></div></div>
          {riwayat.length === 0 ? <p className="muted small">Belum ada riwayat.</p> : (
            <div className="simple-list">
              {riwayat.map(([d, x]) => (
                <div key={d}><b>{formatTanggal(d)}</b><small>{x.masuk ? `Masuk ${x.masuk.slice(0, 5)}` : x.ket ?? ""}{manualDipakai[d] ? ` (dicatat manual: ${manualDipakai[d]})` : ""}{x.pulang ? ` · Pulang ${x.pulang.slice(0, 5)}` : ""}</small><StatusBadge status={LABEL[(x.status ?? x.ket ?? "Alpha") as Kategori] ?? x.status ?? x.ket ?? "Alpha"} /></div>
              ))}
            </div>
          )}
        </section>
      </section>
    </main>
  );
}

/** Ringkasan kedisiplinan anak: saldo poin, level, dan riwayat. Tanpa catatan internal, pencatat, atau item terhapus. */
function Kedisiplinan({ disiplin, ta }: { disiplin: Disiplin; ta: string }) {
  const r = ringkas(disiplin.records, ta);
  const levels = urutLevel(disiplin.levels);
  const { sekarang, berikut } = levelDari(r.saldo, levels);
  const daftar = daftarRecord(disiplin.records, undefined, ta, false);
  return (
    <section className="panel no-print">
      <div className="panel-header"><div><p className="panel-title">Kedisiplinan</p><span>{labelTa(ta)} · poin pelanggaran dikurangi remisi</span></div></div>
      <div className="disc-summary">
        <div><span>Pelanggaran</span><b>{r.pel}</b></div>
        <div><span>Remisi</span><b>−{r.rem}</b></div>
        <div className="strong"><span>Saldo poin</span><b>{r.saldo}</b></div>
      </div>
      <div className="disc-level">
        <StatusBadge status={sekarang || r.sangatBerat ? "Perlu tindak lanjut" : "Aman"} />
        <span>{sekarang ? sekarang[1].tindakan : r.sangatBerat ? "Ada pelanggaran kategori Sangat Berat." : "Tidak ada tindak lanjut."}</span>
        {berikut && <small>Ambang berikutnya: {berikut[1].poin} poin</small>}
      </div>
      {daftar.length === 0 ? <p className="muted small">Belum ada catatan pelanggaran atau remisi.</p> : (
        <div className="disc-list">
          {daftar.map(({ id, rec: x }) => (
            <article key={id} className={`disc-item ${x.jenis}`}>
              <div className="disc-point">{poinBertanda(x) > 0 ? "+" : "−"}{x.poin}</div>
              <div className="disc-body">
                <b>{x.nama}</b>
                <small>{formatTanggal(x.tanggal, false)} · {x.kategori ?? (x.jenis === "remisi" ? "Remisi" : "Pelanggaran")}</small>
                {x.takziran && <small className="takziran">Takziran: {x.takziran}</small>}
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

/** Ketidakhadiran per jam pelajaran (14 hari terakhir) dan Alfa yang sudah diverifikasi sekolah. */
function KehadiranPerJam({ data, today }: { data: PerJamData; today: string }) {
  const batas = addDays(today, -14);
  const tanggal = [...new Set([...Object.keys(data.jam), ...Object.keys(data.alfa)])].filter((d) => d >= batas && d <= today).sort().reverse();
  if (tanggal.length === 0) return null;
  return (
    <section className="panel no-print">
      <div className="panel-header"><div><p className="panel-title">Ketidakhadiran per jam &amp; Alfa terverifikasi</p><span>14 hari terakhir · dicatat oleh Waka Kesiswaan</span></div></div>
      <div className="simple-list">
        {tanggal.map((d) => {
          const jam = Object.entries(data.jam[d] ?? {}).sort((a, b) => Number(a[0]) - Number(b[0]));
          return (
            <div key={d}>
              <b>{formatTanggal(d)}</b>
              <small>
                {data.alfa[d] ? "Tidak masuk sekolah tanpa keterangan. " : ""}
                {jam.map(([j, x]) => `Jam ke-${j}${x.mapel ? ` (${x.mapel})` : ""}: ${KODE_LABEL[x.k] ?? x.k}`).join(" · ")}
              </small>
              {data.alfa[d] && <StatusBadge status="Alfa (terverifikasi)" />}
            </div>
          );
        })}
      </div>
    </section>
  );
}
