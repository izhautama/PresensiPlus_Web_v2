import { useMemo, useState, type FormEvent } from "react";
import Icon from "../components/Icon";
import { Empty, Field, Modal, Spinner } from "../components/ui";
import { useAdminData } from "../admin/AdminData";
import KartuIndeks from "./KartuIndeks";
import { usePanelMode, useToast } from "../admin/AdminLayout";
import { ORTU_DOMAIN } from "../lib/firebase";
import { decodeKelas, encodeKelas, waliPemegangKelas } from "../lib/wali";
import { PeranGagal, kirimResetPassword, useLive } from "../services/db";
import {
  buatAkunWali, cabutWali, pasangAkunWali, pasangKembaliWali, simpanWaliMassal, ubahKelasWali,
  type Pengelola, type WaliAkun,
} from "../services/wali";

/**
 * Pengelolaan akun wali kelas. ADMIN: kelas utama + kelas tambahan (berapa pun), pergantian TA massal, sinkronisasi indeks siswa-kelas.
 * WAKA: boleh membuat akun wali dan mengatur HANYA kelas utama (tepat 1 kelas); tidak ada opsi kelas tambahan (ditegakkan juga oleh rules).
 */
export default function WaliKelas() {
  const mode = usePanelMode();
  const oleh: Pengelola = mode === "admin" ? "admin" : "waka";
  const admin = oleh === "admin";
  const { kelasList } = useAdminData();
  const notify = useToast();
  const live = useLive<Record<string, WaliAkun>>("waliAkun");
  const daftar = useMemo(() => Object.entries(live.data ?? {}).sort((a, b) => a[1].nama.localeCompare(b[1].nama)), [live.data]);
  const [tambah, setTambah] = useState(false);
  const [ubah, setUbah] = useState<[string, WaliAkun] | null>(null);
  const [busy, setBusy] = useState("");
  const kunciKelas = useMemo(() => kelasList.map((k) => ({ nama: k, kunci: encodeKelas(k) })), [kelasList]);

  const aksi = async (uid: string, w: WaliAkun, apa: "cabut" | "pasang" | "reset") => {
    setBusy(`${apa}-${uid}`);
    try {
      if (apa === "cabut") { await cabutWali(uid, w.email); notify(`Akses ${w.nama} dicabut`); }
      else if (apa === "pasang") { await pasangKembaliWali(uid, w.email); notify(`Akses ${w.nama} dipasang kembali`); }
      else { await kirimResetPassword(w.email); notify(`Email reset password dikirim ke ${w.email}`); }
    } catch (e) { notify((e as Error).message, "err"); }
    finally { setBusy(""); }
  };

  return (
    <section className="data-page">
      <div className="section-heading">
        <div><p>Wali kelas</p><span>Akun per guru · wewenang hanya untuk siswa kelas binaan{admin ? "" : " · waka mengatur kelas utama (1 kelas)"}</span></div>
        <div className="heading-actions"><button className="primary-button" onClick={() => setTambah(true)}><Icon name="plus" size={16} />Tambah wali kelas</button></div>
      </div>
      <article className="panel master-group" data-testid="daftar-wali">
        {live.error ? <Empty icon="alert" title="Gagal memuat" text={live.error} /> : live.loading ? <div className="page-loader"><Spinner dark /></div> : daftar.length === 0 ? (
          <Empty icon="users" title="Belum ada wali kelas" text="Tambahkan akun wali kelas untuk tiap guru. Wali hanya melihat dan menangani siswa kelas binaannya." />
        ) : (
          <div className="simple-list">
            {daftar.map(([uid, w]) => (
              <div key={uid} data-uid={uid} className={w.aktif ? "" : "petugas-nonaktif"}>
                <span><b>{w.nama}</b><small>{w.email}</small></span>
                <span><small>Utama: <b data-testid="wali-utama">{decodeKelas(w.kelasUtama)}</b>{Object.keys(w.kelasTambahan ?? {}).length ? ` · tambahan: ${Object.keys(w.kelasTambahan ?? {}).map(decodeKelas).join(", ")}` : ""}{w.aktif ? "" : " · DICABUT"}</small></span>
                <span className="row-actions">
                  <button className="ghost-button" aria-label={`Ubah kelas ${w.nama}`} onClick={() => setUbah([uid, w])}>Ubah kelas</button>
                  {w.aktif
                    ? <button className="ghost-button" aria-label={`Cabut ${w.nama}`} disabled={busy === `cabut-${uid}`} onClick={() => aksi(uid, w, "cabut")}>Cabut</button>
                    : <button className="ghost-button" aria-label={`Pasang kembali ${w.nama}`} disabled={busy === `pasang-${uid}`} onClick={() => aksi(uid, w, "pasang")}>Pasang kembali</button>}
                  {admin && <button className="ghost-button" aria-label={`Reset password ${w.nama}`} disabled={busy === `reset-${uid}`} onClick={() => aksi(uid, w, "reset")}>Reset password</button>}
                </span>
              </div>
            ))}
          </div>
        )}
      </article>

      {admin && <PerTA daftar={daftar} kelas={kunciKelas} onOk={notify} />}
      {admin && <KartuIndeks />}

      {tambah && <FormWali judul="Tambah wali kelas" oleh={oleh} kelas={kunciKelas} semua={live.data ?? {}} onClose={() => setTambah(false)} onSimpan={() => { setTambah(false); }} />}
      {ubah && <FormWali judul={`Ubah kelas: ${ubah[1].nama}`} oleh={oleh} kelas={kunciKelas} semua={live.data ?? {}} awal={ubah} onClose={() => setUbah(null)} onSimpan={() => setUbah(null)} />}
    </section>
  );
}

function FormWali({ judul, oleh, kelas, semua, awal, onClose, onSimpan }: {
  judul: string; oleh: Pengelola; kelas: { nama: string; kunci: string }[]; semua: Record<string, WaliAkun>;
  awal?: [string, WaliAkun]; onClose: () => void; onSimpan: () => void;
}) {
  const notify = useToast();
  const baru = !awal;
  const admin = oleh === "admin";
  const [f, setF] = useState({ nama: "", email: "", password: "", ulang: "" });
  const [utama, setUtama] = useState(awal?.[1].kelasUtama ?? "");
  const [tambahan, setTambahan] = useState<string[]>(Object.keys(awal?.[1].kelasTambahan ?? {}));
  const [err, setErr] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [gagal, setGagal] = useState<PeranGagal | null>(null);

  // peringatan: kelas yang sudah ada walinya (kelas utama maupun tambahan)
  const dipilih = [utama, ...tambahan].filter(Boolean);
  const bentrok = dipilih.flatMap((k) => waliPemegangKelas(k, semua, awal?.[0]).map(([, w]) => ({ kelas: k, w })));
  const waliSudahUtama = utama ? waliPemegangKelas(utama, semua, awal?.[0]) : [];
  const wakaTerblokir = !admin && waliSudahUtama.length > 0; // wali kedua untuk satu kelas hanya boleh diatur admin

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const v: Record<string, string> = {};
    if (!utama) v.utama = "Pilih kelas utama";
    if (wakaTerblokir) v.utama = `Kelas ini sudah punya wali (${waliSudahUtama.map(([, w]) => w.nama).join(", ")}). Hanya admin yang dapat menambah wali kedua.`;
    let nama = "", email = "";
    if (baru) {
      nama = f.nama.trim().replace(/\s+/g, " ");
      email = f.email.trim().toLowerCase();
      if (!nama) v.nama = "Nama wajib diisi"; else if (nama.length > 60) v.nama = "Nama maksimal 60 karakter";
      if (!/^\S+@\S+\.\S+$/.test(email) || email.length > 120) v.email = "Masukkan email asli yang valid";
      else if (email.endsWith(`@${ORTU_DOMAIN}`)) v.email = "Domain email ini dicadangkan untuk akun orang tua";
      if (f.password.length < 8) v.password = "Password sementara minimal 8 karakter";
      if (f.password !== f.ulang) v.ulang = "Konfirmasi password tidak sama";
    }
    setErr(v);
    if (Object.keys(v).length) return;
    setBusy(true);
    try {
      if (baru) { await buatAkunWali({ nama, email, password: f.password, kelasUtama: utama, kelasTambahan: tambahan }, oleh); notify(`Akun wali ${nama} dibuat`); }
      else { await ubahKelasWali(awal![0], awal![1].email, { kelasUtama: utama, kelasTambahan: tambahan }, oleh); notify("Kelas wali diperbarui"); }
      onSimpan();
    } catch (ex) {
      if (ex instanceof PeranGagal) setGagal(ex);
      else {
        const code = (ex as { code?: string }).code;
        setErr({ umum: code === "auth/email-already-in-use" ? "Email ini sudah terdaftar di Firebase Authentication." : code === "auth/weak-password" ? "Password terlalu lemah." : (ex as Error).message });
      }
    } finally { setBusy(false); }
  };

  const coba = async () => {
    if (!gagal) return;
    setBusy(true);
    try { await pasangAkunWali(gagal.uid, gagal.nama, gagal.email, utama, admin ? tambahan : [], oleh); notify(`Peran ${gagal.nama} terpasang`); onSimpan(); }
    catch (ex) { setGagal(new PeranGagal(gagal.uid, gagal.email, gagal.nama, gagal.role, (ex as Error).message)); }
    finally { setBusy(false); }
  };

  if (gagal) {
    return (
      <Modal title="Akun dibuat, peran belum terpasang" subtitle={gagal.email} onClose={onClose}>
        <div className="login-error-box" role="alert"><Icon name="warning" size={17} /><div><span>{gagal.message}</span></div></div>
        <p className="modal-note">Akun login sudah terbuat tetapi belum bisa masuk karena peran belum tersimpan. Pastikan Security Rules terbaru sudah di-deploy, lalu coba lagi.</p>
        <div className="modal-actions"><button className="secondary-button" onClick={onClose}>Tutup</button><button className="primary-button" onClick={coba} disabled={busy}>{busy ? <Spinner /> : null}Coba pasang peran lagi</button></div>
      </Modal>
    );
  }

  return (
    <Modal title={judul} subtitle={admin ? "Kelas utama + kelas tambahan (berapa pun)" : "Waka mengatur kelas utama saja (tepat 1 kelas)"} onClose={onClose}>
      <form className="modal-form" onSubmit={submit} noValidate>
        {baru && (
          <>
            <Field label="Nama lengkap guru" error={err.nama}><input className="text-input" value={f.nama} maxLength={60} onChange={(e) => setF({ ...f, nama: e.target.value })} /></Field>
            <Field label="Email (harus email asli)" error={err.email} hint="Dipakai untuk login dan reset password."><input className="text-input" type="email" autoComplete="off" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
            <div className="form-grid">
              <Field label="Password sementara" error={err.password} hint="Minimal 8 karakter."><input className="text-input" type="password" autoComplete="new-password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} /></Field>
              <Field label="Ulangi password" error={err.ulang}><input className="text-input" type="password" autoComplete="new-password" value={f.ulang} onChange={(e) => setF({ ...f, ulang: e.target.value })} /></Field>
            </div>
          </>
        )}
        <Field label="Kelas utama" error={err.utama}>
          <select className="text-input" value={utama} onChange={(e) => setUtama(e.target.value)} aria-label="Kelas utama">
            <option value="">Pilih kelas…</option>
            {kelas.map((k) => <option key={k.kunci} value={k.kunci}>{k.nama}</option>)}
          </select>
        </Field>
        {admin && (
          <Field label="Kelas tambahan (opsional)" hint="Wali boleh memegang lebih dari satu kelas.">
            <div className="pick-list" role="group" aria-label="Kelas tambahan">
              {kelas.filter((k) => k.kunci !== utama).map((k) => (
                <label key={k.kunci} className="check-inline"><input type="checkbox" checked={tambahan.includes(k.kunci)} onChange={(e) => setTambahan((x) => (e.target.checked ? [...x, k.kunci] : x.filter((y) => y !== k.kunci)))} />{k.nama}</label>
              ))}
            </div>
          </Field>
        )}
        {bentrok.length > 0 && (
          <div className="notice warn" role="status" data-testid="wali-bentrok"><Icon name="warning" size={17} />
            <span>{bentrok.map((b) => `Kelas ${decodeKelas(b.kelas)} sudah dipegang ${b.w.nama}`).join("; ")}.{admin ? " Admin boleh menambah wali kedua untuk kelas yang sama." : ""}</span></div>
        )}
        {err.umum && <div className="login-error-box" role="alert"><Icon name="warning" size={17} /><div><span>{err.umum}</span></div></div>}
        <div className="modal-actions">
          <button type="button" className="secondary-button" onClick={onClose}>Batal</button>
          <button className="primary-button" disabled={busy}>{busy ? <Spinner /> : null}Simpan</button>
        </div>
      </form>
    </Modal>
  );
}

/** Pergantian tahun ajaran: perbarui pemetaan kelas SEMUA wali sekaligus (admin). */
function PerTA({ daftar, kelas, onOk }: { daftar: [string, WaliAkun][]; kelas: { nama: string; kunci: string }[]; onOk: (m: string, k?: "ok" | "err") => void }) {
  const [edit, setEdit] = useState<Record<string, { utama: string; tambahan: string[] }>>({});
  const [busy, setBusy] = useState(false);
  const aktif = daftar.filter(([, w]) => w.aktif);
  const nilai = (uid: string, w: WaliAkun) => edit[uid] ?? { utama: w.kelasUtama, tambahan: Object.keys(w.kelasTambahan ?? {}) };
  const berubah = aktif.filter(([uid, w]) => edit[uid] && (edit[uid].utama !== w.kelasUtama || [...edit[uid].tambahan].sort().join() !== Object.keys(w.kelasTambahan ?? {}).sort().join()));
  const simpan = async () => {
    setBusy(true);
    try {
      const x = await simpanWaliMassal(berubah.map(([uid, w]) => ({ uid, email: w.email, kelasUtama: edit[uid].utama, kelasTambahan: edit[uid].tambahan })));
      onOk(`${x.wali} wali diperbarui; indeks siswa-kelas disinkronkan (${x.indeks} selisih)`); setEdit({});
    } catch (e) { onOk((e as Error).message, "err"); }
    finally { setBusy(false); }
  };
  return (
    <article className="panel master-group" data-testid="wali-per-ta">
      <div className="panel-header"><div><p className="panel-title">Wali kelas per tahun ajaran</p><span>Saat naik kelas: ubah pemetaan semua wali sekaligus lalu simpan satu kali. Indeks siswa-kelas ikut disinkronkan otomatis dalam penyimpanan yang sama (ubah kelas siswa lebih dulu di menu Siswa).</span></div></div>
      {aktif.length === 0 ? <p className="modal-note">Belum ada wali aktif.</p> : (
        <div className="simple-list">
          {aktif.map(([uid, w]) => {
            const n = nilai(uid, w);
            return (
              <div key={uid} data-uid={uid}>
                <span><b>{w.nama}</b><small>{w.email}</small></span>
                <select className="text-input auto" aria-label={`Kelas utama ${w.nama}`} value={n.utama} onChange={(e) => setEdit((x) => ({ ...x, [uid]: { ...n, utama: e.target.value } }))}>
                  {[...new Set([n.utama, ...kelas.map((k) => k.kunci)])].map((k) => <option key={k} value={k}>{decodeKelas(k)}</option>)}
                </select>
                <small>{n.tambahan.length ? `tambahan: ${n.tambahan.map(decodeKelas).join(", ")}` : "tanpa tambahan"}</small>
              </div>
            );
          })}
        </div>
      )}
      <div className="modal-actions" style={{ justifyContent: "flex-start" }}>
        <button className="primary-button" disabled={busy || berubah.length === 0} onClick={simpan}>{busy ? <Spinner /> : null}Simpan perubahan ({berubah.length})</button>
      </div>
    </article>
  );
}
