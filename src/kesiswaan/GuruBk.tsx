import { useMemo, useState, type FormEvent } from "react";
import Icon from "../components/Icon";
import { Empty, Field, Modal, Spinner } from "../components/ui";
import { usePanelMode, useToast } from "../admin/AdminLayout";
import { ORTU_DOMAIN } from "../lib/firebase";
import { PeranGagal, kirimResetPassword, useLive } from "../services/db";
import { buatAkunBk, cabutBk, pasangAkunBk, pasangKembaliBk, type BkAkun, type Pengelola } from "../services/bk";

/**
 * Pengelolaan akun Guru BK (akun per guru; wewenang lintas semua kelas, tanpa wewenang izin/Alfa/presensi).
 * ADMIN dan WAKA dapat membuat/mencabut akun; catatan konseling hanya dapat dibaca BK dan Kepala (bukan pengelola akun).
 */
export default function GuruBk() {
  const mode = usePanelMode();
  const oleh: Pengelola = mode === "admin" ? "admin" : "waka";
  const notify = useToast();
  const live = useLive<Record<string, BkAkun>>("bkAkun");
  const daftar = useMemo(() => Object.entries(live.data ?? {}).sort((a, b) => a[1].nama.localeCompare(b[1].nama)), [live.data]);
  const [tambah, setTambah] = useState(false);
  const [busy, setBusy] = useState("");

  const aksi = async (uid: string, w: BkAkun, apa: "cabut" | "pasang" | "reset") => {
    setBusy(`${apa}-${uid}`);
    try {
      if (apa === "cabut") { await cabutBk(uid, w.email); notify(`Akses ${w.nama} dicabut`); }
      else if (apa === "pasang") { await pasangKembaliBk(uid, w.email); notify(`Akses ${w.nama} dipasang kembali`); }
      else { await kirimResetPassword(w.email); notify(`Email reset password dikirim ke ${w.email}`); }
    } catch (e) { notify((e as Error).message, "err"); }
    finally { setBusy(""); }
  };

  return (
    <section className="data-page" data-testid="halaman-guru-bk">
      <div className="section-heading">
        <div><p>Guru BK</p><span>Akun per guru · wewenang lintas semua kelas untuk pembinaan, pelanggaran ringan, usulan remisi, dan catatan konseling rahasia</span></div>
        <div className="heading-actions"><button className="primary-button" onClick={() => setTambah(true)}><Icon name="plus" size={16} />Tambah guru BK</button></div>
      </div>
      <article className="panel master-group" data-testid="daftar-bk">
        {live.error ? <Empty icon="alert" title="Gagal memuat" text={live.error} /> : live.loading ? <div className="page-loader"><Spinner dark /></div> : daftar.length === 0 ? (
          <Empty icon="users" title="Belum ada guru BK" text="Tambahkan akun untuk tiap guru BK. Isi catatan konseling hanya dapat dibaca BK dan Kepala Madrasah." />
        ) : (
          <div className="simple-list">
            {daftar.map(([uid, w]) => (
              <div key={uid} data-uid={uid} className={w.aktif ? "" : "petugas-nonaktif"}>
                <span><b>{w.nama}</b><small>{w.email}</small></span>
                <span><small className={`badge ${w.aktif ? "badge-aman" : "badge-lemah"}`}>{w.aktif ? "Aktif" : "Dicabut"}</small></span>
                <span className="row-actions">
                  {w.aktif
                    ? <button className="ghost-button" aria-label={`Cabut ${w.nama}`} disabled={busy === `cabut-${uid}`} onClick={() => aksi(uid, w, "cabut")}>Cabut</button>
                    : <button className="ghost-button" aria-label={`Pasang kembali ${w.nama}`} disabled={busy === `pasang-${uid}`} onClick={() => aksi(uid, w, "pasang")}>Pasang kembali</button>}
                  {oleh === "admin" && <button className="ghost-button" aria-label={`Reset password ${w.nama}`} disabled={busy === `reset-${uid}`} onClick={() => aksi(uid, w, "reset")}>Reset password</button>}
                </span>
              </div>
            ))}
          </div>
        )}
      </article>
      {tambah && <FormBk oleh={oleh} onClose={() => setTambah(false)} />}
    </section>
  );
}

function FormBk({ oleh, onClose }: { oleh: Pengelola; onClose: () => void }) {
  const notify = useToast();
  const [f, setF] = useState({ nama: "", email: "", password: "", ulang: "" });
  const [err, setErr] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [gagal, setGagal] = useState<PeranGagal | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const v: Record<string, string> = {};
    const nama = f.nama.trim().replace(/\s+/g, " ");
    const email = f.email.trim().toLowerCase();
    if (!nama) v.nama = "Nama wajib diisi"; else if (nama.length > 60) v.nama = "Nama maksimal 60 karakter";
    if (!/^\S+@\S+\.\S+$/.test(email) || email.length > 120) v.email = "Masukkan email asli yang valid";
    else if (email.endsWith(`@${ORTU_DOMAIN}`)) v.email = "Domain email ini dicadangkan untuk akun orang tua";
    if (f.password.length < 8) v.password = "Password sementara minimal 8 karakter";
    if (f.password !== f.ulang) v.ulang = "Konfirmasi password tidak sama";
    setErr(v);
    if (Object.keys(v).length) return;
    setBusy(true);
    try { await buatAkunBk({ nama, email, password: f.password }, oleh); notify(`Akun BK ${nama} dibuat`); onClose(); }
    catch (ex) {
      if (ex instanceof PeranGagal) setGagal(ex);
      else {
        const code = (ex as { code?: string }).code;
        setErr({ umum: code === "auth/email-already-in-use" ? "Email ini sudah terdaftar di Firebase Authentication." : code === "auth/weak-password" ? "Password terlalu lemah." : (ex as Error).message });
      }
    } finally { setBusy(false); }
  };

  const coba = async () => {
    if (!gagal) return;
    setBusy(true);
    try { await pasangAkunBk(gagal.uid, gagal.nama, gagal.email, oleh); notify(`Peran ${gagal.nama} terpasang`); onClose(); }
    catch (ex) { setGagal(new PeranGagal(gagal.uid, gagal.email, gagal.nama, gagal.role, (ex as Error).message)); }
    finally { setBusy(false); }
  };

  if (gagal) {
    return (
      <Modal title="Akun dibuat, peran belum terpasang" subtitle={gagal.email} onClose={onClose}>
        <div className="login-error-box" role="alert"><Icon name="warning" size={17} /><div><span>{gagal.message}</span></div></div>
        <p className="modal-note">Akun login sudah terbuat tetapi belum bisa masuk karena peran belum tersimpan. Pastikan Security Rules terbaru sudah di-deploy, lalu coba lagi.</p>
        <div className="modal-actions"><button className="secondary-button" onClick={onClose}>Tutup</button><button className="primary-button" onClick={coba} disabled={busy}>{busy ? <Spinner /> : null}Coba pasang lagi</button></div>
      </Modal>
    );
  }

  return (
    <Modal title="Tambah guru BK" subtitle="Akun per guru, wewenang lintas semua kelas" onClose={onClose}>
      <form className="modal-form" onSubmit={submit} noValidate>
        <Field label="Nama lengkap guru" error={err.nama}><input className="text-input" value={f.nama} maxLength={60} onChange={(e) => setF({ ...f, nama: e.target.value })} aria-label="Nama guru BK" /></Field>
        <Field label="Email (harus email asli)" error={err.email} hint="Dipakai untuk login dan reset password."><input className="text-input" type="email" autoComplete="off" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} aria-label="Email guru BK" /></Field>
        <div className="form-grid">
          <Field label="Password sementara" error={err.password} hint="Minimal 8 karakter."><input className="text-input" type="password" autoComplete="new-password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} aria-label="Password sementara" /></Field>
          <Field label="Ulangi password" error={err.ulang}><input className="text-input" type="password" autoComplete="new-password" value={f.ulang} onChange={(e) => setF({ ...f, ulang: e.target.value })} aria-label="Ulangi password" /></Field>
        </div>
        {err.umum && <div className="login-error-box" role="alert"><Icon name="warning" size={17} /><div><span>{err.umum}</span></div></div>}
        <div className="modal-actions">
          <button type="button" className="secondary-button" onClick={onClose}>Batal</button>
          <button className="primary-button" disabled={busy}>{busy ? <Spinner /> : null}Simpan</button>
        </div>
      </form>
    </Modal>
  );
}
