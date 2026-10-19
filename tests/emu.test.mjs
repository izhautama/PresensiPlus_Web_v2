// Uji pengaman emulator: verifikasi hash rules yang dimuat (tanpa emulator; memakai server HTTP palsu).
import assert from "node:assert/strict";
import http from "node:http";
import { hashRules, kanonik, muatRulesTerverifikasi } from "./emu.mjs";

const A = JSON.stringify({ rules: { ".read": false, a: { ".write": "auth != null" } } });
const A_BEDA_SPASI = JSON.stringify(JSON.parse(A), null, 2);
const B = JSON.stringify({ rules: { ".read": true } });

assert.equal(hashRules(A), hashRules(A_BEDA_SPASI), "hash kanonik tidak terpengaruh format JSON");
assert.notEqual(hashRules(A), hashRules(B));
assert.equal(hashRules(A).length, 64);
assert.equal(kanonik(A_BEDA_SPASI), A);
assert.throws(() => hashRules("bukan json"));

/** Server palsu: PUT menyimpan `simpan`, GET mengembalikan `kembali(simpan)`. */
async function dengan(kembali, fn) {
  let simpan = "";
  const srv = http.createServer((q, s) => {
    if (q.method === "PUT") { let b = ""; q.on("data", (c) => (b += c)); q.on("end", () => { simpan = b; s.end("{}"); }); }
    else s.end(kembali(simpan));
  });
  await new Promise((ok) => srv.listen(0, "127.0.0.1", ok));
  try { return await fn(`http://127.0.0.1:${srv.address().port}`); } finally { srv.close(); }
}
const log = console.log; const keluaran = [];
console.log = (...a) => keluaran.push(a.join(" "));
try {
  // cocok (walau format ulang) -> mengembalikan hash dan mencetak RULES_SHA256
  const h = await dengan((x) => JSON.stringify(JSON.parse(x), null, 4), (db) => muatRulesTerverifikasi({ db, ns: "t", teks: A }));
  assert.equal(h, hashRules(A));
  assert.ok(keluaran.some((l) => l === `RULES_SHA256=${hashRules(A)}`), "mencetak RULES_SHA256=<hash>");
  // emulator memakai rules LAIN (mis. emulator sisa) -> melempar galat jelas
  await assert.rejects(dengan(() => B, (db) => muatRulesTerverifikasi({ db, ns: "t", teks: A })), /RULES TIDAK SAMA/);
  // balasan bukan JSON -> galat
  await assert.rejects(dengan(() => "<html>", (db) => muatRulesTerverifikasi({ db, ns: "t", teks: A })), /bukan JSON/);
} finally { console.log = log; }
console.log("emu.test: OK");
