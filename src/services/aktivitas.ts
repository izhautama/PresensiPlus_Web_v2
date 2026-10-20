import { onValue, push, ref, serverTimestamp, set, update } from "firebase/database";
import { fb } from "../lib/firebase";
import { idPerangkat, labelPerangkatSekarang, namaPerangkat } from "../lib/perangkat";

// Log aktivitas akun staf (terutama akun piket yang dipakai bersama).
// Identitas "siapa" = nama petugas yang DIPILIH SENDIRI (deklarasi mandiri) + deviceId acak lokal + label perangkat.
// Untuk piket, Security Rules MEWAJIBKAN setiap tulisan disertai entri log pada update yang sama (lihat build-rules.mjs).

export type PeranLog = "admin" | "kepala" | "waka" | "piket" | "wali" | "bk";
export type AksiLog =
  | "login" | "logout" | "pilih-petugas" | "izin-harian" | "izin-jam" | "hapus-izin" | "pelanggaran" | "hapus-pelanggaran"
  | "remisi" | "ubah-pelanggaran" | "pulihkan-pelanggaran" | "presensi-jam" | "presensi-manual" | "hapus-manual" | "atur-wali" | "alfa-jam" | "perbaiki-indeks" | "atur-penanggung-jawab" | "catat-pembinaan" | "usul-remisi" | "batal-usul" | "putuskan-usul" | "atur-kalender" | "hapus-kalender" | "hitung-kalender" | "normal-kalender" | "ambang-kalender" | "migrasi-kalender" | "validasi-alfa" | "batal-alfa" | "saran-setuju" | "saran-abaikan"
  | "kunci-akun" | "buka-kunci" | "catat-konseling" | "ubah-konseling" | "atur-bk";
type Konteks = { uid: string; peran: PeranLog; email: string };
type Updates = Record<string, unknown>;

const r = (p: string) => ref(fb().db, p);
let konteks: Konteks | null = null;
let petugas: string | undefined;
let offsetMs = 0;

export const setKonteksAktivitas = (k: Konteks | null) => { konteks = k; if (!k) petugas = undefined; };
export const setPetugasAktivitas = (p?: string) => { petugas = p; };
export const setOffsetServer = (ms: number) => { offsetMs = Number.isFinite(ms) ? ms : 0; };
export const peranAktif = () => konteks?.peran ?? null;

/** Waktu server (jam perangkat dikoreksi selisih dari .info/serverTimeOffset). */
export const waktuServer = () => Date.now() + offsetMs;
/** epoch-day WIB hari ini menurut server: persis yang diperiksa Security Rules (lantai dari now + 7 jam). */
export const hariKeServer = () => Math.floor((waktuServer() + 7 * 3600_000) / 86_400_000);
export const tanggalServer = () => new Date(hariKeServer() * 86_400_000).toISOString().slice(0, 10);

/** Tunggu selisih waktu server (maks. `batasMs`) agar hariKe pada log pertama (login) akurat. */
export function muatOffsetServer(batasMs = 2500): Promise<void> {
  return new Promise((selesai) => {
    let sudah = false;
    let stop: (() => void) | null = null;
    const akhir = () => { if (sudah) return; sudah = true; stop?.(); selesai(); };
    // onValue dapat memanggil callback SINKRON (data tersimpan): `stop` belum terisi saat itu, jadi dilepas setelah onValue kembali
    stop = onValue(r(".info/serverTimeOffset"), (s) => { setOffsetServer(Number(s.val()) || 0); akhir(); }, () => akhir());
    if (sudah) stop();
    window.setTimeout(akhir, batasMs);
  });
}

/**
 * Tambahkan entri log + penanda `activityLast` ke kumpulan update (multi-path) yang SAMA dengan perubahan data.
 * Mengembalikan id log (dipakai piket sebagai awalan kunci izinMeta), atau null bila tidak ada sesi staf.
 */
export function sisipkanAktivitas(u: Updates, a: { aksi: AksiLog; nis?: string; detail?: string }): string | null {
  if (!konteks) return null;
  if (konteks.peran === "piket" && a.aksi !== "login" && !petugas) throw new Error("Pilih petugas terlebih dahulu.");
  const id = push(r("activity/x")).key as string;
  const tgl = tanggalServer();
  const dev = idPerangkat();
  const e: Updates = {
    uid: konteks.uid, peran: konteks.peran, akunEmail: konteks.email.slice(0, 120) || "-", aksi: a.aksi,
    detail: (a.detail ?? "").slice(0, 300), deviceId: dev.id,
    deviceLabel: `${labelPerangkatSekarang()}${dev.tersimpan ? "" : " (id tidak tersimpan)"}`.slice(0, 100),
    ts: serverTimestamp(), hariKe: hariKeServer(),
  };
  if (konteks.peran === "piket" && petugas) e.petugas = petugas.slice(0, 60);
  if (a.nis && /^\d{1,20}$/.test(a.nis)) e.nis = a.nis;
  const nama = namaPerangkat();
  if (nama) e.deviceNama = nama;
  u[`activity/${tgl}/${id}`] = e;
  u[`activityLast/${konteks.uid}`] = { id, ts: serverTimestamp(), tgl };
  return id;
}

const adalahPenolakan = (e: unknown) => /permission|PERMISSION_DENIED/i.test(`${(e as { code?: string })?.code ?? ""} ${(e as Error)?.message ?? ""}`);

/**
 * Kirim update. Piket: log WAJIB (rules); kegagalan apa pun diteruskan.
 * Peran lain: log bersifat tambahan; bila ditolak (mis. jam perangkat sangat salah), data utama tetap disimpan tanpa log.
 */
export async function kirimUpdate(u: Updates, opsi: { cadangan?: boolean } = {}) {
  try {
    await update(r("/"), u);
  } catch (e) {
    if (opsi.cadangan === false || konteks?.peran === "piket" || !adalahPenolakan(e) || !Object.keys(u).some((k) => k.startsWith("activity/"))) throw e;
    const tanpaLog = Object.fromEntries(Object.entries(u).filter(([k]) => !k.startsWith("activity/") && !k.startsWith("activityLast/")));
    await update(r("/"), tanpaLog); // bila ini juga ditolak, penolakan itu nyata dan dilempar
    console.warn("Log aktivitas ditolak; data tersimpan tanpa log.", e);
  }
}

/** Catat satu aktivitas tersendiri (login, logout, pilih-petugas). Tidak pernah melempar: log tidak boleh menghalangi pekerjaan. */
export async function catatAktivitas(aksi: AksiLog, detail?: string, nis?: string) {
  try {
    const u: Updates = {};
    if (!sisipkanAktivitas(u, { aksi, detail, nis })) return;
    await update(r("/"), u);
  } catch (e) { console.warn("Gagal mencatat aktivitas", e); }
}

/** Daftarkan perangkat piket (create-only) agar halaman log dapat menandai "Perangkat baru". Gagal diam-diam bila sudah terdaftar. */
const KEY_DAFTAR = "perangkat-terdaftar";
let terdaftarSesi = false;
export async function daftarkanPerangkatPiket() {
  if (konteks?.peran !== "piket") return;
  const dev = idPerangkat();
  // create-only: pendaftaran kedua pasti ditolak rules (dan memunculkan peringatan Console), jadi ingat bahwa perangkat ini sudah terdaftar
  let sudah = terdaftarSesi;
  try { sudah = sudah || localStorage.getItem(KEY_DAFTAR) === dev.id; } catch { /* penyimpanan tidak tersedia */ }
  if (sudah) return;
  const nama = namaPerangkat();
  try {
    await set(r(`piketPerangkat/${dev.id}`), { uid: konteks.uid, pertama: serverTimestamp(), label: labelPerangkatSekarang().slice(0, 100), ...(nama ? { nama } : {}) });
  } catch { /* sudah terdaftar (create-only) atau gagal: tidak masalah */ }
  terdaftarSesi = true;
  try { localStorage.setItem(KEY_DAFTAR, dev.id); } catch { /* abaikan */ }
}
