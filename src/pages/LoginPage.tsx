import { useEffect, useRef, useState, type FormEvent } from "react";
import { Navigate } from "react-router";
import { useAuth } from "../auth/AuthContext";
import Icon from "../components/Icon";
import { loginAdmin, loginOrangTua } from "../services/auth";

type Mode = "ortu" | "admin";
type Errors = { nis?: string; pin?: string; email?: string; password?: string; general?: string };

const MAX_ATTEMPTS = 5;
const LOCK_SECONDS = 5 * 60;
const LOCK_KEY = "presensi-lock-until"; // bertahan saat halaman dimuat ulang
const WA_TU = import.meta.env.VITE_WA_TU as string | undefined;

function readLock(): number {
  try { return Math.max(0, Math.ceil((Number(localStorage.getItem(LOCK_KEY)) - Date.now()) / 1000)); } catch { return 0; }
}

function Brand({ mobile = false }: { mobile?: boolean }) {
  return (
    <div className={`login-logo ${mobile ? "login-logo-mobile" : ""}`}>
      <div className="brand-mark"><span>NH</span></div>
      <div>
        <p className="brand-name">Presensi<span>+</span></p>
        <p className="brand-school">MA Nurul Huda</p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  const { session } = useAuth();
  const [mode, setMode] = useState<Mode>("ortu");
  const [nis, setNis] = useState("");
  const [pin, setPin] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(false);
  const [showSecret, setShowSecret] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const [loading, setLoading] = useState(false);
  const [failedAttempts, setFailedAttempts] = useState(0);
  const [lockRemaining, setLockRemaining] = useState(readLock);
  const firstInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { firstInputRef.current?.focus(); }, [mode]);

  useEffect(() => {
    if (!lockRemaining) return;
    const timer = window.setInterval(() => setLockRemaining(readLock()), 1000);
    return () => window.clearInterval(timer);
  }, [lockRemaining]);

  if (session?.role === "admin") return <Navigate to="/admin" replace />;
  if (session?.role === "kepala") return <Navigate to="/kepala" replace />;
  if (session?.role === "waka") return <Navigate to="/waka" replace />;
  if (session?.role === "piket") return <Navigate to="/piket" replace />;
  if (session?.role === "wali") return <Navigate to="/wali" replace />;
  if (session?.role === "ortu") return <Navigate to={`/siswa/${session.nis}`} replace />;

  const switchMode = (next: Mode) => {
    if (next === mode || loading) return;
    setMode(next);
    setErrors({});
    setShowSecret(false);
  };

  const recordFailure = () => {
    const next = failedAttempts + 1;
    if (next >= MAX_ATTEMPTS) {
      setFailedAttempts(0);
      try { localStorage.setItem(LOCK_KEY, String(Date.now() + LOCK_SECONDS * 1000)); } catch { /* mode privat */ }
      setLockRemaining(LOCK_SECONDS);
    } else {
      setFailedAttempts(next);
    }
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (loading || lockRemaining) return;

    const fieldErrors: Errors = {};
    if (mode === "ortu") {
      if (!nis) fieldErrors.nis = "NIS wajib diisi";
      if (!/^\d{6}$/.test(pin)) fieldErrors.pin = "PIN harus 6 digit angka";
    } else {
      if (!/^\S+@\S+\.\S+$/.test(email.trim())) fieldErrors.email = "Masukkan email yang valid";
      if (!password) fieldErrors.password = "Password wajib diisi";
    }
    if (Object.keys(fieldErrors).length) { setErrors(fieldErrors); return; }

    setLoading(true);
    setErrors({});
    const result = mode === "ortu" ? await loginOrangTua(nis, pin) : await loginAdmin(email, password, remember);
    if (!result.success) {
      setLoading(false);
      setErrors({ general: result.message });
      setPin("");
      setPassword("");
      recordFailure();
    }
    // Sukses: AuthContext menerima sesi baru -> komponen ini me-redirect sendiri
  };

  const minutes = Math.floor(lockRemaining / 60);
  const seconds = String(lockRemaining % 60).padStart(2, "0");
  const errorMessages = [errors.nis, errors.pin, errors.email, errors.password, errors.general].filter(Boolean) as string[];
  const disabled = loading || lockRemaining > 0;
  const described = errorMessages.length || lockRemaining ? "login-error" : undefined;

  return (
    <main className="login-page">
      <section className="login-brand-panel" aria-label="Tentang Presensi Plus">
        <Brand />
        <div className="brand-copy">
          <span className="brand-kicker">PRESENSI CERDAS</span>
          <p className="brand-headline">Sistem Presensi<br />RFID</p>
          <p className="brand-description">Pantau kehadiran siswa secara real-time</p>
        </div>
        <div className="rfid-visual" aria-hidden="true">
          <span className="rfid-ring ring-one" />
          <span className="rfid-ring ring-two" />
          <span className="rfid-ring ring-three" />
          <div className="rfid-card"><Icon name="card" size={34} /><span>RFID</span></div>
        </div>
        <div className="brand-grid" aria-hidden="true" />
        <p className="brand-secure"><Icon name="check" size={15} /> Aman, cepat, dan terintegrasi</p>
      </section>

      <section className="login-form-panel">
        <div className="login-card">
          <Brand mobile />
          <div className="login-toggle" role="tablist" aria-label="Pilih jenis pengguna">
            <button type="button" role="tab" aria-selected={mode === "ortu"} className={mode === "ortu" ? "active" : ""} onClick={() => switchMode("ortu")}>Orang Tua / Wali</button>
            <button type="button" role="tab" aria-selected={mode === "admin"} className={mode === "admin" ? "active" : ""} onClick={() => switchMode("admin")}>Admin</button>
          </div>

          <div className="login-copy" key={mode}>
            <p className="login-title">{mode === "ortu" ? "Cek Kehadiran Siswa" : "Masuk Admin"}</p>
            <p className="login-subtitle">{mode === "ortu" ? "Masukkan NIS dan PIN yang diberikan sekolah untuk melihat presensi putra/putri Anda" : "Kelola data presensi, jadwal, dan perangkat"}</p>
          </div>

          <form className="login-form" onSubmit={submit} noValidate>
            <div className="login-fields" key={`fields-${mode}`}>
              {mode === "ortu" ? (
                <>
                  <div className="field">
                    <label htmlFor="nis">NIS</label>
                    <div className={`input-wrap ${errors.nis ? "input-error" : ""}`}>
                      <Icon name="card" size={18} />
                      <input ref={firstInputRef} id="nis" name="nis" inputMode="numeric" autoComplete="username" maxLength={20}
                        placeholder="Masukkan NIS" value={nis}
                        onChange={(e) => { setNis(e.target.value.replace(/\D/g, "")); setErrors({}); }}
                        aria-invalid={Boolean(errors.nis || errors.general)} aria-describedby={described} disabled={disabled} />
                    </div>
                  </div>
                  <div className="field">
                    <label htmlFor="pin">PIN</label>
                    <div className={`input-wrap ${errors.pin ? "input-error" : ""}`}>
                      <Icon name="lock" size={18} />
                      <input id="pin" name="pin" type={showSecret ? "text" : "password"} inputMode="numeric" autoComplete="current-password" maxLength={6}
                        placeholder="6 digit PIN" value={pin}
                        onChange={(e) => { setPin(e.target.value.replace(/\D/g, "").slice(0, 6)); setErrors({}); }}
                        aria-invalid={Boolean(errors.pin || errors.general)} aria-describedby={described} disabled={disabled} />
                      <button type="button" className="password-toggle" aria-label={showSecret ? "Sembunyikan PIN" : "Tampilkan PIN"} onClick={() => setShowSecret((v) => !v)}>
                        <Icon name={showSecret ? "eyeOff" : "eye"} size={18} />
                      </button>
                    </div>
                  </div>
                  {WA_TU && (
                    <a className="forgot-link" href={`https://wa.me/${WA_TU}?text=${encodeURIComponent("Assalamualaikum, saya orang tua siswa. Saya lupa NIS/PIN presensi.")}`} target="_blank" rel="noopener noreferrer">
                      Lupa NIS atau PIN? Hubungi TU sekolah
                    </a>
                  )}
                </>
              ) : (
                <>
                  <div className="field">
                    <label htmlFor="email">Email</label>
                    <div className={`input-wrap ${errors.email ? "input-error" : ""}`}>
                      <Icon name="users" size={18} />
                      <input ref={firstInputRef} id="email" name="email" type="email" autoComplete="username" placeholder="admin@sekolah.sch.id"
                        value={email} onChange={(e) => { setEmail(e.target.value); setErrors({}); }}
                        aria-invalid={Boolean(errors.email || errors.general)} aria-describedby={described} disabled={disabled} />
                    </div>
                  </div>
                  <div className="field">
                    <label htmlFor="password">Password</label>
                    <div className={`input-wrap ${errors.password ? "input-error" : ""}`}>
                      <Icon name="lock" size={18} />
                      <input id="password" name="password" type={showSecret ? "text" : "password"} autoComplete="current-password" placeholder="Masukkan password"
                        value={password} onChange={(e) => { setPassword(e.target.value); setErrors({}); }}
                        aria-invalid={Boolean(errors.password || errors.general)} aria-describedby={described} disabled={disabled} />
                      <button type="button" className="password-toggle" aria-label={showSecret ? "Sembunyikan password" : "Tampilkan password"} onClick={() => setShowSecret((v) => !v)}>
                        <Icon name={showSecret ? "eyeOff" : "eye"} size={18} />
                      </button>
                    </div>
                  </div>
                  <label className="remember">
                    <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} disabled={disabled} />
                    <span>Ingat saya di perangkat ini</span>
                  </label>
                </>
              )}
            </div>

            <div className="login-error-slot">
              {(errorMessages.length > 0 || lockRemaining > 0) && (
                <div className="login-error-box" id="login-error" role="alert">
                  <Icon name="warning" size={17} />
                  <div>
                    {lockRemaining > 0
                      ? <span>Terlalu banyak percobaan gagal. Coba lagi dalam {minutes}:{seconds}</span>
                      : errorMessages.map((m) => <span key={m}>{m}</span>)}
                  </div>
                </div>
              )}
            </div>

            <button className="login-submit" type="submit" disabled={disabled}>
              {loading ? <><span className="spinner" />Memproses...</> : mode === "ortu" ? "Lihat Kehadiran" : "Masuk"}
            </button>
          </form>
          <p className="login-footer">© {new Date().getFullYear()} MA Nurul Huda Mergosono</p>
        </div>
      </section>
    </main>
  );
}
