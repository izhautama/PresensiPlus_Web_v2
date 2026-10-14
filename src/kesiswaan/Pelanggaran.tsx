import { useMemo, useState } from "react";
import Icon from "../components/Icon";
import { Empty, Modal, Spinner, StatusBadge } from "../components/ui";
import { useAdminData } from "../admin/AdminData";
import { useBisaTulisKesiswaan } from "../admin/AdminLayout";
import { initials, toneOf } from "../lib/attendance";
import { labelTa, levelDari, perluTindakLanjut, ringkas, taKey } from "../lib/discipline";
import type { StudentRow } from "../lib/types";
import CatatDialog, { type Capaian } from "./CatatDialog";
import DetailSiswa from "./DetailSiswa";
import { useActor, useDiscipline } from "./useDiscipline";

export default function Pelanggaran() {
  const { students, kelasList, today, ready } = useAdminData();
  const d = useDiscipline();
  const actor = useActor();
  const bisaTulis = useBisaTulisKesiswaan();
  const taNow = taKey(today);
  const [ta, setTa] = useState(taNow);
  const [q, setQ] = useState("");
  const [kelas, setKelas] = useState("");
  const [saja, setSaja] = useState(false);
  const [detailNis, setDetailNis] = useState<string | null>(null);
  const [catat, setCatat] = useState<{ jenis: "pelanggaran" | "remisi"; preset?: string[] } | null>(null);
  const [capaian, setCapaian] = useState<Capaian[]>([]);

  const taOpsi = useMemo(() => {
    const set = new Set<string>([taNow]);
    for (const per of Object.values(d.records)) for (const x of Object.values(per)) set.add(x.ta);
    return [...set].sort().reverse();
  }, [d.records, taNow]);

  const rows = useMemo(() => {
    const qq = q.trim().toLowerCase();
    return students
      .filter((s) => (!kelas || s.kelas === kelas) && (!qq || `${s.nama} ${s.nis}`.toLowerCase().includes(qq)))
      .map((s) => {
        const r = ringkas(d.records[s.nis], ta);
        return { s, r, level: levelDari(r.saldo, d.levelList).sekarang, perlu: perluTindakLanjut(r, d.levelList) };
      })
      .filter((x) => !saja || x.perlu)
      .sort((a, b) => b.r.saldo - a.r.saldo || a.s.nama.localeCompare(b.s.nama));
  }, [students, d.records, d.levelList, ta, q, kelas, saja]);

  const jumlahPerlu = useMemo(() => students.filter((s) => perluTindakLanjut(ringkas(d.records[s.nis], ta), d.levelList)).length, [students, d.records, d.levelList, ta]);
  const detail: StudentRow | undefined = students.find((s) => s.nis === detailNis);

  return (
    <section className="data-page">
      <div className="section-heading">
        <div><p>Pelanggaran &amp; remisi</p><span>{labelTa(ta)} · saldo = pelanggaran − remisi (minimal 0){bisaTulis ? "" : " · hanya lihat"}</span></div>
        {bisaTulis && (
          <div className="heading-actions">
            <button className="secondary-button" onClick={() => setCatat({ jenis: "remisi" })}>Catat remisi</button>
            <button className="primary-button" onClick={() => setCatat({ jenis: "pelanggaran" })}><Icon name="plus" size={17} />Catat pelanggaran</button>
          </div>
        )}
      </div>

      {d.errors.length > 0 && <div className="notice warn" role="alert"><Icon name="warning" size={17} /><span>Sebagian data kesiswaan tidak dapat dimuat ({d.errors[0]}).</span></div>}
      {!d.loading && d.levelList.length === 0 && <div className="notice warn"><Icon name="warning" size={17} /><span>Ambang pembinaan belum diatur. Isi di menu Tata tertib agar level siswa dapat dihitung.</span></div>}

      <div className="filter-bar">
        <div className="search search-inline"><Icon name="search" size={18} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari nama atau NIS..." aria-label="Cari siswa" /></div>
        <select value={kelas} onChange={(e) => setKelas(e.target.value)} aria-label="Filter kelas"><option value="">Semua kelas</option>{kelasList.map((k) => <option key={k}>{k}</option>)}</select>
        <select value={ta} onChange={(e) => setTa(e.target.value)} aria-label="Tahun ajaran">{taOpsi.map((t) => <option key={t} value={t}>{labelTa(t)}</option>)}</select>
        <label className="check-inline"><input type="checkbox" checked={saja} onChange={(e) => setSaja(e.target.checked)} />Perlu tindak lanjut ({jumlahPerlu})</label>
      </div>

      <div className="table-panel">
        <div className="table-head disc-grid"><span>Siswa</span><span>Kelas</span><span>Pelanggaran</span><span>Remisi</span><span>Saldo</span><span>Level</span></div>
        {!ready || d.loading ? <div className="page-loader"><Spinner dark /></div> : rows.length === 0 ? (
          <Empty icon="users" title={saja ? "Tidak ada siswa yang perlu tindak lanjut" : "Tidak ada siswa yang cocok"} />
        ) : rows.map(({ s, r, level, perlu }) => (
          <button className="table-row disc-grid row-button" key={s.nis} onClick={() => setDetailNis(s.nis)}>
            <span className="student-cell"><i className={`avatar ${toneOf(s.nis)}`}>{initials(s.nama)}</i><span><b>{s.nama}</b><small>NIS {s.nis}</small></span></span>
            <span>{s.kelas}</span>
            <span className="num">{r.pel || "—"}</span>
            <span className="num">{r.rem ? `−${r.rem}` : "—"}</span>
            <span><b className={`saldo ${perlu ? "bad" : ""}`}>{r.saldo}</b></span>
            <span>{r.sangatBerat ? <StatusBadge status="Sangat berat" /> : level ? <StatusBadge status="Perlu tindak lanjut" /> : <small className="muted">—</small>}</span>
          </button>
        ))}
      </div>

      {detail && (
        <DetailSiswa siswa={detail} ta={ta} taOpsi={taOpsi} records={d.records} meta={d.meta} levelList={d.levelList} bisaTulis={bisaTulis} actor={actor}
          onTa={setTa} onCatat={(jenis) => setCatat({ jenis, preset: [detail.nis] })} onClose={() => setDetailNis(null)} />
      )}
      {catat && (
        <CatatDialog jenis={catat.jenis} presetNis={catat.preset} rules={d.rules} remisi={d.remisi} levelList={d.levelList} records={d.records} actor={actor}
          onClose={() => setCatat(null)} onSaved={(c) => { setCatat(null); setCapaian(c); }} />
      )}
      {capaian.length > 0 && (
        <Modal title="Ambang pembinaan tercapai" subtitle="Siswa berikut mencapai ambang baru dan perlu ditindaklanjuti." onClose={() => setCapaian([])} width={480}>
          <div className="simple-list">
            {capaian.map((c) => <div key={c.nis}><b>{c.nama}</b><small>{c.level}</small></div>)}
          </div>
          <p className="modal-note">Sistem tidak mengirim pesan otomatis. Tindak lanjut dilakukan oleh pihak terkait sesuai tata tertib.</p>
          <div className="modal-actions"><button className="primary-button" onClick={() => setCapaian([])}>Mengerti</button></div>
        </Modal>
      )}
    </section>
  );
}
