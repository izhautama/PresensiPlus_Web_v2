import { lazy } from "react";
import { Navigate, Route, Routes } from "react-router";
import { AdminDataProvider } from "../admin/AdminData";
import { Shell } from "../admin/AdminLayout";
import { PembinaanDataProvider } from "../kesiswaan/PembinaanData";

const Dashboard = lazy(() => import("./Dashboard"));
const Pengaturan = lazy(() => import("../kepala/Pengaturan"));
const Saran = lazy(() => import("../kesiswaan/Saran"));
const LaporanKes = lazy(() => import("../kesiswaan/LaporanKesiswaan"));
const PetugasPiket = lazy(() => import("../kesiswaan/PetugasPiket"));
const Validasi = lazy(() => import("../kesiswaan/Validasi"));
const PerJam = lazy(() => import("../kesiswaan/PerJam"));
const Pelanggaran = lazy(() => import("../kesiswaan/Pelanggaran"));
const TataTertib = lazy(() => import("../kesiswaan/TataTertib"));
const Audit = lazy(() => import("../kesiswaan/Audit"));
const PresensiManual = lazy(() => import("../piket/PresensiManual"));
const Panduan = lazy(() => import("../pages/Panduan"));
const PembinaanRekap = lazy(() => import("../kesiswaan/PembinaanRekap"));
const UsulanRemisi = lazy(() => import("../kesiswaan/UsulanRemisi"));
const WaliKelas = lazy(() => import("../kesiswaan/WaliKelas"));
const GuruBk = lazy(() => import("../kesiswaan/GuruBk"));
const IzinOrtu = lazy(() => import("../kesiswaan/IzinOrtu"));
const PenugasanBk = lazy(() => import("../kesiswaan/PenugasanBk"));
const Kalender = lazy(() => import("../kesiswaan/Kalender"));
const LogAktivitas = lazy(() => import("../kesiswaan/LogAktivitas"));

/** Panel Waka Kesiswaan. Halaman kesiswaan dipakai bersama kepala/admin; hak tulis ditegakkan Security Rules. */
export default function WakaLayout() {
  return (
    <AdminDataProvider>
      <PembinaanDataProvider>
      <Shell mode="waka">
        <Routes>
          <Route index element={<Dashboard />} />
          <Route path="validasi" element={<Validasi />} />
          <Route path="saran" element={<Saran />} />
          <Route path="laporan-kesiswaan" element={<LaporanKes />} />
          <Route path="per-jam" element={<PerJam />} />
          <Route path="pelanggaran" element={<Pelanggaran />} />
          <Route path="pembinaan" element={<PembinaanRekap />} />
          <Route path="usulan-remisi" element={<UsulanRemisi />} />
          <Route path="izin-ortu" element={<IzinOrtu />} />
          <Route path="penugasan-bk" element={<PenugasanBk />} />
          <Route path="tata-tertib" element={<TataTertib />} />
          <Route path="audit" element={<Audit />} />
          <Route path="presensi-manual" element={<PresensiManual />} />
          <Route path="wali-kelas" element={<WaliKelas />} />
          <Route path="guru-bk" element={<GuruBk />} />
          <Route path="kalender" element={<Kalender />} />
          <Route path="panduan" element={<Panduan peran="waka" />} />
          <Route path="log-aktivitas" element={<LogAktivitas />} />
          <Route path="petugas-piket" element={<PetugasPiket />} />
          <Route path="pengaturan" element={<Pengaturan />} />
          <Route path="*" element={<Navigate to="/waka" replace />} />
        </Routes>
      </Shell>
      </PembinaanDataProvider>
    </AdminDataProvider>
  );
}
