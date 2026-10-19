// Isi panduan pengguna: SATU SUMBER untuk halaman "Panduan" di aplikasi dan berkas docs/*.md
// (docs dibuat oleh `node scripts/buat-panduan.mjs`; uji `tests/panduan.test.mjs` memastikan keduanya selalu sama).
// Bahasa sederhana, langkah bernomor, maksimal sekitar 2 halaman per peran.

export type KodePanduan = "admin" | "kepala" | "waka" | "piket" | "wali" | "ortu" | "sop";
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
        "Buka menu Dashboard: lihat tulisan Online atau Offline dan jam alat terakhir terlihat.",
        "Buka menu Perangkat untuk detail (WiFi, memori, antrean, versi data).",
        "Alat Offline: periksa listrik dan WiFi, lalu tekan Restart di menu Perangkat.",
        "Bila alat belum pulih, minta piket memakai Presensi manual (lihat SOP harian).",
      ] },
      { judul: "Mengelola siswa dan orang tua", langkah: [
        "Menu Siswa: Tambah siswa, isi nama, kelas, NIS, dan UID kartu.",
        "Tombol Reset PIN (ikon kunci) pada baris siswa membuat PIN orang tua baru. PIN tampil sekali: catat dan berikan ke orang tua.",
        "Ikon dokumen = catat Izin, Sakit, atau Dispensasi untuk siswa itu.",
        "Menu Jadwal: atur jam Masuk, Terlambat, dan Pulang (baris kelas/hari khusus mengalahkan baris \"Semua\"). Hari Minggu libur otomatis.",
      ] },
      { judul: "Laporan", langkah: [
        "Menu Laporan, tab Rekap bulanan: pilih bulan dan kelas, lalu Unduh CSV atau Cetak.",
        "Tab Log harian: semua tap pada satu tanggal, termasuk presensi manual (diberi tanda Manual beserta alasan dan petugas).",
        "Persen kehadiran = (Hadir + Terlambat + Dispensasi) dibagi hari efektif.",
      ] },
      { judul: "Akun staf (Pengaturan)", langkah: [
        "Menu Pengaturan, bagian Akun Pimpinan dan Staf: Tambah akun untuk Kepala, Waka, atau Guru Piket (akun piket dipakai bersama satu meja).",
        "Ikon gembok pada akun Guru Piket = Kunci darurat (sesi yang sedang aktif langsung keluar). Tombol centang pada akun terkunci = Buka kunci.",
        "Ikon kunci (key) = kirim email reset password. Ikon sampah = cabut akses.",
        "Ganti password admin di kartu \"Ganti password admin\".",
      ] },
      { judul: "Kalender akademik dan hari efektif", langkah: [
        "Hari efektif ditentukan oleh BUKTI: ada tap kartu atau presensi manual (ambang bawaan 1 siswa). Hari tanpa bukti (libur, alat mati seharian, sistem belum dipakai) bukan hari efektif dan siswa tidak dihitung Alpha.",
        "Menu Kalender: klik tanggal, pilih Libur atau Efektif, isi alasan, lalu Simpan override. Override menang atas hitungan otomatis.",
        "Override Efektif pada tanggal tanpa bukti membuat semua siswa tanpa data tercatat Alpha: isi dulu presensi manual (mode alat bermasalah), lalu centang pernyataan.",
        "Kartu Ambang hari efektif: ubah angka (1 sampai 500). Kartu Hitung ulang: pilih rentang tanggal lampau lalu Hitung ulang (aman diulang).",
        "Migrasi sekali jalan (admin): Periksa (dry-run), baca ringkasan, baru Terapkan migrasi. Ini mengisi ringkasan seluruh tahun ajaran dan tanggal \"aktif sejak\" siswa lama.",
      ] },
      { judul: "Wali kelas", langkah: [
        "Menu Wali kelas: tekan Tambah wali kelas, isi nama, email asli, password sementara, lalu kelas utama dan (opsional) kelas tambahan. Satu wali boleh memegang berapa pun kelas.",
        "Bila kelas yang dipilih sudah punya wali, muncul peringatan. Hanya admin yang boleh menambah wali kedua untuk kelas yang sama.",
        "Cabut menutup akses tanpa menghapus akun; Pasang kembali mengaktifkannya lagi.",
        "Pergantian tahun ajaran: ubah kelas utama semua wali sekaligus di kartu Wali kelas per tahun ajaran, lalu simpan satu kali. Indeks siswa-kelas ikut disinkronkan pada penyimpanan yang sama (ubah kelas siswa dulu di menu Data siswa).",
        "Kartu Indeks kelas (Dashboard dan menu Wali kelas) membandingkan daftar siswa dengan indeks siswa-kelas, serta akun wali dengan cermin waliAkun. Pemeriksaan berjalan otomatis saat Dashboard dibuka.",
        "Bila ada selisih, tekan Perbaiki: baca pratinjau (dry-run), lalu Terapkan perbaikan. Data dibaca ulang sebelum ditulis dan perbaikan tercatat di log aktivitas.",
      ], catatan: "Indeks siswa-kelas dipakai aturan keamanan untuk membatasi wali pada siswa kelasnya; ia terisi otomatis saat siswa ditambah, diubah, atau dihapus." },
      { judul: "Log aktivitas dan backup", langkah: [
        "Menu Log aktivitas: pilih tanggal, lihat siapa (nama petugas yang dipilih sendiri), perangkat, dan aksinya. Perangkat baru diberi tanda.",
        "Pengaturan, kartu Backup terakhir: tekan Buka Firebase Console, pilih Realtime Database, menu titik tiga, Ekspor JSON, simpan berkas di tempat aman.",
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
        "Tanggal berwarna merah muda = tap rendah (alat mungkin bermasalah sebagian hari). Kepala hanya melihat; waka dan admin yang mengatur.",
      ] },
      { judul: "Pembinaan dan usulan remisi", langkah: [
        "Menu Pembinaan: rekap pembinaan wali kelas dan pejabat; saring lalu Unduh CSV.",
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
        "Pilih Izin, Sakit, atau Dispensasi bila ada kabar. Isi keterangan.",
        "Bila memang tidak masuk tanpa kabar, tekan Konfirmasi Alfa (baru bisa setelah batas keterlambatan lewat).",
        "Siswa yang dicatat Presensi manual tidak masuk daftar ini.",
      ] },
      { judul: "Presensi manual", langkah: [
        "Menu Presensi manual: untuk siswa yang hadir tetapi tidak tercatat alat (KTM lupa/hilang, kartu rusak, alat mati).",
        "Pada siswa, tekan Hadir manual, pilih alasan, isi jam masuk. Hadir atau Terlambat dihitung dari jadwal kelas.",
        "Alat bermasalah satu kelas: pilih kelas di kotak Mode alat bermasalah, centang siswa yang TIDAK hadir, tekan Tandai hadir.",
        "Bila Alfa siswa sudah dikonfirmasi, aplikasi memberi peringatan; menyimpan akan membatalkan Alfa itu dan tercatat di jejak audit.",
        "Data alat selalu menang: bila siswa ternyata tap di alat, entri manual ditandai \"diabaikan\".",
      ] },
      { judul: "Presensi per jam dan saran", langkah: [
        "Presensi per jam: pilih tanggal dan kelas, isi sel S, I, D, atau A per jam pelajaran lalu Simpan. Waka dapat menimpa atau menghapus sel apa pun, termasuk A dari piket (titik oranye), kapan saja dalam tahun ajaran.",
        "Siswa Alfa seharian otomatis tampil A di jam 1 sampai 9 (terkunci); berketerangan harian tampil I, S, atau D. Nilai ini diturunkan dari status harian, tidak disimpan, dan hilang bila ada tap atau presensi manual.",
        "Kartu A dari piket hari ini di Dashboard: tekan Tinjau di grid.",
        "Perlu ditinjau: saran pelanggaran otomatis (terlambat, tidak tap pulang, bolos jam, Lupa membawa KTM, Menghilangkan KTM). Alfa seharian bukan pelanggaran otomatis; catat manual bila perlu.",
        "Centang saran lalu Setujui terpilih (poin tercatat) atau Abaikan. Tidak ada poin tercatat tanpa persetujuan Anda.",
        "Jenis saran yang belum dipetakan ke aturan diberi peringatan. Atur di Tata tertib, tab Pemetaan saran.",
      ] },
      { judul: "Kalender dan tap rendah", langkah: [
        "Menu Kalender: tanggal tanpa bukti bukan hari efektif, jadi siswa tidak dihitung Alpha. Atur Libur (tanggal merah, ujian) atau Efektif (hari pengganti) dengan alasan; Efektif tanpa bukti memberi peringatan.",
        "Dashboard menampilkan banner Tap rendah bila tap hari itu kurang dari separuh biasanya. Validasi Alfa hari itu ditahan.",
        "Isi Presensi manual untuk siswa yang hadir, atau tekan Konfirmasi hari ini normal bila memang sepi, agar validasi Alfa dibuka.",
        "Ambang hari efektif dan Hitung ulang rentang tanggal ada di halaman Kalender.",
      ] },
      { judul: "Wali kelas", langkah: [
        "Menu Wali kelas: Tambah wali kelas, isi nama, email asli, password sementara, dan kelas utama (tepat satu).",
        "Ubah kelas, Cabut, dan Pasang kembali ada pada tiap baris. Kelas tambahan dan pergantian massal hanya admin.",
        "Kelas yang sudah punya wali tidak dapat diberi wali kedua oleh Waka; hubungi admin.",
      ], catatan: "Wali hanya melihat siswa kelasnya, mencatat Izin/Sakit seharian dan pelanggaran Ringan atau bertakziran; tidak dapat memberi Dispensasi, mengubah presensi per jam, atau memvalidasi Alfa. Semua tindakannya tercatat di log aktivitas." },
      { judul: "Pembinaan dan usulan remisi", langkah: [
        "Menu Pembinaan: rekap pembinaan wali kelas dan pejabat. Saring menurut tahun ajaran, status, atau kelas; Unduh CSV untuk arsip. Anda dapat mencatat atau mengoreksi pembinaan, termasuk yang Selesai.",
        "Menu Usulan remisi: lencana angka menunjukkan usulan wali yang menunggu. Tekan Setujui (poin siswa langsung berkurang) atau Tolak (alasan wajib). Keputusan hanya dapat dibuat sekali.",
        "Tata tertib, tab Ambang pembinaan: atur Penanggung jawab tiap ambang (wali kelas, BK, Kepala, atau Waka). Pada data lama tekan Isi penanggung jawab bawaan.",
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
        "Beranda menampilkan siswa yang belum tap hari ini.",
        "Pada nama siswa tekan Izin, Sakit, atau Dispensasi (siswa mewakili sekolah, dihitung hadir).",
        "Isi keterangan (wajib, min. 3 huruf) dan centang Surat fisik diterima bila ada. Simpan arsip surat di map dokumen.",
        "Tanggal lain atau izin terencana: tombol Izin tanggal lain / terencana (maksimal 7 hari ke depan; hanya Izin atau Dispensasi).",
        "Salah input: tombol Hapus pada daftar Sudah berketerangan.",
      ] },
      { judul: "Siswa hadir tetapi tidak tercatat alat", langkah: [
        "Satu siswa (lupa KTM, KTM hilang, kartu rusak): tombol Hadir manual pada namanya, atau menu Presensi manual.",
        "Pilih alasan, isi jam masuk. Hadir atau Terlambat dihitung otomatis dari jadwal kelas.",
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
        "Menu: Dashboard, Izin & kehadiran, Siswa kelas, Pelanggaran, Pembinaan, Usulan remisi, Panduan, Pengaturan (ganti password), dan Keluar.",
        "Bila memegang lebih dari satu kelas, pilih kelas di bagian atas halaman. Anda hanya melihat siswa kelas binaan; siswa kelas lain tidak tampil.",
      ] },
      { judul: "Izin dan sakit", langkah: [
        "Menu Izin & kehadiran: siswa yang belum tap tampil dengan tombol Izin dan Sakit (Dispensasi dan Hadir manual tidak tersedia untuk wali).",
        "Isi keterangan (wajib) dan centang bila surat fisik diterima. Tanggal mundur dibatasi sama seperti piket.",
        "Siswa yang Alfa-nya sudah dikonfirmasi Waka tidak dapat diubah menjadi Izin atau Sakit.",
      ] },
      { judul: "Pelanggaran ringan", langkah: [
        "Menu Pelanggaran: pilih siswa kelas binaan dan pelanggaran Ringan atau yang bertakziran dari daftar tata tertib. Poin dan takziran tetap dari daftar resmi.",
        "Catatan Anda tampil di Catatan saya dan dapat dihapus dengan alasan. Pelanggaran Sedang/Berat dicatat oleh Waka.",
      ] },
      { judul: "Pembinaan", langkah: [
        "Menu Pembinaan menampilkan daftar Perlu dibina: siswa yang saldo poinnya mencapai ambang pembinaan wali kelas pada tahun ajaran berjalan (mis. 100 poin). Lencana angka di menu menunjukkan jumlahnya.",
        "Tekan Catat pembinaan: isi tanggal, metode, hasil (10 sampai 1000 karakter), tindak lanjut (opsional), dan status Dijadwalkan atau Selesai.",
        "Siswa hilang dari daftar setelah pembinaan berstatus Selesai. Bila saldo siswa sudah turun tetapi belum dibina, ia tetap tampil dengan label saldo sudah turun.",
        "Pembinaan tidak dapat dihapus. Setelah Selesai hanya Waka atau Kepala yang dapat mengoreksinya. Orang tua hanya melihat status dan tanggal, tidak isinya.",
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
        "Izin atau Sakit: sekolah mencatat keterangan.",
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
        "Kehadiran per jam pelajaran dan catatan kedisiplinan anak (poin dan level). Hari Alfa atau berketerangan penuh tampil satu baris (Alfa seharian), bukan sembilan baris jam.",
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
    kode: "sop", judul: "SOP Harian Presensi+", untuk: "Admin/TU, piket, dan waka", berkas: "SOP_HARIAN.md",
    bagian: [
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
        "Waka/Admin: tetapkan tanggal merah atau ujian sebagai Libur di menu Kalender (sebaiknya sebelum hari H).",
      ] },
      { judul: "Sabtu: backup", langkah: [
        "Admin: Pengaturan, kartu Backup terakhir, Buka Firebase Console, Ekspor JSON, simpan berkas di tempat aman (bukan hanya di laptop sekolah).",
        "Tekan Tandai sudah backup. Aplikasi memberi peringatan bila sudah lebih dari 7 hari.",
      ] },
      { judul: "Jika alat mati atau WiFi putus", langkah: [
        "Piket: menu Presensi manual, kotak Mode alat bermasalah.",
        "Pilih kelas, atur jam masuk (bawaan awal jam masuk kelas), centang siswa yang TIDAK hadir.",
        "Tekan Tandai hadir. Alasan otomatis \"Alat bermasalah\"; tidak menimbulkan saran pelanggaran Lupa KTM.",
        "Setelah alat pulih: bila siswa ternyata sempat tap, data alat yang dipakai dan entri manual ditandai diabaikan; tidak ada hitungan ganda.",
        "Catat kejadian (jam mati, penyebab) untuk laporan ke admin.",
      ] },
    ],
  },
};

export const URUTAN_PANDUAN: KodePanduan[] = ["admin", "kepala", "waka", "piket", "wali", "ortu", "sop"];

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
