import { useMemo, type ReactNode } from "react";
import { useAdminData } from "../admin/AdminData";
import { taKey, type DiscRecord, type Level, type RecordMeta } from "../lib/discipline";
import { daftarPerluDibina, type Pembinaan } from "../lib/pembinaan";
import { useLive } from "../services/db";
import { DisiplinCtx, type DisiplinKelasValue } from "../wali/DisiplinKelas";

type PerNis<T> = Record<string, Record<string, T>>;

/**
 * Data kedisiplinan SEMUA siswa untuk BK (satu langganan per node, bukan per siswa): catatan, meta pencatat, pembinaan.
 * Memakai konteks yang sama dengan panel wali sehingga halaman Pembinaan/Usulan dan lencana menu dapat dipakai bersama.
 */
export function DisiplinBkProvider({ children }: { children: ReactNode }) {
  const { students, today } = useAdminData();
  const ta = taKey(today);
  const levels = useLive<Record<string, Level>>("discipline/levels");
  const recs = useLive<PerNis<DiscRecord>>("discipline/records");
  const meta = useLive<PerNis<RecordMeta>>("discipline/recordMeta");
  const pembinaan = useLive<PerNis<Pembinaan>>("pembinaan");
  const memuat = levels.loading || recs.loading || meta.loading || pembinaan.loading;
  const galat = [levels.error, recs.error, meta.error, pembinaan.error].filter((e): e is string => Boolean(e));

  const items = useMemo(
    () => daftarPerluDibina(students.map((s) => ({ nis: s.nis, recs: recs.data?.[s.nis], meta: meta.data?.[s.nis], pembinaan: pembinaan.data?.[s.nis] })), levels.data, ta, "bk"),
    [students, recs.data, meta.data, pembinaan.data, levels.data, ta],
  );
  const nilai = useMemo<DisiplinKelasValue>(
    () => ({ ta, siswa: students, levels: levels.data ?? {}, recs: recs.data ?? {}, meta: meta.data ?? {}, pembinaan: pembinaan.data ?? {}, items, memuat, galat }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ta, students, levels.data, recs.data, meta.data, pembinaan.data, items, memuat, galat.join("|")],
  );
  return <DisiplinCtx.Provider value={nilai}>{children}</DisiplinCtx.Provider>;
}
