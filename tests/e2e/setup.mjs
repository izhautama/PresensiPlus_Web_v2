// Persiapan E2E: muat rules, buat akun uji (Auth emulator), isi data awal (RTDB emulator) untuk SETIAP project
// (desktop & mobile punya namespace + server Vite sendiri agar data tidak saling bercampur). Hanya ke emulator lokal.
import { readFileSync } from "node:fs";
import { hitungTanggal } from "./tanggal.mjs";

export const T = hitungTanggal();

const DB = "http://127.0.0.1:9000";
const AUTH = "http://127.0.0.1:9099";
const OWNER = { Authorization: "Bearer owner" };
export const PASSWORD = "password-uji-123";

/** Satu entri per project Playwright. `ver` = versi akun orang tua (email 111.<ver>@ortu...) agar unik di Auth emulator bersama. */
export const PROJECTS = {
  desktop: { ns: "e2e-desktop-default-rtdb", port: 5199, ver: 1 },
  mobile: { ns: "e2e-mobile-default-rtdb", port: 5198, ver: 2 },
};

async function buatUser(email, password = PASSWORD) {
  const res = await fetch(`${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password, returnSecureToken: true }),
  });
  const j = await res.json();
  if (!j.localId) throw new Error(`gagal membuat ${email}: ${JSON.stringify(j)}`);
  return j.localId;
}

const M = (uid, nis, jam, status = "Hadir") => ({ [`${uid}_M`]: { jam, nis, status } });
const Pl = (uid, nis, jam) => ({ [`${uid}_P`]: { jam, nis, status: "Pulang" } });

async function siapkan(nama, { ns, ver }) {
  const rules = readFileSync(process.env.RULES_FILE ?? new URL("../../database.rules.json", import.meta.url), "utf8"); // RULES_FILE: hanya untuk uji detektor
  const r = await fetch(`${DB}/.settings/rules.json?ns=${ns}`, { method: "PUT", headers: OWNER, body: rules });
  if (!r.ok) throw new Error(`gagal memuat rules (${nama}): ${r.status}`);

  const id = {
    admin: await buatUser(`admin.${nama}@e2e.test`),
    waka: await buatUser(`waka.${nama}@e2e.test`),
    kepala: await buatUser(`kepala.${nama}@e2e.test`),
    piket: await buatUser(`piket.${nama}@e2e.test`),
    ortu1: await buatUser(`111.${ver}@ortu.presensi-ma.local`, "482915"),
    ortu2: await buatUser(`222.${ver}@ortu.presensi-ma.local`, "739104"),
  };
  const now = Date.now();
  const siswa = {
    AAAA1111: { nis: "111", nama: "ANDI TEST", kelas: "XI IPS" },
    BBBB2222: { nis: "222", nama: "BUDI TEST", kelas: "XI IPS" },
    CCCC3333: { nis: "333", nama: "CITRA TEST", kelas: "X IPA" },
    DDDD4444: { nis: "444", nama: "DINA TEST", kelas: "X IPA" },
    EEEE5555: { nis: "555", nama: "EKO TEST", kelas: "X IPA" },
    FFFF6666: { nis: "666", nama: "FANI TEST", kelas: "X IPA" },
    GGGG7777: { nis: "777", nama: "GITA TEST", kelas: "X IPA" },
  };
  // ---- skenario saran (Selasa 2026-10-13)
  //  ANDI : terlambat 07:30, tanpa tap pulang          -> saran terlambat + tanpaTapPulang
  //  BUDI : hadir + pulang, sel A jam 2 (Matematika)   -> saran bolosJam
  //  CITRA: hadir tanpa tap pulang, tetapi sel S jam 6 -> TIDAK ada saran (izin pulang awal)
  //  DINA : hadir tanpa tap pulang, ket harian Sakit   -> TIDAK ada saran
  //  EKO  : Alfa terverifikasi                         -> TIDAK ada saran (autoMap.alfa kosong)
  //  FANI, GITA: terlambat + pulang                    -> saran terlambat (untuk uji massal)
  const log13 = {
    ...M("AAAA1111", "111", "07:30:00", "Terlambat"),
    ...M("BBBB2222", "222", "07:00:00"), ...Pl("BBBB2222", "222", "15:00:00"),
    ...M("CCCC3333", "333", "07:00:00"),
    ...M("DDDD4444", "444", "07:00:00"),
    ...M("FFFF6666", "666", "07:20:00", "Terlambat"), ...Pl("FFFF6666", "666", "15:00:00"),
    ...M("GGGG7777", "777", "07:25:00", "Terlambat"), ...Pl("GGGG7777", "777", "15:00:00"),
  };
  // Rabu 2026-10-14: siswa X IPA hadir lengkap (tidak masuk daftar validasi/saran); ANDI & BUDI sengaja tidak tap
  const log14 = {};
  for (const [uid, nis] of [["CCCC3333", "333"], ["DDDD4444", "444"], ["EEEE5555", "555"], ["FFFF6666", "666"], ["GGGG7777", "777"]]) Object.assign(log14, M(uid, nis, "07:00:00"), Pl(uid, nis, "15:00:00"));
  // Minggu 2026-10-18 (libur): data sengaja ada -> HARUS diabaikan (tidak ada saran, tidak ada daftar belum tap)
  const log18 = { ...M("AAAA1111", "111", "07:30:00", "Terlambat"), ...M("BBBB2222", "222", "07:00:00") };

  const seed = {
    roles: { [id.admin]: "admin", [id.waka]: "waka", [id.kepala]: "kepala", [id.piket]: "piket" },
    staff: {
      [id.waka]: { email: `waka.${nama}@e2e.test`, nama: "Waka Uji", role: "waka", dibuat: now },
      [id.kepala]: { email: `kepala.${nama}@e2e.test`, nama: "Kepala Uji", role: "kepala", dibuat: now },
      [id.piket]: { email: `piket.${nama}@e2e.test`, nama: "Meja Piket", role: "piket", dibuat: now },
    },
    parents: { 111: { ver, uid: id.ortu1 }, 222: { ver, uid: id.ortu2 } },
    config: { version: 1, students: siswa },
    profiles: Object.fromEntries(Object.values(siswa).map((s) => [s.nis, { nama: s.nama, kelas: s.kelas }])),
    // ringkasan hari efektif (agregat) untuk hari-hari ber-tap pada seed; hari lain dihitung otomatis oleh klien staf saat Dashboard dibuka
    kalenderEfektif: {
      [T.kemarin]: { efektif: true, tap: 6, manual: 0, sumber: "otomatis", dihitung: now },
      [T.hariIni]: { efektif: true, tap: 5, manual: 0, sumber: "otomatis", dihitung: now },
      [T.minggu]: { efektif: false, tap: 2, manual: 0, sumber: "otomatis", dihitung: now }, // Minggu: libur walau ada tap
    },
    piketAkun: { [id.piket]: { email: `piket.${nama}@e2e.test`, nama: "Meja Piket", terkunci: false } },
    piketRoster: { p1: { nama: "Bu Rina", aktif: true }, p2: { nama: "Pak Joko", aktif: false } },
    device: { status: { lastSeen: now, firmware: "e2e", rfid: true, ntp: true } },
    log: { [T.kemarin]: log13, [T.hariIni]: log14, [T.minggu]: log18 },
    izin: { [T.kemarin]: { 444: "Sakit" } },
    validasi: { [T.kemarin]: { 555: { status: "Alfa", oleh: id.waka, ts: now } }, [T.minggu]: { 555: { status: "Alfa", oleh: id.waka, ts: now } } },
    lessons: {
      [T.kemarin]: {
        "XI IPS": { meta: { 2: { mapel: "Matematika" } }, absen: { 222: { 2: "A" } }, oleh: id.waka, ts: now },
        "X IPA": { absen: { 333: { 6: "S" } }, oleh: id.waka, ts: now },
      },
      // Uji laporan per jam: hari Minggu HARUS diabaikan (333 jam 1-3 Alfa & 555 jam 1 Alfa di hari Minggu); 333 jam 2 Dispensasi di hari kerja
      [T.mingguBulanIni]: { "X IPA": { meta: { 1: { mapel: "Fikih" } }, absen: { 333: { 1: "A", 2: "A", 3: "A" }, 555: { 1: "A" } }, oleh: id.waka, ts: now } },
      [T.hariKerjaSekitarMinggu]: { "X IPA": { absen: { 333: { 2: "D" } }, oleh: id.waka, ts: now } },
    },
  };
  const put = await fetch(`${DB}/.json?ns=${ns}`, { method: "PUT", headers: OWNER, body: JSON.stringify(seed) });
  if (!put.ok) throw new Error(`gagal mengisi data awal (${nama}): ${put.status} ${await put.text()}`);
  console.log(`[e2e] data awal siap: ${nama} (ns ${ns})`);
}

export default async function setup() {
  for (const [nama, cfg] of Object.entries(PROJECTS)) await siapkan(nama, cfg);
}
