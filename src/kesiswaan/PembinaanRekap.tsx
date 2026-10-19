import { useMemo, useState } from "react";
import Icon from "../components/Icon";
import { Empty, Field, Modal, Spinner } from "../components/ui";
import StudentPicker from "../components/StudentPicker";
import { useAdminData } from "../admin/AdminData";
import { useBisaTulisKesiswaan } from "../admin/AdminLayout";
import { downloadCSV } from "../lib/attendance";
import { labelTa, taKey } from "../lib/discipline";
import { PJ_LABEL, type Pembinaan } from "../lib/pembinaan";
import { formatTanggal } from "../lib/time";
import { useLive } from "../services/db";
import FormPembinaan from "./FormPembinaan";
import { useActor, useDiscipline } from "./useDiscipline";

type PerNis = Record<string, Record<string, Pembinaan>>;

/** Rekap pembinaan (wali kelas dan pejabat) untuk waka/kepala/admin: filter TA/status/kelas, CSV, catat atau koreksi (waka & kepala). */
export default function PembinaanRekap() {
  const bisaTulis = useBisaTulisKesiswaan();
  const actor = useActor();
  const { students, today } = useAdminData();
  const d = useDiscipline();
  const live = useLive<PerNis>("pembinaan");
  const taNow = taKey(today);
  const [ta, setTa] = useState(taNow);
  const [status, setStatus] = useState("");
  const [kelas, setKelas] = useState("");
  const [buka, setBuka] = useState<string | null>(null);
  const [form, setForm] = useState<{ nis: string; levelId: string; ada?: Pembinaan | null } | null>(null);
  const [baru, setBaru] = useState(false);
  const siswa = useMemo(() => new Map(students.map((s) => [s.nis, s])), [students]);
  const kelasList = useMemo(() => [...new Set(students.map((s) => s.kelas))].sort(), [students]);

  const semua = useMemo(() => {
    const out: { nis: string; id: string; pb: Pembinaan }[] = [];
    for (const [nis, per] of Object.entries(live.data ?? {})) for (const [id, pb] of Object.entries(per)) out.push({ nis, id, pb });
    return out;
  }, [live.data]);
  const taOpsi = useMemo(() => [...new Set([taNow, ...semua.map((x) => x.pb.ta)])].sort().reverse(), [semua, taNow]);
  const baris = useMemo(() => semua
    .filter((x) => x.pb.ta === ta && (!status || x.pb.status === status) && (!kelas || siswa.get(x.nis)?.kelas === kelas))
    .sort((a, b) => b.pb.tanggal.localeCompare(a.pb.tanggal) || (siswa.get(a.nis)?.nama ?? "").localeCompare(siswa.get(b.nis)?.nama ?? "")), [semua, ta, status, kelas, siswa]);

  const csv = () => downloadCSV(`pembinaan_${ta}.csv`, ["NIS", "Nama", "Kelas", "Tahun ajaran", "Ambang (poin)", "Penanggung jawab ambang", "Tanggal", "Metode", "Status", "Pelaksana", "Hasil", "Tindak lanjut"],
    baris.map(({ nis, pb }) => {
      const s = siswa.get(nis);
      const lv = d.levels[pb.levelId];
      return [nis, s?.nama ?? "", s?.kelas ?? "", pb.ta, pb.levelPoin, lv?.penanggungJawab ? PJ_LABEL[lv.penanggungJawab] : "", pb.tanggal, pb.metode, pb.status === "selesai" ? "Selesai" : "Dijadwalkan", pb.olehNama, pb.hasil, pb.tindakLanjut ?? ""];
    }));

  return (
    <section className="data-page" data-testid="rekap-pembinaan">
      <div className="section-heading">
        <div><p>Pembinaan</p><span>Rekap pembinaan wali kelas dan pejabat · {labelTa(ta)}{bisaTulis ? "" : " · hanya lihat"}</span></div>
        <div className="heading-actions">
          <button className="secondary-button" onClick={csv} disabled={baris.length === 0}><Icon name="download" size={16} />Unduh CSV</button>
          {bisaTulis && <button className="primary-button" onClick={() => setBaru(true)}><Icon name="plus" size={16} />Catat pembinaan</button>}
        </div>
      </div>
      <div className="filter-bar">
        <select className="text-input auto" value={ta} onChange={(e) => setTa(e.target.value)} aria-label="Tahun ajaran">{taOpsi.map((t) => <option key={t} value={t}>{labelTa(t)}</option>)}</select>
        <select className="text-input auto" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status"><option value="">Semua status</option><option value="selesai">Selesai</option><option value="dijadwalkan">Dijadwalkan</option></select>
        <select className="text-input auto" value={kelas} onChange={(e) => setKelas(e.target.value)} aria-label="Kelas"><option value="">Semua kelas</option>{kelasList.map((k) => <option key={k}>{k}</option>)}</select>
      </div>
      <article className="panel master-group">
        {live.error ? <Empty icon="alert" title="Gagal memuat" text={live.error} /> : live.loading ? <div className="page-loader"><Spinner dark /></div> : baris.length === 0 ? <Empty icon="file" title="Belum ada pembinaan" text="Pembinaan yang dicatat wali kelas atau pejabat tampil di sini." /> : (
          <div className="simple-list" data-testid="baris-pembinaan">
            {baris.map(({ nis, id, pb }) => {
              const s = siswa.get(nis);
              return (
                <div key={`${nis}-${id}`} data-nis={nis} data-status={pb.status}>
                  <span><b>{s?.nama ?? nis}</b><small>{s?.kelas} · NIS {nis}</small></span>
                  <span>
                    <small>{formatTanggal(pb.tanggal)} · {pb.metode} · ambang {pb.levelPoin} poin · {pb.olehNama}</small>
                    <small className={`badge ${pb.status === "selesai" ? "badge-aman" : "badge-izin"}`}>{pb.status === "selesai" ? "Selesai" : "Dijadwalkan"}</small>
                    {buka === `${nis}-${id}` && <small data-testid="isi-pembinaan">{pb.hasil}{pb.tindakLanjut ? ` · Tindak lanjut: ${pb.tindakLanjut}` : ""}</small>}
                  </span>
                  <span className="row-actions">
                    <button className="ghost-button" onClick={() => setBuka(buka === `${nis}-${id}` ? null : `${nis}-${id}`)}>{buka === `${nis}-${id}` ? "Tutup" : "Lihat isi"}</button>
                    {bisaTulis && d.levels[pb.levelId] && <button className="ghost-button" onClick={() => setForm({ nis, levelId: pb.levelId, ada: pb })}>Koreksi</button>}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </article>
      {form && siswa.get(form.nis) && d.levels[form.levelId] && (
        <FormPembinaan siswa={siswa.get(form.nis)!} ta={form.ada?.ta ?? taNow} levelId={form.levelId} level={d.levels[form.levelId]} ada={form.ada} today={today} ctx={actor} onClose={() => setForm(null)} />
      )}
      {baru && <PilihBaru students={students} levels={d.levels} pembinaan={live.data ?? {}} ta={taNow} onPilih={(nis, levelId) => { setBaru(false); setForm({ nis, levelId, ada: live.data?.[nis]?.[`${taNow}_${levelId}`] ?? null }); }} onClose={() => setBaru(false)} />}
    </section>
  );
}

/** Langkah 1 mencatat pembinaan baru oleh waka/kepala: pilih siswa dan ambang (penanggung jawab mana pun). */
function PilihBaru({ students, levels, onPilih, onClose }: {
  students: { nis: string; nama: string; kelas: string; uid?: string }[]; levels: Record<string, { poin: number; tindakan: string; penanggungJawab?: keyof typeof PJ_LABEL }>;
  pembinaan: PerNis; ta: string; onPilih: (nis: string, levelId: string) => void; onClose: () => void;
}) {
  const [nis, setNis] = useState<string[]>([]);
  const [levelId, setLevelId] = useState("");
  const daftar = Object.entries(levels).sort((a, b) => a[1].poin - b[1].poin);
  return (
    <Modal title="Catat pembinaan" subtitle="Pilih siswa dan ambang pembinaan" onClose={onClose}>
      <div className="modal-form">
        <Field label="Siswa"><StudentPicker students={students as never} value={nis} onChange={setNis} /></Field>
        <Field label="Ambang pembinaan">
          <select className="text-input" value={levelId} onChange={(e) => setLevelId(e.target.value)} aria-label="Ambang pembinaan">
            <option value="">Pilih ambang…</option>
            {daftar.map(([id, l]) => <option key={id} value={id}>{l.poin} poin · {l.tindakan}{l.penanggungJawab ? ` (${PJ_LABEL[l.penanggungJawab]})` : ""}</option>)}
          </select>
        </Field>
        <div className="modal-actions"><button className="secondary-button" onClick={onClose}>Batal</button><button className="primary-button" disabled={!nis[0] || !levelId} onClick={() => onPilih(nis[0], levelId)}>Lanjut</button></div>
      </div>
    </Modal>
  );
}
