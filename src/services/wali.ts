import { createUserWithEmailAndPassword, signOut } from "firebase/auth";
import { get, serverTimestamp } from "firebase/database";
import { getSecondaryAuth } from "../lib/firebase";
import { kelasWaliKosong, rencanaPerbaikan, selisihCermin, selisihIndeks, type CerminWali, type HasilKonsistensi, type SiswaCfg, type StaffWali } from "../lib/konsistensi";
import { kirimUpdate, sisipkanAktivitas } from "./aktivitas";
import { PeranGagal, r } from "./db";

type Updates = Record<string, unknown>;
export type Pengelola = "admin" | "waka";
/** Cermin untuk tampilan waka/kepala (waka tidak boleh membaca node staff). */
export type WaliAkun = { email: string; nama: string; kelasUtama: string; aktif: boolean; kelasTambahan?: Record<string, true> };

const tambahanObj = (k: string[]) => (k.length ? Object.fromEntries(k.map((x) => [x, true])) : null);

/**
 * Buat akun wali (akun PER GURU). Admin: kelas utama + tambahan (berapa pun). Waka: HANYA kelas utama (tepat 1 kelas);
 * penulisan per-field karena rules hanya mengizinkan waka membuat entri akun wali field demi field.
 */
export async function buatAkunWali(a: { nama: string; email: string; password: string; kelasUtama: string; kelasTambahan?: string[] }, oleh: Pengelola) {
  if (!a.kelasUtama) throw new Error("Pilih kelas utama.");
  const tambahan = oleh === "admin" ? (a.kelasTambahan ?? []).filter((k) => k !== a.kelasUtama) : [];
  const sec = await getSecondaryAuth();
  let uid: string;
  try { uid = (await createUserWithEmailAndPassword(sec, a.email, a.password)).user.uid; }
  finally { await signOut(sec).catch(() => {}); }
  try { await pasangAkunWali(uid, a.nama, a.email, a.kelasUtama, tambahan, oleh); }
  catch (e) { throw new PeranGagal(uid, a.email, a.nama, "wali", (e as Error).message); }
  return uid;
}

/** Pasang role + entri staff + cermin (aman dipanggil ulang). */
export async function pasangAkunWali(uid: string, nama: string, email: string, kelasUtama: string, tambahan: string[], oleh: Pengelola) {
  const u: Updates = { [`roles/${uid}`]: "wali" };
  if (oleh === "admin") {
    u[`staff/${uid}`] = { email, nama, role: "wali", dibuat: serverTimestamp(), kelasUtama, ...(tambahan.length ? { kelasTambahan: tambahanObj(tambahan) } : {}) };
    u[`waliAkun/${uid}`] = { email, nama, kelasUtama, aktif: true, ...(tambahan.length ? { kelasTambahan: tambahanObj(tambahan) } : {}) };
  } else {
    Object.assign(u, {
      [`staff/${uid}/email`]: email, [`staff/${uid}/nama`]: nama, [`staff/${uid}/role`]: "wali", [`staff/${uid}/dibuat`]: serverTimestamp(), [`staff/${uid}/kelasUtama`]: kelasUtama,
      [`waliAkun/${uid}/email`]: email, [`waliAkun/${uid}/nama`]: nama, [`waliAkun/${uid}/kelasUtama`]: kelasUtama, [`waliAkun/${uid}/aktif`]: true,
    });
  }
  sisipkanAktivitas(u, { aksi: "atur-wali", detail: `Buat akun wali ${email}: kelas utama ${kelasUtama}${tambahan.length ? `, tambahan ${tambahan.join(", ")}` : ""}` });
  await kirimUpdate(u);
}

/** Ubah kelas. Admin: utama + tambahan; waka: HANYA kelas utama (rules menolak kelasTambahan oleh waka). */
export async function ubahKelasWali(uid: string, email: string, a: { kelasUtama: string; kelasTambahan?: string[] }, oleh: Pengelola) {
  const u: Updates = { [`staff/${uid}/kelasUtama`]: a.kelasUtama, [`waliAkun/${uid}/kelasUtama`]: a.kelasUtama };
  if (oleh === "admin") {
    const t = tambahanObj((a.kelasTambahan ?? []).filter((k) => k !== a.kelasUtama));
    u[`staff/${uid}/kelasTambahan`] = t;
    u[`waliAkun/${uid}/kelasTambahan`] = t;
  }
  sisipkanAktivitas(u, { aksi: "atur-wali", detail: `Ubah kelas wali ${email}: utama ${a.kelasUtama}${oleh === "admin" ? `, tambahan ${(a.kelasTambahan ?? []).join(", ") || "-"}` : ""}` });
  await kirimUpdate(u);
}

/** Cabut akses wali (hapus role; akun Auth tetap ada tetapi tidak bisa masuk). Entri tetap ada sebagai riwayat dengan aktif=false. */
export async function cabutWali(uid: string, email: string) {
  const u: Updates = { [`roles/${uid}`]: null, [`waliAkun/${uid}/aktif`]: false };
  sisipkanAktivitas(u, { aksi: "atur-wali", detail: `Cabut akses wali ${email}` });
  await kirimUpdate(u);
}
export async function pasangKembaliWali(uid: string, email: string) {
  const u: Updates = { [`roles/${uid}`]: "wali", [`waliAkun/${uid}/aktif`]: true };
  sisipkanAktivitas(u, { aksi: "atur-wali", detail: `Pasang kembali akses wali ${email}` });
  await kirimUpdate(u);
}

/**
 * Pergantian tahun ajaran (admin): perbarui pemetaan kelas SEMUA wali dalam satu update, dan WAJIB menyinkronkan indeks siswaKelas
 * (dibaca ulang dari config/students) di update yang SAMA, sehingga pemetaan wali dan indeks siswa tidak pernah berselisih setelah naik kelas.
 */
export async function simpanWaliMassal(baris: { uid: string; email: string; kelasUtama: string; kelasTambahan: string[] }[]): Promise<{ wali: number; indeks: number }> {
  const [st, idx] = await Promise.all([get(r("config/students")), get(r("siswaKelas"))]);
  const selisih = selisihIndeks(Object.values((st.val() ?? {}) as Record<string, SiswaCfg>), (idx.val() ?? {}) as Record<string, string>);
  const u: Updates = {};
  for (const b of baris) {
    const t = tambahanObj(b.kelasTambahan.filter((k) => k !== b.kelasUtama));
    u[`staff/${b.uid}/kelasUtama`] = b.kelasUtama; u[`waliAkun/${b.uid}/kelasUtama`] = b.kelasUtama;
    u[`staff/${b.uid}/kelasTambahan`] = t; u[`waliAkun/${b.uid}/kelasTambahan`] = t;
  }
  for (const x of selisih) u[`siswaKelas/${x.nis}`] = x.jenis === "usang" ? null : x.seharusnya;
  sisipkanAktivitas(u, { aksi: "atur-wali", detail: `Wali kelas per tahun ajaran: ${baris.length} akun diperbarui; indeks siswa-kelas disinkronkan (${selisih.length} selisih)` });
  await kirimUpdate(u);
  return { wali: baris.length, indeks: selisih.length };
}

// ------------------------------------------------------------------ pemeriksa konsistensi (indeks siswaKelas + cermin waliAkun)
/** Baca ulang sumber (config/students, staff, roles) dan turunannya (siswaKelas, waliAkun), lalu hitung selisih. Admin. */
export async function periksaKonsistensi(): Promise<HasilKonsistensi> {
  const [st, idx, stf, cm] = await Promise.all([get(r("config/students")), get(r("siswaKelas")), get(r("staff")), get(r("waliAkun"))]);
  const siswa = Object.values((st.val() ?? {}) as Record<string, SiswaCfg>);
  const staff = (stf.val() ?? {}) as Record<string, StaffWali>;
  const cermin = (cm.val() ?? {}) as Record<string, CerminWali>;
  const uids = [...new Set([...Object.entries(staff).filter(([, s]) => s.role === "wali").map(([u]) => u), ...Object.keys(cermin)])];
  const roles = Object.fromEntries(await Promise.all(uids.map(async (u) => [u, (await get(r(`roles/${u}`))).val() as string | null] as const)));
  return {
    siswa: selisihIndeks(siswa, (idx.val() ?? {}) as Record<string, string>),
    akun: selisihCermin(staff, cermin, roles),
    kelasKosong: kelasWaliKosong(staff, siswa),
    waktu: Date.now(),
  };
}

/**
 * Perbaiki selisih. `dry` (bawaan) hanya menghitung rencana tulis. Data dibaca ULANG sebelum menulis (bukan memakai hasil lama),
 * perubahan dikirim per 400 path dan batch pertama memuat entri log aktivitas "perbaiki-indeks" (audit). Aman diulang.
 */
export async function perbaikiKonsistensi(dry = true): Promise<{ hasil: HasilKonsistensi; path: number }> {
  const hasil = await periksaKonsistensi();
  const rencana = rencanaPerbaikan(hasil);
  const item = Object.entries(rencana);
  if (!dry && item.length) {
    const ringkas = `${hasil.siswa.length} indeks siswa-kelas (baru ${hasil.siswa.filter((x) => x.jenis === "baru").length}, berubah ${hasil.siswa.filter((x) => x.jenis === "berubah").length}, usang ${hasil.siswa.filter((x) => x.jenis === "usang").length}), ${hasil.akun.filter((x) => x.perbaikan).length} cermin akun wali`;
    for (let i = 0; i < item.length; i += 400) {
      const u: Updates = Object.fromEntries(item.slice(i, i + 400));
      if (i === 0) sisipkanAktivitas(u, { aksi: "perbaiki-indeks", detail: `Perbaiki konsistensi: ${ringkas}` });
      await kirimUpdate(u);
    }
  }
  return { hasil, path: item.length };
}

// ------------------------------------------------------------------ pelanggaran ringan oleh wali
export type SiswaWali = { nis: string; nama: string; kelas: string };
/** Konteks tulis wali: uid akun + nama guru (akun per guru, tanpa layar pilih petugas). */
export type KonteksWali = { uid: string; nama: string };

// (v2.5.2) pelanggaranWali/hapusPelanggaranWali dihapus: wali kelas tidak lagi mencatat pelanggaran (Piket/Waka/Kepala). Catatan lama bersumber 'wali' tetap sah.
