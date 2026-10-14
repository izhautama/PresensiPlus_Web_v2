// Tanggal uji E2E relatif terhadap HARI NYATA (WIB), bukan konstanta.
// Alasan: Security Rules membandingkan tulisan piket dengan `now` server emulator (jam nyata); jam browser hanya dipalsukan
// untuk tampilan. Bila tanggal skenario tetap, uji piket gagal begitu hari nyata bergeser dari tanggal itu.
// Syarat skenario: "hari ini" bukan Minggu dan "kemarin" juga bukan Minggu (Selasa..Sabtu). Bila hari nyata Minggu/Senin,
// jangkar mundur ke Sabtu (masih dalam jendela piket bawaan 2 hari).

const HARI_MS = 86_400_000;
const WIB = 7 * 3_600_000;
const iso = (hariKe) => new Date(hariKe * HARI_MS).toISOString().slice(0, 10);
const hariKeDari = (ms) => Math.floor((ms + WIB) / HARI_MS);
const weekdayDari = (hariKe) => (hariKe + 4) % 7; // 1970-01-01 = Kamis (4); 0 = Minggu

export function hitungTanggal(sekarangMs = Date.now()) {
  let h = hariKeDari(sekarangMs);
  const wd = weekdayDari(h);
  if (wd === 0) h -= 1; // Minggu -> Sabtu
  else if (wd === 1) h -= 2; // Senin -> Sabtu (kemarin = Minggu tidak cocok sebagai skenario "Selasa")
  const wdJangkar = weekdayDari(h); // 2..6
  const minggu = h + (7 - wdJangkar);
  // Minggu di BULAN YANG SAMA dengan jangkar (untuk uji laporan per jam bulanan) + satu hari kerja bertetangga di bulan itu
  const bulan = (hk) => iso(hk).slice(0, 7);
  const mingguBulanIni = bulan(minggu) === bulan(h) ? minggu : minggu - 7;
  const tetangga = bulan(mingguBulanIni + 1) === bulan(mingguBulanIni) ? mingguBulanIni + 1 : mingguBulanIni - 1;
  return {
    mingguBulanIni: iso(mingguBulanIni), hariKerjaSekitarMinggu: iso(tetangga),
    hariIni: iso(h), kemarin: iso(h - 1), besok: iso(h + 1), minggu: iso(minggu),
    min: iso(h - 2), max: iso(h + 7), jauh: iso(h + 9),
    waktu: new Date(h * HARI_MS + 9 * 3_600_000), // 16:00 WIB = 09:00 UTC pada tanggal jangkar
    waktuMinggu: new Date(minggu * HARI_MS + 9 * 3_600_000),
  };
}

/** Tanggal WIB menurut jam NYATA (bukan jam palsu browser): kunci `activity/{tgl}` ditulis berdasarkan waktu server. */
export const hariNyata = (ms = Date.now()) => new Date(ms + WIB).toISOString().slice(0, 10);
