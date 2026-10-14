import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useSearchParams } from "react-router";
import Icon from "../components/Icon";
import { Empty, Field, Modal, Spinner, StatusBadge } from "../components/ui";
import { batasJam, initials, maskUid, toneOf } from "../lib/attendance";
import { namaHari, nowHM } from "../lib/time";
import type { KetHarian, StudentRow } from "../lib/types";
import { aturIzin, buatPin, hapusSiswa, normalisasiSiswa, resetPin, tambahSiswa, ubahSiswa, validasiPin } from "../services/db";
import { statusHariIni, useAdminData } from "./AdminData";
import { usePanelMode, useToast } from "./AdminLayout";

type Dialog =
  | { type: "form"; student?: StudentRow; presetUid?: string }
  | { type: "pin"; student: StudentRow }
  | { type: "izin"; student: StudentRow }
  | { type: "hapus"; student: StudentRow }
  | { type: "pinBaru"; student: { nama: string; nis: string }; pin: string }
  | null;

export default function Students() {
  const { students, byNis, kelasList, schedule, today, now, ready } = useAdminData();
  const kepala = usePanelMode() !== "admin"; // mode pantau: tanpa tambah/edit/hapus/PIN, UID disamarkan
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState("");
  const [kelas, setKelas] = useState("");
  const [status, setStatus] = useState("");
  const presetUid = kepala ? undefined : (params.get("daftar") ?? undefined);
  const [dialog, setDialog] = useState<Dialog>(presetUid ? { type: "form", presetUid } : null);

  const close = () => { setDialog(null); if (presetUid) setParams({}, { replace: true }); };

  const rows = useMemo(() => {
    const qq = q.trim().toLowerCase();
    return students.map((s) => {
      const lewat = nowHM(now) > batasJam(schedule, s.kelas, namaHari(today)).Terlambat[1];
      return { ...s, e: byNis[s.nis], st: statusHariIni(byNis[s.nis], lewat) };
    }).filter((s) =>
      (!kelas || s.kelas === kelas) && (!status || s.st === status) &&
      (!qq || `${s.nama} ${s.nis} ${kepala ? "" : s.uid}`.toLowerCase().includes(qq)));
  }, [students, byNis, q, kelas, status, schedule, today, now, kepala]);

  return (
    <section className="data-page">
      <div className="section-heading">
        <div><p>Data siswa</p><span>{rows.length} dari {students.length} siswa · status presensi hari ini</span></div>
        {!kepala && <button className="primary-button" onClick={() => setDialog({ type: "form" })}><Icon name="plus" size={17} />Tambah siswa</button>}
      </div>

      <div className="filter-bar">
        <div className="search search-inline"><Icon name="search" size={18} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder={kepala ? "Cari nama atau NIS..." : "Cari nama, NIS, atau UID kartu..."} aria-label="Cari siswa" /></div>
        <select value={kelas} onChange={(e) => setKelas(e.target.value)} aria-label="Filter kelas"><option value="">Semua kelas</option>{kelasList.map((k) => <option key={k}>{k}</option>)}</select>
        <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Filter status">
          <option value="">Semua status</option>{["Hadir", "Terlambat", "Izin", "Sakit", "Dispensasi", "Belum hadir", "Alpha"].map((x) => <option key={x}>{x}</option>)}
        </select>
      </div>

      <div className="table-panel">
        <div className="table-head students-grid"><span>Siswa</span><span>NIS</span><span>Kelas</span><span>Masuk</span><span>Pulang</span><span>Status</span><span className="ta-right">Aksi</span></div>
        {!ready ? <div className="page-loader"><Spinner dark /></div> : rows.length === 0 ? (
          <Empty icon="users" title={students.length ? "Tidak ada siswa yang cocok" : "Belum ada siswa"} text={students.length ? "Ubah kata kunci atau filter." : kepala ? "Data siswa belum diisi oleh administrator." : "Klik \"Tambah siswa\" atau jalankan notebook migrasi."} />
        ) : rows.map((s) => (
          <div className="table-row students-grid" key={s.uid}>
            <span className="student-cell"><i className={`avatar ${toneOf(s.nis)}`}>{initials(s.nama)}</i><span><b>{s.nama}</b><small className="mono">{kepala ? maskUid(s.uid) : s.uid}</small></span></span>
            <span>{s.nis}</span>
            <span>{s.kelas}</span>
            <span>{s.e?.masuk?.jam.slice(0, 5) ?? "—"}{s.e?.masuk?.manual && <small className="badge badge-ubah" title={`Dicatat manual: ${s.e.masuk.manual}`}>Manual</small>}</span>
            <span>{s.e?.pulang?.jam.slice(0, 5) ?? "—"}</span>
            <span><StatusBadge status={s.st} /></span>
            <span className="row-actions">
              <button title="Izin / sakit" aria-label={`Izin atau sakit ${s.nama}`} onClick={() => setDialog({ type: "izin", student: s })}><Icon name="file" size={16} /></button>
              {!kepala && <>
                <button title="Reset PIN orang tua" aria-label={`Reset PIN ${s.nama}`} onClick={() => setDialog({ type: "pin", student: s })}><Icon name="key" size={16} /></button>
                <button title="Edit" aria-label={`Edit ${s.nama}`} onClick={() => setDialog({ type: "form", student: s })}><Icon name="edit" size={16} /></button>
                <button title="Hapus" aria-label={`Hapus ${s.nama}`} className="danger" onClick={() => setDialog({ type: "hapus", student: s })}><Icon name="trash" size={16} /></button>
              </>}
            </span>
          </div>
        ))}
      </div>

      {!kepala && dialog?.type === "form" && <StudentForm student={dialog.student} presetUid={dialog.presetUid} onClose={close} onCreated={(st, pin) => setDialog({ type: "pinBaru", student: st, pin })} />}
      {!kepala && dialog?.type === "pin" && <PinForm student={dialog.student} onClose={close} onDone={(pin) => setDialog({ type: "pinBaru", student: dialog.student, pin })} />}
      {dialog?.type === "izin" && <IzinForm student={dialog.student} onClose={close} />}
      {!kepala && dialog?.type === "hapus" && <HapusDialog student={dialog.student} onClose={close} />}
      {!kepala && dialog?.type === "pinBaru" && <PinResult nama={dialog.student.nama} nis={dialog.student.nis} pin={dialog.pin} onClose={close} />}
    </section>
  );
}

function PinInput({ value, onChange, error }: { value: string; onChange: (v: string) => void; error?: string }) {
  return (
    <Field label="PIN orang tua (6 digit)" error={error} hint="Dipakai orang tua untuk login bersama NIS.">
      <div className="pin-row">
        <input className="text-input mono" inputMode="numeric" maxLength={6} value={value} onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="______" />
        <button type="button" className="secondary-button" onClick={() => onChange(buatPin())}><Icon name="refresh" size={15} />Acak</button>
      </div>
    </Field>
  );
}

function StudentForm({ student, presetUid, onClose, onCreated }: { student?: StudentRow; presetUid?: string; onClose: () => void; onCreated: (s: { nama: string; nis: string }, pin: string) => void }) {
  const { studentMap, kelasList } = useAdminData();
  const notify = useToast();
  const edit = Boolean(student);
  const [f, setF] = useState({ uid: student?.uid ?? presetUid ?? "", nis: student?.nis ?? "", nama: student?.nama ?? "", kelas: student?.kelas ?? "" });
  const [pin, setPin] = useState(() => (edit ? "" : buatPin()));
  const [err, setErr] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  // Web NFC (Chrome Android, HTTPS). Bila tidak didukung, tombol disembunyikan dan input manual tetap dipakai.
  const nfcDidukung = typeof window !== "undefined" && "NDEFReader" in window;
  const [scanning, setScanning] = useState(false);
  const scanAbort = useRef<AbortController | null>(null);
  useEffect(() => {
    if (nfcDidukung && !edit && !f.uid) void startScan(true);
    return () => scanAbort.current?.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stopScan = () => { scanAbort.current?.abort(); scanAbort.current = null; setScanning(false); };
  const startScan = async (otomatis = false) => {
    if (scanning && !otomatis) { stopScan(); return; }
    const ctrl = new AbortController();
    scanAbort.current = ctrl;
    setErr((x) => ({ ...x, uid: "" }));
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const reader = new (window as any).NDEFReader();
      await reader.scan({ signal: ctrl.signal });
      setScanning(true);
      reader.onreading = (ev: { serialNumber?: string }) => {
        const uid = (ev.serialNumber ?? "").replace(/[^0-9a-f]/gi, "").toUpperCase();
        if (!uid) return;
        setF((x) => ({ ...x, uid }));
        notify(`UID terbaca: ${uid}`);
        stopScan();
      };
      reader.onreadingerror = () => setErr((x) => ({ ...x, uid: "Kartu tidak terbaca, coba tempelkan lagi." }));
    } catch (ex) {
      stopScan();
      if (otomatis) return; // gagal mulai otomatis: pengguna masih bisa menekan tombol Scan kartu
      const name = (ex as Error).name;
      setErr((x) => ({ ...x, uid: name === "NotAllowedError" ? "Izin NFC ditolak. Aktifkan NFC dan izinkan akses di browser." : "NFC tidak dapat dipakai, isi UID secara manual." }));
    }
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const { data, err: v } = normalisasiSiswa(f);
    if (!edit) { const p = validasiPin(pin); if (p) v.pin = p; }
    setErr(v);
    if (Object.keys(v).length) return;
    setBusy(true);
    try {
      if (edit && student) {
        await ubahSiswa(student.uid, student, data, studentMap);
        notify(`Data ${data.nama} diperbarui`);
        onClose();
      } else {
        await tambahSiswa(data, pin, studentMap);
        notify(`${data.nama} terdaftar`);
        onCreated(data, pin);
      }
    } catch (ex) {
      setErr({ general: (ex as Error).message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={edit ? "Edit siswa" : "Tambah siswa"} subtitle={edit ? "Ganti UID bila kartu hilang/rusak. NIS tidak dapat diubah." : "Akun orang tua dibuat otomatis dengan PIN di bawah."} onClose={onClose}>
      <form className="modal-form" onSubmit={submit} noValidate>
        <Field label="UID kartu RFID" error={err.uid} hint={scanning ? "Tempelkan kartu ke bagian belakang HP..." : nfcDidukung ? "Tekan Scan kartu lalu tempelkan kartu, atau ketik manual." : "Lihat di menu Perangkat > Kartu tidak terdaftar, atau Serial Monitor alat."}>
          <div className="uid-row">
            <input className="text-input mono" value={f.uid} onChange={(e) => setF({ ...f, uid: e.target.value.toUpperCase() })} placeholder="contoh: 9E6242F2" maxLength={20} />
            {nfcDidukung && <button type="button" className="secondary-button" onClick={() => startScan()}>{scanning ? "Batal" : "Scan kartu"}</button>}
          </div>
        </Field>
        <div className="form-grid">
          <Field label="NIS" error={err.nis}>
            <input className="text-input" inputMode="numeric" value={f.nis} disabled={edit} onChange={(e) => setF({ ...f, nis: e.target.value.replace(/\D/g, "") })} maxLength={20} />
          </Field>
          <Field label="Kelas / bidang" error={err.kelas} hint="Harus sama persis dengan kelas di Jadwal.">
            <input className="text-input" list="kelas-list" value={f.kelas} onChange={(e) => setF({ ...f, kelas: e.target.value })} maxLength={15} placeholder="XI IPS" />
            <datalist id="kelas-list">{kelasList.map((k) => <option key={k} value={k} />)}</datalist>
          </Field>
        </div>
        <Field label="Nama lengkap" error={err.nama}>
          <input className="text-input" value={f.nama} onChange={(e) => setF({ ...f, nama: e.target.value })} maxLength={60} />
        </Field>
        {!edit && <PinInput value={pin} onChange={setPin} error={err.pin} />}
        {err.general && <div className="login-error-box" role="alert"><Icon name="warning" size={17} /><div><span>{err.general}</span></div></div>}
        <div className="modal-actions">
          <button type="button" className="secondary-button" onClick={onClose}>Batal</button>
          <button className="primary-button" disabled={busy}>{busy ? <Spinner /> : null}{edit ? "Simpan" : "Daftarkan"}</button>
        </div>
      </form>
    </Modal>
  );
}

function PinForm({ student, onClose, onDone }: { student: StudentRow; onClose: () => void; onDone: (pin: string) => void }) {
  const notify = useToast();
  const [pin, setPin] = useState(buatPin);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const v = validasiPin(pin);
    if (v) { setErr(v); return; }
    setBusy(true);
    try { await resetPin(student.nis, pin); notify("PIN baru aktif, PIN lama tidak berlaku"); onDone(pin); }
    catch (ex) { setErr((ex as Error).message); setBusy(false); }
  };
  return (
    <Modal title="Reset PIN orang tua" subtitle={`${student.nama} · NIS ${student.nis}`} onClose={onClose}>
      <form className="modal-form" onSubmit={submit} noValidate>
        <PinInput value={pin} onChange={setPin} error={err} />
        <p className="modal-note">PIN lama langsung tidak berlaku. Orang tua yang sedang login akan kehilangan akses.</p>
        <div className="modal-actions">
          <button type="button" className="secondary-button" onClick={onClose}>Batal</button>
          <button className="primary-button" disabled={busy}>{busy ? <Spinner /> : null}Simpan PIN baru</button>
        </div>
      </form>
    </Modal>
  );
}

function PinResult({ nama, nis, pin, onClose }: { nama: string; nis: string; pin: string; onClose: () => void }) {
  const notify = useToast();
  const teks = `Akses presensi ${nama}\nNIS: ${nis}\nPIN: ${pin}\nJangan bagikan PIN ini kepada orang lain.`;
  return (
    <Modal title="PIN orang tua" subtitle="Catat sekarang — PIN tidak dapat dilihat lagi setelah jendela ini ditutup." onClose={onClose} width={420}>
      <div className="pin-card">
        <span>NIS</span><b>{nis}</b>
        <span>PIN</span><b className="mono pin-big">{pin}</b>
      </div>
      <div className="modal-actions">
        <button className="secondary-button" onClick={() => navigator.clipboard.writeText(teks).then(() => notify("Disalin ke clipboard"))}>Salin</button>
        <button className="primary-button" onClick={onClose}>Selesai</button>
      </div>
    </Modal>
  );
}

function IzinForm({ student, onClose }: { student: StudentRow; onClose: () => void }) {
  const { today } = useAdminData();
  const notify = useToast();
  const [tanggal, setTanggal] = useState(today);
  const [ket, setKet] = useState<KetHarian | "">("Sakit");
  const [catatan, setCatatan] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await aturIzin(student.nis, tanggal, ket || null, catatan);
      notify(ket ? `${student.nama}: ${ket} tercatat` : "Keterangan dihapus");
      onClose();
    } catch (ex) { setErr((ex as Error).message); setBusy(false); }
  };
  return (
    <Modal title="Keterangan izin / sakit" subtitle={`${student.nama} · ${student.kelas}`} onClose={onClose}>
      <form className="modal-form" onSubmit={submit}>
        <div className="form-grid">
          <Field label="Tanggal"><input className="text-input" type="date" value={tanggal} max={today} onChange={(e) => setTanggal(e.target.value)} required /></Field>
          <Field label="Keterangan">
            <select className="text-input" value={ket} onChange={(e) => setKet(e.target.value as typeof ket)}>
              <option value="Sakit">Sakit</option><option value="Izin">Izin</option><option value="Dispensasi">Dispensasi (mewakili sekolah)</option><option value="">Hapus keterangan</option>
            </select>
          </Field>
        </div>
        {ket && <Field label="Catatan (opsional)"><input className="text-input" value={catatan} maxLength={200} onChange={(e) => setCatatan(e.target.value)} placeholder="contoh: surat dokter" /></Field>}
        {err && <div className="login-error-box" role="alert"><Icon name="warning" size={17} /><div><span>{err}</span></div></div>}
        <div className="modal-actions">
          <button type="button" className="secondary-button" onClick={onClose}>Batal</button>
          <button className="primary-button" disabled={busy}>{busy ? <Spinner /> : null}Simpan</button>
        </div>
      </form>
    </Modal>
  );
}

function HapusDialog({ student, onClose }: { student: StudentRow; onClose: () => void }) {
  const notify = useToast();
  const [busy, setBusy] = useState(false);
  const [konfirmasi, setKonfirmasi] = useState("");
  return (
    <Modal title="Hapus siswa?" subtitle={`${student.nama} · NIS ${student.nis}`} onClose={onClose} width={420}>
      <p className="modal-note">Kartu tidak bisa dipakai tap lagi dan akses orang tua dicabut. Riwayat presensi tetap tersimpan untuk arsip.</p>
      <Field label={`Ketik NIS ${student.nis} untuk konfirmasi`}>
        <input className="text-input" inputMode="numeric" value={konfirmasi} onChange={(e) => setKonfirmasi(e.target.value)} />
      </Field>
      <div className="modal-actions">
        <button className="secondary-button" onClick={onClose}>Batal</button>
        <button className="danger-button" disabled={busy || konfirmasi !== student.nis} onClick={async () => {
          setBusy(true);
          try { await hapusSiswa(student.uid, student.nis); notify(`${student.nama} dihapus`); onClose(); }
          catch (ex) { notify((ex as Error).message, "err"); setBusy(false); }
        }}>{busy ? <Spinner /> : <Icon name="trash" size={15} />}Hapus</button>
      </div>
    </Modal>
  );
}
