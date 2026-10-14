// Uji panduan: docs/*.md SELALU sama dengan sumber src/lib/panduan.ts, tiap peran maks. ~2 halaman, langkah bernomor, topik wajib ada.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PANDUAN, URUTAN_PANDUAN, hitungKata, keMarkdown } from "../src/lib/panduan.ts";

assert.deepEqual(URUTAN_PANDUAN, ["admin", "kepala", "waka", "piket", "ortu", "sop"]);
const BERKAS = { admin: "PANDUAN_ADMIN.md", kepala: "PANDUAN_KEPALA.md", waka: "PANDUAN_WAKA.md", piket: "PANDUAN_PIKET.md", ortu: "PANDUAN_ORANG_TUA.md", sop: "SOP_HARIAN.md" };
for (const k of URUTAN_PANDUAN) {
  const p = PANDUAN[k];
  assert.equal(p.berkas, BERKAS[k]);
  const md = readFileSync(new URL(`../docs/${p.berkas}`, import.meta.url), "utf8");
  assert.equal(md, keMarkdown(p), `${p.berkas} tidak sinkron dengan src/lib/panduan.ts (jalankan: node scripts/buat-panduan.mjs)`);
  assert.ok(hitungKata(p) <= 700, `${p.berkas} terlalu panjang (${hitungKata(p)} kata; batas 2 halaman ~700)`);
  assert.ok(p.bagian.length >= 3, `${k}: minimal 3 bagian`);
  for (const b of p.bagian) assert.ok(b.langkah.length >= 2, `${k}/${b.judul}: langkah bernomor minimal 2`);
  assert.ok(/^1\. /m.test(md) && /^2\. /m.test(md), `${p.berkas}: langkah harus bernomor`);
}
const teks = (k) => keMarkdown(PANDUAN[k]);
// topik wajib
assert.match(teks("ortu"), /NIS/); assert.match(teks("ortu"), /PIN/); assert.match(teks("ortu"), /Lupa PIN/); assert.match(teks("ortu"), /Dispensasi/); assert.match(teks("ortu"), /dicatat manual/);
for (const h of ["Pagi", "Siang", "Sore", "Sabtu", "alat mati"]) assert.match(teks("sop"), new RegExp(h, "i"), `SOP harus memuat '${h}'`);
assert.match(teks("sop"), /Mode alat bermasalah/);
assert.match(teks("piket"), /Mode alat bermasalah/); assert.match(teks("piket"), /Hadir manual/);
assert.match(teks("waka"), /Pemetaan saran/); assert.match(teks("waka"), /Kunci akun piket/);
assert.match(teks("admin"), /Backup/); assert.match(teks("admin"), /Ekspor JSON/);
assert.match(teks("kepala"), /Tata tertib/);
// hari efektif berbasis bukti & kalender
assert.match(teks("admin"), /Kalender/); assert.match(teks("admin"), /Hitung ulang/); assert.match(teks("admin"), /dry-run/); assert.match(teks("admin"), /Ambang/);
assert.match(teks("waka"), /Tap rendah/); assert.match(teks("waka"), /Konfirmasi hari ini normal/); assert.match(teks("waka"), /bukan hari efektif/);
assert.match(teks("kepala"), /Kalender/); assert.match(teks("ortu"), /Hari efektif ke-N/); assert.match(teks("ortu"), /tidak ada kegiatan presensi/);
assert.match(teks("sop"), /bukan hari efektif/); assert.match(teks("piket"), /hari efektif/);
// tidak ada rahasia/URL nyata di panduan
for (const k of URUTAN_PANDUAN) assert.doesNotMatch(teks(k), /AIza|firebaseio|password-uji|@gmail/i);
console.log("panduan.test: OK");
