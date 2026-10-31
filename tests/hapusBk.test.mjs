// Uji unit hapus akun BK langsung (lib/hapusBk.ts)
import assert from "node:assert/strict";
import { rencanaHapusBk, tandaDapatDibatalkan } from "../src/lib/hapusBk.ts";

const A = { uid: "u1", email: "bk@x.test", nama: "BK Satu", alasan: "  salah input nama  ", olehUid: "adm", ts: 123 };

let r = rencanaHapusBk({ ...A, sudahDitandai: false });
assert.deepEqual(Object.keys(r.updates).sort(), ["bkAkun/u1", "hapusAkun/u1", "staff/u1"], "belum ditandai: hapus staff+bkAkun dan buat tanda (antrean skrip)");
assert.equal(r.updates["staff/u1"], null); assert.equal(r.updates["bkAkun/u1"], null);
assert.deepEqual(r.updates["hapusAkun/u1"], { email: "bk@x.test", nama: "BK Satu", peran: "bk", alasan: "salah input nama", olehUid: "adm", ts: 123 });
assert.equal(r.aksi, "tandai-hapus-akun");
assert.match(r.detail, /Hapus akun BK bk@x\.test dari aplikasi: salah input nama/);

r = rencanaHapusBk({ ...A, sudahDitandai: true });
assert.deepEqual(Object.keys(r.updates).sort(), ["bkAkun/u1", "staff/u1"], "sudah ditandai: tanda TIDAK ditulis ulang (sekali tulis)");
assert.equal(r.aksi, "atur-bk");
assert.ok(!Object.keys(r.updates).some((k) => k.startsWith("roles/") || k.startsWith("activity")), "tidak menyentuh roles dan log langsung");

assert.equal(rencanaHapusBk({ ...A, alasan: "x".repeat(400), sudahDitandai: false }).updates["hapusAkun/u1"].alasan.length, 300, "alasan dipotong 300");
assert.ok(rencanaHapusBk({ ...A, alasan: "y".repeat(400), sudahDitandai: true }).detail.length <= 300, "detail log maks 300");

assert.equal(tandaDapatDibatalkan("bk", true), true, "BK masih ada di aplikasi: tanda dapat dibatalkan");
assert.equal(tandaDapatDibatalkan("bk", false), false, "BK sudah dihapus dari aplikasi: tidak ada yang dapat dikembalikan");
assert.equal(tandaDapatDibatalkan("wali", false), false);
assert.equal(tandaDapatDibatalkan("waka", false), true, "waka/kepala/piket memang tanpa staff setelah dicabut");
assert.equal(tandaDapatDibatalkan("piket", false), true);
console.log("hapusBk: OK");
