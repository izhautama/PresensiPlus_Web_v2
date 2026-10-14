import { createContext, useContext, useMemo, type ReactNode } from "react";
import type { DeviceStatus, KetHarian, LogEntry, ScheduleRow, Student, StudentRow } from "../lib/types";
import { todayWIB } from "../lib/time";
import { ONLINE_MS, useLive, useNow, useServerOffset } from "../services/db";

export type TodayEntry = { masuk?: LogEntry; pulang?: LogEntry; ket?: KetHarian };

type AdminData = {
  ready: boolean;
  today: string;
  now: Date;
  students: StudentRow[];
  studentMap: Record<string, Student>;
  schedule: ScheduleRow[];
  log: Record<string, LogEntry>;
  izinToday: Record<string, KetHarian>;
  byNis: Record<string, TodayEntry>;
  device: DeviceStatus | null;
  online: boolean;
  serverNow: () => number;
  kelasList: string[];
  /** Pesan error per langganan (mis. ditolak rules) — satu gagal tidak mematikan yang lain */
  errors: string[];
};

const Ctx = createContext<AdminData | null>(null);

/** `tanpaAlat`: peran yang tidak boleh melihat status alat (piket) tidak berlangganan device/status. */
export function AdminDataProvider({ children, tanpaAlat = false }: { children: ReactNode; tanpaAlat?: boolean }) {
  const now = useNow(15000);
  const today = todayWIB(now);
  const offset = useServerOffset();
  const studentsLive = useLive<Record<string, Student>>("config/students");
  const scheduleLive = useLive<Record<string, ScheduleRow>>("config/schedule");
  const logLive = useLive<Record<string, LogEntry>>(`log/${today}`);
  const izinLive = useLive<Record<string, KetHarian>>(`izin/${today}`);
  const deviceLive = useLive<DeviceStatus>(tanpaAlat ? null : "device/status");

  const value = useMemo<AdminData>(() => {
    const studentMap = studentsLive.data ?? {};
    const students = Object.entries(studentMap)
      .map(([uid, s]) => ({ uid, ...s }))
      .sort((a, b) => a.kelas.localeCompare(b.kelas) || a.nama.localeCompare(b.nama));
    const log = logLive.data ?? {};
    const izinToday = izinLive.data ?? {};
    const byNis: Record<string, TodayEntry> = {};
    for (const [key, e] of Object.entries(log)) {
      const slot = (byNis[e.nis] ??= {});
      if (key.endsWith("_M")) slot.masuk = e; else slot.pulang = e;
    }
    for (const [nis, ket] of Object.entries(izinToday)) (byNis[nis] ??= {}).ket = ket;
    const serverNow = () => Date.now() + offset;
    const device = deviceLive.data;
    return {
      ready: !studentsLive.loading && !scheduleLive.loading,
      today, now, students, studentMap,
      schedule: Object.values(scheduleLive.data ?? {}),
      log, izinToday, byNis, device,
      online: Boolean(device?.lastSeen && serverNow() - device.lastSeen < ONLINE_MS),
      serverNow,
      kelasList: [...new Set(students.map((s) => s.kelas))].sort(),
      errors: [studentsLive, scheduleLive, logLive, izinLive, deviceLive].map((l) => l.error).filter((e): e is string => Boolean(e)),
    };
  }, [studentsLive, scheduleLive, logLive, izinLive, deviceLive, offset, today, now]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAdminData() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAdminData di luar AdminDataProvider");
  return v;
}

/** Status hari ini satu siswa utk badge. */
export function statusHariIni(e: TodayEntry | undefined, lewatBatas: boolean): string {
  if (e?.masuk) return e.masuk.status;
  if (e?.ket) return e.ket;
  return lewatBatas ? "Alpha" : "Belum hadir";
}
