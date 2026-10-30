// Isi panduan pengguna: SATU SUMBER untuk halaman "Panduan" di aplikasi dan berkas docs/*.md
// (docs dibuat oleh `node scripts/buat-panduan.mjs`; uji `tests/panduan.test.mjs` memastikan keduanya selalu sama).
// Bahasa sederhana, langkah bernomor, maksimal sekitar 2 halaman per peran.

export type KodePanduan = "admin" | "kepala" | "waka" | "piket" | "wali" | "bk" | "ortu" | "sop";
export type Bagian = { judul: string; langkah: string[]; catatan?: string };
export type Panduan = { kode: KodePanduan; judul: string; untuk: string; berkas: string; bagian: Bagian[] };

export const PANDUAN: Record<KodePanduan, Panduan> = {
  admin: {
    kode: "admin", judul: "Panduan Admin", untuk: "Administrator / TU sekolah", berkas: "PANDUAN_ADMIN.md",
    bagian: [
      { judul: "Masuk", langkah: [
        "Buka alamat aplikasi, pilih tab Admin.",
        "Isi email dan password, lalu tekan Masuk.",
        "Centang \"Ingat saya\" hanya di komputer sendiri.",
      ] },
      { judul: "Memeriksa alat presensi", langkah: [
        "Dashboard: lihat Online atau Offline dan jam terakhir alat terlihat.",
        "Menu Perangkat: detail WiFi, memori, antrean.",
        "Alat Offline: periksa listrik dan WiFi, lalu tekan Restart di menu Perangkat.",
        "Bila belum pulih, minta piket memakai Presensi manual.",
      ] },
      { judul: "Mengelola siswa dan orang tua", langkah: [
        "Menu Siswa: Tambah siswa, isi nama, kelas, NIS, dan UID kartu.",
        "Reset PIN (ikon kunci) pada baris siswa membuat PIN orang tua baru; PIN tampil sekali, catat dan berikan ke orang tua.",
        "Izin, Sakit, Dispensasi, dan presensi manual dicatat piket atau Waka, bukan admin.",
        "Menu Jadwal: atur jam Masuk, Terlambat, dan Pulang (baris kelas atau hari khusus mengalahkan \"Semua\"; Minggu libur).",
      ] },
      { judul: "Laporan", langkah: [
        "Menu Laporan, tab Rekap bulanan: pilih bulan dan kelas, lalu Unduh CSV atau Cetak.",
        "Tab Log harian: semua tap satu tanggal, termasuk presensi manual (bertanda Manual, beserta alasan dan petugas).",
        "Persen kehadiran = (Hadir + Terlambat + Dispensasi) dibagi hari efektif.",
      ] },
      { judul: "Akun staf (Pengaturan)", langkah: [
        "Menu Pengaturan, bagian Akun Pimpinan dan Staf: Tambah akun untuk Kepala, Waka, atau Guru Piket (akun piket dipakai bersama satu meja).",
        "Ikon gembok pada akun Guru Piket = Kunci darurat (sesi aktif langsung keluar); tombol centang = Buka kunci.",
        "Ikon key = kirim email reset password; ikon sampah = cabut akses.",
        "Ganti password admin di kartu \"Ganti password admin\".",
      ] },
      { judul: "Kalender akademik (hanya lihat)", langkah: [
        "Hari efektif ditentukan oleh BUKTI: tap kartu atau presensi manual. Hari tanpa bukti bukan hari efektif dan siswa tidak dihitung Alpha.",
        "Menu Kalender hanya dapat Anda lihat. Tanggal merah dan kegiatan diisi Waka Kesiswaan (cadangan: Kepala Madrasah).",
        "Kartu Kontrol kalender di Dashboard menandai hari kerja tanpa tap dan tanpa presensi manual yang belum ditandai: ingatkan Waka agar menandainya di menu Kalender.",
      ] },
      { judul: "Guru BK", langkah: [
        "Menu Guru BK: Tambah guru BK (nama, email asli, password sementara); akun per guru, lintas kelas.",
        "Cabut dan Pasang kembali seperti wali. Konseling hanya terbaca BK.",
      ] },
      { judul: "Hapus akun permanen", langkah: [
        "Wali kelas atau Guru BK yang sudah dicabut: tekan Tandai hapus permanen, isi alasan, ketik email. Kepala, Waka, atau Piket: saat Cabut akses, centang Tandai juga untuk hapus permanen (bawaan tidak dicentang). Tanda masuk daftar Menunggu dihapus (dapat dibatalkan).",
        "Penghapusan nyata dilakukan skrip lokal hapus_akun.py (atau sel Hapus akun di notebook): dry-run dulu, lalu ketik HAPUS. Tidak dapat dibatalkan; email jadi bebas dipakai ulang; log dan riwayat tetap ada.",
        "BK dengan klaim aktif ditolak skrip: minta Waka melepas atau memindahkan klaim dulu. Akun yang dicabut sebelum v2.5.1: Firebase Console, Authentication, Users, titik tiga, Delete account.",
      ] },
      { judul: "Wali kelas", langkah: [
        "Menu Wali kelas: tekan Tambah wali kelas, isi nama, email asli, password sementara, lalu kelas utama dan (opsional) kelas tambahan. Satu wali boleh memegang berapa pun kelas.",
        "Kelas yang sudah punya wali memunculkan peringatan; hanya admin yang boleh menambah wali kedua.",
        "Cabut menutup akses tanpa menghapus akun; Pasang kembali mengaktifkan lagi.",
        "Pergantian tahun ajaran: ubah kelas utama semua wali sekaligus di kartu Wali kelas per tahun ajaran, lalu simpan satu kali (indeks siswa-kelas ikut disinkronkan; ubah kelas siswa dulu di menu Siswa).",
        "Kartu Indeks kelas membandingkan daftar siswa dengan indeks siswa-kelas dan akun wali dengan cerminnya. Bila ada selisih tekan Perbaiki, baca pratinjau (dry-run), lalu Terapkan.",
      ], catatan: "Indeks siswa-kelas membatasi wali pada siswa kelasnya; terisi otomatis saat siswa diubah." },
      { judul: "Log aktivitas dan backup", langkah: [
        "Menu Log aktivitas: pilih tanggal, lihat siapa (nama petugas pilihan sendiri), perangkat, dan aksinya. Perangkat baru bertanda.",
        "Pengaturan, kartu Backup terakhir: Buka Firebase Console, Realtime Database, menu titik tiga, Ekspor JSON, simpan berkas di tempat aman.",
        "Kembali ke aplikasi, tekan Tandai sudah backup. Lakukan tiap Sabtu.",
      ], catatan: "Nama petugas piket dipilih sendiri; log membantu melacak lewat perangkat, bukan bukti identitas." },
    ],
  },

  kepala: {
    kode: "kepala", judul: "Panduan Kepala Madrasah", untuk: "Kepala Madrasah", berkas: "PANDUAN_KEPALA.md",
    bagian: [
      { judul: "Masuk", langkah: [
        "Buka alamat aplikasi, pilih tab Admin, isi email dan password akun Kepala.",
        "Anda masuk ke panel Kepala: memantau seluruh data dan mengelola kesiswaan.",
      ] },
      { judul: "Memantau kehadiran", langkah: [
        "Dashboard: jumlah hadir, terlambat, izin, dan belum tap hari ini serta kehadiran per kelas.",
        "Menu Siswa: status tiap siswa hari ini (UID kartu disamarkan).",
        "Menu Laporan: Rekap bulanan (CSV/cetak) dan Log harian.",
        "Menu Status alat: apakah alat presensi online.",
      ] },
      { judul: "Kesiswaan", langkah: [
        "Presensi manual: hanya melihat siapa yang dicatat manual dan alasannya.",
        "Validasi harian: Anda dapat membantu memberi Izin/Sakit/Dispensasi atau Konfirmasi Alfa bila waka berhalangan. Presensi per jam: hanya melihat.",
        "Perlu ditinjau: saran pelanggaran otomatis. Pilih lalu Setujui atau Abaikan (dengan alasan).",
        "Pelanggaran: catat pelanggaran atau remisi, lihat saldo poin dan level pembinaan siswa.",
        "Tata tertib: ubah aturan, remisi, ambang pembinaan, dan Pemetaan saran. Aturan tidak dihapus, cukup dinonaktifkan.",
        "Laporan kesiswaan: poin per siswa/kelas, kehadiran per jam, izin dan surat. Jejak audit: siapa mengubah apa.",
      ] },
      { judul: "Kalender akademik", langkah: [
        "Menu Kalender: lihat hari efektif tiap tanggal (otomatis dari bukti tap/presensi manual atau override libur/efektif).",
        "Tanggal berwarna merah muda = tap rendah (alat mungkin bermasalah sebagian hari). Waka yang mengisi kalender; Anda cadangan dan dapat mengatur Libur atau Efektif bila Waka berhalangan. Admin hanya melihat.",
      ] },
      { judul: "Pembinaan dan usulan remisi", langkah: [
        "Menu Pembinaan: bagian Perlu dibina (Kepala) memuat siswa pada ambang Kepala (lv03 dan seterusnya) dengan tombol Catat pembinaan; lencana menu = yang belum selesai. Rekap semua kelompok dapat disaring dan diunduh CSV. Anda dapat mengoreksi pembinaan Selesai di bawahnya (alasan wajib).",
        "Menu Penugasan BK (lencana = siswa BK belum diklaim), Izin ke orang tua, dan Migrasi pembinaan (sekali, pratinjau dulu). Catatan konseling rahasia hanya terbaca BK, tidak oleh Kepala.",
        "Menu Usulan remisi: Anda dapat menyetujui atau menolak usulan wali (alasan wajib bila menolak). Keputusan hanya sekali.",
      ] },
      { judul: "Yang tidak dapat dilakukan", langkah: [
        "Mengelola akun staf, mereset PIN orang tua, atau mengubah data siswa dan jadwal: tugas Admin.",
        "Melihat Log aktivitas akun piket: hanya Admin dan Waka.",
      ] },
    ],
  },

  waka: {
    kode: "waka", judul: "Panduan Waka Kesiswaan", untuk: "Waka Kesiswaan", berkas: "PANDUAN_WAKA.md",
    bagian: [
      { judul: "Masuk dan menu utama", langkah: [
        "Buka alamat aplikasi, tab Admin, isi email dan password akun Waka.",
        "Dashboard menampilkan siswa belum tap dan yang belum divalidasi hari ini.",
      ] },
      { judul: "Sore hari: validasi harian", langkah: [
        "Menu Validasi harian: daftar siswa yang tidak tap masuk dan tanpa keterangan.",
        "Pilih Izin, Sakit, atau Dispensasi bila ada kabar, beserta keterangan.",
        "Bila tidak masuk tanpa kabar, tekan Konfirmasi Alfa (setelah batas keterlambatan lewat). Siswa yang dicatat Presensi manual tidak masuk daftar ini.",
      ] },
      { judul: "Presensi manual", langkah: [
        "Presensi manual: untuk siswa hadir yang tidak tercatat alat (KTM lupa/hilang, kartu rusak, alat mati).",
        "Pada siswa, tekan Hadir manual, pilih alasan, isi jam masuk. Hadir atau Terlambat dihitung dari jadwal kelas.",
        "Alat bermasalah satu kelas: pilih kelas di kotak Mode alat bermasalah, centang siswa yang TIDAK hadir, tekan Tandai hadir.",
        "Bila Alfa sudah dikonfirmasi, menyimpan membatalkan Alfa itu (tercatat di jejak audit).",
        "Bukti masuk PALING AWAL yang dipakai. Jam dimundurkan lebih dari 15 menit muncul di kartu Dashboard.",
      ] },
      { judul: "Presensi per jam dan saran", langkah: [
        "Presensi per jam: pilih tanggal dan kelas, isi sel S, I, D, atau A per jam pelajaran lalu Simpan. Anda dapat menimpa atau menghapus sel apa pun, termasuk A dari piket (titik oranye).",
        "Siswa Alfa seharian otomatis tampil A di jam 1 sampai 9 (terkunci); berketerangan harian tampil I, S, atau D. Nilai ini diturunkan, tidak disimpan.",
        "Perlu ditinjau: saran pelanggaran otomatis (terlambat, tidak tap pulang, bolos jam, Lupa membawa KTM, Menghilangkan KTM).",
        "Centang saran lalu Setujui terpilih atau Abaikan. Tidak ada poin tanpa persetujuan Anda.",
        "Saran yang belum dipetakan ke aturan diberi peringatan; atur di Tata tertib, tab Pemetaan saran.",
      ] },
      { judul: "Kalender dan tap rendah", langkah: [
        "Menu Kalender adalah tugas Anda (Kepala cadangan; TU hanya melihat). Tanggal tanpa bukti bukan hari efektif, jadi siswa tidak dihitung Alpha. Atur Libur (tanggal merah, ujian) atau Efektif (hari pengganti) dengan alasan.",
        "Kartu Kontrol kalender di Dashboard mencantumkan hari kerja tanpa tap dan tanpa presensi manual yang belum Anda tandai; tandai lewat Buka Kalender.",
        "Ambang dan Hitung ulang ada di halaman Kalender. Migrasi sekali jalan: Periksa (dry-run) dulu, lalu Terapkan; setelahnya tombol nonaktif.",
        "Dashboard menampilkan banner Tap rendah bila tap hari itu kurang dari separuh biasanya. Validasi Alfa hari itu ditahan.",
        "Isi Presensi manual untuk siswa yang hadir, atau tekan Konfirmasi hari ini normal bila memang sepi.",
      ] },
      { judul: "Guru BK", langkah: [
        "Menu Guru BK: Tambah guru BK (nama, email asli, password sementara), Cabut, atau Pasang kembali. Konseling hanya terbaca BK.",
        "Klaim aktif tampil per akun. Mencabut BK yang masih memegang klaim menampilkan daftar siswa dan tombol ke Penugasan BK.",
      ] },
      { judul: "Wali kelas", langkah: [
        "Menu Wali kelas: Tambah wali kelas, isi nama, email asli, password sementara, dan kelas utama (tepat satu).",
        "Ubah kelas, Cabut, dan Pasang kembali ada pada tiap baris. Kelas tambahan dan pergantian massal hanya admin.",
      ], catatan: "Wali hanya memantau siswa kelasnya (kehadiran, pembinaan, usulan remisi); izin dan pelanggaran dicatat piket atau Waka." },
      { judul: "Pembinaan dan usulan remisi", langkah: [
        "Pembinaan: rekap wali dan BK; koreksi yang Selesai (alasan wajib). Penugasan BK (lencana = siswa BK belum diklaim): Tunjuk atau Pindahkan. Izin ke orang tua: pembinaan tersembunyi sampai diizinkan (ringkas atau lengkap).",
        "Menu Usulan remisi: lencana angka menunjukkan usulan wali yang menunggu. Tekan Setujui (poin siswa langsung berkurang) atau Tolak (alasan wajib). Keputusan hanya dapat dibuat sekali.",
        "Tata tertib, tab Ambang pembinaan: Penanggung jawab tiap ambang (wali kelas, BK, atau Kepala) hanya dapat diubah Kepala, dan terkunci setelah ambang dipakai pembinaan.",
      ], catatan: "Remisi Tanpa prestasi hanya untuk siswa yang punya catatan pelanggaran pada tahun ajaran ini; usulan yang tidak memenuhi syarat tidak dapat disetujui." },
      { judul: "Pelanggaran, piket, dan pengawasan", langkah: [
        "Pelanggaran: catat pelanggaran atau remisi untuk satu atau banyak siswa; ubah, hapus (beralasan), atau pulihkan.",
        "Petugas piket: tambah atau nonaktifkan nama, atur jendela input mundur (0 sampai 14 hari, bawaan 2), dan Kunci akun piket untuk keadaan darurat.",
        "Log aktivitas: pilih tanggal, saring menurut petugas, perangkat, atau siswa; unduh CSV.",
        "Laporan kesiswaan dan Jejak audit untuk rekap dan pemeriksaan.",
      ] },
    ],
  },

  piket: {
    kode: "piket", judul: "Panduan Guru Piket", untuk: "Guru piket (akun bersama meja piket)", berkas: "PANDUAN_PIKET.md",
    bagian: [
      { judul: "Masuk dan memilih nama", langkah: [
        "Buka alamat aplikasi, tab Admin, isi email dan password akun meja piket.",
        "Layar \"Siapa yang bertugas?\" muncul: pilih nama Anda. Nama ini tercatat pada semua yang Anda input.",
        "Untuk ganti petugas tekan Ganti petugas. Tombol Nama perangkat boleh dipakai memberi nama HP/komputer ini (contoh: HP piket pintu depan).",
        "Selesai bertugas, tekan Keluar.",
      ], catatan: "Akun dipakai bersama, jadi nama dipilih sendiri. Semua tindakan juga tercatat di log aktivitas beserta perangkat." },
      { judul: "Siswa tidak masuk: Izin, Sakit, Dispensasi", langkah: [
        "Beranda menampilkan siswa yang belum tap hari ini. Kabar izin dari orang tua atau wali kelas disampaikan ke piket; Anda yang mencatatnya.",
        "Pada nama siswa tekan Izin, Sakit, atau Dispensasi (siswa mewakili sekolah, dihitung hadir).",
        "Isi keterangan (wajib, min. 3 huruf) dan centang Surat fisik diterima bila ada. Simpan arsip surat di map dokumen.",
        "Tanggal lain atau izin terencana: tombol Izin tanggal lain / terencana (maksimal 7 hari ke depan; hanya Izin atau Dispensasi).",
        "Salah input: tombol Hapus pada daftar Sudah berketerangan.",
      ] },
      { judul: "Siswa hadir tetapi tidak tercatat alat", langkah: [
        "Satu siswa (lupa KTM, KTM hilang, kartu rusak): tombol Hadir manual pada namanya, atau menu Presensi manual.",
        "Pilih alasan, isi jam masuk (jam sebenarnya siswa datang; tidak boleh melewati waktu sekarang). Hadir atau Terlambat dihitung otomatis dari jadwal kelas.",
        "Jam yang dimundurkan lebih dari 15 menit dari waktu dicatat ditandai \"jam dimundurkan\" dan ditinjau waka. Bila siswa tap alat setelahnya, jam masuk resmi tetap yang paling awal. LCD alat dapat menampilkan Terlambat, status resmi mengikuti web.",
        "Alat mati atau WiFi putus: menu Presensi manual, kotak Mode alat bermasalah, pilih kelas, centang yang TIDAK hadir, tekan Tandai hadir.",
        "Salah catat: tombol Hapus pada daftar Presensi manual tercatat. Catat pulang manual tersedia untuk siswa yang sudah masuk.",
        "Hari tanpa satu pun tap alat bukan hari efektif. Presensi manual dihitung sebagai bukti hadir, jadi hari itu menjadi hari efektif setelah ada yang dicatat.",
      ] },
      { judul: "Izin per jam dan pelanggaran ringan", langkah: [
        "Izin per jam: pilih kelas, isi sel S, I, atau D pada jam pelajaran (siswa pulang awal dll), beri keterangan.",
        "Alfa per jam: khusus HARI INI klik sel kosong sampai A (urutan kosong, A, I, S, D). Alfa = tidak hadir tanpa keterangan; tidak perlu keterangan, dan konfirmasi singkat muncul sekali per sesi. Untuk tanggal lampau sel A terkunci: koreksi oleh Waka.",
        "Sel A milik Waka (gembok, Diisi Waka) tidak dapat diubah. A yang Anda isi sendiri hari ini boleh diganti atau dihapus pada hari yang sama.",
        "Siswa yang hari itu Alfa seharian atau berketerangan harian tampil satu baris berlabel (otomatis) dan terkunci: input izin harian dari Beranda mengubah barisnya otomatis.",
        "Pelanggaran: pilih siswa dan jenis dari daftar (hanya pelanggaran Ringan atau yang punya takziran). Poin tidak dapat diubah.",
        "Catatan pelanggaran Anda sendiri dapat dihapus dengan alasan.",
      ] },
      { judul: "Batasan yang normal", langkah: [
        "Hanya bisa menginput sampai beberapa hari ke belakang (diatur Waka, bawaan 2 hari) dan tidak ke masa depan untuk presensi manual.",
        "Siswa yang Alfa-nya sudah dikonfirmasi Waka tidak dapat diubah oleh piket: hubungi Waka.",
        "Hari Minggu libur: presensi manual tidak tersedia.",
      ] },
    ],
  },

  wali: {
    kode: "wali", judul: "Panduan Wali Kelas", untuk: "Wali kelas (akun per guru)", berkas: "PANDUAN_WALI.md",
    bagian: [
      { judul: "Masuk dan menu", langkah: [
        "Buka alamat aplikasi, pilih tab Admin, isi email dan password akun wali kelas dari admin atau waka (akun milik Anda sendiri, jangan dibagikan).",
        "Menu: Dashboard, Kehadiran kelas, Siswa kelas, Pembinaan, Usulan remisi, Laporan, Panduan, Pengaturan (ganti password), dan Keluar.",
        "Bila memegang lebih dari satu kelas, pilih kelas di bagian atas halaman. Anda hanya melihat siswa kelas binaan; siswa kelas lain tidak tampil.",
      ] },
      { judul: "Memantau kehadiran", langkah: [
        "Menu Kehadiran kelas: status hari ini siswa kelas binaan (hanya melihat).",
        "Wali kelas tidak mencatat Izin, Sakit, Dispensasi, atau pelanggaran. Bila orang tua memberi kabar izin atau ada pelanggaran, teruskan ke Guru Piket atau Waka.",
        "Catatan wali yang lama tetap tersimpan dan tetap dihitung.",
      ] },
      { judul: "Laporan", langkah: [
        "Menu Laporan: pilih tahun ajaran dan tanggal dari sampai (maksimal 1 tahun ajaran), lalu tekan Tampilkan. Isinya satu baris per siswa kelas binaan yang sedang dipilih.",
        "Kolom: hari efektif, Hadir, Terlambat, Izin, Sakit, Dispensasi (dihitung hadir), Alpha, persen kehadiran, A/I/S/D per jam, poin, saldo, level, dan status pembinaan (status dan tanggal saja).",
        "Unduh CSV (pemisah titik koma, langsung rapi di Excel) atau Cetak. Setiap ekspor tercatat di log aktivitas tanpa nama siswa.",
      ] },
      { judul: "Pembinaan", langkah: [
        "Menu Pembinaan menampilkan daftar Perlu dibina: siswa yang saldo poinnya mencapai ambang pembinaan wali kelas pada tahun ajaran berjalan (mis. 100 poin). Lencana angka di menu menunjukkan jumlahnya.",
        "Tekan Catat pembinaan: isi tanggal, metode, hasil (10 sampai 1000 karakter), tindak lanjut (opsional), dan status Dijadwalkan atau Selesai.",
        "Siswa hilang dari daftar setelah pembinaan berstatus Selesai. Bila saldo siswa sudah turun tetapi belum dibina, ia tetap tampil dengan label saldo sudah turun.",
        "Pembinaan tidak dapat dihapus. Setelah Selesai hanya Waka atau Kepala yang dapat mengoreksinya. Orang tua tidak melihat pembinaan kecuali Waka atau Kepala mengizinkan.",
      ] },
      { judul: "Usulan remisi", langkah: [
        "Menu Usulan remisi: pilih siswa binaan, pilih remisi dari daftar resmi, tulis alasan (10 sampai 300 karakter), lalu Kirim usulan.",
        "Remisi Tanpa prestasi hanya untuk siswa yang punya catatan pelanggaran pada tahun ajaran ini.",
        "Usulan yang menunggu dapat dibatalkan. Keputusan setuju atau tolak ada pada Waka atau Kepala; bila disetujui poin siswa otomatis berkurang.",
      ] },
      { judul: "Data siswa", langkah: [
        "Menu Siswa kelas: ketuk siswa untuk melihat rekap kehadiran, per jam, saldo poin, riwayat, catatan internal, dan pembinaan. PIN orang tua tidak ditampilkan.",
        "Setiap perubahan yang Anda buat tercatat di log aktivitas atas nama akun Anda.",
      ], catatan: "Bila daftar siswa kosong atau salah, hubungi admin: pemetaan kelas wali dan indeks kelas siswa diatur di menu Wali kelas." },
    ],
  },

  bk: {
    kode: "bk", judul: "Panduan Guru BK", untuk: "Guru Bimbingan Konseling (akun per guru)", berkas: "PANDUAN_BK.md",
    bagian: [
      { judul: "Masuk dan menu", langkah: [
        "Buka alamat aplikasi, pilih tab Admin, isi email dan password akun BK dari admin atau waka (akun milik Anda sendiri, jangan dibagikan).",
        "Menu: Dashboard, Siswa, Pembinaan, Usulan remisi, Laporan, Konseling, Panduan, Pengaturan (ganti password), dan Keluar. Wewenang Anda berlaku untuk SEMUA kelas.",
        "Anda tidak mencatat pelanggaran dan tidak dapat mengisi izin, presensi per jam, Alfa, presensi manual, kalender, tata tertib, atau akun. Semua tindakan tercatat di log aktivitas atas nama Anda.",
      ] },
      { judul: "Siswa dan pelanggaran ringan", langkah: [
        "Menu Siswa: cari nama atau NIS, saring menurut kelas, lihat saldo poin dan level. Ketuk nama untuk rekap kehadiran, per jam, riwayat poin dan pencatat, serta pembinaan. PIN orang tua dan UID kartu tidak ditampilkan.",
        "BK fokus membina: pelanggaran dicatat wali kelas, piket, atau waka. Catatan lama bersumber BK tetap berlaku.",
      ] },
      { judul: "Pembinaan dan usulan remisi", langkah: [
        "Menu Pembinaan (Perlu dibina): siswa yang saldonya mencapai ambang BK terbagi Belum ditangani, Tangani saya, dan Ditangani BK lain. Tekan Klaim (siapa cepat dia dapat); waka dapat menunjuk atau memindahkan. Lencana menghitung dua kelompok pertama.",
        "Tekan Catat pembinaan: isi tanggal, metode, hasil (10 sampai 1000 karakter), tindak lanjut (opsional), dan status Dijadwalkan atau Selesai. Setelah Selesai hanya Waka atau Kepala yang dapat mengoreksi.",
        "Menu Usulan remisi: pilih siswa dan remisi dari daftar resmi, tulis alasan, lalu Kirim usulan. Keputusan setuju atau tolak ada pada Waka atau Kepala.",
      ] },
      { judul: "Laporan", langkah: [
        "Menu Laporan: pilih tahun ajaran, tanggal dari sampai (maksimal 1 tahun ajaran), dan kelas (bawaan semua), lalu tekan Tampilkan. Satu baris per siswa; data dibaca sekali agar hemat kuota.",
        "Kolom seperti laporan wali, dengan status pembinaan level wali dan BK (status dan tanggal saja). Isi pembinaan, konseling, dan klaim tidak ikut.",
        "Unduh CSV atau Cetak. Setiap ekspor tercatat di log aktivitas tanpa nama siswa.",
      ] },
      { judul: "Catatan konseling rahasia", langkah: [
        "Menu Konseling atau detail siswa: tekan Catatan baru, pilih topik (Akademik, Pribadi, Sosial, Karier, Keluarga, Lainnya), isi konseling (10 sampai 2000 karakter) dan tindak lanjut (opsional).",
        "Semua akun BK dapat MEMBACA catatan (agar penanganan berlanjut); Kepala, Waka, admin, wali kelas, piket, dan orang tua tidak. Layanan konseling untuk semua siswa, tanpa klaim. Catatan tidak pernah muncul di portal orang tua, laporan, atau log aktivitas.",
        "Catatan tidak dapat dihapus. Koreksi hanya oleh pembuat catatan: isi lama otomatis disimpan di riwayat koreksi yang hanya terbaca BK.",
      ], catatan: "Jaga kerahasiaan: keluar dari aplikasi setelah selesai, terutama di komputer bersama." },
    ],
  },

  ortu: {
    kode: "ortu", judul: "Panduan Orang Tua / Wali", untuk: "Orang tua atau wali siswa", berkas: "PANDUAN_ORANG_TUA.md",
    bagian: [
      { judul: "Cara masuk", langkah: [
        "Buka alamat aplikasi di HP, pilih tab Orang Tua / Wali.",
        "Isi NIS anak (nomor induk siswa) dan PIN 6 angka dari sekolah.",
        "Tekan Masuk. Anda langsung melihat status anak hari ini.",
        "Tekan Keluar setelah selesai, terutama di HP bersama. Aplikasi keluar otomatis setelah 30 menit tidak dipakai.",
      ] },
      { judul: "Arti status", langkah: [
        "Tepat waktu: tap kartu sebelum batas masuk.",
        "Terlambat: tap kartu setelah batas masuk.",
        "Izin atau Sakit: guru piket mencatat keterangan. Kabari piket sekolah bila anak tidak masuk.",
        "Dispensasi: anak mewakili sekolah (lomba dll). Dihitung HADIR.",
        "Tanpa keterangan (Alfa): tidak tap dan tidak ada keterangan.",
        "Belum tap: belum tap kartu dan batas keterlambatan belum lewat.",
        "Libur / tidak ada kegiatan presensi: hari Minggu, tanggal merah, atau hari ketika sekolah belum menjalankan presensi. Hari ini tidak dihitung dan tidak dianggap Alpha.",
        "\"Hadir (dicatat manual: Lupa KTM)\": anak hadir tetapi tap tidak tercatat alat (KTM lupa/hilang atau alat bermasalah), sehingga guru piket mencatat langsung.",
      ] },
      { judul: "Yang dapat dilihat", langkah: [
        "Presensi hari ini (jam masuk dan pulang), grafik minggu dan bulan ini, serta persen kehadiran.",
        "Kartu rekap menulis Hari efektif ke-N: hanya hari yang benar-benar ada kegiatan presensi. Bulan tanpa kegiatan tertulis Belum ada kegiatan presensi, bukan 0 persen.",
        "Riwayat 10 hari terakhir dan rekap per bulan dalam satu tahun ajaran.",
        "Kehadiran per jam pelajaran dan catatan kedisiplinan anak (poin dan level). Pembinaan tampil hanya bila sekolah mengizinkan: ringkas (status dan tanggal) atau lengkap. Hari Alfa atau berketerangan penuh tampil satu baris (Alfa seharian), bukan sembilan baris jam.",
        "Data diperbarui otomatis tiap 1 menit; tekan tulisan \"Diperbarui\" untuk memuat ulang sekarang.",
      ] },
      { judul: "Lupa PIN atau tidak bisa masuk", langkah: [
        "Tekan tulisan Lupa PIN? di halaman masuk: terbuka WhatsApp ke TU sekolah.",
        "Sebutkan nama anak, kelas, dan NIS. TU membuat PIN baru; PIN lama otomatis tidak berlaku.",
        "Pesan \"NIS atau PIN salah\": periksa NIS dan PIN, lalu coba lagi. Terlalu banyak percobaan akan dikunci sementara.",
        "Jangan membagikan PIN kepada orang lain.",
      ] },
    ],
  },

  sop: {
    kode: "sop", judul: "SOP Harian Presensi+", untuk: "Semua peran (TU, piket, Wakasis, wali kelas, BK, Kepala)", berkas: "SOP_HARIAN.md",
    bagian: [
      { judul: "Pembagian tugas: satu tugas satu pengisi", langkah: [
        "TU (admin): pantau alat, kelola data siswa, akun, dan backup. Tidak mengisi izin, presensi, atau kalender.",
        "Piket: izin harian (Izin, Sakit, Dispensasi), presensi manual, izin per jam dan Alfa per jam hari ini, pelanggaran Ringan.",
        "Wakasis: validasi Alfa, pelanggaran Sedang atau Berat, saran pelanggaran, kalender, penugasan BK, izin pembinaan ke orang tua.",
        "Wali kelas: memantau kelas, pembinaan T1, usulan remisi, laporan. Tidak mencatat izin atau pelanggaran.",
        "Guru BK: pembinaan T2, konseling rahasia, usulan remisi.",
        "Kepala Madrasah: cadangan Wakasis; pembinaan T3 sampai SP3; pemutus akhir.",
      ] },
      { judul: "Pagi (sebelum jam masuk): cek alat online", langkah: [
        "Admin/TU: buka Dashboard, pastikan alat Online dan jam terakhir terlihat baru.",
        "Bila Offline: periksa listrik dan WiFi, tekan Restart di menu Perangkat, tunggu 1 sampai 2 menit.",
        "Bila tetap Offline: beri tahu piket dan waka agar memakai Presensi manual (lihat bagian Jika alat mati).",
        "Hari tanpa satu pun tap atau presensi manual bukan hari efektif: siswa tidak dihitung Alpha.",
      ] },
      { judul: "Siang: izin dan dispensasi", langkah: [
        "Piket: catat siswa yang tidak masuk lewat Beranda piket (Izin, Sakit, Dispensasi) lengkap dengan keterangan.",
        "Surat fisik yang diterima: centang Surat fisik diterima dan simpan suratnya di map dokumen.",
        "Siswa hadir tetapi KTM lupa/hilang: Hadir manual dengan alasan yang sesuai.",
      ] },
      { judul: "Sore: validasi dan saran", langkah: [
        "Waka: buka Validasi harian setelah batas keterlambatan; beri Izin/Sakit/Dispensasi atau Konfirmasi Alfa.",
        "Waka: buka Perlu ditinjau, Setujui atau Abaikan saran pelanggaran (terlambat, tidak tap pulang, bolos jam, Lupa/Hilang KTM).",
        "Waka: isi Presensi per jam bila ada siswa bolos pelajaran (sel A).",
        "Waka: lihat banner Tap rendah di Dashboard; isi Presensi manual atau tekan Konfirmasi hari ini normal.",
        "Waka: tetapkan tanggal merah atau ujian sebagai Libur di menu Kalender (sebaiknya sebelum hari H). TU mengingatkan lewat kartu Kontrol kalender.",
      ] },
      { judul: "Sabtu: backup", langkah: [
        "Admin: Pengaturan, kartu Backup terakhir, Buka Firebase Console, Ekspor JSON, simpan berkas di tempat aman (bukan hanya di laptop sekolah).",
        "Tekan Tandai sudah backup. Aplikasi memberi peringatan bila sudah lebih dari 7 hari.",
      ] },
      { judul: "Jika alat mati atau WiFi putus", langkah: [
        "Piket: menu Presensi manual, kotak Mode alat bermasalah.",
        "Pilih kelas, atur jam masuk (bawaan awal jam masuk kelas), centang siswa yang TIDAK hadir.",
        "Tekan Tandai hadir. Alasan otomatis \"Alat bermasalah\"; tidak menimbulkan saran pelanggaran Lupa KTM.",
        "Setelah alat pulih: bila siswa ternyata sempat tap, bukti masuk yang paling awal (manual atau alat) yang dipakai; tidak ada hitungan ganda.",
        "Catat kejadian (jam mati, penyebab) untuk laporan ke admin.",
      ] },
    ],
  },
};

export const URUTAN_PANDUAN: KodePanduan[] = ["admin", "kepala", "waka", "piket", "wali", "bk", "ortu", "sop"];

/** Ubah satu panduan menjadi Markdown (dipakai skrip pembuat docs/ dan uji kesamaan). */
export function keMarkdown(p: Panduan): string {
  const baris: string[] = [`# ${p.judul}`, "", `Untuk: ${p.untuk}`, ""];
  for (const b of p.bagian) {
    baris.push(`## ${b.judul}`, "");
    b.langkah.forEach((l, i) => baris.push(`${i + 1}. ${l}`));
    if (b.catatan) baris.push("", `> Catatan: ${b.catatan}`);
    baris.push("");
  }
  baris.push("---", "Versi singkat ini juga tersedia di aplikasi pada menu Panduan.", "");
  return baris.join("\n");
}

/** Perkiraan panjang: jumlah kata (batas uji: 2 halaman ~ 700 kata). */
export const hitungKata = (p: Panduan) => keMarkdown(p).split(/\s+/).filter(Boolean).length;
