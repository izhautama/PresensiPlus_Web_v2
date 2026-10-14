// Membuat docs/*.md dari src/lib/panduan.ts (sumber tunggal). Jalankan: node scripts/buat-panduan.mjs
import { mkdirSync, writeFileSync } from "node:fs";
import { PANDUAN, URUTAN_PANDUAN, keMarkdown } from "../src/lib/panduan.ts";

mkdirSync(new URL("../docs/", import.meta.url), { recursive: true });
for (const k of URUTAN_PANDUAN) {
  writeFileSync(new URL(`../docs/${PANDUAN[k].berkas}`, import.meta.url), keMarkdown(PANDUAN[k]), "utf8");
  console.log("docs/" + PANDUAN[k].berkas);
}
