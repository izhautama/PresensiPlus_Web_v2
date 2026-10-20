import {
  browserLocalPersistence, browserSessionPersistence, setPersistence,
  signInWithEmailAndPassword, signOut, updatePassword, reauthenticateWithCredential, EmailAuthProvider,
} from "firebase/auth";
import { get } from "firebase/database";
import { emailOrtu, fb } from "../lib/firebase";
import { catatAktivitas } from "./aktivitas";
import { akhiriRealtimeStaf, bacaSekali, mulaiRealtimeStaf } from "./koneksi";
import { r } from "./db";

export type LoginResult = { success: true } | { success: false; message: string };

function pesanError(e: unknown, generik: string): string {
  const code = (e as { code?: string }).code ?? "";
  if (code === "auth/too-many-requests") return "Terlalu banyak percobaan. Coba lagi beberapa menit lagi.";
  if (code === "auth/network-request-failed") return "Tidak ada koneksi internet.";
  return generik;
}

export async function loginAdmin(email: string, password: string, remember: boolean): Promise<LoginResult> {
  const { auth } = fb();
  try {
    mulaiRealtimeStaf(); // staf: koneksi realtime terbuka terus (mis. setelah sesi orang tua di tab yang sama)
    await setPersistence(auth, remember ? browserLocalPersistence : browserSessionPersistence);
    const cred = await signInWithEmailAndPassword(auth, email.trim(), password);
    const role = (await get(r(`roles/${cred.user.uid}`))).val();
    if (role !== "admin" && role !== "kepala" && role !== "waka" && role !== "piket" && role !== "wali" && role !== "bk") {
      await signOut(auth);
      return { success: false, message: "Email atau password salah" }; // generik: jangan bocorkan akun ada
    }
    return { success: true };
  } catch (e) {
    return { success: false, message: pesanError(e, "Email atau password salah") };
  }
}

export async function loginOrangTua(nis: string, pin: string): Promise<LoginResult> {
  const { auth } = fb();
  const generik = "NIS atau PIN salah";
  try {
    akhiriRealtimeStaf(); // portal orang tua tidak menahan koneksi realtime
    const ver = Number((await bacaSekali(() => get(r(`parents/${nis}/ver`)))).val());
    if (!ver) return { success: false, message: generik };
    await setPersistence(auth, browserSessionPersistence); // hilang saat tab ditutup (HP bersama)
    await signInWithEmailAndPassword(auth, emailOrtu(nis, ver), pin);
    return { success: true };
  } catch (e) {
    return { success: false, message: pesanError(e, generik) };
  }
}

export async function logout() {
  await catatAktivitas("logout"); // sebelum sesi ditutup; tidak pernah melempar
  try { sessionStorage.removeItem("aktivitas-login"); } catch { /* abaikan */ }
  try { sessionStorage.removeItem("piket-petugas"); } catch { /* penyimpanan tidak tersedia */ } // pilihan petugas piket hanya berlaku per sesi
  akhiriRealtimeStaf();
  await signOut(fb().auth);
}

export async function gantiPasswordAdmin(lama: string, baru: string) {
  const user = fb().auth.currentUser;
  if (!user?.email) throw new Error("Sesi tidak valid");
  await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, lama));
  await updatePassword(user, baru);
}
