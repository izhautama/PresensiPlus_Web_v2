import { lazy } from "react";
import { Navigate, Route, Routes } from "react-router";
import { AdminDataProvider } from "../admin/AdminData";
import { Shell } from "../admin/AdminLayout";
import { PetugasProvider, PilihPetugas, usePetugas } from "./petugas";

const Beranda = lazy(() => import("./Beranda"));
const PerJam = lazy(() => import("../kesiswaan/PerJam"));
const Pelanggaran = lazy(() => import("./Pelanggaran"));
const PresensiManual = lazy(() => import("./PresensiManual"));

function Gerbang() {
  const { petugas } = usePetugas();
  if (!petugas) return <PilihPetugas />; // tanpa memilih petugas, menu tidak dapat dipakai
  return (
    <AdminDataProvider tanpaAlat>
      <Shell mode="piket">
        <Routes>
          <Route index element={<Beranda />} />
          <Route path="per-jam" element={<PerJam />} />
          <Route path="presensi-manual" element={<PresensiManual />} />
          <Route path="pelanggaran" element={<Pelanggaran />} />
          <Route path="*" element={<Navigate to="/piket" replace />} />
        </Routes>
      </Shell>
    </AdminDataProvider>
  );
}

/** Panel Guru Piket (akun bersama). Hak tulis dibatasi Security Rules; halaman ini hanya mempermudah. */
export default function PiketLayout() {
  return (
    <PetugasProvider>
      <Gerbang />
    </PetugasProvider>
  );
}
