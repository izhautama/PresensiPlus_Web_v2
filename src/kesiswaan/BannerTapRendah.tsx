import { Link } from "react-router";
import Icon from "../components/Icon";
import { usePanelBase, usePanelMode, useToast } from "../admin/AdminLayout";
import { useAdminData } from "../admin/AdminData";
import { tertahan } from "../lib/hariEfektif";
import { formatTanggal } from "../lib/time";
import { konfirmasiNormal } from "../services/kalender";
import { useRendahTerbaru } from "./useKalender";

/** Dashboard waka/admin/kepala: peringatan tap rendah (indikasi alat bermasalah sebagian hari) 3 hari terakhir. */
export default function BannerTapRendah() {
  const { today } = useAdminData();
  const base = usePanelBase();
  const mode = usePanelMode();
  const notify = useToast();
  const { daftar } = useRendahTerbaru(today);
  const aktif = daftar.filter(([, x]) => tertahan(x));
  if (aktif.length === 0) return null;
  const bisaKonfirmasi = mode === "waka" || mode === "admin";
  return (
    <div data-testid="banner-tap-rendah">
      {aktif.map(([tgl, x]) => (
        <div key={tgl} className="notice warn" role="alert" data-tgl={tgl}>
          <Icon name="warning" size={17} />
          <span><b>Tap rendah — {formatTanggal(tgl)}:</b> hanya {x.tap} tap (jauh di bawah biasanya). Alat mungkin bermasalah sebagian hari. Validasi Alfa dan saran Alfa tanggal ini ditahan.</span>
          <span className="aksi-cell">
            <Link className="secondary-button sm" to={`${base}/presensi-manual?tanggal=${tgl}`}>Isi presensi manual</Link>
            {bisaKonfirmasi && <button className="primary-button sm" onClick={async () => { try { await konfirmasiNormal(tgl); notify("Hari dikonfirmasi normal"); } catch (e) { notify((e as Error).message, "err"); } }}>Konfirmasi hari ini normal</button>}
          </span>
        </div>
      ))}
    </div>
  );
}
