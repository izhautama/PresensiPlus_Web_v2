// Pengaman uji emulator (dipakai rules.test, migrasi.test, mutation, dan E2E):
//  * rules yang DIMUAT ke emulator harus identik (hash SHA-256 isi kanonik) dengan rules yang sengaja diuji;
//  * hash itu dicetak sebagai "RULES_SHA256=<hash>" agar pemanggil (mutasi) dapat memeriksanya.
import { createHash } from "node:crypto";

export const sha256 = (teks) => createHash("sha256").update(teks).digest("hex");
/** Isi rules tanpa pengaruh spasi/urutan penulisan JSON: parse lalu serialisasi ulang. */
export const kanonik = (teks) => JSON.stringify(JSON.parse(teks));
export const hashRules = (teks) => sha256(kanonik(teks));

const OWNER = { Authorization: "Bearer owner" };

/** Muat rules ke namespace emulator lalu BACA KEMBALI dan bandingkan hash-nya. Melempar galat bila berbeda. Mengembalikan hash. */
export async function muatRulesTerverifikasi({ db = "http://127.0.0.1:9000", ns, teks, label = ns }) {
  const put = await fetch(`${db}/.settings/rules.json?ns=${ns}`, { method: "PUT", headers: OWNER, body: teks });
  if (!put.ok) throw new Error(`gagal memuat rules (${label}): ${put.status} ${await put.text()}`);
  const baca = await fetch(`${db}/.settings/rules.json?ns=${ns}`, { headers: OWNER });
  if (!baca.ok) throw new Error(`gagal membaca kembali rules (${label}): ${baca.status}`);
  const dimuat = await baca.text();
  let hDimuat;
  try { hDimuat = hashRules(dimuat); } catch { throw new Error(`rules yang terbaca kembali bukan JSON (${label})`); }
  const hDiuji = hashRules(teks);
  if (hDimuat !== hDiuji) {
    throw new Error(`RULES TIDAK SAMA (${label}): hash diuji ${hDiuji.slice(0, 12)}…, hash di emulator ${hDimuat.slice(0, 12)}…. Emulator lama/sisa mungkin masih berjalan; hentikan lalu ulangi.`);
  }
  console.log(`RULES_SHA256=${hDiuji}`);
  return hDiuji;
}
