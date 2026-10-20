import { useMemo } from "react";
import { useDisiplinKelasOpsional } from "../wali/DisiplinKelas";
import type { CatatanWali } from "../services/wali";

/** Catatan pelanggaran yang DIBUAT BK ini (sumber "bk") pada tanggal tertentu; memakai data kedisiplinan yang sudah dimuat panel BK. */
export function useCatatanBk(uid: string, tanggal: string[], aktif: boolean) {
  const d = useDisiplinKelasOpsional();
  const catatan = useMemo(() => {
    const out: { tanggal: string; id: string; item: CatatanWali }[] = [];
    if (!aktif || !d) return out;
    for (const s of d.siswa) {
      for (const [id, x] of Object.entries(d.recs[s.nis] ?? {})) {
        const m = d.meta[s.nis]?.[id];
        if (x.sumber !== "bk" || x.jenis !== "pelanggaran" || m?.dibuatOleh !== uid || m.dihapus || !tanggal.includes(x.tanggal)) continue;
        out.push({ tanggal: x.tanggal, id, item: { nis: s.nis, nama: s.nama, kelas: s.kelas, pelanggaran: x.nama, takziran: x.takziran, petugas: m.dibuatNama ?? "", hariKe: m.hariKe ?? 0, refId: x.refId ?? "", poin: x.poin, kategori: x.kategori, tanggal: x.tanggal } });
      }
    }
    return out.sort((a, b) => b.tanggal.localeCompare(a.tanggal) || a.item.nama.localeCompare(b.item.nama));
  }, [d, uid, tanggal.join(","), aktif]); // eslint-disable-line react-hooks/exhaustive-deps
  return { catatan, loading: Boolean(aktif && d?.memuat) };
}
