import { initializeApp, type FirebaseApp, type FirebaseOptions } from "firebase/app";
import { connectAuthEmulator, getAuth, inMemoryPersistence, setPersistence, type Auth } from "firebase/auth";
import { connectDatabaseEmulator, getDatabase, type Database } from "firebase/database";

const env = import.meta.env;

export const firebaseConfig: FirebaseOptions = {
  apiKey: env.VITE_FIREBASE_API_KEY,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  databaseURL: env.VITE_FIREBASE_DATABASE_URL,
  projectId: env.VITE_FIREBASE_PROJECT_ID,
  appId: env.VITE_FIREBASE_APP_ID,
};

export const USE_EMULATOR = env.VITE_USE_EMULATOR === "1";
export const CONFIG_OK = Boolean(firebaseConfig.apiKey && firebaseConfig.databaseURL && firebaseConfig.projectId);

/** Domain email fiktif akun orang tua — HARUS sama dgn ORTU_DOMAIN di migrasi.py. */
export const ORTU_DOMAIN = "ortu.presensi-ma.local";
export const emailOrtu = (nis: string, ver: number) => `${nis}.${ver}@${ORTU_DOMAIN}`;

let app: FirebaseApp | null = null;
let auth: Auth | null = null;
let db: Database | null = null;

function wire(a: Auth, d: Database | null) {
  if (!USE_EMULATOR) return;
  connectAuthEmulator(a, "http://127.0.0.1:9099", { disableWarnings: true });
  if (d) connectDatabaseEmulator(d, "127.0.0.1", 9000);
}

export function fb() {
  if (!CONFIG_OK) throw new Error("Konfigurasi Firebase (.env) belum diisi");
  if (!app) {
    app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getDatabase(app);
    wire(auth, db);
  }
  return { app: app!, auth: auth!, db: db! };
}

let secondaryAuth: Auth | null = null;
/**
 * Auth terpisah untuk MEMBUAT akun orang tua dari sesi admin.
 * createUserWithEmailAndPassword di instance utama akan mengganti sesi admin;
 * instance kedua (in-memory) menghindarinya — tanpa Cloud Functions (paket Spark).
 */
export async function getSecondaryAuth() {
  if (!secondaryAuth) {
    const second = initializeApp(firebaseConfig, "pembuat-akun");
    secondaryAuth = getAuth(second);
    await setPersistence(secondaryAuth, inMemoryPersistence);
    wire(secondaryAuth, null);
  }
  return secondaryAuth;
}
