// Uji skrip hapus akun permanen (scripts/hapus_akun.py = sel notebook) terhadap EMULATOR.
// Membuktikan: dry-run tidak mengubah apa pun; akun aktif, admin, akun sendiri, dan BK dengan klaim aktif DITOLAK (daftar klaim dicetak);
// konfirmasi salah tidak menghapus; sukses menghapus Auth + node akun dan menulis riwayat + log (bentuk sama dengan web, lolos rules); jejak audit utuh; idempoten.
// Jalankan: npm run test:migrasi  (butuh Java untuk emulator dan `pip install firebase-admin`).
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { muatRulesTerverifikasi } from "./emu.mjs";
import { readFileSync } from "node:fs";
import { isDeepStrictEqual } from "node:util";

const DB = "http://127.0.0.1:9000";
const AUTH = "http://127.0.0.1:9099";
const OWNER = { Authorization: "Bearer owner" };
const NS = `hapus-${randomBytes(3).toString("hex")}`;
let lolos = 0;
const gagal = [];
const cek = (nama, kondisi, info = "") => { if (kondisi) { lolos++; console.log(`  ✓ ${nama}`); } else { gagal.push(`${nama} ${info}`); console.log(`  ✗ ${nama} ${info}`); } };

async function http(method, path, { body, token, owner } = {}) {
  const q = new URLSearchParams({ ns: NS });
  if (token) q.set("auth", token);
  const res = await fetch(`${DB}/${path}.json?${q}`, { method, headers: { "Content-Type": "application/json", ...(owner ? OWNER : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  let json = null; try { json = await res.json(); } catch { /* kosong */ }
  return { status: res.status, json };
}
const pemilik = (method, path, body) => http(method, path, { owner: true, body });
async function authPost(endpoint, body) {
  const res = await fetch(`${AUTH}/identitytoolkit.googleapis.com/v1/accounts:${endpoint}?key=fake`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return res.json();
}
const sfx = randomBytes(2).toString("hex");
const email = (n) => `${n}.${sfx}@uji.test`;
const buat = async (n) => { const j = await authPost("signUp", { email: email(n), password: "password-uji-123", returnSecureToken: true }); assert.ok(j.localId, JSON.stringify(j)); return { uid: j.localId, token: j.idToken, email: email(n) }; };
const masuk = async (u) => (await authPost("signInWithPassword", { email: u.email, password: "password-uji-123", returnSecureToken: true })).idToken ?? null;

await muatRulesTerverifikasi({ db: DB, ns: NS, teks: readFileSync(new URL("../database.rules.json", import.meta.url), "utf8"), label: "hapus-akun" });

// ---- akun & data
const admin = await buat("admin"), bkBebas = await buat("bkbebas"), bkKlaim = await buat("bkklaim"), waliR = await buat("walir");
const wakaAktif = await buat("wakaaktif"), adminTarget = await buat("admintarget"), piketR = await buat("piketr"), bkAuthHilang = await buat("bkhilang");
const TA = "2026-2027", KUNCI = `${TA}_lvB`, KUNCI2 = `2025-2026_lvB`;
const stf = (u, nama, role) => ({ email: u.email, nama, role, dibuat: 1 });
const tanda = (u, nama, peran, o = {}) => ({ email: u.email, nama, peran, alasan: "Guru sudah pindah tugas ke sekolah lain", olehUid: admin.uid, ts: 1700000000000, ...o });
const awal = {
  roles: { [admin.uid]: "admin", [wakaAktif.uid]: "waka", [adminTarget.uid]: "admin" },
  staff: {
    [bkBebas.uid]: stf(bkBebas, "BK Bebas", "bk"), [bkKlaim.uid]: stf(bkKlaim, "BK Klaim", "bk"), [waliR.uid]: { ...stf(waliR, "Wali R", "wali"), kelasUtama: "X" },
    [wakaAktif.uid]: stf(wakaAktif, "Waka Aktif", "waka"), [bkAuthHilang.uid]: stf(bkAuthHilang, "BK Auth Hilang", "bk"),
  },
  bkAkun: { [bkBebas.uid]: { email: bkBebas.email, nama: "BK Bebas", aktif: false }, [bkKlaim.uid]: { email: bkKlaim.email, nama: "BK Klaim", aktif: false }, [bkAuthHilang.uid]: { email: bkAuthHilang.email, nama: "BK Auth Hilang", aktif: false } },
  waliAkun: { [waliR.uid]: { email: waliR.email, nama: "Wali R", kelasUtama: "X", aktif: false } },
  piketAkun: { [piketR.uid]: { email: piketR.email, nama: "Piket R" } },
  hapusAkun: {
    [bkBebas.uid]: tanda(bkBebas, "BK Bebas", "bk"),
    [bkKlaim.uid]: tanda(bkKlaim, "BK Klaim", "bk"),
    [waliR.uid]: tanda(waliR, "Wali R", "wali"),
    [wakaAktif.uid]: tanda(wakaAktif, "Waka Aktif", "waka"),
    [adminTarget.uid]: tanda(adminTarget, "Admin Target", "waka"),
    [admin.uid]: tanda(admin, "Admin Sendiri", "waka"),
    [bkAuthHilang.uid]: tanda(bkAuthHilang, "BK Auth Hilang", "bk"),
  },
  // klaim: bkKlaim punya klaim AKTIF (pembinaan dijadwalkan) dan satu SELESAI; bkBebas hanya klaim yang pembinaannya SELESAI (tidak menghalangi)
  klaimBK: {
    9001: { [KUNCI]: { bkUid: bkKlaim.uid, bkNama: "BK Klaim", sejak: 1, cara: "klaim", olehUid: bkKlaim.uid, ta: TA, levelId: "lvB" } },
    9002: { [KUNCI2]: { bkUid: bkBebas.uid, bkNama: "BK Bebas", sejak: 1, cara: "klaim", olehUid: bkBebas.uid, ta: "2025-2026", levelId: "lvB" } },
  },
  pembinaan: { bk: {
    9001: { [KUNCI]: { pj: "bk", ta: TA, levelId: "lvB", levelPoin: 200, tindakan: "T2", tanggal: "2026-10-01", metode: "Tatap muka", hasil: "Pembinaan dijadwalkan untuk siswa ini", status: "dijadwalkan", oleh: bkKlaim.uid, olehNama: "BK Klaim", dibuatTs: 1 } },
    9002: { [KUNCI2]: { pj: "bk", ta: "2025-2026", levelId: "lvB", levelPoin: 200, tindakan: "T2", tanggal: "2025-10-01", metode: "Tatap muka", hasil: "Pembinaan selesai untuk siswa ini", status: "selesai", oleh: bkBebas.uid, olehNama: "BK Bebas", dibuatTs: 1 } },
  } },
  // JEJAK AUDIT yang harus TETAP ada
  konseling: { 9002: { k1: { tanggal: "2025-10-02", topik: "Pribadi", isi: "Catatan konseling rahasia oleh BK Bebas.", rahasia: true, oleh: bkBebas.uid, olehNama: "BK Bebas", dibuatTs: 1 } } },
  discipline: { records: { 9002: { r1: { jenis: "pelanggaran", nama: "x", poin: 5, tanggal: "2025-10-01", ta: "2025-2026", sumber: "bk" } } }, recordMeta: { 9002: { r1: { dibuatOleh: bkBebas.uid, dibuatNama: "BK Bebas", dibuatTs: 1 } } } },
  activity: { "2025-10-01": { a1: { uid: bkBebas.uid, peran: "bk", akunEmail: bkBebas.email, aksi: "catat-pembinaan", detail: "x", deviceId: "dev-12345678", deviceLabel: "Uji", ts: 1, hariKe: 20000 } } },
  usulRemisi: { u1: { nis: "9002", remId: "m1", nama: "R", poin: 5, alasan: "Alasan usulan oleh BK Bebas", oleh: bkBebas.uid, ts: 1, status: "menunggu" } },
};
await pemilik("PUT", "", awal);
// akun Auth BK Auth Hilang dihapus lebih dulu (misal lewat Console): skrip harus melanjutkan
await fetch(`${AUTH}/identitytoolkit.googleapis.com/v1/accounts:delete?key=fake`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ idToken: bkAuthHilang.token }) });

const env = { ...process.env, FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:9099", FIREBASE_DATABASE_EMULATOR_HOST: "127.0.0.1:9000", PYTHONIOENCODING: "utf-8" };
const jalan = (mode, konf = "") => {
  const r = spawnSync("python", ["tests/hapus_akun_run.py", NS, mode, konf], { env, encoding: "utf8", cwd: process.cwd() });
  const m = /HASIL_JSON=(.*)/.exec(r.stdout ?? "");
  if (!m) { console.error(r.stdout, r.stderr); throw new Error(`pelari hapus akun (${mode}) gagal, status ${r.status}`); }
  return { ...JSON.parse(m[1]), keluaran: r.stdout };
};
const semua = async () => (await pemilik("GET", "")).json;

// ================================================================ 1. DRY-RUN
console.log("\n1. DRY-RUN");
const sebelum = await semua();
const dry = jalan("dry");
cek("dry-run: seluruh database IDENTIK", JSON.stringify(await semua()) === JSON.stringify(sebelum));
cek("dry-run: akun Auth tetap ada", (await masuk(bkBebas)) !== null && (await masuk(waliR)) !== null);
cek("dry-run: keluaran menyatakan DRY-RUN", /DRY-RUN/.test(dry.keluaran));
cek("dry-run: 7 tanda dibaca", dry.ditandai === 7);
cek("dry-run: layak = BK tanpa klaim aktif, wali, dan BK yang akun Auth-nya sudah hilang", [bkBebas.uid, waliR.uid, bkAuthHilang.uid].every((u) => dry.layak.includes(u)) && dry.layak.length === 3, JSON.stringify(dry.layak));
cek("dry-run: akun aktif (waka) DITOLAK", (dry.ditolak[wakaAktif.uid] ?? []).some((m) => /masih memiliki role 'waka'/.test(m)));
cek("dry-run: admin DITOLAK (tidak dapat dihapus)", (dry.ditolak[adminTarget.uid] ?? []).some((m) => /admin\/alat TIDAK dapat dihapus/.test(m)));
cek("dry-run: akun sendiri (admin pembuat tanda) DITOLAK", (dry.ditolak[admin.uid] ?? []).some((m) => /dirinya sendiri/.test(m)));
cek("dry-run: BK dengan klaim aktif DITOLAK dan daftar klaim (nis + kunci) dicetak", (dry.ditolak[bkKlaim.uid] ?? []).some((m) => m.includes("nis 9001") && m.includes(KUNCI)) && dry.keluaran.includes(`nis 9001, kunci ${KUNCI}`), JSON.stringify(dry.ditolak[bkKlaim.uid]));
cek("dry-run: klaim yang pembinaannya SELESAI tidak menghalangi (BK Bebas layak)", dry.layak.includes(bkBebas.uid));
cek("dry-run: jalur yang akan dihapus dicetak", dry.keluaran.includes(`staff/${bkBebas.uid}`) && dry.keluaran.includes(`bkAkun/${bkBebas.uid}`) && dry.keluaran.includes(`hapusAkun/${bkBebas.uid}`));

// ================================================================ 2. konfirmasi salah
console.log("\n2. Konfirmasi salah");
const salah = jalan("real", "hapus");
cek("konfirmasi 'hapus' (huruf kecil) dibatalkan: tidak ada yang dihapus", salah.dibatalkan === true && JSON.stringify(await semua()) === JSON.stringify(sebelum));
cek("tanpa konfirmasi dibatalkan", jalan("real", "").dibatalkan === true);

// ================================================================ 3. HAPUS NYATA
console.log("\n3. HAPUS NYATA");
const real = jalan("real", "HAPUS");
const d1 = await semua();
cek("berhasil: BK Bebas, Wali R, BK Auth Hilang", [bkBebas.uid, waliR.uid, bkAuthHilang.uid].every((u) => real.berhasil.includes(u)) && real.berhasil.length === 3 && Object.keys(real.gagal).length === 0, JSON.stringify(real));
cek("akun Auth terhapus (tidak bisa masuk)", (await masuk(bkBebas)) === null && (await masuk(waliR)) === null);
for (const [n, u] of [["BK Bebas", bkBebas], ["Wali R", waliR], ["BK Auth Hilang", bkAuthHilang]]) {
  cek(`${n}: staff/roles/waliAkun/bkAkun/hapusAkun terhapus`, !d1.staff?.[u.uid] && !d1.roles?.[u.uid] && !d1.waliAkun?.[u.uid] && !d1.bkAkun?.[u.uid] && !d1.hapusAkun?.[u.uid]);
  const rw = d1.hapusAkunRiwayat?.[u.uid];
  cek(`${n}: hapusAkunRiwayat berisi email/nama/peran/alasan/olehUid/ditandaiTs/dihapusTs`, rw && rw.email === u.email && rw.nama === n && rw.alasan.length >= 10 && rw.olehUid === admin.uid && rw.ditandaiTs === 1700000000000 && typeof rw.dihapusTs === "number", JSON.stringify(rw));
}
const logs = Object.entries(d1.activity ?? {}).flatMap(([tgl, per]) => Object.entries(per).map(([id, e]) => ({ tgl, id, e }))).filter((x) => x.e.aksi === "hapus-akun-permanen");
cek("3 entri log 'hapus-akun-permanen' (deviceId skrip-lokal, peran admin, uid pelaku admin)", logs.length === 3 && logs.every((x) => x.e.deviceId === "skrip-lokal" && x.e.peran === "admin" && x.e.uid === admin.uid && typeof x.e.ts === "number" && Number.isInteger(x.e.hariKe)), JSON.stringify(logs.map((x) => x.e)));
{ // bentuk entri log HARUS lolos rules yang sama dengan entri dari web (agar tampil di halaman Log aktivitas)
  const e = { ...logs[0].e, ts: { ".sv": "timestamp" } };
  const hk = Math.floor((Date.now() + 7 * 3600_000) / 86_400_000);
  const tgl = new Date(hk * 86_400_000).toISOString().slice(0, 10);
  const salin = await http("PUT", `activity/${tgl}/replay1`, { token: admin.token, body: { ...e, hariKe: hk } });
  cek("bentuk entri log skrip LOLOS rules activity (sama dengan entri web)", salin.status === 200, JSON.stringify(salin.json));
}
// jejak audit TETAP
cek("jejak audit utuh: konseling, catatan disiplin + meta, log lama, usulan, pembinaan, klaim yang selesai", isDeepStrictEqual(d1.konseling, awal.konseling) && isDeepStrictEqual(d1.discipline, awal.discipline) && isDeepStrictEqual(d1.activity["2025-10-01"], awal.activity["2025-10-01"]) && isDeepStrictEqual(d1.usulRemisi, awal.usulRemisi) && isDeepStrictEqual(d1.pembinaan.bk[9002], awal.pembinaan.bk[9002]) && isDeepStrictEqual(d1.klaimBK[9002], awal.klaimBK[9002]));
// yang DITOLAK tidak berubah
for (const [n, u] of [["BK Klaim", bkKlaim], ["Waka Aktif", wakaAktif], ["Admin Target", adminTarget], ["Admin Sendiri", admin]]) {
  cek(`${n}: tanda, akun Auth, dan role/staff TIDAK berubah`, !!d1.hapusAkun?.[u.uid] && (await masuk(u)) !== null && isDeepStrictEqual(d1.roles?.[u.uid], awal.roles[u.uid]) && isDeepStrictEqual(d1.staff?.[u.uid], awal.staff[u.uid]));
}
cek("piketAkun orang lain tidak tersentuh", isDeepStrictEqual(d1.piketAkun, awal.piketAkun));

// ================================================================ 4. idempoten + klaim dilepas
console.log("\n4. Idempoten dan setelah klaim dilepas");
const sebelumUlang = await semua();
const ulang = jalan("real", "HAPUS");
cek("ulang: tidak ada yang berhasil/gagal lagi (idempoten) dan database tidak berubah", ulang.berhasil.length === 0 && Object.keys(ulang.gagal).length === 0 && JSON.stringify(await semua()) === JSON.stringify(sebelumUlang));
await pemilik("DELETE", `klaimBK/9001/${KUNCI}`); // klaim dilepas/dipindah (di web oleh waka); pembinaan lama tetap
const setelahLepas = jalan("dry");
cek("klaim aktif nol: BK Klaim kini LAYAK", setelahLepas.layak.includes(bkKlaim.uid));
const akhir = jalan("real", "HAPUS");
cek("BK Klaim terhapus setelah klaim dilepas", akhir.berhasil.includes(bkKlaim.uid) && (await masuk(bkKlaim)) === null && !(await semua()).staff?.[bkKlaim.uid] && !!(await semua()).hapusAkunRiwayat?.[bkKlaim.uid]);
cek("pembinaan oleh BK Klaim tetap tersimpan atas namanya", (await semua()).pembinaan.bk[9001][KUNCI].oleh === bkKlaim.uid);

console.log(`\n${lolos} lolos, ${gagal.length} gagal`);
if (gagal.length) { for (const g of gagal) console.log(" - " + g); process.exit(1); }
