import { useState } from "react";
import Icon from "../components/Icon";
import { Field, Modal } from "../components/ui";
import { labelPerangkatSekarang, namaPerangkat, setNamaPerangkat } from "../lib/perangkat";
import { usePetugas } from "./petugas";

/** Di topbar: nama petugas aktif + tombol "Ganti petugas" + nama perangkat (opsional, tersimpan lokal di perangkat ini). */
export default function PetugasBar() {
  const { petugas, ganti } = usePetugas();
  const [dialog, setDialog] = useState(false);
  const [nama, setNama] = useState(namaPerangkat() ?? "");
  if (!petugas) return null;
  return (
    <span className="petugas-bar no-print">
      <Icon name="users" size={15} />
      <span>Petugas: <b data-testid="petugas-aktif">{petugas.nama}</b></span>
      <button type="button" className="ghost-button" onClick={ganti}>Ganti petugas</button>
      <button type="button" className="ghost-button" onClick={() => { setNama(namaPerangkat() ?? ""); setDialog(true); }}>Nama perangkat</button>
      {dialog && (
        <Modal title="Nama perangkat" subtitle={labelPerangkatSekarang()} onClose={() => setDialog(false)} width={420}>
          <Field label="Nama perangkat (opsional)" hint="Contoh: “HP piket pintu depan”. Hanya membantu admin mengenali perangkat di Log aktivitas; disimpan di perangkat ini.">
            <input className="text-input" value={nama} maxLength={60} onChange={(e) => setNama(e.target.value)} />
          </Field>
          <div className="modal-actions">
            <button className="secondary-button" onClick={() => setDialog(false)}>Batal</button>
            <button className="primary-button" onClick={() => { setNamaPerangkat(nama); setDialog(false); }}>Simpan</button>
          </div>
        </Modal>
      )}
    </span>
  );
}
