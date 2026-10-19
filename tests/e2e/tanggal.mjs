// Tanggal uji E2E relatif terhadap HARI NYATA (WIB).
// Aplikasi staf memakai jam SERVER untuk "hari ini", dan Security Rules membandingkan hariKe log aktivitas dengan `now` server emulator
// (jam nyata). Karena itu hari skenario HARUS hari nyata; hanya JAM (16:00 WIB) yang dipatok lewat jabat tangan RTDB (lihat siapkan()).
// Syarat skenario: "hari ini" bukan Minggu, dan "kemarin" adalah hari kerja sebelumnya (Senin: kemarin = Sabtu, masih dalam jendela piket 2 hari).
// Pada hari nyata Minggu skenario hari kerja TIDAK dapat dijalankan (libur): uji ditandai dilewati dengan pesan jelas (`dapatDijalankan` = false).

const HARI_MS = 86_400_000;
const WIB = 7 * 3_600_000;
const iso = (hariKe) => new Date(hariKe * HARI_MS).toISOString().slice(0, 10);
const hariKeDari = (ms) => Math.floor((ms + WIB) / HARI_MS);
const weekdayDari = (hariKe) => (hariKe + 4) % 7; // 1970-01-01 = Kamis (4); 0 = Minggu

export function hitungTanggal(sekarangMs = Date.now()) {
  const h = hariKeDari(sekarangMs); // hari nyata (WIB)
  const dapatDijalankan = weekdayDari(h) !== 0;
  const kemarinHk = weekdayDari(h - 1) === 0 ? h - 2 : h - 1; // lewati Minggu
  const wdJangkar = weekdayDari(h);
  const minggu = h + ((7 - wdJangkar) % 7 || 7); // Minggu berikutnya (setelah hari ini)
  // Minggu di BULAN YANG SAMA dengan hari ini (untuk uji laporan per jam bulanan) + satu hari kerja bertetangga di bulan itu
  const bulan = (hk) => iso(hk).slice(0, 7);
  const mingguBulanIni = bulan(minggu) === bulan(h) ? minggu : minggu - 7;
  const tetangga = bulan(mingguBulanIni + 1) === bulan(mingguBulanIni) ? mingguBulanIni + 1 : mingguBulanIni - 1;
  return {
    dapatDijalankan,
    mingguBulanIni: iso(mingguBulanIni), hariKerjaSekitarMinggu: iso(tetangga),
    hariIni: iso(h), kemarin: iso(kemarinHk), besok: iso(h + 1), minggu: iso(minggu),
    min: iso(h - 2), max: iso(h + 7), jauh: iso(h + 9),
    waktu: new Date(h * HARI_MS + 9 * 3_600_000), // 16:00 WIB = 09:00 UTC pada hari nyata
    waktuMinggu: new Date(minggu * HARI_MS + 9 * 3_600_000),
  };
}

/** Tanggal WIB menurut jam NYATA. */
export const hariNyata = (ms = Date.now()) => new Date(ms + WIB).toISOString().slice(0, 10);
