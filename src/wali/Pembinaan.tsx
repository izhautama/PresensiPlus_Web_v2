import { useMemo, useState } from "react";
import Icon from "../components/Icon";
import { Empty, Spinner } from "../components/ui";
import { useAdminData } from "../admin/AdminData";
import { useAuth } from "../auth/AuthContext";
import FormPembinaan from "../kesiswaan/FormPembinaan";
import { labelTa } from "../lib/discipline";
import { formatTanggal } from "../lib/time";
import type { ItemDibina, Pembinaan as PembinaanData } from "../lib/pembinaan";
import { useDisiplinKelas } from "./DisiplinKelas";

/** Pembinaan oleh wali kelas: daftar "Perlu dibina" (ambang bertanggung jawab wali) dan riwayat pembinaan kelas binaan pada TA berjalan. */
export default function Pembinaan() {
  const { session } = useAuth();
  const { today } = useAdminData();
  const d = useDisiplinKelas();
  const [buka, setBuka] = useState<{ item: ItemDibina } | null>(null);
  const [ubah, setUbah] = useState<{ nis: string; levelId: string; pb: PembinaanData } | null>(null);
  const siswa = useMemo(() => new Map(d.siswa.map((s) => [s.nis, s])), [d.siswa]);
  const ctx = { uid: session?.role === "wali" ? session.uid : "", nama: session?.role === "wali" ? session.nama : "" };

  const riwayat = useMemo(() => {
    const out: { nis: string; id: string; pb: PembinaanData }[] = [];
    for (const [nis, per] of Object.entries(d.pembinaan)) for (const [id, pb] of Object.entries(per)) if (pb.ta === d.ta) out.push({ nis, id, pb });
    return out.sort((a, b) => b.pb.tanggal.localeCompare(a.pb.tanggal) || (siswa.get(a.nis)?.nama ?? "").localeCompare(siswa.get(b.nis)?.nama ?? ""));
  }, [d.pembinaan, d.ta, siswa]);

  return (
    <section className="data-page" data-testid="halaman-pembinaan">
      <div className="section-heading">
        <div><p>Pembinaan</p><span>{labelTa(d.ta)} · siswa kelas binaan yang saldonya mencapai ambang pembinaan wali kelas</span></div>
      </div>
      {d.galat.length > 0 && <div className="notice warn" role="alert"><Icon name="warning" size={17} /><span>Sebagian data tidak dapat dimuat ({d.galat[0]}).</span></div>}

      <article className="panel master-group">
        <div className="panel-header"><div><p className="panel-title">Perlu dibina <span className="badge badge-lemah" data-testid="jumlah-perlu-dibina">{d.items.length}</span></p><span>Hilang dari daftar setelah pembinaan dicatat <b>selesai</b>. Saldo yang sudah turun tetap tampil sampai dibina.</span></div></div>
        {d.memuat ? <div className="page-loader"><Spinner dark /></div> : d.items.length === 0 ? (
          <Empty icon="check" title="Tidak ada siswa yang perlu dibina" text="Siswa muncul di sini saat saldo poinnya mencapai ambang yang menjadi tanggung jawab wali kelas." />
        ) : (
          <div className="simple-list" data-testid="daftar-perlu-dibina">
            {d.items.map((it) => {
              const s = siswa.get(it.nis);
              return (
                <div key={`${it.nis}-${it.levelId}`} data-nis={it.nis} data-level={it.levelId}>
                  <span><b>{s?.nama ?? it.nis}</b><small>{s?.kelas} · NIS {it.nis}</small></span>
                  <span>
                    <small>Ambang {it.level.poin} poin · saldo {it.saldo}</small>
                    {it.saldoTurun && <small className="badge badge-lemah" data-testid="saldo-turun">saldo sudah turun</small>}
                    {it.status === "dijadwalkan" && <small className="badge badge-izin" data-testid="status-dijadwalkan">Dijadwalkan {it.pembinaan ? formatTanggal(it.pembinaan.tanggal) : ""}</small>}
                  </span>
                  <span className="row-actions"><button className="primary-button sm" onClick={() => setBuka({ item: it })}>{it.status === "dijadwalkan" ? "Lanjutkan pembinaan" : "Catat pembinaan"}</button></span>
                </div>
              );
            })}
          </div>
        )}
      </article>

      <article className="panel master-group">
        <div className="panel-header"><div><p className="panel-title">Riwayat pembinaan</p><span>Pembinaan kelas binaan pada {labelTa(d.ta)}</span></div></div>
        {riwayat.length === 0 ? <p className="modal-note">Belum ada pembinaan tercatat.</p> : (
          <div className="simple-list" data-testid="riwayat-pembinaan">
            {riwayat.map(({ nis, id, pb }) => (
              <div key={`${nis}-${id}`} data-nis={nis}>
                <span><b>{siswa.get(nis)?.nama ?? nis}</b><small>{formatTanggal(pb.tanggal)} · {pb.metode} · ambang {pb.levelPoin} poin</small></span>
                <span><small className={`badge ${pb.status === "selesai" ? "badge-aman" : "badge-izin"}`}>{pb.status === "selesai" ? "Selesai" : "Dijadwalkan"}</small><small>{pb.hasil.length > 140 ? `${pb.hasil.slice(0, 140)}…` : pb.hasil}</small></span>
                <span className="row-actions">
                  {pb.status === "dijadwalkan" && d.levels[pb.levelId] && siswa.get(nis) && <button className="ghost-button" onClick={() => setUbah({ nis, levelId: pb.levelId, pb })}>Ubah</button>}
                </span>
              </div>
            ))}
          </div>
        )}
      </article>

      {buka && siswa.get(buka.item.nis) && (
        <FormPembinaan siswa={siswa.get(buka.item.nis)!} ta={d.ta} levelId={buka.item.levelId} level={buka.item.level} ada={buka.item.pembinaan} today={today} ctx={ctx} onClose={() => setBuka(null)} />
      )}
      {ubah && siswa.get(ubah.nis) && d.levels[ubah.levelId] && (
        <FormPembinaan siswa={siswa.get(ubah.nis)!} ta={d.ta} levelId={ubah.levelId} level={d.levels[ubah.levelId]} ada={ubah.pb} today={today} ctx={ctx} onClose={() => setUbah(null)} />
      )}
    </section>
  );
}
