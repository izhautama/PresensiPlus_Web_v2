import { useEffect, useState, type FormEvent } from "react";
import { get } from "firebase/database";
import { Field, Modal, Spinner } from "../components/ui";
import { useToast } from "../admin/AdminLayout";
import { formatTanggal } from "../lib/time";
import type { Level } from "../lib/discipline";
import { METODE_PB, kelompokPj, validasiPembinaan, type ModeOrtu, type Pembinaan } from "../lib/pembinaan";
import { r } from "../services/db";
import { simpanPembinaan } from "../services/pembinaan";

/**
 * Catat atau ubah pembinaan untuk satu (siswa, ambang) pada TA berjalan. Dipakai wali kelas, BK (pemegang klaim), dan kepala.
 * Pembinaan yang sudah SELESAI hanya dikoreksi peringkat lebih tinggi (waka/kepala) dengan alasan wajib (10-300 karakter, tercatat di log).
 */
export default function FormPembinaan({ siswa, ta, levelId, level, ada, today, ctx, onClose }: {
  siswa: { nis: string; nama: string; kelas: string }; ta: string; levelId: string; level: Level; ada?: Pembinaan | null; today: string;
  ctx: { uid: string; nama: string }; onClose: () => void;
}) {
  const notify = useToast();
  const [f, setF] = useState({
    tanggal: ada?.tanggal ?? today, metode: ada?.metode ?? "Tatap muka", hasil: ada?.hasil ?? "", tindakLanjut: ada?.tindakLanjut ?? "", status: ada?.status ?? "selesai",
  });
  const [err, setErr] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [alasan, setAlasan] = useState("");
  const koreksi = ada?.status === "selesai";
  // Penanda yang menentukan isi update: ambang sudah terpakai? izin orang tua aktif (mode)? Dibaca saat modal dibuka.
  const [penanda, setPenanda] = useState<{ terpakai: boolean; izin: ModeOrtu | null } | null>(null);
  useEffect(() => {
    let batal = false;
    Promise.all([get(r(`discipline/levelTerpakai/${levelId}`)), get(r(`izinOrtuAda/${siswa.nis}/${ta}/${levelId}`)).catch(() => null)])
      .then(([tp, iz]) => { if (!batal) setPenanda({ terpakai: tp.exists(), izin: (iz?.val() as ModeOrtu | null) ?? null }); })
      .catch(() => { if (!batal) setPenanda({ terpakai: true, izin: null }); });
    return () => { batal = true; };
  }, [levelId, siswa.nis, ta]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const v = validasiPembinaan(f, today);
    if (koreksi && (alasan.trim().length < 10 || alasan.trim().length > 300)) v.alasan = "Alasan koreksi 10-300 karakter";
    if (!penanda) v.umum = "Tunggu sebentar, penanda data masih dimuat.";
    setErr(v);
    if (Object.keys(v).length) return;
    setBusy(true);
    try {
      await simpanPembinaan({ nis: siswa.nis, nama: siswa.nama, ta, levelId, level, form: f, ada, levelTerpakai: penanda!.terpakai, izinMode: penanda!.izin, alasanKoreksi: koreksi ? alasan : undefined }, ctx);
      notify(f.status === "selesai" ? "Pembinaan dicatat selesai" : "Pembinaan dijadwalkan");
      onClose();
    } catch (ex) {
      const m = (ex as Error).message ?? "";
      setErr({ umum: /permission/i.test(m) ? "Ditolak: pembinaan ini tidak dapat diubah (mungkin sudah selesai, atau bukan ambang yang menjadi tanggung jawab Anda)." : m });
    } finally { setBusy(false); }
  };

  return (
    <Modal title={`${koreksi ? "Koreksi" : ada ? "Ubah" : "Catat"} pembinaan`} subtitle={`${siswa.nama} · ${siswa.kelas} · ambang ${level.poin} poin`} onClose={onClose} width={560}>
      <form className="modal-form" onSubmit={submit} noValidate data-testid="form-pembinaan">
        <p className="modal-note">{level.tindakan}</p>
        <div className="form-grid">
          <Field label="Tanggal pembinaan" error={err.tanggal}>
            <input className="text-input" type="date" value={f.tanggal} max={f.status === "selesai" ? today : undefined} onChange={(e) => setF({ ...f, tanggal: e.target.value })} />
          </Field>
          <Field label="Metode" error={err.metode}>
            <select className="text-input" value={f.metode} onChange={(e) => setF({ ...f, metode: e.target.value as typeof f.metode })}>
              {METODE_PB.map((m) => <option key={m}>{m}</option>)}
            </select>
          </Field>
        </div>
        <Field label="Status" error={err.status}>
          <select className="text-input" value={f.status} onChange={(e) => setF({ ...f, status: e.target.value as typeof f.status })} aria-label="Status pembinaan">
            <option value="selesai">Selesai</option>
            <option value="dijadwalkan">Dijadwalkan</option>
          </select>
        </Field>
        <Field label="Hasil pembinaan" error={err.hasil} hint={`${f.hasil.trim().length}/1000 · minimal 10 karakter`}>
          <textarea className="text-input" rows={4} value={f.hasil} maxLength={1000} onChange={(e) => setF({ ...f, hasil: e.target.value })} />
        </Field>
        <Field label="Tindak lanjut (opsional)" error={err.tindakLanjut} hint={`${f.tindakLanjut.trim().length}/500`}>
          <textarea className="text-input" rows={2} value={f.tindakLanjut} maxLength={500} onChange={(e) => setF({ ...f, tindakLanjut: e.target.value })} />
        </Field>
        {koreksi && (
          <Field label="Alasan koreksi" error={err.alasan} hint={`${alasan.trim().length}/300 · minimal 10 karakter · tercatat di log aktivitas`}>
            <textarea className="text-input" rows={2} value={alasan} maxLength={300} onChange={(e) => setAlasan(e.target.value)} aria-label="Alasan koreksi" />
          </Field>
        )}
        {kelompokPj(level.penanggungJawab) === "bk" && <p className="modal-note" data-testid="catatan-rahasia-bk">Hasil pembinaan dapat dibaca Waka/Kepala; tulis hal rahasia di Catatan konseling.</p>}
        {f.tanggal && <p className="modal-note">Tercatat untuk {formatTanggal(f.tanggal)}. Orang tua tidak melihat pembinaan ini kecuali waka/kepala mengizinkannya{penanda?.izin ? ` (izin aktif: ${penanda.izin === "lengkap" ? "lengkap" : "hanya status dan tanggal"})` : ""}.</p>}
        {err.umum && <div className="login-error-box" role="alert"><div><span>{err.umum}</span></div></div>}
        <div className="modal-actions">
          <button type="button" className="secondary-button" onClick={onClose}>Batal</button>
          <button className="primary-button" disabled={busy}>{busy ? <Spinner /> : null}Simpan</button>
        </div>
      </form>
    </Modal>
  );
}
