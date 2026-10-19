import { useEffect, useRef, useState } from "react";
import { endAt, onValue, orderByKey, query, startAt } from "firebase/database";
import { useAdminData } from "../admin/AdminData";
import { batasJam } from "../lib/attendance";
import { AMBANG_BAWAAN, bangunRingkasan, hitungBukti, validAmbang, type OverrideKalender, type PetaHari, type RingkasanHari } from "../lib/hariEfektif";
import type { ManualTap } from "../lib/manual";
import { addDays, namaHari, nowHM } from "../lib/time";
import { r, useLive } from "../services/db";
import { hitungOtomatis, perbaruiHariIni } from "../services/kalender";

/** Langganan realtime kalenderEfektif + kalender (override) untuk rentang tanggal [awal..akhir] (query rentang kunci). */
export function useKalenderRentang(awal: string, akhir: string) {
  const [peta, setPeta] = useState<PetaHari>({});
  const [override, setOverride] = useState<Record<string, OverrideKalender>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    setLoading(true); setError(null);
    let sisa = 2;
    const selesai = () => { sisa--; if (sisa <= 0) setLoading(false); };
    let a = false, b = false;
    const s1 = onValue(query(r("kalenderEfektif"), orderByKey(), startAt(awal), endAt(akhir)),
      (s) => { setPeta((s.val() ?? {}) as PetaHari); if (!a) { a = true; selesai(); } },
      (e) => { setError(e.message); if (!a) { a = true; selesai(); } });
    const s2 = onValue(query(r("kalender"), orderByKey(), startAt(awal), endAt(akhir)),
      (s) => { setOverride((s.val() ?? {}) as Record<string, OverrideKalender>); if (!b) { b = true; selesai(); } },
      (e) => { setError(e.message); if (!b) { b = true; selesai(); } });
    return () => { s1(); s2(); };
  }, [awal, akhir]);
  return { peta, override, loading, error };
}

/** Ambang hari efektif yang berlaku (bawaan 1); `null` selama masih dimuat. */
export function useAmbang(): number | null {
  const v = useLive<number>("sistem/ambangHariEfektif");
  if (v.loading) return null;
  return validAmbang(v.data) ? v.data : AMBANG_BAWAAN;
}

let sudahOtomatis = "";

/**
 * Dipasang di Dashboard (admin/kepala/waka) dan Beranda piket. Tanpa Cloud Functions, klien staf yang menghitung:
 *  - sekali per sesi/hari: kemarin dan hari-hari sebelumnya (maks. 31 hari) yang belum punya ringkasan;
 *  - hari ini: saat status efektif berubah, dan setelah jam pulang saat jumlah berubah (+ penanda tap rendah).
 */
export function useKalenderOtomatis(aktifkan = true) {
  const { today, log, manualToday, now, schedule, ready, buktiSiap } = useAdminData();
  const tersimpan = useLive<RingkasanHari>(`kalenderEfektif/${today}`);
  const override = useLive<OverrideKalender>(`kalender/${today}`);
  const ambang = useAmbang();
  const sibuk = useRef(false);

  useEffect(() => {
    if (!aktifkan || sudahOtomatis === today) return;
    sudahOtomatis = today;
    hitungOtomatis(today).catch(() => { sudahOtomatis = ""; });
  }, [today]);

  const bukti = hitungBukti(log, manualToday);
  const lewatPulang = nowHM(now) >= batasJam(schedule, "Semua", namaHari(today)).Pulang[0];
  useEffect(() => {
    if (!aktifkan || ambang === null || !ready || !buktiSiap || tersimpan.loading || override.loading || sibuk.current) return;
    sibuk.current = true;
    perbaruiHariIni({ tanggal: today, tap: bukti.tap, manual: bukti.manual, override: override.data, tersimpan: tersimpan.data, lewatPulang, ambang })
      .catch(() => { /* gagal sementara: dicoba lagi pada perubahan berikutnya */ })
      .finally(() => { sibuk.current = false; });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, buktiSiap, today, bukti.tap, bukti.manual, tersimpan.data, tersimpan.loading, override.data, override.loading, ambang, lewatPulang]);
}

/** Tanggal ber-tap rendah dalam 3 hari terakhir (untuk banner Dashboard). */
export function useRendahTerbaru(today: string) {
  const { peta, loading } = useKalenderRentang(addDays(today, -2), today);
  const daftar = Object.entries(peta).filter(([, x]) => x.rendah).sort((a, b) => b[0].localeCompare(a[0]));
  return { daftar, peta, loading };
}

/**
 * Status satu tanggal untuk halaman validasi/saran: ringkasan TERSIMPAN (kalenderEfektif) bila ada, bila belum
 * dihitung langsung dari log + presensi manual + override + ambang. `efektif === null` selama masih dimuat.
 */
export function useStatusHari(tanggal: string, log: Record<string, { nis: string }> | null | undefined, manual: Record<string, ManualTap> | null | undefined, dataSiap: boolean) {
  const tersimpan = useLive<RingkasanHari>(`kalenderEfektif/${tanggal}`);
  const override = useLive<OverrideKalender>(`kalender/${tanggal}`);
  const ambang = useAmbang();
  if (tersimpan.loading || override.loading || ambang === null || !dataSiap) return { ringkasan: null as RingkasanHari | null, efektif: null as boolean | null, tersimpan: false };
  if (tersimpan.data) return { ringkasan: tersimpan.data, efektif: tersimpan.data.efektif, tersimpan: true };
  const x = bangunRingkasan({ tanggal, override: override.data, log, manual, ambang });
  return { ringkasan: x as RingkasanHari | null, efektif: x.efektif as boolean | null, tersimpan: false };
}
