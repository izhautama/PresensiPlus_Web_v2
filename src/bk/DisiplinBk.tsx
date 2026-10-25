import { useMemo, type ReactNode } from "react";
import { useAdminData } from "../admin/AdminData";
import { taKey, type DiscRecord, type Level, type RecordMeta } from "../lib/discipline";
import { daftarPerluDibina, type KlaimBk, type Pembinaan } from "../lib/pembinaan";
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
  // v2.5: BK membaca kelompok 'wali' (lv01, isi lengkap) dan 'bk' (lv02); kelompok 'kepala' tertutup. Digabung per siswa.
  const pbWali = useLive<PerNis<Pembinaan>>("pembinaan/wali");
  const pbBk = useLive<PerNis<Pembinaan>>("pembinaan/bk");
  const klaimLive = useLive<Record<string, Record<string, KlaimBk>>>("klaimBK");
  const pembinaan = useMemo(() => {
    const gabung: PerNis<Pembinaan> = {};
    for (const grup of [pbWali.data, pbBk.data]) for (const [nis, per] of Object.entries(grup ?? {})) gabung[nis] = { ...gabung[nis], ...per };
    return { data: gabung, loading: pbWali.loading || pbBk.loading, error: pbWali.error ?? pbBk.error };
  }, [pbWali.data, pbBk.data, pbWali.loading, pbBk.loading, pbWali.error, pbBk.error]);
  const memuat = levels.loading || recs.loading || meta.loading || pembinaan.loading || klaimLive.loading;
  const galat = [levels.error, recs.error, meta.error, pembinaan.error, klaimLive.error].filter((e): e is string => Boolean(e));

  const items = useMemo(
    () => daftarPerluDibina(students.map((s) => ({ nis: s.nis, recs: recs.data?.[s.nis], meta: meta.data?.[s.nis], pembinaan: pembinaan.data?.[s.nis] })), levels.data, ta, "bk"),
    [students, recs.data, meta.data, pembinaan.data, levels.data, ta],
  );
  const nilai = useMemo<DisiplinKelasValue>(
    () => ({ ta, siswa: students, levels: levels.data ?? {}, recs: recs.data ?? {}, meta: meta.data ?? {}, pembinaan: pembinaan.data ?? {}, klaim: klaimLive.data ?? {}, items, memuat, galat }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ta, students, levels.data, recs.data, meta.data, pembinaan.data, klaimLive.data, items, memuat, galat.join("|")],
  );
  return <DisiplinCtx.Provider value={nilai}>{children}</DisiplinCtx.Provider>;
}
