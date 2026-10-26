import { useState, type FormEvent } from "react";
import Icon from "../components/Icon";
import { Empty, Field, Modal, Spinner, StatusBadge } from "../components/ui";
import { useBisaTulisKesiswaan, useToast } from "../admin/AdminLayout";
import { useAuth } from "../auth/AuthContext";
import { useLive } from "../services/db";
import { KATEGORI_LIST, type KategoriPelanggaran, type Kelompok, type Level, type PenanggungJawab, type Remisi, type Rule } from "../lib/discipline";
import { PJ_LABEL, PJ_LIST } from "../lib/pembinaan";
import { SEMUA_TIPE_SARAN, TIPE_LABEL, cariAturanBawaan } from "../lib/saran";
import { hapusLevel, isiDataAwal, simpanAutoMap, simpanMaster, type Actor, type MasterJenis } from "../services/discipline";
import { isiPenanggungJawabBawaan } from "../services/pembinaan";
import { useActor, useDiscipline } from "./useDiscipline";

type Tab = "rules" | "remisi" | "levels" | "map";
type Edit = { jenis: MasterJenis; id: string | null } | null;

export default function TataTertib() {
  const d = useDiscipline();
  const actor = useActor();
  const bisaTulis = useBisaTulisKesiswaan();
  const peran = useAuth().session?.role;
  const notify = useToast();
  const [tab, setTab] = useState<Tab>("rules");
  const [edit, setEdit] = useState<Edit>(null);
  const [seed, setSeed] = useState(false);
  const [ambilNonaktif, setAmbilNonaktif] = useState(false);
  const [pjBusy, setPjBusy] = useState(false);
  const isiPj = async () => {
    setPjBusy(true);
    try { const n = await isiPenanggungJawabBawaan(d.levels, actor); notify(n ? `Penanggung jawab diisi untuk ${n} ambang` : "Tidak ada ambang yang dapat diisi otomatis; atur manual"); }
    catch (e) { notify((e as Error).message, "err"); }
    finally { setPjBusy(false); }
  };

  const isi = async () => {
    setSeed(true);
    try { await isiDataAwal(actor, peran === "kepala"); notify("Data tata tertib awal terisi"); }
    catch (e) { notify((e as Error).message, "err"); }
    finally { setSeed(false); }
  };

  const toggleAktif = async (jenis: "rules" | "remisi", id: string, x: Rule | Remisi) => {
    try {
      const { diubahOleh: _o, diubahTs: _t, ...data } = x;
      void _o; void _t;
      await simpanMaster(jenis, id, { ...data, aktif: !x.aktif }, x, actor);
      notify(x.aktif ? "Dinonaktifkan" : "Diaktifkan");
    } catch (e) { notify((e as Error).message, "err"); }
  };

  return (
    <section className="data-page">
      <div className="section-heading">
        <div><p>Tata tertib</p><span>Daftar pelanggaran, remisi, dan ambang pembinaan{bisaTulis ? "" : " · hanya lihat"}</span></div>
        {bisaTulis && !d.masterKosong && (tab === "rules" || tab === "remisi") && <button className="primary-button" onClick={() => setEdit({ jenis: tab, id: null })}><Icon name="plus" size={17} />Tambah</button>}
        {bisaTulis && !d.masterKosong && tab === "levels" && <button className="primary-button" onClick={() => setEdit({ jenis: "levels", id: null })}><Icon name="plus" size={17} />Tambah ambang</button>}
      </div>

      {d.errors.length > 0 && <div className="notice warn" role="alert"><Icon name="warning" size={17} /><span>Sebagian data tidak dapat dimuat ({d.errors[0]}).</span></div>}

      {d.loading ? <div className="page-loader"><Spinner dark /></div> : d.masterKosong ? (
        <div className="panel">
          <Empty icon="file" title="Tata tertib belum diisi" text={bisaTulis ? "Isi dengan data awal (klasifikasi pelanggaran, remisi, dan ambang pembinaan). Semua dapat diubah setelahnya." : "Waka kesiswaan atau kepala madrasah dapat mengisinya."} />
          {bisaTulis && <div className="center-actions"><button className="primary-button" onClick={isi} disabled={seed}>{seed ? <Spinner /> : null}Isi data tata tertib awal</button></div>}
        </div>
      ) : (
        <>
          <div className="chip-group tabs" role="tablist">
            <button role="tab" aria-selected={tab === "rules"} className={tab === "rules" ? "active" : ""} onClick={() => setTab("rules")}>Pelanggaran</button>
            <button role="tab" aria-selected={tab === "remisi"} className={tab === "remisi" ? "active" : ""} onClick={() => setTab("remisi")}>Remisi</button>
            <button role="tab" aria-selected={tab === "levels"} className={tab === "levels" ? "active" : ""} onClick={() => setTab("levels")}>Ambang pembinaan</button>
            <button role="tab" aria-selected={tab === "map"} className={tab === "map" ? "active" : ""} onClick={() => setTab("map")}>Pemetaan saran</button>
          </div>
          {(tab === "rules" || tab === "remisi") && <label className="check-inline tab-opt"><input type="checkbox" checked={ambilNonaktif} onChange={(e) => setAmbilNonaktif(e.target.checked)} />Tampilkan yang nonaktif</label>}

          {tab === "rules" && KATEGORI_LIST.map((k) => {
            const items = Object.entries(d.rules).filter(([, x]) => x.kategori === k && (ambilNonaktif || x.aktif)).sort((a, b) => b[1].poin - a[1].poin || a[1].nama.localeCompare(b[1].nama));
            return (
              <article className="panel master-group" key={k}>
                <div className="panel-header"><div><p className="panel-title">{k}</p><span>{items.length} butir</span></div></div>
                {items.length === 0 ? <p className="muted small">Tidak ada butir.</p> : items.map(([id, x]) => (
                  <MasterRow key={id} nama={x.nama} poin={x.poin} aktif={x.aktif} sub={x.takziran ? `Takziran: ${x.takziran}` : undefined} bisaTulis={bisaTulis}
                    onEdit={() => setEdit({ jenis: "rules", id })} onToggle={() => toggleAktif("rules", id, x)} />
                ))}
              </article>
            );
          })}

          {tab === "remisi" && (["Prestasi", "Tanpa prestasi"] as Kelompok[]).map((k) => {
            const items = Object.entries(d.remisi).filter(([, x]) => x.kelompok === k && (ambilNonaktif || x.aktif)).sort((a, b) => b[1].poin - a[1].poin);
            return (
              <article className="panel master-group" key={k}>
                <div className="panel-header"><div><p className="panel-title">{k}</p><span>{k === "Prestasi" ? "Membawa nama baik sekolah" : "Khusus murid yang memiliki catatan pelanggaran"}</span></div></div>
                {items.length === 0 ? <p className="muted small">Tidak ada butir.</p> : items.map(([id, x]) => (
                  <MasterRow key={id} nama={x.nama} poin={x.poin} aktif={x.aktif} minus sub={x.syarat} bisaTulis={bisaTulis}
                    onEdit={() => setEdit({ jenis: "remisi", id })} onToggle={() => toggleAktif("remisi", id, x)} />
                ))}
              </article>
            );
          })}

          {tab === "map" && (
            <article className="panel master-group" data-testid="pemetaan-saran">
              <div className="panel-header"><div><p className="panel-title">Pemetaan jenis saran → aturan pelanggaran</p><span>Saran otomatis memakai aturan yang dipilih di sini. Kosong = jenis saran itu tidak dibuat.</span></div></div>
              {SEMUA_TIPE_SARAN.map((tipe) => {
                const dipilih = d.autoMap[tipe] ?? "";
                const usulan = !dipilih ? cariAturanBawaan(tipe, d.rules) : undefined;
                const opsi = Object.entries(d.rules).filter(([, x]) => x.aktif || false).sort((a, b) => a[1].nama.localeCompare(b[1].nama));
                const adaTidakAktif = dipilih && !d.rules[dipilih]?.aktif;
                return (
                  <div className="master-row" key={tipe} data-tipe={tipe}>
                    <span className="master-text"><b>{TIPE_LABEL[tipe]}</b>
                      {usulan && <small className="muted block">Belum dipetakan; cadangan berdasarkan nama: {d.rules[usulan].nama}</small>}
                      {adaTidakAktif && <small className="muted block">Aturan terpilih sudah nonaktif/tidak ada: saran tidak dibuat.</small>}</span>
                    <select className="text-input auto" aria-label={`Aturan untuk saran ${TIPE_LABEL[tipe]}`} value={dipilih} disabled={!bisaTulis}
                      onChange={async (e) => {
                        try { await simpanAutoMap(tipe, e.target.value || null, dipilih || undefined, actor); notify("Pemetaan saran disimpan"); }
                        catch (ex) { notify((ex as Error).message, "err"); }
                      }}>
                      <option value="">(belum dipetakan)</option>
                      {opsi.map(([id, x]) => <option key={id} value={id}>{x.nama} ({x.poin} poin)</option>)}
                      {dipilih && !opsi.some(([id]) => id === dipilih) && <option value={dipilih}>{d.rules[dipilih]?.nama ?? dipilih} (nonaktif)</option>}
                    </select>
                  </div>
                );
              })}
            </article>
          )}

          {tab === "levels" && (
            <article className="panel master-group">
              <div className="panel-header"><div><p className="panel-title">Ambang akumulasi poin</p><span>Level siswa = ambang tertinggi yang sudah dilewati saldo poinnya. Penanggung jawab menentukan siapa yang membina siswa pada ambang itu (daftar "Perlu dibina" wali kelas memakai ambang berpenanggung jawab wali).</span></div></div>
              {bisaTulis && peran !== "kepala" && Object.values(d.levels).some((l) => !l.penanggungJawab) && (
                <div className="notice warn" data-testid="pj-belum-waka"><Icon name="warning" size={17} /><span>Sebagian ambang belum punya penanggung jawab. Hanya Kepala Madrasah yang dapat mengisinya (tombol "Isi penanggung jawab bawaan" di halaman ini).</span></div>
              )}
              {bisaTulis && peran === "kepala" && Object.values(d.levels).some((l) => !l.penanggungJawab) && (
                <div className="notice warn" data-testid="pj-belum"><Icon name="warning" size={17} /><span>Sebagian ambang belum punya penanggung jawab, sehingga wali kelas belum menerima daftar "Perlu dibina".
                  <button className="primary-button sm" disabled={pjBusy} onClick={isiPj}>{pjBusy ? <Spinner /> : null}Isi penanggung jawab bawaan</button></span></div>
              )}
              {Object.entries(d.levels).sort((a, b) => a[1].poin - b[1].poin).map(([id, x]) => (
                <div className="master-row" key={id} data-level={id}>
                  <em className="poin-pill">{x.poin}</em>
                  <span className="master-text"><b>{x.tindakan}</b><small data-testid="pj-level">{x.penanggungJawab ? `Penanggung jawab: ${PJ_LABEL[x.penanggungJawab]}` : "Penanggung jawab belum diatur"}</small></span>
                  {bisaTulis && <span className="row-actions"><button title="Ubah" aria-label="Ubah ambang" onClick={() => setEdit({ jenis: "levels", id })}><Icon name="edit" size={16} /></button></span>}
                </div>
              ))}
            </article>
          )}
        </>
      )}

      {edit && <MasterDialog edit={edit} d={d} actor={actor} onClose={() => setEdit(null)} />}
    </section>
  );
}

function MasterRow({ nama, poin, aktif, sub, minus, bisaTulis, onEdit, onToggle }: {
  nama: string; poin: number; aktif: boolean; sub?: string; minus?: boolean; bisaTulis: boolean; onEdit: () => void; onToggle: () => void;
}) {
  return (
    <div className={`master-row ${aktif ? "" : "nonaktif"}`}>
      <em className={`poin-pill ${minus ? "minus" : ""}`}>{minus ? "−" : ""}{poin}</em>
      <span className="master-text"><b>{nama}</b>{sub && <small>{sub}</small>}</span>
      {!aktif && <StatusBadge status="Nonaktif" />}
      {bisaTulis && (
        <span className="row-actions">
          <button title="Ubah" aria-label={`Ubah ${nama}`} onClick={onEdit}><Icon name="edit" size={16} /></button>
          <button title={aktif ? "Nonaktifkan" : "Aktifkan"} aria-label={`${aktif ? "Nonaktifkan" : "Aktifkan"} ${nama}`} onClick={onToggle}><Icon name={aktif ? "eyeOff" : "eye"} size={16} /></button>
        </span>
      )}
    </div>
  );
}

function MasterDialog({ edit, d, actor, onClose }: { edit: NonNullable<Edit>; d: ReturnType<typeof useDiscipline>; actor: Actor; onClose: () => void }) {
  const notify = useToast();
  const peran = useAuth().session?.role;
  const terpakai = useLive<Record<string, true>>("discipline/levelTerpakai");
  const { jenis, id } = edit;
  const lama = (id ? (jenis === "rules" ? d.rules[id] : jenis === "remisi" ? d.remisi[id] : d.levels[id]) : undefined) as (Rule & Remisi & Level) | undefined;
  const [f, setF] = useState({
    kategori: (lama?.kategori ?? "Ringan") as KategoriPelanggaran,
    kelompok: (lama?.kelompok ?? "Prestasi") as Kelompok,
    nama: lama?.nama ?? "",
    poin: lama ? String(lama.poin) : "",
    takziran: lama?.takziran ?? "",
    syarat: lama?.syarat ?? "",
    tindakan: lama?.tindakan ?? "",
    penanggungJawab: (lama?.penanggungJawab ?? "") as PenanggungJawab | "",
    aktif: lama?.aktif ?? true,
  });
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [hapus, setHapus] = useState(false);
  // v2.5: hanya kepala yang mengubah penanggung jawab, dan hanya selama ambang belum dipakai pembinaan (rules menegakkan keduanya).
  const pjBisaDiubah = peran === "kepala" && !(id && terpakai.data?.[id]);
  const judul = jenis === "rules" ? "pelanggaran" : jenis === "remisi" ? "remisi" : "ambang";

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const p = Number(f.poin);
    const maks = jenis === "levels" ? 100000 : 1000;
    if (!Number.isInteger(p) || p < 1 || p > maks) { setErr(`Poin harus bilangan bulat 1–${maks}`); return; }
    if (jenis === "levels") {
      if (!f.tindakan.trim() || f.tindakan.length > 200) { setErr("Tindakan wajib diisi (maks. 200 karakter)"); return; }
    } else if (!f.nama.trim() || f.nama.length > 200) { setErr("Nama wajib diisi (maks. 200 karakter)"); return; }
    setBusy(true);
    try {
      const data = jenis === "rules"
        ? { kategori: f.kategori, nama: f.nama.trim(), poin: p, takziran: f.takziran.trim(), aktif: f.aktif }
        : jenis === "remisi"
          ? { kelompok: f.kelompok, nama: f.nama.trim(), poin: p, syarat: f.syarat.trim(), aktif: f.aktif }
          : { poin: p, tindakan: f.tindakan.trim(), penanggungJawab: f.penanggungJawab || undefined };
      await simpanMaster(jenis, id, data, lama ? stripMeta(lama) : null, actor);
      notify("Tersimpan");
      onClose();
    } catch (ex) { setErr((ex as Error).message); setBusy(false); }
  };

  return (
    <Modal title={`${id ? "Ubah" : "Tambah"} ${judul}`} subtitle="Perubahan tidak mengubah riwayat yang sudah tercatat (disalin saat dicatat)." onClose={onClose} width={520}>
      <form className="modal-form" onSubmit={submit} noValidate>
        {jenis === "rules" && <Field label="Kategori"><select className="text-input" value={f.kategori} onChange={(e) => setF({ ...f, kategori: e.target.value as KategoriPelanggaran })}>{KATEGORI_LIST.map((k) => <option key={k}>{k}</option>)}</select></Field>}
        {jenis === "remisi" && <Field label="Kelompok"><select className="text-input" value={f.kelompok} onChange={(e) => setF({ ...f, kelompok: e.target.value as Kelompok })}><option>Prestasi</option><option>Tanpa prestasi</option></select></Field>}
        {jenis === "levels" ? (
          <>
            <Field label="Tindakan"><textarea className="text-input area" rows={2} maxLength={200} value={f.tindakan} onChange={(e) => setF({ ...f, tindakan: e.target.value })} /></Field>
            <Field label="Penanggung jawab" hint={!pjBisaDiubah ? (peran !== "kepala" ? "Hanya Kepala Madrasah yang dapat mengubah penanggung jawab." : "Terkunci: ambang ini sudah dipakai pembinaan, sehingga penanggung jawabnya tidak dapat diubah.") : "Wali kelas: ambang ini muncul di daftar Perlu dibina wali."}>
              <select className="text-input" value={f.penanggungJawab} disabled={!pjBisaDiubah} aria-label="Penanggung jawab" onChange={(e) => setF({ ...f, penanggungJawab: e.target.value as PenanggungJawab | "" })}>
                <option value="">Belum diatur</option>
                {PJ_LIST.map((k) => <option key={k} value={k}>{PJ_LABEL[k]}</option>)}
                {f.penanggungJawab === "waka" && <option value="waka">{PJ_LABEL.waka} (nilai lama)</option>}
              </select>
            </Field>
          </>
        ) : (
          <Field label="Nama"><textarea className="text-input area" rows={2} maxLength={200} value={f.nama} onChange={(e) => setF({ ...f, nama: e.target.value })} /></Field>
        )}
        <Field label={jenis === "levels" ? "Ambang poin" : "Poin"}><input className="text-input" inputMode="numeric" value={f.poin} onChange={(e) => setF({ ...f, poin: e.target.value.replace(/\D/g, "").slice(0, 6) })} /></Field>
        {jenis === "rules" && <Field label="Takziran (opsional)" hint="Teks sanksi; tidak menambah poin."><textarea className="text-input area" rows={2} maxLength={300} value={f.takziran} onChange={(e) => setF({ ...f, takziran: e.target.value })} /></Field>}
        {jenis === "remisi" && <Field label="Syarat (opsional)"><input className="text-input" maxLength={200} value={f.syarat} onChange={(e) => setF({ ...f, syarat: e.target.value })} /></Field>}
        {jenis !== "levels" && <label className="check-inline"><input type="checkbox" checked={f.aktif} onChange={(e) => setF({ ...f, aktif: e.target.checked })} />Aktif (muncul di form pencatatan)</label>}
        {err && <div className="login-error-box" role="alert"><Icon name="warning" size={17} /><div><span>{err}</span></div></div>}
        <div className="modal-actions">
          {jenis === "levels" && id && <button type="button" className="danger-button push-left" disabled={busy} onClick={() => setHapus(true)}>Hapus ambang</button>}
          <button type="button" className="secondary-button" onClick={onClose}>Batal</button>
          <button className="primary-button" disabled={busy}>{busy ? <Spinner /> : null}Simpan</button>
        </div>
      </form>
      {hapus && id && (
        <Modal title="Hapus ambang?" subtitle={lama?.tindakan} onClose={() => setHapus(false)} width={420}>
          <p className="modal-note">Ambang dihapus dari daftar; riwayat siswa tidak berubah. Tercatat di jejak audit.</p>
          <div className="modal-actions">
            <button className="secondary-button" onClick={() => setHapus(false)}>Batal</button>
            <button className="danger-button" disabled={busy} onClick={async () => {
              setBusy(true);
              try { await hapusLevel(id, lama, actor); notify("Ambang dihapus"); onClose(); } catch (ex) { setErr((ex as Error).message); setBusy(false); setHapus(false); }
            }}>Hapus</button>
          </div>
        </Modal>
      )}
    </Modal>
  );
}

function stripMeta<T extends object>(x: T) {
  const { diubahOleh: _o, diubahTs: _t, ...rest } = x as T & { diubahOleh?: string; diubahTs?: number };
  void _o; void _t;
  return rest;
}
