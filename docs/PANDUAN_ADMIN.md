# Panduan Admin

Untuk: Administrator / TU sekolah

## Masuk

1. Buka alamat aplikasi, pilih tab Admin.
2. Isi email dan password, lalu tekan Masuk.
3. Centang "Ingat saya" hanya di komputer sendiri.

## Memeriksa alat presensi

1. Buka menu Dashboard: lihat tulisan Online atau Offline dan jam alat terakhir terlihat.
2. Buka menu Perangkat untuk detail (WiFi, memori, antrean, versi data).
3. Alat Offline: periksa listrik dan WiFi, lalu tekan Restart di menu Perangkat.
4. Bila alat belum pulih, minta piket memakai Presensi manual (lihat SOP harian).

## Mengelola siswa dan orang tua

1. Menu Siswa: Tambah siswa, isi nama, kelas, NIS, dan UID kartu.
2. Tombol Reset PIN (ikon kunci) pada baris siswa membuat PIN orang tua baru. PIN tampil sekali: catat dan berikan ke orang tua.
3. Ikon dokumen = catat Izin, Sakit, atau Dispensasi untuk siswa itu.
4. Menu Jadwal: atur jam Masuk, Terlambat, dan Pulang (baris kelas/hari khusus mengalahkan baris "Semua"). Hari Minggu libur otomatis.

## Laporan

1. Menu Laporan, tab Rekap bulanan: pilih bulan dan kelas, lalu Unduh CSV atau Cetak.
2. Tab Log harian: semua tap pada satu tanggal, termasuk presensi manual (diberi tanda Manual beserta alasan dan petugas).
3. Persen kehadiran = (Hadir + Terlambat + Dispensasi) dibagi hari efektif.

## Akun staf (Pengaturan)

1. Menu Pengaturan, bagian Akun Pimpinan dan Staf: Tambah akun untuk Kepala, Waka, atau Guru Piket (akun piket dipakai bersama satu meja).
2. Ikon gembok pada akun Guru Piket = Kunci darurat (sesi yang sedang aktif langsung keluar). Tombol centang pada akun terkunci = Buka kunci.
3. Ikon kunci (key) = kirim email reset password. Ikon sampah = cabut akses.
4. Ganti password admin di kartu "Ganti password admin".

## Kalender akademik dan hari efektif

1. Hari efektif ditentukan oleh BUKTI: ada tap kartu atau presensi manual (ambang bawaan 1 siswa). Hari tanpa bukti (libur, alat mati seharian, sistem belum dipakai) bukan hari efektif dan siswa tidak dihitung Alpha.
2. Menu Kalender: klik tanggal, pilih Libur atau Efektif, isi alasan, lalu Simpan override. Override menang atas hitungan otomatis.
3. Override Efektif pada tanggal tanpa bukti membuat semua siswa tanpa data tercatat Alpha: isi dulu presensi manual (mode alat bermasalah), lalu centang pernyataan.
4. Kartu Ambang hari efektif: ubah angka (1 sampai 500). Kartu Hitung ulang: pilih rentang tanggal lampau lalu Hitung ulang (aman diulang).
5. Migrasi sekali jalan (admin): Periksa (dry-run), baca ringkasan, baru Terapkan migrasi. Ini mengisi ringkasan seluruh tahun ajaran dan tanggal "aktif sejak" siswa lama.

## Wali kelas

1. Menu Wali kelas: tekan Tambah wali kelas, isi nama, email asli, password sementara, lalu kelas utama dan (opsional) kelas tambahan. Satu wali boleh memegang berapa pun kelas.
2. Bila kelas yang dipilih sudah punya wali, muncul peringatan. Hanya admin yang boleh menambah wali kedua untuk kelas yang sama.
3. Cabut menutup akses tanpa menghapus akun; Pasang kembali mengaktifkannya lagi.
4. Pergantian tahun ajaran: ubah kelas utama semua wali sekaligus di kartu Wali kelas per tahun ajaran, lalu simpan satu kali. Indeks siswa-kelas ikut disinkronkan pada penyimpanan yang sama (ubah kelas siswa dulu di menu Data siswa).
5. Kartu Indeks kelas (Dashboard dan menu Wali kelas) membandingkan daftar siswa dengan indeks siswa-kelas, serta akun wali dengan cermin waliAkun. Pemeriksaan berjalan otomatis saat Dashboard dibuka.
6. Bila ada selisih, tekan Perbaiki: baca pratinjau (dry-run), lalu Terapkan perbaikan. Data dibaca ulang sebelum ditulis dan perbaikan tercatat di log aktivitas.

> Catatan: Indeks siswa-kelas dipakai aturan keamanan untuk membatasi wali pada siswa kelasnya; ia terisi otomatis saat siswa ditambah, diubah, atau dihapus.

## Log aktivitas dan backup

1. Menu Log aktivitas: pilih tanggal, lihat siapa (nama petugas yang dipilih sendiri), perangkat, dan aksinya. Perangkat baru diberi tanda.
2. Pengaturan, kartu Backup terakhir: tekan Buka Firebase Console, pilih Realtime Database, menu titik tiga, Ekspor JSON, simpan berkas di tempat aman.
3. Kembali ke aplikasi, tekan Tandai sudah backup. Lakukan tiap Sabtu.

> Catatan: Nama petugas piket dipilih sendiri; log membantu melacak lewat perangkat, bukan bukti identitas.

---
Versi singkat ini juga tersedia di aplikasi pada menu Panduan.
