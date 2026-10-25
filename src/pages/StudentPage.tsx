import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { endAt, get, orderByKey, query, startAt } from "firebase/database";
import Icon from "../components/Icon";
import { Spinner, StatusBadge } from "../components/ui";
import { batasJam, initials, persenWarna, toneOf } from "../lib/attendance";
import { rekapSiswa, type BarisHari, type PetaHari, type RekapSiswa } from "../lib/hariEfektif";
import {
  BULAN, addDays, formatTanggal, lastDayOfMonth, monthKey, monthLabel, namaHari, tahunAjaran, todayWIB, weekday,
} from "../lib/time";
import { daftarRecord, labelTa, levelDari, poinBertanda, ringkas, urutLevel, type DiscRecord, type Level } from "../lib/discipline";
import { KODE_LABEL, type LessonsSiswa } from "../lib/perjam";
import type { DayRecord, Kategori, ScheduleRow } from "../lib/types";
import type { ManualTapAnak } from "../lib/manual";
import type { PembinaanOrtu } from "../lib/pembinaan";
import { logout } from "../services/auth";
import { waktuServer } from "../services/aktivitas";
import { r } from "../services/db";
import { bacaSekali } from "../services/koneksi";

type Disiplin = { records: Record<string, DiscRecord>; levels: Record<string, Level>; pembinaan: Record<string, Record<string, PembinaanOrtu>> };
type PerJamData = { jam: Record<string, Record<string, LessonsSiswa>>; alfa: Record<string, { status: "Alfa" }> };
/** `alat` = attendance/{nis} MENTAH (tap alat + keterangan); `manual` = salinan presensi manual; `hariEfektif` = kalenderEfektif (agregat, tanpa data siswa).
 *  Semua rekap memakai SATU rumus: rekapSiswa() (lib/hariEfektif.ts). */
type Data = { profil: { nama: string; kelas: string; aktifSejak?: string }; alat: Record<string, DayRecord>; manual: Record<string, ManualTapAnak>; hariEfektif: PetaHari; schedule: ScheduleRow[]; disiplin: Disiplin; perJam: PerJamData; validasi: Record<string, { status: "Alfa" }> };

const LABEL: Partial<Record<Kategori, string>> = { Hadir: "Tepat waktu", Alpha: "Tanpa keterangan", "Belum Tap": "Belum tap" };

/**
 * Portal siswa. `embedded` = dipakai di dalam panel wali kelas (tanpa header portal/Keluar); `ekstra` = bagian tambahan khusus wali
 * (catatan internal, pembinaan). Orang tua melihat pembinaan HANYA bila diizinkan waka/kepala per level: mode ringkas (status + tanggal) atau lengkap; tanpa nama pembina.
 */
export default function StudentPage({ embedded = false, ekstra }: { embedded?: boolean; ekstra?: (nis: string, profil: { nama: string; kelas: string }) => ReactNode } = {}) {
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
      const mulaiTa = `${tahunAjaran(todayWIB(new Date(waktuServer()))) - 1}-07-01`; // dua tahun ajaran terakhir cukup untuk rekap & pilihan TA
      const [p, a, s, dr, dl, lj, va, mn, he, ps] = await bacaSekali(() => Promise.all([
        get(r(`profiles/${nis}`)), get(r(`attendance/${nis}`)), get(r("config/schedule")),
        get(r(`discipline/records/${nis}`)).catch(() => null), get(r("discipline/levels")).catch(() => null),
        get(r(`lessonsByStudent/${nis}`)).catch(() => null), get(r(`validasiByStudent/${nis}`)).catch(() => null),
        get(r(`manualTapByStudent/${nis}`)).catch(() => null),
        get(query(r("kalenderEfektif"), orderByKey(), startAt(mulaiTa), endAt(todayWIB(new Date(waktuServer()))))).catch(() => null),
        get(r(`pembinaanOrtu/${nis}`)).catch(() => null), // v2.5: hanya yang DIIZINKAN waka/kepala (bawaan: tersembunyi)
      ]));
      if (!p.exists()) { setErr("Data siswa tidak ditemukan. Hubungi TU sekolah."); return; }
      setData({
        profil: p.val(), alat: (a.val() ?? {}) as Record<string, DayRecord>, manual: (mn?.val() ?? {}) as Record<string, ManualTapAnak>,
        hariEfektif: (he?.val() ?? {}) as PetaHari, schedule: Object.values(s.val() ?? {}) as ScheduleRow[],
        disiplin: { records: dr?.val() ?? {}, levels: dl?.val() ?? {}, pembinaan: ps?.val() ?? {} }, perJam: { jam: lj?.val() ?? {}, alfa: va?.val() ?? {} },
        validasi: (va?.val() ?? {}) as Record<string, { status: "Alfa" }>,
      });
      setUpdated(new Date());
      setErr("");
    } catch (e) {
      const code = `${(e as { code?: string }).code ?? ""} ${(e as Error).message ?? ""}`.toLowerCase();
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
        {!embedded && <Header onLogout={keluar} />}
        <section className="student-content"><div className="notice warn"><Icon name="warning" size={17} /><span>{err}</span></div></section>
      </main>
    );
  }
  if (!data) return <div className="route-loader"><Spinner dark /></div>;
  return <Portal nis={nis} data={data} updated={updated} onRefresh={muat} onLogout={keluar} ta={ta} setTa={setTa} mode={mode} setMode={setMode} embedded={embedded} ekstra={ekstra} />;
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

function Portal({ nis, data, updated, onRefresh, onLogout, ta, setTa, mode, setMode, embedded, ekstra }: {
  nis: string; data: Data; updated: Date | null; onRefresh: () => void; onLogout: () => void; embedded: boolean; ekstra?: (nis: string, profil: { nama: string; kelas: string }) => ReactNode;
  ta: number | null; setTa: (n: number) => void; mode: "minggu" | "bulan"; setMode: (m: "minggu" | "bulan") => void;
}) {
  const { profil, alat, manual, hariEfektif, schedule, disiplin, perJam, validasi } = data;
  // tanggal menurut SERVER (staf/wali: selisih sudah diketahui; portal orang tua tanpa koneksi realtime: selisih 0 = jam perangkat)
  const now = new Date(waktuServer());
  const today = todayWIB(now);
  const hari = namaHari(today);
  const batas = batasJam(schedule, profil.kelas, hari);
  // SATU rumus untuk semua tampilan: hari efektif berbasis bukti (kalenderEfektif) + data alat/manual/izin siswa ini
  const hit = (awal: string, akhir: string): RekapSiswa => rekapSiswa({ hariEfektif, attendance: alat, manualTap: manual, validasi, schedule, kelas: profil.kelas, aktifSejak: profil.aktifSejak, awal, akhir, now });
  const rowToday: BarisHari = hit(today, today).hari[0];
  const recToday = { masuk: rowToday?.masuk, pulang: rowToday?.pulang, ket: rowToday?.ket, catatan: rowToday?.catatan };
  const manualToday = rowToday?.manualAlasan;
  // kToday: kategori tampilan kartu hari ini. Hari tanpa kegiatan presensi (libur/alat belum merekam) = "Libur", bukan Alpha.
  const kToday: Kategori = rowToday?.kategori === "BelumTap" ? "Belum Tap" : rowToday?.kategori === "TidakEfektif" || !rowToday ? "Libur" : (rowToday.kategori as Kategori);
  const tanpaKegiatan = kToday === "Libur";
  const ym = monthKey(today);
  const bulanIni = hit(`${ym}-01`, lastDayOfMonth(ym));

  const taNow = tahunAjaran(today);
  const taOpsi = useMemo(() => [...new Set([taNow, ...Object.keys(alat).map(tahunAjaran)])].sort((a, b) => b - a), [alat, taNow]);
  const taPilih = ta ?? taNow;

  const tahunan = useMemo(() => {
    const out: { ym: string; r: RekapSiswa }[] = [];
    for (let i = 0; i < 12; i++) {
      const y = i < 6 ? taPilih : taPilih + 1;
      const m = i < 6 ? 7 + i : i - 5;
      const key = `${y}-${String(m).padStart(2, "0")}`;
      if (key > ym) break;
      out.push({ ym: key, r: rekapSiswa({ hariEfektif, attendance: alat, manualTap: manual, validasi, schedule, kelas: profil.kelas, aktifSejak: profil.aktifSejak, awal: `${key}-01`, akhir: lastDayOfMonth(key), now }) });
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alat, manual, hariEfektif, validasi, schedule, profil.kelas, profil.aktifSejak, taPilih, ym]);
  // TOTAL = jumlah semua kolom; persen dihitung dari total (bukan rata-rata persen bulan)
  const totalTa = tahunan.reduce((t, x) => ({ h: t.h + x.r.Hadir + x.r.Terlambat + x.r.Dispensasi, e: t.e + x.r.Efektif, hs: t.hs + x.r.HariSekolah, tepat: t.tepat + x.r.Hadir, telat: t.telat + x.r.Terlambat, iz: t.iz + x.r.Izin + x.r.Sakit, disp: t.disp + x.r.Dispensasi, alpha: t.alpha + x.r.Alpha }), { h: 0, e: 0, hs: 0, tepat: 0, telat: 0, iz: 0, disp: 0, alpha: 0 });

  // Grafik minggu ini: jam masuk Senin–Sabtu (hari tanpa kegiatan = "—")
  const senin = addDays(today, -((weekday(today) + 6) % 7));
  const mingguHit = hit(senin, addDays(senin, 5));
  const minggu = Array.from({ length: 6 }, (_, i) => {
    const d = addDays(senin, i);
    const b = mingguHit.hari.find((x) => x.tanggal === d);
    const k: string = d > today ? "Mendatang" : !b || b.kategori === "TidakEfektif" ? "Libur" : b.kategori === "BelumTap" ? "Belum Tap" : b.kategori;
    return { d, hari: namaHari(d).slice(0, 3), rec: { masuk: b?.masuk }, k };
  });
  // Grafik bulan ini: per minggu; penyebut = hari efektif minggu itu (minggu tanpa hari efektif tampil "–")
  const perMinggu: { label: string; tepat: number; telat: number; tidak: number; efektif: number }[] = [];
  for (let d = `${ym}-01`, ke = 1; d <= lastDayOfMonth(ym); ke++) {
    const akhir = [addDays(d, 6 - ((weekday(d) + 6) % 7)), lastDayOfMonth(ym)].sort()[0];
    const x = hit(d, akhir);
    perMinggu.push({ label: `Mg ${ke}`, tepat: x.Hadir + x.Dispensasi, telat: x.Terlambat, tidak: x.Izin + x.Sakit + x.Alpha, efektif: x.Efektif }); // dispensasi dihitung hadir
    d = addDays(akhir, 1);
  }
  const maxMinggu = Math.max(6, ...perMinggu.map((x) => x.tepat + x.telat + x.tidak));

  const selisih = (() => {
    if (!recToday?.masuk) return null;
    const toM = (s: string) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3, 5));
    return toM(batas.Masuk[1]) - toM(recToday.masuk);
  })();

  // Riwayat: 10 hari kalender terakhir (s.d. hari ini). Hari tanpa kegiatan presensi TIDAK tampil sebagai Alpha.
  const riwayat = hit(addDays(today, -9), today).hari.slice().reverse();

  return (
    <main className="student-page">
      {!embedded && <Header onLogout={onLogout} nama={profil.nama} nis={nis} />}
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
            {manualToday && <p className="muted small" data-testid="ortu-manual-hari-ini">Hadir (dicatat manual: {manualToday})</p>}
            <div className="today-main"><span className="today-icon green"><Icon name="arrow" /></span><div><strong>{recToday?.masuk ? `${recToday.masuk.slice(0, 5)} WIB` : "--:--"}</strong><small>{tanpaKegiatan ? (weekday(today) === 0 ? "Hari Minggu — libur" : "Libur / tidak ada kegiatan presensi hari ini") : recToday?.ket && !recToday?.masuk ? `Tercatat ${recToday.ket}${recToday.catatan ? ` · ${recToday.catatan}` : ""}` : recToday?.masuk ? (manualToday ? `Dicatat manual (${manualToday})` : "Tap kartu RFID tercatat") : kToday === "Alpha" ? "Tidak ada tap masuk hari ini" : "Menunggu tap kartu"}</small></div></div>
            <div className="today-foot"><span>{tanpaKegiatan ? "Libur" : `Batas masuk ${batas.Masuk[1]} WIB`}</span>{selisih != null && <b className={selisih >= 0 ? "good" : "warn"}>{selisih >= 0 ? `${selisih} menit sebelum batas` : `Terlambat ${-selisih} menit`}</b>}</div>
          </article>
          <article className="today-card">
            <div className="today-head"><span>Tap kartu pulang</span><StatusBadge status={tanpaKegiatan ? "Libur" : recToday?.pulang ? "Pulang" : "Belum tap"} /></div>
            <div className="today-main"><span className="today-icon blue"><Icon name="logout" /></span><div><strong>{recToday?.pulang ? `${recToday.pulang.slice(0, 5)} WIB` : "--:--"}</strong><small>{recToday?.pulang ? "Tap kartu RFID tercatat" : tanpaKegiatan ? "Libur / tidak ada kegiatan presensi" : "Menunggu jam kepulangan"}</small></div></div>
            <div className="today-foot"><span>{tanpaKegiatan ? "Libur" : `Jadwal pulang ${batas.Pulang[0]}–${batas.Pulang[1]} WIB`}</span></div>
          </article>
        </div>

        <h2 className="section-title no-print"><Icon name="grid" size={18} />Rekap {monthLabel(ym)}</h2>
        <div className="recap-grid no-print">
          <article className="panel recap-card">
            <p className="panel-title" data-testid="hari-efektif-ke">{bulanIni.HariSekolah === 0 ? "Belum ada hari efektif bulan ini" : `Hari efektif ke-${bulanIni.HariSekolah}`}</p>
            <small className="muted block">{bulanIni.HariSekolah === 0 ? "Belum ada kegiatan presensi yang tercatat bulan ini." : `dari ${bulanIni.HariSekolah} hari efektif bulan ini`}</small>
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
                  <div className="bar-col" key={x.label} title={x.efektif === 0 ? `${x.label}: tidak ada hari efektif` : `${x.label}: ${x.tepat} tepat, ${x.telat} telat, ${x.tidak} tidak hadir`}>
                    <span className="bar-val">{x.efektif === 0 ? "–" : `${x.tepat + x.telat}/${x.efektif}`}</span>
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
            <div><p className="panel-title">Rekap tahunan</p><span>Per bulan, tahun ajaran Juli–Juni · hanya hari yang benar-benar ada kegiatan presensi</span></div>
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
                    <td><b>{BULAN[Number(k.slice(5)) - 1]} {k.slice(0, 4)}</b></td>
                    {x.HariSekolah === 0 ? <td colSpan={7} className="muted" data-testid={`bulan-kosong-${k}`}>Belum ada kegiatan presensi</td> : (
                      <>
                        <td>{x.Efektif}</td>
                        <td className="good">{x.Hadir}</td><td className="warn">{x.Terlambat}</td><td>{x.Izin + x.Sakit}</td><td className="good">{x.Dispensasi}</td>
                        <td className={x.Alpha ? "bad" : ""}>{x.Alpha}</td>
                        <td><span className={`pct pct-${persenWarna(x.Persen)}`}>{x.Persen == null ? "-" : `${x.Persen}%`}</span></td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
              {tahunan.length > 0 && <tfoot><tr data-testid="total-tahunan"><td>Total</td><td>{totalTa.e}</td><td>{totalTa.tepat}</td><td>{totalTa.telat}</td><td>{totalTa.iz}</td><td>{totalTa.disp}</td><td>{totalTa.alpha}</td><td><b>{totalTa.e ? `${Math.round((totalTa.h / totalTa.e) * 1000) / 10}%` : "-"}</b></td></tr></tfoot>}
            </table>
          </div>
          <p className="caption-text">Hari efektif = hari ketika sekolah benar-benar menjalankan presensi (ada tap kartu atau dicatat guru) atau ditetapkan sekolah di kalender. Libur dan hari tanpa kegiatan presensi <b>tidak dihitung</b> dan tidak dianggap Alpha. Persentase = (Tepat + Terlambat + Dispensasi) ÷ hari efektif. Dispensasi = mewakili sekolah, dihitung hadir. Alpha = pada hari efektif tidak tap masuk dan tidak ada keterangan izin/sakit dari sekolah. Baris Total menjumlahkan semua bulan.</p>
        </section>

        <KehadiranPerJam data={perJam} today={today} kategori={Object.fromEntries(hit(addDays(today, -14), today).hari.map((h) => [h.tanggal, h.kategori]))} />

        <Kedisiplinan disiplin={disiplin} ta={`${taPilih}-${taPilih + 1}`} />
        {ekstra?.(nis, profil)}

        <section className="panel no-print">
          <div className="panel-header"><div><p className="panel-title">Riwayat terbaru</p><span>10 hari terakhir</span></div></div>
          <div className="simple-list">
            {riwayat.map((x) => (
              <div key={x.tanggal} data-tgl={x.tanggal} className={x.kategori === "TidakEfektif" ? "riwayat-libur" : ""}>
                <b>{formatTanggal(x.tanggal)}</b>
                <small>
                  {x.kategori === "TidakEfektif"
                    ? `${x.diHariLibur ? `Tap tercatat di hari libur (${x.masuk?.slice(0, 5) ?? ""}), tidak masuk rekap` : "Libur / tidak ada kegiatan presensi"}`
                    : `${x.masuk ? `Masuk ${x.masuk.slice(0, 5)}` : x.ket ?? ""}${x.manualAlasan ? ` (dicatat manual: ${x.manualAlasan})` : ""}${x.pulang ? ` · Pulang ${x.pulang.slice(0, 5)}` : ""}${x.alfaTerverifikasi ? " · Alfa terverifikasi" : ""}`}
                </small>
                {x.kategori === "TidakEfektif" ? <StatusBadge status="Libur" /> : <StatusBadge status={LABEL[(x.kategori === "BelumTap" ? "Belum Tap" : x.kategori) as Kategori] ?? (x.kategori === "BelumTap" ? "Belum tap" : x.kategori)} />}
              </div>
            ))}
          </div>
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
  const pembinaan = Object.entries(disiplin.pembinaan[ta] ?? {}).map(([lv, p]) => ({ ...p, id: lv })).sort((a, b) => a.levelPoin - b.levelPoin);
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
      {pembinaan.length > 0 && (
        <div className="simple-list" data-testid="status-pembinaan">
          {pembinaan.map((p) => (
            <div key={p.id} data-status={p.status}>
              <b>Pembinaan {p.levelPoin} poin</b>
              <small>{p.mode === "lengkap" && p.tindakan ? p.tindakan : levels.find(([id]) => id === p.id)?.[1].tindakan ?? "Pembinaan oleh sekolah"}</small>
              <StatusBadge status={p.status === "selesai" ? `Selesai ${formatTanggal(p.tanggal, false)}` : `Dijadwalkan ${formatTanggal(p.tanggal, false)}`} />
              {p.mode === "lengkap" && p.hasil && <small data-testid="pembinaan-hasil">Hasil: {p.hasil}{p.tindakLanjut ? ` · Tindak lanjut: ${p.tindakLanjut}` : ""}</small>}
            </div>
          ))}
        </div>
      )}
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
function KehadiranPerJam({ data, today, kategori }: { data: PerJamData; today: string; kategori: Record<string, string> }) {
  const batas = addDays(today, -14);
  // Hari berstatus harian Alfa / Izin / Sakit / Dispensasi ditampilkan SATU baris (kode per jam diturunkan dari status harian, bukan 9 baris jam)
  const SEHARI: Record<string, string> = { Alpha: "Alfa seharian", Izin: "Izin seharian", Sakit: "Sakit seharian", Dispensasi: "Dispensasi seharian" };
  const tanggal = [...new Set([...Object.keys(data.jam), ...Object.keys(data.alfa), ...Object.entries(kategori).filter(([, k]) => k === "Alpha").map(([d]) => d)])].filter((d) => d >= batas && d <= today).sort().reverse();
  if (tanggal.length === 0) return null;
  return (
    <section className="panel no-print">
      <div className="panel-header"><div><p className="panel-title">Ketidakhadiran per jam &amp; Alfa terverifikasi</p><span>14 hari terakhir · dicatat oleh Waka Kesiswaan</span></div></div>
      <div className="simple-list">
        {tanggal.map((d) => {
          const jam = Object.entries(data.jam[d] ?? {}).sort((a, b) => Number(a[0]) - Number(b[0]));
          const sehari = SEHARI[kategori[d]];
          if (sehari) {
            return (
              <div key={d} data-testid="baris-seharian">
                <b>{formatTanggal(d)}</b>
                <small>{kategori[d] === "Alpha" ? "Tidak masuk sekolah tanpa keterangan." : "Sesuai keterangan harian dari sekolah."}</small>
                <StatusBadge status={data.alfa[d] ? "Alfa (terverifikasi)" : sehari} />
              </div>
            );
          }
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
