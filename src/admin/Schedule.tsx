import { useEffect, useMemo, useState } from "react";
import Icon from "../components/Icon";
import { Empty, Spinner, StatusBadge } from "../components/ui";
import type { Jenis, ScheduleRow } from "../lib/types";
import { simpanJadwal } from "../services/db";
import { useAdminData } from "./AdminData";
import { useToast } from "./AdminLayout";

const HARI = ["Semua", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
const JENIS: Jenis[] = ["Masuk", "Terlambat", "Pulang"];
const RE_JAM = /^([01]\d|2[0-3]):[0-5]\d$/;

function validasi(rows: ScheduleRow[]): string | null {
  for (const [i, r] of rows.entries()) {
    if (!r.kelas.trim()) return `Baris ${i + 1}: kelas kosong`;
    if (!RE_JAM.test(r.mulai) || !RE_JAM.test(r.selesai)) return `Baris ${i + 1}: format jam harus HH:MM`;
    if (r.mulai > r.selesai) return `Baris ${i + 1}: jam mulai melewati jam selesai`;
  }
  const kunci = rows.map((r) => `${r.kelas.trim()}|${r.hari}|${r.jenis}`);
  const dup = kunci.find((k, i) => kunci.indexOf(k) !== i);
  if (dup) return `Jadwal ganda: ${dup.replace(/\|/g, " · ")}`;
  if (rows.length > 80) return "Maksimal 80 baris (batas memori alat)";
  return null;
}

export default function Schedule() {
  const { schedule, kelasList, ready } = useAdminData();
  const notify = useToast();
  const [rows, setRows] = useState<ScheduleRow[]>([]);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState<Jenis | "">("");

  useEffect(() => { if (!dirty) setRows(sortRows(schedule)); }, [schedule, dirty]);

  const kelasTanpaPulang = useMemo(() => kelasList.filter((k) => !rows.some((r) => r.jenis === "Pulang" && (r.kelas === k || r.kelas === "Semua"))), [kelasList, rows]);

  const ubah = (i: number, patch: Partial<ScheduleRow>) => { setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r))); setDirty(true); };
  const hapus = (i: number) => { setRows((rs) => rs.filter((_, j) => j !== i)); setDirty(true); };
  const tambah = () => { setRows((rs) => [...rs, { kelas: "Semua", hari: "Senin", jenis: "Pulang", mulai: "14:15", selesai: "15:00" }]); setDirty(true); };

  const simpan = async () => {
    const clean = rows.map((r) => ({ ...r, kelas: r.kelas.trim() }));
    const v = validasi(clean);
    if (v) { notify(v, "err"); return; }
    setBusy(true);
    try { await simpanJadwal(clean); setDirty(false); notify("Jadwal disimpan — alat memuat ulang otomatis"); }
    catch (e) { notify((e as Error).message, "err"); }
    finally { setBusy(false); }
  };

  const tampil = rows.map((r, i) => ({ r, i })).filter(({ r }) => !filter || r.jenis === filter);

  return (
    <section className="data-page">
      <div className="section-heading">
        <div><p>Jadwal presensi</p><span>Rentang waktu masuk, terlambat, dan pulang. Baris kelas/hari spesifik mengalahkan baris "Semua". Minggu = libur.</span></div>
        <div className="heading-actions">
          {dirty && <button className="secondary-button" onClick={() => { setDirty(false); setRows(sortRows(schedule)); }}>Batalkan</button>}
          <button className="primary-button" disabled={!dirty || busy} onClick={simpan}>{busy ? <Spinner /> : <Icon name="check" size={16} />}Simpan perubahan</button>
        </div>
      </div>

      {kelasTanpaPulang.length > 0 && (
        <div className="notice warn"><Icon name="warning" size={17} /><span>Kelas tanpa jadwal pulang (alat memakai jam bawaan 14:15–15:00): <b>{kelasTanpaPulang.join(", ")}</b></span></div>
      )}

      <div className="filter-bar">
        <div className="chip-group" role="tablist">
          {(["", ...JENIS] as const).map((j) => <button key={j || "all"} role="tab" aria-selected={filter === j} className={filter === j ? "active" : ""} onClick={() => setFilter(j)}>{j || "Semua"}</button>)}
        </div>
        <button className="secondary-button" onClick={tambah}><Icon name="plus" size={15} />Tambah baris</button>
      </div>

      {!ready ? <div className="page-loader"><Spinner dark /></div> : tampil.length === 0 ? <Empty icon="calendar" title="Belum ada jadwal" text="Tambah baris atau jalankan notebook migrasi." /> : (
        <div className="schedule-grid">
          {tampil.map(({ r, i }) => (
            <article className="schedule-card editable" key={i}>
              <div><StatusBadge status={r.jenis} /><button className="icon-only danger" aria-label="Hapus baris" onClick={() => hapus(i)}><Icon name="trash" size={15} /></button></div>
              <div className="schedule-fields">
                <label>Kelas<input className="text-input" list="kelas-jadwal" value={r.kelas} onChange={(e) => ubah(i, { kelas: e.target.value })} maxLength={15} /></label>
                <label>Hari<select className="text-input" value={r.hari} onChange={(e) => ubah(i, { hari: e.target.value })}>{HARI.map((h) => <option key={h}>{h}</option>)}</select></label>
                <label>Jenis<select className="text-input" value={r.jenis} onChange={(e) => ubah(i, { jenis: e.target.value as Jenis })}>{JENIS.map((j) => <option key={j}>{j}</option>)}</select></label>
              </div>
              <div className="time-range">
                <input type="time" className="text-input" value={r.mulai} onChange={(e) => ubah(i, { mulai: e.target.value })} aria-label="Jam mulai" />
                <small>—</small>
                <input type="time" className="text-input" value={r.selesai} onChange={(e) => ubah(i, { selesai: e.target.value })} aria-label="Jam selesai" />
              </div>
            </article>
          ))}
        </div>
      )}
      <datalist id="kelas-jadwal"><option value="Semua" />{kelasList.map((k) => <option key={k} value={k} />)}</datalist>
    </section>
  );
}

function sortRows(rows: ScheduleRow[]) {
  const ord = (j: string) => JENIS.indexOf(j as Jenis);
  return [...rows].sort((a, b) => ord(a.jenis) - ord(b.jenis) || a.kelas.localeCompare(b.kelas) || HARI.indexOf(a.hari) - HARI.indexOf(b.hari));
}
