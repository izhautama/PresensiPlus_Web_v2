import { useMemo } from "react";
import { useAuth } from "../auth/AuthContext";
import { urutLevel, type AutoMap, type Level, type MetaByNis, type Remisi, type RecordsByNis, type Rule } from "../lib/discipline";
import { useLive } from "../services/db";
import type { Actor } from "../services/discipline";

/** Master tata tertib + seluruh catatan (khusus staf: waka, kepala, admin). */
export function useDiscipline() {
  const rules = useLive<Record<string, Rule>>("discipline/rules");
  const remisi = useLive<Record<string, Remisi>>("discipline/remisi");
  const levels = useLive<Record<string, Level>>("discipline/levels");
  const autoMap = useLive<AutoMap>("discipline/autoMap");
  const records = useLive<RecordsByNis>("discipline/records");
  const meta = useLive<MetaByNis>("discipline/recordMeta"); // khusus staf: pencatat + riwayat terhapus
  const all = [rules, remisi, levels, autoMap, records, meta];

  return useMemo(() => ({
    rules: rules.data ?? {},
    remisi: remisi.data ?? {},
    levels: levels.data ?? {},
    levelList: urutLevel(levels.data),
    autoMap: autoMap.data ?? {},
    records: records.data ?? {},
    meta: meta.data ?? {},
    loading: all.some((x) => x.loading),
    errors: all.map((x) => x.error).filter((e): e is string => Boolean(e)),
    masterKosong: !rules.loading && !remisi.loading && !levels.loading && !rules.data && !remisi.data && !levels.data,
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [rules, remisi, levels, autoMap, records, meta]);
}

/** Identitas pelaku untuk jejak audit (nama dari staff/{uid}). */
export function useActor(): Actor {
  const { session } = useAuth();
  if (session && session.role !== "ortu") {
    return { uid: session.uid, nama: session.role === "admin" ? "Administrator" : session.nama };
  }
  return { uid: "", nama: "" };
}
