import { lazy } from "react";
import { Navigate, Route, Routes } from "react-router";
import { AdminDataProvider } from "../admin/AdminData";
import { Shell } from "../admin/AdminLayout";

// Halaman bersama dengan admin membaca mode lewat usePanelMode() (read-only untuk kepala)
import { PembinaanDataProvider } from "../kesiswaan/PembinaanData";

const Dashboard = lazy(() => import("../admin/Dashboard"));
const Students = lazy(() => import("../admin/Students"));
const Reports = lazy(() => import("../admin/Reports"));
const Alat = lazy(() => import("./Alat"));
const Pengaturan = lazy(() => import("./Pengaturan"));
const Saran = lazy(() => import("../kesiswaan/Saran"));
const LaporanKes = lazy(() => import("../kesiswaan/LaporanKesiswaan"));
const Validasi = lazy(() => import("../kesiswaan/Validasi"));
const PerJam = lazy(() => import("../kesiswaan/PerJam"));
const Pelanggaran = lazy(() => import("../kesiswaan/Pelanggaran"));
const TataTertib = lazy(() => import("../kesiswaan/TataTertib"));
const Audit = lazy(() => import("../kesiswaan/Audit"));
const PresensiManual = lazy(() => import("../piket/PresensiManual"));
const Panduan = lazy(() => import("../pages/Panduan"));
const PembinaanRekap = lazy(() => import("../kesiswaan/PembinaanRekap"));
const UsulanRemisi = lazy(() => import("../kesiswaan/UsulanRemisi"));
const Kalender = lazy(() => import("../kesiswaan/Kalender"));
const IzinOrtu = lazy(() => import("../kesiswaan/IzinOrtu"));
const PenugasanBk = lazy(() => import("../kesiswaan/PenugasanBk"));
const MigrasiPembinaan = lazy(() => import("./MigrasiPembinaan"));

/** Panel Kepala Madrasah. AdminDataProvider hanya berlangganan path yang diizinkan Security Rules untuk kepala. */
export default function KepalaLayout() {
  return (
    <AdminDataProvider>
      <PembinaanDataProvider>
      <Shell mode="kepala">
        <Routes>
          <Route index element={<Dashboard />} />
          <Route path="siswa" element={<Students />} />
          <Route path="laporan" element={<Reports />} />
          <Route path="alat" element={<Alat />} />
          <Route path="pengaturan" element={<Pengaturan />} />
          <Route path="validasi" element={<Validasi />} />
          <Route path="saran" element={<Saran />} />
          <Route path="laporan-kesiswaan" element={<LaporanKes />} />
          <Route path="per-jam" element={<PerJam />} />
          <Route path="pelanggaran" element={<Pelanggaran />} />
          <Route path="pembinaan" element={<PembinaanRekap />} />
          <Route path="usulan-remisi" element={<UsulanRemisi />} />
          <Route path="tata-tertib" element={<TataTertib />} />
          <Route path="audit" element={<Audit />} />
          <Route path="presensi-manual" element={<PresensiManual />} />
          <Route path="kalender" element={<Kalender />} />
          <Route path="izin-ortu" element={<IzinOrtu />} />
          <Route path="penugasan-bk" element={<PenugasanBk />} />
          <Route path="migrasi-pembinaan" element={<MigrasiPembinaan />} />
          <Route path="panduan" element={<Panduan peran="kepala" />} />
          <Route path="*" element={<Navigate to="/kepala" replace />} />
        </Routes>
      </Shell>
      </PembinaanDataProvider>
    </AdminDataProvider>
  );
}
