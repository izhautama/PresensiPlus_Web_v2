import { useCallback, useEffect, useState } from "react";
import Icon from "../components/Icon";
import { Modal, Spinner } from "../components/ui";
import { useToast } from "../admin/AdminLayout";
import { decodeKelas } from "../lib/wali";
import { totalSelisih, type HasilKonsistensi } from "../lib/konsistensi";
import { perbaikiKonsistensi, periksaKonsistensi } from "../services/wali";

const JENIS_SISWA = { baru: "indeks belum ada", berubah: "kelas beda", usang: "indeks usang" } as const;
const kls = (k: string | null) => (k === null ? "tidak ada" : decodeKelas(k));

/**
 * Pemeriksa konsistensi (admin): membandingkan config/students dengan indeks siswaKelas dan staff dengan cermin waliAkun.
 * Berjalan otomatis saat dibuka. "Perbaiki" selalu dry-run dulu; penerapan dibaca ulang dari database dan memakai log aktivitas.
 */
export default function KartuIndeks({ otomatis = true }: { otomatis?: boolean }) {
  const notify = useToast();
  const [h, setH] = useState<HasilKonsistensi | null>(null);
  const [galat, setGalat] = useState("");
  const [memeriksa, setMemeriksa] = useState(false);
  const [semua, setSemua] = useState(false);
  const [rencana, setRencana] = useState<{ hasil: HasilKonsistensi; path: number } | null>(null);
  const [sibuk, setSibuk] = useState(false);

  const periksa = useCallback(async () => {
    setMemeriksa(true); setGalat("");
    try { setH(await periksaKonsistensi()); } catch (e) { setGalat((e as Error).message || "Pemeriksaan gagal."); }
    finally { setMemeriksa(false); }
  }, []);
  useEffect(() => { if (otomatis) void periksa(); }, [otomatis, periksa]);

  const n = totalSelisih(h);
  const dapatDiperbaiki = !!h && (h.siswa.length > 0 || h.akun.some((a) => a.perbaikan));

  const bukaPerbaikan = async () => {
    setSibuk(true);
    try { setRencana(await perbaikiKonsistensi(true)); } catch (e) { notify((e as Error).message, "err"); }
    finally { setSibuk(false); }
  };
  const terapkan = async () => {
    setSibuk(true);
    try { const x = await perbaikiKonsistensi(false); notify(`${x.path} path diperbaiki`); setRencana(null); await periksa(); }
    catch (e) { notify((e as Error).message, "err"); }
    finally { setSibuk(false); }
  };

  const siswa = h?.siswa ?? [];
  const akun = h?.akun ?? [];
  const batas = semua ? Infinity : 8;

  return (
    <article className="panel master-group" data-testid="kartu-indeks" data-selisih={h ? n : ""} data-status={memeriksa && !h ? "memeriksa" : galat ? "galat" : n > 0 ? "selisih" : h ? "konsisten" : ""}>
      <div className="panel-header">
        <div>
          <p className="panel-title">Indeks kelas</p>
          <span>Membandingkan daftar siswa (config/students) dengan indeks siswa-kelas, dan akun wali (staff) dengan cermin waliAkun. Indeks dipakai Security Rules untuk membatasi wali pada siswa kelasnya.</span>
        </div>
        <span className={`badge ${galat ? "badge-gagal" : n > 0 ? "badge-lemah" : "badge-aman"}`} data-testid="indeks-status">
          {memeriksa && !h ? "Memeriksa…" : galat ? "Gagal diperiksa" : n > 0 ? `${n} selisih` : h ? "Konsisten" : "—"}
        </span>
      </div>

      {galat && <div className="login-error-box" role="alert"><Icon name="warning" size={17} /><div><span>{galat}</span></div></div>}
      {memeriksa && !h && <div className="page-loader"><Spinner dark /></div>}

      {n > 0 && (
        <div className="notice warn" role="alert" data-testid="indeks-peringatan">
          <Icon name="warning" size={17} />
          <span>Ditemukan {n} selisih. Sampai diperbaiki, wali kelas dapat melihat siswa yang salah atau tidak melihat siswa kelasnya, dan waka/kepala melihat daftar wali yang tidak sesuai.</span>
        </div>
      )}

      {siswa.length > 0 && (
        <div className="simple-list" data-testid="selisih-siswa">
          {siswa.slice(0, batas).map((s) => (
            <div key={s.nis} data-nis={s.nis}>
              <span><b>{s.nis}</b> {s.nama}<small>{JENIS_SISWA[s.jenis]}</small></span>
              <span><small>indeks: {kls(s.sekarang)} → seharusnya: {s.jenis === "usang" ? "dihapus" : kls(s.seharusnya)}</small></span>
            </div>
          ))}
        </div>
      )}
      {akun.length > 0 && (
        <div className="simple-list" data-testid="selisih-akun">
          {akun.slice(0, batas).map((a) => (
            <div key={a.uid} data-uid={a.uid}>
              <span><b>{a.nama}</b><small>{a.perbaikan ? "cermin akun wali" : "perlu tindakan admin"}</small></span>
              <span><small>{a.rincian.join("; ")}</small></span>
            </div>
          ))}
        </div>
      )}
      {siswa.length + akun.length > 8 && <button className="ghost-button" onClick={() => setSemua((x) => !x)}>{semua ? "Ringkas daftar" : `Tampilkan semua (${siswa.length + akun.length})`}</button>}

      {(h?.kelasKosong.length ?? 0) > 0 && (
        <div className="notice" data-testid="kelas-kosong"><Icon name="warning" size={17} />
          <span>Kelas wali tanpa siswa: {h!.kelasKosong.map((k) => `${k.nama} (${decodeKelas(k.kelas)})`).join(", ")}. Perbarui pemetaan wali bila baru naik kelas.</span></div>
      )}

      <div className="modal-actions" style={{ justifyContent: "flex-start" }}>
        <button className="secondary-button" disabled={memeriksa} onClick={periksa}>{memeriksa ? <Spinner dark /> : null}Periksa ulang</button>
        <button className="primary-button" disabled={!dapatDiperbaiki || sibuk} onClick={bukaPerbaikan}>{sibuk && !rencana ? <Spinner /> : null}Perbaiki</button>
      </div>
      {h && <p className="modal-note">Diperiksa {new Date(h.waktu).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}. Perbaikan ditulis ke jejak log aktivitas.</p>}

      {rencana && (
        <Modal title="Perbaiki indeks kelas" subtitle="Pratinjau (dry-run): belum ada yang ditulis" onClose={() => setRencana(null)}>
          <div className="modal-form">
            <p data-testid="rencana-ringkasan">
              {rencana.path === 0 ? "Tidak ada yang perlu ditulis." : `${rencana.path} path akan ditulis: ${rencana.hasil.siswa.filter((s) => s.jenis === "baru").length} indeks baru, ${rencana.hasil.siswa.filter((s) => s.jenis === "berubah").length} diubah, ${rencana.hasil.siswa.filter((s) => s.jenis === "usang").length} dihapus, ${rencana.hasil.akun.filter((a) => a.perbaikan).length} cermin akun wali.`}
            </p>
            <p className="modal-note">Sumber kebenaran: config/students untuk kelas siswa; staff dan roles untuk akun wali. Data dibaca ulang saat Terapkan.</p>
            <div className="modal-actions">
              <button className="secondary-button" onClick={() => setRencana(null)}>Batal</button>
              <button className="primary-button" disabled={sibuk || rencana.path === 0} onClick={terapkan}>{sibuk ? <Spinner /> : null}Terapkan perbaikan</button>
            </div>
          </div>
        </Modal>
      )}
    </article>
  );
}
