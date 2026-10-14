import { useState, type FormEvent } from "react";
import Icon from "../components/Icon";
import { Empty, Field, Spinner, StatusBadge } from "../components/ui";
import { usePanelMode, useToast } from "../admin/AdminLayout";
import { MUNDUR_DEFAULT } from "../lib/piket";
import { useLive } from "../services/db";
import { kunciAkunPiket } from "../services/db";
import { simpanJendelaMundur, simpanPetugas } from "../services/piket";

type Roster = Record<string, { nama: string; aktif: boolean }>;

/** Daftar petugas piket (waka & admin) + jendela input mundur (hanya waka). Nama dipilih sendiri oleh pengguna akun bersama. */
export default function PetugasPiket() {
  const mode = usePanelMode();
  const bisaAturJendela = mode === "waka";
  const notify = useToast();
  const roster = useLive<Roster>("piketRoster");
  const mundur = useLive<number>("discipline/settings/piketMundurHari");
  const [nama, setNama] = useState("");
  const [jendela, setJendela] = useState("");
  const [busy, setBusy] = useState(false);
  const daftar = Object.entries(roster.data ?? {}).sort((a, b) => Number(b[1].aktif) - Number(a[1].aktif) || a[1].nama.localeCompare(b[1].nama));
  const akun = useLive<Record<string, { email: string; nama: string; terkunci?: boolean }>>("piketAkun");
  const [kunciBusy, setKunciBusy] = useState("");
  const kunci = async (uid: string, nama: string, nilai: boolean) => {
    setKunciBusy(uid);
    try { await kunciAkunPiket(uid, nilai); notify(nilai ? `Akun ${nama} dikunci` : `Kunci akun ${nama} dibuka`); }
    catch (ex) { notify((ex as Error).message, "err"); }
    finally { setKunciBusy(""); }
  };
  const daftarAkun = Object.entries(akun.data ?? {}).sort((a, b) => a[1].nama.localeCompare(b[1].nama));
  const nilaiJendela = typeof mundur.data === "number" ? mundur.data : MUNDUR_DEFAULT;

  const tambah = async (e: FormEvent) => {
    e.preventDefault();
    const n = nama.trim().replace(/\s+/g, " ");
    if (!n || n.length > 60) { notify("Nama wajib diisi (maks. 60 karakter)", "err"); return; }
    if (daftar.some(([, x]) => x.nama.toLowerCase() === n.toLowerCase())) { notify("Nama sudah ada di daftar", "err"); return; }
    setBusy(true);
    try { await simpanPetugas(null, { nama: n, aktif: true }); setNama(""); notify(`${n} ditambahkan`); }
    catch (ex) { notify((ex as Error).message, "err"); }
    finally { setBusy(false); }
  };
  const toggle = async (id: string, x: { nama: string; aktif: boolean }) => {
    try { await simpanPetugas(id, { nama: x.nama, aktif: !x.aktif }); notify(x.aktif ? `${x.nama} dinonaktifkan` : `${x.nama} diaktifkan`); }
    catch (ex) { notify((ex as Error).message, "err"); }
  };
  const simpanN = async () => {
    const v = Number(jendela);
    if (!Number.isInteger(v) || v < 0 || v > 14) { notify("Jendela harus bilangan bulat 0–14 hari", "err"); return; }
    try { await simpanJendelaMundur(v); notify(`Jendela input mundur: ${v} hari`); setJendela(""); }
    catch (ex) { notify((ex as Error).message, "err"); }
  };

  return (
    <section className="data-page">
      <div className="section-heading"><div><p>Petugas piket</p><span>Daftar nama untuk akun piket bersama · nama dipilih sendiri oleh pengguna (deklarasi mandiri)</span></div></div>
      <div className="device-grid">
        <article className="panel">
          <div className="panel-header"><div><p className="panel-title">Daftar petugas</p><span>Hanya petugas aktif yang muncul di layar "Siapa yang bertugas?"</span></div></div>
          <form className="uid-row" onSubmit={tambah}>
            <input className="text-input" value={nama} maxLength={60} placeholder="Nama petugas baru" aria-label="Nama petugas baru" onChange={(e) => setNama(e.target.value)} />
            <button className="primary-button" disabled={busy}>{busy ? <Spinner /> : <Icon name="plus" size={15} />}Tambah</button>
          </form>
          {roster.loading ? <div className="page-loader"><Spinner dark /></div> : daftar.length === 0 ? <Empty icon="users" title="Belum ada petugas" text="Tambahkan nama petugas piket." /> : (
            <div className="simple-list" style={{ marginTop: 12 }}>
              {daftar.map(([id, x]) => (
                <div key={id} className={x.aktif ? "" : "petugas-nonaktif"}>
                  <b>{x.nama}</b><StatusBadge status={x.aktif ? "Aktif" : "Nonaktif"} />
                  <button className="ghost-button" aria-label={`${x.aktif ? "Nonaktifkan" : "Aktifkan"} ${x.nama}`} onClick={() => toggle(id, x)}>{x.aktif ? "Nonaktifkan" : "Aktifkan"}</button>
                </div>
              ))}
            </div>
          )}
        </article>

        <article className="panel">
          <div className="panel-header"><div><p className="panel-title">Jendela input mundur</p><span>Batas hari ke belakang yang boleh diinput piket (izin, per jam, pelanggaran)</span></div></div>
          <div className="kv-list"><div><span>Saat ini</span><b data-testid="nilai-jendela">{nilaiJendela} hari{typeof mundur.data === "number" ? "" : " (bawaan)"}</b></div></div>
          {bisaAturJendela ? (
            <Field label="Ubah (0–14 hari)" hint="Izin terencana tetap dibatasi maksimal 7 hari ke depan. Rules menegakkan batas ini juga di sisi server.">
              <div className="uid-row">
                <input className="text-input" inputMode="numeric" value={jendela} maxLength={2} aria-label="Jendela hari" onChange={(e) => setJendela(e.target.value.replace(/\D/g, ""))} />
                <button className="secondary-button" onClick={simpanN} disabled={!jendela}>Simpan</button>
              </div>
            </Field>
          ) : <p className="modal-note">Hanya Waka Kesiswaan yang dapat mengubah jendela.</p>}
          <p className="modal-note">Nama petugas bersifat <b>deklarasi mandiri</b>: akun dipakai bersama, sehingga nama tidak membuktikan identitas. Gunakan bersama menu Log aktivitas (perangkat dikenali dari ID acak lokal).</p>
        </article>

        <article className="panel">
          <div className="panel-header"><div><p className="panel-title">Akun piket · kunci darurat</p><span>Bila akun bersama disalahgunakan atau perangkat hilang: kunci seketika, sesi aktif langsung keluar</span></div></div>
          {akun.loading ? <div className="page-loader"><Spinner dark /></div> : daftarAkun.length === 0 ? (
            <Empty icon="lock" title="Belum ada akun piket terdaftar" text="Akun piket baru muncul di sini setelah dibuat dari menu Pengaturan admin. Akun lama: admin dapat menguncinya dari Pengaturan." />
          ) : (
            <div className="simple-list">
              {daftarAkun.map(([uid, x]) => (
                <div key={uid}>
                  <span><b>{x.nama}</b><small>{x.email}{x.terkunci ? " · TERKUNCI" : ""}</small></span>
                  <button className={x.terkunci ? "secondary-button" : "danger-button"} disabled={kunciBusy === uid} onClick={() => kunci(uid, x.nama, !x.terkunci)}>
                    <Icon name={x.terkunci ? "check" : "lock"} size={15} />{x.terkunci ? "Buka kunci" : "Kunci akun"}
                  </button>
                </div>
              ))}
            </div>
          )}
          <p className="modal-note">Mengganti password akun piket (email reset) hanya dapat dilakukan Admin dari menu Pengaturan.</p>
        </article>
      </div>
    </section>
  );
}
