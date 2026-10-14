import { useState, type FormEvent } from "react";
import Icon from "../components/Icon";
import { Field, Modal, Spinner } from "../components/ui";

/**
 * Setiap izin yang diinput piket WAJIB berketerangan (3–200 karakter) dan mencatat apakah surat fisik sudah diterima.
 * Tidak ada upload file: arsip surat disimpan manual di map dokumen.
 */
export default function KeteranganDialog({ judul, subjudul, tombol = "Simpan", onSubmit, onClose, children }: {
  judul: string; subjudul?: string; tombol?: string; onClose: () => void;
  onSubmit: (keterangan: string, suratDiterima: boolean) => Promise<void>;
  children?: React.ReactNode;
}) {
  const [keterangan, setKeterangan] = useState("");
  const [surat, setSurat] = useState(false);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const k = keterangan.trim();
    if (k.length < 3) { setErr("Keterangan wajib diisi (minimal 3 karakter)"); return; }
    if (k.length > 200) { setErr("Keterangan maksimal 200 karakter"); return; }
    setBusy(true); setErr("");
    try { await onSubmit(k, surat); } catch (ex) { setErr((ex as Error).message); setBusy(false); }
  };
  return (
    <Modal title={judul} subtitle={subjudul} onClose={onClose} width={480}>
      <form className="modal-form" onSubmit={submit} noValidate>
        {children}
        <Field label="Keterangan (wajib)" hint="Contoh: Surat dokter RS X, diantar ayah. / Dispensasi lomba MTQ kabupaten.">
          <textarea className="text-input area" rows={3} maxLength={200} value={keterangan} onChange={(e) => setKeterangan(e.target.value)} />
        </Field>
        <label className="check-inline"><input type="checkbox" checked={surat} onChange={(e) => setSurat(e.target.checked)} />Surat fisik diterima</label>
        <p className="modal-note">Arsip surat disimpan manual di map dokumen (tidak ada unggah file).</p>
        {err && <div className="login-error-box" role="alert"><Icon name="warning" size={17} /><div><span>{err}</span></div></div>}
        <div className="modal-actions">
          <button type="button" className="secondary-button" onClick={onClose}>Batal</button>
          <button className="primary-button" disabled={busy}>{busy ? <Spinner /> : null}{tombol}</button>
        </div>
      </form>
    </Modal>
  );
}
