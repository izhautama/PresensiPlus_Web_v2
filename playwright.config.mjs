// E2E terhadap Firebase Emulator (auth 9099 + database 9000). Jalankan: npm run test:e2e
// Dua project: "desktop" (1280x900) dan "mobile" (390x844, sentuh). Masing-masing punya server Vite + namespace RTDB sendiri.
// App dijalankan dengan env VITE_* yang MENIMPA .env (env proses lebih diutamakan Vite) dan VITE_USE_EMULATOR=1,
// sehingga tidak pernah menyentuh project produksi. Setiap request non-lokal diblok dan dilaporkan oleh uji.
import { defineConfig } from "@playwright/test";
import { PROJECTS } from "./tests/e2e/setup.mjs";

const server = ([nama, { ns, port }]) => ({
  command: `npx vite --port ${port} --strictPort --host 127.0.0.1`,
  url: `http://127.0.0.1:${port}/login`,
  reuseExistingServer: false,
  timeout: 90_000,
  env: {
    VITE_FIREBASE_API_KEY: "fake-api-key",
    VITE_FIREBASE_AUTH_DOMAIN: "localhost",
    VITE_FIREBASE_DATABASE_URL: `https://${ns}.firebaseio.com`,
    VITE_FIREBASE_PROJECT_ID: "demo-presensi",
    VITE_FIREBASE_APP_ID: `1:1:web:e2e-${nama}`,
    VITE_USE_EMULATOR: "1",
  },
});

export default defineConfig({
  testDir: "tests/e2e",
  testMatch: /.*\.spec\.mjs/,
  globalSetup: "./tests/e2e/setup.mjs",
  timeout: 120_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: { trace: "retain-on-failure", screenshot: "only-on-failure" },
  projects: [
    { name: "desktop", use: { baseURL: `http://127.0.0.1:${PROJECTS.desktop.port}`, viewport: { width: 1280, height: 900 } } },
    {
      name: "mobile",
      use: {
        baseURL: `http://127.0.0.1:${PROJECTS.mobile.port}`,
        viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true,
        userAgent: "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36",
      },
    },
  ],
  webServer: Object.entries(PROJECTS).map(server),
});
