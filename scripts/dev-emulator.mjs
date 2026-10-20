// Coba aplikasi secara LOKAL terhadap Firebase Emulator (tidak menyentuh produksi): npm run dev:emu
// Menjalankan emulator Auth + Database, memuat Security Rules dari database.rules.json, mengisi data uji (sama dengan E2E), lalu server Vite di
// http://127.0.0.1:5173 yang terhubung ke emulator. Tekan Ctrl+C untuk berhenti (emulator ikut dimatikan; data hilang).
import { spawn, execFileSync } from "node:child_process";
import net from "node:net";
import setup, { PASSWORD, PROJECTS } from "../tests/e2e/setup.mjs";

const NS = PROJECTS.desktop.ns;
const PORT = 5173;
const bunuh = (pid) => { try { execFileSync("taskkill", ["/PID", String(pid), "/T", "/F"], { stdio: "ignore" }); } catch { /* sudah mati */ } };
const siap = (port) => new Promise((ok) => { const s = net.connect(port, "127.0.0.1"); s.once("connect", () => { s.destroy(); ok(true); }); s.once("error", () => ok(false)); });
const tunggu = async (port, nama) => { for (let i = 0; i < 90; i++) { if (await siap(port)) return; await new Promise((r) => setTimeout(r, 1000)); } throw new Error(`${nama} tidak siap`); };

const emu = spawn("npx firebase-tools emulators:start --only auth,database --project demo-presensi", { shell: true, stdio: "ignore", windowsHide: true });
let vite = null;
const selesai = () => { if (vite) bunuh(vite.pid); bunuh(emu.pid); process.exit(0); };
process.on("SIGINT", selesai); process.on("SIGTERM", selesai); process.on("exit", () => { if (vite) bunuh(vite.pid); bunuh(emu.pid); });

console.log("Memulai emulator (Auth 9099, Database 9000)…");
await tunggu(9000, "Database Emulator"); await tunggu(9099, "Auth Emulator");
console.log("Mengisi data uji dan Security Rules…");
await setup();

vite = spawn(`npx vite --port ${PORT} --strictPort --host 127.0.0.1`, {
  shell: true, stdio: "inherit", windowsHide: true,
  env: {
    ...process.env, VITE_FIREBASE_API_KEY: "fake-api-key", VITE_FIREBASE_AUTH_DOMAIN: "localhost", VITE_FIREBASE_DATABASE_URL: `https://${NS}.firebaseio.com`,
    VITE_FIREBASE_PROJECT_ID: "demo-presensi", VITE_FIREBASE_APP_ID: "1:1:web:dev-emu", VITE_USE_EMULATOR: "1",
  },
});
console.log(`
==========================================================
 Aplikasi lokal : http://127.0.0.1:${PORT}/login  (tab Admin untuk staf)
 Password semua akun staf: ${PASSWORD}
   admin.desktop@e2e.test   waka.desktop@e2e.test   kepala.desktop@e2e.test
   piket.desktop@e2e.test   wali.desktop@e2e.test
 Guru BK: login admin atau waka -> menu "Guru BK" -> Tambah guru BK, lalu masuk dengan akun itu.
 Orang tua: NIS 111 PIN 482915 · NIS 222 PIN 739104
 Data hilang saat dihentikan (Ctrl+C). Tidak menyentuh Firebase produksi.
==========================================================
`);
