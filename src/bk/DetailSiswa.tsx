import { useMemo, useState } from "react";
import { Link, useParams } from "react-router";
import Icon from "../components/Icon";
import { useAdminData } from "../admin/AdminData";
import { useAuth } from "../auth/AuthContext";
import FormPembinaan from "../kesiswaan/FormPembinaan";
import { daftarRecord, labelTa } from "../lib/discipline";
import { ringkasIsi, urutKonseling, type Konseling } from "../lib/konseling";
import { perluDibina } from "../lib/pembinaan";
import { formatTanggal } from "../lib/time";
import StudentPage from "../pages/StudentPage";
import { useLive } from "../services/db";
import { useDisiplinKelas } from "../wali/DisiplinKelas";
import { KonselingDialog, type DialogKonseling } from "./Konseling";

/** Bagian khusus BK pada detail siswa: pencatat tiap catatan, pembinaan (ambang BK), dan catatan konseling rahasia. */
function EkstraBk({ nis, profil }: { nis: string; profil: { nama: string; kelas: string } }) {
  const { session } = useAuth();
  const { today, students } = useAdminData();
  const d = useDisiplinKelas();
  const kons = useLive<Record<string, Konseling>>(`konseling/${nis}`);
  const [form, setForm] = useState<{ levelId: string } | null>(null);
  const [dlg, setDlg] = useState<DialogKonseling>(null);
  const ctx = { uid: session?.role === "bk" ? session.uid : "", nama: session?.role === "bk" ? session.nama : "" };

  const riwayat = useMemo(() => daftarRecord(d.recs[nis], d.meta[nis], d.ta, false), [d.recs, d.meta, d.ta, nis]);
  const perlu = useMemo(() => perluDibina({ nis, recs: d.recs[nis], meta: d.meta[nis], levels: d.levels, pembinaan: d.pembinaan[nis], ta: d.ta, pj: "bk" }), [d, nis]);
  const pb = Object.entries(d.pembinaan[nis] ?? {}).filter(([, x]) => x.ta === d.ta).sort((a, b) => b[1].tanggal.localeCompare(a[1].tanggal));
  const sel = form ? perlu.find((x) => x.levelId === form.levelId) : null;
  const catatan = useMemo(() => urutKonseling(Object.entries(kons.data ?? {}).map(([id, k]) => ({ id, k }))), [kons.data]);

  return (
    <>
      <section className="panel no-print" data-testid="ekstra-bk">
        <div className="panel-header"><div><p className="panel-title">Catatan BK</p><span>{labelTa(d.ta)} · hanya terlihat oleh staf sekolah, tidak oleh orang tua</span></div></div>

        {perlu.length > 0 && (
          <div className="notice warn" data-testid="detail-perlu-dibina"><Icon name="warning" size={17} />
            <span>Perlu dibina: ambang {perlu.map((x) => x.level.poin).join(", ")} poin.{" "}
              {perlu.map((x) => <button key={x.levelId} className="ghost-button" onClick={() => setForm({ levelId: x.levelId })}>{x.status === "dijadwalkan" ? "Lanjutkan pembinaan" : "Catat pembinaan"} ({x.level.poin})</button>)}</span>
          </div>
        )}

        <h3 className="panduan-bagian-judul">Riwayat poin dan pencatat</h3>
        {riwayat.length === 0 ? <p className="muted small">Belum ada catatan.</p> : (
          <div className="simple-list" data-testid="riwayat-pencatat">
            {riwayat.map(({ id, rec, meta }) => (
              <div key={id}>
                <span><b>{rec.nama}</b><small>{formatTanggal(rec.tanggal, false)} · {rec.jenis === "remisi" ? "Remisi" : rec.kategori ?? "Pelanggaran"} · {rec.jenis === "remisi" ? "−" : "+"}{rec.poin}</small></span>
                <span><small>Dicatat oleh {meta?.dibuatNama ?? "—"}{rec.sumber === "bk" ? " (BK)" : rec.sumber === "wali" ? " (wali kelas)" : rec.sumber === "usul-wali" ? " (usulan, disetujui)" : rec.sumber === "piket" ? " (piket)" : ""}</small></span>
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
      </section>

      <section className="panel no-print" data-testid="konseling-siswa">
        <div className="panel-header">
          <div><p className="panel-title">Catatan konseling <span className="badge badge-lemah">rahasia</span></p><span>Hanya BK dan Kepala yang dapat membaca</span></div>
          <button className="primary-button sm" onClick={() => setDlg({ nis })}><Icon name="plus" size={15} />Catatan baru</button>
        </div>
        {kons.loading ? <p className="muted small">Memuat…</p> : catatan.length === 0 ? <p className="muted small">Belum ada catatan konseling untuk siswa ini.</p> : (
          <div className="simple-list">
            {catatan.map(({ id, k }) => (
              <div key={id} data-topik={k.topik}>
                <span><b>{k.topik}</b><small>{formatTanggal(k.tanggal, false)} · {k.olehNama}{k.diubahTs ? " · dikoreksi" : ""}</small></span>
                <span><small>{ringkasIsi(k.isi, 200)}</small></span>
                <span className="row-actions">{k.oleh === ctx.uid && <button className="ghost-button" onClick={() => setDlg({ nis, id, k })}>Koreksi</button>}</span>
              </div>
            ))}
          </div>
        )}
      </section>
      {sel && <FormPembinaan siswa={{ nis, ...profil }} ta={d.ta} levelId={sel.levelId} level={sel.level} ada={sel.pembinaan} today={today} ctx={ctx} onClose={() => setForm(null)} />}
      {dlg && <KonselingDialog dialog={dlg} siswa={students} today={today} onClose={() => setDlg(null)} />}
    </>
  );
}

/** Detail siswa untuk BK: portal siswa yang sama dengan orang tua (rekap kehadiran, per jam, poin) + bagian khusus BK. */
export default function DetailSiswa() {
  const { nis } = useParams();
  return (
    <>
      <Link className="ghost-button no-print" to="/bk/siswa"><Icon name="arrow" size={15} />Kembali ke daftar siswa</Link>
      <StudentPage embedded key={nis} ekstra={(n, profil) => <EkstraBk nis={n} profil={profil} />} />
    </>
  );
}
