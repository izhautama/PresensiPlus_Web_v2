import { useState, type FormEvent } from "react";
import Icon from "../components/Icon";
import { Empty, Field, Modal, Spinner } from "../components/ui";
import { ORTU_DOMAIN } from "../lib/firebase";
import { formatTanggal } from "../lib/time";
import {
  MAKS_STAF, PERAN_STAF, PERAN_STAF_UMUM, PeranGagal, buatAkunStaf, cabutAkunStaf, kirimResetPassword, kunciAkunPiket, pasangPeranStaf, useLive,
  type PeranStaf, type Staff,
} from "../services/db";
import { useToast } from "./AdminLayout";

const tgl = (ms: number) => formatTanggal(new Date(ms + 7 * 3600_000).toISOString().slice(0, 10));

export default function StaffAccounts() {
  const staff = useLive<Record<string, Staff>>("staff");
  const akunPiket = useLive<Record<string, { terkunci?: boolean }>>("piketAkun");
  const notify = useToast();
  const [tambah, setTambah] = useState(false);
  const [cabut, setCabut] = useState<{ uid: string; s: Staff } | null>(null);
  const [reset, setReset] = useState("");
  // wali kelas punya panel sendiri (Wali kelas) karena butuh pemetaan kelas; tidak dihitung dalam batas akun pimpinan/staf
  const daftar = Object.entries(staff.data ?? {}).filter(([, s]) => s.role !== "wali").sort((a, b) => a[1].dibuat - b[1].dibuat);
  const penuh = daftar.length >= MAKS_STAF;

  const [kunciBusy, setKunciBusy] = useState("");
  const kunci = async (uid: string, s: Staff, nilai: boolean) => {
    setKunciBusy(uid);
    try { await kunciAkunPiket(uid, nilai, { email: s.email, nama: s.nama }); notify(nilai ? `Akun ${s.nama} dikunci` : `Kunci akun ${s.nama} dibuka`); }
    catch (e) { notify((e as Error).message, "err"); }
    finally { setKunciBusy(""); }
  };

  const kirimReset = async (email: string) => {
    setReset(email);
    try { await kirimResetPassword(email); notify(`Email reset password dikirim ke ${email}`); }
    catch (e) { notify((e as Error).message, "err"); }
    finally { setReset(""); }
  };

  return (
    <article className="panel kepala-panel">
      <div className="panel-header">
        <div><p className="panel-title">Akun Pimpinan &amp; Staf</p><span>Kepala Madrasah dan Waka Kesiswaan · maks. {MAKS_STAF} akun</span></div>
        <button className="primary-button" onClick={() => setTambah(true)} disabled={penuh} title={penuh ? `Maksimal ${MAKS_STAF} akun` : undefined}><Icon name="plus" size={16} />Tambah akun</button>
      </div>
      {staff.error ? <Empty icon="alert" title="Gagal memuat daftar akun" text={staff.error} /> : staff.loading ? <div className="page-loader"><Spinner dark /></div> : daftar.length === 0 ? (
        <Empty icon="users" title="Belum ada akun pimpinan/staf" text="Klik Tambah akun untuk membuat satu." />
      ) : (
        <div className="simple-list">
          {daftar.map(([uid, s]) => (
            <div key={uid}>
              <span><b>{s.nama}</b><small>{PERAN_STAF[s.role] ?? s.role} · {s.email} · dibuat {tgl(s.dibuat)}{akunPiket.data?.[uid]?.terkunci ? " · TERKUNCI" : ""}</small></span>
              <span className="row-actions">
                {s.role === "piket" && (akunPiket.data?.[uid]?.terkunci
                  ? <button title="Buka kunci akun piket" aria-label={`Buka kunci ${s.nama}`} disabled={kunciBusy === uid} onClick={() => kunci(uid, s, false)}><Icon name="check" size={16} /></button>
                  : <button title="Kunci darurat akun piket (langsung keluar)" aria-label={`Kunci ${s.nama}`} className="danger" disabled={kunciBusy === uid} onClick={() => kunci(uid, s, true)}><Icon name="lock" size={16} /></button>)}
                <button title="Kirim email reset password" aria-label={`Reset password ${s.nama}`} disabled={reset === s.email} onClick={() => kirimReset(s.email)}><Icon name="key" size={16} /></button>
                <button title="Cabut akses" aria-label={`Cabut akses ${s.nama}`} className="danger" onClick={() => setCabut({ uid, s })}><Icon name="trash" size={16} /></button>
              </span>
            </div>
          ))}
        </div>
      )}
      {tambah && <TambahDialog onClose={() => setTambah(false)} />}
      {cabut && <CabutDialog uid={cabut.uid} s={cabut.s} onClose={() => setCabut(null)} />}
    </article>
  );
}

function TambahDialog({ onClose }: { onClose: () => void }) {
  const notify = useToast();
  const [f, setF] = useState({ nama: "", email: "", password: "", ulang: "" });
  const [role, setRole] = useState<PeranStaf>("waka");
  const [err, setErr] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [gagal, setGagal] = useState<PeranGagal | null>(null); // akun Auth ada, peran belum terpasang

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const nama = f.nama.trim().replace(/\s+/g, " ");
    const email = f.email.trim().toLowerCase();
    const v: Record<string, string> = {};
    if (!nama) v.nama = "Nama wajib diisi"; else if (nama.length > 60) v.nama = "Nama maksimal 60 karakter";
    if (!/^\S+@\S+\.\S+$/.test(email) || email.length > 120) v.email = "Masukkan email asli yang valid";
    else if (email.endsWith(`@${ORTU_DOMAIN}`)) v.email = "Domain email ini dicadangkan untuk akun orang tua";
    if (f.password.length < 8) v.password = "Password sementara minimal 8 karakter";
    if (f.password !== f.ulang) v.ulang = "Konfirmasi password tidak sama";
    setErr(v);
    if (Object.keys(v).length) return;
    setBusy(true);
    try {
      await buatAkunStaf(nama, email, f.password, role);
      notify(`Akun ${nama} dibuat`);
      onClose();
    } catch (ex) {
      if (ex instanceof PeranGagal) { setGagal(ex); }
      else {
        const code = (ex as { code?: string }).code;
        const pesan = code === "auth/email-already-in-use" ? "Email ini sudah terdaftar di Firebase Authentication. Gunakan email lain, atau beri peran lewat Console bila akun itu memang milik kepala."
          : code === "auth/weak-password" ? "Password terlalu lemah, gunakan kombinasi lain."
          : code === "auth/invalid-email" ? "Format email tidak valid."
          : code === "auth/network-request-failed" ? "Tidak ada koneksi internet."
          : (ex as Error).message;
        setErr({ general: pesan });
      }
    } finally { setBusy(false); }
  };

  const coba = async () => {
    if (!gagal) return;
    setBusy(true);
    try {
      await pasangPeranStaf(gagal.uid, gagal.email, gagal.nama, gagal.role);
      notify(`Peran ${gagal.nama} terpasang`);
      onClose();
    } catch (ex) { setGagal(new PeranGagal(gagal.uid, gagal.email, gagal.nama, gagal.role, (ex as Error).message)); }
    finally { setBusy(false); }
  };

  if (gagal) {
    return (
      <Modal title="Akun dibuat, peran belum terpasang" subtitle={gagal.email} onClose={onClose}>
        <div className="login-error-box" role="alert"><Icon name="warning" size={17} /><div><span>{gagal.message}</span></div></div>
        <p className="modal-note">Akun login sudah terbuat di Firebase Authentication, tetapi belum bisa masuk karena peran belum tersimpan. Pastikan Security Rules terbaru sudah di-deploy (<code>npm run deploy</code>), lalu coba lagi. UID akun: <code>{gagal.uid}</code></p>
        <div className="modal-actions">
          <button className="secondary-button" onClick={onClose}>Tutup</button>
          <button className="primary-button" onClick={coba} disabled={busy}>{busy ? <Spinner /> : null}Coba pasang peran lagi</button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal title="Tambah akun pimpinan / staf" subtitle="Pilih peran sesuai tugas. Akun hanya mendapat hak akses perannya." onClose={onClose}>
      <form className="modal-form" onSubmit={submit} noValidate>
        <Field label="Peran" hint={role === "kepala" ? "Memantau seluruh data, mencatat izin/sakit, dan mengelola kesiswaan." : role === "waka" ? "Mengelola validasi harian, presensi per jam, dan pelanggaran/remisi." : "Akun BERSAMA meja piket: izin harian & per jam (S/I/D) dan pelanggaran ringan. Gunakan nama akun seperti 'Meja Piket'; nama petugas dipilih di aplikasi."}>
          <select className="text-input" value={role} onChange={(e) => setRole(e.target.value as PeranStaf)}>
            {PERAN_STAF_UMUM.map((k) => <option key={k} value={k}>{PERAN_STAF[k]}</option>)}
          </select>
        </Field>
        <Field label="Nama lengkap" error={err.nama}><input className="text-input" value={f.nama} maxLength={60} onChange={(e) => setF({ ...f, nama: e.target.value })} /></Field>
        <Field label="Email (harus email asli)" error={err.email} hint="Dipakai untuk login dan menerima email reset password."><input className="text-input" type="email" autoComplete="off" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
        <div className="form-grid">
          <Field label="Password sementara" error={err.password} hint="Minimal 8 karakter."><input className="text-input" type="password" autoComplete="new-password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} /></Field>
          <Field label="Ulangi password" error={err.ulang}><input className="text-input" type="password" autoComplete="new-password" value={f.ulang} onChange={(e) => setF({ ...f, ulang: e.target.value })} /></Field>
        </div>
        {err.general && <div className="login-error-box" role="alert"><Icon name="warning" size={17} /><div><span>{err.general}</span></div></div>}
        <p className="modal-note">Sampaikan password sementara secara langsung, lalu minta pemilik akun menggantinya di menu Pengaturan.</p>
        <div className="modal-actions">
          <button type="button" className="secondary-button" onClick={onClose}>Batal</button>
          <button className="primary-button" disabled={busy}>{busy ? <Spinner /> : null}Buat akun</button>
        </div>
      </form>
    </Modal>
  );
}

function CabutDialog({ uid, s, onClose }: { uid: string; s: Staff; onClose: () => void }) {
  const notify = useToast();
  const [k, setK] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <Modal title="Cabut akses?" subtitle={`${s.nama} · ${s.email}`} onClose={onClose} width={440}>
      <p className="modal-note">Peran dihapus sehingga akun ini langsung tidak bisa masuk (sesi yang sedang aktif ikut ditutup). Akun login masih tersimpan di Firebase Authentication; untuk menghapus permanen, buka Firebase Console &gt; Authentication (SDK web tidak bisa menghapus pengguna lain tanpa Cloud Functions).</p>
      <Field label={`Ketik ${s.email} untuk konfirmasi`}><input className="text-input" value={k} onChange={(e) => setK(e.target.value)} autoComplete="off" /></Field>
      <div className="modal-actions">
        <button className="secondary-button" onClick={onClose}>Batal</button>
        <button className="danger-button" disabled={busy || k.trim().toLowerCase() !== s.email.toLowerCase()} onClick={async () => {
          setBusy(true);
          try { await cabutAkunStaf(uid); notify(`Akses ${s.nama} dicabut`); onClose(); }
          catch (ex) { notify((ex as Error).message, "err"); setBusy(false); }
        }}>{busy ? <Spinner /> : <Icon name="trash" size={15} />}Cabut akses</button>
      </div>
    </Modal>
  );
}
