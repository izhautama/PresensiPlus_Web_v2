import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { get, onValue } from "firebase/database";
import { CONFIG_OK, ORTU_DOMAIN, fb } from "../lib/firebase";
import { siapkanLabelPerangkat } from "../lib/perangkat";
import { catatAktivitas, muatOffsetServer, setKonteksAktivitas } from "../services/aktivitas";
import { r } from "../services/db";
import { mulaiRealtimeStaf } from "../services/koneksi";

export type Session =
  | { role: "admin"; uid: string; email: string }
  | { role: "kepala" | "waka" | "piket"; uid: string; email: string; nama: string }
  | { role: "ortu"; uid: string; nis: string }
  | null;

type AuthContextValue = { session: Session; ready: boolean };

const AuthContext = createContext<AuthContextValue>({ session: null, ready: false });
const IDLE_MS = 30 * 60 * 1000; // ortu otomatis keluar setelah 30 menit tidak aktif

const KEY_LOGIN = "aktivitas-login";

/** Siapkan konteks log aktivitas staf; "login" dicatat sekali per sesi tab (bukan setiap muat ulang). */
async function mulaiAktivitas(uid: string, peran: "admin" | "kepala" | "waka" | "piket", email: string) {
  setKonteksAktivitas({ uid, peran, email });
  await Promise.all([muatOffsetServer(), siapkanLabelPerangkat()]);
  let sudah = false;
  try { sudah = sessionStorage.getItem(KEY_LOGIN) === uid; sessionStorage.setItem(KEY_LOGIN, uid); } catch { /* penyimpanan tidak tersedia */ }
  if (!sudah) await catatAktivitas("login");
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session>(null);
  const [ready, setReady] = useState(!CONFIG_OK);

  useEffect(() => {
    if (!CONFIG_OK) return;
    const { auth } = fb();
    return onAuthStateChanged(auth, async (user) => {
      if (!user?.email) {
        // keluar dengan cara apa pun (termasuk akun dikunci/peran dicabut): pilihan petugas piket tidak boleh terbawa ke login berikutnya
        setKonteksAktivitas(null);
        try { sessionStorage.removeItem("piket-petugas"); sessionStorage.removeItem(KEY_LOGIN); } catch { /* penyimpanan tidak tersedia */ }
        setSession(null); setReady(true); return;
      }
      try {
        if (user.email.endsWith(`@${ORTU_DOMAIN}`)) {
          setSession({ role: "ortu", uid: user.uid, nis: user.email.split(".")[0] });
        } else {
          mulaiRealtimeStaf(); // staf (termasuk muat ulang halaman dengan sesi tersimpan): realtime
          const role = (await get(r(`roles/${user.uid}`))).val();
          if (role === "admin") { await mulaiAktivitas(user.uid, role, user.email); setSession({ role, uid: user.uid, email: user.email }); }
          else if (role === "kepala" || role === "waka" || role === "piket") {
            // nama dipakai untuk jejak audit; staff/{uid} boleh dibaca pemiliknya sendiri
            const nama = String((await get(r(`staff/${user.uid}/nama`))).val() ?? "").trim() || user.email;
            await mulaiAktivitas(user.uid, role, user.email);
            setSession({ role, uid: user.uid, email: user.email, nama });
          }
          else { await signOut(auth); setSession(null); } // akun alat / tak dikenal tidak boleh pakai web
        }
      } catch {
        setSession(null);
      }
      setReady(true);
    });
  }, []);

  // Peran kepala/waka/piket bisa dicabut admin kapan saja: begitu dicabut atau berubah, sesi langsung ditutup
  useEffect(() => {
    if (session?.role !== "kepala" && session?.role !== "waka" && session?.role !== "piket") return;
    const peran = session.role;
    return onValue(r(`roles/${session.uid}`),
      (s) => { if (s.val() !== peran) signOut(fb().auth); },
      () => {});
  }, [session]);

  // Idle timeout khusus orang tua
  useEffect(() => {
    if (session?.role !== "ortu") return;
    let t = window.setTimeout(() => signOut(fb().auth), IDLE_MS);
    const reset = () => { window.clearTimeout(t); t = window.setTimeout(() => signOut(fb().auth), IDLE_MS); };
    const ev = ["pointerdown", "keydown", "scroll", "visibilitychange"];
    ev.forEach((e) => window.addEventListener(e, reset, { passive: true }));
    return () => { window.clearTimeout(t); ev.forEach((e) => window.removeEventListener(e, reset)); };
  }, [session]);

  const value = useMemo(() => ({ session, ready }), [session, ready]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
