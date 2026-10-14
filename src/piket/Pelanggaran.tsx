import { useMemo, useState, type FormEvent } from "react";
import Icon from "../components/Icon";
import StudentPicker from "../components/StudentPicker";
import { Empty, Field, Modal, Spinner } from "../components/ui";
import { useAdminData } from "../admin/AdminData";
import { useToast } from "../admin/AdminLayout";
import type { Rule } from "../lib/discipline";
import { bolehDicatatPiket } from "../lib/piket";
import { addDays, formatTanggal } from "../lib/time";
import { useLive } from "../services/db";
import { hapusPelanggaranPiket, pelanggaranPiket, pesanPiket, type PiketHarian } from "../services/piket";
import { usePiketCtx, usePiketHarian, usePiketMundur } from "./useJendela";

/** Pelanggaran ringan / bertakziran dari master. Poin & takziran terisi otomatis dan TIDAK dapat diubah piket. */
export default function PelanggaranPiket() {
  const { students, today } = useAdminData();
  const mundur = usePiketMundur();
  const ctx = usePiketCtx();
  const notify = useToast();
  const rules = useLive<Record<string, Rule>>("discipline/rules");
  const [nis, setNis] = useState<string[]>([]);
  const [ruleId, setRuleId] = useState("");
  const [cari, setCari] = useState("");
  const [tanggal, setTanggal] = useState(today);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [hapus, setHapus] = useState<{ tanggal: string; id: string; item: PiketHarian } | null>(null);

  const tersedia = useMemo(() => {
    const qq = cari.trim().toLowerCase();
    return Object.entries(rules.data ?? {}).filter(([, x]) => bolehDicatatPiket(x) && (!qq || x.nama.toLowerCase().includes(qq)))
      .sort((a, b) => a[1].nama.localeCompare(b[1].nama));
  }, [rules.data, cari]);
  const rule = ruleId ? rules.data?.[ruleId] : undefined;

  const tanggalList = useMemo(() => Array.from({ length: mundur + 1 }, (_, i) => addDays(today, -i)), [today, mundur]);
  const harian = usePiketHarian(tanggalList);
  const catatan = useMemo(() => tanggalList.flatMap((t) => Object.entries(harian.data[t] ?? {}).filter(([, x]) => !x.dihapus).map(([id, item]) => ({ tanggal: t, id, item }))), [tanggalList, harian.data]);

  const simpan = async (e: FormEvent) => {
    e.preventDefault();
    if (!nis.length) { setErr("Pilih minimal satu siswa"); return; }
    if (!rule) { setErr("Pilih pelanggaran dari daftar"); return; }
    setBusy(true); setErr("");
    try {
      await pelanggaranPiket({ siswa: students.filter((s) => nis.includes(s.nis)), ruleId, rule, tanggal }, ctx);
      notify(`Pelanggaran dicatat untuk ${nis.length} siswa`);
      setNis([]); setRuleId("");
    } catch (ex) { setErr(pesanPiket(ex)); }
    finally { setBusy(false); }
  };

  return (
    <section className="data-page">
      <div className="section-heading"><div><p>Pelanggaran ringan</p><span>Hanya pelanggaran kategori Ringan atau yang memiliki takziran, dari daftar tata tertib</span></div></div>

      <form className="panel modal-form" onSubmit={simpan} noValidate>
        <Field label="Siswa (boleh lebih dari satu)"><StudentPicker students={students} value={nis} onChange={setNis} multiple /></Field>
        <Field label="Pelanggaran">
          <div className="pick-panel">
            <div className="pick-filter"><input className="text-input" placeholder="Cari pelanggaran..." value={cari} onChange={(e) => setCari(e.target.value)} aria-label="Cari pelanggaran" /></div>
            <div className="pick-list" role="listbox">
              {rules.loading ? <p className="picker-empty">Memuat…</p> : tersedia.length === 0 ? <p className="picker-empty">Belum ada pelanggaran yang dapat dicatat piket. Minta Waka mengisi tata tertib.</p> : tersedia.map(([id, x]) => (
                <button type="button" key={id} role="option" aria-selected={ruleId === id} className={ruleId === id ? "active" : ""} onClick={() => setRuleId(id)}>
                  <span><b>{x.nama}</b><small>{x.kategori}{x.takziran ? ` · takziran: ${x.takziran}` : ""}</small></span><em>+{x.poin}</em>
                </button>
              ))}
            </div>
          </div>
        </Field>
        {rule && <div className="notice"><Icon name="file" size={17} /><span><b>{rule.nama}</b> · {rule.poin} poin{rule.takziran ? ` · takziran: ${rule.takziran}` : ""}. Poin dan takziran mengikuti tata tertib dan tidak dapat diubah.</span></div>}
        <Field label="Tanggal kejadian" hint={`Maksimal ${mundur} hari ke belakang; tidak boleh masa depan.`}>
          <input className="text-input" type="date" min={addDays(today, -mundur)} max={today} value={tanggal} onChange={(e) => e.target.value && setTanggal(e.target.value)} />
        </Field>
        {err && <div className="login-error-box" role="alert"><Icon name="warning" size={17} /><div><span>{err}</span></div></div>}
        <div className="modal-actions"><button className="primary-button" disabled={busy}>{busy ? <Spinner /> : null}Catat{nis.length > 1 ? ` (${nis.length} siswa)` : ""}</button></div>
      </form>

      <article className="panel" style={{ marginTop: 16 }}>
        <div className="panel-header"><div><p className="panel-title">Catatan piket</p><span>{mundur + 1} hari terakhir · hanya yang dicatat lewat akun piket</span></div></div>
        {harian.loading ? <div className="page-loader"><Spinner dark /></div> : catatan.length === 0 ? <Empty icon="file" title="Belum ada catatan piket" /> : (
          <div className="simple-list" data-testid="catatan-piket">
            {catatan.map(({ tanggal: t, id, item }) => (
              <div key={`${t}-${id}`} className="catatan-piket-row">
                <span><b>{item.nama}</b><small>{item.kelas} · {formatTanggal(t, false)} · petugas {item.petugas}</small></span>
                <span><b>{item.pelanggaran}</b>{item.takziran && <small>Takziran: {item.takziran}</small>}</span>
                <button className="ghost-button" aria-label={`Hapus catatan ${item.nama} ${item.pelanggaran}`} onClick={() => setHapus({ tanggal: t, id, item })}><Icon name="trash" size={15} />Hapus</button>
              </div>
            ))}
          </div>
        )}
      </article>

      {hapus && <HapusDialog data={hapus} onClose={() => setHapus(null)} onOk={async (alasan) => {
        await hapusPelanggaranPiket({ tanggal: hapus.tanggal, id: hapus.id, item: hapus.item, alasan }, ctx);
        notify("Catatan dihapus");
        setHapus(null);
      }} />}
    </section>
  );
}

function HapusDialog({ data, onClose, onOk }: { data: { item: PiketHarian }; onClose: () => void; onOk: (alasan: string) => Promise<void> }) {
  const [alasan, setAlasan] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  return (
    <Modal title="Hapus catatan piket?" subtitle={`${data.item.nama} · ${data.item.pelanggaran}`} onClose={onClose} width={440}>
      <p className="modal-note">Catatan dihapus dari saldo siswa. Salinannya tetap tersimpan untuk Waka dan jejak audit.</p>
      <Field label="Alasan penghapusan (wajib)"><input className="text-input" maxLength={200} value={alasan} onChange={(e) => setAlasan(e.target.value)} /></Field>
      {err && <div className="login-error-box" role="alert"><Icon name="warning" size={17} /><div><span>{err}</span></div></div>}
      <div className="modal-actions">
        <button className="secondary-button" onClick={onClose}>Batal</button>
        <button className="danger-button" disabled={busy || !alasan.trim()} onClick={async () => {
          setBusy(true); setErr("");
          try { await onOk(alasan); } catch (e) { setErr(pesanPiket(e)); setBusy(false); }
        }}>{busy ? <Spinner /> : <Icon name="trash" size={15} />}Hapus</button>
      </div>
    </Modal>
  );
}
