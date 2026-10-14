import { Fragment, createContext, lazy, Suspense, useCallback, useContext, useState, type ReactNode } from "react";
import { NavLink, Navigate, Route, Routes, useLocation, useNavigate } from "react-router";
import Icon, { type IconName } from "../components/Icon";
import { useAuth } from "../auth/AuthContext";
import { logout } from "../services/auth";
import { useConnected } from "../services/db";
import { formatTanggal, relatif } from "../lib/time";
import { AdminDataProvider, useAdminData } from "./AdminData";
import PetugasBar from "../piket/PetugasBar";

const Dashboard = lazy(() => import("./Dashboard"));
const Students = lazy(() => import("./Students"));
const Schedule = lazy(() => import("./Schedule"));
const Device = lazy(() => import("./Device"));
const Reports = lazy(() => import("./Reports"));
const Settings = lazy(() => import("./Settings"));
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
const Kalender = lazy(() => import("../kesiswaan/Kalender"));
const LogAktivitas = lazy(() => import("../kesiswaan/LogAktivitas"));

export type PanelMode = "admin" | "kepala" | "waka" | "piket";
type NavItem = { to: string; label: string; icon: IconName; title: string; section?: string };

/** Menu Kesiswaan dipakai bersama tiga peran; hak ubah ditegakkan Security Rules (admin hanya baca). */
const harian = (base: string): NavItem[] => [
  { to: `${base}/presensi-manual`, label: "Presensi manual", icon: "check", title: "Presensi manual" },
  { to: `${base}/kalender`, label: "Kalender", icon: "calendar", title: "Kalender akademik" },
  { to: `${base}/validasi`, label: "Validasi harian", icon: "check", title: "Validasi harian" },
  { to: `${base}/per-jam`, label: "Presensi per jam", icon: "clock", title: "Presensi per jam" },
  { to: `${base}/saran`, label: "Perlu ditinjau", icon: "bell", title: "Perlu ditinjau (saran otomatis)" },
];
const laporanKes = (base: string, label: string): NavItem => ({ to: `${base}/laporan-kesiswaan`, label, icon: "file", title: "Laporan kesiswaan" });
const kesiswaan = (base: string, denganHarian: boolean): NavItem[] => {
  const baru: NavItem[] = [
    { to: `${base}/pelanggaran`, label: "Pelanggaran", icon: "warning", title: "Pelanggaran & remisi" },
    { to: `${base}/tata-tertib`, label: "Tata tertib", icon: "file", title: "Tata tertib" },
    { to: `${base}/audit`, label: "Jejak audit", icon: "activity", title: "Jejak audit kesiswaan" },
  ];
  baru.splice(2, 0, laporanKes(base, "Laporan kesiswaan"));
  if (base === "/admin") baru.push({ to: `${base}/petugas-piket`, label: "Petugas piket", icon: "users", title: "Petugas piket" });
  if (base === "/admin") baru.push({ to: `${base}/log-aktivitas`, label: "Log aktivitas", icon: "activity", title: "Log aktivitas akun" });
  const daftar = denganHarian ? [...harian(base), ...baru] : baru;
  return daftar.map((x, i) => (i === 0 ? { ...x, section: "KESISWAAN" } : x));
};

const PANEL: Record<PanelMode, { base: string; role: string; short: string; menuLabel: string; deviceLink?: string; tanpaPengaturan?: boolean; nav: NavItem[] }> = {
  admin: {
    base: "/admin", role: "Administrator", short: "AD", menuLabel: "Menu admin", deviceLink: "/admin/perangkat",
    nav: [
      { to: "/admin", label: "Ringkasan", icon: "grid", title: "Ringkasan presensi" },
      { to: "/admin/siswa", label: "Data siswa", icon: "users", title: "Data siswa" },
      { to: "/admin/jadwal", label: "Jadwal", icon: "calendar", title: "Jadwal presensi" },
      { to: "/admin/laporan", label: "Laporan", icon: "file", title: "Laporan kehadiran" },
      { to: "/admin/perangkat", label: "Perangkat", icon: "device", title: "Perangkat" },
      ...kesiswaan("/admin", true),
      { to: "/admin/panduan", label: "Panduan", icon: "file", title: "Panduan" },
    ],
  },
  kepala: {
    base: "/kepala", role: "Kepala Madrasah", short: "KM", menuLabel: "Menu kepala madrasah", deviceLink: "/kepala/alat",
    nav: [
      { to: "/kepala", label: "Dashboard", icon: "grid", title: "Dashboard hari ini" },
      { to: "/kepala/siswa", label: "Siswa", icon: "users", title: "Data siswa" },
      { to: "/kepala/laporan", label: "Laporan", icon: "file", title: "Laporan kehadiran" },
      { to: "/kepala/alat", label: "Status alat", icon: "device", title: "Status alat" },
      ...kesiswaan("/kepala", true),
      { to: "/kepala/panduan", label: "Panduan", icon: "file", title: "Panduan" },
    ],
  },
  piket: {
    base: "/piket", role: "Guru Piket", short: "GP", menuLabel: "Menu guru piket", tanpaPengaturan: true,
    nav: [
      { to: "/piket", label: "Beranda", icon: "grid", title: "Beranda piket" },
      { to: "/piket/presensi-manual", label: "Presensi manual", icon: "check", title: "Presensi manual" },
      { to: "/piket/per-jam", label: "Izin per jam", icon: "clock", title: "Izin per jam" },
      { to: "/piket/pelanggaran", label: "Pelanggaran", icon: "warning", title: "Pelanggaran ringan" },
      { to: "/piket/panduan", label: "Panduan", icon: "file", title: "Panduan" },
    ],
  },
  waka: {
    base: "/waka", role: "Waka Kesiswaan", short: "WK", menuLabel: "Menu waka kesiswaan",
    nav: [
      { to: "/waka", label: "Dashboard", icon: "grid", title: "Dashboard kesiswaan" },
      ...harian("/waka"),
      laporanKes("/waka", "Laporan"),
      { to: "/waka/petugas-piket", label: "Petugas piket", icon: "users", title: "Petugas piket" },
      ...kesiswaan("/waka", false).filter((x) => x.to !== "/waka/laporan-kesiswaan"),
      { to: "/waka/log-aktivitas", label: "Log aktivitas", icon: "activity", title: "Log aktivitas akun" },
      { to: "/waka/panduan", label: "Panduan", icon: "file", title: "Panduan" },
    ],
  },
};

const ModeCtx = createContext<PanelMode>("admin");
/** Mode panel aktif — komponen bersama memakai ini untuk menyembunyikan aksi tulis/data sensitif. */
export const usePanelMode = () => useContext(ModeCtx);
/** Awalan rute panel aktif: "/admin", "/kepala", atau "/waka". */
export const usePanelBase = () => PANEL[useContext(ModeCtx)].base;
/** Hak tulis modul kesiswaan (pelanggaran, remisi, tata tertib, validasi harian): waka & kepala. Admin hanya membaca; piket punya halaman & hak sendiri. */
export const useBisaTulisKesiswaan = () => { const m = useContext(ModeCtx); return m === "waka" || m === "kepala"; };

type Toast = { msg: string; kind: "ok" | "err" } | null;
const ToastCtx = createContext<(msg: string, kind?: "ok" | "err") => void>(() => {});
export const useToast = () => useContext(ToastCtx);

export default function AdminLayout() {
  return (
    <AdminDataProvider>
      <Shell mode="admin">
        <Routes>
          <Route index element={<Dashboard />} />
          <Route path="siswa" element={<Students />} />
          <Route path="jadwal" element={<Schedule />} />
          <Route path="laporan" element={<Reports />} />
          <Route path="perangkat" element={<Device />} />
          <Route path="pengaturan" element={<Settings />} />
          <Route path="validasi" element={<Validasi />} />
          <Route path="saran" element={<Saran />} />
          <Route path="laporan-kesiswaan" element={<LaporanKes />} />
          <Route path="per-jam" element={<PerJam />} />
          <Route path="pelanggaran" element={<Pelanggaran />} />
          <Route path="tata-tertib" element={<TataTertib />} />
          <Route path="audit" element={<Audit />} />
          <Route path="presensi-manual" element={<PresensiManual />} />
          <Route path="kalender" element={<Kalender />} />
          <Route path="panduan" element={<Panduan peran="admin" />} />
          <Route path="log-aktivitas" element={<LogAktivitas />} />
          <Route path="petugas-piket" element={<PetugasPiket />} />
          <Route path="*" element={<Navigate to="/admin" replace />} />
        </Routes>
      </Shell>
    </AdminDataProvider>
  );
}

/** Kerangka sidebar + topbar yang dipakai bersama panel admin dan kepala. */
export function Shell({ mode, children }: { mode: PanelMode; children: ReactNode }) {
  const P = PANEL[mode];
  const navItems = P.nav;
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { session } = useAuth();
  const { today, device, online, serverNow, errors } = useAdminData();
  const connected = useConnected();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [toast, setToast] = useState<Toast>(null);

  const notify = useCallback((msg: string, kind: "ok" | "err" = "ok") => {
    setToast({ msg, kind });
    window.setTimeout(() => setToast((t) => (t?.msg === msg ? null : t)), kind === "err" ? 5000 : 2800);
  }, []);

  const current = [...navItems].reverse().find((n) => pathname === n.to || pathname.startsWith(`${n.to}/`))
    ?? (pathname.startsWith(`${P.base}/pengaturan`) ? { title: "Pengaturan" } : navItems[0]);
  const email = session && session.role !== "ortu" ? session.email : "";

  return (
    <ModeCtx.Provider value={mode}>
    <ToastCtx.Provider value={notify}>
      <div className="app-shell">
        <aside className={`sidebar ${mobileOpen ? "sidebar-open" : ""}`}>
          <div className="brand">
            <div className="brand-mark"><span>NH</span></div>
            <div><p className="brand-name">Presensi<span>+</span></p><p className="brand-school">MA Nurul Huda</p></div>
          </div>
          <nav className="nav" aria-label={P.menuLabel}>
            {navItems.map((item, i) => (
              <Fragment key={item.to}>
                {(i === 0 || item.section) && <p className={`nav-label ${i > 0 ? "nav-label-second" : ""}`}>{item.section ?? "MENU UTAMA"}</p>}
                <NavLink to={item.to} end={item.to === P.base} onClick={() => setMobileOpen(false)}
                  className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`}>
                  <Icon name={item.icon} /><span>{item.label}</span>
                </NavLink>
              </Fragment>
            ))}
            {!P.tanpaPengaturan && (
              <>
                <p className="nav-label nav-label-second">SISTEM</p>
                <NavLink to={`${P.base}/pengaturan`} onClick={() => setMobileOpen(false)} className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`}>
                  <Icon name="settings" /><span>Pengaturan</span>
                </NavLink>
              </>
            )}
          </nav>
          <div className="sidebar-bottom">
            {P.deviceLink && (
              <NavLink to={P.deviceLink!} className={`device-mini ${online ? "" : "offline"}`} onClick={() => setMobileOpen(false)}>
                <div className="pulse-wrap"><span className="pulse-dot" /></div>
                <div>
                  <p>ESP32-RFID-01</p>
                  <span>{online ? "Terhubung" : device?.lastSeen ? `Offline · ${relatif(device.lastSeen, serverNow())}` : "Belum pernah terhubung"}</span>
                </div>
                <Icon name="wifi" size={17} />
              </NavLink>
            )}
            <button className="profile" onClick={async () => { await logout(); navigate("/login", { replace: true }); }} aria-label={`Keluar dari akun ${P.role}`}>
              <span className="avatar admin">{P.short}</span>
              <span><b>{P.role}</b><small title={email}>{email}</small></span>
              <Icon name="logout" size={18} />
            </button>
          </div>
        </aside>

        {mobileOpen && <button className="overlay" aria-label="Tutup menu" onClick={() => setMobileOpen(false)} />}

        <main className="main">
          <header className="topbar">
            <button className="mobile-menu" aria-label="Buka menu" onClick={() => setMobileOpen(true)}><Icon name="menu" /></button>
            <div className="page-title">
              <p>{current.title}</p>
              <span>{formatTanggal(today)}</span>
            </div>
            <div className="top-actions">
              {mode === "piket" && <PetugasBar />}
              {mode === "kepala" && <span className="mode-pill no-print"><Icon name="eye" size={14} /> Pantau &amp; kesiswaan</span>}
              {!connected && <span className="conn-pill"><Icon name="alert" size={14} /> Koneksi terputus</span>}
            </div>
          </header>

          <div className="content">
            {errors.length > 0 && (
              <div className="notice warn" role="alert"><Icon name="warning" size={17} /><span>Sebagian data tidak dapat dimuat ({errors[0]}). Muat ulang halaman; bila berlanjut, hubungi administrator.</span></div>
            )}
            <Suspense fallback={<div className="page-loader"><span className="spinner spinner-dark" /></div>}>
              {children}
            </Suspense>
          </div>
        </main>

        {toast && <div className={`toast ${toast.kind === "err" ? "toast-err" : ""}`} role="status"><Icon name={toast.kind === "err" ? "alert" : "check"} size={17} />{toast.msg}</div>}
      </div>
    </ToastCtx.Provider>
    </ModeCtx.Provider>
  );
}
