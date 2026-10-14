import { useMemo, useState, type FormEvent } from "react";
import { useSearchParams } from "react-router";
import Icon from "../components/Icon";
import { Empty, Field, Modal, Spinner } from "../components/ui";
import { useAdminData } from "../admin/AdminData";
import { usePanelMode, useToast } from "../admin/AdminLayout";
import { batasJam, initials, toneOf } from "../lib/attendance";
import { ALASAN_MANUAL, gabungTap, statusDariJam, type AlasanManual, type ManualTap } from "../lib/manual";
import { rentangPiket } from "../lib/piket";
import { formatTanggal, namaHari, nowHM, weekday } from "../lib/time";
import type { KetHarian, LogEntry, StudentRow } from "../lib/types";
import { useLive } from "../services/db";
import { catatManual, catatManualMassal, hapusManual, type PencatatManual } from "../services/manual";
import { pesanPiket } from "../services/piket";
import { useActor } from "../kesiswaan/useDiscipline";
import { usePiketCtx, usePiketMundur } from "./useJendela";

type Dialog = { s: StudentRow; mode: "masuk" | "pulang"; awal?: ManualTap } | null;

/** Pencatat: piket = akun bersama + nama petugas terpilih; waka = akunnya sendiri. */
function usePencatat(): PencatatManual {
  const mode = usePanelMode();
  const piket = usePiketCtx();
  const actor = useActor();
  return mode === "piket" ? piket : { uid: actor.uid, petugas: actor.nama };
}

const jamPenuh = (hm: string) => (hm.length === 5 ? `${hm}:00` : hm);

/**
 * Presensi manual: siswa HADIR tetapi tap alat tidak ada (KTM lupa/hilang/rusak, alat atau WiFi mati).
 * Piket & waka menulis; kepala & admin hanya melihat. Data alat selalu menang (lib/manual.ts).
 */
export default function PresensiManual({ tanggalAwal }: { tanggalAwal?: string }) {
  const mode = usePanelMode();
  const bisaTulis = mode === "piket" || mode === "waka";
  const { students, kelasList, today, now, schedule, ready } = useAdminData();
  const mundur = usePiketMundur();
  const pencatat = usePencatat();
  const notify = useToast();
  const [params] = useSearchParams();
  const qTanggal = params.get("tanggal");
  const [tanggal, setTanggal] = useState(tanggalAwal ?? (qTanggal && /^\d{4}-\d{2}-\d{2}$/.test(qTanggal) && qTanggal <= today ? qTanggal : today));
  const [kelas, setKelas] = useState("");
  const [q, setQ] = useState("");
  const [dialog, setDialog] = useState<Dialog>(null);
  const [kelasMassal, setKelasMassal] = useState("");
  const libur = weekday(tanggal) === 0;
  const batas = rentangPiket(today, mundur);
  const minTanggal = mode === "piket" ? batas.min : undefined;

  const logLive = useLive<Record<string, LogEntry>>(`log/${tanggal}`);
  const manualLive = useLive<Record<string, ManualTap>>(`manualTap/${tanggal}`);
  const izinLive = useLive<Record<string, KetHarian>>(`izin/${tanggal}`);
  // hanya waka yang dapat membaca (dan membatalkan) validasi Alfa; piket ditolak rules bila Alfa sudah divalidasi
  const valLive = useLive<Record<string, unknown>>(mode === "waka" ? `validasi/${tanggal}` : null);
  const alfaSet = new Set(Object.keys(valLive.data ?? {}));
  const loading = !ready || logLive.loading || manualLive.loading || izinLive.loading || valLive.loading;
  const galat = logLive.error ?? manualLive.error ?? izinLive.error;

  /** Per siswa: tap alat + entri manual digabung (alat menang). */
  const baris = useMemo(() => {
    const alat: Record<string, { masuk?: LogEntry; pulang?: LogEntry }> = {};
    for (const [key, e] of Object.entries(logLive.data ?? {})) {
      const slot = (alat[e.nis] ??= {});
      if (key.endsWith("_M")) slot.masuk = e; else slot.pulang = e;
    }
    return students.map((s) => {
      const a = alat[s.nis];
      const g = gabungTap({ masuk: a?.masuk, pulang: a?.pulang }, manualLive.data?.[s.nis]);
      return { s, g, ket: izinLive.data?.[s.nis], alat: a };
    });
  }, [students, logLive.data, manualLive.data, izinLive.data]);

  const cocok = (s: StudentRow) => {
    const qq = q.trim().toLowerCase();
    return (!kelas || s.kelas === kelas) && (!qq || `${s.nama} ${s.nis}`.toLowerCase().includes(qq));
  };
  const belumHadir = baris.filter((b) => !b.g.masuk && cocok(b.s));
  const tercatat = baris.filter((b) => b.g.manual && cocok(b.s));
  const belumPulang = baris.filter((b) => b.g.masuk && !b.g.pulang && cocok(b.s));

  const hapus = async (s: StudentRow) => {
    try { await hapusManual(tanggal, s.nis); notify(`Presensi manual ${s.nama} dihapus`); }
    catch (e) { notify(pesanPiket(e), "err"); }
  };

  const kelasAktif = kelasMassal;
  return (
    <section className="data-page">
      <div className="section-heading">
        <div><p>Presensi manual</p><span>{formatTanggal(tanggal)} · untuk siswa yang HADIR tetapi tidak tercatat alat (KTM lupa/hilang, kartu rusak, alat bermasalah). Data alat selalu diutamakan.</span></div>
      </div>
      {!bisaTulis && <div className="notice warn"><Icon name="eye" size={17} /><span>Hanya piket dan waka yang dapat mencatat. Halaman ini untuk melihat.</span></div>}

      <div className="filter-bar">
        <input type="date" className="text-input auto" aria-label="Tanggal" value={tanggal} max={today} min={minTanggal} onChange={(e) => e.target.value && setTanggal(e.target.value)} />
        <div className="search search-inline"><Icon name="search" size={18} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari nama atau NIS..." aria-label="Cari siswa" /></div>
        <select value={kelas} onChange={(e) => setKelas(e.target.value)} aria-label="Filter kelas"><option value="">Semua kelas</option>{kelasList.map((k) => <option key={k}>{k}</option>)}</select>
      </div>
      {galat && <div className="notice warn"><Icon name="warning" size={17} /><span>{galat}</span></div>}

      {libur ? <Empty icon="calendar" title="Hari Minggu — libur" text="Presensi manual tidak dapat dicatat pada hari Minggu." /> : loading ? <div className="page-loader"><Spinner dark /></div> : (
        <>
          {bisaTulis && (
            <MassalPanel tanggal={tanggal} kelasList={kelasList} baris={baris} kelas={kelasAktif} setKelas={setKelasMassal}
              schedule={schedule} alfaSet={alfaSet}
              onOk={async (masuk, siswa, ket, batalAlfa) => {
                await catatManualMassal({ tanggal, masuk, kelas: kelasAktif, siswa, alasan: "Alat bermasalah", keterangan: ket, batalAlfa }, pencatat, schedule);
                notify(`${siswa.length} siswa kelas ${kelasAktif} ditandai hadir`);
              }} />
          )}

          <div className="table-panel" style={{ marginTop: 16 }}>
            <div className="table-head piket-grid"><span>Belum tercatat hadir</span><span>Kelas</span><span className="ta-right">Aksi</span></div>
            {belumHadir.length === 0 ? <Empty icon="check" title="Semua siswa sudah tercatat hadir" text="Tidak ada siswa tanpa tap masuk (alat atau manual)." /> : belumHadir.map(({ s, ket }) => (
              <div className="table-row piket-grid" key={s.nis} data-nis={s.nis}>
                <span className="student-cell"><i className={`avatar ${toneOf(s.nis)}`}>{initials(s.nama)}</i><span><b>{s.nama}</b><small>NIS {s.nis}{ket ? ` · ${ket}` : ""}{alfaSet.has(s.nis) ? " · Alfa terverifikasi" : ""}</small></span></span>
                <span>{s.kelas}</span>
                <span className="aksi-cell">{bisaTulis && <button className="secondary-button sm" onClick={() => setDialog({ s, mode: "masuk" })}>Hadir manual</button>}</span>
              </div>
            ))}
          </div>

          <article className="panel master-group" style={{ marginTop: 16 }} data-testid="manual-tercatat">
            <div className="panel-header"><div><p className="panel-title">Presensi manual tercatat</p><span>{tercatat.length} siswa pada tanggal ini</span></div></div>
            {tercatat.length === 0 ? <p className="modal-note">Belum ada presensi manual.</p> : (
              <div className="simple-list">
                {tercatat.map(({ s, g }) => (
                  <div key={s.nis} data-nis={s.nis}>
                    <span><b>{s.nama}</b><small>{s.kelas} · {g.manual!.tap.alasan} · {g.manual!.tap.masuk ? `masuk ${g.manual!.tap.masuk.slice(0, 5)} (${g.manual!.tap.status})` : ""}{g.manual!.tap.pulang ? ` pulang ${g.manual!.tap.pulang.slice(0, 5)}` : ""} · oleh {g.manual!.tap.petugas ?? "-"}</small></span>
                    <span className="badge badge-ubah">Manual</span>
                    {g.manual!.diabaikan && <span className="badge badge-tanpa">diabaikan (ada tap alat)</span>}
                    {bisaTulis && g.manual!.tap.masuk && !g.pulang && <button className="ghost-button" onClick={() => setDialog({ s, mode: "pulang", awal: g.manual!.tap })}>Catat pulang</button>}
                    {bisaTulis && <button className="ghost-button" aria-label={`Hapus presensi manual ${s.nama}`} onClick={() => hapus(s)}>Hapus</button>}
                  </div>
                ))}
              </div>
            )}
          </article>

          {bisaTulis && belumPulang.length > 0 && (
            <article className="panel master-group" style={{ marginTop: 16 }}>
              <div className="panel-header"><div><p className="panel-title">Sudah masuk, belum tap pulang</p><span>Catat pulang manual bila KTM tertinggal/hilang saat pulang</span></div></div>
              <div className="simple-list">
                {belumPulang.slice(0, 60).map(({ s, g }) => (
                  <div key={s.nis}><span><b>{s.nama}</b><small>{s.kelas} · masuk {g.masuk!.jam.slice(0, 5)}</small></span>
                    <button className="ghost-button" onClick={() => setDialog({ s, mode: "pulang", awal: g.manual?.tap })}>Catat pulang</button></div>
                ))}
              </div>
            </article>
          )}
        </>
      )}

      {dialog && (
        <ManualDialog dialog={dialog} tanggal={tanggal} today={today} now={now} schedule={schedule} alfa={alfaSet.has(dialog.s.nis)} onClose={() => setDialog(null)}
          onOk={async (a) => {
            const status = await catatManual({ tanggal, nis: dialog.s.nis, kelas: dialog.s.kelas, ...a }, pencatat, schedule, { batalAlfa: alfaSet.has(dialog.s.nis) });
            notify(`${dialog.s.nama}: ${a.masuk ? `hadir manual (${status})` : "pulang manual"} tercatat`);
            setDialog(null);
          }} />
      )}
    </section>
  );
}

/** Jam standar: sekarang bila hari ini, kalau tidak awal jendela masuk kelas itu. */
function jamAwal(tanggal: string, today: string, now: Date, schedule: Parameters<typeof batasJam>[0], kelas: string, jenis: "Masuk" | "Pulang") {
  if (tanggal === today) return nowHM(now);
  return batasJam(schedule, kelas, namaHari(tanggal))[jenis][0];
}

export function ManualDialog({ dialog, tanggal, today, now, schedule, alfa = false, onClose, onOk }: {
  dialog: NonNullable<Dialog>; tanggal: string; today: string; now: Date; schedule: Parameters<typeof batasJam>[0]; alfa?: boolean; onClose: () => void;
  onOk: (a: { masuk?: string; pulang?: string; alasan: AlasanManual; keterangan?: string }) => Promise<void>;
}) {
  const { s, mode, awal } = dialog;
  const [alasan, setAlasan] = useState<AlasanManual>(awal?.alasan ?? "Lupa KTM");
  const [jam, setJam] = useState(jamAwal(tanggal, today, now, schedule, s.kelas, mode === "masuk" ? "Masuk" : "Pulang"));
  const [ket, setKet] = useState(awal?.keterangan ?? "");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const pratinjau = mode === "masuk" && jam ? statusDariJam(jamPenuh(jam), schedule, s.kelas, tanggal) : null;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!jam) { setErr("Isi jam."); return; }
    if (alasan === "Lainnya" && ket.trim().length < 3) { setErr("Alasan 'Lainnya' wajib dijelaskan di keterangan (minimal 3 karakter)."); return; }
    setBusy(true); setErr("");
    try {
      await onOk(mode === "masuk"
        ? { masuk: jamPenuh(jam), alasan, keterangan: ket }
        // catat pulang: pertahankan entri manual yang sudah ada (masuk + alasan) bila ada
        : { masuk: awal?.masuk, pulang: jamPenuh(jam), alasan: awal?.alasan ?? alasan, keterangan: awal?.keterangan ?? ket });
    } catch (ex) { setErr(pesanPiket(ex)); setBusy(false); }
  };

  return (
    <Modal title={mode === "masuk" ? "Hadir manual" : "Catat pulang manual"} subtitle={`${s.nama} · ${s.kelas} · ${formatTanggal(tanggal, false)}`} onClose={onClose} width={460}>
      <form className="modal-form" onSubmit={submit} noValidate>
        <Field label="Alasan">
          <select className="text-input" value={alasan} disabled={mode === "pulang" && Boolean(awal)} onChange={(e) => setAlasan(e.target.value as AlasanManual)}>
            {ALASAN_MANUAL.map((a) => <option key={a}>{a}</option>)}
          </select>
        </Field>
        <Field label={mode === "masuk" ? "Jam masuk" : "Jam pulang"} hint={pratinjau ? `Status dihitung dari jadwal kelas: ${pratinjau}` : undefined}>
          <input className="text-input" type="time" value={jam} onChange={(e) => setJam(e.target.value)} aria-label={mode === "masuk" ? "Jam masuk" : "Jam pulang"} />
        </Field>
        {mode === "masuk" && (
          <Field label="Keterangan (opsional)" hint={alasan === "Lainnya" ? "Wajib untuk alasan 'Lainnya'." : undefined}>
            <textarea className="text-input area" rows={2} maxLength={200} value={ket} onChange={(e) => setKet(e.target.value)} />
          </Field>
        )}
        {alasan === "Lupa KTM" && mode === "masuk" && <p className="modal-note">Waka akan menerima saran pelanggaran "Lupa membawa KTM" untuk ditinjau.</p>}
        {alasan === "KTM hilang" && mode === "masuk" && <p className="modal-note">Waka akan menerima saran pelanggaran "Menghilangkan KTM" untuk ditinjau.</p>}
        {alfa && <div className="notice warn" role="status"><Icon name="warning" size={17} /><span>Alfa terverifikasi akan dibatalkan: validasi Alfa siswa ini dihapus bersamaan dengan presensi manual dan tercatat di jejak audit.</span></div>}
        {err && <div className="login-error-box" role="alert"><Icon name="warning" size={17} /><div><span>{err}</span></div></div>}
        <div className="modal-actions">
          <button type="button" className="secondary-button" onClick={onClose}>Batal</button>
          <button className="primary-button" disabled={busy}>{busy ? <Spinner /> : null}{alfa ? "Simpan & batalkan Alfa" : "Simpan"}</button>
        </div>
      </form>
    </Modal>
  );
}

/** Mode "alat bermasalah": semua siswa kelas yang belum tercatat ditandai hadir sekaligus, kecuali yang tidak dicentang. */
function MassalPanel({ tanggal, kelasList, baris, kelas, setKelas, schedule, alfaSet, onOk }: {
  tanggal: string; kelasList: string[]; baris: { s: StudentRow; g: ReturnType<typeof gabungTap>; ket?: KetHarian }[];
  kelas: string; setKelas: (k: string) => void; schedule: Parameters<typeof batasJam>[0]; alfaSet: Set<string>;
  onOk: (masuk: string, siswa: { nis: string }[], ket: string | undefined, batalAlfa: string[]) => Promise<void>;
}) {
  const [tidakHadir, setTidakHadir] = useState<Set<string>>(new Set());
  const [jam, setJam] = useState("");
  const [ket, setKet] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const kandidat = baris.filter((b) => b.s.kelas === kelas && !b.g.masuk);
  // alat mati sejak pagi: default = awal jendela masuk kelas (bukan jam sekarang, agar tidak semua menjadi Terlambat)
  const jamEfektif = jam || batasJam(schedule, kelas || "Semua", namaHari(tanggal)).Masuk[0];
  const hadir = kandidat.filter((b) => !tidakHadir.has(b.s.nis));
  const pilihKelas = (k: string) => { setKelas(k); setTidakHadir(new Set()); setErr(""); };
  const toggle = (nis: string) => setTidakHadir((x) => { const n = new Set(x); if (n.has(nis)) n.delete(nis); else n.add(nis); return n; });
  const kirim = async () => {
    setBusy(true); setErr("");
    try { await onOk(jamPenuh(jamEfektif), hadir.map((b) => ({ nis: b.s.nis })), ket.trim() || undefined, hadir.filter((b) => alfaSet.has(b.s.nis)).map((b) => b.s.nis)); setTidakHadir(new Set()); setKet(""); }
    catch (e) { setErr(pesanPiket(e)); }
    finally { setBusy(false); }
  };

  return (
    <article className="panel master-group" data-testid="massal-panel">
      <div className="panel-header"><div><p className="panel-title">Mode alat bermasalah</p><span>Alat mati / WiFi putus: tandai seluruh kelas hadir sekaligus, centang siswa yang TIDAK hadir. Alasan otomatis "Alat bermasalah".</span></div></div>
      <div className="filter-bar">
        <select value={kelas} onChange={(e) => pilihKelas(e.target.value)} aria-label="Kelas alat bermasalah"><option value="">Pilih kelas...</option>{kelasList.map((k) => <option key={k}>{k}</option>)}</select>
        {kelas && <label className="check-inline">Jam masuk <input className="text-input auto" type="time" value={jamEfektif} onChange={(e) => setJam(e.target.value)} aria-label="Jam masuk massal" /></label>}
      </div>
      {kelas && (kandidat.length === 0 ? <p className="modal-note">Semua siswa kelas {kelas} sudah tercatat hadir.</p> : (
        <>
          <div className="simple-list" role="group" aria-label="Siswa belum tercatat">
            {kandidat.map(({ s }) => (
              <label key={s.nis} className="check-inline" style={{ display: "flex", gap: 8, padding: "6px 0" }}>
                <input type="checkbox" checked={tidakHadir.has(s.nis)} onChange={() => toggle(s.nis)} aria-label={`Tidak hadir: ${s.nama}`} />
                <span><b>{s.nama}</b> <small>NIS {s.nis}</small></span>
              </label>
            ))}
          </div>
          {hadir.some((b) => alfaSet.has(b.s.nis)) && <div className="notice warn" role="status"><Icon name="warning" size={17} /><span>Alfa terverifikasi akan dibatalkan untuk {hadir.filter((b) => alfaSet.has(b.s.nis)).length} siswa yang ditandai hadir (tercatat di jejak audit).</span></div>}
          <p className="modal-note">Centang = <b>tidak hadir</b> (tidak ditandai). Yang tidak dicentang akan ditandai hadir pukul {jamEfektif}; status Hadir/Terlambat dihitung dari jadwal.</p>
          <Field label="Keterangan (opsional)"><input className="text-input" maxLength={200} value={ket} onChange={(e) => setKet(e.target.value)} /></Field>
          {err && <div className="login-error-box" role="alert"><Icon name="warning" size={17} /><div><span>{err}</span></div></div>}
          <div className="modal-actions" style={{ justifyContent: "flex-start" }}>
            <button className="primary-button" disabled={busy || hadir.length === 0} onClick={kirim}>{busy ? <Spinner /> : <Icon name="check" size={15} />}Tandai hadir ({hadir.length} siswa)</button>
          </div>
        </>
      ))}
    </article>
  );
}

