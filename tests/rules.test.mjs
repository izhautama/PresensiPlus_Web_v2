// Uji Security Rules lewat REST ke Firebase Emulator (auth 9099 + database 9000). Tanpa dependensi tambahan.
// Jalankan:  npm run test:rules   (membutuhkan Java untuk emulator Database)
// Rules dimuat ke namespace kustom via PUT /.settings/rules.json?ns=<ns> (Authorization: Bearer owner),
// karena rules di firebase.json TIDAK otomatis berlaku untuk ns kustom.
import { readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";

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
{
  const res = await fetch(`${DB}/.settings/rules.json?ns=${NS}`, { method: "PUT", headers: OWNER, body: rulesJson });
  if (!res.ok) { console.error("Gagal memuat rules:", res.status, await res.text()); process.exit(2); }
}

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
seksi("PER JAM — waka");
for (const k of ["A", "I", "S", "D"]) await izin(`waka set sel ${k}`, waka, "PUT", cell("111", k === "A" ? 1 : k === "I" ? 2 : k === "S" ? 3 : 4), k);
await izin("waka set meta mapel+guru", waka, "PUT", `lessons/${TGL}/${KLS}/meta/1`, { mapel: "Matematika", guru: "Pak Budi" });
await izin("waka set meta hanya mapel", waka, "PUT", `lessons/${TGL}/${KLS}/meta/2`, { mapel: "TI" });
await izin("waka simpan multi-path (sel + salinan + oleh + ts)", waka, "PATCH", "", {
  [cell("222", 5)]: "A", [`lessonsByStudent/222/${TGL}/5`]: { k: "A", mapel: "TI" },
  [`lessons/${TGL}/${KLS}/oleh`]: waka.uid, [`lessons/${TGL}/${KLS}/ts`]: SV,
});
await izin("waka hapus sel (kembali hadir)", waka, "DELETE", cell("111", 4));
await izin("waka hapus salinan sel", waka, "DELETE", `lessonsByStudent/222/${TGL}/5`);
await izin("waka kelas dengan karakter ter-encode", waka, "PUT", `lessons/${TGL}/XI%252EIPS/absen/111/1`, "A");
await tolak("sel kode B (bolos sudah dihapus) ditolak", waka, "PUT", cell("111", 6), "B");
await tolak("sel kode kecil 'a' ditolak", waka, "PUT", cell("111", 6), "a");
await tolak("sel kode asing 'H' ditolak", waka, "PUT", cell("111", 6), "H");
await tolak("sel jam 0 ditolak", waka, "PUT", cell("111", 0), "A");
await tolak("sel jam 10 ditolak", waka, "PUT", cell("111", 10), "A");
await tolak("sel nis bukan angka ditolak", waka, "PUT", cell("abc", 1), "A");
await tolak("tanggal format salah ditolak", waka, "PUT", `lessons/14-10-2026/${KLS}/absen/111/1`, "A");
await tolak("meta jam 0 ditolak", waka, "PUT", `lessons/${TGL}/${KLS}/meta/0`, { mapel: "X" });
await tolak("meta mapel > 60 karakter ditolak", waka, "PUT", `lessons/${TGL}/${KLS}/meta/3`, { mapel: "x".repeat(61) });
await tolak("meta field asing ditolak", waka, "PUT", `lessons/${TGL}/${KLS}/meta/3`, { mapel: "X", rahasia: 1 });
await tolak("kelas: field asing ditolak", waka, "PUT", `lessons/${TGL}/${KLS}/asing`, 1);
await tolak("oleh bukan pengguna ditolak", waka, "PUT", `lessons/${TGL}/${KLS}/oleh`, kepala.uid);
await tolak("salinan: k = B ditolak", waka, "PUT", `lessonsByStudent/111/${TGL}/6`, { k: "B" });
await tolak("salinan: tanpa k ditolak", waka, "PUT", `lessonsByStudent/111/${TGL}/6`, { mapel: "X" });
await tolak("salinan: field asing ditolak", waka, "PUT", `lessonsByStudent/111/${TGL}/6`, { k: "A", asing: 1 });
await izin("salinan: valid (k + mapel)", waka, "PUT", `lessonsByStudent/111/${TGL}/6`, { k: "S", mapel: "IPA" });

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
await tolak("piket TIDAK bisa menulis lessonsByStudent utuh per tanggal", piket, "PUT", `lessonsByStudent/666/${HT}`, { 1: { k: "S" } });

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
const HKM = (HK + 4) % 7 === 0 ? HK - 1 : HK;
const TM = new Date(HKM * 86400000).toISOString().slice(0, 10);
const MINGGU_HK = HK - ((HK + 4) % 7); // Minggu terakhir <= hari ini (epoch-day; (hk+4)%7 === 0 -> Minggu)
const MT = (t, n) => `manualTap/${t}/${n}`;
const MS = (n, t) => `manualTapByStudent/${n}/${t}`;
const salinanDari = (x) => ({ status: x.status, masuk: x.masuk, pulang: x.pulang, alasan: x.alasan });
/** Satu update: log + manualTap + salinan. o.tap menimpa isi; o.salinan menimpa salinan; o.tanpaSalinan/o.tanpaAsli; o.act untuk log. */
const manualBody = (u, t, n, o = {}) => {
  const A = act(u, o.aksi ?? "presensi-manual", o.act ?? {});
  const tap = { masuk: "07:10:00", status: "Hadir", alasan: "Lupa KTM", oleh: u.uid, ts: SV, hariKe: HKM, ...(PERAN.get(u.uid) === "piket" ? { petugas: "Bu Rina" } : {}), ...(o.tap ?? {}) };
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

// ---------------------------------------------------------------- ringkasan
console.log(`\n${hasil.lolos} lolos, ${hasil.gagal.length} gagal`);
if (hasil.gagal.length) {
  console.log("\nGAGAL:");
  for (const g of hasil.gagal) console.log(" - " + g);
  process.exit(1);
}
