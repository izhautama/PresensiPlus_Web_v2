import { useState } from "react";
import { serverTimestamp, update } from "firebase/database";
import Icon from "../components/Icon";
import { Spinner } from "../components/ui";
import { relatif } from "../lib/time";
import { r, useLive } from "../services/db";
import { useToast } from "./AdminLayout";

const BATAS_HARI = 7; // lewat ini, pengingat berubah menjadi peringatan

/** URL data Realtime Database di Firebase Console (menu ⋮ > Ekspor JSON). Instance diambil dari databaseURL bila ada. */
export function urlKonsolDatabase(projectId: string | undefined, databaseUrl: string | undefined): string {
  const pid = projectId ?? "";
  const inst = /^https:\/\/([^.]+)\./.exec(databaseUrl ?? "")?.[1] ?? `${pid}-default-rtdb`;
  return `https://console.firebase.google.com/project/${encodeURIComponent(pid)}/database/${encodeURIComponent(inst)}/data`;
}

/** Pengingat backup manual (tanpa otomatisasi): admin mengekspor JSON dari Console lalu menandai sudah backup. */
export default function BackupPengingat() {
  const notify = useToast();
  const live = useLive<number>("sistem/backupTerakhir");
  const [busy, setBusy] = useState(false);
  const ts = typeof live.data === "number" ? live.data : null;
  const lewat = ts !== null && Date.now() - ts > BATAS_HARI * 86_400_000;
  const url = urlKonsolDatabase(import.meta.env.VITE_FIREBASE_PROJECT_ID, import.meta.env.VITE_FIREBASE_DATABASE_URL);

  const tandai = async () => {
    setBusy(true);
    try { await update(r("/"), { "sistem/backupTerakhir": serverTimestamp() }); notify("Backup ditandai selesai"); }
    catch (e) { notify((e as Error).message, "err"); }
    finally { setBusy(false); }
  };

  return (
    <article className="panel" data-testid="backup-pengingat">
      <div className="panel-header"><div><p className="panel-title">Backup terakhir</p><span>Pengingat manual · paket Spark tidak punya backup otomatis</span></div></div>
      <div className="kv-list">
        <div><span>Backup terakhir</span><b data-testid="backup-terakhir" className={ts === null || lewat ? "saldo bad" : ""}>
          {live.loading ? "Memuat..." : ts === null ? "Belum pernah dicatat" : `${new Date(ts).toLocaleString("id-ID", { timeZone: "Asia/Jakarta", dateStyle: "long", timeStyle: "short" })} (${relatif(ts)})`}
        </b></div>
      </div>
      {!live.loading && (ts === null || lewat) && (
        <p className="modal-note" role="status">{ts === null ? "Belum ada catatan backup." : `Sudah lebih dari ${BATAS_HARI} hari sejak backup terakhir.`} Disarankan mengekspor data secara berkala.</p>
      )}
      <p className="modal-note">Cara: buka Firebase Console &gt; Realtime Database &gt; tab Data &gt; menu ⋮ di kanan atas &gt; <b>Ekspor JSON</b>, simpan berkasnya di tempat aman, lalu tekan <b>Tandai sudah backup</b>.</p>
      <div className="modal-actions" style={{ justifyContent: "flex-start" }}>
        <a className="primary-button" href={url} target="_blank" rel="noopener noreferrer"><Icon name="download" size={15} />Buka Firebase Console</a>
        <button className="secondary-button" onClick={tandai} disabled={busy}>{busy ? <Spinner /> : <Icon name="check" size={15} />}Tandai sudah backup</button>
      </div>
    </article>
  );
}
