// Uji unit helper per jam (tanpa emulator). Node 24 dapat mengeksekusi .ts langsung.
import assert from "node:assert/strict";
import { berikutnya, berikutnyaPiket, decodeKelas, encodeKelas, pengisiSel, SIKLUS_PIKET_HARI_INI, SIKLUS_PIKET_LAMPAU, SIKLUS_PIKET_MENDATANG, SIKLUS_WAKA, selATerkunciPiket, siklusPiket } from "../src/lib/perjam.ts";

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

// ---- siklus piket (v2.3.1): A hanya untuk HARI INI
const H = "2026-10-20";
assert.deepEqual(siklusPiket(H, H), ["", "A", "I", "S", "D"]);
assert.deepEqual(siklusPiket("2026-10-19", H), ["", "I", "S", "D"], "kemarin: A tidak ada dalam siklus");
assert.deepEqual(siklusPiket("2026-10-18", H), ["", "I", "S", "D"], "tanggal lampau mana pun");
assert.deepEqual(siklusPiket("2026-10-21", H), ["", "I", "D"], "besok: tanpa A dan tanpa Sakit");
assert.deepEqual(SIKLUS_PIKET_HARI_INI, ["", "A", "I", "S", "D"]); assert.deepEqual(SIKLUS_PIKET_LAMPAU, ["", "I", "S", "D"]); assert.deepEqual(SIKLUS_PIKET_MENDATANG, ["", "I", "D"]);
{ // urutan klik hari ini: kosong -> A -> I -> S -> D -> kosong
  let kode = ""; const urutan = [];
  for (let i = 0; i < 5; i++) { kode = berikutnyaPiket(kode, { pengisi: "piket", tanggal: H, hariIni: H }); urutan.push(kode); }
  assert.deepEqual(urutan, ["A", "I", "S", "D", ""]);
}
{ // tanggal lampau: kosong -> I -> S -> D -> kosong
  let kode = ""; const urutan = [];
  for (let i = 0; i < 4; i++) { kode = berikutnyaPiket(kode, { pengisi: "piket", tanggal: "2026-10-19", hariIni: H }); urutan.push(kode); }
  assert.deepEqual(urutan, ["I", "S", "D", ""]);
}
// terkunci: A milik waka (kapan pun), A tanpa penanda (data lama = waka), A piket pada tanggal lampau
assert.equal(berikutnyaPiket("A", { pengisi: "waka", tanggal: H, hariIni: H }), null, "A milik waka terkunci walau hari ini");
assert.equal(berikutnyaPiket("A", { pengisi: pengisiSel(undefined, "1", 3), tanggal: H, hariIni: H }), null, "tanpa penanda = waka");
assert.equal(berikutnyaPiket("A", { pengisi: "piket", tanggal: "2026-10-19", hariIni: H }), null, "A piket kemarin terkunci");
assert.equal(berikutnyaPiket("A", { pengisi: "piket", tanggal: H, hariIni: H }), "I", "A milik piket hari ini dapat dikoreksi (-> I)");
assert.equal(berikutnyaPiket("S", { pengisi: "waka", tanggal: "2026-10-19", hariIni: H }), "D", "S/I/D milik siapa pun tetap dapat diputar (jendela waktu ditegakkan terpisah)");
assert.equal(berikutnyaPiket("", { pengisi: "waka", tanggal: H, hariIni: H }), "A", "sel kosong -> A hari ini");
assert.equal(selATerkunciPiket("S", "waka", H, H), false);
assert.equal(selATerkunciPiket("A", "piket", H, H), false);
assert.equal(selATerkunciPiket("A", "piket", "2026-10-21", H), true, "tanggal mendatang");
assert.equal(pengisiSel({ 1: { 3: "piket" } }, "1", 3), "piket");
assert.equal(pengisiSel({ 1: { 3: "piket" } }, "1", 4), "waka");
assert.equal(pengisiSel({ 1: { 3: "piket" } }, "2", 3), "waka");
console.log("perjam.test: OK");
