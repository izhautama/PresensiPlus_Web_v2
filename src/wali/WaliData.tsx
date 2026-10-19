import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { equalTo, onValue, orderByValue, query } from "firebase/database";
import { useAuth } from "../auth/AuthContext";
import { AdminDataCtx, type AdminDataValue, type TodayEntry } from "../admin/AdminData";
import { gabungTap, type ManualTap } from "../lib/manual";
import { kelasBinaan, decodeKelas, type PetaKelasWali } from "../lib/wali";
import { todayWIB } from "../lib/time";
import type { DayRecord, ScheduleRow, StudentRow } from "../lib/types";
import { r, useLive, useNow, useServerClock } from "../services/db";

/** Kelas binaan wali yang sedang dipilih (wali boleh memegang lebih dari satu kelas). */
type KelasCtx = { kelas: string[]; aktif: string | null; setAktif: (k: string) => void; memuat: boolean };
const WaliKelasCtx = createContext<KelasCtx>({ kelas: [], aktif: null, setAktif: () => {}, memuat: true });
export const useKelasWali = () => useContext(WaliKelasCtx);

type Profil = { nama: string; kelas: string };

/**
 * Sumber data panel wali: menyediakan konteks AdminData yang SAMA agar halaman piket/waka dapat dipakai ulang, tetapi hanya berisi
 * siswa kelas binaan. Wali tidak boleh membaca config/students, log, atau izin: daftar siswa dari query siswaKelas
 * (orderByValue + equalTo kelas yang dibina), profil per siswa, dan presensi HARI INI per siswa (attendance/{nis}/{tgl}).
 */
export function WaliDataProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const uid = session?.role === "wali" ? session.uid : null;
  const { offset, siap: jamSiap } = useServerClock(); // tanggal mengikuti jam SERVER
  const now = useNow(15000, offset);
  const today = todayWIB(now);
  const peta = useLive<PetaKelasWali>(uid ? `staff/${uid}` : null);
  const scheduleLive = useLive<Record<string, ScheduleRow>>("config/schedule");
  const kelas = useMemo(() => kelasBinaan(peta.data), [peta.data]);
  const [pilih, setPilih] = useState<string | null>(null);
  const aktif = pilih && kelas.includes(pilih) ? pilih : kelas[0] ?? null;

  const [nisList, setNisList] = useState<string[] | null>(null);
  const [profil, setProfil] = useState<Record<string, Profil>>({});
  const [hariIni, setHariIni] = useState<Record<string, DayRecord | null>>({});
  const [manual, setManual] = useState<Record<string, Omit<ManualTap, "oleh" | "ts" | "hariKe"> | null>>({});
  const [galat, setGalat] = useState<string[]>([]);

  useEffect(() => {
    setNisList(null);
    if (!aktif) return;
    return onValue(query(r("siswaKelas"), orderByValue(), equalTo(aktif)),
      (s) => setNisList(Object.keys((s.val() ?? {}) as Record<string, string>).sort()),
      (e) => { setGalat((x) => [...x, e.message]); setNisList([]); });
  }, [aktif]);

  const kunciNis = (nisList ?? []).join(",");
  useEffect(() => {
    setProfil({}); setHariIni({}); setManual({});
    const stops: (() => void)[] = [];
    const gagal = (e: Error) => setGalat((x) => (x.includes(e.message) ? x : [...x, e.message]));
    for (const nis of nisList ?? []) {
      stops.push(onValue(r(`profiles/${nis}`), (s) => setProfil((x) => ({ ...x, [nis]: s.val() as Profil })), gagal));
      stops.push(onValue(r(`attendance/${nis}/${today}`), (s) => setHariIni((x) => ({ ...x, [nis]: s.val() as DayRecord | null })), gagal));
      stops.push(onValue(r(`manualTapByStudent/${nis}/${today}`), (s) => setManual((x) => ({ ...x, [nis]: s.val() })), gagal));
    }
    return () => stops.forEach((f) => f());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kunciNis, today]);

  const value = useMemo<AdminDataValue>(() => {
    const students: StudentRow[] = (nisList ?? [])
      .filter((n) => profil[n])
      .map((nis) => ({ uid: nis, nis, nama: profil[nis].nama, kelas: aktif ? decodeKelas(aktif) : profil[nis].kelas }))
      .sort((a, b) => a.nama.localeCompare(b.nama));
    const byNis: Record<string, TodayEntry> = {};
    const izinToday: Record<string, never> = {} as never;
    for (const s of students) {
      const rec = hariIni[s.nis];
      const e: TodayEntry = {};
      if (rec?.status) e.masuk = { jam: rec.masuk ?? "", nis: s.nis, status: rec.status };
      if (rec?.pulang) e.pulang = { jam: rec.pulang, nis: s.nis, status: "Pulang" };
      if (rec?.ket) e.ket = rec.ket;
      const m = manual[s.nis];
      if (m) {
        const g = gabungTap({ masuk: e.masuk, pulang: e.pulang }, { ...m, oleh: "", ts: 0, hariKe: 0 } as ManualTap);
        if (g.masuk && !e.masuk) e.masuk = { jam: g.masuk.jam, nis: s.nis, status: g.masuk.status, manual: g.masuk.manual };
        if (g.pulang && !e.pulang) e.pulang = { jam: g.pulang.jam, nis: s.nis, status: "Pulang", manual: g.pulang.manual };
        e.manual = g.manual;
      }
      byNis[s.nis] = e;
    }
    const siap = nisList !== null && (nisList.length === 0 || (nisList.every((n) => profil[n] && n in hariIni && n in manual)));
    return {
      ready: jamSiap && !peta.loading && !scheduleLive.loading && siap,
      selisihJamMs: offset,
      jamSiap,
      buktiSiap: siap,
      aktifSejak: {},
      today, now, students, studentMap: {}, schedule: Object.values(scheduleLive.data ?? {}),
      log: {}, izinToday, manualToday: {}, byNis, device: null, online: false, serverNow: () => Date.now() + offset,
      kelasList: kelas.map(decodeKelas).sort(),
      errors: [peta.error, scheduleLive.error, ...galat].filter((e): e is string => Boolean(e)),
    };
  }, [nisList, profil, hariIni, manual, aktif, peta, scheduleLive, kelas, galat, today, now, offset, jamSiap]);

  const kelasCtx = useMemo<KelasCtx>(() => ({ kelas, aktif, setAktif: setPilih, memuat: peta.loading }), [kelas, aktif, peta.loading]);
  return (
    <WaliKelasCtx.Provider value={kelasCtx}>
      <AdminDataCtx.Provider value={value}>{children}</AdminDataCtx.Provider>
    </WaliKelasCtx.Provider>
  );
}
