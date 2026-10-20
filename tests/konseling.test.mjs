// Uji unit catatan konseling (BK): validasi isian (cermin Security Rules), ringkasan isi, urutan.
import assert from "node:assert/strict";
import { BATAS_ISI, TOPIK_KONSELING, ringkasIsi, urutKonseling, validasiKonseling } from "../src/lib/konseling.ts";

const HARI = "2026-10-20";
const ok = (o = {}) => ({ tanggal: HARI, topik: "Pribadi", isi: "Siswa bercerita tentang masalah keluarga.", tindakLanjut: "", ...o });

assert.deepEqual(TOPIK_KONSELING, ["Akademik", "Pribadi", "Sosial", "Karier", "Keluarga", "Lainnya"]);
assert.deepEqual(validasiKonseling(ok(), HARI), {});
for (const t of TOPIK_KONSELING) assert.deepEqual(validasiKonseling(ok({ topik: t }), HARI), {}, t);
assert.ok(validasiKonseling(ok({ topik: "Hiburan" }), HARI).topik, "topik di luar daftar");
assert.ok(validasiKonseling(ok({ isi: "pendek" }), HARI).isi, "isi < 10");
assert.deepEqual(validasiKonseling(ok({ isi: "x".repeat(BATAS_ISI.min) }), HARI), {}, "tepat 10");
assert.deepEqual(validasiKonseling(ok({ isi: "x".repeat(BATAS_ISI.max) }), HARI), {}, "tepat 2000");
assert.ok(validasiKonseling(ok({ isi: "x".repeat(BATAS_ISI.max + 1) }), HARI).isi, "2001");
assert.ok(validasiKonseling(ok({ isi: "         " }), HARI).isi, "spasi saja");
assert.deepEqual(validasiKonseling(ok({ tindakLanjut: "x".repeat(500) }), HARI), {});
assert.ok(validasiKonseling(ok({ tindakLanjut: "x".repeat(501) }), HARI).tindakLanjut);
assert.ok(validasiKonseling(ok({ tanggal: "2026-10-21" }), HARI).tanggal, "masa depan");
assert.ok(validasiKonseling(ok({ tanggal: "20-10-2026" }), HARI).tanggal, "format salah");
assert.deepEqual(validasiKonseling(ok({ tanggal: HARI }), HARI), {}, "hari ini boleh");

// ringkasan: tidak memotong kata di tengah
assert.equal(ringkasIsi("pendek"), "pendek");
const panjang = "kata ".repeat(60);
const r = ringkasIsi(panjang, 50);
assert.ok(r.endsWith("…") && r.length <= 51 && !r.includes("kat…") , r);
assert.equal(ringkasIsi("a  b\n c", 100), "a b c", "spasi dirapikan");

// urutan: tanggal terbaru dulu, lalu dibuat terbaru
const u = urutKonseling([
  { k: { tanggal: "2026-10-01", dibuatTs: 5 } }, { k: { tanggal: "2026-10-19", dibuatTs: 1 } }, { k: { tanggal: "2026-10-19", dibuatTs: 9 } },
]);
assert.deepEqual(u.map((x) => `${x.k.tanggal}:${x.k.dibuatTs}`), ["2026-10-19:9", "2026-10-19:1", "2026-10-01:5"]);
console.log("konseling.test: OK");
