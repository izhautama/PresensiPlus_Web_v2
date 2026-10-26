import { createContext, useContext, useMemo, type ReactNode } from "react";
import { useAdminData } from "../admin/AdminData";
import { useAuth } from "../auth/AuthContext";
import { taKey, type DiscRecord, type Level, type RecordMeta } from "../lib/discipline";
import { daftarPerluDibina, lencanaKepala, lencanaPenugasanBk, type ItemDibina, type KlaimBk, type Pembinaan } from "../lib/pembinaan";
import { useLive } from "../services/db";

type PerNis<T> = Record<string, Record<string, T>>;
export type PembinaanDataValue = {
  ta: string;
  levels: Record<string, Level>;
  records: PerNis<DiscRecord>;
  meta: PerNis<RecordMeta>;
  klaim: PerNis<KlaimBk>;
  /** pembinaan jalur BK (waka dan kepala membacanya) */
  pbBk: PerNis<Pembinaan>;
  /** pembinaan jalur Kepala: HANYA terisi untuk kepala (waka tidak berlangganan dan tidak boleh membacanya) */
  pbKepala: PerNis<Pembinaan>;
  /** siswa pada ambang BK yang belum selesai dibina */
  itemsBk: ItemDibina[];
  /** siswa pada ambang Kepala yang belum selesai dibina (kosong untuk waka) */
  itemsKepala: ItemDibina[];
  lencanaPembinaan: number;
  lencanaPenugasan: number;
  memuat: boolean;
  galat: string[];
};
const Ctx = createContext<PembinaanDataValue | null>(null);
/** Null di luar panel waka/kepala. Dipakai Shell untuk lencana menu. */
export const usePembinaanDataOpsional = () => useContext(Ctx);
export function usePembinaanData(): PembinaanDataValue {
  const v = useContext(Ctx);
  if (!v) throw new Error("usePembinaanData di luar panel waka/kepala");
  return v;
}

/**
 * Satu-satunya tempat langganan data pembinaan skala sekolah untuk waka dan kepala (v2.5.1): records, recordMeta, levels, klaimBK, pembinaan/bk
 * (+ pembinaan/kepala hanya untuk kepala). Halaman Pembinaan, Penugasan BK, Guru BK, dan lencana menu memakai data yang SAMA dari sini.
 */
export function PembinaanDataProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const kepala = session?.role === "kepala";
  const { students, today } = useAdminData();
  const ta = taKey(today);
  const levels = useLive<Record<string, Level>>("discipline/levels");
  const rec = useLive<PerNis<DiscRecord>>("discipline/records");
  const met = useLive<PerNis<RecordMeta>>("discipline/recordMeta");
  const klaim = useLive<PerNis<KlaimBk>>("klaimBK");
  const pbBk = useLive<PerNis<Pembinaan>>("pembinaan/bk");
  const pbKepala = useLive<PerNis<Pembinaan>>(kepala ? "pembinaan/kepala" : null);
  const semua = [levels, rec, met, klaim, pbBk, pbKepala];
  const memuat = semua.some((x) => x.loading);

  const nilai = useMemo<PembinaanDataValue>(() => {
    const entri = (pb: PerNis<Pembinaan> | null) => students.map((s) => ({ nis: s.nis, recs: rec.data?.[s.nis], meta: met.data?.[s.nis], pembinaan: pb?.[s.nis] }));
    const itemsBk = memuat ? [] : daftarPerluDibina(entri(pbBk.data), levels.data, ta, "bk");
    const itemsKepala = memuat || !kepala ? [] : daftarPerluDibina(entri(pbKepala.data), levels.data, ta, "kepala");
    return {
      ta, levels: levels.data ?? {}, records: rec.data ?? {}, meta: met.data ?? {}, klaim: klaim.data ?? {}, pbBk: pbBk.data ?? {}, pbKepala: pbKepala.data ?? {},
      itemsBk, itemsKepala,
      lencanaPembinaan: kepala ? lencanaKepala(itemsKepala) : 0,
      lencanaPenugasan: lencanaPenugasanBk(itemsBk, klaim.data, ta),
      memuat, galat: semua.map((x) => x.error).filter((e): e is string => Boolean(e)),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [students, ta, kepala, memuat, levels.data, rec.data, met.data, klaim.data, pbBk.data, pbKepala.data]);

  return <Ctx.Provider value={nilai}>{children}</Ctx.Provider>;
}
