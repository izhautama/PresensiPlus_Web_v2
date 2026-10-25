import { useMemo, useState, type FormEvent } from "react";
import Icon from "../components/Icon";
import { Empty, Field, Modal, Spinner } from "../components/ui";
import { useAdminData } from "../admin/AdminData";
import { useToast } from "../admin/AdminLayout";
import FormPembinaan from "../kesiswaan/FormPembinaan";
import { labelTa } from "../lib/discipline";
import { idPembinaan, type ItemDibina, type KlaimBk, type Pembinaan } from "../lib/pembinaan";
import { formatTanggal } from "../lib/time";
import { klaimSiswa, lepasKlaim } from "../services/pembinaanLanjut";
import { usePembina } from "../wali/pembina";
import { useDisiplinKelas } from "../wali/DisiplinKelas";

/** Pengelompokan "Perlu dibina" untuk BK menurut klaim (siapa cepat dia dapat). */
export function kelompokKlaim(items: ItemDibina[], klaim: Record<string, Record<string, KlaimBk>> | undefined, ta: string, uid: string) {
  const belum: ItemDibina[] = [], saya: ItemDibina[] = [], lain: (ItemDibina & { klaim: KlaimBk })[] = [];
  for (const it of items) {
    const k = klaim?.[it.nis]?.[idPembinaan(ta, it.levelId)];
    if (!k) belum.push(it);
    else if (k.bkUid === uid) saya.push(it);
    else lain.push({ ...it, klaim: k });
  }
  return { belum, saya, lain };
}

/** Pembinaan oleh BK (ambang berpenanggung jawab BK): klaim, catat pembinaan (hanya pemegang klaim), lepas klaim. */
export default function PembinaanBk() {
  const pembina = usePembina();
  const { today } = useAdminData();
  const d = useDisiplinKelas();
  const notify = useToast();
  const [buka, setBuka] = useState<{ item: ItemDibina } | null>(null);
  const [ubah, setUbah] = useState<{ nis: string; levelId: string; pb: Pembinaan } | null>(null);
  const [lepas, setLepas] = useState<ItemDibina | null>(null);
  const [sibuk, setSibuk] = useState<string | null>(null);
  const siswa = useMemo(() => new Map(d.siswa.map((s) => [s.nis, s])), [d.siswa]);
  const ctx = { uid: pembina.uid, nama: pembina.nama };
  const grup = useMemo(() => kelompokKlaim(d.items, d.klaim, d.ta, pembina.uid), [d.items, d.klaim, d.ta, pembina.uid]);

  const klaim = async (it: ItemDibina) => {
    setSibuk(`${it.nis}-${it.levelId}`);
    try {
      await klaimSiswa({ nis: it.nis, nama: siswa.get(it.nis)?.nama ?? it.nis, ta: d.ta, levelId: it.levelId }, ctx);
      notify("Siswa Anda klaim");
    } catch (ex) {
      notify(/permission/i.test((ex as Error).message) ? "Gagal: siswa ini sudah diklaim BK lain" : (ex as Error).message);
    } finally { setSibuk(null); }
  };

  const riwayat = useMemo(() => {
    const out: { nis: string; id: string; pb: Pembinaan }[] = [];
    for (const [nis, per] of Object.entries(d.pembinaan)) for (const [id, pb] of Object.entries(per)) if (pb.ta === d.ta && pb.pj === "bk") out.push({ nis, id, pb });
    return out.sort((a, b) => b.pb.tanggal.localeCompare(a.pb.tanggal));
  }, [d.pembinaan, d.ta]);

  const baris = (it: ItemDibina, aksi: React.ReactNode, ket?: string) => {
    const s = siswa.get(it.nis);
    return (
      <div key={`${it.nis}-${it.levelId}`} data-nis={it.nis} data-level={it.levelId}>
        <span><b>{s?.nama ?? it.nis}</b><small>{s?.kelas} · NIS {it.nis}</small></span>
        <span>
          <small>Ambang {it.level.poin} poin · saldo {it.saldo}</small>
          {it.saldoTurun && <small className="badge badge-lemah" data-testid="saldo-turun">saldo sudah turun</small>}
          {it.status === "dijadwalkan" && <small className="badge badge-izin" data-testid="status-dijadwalkan">Dijadwalkan {it.pembinaan ? formatTanggal(it.pembinaan.tanggal) : ""}</small>}
          {ket && <small className="badge badge-lemah">{ket}</small>}
        </span>
        <span className="row-actions">{aksi}</span>
      </div>
    );
  };

  return (
    <section className="data-page" data-testid="halaman-pembinaan">
      <div className="section-heading">
        <div><p>Pembinaan BK</p><span>{labelTa(d.ta)} · siswa dari semua kelas yang saldonya mencapai ambang pembinaan BK. Klaim dulu, baru dibina — siapa cepat dia dapat.</span></div>
      </div>
      {d.galat.length > 0 && <div className="notice warn" role="alert"><Icon name="warning" size={17} /><span>Sebagian data tidak dapat dimuat ({d.galat[0]}).</span></div>}

      <article className="panel master-group">
        <div className="panel-header"><div><p className="panel-title">Belum ditangani <span className="badge badge-lemah" data-testid="jumlah-belum-ditangani">{grup.belum.length}</span></p><span>Belum ada BK yang mengklaim. Klaim untuk mulai membina.</span></div></div>
        {d.memuat ? <div className="page-loader"><Spinner dark /></div> : grup.belum.length === 0 ? (
          <Empty icon="check" title="Tidak ada yang menunggu" text="Siswa muncul di sini saat saldo poinnya mencapai ambang BK dan belum diklaim." />
        ) : (
          <div className="simple-list" data-testid="daftar-belum-ditangani">
            {grup.belum.map((it) => baris(it, <button className="primary-button sm" disabled={sibuk === `${it.nis}-${it.levelId}`} onClick={() => klaim(it)} data-testid="klaim-siswa">{sibuk === `${it.nis}-${it.levelId}` ? <Spinner /> : null}Klaim</button>))}
          </div>
        )}
      </article>

      <article className="panel master-group">
        <div className="panel-header"><div><p className="panel-title">Tangani saya <span className="badge badge-lemah" data-testid="jumlah-tangani-saya">{grup.saya.length}</span></p><span>Siswa yang Anda klaim atau ditunjuk waka/kepala.</span></div></div>
        {grup.saya.length === 0 ? <p className="modal-note">Belum ada siswa yang Anda tangani.</p> : (
          <div className="simple-list" data-testid="daftar-tangani-saya">
            {grup.saya.map((it) => baris(it, <>
              <button className="primary-button sm" onClick={() => setBuka({ item: it })} data-testid="catat-pembinaan">{it.status === "dijadwalkan" ? "Lanjutkan pembinaan" : "Catat pembinaan"}</button>
              <button className="ghost-button" onClick={() => setLepas(it)} data-testid="lepas-klaim">Lepas klaim</button>
            </>))}
          </div>
        )}
      </article>

      <article className="panel master-group">
        <div className="panel-header"><div><p className="panel-title">Ditangani BK lain <span className="badge badge-lemah" data-testid="jumlah-ditangani-lain">{grup.lain.length}</span></p><span>Hanya informasi; tidak dapat Anda ubah.</span></div></div>
        {grup.lain.length === 0 ? <p className="modal-note">Tidak ada.</p> : (
          <div className="simple-list" data-testid="daftar-ditangani-lain">
            {grup.lain.map((it) => baris(it, null, `Ditangani ${it.klaim.bkNama}`))}
          </div>
        )}
      </article>

      <article className="panel master-group">
        <div className="panel-header"><div><p className="panel-title">Riwayat pembinaan BK</p><span>Pada {labelTa(d.ta)}. Hasil pembinaan dapat dibaca Waka/Kepala; tulis hal rahasia di Catatan konseling.</span></div></div>
        {riwayat.length === 0 ? <p className="modal-note">Belum ada pembinaan tercatat.</p> : (
          <div className="simple-list" data-testid="riwayat-pembinaan">
            {riwayat.map(({ nis, id, pb }) => {
              const milikku = d.klaim?.[nis]?.[id]?.bkUid === pembina.uid;
              return (
                <div key={`${nis}-${id}`} data-nis={nis}>
                  <span><b>{siswa.get(nis)?.nama ?? nis}</b><small>{formatTanggal(pb.tanggal)} · {pb.metode} · ambang {pb.levelPoin} poin</small></span>
                  <span><small className={`badge ${pb.status === "selesai" ? "badge-aman" : "badge-izin"}`}>{pb.status === "selesai" ? "Selesai" : "Dijadwalkan"}</small><small>{pb.hasil.length > 140 ? `${pb.hasil.slice(0, 140)}…` : pb.hasil}</small></span>
                  <span className="row-actions">
                    {pb.status === "dijadwalkan" && milikku && d.levels[pb.levelId] && siswa.get(nis) && <button className="ghost-button" onClick={() => setUbah({ nis, levelId: pb.levelId, pb })}>Ubah</button>}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </article>

      {buka && siswa.get(buka.item.nis) && (
        <FormPembinaan siswa={siswa.get(buka.item.nis)!} ta={d.ta} levelId={buka.item.levelId} level={buka.item.level} ada={buka.item.pembinaan} today={today} ctx={ctx} onClose={() => setBuka(null)} />
      )}
      {ubah && siswa.get(ubah.nis) && d.levels[ubah.levelId] && (
        <FormPembinaan siswa={siswa.get(ubah.nis)!} ta={d.ta} levelId={ubah.levelId} level={d.levels[ubah.levelId]} ada={ubah.pb} today={today} ctx={ctx} onClose={() => setUbah(null)} />
      )}
      {lepas && <LepasKlaim item={lepas} nama={siswa.get(lepas.nis)?.nama ?? lepas.nis} ta={d.ta} onClose={() => setLepas(null)} />}
    </section>
  );
}

function LepasKlaim({ item, nama, ta, onClose }: { item: ItemDibina; nama: string; ta: string; onClose: () => void }) {
  const notify = useToast();
  const [alasan, setAlasan] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const a = alasan.trim();
    if (a.length < 10 || a.length > 300) { setErr("Alasan 10-300 karakter"); return; }
    setBusy(true);
    try { await lepasKlaim({ nis: item.nis, ta, levelId: item.levelId, alasan: a }); notify("Klaim dilepas"); onClose(); }
    catch (ex) { setErr(/permission/i.test((ex as Error).message) ? "Ditolak: klaim tidak dapat dilepas (pembinaan sudah selesai, atau bukan klaim Anda)." : (ex as Error).message); }
    finally { setBusy(false); }
  };
  return (
    <Modal title="Lepas klaim" subtitle={nama} onClose={onClose} width={480}>
      <form className="modal-form" onSubmit={submit} noValidate data-testid="form-lepas-klaim">
        <Field label="Alasan melepas klaim" error={err} hint={`${alasan.trim().length}/300 · minimal 10 karakter · tercatat di log aktivitas`}>
          <textarea className="text-input" rows={3} value={alasan} maxLength={300} onChange={(e) => setAlasan(e.target.value)} aria-label="Alasan melepas klaim" />
        </Field>
        <div className="modal-actions">
          <button type="button" className="secondary-button" onClick={onClose}>Batal</button>
          <button className="primary-button" disabled={busy}>{busy ? <Spinner /> : null}Lepas klaim</button>
        </div>
      </form>
    </Modal>
  );
}
