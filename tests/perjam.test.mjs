// Uji unit helper per jam (tanpa emulator). Node 24 dapat mengeksekusi .ts langsung.
import assert from "node:assert/strict";
import { berikutnya, decodeKelas, encodeKelas, SIKLUS_WAKA } from "../src/lib/perjam.ts";

const kasus = ["XI IPS", "XI.IPA 1", "X/A#2", "XII $ [B]", "100%", "a%2Eb", "%", ""];
for (const k of kasus) {
  const e = encodeKelas(k);
  assert.ok(!/[.#$[\]/]/.test(e), `key tidak boleh memuat karakter terlarang: ${e}`);
  assert.equal(decodeKelas(e), k, `roundtrip ${k}`);
}
assert.equal(encodeKelas("XI IPS"), "XI IPS");
assert.equal(encodeKelas("XI.IPA"), "XI%2EIPA");

// siklus klik waka: kosong -> A -> I -> S -> D -> kosong (tanpa B)
let k = "";
const urut = [];
for (let i = 0; i < SIKLUS_WAKA.length; i++) { k = berikutnya(k); urut.push(k); }
assert.deepEqual(urut, ["A", "I", "S", "D", ""]);
assert.ok(!SIKLUS_WAKA.includes("B"));
console.log("perjam.test: OK");
