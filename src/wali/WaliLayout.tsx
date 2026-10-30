import { lazy } from "react";
import { Navigate, Route, Routes } from "react-router";
import Icon from "../components/Icon";
import { Shell } from "../admin/AdminLayout";
import Pengaturan from "../kepala/Pengaturan";
import { DisiplinKelasProvider } from "./DisiplinKelas";
import { WaliDataProvider, useKelasWali } from "./WaliData";

const Dashboard = lazy(() => import("./Dashboard"));
const KehadiranKelas = lazy(() => import("./KehadiranKelas"));
const SiswaKelas = lazy(() => import("./SiswaKelas"));
const DetailSiswa = lazy(() => import("./DetailSiswa"));
const Pembinaan = lazy(() => import("./Pembinaan"));
const UsulanRemisi = lazy(() => import("./UsulanRemisi"));
const Laporan = lazy(() => import("./Laporan"));
const Panduan = lazy(() => import("../pages/Panduan"));

function TanpaKelas() {
  const { kelas, memuat } = useKelasWali();
  if (memuat || kelas.length > 0) return null;
  return <div className="notice warn" role="alert" data-testid="wali-tanpa-kelas"><Icon name="warning" size={17} /><span>Akun Anda belum dipetakan ke kelas. Hubungi admin atau waka kesiswaan.</span></div>;
}

/** Panel Wali Kelas (akun per guru). Data & hak tulis dibatasi Security Rules pada siswa kelas binaan. */
export default function WaliLayout() {
  return (
    <WaliDataProvider>
      <DisiplinKelasProvider>
        <Shell mode="wali">
          <TanpaKelas />
          <Routes>
            <Route index element={<Dashboard />} />
            <Route path="kehadiran" element={<KehadiranKelas />} />
            <Route path="izin" element={<Navigate to="/wali/kehadiran" replace />} />
            <Route path="siswa" element={<SiswaKelas />} />
            <Route path="siswa/:nis" element={<DetailSiswa />} />
            <Route path="pembinaan" element={<Pembinaan />} />
            <Route path="laporan" element={<Laporan />} />
            <Route path="usulan" element={<UsulanRemisi />} />
            <Route path="panduan" element={<Panduan peran="wali" />} />
            <Route path="pengaturan" element={<Pengaturan />} />
            <Route path="*" element={<Navigate to="/wali" replace />} />
          </Routes>
        </Shell>
      </DisiplinKelasProvider>
    </WaliDataProvider>
  );
}
