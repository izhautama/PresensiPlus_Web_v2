import { useEffect, useMemo, useState } from "react";
import { onValue } from "firebase/database";
import type { StudentRow } from "../lib/types";
import { r } from "../services/db";
import type { CatatanWali } from "../services/wali";

type Rec = { jenis: string; refId?: string; nama: string; kategori?: string; poin: number; tanggal: string; sumber: string; takziran?: string };
type Meta = { dibuatOleh: string; dibuatNama?: string; dihapus?: boolean; hariKe?: number };

/** Catatan pelanggaran yang DIBUAT wali ini (sumber "wali") pada tanggal tertentu, untuk siswa kelas binaan. */
export function useCatatanWali(students: StudentRow[], tanggal: string[], uid: string, aktif: boolean) {
  const [recs, setRecs] = useState<Record<string, Record<string, Rec>>>({});
  const [metas, setMetas] = useState<Record<string, Record<string, Meta>>>({});
  const [loading, setLoading] = useState(aktif);
  const kunci = students.map((s) => s.nis).join(",");
  useEffect(() => {
    if (!aktif) { setLoading(false); return; }
    setRecs({}); setMetas({}); setLoading(students.length > 0);
    const stops: (() => void)[] = [];
    let sisa = students.length * 2;
    const tandai = () => { sisa--; if (sisa <= 0) setLoading(false); };
    for (const s of students) {
      let a = false, b = false;
      stops.push(onValue(r(`discipline/records/${s.nis}`), (x) => { setRecs((p) => ({ ...p, [s.nis]: (x.val() ?? {}) as Record<string, Rec> })); if (!a) { a = true; tandai(); } }, () => { if (!a) { a = true; tandai(); } }));
      stops.push(onValue(r(`discipline/recordMeta/${s.nis}`), (x) => { setMetas((p) => ({ ...p, [s.nis]: (x.val() ?? {}) as Record<string, Meta> })); if (!b) { b = true; tandai(); } }, () => { if (!b) { b = true; tandai(); } }));
    }
    return () => stops.forEach((f) => f());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kunci, aktif]);

  const catatan = useMemo(() => {
    const out: { tanggal: string; id: string; item: CatatanWali }[] = [];
    for (const s of students) {
      for (const [id, x] of Object.entries(recs[s.nis] ?? {})) {
        const m = metas[s.nis]?.[id];
        if (x.sumber !== "wali" || x.jenis !== "pelanggaran" || m?.dibuatOleh !== uid || m.dihapus || !tanggal.includes(x.tanggal)) continue;
        out.push({ tanggal: x.tanggal, id, item: { nis: s.nis, nama: s.nama, kelas: s.kelas, pelanggaran: x.nama, takziran: x.takziran, petugas: m.dibuatNama ?? "", hariKe: m.hariKe ?? 0, refId: x.refId ?? "", poin: x.poin, kategori: x.kategori, tanggal: x.tanggal } });
      }
    }
    return out.sort((a, b) => b.tanggal.localeCompare(a.tanggal) || a.item.nama.localeCompare(b.item.nama));
  }, [recs, metas, students, tanggal, uid]);
  return { catatan, loading };
}
