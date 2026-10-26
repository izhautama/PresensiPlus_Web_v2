import { useMemo, type ReactNode } from "react";
import { AdminDataCtx, type AdminDataValue } from "../admin/AdminData";
import { decodeKelas } from "../lib/wali";
import { todayWIB } from "../lib/time";
import type { ScheduleRow, StudentRow } from "../lib/types";
import { useLive, useNow, useServerClock } from "../services/db";

type Profil = { nama: string; kelas: string; aktifSejak?: string };

/**
 * Sumber data panel BK (akun per guru, LINTAS SEMUA KELAS): menyediakan konteks AdminData yang sama agar halaman bersama dapat dipakai ulang.
 * BK tidak boleh membaca config/students (UID kartu), log tap, izin, atau PIN: daftar siswa = indeks siswaKelas + profiles (nama).
 */
export function BkDataProvider({ children }: { children: ReactNode }) {
  const { offset, siap: jamSiap } = useServerClock(); // tanggal mengikuti jam SERVER
  const now = useNow(15000, offset);
  const today = todayWIB(now);
  const peta = useLive<Record<string, string>>("siswaKelas");
  const prof = useLive<Record<string, Profil>>("profiles");
  const scheduleLive = useLive<Record<string, ScheduleRow>>("config/schedule");

  const value = useMemo<AdminDataValue>(() => {
    const students: StudentRow[] = Object.entries(peta.data ?? {})
      .filter(([nis]) => prof.data?.[nis])
      .map(([nis, key]) => ({ uid: nis, nis, nama: prof.data![nis].nama, kelas: decodeKelas(key) }))
      .sort((a, b) => a.kelas.localeCompare(b.kelas, "id", { numeric: true }) || a.nama.localeCompare(b.nama));
    return {
      ready: jamSiap && !peta.loading && !prof.loading && !scheduleLive.loading,
      selisihJamMs: offset, jamSiap, buktiSiap: true,
      aktifSejak: Object.fromEntries(students.filter((s) => prof.data?.[s.nis]?.aktifSejak).map((s) => [s.nis, prof.data![s.nis].aktifSejak as string])),
      today, now, students, studentMap: {}, schedule: Object.values(scheduleLive.data ?? {}),
      log: {}, izinToday: {} as never, manualToday: {}, byNis: {}, device: null, online: false, serverNow: () => Date.now() + offset,
      kelasList: [...new Set(students.map((s) => s.kelas))].sort((a, b) => a.localeCompare(b, "id", { numeric: true })),
      errors: [peta.error, prof.error, scheduleLive.error].filter((e): e is string => Boolean(e)),
    };
  }, [peta, prof, scheduleLive, today, now, offset, jamSiap]);

  return <AdminDataCtx.Provider value={value}>{children}</AdminDataCtx.Provider>;
}
