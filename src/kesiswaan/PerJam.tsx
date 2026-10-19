import { useEffect, useMemo, useState } from "react";
import { useBlocker, useSearchParams } from "react-router";
import Icon from "../components/Icon";
import { Empty, Spinner } from "../components/ui";
import { useAdminData } from "../admin/AdminData";
import { usePanelMode, useToast } from "../admin/AdminLayout";
import { gabungTap, hitungStatusJadwal, type ManualTap } from "../lib/manual";
import type { DayRecord, KetHarian, LogEntry } from "../lib/types";
import { JAM, KODE_LABEL, SIKLUS_WAKA, berikutnya, berikutnyaPiket, encodeKelas, pengisiSel, selATerkunciPiket, type KodeJam, type LessonsKelas, type MetaJam } from "../lib/perjam";
import { kodeTampil, turunanSiswa } from "../lib/turunan";
import type { RingkasanHari } from "../lib/hariEfektif";
import { Modal } from "../components/ui";
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
  const { students, kelasList, today, schedule, now, aktifSejak } = useAdminData();
  const [qs] = useSearchParams();
  const mode = usePanelMode();
  const piket = mode === "piket";
  const wakaUbah = mode === "waka";
  const bisaUbah = wakaUbah || piket;
  const mundur = usePiketMundur();
  const piketCtx = usePiketCtx();
  const actor = useActor();
  const notify = useToast();
  const tglQuery = qs.get("tanggal");
  const [tanggal, setTanggal] = useState(tglQuery && /^\d{4}-\d{2}-\d{2}$/.test(tglQuery) && tglQuery <= today ? tglQuery : today);
  const [kelas, setKelas] = useState(qs.get("kelas") ?? "");
  const [hanyaAPiket, setHanyaAPiket] = useState(qs.get("a") === "piket"); // waka: hanya baris yang memuat A dari piket
  const [konfirmAlfa, setKonfirmAlfa] = useState(false);
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
  const hariLive = useLive<RingkasanHari>(`kalenderEfektif/${tanggal}`);
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
    // presensi manual: masuk = bukti PALING AWAL; pulang: alat menang, manual mengisi yang kosong
    const kelasNis = Object.fromEntries(students.map((s) => [s.nis, s.kelas]));
    for (const [nis, tapM] of Object.entries(manualLive.data ?? {})) {
      const slot = (m[nis] ??= {});
      const g = gabungTap({ masuk: slot.masuk, pulang: slot.pulang }, tapM, kelasNis[nis] ? hitungStatusJadwal(schedule, kelasNis[nis], tanggal) : undefined);
      if (g.masuk && (!slot.masuk || g.manual?.dipakai.includes("masuk"))) slot.masuk = { jam: g.masuk.jam, nis, status: g.masuk.status, manual: g.masuk.manual };
      else if (g.masuk && slot.masuk && g.masuk.status !== slot.masuk.status) slot.masuk = { ...slot.masuk, status: g.masuk.status };
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

  // Kode TURUNAN dari status harian (Alfa seharian -> A; Izin/Sakit/Dispensasi seharian -> I/S/D): dihitung saat tampil, TIDAK ditulis ke database.
  const alatHari = useMemo(() => {
    const m: Record<string, DayRecord> = {};
    for (const [key, e] of Object.entries(logLive.data ?? {})) {
      const rec = (m[e.nis] ??= {});
      if (key.endsWith("_M")) { rec.masuk = e.jam; rec.status = e.status === "Terlambat" ? "Terlambat" : "Hadir"; } else rec.pulang = e.jam;
    }
    return m;
  }, [logLive.data]);
  const petaHari = useMemo(() => (hariLive.data ? { [tanggal]: hariLive.data } : {}), [hariLive.data, tanggal]);
  const turunan = useMemo(() => Object.fromEntries(anak.map((s) => [s.nis, turunanSiswa({
    tanggal, kelas: s.kelas, schedule, hariEfektif: petaHari, aktifSejak: aktifSejak[s.nis], now,
    alat: alatHari[s.nis] ?? null, manual: manualLive.data?.[s.nis] ?? null, izin: izinLive.data?.[s.nis] ?? null,
  })])), [anak, tanggal, schedule, petaHari, aktifSejak, now, alatHari, manualLive.data, izinLive.data]);

  const kodeSel = (nis: string, jam: number): KodeJam | "" => {
    const k = `${nis}:${jam}`;
    return k in draft ? draft[k] : (server?.absen?.[nis]?.[jam] ?? "");
  };
  const metaVal = (jam: number): MetaJam => metaDraft[jam] ?? server?.meta?.[jam] ?? {};

  // Piket (v2.3.1): hari ini kosong → A → I → S → D; tanggal lampau kosong → I → S → D (A terkunci); mendatang kosong → I → D.
  // Sel A milik Waka (atau tanpa penanda) selalu terkunci bagi piket; A milik piket hanya dapat diubah pada hari yang sama.
  const pengisiLihat = (nis: string, jam: number) => (piket && `${nis}:${jam}` in draft ? "piket" as const : pengisiSel(server?.absenOleh, nis, jam));
  const klikSel = (nis: string, jam: number, k: KodeJam | "") => {
    if (turunan[nis]) return; // baris turunan terkunci untuk semua peran
    if (piket) {
      const nx = berikutnyaPiket(k, { pengisi: pengisiLihat(nis, jam), tanggal, hariIni: today });
      if (nx !== null) setSel(nis, jam, nx);
    } else setSel(nis, jam, berikutnya(k, SIKLUS_WAKA));
  };
  const setSel = (nis: string, jam: number, kode: KodeJam | "") => {
    if (turunan[nis]) return; // baris turunan tidak dapat diisi (nilai diturunkan dari status harian)
    const asli = server?.absen?.[nis]?.[jam] ?? "";
    // rules juga menolak; ini hanya mencegah draf yang pasti ditolak
    if (piket && (selATerkunciPiket(asli, pengisiSel(server?.absenOleh, nis, jam), tanggal, today) || (kode === "A" && tanggal !== today))) return;
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

  /** Piket: simpan perubahan. S/I/D + izinMeta (keterangan, surat fisik, nama petugas); A (hari ini) tanpa keterangan, dengan penanda "piket". */
  const simpanPiket = async (keterangan: string, suratDiterima: boolean) => {
    if (!tanggalDiJendela(tanggal, today, mundur)) throw new Error(`Tanggal harus antara ${rentangPiket(today, mundur).min} dan ${rentangPiket(today, mundur).max}`);
    const sel = Object.entries(draft).map(([k, kode]) => {
      const [nis, jam] = k.split(":");
      return { nis, jam: Number(jam), kode: (kode || null) as KodeIzin | "A" | null, lama: (server?.absen?.[nis]?.[Number(jam)] ?? "") as KodeJam | "" };
    });
    const mapelByJam: Record<number, string | undefined> = {};
    for (const j of JAM) mapelByJam[j] = server?.meta?.[j]?.mapel;
    try { await izinPerJamPiket({ tanggal, kelas, sel, mapelByJam, keterangan, suratDiterima }, piketCtx); }
    catch (e) { throw new Error(pesanPiket(e)); }
    setDraft({}); setDialogPiket(false);
    notify("Presensi per jam tersimpan");
  };
  // Keterangan WAJIB bila ada perubahan S/I/D (termasuk mengosongkannya); perubahan A saja (hari ini) tidak berketerangan.
  const perluKeterangan = Object.entries(draft).some(([k, kode]) => {
    const [nis, jam] = k.split(":");
    const lama = server?.absen?.[nis]?.[Number(jam)] ?? "";
    return !(kode === "A" || (lama === "A" && kode === ""));
  });
  const adaAlfaBaru = Object.values(draft).some((k) => k === "A");
  const alfaSudahDikonfirmasi = () => { try { return sessionStorage.getItem("alfa-jam-konfirmasi") === "1"; } catch { return false; } };
  const lanjutSimpanPiket = async () => {
    if (perluKeterangan) { setDialogPiket(true); return; }
    setBusy(true); setErr("");
    try { await simpanPiket("", false); } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };
  const mulaiSimpanPiket = () => {
    if (adaAlfaBaru && !alfaSudahDikonfirmasi()) { setKonfirmAlfa(true); return; } // konfirmasi ringan sekali per sesi
    void lanjutSimpanPiket();
  };

  const libur = weekday(tanggal) === 0;
  const jamPiket = (nis: string, jam: number) => {
    const info = server?.absenInfo?.[nis]?.[jam];
    return info ? `${info.petugas}, ${new Date(info.ts + 7 * 3_600_000).toISOString().slice(11, 16)} WIB` : "petugas piket";
  };
  const adaAPiket = (nis: string) => JAM.some((j) => server?.absen?.[nis]?.[j] === "A" && pengisiSel(server?.absenOleh, nis, j) === "piket" && server?.absenOleh?.[nis]?.[j] === "piket");
  const tampil = hanyaAPiket ? anak.filter((s) => adaAPiket(s.nis)) : anak;
  const kandidat = anak.filter((s) => statusRfid(s.nis).masuk && JAM.some((j) => kodeSel(s.nis, j) === "A")).length;

  return (
    <section className="data-page">
      <div className="section-heading">
        <div><p>{piket ? "Izin per jam" : "Presensi per jam"}</p><span>Siswa × jam ke-1..9 · sel kosong = hadir{bisaUbah ? "" : " · hanya lihat"}</span></div>
        {bisaUbah && (
          <div className="heading-actions">
            {dirty && <span className="dirty-pill">Belum disimpan</span>}
            <button className="primary-button" onClick={() => (piket ? mulaiSimpanPiket() : simpan())} disabled={!dirty || busy}>{busy ? <Spinner /> : <Icon name="check" size={16} />}Simpan</button>
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
        {wakaUbah && <small>Klik sel untuk memutar: kosong → A → I → S → D. Titik oranye = A diisi guru piket (Waka dapat merevisi kapan saja).</small>}
        {piket && (tanggal === today
          ? <small data-testid="bantu-piket">Hari ini: klik sel kosong → A → I → S → D. A (Alfa) hanya untuk hari ini; koreksi hari sebelumnya oleh Waka. Sel bergembok tidak dapat diubah (diisi Waka atau turunan harian).</small>
          : <small data-testid="bantu-piket">Tanggal ini: klik sel kosong → I → S → D. A hanya dapat diisi pada hari ini; sel A bergembok diubah oleh Waka.</small>)}
        <span><i className="kode kode-A turunan">A</i>Baris berlabel “seharian (otomatis)” = turunan status harian, terkunci</span>
        {wakaUbah && (
          <label className="check-inline"><input type="checkbox" checked={hanyaAPiket} onChange={(e) => setHanyaAPiket(e.target.checked)} aria-label="Hanya A dari piket" />Hanya baris dengan A dari piket</label>
        )}
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
              {tampil.map((s) => {
                const st = statusRfid(s.nis);
                const t = turunan[s.nis];
                const bolos = st.masuk && JAM.some((j) => kodeSel(s.nis, j) === "A");
                return (
                  <tr key={s.nis} className={bolos ? "bolos" : ""}>
                    <td className="sticky-col"><b>{s.nama}</b><small>{s.nis}</small>{t && <small className="turunan-label" data-testid="label-turunan">{t.label}</small>}</td>
                    <td><span className={`rfid-tag rfid-${st.tone}`}>{st.teks}</span></td>
                    {JAM.map((j) => {
                      const tersimpan = kodeSel(s.nis, j);
                      const k = kodeTampil(t, tersimpan);
                      const ubah = `${s.nis}:${j}` in draft;
                      const pengisi = pengisiLihat(s.nis, j);
                      const dariPiket = !t && k === "A" && pengisi === "piket";
                      return (
                        <td key={j} className={`sel ${ubah ? "ubah" : ""}`}>
                          {t ? (
                            <button type="button" disabled className={`kode kode-${t.kode} terkunci turunan`} title={t.label} aria-label={`${s.nama} jam ${j}: ${KODE_LABEL[t.kode]} seharian (otomatis, terkunci)`}>{t.kode}</button>
                          ) : piket && selATerkunciPiket(k, pengisi, tanggal, today) ? (
                            <button type="button" disabled className="kode kode-A terkunci" title={pengisi === "waka" ? "Diisi Waka" : "Alfa piket pada tanggal lampau: hanya Waka yang dapat mengubah"} aria-label={`${s.nama} jam ${j}: Alfa (terkunci, ${pengisi === "waka" ? "diisi Waka" : "tanggal lampau"})`}><Icon name="lock" size={13} /></button>
                          ) : (
                            <button type="button" disabled={!bisaUbah} className={`kode kode-${k || "H"} ${dariPiket ? "dari-piket" : ""}`}
                              title={dariPiket ? `Diisi piket: ${jamPiket(s.nis, j)}` : undefined}
                              aria-label={`${s.nama} jam ${j}: ${k ? KODE_LABEL[k] : "hadir"}${dariPiket ? " (diisi piket)" : ""}`}
                              onClick={() => klikSel(s.nis, j, k)}>{k || "·"}{dariPiket && <i className="dot-piket" data-testid="penanda-piket" />}</button>
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
      {konfirmAlfa && (
        <Modal title="Isi Alfa per jam?" subtitle="Alfa = tidak hadir tanpa keterangan" onClose={() => setKonfirmAlfa(false)}>
          <div className="modal-form" data-testid="konfirmasi-alfa">
            <p>Alfa = tidak hadir tanpa keterangan. Lanjutkan?</p>
            <p className="modal-note">Alfa per jam hanya untuk hari ini. Kekeliruan dikoreksi oleh Waka.</p>
            <div className="modal-actions">
              <button className="secondary-button" onClick={() => setKonfirmAlfa(false)}>Batal</button>
              <button className="primary-button" onClick={() => { try { sessionStorage.setItem("alfa-jam-konfirmasi", "1"); } catch { /* abaikan */ } setKonfirmAlfa(false); void lanjutSimpanPiket(); }}>Lanjutkan</button>
            </div>
          </div>
        </Modal>
      )}
      {dialogPiket && (
        <KeteranganDialog judul="Simpan izin per jam" subjudul={`${Object.keys(draft).length} perubahan · ${kelas} · ${formatTanggal(tanggal, false)}`} tombol="Simpan" onClose={() => setDialogPiket(false)} onSubmit={simpanPiket} />
      )}
      <datalist id="mapel-list">{bacaDaftar(MAPEL_KEY).map((m) => <option key={m} value={m} />)}</datalist>
      <datalist id="guru-list">{bacaDaftar(GURU_KEY).map((m) => <option key={m} value={m} />)}</datalist>
    </section>
  );
}
