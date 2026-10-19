import { useMemo, useState } from "react";
import Icon from "../components/Icon";
import { Empty, Field, Modal, Spinner } from "../components/ui";
import { useAdminData } from "../admin/AdminData";
import { useBisaTulisKesiswaan, useToast } from "../admin/AdminLayout";
import { ringkas, taKey } from "../lib/discipline";
import { antreanUsul, type UsulRemisi } from "../lib/pembinaan";
import { formatTanggal } from "../lib/time";
import { useLive } from "../services/db";
import { putuskanUsul } from "../services/pembinaan";
import { useActor, useDiscipline } from "./useDiscipline";

const LABEL = { menunggu: "Menunggu", disetujui: "Disetujui", ditolak: "Ditolak" } as const;
const BADGE = { menunggu: "badge-lemah", disetujui: "badge-aman", ditolak: "badge-gagal" } as const;
const tglDariTs = (ts: number) => new Date(ts + 7 * 3600_000).toISOString().slice(0, 10);

/** Antrean usulan remisi dari wali kelas. Waka/kepala memutuskan SEKALI; admin hanya melihat. */
export default function UsulanRemisi() {
  const bisaTulis = useBisaTulisKesiswaan();
  const notify = useToast();
  const actor = useActor();
  const { students, today } = useAdminData();
  const d = useDiscipline();
  const live = useLive<Record<string, UsulRemisi>>("usulRemisi");
  const ta = taKey(today);
  const [putus, setPutus] = useState<{ id: string; usul: UsulRemisi; setuju: boolean } | null>(null);
  const siswa = useMemo(() => new Map(students.map((s) => [s.nis, s])), [students]);
  const antre = useMemo(() => antreanUsul(live.data), [live.data]);
  const riwayat = useMemo(() => Object.entries(live.data ?? {}).filter(([, u]) => u.status !== "menunggu").sort((a, b) => (b[1].diputuskanTs ?? 0) - (a[1].diputuskanTs ?? 0)).slice(0, 30), [live.data]);

  return (
    <section className="data-page" data-testid="halaman-usulan-remisi">
      <div className="section-heading"><div><p>Usulan remisi</p><span>Usulan dari wali kelas{bisaTulis ? " · keputusan hanya dapat dibuat sekali" : " · hanya lihat"}</span></div></div>
      <article className="panel master-group">
        <div className="panel-header"><div><p className="panel-title">Menunggu keputusan <span className="badge badge-lemah" data-testid="jumlah-usulan">{antre.length}</span></p></div></div>
        {live.error ? <Empty icon="alert" title="Gagal memuat" text={live.error} /> : live.loading ? <div className="page-loader"><Spinner dark /></div> : antre.length === 0 ? <Empty icon="check" title="Tidak ada usulan menunggu" /> : (
          <div className="simple-list" data-testid="antrean-usulan">
            {antre.map(([id, u]) => {
              const s = siswa.get(u.nis);
              return (
                <div key={id} data-nis={u.nis}>
                  <span><b>{s?.nama ?? u.nis}</b><small>{s?.kelas} · {u.nama} (−{u.poin} poin)</small></span>
                  <span><small>{formatTanggal(tglDariTs(u.ts))} · {u.alasan}</small></span>
                  <span className="row-actions">
                    {bisaTulis && <>
                      <button className="primary-button sm" onClick={() => setPutus({ id, usul: u, setuju: true })} aria-label={`Setujui usulan ${u.nama} untuk ${s?.nama ?? u.nis}`}>Setujui</button>
                      <button className="ghost-button" onClick={() => setPutus({ id, usul: u, setuju: false })} aria-label={`Tolak usulan ${u.nama} untuk ${s?.nama ?? u.nis}`}>Tolak</button>
                    </>}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </article>
      <article className="panel master-group">
        <div className="panel-header"><div><p className="panel-title">Keputusan terakhir</p></div></div>
        {riwayat.length === 0 ? <p className="modal-note">Belum ada keputusan.</p> : (
          <div className="simple-list" data-testid="riwayat-usulan">
            {riwayat.map(([id, u]) => (
              <div key={id} data-status={u.status}>
                <span><b>{siswa.get(u.nis)?.nama ?? u.nis}</b><small>{u.nama} (−{u.poin} poin)</small></span>
                <span><small className={`badge ${BADGE[u.status]}`}>{LABEL[u.status]}</small>{u.alasanKeputusan && <small>{u.alasanKeputusan}</small>}</span>
              </div>
            ))}
          </div>
        )}
      </article>
      {putus && (
        <Putusan data={putus} nama={siswa.get(putus.usul.nis)?.nama ?? putus.usul.nis} onClose={() => setPutus(null)}
          punyaPelanggaran={ringkas(d.records[putus.usul.nis], ta).pel > 0} kelompok={d.remisi[putus.usul.remId]?.kelompok}
          onSimpan={async (alasan) => {
            await putuskanUsul({ id: putus.id, usul: putus.usul, namaSiswa: siswa.get(putus.usul.nis)?.nama ?? putus.usul.nis, setuju: putus.setuju, alasan, tanggal: today, ta }, actor);
            notify(putus.setuju ? "Usulan disetujui; poin siswa berkurang" : "Usulan ditolak");
            setPutus(null);
          }} />
      )}
    </section>
  );
}

function Putusan({ data, nama, onClose, onSimpan, punyaPelanggaran, kelompok }: {
  data: { id: string; usul: UsulRemisi; setuju: boolean }; nama: string; onClose: () => void; onSimpan: (alasan: string) => Promise<void>; punyaPelanggaran: boolean; kelompok?: string;
}) {
  const [alasan, setAlasan] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const { setuju, usul } = data;
  const tanpaSyarat = setuju && kelompok === "Tanpa prestasi" && !punyaPelanggaran;
  const kirim = async () => {
    if (!setuju && alasan.trim().length < 5) { setErr("Alasan penolakan wajib diisi (minimal 5 karakter)"); return; }
    if (tanpaSyarat) { setErr(`Remisi "Tanpa prestasi" hanya untuk murid yang punya catatan pelanggaran di TA ini.`); return; }
    setBusy(true); setErr("");
    try { await onSimpan(alasan); }
    catch (e) { setErr(/permission/i.test((e as Error).message) ? "Ditolak: usulan ini sudah diputuskan (mungkin oleh pejabat lain). Muat ulang halaman." : (e as Error).message); setBusy(false); }
  };
  return (
    <Modal title={setuju ? "Setujui usulan remisi" : "Tolak usulan remisi"} subtitle={`${nama} · ${usul.nama} (−${usul.poin} poin)`} onClose={onClose}>
      <div className="modal-form">
        <p className="modal-note">Alasan wali: {usul.alasan}</p>
        {tanpaSyarat && <div className="notice warn" role="alert"><Icon name="warning" size={17} /><span>Siswa belum punya catatan pelanggaran di TA ini; remisi "Tanpa prestasi" tidak dapat disetujui.</span></div>}
        <Field label={setuju ? "Catatan keputusan (opsional)" : "Alasan penolakan (wajib)"} error={err}>
          <textarea className="text-input" rows={3} maxLength={300} value={alasan} onChange={(e) => setAlasan(e.target.value)} aria-label={setuju ? "Catatan keputusan" : "Alasan penolakan"} />
        </Field>
        <div className="modal-actions">
          <button className="secondary-button" onClick={onClose}>Batal</button>
          <button className={setuju ? "primary-button" : "danger-button"} disabled={busy || tanpaSyarat} onClick={kirim}>{busy ? <Spinner /> : null}{setuju ? "Setujui" : "Tolak"}</button>
        </div>
      </div>
    </Modal>
  );
}
