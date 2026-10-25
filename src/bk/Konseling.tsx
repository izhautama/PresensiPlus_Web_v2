import { useMemo, useState, type FormEvent } from "react";
import Icon from "../components/Icon";
import StudentPicker from "../components/StudentPicker";
import { Empty, Field, Modal, Spinner } from "../components/ui";
import { useAdminData } from "../admin/AdminData";
import { usePanelMode, useToast } from "../admin/AdminLayout";
import { useAuth } from "../auth/AuthContext";
import { BATAS_ISI, TOPIK_KONSELING, ringkasIsi, urutKonseling, validasiKonseling, type AuditKonseling, type FormKonseling, type Konseling } from "../lib/konseling";
import { formatTanggal } from "../lib/time";
import type { StudentRow } from "../lib/types";
import { useLive } from "../services/db";
import { buatKonseling, ubahKonseling } from "../services/konseling";

type PerNis<T> = Record<string, Record<string, T>>;
export type DialogKonseling = { nis?: string; id?: string; k?: Konseling } | null;

/** Dialog catat/koreksi konseling. Koreksi menyimpan isi lama ke jejak khusus (konselingAudit) pada update yang sama. */
export function KonselingDialog({ dialog, siswa, today, onClose }: { dialog: NonNullable<DialogKonseling>; siswa: StudentRow[]; today: string; onClose: () => void }) {
  const { session } = useAuth();
  const notify = useToast();
  const ubah = Boolean(dialog.id && dialog.k);
  const [nis, setNis] = useState<string[]>(dialog.nis ? [dialog.nis] : []);
  const [f, setF] = useState<FormKonseling>({ tanggal: dialog.k?.tanggal ?? today, topik: dialog.k?.topik ?? "Pribadi", isi: dialog.k?.isi ?? "", tindakLanjut: dialog.k?.tindakLanjut ?? "" });
  const [err, setErr] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const ctx = { uid: session?.role === "bk" ? session.uid : "", nama: session?.role === "bk" ? session.nama : "" };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const v = validasiKonseling(f, today);
    if (!ubah && !nis[0]) v.siswa = "Pilih siswa";
    setErr(v);
    if (Object.keys(v).length) return;
    setBusy(true);
    try {
      if (ubah) await ubahKonseling({ nis: dialog.nis!, id: dialog.id!, lama: dialog.k!, form: f }, ctx);
      else await buatKonseling({ nis: nis[0], form: f }, ctx);
      notify(ubah ? "Catatan konseling dikoreksi" : "Catatan konseling disimpan");
      onClose();
    } catch (ex) {
      const m = (ex as Error).message ?? "";
      setErr({ umum: /permission/i.test(m) ? "Ditolak: hanya pembuat catatan yang boleh mengoreksi, dan siswa harus terdaftar di indeks kelas." : m });
    } finally { setBusy(false); }
  };

  const nama = siswa.find((s) => s.nis === (dialog.nis ?? nis[0]))?.nama;
  return (
    <Modal title={ubah ? "Koreksi catatan konseling" : "Catatan konseling baru"} subtitle={nama ? `${nama} · rahasia` : "Rahasia: hanya akun BK yang dapat membaca"} onClose={onClose} width={580}>
      <form className="modal-form" onSubmit={submit} noValidate data-testid="form-konseling">
        {!ubah && !dialog.nis && <Field label="Siswa" error={err.siswa}><StudentPicker students={siswa} value={nis} onChange={setNis} /></Field>}
        <div className="form-grid">
          <Field label="Tanggal konseling" error={err.tanggal}><input className="text-input" type="date" value={f.tanggal} max={today} onChange={(e) => setF({ ...f, tanggal: e.target.value })} /></Field>
          <Field label="Topik" error={err.topik}>
            <select className="text-input" value={f.topik} onChange={(e) => setF({ ...f, topik: e.target.value })} aria-label="Topik konseling">
              {TOPIK_KONSELING.map((t) => <option key={t}>{t}</option>)}
            </select>
          </Field>
        </div>
        <Field label="Isi konseling" error={err.isi} hint={`${f.isi.trim().length}/${BATAS_ISI.max} · minimal ${BATAS_ISI.min} karakter`}>
          <textarea className="text-input" rows={6} value={f.isi} maxLength={BATAS_ISI.max} onChange={(e) => setF({ ...f, isi: e.target.value })} aria-label="Isi konseling" />
        </Field>
        <Field label="Tindak lanjut (opsional)" error={err.tindakLanjut} hint={`${f.tindakLanjut.trim().length}/${BATAS_ISI.tindakLanjut}`}>
          <textarea className="text-input" rows={2} value={f.tindakLanjut} maxLength={BATAS_ISI.tindakLanjut} onChange={(e) => setF({ ...f, tindakLanjut: e.target.value })} aria-label="Tindak lanjut konseling" />
        </Field>
        <p className="modal-note">Catatan ini tidak tampil di portal orang tua, laporan, maupun log aktivitas (log hanya mencatat bahwa sebuah catatan dibuat). {ubah && "Isi lama disimpan di jejak koreksi khusus yang hanya terbaca BK dan Kepala."}</p>
        {err.umum && <div className="login-error-box" role="alert"><Icon name="warning" size={17} /><div><span>{err.umum}</span></div></div>}
        <div className="modal-actions">
          <button type="button" className="secondary-button" onClick={onClose}>Batal</button>
          <button className="primary-button" disabled={busy}>{busy ? <Spinner /> : null}Simpan</button>
        </div>
      </form>
    </Modal>
  );
}

/** Daftar catatan konseling rahasia (v2.5): hanya akun BK; tulis/koreksi catatan sendiri. */
export default function KonselingHalaman() {
  const mode = usePanelMode();
  const bk = mode === "bk";
  const { session } = useAuth();
  const uid = session?.role === "bk" ? session.uid : "";
  const { students, today, ready } = useAdminData();
  const data = useLive<PerNis<Konseling>>("konseling");
  const audit = useLive<PerNis<AuditKonseling>>("konselingAudit");
  const [q, setQ] = useState("");
  const [topik, setTopik] = useState("");
  const [dlg, setDlg] = useState<DialogKonseling>(null);
  const [buka, setBuka] = useState("");
  const siswa = useMemo(() => new Map(students.map((s) => [s.nis, s])), [students]);

  const daftar = useMemo(() => {
    const out: { nis: string; id: string; k: Konseling }[] = [];
    for (const [nis, per] of Object.entries(data.data ?? {})) for (const [id, k] of Object.entries(per)) out.push({ nis, id, k });
    const qq = q.trim().toLowerCase();
    return urutKonseling(out).filter(({ nis, k }) => (!topik || k.topik === topik) && (!qq || `${siswa.get(nis)?.nama ?? ""} ${nis} ${k.isi} ${k.olehNama}`.toLowerCase().includes(qq)));
  }, [data.data, q, topik, siswa]);

  return (
    <section className="data-page" data-testid="halaman-konseling">
      <div className="section-heading">
        <div><p>Konseling</p><span><Icon name="eye" size={14} /> Catatan RAHASIA · hanya akun BK yang dapat membaca{bk ? "" : " · Anda hanya membaca"}</span></div>
        {bk && <button className="primary-button" onClick={() => setDlg({})}><Icon name="plus" size={16} />Catatan baru</button>}
      </div>
      <div className="filter-bar">
        <div className="search search-inline"><Icon name="search" size={18} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari siswa atau isi catatan..." aria-label="Cari konseling" /></div>
        <select className="text-input auto" value={topik} onChange={(e) => setTopik(e.target.value)} aria-label="Filter topik"><option value="">Semua topik</option>{TOPIK_KONSELING.map((t) => <option key={t}>{t}</option>)}</select>
      </div>
      {data.error && <div className="notice warn" role="alert"><Icon name="warning" size={17} /><span>Catatan tidak dapat dimuat ({data.error}).</span></div>}
      <article className="panel master-group">
        {data.loading || !ready ? <div className="page-loader"><Spinner dark /></div> : daftar.length === 0 ? <Empty icon="file" title="Belum ada catatan konseling" text={bk ? "Tekan Catatan baru untuk mencatat sesi konseling." : "BK belum mencatat sesi konseling."} /> : (
          <div className="simple-list" data-testid="daftar-konseling">
            {daftar.map(({ nis, id, k }) => {
              const koreksi = Object.values(audit.data?.[nis] ?? {}).filter((a) => a.konselingId === id).sort((a, b) => b.ts - a.ts);
              const terbuka = buka === id;
              return (
                <div key={id} data-nis={nis} data-topik={k.topik}>
                  <span><b>{siswa.get(nis)?.nama ?? nis}</b><small>{siswa.get(nis)?.kelas ?? ""} · NIS {nis} · {formatTanggal(k.tanggal, false)}</small></span>
                  <span>
                    <small className="badge badge-izin">{k.topik}</small>
                    <small>{terbuka ? k.isi : ringkasIsi(k.isi)}</small>
                    {terbuka && k.tindakLanjut && <small>Tindak lanjut: {k.tindakLanjut}</small>}
                    <small className="muted">oleh {k.olehNama}{k.diubahTs ? " · dikoreksi" : ""}</small>
                    {terbuka && koreksi.length > 0 && (
                      <small data-testid="riwayat-koreksi">Riwayat koreksi: {koreksi.map((a) => `${formatTanggal(new Date(a.ts + 7 * 3600_000).toISOString().slice(0, 10), false)} (isi lama: "${ringkasIsi(a.sebelum.isi, 60)}")`).join("; ")}</small>
                    )}
                  </span>
                  <span className="row-actions">
                    <button className="ghost-button" onClick={() => setBuka(terbuka ? "" : id)} aria-label={`${terbuka ? "Tutup" : "Buka"} catatan ${siswa.get(nis)?.nama ?? nis}`}>{terbuka ? "Tutup" : "Buka"}</button>
                    {bk && k.oleh === uid && <button className="ghost-button" onClick={() => setDlg({ nis, id, k })} aria-label={`Koreksi catatan ${siswa.get(nis)?.nama ?? nis}`}>Koreksi</button>}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </article>
      {dlg && <KonselingDialog dialog={dlg} siswa={students} today={today} onClose={() => setDlg(null)} />}
    </section>
  );
}
