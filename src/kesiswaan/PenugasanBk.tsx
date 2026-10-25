import { useMemo, useState, type FormEvent } from "react";
import Icon from "../components/Icon";
import { Empty, Field, Modal, Spinner } from "../components/ui";
import { useAdminData } from "../admin/AdminData";
import { useToast } from "../admin/AdminLayout";
import { labelTa, taKey } from "../lib/discipline";
import { daftarPerluDibina, idPembinaan, type ItemDibina, type KlaimBk, type Pembinaan } from "../lib/pembinaan";
import { useLive } from "../services/db";
import type { BkAkun } from "../services/bk";
import { tunjukBk } from "../services/pembinaanLanjut";
import { useActor, useDiscipline } from "./useDiscipline";

type PerNis<T> = Record<string, Record<string, T>>;

/**
 * Penugasan BK (waka dan kepala): siswa yang mencapai ambang BK beserta status klaim. Tunjuk BK untuk siswa yang belum diklaim; Pindahkan klaim
 * yang ada ke BK lain yang aktif (alasan 10-300 karakter, tercatat di log). Tidak ada batas waktu klaim.
 */
export default function PenugasanBk() {
  const actor = useActor();
  const notify = useToast();
  const { students, today } = useAdminData();
  const d = useDiscipline();
  const ta = taKey(today);
  const klaimLive = useLive<PerNis<KlaimBk>>("klaimBK");
  const pbBk = useLive<PerNis<Pembinaan>>("pembinaan/bk");
  const akun = useLive<Record<string, BkAkun>>("bkAkun");
  const [aksi, setAksi] = useState<{ item: ItemDibina; klaim: KlaimBk | null } | null>(null);
  const siswa = useMemo(() => new Map(students.map((s) => [s.nis, s])), [students]);
  const items = useMemo(
    () => daftarPerluDibina(students.map((s) => ({ nis: s.nis, recs: d.records[s.nis], meta: d.meta[s.nis], pembinaan: pbBk.data?.[s.nis] })), d.levels, ta, "bk"),
    [students, d.records, d.meta, d.levels, pbBk.data, ta],
  );
  const aktif = useMemo(() => Object.entries(akun.data ?? {}).filter(([, a]) => a.aktif).sort((a, b) => a[1].nama.localeCompare(b[1].nama)), [akun.data]);
  const memuat = d.loading || klaimLive.loading || pbBk.loading || akun.loading;

  return (
    <section className="data-page" data-testid="penugasan-bk">
      <div className="section-heading">
        <div><p>Penugasan BK</p><span>{labelTa(ta)} · siswa pada ambang pembinaan BK dan siapa yang menanganinya</span></div>
      </div>
      <article className="panel master-group">
        {memuat ? <div className="page-loader"><Spinner dark /></div> : items.length === 0 ? <Empty icon="check" title="Tidak ada siswa pada ambang BK" text="Siswa muncul di sini saat saldo poinnya mencapai ambang pembinaan BK." /> : (
          <div className="simple-list" data-testid="daftar-penugasan">
            {items.map((it) => {
              const s = siswa.get(it.nis);
              const k = klaimLive.data?.[it.nis]?.[idPembinaan(ta, it.levelId)] ?? null;
              return (
                <div key={`${it.nis}-${it.levelId}`} data-nis={it.nis} data-level={it.levelId}>
                  <span><b>{s?.nama ?? it.nis}</b><small>{s?.kelas} · NIS {it.nis}</small></span>
                  <span>
                    <small>Ambang {it.level.poin} poin · saldo {it.saldo}</small>
                    {k ? <small className="badge badge-aman" data-testid="bk-penangan">Ditangani {k.bkNama} ({k.cara === "klaim" ? "klaim" : "ditunjuk"})</small> : <small className="badge badge-lemah" data-testid="belum-ditangani">Belum ditangani</small>}
                    {it.status === "dijadwalkan" && <small className="badge badge-izin">Dijadwalkan</small>}
                  </span>
                  <span className="row-actions"><button className="ghost-button" onClick={() => setAksi({ item: it, klaim: k })} data-testid={k ? "pindahkan-bk" : "tunjuk-bk"}>{k ? "Pindahkan" : "Tunjuk BK"}</button></span>
                </div>
              );
            })}
          </div>
        )}
      </article>
      {aksi && <FormTunjuk item={aksi.item} klaim={aksi.klaim} nama={siswa.get(aksi.item.nis)?.nama ?? aksi.item.nis} aktif={aktif} ta={ta}
        onClose={() => setAksi(null)} onSimpan={async (bkUid, alasan) => {
          const bk = akun.data?.[bkUid];
          await tunjukBk({ nis: aksi.item.nis, ta, levelId: aksi.item.levelId, bkUid, bkNama: bk?.nama ?? "", ...(aksi.klaim ? { pindah: { alasan } } : {}) }, actor);
          notify(aksi.klaim ? "Siswa dipindahkan ke BK lain" : "BK ditunjuk");
        }} />}
      {akun.error && <div className="notice warn" role="alert"><Icon name="warning" size={17} /><span>Daftar BK tidak dapat dimuat ({akun.error}).</span></div>}
    </section>
  );
}

function FormTunjuk({ item, klaim, nama, aktif, onSimpan, onClose }: {
  item: ItemDibina; klaim: KlaimBk | null; nama: string; aktif: [string, BkAkun][]; ta: string; onSimpan: (bkUid: string, alasan: string) => Promise<void>; onClose: () => void;
}) {
  const [bk, setBk] = useState("");
  const [alasan, setAlasan] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const pilihan = aktif.filter(([uid]) => uid !== klaim?.bkUid);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!bk) { setErr("Pilih BK"); return; }
    const a = alasan.trim();
    if (klaim && (a.length < 10 || a.length > 300)) { setErr("Alasan pemindahan 10-300 karakter"); return; }
    setBusy(true);
    try { await onSimpan(bk, a); onClose(); }
    catch (ex) { setErr(/permission/i.test((ex as Error).message) ? "Ditolak: BK tidak aktif atau klaim sudah berubah." : (ex as Error).message); }
    finally { setBusy(false); }
  };
  return (
    <Modal title={klaim ? "Pindahkan ke BK lain" : "Tunjuk BK"} subtitle={`${nama} · ambang ${item.level.poin} poin`} onClose={onClose} width={480}>
      <form className="modal-form" onSubmit={submit} noValidate data-testid="form-tunjuk-bk">
        {klaim && <p className="modal-note">Saat ini ditangani {klaim.bkNama}. Pembinaan yang sudah ditulis tetap tersimpan atas nama pembuatnya; BK baru melanjutkan pada catatan yang sama.</p>}
        <Field label="Guru BK (aktif)">
          <select className="text-input" value={bk} onChange={(e) => setBk(e.target.value)} aria-label="Guru BK">
            <option value="">Pilih guru BK…</option>
            {pilihan.map(([uid, a]) => <option key={uid} value={uid}>{a.nama}</option>)}
          </select>
        </Field>
        {klaim && <Field label="Alasan pemindahan" hint={`${alasan.trim().length}/300 · minimal 10 karakter · tercatat di log aktivitas`}><textarea className="text-input" rows={3} value={alasan} maxLength={300} onChange={(e) => setAlasan(e.target.value)} aria-label="Alasan pemindahan" /></Field>}
        {err && <div className="login-error-box" role="alert"><div><span>{err}</span></div></div>}
        <div className="modal-actions"><button type="button" className="secondary-button" onClick={onClose}>Batal</button><button className="primary-button" disabled={busy}>{busy ? <Spinner /> : null}{klaim ? "Pindahkan" : "Tunjuk"}</button></div>
      </form>
    </Modal>
  );
}
