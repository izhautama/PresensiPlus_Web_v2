// Pemeriksa konsistensi (fungsi MURNI): (1) indeks siswaKelas vs config/students, (2) cermin waliAkun vs staff + roles.
// Sumber kebenaran: config/students (kelas siswa), staff + roles (akun wali). Indeks/cermin selalu mengikuti sumbernya.
import { bedaIndeks } from "./wali.ts";
import { encodeKelas } from "./perjam.ts";

export type SiswaCfg = { nis: string; nama: string; kelas: string };
export type SelisihSiswa = { nis: string; nama: string; jenis: "baru" | "berubah" | "usang"; seharusnya: string | null; sekarang: string | null };

/** Siswa yang indeksnya hilang (baru), kelasnya beda (berubah), atau indeks tanpa siswa (usang). Urut menurut NIS. */
export function selisihIndeks(siswa: SiswaCfg[], indeks: Record<string, string> | null | undefined): SelisihSiswa[] {
  const idx = indeks ?? {};
  const unik = new Map<string, SiswaCfg>();
  for (const s of siswa) if (!unik.has(s.nis)) unik.set(s.nis, s);
  const d = bedaIndeks([...unik.values()], idx);
  const rinci = (nis: string, jenis: SelisihSiswa["jenis"]): SelisihSiswa => {
    const s = unik.get(nis);
    return { nis, nama: s?.nama ?? "(siswa sudah tidak ada)", jenis, seharusnya: s ? encodeKelas(s.kelas) : null, sekarang: idx[nis] ?? null };
  };
  return [...d.baru.map((n) => rinci(n, "baru")), ...d.berubah.map((n) => rinci(n, "berubah")), ...d.usang.map((n) => rinci(n, "usang"))]
    .sort((a, b) => a.nis.localeCompare(b.nis, "id", { numeric: true }));
}

export type StaffWali = { email?: string; nama?: string; role?: string; kelasUtama?: string; kelasTambahan?: Record<string, boolean> | null };
export type CerminWali = { email?: string; nama?: string; kelasUtama?: string; aktif?: boolean; kelasTambahan?: Record<string, boolean> | null };
export type SelisihAkun = {
  uid: string; nama: string;
  jenis: "tanpa-cermin" | "cermin-usang" | "beda" | "tanpa-kelas";
  rincian: string[];
  /** path -> nilai yang akan ditulis (null = hapus). null = tidak dapat diperbaiki otomatis (perlu tindakan admin). */
  perbaikan: Record<string, unknown> | null;
};

const kunciTambahan = (t: Record<string, boolean> | null | undefined) => Object.entries(t ?? {}).filter(([, v]) => v === true).map(([k]) => k).sort();
const objTambahan = (k: string[]) => (k.length ? Object.fromEntries(k.map((x) => [x, true])) : null);

/**
 * Cermin waliAkun/{uid} harus sama dengan: email/nama/kelasUtama/kelasTambahan milik staff/{uid} dan aktif = (roles/{uid} === 'wali').
 * `roles` hanya perlu memuat uid akun wali (admin hanya dapat membaca roles per-uid).
 */
export function selisihCermin(staff: Record<string, StaffWali> | null | undefined, cermin: Record<string, CerminWali> | null | undefined, roles: Record<string, string | null | undefined>): SelisihAkun[] {
  const out: SelisihAkun[] = [];
  const st = staff ?? {}, cm = cermin ?? {};
  for (const [uid, s] of Object.entries(st)) {
    if (s.role !== "wali") continue;
    const nama = s.nama ?? uid;
    if (!s.kelasUtama) { out.push({ uid, nama, jenis: "tanpa-kelas", rincian: ["Akun wali belum punya kelas utama (atur di daftar Wali kelas)"], perbaikan: null }); continue; }
    const aktif = roles[uid] === "wali";
    const tambahan = kunciTambahan(s.kelasTambahan);
    const c = cm[uid];
    if (!c) {
      out.push({
        uid, nama, jenis: "tanpa-cermin", rincian: ["Cermin waliAkun belum ada (waka/kepala tidak melihat akun ini)"],
        perbaikan: { [`waliAkun/${uid}`]: { email: s.email ?? "", nama: s.nama ?? "", kelasUtama: s.kelasUtama, aktif, ...(tambahan.length ? { kelasTambahan: objTambahan(tambahan) } : {}) } },
      });
      continue;
    }
    const rincian: string[] = [], perbaikan: Record<string, unknown> = {};
    if (c.email !== s.email) { rincian.push(`email: cermin "${c.email ?? ""}" ≠ staff "${s.email ?? ""}"`); perbaikan[`waliAkun/${uid}/email`] = s.email ?? ""; }
    if (c.nama !== s.nama) { rincian.push(`nama: cermin "${c.nama ?? ""}" ≠ staff "${s.nama ?? ""}"`); perbaikan[`waliAkun/${uid}/nama`] = s.nama ?? ""; }
    if (c.kelasUtama !== s.kelasUtama) { rincian.push(`kelas utama: cermin "${c.kelasUtama ?? ""}" ≠ staff "${s.kelasUtama}"`); perbaikan[`waliAkun/${uid}/kelasUtama`] = s.kelasUtama; }
    if (kunciTambahan(c.kelasTambahan).join("|") !== tambahan.join("|")) { rincian.push(`kelas tambahan: cermin [${kunciTambahan(c.kelasTambahan).join(", ")}] ≠ staff [${tambahan.join(", ")}]`); perbaikan[`waliAkun/${uid}/kelasTambahan`] = objTambahan(tambahan); }
    if (c.aktif !== aktif) { rincian.push(`status: cermin ${c.aktif ? "aktif" : "dicabut"} ≠ peran ${aktif ? "aktif" : "dicabut"}`); perbaikan[`waliAkun/${uid}/aktif`] = aktif; }
    if (rincian.length) out.push({ uid, nama, jenis: "beda", rincian, perbaikan });
  }
  for (const [uid, c] of Object.entries(cm)) {
    if (st[uid]?.role === "wali") continue;
    out.push({ uid, nama: c.nama ?? uid, jenis: "cermin-usang", rincian: ["Cermin waliAkun tanpa akun wali di staff"], perbaikan: { [`waliAkun/${uid}`]: null } });
  }
  return out.sort((a, b) => a.nama.localeCompare(b.nama, "id"));
}

/** Kelas milik wali (utama/tambahan) yang tidak punya siswa sama sekali: tanda khas lupa memperbarui pemetaan setelah naik kelas. Hanya peringatan. */
export function kelasWaliKosong(staff: Record<string, StaffWali> | null | undefined, siswa: SiswaCfg[]): { uid: string; nama: string; kelas: string }[] {
  const ada = new Set(siswa.map((s) => encodeKelas(s.kelas)));
  const out: { uid: string; nama: string; kelas: string }[] = [];
  for (const [uid, s] of Object.entries(staff ?? {})) {
    if (s.role !== "wali") continue;
    for (const k of [s.kelasUtama, ...kunciTambahan(s.kelasTambahan)]) if (k && !ada.has(k)) out.push({ uid, nama: s.nama ?? uid, kelas: k });
  }
  return out;
}

export type HasilKonsistensi = { siswa: SelisihSiswa[]; akun: SelisihAkun[]; kelasKosong: { uid: string; nama: string; kelas: string }[]; waktu: number };

export const totalSelisih = (h: Pick<HasilKonsistensi, "siswa" | "akun"> | null | undefined) => (h ? h.siswa.length + h.akun.length : 0);

/** Kumpulan path perbaikan: indeks siswaKelas mengikuti config/students; cermin mengikuti staff + roles. Akun yang tidak dapat diperbaiki otomatis dilewati. */
export function rencanaPerbaikan(h: Pick<HasilKonsistensi, "siswa" | "akun">): Record<string, unknown> {
  const u: Record<string, unknown> = {};
  for (const s of h.siswa) u[`siswaKelas/${s.nis}`] = s.jenis === "usang" ? null : s.seharusnya;
  for (const a of h.akun) if (a.perbaikan) Object.assign(u, a.perbaikan);
  return u;
}
