// Uji skrip migrasi (scripts/migrasi_firebase.py = sel notebook) terhadap EMULATOR dengan data contoh.
// Membuktikan: dry-run tidak menulis apa pun; data modul baru & peran staf TIDAK tertimpa; rotasi password alat butuh "YA";
// data yang ada tidak ditimpa; dan data hasil migrasi LOLOS Security Rules terbaru serta terbaca normal oleh web (admin/waka/ortu).
// Jalankan: npm run test:migrasi  (butuh Java untuk emulator dan `pip install firebase-admin`).
import assert from "node:assert/strict";
import { isDeepStrictEqual } from "node:util";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { encodeKelas } from "../src/lib/perjam.ts";
import { muatRulesTerverifikasi } from "./emu.mjs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const DB = "http://127.0.0.1:9000";
const AUTH = "http://127.0.0.1:9099";
const OWNER = { Authorization: "Bearer owner" };
const rnd = () => randomBytes(3).toString("hex");
const NS = `migrasi-${rnd()}`;
const NS2 = `migrasi-replay-${rnd()}`;
const DEVICE_EMAIL = "esp32-01@device.presensi-ma.local";
const PW_LAMA = "password-alat-lama-123";
const CSV = join(tmpdir(), `pin_migrasi_${rnd()}.csv`);
let lolos = 0;
const gagal = [];
const cek = (nama, kondisi, info = "") => { if (kondisi) { lolos++; console.log(`  ✓ ${nama}`); } else { gagal.push(`${nama} ${info}`); console.log(`  ✗ ${nama} ${info}`); } };

async function http(ns, method, path, { body, token, owner } = {}) {
  const q = new URLSearchParams({ ns });
  if (token) q.set("auth", token);
  const res = await fetch(`${DB}/${path}.json?${q}`, { method, headers: { "Content-Type": "application/json", ...(owner ? OWNER : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  let json = null; try { json = await res.json(); } catch { /* kosong */ }
  return { status: res.status, json };
}
const sebagaiPemilik = (ns, method, path, body) => http(ns, method, path, { owner: true, body });
async function authPost(endpoint, body) {
  const res = await fetch(`${AUTH}/identitytoolkit.googleapis.com/v1/accounts:${endpoint}?key=fake`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return res.json();
}
const buatUser = async (email, password) => { const j = await authPost("signUp", { email, password, returnSecureToken: true }); assert.ok(j.localId, `gagal buat ${email}: ${JSON.stringify(j)}`); return { uid: j.localId, token: j.idToken }; };
const masuk = async (email, password) => { const j = await authPost("signInWithPassword", { email, password, returnSecureToken: true }); return j.idToken ? { uid: j.localId, token: j.idToken } : null; };

const rules = readFileSync(new URL("../database.rules.json", import.meta.url), "utf8");
for (const ns of [NS, NS2]) {
  await muatRulesTerverifikasi({ db: DB, ns, teks: rules, label: `migrasi ${ns}` });
}

// ---------------------------------------------------------------- data PRA-ADA (modul baru + peran staf + data yang tidak boleh ditimpa)
const wakaUid = `wk${rnd()}`, kepalaUid = `kp${rnd()}`, piketUid = `pk${rnd()}`;
const DILINDUNGI = {
  staff: { [wakaUid]: { email: "waka@x", nama: "Waka", role: "waka", dibuat: 1 }, [piketUid]: { email: "piket@x", nama: "Meja", role: "piket", dibuat: 1 } },
  discipline: { rules: { r1: { kategori: "Ringan", nama: "Contoh", poin: 5, aktif: true, diubahOleh: wakaUid, diubahTs: 1 } }, autoMap: { terlambat: "r1" } },
  lessons: { "2026-09-01": { "XI IPS": { absen: { 9001: { 2: "A" } }, oleh: wakaUid, ts: 1 } } },
  lessonsByStudent: { 9001: { "2026-09-01": { 2: { k: "A" } } } },
  validasi: { "2026-09-01": { 9001: { status: "Alfa", oleh: wakaUid, ts: 1 } } },
  validasiByStudent: { 9001: { "2026-09-01": { status: "Alfa" } } },
  izinMeta: { "2026-09-05": { 9002: { abc_H: { lingkup: "harian", ket: "Dispensasi", keterangan: "lomba", suratDiterima: true, petugas: "Bu Rina", oleh: piketUid, ts: 1, hariKe: 20700 } } } },
  activity: { "2026-09-05": { a1: { uid: piketUid, peran: "piket", akunEmail: "p@x", petugas: "Bu Rina", aksi: "izin-harian", detail: "x", deviceId: "dev-12345678", deviceLabel: "Uji", ts: 1, hariKe: 20700 } } },
  activityLast: { [piketUid]: { id: "a1", ts: 1, tgl: "2026-09-05" } },
  piketRoster: { p1: { nama: "Bu Rina", aktif: true } },
  piketAkun: { [piketUid]: { email: "piket@x", nama: "Meja", terkunci: false } },
  piketPerangkat: { "dev-12345678": { uid: piketUid, pertama: 1, label: "Uji" } },
  piketHarian: { "2026-09-05": { r1: { nis: "9002", nama: "BUDI DUA", kelas: "XI IPS", pelanggaran: "Contoh", petugas: "Bu Rina", hariKe: 20700, refId: "r1", poin: 5 } } },
  manualTap: { "2026-09-01": { 9003: { masuk: "07:10:00", status: "Hadir", alasan: "Lupa KTM", oleh: wakaUid, ts: 1, hariKe: 20697 } } },
  manualTapByStudent: { 9003: { "2026-09-01": { masuk: "07:10:00", status: "Hadir", alasan: "Lupa KTM" } } },
  sistem: { backupTerakhir: 1234567890 },
};
const PRA = {
  ...DILINDUNGI,
  roles: { [wakaUid]: "waka", [kepalaUid]: "kepala", [piketUid]: "piket" },
  attendance: { 9001: { "2026-09-02": { masuk: "07:30:00", status: "Terlambat" } }, 9002: { "2026-09-05": { ket: "Dispensasi", catatan: "lomba" } } },
  izin: { "2026-09-05": { 9002: "Dispensasi" } },
  config: { version: 1 },
  siswaKelas: { 9002: "X IPA", 7777: "X IPA" }, // 9002 salah kelas (seharusnya XI IPS); 7777 tanpa siswa (usang)
};
await sebagaiPemilik(NS, "PUT", "", PRA);
const alatLama = await buatUser(DEVICE_EMAIL, PW_LAMA); // akun alat SUDAH ada (firmware berjalan)
await sebagaiPemilik(NS, "PATCH", "", { [`roles/${alatLama.uid}`]: "device" });

const env = { ...process.env, FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:9099", FIREBASE_DATABASE_EMULATOR_HOST: "127.0.0.1:9000", PYTHONIOENCODING: "utf-8" };
const jalan = (mode) => {
  const r = spawnSync("python", ["tests/migrasi_run.py", NS, mode, CSV], { env, encoding: "utf8", cwd: process.cwd() });
  const m = /HASIL_JSON=(.*)/.exec(r.stdout ?? "");
  if (!m) { console.error(r.stdout, r.stderr); throw new Error(`pelari migrasi (${mode}) gagal, status ${r.status}`); }
  return { ...JSON.parse(m[1]), keluaran: r.stdout };
};
const semua = async () => (await sebagaiPemilik(NS, "GET", "")).json;

// ================================================================ 1. DRY-RUN (bawaan): tidak menulis apa pun
console.log("\n1. DRY-RUN");
const sebelum = await semua();
const dry = jalan("dry");
const sesudahDry = await semua();
cek("dry-run: seluruh database IDENTIK (tidak ada tulisan)", JSON.stringify(sebelum) === JSON.stringify(sesudahDry));
cek("dry-run: keluaran menyatakan dry-run", /dry-run/i.test(dry.keluaran));
cek("dry-run: 6 baris induk tidak valid dilaporkan", dry.masalah.length === 6, JSON.stringify(dry.masalah));
cek("dry-run: nama > 60 dan kelas > 15 DILEWATI (bukan dipotong diam-diam)", dry.masalah.some((x) => /nama > 60/.test(x)) );
cek("dry-run: 3 akun ortu akan dibuat", dry.ortu_baru === 3);
cek("dry-run: laporan indeks siswaKelas (2 baru, 1 berubah, 1 usang, 0 sesuai)", dry.indeks.baru === 2 && dry.indeks.berubah === 1 && dry.indeks.usang === 1 && dry.indeks.sama === 0, JSON.stringify(dry.indeks));
cek("dry-run: indeks siswaKelas TIDAK ditulis", JSON.stringify(sesudahDry.siswaKelas) === JSON.stringify(sebelum.siswaKelas) && sesudahDry.siswaKelas[9002] === "X IPA");
cek("dry-run: 2 data sudah ada akan dilewati (hari alat + Dispensasi)", dry.riwayat.sudah_ada === 2, JSON.stringify(dry.riwayat));
cek("dry-run: akun admin TIDAK dibuat", (await masuk("admin.migrasi@uji.test", "password-admin-123")) === null);
cek("dry-run: akun ortu TIDAK dibuat", (await masuk("9001.1@ortu.presensi-ma.local", "000000")) === null);
cek("dry-run: password alat TIDAK berubah", (await masuk(DEVICE_EMAIL, PW_LAMA)) !== null);

// ================================================================ 2. TULIS NYATA (tanpa rotasi)
console.log("\n2. TULIS NYATA tanpa konfirmasi rotasi");
const real = jalan("real");
const d1 = await semua();
cek("peran admin terpasang untuk admin", d1.roles?.[real.admin_uid] === "admin");
cek("peran device terpasang untuk alat", d1.roles?.[real.device_uid] === "device" && real.device_uid === alatLama.uid);
cek("peran kepala/waka/piket TIDAK berubah", d1.roles[wakaUid] === "waka" && d1.roles[kepalaUid] === "kepala" && d1.roles[piketUid] === "piket");
for (const k of Object.keys(DILINDUNGI)) cek(`node modul lain '${k}' TIDAK berubah`, isDeepStrictEqual(d1[k], PRA[k]), JSON.stringify(d1[k])?.slice(0, 120));
cek("password alat TIDAK dirotasi tanpa konfirmasi 'YA'", (await masuk(DEVICE_EMAIL, PW_LAMA)) !== null && real.rotasi_alat === false && !real.device_password);
cek("tidak ada kredensial alat baru dicetak", !("password" in {}) && real.device_password == null);
cek("data alat yang sudah ada (9001 2026-09-02) TIDAK ditimpa", JSON.stringify(d1.attendance[9001]["2026-09-02"]) === JSON.stringify(PRA.attendance[9001]["2026-09-02"]));
cek("Dispensasi yang sudah ada (9002) TIDAK ditimpa (izin + attendance)", d1.izin["2026-09-05"][9002] === "Dispensasi" && d1.attendance[9002]["2026-09-05"].ket === "Dispensasi" && d1.attendance[9002]["2026-09-05"].catatan === "lomba");
cek("3 siswa valid masuk config/students & profiles", Object.keys(d1.config.students).length === 3 && Object.keys(d1.profiles).length === 3);
cek("indeks siswaKelas: setiap siswa config/students punya indeks kelas yang sama dengan web", Object.values(d1.config.students).every((s) => d1.siswaKelas?.[s.nis] === encodeKelas(s.kelas)), JSON.stringify(d1.siswaKelas));
cek("indeks siswaKelas: 9002 yang salah dikoreksi; 7777 usang TIDAK dihapus migrasi", d1.siswaKelas[9002] === "XI IPS" && d1.siswaKelas[7777] === "X IPA");
cek("baris tidak valid tidak ikut tertulis", !d1.config.students.XYZ && !d1.profiles[9004] && !d1.profiles[9005] && !d1.profiles.ab12 && !d1.profiles[9008]);
cek("parents/{nis} = {uid, ver:1} untuk 3 siswa", ["9001", "9002", "9003"].every((n) => d1.parents[n]?.ver === 1 && d1.parents[n]?.uid));
cek("presensi masuk+pulang 9001 tertulis (format jam rules)", JSON.stringify(d1.attendance[9001]["2026-09-01"]) === JSON.stringify({ masuk: "07:05:00", pulang: "15:01:00", status: "Hadir" }));
cek("tanggal dd/mm/yyyy dinormalkan (9002 Terlambat)", d1.attendance[9002]["2026-09-01"]?.status === "Terlambat" && d1.attendance[9002]["2026-09-01"]?.masuk === "07:20:00");
cek("jam tidak valid ('7pm', '24:30') dan baris Guru dilewati", !d1.attendance[9003]?.["2026-09-01"]);
cek("log/{tgl}/{UID}_M|_P tertulis", d1.log["2026-09-01"].AAAAAAA1_M?.status === "Hadir" && d1.log["2026-09-01"].AAAAAAA1_P?.jam === "15:01:00" && d1.log["2026-09-01"].BBBBBBB2_M?.status === "Terlambat");
cek("izin Sakit/Izin tertulis di attendance/ket + izin/{tgl}/{nis} + catatan", d1.izin["2026-09-03"][9003] === "Sakit" && d1.attendance[9003]["2026-09-03"].ket === "Sakit" && d1.attendance[9003]["2026-09-03"].catatan === "demam" && d1.izin["2026-09-04"][9003] === "Izin");
const jadwal = Object.values(d1.config.schedule ?? {});
cek("jadwal: hanya 4 baris valid; '6:45' dinormalkan", jadwal.length === 4 && jadwal.some((x) => x.kelas === "X IPA" && x.mulai === "06:45"), JSON.stringify(jadwal));
cek("config/version naik", typeof d1.config.version === "number" && d1.config.version > 1);
cek("CSV PIN berisi 3 siswa baru", existsSync(CSV) && readFileSync(CSV, "utf8").trim().split("\n").length === 4);
const pin = Object.fromEntries(readFileSync(CSV, "utf8").trim().split("\n").slice(1).map((l) => { const c = l.replace(/"/g, "").split(","); return [c[0].replace(/^﻿/, ""), c[3].trim()]; }));
cek("akun ortu dapat login dengan PIN dari CSV", (await masuk("9001.1@ortu.presensi-ma.local", pin["9001"])) !== null);

// ================================================================ 3. diulang: idempoten
console.log("\n3. Diulang (idempoten)");
const ulang = jalan("real");
const d2 = await semua();
cek("ulang: tidak ada akun ortu baru, PIN lama tetap berlaku", ulang.ortu_baru === 0 && (await masuk("9001.1@ortu.presensi-ma.local", pin["9001"])) !== null);
cek("ulang: data presensi sama (hari yang sudah terisi dilewati)", ulang.riwayat.sudah_ada >= 5 && JSON.stringify(d2.attendance) === JSON.stringify(d1.attendance));

// ================================================================ 4. rotasi dengan konfirmasi YA
console.log("\n4. Rotasi password alat (konfirmasi YA)");
const rot = jalan("rotasi");
cek("rotasi: password lama GAGAL, baru BERHASIL", (await masuk(DEVICE_EMAIL, PW_LAMA)) === null && rot.rotasi_alat === true && (await masuk(DEVICE_EMAIL, rot.device_password)) !== null);
cek("rotasi: peran alat tetap 'device'", (await semua()).roles[alatLama.uid] === "device");

// ================================================================ 5. penjaga jalur & peran
console.log("\n5. Penjaga jalur terlarang & peran");
const kunci = jalan("kunci");
for (const [k, v] of Object.entries(kunci).filter(([k]) => k !== "keluaran")) cek(`kunci kelas Python = encodeKelas web: ${JSON.stringify(k)}`, v === encodeKelas(k), `${v} vs ${encodeKelas(k)}`);
const bt = jalan("batch");
cek("batch: setiap siswa (config + profil + indeks kelas) utuh dalam satu update", bt.utuh === true && bt.total === 1000, JSON.stringify(bt));
cek("batch: tiap update <= 400 path", bt.batch.every((n) => n <= 400), JSON.stringify(bt.batch));
const guard = jalan("guard");
for (const [p, h] of Object.entries(guard.jalur)) cek(`jalur '${p}' ditolak skrip`, h === "ditolak");
cek("uid berperan waka TIDAK dijadikan admin", guard.peran_waka === "ditolak" && guard.role_waka_setelah === "waka");

// ================================================================ 6. data hasil migrasi LOLOS rules terbaru & terbaca web
console.log("\n6. Replay ke database ber-RULES: data hasil migrasi lolos & terbaca normal");
const adminW = await buatUser(`admin.replay.${rnd()}@uji.test`, "password-uji-123");
const wakaW = await buatUser(`waka.replay.${rnd()}@uji.test`, "password-uji-123");
const alatW = await buatUser(`alat.replay.${rnd()}@uji.test`, "password-uji-123");
await sebagaiPemilik(NS2, "PUT", "", { roles: { [adminW.uid]: "admin", [wakaW.uid]: "waka", [alatW.uid]: "device" } });
const hasilMigrasi = await semua();
const kirim = async (nama, who, method, path, body) => { const r = await http(NS2, method, path, { token: who.token, body }); cek(`replay: ${nama}`, r.status === 200, `status ${r.status} ${JSON.stringify(r.json)}`); return r; };
await kirim("admin menulis config/students", adminW, "PUT", "config/students", hasilMigrasi.config.students);
await kirim("admin menulis config/schedule", adminW, "PUT", "config/schedule", hasilMigrasi.config.schedule);
await kirim("admin menulis config/version", adminW, "PUT", "config/version", hasilMigrasi.config.version);
// rules menulis per-anak ($nis / $key), jadi replay memakai PATCH multi-path (seperti Admin SDK update)
const multi = (node, prefixFn = (k) => k) => Object.fromEntries(Object.entries(node ?? {}).map(([k, v]) => [prefixFn(k), v]));
await kirim("admin menulis siswaKelas/{nis}", adminW, "PATCH", "", multi(hasilMigrasi.siswaKelas, (k) => `siswaKelas/${k}`));
await kirim("admin menulis profiles/{nis}", adminW, "PATCH", "", multi(hasilMigrasi.profiles, (k) => `profiles/${k}`));
await kirim("admin menulis parents/{nis}", adminW, "PATCH", "", multi(hasilMigrasi.parents, (k) => `parents/${k}`));
const izinPaths = {};
for (const [tgl, per] of Object.entries(hasilMigrasi.izin ?? {})) for (const [nis, v] of Object.entries(per)) izinPaths[`izin/${tgl}/${nis}`] = v;
// v2.5.2: izin harian bukan lagi hak admin (TU); data hasil migrasi diputar ulang oleh Waka (pemilik tugas izin) agar tetap lolos rules
await kirim("waka menulis izin/{tgl}/{nis}", wakaW, "PATCH", "", izinPaths);
const logPaths = {};
for (const [tgl, per] of Object.entries(hasilMigrasi.log ?? {})) for (const [key, v] of Object.entries(per)) logPaths[`log/${tgl}/${key}`] = v;
await kirim("alat menulis log/{tgl}/{UID}_{M|P}", alatW, "PATCH", "", logPaths);
const att = hasilMigrasi.attendance;
for (const [nis, per] of Object.entries(att)) {
  for (const [tgl, rec] of Object.entries(per)) {
    const { ket, catatan, ...tap } = rec;
    if (Object.keys(tap).length) await kirim(`alat menulis attendance/${nis}/${tgl}`, alatW, "PUT", `attendance/${nis}/${tgl}`, tap);
    if (ket) await kirim(`waka menulis ket attendance/${nis}/${tgl}`, wakaW, "PATCH", `attendance/${nis}/${tgl}`, { ket, ...(catatan ? { catatan } : {}) });
  }
}
const ortu = await masuk("9001.1@ortu.presensi-ma.local", pin["9001"]);
const bacaOrtu = await http(NS2, "GET", "attendance/9001", { token: ortu.token });
cek("web: ortu membaca presensi anaknya", bacaOrtu.status === 200 && bacaOrtu.json?.["2026-09-01"]?.status === "Hadir");
cek("web: ortu membaca profil anaknya", (await http(NS2, "GET", "profiles/9001", { token: ortu.token })).json?.nama === "ANDI SATU");
cek("web: ortu TIDAK membaca anak lain", (await http(NS2, "GET", "attendance/9002", { token: ortu.token })).status === 401 || (await http(NS2, "GET", "attendance/9002", { token: ortu.token })).status === 403);
cek("web: admin membaca config/students", Object.keys((await http(NS2, "GET", "config/students", { token: adminW.token })).json ?? {}).length === 3);
cek("web: waka membaca daftar presensi", (await http(NS2, "GET", "attendance", { token: wakaW.token })).status === 200);
cek("web: waka membaca log hari itu", Object.keys((await http(NS2, "GET", "log/2026-09-01", { token: wakaW.token })).json ?? {}).length === 3);

// wali kelas bekerja di atas data hasil migrasi: indeks siswaKelas (hasil migrasi) membatasi wewenangnya
const waliW = await buatUser(`wali.replay.${rnd()}@uji.test`, "password-uji-123");
await sebagaiPemilik(NS2, "PATCH", "", { [`roles/${waliW.uid}`]: "wali", [`staff/${waliW.uid}`]: { email: "w@uji.test", nama: "Wali Uji", role: "wali", dibuat: 1, kelasUtama: "XI IPS" } });
const qIdx = async (kelas, who) => { // query REST orderBy="$value"&equalTo=<kelas> (satu-satunya cara wali membaca indeks)
  const q = new URLSearchParams({ ns: NS2, auth: who.token, orderBy: '"$value"', equalTo: JSON.stringify(kelas) });
  const res = await fetch(`${DB}/siswaKelas.json?${q}`);
  let json = null; try { json = await res.json(); } catch { /* kosong */ }
  return { status: res.status, json };
};
cek("web: wali XI IPS meng-query indeks hasil migrasi (9001 & 9002)", Object.keys((await qIdx("XI IPS", waliW)).json ?? {}).sort().join() === "9001,9002");
cek("web: wali XI IPS membaca profil 9001 (siswa binaan)", (await http(NS2, "GET", "profiles/9001", { token: waliW.token })).json?.nama === "ANDI SATU");
cek("web: wali XI IPS TIDAK membaca profil 9003 (X IPA)", [401, 403].includes((await http(NS2, "GET", "profiles/9003", { token: waliW.token })).status));
cek("web: wali XI IPS TIDAK meng-query kelas X IPA", [401, 403].includes((await qIdx("X IPA", waliW)).status));

rmSync(CSV, { force: true });
console.log(`\n${lolos} lolos, ${gagal.length} gagal`);
if (gagal.length) { console.log("\nGAGAL:\n" + gagal.map((g) => " - " + g).join("\n")); process.exit(1); }
