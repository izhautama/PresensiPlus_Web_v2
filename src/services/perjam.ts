import { serverTimestamp, update } from "firebase/database";
import { encodeKelas, type KodeJam, type MetaJam } from "../lib/perjam";
import { kirimUpdate, sisipkanAktivitas } from "./aktivitas";
import { r } from "./db";
import { tambahAudit, type Actor } from "./discipline";

type Updates = Record<string, unknown>;

export type PerubahanSel = { nis: string; jam: number; kode: KodeJam | null };

/**
 * Simpan presensi per jam satu kelas/tanggal dalam SATU update atomik:
 * lessons/... (sumber) + lessonsByStudent/... (salinan untuk portal orang tua), termasuk menghapus sel yang kembali hadir.
 * `akhir` = kondisi sel setelah perubahan (untuk menyegarkan nama mapel di salinan bila mapel diubah).
 */
export async function simpanPerJam(args: {
  tanggal: string;
  kelas: string;
  sel: PerubahanSel[];
  meta: Record<number, MetaJam | null>; // hanya jam yang berubah
  akhir: Record<string, Record<number, KodeJam>>; // nis -> jam -> kode (kondisi akhir)
  mapelAkhir: Record<number, string | undefined>;
}, a: Actor) {
  const { tanggal, kelas } = args;
  const key = encodeKelas(kelas);
  const base = `lessons/${tanggal}/${key}`;
  const u: Updates = {};
  const ditulis = new Set<string>();

  for (const { nis, jam, kode } of args.sel) {
    u[`${base}/absen/${nis}/${jam}`] = kode;
    u[`lessonsByStudent/${nis}/${tanggal}/${jam}`] = kode ? { k: kode, ...(args.mapelAkhir[jam] ? { mapel: args.mapelAkhir[jam] } : {}) } : null;
    ditulis.add(`${nis}:${jam}`);
  }
  for (const [jamStr, m] of Object.entries(args.meta)) {
    const jam = Number(jamStr);
    const bersih = m && (m.mapel || m.guru) ? { ...(m.mapel ? { mapel: m.mapel } : {}), ...(m.guru ? { guru: m.guru } : {}) } : null;
    u[`${base}/meta/${jam}`] = bersih;
    // nama mapel berubah -> segarkan salinan siswa yang sudah punya kode pada jam itu
    for (const [nis, per] of Object.entries(args.akhir)) {
      const kode = per[jam];
      if (kode && !ditulis.has(`${nis}:${jam}`)) u[`lessonsByStudent/${nis}/${tanggal}/${jam}`] = { k: kode, ...(m?.mapel ? { mapel: m.mapel } : {}) };
    }
  }
  u[`${base}/oleh`] = a.uid;
  u[`${base}/ts`] = serverTimestamp();
  sisipkanAktivitas(u, { aksi: "presensi-jam", detail: `${kelas} ${tanggal}: ${args.sel.length} sel diubah` });
  await kirimUpdate(u);
}

// ------------------------------------------------------------------ validasi Alfa harian
/** Konfirmasi Alfa: validasi + salinan milik anak + jejak audit, satu update. */
export async function konfirmasiAlfa(tanggal: string, nis: string, catatan: string, a: Actor) {
  const u: Updates = {};
  const body: Record<string, unknown> = { status: "Alfa", oleh: a.uid, ts: serverTimestamp() };
  if (catatan.trim()) body.catatan = catatan.trim().slice(0, 200);
  u[`validasi/${tanggal}/${nis}`] = body;
  u[`validasiByStudent/${nis}/${tanggal}`] = { status: "Alfa" };
  tambahAudit(u, a, "buat", `validasi/${tanggal}/${nis}`, null, { status: "Alfa", catatan: catatan.trim() || null });
  sisipkanAktivitas(u, { aksi: "validasi-alfa", nis, detail: `Alfa ${tanggal}${catatan.trim() ? `: ${catatan.trim()}` : ""}` });
  await kirimUpdate(u);
}

export async function batalkanAlfa(tanggal: string, nis: string, a: Actor) {
  const u: Updates = {};
  u[`validasi/${tanggal}/${nis}`] = null;
  u[`validasiByStudent/${nis}/${tanggal}`] = null;
  tambahAudit(u, a, "hapus", `validasi/${tanggal}/${nis}`, { status: "Alfa" }, null);
  sisipkanAktivitas(u, { aksi: "batal-alfa", nis, detail: `Batalkan Alfa ${tanggal}` });
  await kirimUpdate(u);
}
