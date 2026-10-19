import { useEffect, useMemo, useState } from "react";
import { createUserWithEmailAndPassword, sendPasswordResetEmail, signOut } from "firebase/auth";
import {
  get, limitToLast, onValue, orderByChild, query, ref, serverTimestamp, set, update,
  type DatabaseReference, type Query,
} from "firebase/database";
import { emailOrtu, fb, getSecondaryAuth } from "../lib/firebase";
import type { Ack, CommandName, DayRecord, KetHarian, ScheduleRow, Student } from "../lib/types";
import { kirimUpdate, setOffsetServer, sisipkanAktivitas, waktuServer } from "./aktivitas";
import { encodeKelas } from "../lib/perjam";
import { todayWIB } from "../lib/time";
import { waktuServerDari } from "../lib/waktu";

export const r = (path: string) => ref(fb().db, path);

export type Live<T> = { data: T | null; loading: boolean; error: string | null };

/** Langganan realtime 1 path. `path = null` -> tidak berlangganan. */
export function useLive<T>(path: string | null, build?: (ref: DatabaseReference) => Query): Live<T> {
  const [state, setState] = useState<Live<T>>({ data: null, loading: Boolean(path), error: null });
  useEffect(() => {
    if (!path) { setState({ data: null, loading: false, error: null }); return; }
    setState((s) => ({ ...s, loading: true }));
    const base = r(path);
    return onValue(build ? build(base) : base,
      (snap) => setState({ data: (snap.val() as T) ?? null, loading: false, error: null }),
      (err) => setState({ data: null, loading: false, error: err.message }));
    // build sengaja tidak masuk deps: callers memberi fungsi stabil per path
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path]);
  return state;
}

/** Selisih jam server Firebase vs jam perangkat (ms) — utk deteksi alat offline yang akurat. */
/**
 * Jam server: `offset` = server - perangkat (ms). `siap` = selisih sudah diterima dari server (koneksi terhubung; batas tunggu 3 detik agar
 * tidak menggantung saat offline). Sebelum siap, tanggal sementara mengikuti jam perangkat.
 */
export function useServerClock() {
  const [offset, setOffset] = useState(0);
  const [siap, setSiap] = useState(false);
  useEffect(() => {
    const a = onValue(r(".info/serverTimeOffset"), (s) => { const v = Number(s.val()); const o = Number.isFinite(v) ? v : 0; setOffset(o); setOffsetServer(o); });
    const b = onValue(r(".info/connected"), (s) => { if (s.val()) setSiap(true); });
    const t = window.setTimeout(() => setSiap(true), 3000);
    return () => { a(); b(); window.clearTimeout(t); };
  }, []);
  return { offset, siap };
}
export function useServerOffset() { return useServerClock().offset; }

export function useConnected() {
  const [ok, setOk] = useState(true);
  useEffect(() => onValue(r(".info/connected"), (s) => setOk(Boolean(s.val()))), []);
  return ok;
}

/**
 * "Sekarang" menurut jam SERVER: jam perangkat + selisih server (`offsetMs`, dari useServerClock). Perbarui tiap `intervalMs` dan
 * seketika saat selisih berubah. Tanpa `offsetMs` (= 0) sama dengan jam perangkat (portal orang tua yang tidak membuka koneksi realtime).
 */
export function useNow(intervalMs = 15000, offsetMs = 0) {
  const [tik, setTik] = useState(0);
  useEffect(() => {
    const t = window.setInterval(() => setTik((x) => x + 1), intervalMs);
    return () => window.clearInterval(t);
  }, [intervalMs]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => new Date(waktuServerDari(Date.now(), offsetMs)), [tik, offsetMs]);
}

export const eventsQuery = (base: DatabaseReference) => query(base, orderByChild("ts"), limitToLast(30));

// ------------------------------------------------------------------ versi data (ESP32 unduh ulang)
const bumpVersion = () => set(r("config/version"), Date.now());

// ------------------------------------------------------------------ siswa
const RE_UID = /^[0-9A-F]{8,20}$/;
const PIN_LEMAH = new Set(["123456", "654321", "123123", "111222", "121212", "112233"]);

export function validasiPin(pin: string): string | null {
  if (!/^\d{6}$/.test(pin)) return "PIN harus tepat 6 digit angka";
  if (/^(\d)\1{5}$/.test(pin) || PIN_LEMAH.has(pin)) return "PIN terlalu mudah ditebak, gunakan kombinasi lain";
  return null;
}

export function buatPin(): string {
  const a = new Uint32Array(1);
  for (;;) {
    crypto.getRandomValues(a); // CSPRNG, bukan Math.random
    const pin = String(a[0] % 1_000_000).padStart(6, "0");
    if (!validasiPin(pin)) return pin;
  }
}

export function normalisasiSiswa(input: { uid: string; nis: string; nama: string; kelas: string }) {
  const uid = input.uid.trim().toUpperCase().replace(/[^0-9A-F]/g, "");
  const nis = input.nis.trim();
  const nama = input.nama.trim().replace(/\s+/g, " ").toUpperCase();
  const kelas = input.kelas.trim().replace(/\s+/g, " ");
  const err: Record<string, string> = {};
  if (!RE_UID.test(uid)) err.uid = "UID kartu harus 8–20 karakter heksadesimal (0-9, A-F)";
  if (!/^\d{1,20}$/.test(nis)) err.nis = "NIS hanya angka";
  if (!nama) err.nama = "Nama wajib diisi";
  else if (nama.length > 60) err.nama = "Nama maksimal 60 karakter";
  if (!kelas) err.kelas = "Kelas wajib diisi";
  else if (kelas.length > 15) err.kelas = "Kelas maksimal 15 karakter";
  return { data: { uid, nis, nama, kelas }, err };
}

/**
 * Buat akun ortu versi baru. Akun lama TIDAK bisa dihapus dari browser (butuh Admin SDK),
 * tapi otomatis kehilangan akses karena Security Rules mencocokkan /parents/{nis}/uid.
 */
async function buatAkunOrtu(nis: string, pin: string): Promise<{ uid: string; ver: number }> {
  const sec = await getSecondaryAuth();
  const cur = (await get(r(`parents/${nis}/ver`))).val();
  let ver = (Number(cur) || 0) + 1;
  for (let coba = 0; coba < 5; coba++, ver++) {
    try {
      const cred = await createUserWithEmailAndPassword(sec, emailOrtu(nis, ver), pin);
      await signOut(sec);
      return { uid: cred.user.uid, ver };
    } catch (e) {
      if ((e as { code?: string }).code !== "auth/email-already-in-use") throw e;
    }
  }
  throw new Error("Gagal membuat akun orang tua (versi akun penuh). Hubungi pengelola sistem.");
}

export async function tambahSiswa(s: { uid: string } & Student, pin: string, existing: Record<string, Student>) {
  if (existing[s.uid]) throw new Error(`Kartu ${s.uid} sudah terdaftar atas nama ${existing[s.uid].nama}`);
  const dobel = Object.entries(existing).find(([, v]) => v.nis === s.nis);
  if (dobel) throw new Error(`NIS ${s.nis} sudah dipakai ${dobel[1].nama}`);
  const akun = await buatAkunOrtu(s.nis, pin);
  await update(r("/"), {
    [`config/students/${s.uid}`]: { nis: s.nis, nama: s.nama, kelas: s.kelas },
    // aktifSejak = tanggal siswa ditambahkan: hari efektif sebelum tanggal ini tidak dihitung untuk siswa baru
    [`profiles/${s.nis}`]: { nama: s.nama, kelas: s.kelas, aktifSejak: todayWIB(new Date(waktuServer())) }, // tanggal menurut SERVER, bukan jam perangkat
    [`siswaKelas/${s.nis}`]: encodeKelas(s.kelas), // indeks untuk wewenang wali kelas
    [`parents/${s.nis}`]: akun,
    "config/version": Date.now(),
  });
}

export async function ubahSiswa(oldUid: string, old: Student, s: { uid: string } & Student, existing: Record<string, Student>) {
  if (s.uid !== oldUid && existing[s.uid]) throw new Error(`Kartu ${s.uid} sudah terdaftar atas nama ${existing[s.uid].nama}`);
  if (s.nis !== old.nis) throw new Error("NIS tidak bisa diubah (terikat ke riwayat & akun orang tua). Hapus lalu daftarkan ulang bila perlu.");
  const paths: Record<string, unknown> = {
    [`config/students/${s.uid}`]: { nis: s.nis, nama: s.nama, kelas: s.kelas },
    // per-field: JANGAN menimpa aktifSejak
    [`profiles/${s.nis}/nama`]: s.nama,
    [`profiles/${s.nis}/kelas`]: s.kelas,
    [`siswaKelas/${s.nis}`]: encodeKelas(s.kelas),
    "config/version": Date.now(),
  };
  if (s.uid !== oldUid) paths[`config/students/${oldUid}`] = null; // ganti kartu (hilang/rusak)
  await update(r("/"), paths);
}

export async function hapusSiswa(uid: string, nis: string) {
  // Riwayat /attendance & /log sengaja DIPERTAHANKAN untuk arsip
  await update(r("/"), {
    [`config/students/${uid}`]: null,
    [`profiles/${nis}`]: null,
    [`siswaKelas/${nis}`]: null,
    [`parents/${nis}`]: null,
    "config/version": Date.now(),
  });
}

export async function resetPin(nis: string, pin: string) {
  const akun = await buatAkunOrtu(nis, pin);
  await set(r(`parents/${nis}`), akun);
}

export async function aturIzin(nis: string, tanggal: string, ket: KetHarian | null, catatan: string) {
  const rec = (await get(r(`attendance/${nis}/${tanggal}`))).val() as DayRecord | null;
  // Dispensasi: siswa boleh tap lalu berangkat mewakili sekolah, jadi pemeriksaan "sudah tap" TIDAK berlaku
  if (ket && ket !== "Dispensasi" && rec?.status) throw new Error(`Siswa sudah tap masuk (${rec.status} ${rec.masuk}) pada tanggal tsb`);
  const u: Record<string, unknown> = {
    [`attendance/${nis}/${tanggal}/ket`]: ket,
    [`attendance/${nis}/${tanggal}/catatan`]: ket && catatan.trim() ? catatan.trim().slice(0, 200) : null,
    [`izin/${tanggal}/${nis}`]: ket,
  };
  sisipkanAktivitas(u, { aksi: ket ? "izin-harian" : "hapus-izin", nis, detail: ket ? `${ket} ${tanggal}${catatan.trim() ? `: ${catatan.trim()}` : ""}` : `Hapus keterangan ${tanggal}` });
  await kirimUpdate(u);
}

// ------------------------------------------------------------------ akun pimpinan & staf (kepala, waka)
export type PeranStaf = "kepala" | "waka" | "piket" | "wali";
export const PERAN_STAF: Record<PeranStaf, string> = { kepala: "Kepala Madrasah", waka: "Waka Kesiswaan", piket: "Guru Piket (akun bersama)", wali: "Wali Kelas (akun per guru)" };
/** Peran yang dibuat lewat dialog "Tambah akun" umum. Wali kelas punya panel sendiri (pemetaan kelas). */
export const PERAN_STAF_UMUM: PeranStaf[] = ["kepala", "waka", "piket"];
export type Staff = { email: string; nama: string; role: PeranStaf; dibuat: number };
export const MAKS_STAF = 10;

/** Akun Auth sudah terbuat tetapi peran gagal dipasang (mis. rules belum di-deploy). */
export class PeranGagal extends Error {
  constructor(public uid: string, public email: string, public nama: string, public role: PeranStaf, pesan: string) { super(pesan); }
}

/** Pasang peran + profil staf dalam satu update atomik (aman dipanggil ulang). */
export async function pasangPeranStaf(uid: string, email: string, nama: string, role: PeranStaf) {
  await update(r("/"), {
    [`roles/${uid}`]: role,
    [`staff/${uid}`]: { email, nama, role, dibuat: serverTimestamp() },
    // cermin untuk waka (waka tidak boleh membaca staff/roles): dasar tombol "kunci akun piket"
    ...(role === "piket" ? { [`piketAkun/${uid}`]: { email, nama, terkunci: false } } : {}),
  });
}

/**
 * Kunci darurat akun piket: hapus roles/{uid} (akses langsung tertolak; sesi aktif otomatis keluar) atau pasang kembali 'piket'.
 * `terkunci` hanya penanda tampilan di piketAkun. Admin menyertakan email/nama agar entri cermin lengkap; waka hanya mengubah `terkunci`.
 */
export async function kunciAkunPiket(uid: string, kunci: boolean, info?: { email: string; nama: string }) {
  const u: Record<string, unknown> = { [`roles/${uid}`]: kunci ? null : "piket" };
  if (info) u[`piketAkun/${uid}`] = { email: info.email, nama: info.nama, terkunci: kunci };
  else u[`piketAkun/${uid}/terkunci`] = kunci;
  sisipkanAktivitas(u, { aksi: kunci ? "kunci-akun" : "buka-kunci", detail: `${kunci ? "Kunci" : "Buka kunci"} akun ${info?.email ?? uid}` });
  await kirimUpdate(u);
}

/** Buat akun lewat auth sekunder agar sesi admin yang sedang login tidak ikut berganti. */
export async function buatAkunStaf(nama: string, email: string, password: string, role: PeranStaf) {
  const sec = await getSecondaryAuth();
  let uid: string;
  try {
    uid = (await createUserWithEmailAndPassword(sec, email, password)).user.uid;
  } finally {
    await signOut(sec).catch(() => {});
  }
  try {
    await pasangPeranStaf(uid, email, nama, role);
  } catch (e) {
    throw new PeranGagal(uid, email, nama, role, (e as Error).message);
  }
}

/** Cabut peran. Akun Auth tetap ada tetapi tidak bisa masuk karena tanpa peran. */
export async function cabutAkunStaf(uid: string) {
  await update(r("/"), { [`roles/${uid}`]: null, [`staff/${uid}`]: null, [`piketAkun/${uid}`]: null });
}

export const kirimResetPassword = (email: string) => sendPasswordResetEmail(fb().auth, email);

// ------------------------------------------------------------------ jadwal
export async function simpanJadwal(rows: ScheduleRow[]) {
  const out: Record<string, ScheduleRow> = {};
  rows.forEach((row, i) => { out[`s${String(i).padStart(3, "0")}`] = row; });
  await set(r("config/schedule"), out);
  await bumpVersion();
}

// ------------------------------------------------------------------ perangkat
export async function kirimPerintah(cmd: CommandName, arg?: string): Promise<string> {
  const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const payload: Record<string, unknown> = { id, cmd, ts: serverTimestamp() };
  if (arg) payload.arg = arg.slice(0, 64);
  await set(r("device/inbox/command"), payload);
  return id;
}

/** Tunggu balasan alat di /device/ack/{id}. */
export function tungguAck(id: string, timeoutMs: number, cb: (ack: Ack | null) => void) {
  let selesai = false;
  const stop = onValue(r(`device/ack/${id}`), (s) => {
    if (s.exists() && !selesai) { selesai = true; stop(); window.clearTimeout(t); cb(s.val() as Ack); }
  });
  const t = window.setTimeout(() => { if (!selesai) { selesai = true; stop(); cb(null); } }, timeoutMs);
  return () => { selesai = true; stop(); window.clearTimeout(t); };
}

/** Tandai panel admin sedang dibuka -> alat polling perintah lebih cepat (2 dtk). */
export function useWatching(active: boolean) {
  useEffect(() => {
    if (!active) return;
    const tick = () => { if (document.visibilityState === "visible") set(r("device/inbox/watching"), serverTimestamp()).catch(() => {}); };
    tick();
    const t = window.setInterval(tick, 30000);
    return () => window.clearInterval(t);
  }, [active]);
}

export const ONLINE_MS = 3 * 60 * 1000;
