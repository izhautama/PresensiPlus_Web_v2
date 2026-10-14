import { useEffect, useMemo, useState } from "react";
import { onValue } from "firebase/database";
import { useAdminData } from "../admin/AdminData";
import { batasJam } from "../lib/attendance";
import { hitungSaran, type DataHari, type Saran } from "../lib/saran";
import { addDays, nowHM } from "../lib/time";
import { r } from "../services/db";
import { useDiscipline } from "./useDiscipline";

type Putusan = Record<string, Record<string, unknown> | null>;

/** Rentang tanggal [dari..sampai] (maks. 7 hari agar jumlah listener tetap kecil). */
export function rentang(dari: string, sampai: string): string[] {
  const out: string[] = [];
  for (let d = dari, i = 0; d <= sampai && i < 7; d = addDays(d, 1), i++) out.push(d);
  return out;
}

/**
 * Saran pelanggaran otomatis untuk rentang tanggal. Dihitung di klien dari log, izin, validasi, presensi per jam
 * (listener realtime per hari) dan TIDAK mencatat apa pun tanpa persetujuan staf.
 */
export function useSaran(tanggal: string[]) {
  const { students, today, now, schedule } = useAdminData();
  const d = useDiscipline();
  const kunci = tanggal.join(",");
  const [data, setData] = useState<Record<string, DataHari>>({});
  const [putusan, setPutusan] = useState<Putusan>({});
  const [siap, setSiap] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setSiap(false); setError(null); setData({}); setPutusan({});
    const stops: (() => void)[] = [];
    const total = tanggal.length * 6;
    let masuk = 0;
    const hitung = () => { masuk++; if (masuk >= total) setSiap(true); };
    const sekali = new Set<string>();
    const dengar = (path: string, apply: (v: unknown) => void) => {
      stops.push(onValue(r(path), (s) => {
        apply(s.val());
        if (!sekali.has(path)) { sekali.add(path); hitung(); }
      }, (e) => { setError(e.message); if (!sekali.has(path)) { sekali.add(path); hitung(); } }));
    };
    for (const t of tanggal) {
      dengar(`log/${t}`, (v) => setData((x) => ({ ...x, [t]: { ...x[t], log: v as DataHari["log"] } })));
      dengar(`izin/${t}`, (v) => setData((x) => ({ ...x, [t]: { ...x[t], izin: v as DataHari["izin"] } })));
      dengar(`manualTap/${t}`, (v) => setData((x) => ({ ...x, [t]: { ...x[t], manual: v as DataHari["manual"] } })));
      dengar(`validasi/${t}`, (v) => setData((x) => ({ ...x, [t]: { ...x[t], validasi: v as DataHari["validasi"] } })));
      dengar(`lessons/${t}`, (v) => setData((x) => ({ ...x, [t]: { ...x[t], lessons: v as DataHari["lessons"] } })));
      dengar(`discipline/suggest/${t}`, (v) => setPutusan((x) => ({ ...x, [t]: v as Record<string, unknown> | null })));
    }
    return () => stops.forEach((f) => f());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kunci]);

  const saran: Saran[] = useMemo(() => hitungSaran({
    tanggal, today, nowHM: nowHM(now), siswa: students, data, autoMap: d.autoMap, rules: d.rules, putusan,
    records: d.records, batasPulang: (kelas, hari) => batasJam(schedule, kelas, hari).Pulang[1],
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [kunci, today, now, students, data, d.autoMap, d.rules, putusan, d.records, schedule]);

  return { saran, loading: !siap || d.loading, error: error ?? d.errors[0] ?? null, rules: d.rules, autoMap: d.autoMap };
}
