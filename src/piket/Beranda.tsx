import { useMemo, useState } from "react";
import { get } from "firebase/database";
import Icon from "../components/Icon";
import StudentPicker from "../components/StudentPicker";
import { Empty, Field, StatusBadge } from "../components/ui";
import { useAdminData } from "../admin/AdminData";
import { useToast } from "../admin/AdminLayout";
import { initials, toneOf } from "../lib/attendance";
import { opsiKet, rentangPiket, tanggalDiJendela, type KetPiket } from "../lib/piket";
import { formatTanggal, namaHari, weekday } from "../lib/time";
import { batasJam } from "../lib/attendance";
import type { StudentRow } from "../lib/types";
import { r } from "../services/db";
import { catatManual } from "../services/manual";
import { hapusIzinHarianPiket, izinHarianPiket, pesanPiket } from "../services/piket";
import KeteranganDialog from "./KeteranganDialog";
import { ManualDialog } from "./PresensiManual";
import { useKalenderOtomatis } from "../kesiswaan/useKalender";
import { usePiketCtx, usePiketMundur } from "./useJendela";

type Aksi = { siswa?: StudentRow; ket: KetPiket; bebas: boolean };

/** Beranda piket: siswa belum tap hari ini + aksi cepat Izin / Sakit / Dispensasi seharian. */
export default function Beranda() {
  const { students, byNis, kelasList, today, now, schedule, ready, serverNow } = useAdminData();
  const mundur = usePiketMundur();
  useKalenderOtomatis(); // piket juga menghitung hari efektif (log aktivitas 'hitung-kalender' wajib untuk piket)
  const ctx = usePiketCtx();
  const notify = useToast();
  const libur = weekday(today) === 0;
  const [kelas, setKelas] = useState("");
  const [q, setQ] = useState("");
  const [aksi, setAksi] = useState<Aksi | null>(null);
  const [manual, setManual] = useState<StudentRow | null>(null);

  const bukanMasuk = useMemo(() => students.filter((s) => !byNis[s.nis]?.masuk), [students, byNis]);
  const belumTap = useMemo(() => bukanMasuk.filter((s) => !byNis[s.nis]?.ket), [bukanMasuk, byNis]);
  const berketerangan = useMemo(() => students.filter((s) => byNis[s.nis]?.ket), [students, byNis]);
  const nIzin = berketerangan.filter((s) => byNis[s.nis]?.ket !== "Dispensasi").length;
  const nDisp = berketerangan.filter((s) => byNis[s.nis]?.ket === "Dispensasi").length;

  const saring = (daftar: StudentRow[]) => {
    const qq = q.trim().toLowerCase();
    return daftar.filter((s) => (!kelas || s.kelas === kelas) && (!qq || `${s.nama} ${s.nis}`.toLowerCase().includes(qq)));
  };
  const daftar = libur ? [] : saring(belumTap);
  const sudah = saring(berketerangan);

  const hapus = async (s: StudentRow) => {
    try { await hapusIzinHarianPiket(today, s.nis); notify(`Keterangan ${s.nama} dihapus`); }
    catch (e) { notify(pesanPiket(e), "err"); }
  };

  return (
    <section className="data-page">
      <div className="section-heading">
        <div><p>Beranda piket</p><span>{formatTanggal(today)} · izin & dispensasi seharian untuk siswa yang tidak masuk</span></div>
        <div className="heading-actions"><button className="secondary-button" onClick={() => setAksi({ ket: "Izin", bebas: true })}>Izin tanggal lain / terencana</button></div>
      </div>

      <section className="stats-grid">
        <article className="stat-card"><div className="stat-icon coral"><Icon name="clock" /></div><div><p>Belum tap</p><strong data-testid="belum-tap">{libur ? 0 : belumTap.length}</strong><span className="trend neutral">{libur ? "Hari Minggu — libur" : `dari ${students.length} siswa`}</span></div></article>
        <article className="stat-card"><div className="stat-icon amber"><Icon name="file" /></div><div><p>Izin / sakit hari ini</p><strong>{nIzin}</strong><span className="trend neutral">berketerangan</span></div></article>
        <article className="stat-card"><div className="stat-icon teal"><Icon name="check" /></div><div><p>Dispensasi hari ini</p><strong>{nDisp}</strong><span className="trend neutral">dihitung hadir</span></div></article>
      </section>

      <div className="filter-bar">
        <div className="search search-inline"><Icon name="search" size={18} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari nama atau NIS..." aria-label="Cari siswa" /></div>
        <select value={kelas} onChange={(e) => setKelas(e.target.value)} aria-label="Filter kelas"><option value="">Semua kelas</option>{kelasList.map((k) => <option key={k}>{k}</option>)}</select>
      </div>

      <div className="table-panel">
        <div className="table-head piket-grid"><span>Belum tap hari ini</span><span>Kelas</span><span className="ta-right">Aksi</span></div>
        {!ready ? null : libur ? <Empty icon="calendar" title="Hari Minggu — libur" text="Tidak ada presensi hari ini." /> : daftar.length === 0 ? (
          <Empty icon="check" title="Tidak ada siswa yang belum tap" text="Semua siswa sudah tap atau sudah berketerangan." />
        ) : daftar.map((s) => (
          <div className="table-row piket-grid" key={s.nis} data-nis={s.nis}>
            <span className="student-cell"><i className={`avatar ${toneOf(s.nis)}`}>{initials(s.nama)}</i><span><b>{s.nama}</b><small>NIS {s.nis}</small></span></span>
            <span>{s.kelas}</span>
            <span className="aksi-cell">
              <button className="secondary-button sm" onClick={() => setAksi({ siswa: s, ket: "Izin", bebas: false })}>Izin</button>
              <button className="secondary-button sm" onClick={() => setAksi({ siswa: s, ket: "Sakit", bebas: false })}>Sakit</button>
              <button className="secondary-button sm" onClick={() => setAksi({ siswa: s, ket: "Dispensasi", bebas: false })}>Dispensasi</button>
              <button className="secondary-button sm" title="Siswa hadir tetapi tap alat tidak ada (KTM lupa/hilang, dsb.)" onClick={() => setManual(s)}>Hadir manual</button>
            </span>
          </div>
        ))}
      </div>

      {sudah.length > 0 && (
        <article className="panel master-group" style={{ marginTop: 16 }}>
          <div className="panel-header"><div><p className="panel-title">Sudah berketerangan hari ini</p><span>Izin/sakit/dispensasi yang tercatat</span></div></div>
          <div className="simple-list">
            {sudah.map((s) => (
              <div key={s.nis}><b>{s.nama}</b><small>{s.kelas}</small><StatusBadge status={byNis[s.nis]?.ket ?? ""} />
                <button className="ghost-button" aria-label={`Hapus keterangan ${s.nama}`} onClick={() => hapus(s)}>Hapus</button></div>
            ))}
          </div>
        </article>
      )}

      {manual && (
        <ManualDialog dialog={{ s: manual, mode: "masuk" }} tanggal={today} today={today} now={now} schedule={schedule} onClose={() => setManual(null)}
          onOk={async (a) => {
            const status = await catatManual({ tanggal: today, nis: manual.nis, kelas: manual.kelas, ...a, sekarangMs: serverNow(), hariIni: today, awalJendelaMasuk: batasJam(schedule, manual.kelas, namaHari(today)).Masuk[0] }, ctx, schedule);
            notify(`${manual.nama}: hadir manual (${status}) tercatat`);
            setManual(null);
          }} />
      )}

      {aksi && <IzinHarianDialog aksi={aksi} mundur={mundur} onClose={() => setAksi(null)} onOk={async (a) => {
        await izinHarianPiket(a, ctx);
        notify(`${students.find((s) => s.nis === a.nis)?.nama ?? a.nis}: ${a.ket} tercatat`);
        setAksi(null);
      }} />}
    </section>
  );
}

function IzinHarianDialog({ aksi, mundur, onClose, onOk }: {
  aksi: Aksi; mundur: number; onClose: () => void;
  onOk: (a: { tanggal: string; nis: string; ket: KetPiket; keterangan: string; suratDiterima: boolean }) => Promise<void>;
}) {
  const { students, today } = useAdminData();
  const [pilih, setPilih] = useState<string[]>(aksi.siswa ? [aksi.siswa.nis] : []);
  const [tanggal, setTanggal] = useState(today);
  const [ket, setKet] = useState<KetPiket>(aksi.ket);
  const { min, max } = rentangPiket(today, mundur);
  const opsi = opsiKet(tanggal, today);
  const ketAktif = opsi.includes(ket) ? ket : opsi[0];
  const siswa = students.find((s) => s.nis === pilih[0]);

  return (
    <KeteranganDialog judul={aksi.bebas ? "Izin tanggal lain / terencana" : ketAktif} onClose={onClose}
      subjudul={siswa ? `${siswa.nama} · ${siswa.kelas}` : "Pilih siswa dan tanggal"}
      onSubmit={async (keterangan, suratDiterima) => {
        if (!siswa) throw new Error("Pilih siswa terlebih dahulu");
        if (!tanggalDiJendela(tanggal, today, mundur)) throw new Error(`Tanggal harus antara ${min} dan ${max}`);
        // Izin/Sakit tidak berlaku bila siswa sudah tap masuk pada tanggal tsb; Dispensasi boleh (siswa tap lalu berangkat lomba)
        if (ketAktif !== "Dispensasi") {
          const sudahTap = Object.entries(((await get(r(`log/${tanggal}`))).val() ?? {}) as Record<string, { nis: string }>).some(([k, e]) => k.endsWith("_M") && e.nis === siswa.nis);
          if (sudahTap) throw new Error("Siswa sudah tap masuk pada tanggal tersebut; Izin/Sakit tidak berlaku.");
        }
        try { await onOk({ tanggal, nis: siswa.nis, ket: ketAktif, keterangan, suratDiterima }); }
        catch (e) { throw new Error(pesanPiket(e)); }
      }}>
      {aksi.bebas && (
        <>
          <Field label="Siswa"><StudentPicker students={students} value={pilih} onChange={setPilih} /></Field>
          <div className="form-grid">
            <Field label="Tanggal" hint={`Maksimal ${mundur} hari ke belakang dan 7 hari ke depan.`}>
              <input className="text-input" type="date" min={min} max={max} value={tanggal} onChange={(e) => e.target.value && setTanggal(e.target.value)} />
            </Field>
            <Field label="Jenis" hint={tanggal > today ? "Terencana: hanya Izin atau Dispensasi." : undefined}>
              <select className="text-input" value={ketAktif} onChange={(e) => setKet(e.target.value as KetPiket)}>{opsi.map((k) => <option key={k}>{k}</option>)}</select>
            </Field>
          </div>
        </>
      )}
    </KeteranganDialog>
  );
}
