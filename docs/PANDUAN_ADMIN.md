# Panduan Admin

Untuk: Administrator / TU sekolah

## Masuk

1. Buka alamat aplikasi, pilih tab Admin.
2. Isi email dan password, lalu tekan Masuk.
3. Centang "Ingat saya" hanya di komputer sendiri.

## Memeriksa alat presensi

1. Dashboard: lihat Online atau Offline dan jam terakhir alat terlihat.
2. Menu Perangkat: detail WiFi, memori, antrean.
3. Alat Offline: periksa listrik dan WiFi, lalu tekan Restart di menu Perangkat.
4. Bila belum pulih, minta piket memakai Presensi manual.

## Mengelola siswa dan orang tua

1. Menu Siswa: Tambah siswa, isi nama, kelas, NIS, dan UID kartu.
2. Reset PIN (ikon kunci) pada baris siswa membuat PIN orang tua baru; PIN tampil sekali, catat dan berikan ke orang tua.
3. Ikon dokumen = catat Izin, Sakit, atau Dispensasi untuk siswa itu.
4. Menu Jadwal: atur jam Masuk, Terlambat, dan Pulang (baris kelas atau hari khusus mengalahkan "Semua"; Minggu libur).

## Laporan

1. Menu Laporan, tab Rekap bulanan: pilih bulan dan kelas, lalu Unduh CSV atau Cetak.
2. Tab Log harian: semua tap satu tanggal, termasuk presensi manual (bertanda Manual, beserta alasan dan petugas).
3. Persen kehadiran = (Hadir + Terlambat + Dispensasi) dibagi hari efektif.

## Akun staf (Pengaturan)

1. Menu Pengaturan, bagian Akun Pimpinan dan Staf: Tambah akun untuk Kepala, Waka, atau Guru Piket (akun piket dipakai bersama satu meja).
2. Ikon gembok pada akun Guru Piket = Kunci darurat (sesi aktif langsung keluar); tombol centang = Buka kunci.
3. Ikon key = kirim email reset password; ikon sampah = cabut akses.
4. Ganti password admin di kartu "Ganti password admin".

## Kalender akademik dan hari efektif

1. Hari efektif ditentukan oleh BUKTI: tap kartu atau presensi manual (ambang bawaan 1 siswa). Hari tanpa bukti bukan hari efektif dan siswa tidak dihitung Alpha.
2. Menu Kalender: klik tanggal, pilih Libur atau Efektif, isi alasan, lalu Simpan override. Override menang atas hitungan otomatis.
3. Override Efektif tanpa bukti membuat semua siswa tanpa data Alpha: isi presensi manual dulu, lalu centang pernyataan.
4. Kartu Ambang hari efektif: ubah angka (1 sampai 500). Kartu Hitung ulang: pilih rentang lampau, lalu Hitung ulang.
5. Migrasi sekali jalan: Periksa (dry-run), baca ringkasan, lalu Terapkan migrasi.

## Guru BK

1. Menu Guru BK: Tambah guru BK (nama, email asli, password sementara); akun per guru, lintas kelas.
2. Cabut dan Pasang kembali seperti wali. Konseling hanya terbaca BK.

## Hapus akun permanen

1. Wali kelas atau Guru BK yang sudah dicabut: tekan Tandai hapus permanen, isi alasan, ketik email. Kepala, Waka, atau Piket: saat Cabut akses, centang Tandai juga untuk hapus permanen (bawaan tidak dicentang). Tanda masuk daftar Menunggu dihapus (dapat dibatalkan).
2. Penghapusan nyata dilakukan skrip lokal hapus_akun.py (atau sel Hapus akun di notebook): dry-run dulu, lalu ketik HAPUS. Tidak dapat dibatalkan; email jadi bebas dipakai ulang; log dan riwayat tetap ada.
3. BK dengan klaim aktif ditolak skrip: minta Waka melepas atau memindahkan klaim dulu. Akun yang dicabut sebelum v2.5.1: Firebase Console, Authentication, Users, titik tiga, Delete account.

## Wali kelas

1. Menu Wali kelas: tekan Tambah wali kelas, isi nama, email asli, password sementara, lalu kelas utama dan (opsional) kelas tambahan. Satu wali boleh memegang berapa pun kelas.
2. Kelas yang sudah punya wali memunculkan peringatan; hanya admin yang boleh menambah wali kedua.
3. Cabut menutup akses tanpa menghapus akun; Pasang kembali mengaktifkan lagi.
4. Pergantian tahun ajaran: ubah kelas utama semua wali sekaligus di kartu Wali kelas per tahun ajaran, lalu simpan satu kali (indeks siswa-kelas ikut disinkronkan; ubah kelas siswa dulu di menu Siswa).
5. Kartu Indeks kelas membandingkan daftar siswa dengan indeks siswa-kelas dan akun wali dengan cerminnya. Bila ada selisih tekan Perbaiki, baca pratinjau (dry-run), lalu Terapkan.

> Catatan: Indeks siswa-kelas membatasi wali pada siswa kelasnya; terisi otomatis saat siswa diubah.

## Log aktivitas dan backup

1. Menu Log aktivitas: pilih tanggal, lihat siapa (nama petugas pilihan sendiri), perangkat, dan aksinya. Perangkat baru bertanda.
2. Pengaturan, kartu Backup terakhir: Buka Firebase Console, Realtime Database, menu titik tiga, Ekspor JSON, simpan berkas di tempat aman.
3. Kembali ke aplikasi, tekan Tandai sudah backup. Lakukan tiap Sabtu.

> Catatan: Nama petugas piket dipilih sendiri; log membantu melacak lewat perangkat, bukan bukti identitas.

---
Versi singkat ini juga tersedia di aplikasi pada menu Panduan.
