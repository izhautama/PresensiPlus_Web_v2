import { createUserWithEmailAndPassword, signOut } from "firebase/auth";
import { serverTimestamp } from "firebase/database";
import { getSecondaryAuth } from "../lib/firebase";
import { kirimUpdate, sisipkanAktivitas } from "./aktivitas";
import { PeranGagal } from "./db";

type Updates = Record<string, unknown>;
export type Pengelola = "admin" | "waka";
/** Cermin untuk tampilan waka/kepala (waka tidak boleh membaca node staff). */
export type BkAkun = { email: string; nama: string; aktif: boolean };

/**
 * Buat akun BK (akun PER GURU). Admin menulis node utuh; waka menulis per-field (rules hanya mengizinkan waka membuat entri akun BK field demi field,
 * dan role 'bk' hanya bila staff/{uid}/role = 'bk' pada update yang sama).
 */
export async function buatAkunBk(a: { nama: string; email: string; password: string }, oleh: Pengelola) {
  const sec = await getSecondaryAuth();
  let uid: string;
  try { uid = (await createUserWithEmailAndPassword(sec, a.email, a.password)).user.uid; }
  finally { await signOut(sec).catch(() => {}); }
  try { await pasangAkunBk(uid, a.nama, a.email, oleh); }
  catch (e) { throw new PeranGagal(uid, a.email, a.nama, "bk", (e as Error).message); }
  return uid;
}

/** Pasang role + entri staff + cermin (aman dipanggil ulang). */
export async function pasangAkunBk(uid: string, nama: string, email: string, oleh: Pengelola) {
  const u: Updates = { [`roles/${uid}`]: "bk" };
  if (oleh === "admin") {
    u[`staff/${uid}`] = { email, nama, role: "bk", dibuat: serverTimestamp() };
    u[`bkAkun/${uid}`] = { email, nama, aktif: true };
  } else {
    Object.assign(u, {
      [`staff/${uid}/email`]: email, [`staff/${uid}/nama`]: nama, [`staff/${uid}/role`]: "bk", [`staff/${uid}/dibuat`]: serverTimestamp(),
      [`bkAkun/${uid}/email`]: email, [`bkAkun/${uid}/nama`]: nama, [`bkAkun/${uid}/aktif`]: true,
    });
  }
  sisipkanAktivitas(u, { aksi: "atur-bk", detail: `Buat akun BK ${email}` });
  await kirimUpdate(u);
}

/** Cabut akses BK (hapus role; akun Auth tetap ada tetapi tidak bisa masuk). Entri cermin tetap sebagai riwayat dengan aktif=false. */
export async function cabutBk(uid: string, email: string) {
  const u: Updates = { [`roles/${uid}`]: null, [`bkAkun/${uid}/aktif`]: false };
  sisipkanAktivitas(u, { aksi: "atur-bk", detail: `Cabut akses BK ${email}` });
  await kirimUpdate(u);
}
export async function pasangKembaliBk(uid: string, email: string) {
  const u: Updates = { [`roles/${uid}`]: "bk", [`bkAkun/${uid}/aktif`]: true };
  sisipkanAktivitas(u, { aksi: "atur-bk", detail: `Pasang kembali akses BK ${email}` });
  await kirimUpdate(u);
}
