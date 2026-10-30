import { useMemo } from "react";
import { Link } from "react-router";
import Icon from "../components/Icon";
import { usePanelBase, usePanelMode } from "../admin/AdminLayout";
import { useAdminData } from "../admin/AdminData";
import { awalTahunAjaran, kontrolKalender } from "../lib/kontrolKalender";
import { addDays, formatTanggal } from "../lib/time";
import { useKalenderRentang } from "./useKalender";

const MAKS_TAMPIL = 8;

/**
 * Kartu "Kontrol kalender": hari kerja tanpa bukti hadir dan tanpa override pada tahun ajaran berjalan (kemungkinan tanggal merah/kegiatan
 * yang belum ditandai Wakasis). TU/admin: hanya baca + "Ingatkan Waka Kesiswaan". Waka/Kepala: tombol ke Kalender. Satu query rentang kunci
 * (kalenderEfektif + kalender), tanpa langganan per siswa.
 */
export default function KontrolKalender() {
  const { today, ready } = useAdminData();
  const mode = usePanelMode();
  const base = usePanelBase();
  const akhir = addDays(today, -1);
  const awal = awalTahunAjaran(today);
  const kal = useKalenderRentang(awal, akhir >= awal ? akhir : awal);
  const bisaAtur = mode === "waka" || mode === "kepala";
  const hasil = useMemo(() => kontrolKalender({ peta: kal.peta, override: kal.override, hariIni: today }), [kal.peta, kal.override, today]);
  if (!ready || kal.loading || kal.error) return null;
  if (hasil.kandidat.length === 0 && hasil.belumDihitung.length === 0) return null;

  return (
    <div className="notice warn" role="status" data-testid="kontrol-kalender">
      <Icon name="calendar" size={17} />
      <span>
        <b>Kontrol kalender</b>
        {hasil.kandidat.length > 0 && (
          <>
            {": "}<span data-testid="kontrol-kandidat">{hasil.kandidat.length}</span> hari kerja tanpa tap dan tanpa presensi manual, belum ditandai libur/efektif (kemungkinan tanggal merah atau kegiatan):{" "}
            {hasil.kandidat.slice(0, MAKS_TAMPIL).map((t) => formatTanggal(t, false)).join(", ")}{hasil.kandidat.length > MAKS_TAMPIL ? `, dan ${hasil.kandidat.length - MAKS_TAMPIL} lainnya` : ""}.
          </>
        )}
        {hasil.belumDihitung.length > 0 && (
          <small data-testid="kontrol-belum-dihitung" style={{ display: "block" }}>
            {hasil.belumDihitung.length} hari kerja belum dihitung{bisaAtur ? ' (jalankan "Hitung ulang" di menu Kalender).' : "."}
          </small>
        )}
        {bisaAtur
          ? <> <Link className="primary-button sm" to={`${base}/kalender`} data-testid="kontrol-ke-kalender">Buka Kalender</Link></>
          : <small data-testid="kontrol-ingatkan" style={{ display: "block" }}>Ingatkan Waka Kesiswaan untuk menandai tanggal tersebut di menu Kalender.</small>}
      </span>
    </div>
  );
}
