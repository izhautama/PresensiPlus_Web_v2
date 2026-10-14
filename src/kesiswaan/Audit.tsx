import { useMemo, useState } from "react";
import { limitToLast, orderByChild, query, type DatabaseReference } from "firebase/database";
import Icon from "../components/Icon";
import { Empty, Spinner, StatusBadge } from "../components/ui";
import { useAdminData } from "../admin/AdminData";
import type { AuditEntry } from "../lib/discipline";
import { todayWIB } from "../lib/time";
import { useLive } from "../services/db";

const terbaru = (base: DatabaseReference) => query(base, orderByChild("ts"), limitToLast(300));
const AKSI: Record<AuditEntry["aksi"], string> = { buat: "Buat", ubah: "Ubah", hapus: "Hapus", "ubah-master": "Ubah master" };

const ringkas = (v: unknown): string => {
  if (v == null) return "—";
  if (typeof v !== "object") return String(v);
  return Object.entries(v as Record<string, unknown>).filter(([k]) => k !== "sumber").map(([k, x]) => `${k}: ${typeof x === "object" ? JSON.stringify(x) : String(x)}`).join(" · ");
};

/** Jejak audit kesiswaan (hanya baca): 300 perubahan terakhir. */
export default function Audit() {
  const { studentMap, students } = useAdminData();
  const live = useLive<Record<string, AuditEntry>>("discipline/audit", terbaru);
  const [q, setQ] = useState("");
  const [tgl, setTgl] = useState("");

  const namaByNis = useMemo(() => new Map(students.map((s) => [s.nis, s.nama])), [students]);
  void studentMap;

  const rows = useMemo(() => {
    const qq = q.trim().toLowerCase();
    return Object.entries(live.data ?? {})
      .map(([id, x]) => {
        const nis = /^discipline\/(?:records|notes)\/(\d+)\//.exec(x.path)?.[1] ?? /^validasi\/[\d-]+\/(\d+)$/.exec(x.path)?.[1];
        return { id, ...x, nis, siswa: nis ? namaByNis.get(nis) ?? nis : "" };
      })
      .filter((x) => (!tgl || todayWIB(new Date(x.ts)) === tgl) && (!qq || `${x.siswa} ${x.nis ?? ""} ${x.olehNama} ${x.path}`.toLowerCase().includes(qq)))
      .sort((a, b) => b.ts - a.ts);
  }, [live.data, q, tgl, namaByNis]);

  return (
    <section className="data-page">
      <div className="section-heading"><div><p>Jejak audit</p><span>300 perubahan terakhir pada data kesiswaan · hanya baca, tidak dapat diubah</span></div></div>
      <div className="filter-bar no-print">
        <div className="search search-inline"><Icon name="search" size={18} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari siswa (nama/NIS), pelaku, atau path..." aria-label="Cari" /></div>
        <input type="date" className="text-input auto" value={tgl} onChange={(e) => setTgl(e.target.value)} aria-label="Tanggal" />
        {tgl && <button className="secondary-button" onClick={() => setTgl("")}>Semua tanggal</button>}
      </div>
      <div className="table-panel">
        <div className="table-head audit-grid"><span>Waktu</span><span>Aksi</span><span>Oleh</span><span>Objek</span><span>Perubahan</span></div>
        {live.error ? <Empty icon="alert" title="Gagal memuat" text={live.error} /> : live.loading ? <div className="page-loader"><Spinner dark /></div> : rows.length === 0 ? (
          <Empty icon="activity" title="Tidak ada jejak" text="Belum ada perubahan atau tidak cocok dengan filter." />
        ) : rows.map((x) => (
          <div className="table-row audit-grid" key={x.id}>
            <span className="mono small">{new Date(x.ts).toLocaleString("id-ID", { timeZone: "Asia/Jakarta", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
            <span><StatusBadge status={AKSI[x.aksi] ?? x.aksi} /></span>
            <span>{x.olehNama}</span>
            <span className="student-cell"><span><b>{x.siswa || "Master tata tertib"}</b><small className="mono">{x.path.replace("discipline/", "")}</small></span></span>
            <span className="audit-diff">
              {x.sebelum != null && <small>Sebelum: {ringkas(x.sebelum)}</small>}
              {x.sesudah != null && <small>Sesudah: {ringkas(x.sesudah)}</small>}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
