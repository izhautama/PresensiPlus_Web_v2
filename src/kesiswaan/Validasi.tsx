import { useMemo, useState, type FormEvent } from "react";
import Icon from "../components/Icon";
import { Empty, Field, Modal, Spinner, StatusBadge } from "../components/ui";
import { useAdminData } from "../admin/AdminData";
import { useBisaTulisKesiswaan, useToast } from "../admin/AdminLayout";
import { batasJam, initials, toneOf } from "../lib/attendance";
import { formatTanggal, namaHari, nowHM, weekday } from "../lib/time";
import type { ManualTap } from "../lib/manual";
import type { KetHarian, LogEntry, StudentRow } from "../lib/types";
import { aturIzin, useLive } from "../services/db";
import type { Actor } from "../services/discipline";
import { batalkanAlfa, konfirmasiAlfa } from "../services/perjam";
import CatatDialog from "./CatatDialog";
import { useActor, useDiscipline } from "./useDiscipline";

type Valid = { status: "Alfa"; catatan?: string };
type Aksi =
  | { jenis: "izin"; s: StudentRow; ket: KetHarian }
  | { jenis: "alfa"; s: StudentRow }
  | { jenis: "pelanggaran"; s: StudentRow }
  | null;

/** Validasi ketidakhadiran harian: siswa belum tap & tanpa keterangan → Izin / Sakit / Dispensasi / Konfirmasi Alfa. */
export default function Validasi() {
  const { students, kelasList, today, now, schedule } = useAdminData();
  const bisaTulis = useBisaTulisKesiswaan();
  const actor = useActor();
  const notify = useToast();
  const d = useDiscipline();
  const [tanggal, setTanggal] = useState(today);
  const [kelas, setKelas] = useState("");
  const [aksi, setAksi] = useState<Aksi>(null);

  const logLive = useLive<Record<string, LogEntry>>(`log/${tanggal}`);
  const izinLive = useLive<Record<string, KetHarian>>(`izin/${tanggal}`);
  const valLive = useLive<Record<string, Valid>>(`validasi/${tanggal}`);
  const manualLive = useLive<Record<string, ManualTap>>(`manualTap/${tanggal}`);
  const libur = weekday(tanggal) === 0;

  // masuk = entri log berkunci *_M ATAU presensi manual dengan jam masuk (siswa hadir tetapi KTM lupa/hilang/alat mati)
  const masukSet = useMemo(() => {
    const s = new Set(Object.entries(logLive.data ?? {}).filter(([k]) => k.endsWith("_M")).map(([, e]) => e.nis));
    for (const [nis, t] of Object.entries(manualLive.data ?? {})) if (t.masuk) s.add(nis);
    return s;
  }, [logLive.data, manualLive.data]);

  const baris = useMemo(() => {
    return students
      .filter((s) => (!kelas || s.kelas === kelas) && !masukSet.has(s.nis))
      .map((s) => {
        const ket = izinLive.data?.[s.nis];
        const alfa = valLive.data?.[s.nis];
        return { s, ket, alfa, status: alfa ? "alfa" as const : ket ? "izin" as const : "belum" as const };
      })
      .sort((a, b) => ({ belum: 0, izin: 1, alfa: 2 })[a.status] - ({ belum: 0, izin: 1, alfa: 2 })[b.status] || a.s.kelas.localeCompare(b.s.kelas) || a.s.nama.localeCompare(b.s.nama));
  }, [students, kelas, masukSet, izinLive.data, valLive.data]);

  const total = baris.length;
  const selesai = baris.filter((x) => x.status !== "belum").length;
  const pct = total ? Math.round((selesai / total) * 100) : 100;

  // Hari ini: Alfa baru boleh dikonfirmasi setelah batas keterlambatan kelas lewat
  const alfaBelumBoleh = (kls: string) => tanggal === today && nowHM(now) <= batasJam(schedule, kls, namaHari(tanggal)).Terlambat[1];
  const loading = logLive.loading || izinLive.loading || valLive.loading || manualLive.loading;

  return (
    <section className="data-page">
      <div className="section-heading">
        <div><p>Validasi harian</p><span>Siswa belum tap masuk dan tanpa keterangan{bisaTulis ? "" : " · hanya lihat"}</span></div>
      </div>

      <div className="filter-bar no-print">
        <input type="date" className="text-input auto" value={tanggal} max={today} aria-label="Tanggal" onChange={(e) => e.target.value && setTanggal(e.target.value)} />
        <select value={kelas} onChange={(e) => setKelas(e.target.value)} aria-label="Filter kelas"><option value="">Semua kelas</option>{kelasList.map((k) => <option key={k}>{k}</option>)}</select>
        <span className="caption-text inline">{formatTanggal(tanggal)}</span>
      </div>

      {libur ? <div className="panel"><Empty icon="calendar" title="Hari Minggu — libur" text="Tidak ada presensi pada hari libur." /></div> : (
        <>
          <div className="validasi-progress" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
            <div><b>{selesai} dari {total}</b> sudah divalidasi</div>
            <div className="progress"><span style={{ width: `${pct}%` }} /></div>
          </div>
          {[logLive.error, izinLive.error, valLive.error].filter(Boolean).length > 0 && <div className="notice warn" role="alert"><Icon name="warning" size={17} /><span>Sebagian data tidak dapat dimuat.</span></div>}

          <div className="table-panel">
            <div className="table-head validasi-grid"><span>Siswa</span><span>Kelas</span><span>Status</span><span className="ta-right">Aksi</span></div>
            {loading ? <div className="page-loader"><Spinner dark /></div> : baris.length === 0 ? (
              <Empty icon="check" title="Semua siswa sudah tap masuk" text="Tidak ada yang perlu divalidasi." />
            ) : baris.map(({ s, ket, alfa, status }) => (
              <div className="table-row validasi-grid" key={s.nis}>
                <span className="student-cell"><i className={`avatar ${toneOf(s.nis)}`}>{initials(s.nama)}</i><span><b>{s.nama}</b><small>NIS {s.nis}</small></span></span>
                <span>{s.kelas}</span>
                <span>{status === "alfa" ? <><StatusBadge status="Alfa" /><small className="muted"> terverifikasi{alfa?.catatan ? ` · ${alfa.catatan}` : ""}</small></> : status === "izin" ? <StatusBadge status={ket as string} /> : <StatusBadge status="Belum tap" />}</span>
                <span className="aksi-cell">
                  {bisaTulis && (
                    <>
                      {status === "belum" && (
                        <>
                          <button className="secondary-button sm" onClick={() => setAksi({ jenis: "izin", s, ket: "Izin" })}>Izin</button>
                          <button className="secondary-button sm" onClick={() => setAksi({ jenis: "izin", s, ket: "Sakit" })}>Sakit</button>
                          <button className="secondary-button sm" onClick={() => setAksi({ jenis: "izin", s, ket: "Dispensasi" })}>Dispensasi</button>
                          <button className="danger-button sm" disabled={alfaBelumBoleh(s.kelas)} title={alfaBelumBoleh(s.kelas) ? "Menunggu batas keterlambatan terlewati" : undefined} onClick={() => setAksi({ jenis: "alfa", s })}>Alfa</button>
                        </>
                      )}
                      {status === "izin" && <button className="secondary-button sm" onClick={async () => { try { await aturIzin(s.nis, tanggal, null, ""); notify("Keterangan dihapus"); } catch (e) { notify((e as Error).message, "err"); } }}>Hapus keterangan</button>}
                      {status === "alfa" && <button className="secondary-button sm" onClick={async () => { try { await batalkanAlfa(tanggal, s.nis, actor); notify("Alfa dibatalkan"); } catch (e) { notify((e as Error).message, "err"); } }}>Batalkan Alfa</button>}
                      <button className="ghost-button" title="Catat pelanggaran" aria-label={`Catat pelanggaran ${s.nama}`} onClick={() => setAksi({ jenis: "pelanggaran", s })}><Icon name="warning" size={15} /></button>
                    </>
                  )}
                </span>
              </div>
            ))}
          </div>
        </>
      )}

      {aksi?.jenis === "izin" && <IzinDialog s={aksi.s} ket={aksi.ket} tanggal={tanggal} onClose={() => setAksi(null)} />}
      {aksi?.jenis === "alfa" && <AlfaDialog s={aksi.s} tanggal={tanggal} actor={actor} onClose={() => setAksi(null)} />}
      {aksi?.jenis === "pelanggaran" && (
        <CatatDialog jenis="pelanggaran" presetNis={[aksi.s.nis]} rules={d.rules} remisi={d.remisi} levelList={d.levelList} records={d.records} actor={actor}
          onClose={() => setAksi(null)} onSaved={(c) => { setAksi(null); if (c.length) notify(`${c[0].nama} mencapai ambang: ${c[0].level}`); }} />
      )}
    </section>
  );
}

function IzinDialog({ s, ket, tanggal, onClose }: { s: StudentRow; ket: KetHarian; tanggal: string; onClose: () => void }) {
  const notify = useToast();
  const [catatan, setCatatan] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try { await aturIzin(s.nis, tanggal, ket, catatan); notify(`${s.nama}: ${ket} tercatat`); onClose(); }
    catch (ex) { setErr((ex as Error).message); setBusy(false); }
  };
  return (
    <Modal title={`${ket} — ${s.nama}`} subtitle={`${s.kelas} · ${formatTanggal(tanggal)}`} onClose={onClose} width={440}>
      <form className="modal-form" onSubmit={submit}>
        <Field label="Catatan (opsional)"><input className="text-input" maxLength={200} value={catatan} onChange={(e) => setCatatan(e.target.value)} placeholder="contoh: surat dokter" /></Field>
        {err && <div className="login-error-box" role="alert"><Icon name="warning" size={17} /><div><span>{err}</span></div></div>}
        <div className="modal-actions">
          <button type="button" className="secondary-button" onClick={onClose}>Batal</button>
          <button className="primary-button" disabled={busy}>{busy ? <Spinner /> : null}Simpan</button>
        </div>
      </form>
    </Modal>
  );
}

function AlfaDialog({ s, tanggal, actor, onClose }: { s: StudentRow; tanggal: string; actor: Actor; onClose: () => void }) {
  const notify = useToast();
  const [catatan, setCatatan] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  return (
    <Modal title={`Konfirmasi Alfa — ${s.nama}`} subtitle={`${s.kelas} · ${formatTanggal(tanggal)}`} onClose={onClose} width={440}>
      <p className="modal-note">Siswa tidak tap masuk dan tidak ada keterangan. Alfa yang dikonfirmasi tampil sebagai <b>Alfa (terverifikasi)</b> di laporan dan portal orang tua, serta tercatat di jejak audit.</p>
      <Field label="Catatan (opsional)"><input className="text-input" maxLength={200} value={catatan} onChange={(e) => setCatatan(e.target.value)} placeholder="contoh: sudah dihubungi, tidak ada kabar" /></Field>
      {err && <div className="login-error-box" role="alert"><Icon name="warning" size={17} /><div><span>{err}</span></div></div>}
      <div className="modal-actions">
        <button className="secondary-button" onClick={onClose}>Batal</button>
        <button className="danger-button" disabled={busy} onClick={async () => {
          setBusy(true);
          try { await konfirmasiAlfa(tanggal, s.nis, catatan, actor); notify(`${s.nama}: Alfa terverifikasi`); onClose(); }
          catch (ex) { setErr((ex as Error).message); setBusy(false); }
        }}>{busy ? <Spinner /> : null}Konfirmasi Alfa</button>
      </div>
    </Modal>
  );
}
