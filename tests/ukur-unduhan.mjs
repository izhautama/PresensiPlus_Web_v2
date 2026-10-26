// Mengukur ukuran unduhan awal langganan lencana waka/kepala (PembinaanDataProvider) pada EMULATOR dengan data uji buatan.
// Jalankan: npx firebase-tools emulators:exec --only auth,database --project demo-presensi "node tests/ukur-unduhan.mjs"
// Ukuran = JSON mentah hasil GET path (yang dikirim server ke klien) dan perkiraan terkompresi (gzip). Bukan pengukuran jaringan produksi.
import { gzipSync } from "node:zlib";
import { randomBytes } from "node:crypto";

const DB = "http://127.0.0.1:9000";
const NS = `ukur-${randomBytes(3).toString("hex")}`;
const OWNER = { Authorization: "Bearer owner" };
const N = Number(process.env.JUMLAH_SISWA ?? 500);
const put = (path, body) => fetch(`${DB}/${path}.json?ns=${NS}`, { method: "PUT", headers: { "Content-Type": "application/json", ...OWNER }, body: JSON.stringify(body) });
const get = async (path) => (await (await fetch(`${DB}/${path}.json?ns=${NS}`, { headers: OWNER })).text());
const acak = (a, b) => a + Math.floor(Math.random() * (b - a + 1));

const TA = "2026-2027";
const records = {}, meta = {}, klaim = {}, pbBk = {}, pbKepala = {};
for (let i = 0; i < N; i++) {
  const nis = String(10000 + i);
  const jumlah = Math.random() < 0.45 ? 0 : acak(1, 14);   // sebagian besar siswa punya catatan; tahun ajaran berjalan dan sebelumnya
  for (let j = 0; j < jumlah; j++) {
    const id = `-N${randomBytes(6).toString("hex")}`;
    (records[nis] ??= {})[id] = { jenis: j % 7 === 6 ? "remisi" : "pelanggaran", refId: "-Nrule0001", nama: "Terlambat masuk kelas tanpa alasan yang sah", kategori: "Ringan", poin: acak(5, 40), tanggal: `2026-0${acak(7, 9)}-${String(acak(10, 28))}`, ta: j % 3 === 0 ? "2025-2026" : TA, sumber: "wali" };
    (meta[nis] ??= {})[id] = { dibuatOleh: "uidWaliXXXXXXXXXXXXXXXXXXXX", dibuatNama: "Bu Guru Pencatat", dibuatTs: 1760000000000 + j, hariKe: 20750 };
  }
  if (i % 10 === 0) {   // ±10% siswa sudah pada ambang BK
    const k = `${TA}_lv02`;
    pbBk[nis] = { [k]: { pj: "bk", ta: TA, levelId: "lv02", levelPoin: 200, tindakan: "Teguran 2 pembinaan BK", tanggal: "2026-10-10", metode: "Tatap muka", hasil: "Siswa dibina dan berjanji memperbaiki sikap dengan baik dan benar.", status: i % 20 === 0 ? "selesai" : "dijadwalkan", oleh: "uidBkXXXXXXXXXXXXXXXXXXXXXX", olehNama: "Bu BK", dibuatTs: 1760000000000 } };
    if (i % 20 === 0) klaim[nis] = { [k]: { bkUid: "uidBkXXXXXXXXXXXXXXXXXXXXXX", bkNama: "Bu BK", sejak: 1760000000000, cara: "klaim", olehUid: "uidBkXXXXXXXXXXXXXXXXXXXXXX", ta: TA, levelId: "lv02" } };
  }
  if (i % 40 === 0) pbKepala[nis] = { [`${TA}_lv03`]: { pj: "kepala", ta: TA, levelId: "lv03", levelPoin: 300, tindakan: "Teguran 3 pembinaan kepala", tanggal: "2026-10-11", metode: "Tatap muka", hasil: "Pembinaan intensif oleh Kepala Madrasah dan Ndalem.", status: "selesai", oleh: "uidKepalaXXXXXXXXXXXXXXXXXXX", olehNama: "Kepala", dibuatTs: 1760000000000 } };
}
const levels = Object.fromEntries([100, 200, 300, 400, 500, 600].map((p, i) => [`lv0${i + 1}`, { poin: p, tindakan: `Tindakan ambang ${p} poin`, penanggungJawab: p === 100 ? "wali" : p === 200 ? "bk" : "kepala" }]));
const students = Object.fromEntries(Array.from({ length: N }, (_, i) => [String(10000 + i), { nama: `SISWA UJI NOMOR ${i}`, kelas: "XI IPS 1" }]));
await put("discipline/records", records); await put("discipline/recordMeta", meta); await put("discipline/levels", levels);
await put("klaimBK", klaim); await put("pembinaan/bk", pbBk); await put("pembinaan/kepala", pbKepala); await put("config/students", students);

const ukur = async (nama, jalur) => {
  const t = await get(jalur);
  const mentah = Buffer.byteLength(t), gz = gzipSync(t).length;
  return { nama, jalur, mentahKB: +(mentah / 1024).toFixed(1), gzipKB: +(gz / 1024).toFixed(1) };
};
const waka = [await ukur("discipline/records", "discipline/records"), await ukur("discipline/recordMeta", "discipline/recordMeta"), await ukur("discipline/levels", "discipline/levels"), await ukur("klaimBK", "klaimBK"), await ukur("pembinaan/bk", "pembinaan/bk")];
const kepala = [...waka, await ukur("pembinaan/kepala", "pembinaan/kepala")];
const jumlah = (xs, k) => +xs.reduce((a, x) => a + x[k], 0).toFixed(1);
console.log(`Data uji: ${N} siswa, ${Object.values(records).reduce((a, p) => a + Object.keys(p).length, 0)} catatan, ${Object.keys(klaim).length} klaim, ${Object.keys(pbBk).length} pembinaan BK, ${Object.keys(pbKepala).length} pembinaan kepala`);
console.table(kepala.map(({ nama, mentahKB, gzipKB }) => ({ nama, mentahKB, gzipKB })));
console.log(`TOTAL waka   : ${jumlah(waka, "mentahKB")} KB mentah (~${jumlah(waka, "gzipKB")} KB gzip)`);
console.log(`TOTAL kepala : ${jumlah(kepala, "mentahKB")} KB mentah (~${jumlah(kepala, "gzipKB")} KB gzip)`);
