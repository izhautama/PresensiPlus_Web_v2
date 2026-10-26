import { lazy } from "react";
import { Navigate, Route, Routes } from "react-router";
import { Shell } from "../admin/AdminLayout";
import Pengaturan from "../kepala/Pengaturan";
import { BkDataProvider } from "./BkData";
import { DisiplinBkProvider } from "./DisiplinBk";

const Dashboard = lazy(() => import("./Dashboard"));
const Siswa = lazy(() => import("./Siswa"));
const DetailSiswa = lazy(() => import("./DetailSiswa"));
const Konseling = lazy(() => import("./Konseling"));
const Pembinaan = lazy(() => import("./PembinaanBk"));
const UsulanRemisi = lazy(() => import("../wali/UsulanRemisi"));
const Laporan = lazy(() => import("../wali/Laporan"));
const Panduan = lazy(() => import("../pages/Panduan"));

/** Panel BK (Guru Bimbingan Konseling, akun per guru). Wewenang lintas kelas; hak tulis dibatasi Security Rules. */
export default function BkLayout() {
  return (
    <BkDataProvider>
      <DisiplinBkProvider>
        <Shell mode="bk">
          <Routes>
            <Route index element={<Dashboard />} />
            <Route path="siswa" element={<Siswa />} />
            <Route path="siswa/:nis" element={<DetailSiswa />} />
            <Route path="pembinaan" element={<Pembinaan />} />
            <Route path="laporan" element={<Laporan />} />
            <Route path="usulan" element={<UsulanRemisi />} />
            <Route path="konseling" element={<Konseling />} />
            <Route path="panduan" element={<Panduan peran="bk" />} />
            <Route path="pengaturan" element={<Pengaturan />} />
            <Route path="*" element={<Navigate to="/bk" replace />} />
          </Routes>
        </Shell>
      </DisiplinBkProvider>
    </BkDataProvider>
  );
}
