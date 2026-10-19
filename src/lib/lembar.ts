import type { EntriRiwayat, LevelItem, Ringkas } from "./discipline.ts";
import { labelTa, poinBertanda } from "./discipline.ts";
import type { Pembinaan } from "./pembinaan.ts";
import { formatTanggal } from "./time.ts";

const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);

export type BarisJam = { tanggal: string; jam: number; kode: string; mapel?: string };

/** HTML mandiri "Lembar Pembinaan" satu siswa (dibuka di jendela baru lalu dicetak). Semua nilai di-escape. */
export function htmlLembar(a: {
  nama: string; nis: string; kelas: string; ta: string;
  ringkas: Ringkas; sekarang: LevelItem | null; berikut: LevelItem | null;
  riwayat: EntriRiwayat[]; perJam: BarisJam[]; pembinaan?: Pembinaan[]; dicetak: string; dicetakOleh: string;
}): string {
  const pembinaan = (a.pembinaan ?? []).slice().sort((x, y) => x.tanggal.localeCompare(y.tanggal)).map((p) => `<tr><td>${esc(formatTanggal(p.tanggal, false))}</td><td>${esc(p.levelPoin)} poin<br><small>${esc(p.tindakan)}</small></td><td>${esc(p.metode)}</td><td>${p.status === "selesai" ? "Selesai" : "Dijadwalkan"}<br><small>${esc(p.olehNama)}</small></td><td>${esc(p.hasil)}${p.tindakLanjut ? `<br><small>Tindak lanjut: ${esc(p.tindakLanjut)}</small>` : ""}</td></tr>`).join("");
  const kodeLabel: Record<string, string> = { A: "Alfa", I: "Izin", S: "Sakit", D: "Dispensasi" };
  const baris = a.riwayat.map((e) => `<tr><td>${esc(formatTanggal(e.rec.tanggal, false))}</td><td>${esc(e.rec.nama)}${e.rec.takziran ? `<br><small>Takziran: ${esc(e.rec.takziran)}</small>` : ""}</td><td>${esc(e.rec.kategori ?? (e.rec.jenis === "remisi" ? "Remisi" : "Pelanggaran"))}</td><td class="r">${poinBertanda(e.rec) > 0 ? "+" : "−"}${esc(e.rec.poin)}</td></tr>`).join("");
  const jam = a.perJam.map((x) => `<tr><td>${esc(formatTanggal(x.tanggal, false))}</td><td>Jam ke-${esc(x.jam)}${x.mapel ? ` (${esc(x.mapel)})` : ""}</td><td>${esc(kodeLabel[x.kode] ?? x.kode)}</td></tr>`).join("");
  return `<!doctype html><html lang="id"><head><meta charset="utf-8"><title>Lembar Pembinaan — ${esc(a.nama)}</title>
<style>
  @page { size: A4; margin: 16mm; }
  body { font: 13px/1.5 system-ui, Arial, sans-serif; color: #111; }
  h1 { font-size: 18px; margin: 0 0 2px; } .sub { color: #444; margin-bottom: 14px; border-bottom: 2px solid #176f4b; padding-bottom: 8px; }
  h2 { font-size: 14px; margin: 18px 0 6px; } table { width: 100%; border-collapse: collapse; } th, td { border: 1px solid #bbb; padding: 5px 7px; text-align: left; vertical-align: top; }
  th { background: #f1f1f1; } td.r { text-align: right; white-space: nowrap; } small { color: #555; }
  .kv { display: grid; grid-template-columns: 150px 1fr; gap: 3px 10px; } .ttd { display: flex; gap: 24px; margin-top: 40px; } .ttd div { flex: 1; text-align: center; height: 90px; }
</style></head><body>
<h1>Lembar Pembinaan Siswa</h1>
<div class="sub">MA Nurul Huda · ${esc(labelTa(a.ta))}</div>
<div class="kv"><b>Nama</b><span>${esc(a.nama)}</span><b>NIS</b><span>${esc(a.nis)}</span><b>Kelas</b><span>${esc(a.kelas)}</span>
<b>Pelanggaran</b><span>${esc(a.ringkas.pel)} poin</span><b>Remisi</b><span>−${esc(a.ringkas.rem)} poin</span><b>Saldo poin</b><span><b>${esc(a.ringkas.saldo)}</b></span>
<b>Level pembinaan</b><span>${a.sekarang ? esc(a.sekarang[1].tindakan) : "Belum mencapai ambang pembinaan"}</span>
${a.berikut ? `<b>Ambang berikutnya</b><span>${esc(a.berikut[1].poin)} poin (${esc(a.berikut[1].poin - a.ringkas.saldo)} poin lagi)</span>` : ""}
${a.ringkas.sangatBerat ? `<b>Catatan</b><span>Terdapat pelanggaran kategori Sangat Berat.</span>` : ""}</div>
<h2>Riwayat pelanggaran &amp; remisi</h2>
${baris ? `<table><thead><tr><th>Tanggal</th><th>Uraian</th><th>Kategori</th><th>Poin</th></tr></thead><tbody>${baris}</tbody></table>` : "<p>Belum ada catatan.</p>"}
<h2>Riwayat pembinaan</h2>
${pembinaan ? `<table><thead><tr><th>Tanggal</th><th>Ambang</th><th>Metode</th><th>Status / pelaksana</th><th>Hasil</th></tr></thead><tbody>${pembinaan}</tbody></table>` : "<p>Belum ada pembinaan tercatat.</p>"}
<h2>Ketidakhadiran per jam pelajaran</h2>
${jam ? `<table><thead><tr><th>Tanggal</th><th>Jam</th><th>Keterangan</th></tr></thead><tbody>${jam}</tbody></table>` : "<p>Tidak ada ketidakhadiran per jam tercatat.</p>"}
<div class="ttd"><div>Wali Kelas<br><br><br><br>( ........................ )</div><div>Waka Kesiswaan<br><br><br><br>( ........................ )</div><div>Orang Tua / Wali<br><br><br><br>( ........................ )</div></div>
<p><small>Dicetak ${esc(a.dicetak)} oleh ${esc(a.dicetakOleh)}</small></p>
</body></html>`;
}
