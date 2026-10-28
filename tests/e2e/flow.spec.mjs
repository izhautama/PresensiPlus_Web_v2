// E2E Tahap 1–3. Dijalankan di DUA project (desktop & mobile); tiap project punya namespace data sendiri.
// Dalam satu project tes berjalan berurutan (serial) dan saling melanjutkan data.
import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { PROJECTS } from "./setup.mjs";
import { hitungTanggal } from "./tanggal.mjs";

const T = hitungTanggal(); // sama dengan setup.mjs: tanggal relatif hari nyata

const PASSWORD = "password-uji-123";
const SEKARANG = T.waktu; // Rabu 16:00 WIB: hari kerja, jendela pulang default (s.d. 15:00) sudah lewat
const MINGGU = T.waktuMinggu; //  Minggu 16:00 WIB: libur

test.describe.configure({ mode: "serial" });
// Aplikasi memakai jam SERVER dan rules memeriksa hari server NYATA: skenario hari kerja butuh hari nyata Senin-Sabtu.
test.beforeEach(({}, ti) => { ti.skip(!T.dapatDijalankan, "Hari nyata = Minggu (libur): skenario hari kerja E2E tidak dapat dijalankan (jam server nyata). Jalankan Senin-Sabtu."); });

const proyek = () => test.info().project.name; // "desktop" | "mobile"
const emailStaf = (peran) => `${peran}.${proyek()}@e2e.test`;

/** Ganti `ts` pada jabat tangan RTDB (server -> klien) agar jam SERVER yang dilihat aplikasi = `ts` (deterministik). */
function ubahJabatTangan(pesan, ts) {
  if (typeof pesan !== "string" || !pesan.includes('"t":"h"')) return pesan;
  try {
    const j = JSON.parse(pesan);
    if (j?.d?.t === "h" && j.d.d) { j.d.d.ts = ts; return JSON.stringify(j); }
  } catch { /* bukan JSON: teruskan apa adanya */ }
  return pesan;
}

/**
 * Siapkan halaman: blok semua request non-lokal (jaminan tidak menyentuh produksi), kumpulkan galat.
 * Jam SERVER uji = `waktu` (jabat tangan RTDB dipatok ke `waktu`, jadi tanggal/jam yang dipakai aplikasi deterministik).
 * Jam PERANGKAT = `opsi.perangkat` (bawaan = `waktu`); isi berbeda untuk menguji jam perangkat yang salah.
 */
async function siapkan(page, waktu = SEKARANG, opsi = {}) {
  const laporan = { permission: [], error: [], nonLokal: [], sockets: [] }; // sockets: koneksi WebSocket RTDB (uji batas 100 koneksi)
  await page.clock.setFixedTime(opsi.perangkat ?? waktu);
  await page.routeWebSocket(/\/\.ws\?/, (ws) => {
    const server = ws.connectToServer();
    ws.onMessage((m) => server.send(m));
    server.onMessage((m) => ws.send(ubahJabatTangan(m, waktu.getTime())));
  });
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
    // peta permintaan -> path (untuk diagnosis: jalur mana yang ditolak rules)
    const jalur = new Map();
    ws.on("framesent", (f) => { try { const j = JSON.parse(String(f.payload)); if (j?.d?.r != null && j.d.b?.p) jalur.set(j.d.r, j.d.b.p); } catch { /* bukan JSON */ } });
    ws.on("framereceived", (f) => {
      if (!/permission_denied/i.test(String(f.payload))) return;
      let p = ""; try { p = jalur.get(JSON.parse(String(f.payload))?.d?.r) ?? ""; } catch { /* abaikan */ }
      laporan.permission.push(`WebSocket: ${String(f.payload).slice(0, 200)}${p ? ` [jalur ${p}]` : ""}`);
    });
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
  await page.waitForURL(/\/(admin|kepala|waka|piket|wali)$/);
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
  // lencana menu (mis. "Pembinaan 2 menunggu") menambah nama aksesibel: cocokkan nama dengan atau tanpa lencana
  const polos = nama.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  await page.locator("aside.sidebar").getByRole("link", { name: new RegExp(`^${polos}( \\d+ menunggu)?$`) }).click();
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
  let sisa = n, sisaWs = n, sisaLog = n + 2; // log best-effort: login + penulisan otomatis (hari efektif) ditolak pada hari server palsu
  return { ...l, permission: l.permission.filter((x) => {
    if (/update at \/ failed: permission_denied/.test(x) && sisa > 0) { sisa--; return false; }
    if (/Gagal mencatat aktivitas|Log aktivitas ditolak; data tersimpan tanpa log/.test(x) && sisaLog > 0) { sisaLog--; return false; } // log aktivitas best-effort ditolak (hari server palsu != hari nyata)
    if (x.startsWith("WebSocket:") && sisaWs > 0) { sisaWs--; return false; }
    return true;
  }) };
}

/** Grid per jam dibuka pada KEMARIN: ANDI & BUDI hadir kemarin, sedangkan HARI INI keduanya tidak tap (baris diturunkan dari status harian, terkunci). */
async function bukaKemarin(page, kelas = "XI IPS") {
  await page.locator("select[aria-label=Kelas]").selectOption(kelas);
  await page.locator("input[type=date]").first().fill(T.kemarin);
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
  // EKO: sel per jam HANYA hari Minggu (diabaikan) sehingga "A per jam (bolos)" = 0; Alfa seharian kemarin dihitung TERPISAH sebagai hari
  const eko = page.locator(".table-row.lap-jam", { hasText: "EKO TEST" });
  if (T.kemarin.slice(0, 7) === T.mingguBulanIni.slice(0, 7)) {
    await expect(eko, "EKO tampil karena Alfa seharian kemarin").toHaveCount(1);
    await expect(eko.locator("span.num").nth(0), "A per jam (bolos) EKO: sel Minggu tidak dihitung").toHaveText("0");
    await expect(eko.getByTestId("alfa-seharian-hari")).toHaveText(/^[1-9]/);
  } else {
    await expect(eko, "Alfa seharian kemarin berada di bulan lain").toHaveCount(0);
  }
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
  await bukaKemarin(page);
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
  await bukaKemarin(page);
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
  // dashboard menghitung saran: ANDI×3 (terlambat + tanpa tap pulang + bolos jam 3 dari uji per jam), BUDI (bolos jam), FANI, GITA (terlambat)
  await expect(page.getByTestId("jumlah-saran")).toHaveText("6");

  await menu(page, "Perlu ditinjau");
  await expect(judul(page)).toHaveText("Perlu ditinjau (saran otomatis)");
  const baris = page.locator(".saran-row");
  await expect(baris).toHaveCount(6);
  // yang TIDAK boleh disarankan: izin pulang awal (sel S), ket harian Sakit, Alfa tanpa autoMap
  for (const n of ["CITRA TEST", "DINA TEST", "EKO TEST"]) await expect(baris.filter({ hasText: n })).toHaveCount(0); // nama lengkap: "EKO" saja cocok dengan "sEKOlah"
  await expect(baris.filter({ hasText: "ANDI TEST" })).toHaveCount(3);
  await expect(baris.filter({ hasText: "BUDI TEST" })).toContainText("jam ke-2 (Matematika)");
  await expect(page.locator('.saran-row[data-tipe="bolosJam"]')).toHaveCount(2); // bolos hanya dari sel A siswa yang HADIR (BUDI jam 2, ANDI jam 3)

  // setujui satu
  await page.locator('.saran-row[data-tipe="terlambat"]', { hasText: "ANDI TEST" }).getByRole("button", { name: "Setujui" }).click();
  await expect(toast(page)).toContainText("1 saran disetujui");
  await expect(baris).toHaveCount(5);

  // abaikan satu dengan alasan
  await page.locator('.saran-row[data-tipe="tanpaTapPulang"]', { hasText: "ANDI TEST" }).getByRole("button", { name: "Abaikan" }).click();
  const dlg = page.getByRole("dialog", { name: /Abaikan 1 saran/ });
  await dlg.getByLabel("Alasan (opsional)").fill("sudah ditangani wali kelas");
  await dlg.getByRole("button", { name: "Abaikan", exact: true }).click();
  await expect(toast(page)).toContainText("1 saran diabaikan");
  await expect(baris).toHaveCount(4);

  // setujui massal: FANI + GITA
  await page.getByLabel("Pilih FANI TEST Terlambat").check();
  await page.getByLabel("Pilih GITA TEST Terlambat").check();
  await expect(page.getByText("2 dipilih")).toBeVisible();
  await page.getByRole("button", { name: "Setujui terpilih" }).click();
  await expect(toast(page)).toContainText("2 saran disetujui");
  await expect(baris).toHaveCount(2); // tersisa bolos jam BUDI dan ANDI

  // keputusan permanen: tidak muncul lagi setelah muat ulang
  await page.reload();
  await expect(page.locator(".saran-row")).toHaveCount(2);
  await expect(page.locator(".saran-row").filter({ hasText: "BUDI TEST" })).toHaveCount(1);
  await expect(page.locator(".saran-row").filter({ hasText: "ANDI TEST" })).toHaveCount(1);

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
  await expect(page.locator(".saran-row", { hasText: "BUDI TEST" })).toHaveCount(0);
  await expect(p2.locator(".saran-row", { hasText: "BUDI TEST" })).toHaveCount(0); // tersisa bolos jam ANDI (tidak ikut diuji)

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
  await bukaKemarin(page);

  const tgl = page.locator("input[type=date]").first();
  await expect(tgl).toHaveAttribute("min", T.min);
  await expect(tgl).toHaveAttribute("max", T.max);

  // sel A milik waka terkunci; mapel/guru tidak dapat diubah piket; tidak ada "Isi semua"/"Isi baris"
  await expect(page.getByLabel("ANDI TEST jam 3: Alfa (terkunci, diisi Waka)")).toBeDisabled();
  await expect(page.getByLabel("Mapel jam 3")).toBeDisabled();
  await expect(page.getByLabel("Isi semua jam 3")).toHaveCount(0);

  // siklus klik piket pada tanggal LAMPAU: kosong -> I -> S -> D -> kosong (A terkunci; A hanya untuk hari ini)
  await expect(page.getByTestId("bantu-piket")).toContainText("A hanya dapat diisi pada hari ini");
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
  await expect(toast(page)).toContainText("Presensi per jam tersimpan");

  // bertahan setelah muat ulang; sel A tetap terkunci
  await page.reload();
  await bukaKemarin(page);
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
  await bukaKemarin(page);
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
  await bukaKemarin(p2);
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
  const lap = await siapkan(page, MINGGU); // jam server palsu (Minggu) != hari nyata: log aktivitas (best-effort) ditolak rules, memang begitu
  await masukPiket(page);
  await expect(page.getByTestId("belum-tap")).toHaveText("0");
  await expect(page.getByText("Hari Minggu — libur").first()).toBeVisible();
  await expect(page.locator(".piket-grid[data-nis]")).toHaveCount(0);
  bersih(kecualikan(lap, 3), "piket (Minggu)");
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
  bersih(kecualikan(lap, 3), "waka (Minggu)");
});

// ===================================================================== TAHAP B (lanjutan; bergantung pada aktivitas piket di atas)
test("log aktivitas: waka & admin melihat petugas + perangkat + 'Perangkat baru', filter, CSV; kepala tanpa akses", async ({ page, browser }) => {
  const lap = await siapkan(page);
  await loginStaf(page, "waka");
  await menu(page, "Log aktivitas");
  await expect(judul(page)).toHaveText("Log aktivitas akun");
  // tanggal bawaan = tanggal SERVER (kunci `activity/{tgl}` memakai jam server): entri tampil tanpa memilih tanggal
  await expect(page.locator("input[type=date]")).toHaveValue(T.hariIni);
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
  await expect(pa.locator("input[type=date]")).toHaveValue(T.hariIni);
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
  await bukaKemarin(page);
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
  await bukaKemarin(page);
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

// ===================================================================== PRESENSI MANUAL
// Siswa uji dibuat lewat REST pemilik emulator DI DALAM uji (tidak ada di seed) agar hitungan uji-uji lain tidak berubah.
const DB_URL = "http://127.0.0.1:9000";
const AUTH_URL = "http://127.0.0.1:9099";
const OWNER = { Authorization: "Bearer owner", "Content-Type": "application/json" };
const dbPut = async (path, body) => {
  const res = await fetch(`${DB_URL}/${path}.json?ns=${PROJECTS[proyek()].ns}`, { method: "PUT", headers: OWNER, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`REST ${path}: ${res.status} ${await res.text()}`);
};
const SISWA_MANUAL = [
  { uid: "MNL00801", nis: "801", nama: "GANI LUPA", kelas: "XII IPS" },
  { uid: "MNL00802", nis: "802", nama: "HANI HILANG", kelas: "XII IPS" },
  { uid: "MNL00803", nis: "803", nama: "INDRA ALAT", kelas: "XII IPS" },
  { uid: "MNL00804", nis: "804", nama: "JONI ALAT", kelas: "XII IPS" },
  { uid: "MNL00805", nis: "805", nama: "KIKI ALAT", kelas: "XII IPS" },
];
const PIN_801 = "246810";

test("presensi manual — piket: lupa KTM & KTM hilang (status dari jadwal), tidak jadi Alfa, mode alat bermasalah", async ({ page }) => {
  for (const s of SISWA_MANUAL) {
    await dbPut(`config/students/${s.uid}`, { nis: s.nis, nama: s.nama, kelas: s.kelas });
    await dbPut(`profiles/${s.nis}`, { nama: s.nama, kelas: s.kelas });
  }
  // akun orang tua GANI (untuk uji portal)
  const ver = PROJECTS[proyek()].ver;
  const r1 = await fetch(`${AUTH_URL}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: `801.${ver}@ortu.presensi-ma.local`, password: PIN_801, returnSecureToken: true }) });
  const ortu = await r1.json();
  expect(ortu.localId).toBeTruthy();
  await dbPut("parents/801", { ver, uid: ortu.localId });

  const lap = await siapkan(page);
  await masukPiket(page);
  await expect(page.locator(".piket-grid[data-nis='801']")).toBeVisible();
  const sebelum = Number(await page.getByTestId("belum-tap").innerText());

  // (a) per siswa dari daftar belum tap: GANI lupa KTM, 07:05 -> Hadir (dari jadwal)
  await page.locator(".piket-grid[data-nis='801']").getByRole("button", { name: "Hadir manual" }).click();
  let dlg = page.getByRole("dialog", { name: "Hadir manual" });
  await expect(dlg.getByLabel("Alasan")).toHaveValue("Lupa KTM");
  await dlg.getByLabel("Jam masuk").fill("07:05");
  await expect(dlg.getByText("Status dihitung dari jadwal kelas: Hadir")).toBeVisible();
  await expect(dlg.getByTestId("peringatan-mundur"), "jam 07:05 diketik saat 'sekarang' 16:00: ditandai jam dimundurkan").toContainText("jam dimundurkan");
  await dlg.getByRole("button", { name: "Simpan" }).click();
  await expect(toast(page)).toContainText("GANI LUPA: hadir manual (Hadir) tercatat");
  await expect(page.locator(".piket-grid[data-nis='801']")).toHaveCount(0); // tidak lagi "belum tap" dan tidak jadi Alfa
  await expect(page.getByTestId("belum-tap")).toHaveText(String(sebelum - 1));

  // HANI: KTM hilang, 07:20 -> Terlambat (jam dihitung terhadap jadwal, bukan diketik)
  await page.locator(".piket-grid[data-nis='802']").getByRole("button", { name: "Hadir manual" }).click();
  dlg = page.getByRole("dialog", { name: "Hadir manual" });
  await dlg.getByLabel("Alasan").selectOption("KTM hilang");
  await dlg.getByLabel("Jam masuk").fill("07:20");
  await expect(dlg.getByText("Status dihitung dari jadwal kelas: Terlambat")).toBeVisible();
  await dlg.getByRole("button", { name: "Simpan" }).click();
  await expect(toast(page)).toContainText("HANI HILANG: hadir manual (Terlambat) tercatat");
  await expect(page.getByTestId("belum-tap")).toHaveText(String(sebelum - 2));

  // alasan 'Lainnya' wajib dijelaskan
  await page.locator(".piket-grid[data-nis='803']").getByRole("button", { name: "Hadir manual" }).click();
  dlg = page.getByRole("dialog", { name: "Hadir manual" });
  await dlg.getByLabel("Alasan").selectOption("Lainnya");
  await dlg.getByLabel("Jam masuk").fill("07:00");
  await dlg.getByRole("button", { name: "Simpan" }).click();
  await expect(dlg.getByRole("alert")).toContainText("wajib dijelaskan");
  await dlg.getByRole("button", { name: "Batal" }).click();

  // ---- halaman Presensi manual + mode alat bermasalah
  await menu(page, "Presensi manual");
  await expect(judul(page)).toHaveText("Presensi manual");
  const tgl = page.locator("input[type=date]");
  await expect(tgl).toHaveAttribute("max", T.hariIni);
  await expect(tgl).toHaveAttribute("min", T.min); // piket dibatasi jendela N hari
  const tercatat = page.getByTestId("manual-tercatat");
  await expect(tercatat).toContainText("GANI LUPA");
  await expect(tercatat).toContainText("Lupa KTM");
  await expect(tercatat).toContainText("HANI HILANG");
  await expect(tercatat.locator("[data-nis='801'] .badge", { hasText: "Manual" })).toBeVisible();

  const massal = page.getByTestId("massal-panel");
  await massal.getByLabel("Kelas alat bermasalah").selectOption("XII IPS");
  await massal.getByLabel("Jam masuk massal").fill("08:00"); // lewat batas masuk -> Terlambat, tetapi alasan "Alat bermasalah" bukan salah siswa (tanpa saran)
  // GANI & HANI sudah tercatat -> hanya 803, 804, 805 yang menjadi kandidat
  await expect(massal.getByLabel(/Tidak hadir: /)).toHaveCount(3);
  await massal.getByLabel("Tidak hadir: KIKI ALAT").check(); // KIKI tidak hadir
  await expect(massal.getByRole("button", { name: "Tandai hadir (2 siswa)" })).toBeVisible();
  await massal.getByRole("button", { name: "Tandai hadir (2 siswa)" }).click();
  await expect(toast(page)).toContainText("2 siswa kelas XII IPS ditandai hadir");
  await expect(tercatat).toContainText("INDRA ALAT");
  await expect(tercatat).toContainText("JONI ALAT");
  await expect(tercatat.locator("[data-nis='803']")).toContainText("Alat bermasalah");
  await expect(tercatat).not.toContainText("KIKI ALAT");
  await expect(page.locator(".piket-grid[data-nis='805']")).toBeVisible(); // KIKI tetap "belum tercatat hadir"

  // Alfa KIKI sudah dikonfirmasi waka -> piket DITOLAK (waka yang dapat membatalkannya)
  await dbPut(`validasi/${T.hariIni}/805`, { status: "Alfa", oleh: "uji-waka", ts: Date.now() });
  await dbPut(`validasiByStudent/805/${T.hariIni}`, { status: "Alfa" });
  await page.locator(".piket-grid[data-nis='805']").getByRole("button", { name: "Hadir manual" }).click();
  dlg = page.getByRole("dialog", { name: "Hadir manual" });
  await dlg.getByLabel("Jam masuk").fill("07:00");
  await dlg.getByRole("button", { name: "Simpan" }).click();
  await expect(dlg.getByRole("alert")).toContainText("dikonfirmasi Alfa oleh Waka");
  await dlg.getByRole("button", { name: "Batal" }).click();
  await expect(page.getByTestId("manual-tercatat")).not.toContainText("KIKI ALAT");

  // koreksi: hapus entri manual milik piket
  await tercatat.getByRole("button", { name: "Hapus presensi manual JONI ALAT" }).click();
  await expect(toast(page)).toContainText("Presensi manual JONI ALAT dihapus");
  await expect(tercatat).not.toContainText("JONI ALAT");
  await expect(page.locator(".piket-grid[data-nis='804']")).toBeVisible();
  await sehat(page);
  bersih(kecualikan(lap, 1), "piket (presensi manual)");
});

test("presensi manual — waka: tidak ada di validasi, saran 'Lupa membawa KTM' / 'Menghilangkan KTM', alat menang", async ({ page }) => {
  const lap = await siapkan(page);
  await loginStaf(page, "waka");

  // Validasi harian: yang dicatat manual TIDAK menjadi kandidat Alfa; yang belum tercatat (804, 805) masih ada
  await menu(page, "Validasi harian");
  await expect(page.locator(".table-row", { hasText: "GANI LUPA" })).toHaveCount(0);
  await expect(page.locator(".table-row", { hasText: "HANI HILANG" })).toHaveCount(0);
  await expect(page.locator(".table-row", { hasText: "INDRA ALAT" })).toHaveCount(0);
  await expect(page.locator(".table-row", { hasText: "KIKI ALAT" })).toHaveCount(1);
  await expect(page.locator(".table-row", { hasText: "JONI ALAT" })).toHaveCount(1); // entri dihapus piket -> kembali belum tap

  // Perlu ditinjau: saran dari alasan manual
  await menu(page, "Perlu ditinjau");
  const lupa = page.locator('.saran-row[data-tipe="lupaKtm"]', { hasText: "GANI LUPA" });
  const hilang = page.locator('.saran-row[data-tipe="ktmHilang"]', { hasText: "HANI HILANG" });
  await expect(lupa).toHaveCount(1);
  await expect(lupa).toContainText("Lupa membawa KTM");
  await expect(hilang).toHaveCount(1);
  await expect(hilang).toContainText("Menghilangkan KTM");
  // siswa alat bermasalah TIDAK memicu saran KTM maupun "tidak tap pulang"
  await expect(page.locator(".saran-row", { hasText: "INDRA ALAT" })).toHaveCount(0);
  // HANI terlambat (manual 07:20) -> juga saran Terlambat; GANI tidak
  await expect(page.locator('.saran-row[data-tipe="terlambat"]', { hasText: "HANI HILANG" })).toHaveCount(1);
  await expect(page.locator('.saran-row[data-tipe="tanpaTapPulang"]', { hasText: /GANI LUPA|HANI HILANG/ })).toHaveCount(0);

  // Presensi manual (waka): halaman yang sama, dapat menulis
  await menu(page, "Presensi manual");
  await expect(page.getByTestId("manual-tercatat")).toContainText("HANI HILANG");
  await expect(page.getByRole("button", { name: "Hadir manual" }).first()).toBeVisible();

  // ALAT MENANG: HANI ternyata sempat tap di alat (07:01, Hadir) -> manual diabaikan, saran KTM hilang & terlambat hilang
  await dbPut(`log/${T.hariIni}/ALAT0802_M`, { jam: "07:01:00", nis: "802", status: "Hadir", nama: "HANI HILANG", kelas: "XII IPS" });
  await expect(page.getByTestId("manual-tercatat").locator("[data-nis='802']")).toContainText("tap alat 07:01 lebih awal");
  await menu(page, "Perlu ditinjau");
  await expect(page.locator('.saran-row[data-tipe="ktmHilang"]', { hasText: "HANI HILANG" })).toHaveCount(0);
  await expect(page.locator('.saran-row[data-tipe="terlambat"]', { hasText: "HANI HILANG" })).toHaveCount(0);
  await expect(page.locator('.saran-row[data-tipe="lupaKtm"]', { hasText: "GANI LUPA" })).toHaveCount(1); // tidak terpengaruh

  // setujui saran Lupa membawa KTM -> tercatat sebagai pelanggaran
  await lupa.getByRole("checkbox").check();
  await page.getByRole("button", { name: /^Setujui/ }).first().click();
  await expect(toast(page)).toContainText("disetujui");
  await expect(page.locator('.saran-row[data-tipe="lupaKtm"]', { hasText: "GANI LUPA" })).toHaveCount(0);

  // KONFLIK ALFA: KIKI Alfa terverifikasi; waka mencatat manual -> konfirmasi, lalu validasi dibatalkan pada update yang sama
  await menu(page, "Presensi manual");
  const baris805 = page.locator(".piket-grid[data-nis='805']");
  await expect(baris805).toContainText("Alfa terverifikasi");
  await baris805.getByRole("button", { name: "Hadir manual" }).click();
  const dlgAlfa = page.getByRole("dialog", { name: "Hadir manual" });
  await expect(dlgAlfa.getByText("Alfa terverifikasi akan dibatalkan")).toBeVisible();
  await dlgAlfa.getByLabel("Jam masuk").fill("07:00");
  await dlgAlfa.getByRole("button", { name: "Simpan & batalkan Alfa" }).click();
  await expect(toast(page)).toContainText("KIKI ALAT: hadir manual (Hadir) tercatat");
  await expect(page.getByTestId("manual-tercatat")).toContainText("KIKI ALAT");
  await expect(page.locator(".piket-grid[data-nis='805']")).toHaveCount(0);
  await menu(page, "Jejak audit");
  await expect(page.locator(".table-row", { hasText: `validasi/${T.hariIni}/805` }).first()).toBeVisible();
  await menu(page, "Validasi harian");
  await expect(page.locator(".table-row", { hasText: "KIKI ALAT" })).toHaveCount(0); // Alfa dibatalkan & kini hadir manual
  await sehat(page);
  bersih(lap, "waka (presensi manual)");
});

test("presensi manual — orang tua melihat 'Hadir (dicatat manual: Lupa KTM)'; kepala hanya melihat; Minggu ditolak", async ({ page, browser }) => {
  const lap = await siapkan(page);
  await loginOrtu(page, "801", PIN_801);
  await expect(page.locator(".student-chip").first()).toContainText("GANI LUPA");
  await expect(page.getByTestId("ortu-manual-hari-ini")).toHaveText("Hadir (dicatat manual: Lupa KTM)");
  await expect(page.locator(".today-card").first()).toContainText("Dicatat manual");
  // portal ortu tetap tidak menahan koneksi realtime
  await expect.poll(() => lap.sockets.filter((s) => !s.isClosed()).length, { timeout: 15_000 }).toBe(0);
  bersih(lap, "ortu (presensi manual)");

  // kepala: hanya melihat
  const kK = await browser.newContext(opsiKonteks());
  const pk = await kK.newPage();
  const lapK = await siapkan(pk);
  await loginStaf(pk, "kepala");
  await menu(pk, "Presensi manual");
  await expect(pk.getByText("Hanya piket dan waka yang dapat mencatat")).toBeVisible();
  await expect(pk.getByTestId("manual-tercatat")).toContainText("GANI LUPA");
  await expect(pk.getByRole("button", { name: "Hadir manual" })).toHaveCount(0);
  await expect(pk.getByTestId("massal-panel")).toHaveCount(0);
  bersih(lapK, "kepala (presensi manual)");
  await kK.close();

  // hari Minggu: tidak dapat dicatat
  const kM = await browser.newContext(opsiKonteks());
  const pm = await kM.newPage();
  const lapM = await siapkan(pm, MINGGU);
  await masukPiket(pm);
  await menu(pm, "Presensi manual");
  await expect(pm.getByText("Hari Minggu — libur").first()).toBeVisible();
  await expect(pm.getByRole("button", { name: "Hadir manual" })).toHaveCount(0);
  bersih(kecualikan(lapM, 3), "piket (Minggu, presensi manual)");
  await kM.close();
});

test("pemetaan saran (autoMap) di Tata tertib, cadangan nama sekali-jalan, peringatan; Log harian & rekap bulanan memuat presensi manual", async ({ page, browser }) => {
  const lap = await siapkan(page);
  await loginStaf(page, "waka");

  // cadangan sekali-jalan: hapus pemetaan lupaKtm -> halaman Saran menulis ulang id aturannya (bukan bergantung nama selamanya)
  await dbPut("discipline/autoMap/lupaKtm", null);
  await menu(page, "Perlu ditinjau");
  await expect(page.getByTestId("saran-belum-dipetakan")).toHaveCount(0); // lupaKtm dipulihkan otomatis; tidak ada saran "alfa" yang menunggu pemetaan
  await menu(page, "Tata tertib");
  await page.getByRole("tab", { name: "Pemetaan saran" }).click();
  const peta = page.getByTestId("pemetaan-saran");
  await expect(peta.getByLabel("Aturan untuk saran Lupa membawa KTM")).toHaveValue("rg14");
  await expect(peta.getByLabel("Aturan untuk saran Menghilangkan KTM")).toHaveValue("rg15");

  // Alfa seharian BUKAN pelanggaran otomatis: tidak ada saran/pemetaan "Alfa terverifikasi"; data lama autoMap.alfa dibiarkan dan tidak berpengaruh
  await expect(peta.getByLabel("Aturan untuk saran Alfa terverifikasi")).toHaveCount(0);
  await expect(peta.getByLabel("Aturan untuk saran Terlambat")).toBeVisible();
  await dbPut("discipline/autoMap/alfa", "sd03"); // data lama: diabaikan
  await menu(page, "Perlu ditinjau");
  await expect(page.locator(".saran-row", { hasText: "Alfa dikonfirmasi" })).toHaveCount(0);
  await expect(page.getByTestId("saran-belum-dipetakan")).toHaveCount(0);
  await menu(page, "Jejak audit");
  await expect(page.locator(".table-row", { hasText: "autoMap/lupaKtm" }).first()).toBeVisible();
  await dbPut("discipline/autoMap/alfa", null);
  bersih(lap, "waka (pemetaan saran)");

  // admin: Log harian memuat entri manual (badge, alasan, petugas) + rekap bulanan memakai data gabungan (manual terhitung Hadir)
  const kA = await browser.newContext(opsiKonteks());
  const pa = await kA.newPage();
  const lapA = await siapkan(pa);
  await loginStaf(pa, "admin");
  await menu(pa, "Laporan");
  await pa.getByRole("tab", { name: "Log harian" }).click();
  const gani = pa.locator(".table-row.log-grid", { hasText: "GANI LUPA" });
  await expect(gani.first()).toBeVisible();
  await expect(gani.first()).toContainText("Manual");
  await expect(gani.first()).toContainText("Lupa KTM");
  await expect(gani.first()).toContainText("Bu Rina");
  await expect(pa.locator(".table-row.log-grid", { hasText: "HANI HILANG" }).filter({ hasText: "tidak dipakai (tap alat lebih awal)" }).first()).toBeVisible(); // tap alat lebih awal, manual tampil bertanda tidak dipakai
  const [unduh] = await Promise.all([pa.waitForEvent("download"), pa.getByRole("button", { name: "Unduh CSV" }).click()]);
  const csv = readFileSync(await unduh.path(), "utf8");
  expect(csv).toContain("Manual: Lupa KTM");
  expect(csv).toContain("Bu Rina");
  await pa.getByRole("tab", { name: "Rekap bulanan" }).click();
  const rowGani = pa.locator(".table-row.report-grid", { hasText: "GANI LUPA" });
  await expect(rowGani).toHaveCount(1);
  await expect(rowGani.locator(".num.good")).toHaveText("1"); // hadir hari ini berkat presensi manual
  bersih(lapA, "admin (log harian & rekap bulanan manual)");
  await kA.close();
});

// ===================================================================== HARI EFEKTIF BERBASIS BUKTI + KALENDER AKADEMIK
const hariDi = (d, n) => new Date(Date.parse(`${d}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const hariMinggu = (d) => new Date(`${d}T12:00:00Z`).getUTCDay() === 0;
const dbGet = async (path) => (await fetch(`${DB_URL}/${path}.json?ns=${PROJECTS[proyek()].ns}`, { headers: OWNER })).json();
/** Tanggal 2..9 hari lalu yang bukan Minggu, bukan kemarin/hari ini (tanpa bukti apa pun pada data awal). */
const tanggalKosong = (...kecuali) => { for (let k = 2; k <= 9; k++) { const d = hariDi(T.hariIni, -k); if (!hariMinggu(d) && !kecuali.includes(d) && d !== T.kemarin) return d; } throw new Error("tidak ada tanggal kosong"); };
async function pilihTanggalKal(page, d) {
  const sel = page.locator(`button.kal-hari[data-tgl="${d}"]`);
  for (let i = 0; i < 6 && !(await sel.count()); i++) await page.getByRole("button", { name: "Bulan sebelumnya" }).click();
  await sel.click();
  return sel;
}
const atur = async (page, jenis, alasan) => {
  await page.getByLabel("Jenis override").selectOption(jenis);
  await page.getByLabel("Alasan override").fill(alasan);
};

test("hari efektif: portal orang tua tidak lagi menampilkan Alpha untuk bulan tanpa kegiatan; 'Hari efektif ke-N'; riwayat libur", async ({ page }) => {
  const lap = await siapkan(page);
  await loginOrtu(page, "111", "482915");
  // bulan-bulan tahun ajaran SEBELUM bulan hari efektif pertama: tidak ada kegiatan presensi
  const taMulai = Number(T.hariIni.slice(5, 7)) >= 7 ? Number(T.hariIni.slice(0, 4)) : Number(T.hariIni.slice(0, 4)) - 1;
  const bulanPertama = T.kemarin.slice(0, 7);
  const kosong = [];
  for (let m = 7, y = taMulai; `${y}-${String(m).padStart(2, "0")}` < bulanPertama; m = m === 12 ? 1 : m + 1, y = m === 1 ? y + 1 : y) kosong.push(`${y}-${String(m).padStart(2, "0")}`);
  for (const k of kosong) {
    const sel = page.getByTestId(`bulan-kosong-${k}`);
    await expect(sel, `bulan ${k}`).toHaveText("Belum ada kegiatan presensi");
  }
  const total = page.getByTestId("total-tahunan").locator("td");
  const alphaTotal = Number(await total.nth(6).innerText());
  expect(alphaTotal, "Alpha total tahun ajaran (dulu puluhan Alpha dari hari tanpa kegiatan)").toBeLessThanOrEqual(2);
  // Hari efektif ke-N (hanya hari ber-bukti pada bulan berjalan)
  const n = [T.kemarin, T.hariIni].filter((d) => d.slice(0, 7) === T.hariIni.slice(0, 7)).length;
  await expect(page.getByTestId("hari-efektif-ke")).toHaveText(`Hari efektif ke-${n}`);
  await expect(page.getByText(`dari ${n} hari efektif bulan ini`)).toBeVisible();
  // riwayat: hari tanpa kegiatan = "Libur / tidak ada kegiatan presensi" (abu-abu), bukan Alpha
  const baris = page.locator("section.panel.no-print .simple-list [data-tgl]");
  await expect(baris).toHaveCount(10);
  for (let i = 0; i < 10; i++) {
    const b = baris.nth(i);
    const tgl = await b.getAttribute("data-tgl");
    if (tgl === T.kemarin || tgl === T.hariIni) continue;
    await expect(b, tgl).toContainText("Libur / tidak ada kegiatan presensi");
    await expect(b, tgl).not.toContainText("Tanpa keterangan");
  }
  await expect(page.getByText("Libur dan hari tanpa kegiatan presensi")).toBeVisible(); // catatan rumus baru
  bersih(lap, "ortu (hari efektif)");
});

test("kalender akademik: override libur/efektif (peringatan tegas), efek ke portal orang tua; kepala cadangan Wakasis boleh mengatur, admin (TU) hanya melihat", async ({ page, browser }) => {
  // portal ortu membaca attendance/{nis} (bukan log): ANDI tap Terlambat kemarin sebagai data alat
  await dbPut(`attendance/111/${T.kemarin}`, { masuk: "07:30:00", status: "Terlambat" });
  const lap = await siapkan(page);
  await loginStaf(page, "waka");
  await menu(page, "Kalender");
  await expect(judul(page)).toHaveText("Kalender akademik");

  // warna otomatis: kemarin & hari ini ber-bukti
  await expect(page.locator(`button.kal-hari[data-tgl="${T.hariIni}"]`)).toHaveAttribute("data-jenis", "berjalan");
  await pilihTanggalKal(page, T.kemarin);
  await expect(page.getByTestId("kal-status")).toHaveText("Efektif (otomatis)");
  await expect(page.getByTestId("kal-detail")).toContainText("Tap alat");

  // override LIBUR pada hari ber-tap: tap terlihat "di hari libur" di portal, tidak masuk rekap
  await atur(page, "libur", "Rapat guru seluruh hari");
  await page.getByRole("button", { name: "Simpan override" }).click();
  await expect(toast(page)).toContainText("override libur tersimpan");
  await expect(page.locator(`button.kal-hari[data-tgl="${T.kemarin}"]`)).toHaveAttribute("data-jenis", "ovr-libur");

  // override EFEKTIF pada tanggal tanpa bukti: peringatan tegas + wajib dicentang
  const dk = tanggalKosong();
  await pilihTanggalKal(page, dk);
  await expect(page.locator(`button.kal-hari[data-tgl="${dk}"]`)).toHaveAttribute("data-jenis", /libur|belum/);
  await atur(page, "efektif", "Hari pengganti, alat mati");
  await expect(page.getByTestId("kal-peringatan-efektif")).toContainText("Semua siswa tanpa tap/izin/manual akan tercatat Alpha");
  await expect(page.getByTestId("kal-peringatan-efektif")).toContainText("presensi manual");
  await page.getByRole("button", { name: "Simpan override" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Centang pernyataan" })).toBeVisible(); // belum dicentang
  await page.getByLabel(/Saya mengerti/).check();
  await page.getByRole("button", { name: "Simpan override" }).click();
  await expect(toast(page)).toContainText("override efektif tersimpan");
  await expect(page.locator(`button.kal-hari[data-tgl="${dk}"]`)).toHaveAttribute("data-jenis", "ovr-efektif");
  // alasan wajib
  await pilihTanggalKal(page, hariDi(T.hariIni, -1) === dk ? T.kemarin : dk);
  await page.getByLabel("Alasan override").fill("ab");
  await page.getByLabel(/Saya mengerti/).check().catch(() => {});
  await page.getByRole("button", { name: "Simpan override" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Alasan wajib" })).toBeVisible();

  // orang tua membaca kalenderEfektif: dk = Alpha (hari efektif tanpa data), kemarin = tap di hari libur
  const kO = await browser.newContext(opsiKonteks());
  const po = await kO.newPage();
  const lapO = await siapkan(po);
  await loginOrtu(po, "111", "482915");
  const riw = (d) => po.locator(`section.panel.no-print .simple-list [data-tgl="${d}"]`);
  await expect(riw(dk)).toContainText("Tanpa keterangan");
  await expect(riw(T.kemarin)).toContainText("di hari libur");

  // hapus override -> kembali normal
  await pilihTanggalKal(page, dk);
  await page.getByRole("button", { name: "Hapus override" }).click();
  await expect(toast(page)).toContainText("Override dihapus");
  await pilihTanggalKal(page, T.kemarin);
  await page.getByRole("button", { name: "Hapus override" }).click();
  await expect(page.locator(`button.kal-hari[data-tgl="${T.kemarin}"]`)).toHaveAttribute("data-jenis", "efektif");
  await po.getByRole("button", { name: /Diperbarui/ }).click();
  await expect(riw(dk)).toContainText("Libur / tidak ada kegiatan presensi");
  await expect(riw(T.kemarin)).not.toContainText("di hari libur");
  await expect(riw(T.kemarin)).toContainText("Masuk 07:30");
  bersih(lapO, "ortu (efek override kalender)");
  await kO.close();
  await dbPut(`attendance/111/${T.kemarin}`, null);
  bersih(lap, "waka (kalender)");

  // v2.5.2 kepala = cadangan Wakasis: BOLEH mengatur override (lalu dihapus lagi agar tidak mengganggu skenario berikutnya)
  const kK = await browser.newContext(opsiKonteks());
  const pk = await kK.newPage();
  const lapK = await siapkan(pk);
  await loginStaf(pk, "kepala");
  await menu(pk, "Kalender");
  await expect(pk.getByTestId("kal-hanya-baca")).toHaveCount(0);
  await expect(pk.getByTestId("ambang-saat-ini")).toBeVisible();
  await pilihTanggalKal(pk, T.kemarin);
  await atur(pk, "libur", "Libur cadangan oleh Kepala Madrasah");
  await pk.getByRole("button", { name: "Simpan override" }).click();
  await expect(toast(pk)).toContainText("override libur tersimpan");
  await expect(pk.locator(`button.kal-hari[data-tgl="${T.kemarin}"]`)).toHaveAttribute("data-jenis", "ovr-libur");
  await pk.getByRole("button", { name: "Hapus override" }).click();
  await expect(toast(pk)).toContainText("Override dihapus");
  bersih(lapK, "kepala (kalender, cadangan Wakasis)");
  await kK.close();

  // v2.5.2 admin (TU): hanya melihat kalender, tanpa formulir override maupun ambang, tanpa error permission
  const kA = await browser.newContext(opsiKonteks());
  const pa = await kA.newPage();
  const lapA = await siapkan(pa);
  await loginStaf(pa, "admin");
  await menu(pa, "Kalender");
  await expect(judul(pa)).toHaveText("Kalender akademik");
  await expect(pa.getByTestId("kal-hanya-baca")).toBeVisible();
  await expect(pa.getByLabel("Jenis override")).toHaveCount(0);
  await expect(pa.getByTestId("ambang-saat-ini")).toHaveCount(0);
  await expect(pa.getByRole("button", { name: "Simpan override" })).toHaveCount(0);
  await expect(pa.getByTestId("migrasi-kalender")).toHaveCount(0); // migrasi sekali jalan: tugas Waka/Kepala
  bersih(lapA, "admin (kalender hanya baca)");
  await kA.close();
});

test("hari efektif: hitung ulang (idempoten), ambang, hitung otomatis saat Dashboard dibuka", async ({ page }) => {
  const dh = tanggalKosong();
  const nama = (n) => `ALAT${n}${proyek()}`;
  // bukti mentah: 2 tap alat pada tanggal tanpa ringkasan benar
  await dbPut(`log/${dh}/${"AAAA9101"}_M`, { jam: "07:00:00", nis: "111", status: "Hadir", nama: nama(1), kelas: "XI IPS" });
  await dbPut(`log/${dh}/${"BBBB9102"}_M`, { jam: "07:02:00", nis: "222", status: "Hadir", nama: nama(2), kelas: "XI IPS" });
  const lap = await siapkan(page);
  await loginStaf(page, "waka");
  await menu(page, "Kalender");
  const dari = page.getByLabel("Hitung dari"), sampai = page.getByLabel("Hitung sampai");
  await dari.fill(dh); await sampai.fill(dh);
  await page.getByRole("button", { name: "Pratinjau" }).click();
  await expect(page.getByTestId("hitung-ulang-hasil")).toHaveText("Pratinjau: 1 dari 1 tanggal akan berubah.");
  await page.getByRole("button", { name: "Hitung ulang" }).click();
  await expect(page.getByTestId("hitung-ulang-hasil")).toHaveText("1 dari 1 tanggal diperbarui.");
  expect(await dbGet(`kalenderEfektif/${dh}`)).toMatchObject({ efektif: true, tap: 2, manual: 0, sumber: "otomatis" });
  await page.getByRole("button", { name: "Hitung ulang" }).click(); // IDEMPOTEN
  await expect(page.getByTestId("hitung-ulang-hasil")).toHaveText("0 dari 1 tanggal diperbarui.");

  // ambang 5: 2 bukti belum cukup -> tanggal itu bukan hari efektif setelah dihitung ulang
  await page.getByLabel("Ambang hari efektif").fill("5");
  await page.getByRole("button", { name: "Simpan ambang" }).click();
  await expect(page.getByTestId("ambang-saat-ini")).toHaveText("5 siswa");
  await page.getByRole("button", { name: "Hitung ulang" }).click();
  await expect(page.getByTestId("hitung-ulang-hasil")).toHaveText("1 dari 1 tanggal diperbarui.");
  await expect.poll(async () => (await dbGet(`kalenderEfektif/${dh}`)).efektif, { timeout: 15_000 }).toBe(false);
  await page.getByLabel("Ambang hari efektif").fill("0");
  await page.getByRole("button", { name: "Simpan ambang" }).click();
  await expect(toast(page)).toContainText("Ambang harus bilangan bulat 1–500"); // nilai tak valid ditolak
  await page.getByLabel("Ambang hari efektif").fill("1");
  await page.getByRole("button", { name: "Simpan ambang" }).click();
  await expect(page.getByTestId("ambang-saat-ini")).toHaveText("1 siswa");
  await page.getByRole("button", { name: "Hitung ulang" }).click();
  await expect.poll(async () => (await dbGet(`kalenderEfektif/${dh}`)).efektif, { timeout: 15_000 }).toBe(true);
  // hari ini tidak boleh dihitung ulang lewat tombol
  await sampai.fill(T.hariIni);
  await page.getByRole("button", { name: "Hitung ulang" }).click();
  await expect(toast(page)).toContainText("hanya untuk tanggal sebelum hari ini");

  // HITUNG OTOMATIS saat Dashboard dibuka: hapus ringkasan -> muncul lagi tanpa tombol
  await dbPut(`kalenderEfektif/${dh}`, null);
  await page.goto("/waka");
  await expect.poll(async () => (await dbGet(`kalenderEfektif/${dh}`))?.tap ?? -1, { timeout: 20_000 }).toBe(2);
  expect(await dbGet(`kalenderEfektif/${dh}`)).toMatchObject({ efektif: true, manual: 0, sumber: "otomatis" });
  bersih(lap, "waka (hitung ulang & otomatis)");
  // bersihkan
  await dbPut(`log/${dh}`, null);
  await dbPut(`kalenderEfektif/${dh}`, null);
});

test("tap rendah: banner Dashboard, validasi Alfa ditahan sampai 'Konfirmasi hari ini normal'", async ({ page }) => {
  // kemarin ditandai tap rendah (simulasi hasil hitung: 6 tap vs median jauh lebih tinggi)
  await dbPut(`kalenderEfektif/${T.kemarin}`, { efektif: true, tap: 6, manual: 0, sumber: "otomatis", rendah: true, dihitung: Date.now() });
  const lap = await siapkan(page);
  await loginStaf(page, "waka");
  const banner = page.getByTestId("banner-tap-rendah");
  await expect(banner).toContainText("Tap rendah");
  await expect(banner.locator(`[data-tgl="${T.kemarin}"]`)).toBeVisible();
  await expect(banner.getByRole("link", { name: "Isi presensi manual" })).toHaveAttribute("href", new RegExp(`/waka/presensi-manual\\?tanggal=${T.kemarin}`));

  await menu(page, "Validasi harian");
  await page.locator("input[type=date]").fill(T.kemarin);
  await expect(page.getByTestId("validasi-tertahan")).toContainText("Validasi Alfa ditahan");
  const alfa = page.getByRole("button", { name: "Alfa", exact: true }).first();
  await expect(alfa).toBeVisible();
  await expect(alfa).toBeDisabled();
  await page.getByTestId("validasi-tertahan").getByRole("button", { name: "Konfirmasi hari ini normal" }).click();
  await expect(toast(page)).toContainText("Hari dikonfirmasi normal");
  await expect(page.getByTestId("validasi-tertahan")).toHaveCount(0);
  await expect(alfa).toBeEnabled();
  expect((await dbGet(`kalenderEfektif/${T.kemarin}`)).normal).toBe(true);
  // banner hilang setelah dikonfirmasi
  await menu(page, "Dashboard");
  await expect(page.getByTestId("banner-tap-rendah")).toHaveCount(0);
  // kembalikan
  await dbPut(`kalenderEfektif/${T.kemarin}`, { efektif: true, tap: 6, manual: 0, sumber: "otomatis", dihitung: Date.now() });
  bersih(lap, "waka (tap rendah)");
});

test("hari bukan efektif: validasi harian tidak menampilkan siapa pun sebagai Alpha", async ({ page }) => {
  const lap = await siapkan(page);
  await loginStaf(page, "waka");
  await menu(page, "Validasi harian");
  const dk = tanggalKosong();
  await page.locator("input[type=date]").fill(dk);
  await expect(page.getByTestId("validasi-bukan-efektif")).toContainText("Bukan hari efektif");
  await expect(page.getByRole("button", { name: "Alfa", exact: true })).toHaveCount(0);
  bersih(lap, "waka (validasi hari tanpa kegiatan)");
});

test("migrasi kalender (Waka): dry-run dulu, lalu terapkan; aktifSejak siswa lama terisi; penanda sekali jalan menonaktifkan tombol", async ({ page }) => {
  const lap = await siapkan(page);
  await loginStaf(page, "waka");
  await menu(page, "Kalender");
  const panel = page.getByTestId("migrasi-kalender");
  await expect(panel.getByRole("button", { name: "Terapkan migrasi" })).toBeDisabled(); // wajib dry-run dulu
  await panel.getByRole("button", { name: "Periksa (dry-run)" }).click();
  await expect(page.getByTestId("migrasi-ringkasan")).toContainText("DRY-RUN (belum ditulis)");
  await expect(panel.getByRole("button", { name: "Terapkan migrasi" })).toBeEnabled();
  expect((await dbGet("profiles/111"))?.aktifSejak, "dry-run tidak menulis").toBeUndefined();
  await panel.getByRole("button", { name: "Terapkan migrasi" }).click();
  await expect(page.getByTestId("migrasi-ringkasan")).toContainText("Selesai:");
  const aktif = (await dbGet("profiles/111")).aktifSejak;
  expect(aktif).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  expect(aktif <= T.kemarin, "aktifSejak = tanggal efektif pertama").toBe(true);
  // v2.5.2: penanda sekali jalan tersimpan (oleh Waka, dengan log) dan tombol dinonaktifkan; kedua kali tidak bisa dijalankan lagi
  const penanda = await dbGet("sistem/migrasiKalender");
  expect(penanda).toMatchObject({ dari: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/), sampai: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) });
  expect(typeof penanda.oleh).toBe("string");
  await expect(page.getByTestId("migrasi-sudah")).toContainText("Migrasi sudah dijalankan");
  await expect(panel.getByRole("button", { name: "Periksa (dry-run)" })).toBeDisabled();
  await expect(panel.getByRole("button", { name: "Terapkan migrasi" })).toBeDisabled();
  // data profil lain tetap (migrasi hanya mengisi aktifSejak)
  expect((await dbGet("profiles/111")).nama).toBe("ANDI TEST");
  bersih(lap, "waka (migrasi kalender)");
});

test("panduan: menu Panduan di setiap peran (statis) + tautan di portal orang tua", async ({ page, browser }) => {
  const lap = await siapkan(page);
  await loginStaf(page, "waka");
  await menu(page, "Panduan");
  await expect(page.getByTestId("panduan-waka")).toContainText("Panduan Waka Kesiswaan");
  await expect(page.getByTestId("panduan-waka")).toContainText("Presensi manual");
  await page.getByRole("tab", { name: "SOP harian" }).click();
  await expect(page.getByTestId("panduan-sop")).toContainText("Jika alat mati atau WiFi putus");
  await expect(page.getByTestId("panduan-sop")).toContainText("Sabtu: backup");
  bersih(lap, "waka (panduan)");

  for (const [peran, judulPanduan] of [["admin", "Panduan Admin"], ["kepala", "Panduan Kepala Madrasah"]]) {
    const k = await browser.newContext(opsiKonteks());
    const p = await k.newPage();
    const l = await siapkan(p);
    await loginStaf(p, peran);
    await menu(p, "Panduan");
    await expect(p.getByTestId(`panduan-${peran}`)).toContainText(judulPanduan);
    bersih(l, `${peran} (panduan)`);
    await k.close();
  }

  const kP = await browser.newContext(opsiKonteks());
  const pp = await kP.newPage();
  const lapP = await siapkan(pp);
  await masukPiket(pp);
  await menu(pp, "Panduan");
  await expect(pp.getByTestId("panduan-piket")).toContainText("Siapa yang bertugas?");
  await expect(pp.getByTestId("panduan-piket")).toContainText("Mode alat bermasalah");
  bersih(lapP, "piket (panduan)");
  await kP.close();

  const kO = await browser.newContext(opsiKonteks());
  const po = await kO.newPage();
  const lapO = await siapkan(po);
  await loginOrtu(po, "111", "482915");
  await po.getByRole("link", { name: "Panduan" }).click();
  await expect(po).toHaveURL(/\/panduan$/);
  await expect(po.getByTestId("panduan-ortu")).toContainText("Lupa PIN");
  await expect(po.getByTestId("panduan-ortu")).toContainText("dicatat manual");
  await po.getByRole("link", { name: "Kembali" }).click();
  await expect(po).toHaveURL(/\/siswa\/111$/);
  bersih(lapO, "ortu (panduan)");
  await kO.close();
});

// ===================================================================== v2.3 — WALI KELAS (Tahap 1)
const isiFormWali = async (dlg, { nama, email, utama, tambahan = [] }) => {
  await dlg.getByLabel("Nama lengkap guru").fill(nama);
  await dlg.getByLabel("Email (harus email asli)").fill(email);
  await dlg.getByLabel("Password sementara").fill("sementara-123");
  await dlg.getByLabel("Ulangi password").fill("sementara-123");
  await dlg.getByLabel("Kelas utama").selectOption(utama);
  for (const k of tambahan) await dlg.getByRole("group", { name: "Kelas tambahan" }).getByLabel(k).check();
};

test("wali: admin membuat wali dengan 2 kelas; waka membuat wali 1 kelas tanpa opsi kelas tambahan", async ({ page, browser }) => {
  const lap = await siapkan(page);
  await loginStaf(page, "admin");
  await menu(page, "Wali kelas");
  await expect(judul(page)).toHaveText("Wali kelas");
  await expect(page.getByTestId("daftar-wali")).toContainText("Bu Wali X IPA");
  await page.getByRole("button", { name: "Tambah wali kelas" }).click();
  const dlg = page.getByRole("dialog", { name: "Tambah wali kelas" });
  await expect(dlg.getByRole("group", { name: "Kelas tambahan" })).toBeVisible(); // admin: kelas tambahan tersedia
  await isiFormWali(dlg, { nama: "Pak Dua Kelas", email: `wali2.${proyek()}@e2e.test`, utama: "XI IPS", tambahan: ["X IPA"] });
  await expect(dlg.getByTestId("wali-bentrok")).toContainText("sudah dipegang Bu Wali X IPA"); // peringatan: kelas X IPA sudah punya wali
  await dlg.getByRole("button", { name: "Simpan" }).click();
  await expect(toast(page)).toContainText("Akun wali Pak Dua Kelas dibuat");
  const baris = page.locator("[data-testid=daftar-wali] [data-uid]", { hasText: "Pak Dua Kelas" });
  await expect(baris).toContainText("Utama: XI IPS");
  await expect(baris).toContainText("tambahan: X IPA");
  bersih(lap, "admin (wali kelas)");

  // waka: boleh membuat akun wali, HANYA kelas utama (tidak ada opsi kelas tambahan)
  const k = await browser.newContext(opsiKonteks());
  const pw = await k.newPage();
  const lapW = await siapkan(pw);
  await loginStaf(pw, "waka");
  await menu(pw, "Wali kelas");
  await expect(pw.getByTestId("daftar-wali")).toContainText("Pak Dua Kelas");
  await pw.getByRole("button", { name: "Tambah wali kelas" }).click();
  const d2 = pw.getByRole("dialog", { name: "Tambah wali kelas" });
  await expect(d2.getByRole("group", { name: "Kelas tambahan" })).toHaveCount(0);
  await expect(pw.getByTestId("wali-per-ta")).toHaveCount(0); // pembaruan massal & sinkronisasi indeks: admin saja
  await isiFormWali(d2, { nama: "Bu Satu Kelas", email: `wali3.${proyek()}@e2e.test`, utama: "X IPA" });
  await d2.getByRole("button", { name: "Simpan" }).click();
  await expect(d2).toContainText("sudah punya wali"); // wali kedua untuk satu kelas: hanya admin
  await d2.getByRole("button", { name: "Batal" }).click();
  bersih(lapW, "waka (wali kelas)");
  await k.close();
});

test("wali (v2.5.2): memantau kelas binaan saja — tanpa catat izin/pelanggaran; Kehadiran kelas hanya baca; kelas lain terkunci", async ({ page }) => {
  const lap = await siapkan(page);
  await loginStaf(page, "wali");
  await expect(page).toHaveURL(/\/wali$/);
  await expect(page.getByTestId("petugas-aktif")).toHaveCount(0); // akun per guru: tanpa layar pilih petugas
  await expect(page.getByText("Siapa yang bertugas?")).toHaveCount(0);
  const sidebar = page.locator("aside.sidebar");
  for (const n of ["Kehadiran kelas", "Siswa kelas", "Pembinaan", "Pengaturan"]) await expect(sidebar.getByRole("link", { name: n, exact: true })).toHaveCount(1); // Pengaturan = ganti password akun sendiri
  // v2.5.2 satu tugas satu pengisi: wali tidak mencatat izin maupun pelanggaran (menu hilang)
  for (const n of ["Izin & kehadiran", "Pelanggaran", "Tata tertib", "Jejak audit", "Validasi harian", "Log aktivitas", "Status alat"]) await expect(sidebar.getByRole("link", { name: n, exact: true })).toHaveCount(0);
  // v2.5.1: wali punya Laporan SENDIRI (kelas binaan); bukan laporan sekolah
  await expect(sidebar.getByRole("link", { name: "Laporan", exact: true })).toHaveAttribute("href", "/wali/laporan");
  for (const tujuan of ["/waka", "/admin", "/piket", "/kepala/siswa"]) { await page.goto(tujuan); await expect(page).toHaveURL(/\/wali$/); }

  // daftar siswa: hanya X IPA (333,444,555,666,777); XI IPS (111,222) tidak tampil
  await menu(page, "Siswa kelas");
  for (const nis of ["333", "444", "555", "666", "777"]) await expect(page.locator(`[data-nis='${nis}']`)).toHaveCount(1);
  for (const nis of ["111", "222"]) await expect(page.locator(`[data-nis='${nis}']`)).toHaveCount(0);
  await expect(page.locator("body")).not.toContainText("ANDI TEST");
  await sehat(page);

  // menu Pelanggaran dicabut: alamat lama dialihkan ke beranda wali
  await page.goto("/wali/pelanggaran");
  await expect(page).toHaveURL(/\/wali$/);

  // Kehadiran kelas: hanya baca (tanpa tombol Izin/Sakit/Dispensasi/Hadir manual), memuat catatan kabar izin ke piket, hanya siswa binaan
  await menu(page, "Kehadiran kelas");
  await expect(page.getByTestId("kehadiran-kelas")).toBeVisible();
  await expect(page.getByTestId("catatan-kabar-izin")).toContainText("Guru Piket");
  for (const n of ["Izin", "Sakit", "Dispensasi", "Hadir manual"]) await expect(page.getByRole("button", { name: n, exact: true })).toHaveCount(0);
  for (const nis of ["333", "444", "555", "666", "777"]) await expect(page.locator(`[data-nis='${nis}']`)).toHaveCount(1);
  await expect(page.locator("[data-nis='111'], [data-nis='222']")).toHaveCount(0);
  await expect(page.getByTestId("kk-hadir")).toBeVisible();
  // alamat lama /wali/izin dialihkan ke Kehadiran kelas
  await page.goto("/wali/izin");
  await expect(page).toHaveURL(/\/wali\/kehadiran$/);
  await menu(page, "Pengaturan");
  await expect(page.getByText("Ganti password").first()).toBeVisible();
  bersih(lap, "wali (siswa kelas, kehadiran hanya baca)");
});

// ===================================================================== v2.3 — WALI KELAS (Tahap 2): indeks kelas, pembinaan, usul remisi
const dbRest = async (method, path, body) => {
  const res = await fetch(`${DB_URL}/${path}.json?ns=${PROJECTS[proyek()].ns}`, { method, headers: OWNER, body: body === undefined ? undefined : JSON.stringify(body) });
  if (!res.ok) throw new Error(`REST ${method} ${path}: ${res.status} ${await res.text()}`);
  return res.json();
};
const taDari = (tgl) => { const y = Number(tgl.slice(0, 4)), m = Number(tgl.slice(5, 7)); return m >= 7 ? `${y}-${y + 1}` : `${y - 1}-${y}`; };
async function loginDengan(page, email, password) {
  await page.goto("/login");
  await page.getByRole("tab", { name: "Admin" }).click();
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(password);
  await page.locator("button.login-submit").click();
  await page.waitForURL(/\/(admin|kepala|waka|piket|wali|bk)$/);
  await sehat(page);
}
const uidWaliSeed = async () => {
  const staff = await dbRest("GET", "staff");
  return Object.entries(staff).find(([, s]) => s.email === `wali.${proyek()}@e2e.test`)?.[0];
};

test("admin: kartu Indeks kelas — selisih terdeteksi otomatis, Perbaiki (dry-run lalu terapkan), Wali kelas per TA menyinkronkan indeks", async ({ page, browser }) => {
  const lap = await siapkan(page);
  await loginStaf(page, "admin");
  const kartu = page.getByTestId("kartu-indeks");
  await expect(kartu, "pemeriksaan otomatis saat Dashboard dibuka").not.toHaveAttribute("data-status", /^(memeriksa|)$/);

  // siswa uji yang dibuat lewat REST oleh uji lain tidak punya indeks: kartu menemukannya, Perbaiki menyelesaikannya
  if ((await kartu.getAttribute("data-status")) === "selisih") {
    await page.getByRole("button", { name: "Perbaiki", exact: true }).click();
    const dlg0 = page.getByRole("dialog", { name: "Perbaiki indeks kelas" });
    await expect(dlg0.getByTestId("rencana-ringkasan")).toContainText("path akan ditulis");
    await dlg0.getByRole("button", { name: "Terapkan perbaikan" }).click();
    await expect(toast(page)).toContainText("path diperbaiki");
  }
  await expect(kartu).toHaveAttribute("data-status", "konsisten");

  // rusak 4 hal: kelas siswa beda, indeks hilang, indeks usang, cermin akun wali beda
  const uid = await uidWaliSeed();
  await dbRest("PUT", "siswaKelas/333", "XI IPS");
  await dbRest("DELETE", "siswaKelas/777");
  await dbRest("PUT", "siswaKelas/9999", "X IPA");
  await dbRest("PUT", `waliAkun/${uid}/kelasUtama`, "XI IPS");
  await page.goto("/admin"); // pemeriksaan berjalan otomatis
  await expect(kartu).toHaveAttribute("data-selisih", "4");
  await expect(page.getByTestId("indeks-peringatan")).toContainText("4 selisih");
  for (const nis of ["333", "777", "9999"]) await expect(page.getByTestId("selisih-siswa").locator(`[data-nis='${nis}']`)).toHaveCount(1);
  await expect(page.getByTestId("selisih-akun")).toContainText("Bu Wali X IPA");
  await expect(page.getByTestId("selisih-akun")).toContainText("kelas utama");

  // dry-run dulu: tidak ada yang ditulis sebelum "Terapkan"
  await page.getByRole("button", { name: "Perbaiki", exact: true }).click();
  const dlg = page.getByRole("dialog", { name: "Perbaiki indeks kelas" });
  await expect(dlg.getByTestId("rencana-ringkasan")).toContainText("4 path akan ditulis");
  expect(await dbRest("GET", "siswaKelas/333"), "dry-run tidak menulis").toBe("XI IPS");
  await dlg.getByRole("button", { name: "Terapkan perbaikan" }).click();
  await expect(toast(page)).toContainText("4 path diperbaiki");
  await expect(kartu).toHaveAttribute("data-status", "konsisten");
  expect(await dbRest("GET", "siswaKelas/333")).toBe("X IPA");
  expect(await dbRest("GET", "siswaKelas/777")).toBe("X IPA");
  expect(await dbRest("GET", "siswaKelas/9999")).toBeNull();
  expect(await dbRest("GET", `waliAkun/${uid}/kelasUtama`)).toBe("X IPA");

  // perbaikan tercatat di log aktivitas
  const semuaLog = Object.values(await dbRest("GET", "activity")).flatMap((per) => Object.values(per));
  expect(semuaLog.filter((e) => e.aksi === "perbaiki-indeks" && /Perbaiki konsistensi/.test(e.detail) && e.peran === "admin").length, "entri log 'perbaiki-indeks' tercatat").toBeGreaterThanOrEqual(1);

  // halaman Wali kelas (admin) memuat kartu yang sama; pembaruan massal wajib menyinkronkan indeks pada update yang sama
  await menu(page, "Wali kelas");
  await expect(page.getByTestId("kartu-indeks")).toHaveAttribute("data-status", "konsisten");
  await dbRest("PUT", "siswaKelas/444", "XI IPS");
  const perTa = page.getByTestId("wali-per-ta");
  await perTa.getByLabel("Kelas utama Bu Wali X IPA").selectOption("XI IPS");
  await perTa.getByRole("button", { name: /Simpan perubahan/ }).click();
  await expect(toast(page)).toContainText("indeks siswa-kelas disinkronkan (1 selisih)");
  expect(await dbRest("GET", "siswaKelas/444"), "indeks ikut tersinkron di update yang sama").toBe("X IPA");
  await perTa.getByLabel("Kelas utama Bu Wali X IPA").selectOption("X IPA"); // kembalikan
  await perTa.getByRole("button", { name: /Simpan perubahan/ }).click();
  await expect(toast(page)).toContainText("0 selisih");
  expect(await dbRest("GET", `staff/${uid}/kelasUtama`)).toBe("X IPA");
  bersih(lap, "admin (indeks kelas)");

  // waka tidak melihat kartu (hanya admin membaca config/students dan menulis indeks)
  const k = await browser.newContext(opsiKonteks());
  const pw = await k.newPage();
  const lapW = await siapkan(pw);
  await loginStaf(pw, "waka");
  await menu(pw, "Wali kelas");
  await expect(pw.getByTestId("kartu-indeks")).toHaveCount(0);
  bersih(lapW, "waka (wali kelas, tanpa kartu indeks)");
  await k.close();
});

test("kepala: penanggung jawab ambang — data lama diisi bawaan (lv04-06 = Kepala); waka tidak dapat mengubah", async ({ page, browser }) => {
  const lap = await siapkan(page);
  for (const id of ["lv01", "lv02", "lv03", "lv04", "lv05", "lv06"]) await dbRest("DELETE", `discipline/levels/${id}/penanggungJawab`);
  await loginStaf(page, "kepala"); // v2.5: hanya KEPALA yang mengubah penanggung jawab ambang
  await menu(page, "Tata tertib");
  await page.getByRole("tab", { name: "Ambang pembinaan" }).click();
  await expect(page.getByTestId("pj-belum")).toBeVisible();
  await expect(page.locator("[data-level=lv01] [data-testid=pj-level]")).toContainText("belum diatur");
  await page.getByRole("button", { name: "Isi penanggung jawab bawaan" }).click();
  await expect(toast(page)).toContainText("Penanggung jawab diisi untuk 6 ambang");
  await expect(page.getByTestId("pj-belum")).toHaveCount(0);
  await expect(page.locator("[data-level=lv01] [data-testid=pj-level]")).toContainText("Wali kelas");
  await expect(page.locator("[data-level=lv02] [data-testid=pj-level]")).toContainText("BK");
  await expect(page.locator("[data-level=lv03] [data-testid=pj-level]")).toContainText("Kepala Madrasah");
  await expect(page.locator("[data-level=lv05] [data-testid=pj-level]")).toContainText("Kepala Madrasah");
  // kepala mengubah penanggung jawab lewat dialog (ambang belum dipakai pembinaan)
  await page.locator("[data-level=lv04]").getByRole("button", { name: "Ubah ambang" }).click();
  const dlg = page.getByRole("dialog", { name: /Ubah ambang/ });
  await dlg.getByLabel("Penanggung jawab").selectOption("bk");
  await dlg.getByRole("button", { name: "Simpan" }).click();
  await expect(toast(page)).toContainText("Tersimpan");
  await expect(page.locator("[data-level=lv04] [data-testid=pj-level]")).toContainText("BK");
  await dbRest("PUT", "discipline/levels/lv04/penanggungJawab", "kepala");
  bersih(lap, "kepala (penanggung jawab ambang)");

  // waka: kolom Penanggung jawab dinonaktifkan (poin dan tindakan tetap dapat diubah)
  const kW = await browser.newContext(opsiKonteks());
  const pw = await kW.newPage();
  const lapW = await siapkan(pw);
  await loginStaf(pw, "waka");
  await menu(pw, "Tata tertib");
  await pw.getByRole("tab", { name: "Ambang pembinaan" }).click();
  await pw.locator("[data-level=lv04]").getByRole("button", { name: "Ubah ambang" }).click();
  const dw = pw.getByRole("dialog", { name: /Ubah ambang/ });
  await expect(dw.getByLabel("Penanggung jawab")).toBeDisabled();
  await expect(dw.getByLabel("Tindakan")).toBeEnabled();
  bersih(lapW, "waka (penanggung jawab terkunci)");
  await kW.close();
});

test("wali: Perlu dibina -> pembinaan selesai -> hilang -> ortu melihat status tanpa isi; usul remisi disetujui waka; kelas lain terkunci", async ({ page, browser }) => {
  const HASIL = "Siswa dipanggil, diberi nasihat, dan berjanji memperbaiki kedisiplinan";
  const WALI2 = { email: `wali2.${proyek()}@e2e.test`, password: "sementara-123" };
  const tgl = T.hariIni, ta = taDari(tgl);
  // siswa 111 (ANDI, XI IPS) pasti melewati ambang 100
  await dbRest("PUT", "discipline/records/111/e2ePB1", { jenis: "pelanggaran", nama: "Uji pembinaan", poin: 100, tanggal: tgl, ta, sumber: "manual" });
  await dbRest("PUT", "discipline/recordMeta/111/e2ePB1", { dibuatOleh: "seed", dibuatNama: "Seed", dibuatTs: Date.now() });

  const lap = await siapkan(page);
  await loginDengan(page, WALI2.email, WALI2.password);
  await expect(page).toHaveURL(/\/wali$/);
  await expect(page.getByTestId("wali-jumlah-siswa")).not.toHaveText("0");
  await expect(page.getByTestId("lencana-pembinaan"), "lencana menu Pembinaan").toHaveText(/^[1-9]/);
  await expect(page.getByTestId("wali-perlu-dibina")).not.toHaveText("0");

  await menu(page, "Pembinaan");
  const baris = page.getByTestId("daftar-perlu-dibina").locator("[data-nis='111']");
  await expect(baris).toHaveCount(1);
  await expect(baris).toContainText("Ambang 100 poin");
  await baris.getByRole("button", { name: "Catat pembinaan" }).click();
  const dlg = page.getByRole("dialog", { name: "Catat pembinaan" });
  await dlg.getByLabel("Hasil pembinaan").fill("pendek");
  await dlg.getByRole("button", { name: "Simpan" }).click();
  await expect(dlg).toContainText("minimal 10 karakter");
  await dlg.getByLabel("Hasil pembinaan").fill(HASIL);
  await dlg.getByRole("button", { name: "Simpan" }).click();
  await expect(toast(page)).toContainText("Pembinaan dicatat selesai");
  await expect(page.getByTestId("daftar-perlu-dibina").locator("[data-nis='111']"), "hilang dari daftar setelah selesai").toHaveCount(0);
  await expect(page.getByTestId("riwayat-pembinaan").locator("[data-nis='111']")).toContainText("Selesai");

  // siswa lain terjadwal lalu dilanjutkan: tetap di daftar dengan label Dijadwalkan
  await dbRest("PUT", "discipline/records/222/e2ePB2", { jenis: "pelanggaran", nama: "Uji pembinaan", poin: 100, tanggal: tgl, ta, sumber: "manual" });
  await dbRest("PUT", "discipline/recordMeta/222/e2ePB2", { dibuatOleh: "seed", dibuatNama: "Seed", dibuatTs: Date.now() });
  const b222 = page.getByTestId("daftar-perlu-dibina").locator("[data-nis='222']");
  await expect(b222).toHaveCount(1);
  await b222.getByRole("button", { name: "Catat pembinaan" }).click();
  const d2 = page.getByRole("dialog", { name: "Catat pembinaan" });
  await d2.getByLabel("Status pembinaan").selectOption("dijadwalkan");
  await d2.getByLabel("Hasil pembinaan").fill("Dijadwalkan bertemu orang tua minggu depan");
  await d2.getByRole("button", { name: "Simpan" }).click();
  await expect(toast(page)).toContainText("Pembinaan dijadwalkan");
  await expect(page.getByTestId("daftar-perlu-dibina").locator("[data-nis='222']").getByTestId("status-dijadwalkan")).toBeVisible();

  // saldo turun: remisi mengurangi saldo 222 di bawah ambang, tetapi belum dibina -> tetap tampil dengan label
  await dbRest("PUT", "discipline/records/222/e2eRem", { jenis: "remisi", nama: "Uji remisi", poin: 1000, tanggal: tgl, ta, sumber: "manual" });
  await dbRest("PUT", "discipline/recordMeta/222/e2eRem", { dibuatOleh: "seed", dibuatNama: "Seed", dibuatTs: Date.now() + 1 });
  await expect(page.getByTestId("daftar-perlu-dibina").locator("[data-nis='222']").getByTestId("saldo-turun")).toBeVisible();

  // detail siswa binaan: portal siswa + catatan wali
  await menu(page, "Siswa kelas");
  await page.getByRole("link", { name: "Detail ANDI TEST" }).click();
  await expect(page.getByTestId("ekstra-wali")).toBeVisible();
  await expect(page.getByTestId("pembinaan-siswa")).toContainText("Selesai");
  await expect(page.getByTestId("riwayat-pencatat")).toContainText("Dicatat oleh");
  await expect(page.locator("aside.sidebar")).toHaveCount(1); // tetap di dalam panel wali (tanpa header portal orang tua)

  // usulan remisi: kirim, batalkan satu, satu lagi diputuskan waka
  await menu(page, "Usulan remisi");
  const kirimUsul = async (nis, nama, remId, alasan) => {
    await page.getByTestId("form-usulan").getByPlaceholder("Ketik NIS atau nama siswa...").fill(nis);
    await page.locator(".picker-list li[role=option]", { hasText: nama }).click();
    await page.getByLabel("Remisi", { exact: true }).selectOption(remId);
    await page.getByLabel("Alasan usulan").fill(alasan);
    await page.getByRole("button", { name: "Kirim usulan" }).click();
    await expect(toast(page)).toContainText("Usulan dikirim ke Waka/Kepala");
  };
  await kirimUsul("111", "ANDI TEST", "rm03", "Juara lomba cerdas cermat tingkat kota");
  await expect(page.getByTestId("daftar-usulan").locator("[data-nis='111']")).toContainText("Menunggu keputusan");
  await kirimUsul("222", "BUDI TEST", "rm05", "Peserta lomba pidato tingkat kecamatan");
  await page.getByRole("button", { name: /Batalkan usulan Peserta lomba/ }).click();
  await expect(toast(page)).toContainText("Usulan dibatalkan");
  await expect(page.getByTestId("daftar-usulan").locator("[data-nis='222']")).toHaveCount(0);
  await kirimUsul("222", "BUDI TEST", "rm05", "Peserta lomba pidato tingkat kecamatan");
  // usulan duplikat yang masih menunggu ditolak oleh validasi
  await page.getByTestId("form-usulan").getByPlaceholder("Ketik NIS atau nama siswa...").fill("222");
  await page.locator(".picker-list li[role=option]", { hasText: "BUDI TEST" }).click();
  await page.getByLabel("Remisi", { exact: true }).selectOption("rm05");
  await page.getByLabel("Alasan usulan").fill("Usulan ganda untuk remisi yang sama");
  await page.getByRole("button", { name: "Kirim usulan" }).click();
  await expect(page.getByTestId("form-usulan")).toContainText("masih menunggu keputusan");
  // panduan wali
  await menu(page, "Panduan");
  await expect(page.getByTestId("panduan-wali")).toContainText("Perlu dibina");
  bersih(lap, "wali (pembinaan, usulan)");

  // orang tua 111: status pembinaan tanpa isi dan tanpa nama pelaksana
  const kO = await browser.newContext(opsiKonteks());
  const po = await kO.newPage();
  const lapO = await siapkan(po);
  await loginOrtu(po, "111", "482915");
  // v2.5: pembinaan TERSEMBUNYI bagi orang tua sampai waka/kepala mengizinkan (bawaan: tidak ada apa pun, termasuk lv01)
  await expect(po.getByTestId("status-pembinaan"), "sebelum diizinkan: tidak tampil").toHaveCount(0);
  await expect(po.locator("body")).not.toContainText(HASIL);

  // waka: antrean usulan + lencana, rekap pembinaan (+CSV), setujui -> saldo berkurang
  const kW = await browser.newContext(opsiKonteks());
  const pw = await kW.newPage();
  const lapW = await siapkan(pw);
  await loginStaf(pw, "waka");
  await expect(pw.getByTestId("lencana-usulan-remisi")).toHaveText("2");
  await menu(pw, "Pelanggaran");
  await pw.locator("button.row-button", { hasText: "ANDI TEST" }).click();
  const detail = pw.getByRole("dialog", { name: "ANDI TEST" });
  const sebelum = Number(await detail.locator(".disc-summary .strong b").textContent());
  await detail.getByRole("button", { name: "Tutup" }).click();
  await menu(pw, "Usulan remisi");
  await expect(pw.getByTestId("jumlah-usulan")).toHaveText("2");
  await pw.getByRole("button", { name: /Setujui usulan .* untuk ANDI TEST/ }).click();
  await pw.getByRole("dialog", { name: "Setujui usulan remisi" }).getByRole("button", { name: "Setujui", exact: true }).click();
  await expect(toast(pw)).toContainText("Usulan disetujui");
  await expect(pw.getByTestId("jumlah-usulan")).toHaveText("1");
  await pw.getByRole("button", { name: /Tolak usulan .* untuk BUDI TEST/ }).click();
  const dt = pw.getByRole("dialog", { name: "Tolak usulan remisi" });
  await dt.getByRole("button", { name: "Tolak", exact: true }).click();
  await expect(dt).toContainText("Alasan penolakan wajib");
  await dt.getByLabel("Alasan penolakan").fill("Belum ada bukti sertifikat lomba");
  await dt.getByRole("button", { name: "Tolak", exact: true }).click();
  await expect(toast(pw)).toContainText("Usulan ditolak");
  await expect(pw.getByTestId("riwayat-usulan")).toContainText("Disetujui");
  await expect(pw.getByTestId("riwayat-usulan")).toContainText("Belum ada bukti sertifikat lomba");
  await menu(pw, "Pelanggaran");
  await pw.locator("button.row-button", { hasText: "ANDI TEST" }).click();
  const detail2 = pw.getByRole("dialog", { name: "ANDI TEST" });
  await expect(detail2.locator(".disc-summary .strong b"), "saldo berkurang sebesar remisi yang disetujui (50)").toHaveText(String(Math.max(0, sebelum - 50)));
  await expect(detail2).toContainText("Juara lomba tingkat kota/kabupaten");
  await detail2.getByRole("button", { name: "Tutup" }).click();
  // rekap pembinaan: filter, lihat isi, CSV, lembar memuat riwayat
  await menu(pw, "Pembinaan");
  const r111 = pw.getByTestId("baris-pembinaan").locator("[data-nis='111']");
  await expect(r111).toContainText("Selesai");
  await r111.getByRole("button", { name: "Lihat isi" }).click();
  await expect(pw.getByTestId("isi-pembinaan")).toContainText(HASIL);
  const [unduh] = await Promise.all([pw.waitForEvent("download"), pw.getByRole("button", { name: "Unduh CSV" }).click()]);
  expect(unduh.suggestedFilename()).toBe(`pembinaan_${ta}.csv`);
  // izin tampil ke orang tua (v2.5): waka memberi izin RINGKAS -> ortu melihat status + tanggal tanpa isi dan tanpa nama pelaksana
  await menu(pw, "Izin ke orang tua");
  const iz = pw.getByTestId("baris-izin").locator("[data-nis='111']");
  await expect(iz).toHaveCount(1);
  await iz.getByTestId("izin-ringkas").click();
  await expect(iz.getByTestId("mode-izin")).toContainText("ringkas");
  await po.reload();
  await expect(po.getByTestId("status-pembinaan")).toContainText("Selesai");
  await expect(po.getByTestId("status-pembinaan")).toContainText("Pembinaan 100 poin");
  await expect(po.locator("body")).not.toContainText(HASIL);
  await expect(po.locator("body")).not.toContainText("Pak Dua Kelas");
  bersih(lapO, "ortu (status pembinaan)");
  await kO.close();
  bersih(lapW, "waka (usulan, rekap pembinaan, izin ortu)");
  await kW.close();

  // wali: kartu usulan menunjukkan keputusan; wali kelas lain TIDAK dapat membuka siswa kelas yang bukan binaannya
  await page.goto("/wali/usulan");
  await expect(page.getByTestId("daftar-usulan").locator("[data-nis='111']")).toContainText("Disetujui");
  await expect(page.getByTestId("daftar-usulan").locator("[data-nis='222']")).toContainText("Keputusan: Belum ada bukti sertifikat lomba");
  const kX = await browser.newContext(opsiKonteks());
  const px = await kX.newPage();
  await siapkan(px);
  await loginStaf(px, "wali"); // Bu Wali X IPA: bukan wali kelas XI IPS
  await px.goto("/wali/siswa/111");
  await expect(px.getByText(/Akses ditolak|tidak ditemukan/)).toBeVisible();
  await expect(px.locator("body")).not.toContainText("ANDI TEST");
  await px.goto("/wali/pembinaan");
  await expect(px.locator("[data-nis='111']")).toHaveCount(0);
  await kX.close();
});

test("admin dan kepala: rekap pembinaan & usulan hanya lihat (tanpa tombol tulis)", async ({ page, browser }) => {
  const lap = await siapkan(page);
  await loginStaf(page, "admin");
  // v2.5: admin TIDAK membaca pembinaan (tanpa menu rekap); rute lama dialihkan ke Dashboard
  await expect(page.locator("aside.sidebar").getByRole("link", { name: /^Pembinaan/ })).toHaveCount(0);
  await page.goto("/admin/pembinaan");
  await expect(page).toHaveURL(/\/admin$/);
  await menu(page, "Usulan remisi");
  await expect(page.getByRole("button", { name: /Setujui usulan|Tolak usulan/ })).toHaveCount(0);
  bersih(lap, "admin (pembinaan hanya lihat)");
  const k = await browser.newContext(opsiKonteks());
  const pk = await k.newPage();
  const lapK = await siapkan(pk);
  await loginStaf(pk, "kepala");
  await menu(pk, "Pembinaan");
  await expect(pk.getByRole("button", { name: "Catat pembinaan" })).toBeVisible();
  await expect(pk.getByTestId("baris-pembinaan").locator("[data-nis='111']").getByRole("button", { name: "Koreksi" })).toBeVisible();
  bersih(lapK, "kepala (pembinaan)");
  await k.close();
});

// ===================================================================== JAM PERANGKAT SALAH (tanggal mengikuti server)
test("jam perangkat salah: tanggal mengikuti SERVER — Log aktivitas menampilkan entri, banner peringatan, Dashboard memakai tanggal server", async ({ page }) => {
  const perangkat = new Date(SEKARANG.getTime() + 3 * 86_400_000 + 2 * 3_600_000); // perangkat 3 hari 2 jam lebih maju dari server
  const lap = await siapkan(page, SEKARANG, { perangkat });
  await loginStaf(page, "admin");
  await expect(page.getByTestId("banner-jam")).toHaveText("Jam perangkat Anda tidak sesuai (selisih 4440 menit). Tanggal mengikuti server.");

  // Dashboard: sapaan/tanggal topbar mengikuti server (T.hariIni), bukan perangkat
  await expect(page.locator(".topbar")).toContainText(new Intl.DateTimeFormat("id-ID", { timeZone: "Asia/Jakarta", weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(SEKARANG));

  // Log aktivitas: tanggal bawaan = tanggal server, entri tampil di UI walau jam perangkat dipalsukan
  await menu(page, "Log aktivitas");
  await expect(page.locator("input[type=date]")).toHaveValue(T.hariIni);
  await expect(page.getByTestId("log-ringkasan")).toHaveText(/^[1-9]\d* aktivitas/);
  const baris = page.locator(".table-row", { hasText: emailStaf("admin") });
  await expect(baris.first()).toContainText("Masuk");

  // asersi tambahan: data langsung (kunci tanggal = tanggal server, bukan tanggal perangkat)
  const log = Object.values(await dbRest("GET", `activity/${T.hariIni}`));
  expect(log.some((e) => e.akunEmail === emailStaf("admin") && e.aksi === "login"), "entri login tersimpan pada tanggal server").toBe(true);
  const tglPerangkat = new Date(perangkat.getTime() + 7 * 3_600_000).toISOString().slice(0, 10);
  expect(await dbRest("GET", `activity/${tglPerangkat}`), "tidak ada entri pada tanggal perangkat yang salah").toBeNull();
  bersih(lap, "admin (jam perangkat salah)");
});

// ===================================================================== v2.3.1 — PRESENSI PER JAM: Alfa oleh piket (hari ini), Alfa seharian turunan
const hariKeDariTgl = (tgl) => Math.round(Date.parse(`${tgl}T00:00:00Z`) / 86_400_000);
const sIPA = encodeURIComponent("X IPA");

test("per jam: piket mengisi A HARI INI (konfirmasi sekali, tanpa keterangan); A kemarin & A waka terkunci; waka melihat penanda, kartu Dashboard, saran bolosJam, lalu merevisi", async ({ page, browser }) => {
  // data awal: A piket yang diisi KEMARIN (CITRA jam 5) dan A milik waka HARI INI (FANI jam 6, penanda 'waka')
  const infoKemarin = { petugas: "Bu Rina", ts: Date.now() - 86_400_000, hariKe: hariKeDariTgl(T.kemarin) };
  await dbPut(`lessons/${T.kemarin}/${sIPA}/absen/333/5`, "A");
  await dbPut(`lessons/${T.kemarin}/${sIPA}/absenOleh/333/5`, "piket");
  await dbPut(`lessons/${T.kemarin}/${sIPA}/absenInfo/333/5`, infoKemarin);
  await dbPut(`lessonsByStudent/333/${T.kemarin}/5`, { k: "A" });
  await dbPut(`lessons/${T.hariIni}/${sIPA}/absen/666/6`, "A");
  await dbPut(`lessons/${T.hariIni}/${sIPA}/absenOleh/666/6`, "waka");
  await dbPut(`lessonsByStudent/666/${T.hariIni}/6`, { k: "A" });

  const lap = await siapkan(page);
  await masukPiket(page);
  await menu(page, "Izin per jam");
  await page.locator("select[aria-label=Kelas]").selectOption("X IPA");
  await expect(page.locator("input[type=date]").first()).toHaveValue(T.hariIni);
  await expect(page.getByTestId("bantu-piket")).toContainText("Hari ini: klik sel kosong → A");

  // A milik waka (hari ini) terkunci; baris yang hadir tidak diturunkan
  await expect(page.getByLabel("FANI TEST jam 6: Alfa (terkunci, diisi Waka)")).toBeDisabled();
  await expect(page.getByTestId("label-turunan")).toHaveCount(0);

  // siklus hari ini: kosong -> A -> I -> S -> D -> kosong
  const sel = (n, j, k) => page.getByLabel(`${n} jam ${j}: ${k}`);
  await sel("CITRA TEST", 7, "hadir").click();
  await expect(sel("CITRA TEST", 7, "Alfa")).toBeVisible();
  await sel("CITRA TEST", 7, "Alfa").click();
  await expect(sel("CITRA TEST", 7, "Izin")).toBeVisible();
  await sel("CITRA TEST", 7, "Izin").click();
  await expect(sel("CITRA TEST", 7, "Sakit")).toBeVisible();
  await sel("CITRA TEST", 7, "Sakit").click();
  await expect(sel("CITRA TEST", 7, "Dispensasi")).toBeVisible();
  await sel("CITRA TEST", 7, "Dispensasi").click();
  await expect(sel("CITRA TEST", 7, "hadir")).toBeVisible(); // kembali kosong (tidak ada yang berubah)

  // isi A (CITRA jam 4): Simpan -> konfirmasi ringan sekali per sesi -> tersimpan TANPA dialog keterangan
  await sel("CITRA TEST", 4, "hadir").click();
  await page.getByRole("button", { name: "Simpan" }).click();
  const konf = page.getByTestId("konfirmasi-alfa");
  await expect(konf).toContainText("Alfa = tidak hadir tanpa keterangan. Lanjutkan?");
  await konf.getByRole("button", { name: "Lanjutkan" }).click();
  await expect(toast(page)).toContainText("Presensi per jam tersimpan");
  await expect(page.getByRole("dialog", { name: "Simpan izin per jam" })).toHaveCount(0);

  // A kedua pada sesi yang sama: tidak ada konfirmasi lagi
  await sel("DINA TEST", 4, "hadir").click();
  await page.getByRole("button", { name: "Simpan" }).click();
  await expect(toast(page)).toContainText("Presensi per jam tersimpan");
  await expect(page.getByTestId("konfirmasi-alfa")).toHaveCount(0);

  // bertahan setelah muat ulang: sel A piket dapat diubah, bertooltip nama petugas + jam, bertanda titik
  await page.reload();
  await page.locator("select[aria-label=Kelas]").selectOption("X IPA");
  const citra4 = page.getByLabel("CITRA TEST jam 4: Alfa (diisi piket)");
  await expect(citra4).toBeEnabled();
  await expect(citra4).toHaveAttribute("title", /^Diisi piket: Bu Rina, \d\d:\d\d WIB$/);
  await expect(citra4.getByTestId("penanda-piket")).toBeVisible();

  // tanggal KEMARIN: A piket yang diisi kemarin terkunci (hanya Waka); siklus tanpa A
  await page.locator("input[type=date]").first().fill(T.kemarin);
  await expect(page.getByLabel("CITRA TEST jam 5: Alfa (terkunci, tanggal lampau)")).toBeDisabled();
  await expect(page.getByTestId("bantu-piket")).toContainText("A hanya dapat diisi pada hari ini");
  bersih(lap, "piket (A per jam hari ini)");

  // ---- waka: penanda, kartu Dashboard "A dari piket hari ini", filter grid, saran bolosJam, revisi
  const kW = await browser.newContext(opsiKonteks());
  const pw = await kW.newPage();
  const lapW = await siapkan(pw);
  await loginStaf(pw, "waka");
  await expect(pw.getByTestId("jumlah-a-piket")).toHaveText("2"); // CITRA & DINA (FANI = A milik waka, tidak dihitung)
  await pw.getByTestId("kartu-a-piket").getByRole("link", { name: /Tinjau di grid/ }).click();
  await expect(pw).toHaveURL(/\/waka\/per-jam\?.*a=piket/);
  await expect(pw.getByLabel("Hanya A dari piket")).toBeChecked();
  await expect(pw.locator("tbody tr")).toHaveCount(2);
  await expect(pw.getByTestId("penanda-piket")).toHaveCount(2);
  await expect(pw.getByLabel("CITRA TEST jam 4: Alfa (diisi piket)")).toHaveAttribute("title", /^Diisi piket: Bu Rina, \d\d:\d\d WIB$/);

  // saran bolosJam tetap berlaku untuk A dari piket (perlu persetujuan waka seperti biasa; poin tidak tercatat otomatis)
  await menu(pw, "Perlu ditinjau");
  const barisSaran = pw.locator(".saran-row", { hasText: "CITRA TEST" });
  // CITRA juga punya A piket KEMARIN (jam 5) yang sah menjadi saran bolos pada tanggal itu: hanya yang jam 4 (hari ini) yang diperiksa
  await expect(barisSaran.filter({ hasText: "jam ke-4" })).toHaveCount(1);
  await expect(pw.locator(".saran-row", { hasText: "DINA TEST" }).filter({ hasText: "jam ke-4" })).toHaveCount(1);

  // revisi waka: A piket CITRA jam 4 -> Izin: penanda menjadi 'waka' (titik hilang), kartu Dashboard turun
  await menu(pw, "Presensi per jam");
  await pw.locator("select[aria-label=Kelas]").selectOption("X IPA");
  await pw.getByLabel("CITRA TEST jam 4: Alfa (diisi piket)").click(); // A -> I (siklus waka)
  await expect(pw.getByLabel("CITRA TEST jam 4: Izin")).toBeVisible();
  await pw.getByRole("button", { name: "Simpan" }).click();
  await expect(toast(pw)).toContainText("Presensi per jam tersimpan");
  await expect(pw.getByTestId("penanda-piket")).toHaveCount(1); // tinggal DINA
  await menu(pw, "Dashboard");
  await expect(pw.getByTestId("jumlah-a-piket")).toHaveText("1");
  bersih(lapW, "waka (A dari piket)");
  await kW.close();

  // data akhir yang konsisten (penanda 'waka' pada sel hasil revisi; info Alfa piket hilang)
  const kelasHariIni = await dbGet(`lessons/${T.hariIni}/${sIPA}`);
  expect(kelasHariIni.absen["333"]["4"]).toBe("I");
  expect(kelasHariIni.absenOleh["333"]["4"]).toBe("waka");
  expect(kelasHariIni.absenInfo?.["333"]?.["4"] ?? null).toBeNull();
  expect(kelasHariIni.absenOleh["444"]["4"]).toBe("piket");
  expect(kelasHariIni.absenInfo["444"]["4"].hariKe).toBe(hariKeDariTgl(T.hariIni));

  // piket melihat sel hasil revisi (Izin, bukan A): tidak terkunci lagi oleh aturan A
  const kP = await browser.newContext(opsiKonteks());
  const pp = await kP.newPage();
  const lapP = await siapkan(pp);
  await masukPiket(pp);
  await menu(pp, "Izin per jam");
  await pp.locator("select[aria-label=Kelas]").selectOption("X IPA");
  await expect(pp.getByLabel("CITRA TEST jam 4: Izin")).toBeEnabled();
  bersih(lapP, "piket (setelah revisi waka)");
  await kP.close();
});

test("per jam: Alfa seharian & keterangan harian DITURUNKAN (terkunci, tidak ditulis); hilang saat ada tap/izin; tidak memicu saran; portal ortu satu baris", async ({ page, browser }) => {
  // siswa uji tanpa tap hari ini (Alfa seharian) di kelas XII IPS
  await dbPut("config/students/LNA00899", { nis: "899", nama: "LINA UJI", kelas: "XII IPS" });
  await dbPut("profiles/899", { nama: "LINA UJI", kelas: "XII IPS", aktifSejak: "2020-01-01" });
  await dbPut("siswaKelas/899", "XII IPS");

  const lap = await siapkan(page);
  await loginStaf(page, "waka");
  await menu(page, "Presensi per jam");
  await page.locator("select[aria-label=Kelas]").selectOption("XII IPS");
  const baris = page.locator("tbody tr", { hasText: "LINA UJI" });
  await expect(baris.getByTestId("label-turunan")).toHaveText("Alfa seharian (otomatis)");
  for (let j = 1; j <= 9; j++) await expect(page.getByLabel(`LINA UJI jam ${j}: Alfa seharian (otomatis, terkunci)`)).toBeDisabled();
  await expect(page.getByRole("button", { name: "Simpan" })).toBeDisabled(); // tidak ada draf: sel turunan tidak dapat diubah

  // data TIDAK ditulis: tidak ada lessons/lessonsByStudent untuk LINA
  expect(await dbGet("lessonsByStudent/899")).toBeNull();

  // Alfa seharian tidak memicu saran apa pun
  await menu(page, "Perlu ditinjau");
  await expect(page.locator(".saran-row", { hasText: "LINA UJI" })).toHaveCount(0);

  // kemarin: EKO (Alfa terverifikasi, tanpa tap) diturunkan A jam 1-9, terkunci untuk waka juga
  await menu(page, "Presensi per jam");
  await bukaKemarin(page, "X IPA");
  await expect(page.locator("tbody tr", { hasText: "EKO TEST" }).getByTestId("label-turunan")).toHaveText("Alfa seharian (otomatis)");
  await expect(page.getByLabel("EKO TEST jam 1: Alfa seharian (otomatis, terkunci)")).toBeDisabled();
  // tap masuk datang kemudian -> turunan hilang otomatis (live) dan sel bisa diisi biasa
  await dbPut(`log/${T.kemarin}/EEEE5555_M`, { jam: "07:10:00", nis: "555", status: "Hadir" });
  await expect(page.locator("tbody tr", { hasText: "EKO TEST" }).getByTestId("label-turunan")).toHaveCount(0);
  await expect(page.getByLabel("EKO TEST jam 1: hadir")).toBeEnabled();
  await dbPut(`log/${T.kemarin}/EEEE5555_M`, null); // kembalikan
  await expect(page.locator("tbody tr", { hasText: "EKO TEST" }).getByTestId("label-turunan")).toHaveText("Alfa seharian (otomatis)");

  // piket mengisi izin harian LINA (Beranda) -> baris waka berubah menjadi Izin seharian (I jam 1-9, terkunci)
  const kP = await browser.newContext(opsiKonteks());
  const pp = await kP.newPage();
  const lapP = await siapkan(pp);
  await masukPiket(pp);
  const rowLina = pp.locator(".piket-grid[data-nis='899']");
  await expect(rowLina).toBeVisible();
  await rowLina.getByRole("button", { name: "Izin", exact: true }).click();
  const dlg = pp.getByRole("dialog", { name: "Izin" });
  await dlg.getByLabel("Keterangan (wajib)").fill("Acara keluarga, orang tua menelepon");
  await dlg.getByRole("button", { name: "Simpan" }).click();
  await expect(toast(pp)).toContainText("LINA UJI");
  await menu(pp, "Izin per jam");
  await pp.locator("select[aria-label=Kelas]").selectOption("XII IPS");
  await expect(pp.locator("tbody tr", { hasText: "LINA UJI" }).getByTestId("label-turunan")).toHaveText("Izin seharian (otomatis)");
  await expect(pp.getByLabel("LINA UJI jam 3: Izin seharian (otomatis, terkunci)")).toBeDisabled();
  bersih(lapP, "piket (izin harian -> baris turunan)");
  await kP.close();

  await menu(page, "Presensi per jam");
  await page.locator("select[aria-label=Kelas]").selectOption("XII IPS");
  await page.locator("input[type=date]").first().fill(T.hariIni); // halaman masih memegang tanggal KEMARIN dari langkah EKO
  await expect(page.locator("tbody tr", { hasText: "LINA UJI" }).getByTestId("label-turunan")).toHaveText("Izin seharian (otomatis)");
  await expect(page.getByLabel("LINA UJI jam 1: Izin seharian (otomatis, terkunci)")).toBeDisabled();
  bersih(lap, "waka (turunan Alfa/Izin seharian)");

  // portal orang tua BUDI (Alfa seharian hari ini + terverifikasi): SATU baris, bukan baris per jam
  const kO = await browser.newContext(opsiKonteks());
  const po = await kO.newPage();
  const lapO = await siapkan(po);
  await loginOrtu(po, "222", "739104");
  const seharian = po.getByTestId("baris-seharian");
  await expect(seharian.first()).toContainText("Alfa (terverifikasi)");
  await expect(seharian.first()).not.toContainText("Jam ke-");
  bersih(lapO, "ortu 222 (Alfa seharian)");
  await kO.close();

  // bersihkan siswa uji
  for (const path of ["config/students/LNA00899", "profiles/899", "siswaKelas/899", `izin/${T.hariIni}/899`, `attendance/899/${T.hariIni}`]) await dbPut(path, null);
});


// ===================================================================== v2.4-a: BUKTI HADIR PALING AWAL + JAM MANUAL
// Skenario memakai tanggal KEMARIN (hari kerja lampau): aturan jam manual tidak bergantung pada jam hari mesin uji
// (Security Rules memakai jam NYATA emulator, sedangkan aplikasi memakai jam server palsu 16:00). Kartu Dashboard memakai entri hari ini hasil seed.
test("v2.4 lupa KTM lengkap: manual 07:05 lalu tap alat 07:40 tetap HADIR; jam dimundurkan ditandai; info gabung; saran; laporan; kartu waka", async ({ page, browser }) => {
  const SISWA = { uid: "MNL00861", nis: "861", nama: "TARI LUPAKARTU", kelas: "XII IPS" };
  await dbPut(`config/students/${SISWA.uid}`, { nis: SISWA.nis, nama: SISWA.nama, kelas: SISWA.kelas });
  await dbPut(`profiles/${SISWA.nis}`, { nama: SISWA.nama, kelas: SISWA.kelas, aktifSejak: "2020-01-01" });
  const lap = await siapkan(page);
  await masukPiket(page);

  // piket: lupa KTM, jam 07:05 (Tepat) pada hari kerja kemarin. Jam sebelum awal jendela - 60 menit ditolak di dialog.
  await page.goto(`/piket/presensi-manual?tanggal=${T.kemarin}`);
  const baris = page.locator(`.piket-grid[data-nis='${SISWA.nis}']`);
  await expect(baris).toBeVisible();
  await baris.getByRole("button", { name: "Hadir manual" }).click();
  const dlg = page.getByRole("dialog", { name: "Hadir manual" });
  await dlg.getByLabel("Jam masuk").fill("05:30");
  await expect(dlg.getByTestId("galat-jam-manual")).toContainText("tidak boleh lebih awal dari 06:00");
  await dlg.getByRole("button", { name: "Simpan" }).click();
  await expect(dlg.getByRole("alert").last()).toContainText("tidak boleh lebih awal dari 06:00");
  await dlg.getByLabel("Jam masuk").fill("07:05");
  await expect(dlg.getByText("Status dihitung dari jadwal kelas: Hadir")).toBeVisible();
  await expect(dlg.getByTestId("peringatan-mundur")).toContainText("Tanggal lampau");
  await dlg.getByRole("button", { name: "Simpan" }).click();
  await expect(toast(page)).toContainText("TARI LUPAKARTU: hadir manual (Hadir) tercatat");

  // siswa kembali mengambil kartu dan tap alat pukul 07:40 (alat mencatat Terlambat)
  await dbPut(`attendance/${SISWA.nis}/${T.kemarin}`, { masuk: "07:40:00", status: "Terlambat" });
  await dbPut(`log/${T.kemarin}/ALAT0861_M`, { jam: "07:40:00", nis: SISWA.nis, status: "Terlambat", nama: SISWA.nama, kelas: SISWA.kelas });
  const kartu = page.getByTestId("manual-tercatat").locator(`[data-nis='${SISWA.nis}']`);
  await expect(kartu).toContainText("masuk 07:05 (Hadir)");
  await expect(kartu.getByTestId("info-gabung")).toContainText("Tap alat 07:40 setelah presensi manual 07:05");
  await expect(kartu.getByTestId("badge-mundur")).toBeVisible();
  await expect(kartu.getByTestId("jam-dicatat")).toContainText("dicatat");
  bersih(kecualikan(lap, 2), "piket (v2.4 lupa KTM)");

  // waka: tanpa saran Terlambat (lupaKtm tetap), bukan kandidat Alfa, laporan log menampilkan kedua jam, kartu jam dimundurkan
  const kW = await browser.newContext(opsiKonteks());
  const pw = await kW.newPage();
  const lapW = await siapkan(pw);
  await loginStaf(pw, "waka");
  await menu(pw, "Perlu ditinjau");
  await expect(pw.locator('.saran-row[data-tipe="lupaKtm"]', { hasText: SISWA.nama })).toHaveCount(1);
  await expect(pw.locator('.saran-row[data-tipe="terlambat"]', { hasText: SISWA.nama })).toHaveCount(0);
  // kartu Dashboard: entri hari ini bertanda mundur (seed langsung) dihitung dan tautannya memakai filter
  await dbPut(`manualTap/${T.hariIni}/862`, { masuk: "07:00:00", masukDetik: 25200, mundur: true, status: "Hadir", alasan: "Lupa KTM", oleh: "x", ts: Date.now(), hariKe: 1 });
  await pw.goto("/waka");
  await expect(pw.getByTestId("jumlah-manual-mundur")).toHaveText(/^[1-9]/); // mencakup entri mundur dari uji manual sebelumnya pada hari yang sama
  await expect(pw.getByTestId("kartu-manual-mundur").getByRole("link")).toHaveAttribute("href", `/waka/presensi-manual?tanggal=${T.hariIni}&mundur=1`);
  bersih(kecualikan(lapW, 2), "waka (v2.4 lupa KTM)");
  await kW.close();

  // admin: Laporan > Log harian pada tanggal kemarin memuat jam diketik + dicatat + JAM DIMUNDURKAN; baris alat diberi catatan
  const kA = await browser.newContext(opsiKonteks());
  const pa = await kA.newPage();
  const lapA = await siapkan(pa);
  await loginStaf(pa, "admin");
  await menu(pa, "Laporan");
  await pa.getByRole("tab", { name: "Log harian" }).click();
  await pa.locator("input[type=date]").first().fill(T.kemarin);
  const barisManual = pa.locator(".table-row.log-grid", { hasText: SISWA.nama }).filter({ hasText: "diketik 07:05" });
  await expect(barisManual).toHaveCount(1);
  await expect(barisManual).toContainText("JAM DIMUNDURKAN");
  await expect(pa.locator(".table-row.log-grid", { hasText: SISWA.nama }).filter({ hasText: "07:40:00" })).toContainText("status resmi: Hadir"); // baris tap alat diberi catatan
  bersih(kecualikan(lapA, 2), "admin (v2.4 log harian)");
  await kA.close();

  for (const path of [`config/students/${SISWA.uid}`, `profiles/${SISWA.nis}`, `attendance/${SISWA.nis}/${T.kemarin}`, `log/${T.kemarin}/ALAT0861_M`, `manualTap/${T.kemarin}/${SISWA.nis}`, `manualTapByStudent/${SISWA.nis}/${T.kemarin}`, `manualTap/${T.hariIni}/862`]) await dbPut(path, null);
});

// ===================================================================== v2.4-b: PERAN BK (Guru Bimbingan Konseling)
test("bk: admin dan waka membuat akun BK; BK masuk ke panel /bk dan melihat siswa semua kelas", async ({ page, browser }) => {
  const lap = await siapkan(page);
  await loginStaf(page, "admin");
  await menu(page, "Guru BK");
  await expect(judul(page)).toHaveText("Guru BK");
  await page.getByRole("button", { name: "Tambah guru BK" }).click();
  const dlg = page.getByRole("dialog", { name: "Tambah guru BK" });
  await dlg.getByLabel("Nama guru BK").fill("Bu Konselor Satu");
  await dlg.getByLabel("Email guru BK").fill(`bk1.${proyek()}@e2e.test`);
  await dlg.getByLabel("Password sementara").fill("sementara-123");
  await dlg.getByLabel("Ulangi password").fill("sementara-123");
  await dlg.getByRole("button", { name: "Simpan" }).click();
  await expect(toast(page)).toContainText("Akun BK Bu Konselor Satu dibuat");
  await expect(page.locator("[data-testid=daftar-bk] [data-uid]", { hasText: "Bu Konselor Satu" })).toContainText("Aktif");
  // akun BK tidak bercampur dengan daftar akun staf lain (kepala/waka/piket) di Pengaturan
  await page.goto("/admin/pengaturan");
  await expect(page.getByText("Bu Konselor Satu")).toHaveCount(0);
  // dropdown "Tambah akun pimpinan / staf" memuat opsi Guru BK yang mengarah ke menu Guru BK (alur yang sama)
  await page.getByRole("button", { name: "Tambah akun" }).click();
  const dpeng = page.getByRole("dialog", { name: "Tambah akun pimpinan / staf" });
  await dpeng.locator("select").selectOption("bk");
  await expect(dpeng.getByTestId("arahan-guru-bk")).toBeVisible();
  await expect(dpeng.getByRole("button", { name: "Buat akun" })).toHaveCount(0);
  await dpeng.getByRole("button", { name: "Buka menu Guru BK" }).click();
  await expect(page).toHaveURL(/\/admin\/guru-bk$/);
  bersih(lap, "admin (guru BK)");

  // waka: juga boleh membuat akun BK (per-field), tetapi tidak melihat catatan konseling
  const kW = await browser.newContext(opsiKonteks());
  const pw = await kW.newPage();
  const lapW = await siapkan(pw);
  await loginStaf(pw, "waka");
  await menu(pw, "Guru BK");
  await expect(pw.getByTestId("daftar-bk")).toContainText("Bu Konselor Satu");
  await pw.getByRole("button", { name: "Tambah guru BK" }).click();
  const d2 = pw.getByRole("dialog", { name: "Tambah guru BK" });
  await d2.getByLabel("Nama guru BK").fill("Pak Konselor Dua");
  await d2.getByLabel("Email guru BK").fill(`bk2.${proyek()}@e2e.test`);
  await d2.getByLabel("Password sementara").fill("sementara-123");
  await d2.getByLabel("Ulangi password").fill("sementara-123");
  await d2.getByRole("button", { name: "Simpan" }).click();
  await expect(toast(pw)).toContainText("Akun BK Pak Konselor Dua dibuat");
  await expect(pw.locator("aside.sidebar").getByRole("link", { name: /^Konseling/ })).toHaveCount(0);
  bersih(lapW, "waka (guru BK)");
  await kW.close();

  // BK masuk: panel /bk, siswa dari SEMUA kelas, menu tanpa izin/Alfa/manual
  const kB = await browser.newContext(opsiKonteks());
  const pb = await kB.newPage();
  const lapB = await siapkan(pb);
  await loginDengan(pb, `bk1.${proyek()}@e2e.test`, "sementara-123");
  await expect(pb).toHaveURL(/\/bk$/);
  await expect(pb.getByTestId("bk-jumlah-siswa")).not.toHaveText("0");
  const sb = pb.locator("aside.sidebar");
  for (const m of ["Dashboard", "Siswa", "Pembinaan", "Usulan remisi", "Laporan", "Konseling", "Panduan"]) await expect(sb.getByRole("link", { name: new RegExp(`^${m}`) })).toHaveCount(1);
  await expect(sb.getByRole("link", { name: /^Pelanggaran/ }), "v2.5: BK tidak mencatat pelanggaran (tanpa menu)").toHaveCount(0);
  for (const m of ["Izin", "Presensi manual", "Presensi per jam", "Kalender", "Validasi", "Tata tertib"]) await expect(sb.getByRole("link", { name: new RegExp(m) })).toHaveCount(0);
  await menu(pb, "Siswa");
  await expect(pb.locator(".students-grid[data-nis='111']")).toHaveCount(1); // kelas XI IPS
  await expect(pb.locator(".students-grid[data-nis='333']")).toHaveCount(1); // kelas X IPA
  await pb.getByLabel("Filter kelas").selectOption("X IPA");
  await expect(pb.locator(".students-grid[data-nis='111']")).toHaveCount(0);
  // portal siswa yang sama dengan orang tua, tanpa PIN / UID kartu
  await pb.getByLabel("Filter kelas").selectOption("");
  await pb.getByRole("link", { name: "Detail ANDI TEST" }).click();
  await expect(pb.getByTestId("ekstra-bk")).toBeVisible();
  const isi = await pb.locator("main.student-page").innerText();
  expect(isi).not.toMatch(/PIN|AAAA1111/);
  bersih(lapB, "bk (masuk)");
  await kB.close();
});

test("bk: klaim lalu pembinaan ambang BK lintas kelas, usulan remisi siswa yang diklaim, dan konseling rahasia (tulis, koreksi, riwayat)", async ({ page }) => {
  const tgl = T.hariIni, ta = taDari(tgl);
  // ambang berpenanggung jawab BK; dua siswa dari KELAS BERBEDA melewatinya
  await dbRest("PUT", "discipline/levels/e2eLvBk", { poin: 150, tindakan: "Teguran 2 — pembinaan BK", penanggungJawab: "bk" });
  for (const nis of ["333", "444"]) {
    await dbRest("PUT", `discipline/records/${nis}/e2eBk${nis}`, { jenis: "pelanggaran", nama: "Uji BK", poin: 160, tanggal: tgl, ta, sumber: "manual" });
    await dbRest("PUT", `discipline/recordMeta/${nis}/e2eBk${nis}`, { dibuatOleh: "seed", dibuatNama: "Seed", dibuatTs: Date.now() });
  }
  await dbRest("PUT", "discipline/records/111/e2eBk111", { jenis: "pelanggaran", nama: "Uji BK", poin: 160, tanggal: tgl, ta, sumber: "manual" });
  await dbRest("PUT", "discipline/recordMeta/111/e2eBk111", { dibuatOleh: "seed", dibuatNama: "Seed", dibuatTs: Date.now() });

  const lap = await siapkan(page);
  await loginDengan(page, `bk1.${proyek()}@e2e.test`, "sementara-123");
  await expect(page).toHaveURL(/\/bk$/);
  await expect(page.getByTestId("lencana-pembinaan"), "lencana menu Pembinaan").toHaveText(/^[1-9]/);
  await expect(page.getByTestId("bk-perlu-dibina")).not.toHaveText("0");

  // pembinaan: siswa dari X IPA (333) DAN XI IPS (111) sama-sama muncul
  await menu(page, "Pembinaan");
  const belum = page.getByTestId("daftar-belum-ditangani");
  await expect(belum.locator("[data-nis='333'][data-level='e2eLvBk']")).toHaveCount(1);
  await expect(belum.locator("[data-nis='111'][data-level='e2eLvBk']")).toHaveCount(1);
  await expect(belum.locator("[data-nis='333'][data-level='e2eLvBk']")).toContainText("Ambang 150 poin");
  // v2.5: klaim dulu (siapa cepat dia dapat), baru dibina; yang diklaim pindah ke "Tangani saya"
  await belum.locator("[data-nis='333'][data-level='e2eLvBk']").getByTestId("klaim-siswa").click();
  const saya = page.getByTestId("daftar-tangani-saya");
  await expect(saya.locator("[data-nis='333'][data-level='e2eLvBk']")).toHaveCount(1);
  await expect(belum.locator("[data-nis='333'][data-level='e2eLvBk']")).toHaveCount(0);
  await saya.locator("[data-nis='333'][data-level='e2eLvBk']").getByTestId("catat-pembinaan").click();
  const pbDlg = page.getByRole("dialog", { name: "Catat pembinaan" });
  await pbDlg.getByLabel("Hasil pembinaan").fill("Siswa dipanggil BK, diberi arahan, dan menyetujui rencana perbaikan");
  await pbDlg.getByRole("button", { name: "Simpan" }).click();
  await expect(toast(page)).toContainText("Pembinaan dicatat selesai");
  await expect(saya.locator("[data-nis='333'][data-level='e2eLvBk']")).toHaveCount(0);
  await expect(page.getByTestId("riwayat-pembinaan").locator("[data-nis='333']")).toContainText("Selesai");

  // v2.5: BK tidak lagi mencatat pelanggaran: tanpa menu, rute lama dialihkan
  await expect(page.locator("aside.sidebar").getByRole("link", { name: /^Pelanggaran/ })).toHaveCount(0);
  await page.goto("/bk/pelanggaran");
  await expect(page).toHaveURL(/\/bk$/);

  // usulan remisi (v2.5: hanya siswa yang diklaim BK; 555 yang tidak diklaim tidak ada di pilihan)
  await menu(page, "Usulan remisi");
  await page.getByTestId("form-usulan").getByPlaceholder("Ketik NIS atau nama siswa...").fill("555");
  await expect(page.locator(".picker-list li[role=option]", { hasText: "EKO TEST" })).toHaveCount(0);
  await page.getByTestId("form-usulan").getByPlaceholder("Ketik NIS atau nama siswa...").fill("333");
  await page.locator(".picker-list li[role=option]", { hasText: "CITRA TEST" }).click();
  const opsiRemisi = page.getByLabel("Remisi", { exact: true }).locator("option").nth(1);
  await page.getByLabel("Remisi", { exact: true }).selectOption({ index: 1 });
  expect(await opsiRemisi.count()).toBe(1);
  await page.getByLabel("Alasan usulan").fill("Aktif membantu kegiatan sekolah dan menunjukkan perubahan sikap");
  await page.getByRole("button", { name: "Kirim usulan" }).click();
  await expect(toast(page)).toContainText("Usulan dikirim ke Waka/Kepala");

  // konseling rahasia: catat, lihat, koreksi (isi lama masuk riwayat koreksi)
  await menu(page, "Konseling");
  await page.getByRole("button", { name: "Catatan baru" }).click();
  const kd = page.getByRole("dialog", { name: "Catatan konseling baru" });
  await kd.getByRole("button", { name: "Simpan" }).click();
  await expect(kd).toContainText("Pilih siswa");
  await kd.getByPlaceholder("Ketik NIS atau nama siswa...").fill("444");
  await expect(page.locator(".picker-list li[role=option]", { hasText: "DINA TEST" })).toBeVisible();
  await kd.getByPlaceholder("Ketik NIS atau nama siswa...").press("Enter"); // pilih opsi aktif lewat keyboard (daftar dirender ulang saat data realtime tiba)
  await kd.getByLabel("Topik konseling").selectOption("Keluarga");
  await kd.getByLabel("Isi konseling").fill("pendek");
  await kd.getByRole("button", { name: "Simpan" }).click();
  await expect(kd).toContainText("minimal 10 karakter");
  const ISI_LAMA = "Siswa menceritakan perselisihan di rumah yang mengganggu belajarnya.";
  await kd.getByLabel("Isi konseling").fill(ISI_LAMA);
  await kd.getByLabel("Tindak lanjut konseling").fill("Pertemuan lanjutan pekan depan");
  await kd.getByRole("button", { name: "Simpan" }).click();
  await expect(toast(page)).toContainText("Catatan konseling disimpan");
  const baris = page.getByTestId("daftar-konseling").locator("[data-nis='444']");
  await expect(baris).toContainText("Keluarga");
  await expect(baris).toContainText("perselisihan di rumah");
  await baris.getByRole("button", { name: /^Koreksi catatan/ }).click();
  const kd2 = page.getByRole("dialog", { name: "Koreksi catatan konseling" });
  const ISI_BARU = "Siswa dan orang tua sudah bertemu BK; perselisihan mulai reda dan siswa fokus belajar.";
  await kd2.getByLabel("Isi konseling").fill(ISI_BARU);
  await kd2.getByRole("button", { name: "Simpan" }).click();
  await expect(toast(page)).toContainText("Catatan konseling dikoreksi");
  await baris.getByRole("button", { name: /^Buka catatan/ }).click();
  await expect(baris).toContainText("mulai reda");
  await expect(baris.getByTestId("riwayat-koreksi")).toContainText("perselisihan di rumah"); // isi lama tersimpan di riwayat koreksi
  await expect(baris).toContainText("dikoreksi");
  // tidak ada tombol hapus fisik
  await expect(baris.getByRole("button", { name: /Hapus/i })).toHaveCount(0);
  // detail siswa: bagian konseling rahasia + catatan BK
  await menu(page, "Siswa");
  await page.getByRole("link", { name: "Detail DINA TEST" }).click();
  await expect(page.getByTestId("konseling-siswa")).toContainText("rahasia");
  await expect(page.getByTestId("konseling-siswa")).toContainText("mulai reda");
  bersih(kecualikan(lap, 2), "bk (klaim, pembinaan, usulan, konseling)");
});

test("bk: konseling HANYA terbaca akun BK (kepala, waka, admin, wali, dan orang tua tidak); usulan BK diputuskan waka", async ({ page, browser }) => {
  // v2.5: kepala tidak lagi membaca konseling; semua akun BK membaca
  const lap = await siapkan(page);
  await loginStaf(page, "kepala");
  await expect(page.locator("aside.sidebar").getByRole("link", { name: /^Konseling/ })).toHaveCount(0);
  await page.goto("/kepala/konseling");
  await expect(page).toHaveURL(/\/kepala$/);
  await expect(page.locator("body")).not.toContainText("perselisihan di rumah");
  bersih(lap, "kepala (tanpa konseling)");

  // waka & admin: tidak ada menu Konseling; membuka /…/konseling langsung dialihkan; usulan BK masuk antrean keputusan waka
  for (const peran of ["waka", "admin"]) {
    const k = await browser.newContext(opsiKonteks());
    const p = await k.newPage();
    const l = await siapkan(p);
    await loginStaf(p, peran);
    await expect(p.locator("aside.sidebar").getByRole("link", { name: /^Konseling/ })).toHaveCount(0);
    await p.goto(`/${peran}/konseling`);
    await expect(p).toHaveURL(new RegExp(`/${peran}$`));
    if (peran === "waka") {
      await menu(p, "Usulan remisi");
      await expect(p.locator("body")).toContainText("CITRA TEST"); // usulan BK terlihat sebagai usulan biasa
      await expect(p.locator("body")).not.toContainText("perselisihan di rumah"); // isi konseling tidak pernah bocor
    }
    bersih(l, `${peran} (tanpa konseling)`);
    await k.close();
  }

  // orang tua: portal tidak memuat konseling
  const kO = await browser.newContext(opsiKonteks());
  const po = await kO.newPage();
  const lapO = await siapkan(po);
  await loginOrtu(po, "222", "739104");
  await expect(po.locator("body")).not.toContainText(/konseling/i);
  bersih(lapO, "ortu (tanpa konseling)");
  await kO.close();
});

// ===================================================================== v2.5.2 — satu tugas satu pengisi
test("v2.5.2 Data siswa (TU): tidak ada ikon catat izin/sakit; kolom aksi lain tetap", async ({ page }) => {
  const lap = await siapkan(page);
  await loginStaf(page, "admin");
  await menu(page, "Data siswa");
  await expect(page.locator("[data-nis='111'], tr:has-text('ANDI TEST'), .table-row:has-text('ANDI TEST')").first()).toBeVisible();
  await expect(page.getByRole("button", { name: /Izin atau sakit/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Tambah siswa" })).toBeVisible();
  bersih(lap, "admin (Data siswa tanpa catat izin)");
});

test("v2.5.2 Kontrol kalender: TU hanya diingatkan; Waka menandai tanggal -> kandidat berkurang", async ({ page, browser }) => {
  const dk = tanggalKosong();
  await dbPut(`kalenderEfektif/${dk}`, { efektif: false, tap: 0, manual: 0, sumber: "otomatis", dihitung: Date.now() });
  await dbPut(`kalender/${dk}`, null);
  const kandidat = async (p) => { const el = p.getByTestId("kontrol-kandidat"); return (await el.count()) ? Number(await el.textContent()) : 0; };

  const lap = await siapkan(page);
  await loginStaf(page, "admin");
  await expect(page.getByTestId("kontrol-kalender")).toBeVisible();
  await expect(page.getByTestId("kontrol-kandidat")).toBeVisible();
  await expect(page.getByTestId("kontrol-ingatkan")).toBeVisible(); // TU: hanya pengingat
  await expect(page.getByTestId("kontrol-ke-kalender")).toHaveCount(0);
  bersih(lap, "admin (kontrol kalender)");

  const kW = await browser.newContext(opsiKonteks());
  const pw = await kW.newPage();
  const lapW = await siapkan(pw);
  await loginStaf(pw, "waka");
  await expect(pw.getByTestId("kontrol-kalender")).toBeVisible();
  await expect(pw.getByTestId("kontrol-ingatkan")).toHaveCount(0);
  const sebelum = await kandidat(pw);
  expect(sebelum).toBeGreaterThanOrEqual(1);
  await pw.getByTestId("kontrol-ke-kalender").click();
  await expect(judul(pw)).toHaveText("Kalender akademik");
  await pilihTanggalKal(pw, dk);
  await atur(pw, "libur", "Libur uji kontrol kalender");
  await pw.getByRole("button", { name: "Simpan override" }).click();
  await expect(toast(pw)).toContainText("override libur tersimpan");
  await menu(pw, "Dashboard");
  await expect.poll(() => kandidat(pw), { timeout: 15_000 }).toBe(sebelum - 1);
  bersih(lapW, "waka (kontrol kalender)");
  await kW.close();
  await dbPut(`kalender/${dk}`, null);
  await dbPut(`kalenderEfektif/${dk}`, null);
});

test("v2.5.2 hitung kalender otomatis menurut PERAN: kepala menghitung hari ini; admin tidak menulis dan tanpa error permission", async ({ page, browser }) => {
  await dbPut(`kalenderEfektif/${T.hariIni}`, null);
  const lap = await siapkan(page);
  await loginStaf(page, "admin");
  await expect(page.getByTestId("kontrol-kalender").or(page.getByRole("heading").first())).toBeVisible();
  await page.waitForTimeout(3000); // beri kesempatan bila ada penulisan otomatis (seharusnya tidak ada)
  expect(await dbGet(`kalenderEfektif/${T.hariIni}`), "admin tidak menulis ringkasan hari ini").toBeNull();
  bersih(lap, "admin (tanpa percobaan tulis kalender)");

  const kK = await browser.newContext(opsiKonteks());
  const pk = await kK.newPage();
  const lapK = await siapkan(pk);
  await loginStaf(pk, "kepala");
  await expect.poll(async () => (await dbGet(`kalenderEfektif/${T.hariIni}`))?.tap ?? -1, { timeout: 20_000 }).toBeGreaterThan(0);
  expect(await dbGet(`kalenderEfektif/${T.hariIni}`)).toMatchObject({ sumber: "otomatis" });
  bersih(lapK, "kepala (hitung otomatis, tanpa error permission)");
  await kK.close();
});

test("v2.5.2 deteksi migrasi dari data: tanpa penanda tetapi semua profil punya aktifSejak dan kalenderEfektif berisi -> terdeteksi; Waka dapat menandai sekali", async ({ page }) => {
  const profil = (await dbGet("profiles")) ?? {};
  const nisList = Object.keys(profil);
  expect(nisList.length, "ada profil uji").toBeGreaterThan(0);
  const asli = Object.fromEntries(nisList.map((n) => [n, profil[n].aktifSejak ?? null]));
  expect(Object.keys((await dbGet("kalenderEfektif")) ?? {}).length, "kalenderEfektif sudah berisi (hasil uji sebelumnya)").toBeGreaterThan(0);
  // keadaan produksi sebelum penanda ada: tanpa penanda, semua profil punya aktifSejak
  await dbPut("sistem/migrasiKalender", null);
  for (const n of nisList) await dbPut(`profiles/${n}/aktifSejak`, T.kemarin);

  const lap = await siapkan(page);
  await loginStaf(page, "waka");
  await menu(page, "Kalender");
  const panel = page.getByTestId("migrasi-kalender");
  await expect(page.getByTestId("migrasi-terdeteksi")).toContainText("Migrasi sudah dijalankan (terdeteksi dari data)");
  await expect(page.getByTestId("migrasi-sudah")).toHaveCount(0);
  await expect(panel.getByRole("button", { name: "Periksa (dry-run)" })).toBeDisabled();
  await expect(panel.getByRole("button", { name: "Terapkan migrasi" })).toBeDisabled();
  expect(await dbGet("sistem/migrasiKalender"), "deteksi tidak menulis apa pun").toBeNull();

  // opsional: Waka menandai (sekali tulis + log)
  await panel.getByTestId("migrasi-tandai").click();
  await expect(page.getByTestId("migrasi-sudah")).toContainText("Migrasi sudah dijalankan");
  await expect(page.getByTestId("migrasi-terdeteksi")).toHaveCount(0);
  await expect(panel.getByTestId("migrasi-tandai")).toHaveCount(0);
  const penanda = await dbGet("sistem/migrasiKalender");
  expect(penanda).toMatchObject({ dari: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/), sampai: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) });
  const log = Object.values((await dbGet(`activity/${T.hariIni}`)) ?? {});
  expect(log.some((e) => e.aksi === "migrasi-kalender" && e.akunEmail === emailStaf("waka") && /Ditandai sudah dimigrasi/.test(e.detail ?? "")), "log migrasi-kalender oleh Waka").toBe(true);
  for (const n of nisList) expect((await dbGet(`profiles/${n}`)).nama, "profil lain tidak berubah").toBe(profil[n].nama);
  bersih(lap, "waka (deteksi migrasi + tandai)");

  // keadaan 'belum': satu profil tanpa aktifSejak dan tanpa penanda -> tombol migrasi aktif kembali (dry-run)
  await dbPut("sistem/migrasiKalender", null);
  await dbPut(`profiles/${nisList[0]}/aktifSejak`, null);
  await page.reload();
  await menu(page, "Kalender");
  await expect(page.getByTestId("migrasi-terdeteksi")).toHaveCount(0);
  await expect(page.getByTestId("migrasi-sudah")).toHaveCount(0);
  await expect(panel.getByRole("button", { name: "Periksa (dry-run)" })).toBeEnabled();

  // pulihkan keadaan semula
  for (const n of nisList) await dbPut(`profiles/${n}/aktifSejak`, asli[n]);
});
