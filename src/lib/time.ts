/** Semua tanggal & jam aplikasi memakai WIB, apa pun zona waktu perangkat pengguna. */
export const TZ = "Asia/Jakarta";
export const HARI = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
export const BULAN = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];

/** "YYYY-MM-DD" hari ini di WIB. */
export function todayWIB(now = new Date()): string {
  return now.toLocaleDateString("en-CA", { timeZone: TZ });
}

/** "HH:MM" sekarang di WIB. */
export function nowHM(now = new Date()): string {
  return now.toLocaleTimeString("en-GB", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hour12: false });
}

export function hourWIB(now = new Date()): number {
  return Number(now.toLocaleString("en-GB", { timeZone: TZ, hour: "2-digit", hour12: false }));
}

/** Parse "YYYY-MM-DD" sebagai tanggal kalender (UTC tengah hari, aman dari geser zona). */
export function parseISO(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12));
}

export function toISO(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function addDays(s: string, n: number): string {
  const d = parseISO(s);
  d.setUTCDate(d.getUTCDate() + n);
  return toISO(d);
}

/** 0 = Minggu ... 6 = Sabtu */
export function weekday(s: string): number {
  return parseISO(s).getUTCDay();
}

export function namaHari(s: string): string {
  return HARI[weekday(s)];
}

export function formatTanggal(s: string, withDay = true): string {
  const d = parseISO(s);
  const t = `${d.getUTCDate()} ${BULAN[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
  return withDay ? `${HARI[d.getUTCDay()]}, ${t}` : t;
}

export function monthKey(s: string): string {
  return s.slice(0, 7);
}

export function monthLabel(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  return `${BULAN[m - 1]} ${y}`;
}

export function lastDayOfMonth(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  return toISO(new Date(Date.UTC(y, m, 0, 12)));
}

/** Tahun ajaran mulai Juli: Okt 2026 -> 2026, Mar 2026 -> 2025. */
export function tahunAjaran(s: string): number {
  const [y, m] = s.split("-").map(Number);
  return m >= 7 ? y : y - 1;
}

export function salam(now = new Date()): string {
  const h = hourWIB(now);
  if (h < 11) return "Selamat pagi";
  if (h < 15) return "Selamat siang";
  if (h < 18) return "Selamat sore";
  return "Selamat malam";
}

export function relatif(ms: number, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - ms) / 1000));
  if (s < 60) return `${s} detik lalu`;
  if (s < 3600) return `${Math.floor(s / 60)} menit lalu`;
  if (s < 86400) return `${Math.floor(s / 3600)} jam lalu`;
  return `${Math.floor(s / 86400)} hari lalu`;
}

export function jamDariMs(ms: number): string {
  return new Date(ms).toLocaleTimeString("en-GB", { timeZone: TZ, hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
}

/** Hari kerja (bukan Minggu) terakhir sebelum `tanggal`: Senin -> Sabtu (jendela "kemarin" untuk saran/tinjauan). */
export function hariKerjaSebelum(tanggal: string): string {
  const k = addDays(tanggal, -1);
  return weekday(k) === 0 ? addDays(k, -1) : k;
}
