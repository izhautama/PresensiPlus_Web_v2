import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { onValue } from "firebase/database";
import { useAdminData } from "../admin/AdminData";
import { taKey, type DiscRecord, type Level, type RecordMeta } from "../lib/discipline";
import { daftarPerluDibina, type ItemDibina, type Pembinaan } from "../lib/pembinaan";
import type { StudentRow } from "../lib/types";
import { r, useLive } from "../services/db";

type PerNis<T> = Record<string, Record<string, T>>;
export type DisiplinKelasValue = {
  /** TA berjalan (mis. "2026-2027") */
  ta: string;
  siswa: StudentRow[];
  levels: Record<string, Level>;
  recs: PerNis<DiscRecord>;
  meta: PerNis<RecordMeta>;
  pembinaan: PerNis<Pembinaan>;
  /** siswa yang perlu dibina oleh wali (saldo pernah melewati ambang berpenanggung jawab wali dan belum ada pembinaan selesai) */
  items: ItemDibina[];
  memuat: boolean;
  galat: string[];
};
const Ctx = createContext<DisiplinKelasValue | null>(null);
/** Null di luar panel wali (mis. dipakai Shell untuk lencana menu). */
export const useDisiplinKelasOpsional = () => useContext(Ctx);
export function useDisiplinKelas(): DisiplinKelasValue {
  const v = useContext(Ctx);
  if (!v) throw new Error("useDisiplinKelas di luar panel wali");
  return v;
}

/**
 * Data kedisiplinan siswa kelas binaan wali (realtime per siswa; rules membatasi ke siswa binaan): catatan, meta pencatat, pembinaan.
 * Menghitung daftar "Perlu dibina" yang juga menjadi lencana menu.
 */
export function DisiplinKelasProvider({ children }: { children: ReactNode }) {
  const { students, today } = useAdminData();
  const ta = taKey(today);
  const levels = useLive<Record<string, Level>>("discipline/levels");
  const [recs, setRecs] = useState<PerNis<DiscRecord>>({});
  const [meta, setMeta] = useState<PerNis<RecordMeta>>({});
  const [pembinaan, setPembinaan] = useState<PerNis<Pembinaan>>({});
  const [siap, setSiap] = useState<Record<string, number>>({});
  const [galat, setGalat] = useState<string[]>([]);
  const kunci = students.map((s) => s.nis).join(",");

  useEffect(() => {
    setRecs({}); setMeta({}); setPembinaan({}); setSiap({}); setGalat([]);
    const stops: (() => void)[] = [];
    const gagal = (e: Error) => setGalat((x) => (x.includes(e.message) ? x : [...x, e.message]));
    const tandai = (nis: string) => setSiap((x) => ({ ...x, [nis]: (x[nis] ?? 0) + 1 }));
    for (const { nis } of students) {
      const pasang = <T,>(path: string, set: (f: (p: PerNis<T>) => PerNis<T>) => void) => {
        let sudah = false;
        stops.push(onValue(r(path), (s) => { set((p) => ({ ...p, [nis]: (s.val() ?? {}) as Record<string, T> })); if (!sudah) { sudah = true; tandai(nis); } },
          (e) => { gagal(e); if (!sudah) { sudah = true; tandai(nis); } }));
      };
      pasang<DiscRecord>(`discipline/records/${nis}`, setRecs);
      pasang<RecordMeta>(`discipline/recordMeta/${nis}`, setMeta);
      pasang<Pembinaan>(`pembinaan/${nis}`, setPembinaan);
    }
    return () => stops.forEach((f) => f());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kunci]);

  const memuat = levels.loading || students.some((s) => (siap[s.nis] ?? 0) < 3);
  const items = useMemo(
    () => daftarPerluDibina(students.map((s) => ({ nis: s.nis, recs: recs[s.nis], meta: meta[s.nis], pembinaan: pembinaan[s.nis] })), levels.data, ta, "wali"),
    [students, recs, meta, pembinaan, levels.data, ta],
  );
  const nilai = useMemo<DisiplinKelasValue>(() => ({ ta, siswa: students, levels: levels.data ?? {}, recs, meta, pembinaan, items, memuat, galat }),
    [ta, students, levels.data, recs, meta, pembinaan, items, memuat, galat]);
  return <Ctx.Provider value={nilai}>{children}</Ctx.Provider>;
}
