import { useMemo, useState } from "react";
import { Link } from "react-router";
import Icon from "../components/Icon";
import { Field, Spinner } from "../components/ui";
import { usePanelBase, usePanelMode, useToast } from "../admin/AdminLayout";
import { useAdminData } from "../admin/AdminData";
import { useLive } from "../services/db";
import { limitToFirst, query } from "firebase/database";
import { statusMigrasi } from "../lib/statusMigrasi";
import { AMBANG_MAKS, AMBANG_MIN, tertahan, type OverrideKalender, type RingkasanHari } from "../lib/hariEfektif";
import { BULAN, addDays, formatTanggal, lastDayOfMonth, monthKey, namaHari, weekday } from "../lib/time";
import { hapusOverride, hitungUlang, konfirmasiNormal, migrasiKalender, simpanAmbang, simpanOverride, tandaiSudahDimigrasi, type HasilMigrasi } from "../services/kalender";
import { useAmbang, useKalenderRentang } from "./useKalender";

type Jenis = "efektif" | "libur" | "ovr-libur" | "ovr-efektif" | "berjalan" | "rendah" | "belum" | "mendatang";

const LABEL: Record<Jenis, string> = {
  efektif: "Efektif (otomatis)", libur: "Libur / tanpa bukti", "ovr-libur": "Libur (override)", "ovr-efektif": "Efektif (override)",
  berjalan: "Hari ini (berjalan)", rendah: "Tap rendah (peringatan)", belum: "Belum dihitung", mendatang: "Mendatang",
};

function jenisHari(d: string, today: string, info: RingkasanHari | undefined, ov: OverrideKalender | undefined): Jenis {
  if (ov) return ov.status === "libur" ? "ovr-libur" : "ovr-efektif";
  if (d > today) return "mendatang";
  if (d === today) return "berjalan";
  if (!info) return weekday(d) === 0 ? "libur" : "belum";
  if (tertahan(info)) return "rendah";
  return info.efektif ? "efektif" : "libur";
}

/** Kalender Akademik: hari efektif berbasis bukti + override. Waka mengisi, kepala cadangan; TU (admin) hanya melihat. */
export default function Kalender() {
  const mode = usePanelMode();
  const base = usePanelBase();
  const notify = useToast();
  const { today } = useAdminData();
  const bisaAtur = mode === "waka" || mode === "kepala"; // v2.5.2: Wakasis mengisi, Kamad cadangan, TU (admin) hanya membaca
  const [bulan, setBulan] = useState(monthKey(today));
  const [dipilih, setDipilih] = useState(today);
  const awal = `${bulan}-01`, akhir = lastDayOfMonth(bulan);
  const kal = useKalenderRentang(awal, akhir);
  const ambang = useAmbang();

  const hari = useMemo(() => {
    const out: string[] = [];
    for (let d = awal; d <= akhir; d = addDays(d, 1)) out.push(d);
    return out;
  }, [awal, akhir]);
  const kosongAwal = (weekday(awal) + 6) % 7; // Senin = kolom pertama

  const info = kal.peta[dipilih];
  const ov = kal.override[dipilih];
  const jenis = jenisHari(dipilih, today, info, ov);
  const ringkasHari = hari.filter((d) => kal.peta[d]?.efektif).length;
  const geser = (n: number) => { const [y, m] = bulan.split("-").map(Number); const t = new Date(Date.UTC(y, m - 1 + n, 1)); setBulan(t.toISOString().slice(0, 7)); setDipilih(`${t.toISOString().slice(0, 7)}-01`); };

  return (
    <section className="data-page">
      <div className="section-heading"><div><p>Kalender akademik</p><span>Hari efektif ditentukan oleh BUKTI: tap kartu atau presensi manual (ambang {ambang ?? "…"} siswa), atau override Anda. Hari tanpa bukti bukan hari efektif dan siswa tidak dihitung Alpha.{bisaAtur ? "" : " · hanya lihat"}</span></div></div>
      {kal.error && <div className="notice warn" role="alert"><Icon name="warning" size={17} /><span>Sebagian data tidak dapat dimuat ({kal.error}).</span></div>}

      <div className="kal-wrap">
        <article className="panel">
          <div className="panel-header">
            <div><p className="panel-title" data-testid="kal-bulan">{BULAN[Number(bulan.slice(5)) - 1]} {bulan.slice(0, 4)}</p><span>{kal.loading ? "Memuat…" : `${ringkasHari} hari efektif tercatat`}</span></div>
            <div className="heading-actions">
              <button className="secondary-button sm" aria-label="Bulan sebelumnya" onClick={() => geser(-1)}>‹</button>
              <button className="secondary-button sm" onClick={() => { setBulan(monthKey(today)); setDipilih(today); }}>Bulan ini</button>
              <button className="secondary-button sm" aria-label="Bulan berikutnya" onClick={() => geser(1)}>›</button>
            </div>
          </div>
          <div className="kal-grid" role="grid" aria-label="Kalender">
            {["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"].map((h) => <span key={h} className="kal-head">{h}</span>)}
            {Array.from({ length: kosongAwal }, (_, i) => <span key={`k${i}`} />)}
            {hari.map((d) => {
              const x = kal.peta[d];
              const j = jenisHari(d, today, x, kal.override[d]);
              return (
                <button key={d} data-tgl={d} data-jenis={j} aria-label={`${formatTanggal(d)}: ${LABEL[j]}`} aria-pressed={d === dipilih}
                  className={`kal-hari kal-${j} ${d === dipilih ? "dipilih" : ""} ${d === today ? "hari-ini" : ""}`} onClick={() => setDipilih(d)}>
                  <b>{Number(d.slice(8))}</b>
                  {x && (x.tap > 0 || x.manual > 0) && <small>{x.tap}{x.manual ? `+${x.manual}` : ""}</small>}
                </button>
              );
            })}
          </div>
          <div className="kal-legenda">
            {(["efektif", "libur", "ovr-libur", "ovr-efektif", "berjalan", "rendah"] as Jenis[]).map((j) => <span key={j}><i className={`kal-${j}`} />{LABEL[j]}</span>)}
          </div>
          <p className="caption-text">Angka kecil = jumlah tap alat (+ presensi manual). Contoh “42+3”.</p>
        </article>

        <article className="panel" data-testid="kal-detail">
          <div className="panel-header"><div><p className="panel-title">{formatTanggal(dipilih)}</p><span data-testid="kal-status">{LABEL[jenis]}</span></div></div>
          <div className="kv-list">
            <div><span>Tap alat</span><b>{info?.tap ?? "—"}</b></div>
            <div><span>Hadir hanya manual</span><b>{info?.manual ?? "—"}</b></div>
            <div><span>Sumber</span><b>{info ? (info.sumber === "override" ? "Override" : "Otomatis") : "belum dihitung"}</b></div>
            {ov && <div><span>Override</span><b>{ov.status === "libur" ? "Libur" : "Efektif"} — {ov.alasan}</b></div>}
          </div>
          {tertahan(info) && (
            <div className="notice warn" role="status" data-testid="kal-rendah">
              <Icon name="warning" size={17} />
              <span>Tap pada tanggal ini jauh lebih rendah dari biasanya (alat mungkin bermasalah sebagian hari). Validasi Alfa tanggal ini <b>ditahan</b>.</span>
              <span className="aksi-cell">
                <Link className="secondary-button sm" to={`${base}/presensi-manual?tanggal=${dipilih}`}>Isi presensi manual</Link>
                {bisaAtur && <button className="primary-button sm" onClick={async () => { try { await konfirmasiNormal(dipilih); notify("Hari dikonfirmasi normal"); } catch (e) { notify((e as Error).message, "err"); } }}>Konfirmasi hari ini normal</button>}
              </span>
            </div>
          )}
          {info?.rendah && info.normal && <p className="modal-note">Tap rendah sudah dikonfirmasi normal oleh waka/kepala.</p>}
          {weekday(dipilih) === 0 && !ov && <p className="modal-note">Hari Minggu = libur otomatis, kecuali Anda menetapkan override “efektif”.</p>}
          {bisaAtur ? <FormOverride key={dipilih} tanggal={dipilih} ov={ov} info={info} onOk={notify} /> : <p className="modal-note" data-testid="kal-hanya-baca">Kalender hanya dapat diisi Waka Kesiswaan (cadangan: Kepala Madrasah). Anda hanya melihat; ingatkan Waka Kesiswaan bila ada tanggal merah atau kegiatan yang belum ditandai.</p>}
        </article>
      </div>

      {bisaAtur && <PengaturanAmbang ambang={ambang} onOk={notify} />}
      {bisaAtur && <HitungUlang today={today} onOk={notify} />}
      {bisaAtur && <Migrasi today={today} onOk={notify} />}
    </section>
  );
}

function FormOverride({ tanggal, ov, info, onOk }: { tanggal: string; ov?: OverrideKalender; info?: RingkasanHari; onOk: (m: string, k?: "ok" | "err") => void }) {
  const [status, setStatus] = useState<"libur" | "efektif">(ov?.status ?? (info?.efektif ? "libur" : "efektif"));
  const [alasan, setAlasan] = useState(ov?.alasan ?? "");
  const [paham, setPaham] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const tanpaBukti = !info || info.tap + info.manual === 0;
  const perluPaham = status === "efektif" && tanpaBukti;

  const simpan = async () => {
    setErr("");
    if (alasan.trim().length < 3) { setErr("Alasan wajib diisi (minimal 3 karakter)."); return; }
    if (perluPaham && !paham) { setErr("Centang pernyataan di atas untuk melanjutkan."); return; }
    setBusy(true);
    try { await simpanOverride(tanggal, status, alasan); onOk(`${formatTanggal(tanggal, false)}: override ${status} tersimpan`); }
    catch (e) { setErr((e as Error).message); }
    finally { setBusy(false); }
  };
  const hapus = async () => {
    setBusy(true);
    try { await hapusOverride(tanggal); onOk("Override dihapus"); }
    catch (e) { setErr((e as Error).message); }
    finally { setBusy(false); }
  };

  return (
    <div className="modal-form" style={{ marginTop: 12 }}>
      <Field label="Override tanggal ini">
        <select className="text-input" value={status} onChange={(e) => { setStatus(e.target.value as "libur" | "efektif"); setPaham(false); }} aria-label="Jenis override">
          <option value="libur">Libur (tanggal merah, ujian, kegiatan luar)</option>
          <option value="efektif">Efektif (hari pengganti / alat mati tetapi sekolah masuk)</option>
        </select>
      </Field>
      <Field label="Alasan (wajib)"><textarea className="text-input area" rows={2} maxLength={200} value={alasan} onChange={(e) => setAlasan(e.target.value)} aria-label="Alasan override" /></Field>
      {perluPaham && (
        <div className="notice warn" role="alert" data-testid="kal-peringatan-efektif">
          <Icon name="warning" size={17} />
          <span><b>Semua siswa tanpa tap/izin/manual akan tercatat Alpha.</b> Pastikan presensi manual sudah diisi (mode alat bermasalah).
            <label className="check-inline" style={{ display: "flex", gap: 8, marginTop: 6 }}><input type="checkbox" checked={paham} onChange={(e) => setPaham(e.target.checked)} />Saya mengerti dan sudah/akan mengisi presensi manual</label></span>
        </div>
      )}
      {err && <div className="login-error-box" role="alert"><Icon name="warning" size={17} /><div><span>{err}</span></div></div>}
      <div className="modal-actions" style={{ justifyContent: "flex-start" }}>
        <button className="primary-button" onClick={simpan} disabled={busy}>{busy ? <Spinner /> : null}Simpan override</button>
        {ov && <button className="secondary-button" onClick={hapus} disabled={busy}>Hapus override</button>}
      </div>
    </div>
  );
}

function PengaturanAmbang({ ambang, onOk }: { ambang: number | null; onOk: (m: string, k?: "ok" | "err") => void }) {
  const [nilai, setNilai] = useState("");
  const simpan = async () => {
    const n = Number(nilai);
    try { await simpanAmbang(n); onOk(`Ambang hari efektif = ${n}. Gunakan “Hitung ulang” agar tanggal lama mengikuti.`); setNilai(""); }
    catch (e) { onOk((e as Error).message, "err"); }
  };
  return (
    <article className="panel master-group">
      <div className="panel-header"><div><p className="panel-title">Ambang hari efektif</p><span>Jumlah bukti hadir (tap alat + presensi manual) minimal agar sebuah tanggal menjadi hari efektif. Bawaan 1.</span></div></div>
      <div className="kv-list"><div><span>Saat ini</span><b data-testid="ambang-saat-ini">{ambang ?? "…"} siswa</b></div></div>
      <Field label={`Ubah (${AMBANG_MIN}–${AMBANG_MAKS})`} hint="Berlaku untuk penghitungan berikutnya; riwayat lama berubah setelah Hitung ulang.">
        <div className="uid-row">
          <input className="text-input" inputMode="numeric" value={nilai} maxLength={3} aria-label="Ambang hari efektif" onChange={(e) => setNilai(e.target.value.replace(/\D/g, ""))} />
          <button className="secondary-button" disabled={!nilai} onClick={simpan}>Simpan ambang</button>
        </div>
      </Field>
    </article>
  );
}

function HitungUlang({ today, onOk }: { today: string; onOk: (m: string, k?: "ok" | "err") => void }) {
  const [dari, setDari] = useState(addDays(today, -7));
  const [sampai, setSampai] = useState(addDays(today, -1));
  const [busy, setBusy] = useState(false);
  const [hasil, setHasil] = useState("");
  const jalan = async (dry: boolean) => {
    if (dari > sampai) { onOk("Tanggal awal harus sebelum tanggal akhir", "err"); return; }
    if (sampai >= today) { onOk("Hitung ulang hanya untuk tanggal sebelum hari ini (hari ini dihitung otomatis).", "err"); return; }
    setBusy(true);
    try {
      const h = await hitungUlang(dari, sampai, dry);
      const berubah = h.filter((x) => x.berubah).length;
      setHasil(dry ? `Pratinjau: ${berubah} dari ${h.length} tanggal akan berubah.` : `${berubah} dari ${h.length} tanggal diperbarui.`);
      if (!dry) onOk(`Hitung ulang selesai: ${berubah} tanggal diperbarui`);
    } catch (e) { onOk((e as Error).message, "err"); }
    finally { setBusy(false); }
  };
  return (
    <article className="panel master-group">
      <div className="panel-header"><div><p className="panel-title">Hitung ulang</p><span>Menghitung ulang ringkasan hari efektif dari data log, presensi manual, dan override pada rentang tanggal. Aman diulang; override tidak pernah ditimpa.</span></div></div>
      <div className="filter-bar">
        <input type="date" className="text-input auto" value={dari} max={addDays(today, -1)} onChange={(e) => e.target.value && setDari(e.target.value)} aria-label="Hitung dari" />
        <input type="date" className="text-input auto" value={sampai} max={addDays(today, -1)} onChange={(e) => e.target.value && setSampai(e.target.value)} aria-label="Hitung sampai" />
        <button className="secondary-button" disabled={busy} onClick={() => jalan(true)}>Pratinjau</button>
        <button className="primary-button" disabled={busy} onClick={() => jalan(false)}>{busy ? <Spinner /> : null}Hitung ulang</button>
      </div>
      {hasil && <p className="modal-note" data-testid="hitung-ulang-hasil">{hasil}</p>}
    </article>
  );
}

function Migrasi({ today, onOk }: { today: string; onOk: (m: string, k?: "ok" | "err") => void }) {
  const penanda = useLive<{ oleh: string; ts: number; dari: string; sampai: string }>("sistem/migrasiKalender");
  // deteksi dari data: migrasi produksi sebelum penanda ada (semua profil punya aktifSejak + kalenderEfektif berisi)
  const profil = useLive<Record<string, { aktifSejak?: string }>>("profiles");
  const ada = useLive<Record<string, unknown>>("kalenderEfektif", (ref) => query(ref, limitToFirst(1)));
  const muat = penanda.loading || profil.loading || ada.loading;
  const status = statusMigrasi({ penanda: penanda.data, profil: profil.data, jumlahRingkasan: Object.keys(ada.data ?? {}).length });
  const sudahJalan = status !== "belum" || muat; // selama memuat: tombol tetap nonaktif (hindari kilasan tombol aktif)
  const [busy, setBusy] = useState(false);
  const [ringkas, setRingkas] = useState<HasilMigrasi | null>(null);
  const [sudahDry, setSudahDry] = useState(false);
  const jalan = async (dry: boolean) => {
    setBusy(true);
    try {
      const h = await migrasiKalender(today, dry);
      setRingkas(h); setSudahDry(dry);
      if (!dry) onOk("Migrasi kalender selesai");
    } catch (e) { onOk((e as Error).message, "err"); }
    finally { setBusy(false); }
  };
  const tandai = async () => {
    setBusy(true);
    try { await tandaiSudahDimigrasi(today); onOk("Migrasi ditandai sudah dijalankan"); }
    catch (e) { onOk((e as Error).message, "err"); }
    finally { setBusy(false); }
  };
  return (
    <article className="panel master-group" data-testid="migrasi-kalender">
      <div className="panel-header"><div><p className="panel-title">Migrasi sekali jalan (Waka/Kepala)</p><span>Menghitung ringkasan hari efektif untuk seluruh tahun ajaran berjalan dari data yang ada, dan mengisi “aktif sejak” siswa lama dengan tanggal efektif pertama. Periksa dulu (dry-run); baru terapkan.</span></div></div>
      {status === "penanda" && <div className="notice" role="status" data-testid="migrasi-sudah"><Icon name="check" size={17} /><span>Migrasi sudah dijalankan ({(penanda.data as { dari: string; sampai: string }).dari} s.d. {(penanda.data as { dari: string; sampai: string }).sampai}). Tombol dinonaktifkan; perubahan berikutnya cukup lewat Hitung ulang.</span></div>}
      {status === "terdeteksi" && <div className="notice" role="status" data-testid="migrasi-terdeteksi"><Icon name="check" size={17} /><span>Migrasi sudah dijalankan (terdeteksi dari data). Tombol dinonaktifkan; perubahan berikutnya cukup lewat Hitung ulang.</span></div>}
      <div className="modal-actions" style={{ justifyContent: "flex-start", flexWrap: "wrap" }}>
        <button className="secondary-button" disabled={busy || sudahJalan} onClick={() => jalan(true)}>{busy ? <Spinner /> : null}Periksa (dry-run)</button>
        <button className="danger-button" disabled={busy || !sudahDry || sudahJalan} onClick={() => jalan(false)} title={sudahJalan ? "Migrasi sudah dijalankan" : sudahDry ? undefined : "Jalankan pemeriksaan (dry-run) terlebih dahulu"}>Terapkan migrasi</button>
        {status === "terdeteksi" && <button className="secondary-button" disabled={busy} onClick={tandai} data-testid="migrasi-tandai">Tandai sudah dimigrasi</button>}
      </div>
      {ringkas && (
        <p className="modal-note" data-testid="migrasi-ringkasan">
          {sudahDry ? "DRY-RUN (belum ditulis): " : "Selesai: "}{ringkas.dari} s.d. {ringkas.sampai} · {ringkas.efektif} hari efektif dari {ringkas.hari} hari · {ringkas.rendah} hari tap rendah · {ringkas.diperbarui} tanggal {sudahDry ? "akan ditulis" : "ditulis"} · aktif sejak {ringkas.aktifSejak ?? "—"} untuk {ringkas.aktifSejakDiisi} siswa
        </p>
      )}
      <small className="muted block">{namaHari(today)}, {formatTanggal(today, false)}</small>
    </article>
  );
}
