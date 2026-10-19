# Analisis: kunci tap pertama (v2.4-a) dan dampaknya pada firmware ESP32 v12

> Firmware **tidak ada di repositori ini** dan **tidak diubah**. Analisis di bawah berdasarkan perilaku jalur tulis alat yang diuji
> di `tests/rules.test.mjs` (blok "ALAT — jalur firmware v12") dan klasifikasi respons yang dilaporkan untuk firmware v12
> (penolakan = `DITOLAK` → dicatat ke `/ditolak.jsonl`, tidak dicoba ulang tanpa batas). **Wajib diverifikasi di perangkat fisik** (daftar di CARA-DEPLOY v2.4).

## Apa yang berubah di Security Rules
| Node | Aturan baru untuk alat (`device`) |
|---|---|
| `attendance/{nis}/{tgl}/masuk`, `/status`, `/pulang` | boleh ditulis bila **belum ada** ATAU **nilainya identik** dengan yang tersimpan |
| `log/{tgl}/{uid}_M`, `/{uid}_P` | boleh ditulis bila **belum ada** ATAU `jam`, `nis`, `status` **identik** (field lain seperti `nama`/`kelas` tidak dibandingkan) |

Tidak berubah: membuat node `attendance/{nis}/{tgl}` baru secara utuh, `unknown/*`, `device/*`, pembacaan, dan hak admin. Alat tetap tidak dapat menghapus.

## Perilaku yang diharapkan
| Kejadian | Hasil |
|---|---|
| Tap pertama hari itu | diterima |
| Retry dari antrian setelah WiFi putus (payload identik) | diterima (idempoten) |
| Tap kedua hari yang sama, jam/status berbeda | **seluruh permintaan ditolak** (`permission_denied`); tap pertama tetap |
| Tap pertama hari berikutnya / siswa lain | tidak terpengaruh |

## Dampak pada firmware v12 (perlu dikonfirmasi di alat)
1. **Penolakan per permintaan, bukan per node.** Bila alat mengirim `attendance` + `log` dalam **satu PATCH multi-path** (seperti uji `fw:` di rules.test), tap kedua menolak **seluruh** PATCH itu. Itu yang diinginkan untuk tap duplikat.
2. **Risiko utama — antrian yang digabung (batch).** Jika firmware menggabungkan **beberapa siswa** dalam satu PATCH saat mengosongkan antrian, satu tap duplikat membuat **seluruh batch** ditolak dan semua entri di dalamnya ikut `DITOLAK`. Periksa apakah v12 mengirim **satu PATCH per tap**. Bila ternyata batch, jangan deploy sebelum pengiriman diubah per tap (perubahan firmware butuh persetujuan Anda; tidak dilakukan di sini).
3. **Klasifikasi `DITOLAK` tidak boleh memblokir antrian lain.** Respons `permission_denied` harus membuang entri itu dan lanjut ke entri berikutnya (bukan mengulang tanpa henti). Uji fisik: tap kedua, lalu pastikan tap siswa lain berikutnya tetap terkirim.
4. **LCD alat.** Alat dapat tetap menampilkan "Terlambat" (atau status lain) untuk tap kedua karena keputusan ada di klien; **status resmi mengikuti web** (bukti hadir paling awal). Beri tahu petugas piket agar tidak berpegang pada layar alat.
5. **`/ditolak.jsonl` akan berisi tap duplikat.** Ini bukan galat sistem; jumlahnya wajar bertambah. Jangan menafsirkannya sebagai gangguan jaringan.
6. Alat yang jam internalnya salah tidak dapat lagi "memperbaiki" tap lewat tap ulang; koreksi lewat admin (satu-satunya jalur selain alat yang masih boleh menulis `attendance`) atau lewat Presensi manual waka.

## Hubungan dengan aturan status harian (web)
- Jam masuk resmi = **bukti paling awal** antara tap alat pertama dan presensi manual. Kunci tap pertama menjamin tap alat pertama **tidak bergeser** oleh tap kedua; presensi manual yang lebih awal tetap menang di sisi web.
- Karena alat hanya menyimpan tap pertama, "tap alat 07:40 setelah manual 07:05" tampil di web sebagai info gabung ("Tap alat 07:40 setelah presensi manual 07:05").

## Uji fisik wajib (ringkas; daftar lengkap di CARA-DEPLOY v2.4)
1. Tap masuk normal → tercatat.
2. Tap kedua kartu yang sama → ditolak; tap siswa lain setelahnya tetap masuk; tidak ada antrian macet.
3. Putus WiFi, tap, sambungkan lagi → antrian terkirim (retry identik lolos); tidak ada entri ganda.
