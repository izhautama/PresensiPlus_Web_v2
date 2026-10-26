// Uji Security Rules lewat REST ke Firebase Emulator (auth 9099 + database 9000). Tanpa dependensi tambahan.
// Jalankan:  npm run test:rules   (membutuhkan Java untuk emulator Database)
// Rules dimuat ke namespace kustom via PUT /.settings/rules.json?ns=<ns> (Authorization: Bearer owner),
// karena rules di firebase.json TIDAK otomatis berlaku untuk ns kustom.
import { readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { muatRulesTerverifikasi } from "./emu.mjs";

const DB = process.env.DB_URL ?? "http://127.0.0.1:9000";
const AUTH = process.env.AUTH_URL ?? "http://127.0.0.1:9099";
const NS = `rules-${randomBytes(4).toString("hex")}`;
const OWNER = { Authorization: "Bearer owner" };
const SV = { ".sv": "timestamp" };
const TGL = "2026-10-14";
const TA = "2026-2027";

// ---------------------------------------------------------------- util
async function http(method, path, { body, token, owner } = {}) {
  const [p, qs] = path.split("?"); // mendukung ?shallow=true dkk.
  const q = new URLSearchParams(qs ?? "");
  q.set("ns", NS);
  if (token) q.set("auth", token);
  const res = await fetch(`${DB}/${p}.json?${q}`, {
    method,
    headers: { "Content-Type": "application/json", ...(owner ? OWNER : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let json = null;
  try { json = await res.json(); } catch { /* kosong */ }
  return { status: res.status, json };
}

async function buatUser(emailAsli) {
  const email = emailAsli.replace("@", `.${NS}@`); // unik per eksekusi (emulator Auth dipakai bersama oleh uji mutasi)
  const res = await fetch(`${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: "password-uji-123", returnSecureToken: true }),
  });
  const j = await res.json();
  if (!j.idToken) throw new Error(`gagal membuat user ${email}: ${JSON.stringify(j)}`);
  return { uid: j.localId, token: j.idToken };
}

const hasil = { lolos: 0, gagal: [] };
async function uji(nama, who, op, path, body, harap /* "izin" | "tolak" */) {
  const token = who?.token;
  const r = await http(op, path, { token, body });
  const diizinkan = r.status === 200;
  const ok = harap === "izin" ? diizinkan : !diizinkan;
  if (process.env.DBG_NAMA && nama.includes(process.env.DBG_NAMA)) console.log(`DBG [${nama}] status ${r.status} ${JSON.stringify(r.json)?.slice(0, 200)}`); // pemeriksaan mutan: lihat respons uji tertentu
  if (ok) hasil.lolos++;
  else hasil.gagal.push(`${nama}  [harap ${harap}, status ${r.status} ${JSON.stringify(r.json)}]`);
  console.log(`${ok ? "  ✓" : "  ✗"} ${nama}`);
}
const izin = (nama, who, op, path, body) => uji(nama, who, op, path, body, "izin");
const tolak = (nama, who, op, path, body) => uji(nama, who, op, path, body, "tolak");
const seksi = (t) => console.log(`\n${t}`);

// ---------------------------------------------------------------- persiapan
console.log(`Namespace uji: ${NS}`);
const rulesJson = process.env.RULES_FILE ? readFileSync(process.env.RULES_FILE, "utf8") : readFileSync(new URL("../database.rules.json", import.meta.url), "utf8");
try { await muatRulesTerverifikasi({ db: DB, ns: NS, teks: rulesJson, label: "rules.test" }); } // rules yang dimuat HARUS identik dengan yang diuji (hash dicetak)
catch (e) { console.error(`✗ ${e.message}`); process.exit(2); }

const admin = await buatUser("admin@uji.test");
const admin2 = await buatUser("admin2@uji.test");
const waka = await buatUser("waka@uji.test");
const waka2 = await buatUser("waka2@uji.test");
const kepala = await buatUser("kepala@uji.test");
const dev = await buatUser("alat@uji.test");
const ortu1 = await buatUser("111.1@ortu.presensi-ma.local");
const ortu2 = await buatUser("222.1@ortu.presensi-ma.local");
const target = await buatUser("target@uji.test"); // akun baru yang akan diberi peran oleh admin
const orang = await buatUser("orang@uji.test");
const piket = await buatUser("piket@uji.test");
const piket2 = await buatUser("piket2@uji.test"); // login biasa tanpa peran

const seed = {
  roles: { [admin.uid]: "admin", [admin2.uid]: "admin", [waka.uid]: "waka", [waka2.uid]: "waka", [kepala.uid]: "kepala", [dev.uid]: "device", [piket.uid]: "piket", [piket2.uid]: "piket" },
  parents: { 111: { ver: 1, uid: ortu1.uid }, 222: { ver: 1, uid: ortu2.uid } },
  config: {
    version: 1,
    schedule: { s000: { kelas: "Semua", hari: "Senin", jenis: "Masuk", mulai: "06:00", selesai: "07:00" } },
    students: { AAAA1111: { nis: "111", nama: "ANAK SATU", kelas: "X" }, BBBB2222: { nis: "222", nama: "ANAK DUA", kelas: "X" } },
  },
  profiles: { 111: { nama: "ANAK SATU", kelas: "X" }, 222: { nama: "ANAK DUA", kelas: "X" } },
  attendance: { 111: { [TGL]: { masuk: "06:50:00", status: "Hadir" } }, 222: { [TGL]: { masuk: "06:55:00", status: "Hadir" } } },
  log: { [TGL]: { AAAA1111_M: { jam: "06:50:00", nis: "111", status: "Hadir" } } },
  unknown: { [TGL]: { ZZZZ9999: { jam: "07:10:00" } } },
  device: { status: { lastSeen: 1 }, events: { e1: { ts: 1, jenis: "boot" } }, inbox: { watching: 1 } },
  izin: {},
  discipline: {
    rules: {
      r1: { kategori: "Ringan", nama: "Contoh", poin: 5, aktif: true, diubahOleh: waka.uid, diubahTs: 1 },
      rS: { kategori: "Sedang", nama: "Sedang tanpa takziran", poin: 30, aktif: true, diubahOleh: waka.uid, diubahTs: 1 },
      rT: { kategori: "Sedang", nama: "Sedang bertakziran", poin: 50, takziran: "Bersihkan lorong", aktif: true, diubahOleh: waka.uid, diubahTs: 1 },
      rB: { kategori: "Berat", nama: "Berat tanpa takziran", poin: 75, aktif: true, diubahOleh: waka.uid, diubahTs: 1 },
      rOff: { kategori: "Ringan", nama: "Ringan nonaktif", poin: 5, aktif: false, diubahOleh: waka.uid, diubahTs: 1 },
    },
    piketRoster: { p1: { nama: "Bu Rina", aktif: true }, p2: { nama: "Pak Joko", aktif: false } },
    remisi: { m1: { kelompok: "Prestasi", nama: "Contoh", poin: 10, aktif: true, diubahOleh: waka.uid, diubahTs: 1 } },
    levels: { l1: { poin: 100, tindakan: "Teguran 1" } },
    autoMap: { terlambat: "r1" },
    records: {
      111: { recSeed: { jenis: "pelanggaran", nama: "Seed", poin: 5, tanggal: TGL, ta: TA, sumber: "manual" } },
      222: { recSeed: { jenis: "pelanggaran", nama: "Seed", poin: 5, tanggal: TGL, ta: TA, sumber: "manual" } },
    },
    recordMeta: {
      111: { recSeed: { dibuatOleh: waka.uid, dibuatNama: "Waka", dibuatTs: 1000 } },
      222: { recSeed: { dibuatOleh: waka.uid, dibuatNama: "Waka", dibuatTs: 1000 } },
    },
    notes: { 111: { recSeed: "kronologi internal" } },
    audit: { aSeed: { aksi: "buat", path: "discipline/records/111/recSeed", oleh: waka.uid, olehNama: "Waka", ts: 1000 } },
  },
};
{
  const r = await http("PUT", "", { owner: true, body: seed });
  if (r.status !== 200) { console.error("Gagal mengisi data awal:", r.status, r.json); process.exit(2); }
}

// Catatan kini dua node: records (PUBLIK, bersih) + recordMeta (khusus staf). Keduanya ditulis dalam SATU update.
// Varian negatif mengubah SATU hal saja (field `undefined` dibuang oleh JSON).
const rec = (o = {}) => ({ jenis: "pelanggaran", nama: "Terlambat", poin: 5, tanggal: TGL, ta: TA, sumber: "manual", ...o });
const meta = (u, o = {}) => ({ dibuatOleh: u.uid, dibuatNama: "Staf", dibuatTs: SV, ...o });
const P = (nis, id) => `discipline/records/${nis}/${id}`;
const M = (nis, id) => `discipline/recordMeta/${nis}/${id}`;
const buatBody = (u, nis, id, r = {}, m = {}) => ({ [P(nis, id)]: rec(r), [M(nis, id)]: meta(u, m) });
const buat = (nama, who, nis, id, r, m, harap) => uji(nama, who, "PATCH", "", buatBody(who, nis, id, r, m), harap);
const buatOk = (nama, who, nis, id, r, m) => buat(nama, who, nis, id, r, m, "izin");
const buatNo = (nama, who, nis, id, r, m) => buat(nama, who, nis, id, r, m, "tolak");
// hapus lunak: hapus dari node publik + tandai di meta (alasan + snapshot) dalam satu update
const hapusBody = (u, nis, id, snap = rec(), m = {}) => ({
  [P(nis, id)]: null, [`${M(nis, id)}/dihapus`]: true, [`${M(nis, id)}/alasanHapus`]: "salah input", [`${M(nis, id)}/snapshot`]: snap,
  [`${M(nis, id)}/diubahOleh`]: u.uid, [`${M(nis, id)}/diubahTs`]: SV, ...m,
});
async function cek(nama, who, path, fn) {
  const r = await http("GET", path, { token: who?.token });
  let ok = false, alasan = "";
  try { ok = r.status === 200 && Boolean(fn(r.json)); } catch (e) { alasan = String(e); }
  if (ok) hasil.lolos++; else hasil.gagal.push(`${nama}  [status ${r.status} ${alasan} ${JSON.stringify(r.json)?.slice(0, 200)}]`);
  console.log(`${ok ? "  ✓" : "  ✗"} ${nama}`);
}
const audit = (u, o = {}) => ({ aksi: "buat", path: "discipline/records/111/x", oleh: u.uid, olehNama: "Staf", ts: SV, ...o });
const bersih = (obj, ...hapus) => { const x = { ...obj }; for (const k of hapus) delete x[k]; return x; };

// ================================================================ WAKA
seksi("WAKA — baca");
for (const p of ["config/students", "config/version", "config/schedule", "profiles", "attendance", "log", "izin", "device/status",
  "discipline/rules", "discipline/remisi", "discipline/levels", "discipline/autoMap", "discipline/records", "discipline/recordMeta", "discipline/notes", "discipline/audit"]) {
  await izin(`waka baca ${p}`, waka, "GET", p);
}
seksi("WAKA — baca ditolak");
for (const p of ["parents/111", "parents", "unknown", "device/events", "device/inbox", "device", `roles/${admin.uid}`, "staff", "config"]) {
  await tolak(`waka TIDAK bisa baca ${p}`, waka, "GET", p);
}
seksi("WAKA — tulis diizinkan");
await izin("waka tulis izin/Sakit", waka, "PUT", `izin/${TGL}/111`, "Sakit");
await izin("waka tulis attendance ket", waka, "PUT", `attendance/111/${TGL}/ket`, "Izin");
await izin("waka tulis attendance catatan", waka, "PUT", `attendance/111/${TGL}/catatan`, "surat dokter");
await izin("waka tulis master rules baru", waka, "PUT", "discipline/rules/rBaru", { kategori: "Berat", nama: "Baru", poin: 75, takziran: "x", aktif: true, diubahOleh: waka.uid, diubahTs: SV });
await izin("waka tulis master remisi baru", waka, "PUT", "discipline/remisi/mBaru", { kelompok: "Tanpa prestasi", nama: "Baru", poin: 15, syarat: "s", aktif: true, diubahOleh: waka.uid, diubahTs: SV });
await izin("waka tulis level baru", waka, "PUT", "discipline/levels/lBaru", { poin: 200, tindakan: "Teguran 2" });
await izin("waka hapus level", waka, "DELETE", "discipline/levels/lBaru");
await izin("waka tulis autoMap", waka, "PATCH", "discipline/autoMap", { tanpaTapPulang: "r1" });
await buatOk("waka catat pelanggaran valid", waka, "111", "recW1");
await buatOk("waka catat remisi valid", waka, "111", "recW2", { jenis: "remisi", poin: 10 });
await buatOk("waka catat dengan field opsional lengkap", waka, "111", "recW3", { refId: "r1", kategori: "Ringan", takziran: "bersih-bersih" });
await izin("waka tulis catatan internal", waka, "PUT", "discipline/notes/111/recW1", "saksi: A");
await izin("waka tulis audit baru", waka, "PUT", "discipline/audit/aW1", audit(waka));
await izin("waka update multi-path (record + meta + notes + audit)", waka, "PATCH", "", {
  ...buatBody(waka, "222", "recM1"), "discipline/notes/222/recM1": "catatan", "discipline/audit/aM1": audit(waka, { path: P("222", "recM1") }),
});
await izin("waka ubah poin (record + meta diubahOleh/Ts)", waka, "PATCH", "", { [`${P("111", "recW3")}/poin`]: 7, [`${M("111", "recW3")}/diubahOleh`]: waka.uid, [`${M("111", "recW3")}/diubahTs`]: SV });
await izin("waka2 ubah catatan milik waka (dibuatOleh tetap)", waka2, "PATCH", "", { [`${P("111", "recW3")}/nama`]: "Diubah waka2", [`${M("111", "recW3")}/diubahOleh`]: waka2.uid, [`${M("111", "recW3")}/diubahTs`]: SV });
await izin("waka soft delete: hapus dari publik + meta (alasan, snapshot) + audit", waka, "PATCH", "", {
  ...hapusBody(waka, "111", "recW1"), "discipline/audit/aDel1": audit(waka, { aksi: "hapus", path: P("111", "recW1") }),
});
await cek("catatan terhapus TIDAK ada lagi di path publik", waka, P("111", "recW1"), (j) => j === null);
await cek("catatan terhapus tersimpan di recordMeta (dihapus + alasan + snapshot)", waka, M("111", "recW1"), (j) => j?.dihapus === true && j.alasanHapus === "salah input" && j.snapshot?.nama === "Terlambat" && j.dibuatOleh === waka.uid);
await izin("waka pulihkan catatan dari snapshot", waka, "PATCH", "", {
  [P("111", "recW1")]: rec(), [`${M("111", "recW1")}/dihapus`]: null, [`${M("111", "recW1")}/alasanHapus`]: null, [`${M("111", "recW1")}/snapshot`]: null,
  [`${M("111", "recW1")}/diubahOleh`]: waka.uid, [`${M("111", "recW1")}/diubahTs`]: SV,
});
await cek("setelah dipulihkan: tampil lagi di path publik", waka, P("111", "recW1"), (j) => j?.nama === "Terlambat");
await izin("waka hapus lagi (bersih-bersih)", waka, "PATCH", "", hapusBody(waka, "111", "recW1"));

seksi("WAKA — tulis ditolak");
await tolak("waka TIDAK bisa tulis config/students", waka, "PUT", "config/students/CCCC3333", { nis: "333", nama: "X", kelas: "X" });
await tolak("waka TIDAK bisa tulis config/version", waka, "PUT", "config/version", 2);
await tolak("waka TIDAK bisa tulis parents", waka, "PUT", "parents/333", { ver: 1, uid: "u" });
await tolak("waka TIDAK bisa tulis roles", waka, "PUT", `roles/${target.uid}`, "waka");
await tolak("waka TIDAK bisa tulis staff", waka, "PUT", `staff/${target.uid}`, { email: "a@b.c", nama: "X", role: "waka", dibuat: SV });
await tolak("waka TIDAK bisa tulis device/status", waka, "PUT", "device/status/lastSeen", 5);
await tolak("waka TIDAK bisa tulis device/inbox", waka, "PUT", "device/inbox/command", { id: "x", cmd: "sync", ts: 1 });
await tolak("waka TIDAK bisa tulis attendance status", waka, "PUT", `attendance/111/${TGL}/status`, "Hadir");
await tolak("waka TIDAK bisa tulis attendance masuk", waka, "PUT", `attendance/111/${TGL}/masuk`, "06:00:00");
await tolak("waka TIDAK bisa tulis attendance pulang", waka, "PUT", `attendance/111/${TGL}/pulang`, "15:00:00");
await tolak("waka TIDAK bisa tulis log", waka, "PUT", `log/${TGL}/AAAA1111_P`, { jam: "15:00:00", nis: "111", status: "Pulang" });
await tolak("waka TIDAK bisa tulis unknown", waka, "PUT", `unknown/${TGL}/QQQQ0000`, { jam: "07:00:00" });

seksi("WAKA — audit append-only");
await tolak("waka TIDAK bisa ubah audit yang ada", waka, "PUT", "discipline/audit/aSeed", audit(waka));
await tolak("waka TIDAK bisa hapus audit", waka, "DELETE", "discipline/audit/aSeed");
await tolak("waka TIDAK bisa ubah satu field audit", waka, "PUT", "discipline/audit/aSeed/olehNama", "Palsu");
await tolak("audit dengan oleh bukan pengguna ditolak", waka, "PUT", "discipline/audit/aX1", audit(waka, { oleh: kepala.uid }));
await tolak("audit dengan aksi tak dikenal ditolak", waka, "PUT", "discipline/audit/aX2", audit(waka, { aksi: "bebas" }));
await tolak("audit dengan field asing ditolak", waka, "PUT", "discipline/audit/aX3", audit(waka, { asing: 1 }));

seksi("WAKA — integritas catatan (records publik + recordMeta)");
await buatNo("dibuatOleh bukan pengguna", waka, "111", "recN1", {}, { dibuatOleh: kepala.uid });
await buatNo("meta tanpa dibuatNama", waka, "111", "recN1", {}, { dibuatNama: undefined });
await tolak("record TANPA recordMeta ditolak", waka, "PUT", P("111", "recN2"), rec());
await tolak("recordMeta TANPA record publik ditolak", waka, "PUT", M("111", "recN3"), meta(waka));
await tolak("ubah dibuatOleh pada meta lama", waka, "PATCH", "", { [`${M("111", "recSeed")}/dibuatOleh`]: waka2.uid });
await tolak("ubah dibuatTs pada meta lama", waka, "PATCH", "", { [`${M("111", "recSeed")}/dibuatTs`]: 5 });
await buatNo("timpa penuh catatan lama (dibuatTs baru)", waka, "111", "recSeed");
await tolak("ubah record publik TANPA memperbarui meta (diubahTs)", waka, "PATCH", "", { [`${P("111", "recSeed")}/poin`]: 6 });
await tolak("ubah record publik dengan diubahOleh orang lain", waka, "PATCH", "", { [`${P("111", "recSeed")}/poin`]: 6, [`${M("111", "recSeed")}/diubahOleh`]: kepala.uid, [`${M("111", "recSeed")}/diubahTs`]: SV });
await tolak("hapus fisik record publik (tanpa meta)", waka, "DELETE", P("111", "recSeed"));
await tolak("hapus record dengan meta TANPA snapshot", waka, "PATCH", "", hapusBody(waka, "111", "recSeed", undefined, { [`${M("111", "recSeed")}/snapshot`]: null }));
await tolak("hapus record dengan meta TANPA alasan", waka, "PATCH", "", hapusBody(waka, "111", "recSeed", undefined, { [`${M("111", "recSeed")}/alasanHapus`]: null }));
await tolak("hapus record dengan snapshot tidak valid (poin 0)", waka, "PATCH", "", hapusBody(waka, "111", "recSeed", rec({ poin: 0 })));
await tolak("meta ditandai dihapus tetapi record publik masih ada", waka, "PATCH", "", { [`${M("111", "recSeed")}/dihapus`]: true, [`${M("111", "recSeed")}/alasanHapus`]: "x", [`${M("111", "recSeed")}/snapshot`]: rec(), [`${M("111", "recSeed")}/diubahOleh`]: waka.uid, [`${M("111", "recSeed")}/diubahTs`]: SV });
await tolak("hapus fisik recordMeta (catatan aktif)", waka, "DELETE", M("111", "recSeed"));
await tolak("record publik memuat field staf (dibuatOleh) ditolak", waka, "PATCH", "", buatBody(waka, "111", "recN4", { dibuatOleh: waka.uid }));
await tolak("record publik memuat dibuatNama ditolak", waka, "PATCH", "", buatBody(waka, "111", "recN5", { dibuatNama: "Staf" }));
await tolak("record publik memuat flag dihapus ditolak", waka, "PATCH", "", buatBody(waka, "111", "recN6", { dihapus: true }));
await buatNo("poin 0", waka, "111", "recV1", { poin: 0 });
await buatNo("poin negatif", waka, "111", "recV2", { poin: -5 });
await buatNo("poin 1001", waka, "111", "recV3", { poin: 1001 });
await buatNo("poin pecahan", waka, "111", "recV4", { poin: 5.5 });
await buatOk("poin 1000 (batas atas) valid", waka, "111", "recV5", { poin: 1000 });
await buatNo("jenis tak dikenal", waka, "111", "recV6", { jenis: "bonus" });
await buatNo("tanggal format salah", waka, "111", "recV7", { tanggal: "14-10-2026" });
await buatNo("ta format salah", waka, "111", "recV8", { ta: "2026" });
await buatNo("sumber tak dikenal", waka, "111", "recV9", { sumber: "otomatis" });
await buatNo("field asing di record", waka, "111", "recV10", { rahasia: "x" });
await buatNo("tanpa nama (field wajib)", waka, "111", "recV11", { nama: undefined });
await buatNo("nama > 200 karakter", waka, "111", "recV12", { nama: "x".repeat(201) });
await buatNo("takziran > 300 karakter", waka, "111", "recV13", { takziran: "x".repeat(301) });
await buatNo("nis bukan angka", waka, "abc", "recV14");
await buatNo("id berisi karakter terlarang", waka, "111", "rec%20V15");
await tolak("master: poin 0", waka, "PUT", "discipline/rules/rBad1", { kategori: "Ringan", nama: "x", poin: 0, aktif: true, diubahOleh: waka.uid, diubahTs: SV });
await tolak("master: kategori tak dikenal", waka, "PUT", "discipline/rules/rBad2", { kategori: "Super", nama: "x", poin: 5, aktif: true, diubahOleh: waka.uid, diubahTs: SV });
await tolak("master: diubahOleh bukan pengguna", waka, "PUT", "discipline/rules/rBad3", { kategori: "Ringan", nama: "x", poin: 5, aktif: true, diubahOleh: kepala.uid, diubahTs: SV });
await tolak("master: hapus fisik rules", waka, "DELETE", "discipline/rules/r1");
await tolak("master: hapus fisik remisi", waka, "DELETE", "discipline/remisi/m1");
await tolak("catatan internal > 500 karakter", waka, "PUT", "discipline/notes/111/recN2", "x".repeat(501));

seksi("SARAN OTOMATIS — record bersumber saran + keputusan (id deterministik)");
// Saran yang disetujui = records(sumber "saran") + recordMeta + suggest(diterima) + audit dalam SATU update.
const saranBody = (u, nis, tgl, tipe, r = {}, m = {}, sg = {}) => ({
  [P(nis, `${tgl}_${tipe}`)]: rec({ sumber: "saran", tanggal: tgl, refId: "r1", kategori: "Ringan", ...r }),
  [M(nis, `${tgl}_${tipe}`)]: meta(u, m),
  [`discipline/suggest/${tgl}/${tipe}_${nis}`]: { keputusan: "diterima", oleh: u.uid, ts: SV, nis, recId: `${tgl}_${tipe}`, ...sg },
  [`discipline/audit/${randomBytes(4).toString("hex")}`]: audit(u, { path: P(nis, `${tgl}_${tipe}`) }),
});
const saran = (nama, who, nis, tgl, tipe, harap, r, m, sg) => uji(nama, who, "PATCH", "", saranBody(who, nis, tgl, tipe, r, m, sg), harap);
const sugPath = (tgl, tipe, nis) => `discipline/suggest/${tgl}/${tipe}_${nis}`;

await saran("saran: waka menyetujui (record + meta + keputusan)", waka, "111", TGL, "terlambat", "izin");
await saran("saran: persetujuan kedua oleh waka yang sama ditolak", waka, "111", TGL, "terlambat", "tolak");
await saran("saran: persetujuan kedua oleh staf lain (kepala) ditolak", kepala, "111", TGL, "terlambat", "tolak");
await cek("saran: tepat 1 record tercipta (dibuatOleh = waka)", waka, M("111", `${TGL}_terlambat`), (j) => j?.dibuatOleh === waka.uid);

// dua staf menyetujui saran yang SAMA bersamaan -> hanya 1 yang berhasil, 1 record
{
  const nama = "saran: dua staf menyetujui BERSAMAAN -> hanya 1 berhasil";
  const [a, b] = await Promise.all([
    http("PATCH", "", { token: waka.token, body: saranBody(waka, "222", TGL, "bolosJam") }),
    http("PATCH", "", { token: kepala.token, body: saranBody(kepala, "222", TGL, "bolosJam") }),
  ]);
  const berhasil = [a, b].filter((x) => x.status === 200).length;
  const ok = berhasil === 1;
  if (ok) hasil.lolos++; else hasil.gagal.push(`${nama}  [berhasil=${berhasil}, status ${a.status}/${b.status}]`);
  console.log(`${ok ? "  ✓" : "  ✗"} ${nama}`);
  const pemenang = a.status === 200 ? waka : kepala;
  await cek("saran: record pemenang konsisten (meta.dibuatOleh = penyetuju yang berhasil)", pemenang, M("222", `${TGL}_bolosJam`), (j) => j?.dibuatOleh === pemenang.uid);
  await cek("saran: keputusan tersimpan sekali (oleh = pemenang)", pemenang, sugPath(TGL, "bolosJam", "222"), (j) => j?.oleh === pemenang.uid && j.keputusan === "diterima");
}
// 10 permintaan serentak dari dua staf: tetap tepat 1
{
  const nama = "saran: 10 permintaan serentak (waka+kepala) -> tepat 1 berhasil";
  const hs = await Promise.all(Array.from({ length: 10 }, (_, i) => http("PATCH", "", { token: (i % 2 ? kepala : waka).token, body: saranBody(i % 2 ? kepala : waka, "111", "2026-10-13", "alfa") })));
  const berhasil = hs.filter((x) => x.status === 200).length;
  const ok = berhasil === 1;
  if (ok) hasil.lolos++; else hasil.gagal.push(`${nama}  [berhasil=${berhasil}]`);
  console.log(`${ok ? "  ✓" : "  ✗"} ${nama}`);
}

await saran("saran: record sumber 'saran' TANPA keputusan ditolak", waka, "333", TGL, "terlambat", "tolak", {}, {}, { keputusan: "diabaikan", recId: undefined });
await uji("saran: record sumber 'saran' tanpa node suggest sama sekali ditolak", waka, "PATCH", "", buatBody(waka, "333", `${TGL}_terlambat`, { sumber: "saran", tanggal: TGL }), "tolak");
await uji("saran: id record sumber 'saran' tidak deterministik ditolak", waka, "PATCH", "", { ...buatBody(waka, "333", "idBebas", { sumber: "saran" }), [sugPath(TGL, "terlambat", "333")]: { keputusan: "diterima", oleh: waka.uid, ts: SV, nis: "333", recId: "idBebas" } }, "tolak");
await uji("saran: keputusan 'diterima' TANPA record ditolak", waka, "PUT", sugPath(TGL, "terlambat", "444"), { keputusan: "diterima", oleh: waka.uid, ts: SV, nis: "444", recId: `${TGL}_terlambat` }, "tolak");
await saran("saran: recId keputusan tidak cocok ditolak", waka, "444", TGL, "tanpaTapPulang", "tolak", {}, {}, { recId: "salah" });
await tolak("saran: keputusan menunjuk record LAIN yang sudah ada ditolak (recId harus {tanggal}_{tipe})", waka, "PUT", sugPath("2026-10-11", "terlambat", "111"), { keputusan: "diterima", oleh: waka.uid, ts: SV, nis: "111", recId: "recSeed" });
await saran("saran: tipe asing pada kunci ditolak", waka, "444", TGL, "lainnya", "tolak");
await uji("saran: kunci tidak cocok dengan nis ditolak", waka, "PUT", sugPath(TGL, "terlambat", "555"), { keputusan: "diabaikan", oleh: waka.uid, ts: SV, nis: "444" }, "tolak");
await saran("saran: keputusan.oleh bukan pengguna ditolak", waka, "444", TGL, "tanpaTapPulang", "tolak", {}, {}, { oleh: kepala.uid });
await saran("saran: field asing pada keputusan ditolak", waka, "444", TGL, "tanpaTapPulang", "tolak", {}, {}, { asing: 1 });
await saran("saran: kepala boleh menyetujui (saran lain)", kepala, "444", TGL, "tanpaTapPulang", "izin");
await izin("saran: waka mengabaikan (tanpa recId)", waka, "PUT", sugPath(TGL, "terlambat", "555"), { keputusan: "diabaikan", oleh: waka.uid, ts: SV, nis: "555" });
await izin("saran: kepala mengabaikan dengan alasan", kepala, "PUT", sugPath(TGL, "bolosJam", "666"), { keputusan: "diabaikan", oleh: kepala.uid, ts: SV, nis: "666", alasan: "sudah ditangani wali kelas" });
await tolak("saran: 'diabaikan' membawa recId ditolak", waka, "PUT", sugPath(TGL, "alfa", "777"), { keputusan: "diabaikan", oleh: waka.uid, ts: SV, nis: "777", recId: `${TGL}_alfa` });
await tolak("saran: alasan > 200 karakter ditolak", waka, "PUT", sugPath(TGL, "alfa", "777"), { keputusan: "diabaikan", oleh: waka.uid, ts: SV, nis: "777", alasan: "x".repeat(201) });
await tolak("saran: keputusan tak dikenal ditolak", waka, "PUT", sugPath(TGL, "alfa", "777"), { keputusan: "tunda", oleh: waka.uid, ts: SV, nis: "777" });
await tolak("saran: keputusan yang sudah ada TIDAK bisa diubah (abaikan -> terima)", waka, "PUT", sugPath(TGL, "terlambat", "555"), { keputusan: "diterima", oleh: waka.uid, ts: SV, nis: "555", recId: `${TGL}_terlambat` });
await tolak("saran: keputusan yang sudah ada TIDAK bisa ditimpa", kepala, "PUT", sugPath(TGL, "terlambat", "555"), { keputusan: "diabaikan", oleh: kepala.uid, ts: SV, nis: "555" });
await tolak("saran: keputusan TIDAK bisa dihapus", waka, "DELETE", sugPath(TGL, "terlambat", "555"));
await tolak("saran: tanggal salah pada suggest ditolak", waka, "PUT", "discipline/suggest/14-10-2026/terlambat_888", { keputusan: "diabaikan", oleh: waka.uid, ts: SV, nis: "888" });
await izin("saran: waka baca suggest", waka, "GET", "discipline/suggest");
await izin("saran: kepala baca suggest", kepala, "GET", "discipline/suggest");
await izin("saran: admin baca suggest", admin, "GET", "discipline/suggest");
await tolak("saran: admin TIDAK bisa menulis keputusan", admin, "PUT", sugPath(TGL, "alfa", "999"), { keputusan: "diabaikan", oleh: admin.uid, ts: SV, nis: "999" });
await saran("saran: admin TIDAK bisa menyetujui", admin, "111", "2026-10-12", "terlambat", "tolak");
await tolak("saran: ortu TIDAK bisa baca suggest", ortu1, "GET", "discipline/suggest");
await tolak("saran: ortu TIDAK bisa menulis keputusan", ortu1, "PUT", sugPath(TGL, "alfa", "999"), { keputusan: "diabaikan", oleh: ortu1.uid, ts: SV, nis: "999" });
await tolak("saran: alat TIDAK bisa baca suggest", dev, "GET", "discipline/suggest");
await tolak("saran: alat TIDAK bisa menulis keputusan", dev, "PUT", sugPath(TGL, "alfa", "999"), { keputusan: "diabaikan", oleh: dev.uid, ts: SV, nis: "999" });
await tolak("saran: anonim TIDAK bisa baca suggest", null, "GET", "discipline/suggest");
await tolak("record manual BOLEH tanpa suggest, tetapi id deterministik palsu tetap tidak lolos sebagai 'saran'", waka, "PATCH", "", buatBody(waka, "333", `${TGL}_alfa`, { sumber: "saran", tanggal: TGL }));
await buatOk("record manual (sumber manual) dengan id mirip saran tetap sah", waka, "333", `${TGL}_manual`);

// ================================================================ KEPALA
seksi("KEPALA — kesiswaan");
await buatOk("kepala catat pelanggaran valid (records + recordMeta)", kepala, "222", "recK1");
await izin("kepala baca recordMeta", kepala, "GET", "discipline/recordMeta");
await izin("kepala tulis master rules", kepala, "PUT", "discipline/rules/rK1", { kategori: "Sedang", nama: "K", poin: 30, aktif: true, diubahOleh: kepala.uid, diubahTs: SV });
await izin("kepala tulis catatan internal", kepala, "PUT", "discipline/notes/222/recK1", "x");
await izin("kepala tulis audit", kepala, "PUT", "discipline/audit/aK1", audit(kepala));
await izin("kepala baca discipline/records", kepala, "GET", "discipline/records");
await izin("kepala tulis izin", kepala, "PUT", `izin/${TGL}/222`, "Izin");
await tolak("kepala TIDAK bisa tulis attendance status", kepala, "PUT", `attendance/222/${TGL}/status`, "Hadir");
await tolak("kepala TIDAK bisa tulis roles", kepala, "PUT", `roles/${target.uid}`, "kepala");
await tolak("kepala TIDAK bisa baca parents", kepala, "GET", "parents/111");
await tolak("kepala TIDAK bisa baca device/inbox", kepala, "GET", "device/inbox");

seksi("KEPALA — regresi hak awal (pantau)");
for (const p of ["config/students", "config/version", "config/schedule", "attendance", "log", "izin", "device/status", "profiles"]) {
  await izin(`kepala baca ${p}`, kepala, "GET", p);
}
for (const p of ["parents/111", "unknown", "device/events", "device/inbox", "device", `roles/${admin.uid}`, "staff", "config"]) {
  await tolak(`kepala TIDAK bisa baca ${p}`, kepala, "GET", p);
}
await izin("kepala baca staff miliknya sendiri", kepala, "GET", `staff/${kepala.uid}`);
await izin("kepala baca roles miliknya sendiri", kepala, "GET", `roles/${kepala.uid}`);
await izin("kepala tulis attendance ket", kepala, "PUT", `attendance/222/${TGL}/ket`, "Sakit");
await izin("kepala tulis attendance catatan", kepala, "PUT", `attendance/222/${TGL}/catatan`, "surat dokter");
await izin("kepala hapus izin", kepala, "DELETE", `izin/${TGL}/222`);
await tolak("kepala: izin nilai asing ditolak", kepala, "PUT", `izin/${TGL}/222`, "Alfa");
await tolak("kepala TIDAK bisa tulis attendance masuk", kepala, "PUT", `attendance/222/${TGL}/masuk`, "06:00:00");
await tolak("kepala TIDAK bisa tulis attendance pulang", kepala, "PUT", `attendance/222/${TGL}/pulang`, "15:00:00");
await tolak("kepala TIDAK bisa tulis config/students", kepala, "PUT", "config/students/CCCC3333", { nis: "333", nama: "X", kelas: "X" });
await tolak("kepala TIDAK bisa tulis config/version", kepala, "PUT", "config/version", 9);
await tolak("kepala TIDAK bisa tulis device/inbox", kepala, "PUT", "device/inbox/command", { id: "x", cmd: "sync", ts: 1 });
await tolak("kepala TIDAK bisa tulis staff", kepala, "PUT", `staff/${target.uid}`, { email: "a@b.c", nama: "X", role: "waka", dibuat: SV });
await tolak("kepala TIDAK bisa tulis parents", kepala, "PUT", "parents/333", { ver: 1, uid: "u" });
await tolak("kepala TIDAK bisa tulis profiles", kepala, "PUT", "profiles/333", { nama: "X", kelas: "X" });
await tolak("kepala TIDAK bisa tulis log", kepala, "PUT", `log/${TGL}/AAAA1111_P`, { jam: "15:00:00", nis: "111", status: "Pulang" });
await tolak("kepala TIDAK bisa tulis unknown", kepala, "PUT", `unknown/${TGL}/QQQQ0000`, { jam: "07:00:00" });

// ================================================================ ADMIN
seksi("ADMIN — kesiswaan hanya baca");
for (const p of ["discipline/records", "discipline/notes", "discipline/audit", "discipline/rules", "discipline/remisi", "discipline/levels", "discipline/autoMap"]) {
  await izin(`admin baca ${p}`, admin, "GET", p);
}
await buatNo("admin TIDAK bisa tulis records (+meta)", admin, "111", "recA1");
await izin("admin baca recordMeta", admin, "GET", "discipline/recordMeta");
await tolak("admin TIDAK bisa tulis recordMeta", admin, "PUT", M("111", "recSeed"), meta(admin));
await tolak("admin TIDAK bisa soft delete", admin, "PATCH", "", hapusBody(admin, "111", "recSeed"));
await tolak("admin TIDAK bisa ubah record lama", admin, "PATCH", "", { [`${P("111", "recSeed")}/poin`]: 6, [`${M("111", "recSeed")}/diubahOleh`]: admin.uid, [`${M("111", "recSeed")}/diubahTs`]: SV });
await tolak("admin TIDAK bisa tulis rules", admin, "PUT", "discipline/rules/rA1", { kategori: "Ringan", nama: "x", poin: 5, aktif: true, diubahOleh: admin.uid, diubahTs: SV });
await tolak("admin TIDAK bisa tulis remisi", admin, "PUT", "discipline/remisi/mA1", { kelompok: "Prestasi", nama: "x", poin: 5, aktif: true, diubahOleh: admin.uid, diubahTs: SV });
await tolak("admin TIDAK bisa tulis levels", admin, "PUT", "discipline/levels/lA1", { poin: 100, tindakan: "x" });
await tolak("admin TIDAK bisa tulis notes", admin, "PUT", "discipline/notes/111/recSeed", "x");
await tolak("admin TIDAK bisa tulis audit", admin, "PUT", "discipline/audit/aA1", audit(admin));
await tolak("admin TIDAK bisa tulis autoMap", admin, "PATCH", "discipline/autoMap", { alfa: "r1" });

seksi("ADMIN — kelola peran (anti eskalasi)");
await izin("admin set roles/x = waka", admin, "PUT", `roles/${target.uid}`, "waka");
await izin("admin set staff/x (role waka)", admin, "PUT", `staff/${target.uid}`, { email: "t@uji.test", nama: "Target", role: "waka", dibuat: SV });
await izin("admin ubah roles/x waka -> kepala", admin, "PUT", `roles/${target.uid}`, "kepala");
await izin("admin hapus roles/x (kepala)", admin, "DELETE", `roles/${target.uid}`);
await izin("admin hapus staff/x", admin, "DELETE", `staff/${target.uid}`);
await izin("admin set roles/x = kepala", admin, "PUT", `roles/${target.uid}`, "kepala");
await izin("admin hapus roles/x lagi", admin, "DELETE", `roles/${target.uid}`);
await izin("admin multi-path (roles + staff) sekaligus", admin, "PATCH", "", {
  [`roles/${target.uid}`]: "waka", [`staff/${target.uid}`]: { email: "t@uji.test", nama: "Target", role: "waka", dibuat: SV },
});
await izin("admin cabut multi-path (roles + staff)", admin, "PATCH", "", { [`roles/${target.uid}`]: null, [`staff/${target.uid}`]: null });
await tolak("admin TIDAK bisa set roles/x = admin", admin, "PUT", `roles/${target.uid}`, "admin");
await tolak("admin TIDAK bisa set roles/x = device", admin, "PUT", `roles/${target.uid}`, "device");
await tolak("admin TIDAK bisa set roles/x = nilai asing", admin, "PUT", `roles/${target.uid}`, "superuser");
await tolak("admin TIDAK bisa ubah role dirinya sendiri", admin, "PUT", `roles/${admin.uid}`, "waka");
await tolak("admin TIDAK bisa hapus role dirinya sendiri", admin, "DELETE", `roles/${admin.uid}`);
await tolak("admin TIDAK bisa menimpa role admin lain", admin, "PUT", `roles/${admin2.uid}`, "waka");
await tolak("admin TIDAK bisa menghapus role admin lain", admin, "DELETE", `roles/${admin2.uid}`);
await tolak("admin TIDAK bisa menghapus role device", admin, "DELETE", `roles/${dev.uid}`);
await tolak("admin TIDAK bisa mengubah role device", admin, "PUT", `roles/${dev.uid}`, "waka");
await tolak("staff: role = admin ditolak", admin, "PUT", `staff/${target.uid}`, { email: "t@uji.test", nama: "Target", role: "admin", dibuat: SV });
await tolak("staff: field asing ditolak", admin, "PUT", `staff/${target.uid}`, { email: "t@uji.test", nama: "Target", role: "waka", dibuat: SV, x: 1 });
await tolak("staff: nama kosong ditolak", admin, "PUT", `staff/${target.uid}`, { email: "t@uji.test", nama: "", role: "waka", dibuat: SV });
await tolak("waka TIDAK bisa baca staff milik orang lain", waka, "GET", `staff/${kepala.uid}`);
await tolak("orang biasa TIDAK bisa tulis roles", orang, "PUT", `roles/${orang.uid}`, "waka");

seksi("ADMIN — regresi hak lama");
await izin("admin tulis config/students", admin, "PUT", "config/students/CCCC3333", { nis: "333", nama: "BARU", kelas: "X" });
await izin("admin tulis parents", admin, "PUT", "parents/333", { ver: 1, uid: "uid-ortu-3" });
await izin("admin tulis profiles", admin, "PUT", "profiles/333", { nama: "BARU", kelas: "X" });
await izin("admin kirim perintah alat", admin, "PUT", "device/inbox/command", { id: "x1", cmd: "sync", ts: 1 });
await izin("admin baca unknown", admin, "GET", "unknown");
await izin("admin baca device", admin, "GET", "device");
await izin("admin baca attendance", admin, "GET", "attendance");
await izin("admin tulis izin", admin, "PUT", `izin/${TGL}/111`, "Izin");

// ================================================================ ORANG TUA
seksi("ORANG TUA");
await izin("ortu1 baca discipline/records/111 (anak sendiri)", ortu1, "GET", "discipline/records/111");
await izin("ortu1 baca discipline/rules", ortu1, "GET", "discipline/rules");
await izin("ortu1 baca discipline/remisi", ortu1, "GET", "discipline/remisi");
await izin("ortu1 baca discipline/levels", ortu1, "GET", "discipline/levels");
await izin("ortu1 baca attendance/111", ortu1, "GET", "attendance/111");
await tolak("ortu1 TIDAK bisa baca records anak lain (222)", ortu1, "GET", "discipline/records/222");
await tolak("ortu1 TIDAK bisa baca seluruh discipline/records", ortu1, "GET", "discipline/records");
await tolak("ortu1 TIDAK bisa baca notes anaknya", ortu1, "GET", "discipline/notes/111");
await tolak("ortu1 TIDAK bisa baca seluruh notes", ortu1, "GET", "discipline/notes");
await tolak("ortu1 TIDAK bisa baca audit", ortu1, "GET", "discipline/audit");
await tolak("ortu1 TIDAK bisa baca attendance anak lain", ortu1, "GET", "attendance/222");
await tolak("ortu1 TIDAK bisa baca roles", ortu1, "GET", `roles/${admin.uid}`);
await buatNo("ortu1 TIDAK bisa tulis discipline/records", ortu1, "111", "recO1");
await tolak("ortu1 TIDAK bisa baca recordMeta anaknya", ortu1, "GET", "discipline/recordMeta/111");
await tolak("ortu1 TIDAK bisa baca recordMeta (root)", ortu1, "GET", "discipline/recordMeta");
await tolak("ortu1 TIDAK bisa baca recordMeta satu catatan", ortu1, "GET", M("111", "recSeed"));
await tolak("ortu1 TIDAK bisa tulis recordMeta", ortu1, "PUT", M("111", "recSeed"), meta(ortu1));
await cek("ortu1: records anaknya TIDAK memuat field staf (dibuatOleh/dibuatNama/dibuatTs/diubah*/dihapus/alasanHapus/snapshot)", ortu1, "discipline/records/111",
  (j) => Object.values(j ?? {}).length > 0 && Object.values(j).every((x) => !["dibuatOleh", "dibuatNama", "dibuatTs", "diubahOleh", "diubahTs", "dihapus", "alasanHapus", "snapshot"].some((k) => k in x)));
await cek("ortu1: catatan yang dihapus (recW1) TIDAK ada di path publik", ortu1, "discipline/records/111", (j) => !("recW1" in (j ?? {})));
await cek("ortu1: isi record publik hanya field isi (tidak ada nama staf di mana pun)", ortu1, "discipline/records/111", (j) => !JSON.stringify(j).includes("Staf") && !JSON.stringify(j).includes("Waka"));
await tolak("ortu1 TIDAK bisa tulis rules", ortu1, "PUT", "discipline/rules/rO1", { kategori: "Ringan", nama: "x", poin: 5, aktif: true, diubahOleh: ortu1.uid, diubahTs: SV });
await tolak("ortu1 TIDAK bisa tulis audit", ortu1, "PUT", "discipline/audit/aO1", audit(ortu1));
await tolak("ortu1 TIDAK bisa tulis roles sendiri", ortu1, "PUT", `roles/${ortu1.uid}`, "waka");

// ================================================================ ALAT & TANPA LOGIN (regresi)
seksi("ALAT (device) & anonim — regresi");
await izin("alat tulis log valid", dev, "PUT", `log/${TGL}/BBBB2222_M`, { jam: "06:58:00", nis: "222", status: "Hadir" });
await izin("alat tulis device/status", dev, "PUT", "device/status/lastSeen", 99);
await izin("alat tulis unknown", dev, "PUT", `unknown/${TGL}/QQQQ0000`, { jam: "07:00:00" });
await izin("alat baca device/inbox", dev, "GET", "device/inbox");
await izin("alat baca config/students", dev, "GET", "config/students");
await tolak("alat TIDAK bisa baca discipline/records", dev, "GET", "discipline/records");
await buatNo("alat TIDAK bisa tulis discipline/records", dev, "111", "recD1");
await tolak("alat TIDAK bisa baca recordMeta", dev, "GET", "discipline/recordMeta");
await tolak("alat TIDAK bisa tulis discipline/audit", dev, "PUT", "discipline/audit/aD1", audit(dev));
await tolak("alat TIDAK bisa tulis roles", dev, "PUT", `roles/${target.uid}`, "waka");
await tolak("anonim TIDAK bisa baca discipline/rules", null, "GET", "discipline/rules");
await tolak("anonim TIDAK bisa baca discipline/records/111", null, "GET", "discipline/records/111");
await tolak("anonim TIDAK bisa baca recordMeta", null, "GET", "discipline/recordMeta");
await tolak("anonim TIDAK bisa tulis discipline/audit", null, "PUT", "discipline/audit/aN1", { aksi: "buat", path: "x", oleh: "x", olehNama: "x", ts: 1 });
await tolak("orang tanpa peran TIDAK bisa baca attendance", orang, "GET", "attendance");
await tolak("orang tanpa peran TIDAK bisa baca discipline/records", orang, "GET", "discipline/records");
await tolak("orang tanpa peran TIDAK bisa baca recordMeta", orang, "GET", "discipline/recordMeta");


// ================================================================ TAHAP 2: PRESENSI PER JAM & VALIDASI
const KLS = "XI IPS";
const cell = (n, j) => `lessons/${TGL}/${KLS}/absen/${n}/${j}`;
// siswa 911/922 TIDAK punya keterangan harian (attendance/<nis>/<tgl>/ket); sel per jam ditolak untuk siswa/tanggal yang ber-ket (v2.3.1)
seksi("PER JAM — waka");
for (const k of ["A", "I", "S", "D"]) await izin(`waka set sel ${k}`, waka, "PUT", cell("911", k === "A" ? 1 : k === "I" ? 2 : k === "S" ? 3 : 4), k);
await izin("waka set meta mapel+guru", waka, "PUT", `lessons/${TGL}/${KLS}/meta/1`, { mapel: "Matematika", guru: "Pak Budi" });
await izin("waka set meta hanya mapel", waka, "PUT", `lessons/${TGL}/${KLS}/meta/2`, { mapel: "TI" });
await izin("waka simpan multi-path (sel + salinan + oleh + ts)", waka, "PATCH", "", {
  [cell("922", 5)]: "A", [`lessonsByStudent/922/${TGL}/5`]: { k: "A", mapel: "TI" },
  [`lessons/${TGL}/${KLS}/oleh`]: waka.uid, [`lessons/${TGL}/${KLS}/ts`]: SV,
});
await izin("waka hapus sel (kembali hadir)", waka, "DELETE", cell("911", 4));
await izin("waka hapus salinan sel", waka, "DELETE", `lessonsByStudent/922/${TGL}/5`);
await izin("waka kelas dengan karakter ter-encode", waka, "PUT", `lessons/${TGL}/XI%252EIPS/absen/911/1`, "A");
await tolak("sel kode B (bolos sudah dihapus) ditolak", waka, "PUT", cell("911", 6), "B");
await tolak("sel kode kecil 'a' ditolak", waka, "PUT", cell("911", 6), "a");
await tolak("sel kode asing 'H' ditolak", waka, "PUT", cell("911", 6), "H");
await tolak("sel jam 0 ditolak", waka, "PUT", cell("911", 0), "A");
await tolak("sel jam 10 ditolak", waka, "PUT", cell("911", 10), "A");
await tolak("sel nis bukan angka ditolak", waka, "PUT", cell("abc", 1), "A");
await tolak("tanggal format salah ditolak", waka, "PUT", `lessons/14-10-2026/${KLS}/absen/911/1`, "A");
await tolak("meta jam 0 ditolak", waka, "PUT", `lessons/${TGL}/${KLS}/meta/0`, { mapel: "X" });
await tolak("meta mapel > 60 karakter ditolak", waka, "PUT", `lessons/${TGL}/${KLS}/meta/3`, { mapel: "x".repeat(61) });
await tolak("meta field asing ditolak", waka, "PUT", `lessons/${TGL}/${KLS}/meta/3`, { mapel: "X", rahasia: 1 });
await tolak("kelas: field asing ditolak", waka, "PUT", `lessons/${TGL}/${KLS}/asing`, 1);
await tolak("oleh bukan pengguna ditolak", waka, "PUT", `lessons/${TGL}/${KLS}/oleh`, kepala.uid);
await tolak("salinan: k = B ditolak", waka, "PUT", `lessonsByStudent/911/${TGL}/6`, { k: "B" });
await tolak("salinan: tanpa k ditolak", waka, "PUT", `lessonsByStudent/911/${TGL}/6`, { mapel: "X" });
await tolak("salinan: field asing ditolak", waka, "PUT", `lessonsByStudent/911/${TGL}/6`, { k: "A", asing: 1 });
await izin("salinan: valid (k + mapel)", waka, "PUT", `lessonsByStudent/911/${TGL}/6`, { k: "S", mapel: "IPA" });

seksi("PER JAM — peran lain");
await izin("kepala baca lessons", kepala, "GET", "lessons");
await izin("kepala baca lessonsByStudent", kepala, "GET", "lessonsByStudent");
await izin("admin baca lessons", admin, "GET", "lessons");
await izin("admin baca lessonsByStudent", admin, "GET", "lessonsByStudent");
await tolak("kepala TIDAK bisa tulis sel", kepala, "PUT", cell("111", 7), "A");
await tolak("kepala TIDAK bisa tulis meta", kepala, "PUT", `lessons/${TGL}/${KLS}/meta/7`, { mapel: "X" });
await tolak("kepala TIDAK bisa tulis salinan", kepala, "PUT", `lessonsByStudent/111/${TGL}/7`, { k: "A" });
await tolak("admin TIDAK bisa tulis sel", admin, "PUT", cell("111", 7), "A");
await tolak("admin TIDAK bisa tulis salinan", admin, "PUT", `lessonsByStudent/111/${TGL}/7`, { k: "A" });
await izin("ortu1 baca lessonsByStudent/111 (anak sendiri)", ortu1, "GET", "lessonsByStudent/111");
await tolak("ortu1 TIDAK bisa baca lessonsByStudent/222", ortu1, "GET", "lessonsByStudent/222");
await tolak("ortu1 TIDAK bisa baca seluruh lessonsByStudent", ortu1, "GET", "lessonsByStudent");
await tolak("ortu1 TIDAK bisa baca lessons", ortu1, "GET", "lessons");
await tolak("ortu1 TIDAK bisa tulis lessonsByStudent", ortu1, "PUT", `lessonsByStudent/111/${TGL}/8`, { k: "A" });
await tolak("alat TIDAK bisa baca lessons", dev, "GET", "lessons");
await tolak("alat TIDAK bisa tulis lessons", dev, "PUT", cell("111", 8), "A");
await tolak("anonim TIDAK bisa baca lessons", null, "GET", "lessons");

seksi("VALIDASI ALFA HARIAN");
const val = (u, o = {}) => ({ status: "Alfa", oleh: u.uid, ts: SV, ...o });
await izin("waka konfirmasi Alfa", waka, "PUT", `validasi/${TGL}/111`, val(waka, { catatan: "tidak ada kabar" }));
await izin("kepala konfirmasi Alfa", kepala, "PUT", `validasi/${TGL}/222`, val(kepala));
await izin("waka tulis salinan validasiByStudent", waka, "PUT", `validasiByStudent/111/${TGL}`, { status: "Alfa" });
await izin("multi-path validasi + salinan + audit", waka, "PATCH", "", {
  [`validasi/${TGL}/333`]: val(waka), [`validasiByStudent/333/${TGL}`]: { status: "Alfa" }, "discipline/audit/aV1": audit(waka, { path: `validasi/${TGL}/333` }),
});
await izin("waka batalkan Alfa (hapus)", waka, "DELETE", `validasi/${TGL}/333`);
await izin("waka hapus salinan", waka, "DELETE", `validasiByStudent/333/${TGL}`);
await tolak("validasi status selain Alfa ditolak", waka, "PUT", `validasi/${TGL}/444`, val(waka, { status: "Hadir" }));
await tolak("validasi oleh bukan pengguna ditolak", waka, "PUT", `validasi/${TGL}/444`, val(waka, { oleh: kepala.uid }));
await tolak("validasi field asing ditolak", waka, "PUT", `validasi/${TGL}/444`, val(waka, { asing: 1 }));
await tolak("validasi catatan > 200 karakter ditolak", waka, "PUT", `validasi/${TGL}/444`, val(waka, { catatan: "x".repeat(201) }));
await tolak("validasi nis bukan angka ditolak", waka, "PUT", `validasi/${TGL}/abc`, val(waka));
await tolak("validasi tanggal salah ditolak", waka, "PUT", "validasi/14-10-2026/444", val(waka));
await tolak("salinan status selain Alfa ditolak", waka, "PUT", `validasiByStudent/444/${TGL}`, { status: "Sakit" });
await tolak("admin TIDAK bisa tulis validasi", admin, "PUT", `validasi/${TGL}/555`, val(admin));
await tolak("admin TIDAK bisa tulis salinan validasi", admin, "PUT", `validasiByStudent/555/${TGL}`, { status: "Alfa" });
await izin("admin baca validasi", admin, "GET", "validasi");
await izin("kepala baca validasi", kepala, "GET", "validasi");
await izin("waka baca validasi", waka, "GET", "validasi");
await tolak("ortu1 TIDAK bisa baca validasi", ortu1, "GET", "validasi");
await tolak("ortu1 TIDAK bisa baca validasi/tanggal", ortu1, "GET", `validasi/${TGL}`);
await izin("ortu1 baca validasiByStudent/111 (anak sendiri)", ortu1, "GET", "validasiByStudent/111");
await tolak("ortu1 TIDAK bisa baca validasiByStudent/222", ortu1, "GET", "validasiByStudent/222");
await tolak("ortu1 TIDAK bisa tulis validasi", ortu1, "PUT", `validasi/${TGL}/111`, val(ortu1));
await tolak("alat TIDAK bisa baca validasi", dev, "GET", "validasi");
await tolak("alat TIDAK bisa tulis validasi", dev, "PUT", `validasi/${TGL}/111`, val(dev));
await tolak("anonim TIDAK bisa baca validasi", null, "GET", "validasi");


// ================================================================ REGRESI ALAT — jalur firmware v12
seksi("ALAT — jalur firmware v12 (harus LOLOS)");
const FW = "2026-11-03"; // tanggal bersih khusus blok ini
await izin("fw: GET config/version", dev, "GET", "config/version");
await izin("fw: GET config/schedule", dev, "GET", "config/schedule");
await izin("fw: GET config/students", dev, "GET", "config/students");
await izin("fw: GET device/inbox?shallow=true", dev, "GET", "device/inbox?shallow=true");
await izin("fw: PATCH root multi-path masuk (attendance masuk+status + log _M)", dev, "PATCH", "", {
  [`attendance/333/${FW}/masuk`]: "06:50:00", [`attendance/333/${FW}/status`]: "Hadir",
  [`log/${FW}/CCCC3333_M`]: { jam: "06:50:00", nis: "333", nama: "CITRA", kelas: "X IPA", status: "Hadir" },
});
await izin("fw: PATCH root multi-path pulang (attendance pulang + log _P)", dev, "PATCH", "", {
  [`attendance/333/${FW}/pulang`]: "15:05:00",
  [`log/${FW}/CCCC3333_P`]: { jam: "15:05:00", nis: "333", nama: "CITRA", kelas: "X IPA", status: "Pulang" },
});
await izin("fw: PATCH masuk diulang (retry idempoten, nilai sama)", dev, "PATCH", "", {
  [`attendance/333/${FW}/masuk`]: "06:50:00", [`attendance/333/${FW}/status`]: "Hadir",
  [`log/${FW}/CCCC3333_M`]: { jam: "06:50:00", nis: "333", nama: "CITRA", kelas: "X IPA", status: "Hadir" },
});
await izin("fw: PATCH masuk Terlambat siswa lain", dev, "PATCH", "", {
  [`attendance/444/${FW}/masuk`]: "07:30:00", [`attendance/444/${FW}/status`]: "Terlambat",
  [`log/${FW}/DDDD4444_M`]: { jam: "07:30:00", nis: "444", status: "Terlambat" },
});
// ---- KUNCI TAP PERTAMA (v2.4): alat hanya menulis bila belum ada ATAU nilainya identik; tap kedua tidak menimpa tap pertama
const KT = "2026-11-04";
const KT2 = "2026-11-05";
const tapMasuk = (nis, uid, jam, status, tgl = KT) => ({
  [`attendance/${nis}/${tgl}/masuk`]: jam, [`attendance/${nis}/${tgl}/status`]: status,
  [`log/${tgl}/${uid}_M`]: { jam, nis, nama: "UJI KUNCI", kelas: "X IPA", status },
});
await izin("kunci: tap PERTAMA masuk (attendance + log) DITERIMA", dev, "PATCH", "", tapMasuk("346", "EEEE5555", "06:55:00", "Hadir"));
await izin("kunci: retry IDENTIK dari antrian tetap DITERIMA", dev, "PATCH", "", tapMasuk("346", "EEEE5555", "06:55:00", "Hadir"));
await tolak("kunci: tap KEDUA (07:40, Terlambat) menimpa tap pertama: seluruh update DITOLAK", dev, "PATCH", "", tapMasuk("346", "EEEE5555", "07:40:00", "Terlambat"));
await tolak("kunci: HANYA attendance/masuk berbeda (status dan log identik) DITOLAK", dev, "PATCH", "", { ...tapMasuk("346", "EEEE5555", "06:55:00", "Hadir"), [`attendance/346/${KT}/masuk`]: "07:40:00" });
await tolak("kunci: HANYA attendance/status berbeda (masuk dan log identik) DITOLAK", dev, "PATCH", "", { ...tapMasuk("346", "EEEE5555", "06:55:00", "Hadir"), [`attendance/346/${KT}/status`]: "Terlambat" });
await tolak("kunci: HANYA log _M jam berbeda (attendance identik) DITOLAK", dev, "PATCH", "", { ...tapMasuk("346", "EEEE5555", "06:55:00", "Hadir"), [`log/${KT}/EEEE5555_M`]: { jam: "07:40:00", nis: "346", status: "Hadir" } });
await tolak("kunci: HANYA log _M status berbeda (attendance identik) DITOLAK", dev, "PATCH", "", { ...tapMasuk("346", "EEEE5555", "06:55:00", "Hadir"), [`log/${KT}/EEEE5555_M`]: { jam: "06:55:00", nis: "346", status: "Terlambat" } });
await tolak("kunci: HANYA log _M nis berbeda (attendance identik) DITOLAK", dev, "PATCH", "", { ...tapMasuk("346", "EEEE5555", "06:55:00", "Hadir"), [`log/${KT}/EEEE5555_M`]: { jam: "06:55:00", nis: "999", status: "Hadir" } });
await tolak("kunci: PUT tunggal attendance/masuk berbeda DITOLAK", dev, "PUT", `attendance/346/${KT}/masuk`, "07:40:00");
await tolak("kunci: PUT tunggal attendance/status berbeda DITOLAK", dev, "PUT", `attendance/346/${KT}/status`, "Terlambat");
await tolak("kunci: PUT tunggal log _M berbeda DITOLAK", dev, "PUT", `log/${KT}/EEEE5555_M`, { jam: "07:40:00", nis: "346", status: "Terlambat" });
await izin("kunci: PUT tunggal attendance/masuk IDENTIK (retry) DITERIMA", dev, "PUT", `attendance/346/${KT}/masuk`, "06:55:00");
await izin("kunci: PUT tunggal log _M IDENTIK (retry) DITERIMA", dev, "PUT", `log/${KT}/EEEE5555_M`, { jam: "06:55:00", nis: "346", status: "Hadir" });
// pulang
await izin("kunci: tap pulang PERTAMA (attendance + log _P) DITERIMA", dev, "PATCH", "", { [`attendance/346/${KT}/pulang`]: "15:05:00", [`log/${KT}/EEEE5555_P`]: { jam: "15:05:00", nis: "346", status: "Pulang" } });
await izin("kunci: retry pulang IDENTIK DITERIMA", dev, "PATCH", "", { [`attendance/346/${KT}/pulang`]: "15:05:00", [`log/${KT}/EEEE5555_P`]: { jam: "15:05:00", nis: "346", status: "Pulang" } });
await tolak("kunci: HANYA attendance/pulang berbeda DITOLAK", dev, "PATCH", "", { [`attendance/346/${KT}/pulang`]: "16:30:00", [`log/${KT}/EEEE5555_P`]: { jam: "15:05:00", nis: "346", status: "Pulang" } });
await tolak("kunci: HANYA log _P jam berbeda DITOLAK", dev, "PATCH", "", { [`attendance/346/${KT}/pulang`]: "15:05:00", [`log/${KT}/EEEE5555_P`]: { jam: "16:30:00", nis: "346", status: "Pulang" } });
await tolak("kunci: HANYA log _P status berbeda DITOLAK", dev, "PATCH", "", { [`attendance/346/${KT}/pulang`]: "15:05:00", [`log/${KT}/EEEE5555_P`]: { jam: "15:05:00", nis: "346", status: "Hadir" } });
await cek("kunci: tap pertama utuh setelah semua upaya menimpa", waka, `attendance/346/${KT}`, (j) => j?.masuk === "06:55:00" && j.status === "Hadir" && j.pulang === "15:05:00");
await cek("kunci: log _M tap pertama utuh", waka, `log/${KT}/EEEE5555_M`, (j) => j?.jam === "06:55:00" && j.status === "Hadir");
// tidak mengganggu antrian lain
await izin("kunci: siswa LAIN pada hari yang sama tidak terpengaruh", dev, "PATCH", "", tapMasuk("347", "AAAA7777", "07:20:00", "Terlambat"));
await izin("kunci: siswa yang sama pada hari BERIKUTNYA tidak terpengaruh", dev, "PATCH", "", tapMasuk("346", "EEEE5555", "07:05:00", "Hadir", KT2));
await izin("kunci: kartu LAIN (entri log baru) untuk siswa yang sama pada hari yang sama DITERIMA", dev, "PUT", `log/${KT}/CCCC8888_M`, { jam: "07:50:00", nis: "346", status: "Terlambat" });
await izin("kunci: admin tetap dapat mengoreksi attendance/masuk", admin, "PUT", `attendance/346/${KT}/masuk`, "06:56:00");
await tolak("kunci: waka TIDAK dapat menulis attendance/masuk (tetap hanya alat/admin)", waka, "PUT", `attendance/347/${KT}/masuk`, "06:00:00");
await izin("fw: PUT unknown/{tgl}/{uid}", dev, "PUT", `unknown/${FW}/ZZZZ0001`, { jam: "07:10:00" });
await izin("fw: PUT device/status (utuh)", dev, "PUT", "device/status", { lastSeen: SV, firmware: "v12", rssi: -60, heap: 120000, antrian: 0 });
await izin("fw: PATCH device/status (merge)", dev, "PATCH", "device/status", { lastSeen: SV, rssi: -58 });
await izin("fw: PUT device/ack/{id}", dev, "PUT", "device/ack/cmd123", { ok: true, hasil: "selesai", ts: SV });
const ev = await http("POST", "device/events", { token: dev.token, body: { ts: SV, jenis: "boot", detail: "v12" } });
{
  const ok = ev.status === 200 && typeof ev.json?.name === "string";
  if (ok) hasil.lolos++; else hasil.gagal.push(`fw: POST device/events  [status ${ev.status} ${JSON.stringify(ev.json)}]`);
  console.log(`${ok ? "  ✓" : "  ✗"} fw: POST device/events (push id)`);
}
const evId = ev.json?.name;

seksi("ALAT — TIDAK bisa menghapus & TIDAK bisa menulis keterangan (harus DITOLAK)");
for (const f of ["masuk", "pulang", "status"]) await tolak(`alat TIDAK bisa menghapus attendance/{nis}/{tgl}/${f}`, dev, "DELETE", `attendance/333/${FW}/${f}`);
await tolak("alat TIDAK bisa menghapus node attendance/{nis}/{tgl}", dev, "DELETE", `attendance/333/${FW}`);
await tolak("alat TIDAK bisa menimpa node attendance/{nis}/{tgl} yang sudah ada", dev, "PUT", `attendance/333/${FW}`, { masuk: "05:00:00", status: "Hadir" });
await tolak("alat TIDAK bisa menghapus lewat PATCH root (null) pada masuk", dev, "PATCH", "", { [`attendance/333/${FW}/masuk`]: null });
await tolak("alat: PATCH root valid + penghapusan sekaligus -> seluruhnya ditolak", dev, "PATCH", "", { [`attendance/333/${FW}/pulang`]: "15:10:00", [`attendance/333/${FW}/masuk`]: null });
await cek("alat: masuk/pulang/status utuh setelah semua upaya hapus (dibaca waka)", waka, `attendance/333/${FW}`, (j) => j?.masuk === "06:50:00" && j.pulang === "15:05:00" && j.status === "Hadir");
await tolak("alat TIDAK bisa menghapus log _M", dev, "DELETE", `log/${FW}/CCCC3333_M`);
await tolak("alat TIDAK bisa menghapus log _P", dev, "DELETE", `log/${FW}/CCCC3333_P`);
await tolak("alat TIDAK bisa menghapus lewat PATCH root (null) pada log", dev, "PATCH", "", { [`log/${FW}/CCCC3333_M`]: null });
await tolak("alat TIDAK bisa menghapus unknown/{tgl}/{uid}", dev, "DELETE", `unknown/${FW}/ZZZZ0001`);
await tolak("alat TIDAK bisa menghapus device/events/{id}", dev, "DELETE", `device/events/${evId}`);
await tolak("alat TIDAK bisa menimpa device/events/{id} yang ada", dev, "PUT", `device/events/${evId}`, { ts: SV, jenis: "palsu" });
await tolak("alat TIDAK bisa menghapus device/status", dev, "DELETE", "device/status");
await tolak("alat TIDAK bisa menghapus device/ack/{id}", dev, "DELETE", "device/ack/cmd123");
await tolak("alat TIDAK bisa menulis null ke device/ack/{id}", dev, "PUT", "device/ack/cmd123", null);
await tolak("alat TIDAK bisa menulis attendance/{nis}/{tgl}/ket", dev, "PUT", `attendance/333/${FW}/ket`, "Izin");
await tolak("alat TIDAK bisa menulis attendance/{nis}/{tgl}/catatan", dev, "PUT", `attendance/333/${FW}/catatan`, "x");
await tolak("alat TIDAK bisa menulis ket lewat PATCH root", dev, "PATCH", "", { [`attendance/444/${FW}/ket`]: "Sakit" });
await tolak("alat TIDAK bisa menulis izin/{tgl}/{nis}", dev, "PUT", `izin/${FW}/333`, "Sakit");
await tolak("alat TIDAK bisa membuat node attendance baru berisi ket", dev, "PUT", `attendance/555/${FW}`, { masuk: "06:00:00", status: "Hadir", ket: "Izin" });
await tolak("alat TIDAK bisa menulis attendance dengan field asing", dev, "PUT", `attendance/555/${FW}`, { masuk: "06:00:00", status: "Hadir", rahasia: 1 });
await izin("alat tetap bisa MEMBUAT node tanggal baru secara utuh", dev, "PUT", `attendance/555/${FW}`, { masuk: "06:00:00", status: "Hadir" });
await tolak("alat TIDAK bisa menulis config/version", dev, "PUT", "config/version", 99);
await tolak("alat TIDAK bisa menulis device/inbox", dev, "PUT", "device/inbox/command", { id: "x", cmd: "sync", ts: 1 });

// ================================================================ PIKET (Tahap B: setiap tulisan piket WAJIB disertai log aktivitas pada update yang sama)
const HK = Math.floor((Date.now() + 25200000) / 86400000); // epoch-day WIB hari ini (sama dengan hari server)
const TGLN = new Date(HK * 86400000).toISOString().slice(0, 10); // kunci activity/{tgl}
const PERAN = new Map([[admin.uid, "admin"], [waka.uid, "waka"], [kepala.uid, "kepala"], [piket.uid, "piket"], [piket2.uid, "piket"]]);
const MZ = (t, n, id) => `izinMeta/${t}/${n}/${id}`;
const KETK = { S: "Sakit", I: "Izin", D: "Dispensasi" };
let nomorAct = 0;
const idAct = () => `a${Date.now().toString(36)}${(nomorAct++).toString(36)}`;
const entriAct = (u, aksi, o = {}) => ({
  uid: u.uid, peran: PERAN.get(u.uid), akunEmail: "akun@uji.test", ...(PERAN.get(u.uid) === "piket" ? { petugas: "Bu Rina" } : {}),
  aksi, detail: "uji", deviceId: "dev-uji-0001", deviceLabel: "Uji · Node", ts: SV, hariKe: HK, ...o,
});
/** { id, body }: activityLast + activity untuk u. `o.tanpa` = tidak menulis log; `o.last`/`o.entri` menimpa bidang; `o.lastId` menunjuk id lain. */
const act = (u, aksi, o = {}) => {
  const id = o.id ?? idAct();
  if (o.tanpa) return { id, body: {} };
  const last = { [`activityLast/${u.uid}`]: { id: o.lastId ?? id, ts: SV, tgl: TGLN, ...(o.last ?? {}) } };
  if (o.tanpaEntri) return { id, body: last }; // penanda ada, entri log TIDAK ada
  return { id, body: { ...last, [`activity/${TGLN}/${id}`]: entriAct(u, aksi, o.entri ?? {}) } };
};
const metaIz = (u, o = {}) => ({ lingkup: "harian", ket: "Sakit", keterangan: "Surat dokter RS Husada, diantar ayah", suratDiterima: true, petugas: "Bu Rina", oleh: u.uid, ts: SV, hariKe: HK, ...o });
const HT = "2026-10-20"; // tanggal data bebas (rules tidak mengikat tanggal ke hariKe)

/** Izin harian oleh piket: log + izin + attendance/ket + catatan + izinMeta(kunci "<idLog>_H") dalam SATU update. */
const harianBody = (u, t, n, ket = "Sakit", mo = {}, o = {}) => {
  const A = act(u, o.aksi ?? "izin-harian", o.act ?? {});
  const body = { ...A.body, [`izin/${t}/${n}`]: ket, [`attendance/${n}/${t}/ket`]: ket, [`attendance/${n}/${t}/catatan`]: "surat dokter" };
  if (!o.tanpaMeta) body[MZ(t, n, o.metaKey ?? `${A.id}_H`)] = metaIz(u, { ket, ...mo });
  return body;
};
const harian = (nama, who, t, n, ket, mo, harap, o) => uji(nama, who, "PATCH", "", harianBody(who, t, n, ket, mo, o), harap);
const sel = (n, j, k = "S", mapel) => ({ [`lessons/${HT}/XI IPS/absen/${n}/${j}`]: k, [`lessonsByStudent/${n}/${HT}/${j}`]: { k, ...(mapel ? { mapel } : {}) } });
/** Izin per jam oleh piket: log + sel + salinan + izinMeta(kunci "<idLog>_<kode>"). */
const jamBody = (u, n, jam, k = "S", mo = {}, o = {}) => {
  const A = act(u, o.aksi ?? "izin-jam", o.act ?? {});
  const body = { ...A.body, ...Object.assign({}, ...jam.map((j) => sel(n, j, k))) };
  if (!o.tanpaMeta) body[MZ(HT, n, o.metaKey ?? `${A.id}_${k}`)] = metaIz(u, { lingkup: "jam", jam: Object.fromEntries(jam.map((x, i) => [i, x])), ket: KETK[k] ?? "Sakit", keterangan: "Sakit lalu dijemput orang tua", ...mo });
  return body;
};
const jam = (nama, who, n, daftar, k, mo, harap, o) => uji(nama, who, "PATCH", "", jamBody(who, n, daftar, k, mo, o), harap);

seksi("PIKET — baca (hanya yang diperlukan)");
for (const pth of ["config/students", "config/schedule", "izin", "izinMeta", "lessons", "validasi", "discipline/rules", "discipline/settings", "piketRoster", "piketHarian", `log/${TGL}`, `attendance/111/${TGL}`, `staff/${piket.uid}`, `roles/${piket.uid}`, `activityLast/${piket.uid}`]) {
  await izin(`piket baca ${pth}`, piket, "GET", pth);
}
for (const pth of ["attendance", "attendance/111", "log", "profiles", "parents/111", "unknown", "device", "device/status", "device/events", "device/inbox", "config", "config/version",
  "discipline/records", "discipline/records/111", "discipline/recordMeta", "discipline/notes", "discipline/audit", "discipline/suggest", "discipline/levels", "discipline/remisi", "discipline/autoMap",
  "lessonsByStudent/111", "validasiByStudent/111", "staff", `roles/${admin.uid}`, "activity", `activity/${TGLN}`, `activityLast/${waka.uid}`, "piketAkun", "piketPerangkat", "sistem", "sistem/backupTerakhir"]) {
  await tolak(`piket TIDAK bisa baca ${pth}`, piket, "GET", pth);
}

seksi("LOG AKTIVITAS — node activity / activityLast (create-only, divalidasi ketat)");
{
  const e = (u, aksi, o) => entriAct(u, aksi, o);
  await izin("piket menulis log 'login' (tanpa petugas)", piket, "PUT", `activity/${TGLN}/${idAct()}`, e(piket, "login", { petugas: undefined }));
  await izin("piket menulis log 'pilih-petugas' (dengan petugas)", piket, "PUT", `activity/${TGLN}/${idAct()}`, e(piket, "pilih-petugas"));
  await izin("waka menulis log (tanpa petugas)", waka, "PUT", `activity/${TGLN}/${idAct()}`, e(waka, "validasi-alfa", { nis: "111" }));
  await izin("kepala menulis log", kepala, "PUT", `activity/${TGLN}/${idAct()}`, e(kepala, "pelanggaran"));
  await izin("admin menulis log", admin, "PUT", `activity/${TGLN}/${idAct()}`, e(admin, "logout"));
  const id1 = idAct();
  await izin("log valid + deviceNama + nis", piket, "PUT", `activity/${TGLN}/${id1}`, e(piket, "izin-harian", { nis: "111", deviceNama: "HP meja piket", detail: "x".repeat(300) }));
  await tolak("log yang sudah ada TIDAK bisa ditimpa", piket, "PUT", `activity/${TGLN}/${id1}`, e(piket, "izin-harian"));
  await tolak("log TIDAK bisa diubah satu field", piket, "PUT", `activity/${TGLN}/${id1}/detail`, "palsu");
  await tolak("log TIDAK bisa dihapus", piket, "DELETE", `activity/${TGLN}/${id1}`);
  await tolak("log TIDAK bisa dihapus oleh admin", admin, "DELETE", `activity/${TGLN}/${id1}`);
  await tolak("log TIDAK bisa dihapus oleh waka", waka, "DELETE", `activity/${TGLN}/${id1}`);
  const bad = (nama, o, who = piket, aksi = "izin-harian") => tolak(`log: ${nama} ditolak`, who, "PUT", `activity/${TGLN}/${idAct()}`, e(who, aksi, o));
  await bad("uid bukan pengguna", { uid: waka.uid });
  await bad("peran tidak sama dengan role sebenarnya", { peran: "waka" });
  await bad("peran asing", { peran: "superuser" });
  // isolasi lapisan 'peran = role sebenarnya': tanpa 'petugas' sehingga aturan petugas tidak ikut menolak
  await tolak("log: waka mengaku peran 'kepala' ditolak (hanya cocokkan-role yang menolak)", waka, "PUT", `activity/${TGLN}/${idAct()}`, e(waka, "validasi-alfa", { peran: "kepala" }));
  await tolak("log: admin mengaku peran 'waka' ditolak", admin, "PUT", `activity/${TGLN}/${idAct()}`, e(admin, "logout", { peran: "waka" }));
  await tolak("log: kepala mengaku peran 'admin' ditolak", kepala, "PUT", `activity/${TGLN}/${idAct()}`, e(kepala, "pelanggaran", { peran: "admin" }));
  await bad("piket tanpa nama petugas (aksi bukan login)", { petugas: undefined });
  await tolak("log: waka dengan 'petugas' ditolak", waka, "PUT", `activity/${TGLN}/${idAct()}`, e(waka, "validasi-alfa", { petugas: "Bu Rina" }));
  await bad("aksi tak dikenal", { aksi: "retas" });
  await bad("detail > 300 karakter", { detail: "x".repeat(301) });
  await bad("detail bukan teks", { detail: 5 });
  await bad("deviceId kosong", { deviceId: "" });
  await bad("deviceId > 64 karakter", { deviceId: "d".repeat(65) });
  await bad("deviceLabel > 100 karakter", { deviceLabel: "l".repeat(101) });
  await bad("deviceNama > 60 karakter", { deviceNama: "n".repeat(61) });
  await bad("akunEmail > 120 karakter", { akunEmail: "e".repeat(121) });
  await bad("nis bukan angka", { nis: "abc" });
  await bad("ts basi (bukan 'sekarang')", { ts: 1000 });
  await bad("ts masa depan", { ts: Date.now() + 3600_000 });
  await bad("hariKe kemarin", { hariKe: HK - 1 });
  await bad("hariKe besok", { hariKe: HK + 1 });
  await bad("hariKe pecahan", { hariKe: HK + 0.5 });
  await bad("field asing", { rahasia: 1 });
  await bad("tanpa deviceLabel", { deviceLabel: undefined });
  await tolak("log: tanggal salah pada kunci ditolak", piket, "PUT", `activity/14-10-2026/${idAct()}`, e(piket, "izin-harian"));
  await tolak("log: id berisi karakter terlarang ditolak", piket, "PUT", `activity/${TGLN}/a%20b`, e(piket, "izin-harian"));
  await tolak("ortu TIDAK bisa menulis log", ortu1, "PUT", `activity/${TGLN}/${idAct()}`, e(piket, "izin-harian", { uid: ortu1.uid }));
  await tolak("alat TIDAK bisa menulis log", dev, "PUT", `activity/${TGLN}/${idAct()}`, e(piket, "izin-harian", { uid: dev.uid }));
  await tolak("anonim TIDAK bisa menulis log", null, "PUT", `activity/${TGLN}/${idAct()}`, e(piket, "izin-harian"));
  await tolak("orang tanpa peran TIDAK bisa menulis log", orang, "PUT", `activity/${TGLN}/${idAct()}`, e(piket, "izin-harian", { uid: orang.uid }));
  // baca: hanya admin & waka
  await izin("admin baca activity", admin, "GET", "activity");
  await izin("waka baca activity", waka, "GET", `activity/${TGLN}`);
  await tolak("kepala TIDAK bisa baca activity", kepala, "GET", "activity");
  await tolak("ortu TIDAK bisa baca activity", ortu1, "GET", "activity");
  await tolak("alat TIDAK bisa baca activity", dev, "GET", "activity");
  await tolak("anonim TIDAK bisa baca activity", null, "GET", "activity");
  // activityLast
  const idL = idAct();
  await izin("activityLast milik sendiri (ts=now) ", piket, "PUT", `activityLast/${piket.uid}`, { id: idL, ts: SV, tgl: TGLN });
  await tolak("activityLast milik orang lain ditolak", piket, "PUT", `activityLast/${waka.uid}`, { id: idL, ts: SV, tgl: TGLN });
  await tolak("activityLast dengan ts basi ditolak", piket, "PUT", `activityLast/${piket.uid}`, { id: idL, ts: 1000, tgl: TGLN });
  await tolak("activityLast tanpa tgl ditolak", piket, "PUT", `activityLast/${piket.uid}`, { id: idL, ts: SV });
  await tolak("activityLast field asing ditolak", piket, "PUT", `activityLast/${piket.uid}`, { id: idL, ts: SV, tgl: TGLN, x: 1 });
  await tolak("activityLast id terlarang ditolak", piket, "PUT", `activityLast/${piket.uid}`, { id: "a b", ts: SV, tgl: TGLN });
  await tolak("ortu TIDAK bisa menulis activityLast", ortu1, "PUT", `activityLast/${ortu1.uid}`, { id: idL, ts: SV, tgl: TGLN });
  await tolak("alat TIDAK bisa menulis activityLast", dev, "PUT", `activityLast/${dev.uid}`, { id: idL, ts: SV, tgl: TGLN });
  await izin("admin baca activityLast piket", admin, "GET", `activityLast/${piket.uid}`);
  await izin("waka baca activityLast piket", waka, "GET", `activityLast/${piket.uid}`);
  await tolak("kepala TIDAK bisa baca activityLast piket", kepala, "GET", `activityLast/${piket.uid}`);
  await tolak("piket TIDAK bisa baca activityLast piket lain", piket, "GET", `activityLast/${piket2.uid}`);
}

seksi("PIKET — izin harian (Izin/Sakit/Dispensasi) + izinMeta + LOG WAJIB");
await harian("piket: Sakit seharian + izinMeta + log", piket, HT, "111", "Sakit", {}, "izin");
await harian("piket: Izin seharian", piket, HT, "222", "Izin", {}, "izin");
await harian("piket: Dispensasi seharian", piket, HT, "333", "Dispensasi", { keterangan: "Mewakili sekolah lomba MTQ kabupaten" }, "izin");
await cek("piket: izin tersimpan di izin/, attendance/ket dan izinMeta", waka, `izin/${HT}`, (j) => j?.["111"] === "Sakit" && j["222"] === "Izin" && j["333"] === "Dispensasi");
await cek("piket: log aktivitas tercatat (admin/waka dapat membaca) dengan petugas & perangkat", waka, `activity/${TGLN}`, (j) => Object.values(j ?? {}).some((x) => x.aksi === "izin-harian" && x.uid === piket.uid && x.petugas === "Bu Rina" && x.deviceId === "dev-uji-0001"));
// --- penegakan log (satu pelanggaran per uji)
await harian("piket: TANPA log aktivitas DITOLAK", piket, HT, "444", "Sakit", {}, "tolak", { act: { tanpa: true }, metaKey: "tanpaLog_H" });
await harian("piket: log dengan aksi salah (izin-jam utk harian) DITOLAK", piket, HT, "444", "Sakit", {}, "tolak", { aksi: "izin-jam" });
await harian("piket: log dengan aksi 'login' DITOLAK", piket, HT, "444", "Sakit", {}, "tolak", { aksi: "login" });
await harian("piket: activityLast.ts basi DITOLAK", piket, HT, "444", "Sakit", {}, "tolak", { act: { last: { ts: 1000 } } });
await harian("piket: activityLast menunjuk id log lain DITOLAK", piket, HT, "444", "Sakit", {}, "tolak", { act: { lastId: "tidakAda" } });
await harian("piket: log milik uid lain DITOLAK", piket, HT, "444", "Sakit", {}, "tolak", { act: { entri: { uid: waka.uid } } });
await harian("piket: log tanpa nama petugas DITOLAK", piket, HT, "444", "Sakit", {}, "tolak", { act: { entri: { petugas: undefined } } });
await harian("piket: log hariKe kemarin DITOLAK", piket, HT, "444", "Sakit", {}, "tolak", { act: { entri: { hariKe: HK - 1 } } });
await uji("piket: log valid tetapi TANPA izinMeta baru DITOLAK", piket, "PATCH", "", { ...act(piket, "izin-harian").body, [`izin/${HT}/444`]: "Sakit", [`attendance/444/${HT}/ket`]: "Sakit" }, "tolak");
await uji("piket: log valid + izinMeta LAMA (dipakai ulang) DITOLAK  [menutup celah izinMeta lama]", piket, "PATCH", "", { ...act(piket, "izin-harian").body, [`izin/${HT}/111`]: "Izin", [`attendance/111/${HT}/ket`]: "Izin" }, "tolak");
// ---- isolasi lapisan: (a) penanda log ada tetapi ENTRI log tidak ada; (b) meta lama dipakai pada SATU jalur saja
await harian("piket: activityLast ada tetapi ENTRI log tidak ada DITOLAK (harian)", piket, HT, "444", "Sakit", {}, "tolak", { act: { tanpaEntri: true } });
await uji("piket: HANYA izin/ + log baru, izinMeta hanya yang LAMA (111) DITOLAK", piket, "PATCH", "", { ...act(piket, "izin-harian").body, [`izin/${HT}/111`]: "Izin" }, "tolak");
await uji("piket: HANYA attendance/ket + log baru, izinMeta hanya yang LAMA DITOLAK", piket, "PATCH", "", { ...act(piket, "izin-harian").body, [`attendance/111/${HT}/ket`]: "Izin" }, "tolak");
await uji("piket: HANYA attendance/catatan + log baru, izinMeta hanya yang LAMA DITOLAK", piket, "PATCH", "", { ...act(piket, "izin-harian").body, [`attendance/111/${HT}/catatan`]: "catatan baru" }, "tolak");
await uji("piket: izinMeta TANPA log (tulis langsung) ditolak", piket, "PUT", MZ(HT, "555", "xyz_H"), metaIz(piket), "tolak");
await uji("piket: izinMeta dengan ts basi (log valid, tulis langsung) DITOLAK", piket, "PATCH", "", (() => { const A = act(piket, "izin-harian"); return { ...A.body, [MZ(HT, "555", `${A.id}_H`)]: metaIz(piket, { ts: 1000 }) }; })(), "tolak");
await uji("piket: izinMeta berkunci BUKAN awalan id log (log valid, tulis langsung) DITOLAK", piket, "PATCH", "", { ...act(piket, "izin-harian").body, [MZ(HT, "555", "bebas_H")]: metaIz(piket) }, "tolak");
await uji("piket: izinMeta valid + log valid (tulis langsung) DITERIMA", piket, "PATCH", "", (() => { const A = act(piket, "izin-harian"); return { ...A.body, [MZ(HT, "555", `${A.id}_H`)]: metaIz(piket) }; })(), "izin");
await harian("piket: izinMeta berkunci id log LAIN DITOLAK", piket, HT, "444", "Sakit", {}, "tolak", { metaKey: "idLama_H" });
await harian("piket: izinMeta dengan ts basi DITOLAK", piket, HT, "444", "Sakit", { ts: 1000 }, "tolak");
await harian("piket: izinMeta berkunci sufiks salah (_S) DITOLAK", piket, HT, "444", "Sakit", {}, "tolak", { metaKey: `${idAct()}_S` });
await uji("piket: hanya izin/ (tanpa log & meta) ditolak", piket, "PUT", `izin/${HT}/444`, "Sakit", "tolak");
await uji("piket: hanya attendance/ket (tanpa log & meta) ditolak", piket, "PUT", `attendance/444/${HT}/ket`, "Izin", "tolak");
await uji("piket: hanya izinMeta (tanpa log) ditolak", piket, "PUT", MZ(HT, "444", "xx_H"), metaIz(piket), "tolak");
await harian("piket: ket 'Alfa' ditolak", piket, HT, "444", "Alfa", { ket: "Sakit" }, "tolak");
await harian("piket: keterangan < 3 karakter ditolak", piket, HT, "444", "Sakit", { keterangan: "ab" }, "tolak");
await harian("piket: keterangan > 200 karakter ditolak", piket, HT, "444", "Sakit", { keterangan: "x".repeat(201) }, "tolak");
await harian("piket: suratDiterima bukan boolean ditolak", piket, HT, "444", "Sakit", { suratDiterima: "ya" }, "tolak");
await harian("piket: petugas kosong ditolak", piket, HT, "444", "Sakit", { petugas: "" }, "tolak");
await harian("piket: meta.oleh bukan pengguna ditolak", piket, HT, "444", "Sakit", { oleh: waka.uid }, "tolak");
await harian("piket: meta tanpa hariKe ditolak", piket, HT, "444", "Sakit", { hariKe: undefined }, "tolak");
await harian("piket: field asing pada meta ditolak", piket, HT, "444", "Sakit", { asing: 1 }, "tolak");
await harian("piket: lingkup 'jam' tanpa daftar jam ditolak", piket, HT, "444", "Sakit", { lingkup: "jam" }, "tolak");
await harian("piket: lingkup 'harian' membawa daftar jam ditolak", piket, HT, "444", "Sakit", { jam: { 0: 4 } }, "tolak");
await harian("piket: hariKe tepat N=2 hari lalu DITERIMA", piket, "2026-10-21", "444", "Sakit", { hariKe: HK - 2 }, "izin");
await harian("piket: hariKe N+1=3 hari lalu ditolak", piket, "2026-10-21", "555", "Sakit", { hariKe: HK - 3 }, "tolak");
await harian("piket: hariKe jauh lampau ditolak", piket, "2026-10-21", "555", "Sakit", { hariKe: HK - 30 }, "tolak");
await harian("piket: Izin terencana 7 hari ke depan DITERIMA", piket, "2026-10-22", "444", "Izin", { hariKe: HK + 7 }, "izin");
await harian("piket: Dispensasi 7 hari ke depan DITERIMA", piket, "2026-10-22", "555", "Dispensasi", { hariKe: HK + 7 }, "izin");
await harian("piket: 8 hari ke depan ditolak", piket, "2026-10-23", "444", "Izin", { hariKe: HK + 8 }, "tolak");
await harian("piket: Sakit untuk hari depan ditolak (hanya Izin/Dispensasi)", piket, "2026-10-23", "444", "Sakit", { hariKe: HK + 1 }, "tolak");
await harian("piket: hariKe pecahan ditolak", piket, "2026-10-23", "444", "Izin", { hariKe: HK + 0.5 }, "tolak");
// validasi Alfa sudah ada pada TGL untuk 111 & 222 (uji sebelumnya)
await harian("piket: DITOLAK bila validasi Alfa sudah ada (111)", piket, TGL, "111", "Sakit", {}, "tolak");
await uji("piket: DITOLAK menghapus ket bila validasi Alfa ada", piket, "PATCH", "", { ...act(piket, "hapus-izin").body, [`izin/${TGL}/111`]: null, [`attendance/111/${TGL}/ket`]: null }, "tolak");
await izin("waka tetap bisa mengubah izin walau ada validasi", waka, "PUT", `izin/${TGL}/111`, "Sakit");
// hapus keterangan oleh piket: wajib log 'hapus-izin'
await uji("piket: hapus ket TANPA log ditolak", piket, "PATCH", "", { [`izin/${HT}/333`]: null, [`attendance/${HT}/333/ket`]: null, [`attendance/${HT}/333/catatan`]: null }, "tolak");
await uji("piket: hapus ket dengan log aksi 'izin-harian' (salah) ditolak", piket, "PATCH", "", { ...act(piket, "izin-harian").body, [`izin/${HT}/333`]: null, [`attendance/${HT}/333/ket`]: null }, "tolak");
await uji("piket menghapus ket miliknya (log 'hapus-izin', tanpa validasi)", piket, "PATCH", "", { ...act(piket, "hapus-izin").body, [`izin/${HT}/333`]: null, [`attendance/${HT}/333/ket`]: null, [`attendance/${HT}/333/catatan`]: null }, "izin");
// ---- isolasi: hapus HANYA izin/ (tanpa menyentuh attendance) wajib log 'hapus-izin'
await uji("piket: hapus HANYA izin/ TANPA log ditolak", piket, "PATCH", "", { [`izin/${HT}/222`]: null }, "tolak");
await uji("piket: hapus HANYA izin/ dengan log aksi salah ('izin-jam') ditolak", piket, "PATCH", "", { ...act(piket, "izin-jam").body, [`izin/${HT}/222`]: null }, "tolak");
await uji("piket: hapus HANYA izin/ dengan penanda log tanpa entri ditolak", piket, "PATCH", "", { ...act(piket, "hapus-izin", { tanpaEntri: true }).body, [`izin/${HT}/222`]: null }, "tolak");
// ---- entri log LAMA tidak boleh dipakai ulang: activityLast baru (ts=now) menunjuk entri lama milik sendiri yang TIDAK ditulis ulang
{
  const lama = await http("GET", `activity/${TGLN}`, { token: waka.token });
  const [idLama] = Object.entries(lama.json ?? {}).find(([, x]) => x.uid === piket.uid && x.aksi === "izin-harian") ?? [];
  await uji("piket: pakai ulang entri log LAMA ('izin-harian') untuk izin harian baru ditolak", piket, "PATCH", "", {
    [`activityLast/${piket.uid}`]: { id: idLama, ts: SV, tgl: TGLN },
    [`izin/${HT}/444`]: "Sakit", [`attendance/444/${HT}/ket`]: "Sakit",
    [MZ(HT, "444", `${idLama}_H`)]: metaIz(piket),
  }, "tolak");
  await uji("piket: pakai ulang entri log LAMA untuk hapus izin ('hapus-izin' lama tidak ada) ditolak", piket, "PATCH", "", {
    [`activityLast/${piket.uid}`]: { id: idLama, ts: SV, tgl: TGLN }, [`izin/${HT}/222`]: null,
  }, "tolak");
}
await tolak("piket TIDAK bisa menghapus izinMeta", piket, "DELETE", MZ(HT, "111", "harian"));
await izin("waka menulis izinMeta (entri waka, tanpa log)", waka, "PUT", MZ(HT, "555", "waka1"), metaIz(waka, { petugas: "Waka Uji" }));
await tolak("piket TIDAK bisa menimpa entri izinMeta milik waka", piket, "PUT", MZ(HT, "555", "waka1"), metaIz(piket));
await tolak("piket TIDAK bisa menulis attendance status", piket, "PUT", `attendance/111/${HT}/status`, "Hadir");
await tolak("piket TIDAK bisa menulis attendance masuk", piket, "PUT", `attendance/111/${HT}/masuk`, "07:00:00");
await tolak("piket TIDAK bisa menulis attendance pulang", piket, "PUT", `attendance/111/${HT}/pulang`, "15:00:00");
await tolak("piket TIDAK bisa menulis node attendance utuh", piket, "PUT", `attendance/111/${HT}`, { ket: "Sakit" });
await tolak("piket TIDAK bisa menulis log (tap)", piket, "PUT", `log/${HT}/AAAA1111_M`, { jam: "07:00:00", nis: "111", status: "Hadir" });

seksi("PIKET — presensi per jam (S/I/D saja; A terkunci) + LOG WAJIB");
await jam("piket: sel S jam 4-9 + izinMeta + log (pulang awal)", piket, "666", [4, 5, 6, 7, 8, 9], "S", {}, "izin");
await jam("piket: sel I + meta + log", piket, "777", [2], "I", {}, "izin");
await jam("piket: sel D + meta + log (Dispensasi jam 3-4)", piket, "888", [3, 4], "D", { keterangan: "Latihan lomba pidato" }, "izin");
await cek("piket: sel tersimpan di lessons dan salinan lessonsByStudent", waka, `lessonsByStudent/666/${HT}`, (j) => j?.["4"]?.k === "S" && j["9"]?.k === "S");
await jam("piket: sel TANPA log ditolak", piket, "666", [2], "S", {}, "tolak", { act: { tanpa: true }, metaKey: "x_S" });
await jam("piket: sel dengan log aksi salah ('izin-harian') ditolak", piket, "666", [2], "S", {}, "tolak", { aksi: "izin-harian" });
await jam("piket: sel dengan activityLast basi ditolak", piket, "666", [2], "S", {}, "tolak", { act: { last: { ts: 1000 } } });
await jam("piket: sel dengan log tanpa petugas ditolak", piket, "666", [2], "S", {}, "tolak", { act: { entri: { petugas: undefined } } });
await jam("piket: sel + izinMeta berkunci id LAIN ditolak", piket, "666", [2], "S", {}, "tolak", { metaKey: "lama_S" });
await jam("piket: sel kode S dengan izinMeta berkunci _I (sufiks salah) ditolak", piket, "666", [2], "S", {}, "tolak", { metaKey: `${idAct()}_I` });
// 666 sudah punya izinMeta LAMA pada HT: log baru tanpa meta baru TIDAK boleh membuka penulisan sel (celah 'sel tanpa izinMeta baru')
await jam("piket: sel + log baru tetapi izinMeta hanya yang LAMA (666) ditolak  [menutup celah]", piket, "666", [2], "S", {}, "tolak", { tanpaMeta: true });
await jam("piket: activityLast ada tetapi ENTRI log tidak ada DITOLAK (per jam)", piket, "444", [2], "S", {}, "tolak", { act: { tanpaEntri: true } });
await uji("piket: HANYA sel (tanpa salinan) + log baru, izinMeta hanya yang LAMA (666) DITOLAK", piket, "PATCH", "", { ...act(piket, "izin-jam").body, [`lessons/${HT}/XI IPS/absen/666/3`]: "S" }, "tolak");
await uji("piket: HANYA salinan (tanpa sel) + log baru, izinMeta hanya yang LAMA (666) DITOLAK", piket, "PATCH", "", { ...act(piket, "izin-jam").body, [`lessonsByStudent/666/${HT}/3`]: { k: "S" } }, "tolak");
await uji("piket: HANYA sel S (tanpa salinan) + log + meta baru DITERIMA", piket, "PATCH", "", (() => { const A = act(piket, "izin-jam"); return { ...A.body, [`lessons/${HT}/XI IPS/absen/666/1`]: "S", [MZ(HT, "666", `${A.id}_S`)]: metaIz(piket, { lingkup: "jam", jam: { 0: 1 }, ket: "Sakit" }) }; })(), "izin");
await uji("piket: HANYA sel (PUT tunggal, tanpa log/meta) ditolak", piket, "PUT", `lessons/${HT}/XI IPS/absen/444/3`, "S", "tolak");
await uji("piket: HANYA salinan (PUT tunggal, tanpa log/meta) ditolak", piket, "PUT", `lessonsByStudent/444/${HT}/3`, { k: "S" }, "tolak");
await uji("piket: sel A DITOLAK", piket, "PATCH", "", jamBody(piket, "666", [2], "A"), "tolak");
await uji("piket: HANYA sel (tanpa salinan) berkode A + log + meta valid DITOLAK", piket, "PATCH", "", (() => { const A = act(piket, "izin-jam"); return { ...A.body, [`lessons/${HT}/XI IPS/absen/666/2`]: "A", [MZ(HT, "666", `${A.id}_A`)]: metaIz(piket, { lingkup: "jam", jam: { 0: 2 } }) }; })(), "tolak");
await uji("piket: HANYA salinan k=A (tanpa sel) + log + meta valid DITOLAK", piket, "PATCH", "", (() => { const A = act(piket, "izin-jam"); return { ...A.body, [`lessonsByStudent/666/${HT}/2`]: { k: "A" }, [MZ(HT, "666", `${A.id}_A`)]: metaIz(piket, { lingkup: "jam", jam: { 0: 2 } }) }; })(), "tolak");
await uji("piket: kode 'B' DITOLAK", piket, "PUT", `lessons/${HT}/XI IPS/absen/666/1`, "B", "tolak");
await jam("piket: jam 10 ditolak", piket, "666", [10], "S", {}, "tolak");
await izin("waka mengisi sel A (nis 999 jam 2) beserta salinannya", waka, "PATCH", "", sel("999", 2, "A", "Matematika"));
await jam("piket TIDAK bisa mengubah sel A (A -> I)", piket, "999", [2], "I", { ket: "Izin" }, "tolak");
await jam("piket TIDAK bisa menimpa sel A dengan D", piket, "999", [2], "D", { ket: "Dispensasi" }, "tolak");
await uji("piket TIDAK bisa menghapus sel A (sel + salinan, log 'izin-jam')", piket, "PATCH", "", { ...act(piket, "izin-jam").body, [`lessons/${HT}/XI IPS/absen/999/2`]: null, [`lessonsByStudent/999/${HT}/2`]: null }, "tolak");
await uji("piket TIDAK bisa menghapus sel A (hanya sumber)", piket, "DELETE", `lessons/${HT}/XI IPS/absen/999/2`, undefined, "tolak");
await uji("piket: HANYA salinan A diubah ke I (log+meta baru) DITOLAK", piket, "PATCH", "", (() => { const A = act(piket, "izin-jam"); return { ...A.body, [`lessonsByStudent/999/${HT}/2`]: { k: "I" }, [MZ(HT, "999", `${A.id}_I`)]: metaIz(piket, { lingkup: "jam", jam: { 0: 2 }, ket: "Izin" }) }; })(), "tolak");
await uji("piket: HANYA sel A diubah ke I (log+meta baru) DITOLAK", piket, "PATCH", "", (() => { const A = act(piket, "izin-jam"); return { ...A.body, [`lessons/${HT}/XI IPS/absen/999/2`]: "I", [MZ(HT, "999", `${A.id}_I`)]: metaIz(piket, { lingkup: "jam", jam: { 0: 2 }, ket: "Izin" }) }; })(), "tolak");
await cek("sel A milik waka tetap utuh setelah semua upaya piket", waka, `lessons/${HT}/XI IPS/absen/999`, (j) => j?.["2"] === "A");
await uji("piket menghapus sel S miliknya (kembali hadir) dengan log izin-jam tanpa meta", piket, "PATCH", "", { ...act(piket, "izin-jam").body, [`lessons/${HT}/XI IPS/absen/666/9`]: null, [`lessonsByStudent/666/${HT}/9`]: null }, "izin");
await uji("piket menghapus sel S TANPA log ditolak", piket, "PATCH", "", { [`lessons/${HT}/XI IPS/absen/666/8`]: null, [`lessonsByStudent/666/${HT}/8`]: null }, "tolak");
await izin("waka menimpa sel S/I/D piket menjadi A", waka, "PATCH", "", sel("666", 4, "A", "TI"));
await tolak("piket TIDAK bisa menulis meta mapel/guru", piket, "PUT", `lessons/${HT}/XI IPS/meta/3`, { mapel: "TI" });
await tolak("piket TIDAK bisa menulis oleh/ts kelas", piket, "PUT", `lessons/${HT}/XI IPS/oleh`, piket.uid);
await tolak("piket TIDAK bisa menulis node kelas utuh", piket, "PUT", `lessons/${HT}/XI IPS`, { absen: { 111: { 1: "S" } } });
// ================================================================ v2.3.1 — PRESENSI PER JAM: piket boleh memberi A (Alfa) HANYA hari ini
seksi("PER JAM v2.3.1 — piket A hari ini; penanda pengisi absenOleh; A milik waka terkunci");
const AJ = "XI IPS";
const NIS_AJ = ["5101", "5102", "5103", "5104", "5105", "5106", "5107", "5108", "5109", "5110", "5111", "5112", "5113", "5114", "5115", "5116", "5117", "5118", "5119", "5120", "5121", "5122"];
await http("PATCH", "", { owner: true, body: {
  ...Object.fromEntries(NIS_AJ.map((n) => [`siswaKelas/${n}`, AJ])),
  [`attendance/5110/${HT}/ket`]: "Sakit", [`izin/${HT}/5110`]: "Sakit", // siswa berketerangan harian
  // A milik waka (tanpa penanda = data lama) dan A milik piket yang diisi KEMARIN (info.hariKe = kemarin)
  [`lessons/${HT}/${AJ}/absen/5111/1`]: "A", [`lessonsByStudent/5111/${HT}/1`]: { k: "A" },
  [`lessons/${HT}/${AJ}/absen/5112/1`]: "A", [`lessons/${HT}/${AJ}/absenOleh/5112/1`]: "waka", [`lessonsByStudent/5112/${HT}/1`]: { k: "A" },
  [`lessons/${HT}/${AJ}/absen/5113/1`]: "A", [`lessons/${HT}/${AJ}/absenOleh/5113/1`]: "piket", [`lessons/${HT}/${AJ}/absenInfo/5113/1`]: { petugas: "Bu Rina", ts: 1000, hariKe: HK - 1 }, [`lessonsByStudent/5113/${HT}/1`]: { k: "A" },
  [`lessons/${HT}/${AJ}/absen/5114/1`]: "S", [`lessonsByStudent/5114/${HT}/1`]: { k: "S" }, // S milik siapa pun: dapat diganti A hari ini
  // INFO BASI: waka menimpa A piket dengan A miliknya (penanda 'waka') tetapi info hari ini TERTINGGAL; rules tidak memaksa waka menghapus info
  [`lessons/${HT}/${AJ}/absen/5119/1`]: "A", [`lessons/${HT}/${AJ}/absenOleh/5119/1`]: "waka", [`lessons/${HT}/${AJ}/absenInfo/5119/1`]: { petugas: "Bu Rina", ts: 1000, hariKe: HK }, [`lessonsByStudent/5119/${HT}/1`]: { k: "A" },
  [`lessons/${HT}/${AJ}/absen/5120/1`]: "A", [`lessons/${HT}/${AJ}/absenOleh/5120/1`]: "waka", [`lessons/${HT}/${AJ}/absenInfo/5120/1`]: { petugas: "Bu Rina", ts: 1000, hariKe: HK }, // tanpa salinan
  [`lessons/${HT}/${AJ}/absen/5121/1`]: "A", [`lessons/${HT}/${AJ}/absenOleh/5121/1`]: "piket", [`lessons/${HT}/${AJ}/absenInfo/5121/1`]: { petugas: "Bu Rina", ts: 1000, hariKe: HK - 1 }, // piket KEMARIN, tanpa salinan
  [`lessons/${HT}/${AJ}/absen/5122/1`]: "A", [`lessons/${HT}/${AJ}/absenOleh/5122/1`]: "piket", [`lessons/${HT}/${AJ}/absenInfo/5122/1`]: { petugas: "Bu Rina", ts: 1000, hariKe: HK }, // piket hari ini, tanpa salinan
}});
const aSet = (u, nis, jam, o = {}) => {
  const A = act(u, o.aksi ?? "alfa-jam", o.act ?? {});
  const t = o.tgl ?? HT;
  const body = { ...A.body };
  if (!o.tanpaSel) body[`lessons/${t}/${AJ}/absen/${nis}/${jam}`] = o.kode ?? "A";
  if (!o.tanpaMarker) body[`lessons/${t}/${AJ}/absenOleh/${nis}/${jam}`] = o.marker ?? "piket";
  if (!o.tanpaInfo) body[`lessons/${t}/${AJ}/absenInfo/${nis}/${jam}`] = { petugas: "Bu Rina", ts: SV, hariKe: HK, ...(o.info ?? {}) };
  if (!o.tanpaSalinan) body[`lessonsByStudent/${nis}/${t}/${jam}`] = { k: o.kodeSalinan ?? "A" };
  return { ...body, ...(o.tambah ?? {}) };
};
const aUji = (nama, who, nis, jam, harap, o) => uji(nama, who, "PATCH", "", aSet(who, nis, jam, o), harap);

// ---- piket SET A
await aUji("alfa-jam: piket set A hari ini (sel + penanda piket + info + salinan + log) DITERIMA", piket, "5101", 1, "izin");
await cek("alfa-jam: penanda 'piket' dan info tersimpan, hariKe = hari ini", waka, `lessons/${HT}/${AJ}`, (j) => j?.absenOleh?.["5101"]?.["1"] === "piket" && j.absenInfo?.["5101"]?.["1"]?.hariKe === HK && j.absen?.["5101"]?.["1"] === "A");
await aUji("alfa-jam: set A KEMARIN (hariKe info = kemarin) DITOLAK", piket, "5102", 1, "tolak", { info: { hariKe: HK - 1 } });
await aUji("alfa-jam: set A BESOK (hariKe info = besok) DITOLAK", piket, "5102", 1, "tolak", { info: { hariKe: HK + 1 } });
await aUji("alfa-jam: set A hariKe info bukan angka DITOLAK", piket, "5102", 1, "tolak", { info: { hariKe: "hari ini" } });
await aUji("alfa-jam: set A hariKe info pecahan DITOLAK", piket, "5102", 1, "tolak", { info: { hariKe: HK + 0.5 } });
await aUji("alfa-jam: set A TANPA info (hariKe tak terbukti) DITOLAK", piket, "5102", 1, "tolak", { tanpaInfo: true });
await aUji("alfa-jam: set A TANPA penanda DITOLAK", piket, "5102", 1, "tolak", { tanpaMarker: true });
await aUji("alfa-jam: set A dengan penanda 'waka' DITOLAK (penanda palsu)", piket, "5102", 1, "tolak", { marker: "waka" });
await aUji("alfa-jam: set A dengan penanda liar ('admin') DITOLAK", piket, "5102", 1, "tolak", { marker: "admin" });
await aUji("alfa-jam: set A TANPA log aktivitas DITOLAK", piket, "5102", 1, "tolak", { act: { tanpa: true } });
await aUji("alfa-jam: set A dengan log aksi 'izin-jam' DITOLAK", piket, "5102", 1, "tolak", { aksi: "izin-jam" });
await aUji("alfa-jam: set A dengan penanda log TANPA entri DITOLAK", piket, "5102", 1, "tolak", { act: { tanpaEntri: true } });
await aUji("alfa-jam: info ts bukan waktu server DITOLAK", piket, "5102", 1, "tolak", { info: { ts: 12345 } });
await aUji("alfa-jam: info petugas > 60 karakter DITOLAK", piket, "5102", 1, "tolak", { info: { petugas: "p".repeat(61) } });
await aUji("alfa-jam: info petugas kosong DITOLAK", piket, "5102", 1, "tolak", { info: { petugas: "" } });
await aUji("alfa-jam: info dengan field asing DITOLAK", piket, "5102", 1, "tolak", { info: { rahasia: 1 } });
await aUji("alfa-jam: info TANPA hariKe DITOLAK", piket, "5102", 1, "tolak", { info: { hariKe: undefined } });
await aUji("alfa-jam: HANYA salinan A (tanpa sel/penanda/info) DITOLAK", piket, "5102", 1, "tolak", { tanpaSel: true, tanpaMarker: true, tanpaInfo: true });
await aUji("alfa-jam: set A pada siswa BERKETERANGAN harian (Sakit) DITOLAK", piket, "5110", 1, "tolak");
await aUji("alfa-jam: kode 'B' DITOLAK", piket, "5102", 1, "tolak", { kode: "B", kodeSalinan: "B" });
await aUji("alfa-jam: A pada jam 0 DITOLAK", piket, "5102", 0, "tolak");
await aUji("alfa-jam: A pada siswa tanpa indeks siswaKelas (salinan tak dapat diverifikasi) DITOLAK", piket, "5999", 1, "tolak");
await uji("alfa-jam: sel A hari ini TANPA salinan (PATCH sel+penanda+info+log) DITERIMA seperti S/I/D", piket, "PATCH", "", aSet(piket, "5103", 2, { tanpaSalinan: true }), "izin");
await uji("alfa-jam: PUT tunggal sel A (tanpa log/penanda) DITOLAK", piket, "PUT", `lessons/${HT}/${AJ}/absen/5102/3`, "A", "tolak");

// ---- penanda/info ditulis sendirian atau palsu
await uji("alfa-jam: piket menulis penanda 'piket' saja pada sel A milik WAKA (mencuri) DITOLAK", piket, "PATCH", "", { ...act(piket, "alfa-jam").body, [`lessons/${HT}/${AJ}/absenOleh/5112/1`]: "piket" }, "tolak");
await uji("alfa-jam: piket menghapus penanda sel A milik WAKA (sel tetap) DITOLAK", piket, "PATCH", "", { ...act(piket, "alfa-jam").body, [`lessons/${HT}/${AJ}/absenOleh/5112/1`]: null }, "tolak");
await uji("alfa-jam: piket menulis info saja pada sel A milik waka DITOLAK", piket, "PATCH", "", { ...act(piket, "alfa-jam").body, [`lessons/${HT}/${AJ}/absenInfo/5112/1`]: { petugas: "Bu Rina", ts: SV, hariKe: HK } }, "tolak");
await tolak("alfa-jam: piket menulis penanda dengan PUT tunggal DITOLAK", piket, "PUT", `lessons/${HT}/${AJ}/absenOleh/5112/2`, "piket");
await tolak("alfa-jam: ortu TIDAK menulis penanda", ortu1, "PUT", `lessons/${HT}/${AJ}/absenOleh/5112/2`, "waka");
await tolak("alfa-jam: penanda bernilai liar ditolak (waka; sel jam 1 ADA, jadi hanya .validate penanda yang menolak)", waka, "PUT", `lessons/${HT}/${AJ}/absenOleh/5112/1`, "admin");
await tolak("alfa-jam: penanda TANPA sel (waka) ditolak", waka, "PUT", `lessons/${HT}/${AJ}/absenOleh/5112/9`, "waka");
await tolak("alfa-jam: field asing di bawah penanda ditolak", waka, "PUT", `lessons/${HT}/${AJ}/absenOleh/5112/1/x`, "waka");

// ---- piket ubah/hapus A MILIKNYA (hari ini)
await uji("alfa-jam: piket mengganti A miliknya (hari ini) menjadi I dengan izinMeta DITERIMA", piket, "PATCH", "", (() => {
  const A = act(piket, "izin-jam");
  return { ...A.body, [`lessons/${HT}/${AJ}/absen/5101/1`]: "I", [`lessons/${HT}/${AJ}/absenOleh/5101/1`]: "piket", [`lessons/${HT}/${AJ}/absenInfo/5101/1`]: null, [`lessonsByStudent/5101/${HT}/1`]: { k: "I" }, [MZ(HT, "5101", `${A.id}_I`)]: metaIz(piket, { lingkup: "jam", ket: "Izin", jam: { 0: 1 } }) };
})(), "izin");
await aUji("alfa-jam: piket mengisi A lagi pada sel yang tadi diganti I (hari ini) DITERIMA", piket, "5101", 1, "izin");
await uji("alfa-jam: piket mengganti A miliknya menjadi I TANPA izinMeta DITOLAK", piket, "PATCH", "", { ...act(piket, "izin-jam").body, [`lessons/${HT}/${AJ}/absen/5101/1`]: "I", [`lessonsByStudent/5101/${HT}/1`]: { k: "I" } }, "tolak");
await uji("alfa-jam: piket menghapus A miliknya TANPA log DITOLAK", piket, "PATCH", "", { [`lessons/${HT}/${AJ}/absen/5101/1`]: null, [`lessons/${HT}/${AJ}/absenOleh/5101/1`]: null, [`lessons/${HT}/${AJ}/absenInfo/5101/1`]: null, [`lessonsByStudent/5101/${HT}/1`]: null }, "tolak");
await uji("alfa-jam: piket menghapus A miliknya dengan log aksi 'izin-jam' DITOLAK", piket, "PATCH", "", { ...act(piket, "izin-jam").body, [`lessons/${HT}/${AJ}/absen/5101/1`]: null, [`lessons/${HT}/${AJ}/absenOleh/5101/1`]: null, [`lessons/${HT}/${AJ}/absenInfo/5101/1`]: null, [`lessonsByStudent/5101/${HT}/1`]: null }, "tolak");
await uji("alfa-jam: piket menghapus A miliknya TANPA menghapus penanda DITOLAK", piket, "PATCH", "", { ...act(piket, "alfa-jam").body, [`lessons/${HT}/${AJ}/absen/5101/1`]: null, [`lessons/${HT}/${AJ}/absenInfo/5101/1`]: null, [`lessonsByStudent/5101/${HT}/1`]: null }, "tolak");
await uji("alfa-jam: piket menghapus A miliknya (sel + penanda + info + salinan + log 'alfa-jam') DITERIMA", piket, "PATCH", "", { ...act(piket, "alfa-jam").body, [`lessons/${HT}/${AJ}/absen/5101/1`]: null, [`lessons/${HT}/${AJ}/absenOleh/5101/1`]: null, [`lessons/${HT}/${AJ}/absenInfo/5101/1`]: null, [`lessonsByStudent/5101/${HT}/1`]: null }, "izin");
await cek("alfa-jam: sel, penanda, dan info ikut hilang", waka, `lessons/${HT}/${AJ}`, (j) => !j?.absen?.["5101"]?.["1"] && !j?.absenOleh?.["5101"]?.["1"] && !j?.absenInfo?.["5101"]?.["1"]);
await uji("alfa-jam: piket mengisi A (5104) lalu menghapus sel saja", piket, "PATCH", "", aSet(piket, "5104", 1), "izin");
await uji("alfa-jam: piket menghapus sel A + penanda + info miliknya TANPA menyentuh salinan DITERIMA (tidak ada keharusan salinan, seperti S/I/D)", piket, "PATCH", "", { ...act(piket, "alfa-jam").body, [`lessons/${HT}/${AJ}/absen/5104/1`]: null, [`lessons/${HT}/${AJ}/absenOleh/5104/1`]: null, [`lessons/${HT}/${AJ}/absenInfo/5104/1`]: null }, "izin");

// ---- A milik WAKA / tanpa penanda / A piket yang diisi KEMARIN: terkunci bagi piket
const hapusA = (nis, aksi = "alfa-jam") => ({ ...act(piket, aksi).body, [`lessons/${HT}/${AJ}/absen/${nis}/1`]: null, [`lessons/${HT}/${AJ}/absenOleh/${nis}/1`]: null, [`lessons/${HT}/${AJ}/absenInfo/${nis}/1`]: null, [`lessonsByStudent/${nis}/${HT}/1`]: null });
const ubahAkeI = (nis) => { const A = act(piket, "izin-jam"); return { ...A.body, [`lessons/${HT}/${AJ}/absen/${nis}/1`]: "I", [`lessons/${HT}/${AJ}/absenOleh/${nis}/1`]: "piket", [`lessonsByStudent/${nis}/${HT}/1`]: { k: "I" }, [MZ(HT, nis, `${A.id}_I`)]: metaIz(piket, { lingkup: "jam", ket: "Izin", jam: { 0: 1 } }) }; };
for (const [nis, ket] of [["5112", "A milik WAKA (penanda 'waka')"], ["5111", "A TANPA penanda (data lama = waka)"], ["5113", "A milik piket yang diisi KEMARIN"]]) {
  await uji(`alfa-jam: piket menghapus ${ket} DITOLAK`, piket, "PATCH", "", hapusA(nis), "tolak");
  await uji(`alfa-jam: piket menghapus ${ket} (log 'izin-jam') DITOLAK`, piket, "PATCH", "", hapusA(nis, "izin-jam"), "tolak");
  await uji(`alfa-jam: piket mengganti ${ket} menjadi I DITOLAK`, piket, "PATCH", "", ubahAkeI(nis), "tolak");
  await uji(`alfa-jam: piket menimpa ${ket} dengan A baru DITOLAK`, piket, "PATCH", "", aSet(piket, nis, 1), "tolak");
  await uji(`alfa-jam: piket HANYA salinan ${ket} dihapus DITOLAK`, piket, "PATCH", "", { ...act(piket, "alfa-jam").body, [`lessonsByStudent/${nis}/${HT}/1`]: null }, "tolak");
  await uji(`alfa-jam: piket HANYA sel ${ket} dihapus DITOLAK`, piket, "PATCH", "", { ...act(piket, "alfa-jam").body, [`lessons/${HT}/${AJ}/absen/${nis}/1`]: null }, "tolak");
}
await cek("alfa-jam: A milik waka / piket-kemarin tetap utuh", waka, `lessons/${HT}/${AJ}/absen`, (j) => j?.["5111"]?.["1"] === "A" && j?.["5112"]?.["1"] === "A" && j?.["5113"]?.["1"] === "A");
// S -> A pada hari yang sama (koreksi piket sendiri) boleh, walau sel S diisi waka
await uji("alfa-jam: piket mengganti sel S (milik siapa pun) menjadi A hari ini DITERIMA", piket, "PATCH", "", aSet(piket, "5114", 1), "izin");
await uji("alfa-jam: piket mengganti sel S menjadi A KEMARIN DITOLAK", piket, "PATCH", "", aSet(piket, "5115", 1, { info: { hariKe: HK - 1 } }), "tolak");

// ---- waka: menimpa/menghapus apa pun, mengeset penanda "waka"
const wakaTulis = (nis, jam, kode, o = {}) => ({ [`lessons/${HT}/${AJ}/absen/${nis}/${jam}`]: kode, [`lessons/${HT}/${AJ}/absenOleh/${nis}/${jam}`]: kode ? (o.marker ?? "waka") : null, [`lessons/${HT}/${AJ}/absenInfo/${nis}/${jam}`]: null, [`lessonsByStudent/${nis}/${HT}/${jam}`]: kode ? { k: kode } : null, ...(o.tambah ?? {}) });
await uji("alfa-jam: waka menimpa A milik piket (5114) menjadi I dengan penanda 'waka' DITERIMA", waka, "PATCH", "", wakaTulis("5114", 1, "I"), "izin");
await cek("alfa-jam: penanda jadi 'waka', info Alfa hilang", piket, `lessons/${HT}/${AJ}`, (j) => j?.absenOleh?.["5114"]?.["1"] === "waka" && !j?.absenInfo?.["5114"]?.["1"] && j.absen?.["5114"]?.["1"] === "I");
await uji("alfa-jam: waka menimpa A piket dengan A baru (penanda 'waka') DITERIMA", waka, "PATCH", "", aSet(waka, "5103", 2, { marker: "waka", aksi: "presensi-jam", tanpaInfo: true }), "izin");
await uji("alfa-jam: waka mengisi A TANPA penanda (bersih) DITERIMA (data lama kompatibel)", waka, "PATCH", "", { [`lessons/${HT}/${AJ}/absen/5116/3`]: "A", [`lessonsByStudent/5116/${HT}/3`]: { k: "A" } }, "izin");
await uji("alfa-jam: piket mengisi A (5117) untuk uji penanda basi", piket, "PATCH", "", aSet(piket, "5117", 1), "izin");
await uji("alfa-jam: waka mengubah sel A piket menjadi S TANPA mengganti penanda 'piket' DITOLAK", waka, "PATCH", "", { [`lessons/${HT}/${AJ}/absen/5117/1`]: "S", [`lessonsByStudent/5117/${HT}/1`]: { k: "S" } }, "tolak");
await uji("alfa-jam: waka mengubah sel A piket menjadi S dengan penanda 'piket' tertulis ulang DITOLAK", waka, "PATCH", "", wakaTulis("5117", 1, "S", { marker: "piket" }), "tolak");
await uji("alfa-jam: waka menghapus sel A piket (sel + penanda + info + salinan) DITERIMA", waka, "PATCH", "", wakaTulis("5117", 1, null), "izin");
await uji("alfa-jam: waka menulis sel untuk siswa BERKETERANGAN harian (Sakit) DITOLAK", waka, "PATCH", "", wakaTulis("5110", 2, "A"), "tolak");
await uji("alfa-jam: waka menulis I untuk siswa berketerangan harian DITOLAK", waka, "PATCH", "", wakaTulis("5110", 2, "I"), "tolak");
await uji("alfa-jam: waka menulis HANYA salinan untuk siswa berketerangan harian DITOLAK", waka, "PATCH", "", { [`lessonsByStudent/5110/${HT}/3`]: { k: "A" } }, "tolak");
await uji("alfa-jam: piket menulis S untuk siswa berketerangan harian DITOLAK", piket, "PATCH", "", (() => { const A = act(piket, "izin-jam"); return { ...A.body, [`lessons/${HT}/${AJ}/absen/5110/4`]: "S", [`lessonsByStudent/5110/${HT}/4`]: { k: "S" }, [MZ(HT, "5110", `${A.id}_S`)]: metaIz(piket, { lingkup: "jam", ket: "Sakit", jam: { 0: 4 } }) }; })(), "tolak");
await uji("alfa-jam: waka MENGHAPUS sel lama siswa berketerangan harian tetap boleh (pembersihan)", waka, "PATCH", "", { [`lessons/${HT}/${AJ}/absen/5110/9`]: null }, "izin");

// ---- peran lain tidak punya hak A
for (const [n, who] of [["kepala", kepala], ["admin", admin], ["ortu", ortu1], ["alat", dev]]) {
  await uji(`alfa-jam: ${n} TIDAK dapat mengisi A`, who, "PATCH", "", aSet(who, "5102", 5), "tolak");
  await tolak(`alfa-jam: ${n} TIDAK dapat menulis penanda`, who, "PUT", `lessons/${HT}/${AJ}/absenOleh/5102/5`, "waka");
}
await tolak("alfa-jam: piket TIDAK menulis absenInfo dengan PUT tunggal", piket, "PUT", `lessons/${HT}/${AJ}/absenInfo/5102/5`, { petugas: "x", ts: SV, hariKe: HK });
// ---- keterbacaan: piket/waka/kepala/admin membaca penanda & info (lessons dapat dibaca piket); ortu tidak
await izin("alfa-jam: piket membaca penanda & info (lessons kelas)", piket, "GET", `lessons/${HT}/${AJ}`);
await izin("alfa-jam: waka membaca penanda", waka, "GET", `lessons/${HT}/${AJ}/absenOleh`);
await tolak("alfa-jam: ortu TIDAK membaca lessons (penanda/info)", ortu1, "GET", `lessons/${HT}/${AJ}`);
await tolak("piket TIDAK bisa menulis lessonsByStudent utuh per tanggal", piket, "PUT", `lessonsByStudent/666/${HT}`, { 1: { k: "S" } });

// ---- ISOLASI LAPISAN: tiap syarat sel/penanda/info/salinan diuji TERSENDIRI (tanpa salinan, atau salinan sendirian) agar lapisan lain tidak menutupinya
const tanpaS = { tanpaSalinan: true };
await aUji("lapis: set A TANPA info dan TANPA salinan DITOLAK (hanya syarat sel yang menolak)", piket, "5102", 1, "tolak", { ...tanpaS, tanpaInfo: true });
await aUji("lapis: set A TANPA log dan TANPA salinan DITOLAK", piket, "5102", 1, "tolak", { ...tanpaS, act: { tanpa: true } });
await aUji("lapis: set A dengan log 'izin-jam' dan TANPA salinan DITOLAK", piket, "5102", 1, "tolak", { ...tanpaS, aksi: "izin-jam" });
await aUji("lapis: set A KEMARIN dan TANPA salinan DITOLAK", piket, "5102", 1, "tolak", { ...tanpaS, info: { hariKe: HK - 1 } });
await aUji("lapis: set A info TANPA hariKe dan TANPA salinan DITOLAK", piket, "5102", 1, "tolak", { ...tanpaS, info: { hariKe: undefined } });
await aUji("lapis: set A TANPA penanda dan TANPA salinan DITOLAK", piket, "5102", 1, "tolak", { ...tanpaS, tanpaMarker: true });
await aUji("lapis: set A penanda 'waka' dan TANPA salinan DITOLAK", piket, "5102", 1, "tolak", { ...tanpaS, marker: "waka" });
await aUji("lapis: set A pada siswa berketerangan harian TANPA salinan DITOLAK", piket, "5110", 1, "tolak", tanpaS);
await uji("lapis: waka menulis sel A siswa berketerangan harian TANPA salinan DITOLAK", waka, "PATCH", "", { [`lessons/${HT}/${AJ}/absen/5110/5`]: "A", [`lessons/${HT}/${AJ}/absenOleh/5110/5`]: "waka" }, "tolak");
// piket menulis penanda 'waka' bersama perubahan sel S/I/D (hanya aturan tulis penanda yang menahan)
await uji("lapis: piket menulis penanda 'waka' bersama sel S DITOLAK", piket, "PATCH", "", (() => {
  const A = act(piket, "izin-jam");
  return { ...A.body, [`lessons/${HT}/${AJ}/absen/5116/5`]: "S", [`lessons/${HT}/${AJ}/absenOleh/5116/5`]: "waka", [`lessonsByStudent/5116/${HT}/5`]: { k: "S" }, [MZ(HT, "5116", `${A.id}_S`)]: metaIz(piket, { lingkup: "jam", ket: "Sakit", jam: { 0: 5 } }) };
})(), "tolak");
// hapus A milik sendiri: lapisan sel saja (sel + penanda + info, TANPA salinan)
const hapusSel = (nis, o = {}) => ({ ...(o.tanpaLog ? {} : act(piket, o.aksi ?? "alfa-jam").body), [`lessons/${HT}/${AJ}/absen/${nis}/1`]: null, [`lessons/${HT}/${AJ}/absenOleh/${nis}/1`]: null, [`lessons/${HT}/${AJ}/absenInfo/${nis}/1`]: null });
await uji("lapis: piket mengisi A (5105) untuk uji hapus tersendiri", piket, "PATCH", "", aSet(piket, "5105", 1, tanpaS), "izin");
await uji("lapis: piket menghapus A miliknya TANPA log dan TANPA salinan DITOLAK", piket, "PATCH", "", hapusSel("5105", { tanpaLog: true }), "tolak");
await uji("lapis: piket menghapus A miliknya dengan log 'izin-jam' dan TANPA salinan DITOLAK", piket, "PATCH", "", hapusSel("5105", { aksi: "izin-jam" }), "tolak");
await uji("lapis: piket menghapus A miliknya (sel + penanda + info, log 'alfa-jam') DITERIMA", piket, "PATCH", "", hapusSel("5105"), "izin");
await uji("lapis: piket menghapus A piket KEMARIN (5121) TANPA salinan DITOLAK (hariKe tersimpan = kemarin)", piket, "PATCH", "", hapusSel("5121"), "tolak");
await uji("lapis: piket menghapus A milik waka dengan INFO BASI hari ini (5119) TANPA salinan DITOLAK (penanda lama 'waka')", piket, "PATCH", "", hapusSel("5119"), "tolak");
await uji("lapis: piket menghapus A milik waka dengan INFO BASI hari ini (5120) DITOLAK", piket, "PATCH", "", hapusSel("5120"), "tolak");
// salinan A SENDIRIAN (sel/penanda/info sudah ada di database): hanya aturan tulis salinan yang menentukan
const salinanSaja = (nis, k = "A", o = {}) => ({ ...(o.tanpaLog ? {} : act(piket, o.aksi ?? "alfa-jam").body), [`lessonsByStudent/${nis}/${HT}/1`]: k === null ? null : { k } });
await uji("lapis: salinan A SENDIRIAN pada sel dengan penanda 'waka' dan info basi (5120) DITOLAK", piket, "PATCH", "", salinanSaja("5120"), "tolak");
await uji("lapis: salinan A SENDIRIAN pada sel piket KEMARIN (5121) DITOLAK", piket, "PATCH", "", salinanSaja("5121"), "tolak");
await uji("lapis: salinan A SENDIRIAN TANPA log (5122, sel piket hari ini) DITOLAK", piket, "PATCH", "", salinanSaja("5122", "A", { tanpaLog: true }), "tolak");
await uji("lapis: salinan A SENDIRIAN dengan log 'izin-jam' (5122) DITOLAK", piket, "PATCH", "", salinanSaja("5122", "A", { aksi: "izin-jam" }), "tolak");
await uji("lapis: salinan A SENDIRIAN pada sel piket hari ini dengan log 'alfa-jam' (5122) DITERIMA (kontrol: hanya log yang berbeda dari kasus di atas)", piket, "PATCH", "", salinanSaja("5122"), "izin");
await uji("lapis: piket menghapus salinan A milik waka dengan INFO BASI (5119) DITOLAK (penanda lama 'waka')", piket, "PATCH", "", salinanSaja("5119", null), "tolak");

seksi("PIKET — pelanggaran ringan / bertakziran (dari master) + LOG WAJIB");
const hapusPkTanpaEntri = () => ({
  ...act(piket, "hapus-pelanggaran", { tanpaEntri: true }).body,
  [P("222", "pk2")]: null, [`${M("222", "pk2")}/dihapus`]: true, [`${M("222", "pk2")}/alasanHapus`]: "x",
  [`${M("222", "pk2")}/snapshot`]: { jenis: "pelanggaran", refId: "rT", nama: "Sedang bertakziran", kategori: "Sedang", poin: 50, tanggal: TGL, ta: TA, sumber: "piket", takziran: "Bersihkan lorong" },
  [`${M("222", "pk2")}/diubahOleh`]: piket.uid, [`${M("222", "pk2")}/diubahTs`]: SV, [`piketHarian/${TGL}/pk2/dihapus`]: true,
});
const pStd = (n, id, t = TGL, o = {}) => ({ jenis: "pelanggaran", refId: "r1", nama: "Contoh", kategori: "Ringan", poin: 5, tanggal: t, ta: TA, sumber: "piket", ...o });
const pHar = (n, id, o = {}) => ({ nis: n, nama: "ANAK TEST", kelas: "XI IPS", pelanggaran: "Contoh", petugas: "Bu Rina", hariKe: HK, refId: "r1", poin: 5, kategori: "Ringan", ...o });
const pBody = (u, n, id, ro = {}, mo = {}, ho = {}, t = TGL, o = {}) => {
  const A = act(u, o.aksi ?? "pelanggaran", o.act ?? {});
  return { ...A.body, [P(n, id)]: pStd(n, id, t, ro), [M(n, id)]: meta(u, { dibuatNama: "Bu Rina", ...mo }), [`piketHarian/${t}/${id}`]: pHar(n, id, ho) };
};
const pel = (nama, who, n, id, ro, mo, ho, harap, t, o) => uji(nama, who, "PATCH", "", pBody(who, n, id, ro, mo, ho, t, o), harap);
await pel("piket: pelanggaran Ringan dari master", piket, "111", "pk1", {}, {}, {}, "izin");
await pel("piket: pelanggaran Sedang BERTAKZIRAN dari master", piket, "222", "pk2", { refId: "rT", nama: "Sedang bertakziran", kategori: "Sedang", poin: 50, takziran: "Bersihkan lorong" }, {}, { refId: "rT", pelanggaran: "Sedang bertakziran", poin: 50, kategori: "Sedang", takziran: "Bersihkan lorong" }, "izin");
await cek("piket: record publik bersih & meta memuat nama petugas", waka, M("111", "pk1"), (j) => j?.dibuatNama === "Bu Rina" && j.dibuatOleh === piket.uid);
await cek("piket: piketHarian dapat dibaca piket", piket, `piketHarian/${TGL}`, (j) => j?.pk1?.nis === "111" && j?.pk2?.nis === "222");
await pel("piket: TANPA log aktivitas ditolak", piket, "111", "pl1", {}, {}, {}, "tolak", TGL, { act: { tanpa: true } });
await pel("piket: activityLast ada tetapi ENTRI log tidak ada ditolak", piket, "111", "pl6", {}, {}, {}, "tolak", TGL, { act: { tanpaEntri: true } });
await pel("piket: log aksi salah ('izin-harian') ditolak", piket, "111", "pl2", {}, {}, {}, "tolak", TGL, { aksi: "izin-harian" });
await pel("piket: activityLast basi ditolak", piket, "111", "pl3", {}, {}, {}, "tolak", TGL, { act: { last: { ts: 1000 } } });
await pel("piket: log tanpa petugas ditolak", piket, "111", "pl4", {}, {}, {}, "tolak", TGL, { act: { entri: { petugas: undefined } } });
await uji("piket: record+meta+piketHarian tanpa log (PATCH) ditolak", piket, "PATCH", "", { [P("111", "pl5")]: pStd("111", "pl5"), [M("111", "pl5")]: meta(piket), [`piketHarian/${TGL}/pl5`]: pHar("111", "pl5") }, "tolak");
await pel("piket: Sedang TANPA takziran DITOLAK", piket, "111", "pk3", { refId: "rS", nama: "Sedang tanpa takziran", kategori: "Sedang", poin: 30 }, {}, { refId: "rS" }, "tolak");
await pel("piket: Berat tanpa takziran DITOLAK", piket, "111", "pk4", { refId: "rB", nama: "Berat tanpa takziran", kategori: "Berat", poin: 75 }, {}, { refId: "rB" }, "tolak");
await pel("piket: master NONAKTIF ditolak", piket, "111", "pk5", { refId: "rOff", nama: "Ringan nonaktif" }, {}, { refId: "rOff" }, "tolak");
await pel("piket: refId tidak ada di master (ketik bebas) ditolak", piket, "111", "pk6", { refId: "tidakAda" }, {}, {}, "tolak");
await pel("piket: tanpa refId (ketik bebas) ditolak", piket, "111", "pk7", { refId: undefined }, {}, {}, "tolak");
await pel("piket: poin diubah ditolak", piket, "111", "pk8", { poin: 6 }, {}, {}, "tolak");
await pel("piket: poin diperkecil ditolak", piket, "111", "pk9", { poin: 1 }, {}, {}, "tolak");
await pel("piket: nama diubah ditolak", piket, "111", "pk10", { nama: "Nama karangan" }, {}, {}, "tolak");
await pel("piket: kategori diubah ditolak", piket, "111", "pk11", { kategori: "Berat" }, {}, {}, "tolak");
await pel("piket: takziran ditambah pada master tanpa takziran ditolak", piket, "111", "pk12", { takziran: "Skors" }, {}, {}, "tolak");
await pel("piket: takziran master bertakziran diubah ditolak", piket, "222", "pk13", { refId: "rT", nama: "Sedang bertakziran", kategori: "Sedang", poin: 50, takziran: "Skors" }, {}, { refId: "rT" }, "tolak");
await pel("piket: remisi ditolak", piket, "111", "pk14", { jenis: "remisi" }, {}, {}, "tolak");
await pel("piket: sumber 'manual' ditolak", piket, "111", "pk15", { sumber: "manual" }, {}, {}, "tolak");
await pel("piket: sumber 'saran' ditolak", piket, "111", "pk16", { sumber: "saran" }, {}, {}, "tolak");
await uji("piket: record TANPA piketHarian ditolak", piket, "PATCH", "", { ...act(piket, "pelanggaran").body, [P("111", "pk17")]: pStd("111", "pk17"), [M("111", "pk17")]: meta(piket) }, "tolak");
await uji("piket: record TANPA recordMeta ditolak", piket, "PATCH", "", { ...act(piket, "pelanggaran").body, [P("111", "pk18")]: pStd("111", "pk18"), [`piketHarian/${TGL}/pk18`]: pHar("111", "pk18") }, "tolak");
await pel("piket: piketHarian dengan hariKe lewat jendela ditolak", piket, "111", "pk19", {}, {}, { hariKe: HK - 3 }, "tolak");
await pel("piket: piketHarian hariKe masa depan ditolak", piket, "111", "pk20", {}, {}, { hariKe: HK + 1 }, "tolak");
await pel("piket: hariKe tepat N=2 hari lalu DITERIMA", piket, "111", "pk21", {}, {}, { hariKe: HK - 2 }, "izin", "2026-10-10");
await pel("piket: piketHarian.nis tidak cocok ditolak", piket, "111", "pk22", {}, {}, { nis: "222" }, "tolak");
await pel("piket: meta.dibuatOleh bukan pengguna ditolak", piket, "111", "pk23", {}, { dibuatOleh: waka.uid }, {}, "tolak");
await pel("piket: field asing pada piketHarian ditolak", piket, "111", "pk24", {}, {}, { asing: 1 }, "tolak");
await uji("piket: EDIT catatan piket yang ada (poin) ditolak", piket, "PATCH", "", { ...act(piket, "pelanggaran").body, [`${P("111", "pk1")}/poin`]: 1, [`${M("111", "pk1")}/diubahOleh`]: piket.uid, [`${M("111", "pk1")}/diubahTs`]: SV }, "tolak");
await uji("piket: EDIT netral (ta) catatan piket yang ada ditolak", piket, "PATCH", "", { ...act(piket, "pelanggaran").body, [`${P("111", "pk21")}/ta`]: "2025-2026", [`${M("111", "pk21")}/diubahOleh`]: piket.uid, [`${M("111", "pk21")}/diubahTs`]: SV }, "tolak");
await uji("piket: piketHarian dengan hariKe di luar jendela (tulis langsung) ditolak", piket, "PUT", `piketHarian/${TGL}/zz1`, pHar("111", "zz1", { hariKe: HK - 30 }), "tolak");
await uji("piket: piketHarian valid TANPA log (tulis langsung) ditolak", piket, "PUT", `piketHarian/${TGL}/zz2`, pHar("111", "zz2"), "tolak");
await uji("piket: piketHarian valid + log (tulis langsung) DITERIMA", piket, "PATCH", "", { ...act(piket, "pelanggaran").body, [`piketHarian/${TGL}/zz2`]: pHar("111", "zz2") }, "izin");
await uji("piket: piketHarian hariKe masa depan + log (tulis langsung) ditolak", piket, "PATCH", "", { ...act(piket, "pelanggaran").body, [`piketHarian/${TGL}/zz3`]: pHar("111", "zz3", { hariKe: HK + 1 }) }, "tolak");
await uji("piket: tulis recordMeta catatan waka ditolak", piket, "PATCH", "", { ...act(piket, "pelanggaran").body, [`${M("111", "recSeed")}/diubahOleh`]: piket.uid, [`${M("111", "recSeed")}/diubahTs`]: SV }, "tolak");
await buatNo("waka TIDAK bisa membuat record bersumber 'piket' baru", waka, "111", "pk25", { sumber: "piket", refId: "r1" });
const hapusPk = (u, n, id, snap, ho = {}, o = {}) => ({
  ...act(u, o.aksi ?? "hapus-pelanggaran", o.act ?? {}).body,
  [P(n, id)]: null, [`${M(n, id)}/dihapus`]: true, [`${M(n, id)}/alasanHapus`]: "salah siswa", [`${M(n, id)}/snapshot`]: snap,
  [`${M(n, id)}/diubahOleh`]: u.uid, [`${M(n, id)}/diubahTs`]: SV, [`piketHarian/${TGL}/${id}/dihapus`]: true, ...ho,
});
await uji("piket: soft delete: activityLast ada tetapi ENTRI log tidak ada ditolak", piket, "PATCH", "", hapusPkTanpaEntri(), "tolak");
await uji("piket: soft delete TANPA log ditolak", piket, "PATCH", "", hapusPk(piket, "111", "pk1", pStd("111", "pk1"), {}, { act: { tanpa: true } }), "tolak");
await uji("piket: soft delete dengan log aksi salah ('pelanggaran') ditolak", piket, "PATCH", "", hapusPk(piket, "111", "pk1", pStd("111", "pk1"), {}, { aksi: "pelanggaran" }), "tolak");
await uji("piket: soft delete catatan piket sendiri (record null + meta dihapus + piketHarian.dihapus + log)", piket, "PATCH", "", hapusPk(piket, "111", "pk1", pStd("111", "pk1")), "izin");
await cek("piket: catatan terhapus hilang dari path publik", waka, P("111", "pk1"), (j) => j === null);
await cek("piket: piketHarian menandai dihapus", piket, `piketHarian/${TGL}/pk1`, (j) => j?.dihapus === true);
await uji("piket: soft delete catatan WAKA (sumber manual) ditolak", piket, "PATCH", "", hapusPk(piket, "111", "recSeed", pStd("111", "recSeed", TGL, { sumber: "manual" })), "tolak");
await uji("piket: hapus fisik catatan piket tanpa meta ditolak", piket, "DELETE", P("222", "pk2"), undefined, "tolak");
await uji("piket: hapus fisik piketHarian ditolak", piket, "DELETE", `piketHarian/${TGL}/pk2`, undefined, "tolak");
await uji("piket: soft delete tanpa alasan ditolak", piket, "PATCH", "", { ...act(piket, "hapus-pelanggaran").body, [P("222", "pk2")]: null, [`${M("222", "pk2")}/dihapus`]: true, [`${M("222", "pk2")}/snapshot`]: pStd("222", "pk2", TGL, { refId: "rT", nama: "Sedang bertakziran", kategori: "Sedang", poin: 50, takziran: "Bersihkan lorong" }), [`${M("222", "pk2")}/diubahOleh`]: piket.uid, [`${M("222", "pk2")}/diubahTs`]: SV }, "tolak");
await izin("waka membaca recordMeta catatan piket", waka, "GET", M("222", "pk2"));
await uji("waka dapat menghapus-lunak catatan piket (tanpa log)", waka, "PATCH", "", { [P("222", "pk2")]: null, [`${M("222", "pk2")}/dihapus`]: true, [`${M("222", "pk2")}/alasanHapus`]: "keputusan waka", [`${M("222", "pk2")}/snapshot`]: pStd("222", "pk2", TGL, { refId: "rT", nama: "Sedang bertakziran", kategori: "Sedang", poin: 50, takziran: "Bersihkan lorong" }), [`${M("222", "pk2")}/diubahOleh`]: waka.uid, [`${M("222", "pk2")}/diubahTs`]: SV }, "izin");

seksi("PIKET — aksi log harus sesuai jenis tulisan (silang ditolak)");
await jam("piket: sel per jam dengan log aksi 'izin-harian' ditolak", piket, "666", [2], "S", {}, "tolak", { aksi: "izin-harian" });
await jam("piket: sel per jam dengan log aksi 'pelanggaran' ditolak", piket, "666", [2], "S", {}, "tolak", { aksi: "pelanggaran" });
await jam("piket: sel per jam dengan log aksi 'hapus-izin' ditolak", piket, "666", [2], "S", {}, "tolak", { aksi: "hapus-izin" });
await pel("piket: catat pelanggaran dengan log aksi 'izin-jam' ditolak", piket, "666", "silangA", {}, {}, {}, "tolak", TGL, { aksi: "izin-jam" });
await pel("piket: catat pelanggaran dengan log aksi 'hapus-pelanggaran' ditolak", piket, "666", "silangB", {}, {}, {}, "tolak", TGL, { aksi: "hapus-pelanggaran" });
await harian("piket: izin harian dengan log aksi 'pelanggaran' ditolak", piket, HT, "444", "Sakit", {}, "tolak", { aksi: "pelanggaran" });
await harian("piket: izin harian dengan log aksi 'hapus-izin' ditolak", piket, HT, "444", "Sakit", {}, "tolak", { aksi: "hapus-izin" });

seksi("PIKET — hak tulis lain ditolak");
await tolak("piket TIDAK bisa menulis roles", piket, "PUT", `roles/${target.uid}`, "piket");
await tolak("piket TIDAK bisa menulis staff", piket, "PUT", `staff/${target.uid}`, { email: "a@b.c", nama: "X", role: "piket", dibuat: SV });
await tolak("piket TIDAK bisa menulis config/students", piket, "PUT", "config/students/EEEE9999", { nis: "999", nama: "X", kelas: "X" });
await tolak("piket TIDAK bisa menulis config/version", piket, "PUT", "config/version", 3);
await tolak("piket TIDAK bisa menulis parents", piket, "PUT", "parents/999", { ver: 1, uid: "u" });
await tolak("piket TIDAK bisa menulis device/inbox", piket, "PUT", "device/inbox/command", { id: "x", cmd: "sync", ts: 1 });
await tolak("piket TIDAK bisa menulis device/status", piket, "PUT", "device/status/lastSeen", 5);
await tolak("piket TIDAK bisa menulis discipline/rules (master)", piket, "PUT", "discipline/rules/rX", { kategori: "Ringan", nama: "x", poin: 5, aktif: true, diubahOleh: piket.uid, diubahTs: SV });
await tolak("piket TIDAK bisa mengubah master discipline/rules/r1", piket, "PATCH", "discipline/rules/r1", { poin: 1 });
await tolak("piket TIDAK bisa menulis discipline/settings", piket, "PUT", "discipline/settings/piketMundurHari", 14);
await tolak("piket TIDAK bisa menulis discipline/audit", piket, "PUT", "discipline/audit/aP1", audit(piket));
await tolak("piket TIDAK bisa menulis discipline/suggest", piket, "PUT", sugPath(TGL, "alfa", "999"), { keputusan: "diabaikan", oleh: piket.uid, ts: SV, nis: "999" });
await tolak("piket TIDAK bisa menulis validasi", piket, "PUT", `validasi/${HT}/111`, val(piket));
await tolak("piket TIDAK bisa menulis piketRoster", piket, "PUT", "piketRoster/p9", { nama: "Palsu", aktif: true });
await tolak("piket TIDAK bisa menulis notes", piket, "PUT", "discipline/notes/111/pk2", "x");
await tolak("piket TIDAK bisa menulis piketAkun", piket, "PUT", `piketAkun/${piket.uid}`, { email: "a@b.c", nama: "X" });
await tolak("piket TIDAK bisa menulis sistem/backupTerakhir", piket, "PUT", "sistem/backupTerakhir", SV);

seksi("PRESENSI MANUAL — manualTap + manualTapByStudent (waka & piket; alat tidak tersentuh)");
// hari kerja (bukan Minggu) dalam jendela piket: hari ini, atau Sabtu bila hari ini Minggu
// v2.4: tanggal dasar seksi ini = hari kerja LAMPAU (dalam jendela piket N=2): uji tidak bergantung pada jam hari. Uji jam manual 'hari ini' memakai TD di bawah.
const HKM = (HK - 1 + 4) % 7 === 0 ? HK - 2 : HK - 1;
const TD = new Date(HK * 86400000).toISOString().slice(0, 10);
const TM = new Date(HKM * 86400000).toISOString().slice(0, 10);
const MINGGU_HK = HK - ((HK + 4) % 7); // Minggu terakhir <= hari ini (epoch-day; (hk+4)%7 === 0 -> Minggu)
const MT = (t, n) => `manualTap/${t}/${n}`;
const MS = (n, t) => `manualTapByStudent/${n}/${t}`;
const salinanDari = (x) => ({ status: x.status, masuk: x.masuk, pulang: x.pulang, alasan: x.alasan });
/** Satu update: log + manualTap + salinan. o.tap menimpa isi; o.salinan menimpa salinan; o.tanpaSalinan/o.tanpaAsli; o.act untuk log. */
const detikNow = () => Math.floor(((Date.now() + 7 * 3600000) % 86400000) / 1000);
const jamDariDetik = (d) => [Math.floor(d / 3600), Math.floor((d % 3600) / 60), d % 60].map((x) => String(x).padStart(2, "0")).join(":");
const detikJ = (j) => { const m = /^(\d+):(\d+)(?::(\d+))?$/.exec(j ?? ""); return m ? Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3] ?? 0) : 0; };
const manualBody = (u, t, n, o = {}) => {
  const A = act(u, o.aksi ?? "presensi-manual", o.act ?? {});
  const tap = { masuk: "07:10:00", status: "Hadir", alasan: "Lupa KTM", oleh: u.uid, ts: SV, hariKe: HKM, ...(PERAN.get(u.uid) === "piket" ? { petugas: "Bu Rina" } : {}), ...(o.tap ?? {}) };
  // v2.4: jam masuk diketik -> `masukDetik` (konsisten dengan `masuk`) dan `mundur` otomatis; uji khusus menimpa/menghapusnya lewat o.tap
  if (typeof tap.masuk === "string") {
    const dn = detikNow();
    // jam tetap (mis. 07:10, 08:20) yang melewati waktu sekarang (uji dijalankan dini hari) diganti ke 1 jam lalu agar tidak melanggar "tidak boleh melewati waktu dicatat";
    // uji jam manual memakai jam relatif terhadap sekarang dan menonaktifkannya dengan o.klem === false
    const klem = o.klem !== false && tap.hariKe === HK && detikJ(tap.masuk) > dn - 30 && dn > 120;
    if (klem) tap.masuk = jamDariDetik(dn - 3600 > 0 ? dn - 3600 : 1);
    if (!("masukDetik" in (o.tap ?? {}))) tap.masukDetik = detikJ(tap.masuk);
    if (!("mundur" in (o.tap ?? {})) && (tap.hariKe < HK || (tap.hariKe === HK && dn - detikJ(tap.masuk) > 960))) tap.mundur = true;
  }
  const body = { ...A.body };
  if (!o.tanpaAsli) body[MT(t, n)] = tap;
  if (!o.tanpaSalinan) body[MS(n, t)] = o.salinan ?? salinanDari(tap);
  return body;
};
const manual = (nama, who, t, n, harap, o) => uji(nama, who, "PATCH", "", manualBody(who, t, n, o), harap);

await manual("piket: catat hadir manual (Lupa KTM) + salinan + log", piket, TM, "555", "izin");
await cek("manual: waka membaca entri piket (petugas & alasan)", waka, MT(TM, "555"), (j) => j?.alasan === "Lupa KTM" && j.petugas === "Bu Rina" && j.oleh === piket.uid && j.status === "Hadir");
await cek("manual: log aktivitas 'presensi-manual' tercatat", waka, `activity/${TGLN}`, (j) => Object.values(j ?? {}).some((x) => x.aksi === "presensi-manual" && x.uid === piket.uid));
await izin("manual: orang tua membaca salinan anak sendiri", ortu1, "GET", MS("111", TM));
await manual("manual: piket catat siswa lain (Alat bermasalah, masuk+pulang)", piket, TM, "666", "izin", { tap: { alasan: "Alat bermasalah", pulang: "15:05:00" } });
await manual("manual: piket catat Terlambat + keterangan", piket, TM, "777", "izin", { tap: { status: "Terlambat", masuk: "08:20:00", keterangan: "KTM tertinggal di rumah" } });
await manual("manual: piket catat hanya pulang (KTM hilang)", piket, TM, "888", "izin", { tap: { masuk: undefined, pulang: "15:02:00", alasan: "KTM hilang" } });
await manual("manual: waka catat (tanpa batas jendela, hari lampau 30 hari)", waka, "2026-09-10", "444", "izin", { tap: { hariKe: HKM - 35 } });
await manual("manual: waka catat tanpa log aktivitas", waka, TM, "999", "izin", { act: { tanpa: true } });

// ---- penegakan log (piket)
await manual("manual: piket TANPA log DITOLAK", piket, TM, "321", "tolak", { act: { tanpa: true } });
await manual("manual: piket log aksi salah ('izin-harian') DITOLAK", piket, TM, "321", "tolak", { aksi: "izin-harian" });
await manual("manual: piket log aksi 'hapus-manual' untuk tulis DITOLAK", piket, TM, "321", "tolak", { aksi: "hapus-manual" });
await manual("manual: piket penanda log tanpa ENTRI DITOLAK", piket, TM, "321", "tolak", { act: { tanpaEntri: true } });
await manual("manual: piket activityLast.ts basi DITOLAK", piket, TM, "321", "tolak", { act: { last: { ts: 1000 } } });
{
  const lama = await http("GET", `activity/${TGLN}`, { token: waka.token });
  const [idLama] = Object.entries(lama.json ?? {}).find(([, x]) => x.uid === piket.uid && x.aksi === "presensi-manual") ?? [];
  await uji("manual: piket pakai ulang entri log LAMA DITOLAK", piket, "PATCH", "", { ...manualBody(piket, TM, "321", { act: { tanpa: true } }), [`activityLast/${piket.uid}`]: { id: idLama, ts: SV, tgl: TGLN } }, "tolak");
}

// ---- pasangan manualTap <-> salinan
await manual("manual: TANPA salinan DITOLAK", piket, TM, "321", "tolak", { tanpaSalinan: true });
await manual("manual: HANYA salinan (tanpa entri asli) DITOLAK", piket, TM, "321", "tolak", { tanpaAsli: true });
await manual("manual: salinan status berbeda DITOLAK", piket, TM, "321", "tolak", { salinan: { status: "Terlambat", masuk: "07:10:00", alasan: "Lupa KTM" } });
await manual("manual: salinan alasan berbeda DITOLAK", piket, TM, "321", "tolak", { salinan: { status: "Hadir", masuk: "07:10:00", alasan: "Lainnya" } });
await manual("manual: salinan jam masuk berbeda DITOLAK", piket, TM, "321", "tolak", { salinan: { status: "Hadir", masuk: "07:00:00", alasan: "Lupa KTM" } });
await manual("manual: salinan memuat pulang yang tidak ada di asli DITOLAK", piket, TM, "321", "tolak", { salinan: { status: "Hadir", masuk: "07:10:00", pulang: "15:00:00", alasan: "Lupa KTM" } });
await manual("manual: salinan membawa field asing (petugas) DITOLAK", piket, TM, "321", "tolak", { salinan: { status: "Hadir", masuk: "07:10:00", alasan: "Lupa KTM", petugas: "Bu Rina" } });
await uji("manual: piket menulis salinan sendirian untuk entri yang tidak ada DITOLAK", piket, "PUT", MS("321", TM), { status: "Hadir", masuk: "07:10:00", alasan: "Lupa KTM" }, "tolak");
await uji("manual: piket menulis entri asli sendirian (tanpa salinan, log valid) DITOLAK", piket, "PATCH", "", { ...act(piket, "presensi-manual").body, [MT(TM, "321")]: { masuk: "07:10:00", status: "Hadir", alasan: "Lupa KTM", oleh: piket.uid, ts: SV, hariKe: HKM, petugas: "Bu Rina" } }, "tolak");

// ---- validasi isi
await manual("manual: tanpa masuk DAN pulang DITOLAK", piket, TM, "321", "tolak", { tap: { masuk: undefined }, salinan: { status: "Hadir", alasan: "Lupa KTM" } });
await manual("manual: status 'Alfa' DITOLAK", piket, TM, "321", "tolak", { tap: { status: "Alfa" }, salinan: { status: "Alfa", masuk: "07:10:00", alasan: "Lupa KTM" } });
await manual("manual: status 'Izin' DITOLAK", piket, TM, "321", "tolak", { tap: { status: "Izin" }, salinan: { status: "Izin", masuk: "07:10:00", alasan: "Lupa KTM" } });
await manual("manual: alasan di luar daftar DITOLAK", piket, TM, "321", "tolak", { tap: { alasan: "Malas" }, salinan: { status: "Hadir", masuk: "07:10:00", alasan: "Malas" } });
for (const jamBuruk of ["7:10:00", "07:10", "24:00:00", "07:60:00", "07:10:61", "abc"]) {
  await manual(`manual: jam masuk '${jamBuruk}' DITOLAK`, piket, TM, "321", "tolak", { tap: { masuk: jamBuruk }, salinan: { status: "Hadir", masuk: jamBuruk, alasan: "Lupa KTM" } });
}
await manual("manual: jam pulang salah format DITOLAK", piket, TM, "321", "tolak", { tap: { pulang: "3pm" }, salinan: { status: "Hadir", masuk: "07:10:00", pulang: "3pm", alasan: "Lupa KTM" } });
await manual("manual: keterangan > 200 karakter DITOLAK", piket, TM, "321", "tolak", { tap: { keterangan: "x".repeat(201) } });
await manual("manual: oleh bukan pengguna DITOLAK", piket, TM, "321", "tolak", { tap: { oleh: waka.uid } });
await manual("manual: ts basi DITOLAK", piket, TM, "321", "tolak", { tap: { ts: 1000 } });
await manual("manual: piket tanpa nama petugas DITOLAK", piket, TM, "321", "tolak", { tap: { petugas: undefined } });
await manual("manual: field asing pada entri DITOLAK", piket, TM, "321", "tolak", { tap: { rahasia: 1 } });
await manual("manual: hariKe pecahan DITOLAK", piket, TM, "321", "tolak", { tap: { hariKe: HKM + 0.5 } });
await manual("manual: kunci nis bukan angka DITOLAK", piket, TM, "abc", "tolak");
await uji("manual: kunci tanggal salah DITOLAK", piket, "PATCH", "", manualBody(piket, "14-10-2026", "321"), "tolak");

// ---- jendela & masa depan & Minggu
await manual("manual: piket hariKe BESOK DITOLAK (tanpa masa depan)", piket, TM, "321", "tolak", { tap: { hariKe: HK + 1 } });
await manual("manual: waka hariKe BESOK DITOLAK (tanpa masa depan)", waka, TM, "321", "tolak", { tap: { hariKe: HK + 1 } });
await manual("manual: piket hariKe tepat N=2 hari lalu (DITERIMA; DITOLAK bila hari itu Minggu)", piket, TM, "322", (HK - 2 + 4) % 7 === 0 ? "tolak" : "izin", { tap: { hariKe: HK - 2 } });
await manual("manual: piket hariKe 3 hari lalu DITOLAK (jendela)", piket, TM, "323", "tolak", { tap: { hariKe: HK - 3 } });
await manual("manual: piket hariKe jauh lampau DITOLAK", piket, TM, "323", "tolak", { tap: { hariKe: HK - 40 } });
await manual("manual: WAKA hariKe hari MINGGU DITOLAK (rules menolak Minggu)", waka, "2026-10-04", "324", "tolak", { tap: { hariKe: MINGGU_HK } });
await manual("manual: PIKET hariKe hari MINGGU DITOLAK", piket, TM, "324", "tolak", { tap: { hariKe: MINGGU_HK } });
await manual("manual: waka hariKe Senin setelah Minggu DITERIMA (kontrol Minggu)", waka, "2026-10-05", "324", "izin", { tap: { hariKe: MINGGU_HK - 6 } });

// ---- v2.4: jam manual diketik piket -> masukDetik konsisten, tidak melewati waktu dicatat, `mundur` bila > 15 menit
{
  const dn = detikNow();
  const HKP = (HK - 1 + 4) % 7 === 0 ? HK - 2 : HK - 1; // hari kerja lampau dalam jendela piket (N=2)
  if ((HK + 4) % 7 !== 0 && dn > 2400 && dn < 86400 - 600) {
    const j5 = jamDariDetik(dn - 300), j30 = jamDariDetik(dn - 1800), jDepan = jamDariDetik(dn + 600), jPas = jamDariDetik(dn + 20);
    const K = { klem: false };
    await manual("manual-jam: piket masuk 5 menit lalu TANPA mundur DITERIMA", piket, TD, "4101", "izin", { ...K, tap: { hariKe: HK, masuk: j5 } });
    await manual("manual-jam: piket masuk 5 menit lalu dengan mundur:true DITOLAK (selisih < 14 menit)", piket, TD, "4102", "tolak", { ...K, tap: { hariKe: HK, masuk: j5, mundur: true } });
    await manual("manual-jam: piket masuk 30 menit lalu TANPA mundur DITOLAK", piket, TD, "4103", "tolak", { ...K, tap: { hariKe: HK, masuk: j30, mundur: undefined } });
    await manual("manual-jam: piket masuk 30 menit lalu dengan mundur:true DITERIMA", piket, TD, "4104", "izin", { ...K, tap: { hariKe: HK, masuk: j30 } });
    await cek("manual-jam: entri mundur tersimpan dengan masukDetik dan ts (dicatat)", waka, MT(TD, "4104"), (j) => j?.mundur === true && j.masukDetik === detikJ(j30) && j.masuk === j30 && typeof j.ts === "number");
    await manual("manual-jam: piket masuk 10 menit di masa depan DITOLAK (melewati waktu dicatat)", piket, TD, "4105", "tolak", { ...K, tap: { hariKe: HK, masuk: jDepan } });
    await manual("manual-jam: piket masuk 10 menit di masa depan + mundur:true tetap DITOLAK", piket, TD, "4105", "tolak", { ...K, tap: { hariKe: HK, masuk: jDepan, mundur: true } });
    await manual("manual-jam: piket masuk +20 detik (dalam toleransi jam klien) DITERIMA", piket, TD, "4106", "izin", { ...K, tap: { hariKe: HK, masuk: jPas } });
    await manual("manual-jam: WAKA masuk 10 menit di masa depan DITERIMA (koreksi tanpa batas)", waka, TD, "4107", "izin", { ...K, tap: { hariKe: HK, masuk: jDepan } });
    await manual("manual-jam: WAKA masuk 30 menit lalu TANPA mundur DITERIMA", waka, TD, "4108", "izin", { ...K, tap: { hariKe: HK, masuk: j30, mundur: undefined } });
    await manual("manual-jam: WAKA masuk 5 menit lalu dengan mundur:true DITERIMA (hanya boleh bernilai true)", waka, TD, "4109", "izin", { ...K, tap: { hariKe: HK, masuk: j5, mundur: true } });
    // konsistensi masuk <-> masukDetik (jam, menit, detik diuji TERPISAH)
    await manual("manual-jam: masukDetik beda JAM dari masuk DITOLAK", waka, TD, "4110", "tolak", { ...K, tap: { hariKe: HK, masuk: j30, masukDetik: detikJ(j30) + 3600 } });
    await manual("manual-jam: masukDetik beda MENIT dari masuk DITOLAK", waka, TD, "4110", "tolak", { ...K, tap: { hariKe: HK, masuk: j30, masukDetik: detikJ(j30) + 60 * 7 } });
    await manual("manual-jam: masukDetik beda DETIK dari masuk DITOLAK", waka, TD, "4110", "tolak", { ...K, tap: { hariKe: HK, masuk: j30, masukDetik: detikJ(j30) + 1 } });
    await manual("manual-jam: piket mengaburkan jam dengan masukDetik palsu (terbaru) DITOLAK", piket, TD, "4111", "tolak", { ...K, tap: { hariKe: HK, masuk: j30, masukDetik: detikJ(j5), mundur: undefined } });
    // validasi isi masukDetik / mundur (kontrol: entri sehat dengan jam relatif yang sama DITERIMA)
    await manual("manual-jam: kontrol - entri waka sah dengan jam relatif DITERIMA", waka, TD, "4112", "izin", { ...K, tap: { hariKe: HK, masuk: j30 } });
    await manual("manual-jam: masuk TANPA masukDetik DITOLAK (piket)", piket, TD, "4113", "tolak", { ...K, tap: { hariKe: HK, masuk: j30, masukDetik: undefined } });
    await manual("manual-jam: masuk TANPA masukDetik DITOLAK (waka)", waka, TD, "4113", "tolak", { ...K, tap: { hariKe: HK, masuk: j30, masukDetik: undefined } });
    await manual("manual-jam: masukDetik pecahan DITOLAK", waka, TD, "4113", "tolak", { ...K, tap: { hariKe: HK, masuk: j30, masukDetik: detikJ(j30) + 0.5 } });
    await manual("manual-jam: masukDetik berupa teks DITOLAK", waka, TD, "4113", "tolak", { ...K, tap: { hariKe: HK, masuk: j30, masukDetik: String(detikJ(j30)) } });
    await manual("manual-jam: mundur bernilai false DITOLAK", waka, TD, "4113", "tolak", { ...K, tap: { hariKe: HK, masuk: j30, mundur: false } });
    await manual("manual-jam: masukDetik di luar rentang (hari berikutnya) DITOLAK", waka, TD, "4113", "tolak", { ...K, tap: { hariKe: HK, masuk: j30, masukDetik: detikJ(j30) + 86400 } });
  }
  await manual("manual-jam: masukDetik TANPA masuk (hanya pulang) DITOLAK", piket, TM, "4114", "tolak", { tap: { masuk: undefined, pulang: "15:02:00", masukDetik: 100 }, salinan: { status: "Hadir", pulang: "15:02:00", alasan: "Lupa KTM" } });
  await manual("manual-jam: mundur TANPA masuk (hanya pulang) DITOLAK", piket, TM, "4114", "tolak", { tap: { masuk: undefined, pulang: "15:02:00", mundur: true }, salinan: { status: "Hadir", pulang: "15:02:00", alasan: "Lupa KTM" } });
  // tanggal lampau: mundur WAJIB bagi piket
  await manual("manual-jam: piket tanggal lampau TANPA mundur DITOLAK", piket, TM, "4116", "tolak", { tap: { hariKe: HKP, mundur: undefined } });
  await manual("manual-jam: piket tanggal lampau dengan mundur:true DITERIMA", piket, TM, "4117", "izin", { tap: { hariKe: HKP } });
  await manual("manual-jam: waka tanggal lampau TANPA mundur DITERIMA (koreksi tanpa batas)", waka, TM, "4118", "izin", { tap: { hariKe: HKP, mundur: undefined } });
  await manual("manual-jam: pulang-saja (tanpa masuk) tetap DITERIMA tanpa masukDetik/mundur", piket, TM, "4119", "izin", { tap: { masuk: undefined, pulang: "15:02:00", alasan: "KTM hilang" }, salinan: { status: "Hadir", pulang: "15:02:00", alasan: "KTM hilang" } });
}

// ---- kepemilikan & validasi Alfa
await manual("manual: piket DITOLAK bila Alfa sudah divalidasi waka (111)", piket, TGL, "111", "tolak");
await manual("manual: waka tetap boleh walau Alfa tervalidasi (111)", waka, TGL, "111", "izin");
// ---- konflik Alfa: waka mencatat manual + membatalkan Alfa (validasi + salinan + audit) dalam SATU update; piket tidak boleh
const batalAlfaBody = (u, n, o = {}) => ({
  ...manualBody(u, TGL, n, o),
  [`validasi/${TGL}/${n}`]: null, [`validasiByStudent/${n}/${TGL}`]: null,
  [`discipline/audit/${randomBytes(4).toString("hex")}`]: audit(u, { path: `validasi/${TGL}/${n}`, aksi: "hapus" }),
});
await uji("manual: waka catat manual + batalkan Alfa terverifikasi (222) dalam SATU update DITERIMA", waka, "PATCH", "", batalAlfaBody(waka, "222", { act: { tanpa: true } }), "izin");
await cek("manual: Alfa 222 benar-benar terhapus bersama salinannya", waka, `validasi/${TGL}/222`, (j) => j === null);
await uji("manual: PIKET tidak bisa membatalkan Alfa lewat update manual (222 sudah bebas; uji pada 111)", piket, "PATCH", "", batalAlfaBody(piket, "111"), "tolak");
await uji("manual: rules tidak mewajibkan audit untuk batal Alfa oleh waka (audit dijaga klien) DITERIMA", waka, "PATCH", "", { ...manualBody(waka, TGL, "111", { act: { tanpa: true } }), [`validasi/${TGL}/111`]: null, [`validasiByStudent/111/${TGL}`]: null }, "izin"); // audit tidak diwajibkan rules untuk validasi; konsistensi audit dijaga klien
await manual("manual: waka menulis entri untuk nis 331", waka, TM, "331", "izin");
await manual("manual: piket TIDAK bisa menimpa entri milik waka", piket, TM, "331", "tolak", { tap: { masuk: "07:00:00" } });
await manual("manual: piket menimpa entri milik piket (koreksi) DITERIMA", piket, TM, "555", "izin", { tap: { masuk: "07:12:00", alasan: "Kartu rusak" } });
await manual("manual: piket LAIN (akun piket kedua) menimpa entri piket DITERIMA", piket2, TM, "555", "izin", { tap: { masuk: "07:14:00" } });
await manual("manual: waka menimpa entri piket DITERIMA", waka, TM, "555", "izin", { tap: { masuk: "07:13:00" } });
await manual("manual: setelah ditimpa waka, piket tidak dapat menimpa lagi", piket, TM, "555", "tolak");

// ---- hapus
const hapusMan = (u, t, n, o = {}) => ({ ...act(u, o.aksi ?? "hapus-manual", o.act ?? {}).body, [MT(t, n)]: null, ...(o.tanpaSalinan ? {} : { [MS(n, t)]: null }) });
await manual("manual: siapkan entri piket untuk dihapus (nis 341)", piket, TM, "341", "izin");
await uji("manual: piket hapus TANPA log DITOLAK", piket, "PATCH", "", { [MT(TM, "341")]: null, [MS("341", TM)]: null }, "tolak");
await uji("manual: piket hapus dengan log aksi 'presensi-manual' DITOLAK", piket, "PATCH", "", hapusMan(piket, TM, "341", { aksi: "presensi-manual" }), "tolak");
await uji("manual: piket hapus entri tetapi SALINAN tertinggal DITOLAK", piket, "PATCH", "", hapusMan(piket, TM, "341", { tanpaSalinan: true }), "tolak");
await uji("manual: piket hapus HANYA salinan (entri tetap) DITOLAK", piket, "PATCH", "", { ...act(piket, "hapus-manual").body, [MS("341", TM)]: null }, "tolak");
await uji("manual: piket TIDAK bisa menghapus entri waka (331)", piket, "PATCH", "", hapusMan(piket, TM, "331"), "tolak");
await uji("manual: piket hapus entri piket + salinan + log 'hapus-manual' DITERIMA", piket, "PATCH", "", hapusMan(piket, TM, "341"), "izin");
await cek("manual: entri & salinan hilang setelah dihapus", waka, MT(TM, "341"), (j) => j === null);
await uji("manual: waka hapus entri (331) + salinan DITERIMA", waka, "PATCH", "", hapusMan(waka, TM, "331", { act: { tanpa: true } }), "izin");
await tolak("manual: waka TIDAK bisa menghapus salinan sendirian", waka, "DELETE", MS("555", TM));

// ---- peran lain & baca
await tolak("manual: kepala TIDAK bisa menulis", kepala, "PATCH", "", manualBody(kepala, TM, "321"));
await tolak("manual: admin TIDAK bisa menulis", admin, "PATCH", "", manualBody(admin, TM, "321"));
await tolak("manual: ortu TIDAK bisa menulis (salinan anak sendiri)", ortu1, "PUT", MS("111", "2026-10-06"), { status: "Hadir", masuk: "07:00:00", alasan: "Lainnya" });
await tolak("manual: alat TIDAK bisa menulis", dev, "PATCH", "", manualBody(dev, TM, "321", { act: { tanpa: true } }));
await tolak("manual: anonim TIDAK bisa menulis", null, "PUT", MT(TM, "321"), { masuk: "07:10:00", status: "Hadir", alasan: "Lupa KTM", oleh: "x", ts: SV, hariKe: HKM });
await tolak("manual: orang tanpa peran TIDAK bisa menulis", orang, "PATCH", "", manualBody(orang, TM, "321", { act: { tanpa: true } }));
for (const [nama, who] of [["admin", admin], ["kepala", kepala], ["waka", waka], ["piket", piket]]) await izin(`manual: ${nama} membaca manualTap`, who, "GET", `manualTap/${TM}`);
await tolak("manual: ortu TIDAK bisa membaca manualTap", ortu1, "GET", `manualTap/${TM}`);
await tolak("manual: alat TIDAK bisa membaca manualTap", dev, "GET", `manualTap/${TM}`);
await tolak("manual: anonim TIDAK bisa membaca manualTap", null, "GET", "manualTap");
await tolak("manual: ortu TIDAK bisa membaca seluruh manualTapByStudent", ortu1, "GET", "manualTapByStudent");
await tolak("manual: ortu TIDAK bisa membaca salinan anak orang lain", ortu1, "GET", MS("222", TM));
await izin("manual: ortu 2 membaca salinan anaknya sendiri bila ada / kosong", ortu2, "GET", MS("222", TM));
await tolak("manual: piket TIDAK bisa membaca manualTapByStudent", piket, "GET", MS("555", TM));
await izin("manual: admin/kepala membaca manualTapByStudent", kepala, "GET", MS("555", TM));

// ---- jalur alat TIDAK tersentuh: manual tidak dapat menulis ke attendance milik alat
await uji("manual: piket TIDAK bisa menyertakan attendance/status pada update manual", piket, "PATCH", "", { ...manualBody(piket, TM, "321"), [`attendance/321/${TM}/status`]: "Hadir" }, "tolak");
await uji("manual: piket TIDAK bisa menyertakan attendance/masuk pada update manual", piket, "PATCH", "", { ...manualBody(piket, TM, "321"), [`attendance/321/${TM}/masuk`]: "07:10:00" }, "tolak");
await uji("manual: piket TIDAK bisa menyertakan log/ pada update manual", piket, "PATCH", "", { ...manualBody(piket, TM, "321"), [`log/${TM}/XXXX_M`]: { jam: "07:10:00", nis: "321", status: "Hadir" } }, "tolak");
await tolak("manual: waka TIDAK bisa menulis attendance/status (tetap hanya alat)", waka, "PUT", `attendance/321/${TM}/status`, "Hadir");

// ---- saran baru: lupaKtm / ktmHilang (id deterministik {tgl}_{tipe})
await saran("saran: waka menyetujui 'lupaKtm'", waka, "555", TM, "lupaKtm", "izin");
await saran("saran: waka menyetujui 'ktmHilang'", waka, "666", TM, "ktmHilang", "izin");
await saran("saran: tipe tak dikenal ('bebas') DITOLAK", waka, "777", TM, "bebas", "tolak");
await izin("autoMap: waka memetakan lupaKtm", waka, "PUT", "discipline/autoMap/lupaKtm", "rg14");
await izin("autoMap: waka memetakan ktmHilang", waka, "PUT", "discipline/autoMap/ktmHilang", "rg15");
await tolak("autoMap: kunci tak dikenal DITOLAK", waka, "PUT", "discipline/autoMap/bebas", "rg14");

seksi("KALENDER HARI EFEKTIF — kalender (override), kalenderEfektif (ringkasan agregat), ambang, aktifSejak");
const OV = (u, o = {}) => ({ status: "libur", alasan: "Tanggal merah nasional", oleh: u.uid, ts: SV, ...o });
const KE = (o = {}) => ({ efektif: true, tap: 5, manual: 0, sumber: "otomatis", dihitung: SV, ...o });
const keBody = (u, t, o = {}, a = {}) => ({ ...(PERAN.get(u.uid) === "piket" ? act(u, a.aksi ?? "hitung-kalender", a.act ?? {}).body : {}), [`kalenderEfektif/${t}`]: KE(o) });

// ---- override kalender (waka & admin)
await izin("kalender: waka mengatur libur", waka, "PUT", "kalender/2026-11-02", OV(waka));
await izin("kalender: admin mengatur efektif", admin, "PUT", "kalender/2026-11-03", OV(admin, { status: "efektif", alasan: "Masuk menggantikan Sabtu" }));
for (const [nama, who] of [["kepala", kepala], ["piket", piket], ["ortu", ortu1], ["alat", dev], ["orang tanpa peran", orang]]) await tolak(`kalender: ${nama} TIDAK bisa mengatur override`, who, "PUT", "kalender/2026-11-04", OV(who));
await tolak("kalender: anonim TIDAK bisa mengatur override", null, "PUT", "kalender/2026-11-04", OV(waka));
const kbad = (nama, o, t = "2026-11-04") => tolak(`kalender: ${nama} ditolak`, waka, "PUT", `kalender/${t}`, OV(waka, o));
await kbad("status tak dikenal", { status: "cuti" });
await kbad("alasan 2 karakter", { alasan: "ab" });
await kbad("alasan > 200 karakter", { alasan: "x".repeat(201) });
await kbad("alasan hilang", { alasan: undefined });
await kbad("oleh bukan pengguna", { oleh: admin.uid });
await kbad("ts basi", { ts: 1000 });
await kbad("field asing", { rahasia: 1 });
await kbad("kunci tanggal salah", {}, "04-11-2026");
await izin("kalender: semua pengguna login membaca (ortu)", ortu1, "GET", "kalender");
await izin("kalender: kepala membaca", kepala, "GET", "kalender/2026-11-02");
await izin("kalender: piket membaca", piket, "GET", "kalender/2026-11-02");
await tolak("kalender: anonim TIDAK bisa membaca", null, "GET", "kalender");
await tolak("kalender: kepala TIDAK bisa menghapus override", kepala, "DELETE", "kalender/2026-11-03");
await izin("kalender: admin menghapus override (11-03)", admin, "DELETE", "kalender/2026-11-03");

// ---- kalenderEfektif: siapa boleh menulis
await izin("kalenderEfektif: waka menulis ringkasan otomatis", waka, "PUT", "kalenderEfektif/2026-11-05", KE());
await izin("kalenderEfektif: admin menulis", admin, "PUT", "kalenderEfektif/2026-11-06", KE());
await izin("kalenderEfektif: kepala menulis", kepala, "PUT", "kalenderEfektif/2026-11-09", KE({ tap: 40 }));
for (const [nama, who] of [["ortu", ortu1], ["alat", dev], ["orang tanpa peran", orang]]) await tolak(`kalenderEfektif: ${nama} TIDAK bisa menulis`, who, "PUT", "kalenderEfektif/2026-11-10", KE());
await tolak("kalenderEfektif: anonim TIDAK bisa menulis", null, "PUT", "kalenderEfektif/2026-11-10", KE());
await uji("kalenderEfektif: piket + log 'hitung-kalender' menulis", piket, "PATCH", "", keBody(piket, "2026-11-10"), "izin");
await uji("kalenderEfektif: piket TANPA log DITOLAK", piket, "PATCH", "", keBody(piket, "2026-11-11", {}, { act: { tanpa: true } }), "tolak");
await uji("kalenderEfektif: piket log aksi salah ('izin-harian') DITOLAK", piket, "PATCH", "", keBody(piket, "2026-11-11", {}, { aksi: "izin-harian" }), "tolak");
await uji("kalenderEfektif: piket penanda log tanpa ENTRI DITOLAK", piket, "PATCH", "", keBody(piket, "2026-11-11", {}, { act: { tanpaEntri: true } }), "tolak");
await izin("kalenderEfektif: semua pengguna login membaca (ortu)", ortu1, "GET", "kalenderEfektif/2026-11-05");
await tolak("kalenderEfektif: anonim TIDAK bisa membaca", null, "GET", "kalenderEfektif");

// ---- isi & konsistensi bukti
const kebad = (nama, o, t = "2026-11-12", who = waka) => tolak(`kalenderEfektif: ${nama} ditolak`, who, "PUT", `kalenderEfektif/${t}`, KE(o));
await kebad("efektif TANPA bukti (tap 0 + manual 0, otomatis)", { tap: 0, manual: 0 });
await izin("kalenderEfektif: tidak efektif walau ada tap (mis. Minggu) diterima", waka, "PUT", "kalenderEfektif/2026-11-13", KE({ efektif: false, tap: 40 }));
await izin("kalenderEfektif: bukti hanya dari manual (tap 0, manual 1) -> efektif", waka, "PUT", "kalenderEfektif/2026-11-14", KE({ tap: 0, manual: 1 }));
await kebad("tap negatif", { tap: -1 });
await kebad("tap pecahan", { tap: 1.5 });
await kebad("tap 5001", { tap: 5001 });
await kebad("manual negatif", { manual: -1 });
await kebad("efektif bukan boolean", { efektif: "ya" });
await kebad("sumber tak dikenal", { sumber: "manual" });
await kebad("dihitung basi", { dihitung: 1000 });
await kebad("rendah bukan boolean", { rendah: "ya" });
await kebad("field asing", { rahasia: 1 });
await kebad("tanpa tap (field wajib)", { tap: undefined });
await kebad("kunci tanggal salah", {}, "12-11-2026");
await izin("kalenderEfektif: rendah=true diterima", waka, "PUT", "kalenderEfektif/2026-11-16", KE({ rendah: true }));

// ---- ambang (sistem/ambangHariEfektif): dibaca semua staf, diubah waka/admin, int 1..500
await izin("ambang: waka mengubah menjadi 5", waka, "PUT", "sistem/ambangHariEfektif", 5);
await izin("ambang: admin membaca", admin, "GET", "sistem/ambangHariEfektif");
await izin("ambang: piket membaca", piket, "GET", "sistem/ambangHariEfektif");
await izin("ambang: kepala membaca", kepala, "GET", "sistem/ambangHariEfektif");
await tolak("ambang: ortu TIDAK bisa membaca", ortu1, "GET", "sistem/ambangHariEfektif");
await tolak("ambang: waka TIDAK bisa membaca node sistem lain (backup)", waka, "GET", "sistem");
for (const [nama, who] of [["kepala", kepala], ["piket", piket], ["ortu", ortu1], ["alat", dev]]) await tolak(`ambang: ${nama} TIDAK bisa mengubah`, who, "PUT", "sistem/ambangHariEfektif", 3);
for (const v of [0, 501, 2.5, "5", -1]) await tolak(`ambang: nilai ${JSON.stringify(v)} ditolak`, waka, "PUT", "sistem/ambangHariEfektif", v);
await tolak("ambang: waka TIDAK bisa menulis backupTerakhir (hanya admin)", waka, "PUT", "sistem/backupTerakhir", SV);
await kebad("ambang 5: efektif dengan 4 bukti (3 tap + 1 manual)", { tap: 3, manual: 1 }, "2026-11-17");
await izin("ambang 5: efektif dengan 5 bukti (3 tap + 2 manual)", waka, "PUT", "kalenderEfektif/2026-11-17", KE({ tap: 3, manual: 2 }));
await izin("ambang: admin mengembalikan ke 1", admin, "PUT", "sistem/ambangHariEfektif", 1);
await izin("ambang 1: 1 bukti sudah cukup", waka, "PUT", "kalenderEfektif/2026-11-18", KE({ tap: 1 }));

// ---- override menang atas hitungan otomatis
await izin("override: waka mengatur LIBUR untuk 2026-11-19", waka, "PUT", "kalender/2026-11-19", OV(waka));
await kebad("override libur: ringkasan 'otomatis' ditolak (tidak boleh menimpa override)", { efektif: false, tap: 40 }, "2026-11-19");
await kebad("override libur: ringkasan 'override' tetapi efektif=true ditolak", { sumber: "override", efektif: true, tap: 40 }, "2026-11-19");
await izin("override libur: ringkasan 'override' efektif=false diterima", waka, "PUT", "kalenderEfektif/2026-11-19", KE({ sumber: "override", efektif: false, tap: 40 }));
await kebad("tanpa override: sumber 'override' ditolak", { sumber: "override", efektif: false }, "2026-11-20");
await uji("override efektif TANPA bukti + ringkasan dalam SATU update diterima (hari pengganti)", waka, "PATCH", "", { "kalender/2026-11-20": OV(waka, { status: "efektif", alasan: "Hari pengganti" }), "kalenderEfektif/2026-11-20": KE({ sumber: "override", efektif: true, tap: 0, manual: 0 }) }, "izin");
await kebad("override efektif: ringkasan efektif=false ditolak", { sumber: "override", efektif: false, tap: 0 }, "2026-11-20");
await uji("override dihapus + ringkasan otomatis dalam satu update diterima", waka, "PATCH", "", { "kalender/2026-11-20": null, "kalenderEfektif/2026-11-20": KE({ efektif: false, tap: 0, manual: 0 }) }, "izin");
// per-field (cara klien memperbarui tanpa menghapus 'normal')
await izin("kalenderEfektif: pembaruan per-field (tap & dihitung)", waka, "PATCH", "", { "kalenderEfektif/2026-11-05/tap": 6, "kalenderEfektif/2026-11-05/dihitung": SV });

// ---- konfirmasi "hari ini normal"
await izin("normal: waka menandai", waka, "PUT", "kalenderEfektif/2026-11-16/normal", true);
await izin("normal: admin menandai", admin, "PUT", "kalenderEfektif/2026-11-05/normal", true);
await tolak("normal: kepala TIDAK bisa menandai", kepala, "PUT", "kalenderEfektif/2026-11-09/normal", true);
await uji("normal: piket (dengan log) TIDAK bisa menandai", piket, "PATCH", "", { ...act(piket, "hitung-kalender").body, "kalenderEfektif/2026-11-10/normal": true }, "tolak");
await tolak("normal: nilai false ditolak", waka, "PUT", "kalenderEfektif/2026-11-14/normal", false);

// ---- aktifSejak (profiles/{nis}/aktifSejak): admin menulis, ortu membaca milik anak
await izin("aktifSejak: admin menulis", admin, "PUT", "profiles/111/aktifSejak", "2026-10-14");
await tolak("aktifSejak: format salah ditolak", admin, "PUT", "profiles/111/aktifSejak", "14-10-2026");
await tolak("aktifSejak: bukan teks ditolak", admin, "PUT", "profiles/111/aktifSejak", 20261014);
await tolak("aktifSejak: waka TIDAK bisa menulis", waka, "PUT", "profiles/111/aktifSejak", "2026-10-14");
await tolak("aktifSejak: ortu TIDAK bisa menulis", ortu1, "PUT", "profiles/111/aktifSejak", "2026-01-01");
await cek("aktifSejak: ortu membaca profil anak sendiri berikut aktifSejak", ortu1, "profiles/111", (j) => j?.aktifSejak === "2026-10-14" && j.nama);
await tolak("aktifSejak: ortu TIDAK bisa membaca profil anak lain", ortu1, "GET", "profiles/222/aktifSejak");

seksi("WALI KELAS — pemetaan kelas, wewenang hanya untuk siswa binaan");
const waliA = await buatUser("walia@uji.test"); // kelas utama X
const waliB = await buatUser("walib@uji.test"); // kelas utama XI + tambahan XII
const waliC = await buatUser("walic@uji.test"); // kelas utama X (wali kedua kelas yang sama)
const wBaru1 = await buatUser("wbaru1@uji.test");
const wBaru2 = await buatUser("wbaru2@uji.test");
const wBaru3 = await buatUser("wbaru3@uji.test");
for (const u of [waliA, waliB, waliC, wBaru1, wBaru2, wBaru3]) PERAN.set(u.uid, "wali");
const stf = (nama, kelasUtama, tambahan) => ({ email: `${nama}@uji.test`, nama, role: "wali", dibuat: 1, kelasUtama, ...(tambahan ? { kelasTambahan: tambahan } : {}) });
const sd = (n) => ({ jenis: "pelanggaran", nama: "Seed", poin: 5, tanggal: TGL, ta: TA, sumber: "manual" });
await http("PATCH", "", { owner: true, body: {
  [`roles/${waliA.uid}`]: "wali", [`roles/${waliB.uid}`]: "wali", [`roles/${waliC.uid}`]: "wali",
  [`staff/${waliA.uid}`]: stf("walia", "X"), [`staff/${waliB.uid}`]: stf("walib", "XI", { XII: true }), [`staff/${waliC.uid}`]: stf("walic", "X"),
  "siswaKelas/701": "X", "siswaKelas/702": "X", "siswaKelas/703": "XI", "siswaKelas/704": "XII", "siswaKelas/705": "XIII",
  ...Object.fromEntries(["701", "702", "703", "704", "705"].flatMap((n) => [
    [`profiles/${n}`, { nama: `SISWA ${n}`, kelas: "?" }], [`attendance/${n}/${TGL}`, { masuk: "06:50:00", status: "Hadir" }],
    [`discipline/records/${n}/recW`, sd(n)], [`discipline/recordMeta/${n}/recW`, { dibuatOleh: waka.uid, dibuatNama: "Waka", dibuatTs: 1000 }],
    [`discipline/notes/${n}/recW`, "catatan internal"], [`lessonsByStudent/${n}/${TGL}/2`, { k: "S" }],
    [`manualTapByStudent/${n}/${TGL}`, { masuk: "07:10:00", status: "Hadir", alasan: "Lupa KTM" }], [`validasiByStudent/${n}/${TGL}`, { status: "Alfa" }],
  ])),
  [`validasi/${HT}/702`]: { status: "Alfa", oleh: waka.uid, ts: 1 },
  // catatan bersumber 'manual' yang pencatatnya (dibuatOleh) adalah wali A: wali tetap TIDAK boleh menghapusnya (hanya sumber 'wali')
  "discipline/records/701/recMan": sd("701"), "discipline/recordMeta/701/recMan": { dibuatOleh: waliA.uid, dibuatNama: "Bu Wali", dibuatTs: 1000 },
}});

// v2.3.1: wali TIDAK dapat mengisi A per jam (diuji di sini karena akun wali baru dibuat pada bagian ini)
await uji("lapis: wali TIDAK mengisi A", waliA, "PATCH", "", aSet(waliA, "5102", 5), "tolak");
await uji("lapis: wali TIDAK mengisi A (tanpa salinan)", waliA, "PATCH", "", aSet(waliA, "5102", 5, tanpaS), "tolak");

// ---- BACA: hanya siswa binaan (kelas utama dan tambahan)
const BACA = (n) => [`profiles/${n}`, `attendance/${n}`, `attendance/${n}/${TGL}`, `discipline/records/${n}`, `discipline/recordMeta/${n}`, `discipline/notes/${n}`, `lessonsByStudent/${n}`, `manualTapByStudent/${n}`, `validasiByStudent/${n}`];
for (const p of BACA("701")) { await izin(`wali A (X) membaca ${p}`, waliA, "GET", p); await izin(`wali C (X) membaca ${p}`, waliC, "GET", p); await tolak(`wali B (XI+XII) TIDAK membaca ${p} (kelas X)`, waliB, "GET", p); }
for (const p of BACA("703")) { await tolak(`wali A TIDAK membaca ${p} (kelas XI)`, waliA, "GET", p); await izin(`wali B membaca ${p} (kelas utama XI)`, waliB, "GET", p); }
for (const p of BACA("704")) { await tolak(`wali A TIDAK membaca ${p} (kelas XII)`, waliA, "GET", p); await izin(`wali B membaca ${p} (kelas TAMBAHAN XII)`, waliB, "GET", p); }
for (const p of BACA("705")) { await tolak(`wali A TIDAK membaca ${p} (kelas tanpa wali ini)`, waliA, "GET", p); await tolak(`wali B TIDAK membaca ${p}`, waliB, "GET", p); }
await tolak("siswa TANPA indeks siswaKelas tidak dapat dibina (profiles/111)", waliA, "GET", "profiles/111");
await tolak("ortu 1 tetap TIDAK membaca anak orang lain", ortu1, "GET", "profiles/701");
await izin("ortu 1 tetap membaca anaknya sendiri", ortu1, "GET", "profiles/111");
// bukan milik wali sama sekali
for (const [p, ket] of [["config/students", "daftar siswa & UID kartu"], ["log", "log tap"], [`log/${TGL}`, "log satu tanggal"], ["attendance", "seluruh presensi"], ["profiles", "seluruh profil"], ["izin", "izin"], [`izin/${TGL}`, "izin satu tanggal"], ["izinMeta", "izinMeta"], ["manualTap", "manualTap"], ["activity", "log aktivitas"], [`activity/${TGLN}`, "log aktivitas satu hari"], ["piketAkun", "akun piket"], ["piketPerangkat", "perangkat piket"], ["sistem", "node sistem"], ["sistem/backupTerakhir", "backup"], ["parents", "parents"], ["device", "alat"], ["unknown", "kartu tak dikenal"], ["staff", "seluruh staff"], [`staff/${waliB.uid}`, "staff wali lain"], [`roles/${waliB.uid}`, "role orang lain"], ["discipline/recordMeta", "seluruh recordMeta"], ["discipline/audit", "audit"], ["piketHarian", "piketHarian"], ["lessons", "lessons"], ["validasi", "validasi"]]) {
  await tolak(`wali TIDAK membaca ${ket} (${p})`, waliA, "GET", p);
}
await izin("wali membaca staff miliknya sendiri (kelas binaan)", waliA, "GET", `staff/${waliA.uid}`);
await izin("wali membaca role miliknya sendiri", waliA, "GET", `roles/${waliA.uid}`);
for (const [p, ket] of [["kalender", "kalender"], ["kalenderEfektif", "kalenderEfektif"], ["config/schedule", "jadwal"], ["discipline/rules", "tata tertib"], ["discipline/levels", "ambang"], ["discipline/settings", "pengaturan jendela"], ["sistem/ambangHariEfektif", "ambang hari efektif"]]) await izin(`wali membaca ${ket}`, waliA, "GET", p);

// ---- indeks siswaKelas: wali hanya boleh QUERY kelas binaannya
const qSK = (v) => `siswaKelas?orderBy=${encodeURIComponent('"$value"')}&equalTo=${encodeURIComponent(JSON.stringify(v))}`;
await izin("siswaKelas: wali A query kelas X", waliA, "GET", qSK("X"));
await cek("siswaKelas: hasil query wali A = siswa kelas X saja", waliA, qSK("X"), (j) => Object.keys(j ?? {}).sort().join() === "701,702");
await tolak("siswaKelas: wali A query kelas XI (bukan binaannya)", waliA, "GET", qSK("XI"));
await izin("siswaKelas: wali B query kelas utama XI", waliB, "GET", qSK("XI"));
await izin("siswaKelas: wali B query kelas tambahan XII", waliB, "GET", qSK("XII"));
await tolak("siswaKelas: wali B query kelas X", waliB, "GET", qSK("X"));
await tolak("siswaKelas: wali membaca seluruh node (tanpa query)", waliA, "GET", "siswaKelas");
await tolak("siswaKelas: wali membaca tanpa equalTo", waliA, "GET", `siswaKelas?orderBy=${encodeURIComponent('"$value"')}`);
await tolak("siswaKelas: wali membaca satu NIS langsung", waliA, "GET", "siswaKelas/703");
await izin("siswaKelas: admin membaca seluruh node", admin, "GET", "siswaKelas");
await izin("siswaKelas: waka membaca seluruh node", waka, "GET", "siswaKelas");
await izin("siswaKelas: kepala membaca seluruh node", kepala, "GET", "siswaKelas");
await tolak("siswaKelas: ortu TIDAK membaca", ortu1, "GET", "siswaKelas");
await tolak("siswaKelas: piket TIDAK membaca", piket, "GET", "siswaKelas");
await tolak("siswaKelas: anonim TIDAK membaca", null, "GET", "siswaKelas");
await izin("siswaKelas: admin menulis", admin, "PUT", "siswaKelas/706", "X");
await izin("siswaKelas: admin mengubah kelas siswa", admin, "PUT", "siswaKelas/706", "XI");
await izin("siswaKelas: admin menghapus", admin, "DELETE", "siswaKelas/706");
for (const [nama, who] of [["waka", waka], ["kepala", kepala], ["wali", waliA], ["piket", piket], ["ortu", ortu1], ["alat", dev]]) await tolak(`siswaKelas: ${nama} TIDAK menulis`, who, "PUT", "siswaKelas/706", "X");
await tolak("siswaKelas: nilai berisi karakter terlarang ditolak", admin, "PUT", "siswaKelas/706", "X.A");
await tolak("siswaKelas: nilai bukan teks ditolak", admin, "PUT", "siswaKelas/706", 5);
await tolak("siswaKelas: nilai 46 karakter ditolak", admin, "PUT", "siswaKelas/706", "K".repeat(46));
await tolak("siswaKelas: NIS bukan angka ditolak", admin, "PUT", "siswaKelas/abc", "X");

// ---- WRITE izin harian (Izin/Sakit; BUKAN Dispensasi; hanya siswa binaan)
const hW = (nama, who, n, ket, mo, harap, o) => harian(nama, who, HT, n, ket, mo, harap, o);
await hW("wali A: Sakit untuk siswa binaan (701) + izinMeta + log", waliA, "701", "Sakit", {}, "izin");
await hW("wali A: Izin untuk siswa binaan (701, hari lain)", waliA, "701", "Izin", {}, "izin");
await harian("wali A: Izin dengan hariKe 2 hari lalu (batas jendela) DITERIMA", waliA, "2026-10-21", "701", "Izin", { hariKe: HK - 2 }, (HK - 2 + 4) % 7 === 0 ? "izin" : "izin");
await harian("wali A: hariKe 3 hari lalu DITOLAK", waliA, "2026-10-21", "701", "Izin", { hariKe: HK - 3 }, "tolak");
await hW("wali A: Dispensasi DITOLAK (hanya Izin/Sakit)", waliA, "701", "Dispensasi", {}, "tolak");
await hW("wali A: izin berlabel meta 'Dispensasi' DITOLAK", waliA, "701", "Izin", { ket: "Dispensasi" }, "tolak");
await hW("wali A: siswa kelas XI (703) DITOLAK", waliA, "703", "Sakit", {}, "tolak");
await hW("wali A: siswa kelas XII (704) DITOLAK", waliA, "704", "Sakit", {}, "tolak");
await hW("wali A: siswa tanpa indeks (111) DITOLAK", waliA, "111", "Sakit", {}, "tolak");
await hW("wali B: siswa kelas tambahan (704) DITERIMA", waliB, "704", "Sakit", {}, "izin");
await hW("wali B: siswa kelas X (701) DITOLAK", waliB, "701", "Sakit", {}, "tolak");
await hW("wali TANPA log aktivitas DITOLAK", waliA, "701", "Sakit", {}, "tolak", { act: { tanpa: true }, metaKey: "tanpaLog_H" });
await hW("wali log aksi salah ('izin-jam') DITOLAK", waliA, "701", "Sakit", {}, "tolak", { aksi: "izin-jam" });
await hW("wali log aksi 'pelanggaran' DITOLAK", waliA, "701", "Sakit", {}, "tolak", { aksi: "pelanggaran" });
await hW("wali penanda log tanpa ENTRI DITOLAK", waliA, "701", "Sakit", {}, "tolak", { act: { tanpaEntri: true } });
await hW("wali activityLast basi DITOLAK", waliA, "701", "Sakit", {}, "tolak", { act: { last: { ts: 1000 } } });
await hW("wali TANPA izinMeta baru DITOLAK", waliA, "701", "Sakit", {}, "tolak", { tanpaMeta: true });
await hW("wali izinMeta ts basi DITOLAK", waliA, "701", "Sakit", { ts: 1000 }, "tolak");
await hW("wali izinMeta berkunci bukan awalan id log DITOLAK", waliA, "701", "Sakit", {}, "tolak", { metaKey: "bebas_H" });
await hW("wali izinMeta lingkup 'jam' DITOLAK", waliA, "701", "Sakit", { lingkup: "jam", jam: { 0: 3 } }, "tolak");
await hW("wali DITOLAK bila Alfa sudah divalidasi waka (702)", waliA, "702", "Sakit", {}, "tolak");
await uji("wali: hapus keterangan miliknya + log 'hapus-izin' DITERIMA", waliA, "PATCH", "", { ...act(waliA, "hapus-izin").body, [`izin/${HT}/701`]: null, [`attendance/701/${HT}/ket`]: null, [`attendance/701/${HT}/catatan`]: null }, "izin");
await uji("wali: hapus keterangan TANPA log DITOLAK", waliA, "PATCH", "", { [`izin/${HT}/704`]: null, [`attendance/704/${HT}/ket`]: null }, "tolak");
await uji("wali: hapus keterangan siswa kelas lain DITOLAK", waliA, "PATCH", "", { ...act(waliA, "hapus-izin").body, [`izin/${HT}/704`]: null }, "tolak");
await uji("wali: hapus HANYA izin/ dengan log aksi salah DITOLAK", waliA, "PATCH", "", { ...act(waliA, "izin-harian").body, [`izin/${HT}/704`]: null }, "tolak");
// hak yang TIDAK dimiliki wali
await jam("wali: sel per jam (S) DITOLAK", waliA, "701", [3], "S", {}, "tolak");
await jam("wali: sel per jam (D) DITOLAK", waliA, "701", [4], "D", {}, "tolak");
await tolak("wali TIDAK menulis sel A per jam", waliA, "PUT", `lessons/${HT}/XI IPS/absen/701/2`, "A");
await tolak("wali TIDAK menulis lessonsByStudent", waliA, "PUT", `lessonsByStudent/701/${HT}/2`, { k: "S" });
await tolak("wali TIDAK menulis validasi Alfa", waliA, "PUT", `validasi/${HT}/701`, { status: "Alfa", oleh: waliA.uid, ts: SV });
await tolak("wali TIDAK menulis validasiByStudent", waliA, "PUT", `validasiByStudent/701/${HT}`, { status: "Alfa" });
await uji("wali TIDAK mencatat presensi manual", waliA, "PATCH", "", manualBody(waliA, TM, "701"), "tolak");
await tolak("wali TIDAK menulis attendance masuk", waliA, "PUT", `attendance/701/${HT}/masuk`, "07:00:00");
await tolak("wali TIDAK menulis attendance status", waliA, "PUT", `attendance/701/${HT}/status`, "Hadir");
await tolak("wali TIDAK menulis log tap", waliA, "PUT", `log/${HT}/AAAA7777_M`, { jam: "07:00:00", nis: "701", status: "Hadir" });
await tolak("wali TIDAK mengatur kalender (override)", waliA, "PUT", "kalender/2026-11-25", OV(waliA));
await uji("wali TIDAK menulis kalenderEfektif", waliA, "PATCH", "", { ...act(waliA, "hitung-kalender").body, "kalenderEfektif/2026-11-25": KE() }, "tolak");
await tolak("wali TIDAK mengubah ambang hari efektif", waliA, "PUT", "sistem/ambangHariEfektif", 3);
await tolak("wali TIDAK mengubah jendela mundur", waliA, "PUT", "discipline/settings/piketMundurHari", 5);
await tolak("wali TIDAK mengubah master pelanggaran", waliA, "PUT", "discipline/rules/rW", { kategori: "Ringan", nama: "x", poin: 5, aktif: true, diubahOleh: waliA.uid, diubahTs: SV });
await tolak("wali TIDAK mengubah master remisi", waliA, "PUT", "discipline/remisi/mW", { kelompok: "Prestasi", nama: "x", poin: 5, aktif: true, diubahOleh: waliA.uid, diubahTs: SV });
await tolak("wali TIDAK menulis catatan internal", waliA, "PUT", "discipline/notes/701/recX", "catatan");
await tolak("wali TIDAK menulis suggest", waliA, "PUT", sugPath(TGL, "terlambat", "701"), { keputusan: "diabaikan", oleh: waliA.uid, ts: SV, nis: "701" });
await tolak("wali TIDAK menulis piketHarian", waliA, "PUT", "piketHarian/2026-10-20/rx", { nis: "701", nama: "x", kelas: "X", pelanggaran: "x", petugas: "x", hariKe: HK, refId: "r1", poin: 5 });
await tolak("wali TIDAK menulis piketRoster", waliA, "PUT", "piketRoster/pX", { nama: "x", aktif: true });
await tolak("wali TIDAK menulis parents/profiles/config", waliA, "PUT", "profiles/701/nama", "UBAH");
await tolak("wali TIDAK menulis piketPerangkat", waliA, "PUT", "piketPerangkat/dev-wali-0001", { uid: waliA.uid, pertama: SV, label: "x" });

// ---- WRITE pelanggaran RINGAN / bertakziran (sumber 'wali'); remisi & Sedang/Berat ditolak
const waliPel = (u, n, id, ro = {}, mo = {}, o = {}) => ({
  ...(o.act?.tanpa ? {} : act(u, o.aksi ?? "pelanggaran", o.act ?? {}).body),
  [P(n, id)]: rec({ sumber: "wali", refId: "r1", kategori: "Ringan", nama: "Contoh", poin: 5, ...ro }),
  [M(n, id)]: meta(u, { dibuatNama: "Bu Wali", hariKe: HK, ...mo }),
});
const pw = (nama, who, n, id, ro, mo, harap, o) => uji(nama, who, "PATCH", "", waliPel(who, n, id, ro, mo, o), harap);
await pw("wali A: pelanggaran Ringan siswa binaan (701)", waliA, "701", "wp1", {}, {}, "izin");
await pw("wali A: pelanggaran bertakziran (Sedang + takziran)", waliA, "702", "wp2", { refId: "rT", kategori: "Sedang", nama: "Sedang bertakziran", poin: 50, takziran: "Bersihkan lorong" }, {}, "izin");
await pw("wali B: pelanggaran siswa kelas tambahan (704)", waliB, "704", "wp3", {}, {}, "izin");
await cek("wali: catatan terbaca waka dengan sumber 'wali' dan meta pencatat", waka, M("701", "wp1"), (j) => j?.dibuatOleh === waliA.uid && j.hariKe === HK);
await pw("wali A: siswa kelas XI (703) DITOLAK", waliA, "703", "wpx1", {}, {}, "tolak");
await pw("wali A: siswa tanpa indeks (111) DITOLAK", waliA, "111", "wpx2", {}, {}, "tolak");
await pw("wali B: siswa kelas X (701) DITOLAK", waliB, "701", "wpx3", {}, {}, "tolak");
await pw("wali: pelanggaran SEDANG tanpa takziran DITOLAK", waliA, "701", "wpx4", { refId: "rS", kategori: "Sedang", nama: "Sedang tanpa takziran", poin: 30 }, {}, "tolak");
await pw("wali: pelanggaran BERAT DITOLAK", waliA, "701", "wpx5", { refId: "rB", kategori: "Berat", nama: "Berat tanpa takziran", poin: 75 }, {}, "tolak");
await pw("wali: aturan NONAKTIF DITOLAK", waliA, "701", "wpx6", { refId: "rOff", nama: "Ringan nonaktif" }, {}, "tolak");
await pw("wali: poin diubah (bukan dari master) DITOLAK", waliA, "701", "wpx7", { poin: 4 }, {}, "tolak");
await pw("wali: nama diubah DITOLAK", waliA, "701", "wpx8", { nama: "Lain" }, {}, "tolak");
await pw("wali: takziran dikarang DITOLAK", waliA, "701", "wpx9", { takziran: "Push-up" }, {}, "tolak");
await pw("wali: kategori diubah DITOLAK", waliA, "701", "wpx10", { kategori: "Sedang" }, {}, "tolak");
await pw("wali: REMISI langsung DITOLAK", waliA, "701", "wpx11", { jenis: "remisi", refId: "m1", nama: "Contoh", poin: 10, kategori: undefined }, {}, "tolak");
await pw("wali: REMISI berkedok aturan pelanggaran aktif (refId r1) DITOLAK", waliA, "701", "wpx11b", { jenis: "remisi" }, {}, "tolak");
await pw("wali: sumber 'manual' (jalur staf) DITOLAK", waliA, "701", "wpx12", { sumber: "manual" }, {}, "tolak");
await pw("wali: sumber 'piket' DITOLAK", waliA, "701", "wpx13", { sumber: "piket" }, {}, "tolak");
await pw("wali: sumber 'saran' DITOLAK", waliA, "701", "wpx14", { sumber: "saran" }, {}, "tolak");
await pw("wali: TANPA log aktivitas DITOLAK", waliA, "701", "wpx15", {}, {}, "tolak", { act: { tanpa: true } });
await pw("wali: log aksi salah ('izin-harian') DITOLAK", waliA, "701", "wpx16", {}, {}, "tolak", { aksi: "izin-harian" });
await pw("wali: penanda log tanpa ENTRI DITOLAK", waliA, "701", "wpx17", {}, {}, "tolak", { act: { tanpaEntri: true } });
await pw("wali: meta TANPA hariKe DITOLAK", waliA, "701", "wpx18", {}, { hariKe: undefined }, "tolak");
await pw("wali: hariKe BESOK DITOLAK (tanpa masa depan)", waliA, "701", "wpx19", {}, { hariKe: HK + 1 }, "tolak");
await pw("wali: hariKe 3 hari lalu DITOLAK (jendela)", waliA, "701", "wpx20", {}, { hariKe: HK - 3 }, "tolak");
await pw("wali: hariKe tepat 2 hari lalu DITERIMA", waliA, "701", "wp4", {}, { hariKe: HK - 2 }, "izin");
await pw("wali: meta dibuatOleh bukan pengguna DITOLAK", waliA, "701", "wpx21", {}, { dibuatOleh: waka.uid }, "tolak");
await uji("wali: HANYA record tanpa meta DITOLAK", waliA, "PATCH", "", { ...act(waliA, "pelanggaran").body, [P("701", "wpx22")]: rec({ sumber: "wali", refId: "r1", kategori: "Ringan", nama: "Contoh", poin: 5 }) }, "tolak");
await uji("wali: TIDAK mengubah record yang sudah ada (edit poin)", waliA, "PATCH", "", { ...act(waliA, "ubah-pelanggaran").body, [`${P("701", "wp1")}/poin`]: 1 }, "tolak");
await uji("wali: TIDAK mengubah record milik waka (recW)", waliA, "PATCH", "", { ...act(waliA, "pelanggaran").body, [`${P("701", "recW")}/poin`]: 1, [`${M("701", "recW")}/diubahOleh`]: waliA.uid, [`${M("701", "recW")}/diubahTs`]: SV }, "tolak");
await tolak("wali TIDAK menulis recordMeta langsung", waliA, "PUT", M("701", "wpz"), meta(waliA, { hariKe: HK }));
// hapus (soft delete) hanya catatan wali itu sendiri
const waliHapus = (u, n, id, o = {}) => ({
  ...(o.act?.tanpa ? {} : act(u, o.aksi ?? "hapus-pelanggaran", o.act ?? {}).body), [P(n, id)]: null,
  [`${M(n, id)}/dihapus`]: true, [`${M(n, id)}/alasanHapus`]: "salah siswa", [`${M(n, id)}/snapshot`]: rec({ sumber: "wali", refId: "r1", kategori: "Ringan", nama: "Contoh", poin: 5 }),
  [`${M(n, id)}/diubahOleh`]: u.uid, [`${M(n, id)}/diubahTs`]: SV,
});
await uji("wali C (wali kedua kelas X) TIDAK menghapus catatan wali A", waliC, "PATCH", "", waliHapus(waliC, "701", "wp4"), "tolak");
await uji("wali A: hapus catatan wali TANPA log DITOLAK", waliA, "PATCH", "", waliHapus(waliA, "701", "wp4", { act: { tanpa: true } }), "tolak");
await uji("wali A: hapus catatan wali dengan log aksi salah DITOLAK", waliA, "PATCH", "", waliHapus(waliA, "701", "wp4", { aksi: "pelanggaran" }), "tolak");
await uji("wali A: hapus catatan WAKA (recW) DITOLAK", waliA, "PATCH", "", waliHapus(waliA, "701", "recW"), "tolak");
await uji("wali A: hapus catatan bersumber 'manual' walau dibuatOleh dirinya DITOLAK", waliA, "PATCH", "", waliHapus(waliA, "701", "recMan"), "tolak");
await uji("wali A: hapus catatan sendiri (soft delete) DITERIMA", waliA, "PATCH", "", waliHapus(waliA, "701", "wp4"), "izin");
await tolak("wali TIDAK menghapus fisik recordMeta", waliA, "DELETE", M("701", "wp1"));
await cek("wali: hasil soft delete: record hilang, meta menyimpan alasan", waka, M("701", "wp4"), (j) => j?.dihapus === true && j.alasanHapus === "salah siswa");

// ---- activity: wali menulis log sendiri
await izin("wali menulis log 'login' (tanpa petugas)", waliA, "PUT", `activity/${TGLN}/${idAct()}`, entriAct(waliA, "login"));
await tolak("wali mengaku peran 'waka' di log DITOLAK", waliA, "PUT", `activity/${TGLN}/${idAct()}`, entriAct(waliA, "login", { peran: "waka" }));
await tolak("wali dengan 'petugas' di log DITOLAK", waliA, "PUT", `activity/${TGLN}/${idAct()}`, entriAct(waliA, "login", { petugas: "Bu Rina" }));
await izin("wali: activityLast sendiri", waliA, "PUT", `activityLast/${waliA.uid}`, { id: idAct(), ts: SV, tgl: TGLN });
await tolak("wali: activityLast milik orang lain ditolak", waliA, "PUT", `activityLast/${waliB.uid}`, { id: idAct(), ts: SV, tgl: TGLN });

// ---- PEMBUATAN AKUN & KELAS: admin (semua), waka (hanya wali + kelas UTAMA)
const staffBaru = (uid, nama) => ({ [`staff/${uid}/email`]: `${nama}@uji.test`, [`staff/${uid}/nama`]: nama, [`staff/${uid}/role`]: "wali", [`staff/${uid}/dibuat`]: SV_ANGKA });
const SV_ANGKA = Date.now();
await uji("admin membuat wali: role + staff + kelasUtama + kelasTambahan", admin, "PATCH", "", { [`roles/${wBaru1.uid}`]: "wali", [`staff/${wBaru1.uid}`]: stf("wbaru1", "X", { XI: true, XII: true }) }, "izin");
await uji("waka membuat wali: role + staff per-field + kelasUtama", waka, "PATCH", "", { [`roles/${wBaru2.uid}`]: "wali", ...staffBaru(wBaru2.uid, "wbaru2"), [`staff/${wBaru2.uid}/kelasUtama`]: "XI" }, "izin");
await uji("waka membuat wali dengan kelasTambahan DITOLAK", waka, "PATCH", "", { [`roles/${wBaru3.uid}`]: "wali", ...staffBaru(wBaru3.uid, "wbaru3"), [`staff/${wBaru3.uid}/kelasUtama`]: "XI", [`staff/${wBaru3.uid}/kelasTambahan/XII`]: true }, "tolak");
await uji("waka menulis node staff utuh (termasuk kelasTambahan) DITOLAK", waka, "PATCH", "", { [`roles/${wBaru3.uid}`]: "wali", [`staff/${wBaru3.uid}`]: stf("wbaru3", "XI", { XII: true }) }, "tolak");
await uji("waka menulis node staff utuh TANPA kelasTambahan juga DITOLAK (hanya per-field)", waka, "PATCH", "", { [`roles/${wBaru3.uid}`]: "wali", [`staff/${wBaru3.uid}`]: stf("wbaru3", "XI") }, "tolak");
await tolak("waka TIDAK menambah kelasTambahan ke wali yang sudah ada", waka, "PUT", `staff/${wBaru2.uid}/kelasTambahan/XII`, true);
await tolak("waka TIDAK menghapus kelasTambahan", waka, "DELETE", `staff/${wBaru1.uid}/kelasTambahan/XI`);
await izin("admin menambah kelasTambahan", admin, "PUT", `staff/${wBaru2.uid}/kelasTambahan/XII`, true);
await izin("admin menghapus kelasTambahan", admin, "DELETE", `staff/${wBaru2.uid}/kelasTambahan/XII`);
await tolak("admin: kelasTambahan bernilai false ditolak", admin, "PUT", `staff/${wBaru2.uid}/kelasTambahan/XII`, false);
await tolak("admin: kunci kelasTambahan berisi titik ditolak", admin, "PUT", `staff/${wBaru2.uid}/kelasTambahan/X.A`, true);
await izin("waka mengganti kelasUtama wali (tepat 1 nilai)", waka, "PUT", `staff/${wBaru2.uid}/kelasUtama`, "X");
await izin("admin mengganti kelasUtama wali", admin, "PUT", `staff/${wBaru2.uid}/kelasUtama`, "XI");
await tolak("waka TIDAK menghapus kelasUtama", waka, "DELETE", `staff/${wBaru2.uid}/kelasUtama`);
await tolak("kelasUtama berisi karakter terlarang ditolak", waka, "PUT", `staff/${wBaru2.uid}/kelasUtama`, "X.A");
await tolak("kelasUtama kosong ditolak", waka, "PUT", `staff/${wBaru2.uid}/kelasUtama`, "");
await tolak("kelasUtama > 45 karakter ditolak", waka, "PUT", `staff/${wBaru2.uid}/kelasUtama`, "K".repeat(46));
await tolak("kelasUtama bukan teks ditolak", waka, "PUT", `staff/${wBaru2.uid}/kelasUtama`, 5);
await tolak("waka TIDAK mengatur kelasUtama akun PIKET", waka, "PUT", `staff/${piket.uid}/kelasUtama`, "X");
await tolak("waka TIDAK mengatur kelasUtama akun KEPALA", waka, "PUT", `staff/${kepala.uid}/kelasUtama`, "X");
await tolak("waka TIDAK mengubah nama/email akun wali yang sudah ada", waka, "PUT", `staff/${wBaru2.uid}/nama`, "Ganti");
await tolak("waka TIDAK mengubah role staff wali", waka, "PUT", `staff/${wBaru2.uid}/role`, "kepala");
await tolak("wali TIDAK mengubah kelasUtama sendiri", waliA, "PUT", `staff/${waliA.uid}/kelasUtama`, "XI");
await tolak("wali TIDAK menambah kelasTambahan sendiri", waliA, "PUT", `staff/${waliA.uid}/kelasTambahan/XI`, true);
await tolak("wali TIDAK mengubah staff orang lain", waliA, "PUT", `staff/${waliB.uid}/kelasUtama`, "X");
await tolak("wali TIDAK mengubah role sendiri", waliA, "PUT", `roles/${waliA.uid}`, "admin");
await tolak("wali TIDAK memberi role ke orang lain", waliA, "PUT", `roles/${orang.uid}`, "wali");
// role: batas wewenang waka & admin
await tolak("waka TIDAK memberi role 'kepala'", waka, "PUT", `roles/${orang.uid}`, "kepala");
await tolak("waka TIDAK memberi role 'waka'", waka, "PUT", `roles/${orang.uid}`, "waka");
await tolak("waka TIDAK memberi role 'admin'", waka, "PUT", `roles/${orang.uid}`, "admin");
await tolak("waka TIDAK memberi role 'device'", waka, "PUT", `roles/${orang.uid}`, "device");
await tolak("waka TIDAK memberi role 'wali' tanpa entri staff wali", waka, "PUT", `roles/${orang.uid}`, "wali");
await tolak("waka TIDAK memberi role 'wali' bila staff.role bukan wali (piket)", waka, "PUT", `roles/${piket2.uid}`, "wali");
await tolak("waka TIDAK mengganti role wali yang sudah ada (data ada)", waka, "PUT", `roles/${wBaru2.uid}`, "wali");
await tolak("waka TIDAK mencabut role kepala", waka, "DELETE", `roles/${kepala.uid}`);
await izin("waka mencabut akun wali (hapus role)", waka, "DELETE", `roles/${wBaru2.uid}`);
await izin("waka memasang kembali role wali (entri staff wali ada)", waka, "PUT", `roles/${wBaru2.uid}`, "wali");
await izin("admin mencabut akun wali", admin, "DELETE", `roles/${wBaru1.uid}`);
await izin("admin memasang role wali", admin, "PUT", `roles/${wBaru1.uid}`, "wali");
await tolak("admin TIDAK memberi role 'admin'", admin, "PUT", `roles/${orang.uid}`, "admin");
await tolak("admin TIDAK memberi role 'device'", admin, "PUT", `roles/${orang.uid}`, "device");
await tolak("kepala TIDAK memberi role wali", kepala, "PUT", `roles/${orang.uid}`, "wali");
await tolak("piket TIDAK memberi role wali", piket, "PUT", `roles/${orang.uid}`, "wali");
await tolak("role bernilai 'superuser' ditolak", admin, "PUT", `roles/${orang.uid}`, "superuser");
await tolak("staff: wali dengan role selain 'wali' oleh waka ditolak", waka, "PUT", `staff/${orang.uid}/role`, "piket");
// ---- isolasi lapisan (tiap uji hanya dapat ditolak oleh SATU aturan)
const waliKosong = await buatUser("walikosong@uji.test"); // akun wali TANPA kelasUtama (null === null tidak boleh membuka siswa tanpa indeks)
const wBaru4 = await buatUser("wbaru4@uji.test");
const wBaru5 = await buatUser("wbaru5@uji.test");
PERAN.set(waliKosong.uid, "wali"); PERAN.set(wBaru4.uid, "wali");
await http("PATCH", "", { owner: true, body: {
  [`roles/${waliKosong.uid}`]: "wali", [`staff/${waliKosong.uid}`]: { email: "wk@uji.test", nama: "wk", role: "wali", dibuat: 1 },
  [`staff/${wBaru4.uid}`]: stf("wbaru4", "X"), // entri staff wali ADA, role belum dipasang
  [`staff/${piket.uid}`]: { email: "pk@uji.test", nama: "pk", role: "piket", dibuat: 1, kelasUtama: "X" }, [`staff/${kepala.uid}`]: { email: "kp@uji.test", nama: "kp", role: "kepala", dibuat: 1, kelasUtama: "X" },
}});
await tolak("wali TANPA kelasUtama TIDAK membaca siswa tanpa indeks (111)", waliKosong, "GET", "profiles/111");
await tolak("wali TANPA kelasUtama TIDAK membaca siswa berindeks (701)", waliKosong, "GET", "profiles/701");
await tolak("akun PIKET yang punya staff.kelasUtama tidak mendapat wewenang wali (701)", piket, "GET", "profiles/701");
await uji("akun non-wali dengan kelasUtama TIDAK menulis pelanggaran jalur wali (piket, 701)", piket, "PATCH", "", waliPel(piket, "701", "wpn1"), "tolak");
await uji("waka TIDAK memberi role 'kepala' kepada akun yang punya entri staff wali", waka, "PATCH", "", { [`roles/${wBaru4.uid}`]: "kepala" }, "tolak");
await uji("waka TIDAK memberi role 'waka' kepada akun yang punya entri staff wali", waka, "PATCH", "", { [`roles/${wBaru4.uid}`]: "waka" }, "tolak");
await uji("waka memberi role 'wali' kepada akun yang punya entri staff wali DITERIMA", waka, "PATCH", "", { [`roles/${wBaru4.uid}`]: "wali" }, "izin");
await uji("waka TIDAK membuat entri staff dengan role 'piket' (per-field)", waka, "PATCH", "", { [`staff/${wBaru5.uid}/email`]: "x5@uji.test", [`staff/${wBaru5.uid}/nama`]: "x5", [`staff/${wBaru5.uid}/role`]: "piket", [`staff/${wBaru5.uid}/dibuat`]: SV_ANGKA }, "tolak");
await uji("waka TIDAK membuat entri staff dengan role 'kepala' (per-field)", waka, "PATCH", "", { [`staff/${wBaru5.uid}/email`]: "x5@uji.test", [`staff/${wBaru5.uid}/nama`]: "x5", [`staff/${wBaru5.uid}/role`]: "kepala", [`staff/${wBaru5.uid}/dibuat`]: SV_ANGKA }, "tolak");
await uji("waka TIDAK membuat staff tanpa field role (hasChildren) DITOLAK", waka, "PATCH", "", { [`staff/${wBaru5.uid}/email`]: "x5@uji.test", [`staff/${wBaru5.uid}/nama`]: "x5", [`staff/${wBaru5.uid}/dibuat`]: SV_ANGKA }, "tolak");
await uji("waka TIDAK mengisi nama dengan 61 karakter", waka, "PATCH", "", { ...staffBaru(wBaru5.uid, "x".repeat(61)) }, "tolak");
await tolak("waka TIDAK mengubah kelasUtama akun PIKET yang punya entri staff", waka, "PUT", `staff/${piket.uid}/kelasUtama`, "XI");
await tolak("waka TIDAK mengubah kelasUtama akun KEPALA yang punya entri staff", waka, "PUT", `staff/${kepala.uid}/kelasUtama`, "XI");
await tolak("waka TIDAK menulis kelasUtama akun tanpa staff.role (orang)", waka, "PUT", `staff/${orang.uid}/kelasUtama`, "X");
// stafnya sendiri tidak terbaca oleh waka (cermin waliAkun menjadi sumber tampilan waka)
await tolak("waka TIDAK membaca node staff", waka, "GET", "staff");
// waka/kepala/piket/ortu tidak punya hak wali
await tolak("piket tetap TIDAK membaca profil siswa binaan", piket, "GET", "profiles/701");
await tolak("ortu TIDAK menulis pelanggaran lewat jalur wali", ortu1, "PATCH", "", waliPel(ortu1, "111", "wpo1"));


// ---- cermin waliAkun (tampilan waka/kepala)
const cermin = (uid, nama, ku, aktif = true) => ({ [`waliAkun/${uid}/email`]: `${nama}@uji.test`, [`waliAkun/${uid}/nama`]: nama, [`waliAkun/${uid}/kelasUtama`]: ku, [`waliAkun/${uid}/aktif`]: aktif });
await uji("waliAkun: admin menulis cermin utuh", admin, "PUT", `waliAkun/${waliA.uid}`, { email: "walia@uji.test", nama: "walia", kelasUtama: "X", aktif: true, kelasTambahan: { XI: true } }, "izin");
await uji("waliAkun: waka membuat cermin bersama staff (per-field, kelasUtama sama)", waka, "PATCH", "", { [`roles/${wBaru3.uid}`]: "wali", ...staffBaru(wBaru3.uid, "wbaru3"), [`staff/${wBaru3.uid}/kelasUtama`]: "XI", ...cermin(wBaru3.uid, "wbaru3", "XI") }, "izin");
await uji("waliAkun: waka dengan kelasUtama BERBEDA dari staff DITOLAK", waka, "PATCH", "", { ...cermin(wBaru3.uid, "wbaru3", "XII") }, "tolak");
await uji("waliAkun: waka mengubah HANYA kelasUtama cermin menjadi beda dari staff DITOLAK", waka, "PATCH", "", { [`waliAkun/${wBaru3.uid}/kelasUtama`]: "XII" }, "tolak");
await uji("waliAkun: waka menyamakan kelasUtama cermin dengan staff pada update yang sama DITERIMA", waka, "PATCH", "", { [`staff/${wBaru3.uid}/kelasUtama`]: "X", [`waliAkun/${wBaru3.uid}/kelasUtama`]: "X" }, "izin");
await uji("waliAkun: waka menulis cermin akun KEPALA DITOLAK", waka, "PATCH", "", { ...cermin(kepala.uid, "kepalax", "X") }, "tolak");
await uji("waliAkun: waka menulis cermin akun tanpa staff DITOLAK", waka, "PATCH", "", { ...cermin(orang.uid, "orangx", "X") }, "tolak");
await tolak("waliAkun: waka TIDAK menulis node utuh", waka, "PUT", `waliAkun/${wBaru3.uid}`, { email: "a@b", nama: "x", kelasUtama: "XI", aktif: true });
await tolak("waliAkun: waka TIDAK menulis kelasTambahan", waka, "PUT", `waliAkun/${wBaru3.uid}/kelasTambahan/XII`, true);
await izin("waliAkun: waka menandai nonaktif (cabut)", waka, "PUT", `waliAkun/${wBaru3.uid}/aktif`, false);
await tolak("waliAkun: waka TIDAK mengubah nama cermin yang sudah ada", waka, "PUT", `waliAkun/${wBaru3.uid}/nama`, "Ganti");
await tolak("waliAkun: aktif bukan boolean ditolak", waka, "PUT", `waliAkun/${wBaru3.uid}/aktif`, "ya");
await izin("waliAkun: admin menambah kelasTambahan cermin", admin, "PUT", `waliAkun/${wBaru3.uid}/kelasTambahan/XII`, true);
await izin("waliAkun: admin membaca", admin, "GET", "waliAkun");
await izin("waliAkun: waka membaca", waka, "GET", "waliAkun");
await izin("waliAkun: kepala membaca", kepala, "GET", "waliAkun");
for (const [nama, who] of [["wali", waliA], ["piket", piket], ["ortu", ortu1], ["alat", dev]]) { await tolak(`waliAkun: ${nama} TIDAK membaca`, who, "GET", "waliAkun"); await tolak(`waliAkun: ${nama} TIDAK menulis`, who, "PUT", `waliAkun/${waliA.uid}/aktif`, true); }
await tolak("waliAkun: kepala TIDAK menulis", kepala, "PUT", `waliAkun/${waliA.uid}/aktif`, false);
// ================================================================ v2.5 — PEMBINAAN BERPERINGKAT, ambang terpakai, izin/proyeksi orang tua, migrasi
seksi("PEMBINAAN v2.5 — pembinaan/{pj}/{nis}/{ta}_{levelId}: tulis (wali, kepala), koreksi, baca berperingkat");
const ortu701 = await buatUser("701.1@ortu.presensi-ma.local");
await http("PATCH", "", { owner: true, body: {
  "discipline/levels/lvW": { poin: 100, tindakan: "Teguran 1 — pembinaan wali kelas", penanggungJawab: "wali" },
  "discipline/levels/lvB": { poin: 200, tindakan: "Teguran 2 — pembinaan BK", penanggungJawab: "bk" },
  "discipline/levels/lvK": { poin: 300, tindakan: "Teguran 3 — pembinaan kepala", penanggungJawab: "kepala" },
  "discipline/levels/lvN": { poin: 150, tindakan: "Ambang belum terpakai", penanggungJawab: "wali" },
  "discipline/levels/lvL": { poin: 400, tindakan: "Ambang lama (penanggung jawab waka)", penanggungJawab: "waka" },
  "discipline/levelTerpakai/lvW": true, "discipline/levelTerpakai/lvB": true, "discipline/levelTerpakai/lvK": true,
  "discipline/remisi/mOff": { kelompok: "Prestasi", nama: "Remisi nonaktif", poin: 20, aktif: false, diubahOleh: waka.uid, diubahTs: 1 },
  "discipline/remisi/mT": { kelompok: "Prestasi", nama: "Juara kota", poin: 50, aktif: true, diubahOleh: waka.uid, diubahTs: 1 },
  "parents/701": { ver: 1, uid: ortu701.uid },
}});
const pbId = (lv = "lvW", ta = TA) => `${ta}_${lv}`;
let taSeq = 0;
/** TA yang belum pernah dipakai: uji NEGATIF memakai (TA, ambang) segar agar yang diuji adalah jalur BUAT (bukan penolakan karena catatan sudah ada). */
const taFresh = () => { const n = taSeq++; return `20${27 + Math.floor(n / 70)}-20${10 + (n % 70)}`; }; // format sah /^20dd-20dd$/, tidak pernah sama dengan TA uji
const LVP = { lvW: 100, lvB: 200, lvK: 300, lvN: 150 };
const LVG = { lvW: "wali", lvB: "bk", lvK: "kepala", lvN: "wali" };
const pbRec = (u, lv, o = {}) => ({ pj: LVG[lv], ta: TA, levelId: lv, levelPoin: LVP[lv], tindakan: "Teguran uji", tanggal: TGL, metode: "Tatap muka", hasil: "Siswa dibina dengan baik dan berjanji memperbaiki diri", status: "selesai", oleh: u.uid, olehNama: "Bu Pembina", dibuatTs: SV, ...o });
/** Satu update: log + record pembinaan. o.data = penyimpangan isi; o.grup = jalur; o.tandai = tulis penanda ambang terpakai; o.tambah = path lain. */
const pbBody = (u, nis, o = {}) => {
  const lv = o.levelId ?? "lvW", ta = o.ta ?? TA, g = o.grup ?? LVG[lv], id = o.id ?? pbId(lv, ta);
  return {
    ...(o.act?.tanpa ? {} : act(u, o.aksi ?? "catat-pembinaan", o.act ?? {}).body),
    [`pembinaan/${g}/${nis}/${id}`]: pbRec(u, lv, { ta, ...(o.data ?? {}) }),
    ...(o.tandai ? { [`discipline/levelTerpakai/${lv}`]: true } : {}),
    ...(o.tambah ?? {}),
  };
};
const tanpaLog = { act: { tanpa: true } };
const pbu = (nama, who, nis, harap, o = {}) => uji(nama, who, "PATCH", "", pbBody(who, nis, harap === "tolak" && !o.ta ? { ...o, ta: taFresh() } : o), harap);
/** Klaim BK disemai langsung (owner) untuk uji tulis pembinaan; uji klaim sendiri ada di bagian BK. */
const klaimSeed = (nis, ta, lv, bk) => http("PUT", `klaimBK/${nis}/${pbId(lv, ta)}`, { owner: true, body: { bkUid: bk.uid, bkNama: "BK uji", sejak: 1, cara: "klaim", olehUid: bk.uid, ta, levelId: lv } });
/** pbu untuk BK: menyemai klaim (kecuali o.tanpaKlaim) pada TA yang dipakai. */
const pbk = async (nama, who, nis, harap, o = {}) => {
  const ta = o.ta ?? taFresh();
  if (!o.tanpaKlaim) await klaimSeed(nis, ta, o.levelId ?? "lvB", o.klaimUntuk ?? who);
  return uji(nama, who, "PATCH", "", pbBody(who, nis, { levelId: "lvB", ...o, ta }), harap);
};

// ---- wali: BISA (siswa binaan, ambang berpenanggung jawab wali, log aktivitas, ambang sudah terpakai)
await pbu("pembinaan: wali A mencatat pembinaan SELESAI siswa binaan (701)", waliA, "701", "izin");
await pbu("pembinaan: wali A menjadwalkan pembinaan siswa 702", waliA, "702", "izin", { data: { status: "dijadwalkan" } });
await pbu("pembinaan: wali B (kelas tambahan XII) mencatat siswa 704", waliB, "704", "izin", { ta: taFresh() });
await pbu("pembinaan: wali B (kelas utama XI) mencatat siswa 703", waliB, "703", "izin", { ta: taFresh() });
await pbu("pembinaan: tindak lanjut tepat 500 karakter diterima (kontrol: wali B berwenang atas 704)", waliB, "704", "izin", { ta: taFresh(), data: { tindakLanjut: "x".repeat(500) } });
await cek("pembinaan: waka membaca record wali 701 (isi, pelaksana, pj)", waka, `pembinaan/wali/701/${pbId()}`, (j) => j?.oleh === waliA.uid && j.status === "selesai" && j.pj === "wali");

// ---- wali: DITOLAK
await pbu("pembinaan: wali B TIDAK mencatat siswa kelas X (701)", waliB, "701", "tolak");
await pbu("pembinaan: wali A TIDAK mencatat siswa kelas XI (703)", waliA, "703", "tolak");
await pbu("pembinaan: siswa tanpa indeks (111) ditolak", waliA, "111", "tolak");
await pbu("pembinaan: TANPA log aktivitas ditolak", waliA, "702", "tolak", tanpaLog);
await pbu("pembinaan: log aksi salah ('pelanggaran') ditolak", waliA, "702", "tolak", { aksi: "pelanggaran" });
await pbu("pembinaan: penanda log tanpa ENTRI ditolak", waliA, "702", "tolak", { act: { tanpaEntri: true } });
await pbu("pembinaan: wali menulis di jalur BK (record pj bk) ditolak", waliA, "702", "tolak", { levelId: "lvB" });
await pbu("pembinaan: wali menulis ambang BK di jalur wali (pj tidak cocok ambang) ditolak", waliA, "702", "tolak", { levelId: "lvB", grup: "wali", data: { pj: "wali" } });
await pbu("pembinaan: wali menulis ambang BK di jalur wali dengan pj 'bk' ditolak", waliA, "702", "tolak", { levelId: "lvB", grup: "wali" });
await pbu("pembinaan: wali menulis di jalur kepala ditolak", waliA, "702", "tolak", { levelId: "lvK" });
await pbu("pembinaan: ambang pj 'waka' (lama) tidak dapat dicatat wali", waliA, "702", "tolak", { levelId: "lvW", data: { levelId: "lvL", levelPoin: 400 }, id: pbId("lvL", TA) });
await pbu("pembinaan: ambang tidak ada ditolak", waliA, "702", "tolak", { levelId: "lvTidakAda", grup: "wali", data: { pj: "wali", levelPoin: 100 } });
await pbu("pembinaan: field pj record berbeda dari jalur ditolak", waliA, "702", "tolak", { data: { pj: "bk" } });
await pbu("pembinaan: TANPA field pj ditolak", waliA, "702", "tolak", { data: { pj: undefined } });
await pbu("pembinaan: pj 'waka' ditolak", waliA, "702", "tolak", { data: { pj: "waka" } });
await pbu("pembinaan: ambang BARU tanpa penanda terpakai ditolak (lvN)", waliA, "702", "tolak", { levelId: "lvN" });
await pbu("pembinaan: ambang BARU dengan penanda terpakai pada update yang sama diterima (lvN)", waliA, "702", "izin", { levelId: "lvN", tandai: true, ta: taFresh() });
await tolak("pembinaan: penanda terpakai tidak dapat ditulis ulang (create-only)", waliA, "PUT", "discipline/levelTerpakai/lvW", true);
await pbu("pembinaan: levelPoin tidak sama dengan ambang master ditolak", waliA, "702", "tolak", { data: { levelPoin: 99 } });
await pbu("pembinaan: id bukan {ta}_{levelId} ditolak", waliA, "702", "tolak", { id: "acak123" });
await pbu("pembinaan: oleh palsu (waka) ditolak", waliA, "702", "tolak", { data: { oleh: waka.uid } });
await pbu("pembinaan: dibuatTs bukan waktu server ditolak", waliA, "702", "tolak", { data: { dibuatTs: 12345 } });
await pbu("pembinaan: hasil < 10 karakter ditolak", waliA, "702", "tolak", { data: { hasil: "pendek" } });
await pbu("pembinaan: hasil > 1000 karakter ditolak", waliA, "702", "tolak", { data: { hasil: "x".repeat(1001) } });
await pbu("pembinaan: tindak lanjut > 500 karakter ditolak (wali B, siswa 704 yang berwenang)", waliB, "704", "tolak", { data: { tindakLanjut: "x".repeat(501) } });
await pbu("pembinaan: metode tidak dikenal ditolak", waliA, "702", "tolak", { data: { metode: "Surat" } });
await pbu("pembinaan: status tidak dikenal ditolak", waliA, "702", "tolak", { data: { status: "batal" } });
await pbu("pembinaan: format tanggal salah ditolak", waliA, "702", "tolak", { data: { tanggal: "14-10-2026" } });
await pbu("pembinaan: ta format salah ditolak", waliA, "702", "tolak", { ta: "2026", data: { ta: "2026" }, id: "2026_lvW" });
await pbu("pembinaan: field tak dikenal ditolak", waliA, "702", "tolak", { data: { rahasia: "x" } });
await pbu("pembinaan: ortu TIDAK menulis", ortu1, "701", "tolak");
await pbu("pembinaan: piket TIDAK menulis", piket, "701", "tolak");
await pbu("pembinaan: admin TIDAK menulis", admin, "701", "tolak");
await pbu("pembinaan: waka TIDAK membuat record baru (jalur wali)", waka, "701", "tolak", { act: { entri: { detail: "alasan koreksi uji" } } });
await pbu("pembinaan: waka TIDAK membuat record baru (jalur kepala)", waka, "701", "tolak", { levelId: "lvK" });
await pbu("pembinaan: kepala TIDAK membuat record baru jalur wali tanpa migrasi", kepala, "701", "tolak");
await pbu("pembinaan: kepala TIDAK membuat record baru jalur bk tanpa migrasi", kepala, "701", "tolak", { levelId: "lvB" });

// ---- kepala: pembinaan ambang Kepala
await pbu("pembinaan: kepala mencatat ambang Kepala (jalur kepala) siswa 701", kepala, "701", "izin", { levelId: "lvK", ta: TA });
await pbu("pembinaan: kepala mencatat ambang Kepala tanpa log aktivitas ditolak", kepala, "701", "tolak", { levelId: "lvK", ...tanpaLog });
await pbu("pembinaan: kepala menulis ambang Kepala di jalur wali (pj tidak cocok) ditolak", kepala, "701", "tolak", { levelId: "lvK", grup: "wali" });
await pbu("pembinaan: wali TIDAK menulis ambang Kepala", waliA, "701", "tolak", { levelId: "lvK" });

// ---- ubah: wali boleh mengubah yang masih dijadwalkan; selesai hanya dikoreksi peringkat lebih tinggi (alasan di log)
const ubahPb = (u, nis, lv, data, o = {}) => ({
  ...(o.tanpaLog ? {} : act(u, o.aksi ?? "catat-pembinaan", o.act ?? {}).body),
  [`pembinaan/${LVG[lv]}/${nis}/${pbId(lv)}`]: pbRec(u, lv, { oleh: o.oleh ?? waliA.uid, dibuatTs: o.dibuatTs ?? 1111, diubahOleh: o.diubahOleh ?? u.uid, diubahTs: SV, ...data }),
});
const ALASAN = { aksi: "koreksi-pembinaan", act: { entri: { detail: "Koreksi setelah klarifikasi dengan siswa" } } };
const awal = await http("GET", `pembinaan/wali/701/${pbId()}`, { owner: true });
const dibuatTs701 = awal.json?.dibuatTs;
await uji("pembinaan: wali C (wali kedua kelas X) mengubah pembinaan SELESAI ditolak", waliC, "PATCH", "", ubahPb(waliC, "701", "lvW", { hasil: "Dikoreksi oleh wali kedua kelas X", dibuatTs: dibuatTs701 }), "tolak");
await uji("pembinaan: wali A mengubah pembinaan SELESAI sendiri ditolak", waliA, "PATCH", "", ubahPb(waliA, "701", "lvW", { hasil: "Dikoreksi oleh wali yang sama", dibuatTs: dibuatTs701 }), "tolak");
await uji("pembinaan: waka mengoreksi SELESAI tanpa log koreksi ditolak", waka, "PATCH", "", ubahPb(waka, "701", "lvW", { hasil: "Dikoreksi waka tanpa alasan tercatat", dibuatTs: dibuatTs701 }, { tanpaLog: true }), "tolak");
await uji("pembinaan: waka mengoreksi SELESAI dengan aksi 'catat-pembinaan' (bukan koreksi) ditolak", waka, "PATCH", "", ubahPb(waka, "701", "lvW", { hasil: "Dikoreksi waka dengan aksi salah", dibuatTs: dibuatTs701 }), "tolak");
await uji("pembinaan: waka mengoreksi SELESAI dengan alasan < 10 karakter ditolak", waka, "PATCH", "", ubahPb(waka, "701", "lvW", { hasil: "Dikoreksi waka alasan terlalu singkat", dibuatTs: dibuatTs701 }, { aksi: "koreksi-pembinaan", act: { entri: { detail: "singkat" } } }), "tolak");
await uji("pembinaan: waka mengoreksi SELESAI dengan alasan > 300 karakter ditolak", waka, "PATCH", "", ubahPb(waka, "701", "lvW", { hasil: "Dikoreksi waka alasan terlalu panjang", dibuatTs: dibuatTs701 }, { aksi: "koreksi-pembinaan", act: { entri: { detail: "x".repeat(301) } } }), "tolak");
await uji("pembinaan: waka mengoreksi SELESAI (pj wali) dengan alasan diterima", waka, "PATCH", "", ubahPb(waka, "701", "lvW", { hasil: "Dikoreksi waka setelah klarifikasi dengan siswa", dibuatTs: dibuatTs701 }, ALASAN), "izin");
await uji("pembinaan: kepala mengoreksi SELESAI (pj wali) dengan alasan diterima", kepala, "PATCH", "", ubahPb(kepala, "701", "lvW", { hasil: "Dikoreksi kepala madrasah setelah rapat", dibuatTs: dibuatTs701 }, ALASAN), "izin");
await uji("pembinaan: koreksi mengubah 'oleh' ditolak", waka, "PATCH", "", ubahPb(waka, "701", "lvW", { hasil: "Koreksi dengan mengganti pelaksana", dibuatTs: dibuatTs701, oleh: waka.uid }, ALASAN), "tolak");
await uji("pembinaan: koreksi mengubah dibuatTs ditolak", waka, "PATCH", "", ubahPb(waka, "701", "lvW", { hasil: "Koreksi dengan mengganti waktu buat", dibuatTs: 5 }, ALASAN), "tolak");
await uji("pembinaan: koreksi mengubah levelPoin ditolak", waka, "PATCH", "", ubahPb(waka, "701", "lvW", { hasil: "Koreksi dengan mengganti ambang poin", dibuatTs: dibuatTs701, levelPoin: 150 }, ALASAN), "tolak");
await uji("pembinaan: koreksi mengubah pj record ditolak (immutable)", waka, "PATCH", "", ubahPb(waka, "701", "lvW", { hasil: "Koreksi dengan mengganti penanggung jawab", dibuatTs: dibuatTs701, pj: "bk" }, ALASAN), "tolak");
await uji("pembinaan: koreksi mengubah pj record lewat path (PATCH field pj) ditolak", waka, "PATCH", "", { ...act(waka, "koreksi-pembinaan", { entri: { detail: "Koreksi mengganti pj lewat path" } }).body, [`pembinaan/wali/701/${pbId()}/pj`]: "bk", [`pembinaan/wali/701/${pbId()}/diubahOleh`]: waka.uid, [`pembinaan/wali/701/${pbId()}/diubahTs`]: SV }, "tolak");
await uji("pembinaan: koreksi TANPA diubahOleh/diubahTs ditolak", waka, "PATCH", "", { ...act(waka, "koreksi-pembinaan", { entri: { detail: "Koreksi tanpa penanda ubah" } }).body, [`pembinaan/wali/701/${pbId()}`]: pbRec(waka, "lvW", { oleh: waliA.uid, dibuatTs: dibuatTs701 }) }, "tolak");
await uji("pembinaan: koreksi diubahTs bukan waktu server ditolak", waka, "PATCH", "", ubahPb(waka, "701", "lvW", { hasil: "Koreksi dengan waktu ubah palsu", dibuatTs: dibuatTs701, diubahTs: 7 }, ALASAN), "tolak");
await uji("pembinaan: koreksi diubahOleh palsu ditolak", waka, "PATCH", "", ubahPb(waka, "701", "lvW", { hasil: "Koreksi dengan pengubah palsu", dibuatTs: dibuatTs701 }, { ...ALASAN, diubahOleh: kepala.uid }), "tolak");
await uji("pembinaan: waka TIDAK mengoreksi SELESAI milik Kepala (pj kepala)", waka, "PATCH", "", ubahPb(waka, "701", "lvK", { hasil: "Waka mencoba mengoreksi pembinaan kepala", oleh: kepala.uid }, ALASAN), "tolak");
await uji("pembinaan: kepala mengoreksi SELESAI miliknya (pj kepala) dengan alasan diterima", kepala, "PATCH", "", ubahPb(kepala, "701", "lvK", { hasil: "Kepala mengoreksi pembinaan sendiri", oleh: kepala.uid, dibuatTs: (await http("GET", `pembinaan/kepala/701/${pbId("lvK")}`, { owner: true })).json?.dibuatTs }, ALASAN), "izin");
await uji("pembinaan: kepala mengubah pembinaan Kepala yang DIJADWALKAN lewat jalur penulis (kontrol)", kepala, "PATCH", "", { ...pbBody(kepala, "703", { levelId: "lvK", ta: TA, data: { status: "dijadwalkan" } }) }, "izin");
await uji("pembinaan: kepala mengubah pembinaan Kepala DIJADWALKAN (diubahOleh/diubahTs) diterima", kepala, "PATCH", "", ubahPb(kepala, "703", "lvK", { oleh: kepala.uid, status: "selesai", hasil: "Kepala menyelesaikan pembinaan intensif", dibuatTs: (await http("GET", `pembinaan/kepala/703/${pbId("lvK")}`, { owner: true })).json?.dibuatTs }), "izin");
const dj = await http("GET", `pembinaan/wali/702/${pbId()}`, { owner: true });
await uji("pembinaan: wali A mengubah pembinaan DIJADWALKAN sendiri, hasil tepat 1000 karakter diterima", waliA, "PATCH", "", ubahPb(waliA, "702", "lvW", { hasil: "x".repeat(1000), status: "dijadwalkan", dibuatTs: dj.json?.dibuatTs }), "izin");
await uji("pembinaan: wali C mengubah pembinaan DIJADWALKAN siswa kelas X diterima (702 -> selesai)", waliC, "PATCH", "", ubahPb(waliC, "702", "lvW", { hasil: "Pembinaan selesai dilaksanakan oleh wali kedua", dibuatTs: dj.json?.dibuatTs, status: "selesai" }), "izin");

// ---- tidak ada hapus fisik
for (const [n, who] of [["waka", waka], ["kepala", kepala], ["admin", admin], ["wali A", waliA]]) await tolak(`pembinaan: ${n} TIDAK menghapus fisik`, who, "DELETE", `pembinaan/wali/701/${pbId()}`);
await tolak("pembinaan: kepala TIDAK menghapus fisik record kepala", kepala, "DELETE", `pembinaan/kepala/701/${pbId("lvK")}`);
await tolak("pembinaan: waka TIDAK menimpa seluruh node siswa dengan null", waka, "PUT", "pembinaan/wali/701", null);
await tolak("pembinaan: kepala TIDAK menimpa seluruh jalur dengan null", kepala, "PUT", "pembinaan/kepala", null);

// ---- baca berperingkat (§2)
seksi("PEMBINAAN v2.5 — baca berperingkat");
await izin("pembinaan: wali A membaca record wali siswa binaan 701", waliA, "GET", "pembinaan/wali/701");
await tolak("pembinaan: wali A TIDAK membaca siswa kelas XI (703)", waliA, "GET", "pembinaan/wali/703");
await izin("pembinaan: wali B membaca 703", waliB, "GET", "pembinaan/wali/703");
await tolak("pembinaan: wali B TIDAK membaca 701", waliB, "GET", "pembinaan/wali/701");
await tolak("pembinaan: wali TIDAK membaca seluruh jalur wali", waliA, "GET", "pembinaan/wali");
await tolak("pembinaan: wali TIDAK membaca jalur BK", waliA, "GET", "pembinaan/bk");
await tolak("pembinaan: wali TIDAK membaca jalur BK per siswa", waliA, "GET", "pembinaan/bk/701");
await tolak("pembinaan: wali TIDAK membaca jalur kepala per siswa", waliA, "GET", "pembinaan/kepala/701");
await tolak("pembinaan: wali TIDAK membaca seluruh node pembinaan", waliA, "GET", "pembinaan");
await izin("pembinaan: waka membaca jalur wali", waka, "GET", "pembinaan/wali");
await izin("pembinaan: waka membaca jalur BK", waka, "GET", "pembinaan/bk");
await tolak("pembinaan: waka TIDAK membaca jalur kepala", waka, "GET", "pembinaan/kepala");
await tolak("pembinaan: waka TIDAK membaca jalur kepala per siswa", waka, "GET", "pembinaan/kepala/701");
await tolak("pembinaan: waka TIDAK membaca seluruh node pembinaan", waka, "GET", "pembinaan");
for (const g of ["wali", "bk", "kepala"]) await izin(`pembinaan: kepala membaca jalur ${g}`, kepala, "GET", `pembinaan/${g}`);
await izin("pembinaan: kepala membaca seluruh node (untuk migrasi)", kepala, "GET", "pembinaan");
for (const p of ["pembinaan", "pembinaan/wali", "pembinaan/wali/701", "pembinaan/bk", "pembinaan/kepala"]) {
  await tolak(`pembinaan: admin TIDAK membaca ${p}`, admin, "GET", p);
  await tolak(`pembinaan: piket TIDAK membaca ${p}`, piket, "GET", p);
  await tolak(`pembinaan: ortu TIDAK membaca ${p}`, ortu701, "GET", p);
  await tolak(`pembinaan: alat TIDAK membaca ${p}`, dev, "GET", p);
}
await cek("pembinaan: record Kepala ada isi pj='kepala' (terbaca kepala)", kepala, `pembinaan/kepala/701/${pbId("lvK")}`, (j) => j?.pj === "kepala");

// ---- penanggung jawab ambang: hanya kepala, dikunci setelah terpakai (§2.4)
seksi("AMBANG v2.5 — penanggung jawab hanya kepala; terkunci setelah terpakai");
await izin("ambang: waka mengubah poin ambang lvN (penanggung jawab tidak disentuh)", waka, "PUT", "discipline/levels/lvN/poin", 150);
await izin("ambang: waka mengubah tindakan ambang lvN", waka, "PUT", "discipline/levels/lvN/tindakan", "Ambang belum terpakai (diperbarui)");
await izin("ambang: waka menulis ulang seluruh ambang lvN dengan penanggung jawab SAMA", waka, "PUT", "discipline/levels/lvN", { poin: 150, tindakan: "Ambang belum terpakai", penanggungJawab: "wali" });
await tolak("ambang: waka menulis seluruh ambang lvN dengan penanggung jawab BERBEDA", waka, "PUT", "discipline/levels/lvN", { poin: 150, tindakan: "Ambang belum terpakai", penanggungJawab: "bk" });
await tolak("ambang: waka mengubah penanggung jawab per-field (lvN, belum terpakai)", waka, "PUT", "discipline/levels/lvN/penanggungJawab", "bk");
await tolak("ambang: waka menghapus penanggung jawab per-field", waka, "DELETE", "discipline/levels/lvN/penanggungJawab");
await tolak("ambang: waka membuat ambang BARU dengan penanggung jawab", waka, "PUT", "discipline/levels/lvBaruW", { poin: 175, tindakan: "Ambang baru uji", penanggungJawab: "wali" });
await izin("ambang: waka membuat ambang BARU tanpa penanggung jawab (kontrol)", waka, "PUT", "discipline/levels/lvBaruTanpa", { poin: 176, tindakan: "Ambang baru tanpa pj" });
await tolak("ambang: waka menghapus ambang yang punya penanggung jawab", waka, "DELETE", "discipline/levels/lvL");
for (const pj of ["wali", "bk", "kepala", "waka"]) await izin(`ambang: kepala menetapkan penanggung jawab '${pj}' pada ambang baru`, kepala, "PUT", `discipline/levels/lvPJ${pj}`, { poin: 150, tindakan: "Ambang uji", penanggungJawab: pj });
await tolak("ambang: penanggung jawab 'guru' ditolak", kepala, "PUT", "discipline/levels/lvPJx", { poin: 150, tindakan: "Ambang uji", penanggungJawab: "guru" });
await tolak("ambang: penanggung jawab bukan teks ditolak", kepala, "PUT", "discipline/levels/lvPJy", { poin: 150, tindakan: "Ambang uji", penanggungJawab: 1 });
await izin("ambang: kepala mengubah penanggung jawab ambang BELUM terpakai (lvPJwali)", kepala, "PUT", "discipline/levels/lvPJwali/penanggungJawab", "bk");
await tolak("ambang: kepala TIDAK mengubah penanggung jawab ambang TERPAKAI (lvW)", kepala, "PUT", "discipline/levels/lvW/penanggungJawab", "bk");
await tolak("ambang: kepala TIDAK menulis ulang ambang TERPAKAI dengan pj berbeda", kepala, "PUT", "discipline/levels/lvW", { poin: 100, tindakan: "Teguran 1", penanggungJawab: "kepala" });
await tolak("ambang: kepala TIDAK menghapus penanggung jawab ambang TERPAKAI", kepala, "DELETE", "discipline/levels/lvW/penanggungJawab");
await izin("ambang: kepala mengubah poin ambang TERPAKAI (pj tetap)", kepala, "PUT", "discipline/levels/lvK/poin", 300);
await izin("ambang: kepala mengubah penanggung jawab ambang lama 'waka' -> 'kepala' (belum terpakai)", kepala, "PUT", "discipline/levels/lvL/penanggungJawab", "kepala");
for (const [n, who] of [["wali", waliA], ["admin", admin], ["piket", piket], ["ortu", ortu1]]) await tolak(`ambang: ${n} TIDAK mengubah penanggung jawab`, who, "PUT", "discipline/levels/lvN/penanggungJawab", "kepala");
await izin("ambang: wali membaca ambang (untuk daftar Perlu dibina)", waliA, "GET", "discipline/levels");
for (const [n, who] of [["waka", waka], ["admin", admin], ["piket", piket], ["ortu", ortu1]]) await tolak(`levelTerpakai: ${n} TIDAK menulis penanda`, who, "PUT", "discipline/levelTerpakai/lvPJkepala", true);
await izin("levelTerpakai: kepala menulis penanda ambang baru (create-only)", kepala, "PUT", "discipline/levelTerpakai/lvPJkepala", true);
await tolak("levelTerpakai: kepala TIDAK menulis ulang penanda yang ada", kepala, "PUT", "discipline/levelTerpakai/lvPJkepala", true);
await tolak("levelTerpakai: penanda bernilai selain true ditolak", waliA, "PUT", "discipline/levelTerpakai/lvPJbk", false);
await izin("levelTerpakai: dibaca staf (wali)", waliA, "GET", "discipline/levelTerpakai");
await tolak("levelTerpakai: tidak dibaca piket", piket, "GET", "discipline/levelTerpakai");

// ---- IZIN, KUNCI, PROYEKSI ORANG TUA (§5)
seksi("ORANG TUA v2.5 — izinOrtu, izinOrtuAda, kunciOrtu, pembinaanOrtu (tersembunyi sampai diizinkan)");
const rekam = async (g, nis, id) => (await http("GET", `pembinaan/${g}/${nis}/${id}`, { owner: true })).json;
const proy = (r, mode) => ({ status: r.status, tanggal: r.tanggal, levelPoin: r.levelPoin, mode, ...(mode === "lengkap" ? { tindakan: r.tindakan, hasil: r.hasil, ...(r.tindakLanjut ? { tindakLanjut: r.tindakLanjut } : {}) } : {}) });
const IZ = (nis, ta, lv) => `izinOrtu/${nis}/${ta}/${lv}`, ADA = (nis, ta, lv) => `izinOrtuAda/${nis}/${ta}/${lv}`, PO = (nis, ta, lv) => `pembinaanOrtu/${nis}/${ta}/${lv}`, KU = (nis, ta, lv) => `kunciOrtu/${nis}/${ta}/${lv}`;
const izinRec = (u, peran, mode, o = {}) => ({ mode, olehUid: o.olehUid ?? u.uid, olehPeran: peran, ts: SV, ...(o.tambah ?? {}) });
/** Beri izin: log + izinOrtu + izinOrtuAda (+ proyeksi bila ada record). o.tanpaAda / o.tanpaProy / o.proy = penyimpangan. */
const beriBody = (u, peran, nis, ta, lv, mode, rec, o = {}) => ({
  ...(o.act?.tanpa ? {} : act(u, o.aksi ?? "izin-ortu", o.act ?? {}).body),
  [IZ(nis, ta, lv)]: izinRec(u, o.peran ?? peran, mode, o.izin ?? {}),
  ...(o.tanpaAda ? {} : { [ADA(nis, ta, lv)]: o.ada ?? mode }),
  ...(rec && !o.tanpaProy ? { [PO(nis, ta, lv)]: { ...proy(rec, mode), ...(o.proy ?? {}) } } : {}),
});
const beri = (nama, who, peran, nis, ta, lv, mode, rec, harap, o) => uji(nama, who, "PATCH", "", beriBody(who, peran, nis, ta, lv, mode, rec, o), harap);
const r701 = await rekam("wali", "701", pbId());
// -- izin pada record yang SUDAH ada (proyeksi wajib ikut)
await beri("izin ortu: waka memberi izin RINGKAS (izin + penanda + proyeksi) pada record 701 lvW", waka, "waka", "701", TA, "lvW", "ringkas", r701, "izin");
await cek("izin ortu: ortu 701 membaca proyeksi RINGKAS tanpa isi", ortu701, PO("701", TA, "lvW"), (j) => Object.keys(j).sort().join() === "levelPoin,mode,status,tanggal");
await cek("izin ortu: ortu 701 tidak melihat level yang TIDAK diizinkan (lvB kosong)", ortu701, PO("701", TA, "lvB"), (j) => j === null);
await tolak("izin ortu: ortu lain (222) TIDAK membaca proyeksi 701", ortu2, "GET", "pembinaanOrtu/701");
await tolak("izin ortu: ortu 701 TIDAK membaca seluruh pembinaanOrtu", ortu701, "GET", "pembinaanOrtu");
for (const p of ["izinOrtu/701", "izinOrtu", "kunciOrtu/701", "kunciOrtu", "izinOrtuAda/701", "klaimBK/701", "klaimBK"]) await tolak(`izin ortu: ortu TIDAK membaca ${p}`, ortu701, "GET", p);
for (const [n, who] of [["waka", waka], ["kepala", kepala]]) { await izin(`izin ortu: ${n} membaca izinOrtu`, who, "GET", "izinOrtu"); await izin(`izin ortu: ${n} membaca kunciOrtu`, who, "GET", "kunciOrtu"); await izin(`izin ortu: ${n} membaca pembinaanOrtu`, who, "GET", "pembinaanOrtu"); }
for (const [n, who] of [["admin", admin], ["piket", piket], ["alat", dev]]) for (const p of ["izinOrtu", "kunciOrtu", "pembinaanOrtu", "izinOrtuAda/701"]) await tolak(`izin ortu: ${n} TIDAK membaca ${p}`, who, "GET", p);
await izin("izin ortu: wali A membaca penanda izinOrtuAda siswa binaan 701", waliA, "GET", "izinOrtuAda/701");
await tolak("izin ortu: wali B TIDAK membaca penanda izinOrtuAda siswa 701", waliB, "GET", "izinOrtuAda/701");
await tolak("izin ortu: wali A TIDAK membaca izinOrtu (hanya penanda)", waliA, "GET", "izinOrtu/701");
await tolak("izin ortu: wali A TIDAK membaca pembinaanOrtu", waliA, "GET", "pembinaanOrtu/701");
// -- konsistensi dua arah
const ta1 = taFresh();
await beri("izin ortu: TANPA proyeksi padahal record ada ditolak (record 701 lvK, izin kepala)", kepala, "kepala", "701", TA, "lvK", "ringkas", await rekam("kepala", "701", pbId("lvK")), "tolak", { tanpaProy: true });
await beri("izin ortu: proyeksi status BERBEDA dari record ditolak", waka, "waka", "701", TA, "lvW", "lengkap", r701, "tolak", { proy: { status: "dijadwalkan" } });
await beri("izin ortu: proyeksi tanggal BERBEDA ditolak", waka, "waka", "701", TA, "lvW", "lengkap", r701, "tolak", { proy: { tanggal: "2026-01-01" } });
await beri("izin ortu: proyeksi LENGKAP dengan hasil BERBEDA ditolak", waka, "waka", "701", TA, "lvW", "lengkap", r701, "tolak", { proy: { hasil: "Hasil yang dikarang-karang sendiri" } });
await beri("izin ortu: mode lengkap tetapi proyeksi RINGKAS ditolak", waka, "waka", "701", TA, "lvW", "lengkap", r701, "tolak", { proy: { mode: "ringkas", tindakan: undefined, hasil: undefined, tindakLanjut: undefined } });
await beri("izin ortu: mode ringkas tetapi proyeksi memuat hasil ditolak", waka, "waka", "701", TA, "lvW", "ringkas", r701, "tolak", { proy: { hasil: r701.hasil } });
await beri("izin ortu: penanda izinOrtuAda BERBEDA dari mode ditolak", waka, "waka", "701", TA, "lvW", "ringkas", r701, "tolak", { ada: "lengkap" });
await beri("izin ortu: izinOrtu TANPA penanda izinOrtuAda ditolak", waka, "waka", "701", ta1, "lvW", "ringkas", null, "tolak", { tanpaAda: true });
await uji("izin ortu: penanda izinOrtuAda TANPA izinOrtu ditolak", waka, "PATCH", "", { ...act(waka, "izin-ortu").body, [ADA("701", ta1, "lvW")]: "ringkas" }, "tolak");
await uji("izin ortu: proyeksi TANPA izin ditolak", waka, "PATCH", "", { ...act(waka, "izin-ortu").body, [PO("701", TA, "lvB")]: proy(r701, "ringkas") }, "tolak");
await beri("izin ortu: olehPeran palsu ('kepala') oleh waka ditolak", waka, "waka", "701", TA, "lvW", "ringkas", r701, "tolak", { peran: "kepala" });
await beri("izin ortu: olehUid palsu ditolak", waka, "waka", "701", TA, "lvW", "ringkas", r701, "tolak", { izin: { olehUid: kepala.uid } });
await beri("izin ortu: ts bukan waktu server ditolak", waka, "waka", "701", TA, "lvW", "ringkas", r701, "tolak", { izin: { tambah: { ts: 5 } } });
await beri("izin ortu: field asing ditolak", waka, "waka", "701", TA, "lvW", "ringkas", r701, "tolak", { izin: { tambah: { x: 1 } } });
await beri("izin ortu: mode tidak dikenal ditolak", waka, "waka", "701", TA, "lvW", "penuh", r701, "tolak", { ada: "penuh" });
await beri("izin ortu: TANPA log aktivitas ditolak", waka, "waka", "701", TA, "lvW", "lengkap", r701, "tolak", tanpaLog);
await beri("izin ortu: log aksi salah ditolak", waka, "waka", "701", TA, "lvW", "lengkap", r701, "tolak", { aksi: "catat-pembinaan" });
// -- siapa boleh memberi
await beri("izin ortu: waka mengubah ke LENGKAP (izinnya sendiri) diterima", waka, "waka", "701", TA, "lvW", "lengkap", r701, "izin");
await cek("izin ortu: ortu 701 melihat proyeksi LENGKAP (tindakan, hasil)", ortu701, PO("701", TA, "lvW"), (j) => j.mode === "lengkap" && j.hasil === r701.hasil && j.tindakan === r701.tindakan && !("oleh" in j) && !("olehNama" in j));
const rK701 = await rekam("kepala", "701", pbId("lvK"));
await beri("izin ortu: waka TIDAK memberi izin level pj KEPALA (lvK)", waka, "waka", "701", TA, "lvK", "ringkas", rK701, "tolak");
await beri("izin ortu: kepala memberi izin level pj KEPALA (lvK) mode ringkas", kepala, "kepala", "701", TA, "lvK", "ringkas", rK701, "izin");
await beri("izin ortu: waka TIDAK menimpa izin buatan kepala", waka, "waka", "701", TA, "lvK", "lengkap", rK701, "tolak");
for (const [n, who] of [["admin", admin], ["piket", piket], ["wali A", waliA], ["ortu", ortu701]]) await beri(`izin ortu: ${n} TIDAK memberi izin`, who, "waka", "701", ta1, "lvW", "ringkas", null, "tolak");
// -- izin SEBELUM record ada (proyeksi baru ditulis saat record dibuat)
const ta2 = taFresh();
await beri("izin ortu: waka memberi izin SEBELUM record ada (tanpa proyeksi) diterima", waka, "waka", "702", ta2, "lvW", "ringkas", null, "izin");
await uji("izin ortu: izin sebelum record, proyeksi dipaksa ada ditolak", waka, "PATCH", "", { ...beriBody(waka, "waka", "702", taFresh(), "lvW", "ringkas", null), [PO("702", ta2, "lvW")]: { status: "selesai", tanggal: TGL, levelPoin: 100, mode: "ringkas" } }, "tolak");
await pbu("izin ortu: record dibuat TANPA proyeksi padahal izin aktif ditolak", waliA, "702", "tolak", { ta: ta2 });
await pbu("izin ortu: record dibuat DENGAN proyeksi konsisten diterima (wali A)", waliA, "702", "izin", { ta: ta2, tambah: { [PO("702", ta2, "lvW")]: { status: "selesai", tanggal: TGL, levelPoin: 100, mode: "ringkas" } } });
await cek("izin ortu: proyeksi ikut terbentuk saat record dibuat", waka, PO("702", ta2, "lvW"), (j) => j.mode === "ringkas" && j.status === "selesai");
await pbu("izin ortu: record dibuat dengan proyeksi TANPA izin ditolak", waliA, "703", "tolak", { tambah: { [PO("703", "2099-2100", "lvW")]: { status: "selesai", tanggal: TGL, levelPoin: 100, mode: "ringkas" } } });
// -- record DIUBAH saat izin aktif: proyeksi wajib ikut
const ta3 = taFresh();
await pbu("izin ortu: siapkan record dijadwalkan (702) untuk uji ubah", waliA, "702", "izin", { ta: ta3, data: { status: "dijadwalkan" } });
await beri("izin ortu: waka memberi izin ringkas pada record dijadwalkan 702", waka, "waka", "702", ta3, "lvW", "ringkas", await rekam("wali", "702", pbId("lvW", ta3)), "izin");
const dj3 = await rekam("wali", "702", pbId("lvW", ta3));
const ubah3 = (o = {}) => ({ ...act(waliA, "catat-pembinaan").body, [`pembinaan/wali/702/${pbId("lvW", ta3)}`]: pbRec(waliA, "lvW", { ta: ta3, oleh: waliA.uid, dibuatTs: dj3.dibuatTs, diubahOleh: waliA.uid, diubahTs: SV, status: "selesai", ...(o.data ?? {}) }), ...(o.proy === false ? {} : { [PO("702", ta3, "lvW")]: o.proy ?? proy({ ...dj3, status: "selesai" }, "ringkas") }) });
await uji("izin ortu: ubah record (-> selesai) TANPA memperbarui proyeksi ditolak", waliA, "PATCH", "", ubah3({ proy: false }), "tolak");
await uji("izin ortu: ubah record dengan proyeksi TIDAK cocok ditolak", waliA, "PATCH", "", ubah3({ proy: proy({ ...dj3, status: "dijadwalkan" }, "ringkas") }), "tolak");
await uji("izin ortu: ubah record DENGAN proyeksi konsisten diterima", waliA, "PATCH", "", ubah3(), "izin");
await cek("izin ortu: proyeksi mengikuti status selesai", waka, PO("702", ta3, "lvW"), (j) => j?.status === "selesai" && j.mode === "ringkas");
// -- cabut izin
const ta4 = taFresh();
await beri("izin ortu: waka memberi izin tanpa record (ta4) untuk uji cabut", waka, "waka", "703", ta4, "lvW", "ringkas", null, "izin");
const cabutBody = (u, nis, ta, lv, o = {}) => ({
  ...(o.act?.tanpa ? {} : act(u, o.aksi ?? "cabut-izin-ortu", o.act ?? {}).body),
  [IZ(nis, ta, lv)]: null, ...(o.tanpaAda ? {} : { [ADA(nis, ta, lv)]: null }), ...(o.tanpaProy ? {} : { [PO(nis, ta, lv)]: null }), ...(o.tambah ?? {}),
});
await uji("izin ortu: ortu TIDAK mencabut izin", ortu701, "PATCH", "", cabutBody(ortu701, "703", ta4, "lvW"), "tolak");
await uji("izin ortu: wali TIDAK mencabut izin", waliB, "PATCH", "", cabutBody(waliB, "703", ta4, "lvW"), "tolak");
await uji("izin ortu: cabut TANPA log ditolak", waka, "PATCH", "", cabutBody(waka, "703", ta4, "lvW", tanpaLog), "tolak");
await uji("izin ortu: cabut dengan log aksi salah ditolak", waka, "PATCH", "", cabutBody(waka, "703", ta4, "lvW", { aksi: "izin-ortu" }), "tolak");
await uji("izin ortu: cabut izinOrtu TANPA menghapus penanda izinOrtuAda ditolak", waka, "PATCH", "", cabutBody(waka, "703", ta4, "lvW", { tanpaAda: true }), "tolak");
await uji("izin ortu: waka mencabut izin SENDIRI diterima", waka, "PATCH", "", cabutBody(waka, "703", ta4, "lvW"), "izin");
await cek("izin ortu: izin hilang setelah dicabut", waka, IZ("703", ta4, "lvW"), (j) => j === null);
await uji("izin ortu: cabut izin dengan proyeksi TERSISA ditolak (record 701 lvW)", waka, "PATCH", "", cabutBody(waka, "701", TA, "lvW", { tanpaProy: true }), "tolak");
await uji("izin ortu: waka TIDAK mencabut izin buatan KEPALA (701 lvK)", waka, "PATCH", "", cabutBody(waka, "701", TA, "lvK"), "tolak");
// -- kunci
const ta5 = taFresh();
await beri("izin ortu: waka memberi izin (ta5) untuk uji batal+kunci", waka, "waka", "703", ta5, "lvW", "ringkas", null, "izin");
await uji("izin ortu: kepala membatalkan izin WAKA TANPA mengunci ditolak", kepala, "PATCH", "", cabutBody(kepala, "703", ta5, "lvW"), "tolak");
await uji("izin ortu: kepala membatalkan izin waka + kunci TANPA alasan (kurang dari 10) ditolak", kepala, "PATCH", "", cabutBody(kepala, "703", ta5, "lvW", { tambah: { [KU("703", ta5, "lvW")]: { olehUid: kepala.uid, ts: SV, alasan: "pendek" } } }), "tolak");
await uji("izin ortu: waka TIDAK menulis kunci", waka, "PATCH", "", { ...act(waka, "kunci-ortu").body, [KU("703", ta5, "lvW")]: { olehUid: waka.uid, ts: SV, alasan: "Waka mencoba mengunci sendiri" } }, "tolak");
await uji("izin ortu: kepala membatalkan izin waka + kunci (satu update) diterima", kepala, "PATCH", "", cabutBody(kepala, "703", ta5, "lvW", { tambah: { [KU("703", ta5, "lvW")]: { olehUid: kepala.uid, ts: SV, alasan: "Level ini tidak boleh dibuka ke orang tua" } } }), "izin");
await beri("izin ortu: waka TIDAK mengizinkan ulang level TERKUNCI", waka, "waka", "703", ta5, "lvW", "ringkas", null, "tolak");
await beri("izin ortu: kepala mengizinkan level terkunci (mode lengkap) diterima", kepala, "kepala", "703", ta5, "lvW", "lengkap", null, "izin");
await uji("izin ortu: waka TIDAK mencabut izin saat level terkunci", waka, "PATCH", "", cabutBody(waka, "703", ta5, "lvW"), "tolak");
await uji("izin ortu: kepala mencabut izin sendiri (buatan kepala) tanpa kunci baru diterima", kepala, "PATCH", "", cabutBody(kepala, "703", ta5, "lvW"), "izin");
await uji("izin ortu: waka TIDAK membuka kunci", waka, "PATCH", "", { ...act(waka, "buka-kunci-ortu").body, [KU("703", ta5, "lvW")]: null }, "tolak");
await uji("izin ortu: buka kunci TANPA log 'buka-kunci-ortu' ditolak", kepala, "PATCH", "", { ...act(kepala, "kunci-ortu").body, [KU("703", ta5, "lvW")]: null }, "tolak");
await uji("izin ortu: kepala membuka kunci diterima", kepala, "PATCH", "", { ...act(kepala, "buka-kunci-ortu").body, [KU("703", ta5, "lvW")]: null }, "izin");
await beri("izin ortu: waka dapat mengizinkan lagi SETELAH kunci dibuka", waka, "waka", "703", ta5, "lvW", "ringkas", null, "izin");
await uji("izin ortu: kepala memasang kunci tersendiri (kunci-ortu) diterima", kepala, "PATCH", "", { ...act(kepala, "kunci-ortu").body, [KU("703", ta5, "lvB")]: { olehUid: kepala.uid, ts: SV, alasan: "Dikunci sebelum ada izin dari waka" } }, "izin");
await beri("izin ortu: waka TIDAK mengizinkan level yang dikunci sebelum izin (lvB)", waka, "waka", "703", ta5, "lvB", "ringkas", null, "tolak");
await uji("izin ortu: kunci dengan field asing ditolak", kepala, "PATCH", "", { ...act(kepala, "kunci-ortu").body, [KU("703", ta5, "lvK")]: { olehUid: kepala.uid, ts: SV, alasan: "Kunci dengan field asing uji", x: 1 } }, "tolak");

// ---- MIGRASI data lama (khusus kepala, §5.4)
seksi("MIGRASI v2.5 — pembinaan/{nis}/{id} lama -> pembinaan/{pj}/{nis}/{id}; pembinaanStatus dihapus");
const lama = (u, lv, ta) => ({ ta, levelId: lv, levelPoin: LVP[lv], tindakan: "Teguran lama", tanggal: TGL, metode: "Tatap muka", hasil: "Pembinaan lama sebelum v2.5 dengan hasil memadai", status: "selesai", oleh: u.uid, olehNama: "Bu Lama", dibuatTs: 1000 });
await http("PATCH", "", { owner: true, body: {
  "pembinaan/704/2025-2026_lvW": lama(waliB, "lvW", "2025-2026"), "pembinaan/704/2025-2026_lvB": lama(waliB, "lvB", "2025-2026"), "pembinaan/704/2025-2026_lvK": lama(waliB, "lvK", "2025-2026"),
  "pembinaanStatus/704/2025-2026/lvW": { id: "2025-2026_lvW", status: "selesai", tanggal: TGL, levelPoin: 100 },
}});
const baruMig = (lv, o = {}) => ({ ...lama(waliB, lv, "2025-2026"), pj: o.pj ?? LVG[lv] });
const migrasiBody = (u, items, o = {}) => ({
  ...(o.act?.tanpa ? {} : act(u, o.aksi ?? "migrasi-pembinaan", o.act ?? {}).body),
  ...Object.fromEntries(items.flatMap(([lv, g]) => [[`pembinaan/${g}/704/2025-2026_${lv}`, baruMig(lv, { pj: g })], ...(o.tanpaHapusLama ? [] : [[`pembinaan/704/2025-2026_${lv}`, null]])])),
});
await izin("migrasi: kepala membaca record lama (pembinaan/704)", kepala, "GET", "pembinaan/704");
for (const [n, who] of [["waka", waka], ["admin", admin], ["wali B", waliB], ["piket", piket], ["ortu", ortu1]]) await tolak(`migrasi: ${n} TIDAK membaca record lama`, who, "GET", "pembinaan/704");
await uji("migrasi: waka TIDAK memindahkan record", waka, "PATCH", "", migrasiBody(waka, [["lvW", "wali"]]), "tolak");
await uji("migrasi: admin TIDAK memindahkan record", admin, "PATCH", "", migrasiBody(admin, [["lvW", "wali"]]), "tolak");
await uji("migrasi: kepala TANPA log migrasi ditolak", kepala, "PATCH", "", migrasiBody(kepala, [["lvW", "wali"]], tanpaLog), "tolak");
await uji("migrasi: kepala dengan log aksi salah ditolak", kepala, "PATCH", "", migrasiBody(kepala, [["lvW", "wali"]], { aksi: "catat-pembinaan" }), "tolak");
await uji("migrasi: hapus record lama TANPA salinan baru ditolak", kepala, "PATCH", "", { ...act(kepala, "migrasi-pembinaan").body, "pembinaan/704/2025-2026_lvW": null }, "tolak");
await uji("migrasi: salinan di jalur salah (lvB di jalur wali) ditolak", kepala, "PATCH", "", migrasiBody(kepala, [["lvB", "wali"]]), "tolak");
await uji("migrasi: salinan dengan pj berbeda dari jalur ditolak", kepala, "PATCH", "", { ...act(kepala, "migrasi-pembinaan").body, "pembinaan/wali/704/2025-2026_lvW": baruMig("lvW", { pj: "bk" }), "pembinaan/704/2025-2026_lvW": null }, "tolak");
await uji("migrasi: kepala memindahkan satu batch (wali + bk + kepala) dalam SATU update diterima", kepala, "PATCH", "", migrasiBody(kepala, [["lvW", "wali"], ["lvB", "bk"], ["lvK", "kepala"]]), "izin");
await cek("migrasi: record lama hilang, salinan baru ada (pj tersalin)", kepala, "pembinaan/704", (j) => j === null);
await cek("migrasi: salinan di jalur wali memuat pj", kepala, "pembinaan/wali/704/2025-2026_lvW", (j) => j?.pj === "wali" && j.oleh === waliB.uid && j.dibuatTs === 1000);
await uji("migrasi: waka TIDAK menghapus pembinaanStatus lama", waka, "PATCH", "", { ...act(waka, "migrasi-pembinaan").body, pembinaanStatus: null }, "tolak");
await uji("migrasi: kepala menghapus pembinaanStatus TANPA log migrasi ditolak", kepala, "PATCH", "", { ...act(kepala, "catat-pembinaan").body, pembinaanStatus: null }, "tolak");
await uji("migrasi: kepala menghapus pembinaanStatus lama dengan log diterima", kepala, "PATCH", "", { ...act(kepala, "migrasi-pembinaan").body, pembinaanStatus: null }, "izin");
for (const [n, who] of [["waka", waka], ["wali A", waliA], ["admin", admin], ["ortu", ortu1]]) await tolak(`migrasi: ${n} TIDAK menulis pembinaanStatus`, who, "PUT", "pembinaanStatus/111", { x: 1 });
await tolak("migrasi: kepala TIDAK menulis pembinaanStatus baru (hanya hapus)", kepala, "PUT", "pembinaanStatus/111", { x: 1 });

// ================================================================ USUL REMISI
seksi("USUL REMISI — wali mengusulkan; waka/kepala memutuskan SEKALI");
const USUL = (u, o = {}) => ({ nis: "701", remId: "m1", nama: "Contoh", poin: 10, alasan: "Juara lomba tingkat kota Mergosono", oleh: u.uid, ts: SV, status: "menunggu", ...o });
const usulBody = (u, id, o = {}) => ({ ...(o.act?.tanpa ? {} : act(u, o.aksi ?? "usul-remisi", o.act ?? {}).body), [`usulRemisi/${id}`]: USUL(u, o.data ?? {}) });
const us = (nama, who, id, harap, o) => uji(nama, who, "PATCH", "", usulBody(who, id, o), harap);
await us("usul: wali A mengusulkan remisi untuk siswa binaan 701", waliA, "usA1", "izin");
await us("usul: wali B mengusulkan untuk siswa kelas tambahan 704", waliB, "usB1", "izin", { data: { nis: "704" } });
await us("usul: wali A TIDAK mengusulkan untuk siswa kelas XI (703)", waliA, "usX1", "tolak", { data: { nis: "703" } });
await us("usul: siswa tanpa indeks (111) ditolak", waliA, "usX2", "tolak", { data: { nis: "111" } });
await us("usul: TANPA log aktivitas ditolak", waliA, "usX3", "tolak", { act: { tanpa: true } });
await us("usul: log aksi salah ('pelanggaran') ditolak", waliA, "usX4", "tolak", { aksi: "pelanggaran" });
await us("usul: penanda log tanpa ENTRI ditolak", waliA, "usX5", "tolak", { act: { tanpaEntri: true } });
await us("usul: remisi tidak ada di master ditolak", waliA, "usX6", "tolak", { data: { remId: "mTidakAda" } });
await us("usul: remisi NONAKTIF ditolak", waliA, "usX7", "tolak", { data: { remId: "mOff", nama: "Remisi nonaktif", poin: 20 } });
await us("usul: nama tidak sama dengan master ditolak", waliA, "usX8", "tolak", { data: { nama: "Nama karangan" } });
await us("usul: poin tidak sama dengan master ditolak", waliA, "usX9", "tolak", { data: { poin: 99 } });
await us("usul: status langsung 'disetujui' ditolak", waliA, "usY1", "tolak", { data: { status: "disetujui" } });
await us("usul: oleh palsu ditolak", waliA, "usY2", "tolak", { data: { oleh: waliC.uid } });
await us("usul: ts bukan waktu server ditolak", waliA, "usY3", "tolak", { data: { ts: 1234 } });
await us("usul: alasan < 10 karakter ditolak", waliA, "usY4", "tolak", { data: { alasan: "singkat" } });
await us("usul: alasan > 300 karakter ditolak", waliA, "usY5", "tolak", { data: { alasan: "x".repeat(301) } });
await us("usul: alasan tepat 300 karakter diterima", waliA, "usA2", "izin", { data: { alasan: "x".repeat(300) } });
await us("usul: field tambahan ditolak", waliA, "usY6", "tolak", { data: { catatan: "x" } });
await us("usul: field keputusan pada pembuatan ditolak", waliA, "usY7", "tolak", { data: { diputuskanOleh: waka.uid } });
await us("usul: id tidak sah ditolak", waliA, "us.bad", "tolak");
await us("usul: waka TIDAK membuat usulan (hanya wali)", waka, "usY8", "tolak");
await us("usul: piket TIDAK membuat usulan", piket, "usY9", "tolak");
await us("usul: ortu TIDAK membuat usulan", ortu1, "usZ1", "tolak");
await us("usul: admin TIDAK membuat usulan", admin, "usZ2", "tolak");
await tolak("usul: wali TIDAK menimpa usulan yang sudah ada (usA1)", waliA, "PUT", "usulRemisi/usA1", USUL(waliA, { alasan: "Menimpa usulan yang sudah ada tanpa izin" }));

// baca
await izin("usul: wali A membaca usulan sendiri (query oleh=uid)", waliA, "GET", `usulRemisi?orderBy=${encodeURIComponent('"oleh"')}&equalTo=${encodeURIComponent(JSON.stringify(waliA.uid))}`);
await izin("usul: wali A membaca satu usulan sendiri", waliA, "GET", "usulRemisi/usA1");
await tolak("usul: wali C TIDAK membaca usulan wali A (satu kelas pun)", waliC, "GET", "usulRemisi/usA1");
await tolak("usul: wali A TIDAK membaca seluruh node", waliA, "GET", "usulRemisi");
await tolak("usul: wali A TIDAK query usulan wali lain", waliA, "GET", `usulRemisi?orderBy=${encodeURIComponent('"oleh"')}&equalTo=${encodeURIComponent(JSON.stringify(waliB.uid))}`);
for (const [n, who] of [["waka", waka], ["kepala", kepala], ["admin", admin]]) await izin(`usul: ${n} membaca seluruh node`, who, "GET", "usulRemisi");
await tolak("usul: piket TIDAK membaca", piket, "GET", "usulRemisi");
await tolak("usul: ortu TIDAK membaca", ortu1, "GET", "usulRemisi");

// batalkan usulan sendiri yang menunggu
await us("usul: wali A menyiapkan usulan untuk dibatalkan (usA3)", waliA, "usA3", "izin");
await uji("usul: wali C TIDAK membatalkan usulan wali A", waliC, "PATCH", "", { ...act(waliC, "batal-usul").body, "usulRemisi/usA3": null }, "tolak");
await uji("usul: wali A membatalkan TANPA log ditolak", waliA, "PATCH", "", { "usulRemisi/usA3": null }, "tolak");
await uji("usul: wali A membatalkan dengan log aksi salah ditolak", waliA, "PATCH", "", { ...act(waliA, "usul-remisi").body, "usulRemisi/usA3": null }, "tolak");
await uji("usul: waka TIDAK menghapus usulan", waka, "PATCH", "", { ...act(waka, "batal-usul").body, "usulRemisi/usA3": null }, "tolak");
await uji("usul: wali A membatalkan usulan sendiri yang menunggu diterima", waliA, "PATCH", "", { ...act(waliA, "batal-usul").body, "usulRemisi/usA3": null }, "izin");
await cek("usul: usulan yang dibatalkan hilang", waka, "usulRemisi/usA3", (j) => j === null);

// keputusan
const REC_U = (id, o = {}) => ({ jenis: "remisi", refId: "m1", nama: "Contoh", poin: 10, tanggal: TGL, ta: TA, sumber: "usul-wali", ...o });
const putus = (u, id, o = {}) => ({
  [`usulRemisi/${id}/status`]: o.status ?? "disetujui", [`usulRemisi/${id}/diputuskanOleh`]: o.oleh ?? u.uid, [`usulRemisi/${id}/diputuskanTs`]: SV,
  ...(o.alasan ? { [`usulRemisi/${id}/alasanKeputusan`]: o.alasan } : {}), ...(o.tanpaRecId ? {} : o.status === "ditolak" && !o.recId ? {} : { [`usulRemisi/${id}/recId`]: o.recId ?? id }),
  ...(o.tanpaRecord ? {} : { [`discipline/records/${o.nis ?? "701"}/${id}`]: REC_U(id, o.rec ?? {}) }),
  ...(o.tanpaRecord || o.tanpaMeta ? {} : { [`discipline/recordMeta/${o.nis ?? "701"}/${id}`]: meta(u) }),
  ...(o.ekstra ?? {}),
});
await us("usul: wali A menyiapkan usulan (usA4) untuk keputusan", waliA, "usA4", "izin");
await uji("keputusan: wali TIDAK menyetujui usulan sendiri", waliA, "PATCH", "", { ...act(waliA, "putuskan-usul").body, ...putus(waliA, "usA4") }, "tolak");
await uji("keputusan: piket TIDAK menyetujui", piket, "PATCH", "", { ...act(piket, "putuskan-usul").body, ...putus(piket, "usA4") }, "tolak");
await uji("keputusan: admin TIDAK menyetujui (hanya lihat)", admin, "PATCH", "", putus(admin, "usA4"), "tolak");
await uji("keputusan: admin TIDAK menolak (hanya lihat)", admin, "PATCH", "", putus(admin, "usA4", { status: "ditolak", alasan: "Admin mencoba menolak usulan", tanpaRecord: true }), "tolak");
await uji("keputusan: piket TIDAK menolak", piket, "PATCH", "", putus(piket, "usA4", { status: "ditolak", alasan: "Piket mencoba menolak usulan", tanpaRecord: true }), "tolak");
await uji("keputusan: wali TIDAK menolak usulan sendiri", waliA, "PATCH", "", putus(waliA, "usA4", { status: "ditolak", alasan: "Wali mencoba menolak usulan", tanpaRecord: true }), "tolak");
await uji("keputusan: ortu TIDAK menyetujui", ortu1, "PATCH", "", putus(ortu1, "usA4"), "tolak");
await uji("keputusan: setuju TANPA record remisi ditolak", waka, "PATCH", "", putus(waka, "usA4", { tanpaRecord: true }), "tolak");
await uji("keputusan: setuju TANPA recordMeta ditolak", waka, "PATCH", "", putus(waka, "usA4", { tanpaMeta: true }), "tolak");
await uji("keputusan: setuju dengan recId != id usulan ditolak", waka, "PATCH", "", putus(waka, "usA4", { recId: "lainnya" }), "tolak");
await uji("keputusan: setuju dengan poin record BERBEDA dari usulan ditolak", waka, "PATCH", "", putus(waka, "usA4", { rec: { poin: 100 } }), "tolak");
await uji("keputusan: setuju dengan nama record BERBEDA ditolak", waka, "PATCH", "", putus(waka, "usA4", { rec: { nama: "Lain" } }), "tolak");
await uji("keputusan: setuju dengan refId record BERBEDA dari remId ditolak", waka, "PATCH", "", putus(waka, "usA4", { rec: { refId: "mT" } }), "tolak");
await uji("keputusan: setuju dengan jenis 'pelanggaran' ditolak", waka, "PATCH", "", putus(waka, "usA4", { rec: { jenis: "pelanggaran" } }), "tolak");
await uji("keputusan: setuju dengan sumber 'manual' (record bukan usul-wali) ditolak", waka, "PATCH", "", putus(waka, "usA4", { rec: { sumber: "manual" } }), "tolak");
await uji("keputusan: setuju dengan record untuk siswa LAIN ditolak", waka, "PATCH", "", putus(waka, "usA4", { nis: "702" }), "tolak");
await uji("keputusan: diputuskanOleh palsu ditolak", waka, "PATCH", "", putus(waka, "usA4", { oleh: kepala.uid }), "tolak");
await uji("keputusan: setuju mengubah poin usulan ditolak (record ikut diubah, hanya kekekalan poin yang menahan)", waka, "PATCH", "", { ...putus(waka, "usA4", { rec: { poin: 1 } }), "usulRemisi/usA4/poin": 1 }, "tolak");
await uji("keputusan: setuju mengubah alasan usulan ditolak", waka, "PATCH", "", { ...putus(waka, "usA4"), "usulRemisi/usA4/alasan": "Alasan diubah pejabat tanpa izin" }, "tolak");
await uji("keputusan: setuju mengubah nis usulan ditolak", waka, "PATCH", "", { ...putus(waka, "usA4"), "usulRemisi/usA4/nis": "702" }, "tolak");
await uji("keputusan: status kembali ke 'menunggu' ditolak", waka, "PATCH", "", { "usulRemisi/usA4/status": "menunggu" }, "tolak");
await uji("keputusan: status nilai liar ditolak", waka, "PATCH", "", { "usulRemisi/usA4/status": "dibatalkan" }, "tolak");
await uji("keputusan: waka menyetujui (usulan + record remisi + meta dalam satu update) DITERIMA", waka, "PATCH", "", putus(waka, "usA4"), "izin");
await cek("keputusan: tepat 1 record remisi 'usul-wali' dengan id = id usulan", waka, "discipline/records/701/usA4", (j) => j?.sumber === "usul-wali" && j.jenis === "remisi" && j.poin === 10 && j.refId === "m1");
await cek("keputusan: usulan berstatus disetujui + recId + pengambil keputusan", waka, "usulRemisi/usA4", (j) => j?.status === "disetujui" && j.recId === "usA4" && j.diputuskanOleh === waka.uid);
await uji("keputusan: kepala memutuskan LAGI usulan yang sudah disetujui ditolak (sekali)", kepala, "PATCH", "", putus(kepala, "usA4", { status: "ditolak", alasan: "Mencoba menolak setelah disetujui" }), "tolak");
await uji("keputusan: waka mengulang persetujuan ditolak", waka, "PATCH", "", putus(waka, "usA4"), "tolak");
await uji("keputusan: wali TIDAK membatalkan usulan yang sudah diputuskan", waliA, "PATCH", "", { ...act(waliA, "batal-usul").body, "usulRemisi/usA4": null }, "tolak");
await uji("keputusan: waka TIDAK menghapus usulan yang sudah diputuskan", waka, "PATCH", "", { "usulRemisi/usA4": null }, "tolak");
await izin("keputusan: record usul-wali kini dibaca ortu/wali seperti remisi biasa (wali A)", waliA, "GET", "discipline/records/701/usA4");
await uji("record 'usul-wali' TANPA usulan dibuat waka ditolak (hanya lewat keputusan)", waka, "PATCH", "", { [P("701", "recUW1")]: REC_U("recUW1"), [M("701", "recUW1")]: meta(waka) }, "tolak");
await uji("record 'usul-wali' dengan id usulan yang sudah diputuskan ditolak (tidak dapat dipakai ulang)", waka, "PATCH", "", { [P("702", "usA4")]: REC_U("usA4"), [M("702", "usA4")]: meta(waka) }, "tolak");
await uji("record 'usul-wali' dibuat piket ditolak", piket, "PATCH", "", { [P("701", "recUW2")]: REC_U("recUW2"), [M("701", "recUW2")]: meta(piket) }, "tolak");
await uji("record 'usul-wali' dibuat wali ditolak", waliA, "PATCH", "", { ...act(waliA, "pelanggaran").body, [P("701", "recUW3")]: REC_U("recUW3"), [M("701", "recUW3")]: meta(waliA) }, "tolak");
await uji("record 'usul-wali' yang sudah ada boleh dikoreksi waka (ubah poin + meta)", waka, "PATCH", "", { [`${P("701", "usA4")}/poin`]: 8, [`${M("701", "usA4")}/diubahOleh`]: waka.uid, [`${M("701", "usA4")}/diubahTs`]: SV }, "izin");

// tolak
await us("usul: wali A menyiapkan usulan (usA5) untuk ditolak", waliA, "usA5", "izin");
await uji("tolak: sambil mengubah poin usulan ditolak", waka, "PATCH", "", { ...putus(waka, "usA5", { status: "ditolak", alasan: "Belum memenuhi syarat", tanpaRecord: true }), "usulRemisi/usA5/poin": 1 }, "tolak");
await uji("tolak: sambil mengubah nis usulan ditolak", waka, "PATCH", "", { ...putus(waka, "usA5", { status: "ditolak", alasan: "Belum memenuhi syarat", tanpaRecord: true }), "usulRemisi/usA5/nis": "702" }, "tolak");
await uji("tolak: sambil mengubah alasan usulan ditolak", waka, "PATCH", "", { ...putus(waka, "usA5", { status: "ditolak", alasan: "Belum memenuhi syarat", tanpaRecord: true }), "usulRemisi/usA5/alasan": "Alasan diubah pejabat tanpa izin wali" }, "tolak");
await uji("tolak: sambil mengubah remId usulan ditolak", waka, "PATCH", "", { ...putus(waka, "usA5", { status: "ditolak", alasan: "Belum memenuhi syarat", tanpaRecord: true }), "usulRemisi/usA5/remId": "mT" }, "tolak");
await uji("tolak: sambil mengubah nama usulan ditolak", waka, "PATCH", "", { ...putus(waka, "usA5", { status: "ditolak", alasan: "Belum memenuhi syarat", tanpaRecord: true }), "usulRemisi/usA5/nama": "Nama lain" }, "tolak");
await uji("tolak: sambil mengubah pengusul (oleh) ditolak", waka, "PATCH", "", { ...putus(waka, "usA5", { status: "ditolak", alasan: "Belum memenuhi syarat", tanpaRecord: true }), "usulRemisi/usA5/oleh": waliC.uid }, "tolak");
await uji("tolak: sambil mengubah ts usulan ditolak", waka, "PATCH", "", { ...putus(waka, "usA5", { status: "ditolak", alasan: "Belum memenuhi syarat", tanpaRecord: true }), "usulRemisi/usA5/ts": 5 }, "tolak");
await uji("tolak: TANPA alasan keputusan ditolak", waka, "PATCH", "", putus(waka, "usA5", { status: "ditolak", tanpaRecord: true }), "tolak");
await uji("tolak: alasan < 5 karakter ditolak", waka, "PATCH", "", putus(waka, "usA5", { status: "ditolak", alasan: "no", tanpaRecord: true }), "tolak");
await uji("tolak: dengan recId ditolak", waka, "PATCH", "", { ...putus(waka, "usA5", { status: "ditolak", alasan: "Belum memenuhi syarat", tanpaRecord: true }), "usulRemisi/usA5/recId": "usA5" }, "tolak");
await uji("tolak: sambil menulis record remisi ditolak (record usul-wali hanya untuk usulan disetujui)", waka, "PATCH", "", putus(waka, "usA5", { status: "ditolak", alasan: "Belum memenuhi syarat", recId: "usA5" }), "tolak");
await uji("tolak: alasan keputusan > 300 karakter ditolak", waka, "PATCH", "", putus(waka, "usA5", { status: "ditolak", alasan: "x".repeat(301), tanpaRecord: true }), "tolak");
await uji("tolak: diputuskanOleh palsu (bukan pengambil keputusan) ditolak", waka, "PATCH", "", putus(waka, "usA5", { status: "ditolak", alasan: "Belum memenuhi syarat", tanpaRecord: true, oleh: kepala.uid }), "tolak");
await uji("tolak: diputuskanOleh palsu oleh KEPALA atas nama waka ditolak", kepala, "PATCH", "", putus(kepala, "usA5", { status: "ditolak", alasan: "Belum memenuhi syarat", tanpaRecord: true, oleh: waka.uid }), "tolak");
await uji("tolak: kepala menolak dengan alasan DITERIMA", kepala, "PATCH", "", putus(kepala, "usA5", { status: "ditolak", alasan: "Belum memenuhi syarat prestasi", tanpaRecord: true }), "izin");
await cek("tolak: tidak ada record remisi untuk usulan yang ditolak", waka, "discipline/records/701/usA5", (j) => j === null);
await uji("tolak: waka mengubah menjadi setuju setelah ditolak ditolak (sekali)", waka, "PATCH", "", putus(waka, "usA5"), "tolak");
await uji("sekali: menolak LAGI usulan yang sudah ditolak (alasan diganti) ditolak", waka, "PATCH", "", putus(waka, "usA5", { status: "ditolak", alasan: "Alasan penolakan diganti belakangan", tanpaRecord: true }), "tolak");
await uji("sekali: membalik usulan DISETUJUI menjadi ditolak (recId dibuang) ditolak", kepala, "PATCH", "", putus(kepala, "usA4", { status: "ditolak", alasan: "Dibalik setelah disetujui", tanpaRecord: true, ekstra: { "usulRemisi/usA4/recId": null } }), "tolak");
await cek("sekali: usulan usA4 tetap disetujui dan usA5 tetap ditolak dengan alasan semula", waka, "usulRemisi", (j) => j?.usA4?.status === "disetujui" && j.usA4.recId === "usA4" && j.usA5?.status === "ditolak" && j.usA5.alasanKeputusan === "Belum memenuhi syarat prestasi");

// serentak: waka dan kepala menyetujui usulan yang sama pada saat yang sama -> tepat satu berhasil
await us("usul: wali A menyiapkan usulan (usA6) untuk uji keputusan serentak", waliA, "usA6", "izin");
{
  const [a, b] = await Promise.all([
    http("PATCH", "", { token: waka.token, body: putus(waka, "usA6") }),
    http("PATCH", "", { token: kepala.token, body: putus(kepala, "usA6") }),
  ]);
  const berhasil = [a.status, b.status].filter((s) => s === 200).length;
  const ok = berhasil === 1;
  if (ok) hasil.lolos++; else hasil.gagal.push(`keputusan serentak waka+kepala: tepat 1 berhasil [status ${a.status}, ${b.status}]`);
  console.log(`${ok ? "  ✓" : "  ✗"} keputusan serentak waka+kepala: tepat 1 berhasil (${a.status}/${b.status})`);
  const u = await http("GET", "usulRemisi/usA6", { owner: true });
  const mt = await http("GET", M("701", "usA6"), { owner: true });
  const pemenang = a.status === 200 ? waka.uid : kepala.uid;
  const rr = await http("GET", P("701", "usA6"), { owner: true });
  const ok2 = u.json?.diputuskanOleh === pemenang && mt.json?.dibuatOleh === pemenang && rr.json?.sumber === "usul-wali";
  if (ok2) hasil.lolos++; else hasil.gagal.push(`serentak: usulan, record, dan meta harus milik pemenang yang sama ${JSON.stringify([u.json, mt.json])}`);
  console.log(`${ok2 ? "  ✓" : "  ✗"} keputusan serentak: usulan + record + recordMeta konsisten milik satu pemenang`);
  const semua = await http("GET", "discipline/records/701", { owner: true });
  const jumlahUsA6 = Object.keys(semua.json ?? {}).filter((k) => k === "usA6").length;
  const ok3 = jumlahUsA6 === 1;
  if (ok3) hasil.lolos++; else hasil.gagal.push(`serentak: record remisi harus tepat 1 (${jumlahUsA6})`);
  console.log(`${ok3 ? "  ✓" : "  ✗"} keputusan serentak: tepat 1 record remisi tercipta`);
}
// record usul-wali TIDAK dapat dibuat ulang untuk usulan yang SUDAH diputuskan (hapus lunak lalu buat lagi): hanya syarat "usulan menunggu SEBELUM update" yang menahan
await uji("usul: waka menghapus lunak record remisi usul-wali usA6", waka, "PATCH", "", hapusBody(waka, "701", "usA6", REC_U("usA6")), "izin");
await cek("usul: record usA6 hilang dari node publik, usulan tetap disetujui", waka, "usulRemisi/usA6", (j) => j?.status === "disetujui");
await uji("usul: record usul-wali usA6 TIDAK dapat dibuat ulang (usulan sudah disetujui, bukan menunggu)", waka, "PATCH", "", {
  [P("701", "usA6")]: REC_U("usA6"), [`${M("701", "usA6")}/dihapus`]: null, [`${M("701", "usA6")}/alasanHapus`]: null, [`${M("701", "usA6")}/snapshot`]: null,
  [`${M("701", "usA6")}/diubahOleh`]: waka.uid, [`${M("701", "usA6")}/diubahTs`]: SV,
}, "tolak");
// ================================================================ v2.4-b: BK (GURU BIMBINGAN KONSELING)
seksi("BK — Guru Bimbingan Konseling: lintas kelas, konseling rahasia (baca BK+Kepala, tulis BK)");
const bkA = await buatUser("bka@uji.test");
const bkB = await buatUser("bkb@uji.test");
const bkBaru1 = await buatUser("bkbaru1@uji.test");
const bkBaru2 = await buatUser("bkbaru2@uji.test");
const bkBaru3 = await buatUser("bkbaru3@uji.test"); // uid segar: belum punya role maupun staff
for (const u of [bkA, bkB, bkBaru1, bkBaru2]) PERAN.set(u.uid, "bk");
const stfBk = (nama) => ({ email: `${nama}@uji.test`, nama, role: "bk", dibuat: 1 });
await http("PATCH", "", { owner: true, body: {
  [`roles/${bkA.uid}`]: "bk", [`roles/${bkB.uid}`]: "bk",
  [`staff/${bkA.uid}`]: stfBk("bka"), [`staff/${bkB.uid}`]: stfBk("bkb"),
  // siswa uji khusus BK (kelas berbeda-beda) + siswa TANPA indeks
  "siswaKelas/901": "X", "siswaKelas/902": "XI", "siswaKelas/903": "XII",
  ...Object.fromEntries(["901", "902", "903"].flatMap((n) => [[`profiles/${n}`, { nama: `SISWA BK ${n}`, kelas: "?" }], [`attendance/${n}/${TGL}`, { masuk: "06:50:00", status: "Hadir" }], [`lessonsByStudent/${n}/${TGL}/2`, { k: "S" }]])),
} });

// ---- BACA lintas kelas (tanpa UID kartu/PIN/log tap)
for (const p of ["siswaKelas", "profiles", "profiles/902", "attendance/903", `attendance/901/${TGL}`, "lessonsByStudent/902", "manualTapByStudent/901", "validasiByStudent/903", "discipline/records", "discipline/records/701", "discipline/records/703", "discipline/recordMeta", "discipline/recordMeta/704", "discipline/levels", "discipline/rules", "discipline/remisi", "discipline/settings", "kalenderEfektif"]) {
  await izin(`bk: BK membaca ${p}`, bkA, "GET", p);
}
for (const p of ["config/students", "log", `log/${TGL}`, "attendance", "parents", "parents/701", "roles", `roles/${waka.uid}`, "staff", `staff/${waka.uid}`, "waliAkun", "discipline/audit", "discipline/notes", "discipline/notes/701", "discipline/suggest", "lessons", "manualTap", "izin", "izinMeta", "validasi", "device", "device/status", "unknown", "activity", "piketHarian", "piketRoster", "sistem", "usulRemisi"]) {
  await tolak(`bk: BK TIDAK membaca ${p}`, bkA, "GET", p);
}
await izin("bk: BK membaca usulan sendiri lewat query oleh=uid (kosong tidak apa-apa)", bkA, "GET", `usulRemisi?orderBy=${encodeURIComponent('"oleh"')}&equalTo=${encodeURIComponent(JSON.stringify(bkA.uid))}`);
await tolak("bk: BK TIDAK query usulan orang lain", bkA, "GET", `usulRemisi?orderBy=${encodeURIComponent('"oleh"')}&equalTo=${encodeURIComponent(JSON.stringify(waliA.uid))}`);
await tolak("bk: BK membaca roles milik orang lain ditolak", bkA, "GET", `roles/${bkB.uid}`);
await izin("bk: BK membaca role sendiri", bkA, "GET", `roles/${bkA.uid}`);
await izin("bk: BK membaca staff sendiri", bkA, "GET", `staff/${bkA.uid}`);

// ---- TULIS yang DITOLAK: izin, per jam, Alfa, manual, master, kalender, akun
await uji("bk: izin harian (ket) DITOLAK", bkA, "PATCH", "", { ...act(bkA, "izin-harian").body, [`attendance/901/${TGL}/ket`]: "Sakit", [`izin/${TGL}/901`]: "Sakit" }, "tolak");
await uji("bk: izin per jam (S) DITOLAK", bkA, "PATCH", "", { ...act(bkA, "izin-jam").body, [`lessons/${HT}/X/absen/901/3`]: "S", [`lessonsByStudent/901/${HT}/3`]: { k: "S" } }, "tolak");
await uji("bk: Alfa per jam (A) DITOLAK", bkA, "PATCH", "", aSet(bkA, "5102", 6), "tolak");
await tolak("bk: sel per jam (PUT langsung, kode I) DITOLAK — hanya aturan tulis sel yang menahan", bkA, "PUT", `lessons/${HT}/${AJ}/absen/5102/6`, "I");
await tolak("bk: sel per jam (PUT langsung, kode A) DITOLAK", bkA, "PUT", `lessons/${HT}/${AJ}/absen/5102/6`, "A");
await tolak("bk: Alfa seharian (validasi) DITOLAK", bkA, "PUT", `validasi/${TGL}/901`, { status: "Alfa", oleh: bkA.uid, ts: SV });
await uji("bk: presensi manual DITOLAK", bkA, "PATCH", "", manualBody(bkA, TM, "901"), "tolak");
await uji("bk: presensi manual TANPA salinan (hanya entri asli) DITOLAK — hanya aturan tulis manualTap yang menahan", bkA, "PATCH", "", manualBody(bkA, TM, "901", { tanpaSalinan: true }), "tolak");
await tolak("bk: kalender DITOLAK (tanggal yang sudah ada; waka dapat menandai tanggal yang sama)", bkA, "PUT", "kalenderEfektif/2026-11-16/normal", true);
await tolak("bk: master aturan DITOLAK (isian sah; waka dapat menulis yang sama)", bkA, "PUT", "discipline/rules/rBK", { kategori: "Ringan", nama: "Uji BK", poin: 5, aktif: true, diubahOleh: bkA.uid, diubahTs: SV });
await izin("bk: kontrol — waka dapat menulis aturan dengan isian yang sama", waka, "PUT", "discipline/rules/rBKkontrol", { kategori: "Ringan", nama: "Uji BK", poin: 5, aktif: true, diubahOleh: waka.uid, diubahTs: SV });
await tolak("bk: master ambang (levels) DITOLAK", bkA, "PUT", "discipline/levels/lvBK", { poin: 300, tindakan: "Teguran uji", penanggungJawab: "bk" });
await tolak("bk: master remisi DITOLAK (isian sah)", bkA, "PUT", "discipline/remisi/mBK", { kelompok: "Prestasi", nama: "Uji BK", poin: 5, aktif: true, diubahOleh: bkA.uid, diubahTs: SV });
await tolak("bk: pemetaan saran DITOLAK", bkA, "PUT", "discipline/autoMap/terlambat", "r1");
await tolak("bk: roles (memberi diri role admin) DITOLAK", bkA, "PUT", `roles/${bkA.uid}`, "admin");
await tolak("bk: roles (memberi akun lain role bk) DITOLAK", bkA, "PUT", `roles/${bkBaru1.uid}`, "bk");
await tolak("bk: staff orang lain DITOLAK", bkA, "PUT", `staff/${bkB.uid}/nama`, "ubah");
await tolak("bk: siswaKelas (indeks) DITOLAK", bkA, "PUT", "siswaKelas/990", "X");
await tolak("bk: profil siswa DITOLAK", bkA, "PUT", "profiles/901/nama", "UBAH");
await tolak("bk: catatan internal (notes) DITOLAK", bkA, "PUT", "discipline/notes/901/x", "catatan");
await tolak("bk: sistem/backup DITOLAK", bkA, "PUT", "sistem/backupTerakhir", SV);

// ---- v2.5: BK membaca pembinaan jalur wali + bk (bukan kepala); klaim; pembinaan hanya oleh pemegang klaim
seksi("BK v2.5 — baca berperingkat, klaim (siapa cepat dia dapat), pembinaan pemegang klaim");
await izin("bk: BK membaca jalur wali", bkA, "GET", "pembinaan/wali");
await izin("bk: BK membaca jalur wali per siswa", bkA, "GET", "pembinaan/wali/701");
await izin("bk: BK membaca jalur bk", bkA, "GET", "pembinaan/bk");
await tolak("bk: BK TIDAK membaca jalur kepala", bkA, "GET", "pembinaan/kepala");
await tolak("bk: BK TIDAK membaca jalur kepala per siswa", bkA, "GET", "pembinaan/kepala/701");
await tolak("bk: BK TIDAK membaca seluruh node pembinaan", bkA, "GET", "pembinaan");
await tolak("bk: BK TIDAK membaca record lama pembinaan/{nis}", bkA, "GET", "pembinaan/701");
await tolak("bk: BK TIDAK membaca pembinaanStatus lama", bkA, "GET", "pembinaanStatus");
await izin("bk: BK membaca klaimBK", bkA, "GET", "klaimBK");
await izin("bk: BK membaca bkAkun (daftar BK untuk penunjukan)", bkA, "GET", "bkAkun");
for (const p of ["izinOrtu", "kunciOrtu", "pembinaanOrtu", "pembinaanOrtu/701"]) await tolak(`bk: BK TIDAK membaca ${p}`, bkA, "GET", p);
await izin("bk: BK membaca penanda izinOrtuAda siswa terindeks", bkA, "GET", "izinOrtuAda/701");
await tolak("bk: BK TIDAK menulis izinOrtu", bkA, "PUT", IZ("701", TA, "lvB"), izinRec(bkA, "waka", "ringkas"));
await tolak("bk: BK TIDAK menulis kunciOrtu", bkA, "PUT", KU("701", TA, "lvB"), { olehUid: bkA.uid, ts: SV, alasan: "BK mencoba mengunci level" });
await tolak("bk: BK TIDAK menulis pembinaanOrtu", bkA, "PUT", PO("701", TA, "lvB"), { status: "selesai", tanggal: TGL, levelPoin: 200, mode: "ringkas" });

// ---- klaim
const KL = (nis, ta, lv = "lvB") => `klaimBK/${nis}/${pbId(lv, ta)}`;
const klaimNode = (u, ta, lv, o = {}) => ({ bkUid: u.uid, bkNama: "Bu BK", sejak: SV, cara: "klaim", olehUid: u.uid, ta, levelId: lv, ...o });
const klaimBody = (u, nis, ta, lv, o = {}) => ({ ...(o.act?.tanpa ? {} : act(u, o.aksi ?? "klaim-bk", o.act ?? {}).body), [KL(nis, ta, lv)]: o.node ?? klaimNode(o.untuk ?? u, ta, lv, o.data ?? {}) });
const kl = (nama, who, nis, ta, lv, harap, o) => uji(nama, who, "PATCH", "", klaimBody(who, nis, ta, lv, o), harap);
const tk1 = taFresh();
await kl("klaim: BK A mengklaim siswa 902 (ambang BK)", bkA, "902", tk1, "lvB", "izin");
await kl("klaim: BK B TIDAK menimpa klaim yang sudah ada", bkB, "902", tk1, "lvB", "tolak");
await cek("klaim: klaim tersimpan atas nama BK A", bkB, KL("902", tk1), (j) => j?.bkUid === bkA.uid && j.cara === "klaim");
{ // dua klaim serentak pada node yang sama: tepat satu yang berhasil
  const tkr = taFresh();
  const [a, b] = await Promise.all([http("PATCH", "", { token: bkA.token, body: klaimBody(bkA, "903", tkr, "lvB") }), http("PATCH", "", { token: bkB.token, body: klaimBody(bkB, "903", tkr, "lvB") })]);
  const menang = [a.status, b.status].filter((s) => s === 200).length;
  const ok = menang === 1;
  if (ok) hasil.lolos++; else hasil.gagal.push(`klaim: dua klaim SERENTAK, tepat satu berhasil  [berhasil ${menang}: ${a.status}/${b.status}]`);
  console.log(`${ok ? "  ✓" : "  ✗"} klaim: dua klaim SERENTAK pada siswa yang sama — tepat satu berhasil`);
}
await kl("klaim: ambang bukan BK (lvW) DITOLAK", bkA, "901", taFresh(), "lvW", "tolak");
await kl("klaim: ambang kepala (lvK) DITOLAK", bkA, "901", taFresh(), "lvK", "tolak");
await kl("klaim: ambang tidak ada DITOLAK", bkA, "901", taFresh(), "lvTidakAda", "tolak");
await kl("klaim: siswa tanpa indeks (111) DITOLAK", bkA, "111", taFresh(), "lvB", "tolak");
await kl("klaim: atas nama BK lain DITOLAK", bkA, "901", taFresh(), "lvB", "tolak", { untuk: bkB });
await kl("klaim: cara 'tunjuk' oleh BK DITOLAK", bkA, "901", taFresh(), "lvB", "tolak", { data: { cara: "tunjuk" } });
await kl("klaim: olehUid palsu DITOLAK", bkA, "901", taFresh(), "lvB", "tolak", { data: { olehUid: bkB.uid } });
await kl("klaim: sejak bukan waktu server DITOLAK", bkA, "901", taFresh(), "lvB", "tolak", { data: { sejak: 5 } });
await kl("klaim: TANPA log aktivitas DITOLAK", bkA, "901", taFresh(), "lvB", "tolak", tanpaLog);
await kl("klaim: log aksi salah DITOLAK", bkA, "901", taFresh(), "lvB", "tolak", { aksi: "catat-pembinaan" });
await uji("klaim: kunci tidak cocok ta+levelId DITOLAK", bkA, "PATCH", "", { ...act(bkA, "klaim-bk").body, [`klaimBK/901/${pbId("lvB", taFresh())}`]: klaimNode(bkA, "2099-2100", "lvB") }, "tolak");
await uji("klaim: field asing DITOLAK", bkA, "PATCH", "", klaimBody(bkA, "901", taFresh(), "lvB", { data: { x: 1 } }), "tolak");
for (const [n, who] of [["wali A", waliA], ["piket", piket], ["ortu", ortu1], ["admin", admin]]) await kl(`klaim: ${n} TIDAK mengklaim`, who, "901", taFresh(), "lvB", "tolak", { untuk: who });
await kl("klaim: waka TIDAK mengklaim dengan cara 'klaim'", waka, "901", taFresh(), "lvB", "tolak", { untuk: bkA });
await tolak("klaim: BK TIDAK menghapus klaim lewat DELETE tanpa log", bkA, "DELETE", KL("902", tk1));

// ---- lepas klaim (alasan 10-300 = isi detail log)
const lepasBody = (u, nis, ta, lv, o = {}) => ({ ...(o.act?.tanpa ? {} : act(u, o.aksi ?? "lepas-klaim-bk", o.act ?? { entri: { detail: o.alasan ?? "Siswa pindah penanganan ke guru lain" } }).body), [KL(nis, ta, lv)]: null });
await uji("lepas klaim: BK lain (B) TIDAK melepas klaim BK A", bkB, "PATCH", "", lepasBody(bkB, "902", tk1, "lvB"), "tolak");
await uji("lepas klaim: TANPA log ditolak", bkA, "PATCH", "", lepasBody(bkA, "902", tk1, "lvB", tanpaLog), "tolak");
await uji("lepas klaim: log aksi salah ditolak", bkA, "PATCH", "", lepasBody(bkA, "902", tk1, "lvB", { aksi: "klaim-bk" }), "tolak");
await uji("lepas klaim: alasan < 10 karakter ditolak", bkA, "PATCH", "", lepasBody(bkA, "902", tk1, "lvB", { alasan: "singkat" }), "tolak");
await uji("lepas klaim: alasan > 300 karakter ditolak", bkA, "PATCH", "", lepasBody(bkA, "902", tk1, "lvB", { alasan: "x".repeat(301) }), "tolak");
await uji("lepas klaim: waka TIDAK melepas klaim lewat jalur BK", waka, "PATCH", "", lepasBody(waka, "902", tk1, "lvB"), "tolak");
// pembinaan SELESAI -> klaim tidak dapat dilepas
const tkS = taFresh();
await pbk("klaim: BK A mencatat pembinaan SELESAI (klaim disemai)", bkA, "901", "izin", { ta: tkS });
await uji("lepas klaim: pembinaan sudah SELESAI -> ditolak", bkA, "PATCH", "", lepasBody(bkA, "901", tkS, "lvB"), "tolak");
await uji("lepas klaim: BK A melepas klaim 902 (pembinaan belum selesai) diterima", bkA, "PATCH", "", lepasBody(bkA, "902", tk1, "lvB"), "izin");
await cek("lepas klaim: node klaim hilang", bkB, KL("902", tk1), (j) => j === null);
await kl("klaim: BK B dapat mengklaim setelah klaim dilepas", bkB, "902", tk1, "lvB", "izin");

// ---- tunjuk & pindahkan oleh waka/kepala
await http("PUT", `bkAkun/${bkA.uid}`, { owner: true, body: { email: "bka@uji.test", nama: "Bu BK A", aktif: true } });
await http("PUT", `bkAkun/${bkB.uid}`, { owner: true, body: { email: "bkb@uji.test", nama: "Bu BK B", aktif: true } });
await http("PUT", `bkAkun/${bkBaru1.uid}`, { owner: true, body: { email: "bkbaru1@uji.test", nama: "Bu BK Nonaktif", aktif: false } });
const tunjukNode = (u, ta, lv, bk, o = {}) => ({ bkUid: bk.uid, bkNama: "Bu BK", sejak: SV, cara: "tunjuk", olehUid: u.uid, ta, levelId: lv, ...o });
const tunjukBody = (u, nis, ta, lv, bk, o = {}) => ({ ...(o.act?.tanpa ? {} : act(u, o.aksi ?? "tunjuk-bk", o.act ?? {}).body), [KL(nis, ta, lv)]: tunjukNode(u, ta, lv, bk, o.data ?? {}) });
const tj = (nama, who, nis, ta, lv, bk, harap, o) => uji(nama, who, "PATCH", "", tunjukBody(who, nis, ta, lv, bk, o), harap);
const tt1 = taFresh();
await tj("tunjuk: waka menunjuk BK A untuk siswa belum diklaim", waka, "902", tt1, "lvB", bkA, "izin");
await tj("tunjuk: kepala menunjuk BK B untuk siswa belum diklaim", kepala, "903", tt1, "lvB", bkB, "izin");
await tj("tunjuk: BK nonaktif (aktif=false) DITOLAK", waka, "901", taFresh(), "lvB", bkBaru1, "tolak");
await tj("tunjuk: uid yang bukan BK (tanpa bkAkun) DITOLAK", waka, "901", taFresh(), "lvB", waliA, "tolak");
await tj("tunjuk: cara 'klaim' oleh waka DITOLAK", waka, "901", taFresh(), "lvB", bkA, "tolak", { data: { cara: "klaim" } });
await tj("tunjuk: TANPA log DITOLAK", waka, "901", taFresh(), "lvB", bkA, "tolak", tanpaLog);
await tj("tunjuk: log aksi salah ('klaim-bk') DITOLAK", waka, "901", taFresh(), "lvB", bkA, "tolak", { aksi: "klaim-bk" });
await tj("tunjuk: ambang bukan BK DITOLAK", waka, "901", taFresh(), "lvW", bkA, "tolak");
await tj("tunjuk: sejak palsu DITOLAK", waka, "901", taFresh(), "lvB", bkA, "tolak", { data: { sejak: 5 } });
for (const [n, who] of [["admin", admin], ["piket", piket], ["wali A", waliA], ["ortu", ortu1]]) await tj(`tunjuk: ${n} TIDAK menunjuk`, who, "901", taFresh(), "lvB", bkA, "tolak");
await tj("tunjuk: menunjuk saat SUDAH ada klaim (tanpa alasan pindah) DITOLAK", waka, "902", tt1, "lvB", bkB, "tolak");
const pindahBody = (u, nis, ta, lv, bk, o = {}) => ({ ...(o.act?.tanpa ? {} : act(u, o.aksi ?? "pindah-bk", o.act ?? { entri: { detail: o.alasan ?? "BK sebelumnya cuti panjang" } }).body), [KL(nis, ta, lv)]: tunjukNode(u, ta, lv, bk, o.data ?? {}) });
const pd = (nama, who, nis, ta, lv, bk, harap, o) => uji(nama, who, "PATCH", "", pindahBody(who, nis, ta, lv, bk, o), harap);
await pd("pindah: waka memindahkan 902 dari BK A ke BK B dengan alasan", waka, "902", tt1, "lvB", bkB, "izin");
await cek("pindah: klaim kini atas nama BK B (cara tunjuk)", bkA, KL("902", tt1), (j) => j?.bkUid === bkB.uid && j.cara === "tunjuk");
await pd("pindah: ke BK yang SAMA ditolak", waka, "902", tt1, "lvB", bkB, "tolak");
await pd("pindah: alasan < 10 karakter ditolak", waka, "902", tt1, "lvB", bkA, "tolak", { alasan: "singkat" });
await pd("pindah: alasan > 300 karakter ditolak", waka, "902", tt1, "lvB", bkA, "tolak", { alasan: "x".repeat(301) });
await pd("pindah: TANPA log ditolak", waka, "902", tt1, "lvB", bkA, "tolak", tanpaLog);
await pd("pindah: log aksi 'tunjuk-bk' (bukan pindah-bk) ditolak", waka, "902", tt1, "lvB", bkA, "tolak", { aksi: "tunjuk-bk" });
await pd("pindah: ke BK nonaktif ditolak", waka, "902", tt1, "lvB", bkBaru1, "tolak");
await pd("pindah: oleh BK (bukan waka/kepala) ditolak", bkA, "902", tt1, "lvB", bkA, "tolak");
await pd("pindah: kepala memindahkan 902 kembali ke BK A diterima", kepala, "902", tt1, "lvB", bkA, "izin");
await pd("pindah: admin TIDAK memindahkan", admin, "902", tt1, "lvB", bkB, "tolak");
await pd("pindah: piket TIDAK memindahkan", piket, "902", tt1, "lvB", bkB, "tolak");

// ---- pembinaan oleh pemegang klaim (pj bk)
await pbk("bk: BK pemegang klaim mencatat pembinaan ambang BK siswa kelas X (901)", bkA, "901", "izin");
await pbk("bk: BK pemegang klaim mencatat pembinaan siswa kelas XI (902) — lintas kelas", bkA, "902", "izin");
await pbk("bk: BK B pemegang klaim mencatat siswa kelas XII (903)", bkB, "903", "izin");
await cek("bk: pembinaan tersimpan di jalur bk dengan pj='bk' dan pelaksana BK", waka, `pembinaan/bk/901/${pbId("lvB", tkS)}`, (j) => j?.oleh === bkA.uid && j.pj === "bk" && j.status === "selesai");
await cek("bk: waka membaca jalur bk", waka, "pembinaan/bk/901", (j) => Object.keys(j ?? {}).length >= 1);
await pbk("bk: TANPA klaim DITOLAK", bkA, "901", "tolak", { tanpaKlaim: true });
await pbk("bk: klaim milik BK LAIN DITOLAK", bkA, "901", "tolak", { klaimUntuk: bkB });
await pbk("bk: ambang WALI (lvW) DITOLAK untuk BK (jalur wali)", bkA, "901", "tolak", { levelId: "lvW", tanpaKlaim: true });
await pbk("bk: record jalur bk dengan ambang wali DITOLAK", bkA, "901", "tolak", { levelId: "lvW", grup: "bk", tanpaKlaim: true });
await pbk("bk: ambang Kepala (lvK) DITOLAK untuk BK", bkA, "901", "tolak", { levelId: "lvK", tanpaKlaim: true });
await pbk("bk: siswa tanpa indeks (111) DITOLAK", bkA, "111", "tolak");
await pbk("bk: TANPA log aktivitas DITOLAK", bkA, "901", "tolak", tanpaLog);
await pbk("bk: log aksi salah ('pelanggaran') DITOLAK", bkA, "901", "tolak", { aksi: "pelanggaran" });
await pbk("bk: oleh palsu DITOLAK", bkA, "901", "tolak", { data: { oleh: waka.uid } });
await pbk("bk: pj record palsu ('wali') di jalur bk DITOLAK", bkA, "901", "tolak", { data: { pj: "wali" } });
await pbk("bk: hasil < 10 karakter DITOLAK", bkA, "901", "tolak", { data: { hasil: "pendek" } });
// pindah: BK baru melanjutkan pada record yang sama; BK lama kehilangan hak
const tLan = taFresh();
await pbk("bk: BK A mencatat pembinaan DIJADWALKAN (siswa 901)", bkA, "901", "izin", { ta: tLan, data: { status: "dijadwalkan" } });
const rLan = await rekam("bk", "901", pbId("lvB", tLan));
const ubahBk = (u, ta, data, o = {}) => ({ ...act(u, o.aksi ?? "catat-pembinaan").body, [`pembinaan/bk/901/${pbId("lvB", ta)}`]: pbRec(u, "lvB", { ta, oleh: rLan.oleh, dibuatTs: rLan.dibuatTs, diubahOleh: u.uid, diubahTs: SV, ...data }) });
await uji("bk: BK B (tanpa klaim) TIDAK mengubah pembinaan milik BK A", bkB, "PATCH", "", ubahBk(bkB, tLan, { hasil: "BK lain mencoba mengubah tanpa klaim" }), "tolak");
await pd("pindah: waka memindahkan klaim 901 ke BK B", waka, "901", tLan, "lvB", bkB, "izin");
await uji("bk: BK A (klaim sudah dipindah) TIDAK lagi mengubah", bkA, "PATCH", "", ubahBk(bkA, tLan, { hasil: "BK lama mencoba mengubah setelah dipindah" }), "tolak");
await uji("bk: BK B (klaim baru) melanjutkan pada record yang sama (oleh tetap BK A)", bkB, "PATCH", "", ubahBk(bkB, tLan, { hasil: "BK baru melanjutkan pembinaan dengan hasil memadai", status: "selesai" }), "izin");
await cek("bk: record lama tetap atas nama BK A (oleh tidak berubah)", waka, `pembinaan/bk/901/${pbId("lvB", tLan)}`, (j) => j?.oleh === bkA.uid && j.diubahOleh === bkB.uid);
await uji("bk: BK TIDAK mengoreksi pembinaan yang sudah SELESAI", bkB, "PATCH", "", ubahBk(bkB, tLan, { hasil: "Diubah setelah selesai tanpa wewenang BK" }), "tolak");
await uji("bk: waka mengoreksi pembinaan BK SELESAI dengan alasan < 10 karakter (log 'uji') DITOLAK", waka, "PATCH", "", ubahBk(waka, tLan, { hasil: "Dikoreksi waka setelah klarifikasi dengan BK" }, { aksi: "koreksi-pembinaan" }), "tolak");
await uji("bk: waka mengoreksi pembinaan BK SELESAI dengan alasan (log ≥10) diterima", waka, "PATCH", "", { ...act(waka, "koreksi-pembinaan", { entri: { detail: "Koreksi setelah klarifikasi dengan BK" } }).body, [`pembinaan/bk/901/${pbId("lvB", tLan)}`]: pbRec(waka, "lvB", { ta: tLan, oleh: rLan.oleh, dibuatTs: rLan.dibuatTs, diubahOleh: waka.uid, diubahTs: SV, hasil: "Dikoreksi waka setelah klarifikasi dengan BK" }) }, "izin");
await tolak("bk: BK TIDAK menghapus pembinaan", bkA, "DELETE", `pembinaan/bk/901/${pbId("lvB", tkS)}`);
await pbu("wali: ambang BK (lvB) tetap DITOLAK untuk wali (regresi)", waliA, "701", "tolak", { levelId: "lvB" });

// ---- BK TIDAK lagi mencatat pelanggaran (v2.5): tulis baru & hapus ditolak; catatan lama sumber 'bk' tetap sah dan terbaca
const bkPel = (u, n, id, ro = {}, mo = {}, o = {}) => ({
  ...(o.act?.tanpa ? {} : act(u, o.aksi ?? "pelanggaran", o.act ?? {}).body),
  [P(n, id)]: rec({ sumber: "bk", refId: "r1", kategori: "Ringan", nama: "Contoh", poin: 5, ...ro }),
  [M(n, id)]: meta(u, { dibuatNama: "Bu BK", hariKe: HK, ...mo }),
});
const bpl = (nama, who, n, id, ro, mo, harap, o) => uji(nama, who, "PATCH", "", bkPel(who, n, id, ro, mo, o), harap);
await bpl("bk: pelanggaran Ringan (sumber 'bk') DITOLAK", bkA, "901", "bkp1", {}, {}, "tolak");
await bpl("bk: pelanggaran bertakziran (sumber 'bk') DITOLAK", bkA, "903", "bkp2", { refId: "rT", kategori: "Sedang", nama: "Sedang bertakziran", poin: 50, takziran: "Bersihkan lorong" }, {}, "tolak");
await bpl("bk: pelanggaran dengan sumber 'manual' DITOLAK", bkA, "901", "bkp3", { sumber: "manual" }, {}, "tolak");
await bpl("bk: pelanggaran dengan sumber 'wali' DITOLAK", bkA, "901", "bkp4", { sumber: "wali" }, {}, "tolak");
await uji("bk: tulis record pelanggaran sendirian (tanpa meta) DITOLAK", bkA, "PATCH", "", { ...act(bkA, "pelanggaran").body, [P("901", "bkp5")]: rec({ sumber: "bk", refId: "r1", kategori: "Ringan", nama: "Contoh", poin: 5 }) }, "tolak");
await uji("bk: tulis meta pelanggaran sendirian (sumber 'bk') DITOLAK", bkA, "PATCH", "", { ...act(bkA, "pelanggaran").body, [M("901", "bkp6")]: meta(bkA, { dibuatNama: "Bu BK", hariKe: HK }) }, "tolak");
await uji("wali: sumber 'bk' DITOLAK untuk wali (regresi)", waliA, "PATCH", "", bkPel(waliA, "701", "bkpx12"), "tolak");
await uji("piket: sumber 'bk' DITOLAK untuk piket (regresi)", piket, "PATCH", "", bkPel(piket, "701", "bkpx13"), "tolak");
await uji("waka: tidak dapat membuat catatan baru bersumber 'bk' (hanya data lama)", waka, "PATCH", "", { [P("901", "bkp7")]: rec({ sumber: "bk", refId: "r1", kategori: "Ringan", nama: "Contoh", poin: 5 }), [M("901", "bkp7")]: meta(waka, { dibuatNama: "Waka" }) }, "tolak");
// catatan lama bersumber 'bk' (disemai owner) tetap terbaca & dihitung; hanya waka/kepala yang dapat menghapus lunak
await http("PATCH", "", { owner: true, body: { [P("901", "bkLama")]: rec({ sumber: "bk", refId: "r1", kategori: "Ringan", nama: "Contoh", poin: 5 }), [M("901", "bkLama")]: meta(bkA, { dibuatNama: "Bu BK", hariKe: HK }) } });
await cek("bk: catatan LAMA bersumber 'bk' tetap terbaca", bkA, P("901", "bkLama"), (j) => j?.sumber === "bk" && j.poin === 5);
await cek("bk: catatan lama terbaca waka dengan meta pencatat", waka, M("901", "bkLama"), (j) => j?.dibuatOleh === bkA.uid);
const bkHapus = (u, n, id, o = {}) => ({
  ...act(u, o.aksi ?? "hapus-pelanggaran").body,
  [P(n, id)]: null, [`${M(n, id)}/dihapus`]: true, [`${M(n, id)}/alasanHapus`]: "salah siswa", [`${M(n, id)}/snapshot`]: rec({ sumber: "bk", refId: "r1", kategori: "Ringan", nama: "Contoh", poin: 5 }),
  [`${M(n, id)}/diubahOleh`]: u.uid, [`${M(n, id)}/diubahTs`]: SV,
});
await uji("bk: BK TIDAK menghapus catatan lama miliknya sendiri (v2.5)", bkA, "PATCH", "", bkHapus(bkA, "901", "bkLama"), "tolak");
await uji("bk: BK B TIDAK menghapus catatan BK A", bkB, "PATCH", "", bkHapus(bkB, "901", "bkLama"), "tolak");
await uji("bk: BK TIDAK menghapus catatan sumber 'manual' milik waka (recMan)", bkA, "PATCH", "", bkHapus(bkA, "701", "recMan"), "tolak");
await uji("bk: waka menghapus lunak catatan lama bersumber 'bk' DITERIMA", waka, "PATCH", "", { [P("901", "bkLama")]: null, [`${M("901", "bkLama")}/dihapus`]: true, [`${M("901", "bkLama")}/alasanHapus`]: "salah siswa", [`${M("901", "bkLama")}/snapshot`]: rec({ sumber: "bk", refId: "r1", kategori: "Ringan", nama: "Contoh", poin: 5 }), [`${M("901", "bkLama")}/diubahOleh`]: waka.uid, [`${M("901", "bkLama")}/diubahTs`]: SV }, "izin");

// ---- USUL REMISI oleh BK: hanya siswa yang ia klaim (klaimKey); diputuskan waka/kepala
const tU = taFresh();
await klaimSeed("901", tU, "lvB", bkA);
await klaimSeed("903", tU, "lvB", bkA);
const KEY_U = pbId("lvB", tU);
await us("bk: BK mengusulkan remisi siswa yang ia klaim (901)", bkA, "bkU1", "izin", { data: { nis: "901", klaimKey: KEY_U } });
await us("bk: BK mengusulkan remisi siswa lain yang ia klaim (903) — lintas kelas", bkA, "bkU2", "izin", { data: { nis: "903", klaimKey: KEY_U } });
await us("bk: usulan TANPA klaimKey DITOLAK", bkA, "bkUx0", "tolak", { data: { nis: "901" } });
await us("bk: usulan untuk siswa yang TIDAK ia klaim (902 milik BK lain/tanpa klaim) DITOLAK", bkA, "bkUx5", "tolak", { data: { nis: "902", klaimKey: KEY_U } });
await us("bk: usulan memakai klaim milik BK LAIN DITOLAK", bkB, "bkUx6", "tolak", { data: { nis: "901", klaimKey: KEY_U } });
await us("bk: siswa tanpa indeks (111) DITOLAK", bkA, "bkUx1", "tolak", { data: { nis: "111", klaimKey: KEY_U } });
await us("bk: TANPA log aktivitas DITOLAK", bkA, "bkUx2", "tolak", { data: { nis: "901", klaimKey: KEY_U }, act: { tanpa: true } });
await us("bk: status langsung 'disetujui' DITOLAK", bkA, "bkUx3", "tolak", { data: { nis: "901", klaimKey: KEY_U, status: "disetujui" } });
await us("bk: remisi nonaktif DITOLAK", bkA, "bkUx4", "tolak", { data: { nis: "901", klaimKey: KEY_U, remId: "mOff", nama: "Remisi nonaktif", poin: 20 } });
await us("bk: klaimKey format salah DITOLAK", bkA, "bkUx7", "tolak", { data: { nis: "901", klaimKey: "bukan-kunci" } });
await izin("bk: BK membaca usulan sendiri", bkA, "GET", "usulRemisi/bkU1");
await tolak("bk: BK B TIDAK membaca usulan BK A", bkB, "GET", "usulRemisi/bkU1");
await tolak("bk: BK TIDAK membaca seluruh node usulRemisi", bkA, "GET", "usulRemisi");
await uji("bk: BK B TIDAK membatalkan usulan BK A", bkB, "PATCH", "", { ...act(bkB, "batal-usul").body, "usulRemisi/bkU1": null }, "tolak");
await uji("bk: BK A membatalkan usulan SENDIRI (menunggu) DITERIMA", bkA, "PATCH", "", { ...act(bkA, "batal-usul").body, "usulRemisi/bkU2": null }, "izin");
await uji("bk: BK TIDAK memutuskan usulan sendiri (setuju)", bkA, "PATCH", "", { ...act(bkA, "putuskan-usul").body, ...putus(bkA, "bkU1", { nis: "901" }) }, "tolak");
await uji("bk: waka menyetujui usulan BK (usulan + record usul-wali + meta) DITERIMA", waka, "PATCH", "", putus(waka, "bkU1", { nis: "901" }), "izin");
await uji("bk: BK TIDAK membatalkan usulan yang SUDAH diputuskan", bkA, "PATCH", "", { ...act(bkA, "batal-usul").body, "usulRemisi/bkU1": null }, "tolak");
await cek("bk: record remisi 'usul-wali' tercipta untuk usulan BK", waka, "discipline/records/901/bkU1", (j) => j?.sumber === "usul-wali" && j.jenis === "remisi");

// ---- CATATAN KONSELING RAHASIA
const KS = (u, o = {}) => ({ tanggal: TGL, topik: "Pribadi", isi: "Siswa bercerita tentang masalah keluarga yang memengaruhi belajarnya.", rahasia: true, oleh: u.uid, olehNama: "Bu BK", dibuatTs: SV, ...o });
const ksBody = (u, nis, id, o = {}) => ({ ...(o.act?.tanpa ? {} : act(u, o.aksi ?? "catat-konseling", o.act ?? {}).body), [`konseling/${nis}/${id}`]: KS(u, o.data ?? {}), ...(o.tambah ?? {}) });
const ks = (nama, who, nis, id, harap, o) => uji(nama, who, "PATCH", "", ksBody(who, nis, id, o), harap);
await ks("konseling: BK mencatat siswa kelas X (901)", bkA, "901", "k1", "izin");
await ks("konseling: BK mencatat siswa kelas XI (902) — lintas kelas", bkA, "902", "k2", "izin", { data: { topik: "Akademik" } });
await ks("konseling: BK B mencatat siswa kelas XII (903) dengan tindak lanjut", bkB, "903", "k3", "izin", { data: { topik: "Karier", tindakLanjut: "Pertemuan lanjutan pekan depan" } });
for (const t of ["Akademik", "Pribadi", "Sosial", "Karier", "Keluarga", "Lainnya"]) await ks(`konseling: topik '${t}' DITERIMA`, bkA, "901", `kt${t}`, "izin", { data: { topik: t } });
await ks("konseling: topik di luar daftar DITOLAK", bkA, "901", "kx1", "tolak", { data: { topik: "Hiburan" } });
await ks("konseling: isi < 10 karakter DITOLAK", bkA, "901", "kx2", "tolak", { data: { isi: "pendek" } });
await ks("konseling: isi tepat 2000 karakter DITERIMA", bkA, "901", "kx3", "izin", { data: { isi: "x".repeat(2000) } });
await ks("konseling: isi 2001 karakter DITOLAK", bkA, "901", "kx4", "tolak", { data: { isi: "x".repeat(2001) } });
await ks("konseling: tindak lanjut 501 karakter DITOLAK", bkA, "901", "kx5", "tolak", { data: { tindakLanjut: "x".repeat(501) } });
await ks("konseling: rahasia bukan true DITOLAK", bkA, "901", "kx6", "tolak", { data: { rahasia: false } });
await ks("konseling: TANPA field rahasia DITOLAK", bkA, "901", "kx7", "tolak", { data: { rahasia: undefined } });
await ks("konseling: oleh palsu DITOLAK", bkA, "901", "kx8", "tolak", { data: { oleh: bkB.uid } });
await ks("konseling: dibuatTs bukan waktu server DITOLAK", bkA, "901", "kx9", "tolak", { data: { dibuatTs: 12345 } });
await ks("konseling: format tanggal salah DITOLAK", bkA, "901", "kx10", "tolak", { data: { tanggal: "20-10-2026" } });
await ks("konseling: field asing DITOLAK", bkA, "901", "kx11", "tolak", { data: { rahasia2: 1 } });
await ks("konseling: membawa diubahTs pada pembuatan DITOLAK", bkA, "901", "kx12", "tolak", { data: { diubahTs: SV } });
await ks("konseling: TANPA log aktivitas DITOLAK", bkA, "901", "kx13", "tolak", { act: { tanpa: true } });
await ks("konseling: log aksi salah ('pelanggaran') DITOLAK", bkA, "901", "kx14", "tolak", { aksi: "pelanggaran" });
await ks("konseling: penanda log tanpa ENTRI DITOLAK", bkA, "901", "kx15", "tolak", { act: { tanpaEntri: true } });
await ks("konseling: siswa tanpa indeks (111) DITOLAK", bkA, "111", "kx16", "tolak");
await ks("konseling: id tidak sah DITOLAK", bkA, "901", "k.bad", "tolak");
await uji("konseling: BK menimpa catatan yang ada lewat jalur BUAT (log catat) DITOLAK", bkA, "PATCH", "", ksBody(bkA, "901", "k1", { data: { isi: "Menimpa catatan lama tanpa audit sama sekali." } }), "tolak");

// ---- siapa boleh MEMBACA
for (const [n, who] of [["BK A", bkA], ["BK B", bkB]]) {
  await izin(`konseling: ${n} membaca satu catatan`, who, "GET", "konseling/901/k1");
  await izin(`konseling: ${n} membaca konseling per siswa`, who, "GET", "konseling/902");
  await izin(`konseling: ${n} membaca seluruh node konseling`, who, "GET", "konseling");
}
for (const [n, who] of [["kepala", kepala], ["waka", waka], ["admin", admin], ["wali A", waliA], ["piket", piket], ["ortu", ortu1], ["alat", dev], ["anonim", null]]) {
  await tolak(`konseling: ${n} TIDAK membaca satu catatan`, who, "GET", "konseling/901/k1");
  await tolak(`konseling: ${n} TIDAK membaca konseling per siswa`, who, "GET", "konseling/901");
  await tolak(`konseling: ${n} TIDAK membaca seluruh node`, who, "GET", "konseling");
}
await tolak("konseling: waka TIDAK query konseling", waka, "GET", `konseling?orderBy=${encodeURIComponent('"$key"')}&limitToFirst=1`);
await tolak("konseling: ortu TIDAK membaca konseling anak sendiri (111)", ortu1, "GET", "konseling/111");
// ---- siapa boleh MENULIS (selain BK ditolak, termasuk lewat Console = klien REST)
for (const [n, who] of [["kepala", kepala], ["waka", waka], ["admin", admin], ["wali A", waliA], ["piket", piket], ["ortu", ortu1], ["alat", dev]]) {
  await uji(`konseling: ${n} TIDAK menulis catatan (log valid)`, who, "PATCH", "", ksBody(who, "901", `kw-${n.replace(/\s/g, "")}`), "tolak");
  await tolak(`konseling: ${n} TIDAK menulis catatan (PUT langsung)`, who, "PUT", `konseling/901/kp-${n.replace(/\s/g, "")}`, KS(who));
}
await tolak("konseling: anonim TIDAK menulis", null, "PUT", "konseling/901/kanon", KS(bkA));

// ---- koreksi: ubah + audit konseling SAMA update; hapus fisik ditolak
const ksUbah = (u, nis, id, lama, o = {}) => ({
  ...act(u, o.aksi ?? "ubah-konseling", o.act ?? {}).body,
  [`konseling/${nis}/${id}/isi`]: o.isi ?? "Isi yang sudah dikoreksi oleh konselor pembuat catatan ini.",
  [`konseling/${nis}/${id}/diubahTs`]: SV, [`konseling/${nis}/${id}/diubahOleh`]: u.uid,
  ...(o.tanpaAudit ? {} : { [`konselingAudit/${nis}/${o.auditKey ?? "__LOG__"}`]: { konselingId: id, oleh: o.auditOleh ?? u.uid, olehNama: "Bu BK", ts: SV, sebelum: { tanggal: TGL, topik: "Pribadi", isi: lama, ...(o.sebelum ?? {}) } } }),
  ...(o.tambah ?? {}),
});
const LAMA_K1 = "Siswa bercerita tentang masalah keluarga yang memengaruhi belajarnya.";
await ks("konseling: siapkan catatan kn (topik Pribadi) untuk uji koreksi negatif", bkA, "902", "kn", "izin", { data: { isi: LAMA_K1 } });
/** Audit dikunci dengan id entri log aktivitas; helper act() membuat id acak, jadi id diambil dari body log lalu dipasang ke kunci audit. */
const ubahKs = (u, nis, id, lama, o = {}) => {
  const b = ksUbah(u, nis, id, lama, o);
  const idLog = b[`activityLast/${u.uid}`]?.id;
  const k = `konselingAudit/${nis}/__LOG__`;
  if (b[k]) { b[`konselingAudit/${nis}/${idLog}`] = b[k]; delete b[k]; }
  return b;
};
await uji("konseling: BK pembuat mengubah isi + audit + log 'ubah-konseling' DITERIMA", bkA, "PATCH", "", ubahKs(bkA, "901", "k1", LAMA_K1), "izin");
await cek("konseling: isi baru tersimpan dengan diubahTs/diubahOleh; dibuatTs & oleh tetap", bkA, "konseling/901/k1", (j) => j?.isi.startsWith("Isi yang sudah dikoreksi") && j.diubahOleh === bkA.uid && j.oleh === bkA.uid && typeof j.diubahTs === "number" && typeof j.dibuatTs === "number");
await cek("konseling: audit menyimpan isi LAMA, terbaca BK", bkA, "konselingAudit/901", (j) => Object.values(j ?? {}).some((x) => x.konselingId === "k1" && x.sebelum?.isi === LAMA_K1));
await tolak("konselingAudit: kepala TIDAK membaca audit (v2.5: hanya BK)", kepala, "GET", "konselingAudit/901");
await uji("konseling: ubah TANPA audit DITOLAK", bkA, "PATCH", "", ubahKs(bkA, "902", "kn", LAMA_K1, { tanpaAudit: true }), "tolak");
await uji("konseling: ubah dengan audit isi lama TIDAK cocok DITOLAK", bkA, "PATCH", "", ubahKs(bkA, "902", "kn", "isi lama yang dipalsukan sama sekali berbeda", {}), "tolak");
await uji("konseling: ubah dengan audit tanggal lama tidak cocok DITOLAK", bkA, "PATCH", "", ubahKs(bkA, "902", "kn", LAMA_K1, { sebelum: { tanggal: "2026-01-02" } }), "tolak");
await uji("konseling: audit memuat oleh orang lain (BK B) saat BK A mengoreksi DITOLAK", bkA, "PATCH", "", ubahKs(bkA, "902", "kn", LAMA_K1, { auditOleh: bkB.uid }), "tolak");
await uji("konseling: ubah dengan audit topik lama tidak cocok DITOLAK", bkA, "PATCH", "", ubahKs(bkA, "902", "kn", "Siswa bercerita tentang masalah keluarga yang memengaruhi belajarnya.", { sebelum: { topik: "Sosial" } }), "tolak");
await uji("konseling: ubah dengan log aksi 'catat-konseling' DITOLAK", bkA, "PATCH", "", ubahKs(bkA, "902", "kn", LAMA_K1, { aksi: "catat-konseling" }), "tolak");
await uji("konseling: ubah TANPA log aktivitas DITOLAK", bkA, "PATCH", "", ubahKs(bkA, "902", "kn", LAMA_K1, { act: { tanpa: true } }), "tolak");
await uji("konseling: BK B (bukan pembuat) mengubah catatan BK A DITOLAK", bkB, "PATCH", "", ubahKs(bkB, "902", "kn", LAMA_K1), "tolak");
await uji("konseling: ubah tanpa diubahTs DITOLAK", bkA, "PATCH", "", (() => { const b = ubahKs(bkA, "902", "kn", LAMA_K1); delete b["konseling/902/kn/diubahTs"]; return b; })(), "tolak");
await uji("konseling: ubah dengan oleh dialihkan ke BK lain DITOLAK", bkA, "PATCH", "", ubahKs(bkA, "902", "kn", LAMA_K1, { tambah: { "konseling/902/kn/oleh": bkB.uid } }), "tolak");
await uji("konseling: ubah dengan dibuatTs diganti DITOLAK", bkA, "PATCH", "", ubahKs(bkA, "902", "kn", LAMA_K1, { tambah: { "konseling/902/kn/dibuatTs": 5 } }), "tolak");
await uji("konseling: ubah dengan rahasia=false DITOLAK", bkA, "PATCH", "", ubahKs(bkA, "902", "kn", LAMA_K1, { tambah: { "konseling/902/kn/rahasia": false } }), "tolak");
await uji("konseling: BK B menulis audit LEPAS untuk catatan BK A (tanpa perubahan konseling) DITOLAK", bkB, "PUT", "konselingAudit/902/auditLepasB", { konselingId: "kn", oleh: bkB.uid, olehNama: "x", ts: SV, sebelum: { tanggal: TGL, topik: "Pribadi", isi: LAMA_K1 } }, "tolak");
await uji("konseling: kontrol — koreksi SAH atas kn (semua syarat terpenuhi) DITERIMA", bkA, "PATCH", "", ubahKs(bkA, "902", "kn", LAMA_K1), "izin");
for (const [n, who] of [["BK A", bkA], ["BK B", bkB], ["kepala", kepala], ["admin", admin], ["waka", waka]]) {
  await tolak(`konseling: ${n} TIDAK menghapus fisik catatan (DELETE)`, who, "DELETE", "konseling/902/k2");
  await uji(`konseling: ${n} TIDAK menghapus fisik lewat PATCH null`, who, "PATCH", "", { ...act(who, "ubah-konseling").body, "konseling/902/k2": null }, "tolak");
}
await tolak("konseling: BK TIDAK menghapus node konseling siswa", bkA, "DELETE", "konseling/902");
await cek("konseling: catatan k2 tetap utuh setelah semua upaya", bkA, "konseling/902/k2", (j) => j?.topik === "Akademik" && j.isi.startsWith("Siswa bercerita"));
// audit khusus
for (const [n, who] of [["waka", waka], ["admin", admin], ["wali A", waliA], ["piket", piket], ["ortu", ortu1], ["anonim", null]]) {
  await tolak(`konselingAudit: ${n} TIDAK membaca`, who, "GET", "konselingAudit/901");
}
await tolak("konselingAudit: BK TIDAK menimpa entri audit yang ada", bkA, "PATCH", "", { ...act(bkA, "ubah-konseling").body, [`konselingAudit/901/${Object.keys((await http("GET", "konselingAudit/901", { owner: true })).json ?? {})[0]}`]: { konselingId: "k1", oleh: bkA.uid, olehNama: "x", ts: SV, sebelum: { tanggal: TGL, topik: "Pribadi", isi: LAMA_K1 } } });
await tolak("konselingAudit: BK TIDAK menghapus audit", bkA, "DELETE", `konselingAudit/901/${Object.keys((await http("GET", "konselingAudit/901", { owner: true })).json ?? {})[0]}`);
await tolak("konselingAudit: BK TIDAK menulis audit sendirian (tanpa perubahan konseling)", bkA, "PUT", "konselingAudit/901/auditLepas", { konselingId: "k1", oleh: bkA.uid, olehNama: "x", ts: SV, sebelum: { tanggal: TGL, topik: "Pribadi", isi: "Isi yang sudah dikoreksi oleh konselor pembuat catatan ini." } });
await tolak("konselingAudit: kepala TIDAK menulis", kepala, "PUT", "konselingAudit/901/auditK", { konselingId: "k1", oleh: kepala.uid, olehNama: "x", ts: SV, sebelum: { tanggal: TGL, topik: "Pribadi", isi: "x".repeat(12) } });
// isi konseling TIDAK pernah ada di audit umum / aktivitas yang dibaca waka dan admin
const umum = JSON.stringify((await http("GET", "discipline/audit", { owner: true })).json ?? {}) + JSON.stringify((await http("GET", "activity", { owner: true })).json ?? {});
await cek("konseling: isi catatan tidak bocor ke audit umum / log aktivitas (klien menulis detail tanpa isi)", waka, `activity/${TGLN}`, () => !umum.includes("masalah keluarga yang memengaruhi belajarnya"));

// ---- AKUN BK: dibuat admin (bebas) dan waka (per-field, hanya role 'bk' bersama staff.role 'bk')
const staffBkBaru = (uid, nama) => ({ [`staff/${uid}/email`]: `${nama}@uji.test`, [`staff/${uid}/nama`]: nama, [`staff/${uid}/role`]: "bk", [`staff/${uid}/dibuat`]: SV_ANGKA });
await uji("akun BK: admin membuat (role + staff)", admin, "PATCH", "", { [`roles/${bkBaru1.uid}`]: "bk", [`staff/${bkBaru1.uid}`]: stfBk("bkbaru1"), [`bkAkun/${bkBaru1.uid}`]: { email: "bkbaru1@uji.test", nama: "bkbaru1", aktif: true } }, "izin");
await uji("akun BK: waka membuat (role + staff per-field + cermin bkAkun)", waka, "PATCH", "", { [`roles/${bkBaru2.uid}`]: "bk", ...staffBkBaru(bkBaru2.uid, "bkbaru2"), [`bkAkun/${bkBaru2.uid}/email`]: "bkbaru2@uji.test", [`bkAkun/${bkBaru2.uid}/nama`]: "bkbaru2", [`bkAkun/${bkBaru2.uid}/aktif`]: true }, "izin");
await uji("akun BK: waka memasang role 'bk' pada uid segar TANPA staff.role 'bk' DITOLAK", waka, "PATCH", "", { [`roles/${bkBaru3.uid}`]: "bk" }, "tolak");
await uji("akun BK: waka memasang role 'bk' dengan staff.role 'wali' DITOLAK", waka, "PATCH", "", { [`roles/${bkBaru3.uid}`]: "bk", [`staff/${bkBaru3.uid}/email`]: "x@uji.test", [`staff/${bkBaru3.uid}/nama`]: "x", [`staff/${bkBaru3.uid}/role`]: "wali", [`staff/${bkBaru3.uid}/dibuat`]: SV_ANGKA }, "tolak");
await tolak("akun BK: waka TIDAK memberi role 'admin'", waka, "PUT", `roles/${bkBaru2.uid}`, "admin");
await tolak("akun BK: waka TIDAK memberi role 'kepala'", waka, "PUT", `roles/${bkBaru2.uid}`, "kepala");
await tolak("akun BK: waka TIDAK menulis node staff utuh", waka, "PUT", `staff/${bkBaru2.uid}`, stfBk("bkbaru2"));
await tolak("akun BK: kepala TIDAK membuat akun", kepala, "PUT", `roles/${bkBaru1.uid}`, "bk");
await tolak("akun BK: piket TIDAK membuat akun", piket, "PUT", `roles/${bkBaru1.uid}`, "bk");
await izin("akun BK: waka mencabut (hapus role bk)", waka, "DELETE", `roles/${bkBaru2.uid}`);
await izin("akun BK: waka menonaktifkan di cermin (aktif=false)", waka, "PUT", `bkAkun/${bkBaru2.uid}/aktif`, false);
await izin("akun BK: waka membaca cermin bkAkun", waka, "GET", "bkAkun");
await izin("akun BK: kepala membaca cermin bkAkun", kepala, "GET", "bkAkun");
await tolak("akun BK: waka TIDAK mengubah email cermin yang sudah ada", waka, "PUT", `bkAkun/${bkBaru2.uid}/email`, "ganti@uji.test");
await izin("akun BK: akun BK membaca bkAkun (v2.5: daftar BK untuk penunjukan/pemindahan)", bkA, "GET", "bkAkun");
await tolak("akun BK: wali TIDAK membaca bkAkun", waliA, "GET", "bkAkun");
await tolak("akun BK: piket TIDAK membaca bkAkun", piket, "GET", "bkAkun");
await izin("akun BK: admin memasang kembali role bk", admin, "PUT", `roles/${bkBaru2.uid}`, "bk");

seksi("PERANGKAT PIKET — piketPerangkat (create-only)");
{
  const dev1 = `perangkat-${Date.now().toString(36)}-01`;
  await izin("piket mendaftarkan perangkat baru", piket, "PUT", `piketPerangkat/${dev1}`, { uid: piket.uid, pertama: SV, label: "Android 14 · Chrome 129", nama: "HP meja piket" });
  await tolak("piket TIDAK bisa menimpa pendaftaran perangkat", piket, "PUT", `piketPerangkat/${dev1}`, { uid: piket.uid, pertama: SV, label: "Palsu" });
  await tolak("piket TIDAK bisa menghapus pendaftaran perangkat", piket, "DELETE", `piketPerangkat/${dev1}`);
  await tolak("pendaftaran perangkat: pertama basi ditolak", piket, "PUT", `piketPerangkat/perangkat-${Date.now().toString(36)}-02`, { uid: piket.uid, pertama: 1000, label: "x" });
  await tolak("pendaftaran perangkat: uid orang lain ditolak", piket, "PUT", `piketPerangkat/perangkat-${Date.now().toString(36)}-03`, { uid: waka.uid, pertama: SV, label: "x" });
  await tolak("pendaftaran perangkat: id terlalu pendek ditolak", piket, "PUT", "piketPerangkat/abc", { uid: piket.uid, pertama: SV, label: "x" });
  await tolak("pendaftaran perangkat: label > 100 ditolak", piket, "PUT", `piketPerangkat/perangkat-${Date.now().toString(36)}-04`, { uid: piket.uid, pertama: SV, label: "l".repeat(101) });
  await tolak("waka TIDAK bisa menulis piketPerangkat", waka, "PUT", `piketPerangkat/perangkat-${Date.now().toString(36)}-05`, { uid: waka.uid, pertama: SV, label: "x" });
  await izin("waka baca piketPerangkat", waka, "GET", "piketPerangkat");
  await izin("admin baca piketPerangkat", admin, "GET", "piketPerangkat");
  await tolak("kepala TIDAK bisa baca piketPerangkat", kepala, "GET", "piketPerangkat");
  await tolak("ortu TIDAK bisa baca piketPerangkat", ortu1, "GET", "piketPerangkat");
}

seksi("WAKA / ADMIN / KEPALA — pengelolaan piket");
await izin("waka mengatur piketMundurHari = 5", waka, "PUT", "discipline/settings/piketMundurHari", 5);
await izin("waka mengatur piketMundurHari = 0", waka, "PUT", "discipline/settings/piketMundurHari", 0);
await izin("waka mengatur piketMundurHari = 14", waka, "PUT", "discipline/settings/piketMundurHari", 14);
await tolak("piketMundurHari = 15 ditolak", waka, "PUT", "discipline/settings/piketMundurHari", 15);
await tolak("piketMundurHari = -1 ditolak", waka, "PUT", "discipline/settings/piketMundurHari", -1);
await tolak("piketMundurHari = 2.5 ditolak", waka, "PUT", "discipline/settings/piketMundurHari", 2.5);
await tolak("piketMundurHari berupa teks ditolak", waka, "PUT", "discipline/settings/piketMundurHari", "3");
await tolak("kepala TIDAK bisa mengatur piketMundurHari", kepala, "PUT", "discipline/settings/piketMundurHari", 3);
await tolak("admin TIDAK bisa mengatur piketMundurHari", admin, "PUT", "discipline/settings/piketMundurHari", 3);
await tolak("field asing di discipline/settings ditolak", waka, "PUT", "discipline/settings/lain", 1);
// jendela mengikuti pengaturan
await izin("waka mengatur piketMundurHari = 0", waka, "PUT", "discipline/settings/piketMundurHari", 0);
await harian("jendela N=0: hariKe hari ini DITERIMA", piket, "2026-10-24", "111", "Izin", { hariKe: HK }, "izin");
await harian("jendela N=0: kemarin DITOLAK", piket, "2026-10-24", "222", "Izin", { hariKe: HK - 1 }, "tolak");
await izin("waka mengatur piketMundurHari = 5", waka, "PUT", "discipline/settings/piketMundurHari", 5);
await harian("jendela N=5: 5 hari lalu DITERIMA", piket, "2026-10-24", "222", "Izin", { hariKe: HK - 5 }, "izin");
await harian("jendela N=5: 6 hari lalu DITOLAK", piket, "2026-10-24", "333", "Izin", { hariKe: HK - 6 }, "tolak");
await izin("waka mengembalikan piketMundurHari ke 2", waka, "PUT", "discipline/settings/piketMundurHari", 2);
await izin("waka menulis piketRoster", waka, "PUT", "piketRoster/p3", { nama: "Bu Sari", aktif: true });
await izin("waka menonaktifkan petugas", waka, "PATCH", "piketRoster/p3", { aktif: false });
await izin("admin menulis piketRoster", admin, "PUT", "piketRoster/p4", { nama: "Pak Dedi", aktif: true });
await tolak("kepala TIDAK bisa menulis piketRoster", kepala, "PUT", "piketRoster/p5", { nama: "X", aktif: true });
await tolak("piketRoster: nama kosong ditolak", waka, "PUT", "piketRoster/p6", { nama: "", aktif: true });
await tolak("piketRoster: nama > 60 karakter ditolak", waka, "PUT", "piketRoster/p6", { nama: "x".repeat(61), aktif: true });
await tolak("piketRoster: aktif bukan boolean ditolak", waka, "PUT", "piketRoster/p6", { nama: "Bu X", aktif: "ya" });
await tolak("piketRoster: field asing ditolak", waka, "PUT", "piketRoster/p6", { nama: "Bu X", aktif: true, x: 1 });
await tolak("piketRoster: hapus fisik ditolak", waka, "DELETE", "piketRoster/p1");
await izin("admin membuat akun piket (roles + staff + piketAkun)", admin, "PATCH", "", {
  [`roles/${target.uid}`]: "piket", [`staff/${target.uid}`]: { email: "meja@uji.test", nama: "Meja Piket", role: "piket", dibuat: SV },
  [`piketAkun/${target.uid}`]: { email: "meja@uji.test", nama: "Meja Piket", terkunci: false },
});
await izin("admin mencabut akun piket", admin, "PATCH", "", { [`roles/${target.uid}`]: null, [`staff/${target.uid}`]: null, [`piketAkun/${target.uid}`]: null });
await tolak("waka TIDAK bisa menetapkan role piket ke uid sembarang (tanpa staff piket)", waka, "PUT", `roles/${target.uid}`, "piket");
await tolak("kepala TIDAK bisa menetapkan role piket", kepala, "PUT", `roles/${target.uid}`, "piket");
await tolak("admin TETAP tidak bisa menetapkan role 'admin'", admin, "PUT", `roles/${target.uid}`, "admin");
await tolak("piket TIDAK bisa mengubah role dirinya", piket, "PUT", `roles/${piket.uid}`, "waka");
await tolak("staff: role 'piket' dengan field asing ditolak", admin, "PUT", `staff/${target.uid}`, { email: "m@uji.test", nama: "Meja", role: "piket", dibuat: SV, x: 1 });

seksi("KUNCI AKUN PIKET DARURAT (waka & admin) — roles + piketAkun");
{
  // akun piket khusus uji (tidak mengganggu `piket` utama): dibuat admin lengkap dengan staff + piketAkun
  const meja = await buatUser("meja-kunci@uji.test");
  PERAN.set(meja.uid, "piket");
  await izin("admin membuat akun piket 'meja' (roles+staff+piketAkun)", admin, "PATCH", "", {
    [`roles/${meja.uid}`]: "piket", [`staff/${meja.uid}`]: { email: "meja-kunci@uji.test", nama: "Meja Kunci", role: "piket", dibuat: SV },
    [`piketAkun/${meja.uid}`]: { email: "meja-kunci@uji.test", nama: "Meja Kunci", terkunci: false },
  });
  await izin("akun meja berfungsi sebelum dikunci (baca config/students)", meja, "GET", "config/students");
  await izin("waka membaca piketAkun", waka, "GET", "piketAkun");
  await izin("admin membaca piketAkun", admin, "GET", "piketAkun");
  await tolak("kepala TIDAK bisa membaca piketAkun", kepala, "GET", "piketAkun");
  await tolak("ortu TIDAK bisa membaca piketAkun", ortu1, "GET", "piketAkun");
  // waka mengunci: hapus role + tandai terkunci (atomik)
  await izin("waka MENGUNCI akun piket (hapus role + penanda)", waka, "PATCH", "", { [`roles/${meja.uid}`]: null, [`piketAkun/${meja.uid}/terkunci`]: true });
  await tolak("akun terkunci TIDAK bisa lagi membaca config/students", meja, "GET", "config/students");
  await tolak("akun terkunci TIDAK bisa menulis izin", meja, "PATCH", "", harianBody(meja, HT, "444", "Sakit"));
  await izin("waka MEMBUKA kunci (role 'piket' kembali, staff.role = piket)", waka, "PATCH", "", { [`roles/${meja.uid}`]: "piket", [`piketAkun/${meja.uid}/terkunci`]: false });
  await izin("akun berfungsi lagi setelah dibuka", meja, "GET", "config/students");
  await izin("admin MENGUNCI akun piket", admin, "PATCH", "", { [`roles/${meja.uid}`]: null, [`piketAkun/${meja.uid}/terkunci`]: true });
  await izin("admin MEMBUKA kunci akun piket", admin, "PATCH", "", { [`roles/${meja.uid}`]: "piket", [`piketAkun/${meja.uid}/terkunci`]: false });
  // batas wewenang waka
  await tolak("waka TIDAK bisa mengunci akun KEPALA (hapus role kepala)", waka, "DELETE", `roles/${kepala.uid}`);
  await tolak("waka TIDAK bisa mengunci akun waka lain", waka, "DELETE", `roles/${waka2.uid}`);
  await tolak("waka TIDAK bisa mengunci akun admin", waka, "DELETE", `roles/${admin.uid}`);
  await tolak("waka TIDAK bisa mengunci akun alat", waka, "DELETE", `roles/${dev.uid}`);
  await tolak("waka TIDAK bisa mengubah role piket menjadi waka", waka, "PUT", `roles/${meja.uid}`, "waka");
  await tolak("waka TIDAK bisa mengunci dirinya", waka, "DELETE", `roles/${waka.uid}`);
  await tolak("waka TIDAK bisa membuka kunci uid yang BUKAN akun piket (staff.role bukan piket)", waka, "PUT", `roles/${orang.uid}`, "piket");
  await izin("(pulihkan) waka mengunci lalu admin membuka", waka, "PATCH", "", { [`roles/${meja.uid}`]: null, [`piketAkun/${meja.uid}/terkunci`]: true });
  await tolak("waka TIDAK bisa menulis email di piketAkun", waka, "PUT", `piketAkun/${meja.uid}/email`, "palsu@x.y");
  await tolak("waka TIDAK bisa menghapus piketAkun", waka, "DELETE", `piketAkun/${meja.uid}`);
  await tolak("waka TIDAK bisa membuat piketAkun baru", waka, "PUT", `piketAkun/${orang.uid}`, { email: "x@y.z", nama: "X", terkunci: false });
  await tolak("piketAkun.terkunci bukan boolean ditolak", waka, "PUT", `piketAkun/${meja.uid}/terkunci`, "ya");
  await tolak("kepala TIDAK bisa mengubah terkunci", kepala, "PUT", `piketAkun/${meja.uid}/terkunci`, false);
  await izin("admin membuka kunci (akhir)", admin, "PATCH", "", { [`roles/${meja.uid}`]: "piket", [`piketAkun/${meja.uid}/terkunci`]: false });
}

seksi("PENGINGAT BACKUP — sistem/backupTerakhir (hanya admin)");
await izin("admin mencatat backup terakhir (waktu server)", admin, "PUT", "sistem/backupTerakhir", SV);
await cek("backupTerakhir tersimpan sebagai angka", admin, "sistem/backupTerakhir", (j) => typeof j === "number" && j > 0);
await tolak("backupTerakhir di masa depan ditolak", admin, "PUT", "sistem/backupTerakhir", Date.now() + 3600_000);
await tolak("backupTerakhir berupa teks ditolak", admin, "PUT", "sistem/backupTerakhir", "kemarin");
await tolak("sistem: field asing ditolak", admin, "PUT", "sistem/lain", 1);
for (const [nama, who] of [["waka", waka], ["kepala", kepala], ["piket", piket], ["ortu", ortu1], ["alat", dev], ["orang tanpa peran", orang]]) {
  await tolak(`${nama} TIDAK bisa membaca sistem/backupTerakhir`, who, "GET", "sistem/backupTerakhir");
  await tolak(`${nama} TIDAK bisa menulis sistem/backupTerakhir`, who, "PUT", "sistem/backupTerakhir", SV);
}
await tolak("anonim TIDAK bisa membaca sistem", null, "GET", "sistem");

seksi("KEPALA/WAKA/ADMIN — hak lain pada izinMeta, piketHarian, Dispensasi");
await izin("waka membaca izinMeta, piketHarian, roster", waka, "GET", "piketHarian");
await izin("admin membaca izinMeta", admin, "GET", "izinMeta");
await izin("kepala membaca izinMeta", kepala, "GET", "izinMeta");
await tolak("ortu TIDAK bisa membaca izinMeta", ortu1, "GET", "izinMeta");
await tolak("ortu TIDAK bisa membaca piketHarian", ortu1, "GET", "piketHarian");
await tolak("ortu TIDAK bisa membaca piketRoster", ortu1, "GET", "piketRoster");
await tolak("alat TIDAK bisa membaca izinMeta", dev, "GET", "izinMeta");
await tolak("anonim TIDAK bisa membaca piketRoster", null, "GET", "piketRoster");
await izin("Dispensasi diterima oleh waka (izin/ + attendance ket)", waka, "PATCH", "", { [`izin/${HT}/777`]: "Dispensasi", [`attendance/777/${HT}/ket`]: "Dispensasi" });
await izin("Dispensasi diterima oleh kepala", kepala, "PATCH", "", { [`izin/${HT}/888`]: "Dispensasi", [`attendance/888/${HT}/ket`]: "Dispensasi" });
await izin("Dispensasi diterima oleh admin", admin, "PUT", `izin/${HT}/999`, "Dispensasi");
await tolak("nilai ket tak dikenal ('Cuti') ditolak", waka, "PUT", `izin/${HT}/777`, "Cuti");

// ================================================================ v2.5.1 — HAPUS AKUN (tanda), aksi log baru, tanpa hak baca baru
seksi("HAPUS AKUN v2.5.1 — hapusAkun (hanya admin menandai), hapusAkunRiwayat (hanya skrip), aksi log baru");
const hStaf = (u, nama, role) => ({ email: u.email ?? `${nama}@uji.test`, nama, role, dibuat: 1 });
const hBk = await buatUser("hbk@uji.test"), hWali = await buatUser("hwali@uji.test"), hWaka = await buatUser("hwaka@uji.test"), hPiket = await buatUser("hpiket@uji.test");
const hKepAktif = await buatUser("hkepaktif@uji.test"), hTanpaStaf = await buatUser("htanpastaf@uji.test"), hAktifBk = await buatUser("haktifbk@uji.test");
const hDua = await buatUser("hdua@uji.test"), hTiga = await buatUser("htiga@uji.test");
const emailH = (n) => `${n}@uji.test`;
const stH = (nama, role, extra = {}) => ({ email: emailH(nama), nama, role, dibuat: 1, ...extra });
await http("PATCH", "", { owner: true, body: {
  [`staff/${hBk.uid}`]: stH("hbk", "bk"), [`staff/${hWali.uid}`]: stH("hwali", "wali", { kelasUtama: "X" }), [`staff/${hWaka.uid}`]: stH("hwaka", "waka"), [`staff/${hPiket.uid}`]: stH("hpiket", "piket"),
  [`staff/${hKepAktif.uid}`]: stH("hkepaktif", "kepala"), [`roles/${hKepAktif.uid}`]: "kepala",
  [`staff/${hAktifBk.uid}`]: stH("haktifbk", "bk"), [`roles/${hAktifBk.uid}`]: "bk",
  [`staff/${hDua.uid}`]: stH("hdua", "bk"), [`staff/${hTiga.uid}`]: stH("htiga", "bk"),
} });
for (const u of [hKepAktif]) PERAN.set(u.uid, "kepala");
const tandaH = (uid, nama, peran, o = {}) => ({ email: emailH(nama), nama, peran, alasan: "Guru sudah pindah tugas ke sekolah lain", olehUid: admin.uid, ts: SV, ...o });
const markBody = (u, uid, nama, peran, o = {}) => ({
  ...(o.act?.tanpa ? {} : act(u, o.aksi ?? "tandai-hapus-akun", o.act ?? {}).body),
  [`hapusAkun/${uid}`]: tandaH(uid, nama, peran, o.data ?? {}),
  ...(o.tambah ?? {}),
});
const mark = (nama, who, uid, n, peran, harap, o) => uji(nama, who, "PATCH", "", markBody(who, uid, n, peran, o), harap);
await mark("hapus akun: admin menandai BK yang sudah dicabut", admin, hBk.uid, "hbk", "bk", "izin");
await mark("hapus akun: admin menandai wali yang sudah dicabut", admin, hWali.uid, "hwali", "wali", "izin");
await mark("hapus akun: admin menandai waka yang sudah dicabut", admin, hWaka.uid, "hwaka", "waka", "izin");
await mark("hapus akun: admin menandai piket yang sudah dicabut", admin, hPiket.uid, "hpiket", "piket", "izin");
await cek("hapus akun: tanda terbaca admin", admin, `hapusAkun/${hBk.uid}`, (j) => j?.peran === "bk" && j.olehUid === admin.uid && j.alasan.length >= 10);
// -- akun masih punya role (aktif) ditolak; cabut + tandai dalam SATU update diterima
await mark("hapus akun: akun BK yang MASIH AKTIF (roles ada) ditolak", admin, hAktifBk.uid, "haktifbk", "bk", "tolak");
await uji("hapus akun: kepala AKTIF dicabut + ditandai dalam SATU update diterima", admin, "PATCH", "", { ...markBody(admin, hKepAktif.uid, "hkepaktif", "kepala"), [`roles/${hKepAktif.uid}`]: null, [`staff/${hKepAktif.uid}`]: null }, "izin");
await cek("hapus akun: staff & roles kepala itu hilang, tanda tersimpan", admin, `hapusAkun/${hKepAktif.uid}`, (j) => j?.email === emailH("hkepaktif"));
await mark("hapus akun: admin lain (role admin) ditolak", admin, admin2.uid, "admin2", "waka", "tolak");
await mark("hapus akun: uid tanpa staff (peran tak dapat diverifikasi) ditolak", admin, hTanpaStaf.uid, "htanpastaf", "bk", "tolak");
await mark("hapus akun: akun alat (role device) ditolak", admin, dev.uid, "alat", "bk", "tolak");
await mark("hapus akun: peran pada tanda BERBEDA dari staff.role ditolak", admin, hDua.uid, "hdua", "wali", "tolak");
await mark("hapus akun: peran 'admin' pada tanda ditolak", admin, hDua.uid, "hdua", "admin", "tolak");
await mark("hapus akun: email pada tanda BERBEDA dari staff ditolak", admin, hDua.uid, "hdua", "bk", "tolak", { data: { email: "lain@uji.test" } });
await mark("hapus akun: nama pada tanda BERBEDA dari staff ditolak", admin, hDua.uid, "hdua", "bk", "tolak", { data: { nama: "Nama Lain" } });
await mark("hapus akun: alasan < 10 karakter ditolak", admin, hDua.uid, "hdua", "bk", "tolak", { data: { alasan: "pindah" } });
await mark("hapus akun: alasan > 300 karakter ditolak", admin, hDua.uid, "hdua", "bk", "tolak", { data: { alasan: "x".repeat(301) } });
await mark("hapus akun: olehUid palsu ditolak", admin, hDua.uid, "hdua", "bk", "tolak", { data: { olehUid: admin2.uid } });
await mark("hapus akun: ts bukan waktu server ditolak", admin, hDua.uid, "hdua", "bk", "tolak", { data: { ts: 5 } });
await mark("hapus akun: field asing ditolak", admin, hDua.uid, "hdua", "bk", "tolak", { data: { x: 1 } });
await mark("hapus akun: TANPA log aktivitas ditolak", admin, hDua.uid, "hdua", "bk", "tolak", { act: { tanpa: true } });
await mark("hapus akun: log aksi salah ('atur-bk') ditolak", admin, hDua.uid, "hdua", "bk", "tolak", { aksi: "atur-bk" });
await mark("hapus akun: penanda log tanpa ENTRI ditolak", admin, hDua.uid, "hdua", "bk", "tolak", { act: { tanpaEntri: true } });
await mark("hapus akun: menandai ulang akun yang sudah ditandai ditolak (tidak menimpa)", admin, hBk.uid, "hbk", "bk", "tolak");
await tolak("hapus akun: PUT langsung tanpa log ditolak", admin, "PUT", `hapusAkun/${hTiga.uid}`, tandaH(hTiga.uid, "htiga", "bk", { ts: 5 }));
// -- siapa lain
for (const [n, who] of [["waka", waka], ["kepala", kepala], ["wali A", waliA], ["BK A", bkA], ["piket", piket], ["ortu", ortu1], ["alat", dev]]) {
  await mark(`hapus akun: ${n} TIDAK menandai`, who, hTiga.uid, "htiga", "bk", "tolak");
  await tolak(`hapus akun: ${n} TIDAK membaca hapusAkun`, who, "GET", "hapusAkun");
  await tolak(`hapus akun: ${n} TIDAK membaca hapusAkunRiwayat`, who, "GET", "hapusAkunRiwayat");
}
await tolak("hapus akun: anonim TIDAK membaca", null, "GET", "hapusAkun");
await izin("hapus akun: admin membaca hapusAkun", admin, "GET", "hapusAkun");
await izin("hapus akun: admin membaca hapusAkunRiwayat", admin, "GET", "hapusAkunRiwayat");
await tolak("hapus akun: admin TIDAK menulis hapusAkunRiwayat (hanya skrip Admin SDK)", admin, "PUT", `hapusAkunRiwayat/${hBk.uid}`, { email: "x@uji.test", nama: "x", peran: "bk", alasan: "Guru sudah pindah", olehUid: admin.uid, ditandaiTs: 1, dihapusTs: 2 });
// -- batal
const batalBody = (u, uid, o = {}) => ({ ...(o.act?.tanpa ? {} : act(u, o.aksi ?? "batal-hapus-akun", o.act ?? {}).body), [`hapusAkun/${uid}`]: null });
await uji("hapus akun: batal TANPA log ditolak", admin, "PATCH", "", batalBody(admin, hWaka.uid, { act: { tanpa: true } }), "tolak");
await uji("hapus akun: batal dengan log aksi salah ditolak", admin, "PATCH", "", batalBody(admin, hWaka.uid, { aksi: "tandai-hapus-akun" }), "tolak");
for (const [n, who] of [["waka", waka], ["kepala", kepala], ["BK A", bkA]]) await uji(`hapus akun: ${n} TIDAK membatalkan tanda`, who, "PATCH", "", batalBody(who, hWaka.uid), "tolak");
await uji("hapus akun: admin membatalkan tanda (dengan log) diterima", admin, "PATCH", "", batalBody(admin, hWaka.uid), "izin");
await cek("hapus akun: tanda hilang setelah dibatalkan", admin, `hapusAkun/${hWaka.uid}`, (j) => j === null);
await uji("hapus akun: admin menandai ulang setelah batal diterima", admin, "PATCH", "", markBody(admin, hWaka.uid, "hwaka", "waka"), "izin");

// -- cabut akses akun staf: tanda hapus OPSIONAL (v2.5.1): tanpa tanda = perilaku lama; dengan tanda = satu update + alasan + log
const hCabutA = await buatUser("hcabuta@uji.test"), hCabutB = await buatUser("hcabutb@uji.test"), hCabutC = await buatUser("hcabutc@uji.test");
await http("PATCH", "", { owner: true, body: {
  [`roles/${hCabutA.uid}`]: "waka", [`staff/${hCabutA.uid}`]: stH("hcabuta", "waka"),
  [`roles/${hCabutB.uid}`]: "piket", [`staff/${hCabutB.uid}`]: stH("hcabutb", "piket"), [`piketAkun/${hCabutB.uid}`]: { email: emailH("hcabutb"), nama: "hcabutb", terkunci: false },
  [`roles/${hCabutC.uid}`]: "waka", [`staff/${hCabutC.uid}`]: stH("hcabutc", "waka"),
} });
await uji("cabut akses: TANPA tanda hapus (perilaku lama, tanpa log) diterima", admin, "PATCH", "", { [`roles/${hCabutA.uid}`]: null, [`staff/${hCabutA.uid}`]: null, [`piketAkun/${hCabutA.uid}`]: null }, "izin");
await cek("cabut akses tanpa tanda: roles + staff hilang, TIDAK ada hapusAkun", admin, `hapusAkun/${hCabutA.uid}`, (j) => j === null);
await uji("cabut akses: DENGAN tanda hapus tetapi tanpa log ditolak", admin, "PATCH", "", { ...markBody(admin, hCabutB.uid, "hcabutb", "piket", { act: { tanpa: true } }), [`roles/${hCabutB.uid}`]: null, [`staff/${hCabutB.uid}`]: null, [`piketAkun/${hCabutB.uid}`]: null }, "tolak");
await uji("cabut akses: DENGAN tanda hapus, alasan < 10 karakter ditolak", admin, "PATCH", "", { ...markBody(admin, hCabutB.uid, "hcabutb", "piket", { data: { alasan: "pindah" } }), [`roles/${hCabutB.uid}`]: null, [`staff/${hCabutB.uid}`]: null, [`piketAkun/${hCabutB.uid}`]: null }, "tolak");
await uji("cabut akses: tanda hapus TANPA mencabut role (akun masih aktif) ditolak", admin, "PATCH", "", { ...markBody(admin, hCabutC.uid, "hcabutc", "waka"), [`staff/${hCabutC.uid}`]: null }, "tolak");
await uji("cabut akses: DENGAN tanda hapus + alasan + log (satu update) diterima (piket)", admin, "PATCH", "", { ...markBody(admin, hCabutB.uid, "hcabutb", "piket"), [`roles/${hCabutB.uid}`]: null, [`staff/${hCabutB.uid}`]: null, [`piketAkun/${hCabutB.uid}`]: null }, "izin");
await cek("cabut akses dengan tanda: staff + roles hilang, hapusAkun tersimpan", admin, `hapusAkun/${hCabutB.uid}`, (j) => j?.peran === "piket" && j.email === emailH("hcabutb"));
await cek("cabut akses dengan tanda: staff dan roles akun itu kosong", admin, `staff/${hCabutB.uid}`, (j) => j === null);

// -- aksi log baru: ekspor-laporan (wali/BK), hapus-akun-permanen (entri skrip), aksi acak tetap ditolak
const logSaja = (u, aksi, detail, o = {}) => act(u, aksi, { entri: { detail }, ...o }).body;
await uji("log: wali A menulis aksi 'ekspor-laporan' (tanpa NIS/nama) diterima", waliA, "PATCH", "", logSaja(waliA, "ekspor-laporan", "CSV laporan wali, kelas X, 2026-10-01 s.d. 2026-10-31, 32 siswa"), "izin");
await uji("log: BK A menulis aksi 'ekspor-laporan' diterima", bkA, "PATCH", "", logSaja(bkA, "ekspor-laporan", "Cetak laporan bk, kelas semua, 2026-10-01 s.d. 2026-10-31, 480 siswa"), "izin");
await uji("log: admin menulis aksi 'hapus-akun-permanen' (bentuk entri skrip) diterima", admin, "PATCH", "", logSaja(admin, "hapus-akun-permanen", "Hapus permanen bk x@uji.test - Guru pindah", { entri: { detail: "Hapus permanen bk x@uji.test - Guru pindah", deviceId: "skrip-lokal", deviceLabel: "Skrip lokal hapus_akun.py" } }), "izin");
await uji("log: aksi acak 'hapus-akun' (tidak terdaftar) ditolak", waliA, "PATCH", "", logSaja(waliA, "hapus-akun", "x"), "tolak");
await uji("log: aksi 'ekspor-laporan' dengan peran lain dipalsukan ditolak (peran harus = roles)", waliA, "PATCH", "", logSaja(waliA, "ekspor-laporan", "x", { entri: { peran: "admin" } }), "tolak");
// -- TIDAK ada hak baca baru: wali/BK tetap tidak membaca data yang dilarang
for (const [n, who] of [["wali A", waliA], ["BK A", bkA]]) {
  for (const p of ["izin", "validasi", "lessons", "config/students", "parents", "log", "staff", "roles", "hapusAkun"]) await tolak(`laporan: ${n} TETAP tidak membaca ${p}`, who, "GET", p);
}
await izin("laporan: wali A membaca attendance siswa binaan 701 dengan query rentang tanggal", waliA, "GET", `attendance/701?orderBy=${encodeURIComponent('"$key"')}&startAt=${encodeURIComponent('"2026-10-01"')}&endAt=${encodeURIComponent('"2026-10-31"')}`);
await tolak("laporan: wali A TIDAK membaca attendance siswa kelas lain (703)", waliA, "GET", `attendance/703?orderBy=${encodeURIComponent('"$key"')}&startAt=${encodeURIComponent('"2026-10-01"')}&endAt=${encodeURIComponent('"2026-10-31"')}`);
await izin("laporan: BK A membaca lessonsByStudent siswa mana pun (902) dengan query rentang", bkA, "GET", `lessonsByStudent/902?orderBy=${encodeURIComponent('"$key"')}&startAt=${encodeURIComponent('"2026-10-01"')}&endAt=${encodeURIComponent('"2026-10-31"')}`);
await izin("laporan: BK A membaca validasiByStudent siswa mana pun (902)", bkA, "GET", "validasiByStudent/902");
await izin("laporan: BK A membaca manualTapByStudent siswa mana pun (902)", bkA, "GET", "manualTapByStudent/902");
await izin("laporan: wali A membaca kalenderEfektif (hari efektif)", waliA, "GET", `kalenderEfektif?orderBy=${encodeURIComponent('"$key"')}&startAt=${encodeURIComponent('"2026-10-01"')}&endAt=${encodeURIComponent('"2026-10-31"')}`);

// ---------------------------------------------------------------- ringkasan
console.log(`\n${hasil.lolos} lolos, ${hasil.gagal.length} gagal`);
if (hasil.gagal.length) {
  console.log("\nGAGAL:");
  for (const g of hasil.gagal) console.log(" - " + g);
  process.exit(1);
}
