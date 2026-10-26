// E2E v2.5.1: laporan wali/BK (CSV), tandai/batalkan hapus akun, lencana pembinaan Kepala dan Penugasan BK (waka).
// Jalankan sendiri: npx firebase-tools emulators:exec --only auth,database --project demo-presensi "npx playwright test v251"
// Dua project (desktop & mobile) dengan namespace sendiri; berurutan (serial). Hanya ke emulator lokal.
import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { PROJECTS } from "./setup.mjs";
import { hariNyata, hitungTanggal } from "./tanggal.mjs";

const T = hitungTanggal();
const PASSWORD = "password-uji-123";
const DB_URL = "http://127.0.0.1:9000";
const AUTH_URL = "http://127.0.0.1:9099";
const OWNER = { Authorization: "Bearer owner", "Content-Type": "application/json" };
const WAKTU = T.waktu; // 16:00 WIB hari nyata (hanya JAM yang dipatok; hari = hari nyata agar lolos rules log)

test.describe.configure({ mode: "serial" });
test.beforeEach(({}, ti) => { ti.skip(!T.dapatDijalankan, "Hari nyata = Minggu (libur): skenario hari kerja E2E tidak dapat dijalankan (jam server nyata). Jalankan Senin-Sabtu."); });

const proyek = () => test.info().project.name;
const ns = () => PROJECTS[proyek()].ns;
const emailStaf = (p) => `${p}.${proyek()}@e2e.test`;
const rest = async (method, path, body) => {
  const res = await fetch(`${DB_URL}/${path}.json?ns=${ns()}`, { method, headers: OWNER, body: body === undefined ? undefined : JSON.stringify(body) });
  if (!res.ok) throw new Error(`REST ${method} ${path}: ${res.status} ${await res.text()}`);
  return res.json();
};
const buatAkun = async (email) => {
  const r = await fetch(`${AUTH_URL}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password: PASSWORD, returnSecureToken: true }) });
  const j = await r.json();
  if (j.localId) return j.localId;
  const m = await (await fetch(`${AUTH_URL}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password: PASSWORD, returnSecureToken: true }) })).json();
  if (!m.localId) throw new Error(`gagal menyiapkan akun ${email}: ${JSON.stringify(j)}`);
  return m.localId;
};
const taDari = (tgl) => { const y = Number(tgl.slice(0, 4)), m = Number(tgl.slice(5, 7)); return m >= 7 ? `${y}-${y + 1}` : `${y - 1}-${y}`; };
const TA = taDari(T.hariIni);

function ubahJabatTangan(pesan, ts) {
  if (typeof pesan !== "string" || !pesan.includes('"t":"h"')) return pesan;
  try { const j = JSON.parse(pesan); if (j?.d?.t === "h" && j.d.d) { j.d.d.ts = ts; return JSON.stringify(j); } } catch { /* teruskan */ }
  return pesan;
}
async function siapkan(page) {
  const lap = { permission: [], error: [], nonLokal: [] };
  await page.clock.setFixedTime(WAKTU);
  await page.routeWebSocket(/\/\.ws\?/, (ws) => { const s = ws.connectToServer(); ws.onMessage((m) => s.send(m)); s.onMessage((m) => ws.send(ubahJabatTangan(m, WAKTU.getTime()))); });
  await page.route("**/*", (route) => {
    const u = new URL(route.request().url());
    if (["127.0.0.1", "localhost"].includes(u.hostname) || u.protocol === "data:" || u.protocol === "blob:") return route.continue();
    if (!/^(fonts\.googleapis\.com|fonts\.gstatic\.com|apis\.google\.com)$/.test(u.hostname)) lap.nonLokal.push(u.hostname);
    return route.abort();
  });
  page.on("console", (m) => { const t = m.text(); if (/permission[_ ]denied|PERMISSION_DENIED/i.test(t) && (m.type() === "warning" || m.type() === "error")) lap.permission.push(t); });
  page.on("pageerror", (e) => lap.error.push(String(e)));
  page.on("websocket", (ws) => { if (/\/\.ws\?/.test(ws.url())) ws.on("framereceived", (f) => { if (/permission_denied/i.test(String(f.payload))) lap.permission.push(`WebSocket: ${String(f.payload).slice(0, 200)}`); }); });
  return lap;
}
async function sehat(page) {
  await page.waitForTimeout(350);
  await expect(page.getByText(/tidak dapat dimuat|Gagal memuat|Akses ditolak/i), "pesan galat data tampil").toHaveCount(0);
}
async function masuk(page, email) {
  await page.goto("/login");
  await page.getByRole("tab", { name: "Admin" }).click();
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(PASSWORD);
  await page.locator("button.login-submit").click();
  await page.waitForURL(/\/(admin|kepala|waka|piket|wali|bk)$/);
  await sehat(page);
}
async function menu(page, nama) {
  await page.locator("aside.sidebar").waitFor({ state: "attached" });
  const burger = page.locator("button.mobile-menu");
  if (await burger.isVisible()) await burger.click();
  const polos = nama.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  await page.locator("aside.sidebar").getByRole("link", { name: new RegExp(`^${polos}( \\d+ menunggu)?$`) }).click();
  await sehat(page);
}
const lencana = (page, kunci) => page.getByTestId(`lencana-${kunci}`);
/** Buang penolakan log aktivitas best-effort (hari server palsu bila tengah malam terlewati); sisanya pelanggaran. */
const bersih = (lap, who) => {
  expect(lap.nonLokal, `${who}: request ke luar emulator`).toEqual([]);
  expect(lap.error, `${who}: error lain`).toEqual([]);
  expect(lap.permission, `${who}: error permission`).toEqual([]);
};
const unduh = async (page, tombol) => {
  const [dl] = await Promise.all([page.waitForEvent("download"), page.getByTestId(tombol).click()]);
  return { nama: dl.suggestedFilename(), isi: readFileSync(await dl.path(), "utf8") };
};

let uidBk, uidBkHapus;
test.beforeAll(async () => {
  // data awal v2.5.1 (idempoten): level + catatan disiplin bersih + akun BK aktif + akun BK yang SUDAH dicabut
  uidBk = await buatAkun(emailStaf("bk"));
  uidBkHapus = await buatAkun(emailStaf("bkhapus"));
  const now = Date.now();
  await rest("PATCH", "", {
    "discipline/levels": { lv01: { poin: 100, tindakan: "Teguran 1", penanggungJawab: "wali" }, lv02: { poin: 200, tindakan: "Teguran 2", penanggungJawab: "bk" }, lv03: { poin: 300, tindakan: "Teguran 3", penanggungJawab: "kepala" } },
    "discipline/records": null, "discipline/recordMeta": null, klaimBK: null, pembinaan: null, "discipline/levelTerpakai": null, hapusAkun: null,
    [`roles/${uidBk}`]: "bk",
    [`staff/${uidBk}`]: { email: emailStaf("bk"), nama: "Bu BK E2E", role: "bk", dibuat: now },
    [`bkAkun/${uidBk}`]: { email: emailStaf("bk"), nama: "Bu BK E2E", aktif: true },
    [`roles/${uidBkHapus}`]: null,
    [`staff/${uidBkHapus}`]: { email: emailStaf("bkhapus"), nama: "BK Dicabut E2E", role: "bk", dibuat: now },
    [`bkAkun/${uidBkHapus}`]: { email: emailStaf("bkhapus"), nama: "BK Dicabut E2E", aktif: false },
  });
  const catat = (nis, id, poin) => ({ [`discipline/records/${nis}/${id}`]: { jenis: "pelanggaran", nama: "Pelanggaran uji", kategori: "Ringan", poin, tanggal: T.kemarin, ta: TA, sumber: "manual" }, [`discipline/recordMeta/${nis}/${id}`]: { dibuatOleh: "seed", dibuatNama: "Seed", dibuatTs: now } });
  await rest("PATCH", "", { ...catat("333", "r1", 320), ...catat("444", "r1", 210), ...catat("555", "r1", 40) });   // 333 -> ambang BK + Kepala; 444 -> ambang BK; 555 belum
});

test("wali: Laporan hanya siswa binaan; CSV titik koma; log ekspor tanpa NIS", async ({ page }) => {
  const lap = await siapkan(page);
  await masuk(page, emailStaf("wali"));
  await menu(page, "Laporan");
  await expect(page.getByTestId("laporan-wali-bk")).toBeVisible();
  await expect(page.getByTestId("tampilkan-laporan")).toBeEnabled();
  await page.getByTestId("tampilkan-laporan").click();
  await expect(page.getByTestId("hasil-laporan")).toBeVisible();
  const nis = await page.locator("table.laporan-tabel tr[data-nis]").evaluateAll((r) => r.map((x) => x.getAttribute("data-nis")).sort());
  expect(nis, "hanya siswa kelas binaan (X IPA)").toEqual(["333", "444", "555", "666", "777"]);
  const head = await page.locator("table.laporan-tabel thead th").allTextContents();
  expect(head.join("|")).toContain("Pembinaan 100 poin");
  expect(head.join("|"), "wali tidak melihat kolom level BK/Kepala").not.toMatch(/Pembinaan (200|300) poin/);
  const f = await unduh(page, "unduh-laporan");
  expect(f.nama).toMatch(/^laporan_wali_X-IPA_\d{4}-\d{2}-\d{2}_\d{4}-\d{2}-\d{2}\.csv$/);
  expect(f.isi.startsWith("﻿"), "BOM").toBe(true);
  const baris = f.isi.slice(1).split("\r\n");
  expect(baris[0]).toContain('"NIS";"Nama";"Kelas"');
  expect(baris.length, "header + 5 siswa").toBe(6);
  expect(f.isi).not.toMatch(/"111"|"222"/);
  for (const dilarang of ["PIN", "UID", "Konseling", "Klaim"]) expect(f.isi).not.toContain(dilarang);
  const log = await rest("GET", `activity/${hariNyata()}`);
  const entri = Object.values(log ?? {}).filter((e) => e.aksi === "ekspor-laporan");
  expect(entri.length, "log ekspor tercatat").toBeGreaterThanOrEqual(1);
  expect(entri.every((e) => /laporan wali, kelas X IPA/.test(e.detail) && !/\b\d{3}\b/.test(e.detail.replace(/\d{4}-\d{2}-\d{2}/g, "")))).toBe(true);
  bersih(lap, "wali laporan");
});

test("BK: Laporan semua kelas, filter kelas, CSV tanpa kolom terlarang", async ({ page }) => {
  const lap = await siapkan(page);
  await masuk(page, emailStaf("bk"));
  await menu(page, "Laporan");
  await expect(page.getByTestId("tampilkan-laporan")).toBeEnabled();
  await page.getByTestId("tampilkan-laporan").click();
  await expect(page.getByTestId("hasil-laporan")).toBeVisible();
  const semua = await page.locator("table.laporan-tabel tr[data-nis]").count();
  expect(semua, "semua siswa terindeks (7)").toBe(7);
  const head = (await page.locator("table.laporan-tabel thead th").allTextContents()).join("|");
  expect(head).toContain("Pembinaan 100 poin"); expect(head).toContain("Pembinaan 200 poin");
  expect(head, "BK tidak melihat kolom level Kepala").not.toContain("Pembinaan 300 poin");
  await page.locator("select[aria-label=Kelas]").selectOption("X IPA");
  await page.getByTestId("tampilkan-laporan").click();
  await expect(page.locator("table.laporan-tabel tr[data-nis]")).toHaveCount(5);
  const f = await unduh(page, "unduh-laporan");
  expect(f.nama).toMatch(/^laporan_bk_X-IPA_/);
  for (const dilarang of ["PIN", "UID", "Hasil", "Tindak lanjut", "Konseling", "Klaim", "Bu BK"]) expect(f.isi, `kolom/isi terlarang: ${dilarang}`).not.toContain(dilarang);
  expect(f.isi).toContain('"333";"CITRA TEST"');
  const log = await rest("GET", `activity/${hariNyata()}`);
  expect(Object.values(log ?? {}).some((e) => e.aksi === "ekspor-laporan" && /laporan bk, kelas X IPA/.test(e.detail))).toBe(true);
  bersih(lap, "bk laporan");
});

test("admin: tandai hapus permanen akun BK yang dicabut lalu batalkan; admin tidak membaca klaim", async ({ page }) => {
  const lap = await siapkan(page);
  await masuk(page, emailStaf("admin"));
  await menu(page, "Guru BK");
  const baris = page.locator(`[data-uid="${uidBkHapus}"]`);
  await expect(baris.getByText("Dicabut", { exact: true })).toBeVisible();
  await expect(page.locator(`[data-uid="${uidBk}"]`).getByTestId("tandai-hapus"), "akun aktif tidak punya tombol hapus").toHaveCount(0);
  await baris.getByTestId("tandai-hapus").click();
  const dlg = page.getByTestId("form-tandai-hapus");
  await expect(dlg.getByTestId("peringatan-klaim-bk")).toContainText("Pastikan klaim BK akun ini sudah dilepas/dipindah oleh Waka. Skrip akan menolak bila masih ada klaim aktif.");
  await dlg.getByRole("button", { name: "Tandai hapus permanen" }).click();
  await expect(dlg.getByText("Alasan 10-300 karakter")).toBeVisible();
  await dlg.getByLabel("Alasan penghapusan").fill("Guru sudah pindah tugas ke sekolah lain");
  await dlg.getByLabel("Ketik email untuk konfirmasi").fill("salah@x.test");
  await dlg.getByRole("button", { name: "Tandai hapus permanen" }).click();
  await expect(dlg.getByText(/Ketik email akun persis/)).toBeVisible();
  await dlg.getByLabel("Ketik email untuk konfirmasi").fill(emailStaf("bkhapus"));
  await dlg.getByRole("button", { name: "Tandai hapus permanen" }).click();
  await expect(dlg).toHaveCount(0);
  expect((await rest("GET", `hapusAkun/${uidBkHapus}`))?.peran).toBe("bk");
  await menu(page, "Pengaturan");
  const panel = page.getByTestId("menunggu-dihapus");
  await expect(panel.getByTestId("jumlah-menunggu-hapus")).toHaveText("1");
  await panel.getByTestId("batal-tanda-hapus").click();
  await expect(panel.getByTestId("jumlah-menunggu-hapus")).toHaveText("0");
  expect(await rest("GET", `hapusAkun/${uidBkHapus}`)).toBeNull();
  const log = Object.values((await rest("GET", `activity/${hariNyata()}`)) ?? {}).map((e) => e.aksi);
  expect(log).toContain("tandai-hapus-akun"); expect(log).toContain("batal-hapus-akun");
  bersih(lap, "admin hapus akun");
});

test("lencana: Penugasan BK (waka) dan Perlu dibina Kepala muncul lalu hilang setelah ditangani", async ({ page, browser }) => {
  const lap = await siapkan(page);
  await masuk(page, emailStaf("waka"));
  await expect(lencana(page, "penugasan-bk"), "333 dan 444 pada ambang BK, belum diklaim").toHaveText("2");
  await expect(lencana(page, "pembinaan"), "waka tidak berlangganan jalur kepala: tanpa lencana pembinaan").toHaveCount(0);
  await menu(page, "Penugasan BK");
  await expect(page.getByTestId("daftar-penugasan").locator("[data-nis]")).toHaveCount(2);
  for (const nis of ["333", "444"]) {
    await page.locator(`[data-nis="${nis}"]`).getByTestId("tunjuk-bk").click();
    const f = page.getByTestId("form-tunjuk-bk");
    await f.getByLabel("Guru BK").selectOption({ label: "Bu BK E2E" });
    await f.getByRole("button", { name: "Tunjuk", exact: true }).click();
    await expect(f).toHaveCount(0);
  }
  await expect(lencana(page, "penugasan-bk"), "setelah ditunjuk: lencana hilang").toHaveCount(0);
  await expect(page.locator('[data-testid="bk-penangan"]')).toHaveCount(2);
  bersih(lap, "waka lencana");

  // Kepala: ambang Kepala (lv03) hanya 333 -> lencana 1; setelah dicatat selesai lencana hilang
  const ctx = await browser.newContext({ baseURL: test.info().project.use.baseURL, viewport: test.info().project.use.viewport, isMobile: test.info().project.use.isMobile, hasTouch: test.info().project.use.hasTouch });
  const k = await ctx.newPage();
  const lapK = await siapkan(k);
  await masuk(k, emailStaf("kepala"));
  await expect(lencana(k, "pembinaan")).toHaveText("1");
  await expect(lencana(k, "penugasan-bk"), "kepala melihat lencana Penugasan BK yang sama (kini 0)").toHaveCount(0);
  await menu(k, "Pembinaan");
  const bagian = k.getByTestId("perlu-dibina-kepala");
  await expect(bagian.getByTestId("jumlah-perlu-dibina-kepala")).toHaveText("1");
  await expect(bagian.locator('[data-nis="333"][data-level="lv03"]')).toBeVisible();
  await bagian.getByTestId("catat-pembinaan-kepala").click();
  const form = k.getByTestId("form-pembinaan");
  await form.locator("textarea").first().fill("Pembinaan intensif oleh Kepala Madrasah bersama Ndalem.");
  await form.getByRole("button", { name: "Simpan" }).click();
  await expect(form).toHaveCount(0);
  await expect(bagian.getByTestId("jumlah-perlu-dibina-kepala")).toHaveText("0");
  await expect(lencana(k, "pembinaan"), "lencana hilang setelah selesai dibina").toHaveCount(0);
  const rec = await rest("GET", `pembinaan/kepala/333/${TA}_lv03`);
  expect(rec?.pj).toBe("kepala"); expect(rec?.status).toBe("selesai");
  expect(await rest("GET", "discipline/levelTerpakai/lv03")).toBe(true);
  bersih(lapK, "kepala lencana");
  await ctx.close();
});
