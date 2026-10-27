import { endAt, get, orderByKey, query, serverTimestamp, startAt } from "firebase/database";
import {
  AMBANG_BAWAAN, BATAS_HITUNG_MUNDUR, bangunRingkasan, hitungRentang, tandaiRendah, validAmbang,
  type OverrideKalender, type PetaHari, type RingkasanHari,
} from "../lib/hariEfektif";
import type { ManualTap } from "../lib/manual";
import { addDays, tahunAjaran } from "../lib/time";
import { kirimUpdate, peranAktif, sisipkanAktivitas, tanggalServer } from "./aktivitas";
import { fb } from "../lib/firebase";
import { r } from "./db";

// Tanpa Cloud Functions: ringkasan hari efektif dihitung KLIEN STAF dan ditulis ke kalenderEfektif/{tgl} (agregat, aman dibaca orang tua).
type Updates = Record<string, unknown>;
type LogHari = Record<string, { nis: string }>;
type ManualHari = Record<string, Partial<ManualTap>>;

const sebelum = (tgl: string, n: number) => addDays(tgl, -n);
const rangeQuery = (path: string, awal: string, akhir: string) => query(r(path), orderByKey(), startAt(awal), endAt(akhir));
// Jalur per update. HARUS kelipatan 6 (6 field per tanggal): satu tanggal tidak boleh terbelah antar-update karena
// rules memvalidasi node kalenderEfektif/{tgl} utuh (efektif, tap, manual, sumber, dihitung wajib ada).
const BATCH = 198;

export async function bacaAmbang(): Promise<number> {
  const v = (await get(r("sistem/ambangHariEfektif")).catch(() => null))?.val();
  return validAmbang(v) ? v : AMBANG_BAWAAN;
}

/** Ringkasan yang sudah tersimpan pada rentang (dipakai sebagai pembanding `rendah` dan untuk melewati yang sama). */
export async function bacaRingkasan(awal: string, akhir: string): Promise<PetaHari> {
  return ((await get(rangeQuery("kalenderEfektif", awal, akhir))).val() ?? {}) as PetaHari;
}

/**
 * Data mentah per tanggal. Peran piket tidak boleh membaca seluruh `log` (hanya per tanggal): dibaca satu per satu.
 * Peran lain memakai query rentang kunci (orderByKey().startAt().endAt()), BUKAN mengunduh seluruh node.
 */
async function bacaBukti(tanggal: string[]) {
  const urut = [...tanggal].sort();
  const awal = urut[0], akhir = urut[urut.length - 1];
  const log: Record<string, LogHari | null> = {};
  const manual: Record<string, ManualHari | null> = {};
  if (peranAktif() === "piket") {
    await Promise.all(urut.map(async (t) => { log[t] = ((await get(r(`log/${t}`))).val() ?? null) as LogHari | null; }));
  } else {
    const semua = ((await get(rangeQuery("log", awal, akhir))).val() ?? {}) as Record<string, LogHari>;
    for (const t of urut) log[t] = semua[t] ?? null;
  }
  const m = ((await get(rangeQuery("manualTap", awal, akhir)).catch(() => null))?.val() ?? {}) as Record<string, ManualHari>;
  for (const t of urut) manual[t] = m[t] ?? null;
  const ov = ((await get(rangeQuery("kalender", awal, akhir))).val() ?? {}) as Record<string, OverrideKalender>;
  return { log, manual, override: ov };
}

const sama = (a: RingkasanHari | undefined, b: RingkasanHari) =>
  Boolean(a) && a!.efektif === b.efektif && a!.tap === b.tap && a!.manual === b.manual && a!.sumber === b.sumber && Boolean(a!.rendah) === Boolean(b.rendah);

/** Tulis ringkasan per-field (agar penanda `normal` waka tidak tertimpa). `dihitung` hanya diperbarui bila ada perubahan. */
function sisipkanRingkasan(u: Updates, tgl: string, x: RingkasanHari) {
  const p = `kalenderEfektif/${tgl}`;
  u[`${p}/efektif`] = x.efektif;
  u[`${p}/tap`] = x.tap;
  u[`${p}/manual`] = x.manual;
  u[`${p}/sumber`] = x.sumber;
  u[`${p}/rendah`] = x.rendah ? true : null;
  u[`${p}/dihitung`] = serverTimestamp();
}

async function tulisPerBatch(u: Updates, aksi: "hitung-kalender" | "migrasi-kalender", detail: string) {
  const items = Object.entries(u);
  for (let i = 0; i < items.length; i += BATCH) {
    const bagian: Updates = Object.fromEntries(items.slice(i, i + BATCH));
    // migrasi: SETIAP update memuat log (rules mewajibkan log untuk penulisan profiles/{nis}/aktifSejak dan penanda migrasi); hitung biasa: log di update pertama
    if (i === 0 || aksi === "migrasi-kalender") sisipkanAktivitas(bagian, { aksi, detail });
    await kirimUpdate(bagian);
  }
}

export type HasilHitung = { tanggal: string; lama?: RingkasanHari; baru: RingkasanHari; berubah: boolean };

/**
 * Hitung ulang ringkasan untuk daftar tanggal (idempoten & deterministik dari data). Override tidak pernah ditimpa
 * (override dibaca dan menentukan hasil). `dry` = hanya menghitung. Mengembalikan hasil per tanggal.
 */
export async function hitungTanggal(tanggal: string[], opsi: { dry?: boolean; aksi?: "hitung-kalender" | "migrasi-kalender" } = {}): Promise<HasilHitung[]> {
  if (tanggal.length === 0) return [];
  const urut = [...tanggal].sort();
  const [ambang, bukti, ada] = await Promise.all([bacaAmbang(), bacaBukti(urut), bacaRingkasan(sebelum(urut[0], 45), urut[urut.length - 1])]);
  const baru = hitungRentang({ tanggal: urut, peta: ada, override: bukti.override, log: bukti.log, manual: bukti.manual, ambang });
  const hasil: HasilHitung[] = urut.map((t) => ({ tanggal: t, lama: ada[t], baru: baru[t], berubah: !sama(ada[t], baru[t]) }));
  if (!opsi.dry) {
    const u: Updates = {};
    for (const h of hasil) if (h.berubah) sisipkanRingkasan(u, h.tanggal, h.baru);
    if (Object.keys(u).length) await tulisPerBatch(u, opsi.aksi ?? "hitung-kalender", `Hitung hari efektif ${urut[0]}..${urut[urut.length - 1]}: ${hasil.filter((h) => h.berubah).length} tanggal diperbarui`);
  }
  return hasil;
}

const rentangTanggal = (awal: string, akhir: string) => { const o: string[] = []; for (let d = awal; d <= akhir; d = addDays(d, 1)) o.push(d); return o; };

/** Tombol "Hitung ulang" (admin/waka) untuk rentang pilihan. */
export const hitungUlang = (awal: string, akhir: string, dry = false) => hitungTanggal(rentangTanggal(awal, akhir), { dry });

/** Otomatis saat staf membuka dashboard: kemarin dan hari-hari sebelumnya (maks. 31 hari) yang BELUM punya ringkasan. */
export async function hitungOtomatis(hariIni: string): Promise<number> {
  const awal = sebelum(hariIni, BATAS_HITUNG_MUNDUR), kemarin = sebelum(hariIni, 1);
  const ada = await bacaRingkasan(awal, kemarin);
  const belum = rentangTanggal(awal, kemarin).filter((t) => !ada[t]);
  if (belum.length === 0) return 0;
  const hasil = await hitungTanggal(belum);
  return hasil.filter((h) => h.berubah).length;
}

/**
 * Hari ini: ditulis saat status efektif BERUBAH (ambang tercapai) agar orang tua melihatnya cepat; setelah jam pulang (`lewatPulang`)
 * juga saat jumlah berubah, lengkap dengan penanda `rendah`. `tap`/`manual` dari data langganan klien (log & manualTap hari ini).
 */
export async function perbaruiHariIni(a: { tanggal: string; tap: number; manual: number; override?: OverrideKalender | null; tersimpan?: RingkasanHari | null; lewatPulang: boolean; ambang: number }) {
  const x = bangunRingkasan({ tanggal: a.tanggal, override: a.override, log: Object.fromEntries(Array.from({ length: a.tap }, (_, i) => [`x${i}_M`, { nis: `n${i}` }])), manual: Object.fromEntries(Array.from({ length: a.manual }, (_, i) => [`m${i}`, { masuk: "00:00:00" }])), ambang: a.ambang });
  const t = a.tersimpan;
  if (!t || t.efektif !== x.efektif || t.sumber !== x.sumber) {
    // status berubah / belum ada: tulis sekarang (rendah dinilai hanya setelah jam pulang agar hitungan sebagian tidak salah tanda)
    const u: Updates = {};
    sisipkanRingkasan(u, a.tanggal, { ...x, ...(t?.rendah ? { rendah: true } : {}) });
    sisipkanAktivitas(u, { aksi: "hitung-kalender", detail: `Hari ini ${a.tanggal}: ${x.efektif ? "efektif" : "belum efektif"} (tap ${x.tap}, manual ${x.manual})` });
    await kirimUpdate(u);
    return true;
  }
  if (!a.lewatPulang) return false;
  const peta = await bacaRingkasan(sebelum(a.tanggal, 45), sebelum(a.tanggal, 1));
  const rendah = tandaiRendah(a.tanggal, x, peta);
  const akhir: RingkasanHari = { ...x, ...(rendah ? { rendah: true } : {}) };
  if (sama(t, akhir)) return false;
  const u: Updates = {};
  sisipkanRingkasan(u, a.tanggal, akhir);
  sisipkanAktivitas(u, { aksi: "hitung-kalender", detail: `Hari ini ${a.tanggal} setelah jam pulang: tap ${x.tap}, manual ${x.manual}${rendah ? " (tap rendah)" : ""}` });
  await kirimUpdate(u);
  return true;
}

// ---------------------------------------------------------------------------------------------- override
async function ringkasanDenganOverride(tgl: string, ov: OverrideKalender | null): Promise<RingkasanHari> {
  const [ambang, bukti, ada] = await Promise.all([bacaAmbang(), bacaBukti([tgl]), bacaRingkasan(sebelum(tgl, 45), sebelum(tgl, 1))]);
  return hitungRentang({ tanggal: [tgl], peta: ada, override: { [tgl]: ov ?? undefined }, log: bukti.log, manual: bukti.manual, ambang })[tgl];
}

/** Atur override libur/efektif + perbarui ringkasan tanggal itu dalam SATU update (rules mewajibkan konsistensi). */
export async function simpanOverride(tgl: string, status: "libur" | "efektif", alasan: string) {
  const a = alasan.trim();
  if (a.length < 3 || a.length > 200) throw new Error("Alasan wajib diisi (3–200 karakter).");
  if (tgl > addDays(tanggalServer(), 366)) throw new Error("Tanggal terlalu jauh ke depan.");
  const ov: OverrideKalender = { status, alasan: a };
  const x = await ringkasanDenganOverride(tgl, ov);
  const uid = fb().auth.currentUser?.uid;
  if (!uid) throw new Error("Sesi tidak valid. Silakan login ulang.");
  const u: Updates = { [`kalender/${tgl}`]: { status, alasan: a, oleh: uid, ts: serverTimestamp() } };
  sisipkanRingkasan(u, tgl, x);
  sisipkanAktivitas(u, { aksi: "atur-kalender", detail: `${tgl}: ${status} — ${a}` });
  await kirimUpdate(u);
}

export async function hapusOverride(tgl: string) {
  const x = await ringkasanDenganOverride(tgl, null);
  const u: Updates = { [`kalender/${tgl}`]: null };
  sisipkanRingkasan(u, tgl, x);
  sisipkanAktivitas(u, { aksi: "hapus-kalender", detail: `Hapus override ${tgl}` });
  await kirimUpdate(u);
}

/** "Konfirmasi hari ini normal": melepas penahanan validasi Alfa & saran Alfa pada hari ber-tap rendah. */
export async function konfirmasiNormal(tgl: string) {
  const u: Updates = { [`kalenderEfektif/${tgl}/normal`]: true };
  sisipkanAktivitas(u, { aksi: "normal-kalender", detail: `Konfirmasi ${tgl} normal (tap rendah dianggap wajar)` });
  await kirimUpdate(u);
}

export async function simpanAmbang(n: number) {
  if (!validAmbang(n)) throw new Error("Ambang harus bilangan bulat 1–500.");
  const u: Updates = { "sistem/ambangHariEfektif": n };
  sisipkanAktivitas(u, { aksi: "ambang-kalender", detail: `Ambang hari efektif = ${n}` });
  await kirimUpdate(u);
}

// ---------------------------------------------------------------------------------------------- migrasi sekali jalan (waka/kepala)
export type HasilMigrasi = { dari: string; sampai: string; hari: number; efektif: number; rendah: number; diperbarui: number; aktifSejakDiisi: number; aktifSejak: string | null };

/**
 * Hitung kalenderEfektif untuk SELURUH tahun ajaran berjalan dari data yang ada + isi `aktifSejak` siswa lama
 * (= tanggal efektif pertama). `dry` (bawaan) hanya meringkas, tidak menulis.
 */
export async function migrasiKalender(hariIni: string, dry = true): Promise<HasilMigrasi> {
  const dari = `${tahunAjaran(hariIni)}-07-01`, sampai = sebelum(hariIni, 1);
  const semuaTgl = rentangTanggal(dari, sampai);
  const [ambang] = await Promise.all([bacaAmbang()]);
  const peta: PetaHari = {};
  let diperbarui = 0;
  const ditulis: Updates = {};
  const ada = await bacaRingkasan(dari, sampai);
  // per bulan agar unduhan log wajar
  for (let i = 0; i < semuaTgl.length; i += 31) {
    const potong = semuaTgl.slice(i, i + 31);
    const bukti = await bacaBukti(potong);
    const hasil = hitungRentang({ tanggal: potong, peta: { ...ada, ...peta }, override: bukti.override, log: bukti.log, manual: bukti.manual, ambang });
    for (const t of potong) {
      peta[t] = hasil[t];
      if (!sama(ada[t], hasil[t])) { diperbarui++; sisipkanRingkasan(ditulis, t, hasil[t]); }
    }
  }
  const tanggalEfektif = semuaTgl.filter((t) => peta[t]?.efektif);
  const pertama = tanggalEfektif[0] ?? null;
  const profil = ((await get(r("profiles")).catch(() => null))?.val() ?? {}) as Record<string, { aktifSejak?: string }>;
  const belumAktif = pertama ? Object.entries(profil).filter(([, p]) => !p?.aktifSejak).map(([nis]) => nis) : [];
  if (!dry) {
    for (const nis of belumAktif) ditulis[`profiles/${nis}/aktifSejak`] = pertama;
    // penanda "sudah dijalankan" (sekali tulis; di batch TERAKHIR agar hanya ada bila semua batch sebelumnya berhasil)
    const uid = fb().auth.currentUser?.uid;
    if (uid) ditulis["sistem/migrasiKalender"] = { oleh: uid, ts: serverTimestamp(), dari, sampai };
    if (Object.keys(ditulis).length) await tulisPerBatch(ditulis, "migrasi-kalender", `Migrasi kalender ${dari}..${sampai}: ${diperbarui} tanggal, aktifSejak ${belumAktif.length} siswa`);
  }
  return { dari, sampai, hari: semuaTgl.length, efektif: tanggalEfektif.length, rendah: semuaTgl.filter((t) => peta[t]?.rendah).length, diperbarui, aktifSejakDiisi: belumAktif.length, aktifSejak: pertama };
}
