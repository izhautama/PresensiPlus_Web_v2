import { useMemo, useState, type FormEvent } from "react";
import Icon from "../components/Icon";
import { Empty, Field, Modal, Spinner } from "../components/ui";
import StudentPicker from "../components/StudentPicker";
import { useAdminData } from "../admin/AdminData";
import { useToast } from "../admin/AdminLayout";
import { useAuth } from "../auth/AuthContext";
import { labelTa, taKey } from "../lib/discipline";
import { MODE_ORTU_LABEL, bolehBeriIzin, bolehCabutIzin, kelompokPj, type IzinOrtu as Izin, type KunciOrtu, type ModeOrtu, type Pembinaan } from "../lib/pembinaan";
import { formatTanggal } from "../lib/time";
import { useLive } from "../services/db";
import { aturKunciOrtu, beriIzinOrtu, cabutIzinOrtu } from "../services/pembinaanLanjut";
import { usePembinaanData } from "./PembinaanData";
import { useActor } from "./useDiscipline";

type PerNis<T> = Record<string, Record<string, T>>;
type Tiga<T> = Record<string, Record<string, Record<string, T>>>;

/**
 * Izin tampil ke orang tua (v2.5): pembinaan TERSEMBUNYI bagi orang tua sampai waka/kepala mengizinkan, per siswa × TA × level, mode ringkas
 * (status + tanggal) atau lengkap. Waka: level penanggung jawab wali/BK dan tidak terkunci. Kepala: semua, plus kunci/buka kunci.
 */
export default function IzinOrtu() {
  const { session } = useAuth();
  const peran = session?.role === "kepala" ? "kepala" : "waka";
  const actor = useActor();
  const notify = useToast();
  const { students, today } = useAdminData();
  const pd = usePembinaanData(); // levels + jalur bk/kepala dari provider bersama (tanpa langganan ganda)
  const d = { levels: pd.levels };
  const taNow = taKey(today);
  const [ta, setTa] = useState(taNow);
  const pbWali = useLive<PerNis<Pembinaan>>("pembinaan/wali");
  const izinLive = useLive<Tiga<Izin>>("izinOrtu");
  const kunciLive = useLive<Tiga<KunciOrtu>>("kunciOrtu");
  const [baru, setBaru] = useState(false);
  const [cabut, setCabut] = useState<Baris | null>(null);
  const [sibuk, setSibuk] = useState("");
  const siswa = useMemo(() => new Map(students.map((s) => [s.nis, s])), [students]);

  const baris = useMemo<Baris[]>(() => {
    const peta = new Map<string, Baris>();
    const tambah = (nis: string, taK: string, lv: string) => {
      const key = `${nis}|${taK}|${lv}`;
      if (!peta.has(key)) peta.set(key, { key, nis, ta: taK, levelId: lv, pj: kelompokPj(d.levels[lv]?.penanggungJawab), izin: izinLive.data?.[nis]?.[taK]?.[lv] ?? null, kunci: kunciLive.data?.[nis]?.[taK]?.[lv] ?? null, record: null });
      return peta.get(key)!;
    };
    for (const g of [pbWali.data, pd.pbBk, peran === "kepala" ? pd.pbKepala : null]) for (const [nis, per] of Object.entries(g ?? {})) for (const pb of Object.values(per)) { const b = tambah(nis, pb.ta, pb.levelId); b.record = pb; if (pb.pj) b.pj = pb.pj; }
    for (const [nis, per] of Object.entries(izinLive.data ?? {})) for (const [t, lvs] of Object.entries(per)) for (const lv of Object.keys(lvs)) tambah(nis, t, lv);
    for (const [nis, per] of Object.entries(kunciLive.data ?? {})) for (const [t, lvs] of Object.entries(per)) for (const lv of Object.keys(lvs)) tambah(nis, t, lv);
    return [...peta.values()].filter((b) => b.ta === ta).sort((a, b) => (siswa.get(a.nis)?.nama ?? a.nis).localeCompare(siswa.get(b.nis)?.nama ?? b.nis) || a.levelId.localeCompare(b.levelId));
  }, [pbWali.data, pd.pbBk, pd.pbKepala, peran, izinLive.data, kunciLive.data, d.levels, ta, siswa]);
  const taOpsi = useMemo(() => [...new Set([taNow, ...baris.map((b) => b.ta)])].sort().reverse(), [baris, taNow]);
  const memuat = pbWali.loading || pd.memuat || izinLive.loading || kunciLive.loading;

  const jalankan = async (b: Baris, kerja: () => Promise<unknown>, ok: string) => {
    setSibuk(b.key);
    try { await kerja(); notify(ok); } catch (ex) { notify(/permission/i.test((ex as Error).message) ? "Ditolak: level terkunci atau bukan wewenang Anda." : (ex as Error).message, "err"); }
    finally { setSibuk(""); }
  };
  const beri = (b: Baris, mode: ModeOrtu) => {
    if (!bolehBeriIzin(peran, b.pj, !!b.kunci)) { notify(b.kunci ? "Level ini dikunci kepala." : "Level penanggung jawab kepala hanya dapat diizinkan kepala.", "err"); return; }
    return jalankan(b, () => beriIzinOrtu({ nis: b.nis, ta: b.ta, levelId: b.levelId, mode, peran, record: b.record, nama: siswa.get(b.nis)?.nama ?? b.nis }, actor), mode === "lengkap" ? "Izin lengkap diberikan" : "Izin ringkas diberikan");
  };

  return (
    <section className="data-page" data-testid="izin-ortu">
      <div className="section-heading">
        <div><p>Izin tampil ke orang tua</p><span>{labelTa(ta)} · bawaan: orang tua TIDAK melihat pembinaan apa pun. Beri izin per siswa dan level.</span></div>
        <div className="heading-actions"><button className="primary-button" onClick={() => setBaru(true)} data-testid="izin-baru"><Icon name="plus" size={16} />Izin baru</button></div>
      </div>
      <div className="filter-bar"><select className="text-input auto" value={ta} onChange={(e) => setTa(e.target.value)} aria-label="Tahun ajaran">{taOpsi.map((t) => <option key={t} value={t}>{labelTa(t)}</option>)}</select></div>
      <article className="panel master-group">
        {memuat ? <div className="page-loader"><Spinner dark /></div> : baris.length === 0 ? <Empty icon="eye" title="Belum ada pembinaan atau izin" text="Pembinaan yang dicatat dan izin yang diberikan tampil di sini." /> : (
          <div className="simple-list" data-testid="baris-izin">
            {baris.map((b) => {
              const s = siswa.get(b.nis);
              const lv = d.levels[b.levelId];
              const bisaCabut = !!b.izin && bolehCabutIzin(peran, b.izin, actor.uid, !!b.kunci);
              return (
                <div key={b.key} data-nis={b.nis} data-level={b.levelId}>
                  <span><b>{s?.nama ?? b.nis}</b><small>{s?.kelas} · NIS {b.nis} · {lv ? `${lv.poin} poin` : b.levelId}</small></span>
                  <span>
                    <small>{b.record ? `${b.record.status === "selesai" ? "Selesai" : "Dijadwalkan"} ${formatTanggal(b.record.tanggal)}` : "Belum ada catatan pembinaan"}</small>
                    {b.izin ? <small className="badge badge-aman" data-testid="mode-izin">Izin {b.izin.mode} · oleh {b.izin.olehPeran}</small> : <small className="badge badge-lemah">Tersembunyi</small>}
                    {b.kunci && <small className="badge badge-izin" data-testid="terkunci" title={b.kunci.alasan}>Terkunci</small>}
                  </span>
                  <span className="row-actions">
                    {sibuk === b.key ? <Spinner dark /> : <>
                      {(!b.kunci || peran === "kepala") && <button className="ghost-button" onClick={() => beri(b, "ringkas")} data-testid="izin-ringkas">{MODE_ORTU_LABEL.ringkas}</button>}
                      {(!b.kunci || peran === "kepala") && <button className="ghost-button" onClick={() => beri(b, "lengkap")} data-testid="izin-lengkap">Lengkap</button>}
                      {bisaCabut && <button className="ghost-button" onClick={() => (peran === "kepala" && b.izin?.olehPeran === "waka" ? setCabut(b) : jalankan(b, () => cabutIzinOrtu({ nis: b.nis, ta: b.ta, levelId: b.levelId, nama: s?.nama ?? b.nis }, actor), "Izin dicabut"))} data-testid="cabut-izin">Cabut</button>}
                      {peran === "kepala" && b.kunci && <button className="ghost-button" onClick={() => jalankan(b, () => aturKunciOrtu({ nis: b.nis, ta: b.ta, levelId: b.levelId, nama: s?.nama ?? b.nis, kunci: false }, actor), "Kunci dibuka")} data-testid="buka-kunci">Buka kunci</button>}
                    </>}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </article>
      {baru && <IzinBaru students={students} levels={d.levels} ta={taNow} peran={peran} onClose={() => setBaru(false)} onPilih={(nis, levelId, mode) => {
        setBaru(false);
        const pj = kelompokPj(d.levels[levelId]?.penanggungJawab);
        if (!bolehBeriIzin(peran, pj, !!kunciLive.data?.[nis]?.[taNow]?.[levelId])) { notify("Level ini tidak dapat Anda izinkan (terkunci atau penanggung jawab kepala).", "err"); return; }
        const rec = [pbWali.data, pd.pbBk, peran === "kepala" ? pd.pbKepala : null].map((g) => g?.[nis]?.[`${taNow}_${levelId}`]).find(Boolean) ?? null;
        beriIzinOrtu({ nis, ta: taNow, levelId, mode, peran, record: rec, nama: siswa.get(nis)?.nama ?? nis }, actor).then(() => notify("Izin diberikan"), (ex) => notify((ex as Error).message, "err"));
      }} />}
      {cabut && <CabutKepala baris={cabut} nama={siswa.get(cabut.nis)?.nama ?? cabut.nis} onClose={() => setCabut(null)} aksi={(alasan) => cabutIzinOrtu({ nis: cabut.nis, ta: cabut.ta, levelId: cabut.levelId, nama: siswa.get(cabut.nis)?.nama ?? cabut.nis, kunciAlasan: alasan }, actor)} />}
    </section>
  );
}

type Baris = { key: string; nis: string; ta: string; levelId: string; pj: "wali" | "bk" | "kepala"; izin: Izin | null; kunci: KunciOrtu | null; record: Pembinaan | null };

function IzinBaru({ students, levels, onPilih, onClose }: {
  students: { nis: string; nama: string; kelas: string }[]; levels: Record<string, { poin: number; tindakan: string; penanggungJawab?: string }>; ta: string; peran: "waka" | "kepala";
  onPilih: (nis: string, levelId: string, mode: ModeOrtu) => void; onClose: () => void;
}) {
  const [nis, setNis] = useState<string[]>([]);
  const [levelId, setLevelId] = useState("");
  const [mode, setMode] = useState<ModeOrtu>("ringkas");
  const daftar = Object.entries(levels).sort((a, b) => a[1].poin - b[1].poin);
  return (
    <Modal title="Izin baru" subtitle="Izin boleh diberikan walaupun pembinaan belum dicatat" onClose={onClose}>
      <div className="modal-form">
        <Field label="Siswa"><StudentPicker students={students as never} value={nis} onChange={setNis} /></Field>
        <Field label="Level"><select className="text-input" value={levelId} onChange={(e) => setLevelId(e.target.value)} aria-label="Level"><option value="">Pilih level…</option>{daftar.map(([id, l]) => <option key={id} value={id}>{l.poin} poin · {l.tindakan}</option>)}</select></Field>
        <Field label="Yang dilihat orang tua"><select className="text-input" value={mode} onChange={(e) => setMode(e.target.value as ModeOrtu)} aria-label="Mode"><option value="ringkas">{MODE_ORTU_LABEL.ringkas}</option><option value="lengkap">{MODE_ORTU_LABEL.lengkap}</option></select></Field>
        <div className="modal-actions"><button className="secondary-button" onClick={onClose}>Batal</button><button className="primary-button" disabled={!nis[0] || !levelId} onClick={() => onPilih(nis[0], levelId, mode)}>Beri izin</button></div>
      </div>
    </Modal>
  );
}

/** Kepala membatalkan izin buatan waka: level itu DIKUNCI untuk siswa tsb pada TA tsb (waka tidak dapat mengizinkan ulang). */
function CabutKepala({ baris, nama, aksi, onClose }: { baris: Baris; nama: string; aksi: (alasan: string) => Promise<unknown>; onClose: () => void }) {
  const notify = useToast();
  const [alasan, setAlasan] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const a = alasan.trim();
    if (a.length < 10 || a.length > 300) { setErr("Alasan 10-300 karakter"); return; }
    setBusy(true);
    try { await aksi(a); notify("Izin dibatalkan dan level dikunci"); onClose(); } catch (ex) { setErr((ex as Error).message); } finally { setBusy(false); }
  };
  return (
    <Modal title="Batalkan izin waka" subtitle={`${nama} · ${baris.levelId}`} onClose={onClose} width={480}>
      <form className="modal-form" onSubmit={submit} noValidate data-testid="form-kunci">
        <p className="modal-note">Level ini akan <b>dikunci</b>: waka tidak dapat mengizinkannya lagi untuk siswa dan tahun ajaran ini. Hanya kepala yang dapat membuka kunci.</p>
        <Field label="Alasan" error={err} hint={`${alasan.trim().length}/300 · minimal 10 karakter`}><textarea className="text-input" rows={3} value={alasan} maxLength={300} onChange={(e) => setAlasan(e.target.value)} aria-label="Alasan kunci" /></Field>
        <div className="modal-actions"><button type="button" className="secondary-button" onClick={onClose}>Batal</button><button className="primary-button" disabled={busy}>{busy ? <Spinner /> : null}Batalkan dan kunci</button></div>
      </form>
    </Modal>
  );
}
