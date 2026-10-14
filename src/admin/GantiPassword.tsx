import { useState, type FormEvent } from "react";
import Icon from "../components/Icon";
import { Field, Spinner } from "../components/ui";
import { useAuth } from "../auth/AuthContext";
import { gantiPasswordAdmin } from "../services/auth";
import { useToast } from "./AdminLayout";

/** Panel ganti password akun yang sedang login (admin maupun kepala). */
export default function GantiPassword({ judul }: { judul: string }) {
  const { session } = useAuth();
  const notify = useToast();
  const [lama, setLama] = useState("");
  const [baru, setBaru] = useState("");
  const [ulang, setUlang] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (baru.length < 10) { setErr("Password baru minimal 10 karakter"); return; }
    if (baru !== ulang) { setErr("Konfirmasi password tidak sama"); return; }
    setBusy(true); setErr("");
    try {
      await gantiPasswordAdmin(lama, baru);
      setLama(""); setBaru(""); setUlang("");
      notify("Password diperbarui");
    } catch (ex) {
      const code = (ex as { code?: string }).code;
      setErr(code === "auth/invalid-credential" || code === "auth/wrong-password" ? "Password lama salah" : (ex as Error).message);
    } finally { setBusy(false); }
  };

  return (
    <article className="panel">
      <div className="panel-header"><div><p className="panel-title">{judul}</p><span>{session && session.role !== "ortu" ? session.email : ""}</span></div></div>
      <form className="modal-form" onSubmit={submit}>
        <Field label="Password lama"><input className="text-input" type="password" autoComplete="current-password" value={lama} onChange={(e) => setLama(e.target.value)} required /></Field>
        <Field label="Password baru" hint="Minimal 10 karakter, campur huruf & angka."><input className="text-input" type="password" autoComplete="new-password" value={baru} onChange={(e) => setBaru(e.target.value)} required /></Field>
        <Field label="Ulangi password baru"><input className="text-input" type="password" autoComplete="new-password" value={ulang} onChange={(e) => setUlang(e.target.value)} required /></Field>
        {err && <div className="login-error-box" role="alert"><Icon name="warning" size={17} /><div><span>{err}</span></div></div>}
        <div className="modal-actions"><button className="primary-button" disabled={busy}>{busy ? <Spinner /> : null}Simpan password</button></div>
      </form>
    </article>
  );
}
