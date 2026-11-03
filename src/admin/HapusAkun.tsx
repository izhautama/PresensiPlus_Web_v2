import { useState, type FormEvent } from "react";
import Icon from "../components/Icon";
import { Empty, Field, Modal, Spinner } from "../components/ui";
import { useAuth } from "../auth/AuthContext";
import { formatTanggal } from "../lib/time";
import { useLive } from "../services/db";
import { batalTandaHapus, hapusAkunBkLangsung, tandaiHapusAkun, type HapusAkun, type PeranHapus } from "../services/hapusAkun";
import { tandaDapatDibatalkan } from "../lib/hapusBk";
import { useToast } from "./AdminLayout";

export const PERAN_HAPUS_LABEL: Record<PeranHapus, string> = { kepala: "Kepala Madrasah", waka: "Waka Kesiswaan", piket: "Guru Piket", wali: "Wali Kelas", bk: "Guru BK" };
const tglMs = (ts: number) => formatTanggal(new Date(ts + 7 * 3600_000).toISOString().slice(0, 10));

/**
 * Hapus akun yang sudah dicabut (hanya admin). Alasan 10-300 karakter + ketik ulang email.
 *  - Guru BK (`langsung`): akun LANGSUNG hilang dari aplikasi (staff + bkAkun dihapus, tidak bisa masuk lagi). Akun login di Firebase Authentication tidak
 *    dapat dihapus dari browser; email baru bebas dipakai ulang setelah skrip `scripts/hapus_akun.py` dijalankan (opsional).
 *  - Peran lain: hanya MENANDAI; penghapusan Auth + node dilakukan skrip (dry-run dulu) dan tidak dapat dibatalkan.
 */
export function TandaiHapusDialog({ uid, nama, email, peran, onClose }: {
  uid: string; nama: string; email: string; peran: PeranHapus; onClose: () => void;
}) {
  const { session } = useAuth();
  const notify = useToast();
  const langsung = peran === "bk";
  const tanda = useLive<HapusAkun>(`hapusAkun/${uid}`);
  const [alasan, setAlasan] = useState("");
  const [ketik, setKetik] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const a = alasan.trim();
    if (a.length < 10 || a.length > 300) { setErr("Alasan 10-300 karakter"); return; }
    if (ketik.trim().toLowerCase() !== email.toLowerCase()) { setErr("Ketik email akun persis seperti di atas untuk konfirmasi"); return; }
    if (session?.role !== "admin") return;
    if (langsung && tanda.loading) return; // status tanda dibutuhkan agar tanda yang sudah ada tidak ditulis ulang
    setBusy(true);
    try {
      if (langsung) { await hapusAkunBkLangsung({ uid, email, nama, alasan: a, olehUid: session.uid, sudahDitandai: Boolean(tanda.data) }); notify(`Akun ${nama} dihapus dari aplikasi`); }
      else { await tandaiHapusAkun({ uid, email, nama, peran, alasan: a, olehUid: session.uid }); notify(`${nama} ditandai untuk dihapus permanen`); }
      onClose();
    }
    catch (ex) { setErr(/permission/i.test((ex as Error).message) ? "Ditolak: akun harus sudah dicabut, bukan akun Anda sendiri, dan belum ditandai." : (ex as Error).message); }
    finally { setBusy(false); }
  };
  return (
    <Modal title={langsung ? "Hapus akun BK" : "Tandai hapus akun"} subtitle={`${nama} · ${PERAN_HAPUS_LABEL[peran]} · ${email}`} onClose={onClose} width={520}>
      <form className="modal-form" onSubmit={submit} noValidate data-testid="form-tandai-hapus">
        {langsung
          ? <div className="notice warn" data-testid="info-hapus-langsung"><Icon name="warning" size={17} /><span>Akun akan <b>langsung hilang dari aplikasi</b> dan tidak bisa masuk lagi. Jejak audit (log, pembinaan, konseling, catatan disiplin) tetap ada. Akun login di Firebase Authentication tetap tersimpan, sehingga email ini belum bisa dipakai mendaftar ulang sampai skrip <b>hapus_akun.py</b> dijalankan (opsional, dry-run dulu).</span></div>
          : <div className="notice warn"><Icon name="warning" size={17} /><span>Ini hanya MENANDAI. Akun Firebase Authentication dan datanya baru terhapus saat operator menjalankan skrip lokal <b>hapus_akun.py</b> (dry-run dulu). Penghapusan tidak dapat dibatalkan dan email menjadi bebas dipakai ulang. Jejak audit (log, pembinaan, konseling, catatan disiplin) tetap ada.</span></div>}
        {peran === "bk" && <div className="notice" data-testid="peringatan-klaim-bk"><Icon name="users" size={17} /><span>Pastikan klaim BK akun ini sudah dilepas/dipindah oleh Waka. Admin tidak dapat melihat klaim, jadi aplikasi tidak bisa memeriksanya; siswa yang masih diklaim akun ini harus dipindahkan Waka.</span></div>}
        <Field label="Alasan" hint={`${alasan.trim().length}/300 · minimal 10 karakter · tercatat di log aktivitas`}>
          <textarea className="text-input" rows={3} maxLength={300} value={alasan} onChange={(e) => setAlasan(e.target.value)} aria-label="Alasan penghapusan" />
        </Field>
        <Field label={`Ketik email untuk konfirmasi: ${email}`} error={err}>
          <input className="text-input" value={ketik} onChange={(e) => setKetik(e.target.value)} autoComplete="off" aria-label="Ketik email untuk konfirmasi" />
        </Field>
        <div className="modal-actions"><button type="button" className="secondary-button" onClick={onClose}>Batal</button><button className="danger-button" disabled={busy || (langsung && tanda.loading)}>{busy ? <Spinner /> : null}{langsung ? "Hapus akun" : "Tandai hapus akun"}</button></div>
      </form>
    </Modal>
  );
}

/** Daftar "Menunggu dihapus" + petunjuk skrip. Tanda dapat dibatalkan sebelum skrip dijalankan. */
export function DaftarMenungguHapus() {
  const live = useLive<Record<string, HapusAkun>>("hapusAkun");
  const staff = useLive<Record<string, unknown>>("staff");
  const notify = useToast();
  const [busy, setBusy] = useState("");
  const daftar = Object.entries(live.data ?? {}).sort((a, b) => a[1].ts - b[1].ts);
  const batal = async (uid: string, h: HapusAkun) => {
    setBusy(uid);
    try { await batalTandaHapus(uid, h.email); notify("Tanda hapus dibatalkan"); } catch (e) { notify((e as Error).message, "err"); } finally { setBusy(""); }
  };
  return (
    <article className="panel kepala-panel" data-testid="menunggu-dihapus">
      <div className="panel-header"><div><p className="panel-title">Menunggu dihapus permanen <span className="badge badge-lemah" data-testid="jumlah-menunggu-hapus">{daftar.length}</span></p><span>Dihapus oleh skrip lokal: buka notebook Setup_Migrasi_Firebase (sel Hapus akun) atau jalankan <code>python scripts/hapus_akun.py</code>; dry-run dulu, lalu ketik HAPUS. Tidak dapat dibatalkan setelah dijalankan.</span></div></div>
      {live.error ? <Empty icon="alert" title="Gagal memuat" text={live.error} /> : live.loading ? <div className="page-loader"><Spinner dark /></div> : daftar.length === 0 ? <p className="modal-note">Tidak ada akun yang menunggu dihapus.</p> : (
        <div className="simple-list daftar-akun">
          {daftar.map(([uid, h]) => (
            <div key={uid} data-uid={uid}>
              <span><b>{h.nama}</b><small>{PERAN_HAPUS_LABEL[h.peran] ?? h.peran} · {h.email} · ditandai {tglMs(h.ts)}</small></span>
              <span><small>{h.alasan}</small></span>
              <span className="row-actions">{staff.loading || tandaDapatDibatalkan(h.peran, Boolean(staff.data?.[uid]))
                ? <button className="ghost-button" disabled={busy === uid || staff.loading} onClick={() => batal(uid, h)} data-testid="batal-tanda-hapus">{busy === uid ? <Spinner dark /> : null}Batalkan tanda</button>
                : <small className="notice-hilang" data-testid="sudah-dihapus-aplikasi">Sudah dihapus dari aplikasi · menunggu skrip untuk membebaskan email</small>}</span>
            </div>
          ))}
        </div>
      )}
    </article>
  );
}
