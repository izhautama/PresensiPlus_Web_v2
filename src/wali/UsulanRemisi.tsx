import { useMemo, useState, type FormEvent } from "react";
import { equalTo, orderByChild, query } from "firebase/database";
import Icon from "../components/Icon";
import { Empty, Field, Spinner } from "../components/ui";
import StudentPicker from "../components/StudentPicker";
import { useToast } from "../admin/AdminLayout";
import { useAuth } from "../auth/AuthContext";
import { ringkas, type Remisi } from "../lib/discipline";
import { validasiUsul, type UsulRemisi } from "../lib/pembinaan";
import { formatTanggal } from "../lib/time";
import { useLive } from "../services/db";
import { batalkanUsul, buatUsulRemisi } from "../services/pembinaan";
import { useDisiplinKelas } from "./DisiplinKelas";

const LABEL = { menunggu: "Menunggu keputusan", disetujui: "Disetujui", ditolak: "Ditolak" } as const;
const BADGE = { menunggu: "badge-lemah", disetujui: "badge-aman", ditolak: "badge-gagal" } as const;

/** Usulan remisi oleh wali: wali hanya mengusulkan dan membatalkan usulan sendiri yang menunggu; keputusan ada pada waka/kepala. */
export default function UsulanRemisi() {
  const { session } = useAuth();
  const uid = session?.role === "wali" ? session.uid : "";
  const nama = session?.role === "wali" ? session.nama : "";
  const notify = useToast();
  const d = useDisiplinKelas();
  const master = useLive<Record<string, Remisi>>("discipline/remisi");
  const usul = useLive<Record<string, UsulRemisi>>(uid ? "usulRemisi" : null, (ref) => query(ref, orderByChild("oleh"), equalTo(uid)));
  const [nis, setNis] = useState<string[]>([]);
  const [remId, setRemId] = useState("");
  const [alasan, setAlasan] = useState("");
  const [err, setErr] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [batal, setBatal] = useState("");
  const siswa = useMemo(() => new Map(d.siswa.map((s) => [s.nis, s])), [d.siswa]);

  const daftarRemisi = useMemo(() => Object.entries(master.data ?? {}).filter(([, x]) => x.aktif).sort((a, b) => a[1].kelompok.localeCompare(b[1].kelompok) || b[1].poin - a[1].poin), [master.data]);
  const daftarUsul = useMemo(() => Object.entries(usul.data ?? {}).sort((a, b) => b[1].ts - a[1].ts), [usul.data]);

  const kirim = async (e: FormEvent) => {
    e.preventDefault();
    const s = nis[0] ? siswa.get(nis[0]) : undefined;
    const v: Record<string, string> = {};
    if (!s) v.siswa = "Pilih siswa kelas binaan";
    const remisi = master.data?.[remId];
    const punyaPel = s ? ringkas(d.recs[s.nis], d.ta).pel > 0 : false;
    Object.assign(v, validasiUsul({ remisi, alasan, punyaPelanggaranTa: punyaPel, usulLain: Object.values(usul.data ?? {}), nis: s?.nis ?? "", remId }));
    setErr(v);
    if (Object.keys(v).length || !s || !remisi) return;
    setBusy(true);
    try {
      await buatUsulRemisi({ nis: s.nis, nama: s.nama, remId, remisi, alasan }, { uid, nama });
      notify("Usulan dikirim ke Waka/Kepala");
      setNis([]); setRemId(""); setAlasan("");
    } catch (ex) {
      setErr({ umum: /permission/i.test((ex as Error).message) ? "Usulan ditolak. Pastikan siswa ada di kelas binaan Anda dan remisi masih aktif." : (ex as Error).message });
    } finally { setBusy(false); }
  };

  const batalkan = async (id: string, u: UsulRemisi) => {
    setBatal(id);
    try { await batalkanUsul({ id, usul: u, nama: siswa.get(u.nis)?.nama ?? u.nis }); notify("Usulan dibatalkan"); }
    catch (ex) { notify((ex as Error).message, "err"); }
    finally { setBatal(""); }
  };

  return (
    <section className="data-page" data-testid="halaman-usulan">
      <div className="section-heading"><div><p>Usulan remisi</p><span>Usulkan pengurangan poin untuk siswa binaan. Keputusan ada pada Waka Kesiswaan atau Kepala Madrasah.</span></div></div>

      <article className="panel master-group">
        <div className="panel-header"><div><p className="panel-title">Buat usulan</p><span>Nama dan poin remisi mengikuti daftar resmi tata tertib dan tidak dapat diubah.</span></div></div>
        <form className="modal-form" onSubmit={kirim} noValidate data-testid="form-usulan">
          <Field label="Siswa" error={err.siswa}><StudentPicker students={d.siswa} value={nis} onChange={setNis} /></Field>
          <Field label="Remisi" error={err.remisi}>
            <select className="text-input" value={remId} onChange={(e) => setRemId(e.target.value)} aria-label="Remisi">
              <option value="">Pilih remisi…</option>
              {daftarRemisi.map(([id, x]) => <option key={id} value={id}>{x.kelompok} · {x.nama} (−{x.poin} poin)</option>)}
            </select>
          </Field>
          <Field label="Alasan usulan" error={err.alasan} hint={`${alasan.trim().length}/300 · minimal 10 karakter`}>
            <textarea className="text-input" rows={3} value={alasan} maxLength={300} onChange={(e) => setAlasan(e.target.value)} />
          </Field>
          {err.umum && <div className="login-error-box" role="alert"><Icon name="warning" size={17} /><div><span>{err.umum}</span></div></div>}
          <div className="modal-actions" style={{ justifyContent: "flex-start" }}><button className="primary-button" disabled={busy}>{busy ? <Spinner /> : null}Kirim usulan</button></div>
        </form>
      </article>

      <article className="panel master-group">
        <div className="panel-header"><div><p className="panel-title">Usulan saya</p><span>Usulan yang masih menunggu dapat dibatalkan</span></div></div>
        {usul.loading ? <div className="page-loader"><Spinner dark /></div> : daftarUsul.length === 0 ? <Empty icon="file" title="Belum ada usulan" /> : (
          <div className="simple-list" data-testid="daftar-usulan">
            {daftarUsul.map(([id, u]) => (
              <div key={id} data-status={u.status} data-nis={u.nis}>
                <span><b>{siswa.get(u.nis)?.nama ?? u.nis}</b><small>{u.nama} (−{u.poin} poin)</small></span>
                <span>
                  <small className={`badge ${BADGE[u.status]}`}>{LABEL[u.status]}</small>
                  <small>{formatTanggal(new Date(u.ts + 7 * 3600_000).toISOString().slice(0, 10))} · {u.alasan}</small>
                  {u.alasanKeputusan && <small>Keputusan: {u.alasanKeputusan}</small>}
                </span>
                <span className="row-actions">{u.status === "menunggu" && <button className="ghost-button" disabled={batal === id} onClick={() => batalkan(id, u)} aria-label={`Batalkan usulan ${u.nama}`}>Batalkan</button>}</span>
              </div>
            ))}
          </div>
        )}
      </article>
    </section>
  );
}
