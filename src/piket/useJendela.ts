import { useEffect, useState } from "react";
import { onValue } from "firebase/database";
import { useAuth } from "../auth/AuthContext";
import { MUNDUR_DEFAULT } from "../lib/piket";
import { r, useLive } from "../services/db";
import type { PiketCtx, PiketHarian } from "../services/piket";
import { usePetugas } from "./petugas";

/** N hari ke belakang yang boleh diinput piket (diatur waka; default 2). */
export function usePiketMundur(): number {
  const s = useLive<number>("discipline/settings/piketMundurHari");
  return typeof s.data === "number" ? s.data : MUNDUR_DEFAULT;
}

/** Konteks tulis (uid akun + nama petugas terpilih). */
export function usePiketCtx(): PiketCtx {
  const { session } = useAuth();
  const { petugas } = usePetugas();
  // wali kelas: akun per guru, jadi nama yang tercatat = nama akunnya (tanpa layar pilih petugas)
  return { uid: session && session.role !== "ortu" ? session.uid : "", petugas: session?.role === "wali" ? session.nama : petugas?.nama ?? "" };
}

/** Catatan piket (piketHarian) untuk beberapa tanggal sekaligus (maks. N+1 listener kecil). */
export function usePiketHarian(tanggal: string[]) {
  const kunci = tanggal.join(",");
  const [data, setData] = useState<Record<string, Record<string, PiketHarian>>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    setData({}); setLoading(true); setError(null);
    let sisa = tanggal.length;
    const selesai = new Set<string>();
    const tandai = (t: string) => { if (!selesai.has(t)) { selesai.add(t); sisa--; if (sisa <= 0) setLoading(false); } };
    if (sisa === 0) setLoading(false);
    const stops = tanggal.map((t) => onValue(r(`piketHarian/${t}`),
      (s) => { setData((x) => ({ ...x, [t]: (s.val() ?? {}) as Record<string, PiketHarian> })); tandai(t); },
      (e) => { setError(e.message); tandai(t); }));
    return () => stops.forEach((f) => f());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kunci]);
  return { data, loading, error };
}
