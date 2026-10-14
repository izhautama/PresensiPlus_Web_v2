import { useMemo, useState, type FormEvent } from "react";
import Icon from "../components/Icon";
import StudentPicker from "../components/StudentPicker";
import { Field, Modal, Spinner } from "../components/ui";
import { useAdminData } from "../admin/AdminData";
import { useToast } from "../admin/AdminLayout";
import {
  KATEGORI_LIST, awalTa, levelDari, ringkas, taKey,
  type KategoriPelanggaran, type LevelItem, type RecordsByNis, type Remisi, type Rule,
} from "../lib/discipline";
import { formatTanggal } from "../lib/time";
import { catatRecords, type Actor } from "../services/discipline";

export type Capaian = { nis: string; nama: string; level: string };

type Props = {
  jenis: "pelanggaran" | "remisi";
  presetNis?: string[];
  rules: Record<string, Rule>;
  remisi: Record<string, Remisi>;
  levelList: LevelItem[];
  records: RecordsByNis;
  actor: Actor;
  onClose: () => void;
  onSaved: (capaian: Capaian[]) => void;
};

/** Form catat pelanggaran / remisi untuk satu atau banyak siswa sekaligus. */
export default function CatatDialog({ jenis, presetNis, rules, remisi, levelList, records, actor, onClose, onSaved }: Props) {
  const { students, today } = useAdminData();
  const notify = useToast();
  const pel = jenis === "pelanggaran";
  const [nisList, setNisList] = useState<string[]>(presetNis ?? []);
  const [bebas, setBebas] = useState(false);
  const [refId, setRefId] = useState("");
  const [filter, setFilter] = useState("");
  const [cari, setCari] = useState("");
  const [nama, setNama] = useState("");
  const [kategori, setKategori] = useState<KategoriPelanggaran>("Ringan");
  const [poin, setPoin] = useState("");
  const [takziran, setTakziran] = useState("");
  const [tanggal, setTanggal] = useState(today);
  const [catatan, setCatatan] = useState("");
  const [err, setErr] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const taSekarang = taKey(today);
  const minTanggal = awalTa(taSekarang);

  const daftar = useMemo(() => {
    const qq = cari.trim().toLowerCase();
    if (pel) {
      return Object.entries(rules)
        .filter(([, x]) => x.aktif && (!filter || x.kategori === filter) && (!qq || x.nama.toLowerCase().includes(qq)))
        .sort((a, b) => KATEGORI_LIST.indexOf(a[1].kategori) - KATEGORI_LIST.indexOf(b[1].kategori) || a[1].nama.localeCompare(b[1].nama))
        .map(([id, x]) => ({ id, nama: x.nama, poin: x.poin, label: x.kategori, takziran: x.takziran, kategori: x.kategori as string }));
    }
    return Object.entries(remisi)
      .filter(([, x]) => x.aktif && (!filter || x.kelompok === filter) && (!qq || x.nama.toLowerCase().includes(qq)))
      .sort((a, b) => a[1].kelompok.localeCompare(b[1].kelompok) || b[1].poin - a[1].poin)
      .map(([id, x]) => ({ id, nama: x.nama, poin: x.poin, label: x.kelompok, takziran: undefined, kategori: x.kelompok as string }));
  }, [pel, rules, remisi, filter, cari]);

  const terpilih = daftar.find((x) => x.id === refId) ?? (refId ? (pel ? rulePilihan(rules, refId) : remisiPilihan(remisi, refId)) : null);
  const kelompokTP = !pel && !bebas && remisi[refId]?.kelompok === "Tanpa prestasi";

  const pilihDaftar = (id: string) => {
    setRefId(id);
    const x = pel ? rules[id] : remisi[id];
    if (!x) return;
    setPoin(String(x.poin));
    if (pel) setTakziran((x as Rule).takziran ?? "");
    setErr((e) => ({ ...e, ref: "" }));
  };

  const taRecord = taKey(tanggal || today);
  const tanpaPelanggaran = kelompokTP
    ? nisList.filter((n) => ringkas(records[n], taRecord).pel === 0).map((n) => students.find((s) => s.nis === n)?.nama ?? n)
    : [];

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const v: Record<string, string> = {};
    const p = Number(poin);
    if (!nisList.length) v.siswa = "Pilih minimal satu siswa";
    if (bebas) { if (!nama.trim()) v.nama = "Nama wajib diisi"; else if (nama.trim().length > 200) v.nama = "Maksimal 200 karakter"; }
    else if (!refId) v.ref = pel ? "Pilih pelanggaran dari daftar atau gunakan \"Ketik bebas\"" : "Pilih remisi dari daftar atau gunakan \"Ketik bebas\"";
    if (!Number.isInteger(p) || p < 1 || p > 1000) v.poin = "Poin harus bilangan bulat 1–1000";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(tanggal)) v.tanggal = "Tanggal tidak valid";
    else if (tanggal > today) v.tanggal = "Tanggal tidak boleh di masa depan";
    else if (tanggal < minTanggal) v.tanggal = `Tanggal harus dalam tahun ajaran berjalan (mulai ${formatTanggal(minTanggal, false)})`;
    if (takziran.length > 300) v.takziran = "Maksimal 300 karakter";
    if (catatan.length > 500) v.catatan = "Maksimal 500 karakter";
    if (tanpaPelanggaran.length) v.siswa = `Remisi "Tanpa prestasi" hanya untuk murid yang punya catatan pelanggaran di TA ini. Belum ada: ${tanpaPelanggaran.join(", ")}`;
    setErr(v);
    if (Object.keys(v).length) return;

    const ta = taKey(tanggal);
    const namaFinal = bebas ? nama.trim() : (terpilih?.nama ?? "");
    const kategoriFinal = bebas ? (pel ? kategori : undefined) : terpilih?.kategori;
    setBusy(true);
    try {
      // capaian ambang baru: hitung sebelum menyimpan
      const capaian: Capaian[] = [];
      for (const nis of nisList) {
        const sebelum = ringkas(records[nis], ta).saldo;
        const sesudah = Math.max(0, sebelum + (pel ? p : -p));
        const lv0 = levelDari(sebelum, levelList).sekarang;
        const lv1 = levelDari(sesudah, levelList).sekarang;
        if (lv1 && lv1[1].poin > (lv0?.[1].poin ?? 0)) capaian.push({ nis, nama: students.find((s) => s.nis === nis)?.nama ?? nis, level: lv1[1].tindakan });
      }
      await catatRecords(nisList, {
        jenis, refId: bebas ? undefined : refId, nama: namaFinal, kategori: kategoriFinal, poin: p, tanggal, ta,
        takziran: pel ? takziran.trim() || undefined : undefined, catatan: catatan.trim() || undefined,
      }, actor);
      notify(`${pel ? "Pelanggaran" : "Remisi"} dicatat untuk ${nisList.length} siswa`);
      onSaved(capaian);
    } catch (ex) {
      setErr({ general: (ex as Error).message });
      setBusy(false);
    }
  };

  const nilaiPoin = Number(poin);
  const infoNol = !pel && nisList.some((n) => { const x = ringkas(records[n], taRecord); return x.pel - x.rem - (Number.isFinite(nilaiPoin) ? nilaiPoin : 0) < 0; });

  return (
    <Modal title={pel ? "Catat pelanggaran" : "Catat remisi"} subtitle={pel ? "Pilih siswa (boleh lebih dari satu) dan jenis pelanggaran." : "Pengurang poin untuk prestasi atau perilaku baik."} onClose={onClose} width={620}>
      <form className="modal-form" onSubmit={submit} noValidate>
        <Field label={pel ? "Siswa" : "Siswa penerima"} error={err.siswa}>
          <StudentPicker students={students} value={nisList} onChange={setNisList} multiple />
        </Field>

        <div className="chip-group small" role="tablist">
          <button type="button" role="tab" aria-selected={!bebas} className={!bebas ? "active" : ""} onClick={() => setBebas(false)}>Dari daftar</button>
          <button type="button" role="tab" aria-selected={bebas} className={bebas ? "active" : ""} onClick={() => setBebas(true)}>Ketik bebas</button>
        </div>

        {!bebas ? (
          <Field label={pel ? "Jenis pelanggaran" : "Jenis remisi"} error={err.ref}>
            <div className="pick-panel">
              <div className="pick-filter">
                <select className="text-input" value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Filter">
                  <option value="">{pel ? "Semua kategori" : "Semua kelompok"}</option>
                  {(pel ? KATEGORI_LIST : ["Prestasi", "Tanpa prestasi"]).map((k) => <option key={k}>{k}</option>)}
                </select>
                <input className="text-input" placeholder="Cari..." value={cari} onChange={(e) => setCari(e.target.value)} />
              </div>
              <div className="pick-list" role="listbox">
                {daftar.length === 0 ? <p className="picker-empty">Daftar kosong. Isi di menu Tata tertib atau gunakan "Ketik bebas".</p> : daftar.map((x) => (
                  <button type="button" key={x.id} role="option" aria-selected={refId === x.id} className={refId === x.id ? "active" : ""} onClick={() => pilihDaftar(x.id)}>
                    <span><b>{x.nama}</b><small>{x.label}{x.takziran ? " · ada takziran" : ""}</small></span>
                    <em>{pel ? "+" : "−"}{x.poin}</em>
                  </button>
                ))}
              </div>
            </div>
          </Field>
        ) : (
          <>
            <Field label={pel ? "Nama pelanggaran" : "Nama remisi"} error={err.nama}><input className="text-input" value={nama} maxLength={200} onChange={(e) => setNama(e.target.value)} /></Field>
            {pel && (
              <Field label="Kategori">
                <select className="text-input" value={kategori} onChange={(e) => setKategori(e.target.value as KategoriPelanggaran)}>{KATEGORI_LIST.map((k) => <option key={k}>{k}</option>)}</select>
              </Field>
            )}
          </>
        )}

        <div className="form-grid">
          <Field label="Poin" error={err.poin} hint={pel ? "Terisi dari daftar, boleh diubah." : "Mengurangi saldo (minimal 0)."}>
            <input className="text-input" inputMode="numeric" value={poin} onChange={(e) => setPoin(e.target.value.replace(/\D/g, "").slice(0, 4))} />
          </Field>
          <Field label="Tanggal kejadian" error={err.tanggal}>
            <input className="text-input" type="date" value={tanggal} min={minTanggal} max={today} onChange={(e) => setTanggal(e.target.value)} />
          </Field>
        </div>

        {pel && <Field label="Takziran / sanksi (opsional)" error={err.takziran}><textarea className="text-input area" rows={2} value={takziran} maxLength={300} onChange={(e) => setTakziran(e.target.value)} /></Field>}
        <Field label="Catatan internal (opsional)" error={err.catatan} hint="Kronologi atau saksi. Tidak terlihat oleh orang tua.">
          <textarea className="text-input area" rows={2} value={catatan} maxLength={500} onChange={(e) => setCatatan(e.target.value)} />
        </Field>

        {infoNol && <div className="notice warn"><Icon name="warning" size={17} /><span>Remisi ini melebihi saldo sebagian siswa. Saldo dibulatkan ke 0.</span></div>}
        {err.general && <div className="login-error-box" role="alert"><Icon name="warning" size={17} /><div><span>{err.general}</span></div></div>}
        <div className="modal-actions">
          <button type="button" className="secondary-button" onClick={onClose}>Batal</button>
          <button className="primary-button" disabled={busy}>{busy ? <Spinner /> : null}Simpan{nisList.length > 1 ? ` (${nisList.length} siswa)` : ""}</button>
        </div>
      </form>
    </Modal>
  );
}

// Fallback bila entri master yang dipilih sedang tersaring/nonaktif
function rulePilihan(rules: Record<string, Rule>, id: string) {
  const x = rules[id];
  return x ? { id, nama: x.nama, poin: x.poin, label: x.kategori, takziran: x.takziran, kategori: x.kategori as string } : null;
}
function remisiPilihan(remisi: Record<string, Remisi>, id: string) {
  const x = remisi[id];
  return x ? { id, nama: x.nama, poin: x.poin, label: x.kelompok, takziran: undefined, kategori: x.kelompok as string } : null;
}
