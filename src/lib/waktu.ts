// Penentuan "hari ini" berbasis jam SERVER (fungsi murni). Jam perangkat staf bisa salah (baterai CMOS, zona waktu manual, dsb.), sedangkan
// Security Rules dan semua log memakai jam server. Selisih server - perangkat = `.info/serverTimeOffset` (ms).
// Server = perangkat + selisih; hari WIB = tanggal pada UTC+7.
export const WIB_MS = 7 * 3_600_000;
/** Selisih (menit) di atas ini dianggap jam perangkat TIDAK sesuai dan memunculkan peringatan. */
export const BATAS_SELISIH_MENIT = 5;

const bilangan = (x: number) => (Number.isFinite(x) ? x : 0);

/** Waktu server (epoch ms) dari jam perangkat dan selisih server. */
export const waktuServerDari = (perangkatMs: number, selisihMs: number) => perangkatMs + bilangan(selisihMs);

/** Tanggal WIB (YYYY-MM-DD) menurut server. */
export const tanggalServerDari = (perangkatMs: number, selisihMs: number) =>
  new Date(waktuServerDari(perangkatMs, selisihMs) + WIB_MS).toISOString().slice(0, 10);

/** Besar selisih jam perangkat terhadap server, dalam menit (dibulatkan). */
export const selisihMenit = (selisihMs: number) => Math.round(Math.abs(bilangan(selisihMs)) / 60_000);

/** Jam perangkat dianggap tidak sesuai bila selisih > batas menit. */
export const jamPerangkatBeda = (selisihMs: number, batasMenit = BATAS_SELISIH_MENIT) => selisihMenit(selisihMs) > batasMenit;

/** Teks peringatan untuk banner. */
export const pesanJamBeda = (selisihMs: number) =>
  `Jam perangkat Anda tidak sesuai (selisih ${selisihMenit(selisihMs)} menit). Tanggal mengikuti server.`;
