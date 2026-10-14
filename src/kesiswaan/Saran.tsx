import { useEffect, useMemo, useRef, useState } from "react";
import Icon from "../components/Icon";
import { Empty, Field, Modal, Spinner, StatusBadge } from "../components/ui";
import { useAdminData } from "../admin/AdminData";
import { useBisaTulisKesiswaan, useToast } from "../admin/AdminLayout";
import { initials, toneOf } from "../lib/attendance";
import { SEMUA_TIPE_SARAN, TIPE_LABEL, cariAturanBawaan, type Saran } from "../lib/saran";
import { addDays, formatTanggal, weekday } from "../lib/time";
import { simpanAutoMap } from "../services/discipline";
import { abaikanSaran, setujuiSaran, SudahDiputuskan } from "../services/saran";
import { rentang, useSaran } from "./useSaran";
import { useActor } from "./useDiscipline";

/** Saran pelanggaran otomatis ("Perlu ditinjau"): TIDAK pernah mencatat poin tanpa konfirmasi staf. */
export default function SaranHalaman() {
  const { today } = useAdminData();
  const bisaTulis = useBisaTulisKesiswaan();
  const actor = useActor();
  const notify = useToast();
  const [dari, setDari] = useState(addDays(today, -1));
  const [sampai, setSampai] = useState(today);
  const tanggal = useMemo(() => rentang(dari, sampai), [dari, sampai]);
  const { saran, loading, error, rules, autoMap } = useSaran(tanggal);
  const [pilih, setPilih] = useState<Set<string>>(new Set());
  const [abaikan, setAbaikan] = useState<Saran[] | null>(null);
  const [sibuk, setSibuk] = useState<Set<string>>(new Set());

  const id = (s: Saran) => `${s.tanggal}|${s.key}`;
  const semuaLibur = tanggal.length > 0 && tanggal.every((t) => weekday(t) === 0);
  const aturanKosong = !loading && Object.values(autoMap).filter(Boolean).length === 0;

  // Cadangan nama hanya SEKALI: bila ditemukan, tulis id aturannya ke autoMap (dengan audit) agar tidak bergantung nama lagi
  const sudahDiusulkan = useRef(new Set<string>());
  useEffect(() => {
    if (loading || !bisaTulis) return;
    for (const tipe of SEMUA_TIPE_SARAN) {
      if (autoMap[tipe] || sudahDiusulkan.current.has(tipe)) continue;
      const id = cariAturanBawaan(tipe, rules);
      if (!id) continue;
      sudahDiusulkan.current.add(tipe);
      simpanAutoMap(tipe, id, undefined, actor).catch(() => sudahDiusulkan.current.delete(tipe));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, bisaTulis, autoMap, rules]);
  const belumDipetakan = !loading && !aturanKosong ? SEMUA_TIPE_SARAN.filter((t) => !autoMap[t] && !(bisaTulis && cariAturanBawaan(t, rules))) : [];

  const tandaiSibuk = (daftar: Saran[], on: boolean) => setSibuk((x) => { const n = new Set(x); daftar.forEach((s) => (on ? n.add(id(s)) : n.delete(id(s)))); return n; });

  const setujui = async (daftar: Saran[]) => {
    tandaiSibuk(daftar, true);
    const hasil = await Promise.allSettled(daftar.map((s) => setujuiSaran(s, rules[s.ruleId], actor)));
    tandaiSibuk(daftar, false);
    const ok = hasil.filter((h) => h.status === "fulfilled").length;
    const bentrok = hasil.filter((h) => h.status === "rejected" && h.reason instanceof SudahDiputuskan).length;
    const lain = hasil.find((h) => h.status === "rejected" && !(h.reason instanceof SudahDiputuskan)) as PromiseRejectedResult | undefined;
    if (ok) notify(`${ok} saran disetujui dan tercatat sebagai pelanggaran`);
    if (bentrok) notify(`${bentrok} saran sudah diputuskan oleh staf lain`, "err");
    if (lain) notify((lain.reason as Error).message, "err");
    setPilih(new Set());
  };

  const nilai = (s: Saran) => rules[s.ruleId];
  const terpilih = saran.filter((s) => pilih.has(id(s)));
  const toggle = (s: Saran) => setPilih((x) => { const n = new Set(x); if (n.has(id(s))) n.delete(id(s)); else n.add(id(s)); return n; });

  return (
    <section className="data-page">
      <div className="section-heading">
        <div><p>Perlu ditinjau</p><span>Saran pelanggaran otomatis dari data tap dan presensi per jam · tidak ada poin yang dicatat tanpa persetujuan{bisaTulis ? "" : " · hanya lihat"}</span></div>
      </div>

      <div className="filter-bar no-print">
        <label className="inline-field">Dari <input type="date" className="text-input auto" value={dari} max={sampai} onChange={(e) => e.target.value && setDari(e.target.value)} /></label>
        <label className="inline-field">Sampai <input type="date" className="text-input auto" value={sampai} max={today} onChange={(e) => e.target.value && setSampai(e.target.value)} /></label>
        <span className="caption-text inline">Maks. 7 hari. Hari Minggu (libur) dilewati.</span>
        {bisaTulis && terpilih.length > 0 && (
          <span className="bulk-bar">
            <b>{terpilih.length} dipilih</b>
            <button className="primary-button sm" onClick={() => setujui(terpilih)}>Setujui terpilih</button>
            <button className="secondary-button sm" onClick={() => setAbaikan(terpilih)}>Abaikan terpilih</button>
          </span>
        )}
      </div>

      {error && <div className="notice warn" role="alert"><Icon name="warning" size={17} /><span>Sebagian data tidak dapat dimuat ({error}).</span></div>}
      {belumDipetakan.length > 0 && <div className="notice warn" data-testid="saran-belum-dipetakan"><Icon name="warning" size={17} /><span>Jenis saran belum dipetakan ke aturan: {belumDipetakan.map((t) => TIPE_LABEL[t]).join(", ")}. Saran jenis ini tidak dibuat. Atur di Tata tertib &gt; Pemetaan saran.</span></div>}
      {aturanKosong && <div className="notice warn"><Icon name="warning" size={17} /><span>Pemetaan saran belum diatur (autoMap kosong). Isi tata tertib awal terlebih dahulu.</span></div>}

      {semuaLibur ? (
        <div className="panel"><Empty icon="calendar" title="Hari Minggu — libur" text="Tidak ada saran pada hari libur." /></div>
      ) : (
        <div className="table-panel">
          <div className="table-head saran-grid"><span /><span>Siswa</span><span>Tanggal</span><span>Jenis</span><span>Pelanggaran</span><span className="ta-right">Aksi</span></div>
          {loading ? <div className="page-loader"><Spinner dark /></div> : saran.length === 0 ? (
            <Empty icon="check" title="Tidak ada saran" text="Semua sudah ditinjau, atau tidak ada kejadian pada rentang ini." />
          ) : saran.map((s) => (
            <div className="table-row saran-grid saran-row" key={id(s)} data-tipe={s.tipe}>
              <span>{bisaTulis && <input type="checkbox" aria-label={`Pilih ${s.nama} ${TIPE_LABEL[s.tipe]}`} checked={pilih.has(id(s))} onChange={() => toggle(s)} />}</span>
              <span className="student-cell"><i className={`avatar ${toneOf(s.nis)}`}>{initials(s.nama)}</i><span><b>{s.nama}</b><small>{s.kelas} · NIS {s.nis}</small></span></span>
              <span>{formatTanggal(s.tanggal, false)}</span>
              <span><StatusBadge status={TIPE_LABEL[s.tipe]} /><small className="muted block">{s.detail}</small></span>
              <span><b>{nilai(s)?.nama}</b><small className="muted block">+{nilai(s)?.poin} poin · {nilai(s)?.kategori}{nilai(s)?.takziran ? " · ada takziran" : ""}</small></span>
              <span className="aksi-cell">
                {bisaTulis && (
                  <>
                    <button className="primary-button sm" disabled={sibuk.has(id(s))} onClick={() => setujui([s])}>{sibuk.has(id(s)) ? <Spinner /> : null}Setujui</button>
                    <button className="secondary-button sm" disabled={sibuk.has(id(s))} onClick={() => setAbaikan([s])}>Abaikan</button>
                  </>
                )}
              </span>
            </div>
          ))}
        </div>
      )}

      {abaikan && <AbaikanDialog daftar={abaikan} onClose={() => setAbaikan(null)} onOk={async (alasan) => {
        const daftar = abaikan;
        setAbaikan(null);
        tandaiSibuk(daftar, true);
        const hasil = await Promise.allSettled(daftar.map((s) => abaikanSaran(s, alasan, actor)));
        tandaiSibuk(daftar, false);
        const ok = hasil.filter((h) => h.status === "fulfilled").length;
        if (ok) notify(`${ok} saran diabaikan`);
        const gagal = hasil.find((h) => h.status === "rejected") as PromiseRejectedResult | undefined;
        if (gagal) notify((gagal.reason as Error).message, "err");
        setPilih(new Set());
      }} />}
    </section>
  );
}

function AbaikanDialog({ daftar, onClose, onOk }: { daftar: Saran[]; onClose: () => void; onOk: (alasan: string) => void }) {
  const [alasan, setAlasan] = useState("");
  return (
    <Modal title={`Abaikan ${daftar.length} saran?`} subtitle="Saran yang diabaikan tidak akan muncul lagi." onClose={onClose} width={440}>
      <Field label="Alasan (opsional)"><input className="text-input" maxLength={200} value={alasan} onChange={(e) => setAlasan(e.target.value)} placeholder="contoh: sudah ditangani wali kelas" /></Field>
      <div className="modal-actions">
        <button className="secondary-button" onClick={onClose}>Batal</button>
        <button className="primary-button" onClick={() => onOk(alasan)}>Abaikan</button>
      </div>
    </Modal>
  );
}
