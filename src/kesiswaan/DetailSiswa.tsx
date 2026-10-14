import { useMemo, useState, type FormEvent } from "react";
import Icon from "../components/Icon";
import { Empty, Field, Modal, Spinner, StatusBadge } from "../components/ui";
import { useToast } from "../admin/AdminLayout";
import {
  akhirTa, awalTa, daftarRecord, labelTa, levelDari, poinBertanda, ringkas, taKey,
  type DiscRecord, type EntriRiwayat, type LevelItem, type MetaByNis, type RecordsByNis,
} from "../lib/discipline";
import { formatTanggal } from "../lib/time";
import type { StudentRow } from "../lib/types";
import { hapusRecord, pulihkanRecord, simpanCatatanInternal, ubahRecord, type Actor } from "../services/discipline";
import { r as refDb, useLive } from "../services/db";
import { get } from "firebase/database";
import { htmlLembar, type BarisJam } from "../lib/lembar";

type Props = {
  siswa: StudentRow;
  ta: string;
  taOpsi: string[];
  records: RecordsByNis;
  meta: MetaByNis;
  levelList: LevelItem[];
  bisaTulis: boolean;
  actor: Actor;
  onTa: (ta: string) => void;
  onCatat: (jenis: "pelanggaran" | "remisi") => void;
  onClose: () => void;
};

/** Kartu pembinaan satu siswa: saldo, level, dan riwayat pelanggaran/remisi (termasuk yang dihapus, khusus staf). */
export default function DetailSiswa({ siswa, ta, taOpsi, records, meta, levelList, bisaTulis, actor, onTa, onCatat, onClose }: Props) {
  const [denganTerhapus, setDenganTerhapus] = useState(false);
  const [edit, setEdit] = useState<EntriRiwayat | null>(null);
  const [hapus, setHapus] = useState<EntriRiwayat | null>(null);
  const notify = useToast();
  const recs = records[siswa.nis];
  const metas = meta[siswa.nis];
  const notes = useLive<Record<string, string>>(`discipline/notes/${siswa.nis}`);
  const r = ringkas(recs, ta);
  const { sekarang, berikut } = levelDari(r.saldo, levelList);
  const daftar = useMemo(() => daftarRecord(recs, metas, ta, denganTerhapus), [recs, metas, ta, denganTerhapus]);

  /** Lembar pembinaan: dibuka di jendela baru lalu dicetak (jendela dibuka sinkron agar tidak diblok popup blocker). */
  const cetakLembar = async () => {
    const w = window.open("", "_blank");
    if (!w) { notify("Jendela cetak diblokir browser. Izinkan pop-up untuk situs ini.", "err"); return; }
    w.document.write("<p style='font-family:sans-serif'>Menyiapkan lembar pembinaan…</p>");
    try {
      const snap = await get(refDb(`lessonsByStudent/${siswa.nis}`));
      const perJam: BarisJam[] = [];
      for (const [tgl, jams] of Object.entries((snap.val() ?? {}) as Record<string, Record<string, { k: string; mapel?: string }>>)) {
        if (tgl < awalTa(ta) || tgl > akhirTa(ta)) continue;
        for (const [jam, x] of Object.entries(jams)) perJam.push({ tanggal: tgl, jam: Number(jam), kode: x.k, mapel: x.mapel });
      }
      perJam.sort((a, b) => a.tanggal.localeCompare(b.tanggal) || a.jam - b.jam);
      const html = htmlLembar({
        nama: siswa.nama, nis: siswa.nis, kelas: siswa.kelas, ta, ringkas: r, sekarang, berikut,
        riwayat: daftarRecord(recs, metas, ta, false), perJam,
        dicetak: new Date().toLocaleString("id-ID", { timeZone: "Asia/Jakarta" }), dicetakOleh: actor.nama,
      });
      w.document.open(); w.document.write(html); w.document.close();
      w.focus();
      window.setTimeout(() => { try { w.print(); } catch { /* pengguna dapat mencetak manual */ } }, 300);
    } catch (e) { w.close(); notify((e as Error).message, "err"); }
  };
  const adaTerhapus = useMemo(() => daftarRecord(recs, metas, ta, true).some((x) => x.dihapus), [recs, metas, ta]);

  return (
    <Modal title={siswa.nama} subtitle={`NIS ${siswa.nis} · ${siswa.kelas}`} onClose={onClose} width={720}>
      <div className="disc-summary">
        <div><span>Pelanggaran</span><b>{r.pel}</b></div>
        <div><span>Remisi</span><b>−{r.rem}</b></div>
        <div className="strong"><span>Saldo poin</span><b>{r.saldo}</b></div>
      </div>
      <div className="disc-level">
        {sekarang ? <StatusBadge status="Perlu tindak lanjut" /> : <StatusBadge status="Aman" />}
        <span>{sekarang ? sekarang[1].tindakan : "Belum mencapai ambang pembinaan."}</span>
        {berikut && <small>Ambang berikutnya: {berikut[1].poin} poin ({berikut[1].poin - r.saldo} poin lagi)</small>}
      </div>
      {r.sangatBerat && <div className="notice warn"><Icon name="warning" size={17} /><span><b>Pelanggaran Sangat Berat tercatat.</b> Dapat langsung diproses sidang disiplin tanpa menunggu akumulasi poin.</span></div>}

      <div className="disc-toolbar">
        <select className="text-input auto" value={ta} onChange={(e) => onTa(e.target.value)} aria-label="Tahun ajaran">
          {taOpsi.map((t) => <option key={t} value={t}>{labelTa(t)}</option>)}
        </select>
        <button className="secondary-button" onClick={cetakLembar}><Icon name="printer" size={15} />Cetak lembar pembinaan</button>
        {adaTerhapus && <label className="check-inline"><input type="checkbox" checked={denganTerhapus} onChange={(e) => setDenganTerhapus(e.target.checked)} />Tampilkan yang dihapus</label>}
        {bisaTulis && (
          <span className="disc-actions">
            <button className="secondary-button" onClick={() => onCatat("remisi")}>Catat remisi</button>
            <button className="primary-button" onClick={() => onCatat("pelanggaran")}><Icon name="plus" size={15} />Catat pelanggaran</button>
          </span>
        )}
      </div>

      {daftar.length === 0 ? <Empty icon="file" title="Belum ada catatan" text={`Tidak ada pelanggaran atau remisi pada ${labelTa(ta)}.`} /> : (
        <div className="disc-list">
          {daftar.map((e) => {
            const x = e.rec;
            return (
              <article key={e.id} className={`disc-item ${e.dihapus ? "dihapus" : ""} ${x.jenis}`}>
                <div className="disc-point">{poinBertanda(x) > 0 ? "+" : "−"}{x.poin}</div>
                <div className="disc-body">
                  <b>{x.nama}</b>
                  <small>
                    {formatTanggal(x.tanggal, false)} · {x.kategori ?? (x.jenis === "remisi" ? "Remisi" : "Pelanggaran")}
                    {x.sumber === "saran" ? " · dari saran otomatis" : ""}{e.meta ? ` · dicatat ${e.meta.dibuatNama}` : ""}
                  </small>
                  {x.takziran && <small className="takziran">Takziran: {x.takziran}</small>}
                  {notes.data?.[e.id] && <small className="catatan-int">Catatan internal: {notes.data[e.id]}</small>}
                  {e.dihapus && <small className="alasan">Dihapus: {e.meta?.alasanHapus}</small>}
                </div>
                {bisaTulis && (
                  <span className="row-actions">
                    {e.dihapus ? (
                      <button title="Pulihkan" aria-label="Pulihkan catatan" onClick={async () => { try { await pulihkanRecord(siswa.nis, e.id, e.meta!, actor); notify("Catatan dipulihkan"); } catch (ex) { notify((ex as Error).message, "err"); } }}><Icon name="refresh" size={16} /></button>
                    ) : (
                      <>
                        <button title="Ubah" aria-label="Ubah catatan" onClick={() => setEdit(e)}><Icon name="edit" size={16} /></button>
                        <button title="Hapus" aria-label="Hapus catatan" className="danger" onClick={() => setHapus(e)}><Icon name="trash" size={16} /></button>
                      </>
                    )}
                  </span>
                )}
              </article>
            );
          })}
        </div>
      )}

      {edit && <EditDialog nis={siswa.nis} entri={edit} catatan={notes.data?.[edit.id]} actor={actor} onClose={() => setEdit(null)} />}
      {hapus && <HapusDialog nis={siswa.nis} entri={hapus} actor={actor} onClose={() => setHapus(null)} />}
    </Modal>
  );
}

function EditDialog({ nis, entri, catatan, actor, onClose }: { nis: string; entri: EntriRiwayat; catatan?: string; actor: Actor; onClose: () => void }) {
  const notify = useToast();
  const rec: DiscRecord = entri.rec;
  const [f, setF] = useState({ nama: rec.nama, poin: String(rec.poin), tanggal: rec.tanggal, takziran: rec.takziran ?? "", catatan: catatan ?? "" });
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const p = Number(f.poin);
    if (!f.nama.trim() || f.nama.trim().length > 200) { setErr("Nama wajib diisi (maks. 200 karakter)"); return; }
    if (!Number.isInteger(p) || p < 1 || p > 1000) { setErr("Poin harus bilangan bulat 1–1000"); return; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(f.tanggal)) { setErr("Tanggal tidak valid"); return; }
    setBusy(true);
    try {
      await ubahRecord(nis, entri.id, rec, { nama: f.nama.trim(), poin: p, tanggal: f.tanggal, ta: taKey(f.tanggal), takziran: rec.jenis === "pelanggaran" ? f.takziran.trim() : undefined }, actor);
      if (f.catatan.trim() !== (catatan ?? "").trim()) await simpanCatatanInternal(nis, entri.id, f.catatan, catatan, actor);
      notify("Catatan diperbarui");
      onClose();
    } catch (ex) { setErr((ex as Error).message); setBusy(false); }
  };
  return (
    <Modal title="Ubah catatan" subtitle="Perubahan tercatat di jejak audit." onClose={onClose} width={500}>
      <form className="modal-form" onSubmit={submit} noValidate>
        <Field label="Nama"><input className="text-input" value={f.nama} maxLength={200} onChange={(e) => setF({ ...f, nama: e.target.value })} /></Field>
        <div className="form-grid">
          <Field label="Poin"><input className="text-input" inputMode="numeric" value={f.poin} onChange={(e) => setF({ ...f, poin: e.target.value.replace(/\D/g, "").slice(0, 4) })} /></Field>
          <Field label="Tanggal"><input className="text-input" type="date" value={f.tanggal} onChange={(e) => setF({ ...f, tanggal: e.target.value })} /></Field>
        </div>
        {rec.jenis === "pelanggaran" && <Field label="Takziran"><textarea className="text-input area" rows={2} maxLength={300} value={f.takziran} onChange={(e) => setF({ ...f, takziran: e.target.value })} /></Field>}
        <Field label="Catatan internal"><textarea className="text-input area" rows={2} maxLength={500} value={f.catatan} onChange={(e) => setF({ ...f, catatan: e.target.value })} /></Field>
        {err && <div className="login-error-box" role="alert"><Icon name="warning" size={17} /><div><span>{err}</span></div></div>}
        <div className="modal-actions">
          <button type="button" className="secondary-button" onClick={onClose}>Batal</button>
          <button className="primary-button" disabled={busy}>{busy ? <Spinner /> : null}Simpan</button>
        </div>
      </form>
    </Modal>
  );
}

function HapusDialog({ nis, entri, actor, onClose }: { nis: string; entri: EntriRiwayat; actor: Actor; onClose: () => void }) {
  const notify = useToast();
  const [alasan, setAlasan] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <Modal title="Hapus catatan?" subtitle={`${entri.rec.nama} · ${entri.rec.poin} poin`} onClose={onClose} width={440}>
      <p className="modal-note">Catatan dihapus dari saldo dan dari tampilan orang tua. Salinannya tetap tersimpan untuk staf dan jejak audit, dan dapat dipulihkan.</p>
      <Field label="Alasan penghapusan (wajib)"><input className="text-input" value={alasan} maxLength={200} onChange={(e) => setAlasan(e.target.value)} /></Field>
      <div className="modal-actions">
        <button className="secondary-button" onClick={onClose}>Batal</button>
        <button className="danger-button" disabled={busy || !alasan.trim()} onClick={async () => {
          setBusy(true);
          try { await hapusRecord(nis, entri.id, entri.rec, alasan, actor); notify("Catatan dihapus"); onClose(); }
          catch (ex) { notify((ex as Error).message, "err"); setBusy(false); }
        }}>{busy ? <Spinner /> : <Icon name="trash" size={15} />}Hapus</button>
      </div>
    </Modal>
  );
}
