import { Suspense, lazy, type ReactNode } from "react";
import { Navigate, createBrowserRouter, useParams } from "react-router";
import { useAuth } from "../auth/AuthContext";
import { CONFIG_OK } from "../lib/firebase";

const AdminLayout = lazy(() => import("../admin/AdminLayout"));
const WakaLayout = lazy(() => import("../waka/WakaLayout"));
const PiketLayout = lazy(() => import("../piket/PiketLayout"));
const KepalaLayout = lazy(() => import("../kepala/KepalaLayout"));
const WaliLayout = lazy(() => import("../wali/WaliLayout"));
const LoginPage = lazy(() => import("../pages/LoginPage"));
const StudentPage = lazy(() => import("../pages/StudentPage"));
const PanduanOrtu = lazy(() => import("../pages/Panduan").then((m) => ({ default: () => { const { session } = useAuth(); return session?.role === "ortu" ? <m.PanduanOrtu nis={session.nis} /> : <Navigate to="/login" replace />; } })));

function Loader() {
  return <div className="route-loader" aria-label="Memuat halaman"><span className="spinner" /></div>;
}

function Page({ children }: { children: ReactNode }) {
  const { ready } = useAuth();
  if (!CONFIG_OK) return <SetupNeeded />;
  if (!ready) return <Loader />;
  return <Suspense fallback={<Loader />}>{children}</Suspense>;
}

function SetupNeeded() {
  return (
    <main className="route-loader">
      <div className="setup-card">
        <p className="login-title">Konfigurasi belum lengkap</p>
        <p className="login-subtitle">Isi file <code>.env</code> dengan konfigurasi Web App Firebase (lihat <code>.env.example</code>), lalu build ulang.</p>
      </div>
    </main>
  );
}

const HOME = { admin: "/admin", kepala: "/kepala", waka: "/waka", piket: "/piket", wali: "/wali" } as const;

function HomeRedirect() {
  const { session } = useAuth();
  if (session && session.role !== "ortu") return <Navigate to={HOME[session.role]} replace />;
  if (session?.role === "ortu") return <Navigate to={`/siswa/${session.nis}`} replace />;
  return <Navigate to="/login" replace />;
}

/** Hanya peran `role` yang boleh masuk; peran staf lain dialihkan ke panelnya sendiri. */
function PanelGuard({ role, children }: { role: "admin" | "kepala" | "waka" | "piket" | "wali"; children: ReactNode }) {
  const { session } = useAuth();
  if (session?.role === role) return <>{children}</>;
  if (session && session.role !== "ortu") return <Navigate to={HOME[session.role]} replace />;
  return <Navigate to="/login" replace />;
}

function StudentGuard() {
  const { nis } = useParams();
  const { session } = useAuth();
  if (session?.role !== "ortu") return <Navigate to="/login" replace />;
  if (session.nis !== nis) return <Navigate to={`/siswa/${session.nis}`} replace />;
  return <StudentPage />;
}

export const router = createBrowserRouter([
  { path: "/", element: <Page><HomeRedirect /></Page> },
  { path: "/login", element: <Page><LoginPage /></Page> },
  { path: "/admin/*", element: <Page><PanelGuard role="admin"><AdminLayout /></PanelGuard></Page> },
  { path: "/kepala/*", element: <Page><PanelGuard role="kepala"><KepalaLayout /></PanelGuard></Page> },
  { path: "/waka/*", element: <Page><PanelGuard role="waka"><WakaLayout /></PanelGuard></Page> },
  { path: "/wali/*", element: <Page><PanelGuard role="wali"><WaliLayout /></PanelGuard></Page> },
  { path: "/piket/*", element: <Page><PanelGuard role="piket"><PiketLayout /></PanelGuard></Page> },
  { path: "/siswa/:nis", element: <Page><StudentGuard /></Page> },
  { path: "/panduan", element: <Page><PanduanOrtu /></Page> },
  { path: "*", element: <Navigate to="/" replace /> },
]);
