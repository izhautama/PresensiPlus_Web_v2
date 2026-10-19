import { useMemo, useState } from "react";
import { Link } from "react-router";
import Icon from "../components/Icon";
import { useAdminData } from "../admin/AdminData";
import { useAuth } from "../auth/AuthContext";
import FormPembinaan from "../kesiswaan/FormPembinaan";
import { daftarRecord, labelTa } from "../lib/discipline";
import { formatTanggal } from "../lib/time";
import { perluDibina } from "../lib/pembinaan";
import StudentPage from "../pages/StudentPage";
import { useLive } from "../services/db";
import { useDisiplinKelas } from "./DisiplinKelas";

/** Bagian tambahan khusus wali pada detail siswa: pencatat tiap catatan, catatan internal, pembinaan. */
function EkstraWali({ nis, profil }: { nis: string; profil: { nama: string; kelas: string } }) {
  const { session } = useAuth();
  const { today } = useAdminData();
  const d = useDisiplinKelas();
  const notes = useLive<Record<string, string>>(`discipline/notes/${nis}`);
  const [form, setForm] = useState<{ levelId: string } | null>(null);
  const ctx = { uid: session?.role === "wali" ? session.uid : "", nama: session?.role === "wali" ? session.nama : "" };

  const riwayat = useMemo(() => daftarRecord(d.recs[nis], d.meta[nis], d.ta, false), [d.recs, d.meta, d.ta, nis]);
  const perlu = useMemo(() => perluDibina({ nis, recs: d.recs[nis], meta: d.meta[nis], levels: d.levels, pembinaan: d.pembinaan[nis], ta: d.ta, pj: "wali" }), [d, nis]);
  const pb = Object.entries(d.pembinaan[nis] ?? {}).filter(([, x]) => x.ta === d.ta).sort((a, b) => b[1].tanggal.localeCompare(a[1].tanggal));
  const sel = form ? perlu.find((x) => x.levelId === form.levelId) : null;

  return (
    <section className="panel no-print" data-testid="ekstra-wali">
      <div className="panel-header"><div><p className="panel-title">Catatan wali kelas</p><span>{labelTa(d.ta)} · hanya terlihat oleh staf sekolah, tidak oleh orang tua</span></div></div>

      {perlu.length > 0 && (
        <div className="notice warn" data-testid="detail-perlu-dibina"><Icon name="warning" size={17} />
          <span>Perlu dibina: ambang {perlu.map((x) => x.level.poin).join(", ")} poin.{" "}
            {perlu.map((x) => <button key={x.levelId} className="ghost-button" onClick={() => setForm({ levelId: x.levelId })}>{x.status === "dijadwalkan" ? "Lanjutkan pembinaan" : "Catat pembinaan"} ({x.level.poin})</button>)}</span></div>
      )}

      <h3 className="panduan-bagian-judul">Riwayat poin dan pencatat</h3>
      {riwayat.length === 0 ? <p className="muted small">Belum ada catatan.</p> : (
        <div className="simple-list" data-testid="riwayat-pencatat">
          {riwayat.map(({ id, rec, meta }) => (
            <div key={id}>
              <span><b>{rec.nama}</b><small>{formatTanggal(rec.tanggal, false)} · {rec.jenis === "remisi" ? "Remisi" : rec.kategori ?? "Pelanggaran"} · {rec.jenis === "remisi" ? "−" : "+"}{rec.poin}</small></span>
              <span><small>Dicatat oleh {meta?.dibuatNama ?? "—"}{rec.sumber === "wali" ? " (wali kelas)" : rec.sumber === "usul-wali" ? " (usulan wali, disetujui)" : rec.sumber === "piket" ? " (piket)" : ""}</small>{notes.data?.[id] && <small>Catatan internal: {notes.data[id]}</small>}</span>
            </div>
          ))}
        </div>
      )}

      <h3 className="panduan-bagian-judul">Pembinaan</h3>
      {pb.length === 0 ? <p className="muted small">Belum ada pembinaan pada tahun ajaran ini.</p> : (
        <div className="simple-list" data-testid="pembinaan-siswa">
          {pb.map(([id, x]) => (
            <div key={id}>
              <span><b>Ambang {x.levelPoin} poin · {x.status === "selesai" ? "Selesai" : "Dijadwalkan"}</b><small>{formatTanggal(x.tanggal)} · {x.metode} · {x.olehNama}</small></span>
              <span><small>{x.hasil}</small>{x.tindakLanjut && <small>Tindak lanjut: {x.tindakLanjut}</small>}</span>
            </div>
          ))}
        </div>
      )}
      {sel && <FormPembinaan siswa={{ nis, ...profil }} ta={d.ta} levelId={sel.levelId} level={sel.level} ada={sel.pembinaan} today={today} ctx={ctx} onClose={() => setForm(null)} />}
    </section>
  );
}

/** Detail siswa binaan: portal siswa yang sama dengan orang tua (rekap kehadiran, per jam, poin) + bagian khusus wali. */
export default function DetailSiswa() {
  return (
    <>
      <Link className="ghost-button no-print" to="/wali/siswa"><Icon name="arrow" size={15} />Kembali ke daftar siswa</Link>
      <StudentPage embedded ekstra={(nis, profil) => <EkstraWali nis={nis} profil={profil} />} />
    </>
  );
}
