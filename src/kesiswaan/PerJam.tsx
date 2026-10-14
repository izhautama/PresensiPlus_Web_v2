import { useEffect, useMemo, useState } from "react";
import { useBlocker } from "react-router";
import Icon from "../components/Icon";
import { Empty, Spinner } from "../components/ui";
import { useAdminData } from "../admin/AdminData";
import { usePanelMode, useToast } from "../admin/AdminLayout";
import { gabungTap, type ManualTap } from "../lib/manual";
import type { KetHarian, LogEntry } from "../lib/types";
import { JAM, KODE_LABEL, SIKLUS_WAKA, berikutnya, encodeKelas, type KodeJam, type LessonsKelas, type MetaJam } from "../lib/perjam";
import { addDays, formatTanggal, weekday } from "../lib/time";
import { rentangPiket, tanggalDiJendela, type KodeIzin } from "../lib/piket";
import { useLive } from "../services/db";
import { simpanPerJam } from "../services/perjam";
import { izinPerJamPiket, pesanPiket } from "../services/piket";
import KeteranganDialog from "../piket/KeteranganDialog";
import { usePiketCtx, usePiketMundur } from "../piket/useJendela";
import { useActor } from "./useDiscipline";

const MAPEL_KEY = "perjam-mapel";
const GURU_KEY = "perjam-guru";
const bacaDaftar = (k: string): string[] => { try { return JSON.parse(localStorage.getItem(k) ?? "[]"); } catch { return []; } };
const simpanDaftar = (k: string, tambah: (string | undefined)[]) => {
  try {
    const set = new Set([...tambah.filter((x): x is string => Boolean(x)), ...bacaDaftar(k)]);
    localStorage.setItem(k, JSON.stringify([...set].slice(0, 60)));
  } catch { /* penyimpanan tidak tersedia: abaikan, hanya kenyamanan */ }
};

/**
 * Grid presensi per jam (siswa × jam ke-1..9). Sel kosong = hadir.
 * Waka mengubah semua kode (A/I/S/D); GURU PIKET hanya S/I/D (sel A terkunci, "diisi Waka") dan wajib mengisi keterangan
 * saat menyimpan (izinMeta); kepala dan admin melihat saja.
 */
export default function PerJam() {
  const { students, kelasList, today } = useAdminData();
  const mode = usePanelMode();
  const piket = mode === "piket";
  const wakaUbah = mode === "waka";
  const bisaUbah = wakaUbah || piket;
  const mundur = usePiketMundur();
  const piketCtx = usePiketCtx();
  const actor = useActor();
  const notify = useToast();
  const [tanggal, setTanggal] = useState(today);
  const [kelas, setKelas] = useState("");
  const [draft, setDraft] = useState<Record<string, KodeJam | "">>({});
  const [metaDraft, setMetaDraft] = useState<Record<number, MetaJam>>({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [dialogPiket, setDialogPiket] = useState(false);
  // aksi cepat piket
  const [qNis, setQNis] = useState("");
  const [qMulai, setQMulai] = useState(4);
  const [qSampai, setQSampai] = useState(9);
  const [qKode, setQKode] = useState<KodeIzin>("S");

  useEffect(() => { if (!kelas && kelasList.length) setKelas(kelasList[0]); }, [kelas, kelasList]);

  const live = useLive<LessonsKelas>(kelas ? `lessons/${tanggal}/${encodeKelas(kelas)}` : null);
  const logLive = useLive<Record<string, LogEntry>>(`log/${tanggal}`);
  const izinLive = useLive<Record<string, KetHarian>>(`izin/${tanggal}`);
  const valLive = useLive<Record<string, unknown>>(`validasi/${tanggal}`);
  const manualLive = useLive<Record<string, ManualTap>>(`manualTap/${tanggal}`);
  const server = live.data;

  const dirty = Object.keys(draft).length > 0 || Object.keys(metaDraft).length > 0;
  const blocker = useBlocker(dirty);
  useEffect(() => {
    if (blocker.state !== "blocked") return;
    if (window.confirm("Ada perubahan yang belum disimpan. Tinggalkan halaman ini?")) blocker.proceed(); else blocker.reset();
  }, [blocker]);
  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);

  const anak = useMemo(() => students.filter((s) => s.kelas === kelas), [students, kelas]);

  const tap = useMemo(() => {
    const m: Record<string, { masuk?: LogEntry; pulang?: LogEntry }> = {};
    for (const [key, e] of Object.entries(logLive.data ?? {})) {
      const slot = (m[e.nis] ??= {});
      if (key.endsWith("_M")) slot.masuk = e; else slot.pulang = e;
    }
    // presensi manual: alat menang; manual hanya mengisi yang kosong
    for (const [nis, tapM] of Object.entries(manualLive.data ?? {})) {
      const slot = (m[nis] ??= {});
      const g = gabungTap({ masuk: slot.masuk, pulang: slot.pulang }, tapM);
      if (g.masuk && !slot.masuk) slot.masuk = { jam: g.masuk.jam, nis, status: g.masuk.status, manual: g.masuk.manual };
      if (g.pulang && !slot.pulang) slot.pulang = { jam: g.pulang.jam, nis, status: "Pulang", manual: g.pulang.manual };
    }
    return m;
  }, [logLive.data, manualLive.data]);

  const statusRfid = (nis: string) => {
    const t = tap[nis];
    if (t?.masuk) return { teks: `${t.masuk.status} ${t.masuk.jam.slice(0, 5)}${t.masuk.manual ? ` (manual: ${t.masuk.manual})` : ""}${t.pulang ? ` · pulang ${t.pulang.jam.slice(0, 5)}` : ""}`, masuk: true, tone: t.masuk.status === "Terlambat" ? "warn" : "good" };
    const ket = izinLive.data?.[nis];
    if (ket) return { teks: ket, masuk: false, tone: "info" };
    if (valLive.data?.[nis]) return { teks: "Alfa (terverifikasi)", masuk: false, tone: "bad" };
    return { teks: tanggal < today ? "Tidak tap" : "Belum tap", masuk: false, tone: "muted" };
  };

  const kodeSel = (nis: string, jam: number): KodeJam | "" => {
    const k = `${nis}:${jam}`;
    return k in draft ? draft[k] : (server?.absen?.[nis]?.[jam] ?? "");
  };
  const metaVal = (jam: number): MetaJam => metaDraft[jam] ?? server?.meta?.[jam] ?? {};

  // Piket: kosong → I → S → D → kosong; tanggal mendatang tidak boleh Sakit. Sel A terkunci (hanya Waka).
  const siklusPiket: (KodeJam | "")[] = tanggal > today ? ["", "I", "D"] : ["", "I", "S", "D"];
  const siklus = piket ? siklusPiket : SIKLUS_WAKA;
  const setSel = (nis: string, jam: number, kode: KodeJam | "") => {
    const asli = server?.absen?.[nis]?.[jam] ?? "";
    if (piket && (asli === "A" || kode === "A")) return; // rules juga menolak; ini hanya mencegah draf yang pasti ditolak
    setDraft((d) => {
      const n = { ...d };
      if (kode === asli) delete n[`${nis}:${jam}`]; else n[`${nis}:${jam}`] = kode;
      return n;
    });
  };
  const setMeta = (jam: number, ubah: MetaJam) => {
    const asli = server?.meta?.[jam] ?? {};
    const baru = { ...metaVal(jam), ...ubah };
    setMetaDraft((d) => {
      const n = { ...d };
      if ((baru.mapel ?? "") === (asli.mapel ?? "") && (baru.guru ?? "") === (asli.guru ?? "")) delete n[jam]; else n[jam] = baru;
      return n;
    });
  };

  const isiKolom = (jam: number, kode: KodeJam | "") => anak.forEach((s) => setSel(s.nis, jam, kode));
  const isiBaris = (nis: string, kode: KodeJam | "") => JAM.forEach((j) => setSel(nis, j, kode));

  const terapkanCepat = (dari: number, sampai: number, kode: KodeIzin) => {
    if (!qNis) { setErr("Pilih siswa untuk aksi cepat"); return; }
    setErr("");
    for (let j = Math.min(dari, sampai); j <= Math.max(dari, sampai); j++) setSel(qNis, j, kode);
  };

  const gantiKonteks = (aksi: () => void) => {
    if (dirty && !window.confirm("Perubahan yang belum disimpan akan dibuang. Lanjutkan?")) return;
    setDraft({}); setMetaDraft({}); setErr(""); aksi();
  };

  const simpan = async () => {
    setBusy(true); setErr("");
    try {
      const sel = Object.entries(draft).map(([k, kode]) => {
        const [nis, jam] = k.split(":");
        return { nis, jam: Number(jam), kode: (kode || null) as KodeJam | null };
      });
      const akhir: Record<string, Record<number, KodeJam>> = {};
      for (const s of anak) for (const j of JAM) { const k = kodeSel(s.nis, j); if (k) (akhir[s.nis] ??= {})[j] = k; }
      const mapelAkhir: Record<number, string | undefined> = {};
      for (const j of JAM) mapelAkhir[j] = metaVal(j).mapel;
      const meta: Record<number, MetaJam | null> = {};
      for (const [j, m] of Object.entries(metaDraft)) meta[Number(j)] = m;
      await simpanPerJam({ tanggal, kelas, sel, meta, akhir, mapelAkhir }, actor);
      simpanDaftar(MAPEL_KEY, Object.values(metaDraft).map((m) => m.mapel));
      simpanDaftar(GURU_KEY, Object.values(metaDraft).map((m) => m.guru));
      setDraft({}); setMetaDraft({});
      notify("Presensi per jam tersimpan");
    } catch (e) { setErr((e as Error).message); }
    finally { setBusy(false); }
  };

  /** Piket: simpan S/I/D + izinMeta (keterangan, surat fisik, nama petugas) dalam satu update. */
  const simpanPiket = async (keterangan: string, suratDiterima: boolean) => {
    if (!tanggalDiJendela(tanggal, today, mundur)) throw new Error(`Tanggal harus antara ${rentangPiket(today, mundur).min} dan ${rentangPiket(today, mundur).max}`);
    const sel = Object.entries(draft).map(([k, kode]) => {
      const [nis, jam] = k.split(":");
      return { nis, jam: Number(jam), kode: (kode || null) as KodeIzin | null };
    });
    const mapelByJam: Record<number, string | undefined> = {};
    for (const j of JAM) mapelByJam[j] = server?.meta?.[j]?.mapel;
    try { await izinPerJamPiket({ tanggal, kelas, sel, mapelByJam, keterangan, suratDiterima }, piketCtx); }
    catch (e) { throw new Error(pesanPiket(e)); }
    setDraft({}); setDialogPiket(false);
    notify("Izin per jam tersimpan");
  };

  const libur = weekday(tanggal) === 0;
  const kandidat = anak.filter((s) => statusRfid(s.nis).masuk && JAM.some((j) => kodeSel(s.nis, j) === "A")).length;

  return (
    <section className="data-page">
      <div className="section-heading">
        <div><p>{piket ? "Izin per jam" : "Presensi per jam"}</p><span>Siswa × jam ke-1..9 · sel kosong = hadir{bisaUbah ? "" : " · hanya lihat"}</span></div>
        {bisaUbah && (
          <div className="heading-actions">
            {dirty && <span className="dirty-pill">Belum disimpan</span>}
            <button className="primary-button" onClick={() => (piket ? setDialogPiket(true) : simpan())} disabled={!dirty || busy}>{busy ? <Spinner /> : <Icon name="check" size={16} />}Simpan</button>
          </div>
        )}
      </div>

      <div className="filter-bar no-print">
        <input type="date" className="text-input auto" value={tanggal} min={piket ? rentangPiket(today, mundur).min : undefined} max={piket ? rentangPiket(today, mundur).max : today} aria-label="Tanggal" onChange={(e) => e.target.value && gantiKonteks(() => setTanggal(e.target.value))} />
        <select value={kelas} aria-label="Kelas" onChange={(e) => gantiKonteks(() => setKelas(e.target.value))}>{kelasList.map((k) => <option key={k}>{k}</option>)}</select>
        <span className="caption-text inline">{formatTanggal(tanggal)}</span>
      </div>

      <div className="jam-legend">
        {(Object.keys(KODE_LABEL) as KodeJam[]).map((k) => <span key={k}><i className={`kode kode-${k}`}>{k}</i>{KODE_LABEL[k]}</span>)}
        <span><i className="kode kode-H">·</i>Hadir (kosong)</span>
        {wakaUbah && <small>Klik sel untuk memutar: kosong → A → I → S → D</small>}
        {piket && <small>Klik sel: kosong → I → S → D. Sel A (gembok) hanya dapat diubah Waka.</small>}
      </div>

      {piket && kelas && anak.length > 0 && (
        <div className="quick-piket no-print" aria-label="Aksi cepat piket">
          <select className="text-input auto" value={qNis} onChange={(e) => setQNis(e.target.value)} aria-label="Siswa (aksi cepat)">
            <option value="">Pilih siswa…</option>{anak.map((s) => <option key={s.nis} value={s.nis}>{s.nama}</option>)}
          </select>
          <span className="quick-group">
            <label>Pulang awal mulai jam ke-<select className="text-input auto" value={qMulai} onChange={(e) => setQMulai(Number(e.target.value))} aria-label="Mulai jam ke-">{JAM.map((j) => <option key={j} value={j}>{j}</option>)}</select></label>
            <select className="text-input auto" value={qKode} onChange={(e) => setQKode(e.target.value as KodeIzin)} aria-label="Jenis pulang awal">
              {(tanggal > today ? ["I"] : ["S", "I"]).map((k) => <option key={k} value={k}>{k === "S" ? "Sakit" : "Izin"}</option>)}
            </select>
            <button type="button" className="secondary-button sm" onClick={() => terapkanCepat(qMulai, 9, tanggal > today ? "I" : qKode)}>Terapkan pulang awal</button>
          </span>
          <span className="quick-group">
            <label>Dispensasi jam <select className="text-input auto" value={qMulai} onChange={(e) => setQMulai(Number(e.target.value))} aria-label="Dispensasi dari jam">{JAM.map((j) => <option key={j} value={j}>{j}</option>)}</select></label>
            <label>–<select className="text-input auto" value={qSampai} onChange={(e) => setQSampai(Number(e.target.value))} aria-label="Dispensasi sampai jam">{JAM.map((j) => <option key={j} value={j}>{j}</option>)}</select></label>
            <button type="button" className="secondary-button sm" onClick={() => terapkanCepat(qMulai, qSampai, "D")}>Terapkan dispensasi</button>
          </span>
        </div>
      )}
      {libur && <div className="notice warn"><Icon name="warning" size={17} /><span>Hari Minggu — libur.</span></div>}
      {kandidat > 0 && <div className="notice warn"><Icon name="alert" size={17} /><span><b>{kandidat} siswa</b> sudah tap masuk tetapi ditandai Alfa (A) pada jam tertentu — kandidat bolos jam pelajaran (baris berwarna kuning).</span></div>}
      {err && <div className="login-error-box" role="alert"><Icon name="warning" size={17} /><div><span>{err}</span></div></div>}
      {live.error && <div className="notice warn" role="alert"><Icon name="warning" size={17} /><span>Gagal memuat data per jam ({live.error}).</span></div>}

      {!kelas ? <Empty icon="users" title="Belum ada kelas" text="Data siswa belum diisi." /> : anak.length === 0 ? <Empty icon="users" title="Tidak ada siswa di kelas ini" /> : (
        <div className="jam-scroll">
          <table className="jam-table">
            <thead>
              <tr>
                <th className="sticky-col">Siswa</th>
                <th>Tap hari ini</th>
                {JAM.map((j) => (
                  <th key={j} className="jam-head">
                    <b>Jam {j}</b>
                    <input className="mini-input" list="mapel-list" placeholder="Mapel" value={metaVal(j).mapel ?? ""} maxLength={60} disabled={!wakaUbah}
                      onChange={(e) => setMeta(j, { mapel: e.target.value })} aria-label={`Mapel jam ${j}`} />
                    <input className="mini-input" list="guru-list" placeholder="Guru" value={metaVal(j).guru ?? ""} maxLength={60} disabled={!wakaUbah}
                      onChange={(e) => setMeta(j, { guru: e.target.value })} aria-label={`Guru jam ${j}`} />
                    {wakaUbah && (
                      <select className="mini-select" value="" aria-label={`Isi semua jam ${j}`} onChange={(e) => e.target.value !== "" && isiKolom(j, e.target.value === "-" ? "" : (e.target.value as KodeJam))}>
                        <option value="">Isi semua…</option>
                        {(Object.keys(KODE_LABEL) as KodeJam[]).map((k) => <option key={k} value={k}>{k} · {KODE_LABEL[k]}</option>)}
                        <option value="-">Kosongkan</option>
                      </select>
                    )}
                  </th>
                ))}
                {wakaUbah && <th>Isi baris</th>}
              </tr>
            </thead>
            <tbody>
              {anak.map((s) => {
                const st = statusRfid(s.nis);
                const bolos = st.masuk && JAM.some((j) => kodeSel(s.nis, j) === "A");
                return (
                  <tr key={s.nis} className={bolos ? "bolos" : ""}>
                    <td className="sticky-col"><b>{s.nama}</b><small>{s.nis}</small></td>
                    <td><span className={`rfid-tag rfid-${st.tone}`}>{st.teks}</span></td>
                    {JAM.map((j) => {
                      const k = kodeSel(s.nis, j);
                      const ubah = `${s.nis}:${j}` in draft;
                      return (
                        <td key={j} className={`sel ${ubah ? "ubah" : ""}`}>
                          {piket && k === "A" ? (
                            <button type="button" disabled className="kode kode-A terkunci" title="Diisi Waka" aria-label={`${s.nama} jam ${j}: Alfa (terkunci, diisi Waka)`}><Icon name="lock" size={13} /></button>
                          ) : (
                            <button type="button" disabled={!bisaUbah} className={`kode kode-${k || "H"}`} aria-label={`${s.nama} jam ${j}: ${k ? KODE_LABEL[k] : "hadir"}`}
                              onClick={() => setSel(s.nis, j, berikutnya(k, siklus))}>{k || "·"}</button>
                          )}
                        </td>
                      );
                    })}
                    {wakaUbah && (
                      <td>
                        <select className="mini-select" value="" aria-label={`Isi baris ${s.nama}`} onChange={(e) => e.target.value !== "" && isiBaris(s.nis, e.target.value === "-" ? "" : (e.target.value as KodeJam))}>
                          <option value="">…</option>
                          {(Object.keys(KODE_LABEL) as KodeJam[]).map((k) => <option key={k} value={k}>{k}</option>)}
                          <option value="-">Kosong</option>
                        </select>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {dialogPiket && (
        <KeteranganDialog judul="Simpan izin per jam" subjudul={`${Object.keys(draft).length} perubahan · ${kelas} · ${formatTanggal(tanggal, false)}`} tombol="Simpan" onClose={() => setDialogPiket(false)} onSubmit={simpanPiket} />
      )}
      <datalist id="mapel-list">{bacaDaftar(MAPEL_KEY).map((m) => <option key={m} value={m} />)}</datalist>
      <datalist id="guru-list">{bacaDaftar(GURU_KEY).map((m) => <option key={m} value={m} />)}</datalist>
    </section>
  );
}
