// E2E Tahap 1–3. Dijalankan di DUA project (desktop & mobile); tiap project punya namespace data sendiri.
// Dalam satu project tes berjalan berurutan (serial) dan saling melanjutkan data.
import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { hariNyata, hitungTanggal } from "./tanggal.mjs";

const T = hitungTanggal(); // sama dengan setup.mjs: tanggal relatif hari nyata

const PASSWORD = "password-uji-123";
const SEKARANG = T.waktu; // Rabu 16:00 WIB: hari kerja, jendela pulang default (s.d. 15:00) sudah lewat
const MINGGU = T.waktuMinggu; //  Minggu 16:00 WIB: libur

test.describe.configure({ mode: "serial" });

const proyek = () => test.info().project.name; // "desktop" | "mobile"
const emailStaf = (peran) => `${peran}.${proyek()}@e2e.test`;

/** Siapkan halaman: waktu tetap, blok semua request non-lokal (jaminan tidak menyentuh produksi), kumpulkan galat. */
async function siapkan(page, waktu = SEKARANG) {
  const laporan = { permission: [], error: [], nonLokal: [], sockets: [] }; // sockets: koneksi WebSocket RTDB (uji batas 100 koneksi)
  await page.clock.setFixedTime(waktu);
  await page.route("**/*", (route) => {
    const u = new URL(route.request().url());
    if (["127.0.0.1", "localhost"].includes(u.hostname) || u.protocol === "data:" || u.protocol === "blob:") return route.continue();
    // font dan skrip gapi (apis.google.com; dimuat proaktif oleh SDK Auth di browser seluler) diblok tetapi tidak dihitung pelanggaran
    if (!/^(fonts\.googleapis\.com|fonts\.gstatic\.com|apis\.google\.com)$/.test(u.hostname)) laporan.nonLokal.push(u.hostname);
    return route.abort();
  });
  page.on("console", (m) => {
    const t = m.text();
    if (process.env.E2E_DEBUG && (m.type() === "warning" || m.type() === "error")) console.log(`[konsol:${m.type()}] ${t.slice(0, 220)}`);
    if (/permission[_ ]denied|PERMISSION_DENIED|permission/i.test(t) && (m.type() === "warning" || m.type() === "error")) laporan.permission.push(t);
    else if (m.type() === "error" && !/Failed to load resource|ERR_FAILED|fonts\./i.test(t)) laporan.error.push(t);
  });
  page.on("pageerror", (e) => laporan.error.push(String(e)));
  // Aplikasi menangani penolakan lewat callback, jadi SDK TIDAK menulis ke Console. Detektor yang andal: frame WebSocket RTDB.
  page.on("websocket", (ws) => {
    if (/\/\.ws\?/.test(ws.url())) laporan.sockets.push(ws); // hanya WebSocket Realtime Database (bukan HMR Vite)
    ws.on("framereceived", (f) => { if (/permission_denied/i.test(String(f.payload))) laporan.permission.push(`WebSocket: ${String(f.payload).slice(0, 200)}`); });
  });
  return laporan;
}

/** Tidak boleh ada pesan galat data (mis. listener ditolak rules) pada halaman saat ini. */
async function sehat(page) {
  await page.waitForTimeout(350); // beri waktu listener RTDB menjawab
  await expect(page.getByText(/tidak dapat dimuat|Gagal memuat|Akses ditolak/i), "pesan galat data tampil di halaman").toHaveCount(0);
}

async function loginStaf(page, peran) {
  await page.goto("/login");
  await page.getByRole("tab", { name: "Admin" }).click();
  await page.locator("#email").fill(emailStaf(peran));
  await page.locator("#password").fill(PASSWORD);
  await page.locator("button.login-submit").click();
  await page.waitForURL(/\/(admin|kepala|waka|piket)$/);
  await sehat(page);
}

async function loginOrtu(page, nis, pin) {
  await page.goto("/login");
  await page.getByRole("tab", { name: /Orang Tua/ }).click();
  await page.locator("#nis").fill(nis);
  await page.locator("#pin").fill(pin);
  await page.locator("button.login-submit").click();
  await page.waitForURL(/\/siswa\//);
  await sehat(page);
}

/** Klik menu sidebar. Di HP sidebar tersembunyi di balik tombol hamburger. */
async function menu(page, nama) {
  await page.locator("aside.sidebar").waitFor({ state: "attached" }); // layout (chunk lazy) harus sudah termuat sebelum menilai hamburger
  const burger = page.locator("button.mobile-menu");
  if (await burger.isVisible()) await burger.click();
  await page.locator("aside.sidebar").getByRole("link", { name: nama, exact: true }).click();
  await sehat(page);
}
const judul = (page) => page.locator(".page-title p");
/** Rekam semua teks toast yang pernah muncul (toast hilang sendiri dalam 3-5 dtk; jangan bergantung pada waktu baca). */
async function rekamToast(page) {
  await page.evaluate(() => {
    window.__toasts = [];
    new MutationObserver(() => {
      document.querySelectorAll(".toast").forEach((e) => { const t = e.textContent ?? ""; if (t && !window.__toasts.includes(t)) window.__toasts.push(t); });
    }).observe(document.body, { subtree: true, childList: true, characterData: true });
  });
}
const toastTerekam = (page) => page.evaluate(() => window.__toasts ?? []);
const toast = (page) => page.locator(".toast");

async function pilihSiswa(page, dialog, kata, nama) {
  await dialog.getByPlaceholder("Ketik NIS atau nama siswa...").fill(kata);
  await page.locator(".picker-list li[role=option]", { hasText: nama }).click();
}

/** Buang paling banyak `n` penolakan "update at /" (+ frame WebSocket pendampingnya) yang memang diuji; selebihnya tetap pelanggaran. */
function kecualikan(l, n = 1) {
  let sisa = n, sisaWs = n;
  return { ...l, permission: l.permission.filter((x) => {
    if (/update at \/ failed: permission_denied/.test(x) && sisa > 0) { sisa--; return false; }
    if (x.startsWith("WebSocket:") && sisaWs > 0) { sisaWs--; return false; }
    return true;
  }) };
}

/** Login piket lalu pilih petugas (layar wajib). */
async function masukPiket(page, petugas = "Bu Rina") {
  await loginStaf(page, "piket");
  await page.getByRole("option", { name: petugas }).click();
  await expect(page.getByTestId("petugas-aktif")).toHaveText(petugas);
  await sehat(page);
}

function bersih(laporan, who) {
  expect(laporan.nonLokal, `${who}: request ke luar emulator (app tidak boleh menyentuh produksi)`).toEqual([]);
  expect(laporan.permission, `${who}: error permission`).toEqual([]);
  expect(laporan.error, `${who}: error lain di Console`).toEqual([]);
}

/** Opsi konteks baru yang meniru project aktif (viewport/sentuh/baseURL). */
function opsiKonteks() {
  const u = test.info().project.use;
  return { baseURL: u.baseURL, viewport: u.viewport, isMobile: u.isMobile, hasTouch: u.hasTouch, deviceScaleFactor: u.deviceScaleFactor, userAgent: u.userAgent };
}

// ===================================================================== TAHAP B
test("laporan kesiswaan 'Kehadiran per jam' mengabaikan hari Minggu", async ({ page }) => {
  // Data awal: CITRA jam 1-3 Alfa & EKO jam 1 Alfa HANYA pada hari Minggu; CITRA jam 2 Dispensasi pada hari kerja.
  const lap = await siapkan(page);
  await loginStaf(page, "waka");
  await menu(page, "Laporan");
  await page.getByRole("tab", { name: "Kehadiran per jam" }).click();
  await page.locator("input[type=month]").fill(T.mingguBulanIni.slice(0, 7));
  const citra = page.locator(".table-row.lap-jam", { hasText: "CITRA TEST" });
  await expect(citra).toHaveCount(1); // ada ketidakhadiran hari kerja (Dispensasi) -> tampil
  const sel = citra.locator("span.num");
  await expect(sel.nth(0), "Alfa CITRA: sel hari Minggu tidak boleh dihitung").toHaveText("0");
  await expect(sel.nth(3), "Dispensasi CITRA (hari kerja)").toHaveText("1");
  await expect(page.locator(".table-row.lap-jam", { hasText: "EKO TEST" }), "EKO hanya punya sel hari Minggu").toHaveCount(0);
  await expect(page.getByText("Fikih"), "mapel dari hari Minggu tidak boleh muncul").toHaveCount(0);
  bersih(lap, "waka (laporan per jam, Minggu diabaikan)");
});

// ===================================================================== TAHAP 1
test("waka: login, tata tertib awal, pelanggaran 2 siswa, remisi, soft delete, saldo & level", async ({ page }) => {
  const lap = await siapkan(page);
  await loginStaf(page, "waka");
  await expect(page).toHaveURL(/\/waka$/);
  await expect(page.locator(".welcome-title")).toContainText("Waka Kesiswaan");

  // admin/kepala tidak boleh dimasuki waka
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/waka$/);
  await page.goto("/kepala/siswa");
  await expect(page).toHaveURL(/\/waka$/);

  // tata tertib awal
  await menu(page, "Tata tertib");
  await expect(page.getByText("Tata tertib belum diisi")).toBeVisible();
  await page.getByRole("button", { name: "Isi data tata tertib awal" }).click();
  await expect(page.getByText("Datang terlambat ke sekolah")).toBeVisible();
  await expect(page.getByText("Pencurian")).toBeVisible();
  await page.getByRole("tab", { name: "Ambang pembinaan" }).click();
  await expect(page.getByText("Teguran 1 — pembinaan wali kelas")).toBeVisible();

  // pelanggaran untuk 2 siswa sekaligus: Berkelahi (75)
  await menu(page, "Pelanggaran");
  await page.getByRole("button", { name: "Catat pelanggaran" }).first().click();
  let dlg = page.getByRole("dialog", { name: "Catat pelanggaran" });
  await pilihSiswa(page, dlg, "111", "ANDI TEST");
  await pilihSiswa(page, dlg, "222", "BUDI TEST");
  await dlg.locator("button[role=option]", { hasText: "Berkelahi" }).click();
  await expect(dlg.getByLabel("Poin")).toHaveValue("75");
  await dlg.getByRole("button", { name: /Simpan \(2 siswa\)/ }).click();
  await expect(toast(page)).toContainText("Pelanggaran dicatat untuk 2 siswa");
  await expect(page.locator("button.row-button", { hasText: "ANDI TEST" }).locator(".saldo")).toHaveText("75");
  await expect(page.locator("button.row-button", { hasText: "BUDI TEST" }).locator(".saldo")).toHaveText("75");

  // Merokok (100) hanya untuk Andi -> saldo 175, melewati ambang 100 -> dialog capaian
  await page.getByRole("button", { name: "Catat pelanggaran" }).first().click();
  dlg = page.getByRole("dialog", { name: "Catat pelanggaran" });
  await pilihSiswa(page, dlg, "111", "ANDI TEST");
  await dlg.locator("button[role=option]", { hasText: "Merokok atau membawa rokok" }).click();
  await dlg.getByRole("button", { name: /^Simpan/ }).click();
  const capaian = page.getByRole("dialog", { name: "Ambang pembinaan tercapai" });
  await expect(capaian).toBeVisible();
  await expect(capaian).toContainText("ANDI TEST");
  await expect(capaian).toContainText("Teguran 1");
  await capaian.getByRole("button", { name: "Mengerti" }).click();
  await expect(page.locator("button.row-button", { hasText: "ANDI TEST" }).locator(".saldo")).toHaveText("175");

  // remisi Juara kecamatan (25) -> 150
  await page.getByRole("button", { name: "Catat remisi" }).click();
  dlg = page.getByRole("dialog", { name: "Catat remisi" });
  await pilihSiswa(page, dlg, "111", "ANDI TEST");
  await dlg.locator("button[role=option]", { hasText: "Juara lomba tingkat kecamatan" }).click();
  await dlg.getByRole("button", { name: /^Simpan/ }).click();
  await expect(toast(page)).toContainText("Remisi dicatat");
  await page.locator("button.row-button", { hasText: "ANDI TEST" }).click();
  const detail = page.getByRole("dialog", { name: "ANDI TEST" });
  await expect(detail.locator(".disc-summary .strong b")).toHaveText("150");
  await expect(detail).toContainText("Teguran 1 — pembinaan wali kelas");
  await expect(detail).toContainText("dicatat Waka Uji");

  // soft delete Merokok -> 75 - 25 = 50; item hilang dari daftar, ada di "yang dihapus" (dicoret)
  await detail.locator("article.disc-item", { hasText: "Merokok" }).getByRole("button", { name: "Hapus catatan" }).click();
  const konfirmasi = page.getByRole("dialog", { name: "Hapus catatan?" });
  await expect(konfirmasi.getByRole("button", { name: "Hapus", exact: true })).toBeDisabled(); // alasan wajib
  await konfirmasi.getByLabel("Alasan penghapusan (wajib)").fill("salah input oleh petugas");
  await konfirmasi.getByRole("button", { name: "Hapus", exact: true }).click();
  await expect(toast(page)).toContainText("Catatan dihapus");
  await expect(detail.locator(".disc-summary .strong b")).toHaveText("50");
  await expect(detail.locator("article.disc-item", { hasText: "Merokok" })).toHaveCount(0);
  await detail.getByLabel("Tampilkan yang dihapus").check();
  const dicoret = detail.locator("article.disc-item.dihapus", { hasText: "Merokok" });
  await expect(dicoret).toBeVisible();
  await expect(dicoret).toContainText("salah input oleh petugas");
  await expect(detail.locator(".disc-level")).toContainText("Belum mencapai ambang");

  bersih(lap, "waka (kesiswaan)");
});

// ===================================================================== TAHAP 2
test("waka: presensi per jam tersimpan, validasi harian (Izin/Sakit & Alfa)", async ({ page }) => {
  const lap = await siapkan(page);
  await loginStaf(page, "waka");
  await expect(page).toHaveURL(/\/waka$/);

  await menu(page, "Presensi per jam");
  await expect(judul(page)).toHaveText("Presensi per jam");
  await page.locator("select[aria-label=Kelas]").selectOption("XI IPS");
  await page.getByLabel("Mapel jam 3").fill("TI");
  await page.getByLabel("ANDI TEST jam 3: hadir").click(); // kosong -> A
  await expect(page.getByLabel("ANDI TEST jam 3: Alfa")).toBeVisible();
  await expect(page.getByText("Belum disimpan")).toBeVisible();
  await page.getByLabel("BUDI TEST jam 5: hadir").click();
  await page.getByLabel("BUDI TEST jam 5: Alfa").click(); // A -> I
  await expect(page.getByLabel("BUDI TEST jam 5: Izin")).toBeVisible();
  await page.getByRole("button", { name: "Simpan" }).click();
  await expect(toast(page)).toContainText("Presensi per jam tersimpan");
  await expect(page.getByText("Belum disimpan")).toHaveCount(0);
  // tetap tersimpan setelah muat ulang
  await page.reload();
  await page.locator("select[aria-label=Kelas]").selectOption("XI IPS");
  await expect(page.getByLabel("ANDI TEST jam 3: Alfa")).toBeVisible();
  await expect(page.getByLabel("Mapel jam 3")).toHaveValue("TI");

  // validasi harian: hanya ANDI & BUDI yang belum tap pada 14 Okt (siswa lain sudah tap)
  await menu(page, "Validasi harian");
  await expect(page.getByText("0 dari 2")).toBeVisible();
  const budi = page.locator(".table-row", { hasText: "BUDI TEST" });
  await budi.getByRole("button", { name: "Alfa", exact: true }).click();
  const alfa = page.getByRole("dialog", { name: /Konfirmasi Alfa/ });
  await alfa.getByLabel("Catatan (opsional)").fill("tidak ada kabar");
  await alfa.getByRole("button", { name: "Konfirmasi Alfa" }).click();
  await expect(toast(page)).toContainText("BUDI TEST: Alfa terverifikasi");
  await expect(page.getByText("1 dari 2")).toBeVisible();

  const andi = page.locator(".table-row", { hasText: "ANDI TEST" });
  await andi.getByRole("button", { name: "Sakit", exact: true }).click();
  await page.getByRole("dialog", { name: /Sakit/ }).getByLabel("Catatan (opsional)").fill("surat dokter");
  await page.getByRole("dialog", { name: /Sakit/ }).getByRole("button", { name: "Simpan" }).click();
  await expect(toast(page)).toContainText("ANDI TEST: Sakit tercatat");
  await expect(page.getByText("2 dari 2")).toBeVisible();

  // jejak audit memuat Alfa + catatan pelanggaran, dengan nama petugas
  await menu(page, "Jejak audit");
  await expect(page.locator(".table-row", { hasText: `validasi/${T.hariIni}/222` })).toBeVisible();
  await expect(page.locator(".table-row", { hasText: "Waka Uji" }).first()).toBeVisible();

  bersih(lap, "waka (presensi per jam & validasi)");
});

test("orang tua: kedisiplinan tanpa data staf/terhapus, per jam & Alfa terverifikasi", async ({ page, browser }) => {
  const lap = await siapkan(page);
  await loginOrtu(page, "111", "482915");
  await expect(page).toHaveURL(/\/siswa\/111$/);

  const disiplin = page.locator("section.panel", { hasText: "Kedisiplinan" });
  await expect(disiplin.locator(".disc-summary .strong b")).toHaveText("50");
  await expect(disiplin).toContainText("Berkelahi");
  await expect(disiplin).toContainText("Juara lomba tingkat kecamatan");
  await expect(disiplin).not.toContainText("Merokok"); // catatan terhapus tidak tampil
  const isi = await page.locator("main.student-page").innerText();
  expect(isi).not.toContain("Waka Uji"); // nama staf tidak pernah sampai ke orang tua
  expect(isi).not.toContain("salah input"); // alasan hapus juga tidak
  const perJam = page.locator("section.panel", { hasText: "Ketidakhadiran per jam" });
  await expect(perJam).toContainText("Jam ke-3 (TI): Alfa");
  bersih(lap, "ortu 111");

  // ortu 222: Alfa terverifikasi tampil
  const konteks = await browser.newContext(opsiKonteks());
  const p2 = await konteks.newPage();
  const lap2 = await siapkan(p2);
  await loginOrtu(p2, "222", "739104");
  await expect(p2).toHaveURL(/\/siswa\/222$/);
  const perJam2 = p2.locator("section.panel", { hasText: "Ketidakhadiran per jam" });
  await expect(perJam2).toContainText("Alfa (terverifikasi)");
  await expect(perJam2).toContainText("Jam ke-5: Izin");
  bersih(lap2, "ortu 222");
  await konteks.close();
});

// ===================================================================== TAHAP 3
test("waka: perlu ditinjau — saran otomatis (setujui, abaikan, massal, permanen)", async ({ page }) => {
  const lap = await siapkan(page);
  await loginStaf(page, "waka");
  // dashboard menghitung saran: ANDI×2 (terlambat + tanpa tap pulang), BUDI (bolos jam), FANI, GITA (terlambat)
  await expect(page.getByTestId("jumlah-saran")).toHaveText("5");

  await menu(page, "Perlu ditinjau");
  await expect(judul(page)).toHaveText("Perlu ditinjau (saran otomatis)");
  const baris = page.locator(".saran-row");
  await expect(baris).toHaveCount(5);
  // yang TIDAK boleh disarankan: izin pulang awal (sel S), ket harian Sakit, Alfa tanpa autoMap
  for (const n of ["CITRA TEST", "DINA TEST", "EKO TEST"]) await expect(baris.filter({ hasText: n })).toHaveCount(0); // nama lengkap: "EKO" saja cocok dengan "sEKOlah"
  await expect(baris.filter({ hasText: "ANDI TEST" })).toHaveCount(2);
  await expect(baris.filter({ hasText: "BUDI TEST" })).toContainText("jam ke-2 (Matematika)");
  await expect(page.locator('.saran-row[data-tipe="bolosJam"]')).toHaveCount(1); // bolos hanya dari sel A

  // setujui satu
  await page.locator('.saran-row[data-tipe="terlambat"]', { hasText: "ANDI TEST" }).getByRole("button", { name: "Setujui" }).click();
  await expect(toast(page)).toContainText("1 saran disetujui");
  await expect(baris).toHaveCount(4);

  // abaikan satu dengan alasan
  await page.locator('.saran-row[data-tipe="tanpaTapPulang"]', { hasText: "ANDI TEST" }).getByRole("button", { name: "Abaikan" }).click();
  const dlg = page.getByRole("dialog", { name: /Abaikan 1 saran/ });
  await dlg.getByLabel("Alasan (opsional)").fill("sudah ditangani wali kelas");
  await dlg.getByRole("button", { name: "Abaikan", exact: true }).click();
  await expect(toast(page)).toContainText("1 saran diabaikan");
  await expect(baris).toHaveCount(3);

  // setujui massal: FANI + GITA
  await page.getByLabel("Pilih FANI TEST Terlambat").check();
  await page.getByLabel("Pilih GITA TEST Terlambat").check();
  await expect(page.getByText("2 dipilih")).toBeVisible();
  await page.getByRole("button", { name: "Setujui terpilih" }).click();
  await expect(toast(page)).toContainText("2 saran disetujui");
  await expect(baris).toHaveCount(1); // tersisa BUDI (bolos jam)

  // keputusan permanen: tidak muncul lagi setelah muat ulang
  await page.reload();
  await expect(page.locator(".saran-row")).toHaveCount(1);
  await expect(page.locator(".saran-row")).toContainText("BUDI TEST");

  // poin benar & berasal dari saran: ANDI 50 + 5 = 55; FANI & GITA masing-masing 5
  await menu(page, "Pelanggaran");
  await expect(page.locator("button.row-button", { hasText: "ANDI TEST" }).locator(".saldo")).toHaveText("55");
  await expect(page.locator("button.row-button", { hasText: "FANI TEST" }).locator(".saldo")).toHaveText("5");
  await expect(page.locator("button.row-button", { hasText: "GITA TEST" }).locator(".saldo")).toHaveText("5");
  await page.locator("button.row-button", { hasText: "ANDI TEST" }).click();
  const detail = page.getByRole("dialog", { name: "ANDI TEST" });
  await expect(detail.locator("article.disc-item", { hasText: "Datang terlambat ke sekolah" })).toContainText("dari saran otomatis");
  await expect(detail.locator("article.disc-item", { hasText: "Tidak tap in dan tap out" })).toHaveCount(0); // diabaikan -> tidak tercatat

  bersih(lap, "waka (saran)");
});

test("dua staf menyetujui saran yang sama bersamaan: hanya 1 record tercipta", async ({ page, browser }) => {
  const lapW = await siapkan(page);
  await loginStaf(page, "waka");
  await menu(page, "Perlu ditinjau");
  await rekamToast(page);

  const konteks = await browser.newContext(opsiKonteks());
  const p2 = await konteks.newPage();
  const lapK = await siapkan(p2);
  await loginStaf(p2, "kepala");
  await menu(p2, "Perlu ditinjau");
  await rekamToast(p2);

  const tombol = (p) => p.locator(".saran-row", { hasText: "BUDI TEST" }).getByRole("button", { name: "Setujui" });
  await expect(tombol(page)).toBeVisible();
  await expect(tombol(p2)).toBeVisible();
  // klik hampir bersamaan; bila baris sudah hilang di salah satu sisi (sinkron realtime) itu pun hasil yang sah
  await Promise.all([tombol(page).click({ timeout: 4000 }).catch(() => "hilang"), tombol(p2).click({ timeout: 4000 }).catch(() => "hilang")]);
  await expect(page.locator(".saran-row")).toHaveCount(0);
  await expect(p2.locator(".saran-row")).toHaveCount(0);

  // pesan: tepat satu keberhasilan (toast "1 saran disetujui")
  const teks = [...(await toastTerekam(page)), ...(await toastTerekam(p2))].join(" | ");
  expect((teks.match(/1 saran disetujui/g) ?? []).length, `pesan toast: ${teks}`).toBe(1);

  // tepat 1 catatan pada siswa: saldo BUDI = 75 (Berkelahi) + 30 (Tidak masuk kelas) = 105, bukan 135
  await menu(page, "Pelanggaran");
  await expect(page.locator("button.row-button", { hasText: "BUDI TEST" }).locator(".saldo")).toHaveText("105");
  await page.locator("button.row-button", { hasText: "BUDI TEST" }).click();
  const detail = page.getByRole("dialog", { name: "BUDI TEST" });
  await expect(detail.locator("article.disc-item", { hasText: "Tidak masuk kelas tanpa keterangan" })).toHaveCount(1);

  // Pihak yang kalah MEMANG ditolak rules (itu mekanisme yang diuji): izinkan tepat satu penolakan "update at /" per sisi
  // (+ satu frame WebSocket pendampingnya) dan wajib ada pesan "sudah diputuskan"; selain itu tetap tidak boleh ada.
  const kecualikanKalah = (l) => {
    let sisaWs = l.permission.some((x) => /update at \/ failed: permission_denied/.test(x)) ? 1 : 0;
    return { ...l, permission: l.permission.filter((x) => { if (/update at \/ failed/.test(x)) return false; if (x.startsWith("WebSocket:") && sisaWs > 0) { sisaWs--; return false; } return true; }) };
  };
  const kalah = [...lapW.permission, ...lapK.permission].filter((x) => /update at \/ failed: permission_denied/.test(x)).length;
  expect(kalah, "paling banyak satu pihak yang kalah").toBeLessThanOrEqual(1);
  if (kalah === 1) expect(teks).toContain("sudah diputuskan oleh staf lain");
  bersih(kecualikanKalah(lapW), "waka (serentak)");
  bersih(kecualikanKalah(lapK), "kepala (serentak)");
  await konteks.close();
});

test("waka: laporan kesiswaan (CSV, top pelanggaran, per jam) dan lembar pembinaan", async ({ page }) => {
  const lap = await siapkan(page);
  await loginStaf(page, "waka");
  await menu(page, "Laporan");
  await expect(judul(page)).toHaveText("Laporan kesiswaan");

  // per siswa + unduh CSV
  const andi = page.locator(".table-row.lap-siswa", { hasText: "ANDI TEST" });
  await expect(andi.locator(".saldo")).toHaveText("55");
  const [unduh] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Unduh CSV" }).click()]);
  expect(unduh.suggestedFilename()).toMatch(/^laporan_kesiswaan_siswa_2026-2027\.csv$/);
  const csv = readFileSync(await unduh.path(), "utf8");
  expect(csv).toContain("ANDI TEST");
  expect(csv).toContain('"NIS","Nama","Kelas","Pelanggaran","Remisi","Saldo"');
  expect(csv).toMatch(/"111","ANDI TEST","XI IPS","80","25","55"/); // 75 + 5 (saran) pelanggaran, 25 remisi

  await page.getByRole("tab", { name: "Per kelas" }).click();
  await expect(page.locator(".table-row.lap-kelas", { hasText: "XI IPS" })).toBeVisible();
  await expect(page.locator(".table-row.lap-kelas", { hasText: "X IPA" })).toBeVisible();

  await page.getByRole("tab", { name: "Top pelanggaran" }).click();
  const terlambat = page.locator(".table-row.lap-top", { hasText: "Datang terlambat ke sekolah" });
  await expect(terlambat).toBeVisible();
  await expect(terlambat.locator(".num").first()).toHaveText("3"); // ANDI, FANI, GITA
  await expect(page.locator(".table-row.lap-top", { hasText: "Berkelahi" }).locator(".num").first()).toHaveText("2");

  await page.getByRole("tab", { name: "Kehadiran per jam" }).click();
  await expect(page.locator(".table-row.lap-jam", { hasText: "BUDI TEST" })).toContainText("Matematika ×1");
  await expect(page.locator(".table-row.lap-jam", { hasText: "ANDI TEST" })).toContainText("TI ×1");
  await expect(page.locator(".table-row.lap-jam", { hasText: "CITRA TEST" })).toBeVisible(); // sel S terhitung

  // lembar pembinaan: jendela baru berisi ringkasan siswa
  await menu(page, "Pelanggaran");
  await page.locator("button.row-button", { hasText: "ANDI TEST" }).click();
  const [popup] = await Promise.all([page.waitForEvent("popup"), page.getByRole("button", { name: "Cetak lembar pembinaan" }).click()]);
  await expect.poll(async () => popup.content(), { timeout: 15_000 }).toContain("Lembar Pembinaan Siswa");
  const html = await popup.content();
  expect(html).toContain("ANDI TEST");
  expect(html).toContain("Datang terlambat ke sekolah");
  expect(html).toContain("Jam ke-3 (TI)"); // ketidakhadiran per jam ikut tercetak
  expect(html).not.toContain("salah input"); // alasan hapus tidak ikut
  await popup.close();

  bersih(lap, "waka (laporan)");
});

// ===================================================================== PIKET
test("piket: wajib memilih petugas tiap sesi, izin seharian, Dispensasi, izin terencana, jendela waktu", async ({ page, browser }) => {
  const lap = await siapkan(page);
  await loginStaf(page, "piket");
  await expect(page).toHaveURL(/\/piket$/);

  // layar wajib: tanpa memilih petugas tidak ada menu; hanya petugas AKTIF yang muncul
  await expect(page.getByText("Siapa yang bertugas?")).toBeVisible();
  await expect(page.locator("aside.sidebar")).toHaveCount(0);
  await expect(page.getByRole("option", { name: "Bu Rina" })).toBeVisible();
  await expect(page.getByRole("option", { name: "Pak Joko" })).toHaveCount(0);

  // tab/konteks baru = sesi baru -> ditanya lagi
  const konteks = await browser.newContext(opsiKonteks());
  const p2 = await konteks.newPage();
  const lap2 = await siapkan(p2);
  await loginStaf(p2, "piket");
  await expect(p2.getByText("Siapa yang bertugas?")).toBeVisible();
  bersih(lap2, "piket (tab baru)");
  await konteks.close();

  await page.getByRole("option", { name: "Bu Rina" }).click();
  await expect(page.getByTestId("petugas-aktif")).toHaveText("Bu Rina");
  await page.reload();
  await expect(page.getByTestId("petugas-aktif")).toHaveText("Bu Rina"); // pilihan bertahan dalam tab yang sama
  await page.getByRole("button", { name: "Ganti petugas" }).click();
  await expect(page.getByText("Siapa yang bertugas?")).toBeVisible();
  await page.getByRole("option", { name: "Bu Rina" }).click();

  // menu terbatas & peran lain tidak dapat dimasuki
  const sidebar = page.locator("aside.sidebar");
  for (const n of ["Beranda", "Izin per jam", "Pelanggaran"]) await expect(sidebar.getByRole("link", { name: n, exact: true })).toHaveCount(1);
  for (const n of ["Pengaturan", "Laporan", "Status alat", "Perlu ditinjau", "Tata tertib", "Jejak audit", "Validasi harian"]) await expect(sidebar.getByRole("link", { name: n, exact: true })).toHaveCount(0);
  for (const tujuan of ["/waka", "/admin", "/kepala/siswa"]) { await page.goto(tujuan); await expect(page).toHaveURL(/\/piket$/); }
  await expect(page.getByTestId("petugas-aktif")).toHaveText("Bu Rina");
  await sehat(page);

  // beranda: pada 14 Okt hanya BUDI belum tap & tanpa keterangan (ANDI Sakit dari waka; siswa lain sudah tap)
  await expect(page.getByTestId("belum-tap")).toHaveText("1");
  await expect(page.locator(".piket-grid[data-nis]")).toHaveCount(1);
  await expect(page.locator(".piket-grid[data-nis='222']")).toContainText("BUDI TEST");

  // BUDI sudah dikonfirmasi Alfa oleh waka -> piket DITOLAK oleh rules
  await page.locator(".piket-grid[data-nis='222']").getByRole("button", { name: "Sakit", exact: true }).click();
  let dlg = page.getByRole("dialog", { name: "Sakit" });
  await dlg.getByLabel("Keterangan (wajib)").fill("Demam, dijemput ibu");
  await dlg.getByRole("button", { name: "Simpan" }).click();
  await expect(dlg.getByRole("alert")).toContainText("dikonfirmasi Alfa oleh Waka");
  await dlg.getByRole("button", { name: "Batal" }).click();

  // ANDI (Sakit dari waka, tanpa validasi): piket boleh menghapus lalu mengganti dengan Dispensasi
  await page.getByRole("button", { name: "Hapus keterangan ANDI TEST" }).click();
  await expect(toast(page)).toContainText("Keterangan ANDI TEST dihapus");
  await expect(page.getByTestId("belum-tap")).toHaveText("2");
  await page.locator(".piket-grid[data-nis='111']").getByRole("button", { name: "Dispensasi", exact: true }).click();
  dlg = page.getByRole("dialog", { name: "Dispensasi" });
  await dlg.getByRole("button", { name: "Simpan" }).click(); // tanpa keterangan
  await expect(dlg.getByRole("alert")).toContainText("Keterangan wajib diisi");
  await dlg.getByLabel("Keterangan (wajib)").fill("Mewakili sekolah lomba MTQ kabupaten");
  await dlg.getByLabel("Surat fisik diterima").check();
  await dlg.getByRole("button", { name: "Simpan" }).click();
  await expect(toast(page)).toContainText("ANDI TEST: Dispensasi tercatat");
  await expect(page.getByTestId("belum-tap")).toHaveText("1");
  await expect(page.locator(".panel", { hasText: "Sudah berketerangan hari ini" })).toContainText("ANDI TEST");

  // Dispensasi boleh untuk siswa yang SUDAH tap (EKO tap lalu berangkat lomba); Izin/Sakit tidak
  await page.getByRole("button", { name: "Izin tanggal lain / terencana" }).click();
  dlg = page.getByRole("dialog", { name: "Izin tanggal lain / terencana" });
  await pilihSiswa(page, dlg, "555", "EKO TEST");
  await dlg.getByLabel("Keterangan (wajib)").fill("Tampil di lomba pidato");
  await dlg.getByRole("button", { name: "Simpan" }).click();
  await expect(dlg.getByRole("alert")).toContainText("sudah tap masuk");
  await dlg.getByLabel("Jenis").selectOption("Dispensasi");
  await dlg.getByRole("button", { name: "Simpan" }).click();
  await expect(toast(page)).toContainText("EKO TEST: Dispensasi tercatat");

  // izin terencana besok: hanya Izin/Dispensasi (tanpa Sakit), tanpa surat fisik
  await page.getByRole("button", { name: "Izin tanggal lain / terencana" }).click();
  dlg = page.getByRole("dialog", { name: "Izin tanggal lain / terencana" });
  await pilihSiswa(page, dlg, "333", "CITRA TEST");
  await dlg.locator("input[type=date]").fill(T.besok);
  await expect(dlg.getByLabel("Jenis").locator("option")).toHaveText(["Izin", "Dispensasi"]);
  await dlg.getByLabel("Keterangan (wajib)").fill("Acara keluarga di luar kota");
  await dlg.getByRole("button", { name: "Simpan" }).click();
  await expect(toast(page)).toContainText("CITRA TEST: Izin tercatat");

  // Dispensasi terencana dengan surat fisik
  await page.getByRole("button", { name: "Izin tanggal lain / terencana" }).click();
  dlg = page.getByRole("dialog", { name: "Izin tanggal lain / terencana" });
  await pilihSiswa(page, dlg, "444", "DINA TEST");
  await dlg.locator("input[type=date]").fill(T.besok);
  await dlg.getByLabel("Jenis").selectOption("Dispensasi");
  await dlg.getByLabel("Keterangan (wajib)").fill("Latihan lomba cerdas cermat");
  await dlg.getByLabel("Surat fisik diterima").check();
  await dlg.getByRole("button", { name: "Simpan" }).click();
  await expect(toast(page)).toContainText("DINA TEST: Dispensasi tercatat");

  // di luar jendela (maks. 7 hari ke depan; mundur N=2) ditolak
  await page.getByRole("button", { name: "Izin tanggal lain / terencana" }).click();
  dlg = page.getByRole("dialog", { name: "Izin tanggal lain / terencana" });
  await pilihSiswa(page, dlg, "444", "DINA TEST");
  const tgl = dlg.locator("input[type=date]");
  await expect(tgl).toHaveAttribute("min", T.min);
  await expect(tgl).toHaveAttribute("max", T.max);
  await tgl.fill(T.jauh);
  await dlg.getByLabel("Keterangan (wajib)").fill("Terlalu jauh ke depan");
  await dlg.getByRole("button", { name: "Simpan" }).click();
  await expect(dlg.getByRole("alert")).toContainText("Tanggal harus antara");
  await dlg.getByRole("button", { name: "Batal" }).click();

  bersih(kecualikan(lap, 1), "piket (izin harian)");
});

test("piket: izin per jam (S/I/D), sel A terkunci, aksi cepat, keterangan wajib", async ({ page, browser }) => {
  const lap = await siapkan(page);
  await masukPiket(page);
  await menu(page, "Izin per jam");
  await expect(judul(page)).toHaveText("Izin per jam");
  await page.locator("select[aria-label=Kelas]").selectOption("XI IPS");

  const tgl = page.locator("input[type=date]").first();
  await expect(tgl).toHaveAttribute("min", T.min);
  await expect(tgl).toHaveAttribute("max", T.max);

  // sel A milik waka terkunci; mapel/guru tidak dapat diubah piket; tidak ada "Isi semua"/"Isi baris"
  await expect(page.getByLabel("ANDI TEST jam 3: Alfa (terkunci, diisi Waka)")).toBeDisabled();
  await expect(page.getByLabel("Mapel jam 3")).toBeDisabled();
  await expect(page.getByLabel("Isi semua jam 3")).toHaveCount(0);

  // siklus klik piket: kosong -> I -> S -> D -> kosong (tanpa A)
  const sel = (n, j, k) => page.getByLabel(`${n} jam ${j}: ${k}`);
  await sel("ANDI TEST", 6, "hadir").click();
  await expect(sel("ANDI TEST", 6, "Izin")).toBeVisible();
  await sel("ANDI TEST", 6, "Izin").click();
  await expect(sel("ANDI TEST", 6, "Sakit")).toBeVisible();
  await sel("ANDI TEST", 6, "Sakit").click();
  await expect(sel("ANDI TEST", 6, "Dispensasi")).toBeVisible();
  await sel("ANDI TEST", 6, "Dispensasi").click();
  await expect(sel("ANDI TEST", 6, "hadir")).toBeVisible();
  await sel("ANDI TEST", 6, "hadir").click(); // berakhir Izin
  await expect(sel("ANDI TEST", 6, "Izin")).toBeVisible();

  // aksi cepat: BUDI pulang awal jam 7-9 (Sakit); ANDI Dispensasi jam 1-2
  await page.getByLabel("Siswa (aksi cepat)").selectOption({ label: "BUDI TEST" });
  await page.getByLabel("Mulai jam ke-").selectOption("7");
  await page.getByLabel("Jenis pulang awal").selectOption("S");
  await page.getByRole("button", { name: "Terapkan pulang awal" }).click();
  for (const j of [7, 8, 9]) await expect(sel("BUDI TEST", j, "Sakit")).toBeVisible();
  await page.getByLabel("Siswa (aksi cepat)").selectOption({ label: "ANDI TEST" });
  await page.getByLabel("Dispensasi dari jam").selectOption("1");
  await page.getByLabel("Dispensasi sampai jam").selectOption("2");
  await page.getByRole("button", { name: "Terapkan dispensasi" }).click();
  for (const j of [1, 2]) await expect(sel("ANDI TEST", j, "Dispensasi")).toBeVisible();

  // simpan WAJIB berketerangan
  await page.getByRole("button", { name: "Simpan" }).click();
  const dlg = page.getByRole("dialog", { name: "Simpan izin per jam" });
  await dlg.getByRole("button", { name: "Simpan" }).click();
  await expect(dlg.getByRole("alert")).toContainText("Keterangan wajib diisi");
  await dlg.getByLabel("Keterangan (wajib)").fill("Pulang awal dijemput orang tua; ANDI latihan lomba");
  await dlg.getByLabel("Surat fisik diterima").check();
  await dlg.getByRole("button", { name: "Simpan" }).click();
  await expect(toast(page)).toContainText("Izin per jam tersimpan");

  // bertahan setelah muat ulang; sel A tetap terkunci
  await page.reload();
  await page.locator("select[aria-label=Kelas]").selectOption("XI IPS");
  await expect(sel("BUDI TEST", 8, "Sakit")).toBeVisible();
  await expect(sel("ANDI TEST", 1, "Dispensasi")).toBeVisible();
  await expect(page.getByLabel("ANDI TEST jam 3: Alfa (terkunci, diisi Waka)")).toBeDisabled();

  // tampil di portal orang tua BUDI (222)
  const konteks = await browser.newContext(opsiKonteks());
  const p2 = await konteks.newPage();
  const lap2 = await siapkan(p2);
  await loginOrtu(p2, "222", "739104");
  const perJam = p2.locator("section.panel", { hasText: "Ketidakhadiran per jam" });
  await expect(perJam).toContainText("Jam ke-7: Sakit");
  await expect(perJam).toContainText("Jam ke-9: Sakit");
  bersih(lap2, "ortu 222 (izin per jam piket)");
  await konteks.close();

  bersih(lap, "piket (izin per jam)");
});

test("piket: pelanggaran ringan/bertakziran dari master (tidak dapat diubah), catatan piket, hapus", async ({ page }) => {
  const lap = await siapkan(page);
  await masukPiket(page);
  await menu(page, "Pelanggaran");
  await expect(judul(page)).toHaveText("Pelanggaran ringan");

  // hanya master aktif berkategori Ringan ATAU bertakziran
  const opsi = (t) => page.locator("button[role=option]", { hasText: t });
  await expect(opsi("Rambut tidak sesuai ketentuan")).toHaveCount(1); // Ringan
  await expect(opsi("Membawa HP/laptop tanpa izin")).toHaveCount(1); // Sedang + takziran
  await expect(opsi("Berkelahi")).toHaveCount(0); // Berat tanpa takziran
  await expect(opsi("Pencurian")).toHaveCount(0); // Sangat Berat
  await expect(opsi("Menghasut/memprovokasi")).toHaveCount(0); // Sedang tanpa takziran

  await page.getByPlaceholder("Ketik NIS atau nama siswa...").fill("333");
  await page.locator(".picker-list li[role=option]", { hasText: "CITRA TEST" }).click();
  await page.getByPlaceholder("Ketik NIS atau nama siswa...").fill("444");
  await page.locator(".picker-list li[role=option]", { hasText: "DINA TEST" }).click();
  await opsi("Rambut tidak sesuai ketentuan").click();
  await expect(page.locator(".notice", { hasText: "tidak dapat diubah" })).toContainText("15 poin"); // poin dari master, bukan input
  await expect(page.locator("input[type=date]")).toHaveAttribute("max", T.hariIni); // tanpa masa depan
  await expect(page.locator("input[type=date]")).toHaveAttribute("min", T.min);
  await page.getByRole("button", { name: /^Catat/ }).click();
  await expect(toast(page)).toContainText("Pelanggaran dicatat untuk 2 siswa");

  const baris = page.locator("[data-testid=catatan-piket] .catatan-piket-row");
  await expect(baris).toHaveCount(2);
  await expect(baris.filter({ hasText: "CITRA TEST" })).toContainText("petugas Bu Rina");

  // hapus catatan DINA (soft delete, alasan wajib)
  await page.getByRole("button", { name: /Hapus catatan DINA TEST/ }).click();
  const dlg = page.getByRole("dialog", { name: "Hapus catatan piket?" });
  await expect(dlg.getByRole("button", { name: "Hapus", exact: true })).toBeDisabled();
  await dlg.getByLabel("Alasan penghapusan (wajib)").fill("salah siswa");
  await dlg.getByRole("button", { name: "Hapus", exact: true }).click();
  await expect(toast(page)).toContainText("Catatan dihapus");
  await expect(baris).toHaveCount(1);

  // piket tidak dapat melihat saldo/riwayat: tidak ada tautan ke halaman kesiswaan
  await expect(page.locator("aside.sidebar").getByRole("link", { name: "Jejak audit" })).toHaveCount(0);
  bersih(lap, "piket (pelanggaran)");
});

test("waka melihat hasil input piket: laporan izin & surat, nama petugas, menimpa S/I/D menjadi A, Dispensasi dihitung hadir", async ({ page, browser }) => {
  const lap = await siapkan(page);
  await loginStaf(page, "waka");

  // pelanggaran piket tercatat dengan NAMA PETUGAS; catatan yang dihapus piket tetap ada untuk waka
  await menu(page, "Pelanggaran");
  await expect(page.locator("button.row-button", { hasText: "CITRA TEST" }).locator(".saldo")).toHaveText("15");
  await expect(page.locator("button.row-button", { hasText: "DINA TEST" }).locator(".saldo")).toHaveText("0");
  await page.locator("button.row-button", { hasText: "CITRA TEST" }).click();
  let detail = page.getByRole("dialog", { name: "CITRA TEST" });
  await expect(detail.locator("article.disc-item", { hasText: "Rambut tidak sesuai ketentuan" })).toContainText("dicatat Bu Rina");
  await detail.getByRole("button", { name: "Tutup" }).click();
  await page.locator("button.row-button", { hasText: "DINA TEST" }).click();
  detail = page.getByRole("dialog", { name: "DINA TEST" });
  await detail.getByLabel("Tampilkan yang dihapus").check();
  await expect(detail.locator("article.disc-item.dihapus", { hasText: "Rambut tidak sesuai ketentuan" })).toContainText("salah siswa");
  await detail.getByRole("button", { name: "Tutup" }).click();

  // laporan izin & bukti surat
  await menu(page, "Laporan");
  await page.getByRole("tab", { name: "Izin & surat" }).click();
  const baris = page.locator(".table-row.lap-izin");
  await expect(baris.filter({ hasText: "ANDI TEST" }).filter({ hasText: "seharian" })).toContainText("Mewakili sekolah lomba MTQ");
  await expect(baris.filter({ hasText: "ANDI TEST" }).filter({ hasText: "seharian" })).toContainText("Bu Rina");
  await expect(baris.filter({ hasText: "BUDI TEST" }).first()).toContainText("jam ke-7");
  await page.getByLabel("Hanya tanpa surat fisik").check();
  await expect(baris.filter({ hasText: "CITRA TEST" })).toHaveCount(1); // Izin terencana tanpa surat
  await expect(baris.filter({ hasText: "EKO TEST" })).toHaveCount(1); // Dispensasi tanpa surat
  await expect(baris.filter({ hasText: "DINA TEST" })).toHaveCount(0); // surat diterima
  await expect(baris.filter({ hasText: "ANDI TEST" })).toHaveCount(0);

  // waka menimpa sel S piket (BUDI jam 7) menjadi A: kosong->A butuh melewati siklus S -> D -> kosong -> A
  await menu(page, "Presensi per jam");
  await page.locator("select[aria-label=Kelas]").selectOption("XI IPS");
  for (const k of ["Sakit", "Dispensasi", "hadir"]) await page.getByLabel(`BUDI TEST jam 7: ${k}`).click();
  await expect(page.getByLabel("BUDI TEST jam 7: Alfa")).toBeVisible();
  await page.getByRole("button", { name: "Simpan" }).click();
  await expect(toast(page)).toContainText("Presensi per jam tersimpan");
  bersih(lap, "waka (hasil piket)");

  // waka mengelola daftar petugas & jendela mundur; admin hanya melihat jendela
  await menu(page, "Petugas piket");
  await expect(judul(page)).toHaveText("Petugas piket");
  await expect(page.getByTestId("nilai-jendela")).toHaveText("2 hari (bawaan)");
  await page.getByLabel("Nama petugas baru").fill("Bu Sari");
  await page.getByRole("button", { name: "Tambah", exact: true }).click();
  await expect(toast(page)).toContainText("Bu Sari ditambahkan");
  await page.getByRole("button", { name: "Nonaktifkan Bu Sari" }).click();
  await expect(toast(page)).toContainText("Bu Sari dinonaktifkan");
  await page.getByLabel("Jendela hari").fill("3");
  await page.getByRole("button", { name: "Simpan", exact: true }).click();
  await expect(page.getByTestId("nilai-jendela")).toHaveText("3 hari");
  await page.getByLabel("Jendela hari").fill("2");
  await page.getByRole("button", { name: "Simpan", exact: true }).click();
  await expect(page.getByTestId("nilai-jendela")).toHaveText("2 hari");

  // piket kini melihat sel itu terkunci
  const konteks = await browser.newContext(opsiKonteks());
  const p2 = await konteks.newPage();
  const lapP = await siapkan(p2);
  await masukPiket(p2);
  await menu(p2, "Izin per jam");
  await p2.locator("select[aria-label=Kelas]").selectOption("XI IPS");
  await expect(p2.getByLabel("BUDI TEST jam 7: Alfa (terkunci, diisi Waka)")).toBeDisabled();
  bersih(lapP, "piket (sel ditimpa waka)");
  await konteks.close();

  // portal ortu ANDI: Dispensasi dihitung sebagai hadir pada rekap
  const k2 = await browser.newContext(opsiKonteks());
  const p3 = await k2.newPage();
  const lapO = await siapkan(p3);
  await loginOrtu(p3, "111", "482915");
  const rekapDisp = p3.locator(".recap-row", { hasText: "Dispensasi (dihitung hadir)" });
  await expect(rekapDisp).toContainText("1 hari");
  bersih(lapO, "ortu 111 (dispensasi)");
  await k2.close();
});

test("piket pada hari Minggu (libur): tidak ada daftar belum tap", async ({ page }) => {
  const lap = await siapkan(page, MINGGU);
  await masukPiket(page);
  await expect(page.getByTestId("belum-tap")).toHaveText("0");
  await expect(page.getByText("Hari Minggu — libur").first()).toBeVisible();
  await expect(page.locator(".piket-grid[data-nis]")).toHaveCount(0);
  bersih(lap, "piket (Minggu)");
});

test("hari Minggu (libur): tidak ada saran dan tidak ada daftar belum tap", async ({ page }) => {
  const lap = await siapkan(page, MINGGU);
  await loginStaf(page, "waka");

  // dashboard: data Minggu ada (ANDI terlambat, BUDI hadir, Alfa) tetapi HARUS diabaikan
  const kartuBelumTap = page.locator(".stat-card", { hasText: "Belum tap hari ini" });
  await expect(kartuBelumTap.locator("strong")).toHaveText("0");
  await expect(kartuBelumTap).toContainText("libur");
  await expect(page.getByTestId("jumlah-saran")).toHaveText("0");

  await menu(page, "Validasi harian");
  await expect(page.getByText("Hari Minggu — libur")).toBeVisible();
  await expect(page.locator(".table-row")).toHaveCount(0);
  await expect(page.getByText(/dari \d+ sudah divalidasi/)).toHaveCount(0);

  await menu(page, "Perlu ditinjau");
  await expect(page.getByText("Tidak ada saran")).toBeVisible();
  await expect(page.locator(".saran-row")).toHaveCount(0);

  await menu(page, "Presensi per jam");
  await expect(page.getByText("Hari Minggu — libur")).toBeVisible();
  bersih(lap, "waka (Minggu)");
});

// ===================================================================== TAHAP B (lanjutan; bergantung pada aktivitas piket di atas)
test("log aktivitas: waka & admin melihat petugas + perangkat + 'Perangkat baru', filter, CSV; kepala tanpa akses", async ({ page, browser }) => {
  const lap = await siapkan(page);
  await loginStaf(page, "waka");
  await menu(page, "Log aktivitas");
  await expect(judul(page)).toHaveText("Log aktivitas akun");
  // kunci `activity/{tgl}` memakai jam SERVER (nyata); jam browser dipalsukan oleh uji
  await page.locator("input[type=date]").fill(hariNyata());
  await expect(page.getByText("Nama petugas dipilih sendiri oleh pengguna")).toBeVisible();
  await expect(page.getByTestId("log-ringkasan")).toHaveText(/^\d+ aktivitas, [1-9]\d* petugas, [1-9]\d* perangkat baru$/);
  const baris = page.locator(".table-row.log-grid");
  await expect(baris.filter({ hasText: "Bu Rina" }).first()).toBeVisible();
  await expect(baris.filter({ hasText: "Izin harian" }).first()).toContainText("Bu Rina");
  await expect(baris.filter({ hasText: "Pelanggaran" }).first()).toContainText("Bu Rina");
  await expect(baris.filter({ hasText: "Bu Rina" }).first()).toContainText(/Windows|Android|Linux|Mac/); // label perangkat
  await expect(page.locator(".badge", { hasText: "Perangkat baru" }).first()).toBeVisible();

  // filter petugas
  await page.getByLabel("Petugas", { exact: true }).selectOption("Bu Rina");
  await expect(baris.first()).toBeVisible();
  await expect(baris.filter({ hasNotText: "Bu Rina" })).toHaveCount(0);
  // filter jenis aksi + siswa
  await page.getByLabel("Jenis aksi").selectOption({ label: "Izin harian" });
  await expect(baris.first()).toContainText("Izin harian");
  await expect(baris.filter({ hasNotText: "Izin harian" })).toHaveCount(0);
  await page.getByLabel("Cari siswa").fill("ANDI");
  await expect(baris.first()).toContainText("111");
  await expect(baris.filter({ hasNotText: "111" })).toHaveCount(0);
  // CSV
  const [unduh] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Unduh CSV" }).click()]);
  const csv = readFileSync(await unduh.path(), "utf8");
  expect(csv).toContain("Petugas (dipilih sendiri)");
  expect(csv).toContain("Bu Rina");
  expect(csv).toContain("Izin harian");
  bersih(lap, "waka (log aktivitas)");

  // admin: halaman yang sama
  const kA = await browser.newContext(opsiKonteks());
  const pa = await kA.newPage();
  const lapA = await siapkan(pa);
  await loginStaf(pa, "admin");
  await menu(pa, "Log aktivitas");
  await pa.locator("input[type=date]").fill(hariNyata());
  await expect(pa.getByTestId("log-ringkasan")).toHaveText(/^\d+ aktivitas, [1-9]\d* petugas, [1-9]\d* perangkat baru$/);
  await expect(pa.locator(".table-row.log-grid", { hasText: "Bu Rina" }).first()).toBeVisible();
  bersih(lapA, "admin (log aktivitas)");
  await kA.close();

  // kepala: tidak ada menu, tidak bisa membuka
  const kK = await browser.newContext(opsiKonteks());
  const pk = await kK.newPage();
  const lapK = await siapkan(pk);
  await loginStaf(pk, "kepala");
  await pk.locator("aside.sidebar").waitFor({ state: "attached" });
  await expect(pk.locator("aside.sidebar").getByRole("link", { name: "Log aktivitas", exact: true })).toHaveCount(0);
  await pk.goto("/kepala/log-aktivitas");
  await expect(pk).toHaveURL(/\/kepala$/);
  bersih(lapK, "kepala (tanpa log aktivitas)");
  await kK.close();
});

test("kunci darurat akun piket: waka mengunci -> sesi piket keluar otomatis; buka kunci -> bisa masuk lagi", async ({ page, browser }) => {
  const kP = await browser.newContext(opsiKonteks());
  const pp = await kP.newPage();
  await siapkan(pp);
  await masukPiket(pp);

  const lap = await siapkan(page);
  await loginStaf(page, "waka");
  await menu(page, "Petugas piket");
  const akun = page.locator(".simple-list > div", { hasText: "Meja Piket" });
  await akun.getByRole("button", { name: "Kunci akun" }).click();
  await expect(toast(page)).toContainText("dikunci");
  await expect(akun).toContainText("TERKUNCI");
  await expect(pp, "sesi piket harus berakhir otomatis").toHaveURL(/\/login/);

  // akun terkunci tidak bisa masuk
  await pp.getByRole("tab", { name: "Admin" }).click();
  await pp.locator("#email").fill(emailStaf("piket"));
  await pp.locator("#password").fill(PASSWORD);
  await pp.locator("button.login-submit").click();
  await expect(pp.getByText("Email atau password salah")).toBeVisible();

  // buka kunci
  await akun.getByRole("button", { name: "Buka kunci" }).click();
  await expect(toast(page)).toContainText("dibuka");
  await expect(akun).not.toContainText("TERKUNCI");
  await pp.locator("#password").fill(PASSWORD); // formulir mengosongkan password setelah gagal
  await pp.locator("button.login-submit").click();
  await pp.waitForURL(/\/piket$/);
  await expect(pp.getByText("Siapa yang bertugas?")).toBeVisible();
  bersih(lap, "waka (kunci akun piket)");
  await kP.close();
});

test("admin: pengingat 'Backup terakhir' + tautan Firebase Console > Ekspor JSON", async ({ page }) => {
  const lap = await siapkan(page);
  await loginStaf(page, "admin");
  await menu(page, "Pengaturan");
  const panel = page.getByTestId("backup-pengingat");
  await expect(page.getByTestId("backup-terakhir")).toHaveText("Belum pernah dicatat");
  await expect(panel.getByRole("status")).toContainText("Belum ada catatan backup");
  const tautan = panel.getByRole("link", { name: "Buka Firebase Console" });
  await expect(tautan).toHaveAttribute("href", /^https:\/\/console\.firebase\.google\.com\/project\/demo-presensi\/database\/[\w-]+\/data$/);
  await expect(tautan).toHaveAttribute("target", "_blank");
  await expect(panel).toContainText("Ekspor JSON");
  await panel.getByRole("button", { name: "Tandai sudah backup" }).click();
  await expect(page.getByTestId("backup-terakhir")).toContainText(/ lalu\)$/);
  await expect(panel.getByRole("status")).toHaveCount(0);
  bersih(lap, "admin (pengingat backup)");
});

test("portal orang tua: koneksi realtime ditutup setelah data tampil; dibuka sebentar saat segarkan; staf tetap realtime", async ({ page }) => {
  const lap = await siapkan(page);
  const terbuka = () => lap.sockets.filter((s) => !s.isClosed()).length;
  await loginOrtu(page, "111", "482915");
  await expect(page.locator(".student-chip").first()).toContainText("ANDI TEST"); // data sudah tampil
  await expect.poll(terbuka, { message: "WebSocket portal ortu harus tertutup setelah data tampil", timeout: 15_000 }).toBe(0);
  expect(lap.sockets.length, "koneksi memang sempat dibuka untuk memuat data").toBeGreaterThan(0);

  // segarkan: koneksi baru dibuka sebentar lalu ditutup lagi
  const awal = lap.sockets.length;
  await page.getByRole("button", { name: /Diperbarui/ }).click();
  await expect.poll(() => lap.sockets.length, { message: "segarkan harus membuka koneksi lagi", timeout: 15_000 }).toBeGreaterThan(awal);
  await expect.poll(terbuka, { message: "koneksi harus ditutup lagi setelah segarkan", timeout: 15_000 }).toBe(0);
  await expect(page.locator(".student-chip").first()).toContainText("ANDI TEST");
  await sehat(page);

  // keluar lalu masuk sebagai staf pada tab yang sama: koneksi realtime kembali terbuka dan tetap terbuka
  await page.getByRole("button", { name: "Keluar" }).click();
  await page.waitForURL(/\/login/);
  await loginStaf(page, "waka");
  await page.waitForTimeout(1500);
  expect(terbuka(), "halaman staf harus memegang koneksi realtime").toBeGreaterThan(0);
  await menu(page, "Pelanggaran");
  await expect.poll(terbuka).toBeGreaterThan(0);
  bersih(lap, "ortu -> staf (koneksi realtime)");
});

// ===================================================================== PERAN LAIN
const MENU_PIMPINAN = [
  ["Siswa", "Data siswa"], ["Laporan", "Laporan kehadiran"], ["Status alat", "Status alat"],
  ["Validasi harian", "Validasi harian"], ["Presensi per jam", "Presensi per jam"], ["Perlu ditinjau", "Perlu ditinjau (saran otomatis)"],
  ["Pelanggaran", "Pelanggaran & remisi"], ["Tata tertib", "Tata tertib"], ["Laporan kesiswaan", "Laporan kesiswaan"], ["Jejak audit", "Jejak audit kesiswaan"],
];

test("kepala: panel pantau + kesiswaan, tidak ada error permission", async ({ page }) => {
  const lap = await siapkan(page);
  await loginStaf(page, "kepala");
  await expect(page).toHaveURL(/\/kepala$/);
  await page.goto("/waka");
  await expect(page).toHaveURL(/\/kepala$/);

  for (const [nama, title] of MENU_PIMPINAN) {
    await menu(page, nama);
    await expect(judul(page)).toHaveText(title);
  }
  // per jam: hanya lihat
  await menu(page, "Presensi per jam");
  await page.locator("select[aria-label=Kelas]").selectOption("XI IPS");
  await expect(page.getByLabel("ANDI TEST jam 3: Alfa")).toBeDisabled();
  await expect(page.getByRole("button", { name: "Simpan" })).toHaveCount(0);
  // kepala boleh mencatat pelanggaran dan memutuskan saran
  await menu(page, "Pelanggaran");
  await expect(page.getByRole("button", { name: "Catat pelanggaran" }).first()).toBeVisible();
  await menu(page, "Perlu ditinjau");
  await expect(page.getByText("hanya lihat")).toHaveCount(0);
  // siswa: UID tersamar, tanpa tombol tambah/PIN
  await menu(page, "Siswa");
  await expect(page.getByRole("button", { name: "Tambah siswa" })).toHaveCount(0);
  await expect(page.getByText("AAAA1111")).toHaveCount(0);
  await expect(page.getByText("AAAA••••")).toBeVisible();
  bersih(lap, "kepala");
});

test("admin: kesiswaan hanya lihat, tidak ada error permission", async ({ page }) => {
  const lap = await siapkan(page);
  await loginStaf(page, "admin");
  await expect(page).toHaveURL(/\/admin$/);
  await page.goto("/waka");
  await expect(page).toHaveURL(/\/admin$/);

  // admin: tanpa "Status alat" (ada di menu Perangkat) dan label menu siswanya "Data siswa"
  for (const [nama, title] of MENU_PIMPINAN.filter(([n]) => n !== "Status alat").map(([n, t]) => [n === "Siswa" ? "Data siswa" : n, t])) {
    await menu(page, nama);
    await expect(judul(page)).toHaveText(title);
  }

  await menu(page, "Pelanggaran");
  await expect(page.getByText("hanya lihat").first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Catat pelanggaran" })).toHaveCount(0);
  await page.locator("button.row-button", { hasText: "ANDI TEST" }).click();
  const detail = page.getByRole("dialog", { name: "ANDI TEST" });
  await expect(detail.locator(".disc-summary .strong b")).toHaveText("55");
  await expect(detail.getByRole("button", { name: "Hapus catatan" })).toHaveCount(0);
  await detail.getByRole("button", { name: "Tutup" }).click();

  await menu(page, "Tata tertib");
  await expect(page.getByRole("button", { name: "Tambah" })).toHaveCount(0);
  await menu(page, "Presensi per jam");
  await page.locator("select[aria-label=Kelas]").selectOption("XI IPS");
  await expect(page.getByLabel("ANDI TEST jam 3: Alfa")).toBeDisabled();
  await menu(page, "Validasi harian");
  await expect(page.getByRole("button", { name: "Konfirmasi Alfa" })).toHaveCount(0);
  await menu(page, "Perlu ditinjau");
  await expect(page.getByRole("button", { name: "Setujui" })).toHaveCount(0);
  await menu(page, "Jejak audit");
  await expect(page.locator(".table-row", { hasText: "Waka Uji" }).first()).toBeVisible();
  for (const nama of ["Data siswa", "Jadwal", "Laporan", "Perangkat", "Ringkasan"]) await menu(page, nama);
  await menu(page, "Petugas piket");
  await expect(judul(page)).toHaveText("Petugas piket");
  await expect(page.getByText("Bu Rina")).toBeVisible();
  await expect(page.getByText("Hanya Waka Kesiswaan yang dapat mengubah jendela.")).toBeVisible();
  await expect(page.getByLabel("Jendela hari")).toHaveCount(0);
  await page.goto("/admin/pengaturan");
  await expect(page.getByText("Akun Pimpinan & Staf", { exact: true })).toBeVisible();
  await expect(page.getByText("Waka Uji")).toBeVisible();
  bersih(lap, "admin");
});
