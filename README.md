# Presensi+ MA Nurul Huda — Web (Firebase)

React + Vite. Data realtime dari **Firebase Realtime Database**, login **Firebase Auth**. Paket **Spark (gratis)**, tanpa Cloud Functions.

| Halaman | Isi |
|---|---|
| `/login` | Orang tua: NIS + PIN · Admin: email + password |
| `/admin` | Ringkasan realtime, kehadiran per kelas, status alat |
| `/admin/siswa` | Tambah/edit/hapus siswa, buat & reset PIN orang tua, izin/sakit |
| `/admin/jadwal` | Atur jam masuk/terlambat/pulang per kelas & hari |
| `/admin/laporan` | Rekap bulanan & log harian + unduh CSV |
| `/admin/perangkat` | Status ESP32, perintah (cek sistem, sinkron, buzzer, LCD, restart), kartu asing, log kejadian |
| `/kepala`, `/waka`, `/piket` | Panel Kepala Madrasah (pantau + kesiswaan), Waka Kesiswaan (validasi harian, per jam, pelanggaran, saran, laporan), Guru Piket (izin harian/per jam, pelanggaran ringan) |
| `/siswa/:nis` | Portal orang tua: status hari ini, rekap bulan, grafik, rekap tahunan + PDF |

## Syarat
Notebook **Setup_Migrasi_Firebase.ipynb** sudah dijalankan (membuat akun admin, data siswa, PIN).

## Deploy (sekali, dari laptop Windows)
1. Install **Node.js 22 LTS** dari nodejs.org.
2. Firebase Console → ⚙️ *Project settings* → *General* → *Your apps* → ikon **</>** (Web) → nama `presensi-web` → **Register app** (tanpa centang Hosting tidak masalah). Salin nilai `firebaseConfig`.
3. Ekstrak zip ini, buka folder di Terminal/PowerShell, lalu:
   ```
   copy .env.example .env      (Mac/Linux: cp .env.example .env)
   ```
   Isi `.env` dengan nilai dari langkah 2 (`apiKey`, `authDomain`, `databaseURL`, `projectId`, `appId`) dan nomor WA TU.
4. Jalankan:
   ```
   npm install
   npx firebase-tools login
   npm run deploy
   
   ```
5. Web aktif di `https://presensi-ma-7c521.web.app` (cek `.firebaserc` bila ID project berbeda).

`npm run deploy` juga meng-upload **database.rules.json** (Security Rules). Coba lokal: `npm run dev`.

**Urutan deploy rilis (mulai v2.3): rules lebih dulu, baru hosting.** Dari folder snapshot `releases/<versi>/`:
```
npx firebase-tools deploy --only database     # 1. Security Rules (aman untuk klien lama: node baru hanya ditambah)
npx firebase-tools deploy --only hosting      # 2. aplikasi web
```
Klien baru memakai node baru (`pembinaan`, `usulRemisi`, ...); bila hosting lebih dulu dari rules, penulisan ke node itu ditolak sampai rules terpasang.

## Catatan keamanan
- `apiKey` web Firebase **bukan rahasia** (memang tampil di browser); keamanan data dijaga oleh **Security Rules** + akun Auth.
- Batasi API key: Google Cloud Console → *APIs & Services* → *Credentials* → key "Browser key" → *Website restrictions* → tambahkan `presensi-ma-7c521.web.app/*` dan `presensi-ma-7c521.firebaseapp.com/*`.
- Admin tambahan: buat user di *Authentication*, lalu di Realtime Database tambahkan `roles/<UID>` = `"admin"`.
- Reset PIN membuat akun Auth baru; akun lama kehilangan akses otomatis. Bersihkan akun lama sesekali lewat notebook bila perlu.

## Peran
| Peran | Dibuat oleh | Ringkas |
|---|---|---|
| `admin` | Firebase Console | Kelola siswa, jadwal, alat, akun pimpinan/staf, backup (TU). Kesiswaan, izin, presensi, dan kalender **hanya lihat** (v2.5.2). |
| `kepala`, `waka`, `piket` | Admin, di Pengaturan → "Akun Pimpinan & Staf" | `kepala`/`waka`: modul kesiswaan penuh (waka juga presensi per jam). `piket`: **akun bersama** meja piket, hak sangat sempit. |
| `device` | Console | Alat ESP32; hanya menulis tap/log/status, tidak dapat menghapus. |

**Guru Piket.** Tiap sesi/tab baru wajib memilih nama petugas dari daftar (menu *Petugas piket* milik Waka/Admin). Nama itu **deklarasi mandiri**, bukan autentikasi: akun dipakai bersama. Piket hanya dapat: Izin/Sakit/Dispensasi seharian dan per jam (S/I/D; sel **A** hanya Waka), serta pelanggaran **Ringan atau bertakziran** dari tata tertib. Setiap izin wajib berketerangan dan mencatat apakah surat fisik diterima (`izinMeta`); arsip surat disimpan manual. Jendela input mundur diatur Waka (default 2 hari); izin terencana maksimal 7 hari ke depan.
Keterbatasan rules (tanpa Cloud Functions): `hariKe` yang dikirim klien dibandingkan dengan jam server, tetapi kecocokannya dengan tanggal data tidak dapat diverifikasi rules.

**Log aktivitas (Tahap B).** Setiap tulisan akun piket WAJIB disertai entri `activity/{tgl}/{id}` (dan `activityLast/{uid} = {id, ts, tgl}` dengan `ts === now`) pada update multi-path yang sama; ini **ditegakkan Security Rules**, bukan hanya UI. `izinMeta` piket memakai kunci `<idLog>_<H|S|I|D>` dengan `ts === now`, sehingga meta lama tidak dapat dipakai ulang. Identitas = nama petugas yang dipilih sendiri + `deviceId` acak (localStorage) + label perangkat (tanpa IP/lokasi). Halaman *Log aktivitas* (Admin & Waka): filter tanggal/peran/akun/petugas/perangkat/siswa/aksi, badge "Perangkat baru", ringkasan harian, CSV. Waka/Admin dapat **mengunci** akun piket (menghapus `roles/{uid}`; sesi aktif langsung keluar) dan membukanya lagi; reset password akun piket hanya Admin.
**Batas 100 koneksi (Spark).** Portal orang tua tidak menahan koneksi realtime: `services/koneksi.ts` membuka koneksi (`goOnline`) hanya selama pembacaan lalu `goOffline()`. Halaman staf tetap realtime.
**Backup.** Pengaturan admin menampilkan pengingat "Backup terakhir" + tautan ke Firebase Console > Realtime Database > Ekspor JSON; admin menandai manual.

**Presensi manual.** Siswa yang HADIR tetapi tidak tercatat alat (KTM lupa/hilang, kartu rusak, alat/WiFi mati) dicatat piket atau waka di node TERPISAH `manualTap/{tgl}/{nis}` (+ salinan `manualTapByStudent/{nis}/{tgl}` untuk portal orang tua). Jalur tulis alat (`attendance/*/masuk|status|pulang`, `log/*`) tidak berubah. Aturan penggabungan ada di satu tempat, `src/lib/manual.ts` (`statusHarian`, `gabungTap`, `gabungRec`): **data alat selalu menang**; manual hanya mengisi masuk/pulang yang kosong dan ditandai "diabaikan (ada tap alat)" bila tidak terpakai. Status Hadir/Terlambat dihitung dari jam dan jadwal kelas. Alasan: Lupa KTM, KTM hilang, Kartu rusak, Alat bermasalah, Lainnya. "Lupa KTM" dan "KTM hilang" menghasilkan saran pelanggaran "Lupa membawa KTM" / "Menghilangkan KTM" (`autoMap.lupaKtm|ktmHilang`; bila belum dipetakan dicari lewat nama aturan di master). Mode *alat bermasalah*: pilih kelas, seluruh siswa yang belum tercatat ditandai hadir sekaligus kecuali yang dicentang. Rules: piket menulis dengan jendela N hari, tanpa masa depan, log aktivitas wajib, tidak menimpa entri waka, ditolak bila Alfa sudah divalidasi; hari Minggu ditolak berdasarkan `hariKe` (rules tidak dapat mencocokkan `hariKe` dengan kunci tanggal). Kepala dan admin hanya melihat.

**Dispensasi** = siswa mewakili sekolah; dihitung **hadir** pada persentase. Kode per jam: `A` alfa, `I` izin, `S` sakit, `D` dispensasi.

**Wali Kelas (`wali`, v2.3 Tahap 1).** Akun per guru (bukan akun bersama), masuk lewat tab Admin ke `/wali`. Admin membuat akun dengan kelas utama (`staff/{uid}/kelasUtama`) dan kelas tambahan (`staff/{uid}/kelasTambahan/{kelas}: true`, hanya admin); Waka dapat membuat akun dan mengatur kelas utama saja. Cermin `waliAkun/{uid}` dipakai untuk tampilan Waka/Kepala karena Waka tidak boleh membaca `staff`. Wewenang ditegakkan rules lewat indeks `siswaKelas/{nis}` (kunci kelas = `encodeKelas`, ditulis admin pada update yang sama dengan data siswa) dan helper `waliDari($nis)`: baca data siswa binaan, Izin/Sakit seharian, pelanggaran Ringan/bertakziran dari master (sumber `wali`), dan hapus catatan sendiri; semuanya wajib disertai log aktivitas. Dispensasi, sel per jam, Alfa, presensi manual, Sedang/Berat tanpa takziran, remisi langsung, master, kalender, dan siswa kelas lain ditolak. Uji: `npm run test:mutation:wali`.

**Pembinaan dan usulan remisi (v2.3 Tahap 2).**
- `discipline/levels/{id}/penanggungJawab` (`wali` | `bk` | `kepala` | `waka`), diatur waka/kepala di *Tata tertib > Ambang pembinaan*. Data lama tanpa field ini diisi lewat tombol **Isi penanggung jawab bawaan** (lv01 wali, lv02 BK, lv03 Kepala, lv04-06 Waka). Daftar "Perlu dibina" memakai HANYA ambang berpenanggung jawab `wali`.
- **Perlu dibina** (`src/lib/pembinaan.ts`, fungsi murni): saldo TA berjalan pernah melewati ambang (puncak saldo berurutan, bukan hanya saldo akhir) DAN belum ada pembinaan `selesai` untuk (TA, ambang). Saldo yang kemudian turun tetap tampil ("saldo sudah turun") sampai dibina. Lencana di menu wali.
- `pembinaan/{nis}/{ta}_{levelId}` (satu catatan per TA dan ambang; tidak bisa dihapus fisik): `levelPoin` disalin dari ambang dan tidak berubah; wali hanya untuk siswa binaan + ambang berpenanggung jawab wali + log aktivitas; setelah `selesai` hanya waka/kepala yang boleh mengoreksi. Salinan `pembinaanStatus/{nis}/{ta}/{levelId}` (`id, status, tanggal, levelPoin`, tanpa isi dan tanpa nama) ditulis pada update yang SAMA dan diperiksa konsisten oleh rules di dua arah; orang tua hanya membaca salinan ini.
- `usulRemisi/{id}`: wali membuat (status `menunggu`, siswa binaan, nama/poin sama dengan master aktif, log aktivitas) dan membatalkan usulan sendiri yang menunggu; waka/kepala memutuskan SEKALI. Setuju = record remisi `sumber: "usul-wali"` (id = id usulan) + `recordMeta` + audit + keputusan dalam satu update; rules menolak record `usul-wali` tanpa usulan yang disetujui pada update itu (dan hanya bila usulan sebelumnya `menunggu`). Dua keputusan serentak: tepat satu berhasil.
- Remisi "Tanpa prestasi" tetap hanya untuk siswa yang punya catatan pelanggaran di TA ini (divalidasi UI wali dan UI waka/kepala).

**Pemeriksa konsistensi "Indeks kelas" (admin).** `src/lib/konsistensi.ts` membandingkan `config/students` dengan indeks `siswaKelas` (baru/berubah/usang) dan `staff` + `roles` dengan cermin `waliAkun`. Berjalan otomatis saat Dashboard admin dan halaman Wali kelas dibuka; **Perbaiki** menampilkan pratinjau (dry-run) lalu menulis ulang dari sumber (data dibaca ulang saat menerapkan), tercatat di log aktivitas (`perbaiki-indeks`). *Wali kelas per tahun ajaran* menyinkronkan `siswaKelas` pada update yang sama dengan pemetaan wali. Skrip/notebook migrasi menulis `siswaKelas/{nis}` bersama `config/students` (dalam satu update; kunci kelas sama dengan web) dan melaporkannya di dry-run.

## Security Rules
`database.rules.json` **dihasilkan** dari `scripts/build-rules.mjs` (`npm run rules`; otomatis saat `npm run build`/`deploy`). Jangan mengedit JSON-nya langsung.

## Uji
Butuh Java (emulator Database) dan, untuk E2E, `npx playwright install chromium`.
| Perintah | Isi |
|---|---|
| `npm run test:unit` | Logika murni: per jam, saran otomatis, kehadiran (Dispensasi), aturan piket, label perangkat, rekap per jam (Minggu diabaikan), jangkar tanggal E2E |
| `npm run test:rules` | Security Rules di Emulator (semua peran + jalur firmware alat) |
| `npm run test:mutation` | Merusak rules satu per satu; suite WAJIB gagal (mutasi ekuivalen terdokumentasi) |
| `npm run test:mutation:manual` / `:piket` / `:saran` / `:kalender` / `:wali` / `:pembinaan` / `:perjam` / `:dasar` | Mutasi per kelompok (juga `npm run test:mutation --grup=manual`). Gunakan ini saat iterasi. |

**Catatan mutasi:** runner mutasi (`tests/mutation.mjs`) mengelola emulatornya sendiri (bukan `emulators:exec`) agar tidak macet: emulator **direstart tiap 15 mutan** (`MUTASI_RESTART_N`) dan tiap pindah kelompok, namespace uji dihapus setelah tiap mutan, tiap mutan dibatasi **90 detik** (`MUTASI_TIMEOUT_MS`); mutan yang habis waktu ditandai TIDAK TERVERIFIKASI, emulator direstart, lalu mutan itu **diulang otomatis di akhir** pada emulator baru. Hasil run tetap TIDAK VALID bila canary (rules bocor sengaja) tidak tertangkap atau hash rules di emulator tidak cocok.

**Aturan pemakaian:** untuk rilis kecil cukup jalankan mutasi kelompok yang disentuh (`test:mutation:<grup>`); mutasi penuh hanya sebelum deploy besar.
| `npm run test:e2e` | Playwright terhadap emulator, viewport desktop **dan** HP. Tidak menyentuh produksi. |

## Rollback
| Yang dipulihkan | Cara |
|---|---|
| **Rules** | Firebase Console > Realtime Database > Rules > tombol riwayat (Rules history) > pilih versi lama > Publish. Atau dari source: `git checkout <tag> -- database.rules.json` lalu `npx firebase-tools deploy --only database`. |
| **Hosting** | Firebase Console > Hosting > Release history > menu ⋮ pada rilis lama > **Rollback**. |
| **Source** | `git tag` untuk daftar rilis, `git checkout <tag>` untuk melihat/memulihkan (mis. `v2.0-piket-b`). Buat cabang dulu bila ingin melanjutkan kerja: `git switch -c perbaikan <tag>`. |
| **Data** | Ekspor JSON manual dari Console (lihat pengingat "Backup terakhir" di Pengaturan admin). Rollback rules/hosting tidak mengembalikan data. |

Catatan: `releases/` (snapshot dist + rules) tidak ikut Git. Source selalu dipulihkan dari tag Git; build ulang dengan `npm ci && npm run build`.

## Hari efektif berbasis bukti (v2.2)
Sebuah tanggal adalah **hari efektif** hanya bila ada bukti sekolah berlangsung dan sistem merekam; hari tanpa bukti (libur, alat mati seharian, sistem belum dipakai) **tidak dihitung** dan siswa tidak menjadi Alpha. Aturan, berurutan:
1. **Override kalender** `kalender/{tgl}` (`libur` | `efektif` + alasan; waka/admin) menang atas semua aturan otomatis.
2. Tanpa override: Minggu = libur; selain itu efektif bila **tap masuk alat + siswa hadir hanya lewat presensi manual >= ambang** (`sistem/ambangHariEfektif`, bawaan 1, 1..500, diubah waka/admin di halaman Kalender).
3. Izin/Sakit/Dispensasi saja **tidak** membuat hari efektif. Pada hari efektif tetap dihitung sesuai kategorinya.
4. Hari ini "berjalan": menjadi efektif begitu ambang tercapai; siswa belum tap tetap "Belum tap" sampai batas jam terlambat lewat DAN hari efektif.
5. Siswa baru: dihitung sejak `profiles/{nis}/aktifSejak` (diisi saat siswa ditambahkan; siswa lama = tanggal efektif pertama lewat migrasi).

**Ringkasan agregat** `kalenderEfektif/{tgl} = {efektif, tap, manual, sumber, rendah?, normal?, dihitung}` dibaca semua pengguna login (orang tua tidak boleh membaca `log`), ditulis klien staf: otomatis untuk hari-hari yang belum punya ringkasan (maks. 31 hari ke belakang) saat Dashboard dibuka; hari ini saat status efektif berubah dan (setelah jam pulang) saat jumlah berubah; tombol **Hitung ulang** (admin/waka); **Migrasi sekali jalan** (admin, dry-run dulu). Rules menegakkan konsistensi: override tidak dapat ditimpa hitungan otomatis, dan `efektif=true` otomatis butuh `tap+manual >= ambang`. Data diambil dengan query rentang kunci (bukan seluruh node `log`).

**Tap rendah:** bila tap < 50% median 10 hari efektif sebelumnya (butuh >= 3 pembanding), tanggal ditandai `rendah`: banner di Dashboard, validasi Alfa dan saran Alfa ditahan sampai waka menekan **Konfirmasi hari ini normal**.

**Satu rumus:** `rekapSiswa()` di `src/lib/hariEfektif.ts` dipakai di semua tempat (portal orang tua, laporan bulanan/CSV, rekap tahunan). Identitas yang diuji: Tepat + Terlambat + Izin/Sakit + Dispensasi + Alpha = hari efektif siswa; persen = (Tepat + Terlambat + Dispensasi) / hari efektif siswa, "–" bila 0 hari. `rekap()`/`rekapBulan()` lama dihapus.

## Presensi per jam: Alfa oleh piket dan kode turunan (v2.3.1)
- **Penanda pengisi** per sel: `lessons/{tgl}/{kelas}/absenOleh/{nis}/{jam}` = `"piket"` | `"waka"`, ditulis pada update yang sama dengan sel dan ikut terhapus saat sel dikosongkan; sel lama tanpa penanda dianggap `"waka"`. `absenInfo/{nis}/{jam}` = `{petugas, ts, hariKe}` (hanya tampilan tooltip "Diisi piket: nama, jam"; `ts === now`). Salinan `lessonsByStudent` tidak memuat penanda (rules mengambil kunci kelas dari `siswaKelas/{nis}`).
- **Piket**: S/I/D seperti biasa (jendela mundur, keterangan + `izinMeta`). **A (Alfa) hanya untuk hari ini**: penanda `"piket"`, `absenInfo.hariKe` = hari server saat ini, log aktivitas aksi `alfa-jam`, tanpa `izinMeta`. Ubah/hapus A hanya bila penandanya `"piket"` dan `absenInfo.hariKe` tersimpan masih hari ini (jadi A kemarin terkunci). A milik waka atau tanpa penanda tidak dapat disentuh. Mengganti S/I/D menjadi A hari ini boleh. **Waka** menimpa apa pun dan selalu menulis penanda `"waka"` (penanda `"piket"` yang basi ditolak). Kepala/admin/wali hanya membaca.
- **Keterbatasan:** rules tidak dapat memverifikasi bahwa kunci tanggal sel cocok dengan `hariKe` yang diklaim klien (sama dengan jendela waktu piket lain); yang terjamin server adalah bahwa A hanya dapat diubah pada hari yang sama dengan saat ia diisi.
- **Keterangan harian**: rules menolak penulisan sel per jam (sel dan salinan, oleh siapa pun) untuk siswa/tanggal yang ber-`ket` harian Izin/Sakit/Dispensasi.
- **Kode turunan** (`src/lib/turunan.ts`, tidak ditulis ke database): baris siswa yang status hariannya Alfa seharian (rumus `rekapSiswa`: hari efektif, tanpa tap/manual/keterangan, batas jam terlambat lewat) menampilkan A jam 1-9, dan keterangan harian menampilkan I/S/D, terkunci untuk semua peran. Sebelum batas jam terlambat tampil "Belum tap" dan sel diisi seperti biasa. Hilang otomatis bila ada tap, presensi manual, atau izin.
- **Alfa seharian bukan pelanggaran otomatis**: saran "alfa" dan pemetaan `autoMap.alfa` dihapus dari UI (data lama diabaikan). Saran lain (terlambat, tanpaTapPulang, bolosJam, lupaKtm, ktmHilang) tetap hanya saran dan tidak pernah dipicu siswa tanpa tap masuk.
- **Laporan per jam** memisahkan "A per jam (bolos)" dan "Alfa seharian (hari)"; portal orang tua menampilkan Alfa seharian satu baris.
- Uji: `npm run test:mutation:perjam`, `tests/turunan.test.mjs`, `tests/perjam.test.mjs`.

## Bukti hadir paling awal, jam manual, dan kunci tap pertama (v2.4-a)
- **Aturan status harian:** jam masuk resmi = bukti **paling awal** antara tap alat (`attendance/{nis}/{tgl}/masuk`) dan presensi manual (`manualTap/{tgl}/{nis}/masuk`); seri = alat. Hadir/Terlambat dihitung ulang dari jam itu terhadap jadwal kelas (`statusDariJam`), bukan dari `status` alat. Jam pulang: alat menang, manual hanya mengisi yang kosong. Semua tampilan memakai `gabungTap`/`statusHarian`/`rekapSiswa`, jadi ikut otomatis. Contoh: siswa lupa KTM dicatat manual 07:05, lalu tap alat 07:40 -> tetap **Hadir** ("Tap alat 07:40 setelah presensi manual 07:05").
- **Jam manual diketik piket:** `masuk` (jam diketik) + `ts` (waktu dicatat, server) + `masukDetik` (angka, dicocokkan rules dengan `masuk` per jam/menit/detik). Jam tidak boleh melewati waktu dicatat, tidak boleh sebelum awal jendela Masuk dikurangi 60 menit (pemeriksaan klien), dan bila selisih > 15 menit entri **wajib** bertanda `mundur: true` (rules, toleransi 60 dtk untuk selisih jam klien). Tanggal lampau selalu `mundur`. Waka bebas (koreksi tanpa batas). Dashboard waka: kartu "Presensi manual dengan jam dimundurkan"; laporan Log harian dan log aktivitas memuat jam diketik dan jam dicatat.
- **Kunci tap pertama (rules, jalur alat):** `attendance/*/*/masuk|status|pulang` dan `log/{tgl}/{uid}_M|_P` hanya ditulis alat bila belum ada atau nilainya identik (retry antrian lolos). Analisis dampak pada firmware v12: [docs/ANALISIS_KUNCI_TAP_PERTAMA.md](docs/ANALISIS_KUNCI_TAP_PERTAMA.md).
- **Batasan yang diketahui:** rules tidak dapat menghitung `hariKe` dari kunci tanggal; `mundur` dibandingkan dengan jam hari (WIB) saat penulisan, sehingga entri berklaim `hariKe` hari ini untuk tanggal lain tidak terdeteksi lewat Console (sama seperti klaim `hariKe` di tempat lain). E2E memakai jam server palsu (16:00): jam manual yang diketik harus konsisten dengan jam nyata mesin uji (jalankan setelah ~07:30 WIB).
- **Urutan deploy:** rules dulu, lalu hosting **segera** (klien lama tanpa `masukDetik` ditolak rules baru untuk presensi manual dengan jam masuk).

## Peran BK / Guru Bimbingan Konseling (v2.4-b)
Akun PER GURU (role `bk`), dibuat admin atau waka di menu **Guru BK**; login lewat tab Admin ke `/bk`. Wewenang LINTAS SEMUA KELAS (siswa harus terindeks di `siswaKelas`), setiap tulisan berlog aktivitas.
| Aksi | BK |
|---|---|
| Lihat semua siswa: kehadiran, per jam, poin, saldo & level, riwayat pembinaan (tanpa PIN/UID kartu/log tap) | ya |
| Catat pembinaan untuk ambang `penanggungJawab: "bk"` (node `pembinaan` + `pembinaanStatus`) | ya |
| Catat pelanggaran Ringan/bertakziran dari master (`sumber: "bk"`) | ya |
| Usul remisi (diputuskan waka/kepala, node `usulRemisi`) | ya |
| Catatan konseling rahasia (`konseling/{nis}/{id}`) | tulis + baca |
| Izin, per jam, Alfa, presensi manual, master, kalender, akun | tidak |
- **Konseling:** baca = BK + Kepala; tulis = BK pembuat catatan. Waka, admin, wali, piket, orang tua, dan alat DITOLAK (juga lewat Console). Tidak ada hapus fisik; koreksi = ubah + entri `konselingAudit/{nis}/{idLog}` (isi LAMA) pada update yang sama (baca BK + Kepala; terpisah dari audit umum). Log aktivitas hanya mencatat bahwa catatan dibuat/dikoreksi: tanpa isi, topik, nama, atau NIS siswa. Kepala membaca lewat menu **Konseling** (hanya baca).
- **Keputusan desain (konfirmasi bila ingin diubah):** BK lain dapat MEMBACA semua catatan konseling, tetapi hanya pembuat yang dapat mengoreksi. Portal orang tua tidak pernah memuat konseling.
- Uji: `npm run test:mutation:bk`, `tests/konseling.test.mjs`, blok "BK" di `tests/rules.test.mjs`, E2E "bk: ...".
- Daftar "Perlu dibina (BK)" + lencana menu memakai data kedisiplinan seluruh siswa (satu langganan per node, bukan per siswa).

## Status pengerjaan v2.4 (mode FITUR DULU; belum di-tag, belum di-deploy)
Branch `v2.4`. Fitur v2.4-a (bukti hadir paling awal, jam manual, kunci tap pertama) dan v2.4-b (peran BK, konseling rahasia, opsi Guru BK di Pengaturan) sudah ditulis. Coba lokal tanpa menyentuh produksi: `npm run dev:emu` (emulator + data uji + akun contoh; lihat keluaran terminal).
Pemeriksaan per fitur yang sudah dijalankan: `tsc` + build, uji unit, `npm run test:rules` (1930 lolos). Hasil pendukung yang sempat dijalankan sebelum mode ini: E2E desktop+HP 86/86 (v2.4-a + BK), mutasi `alat` 7/7, `bk` 60/60 (+1 ekuivalen), `piket` 53/53, `dasar` 28/28.
**Uji yang DITUNDA ke fase pengujian akhir** (jalankan setelah semua fitur selesai, di emulator bersih):
- mutasi: `manual` (setelah perubahan v2.4-a, hasil terakhir belum final), `saran`, `dasar`, `wali`, `pembinaan`, `piket`, `alat`, `bk`, `kalender`;
- E2E penuh desktop+HP dan mobile 5x berturut-turut ("admin: kesiswaan hanya lihat"); E2E v2.4-a memerlukan jam nyata mesin sekitar 08:30 WIB atau lebih (rules memakai jam nyata);
- uji fisik ESP32 (tap masuk, tap kedua tidak menimpa, retry setelah WiFi putus, Serial Monitor tanpa DITOLAK untuk tap pertama);
- snapshot `releases/v2.4`, CARA-DEPLOY v2.4, merge ke `main`, tag `v2.4`.

### Status uji v2.3.1 (tag `v2.3.1-deployed`)
Dijalankan sebelum tag: unit semua berkas, rules 1618 lolos, mutasi **hanya kelompok yang disentuh** (perjam 30/30, piket 53/53 + 3 ekuivalen, dasar 28/28 + 2 ekuivalen), E2E desktop+HP 78/78, mobile 5x berturut-turut 39/39. Mutasi kelompok **wali, pembinaan, manual, saran, kalender** tidak dijalankan ulang untuk v2.3.1 (tidak disentuh; terakhir bersih pada v2.3) dan ikut tercakup oleh regresi v2.4. Hash rules ter-deploy: `40215ca1dd2647225e199be961f6b5acbfd2a6f63957f3aac55c9bf0bb8cb372`.

## Pembinaan berperingkat, klaim BK, dan izin orang tua (v2.5)

Branch `v2.5` (belum di-tag, belum di-deploy). Mode kerja "fitur dulu": uji mutasi, E2E, dan mobile 5x ditunda (lihat "Uji tertunda v2.5").

**Ambang dan penanggung jawab.** lv01 wali, lv02 BK, lv03 sampai lv06 Kepala (lv04 sampai lv06 sebelumnya waka). Waka tidak punya level sendiri. Hanya Kepala yang dapat mengubah `penanggungJawab`, dan hanya selama ambang belum dipakai: record pembinaan pertama menulis `discipline/levelTerpakai/{levelId}: true` pada update yang sama (dipaksa rules), lalu penanggung jawab terkunci. UI Tata tertib menonaktifkan pilihan itu bagi waka dan untuk ambang terpakai. Waka tetap mengubah poin dan tindakan.

**Hierarki baca** (`wali 1 < bk 2 < waka 3 < kepala 4`; admin tidak ikut). Peringkat ada di path: `pembinaan/{wali|bk|kepala}/{nis}/{ta}_{levelId}`, karena RTDB tidak memfilter isi daftar. Field `pj` ikut tersimpan, sama dengan jalurnya, dan tidak dapat diubah.

| Pembaca | wali | bk | kepala |
|---|---|---|---|
| wali (siswa binaan) | ya | tidak | tidak |
| BK | ya | ya | tidak |
| waka | ya | ya | tidak |
| kepala | ya | ya | ya |
| admin, piket, ortu, alat | tidak | tidak | tidak |

Penulis: wali (jalur wali), BK pemegang klaim (jalur bk), kepala (jalur kepala). Waka tidak membuat record. Setelah `selesai`, hanya waka (jalur wali/bk) dan kepala (semua) yang mengoreksi, dengan aksi log `koreksi-pembinaan` yang `detail`-nya adalah alasan murni (10 sampai 300 karakter). Pembacaan di aplikasi per kelompok: `bacaPembinaanSiswa(nis, peran)` di `src/services/pembinaanLanjut.ts`. Admin tidak lagi membaca pembinaan: menu rekap hilang dan lembar cetak tidak merender bagian pembinaan untuk admin.

**Klaim BK** (`klaimBK/{nis}/{ta}_{levelId}`): BK mengklaim hanya bila node belum ada (dua klaim serentak: tepat satu menang, teruji). Lepas klaim (aksi `lepas-klaim-bk`, alasan murni di `detail`, hanya sebelum pembinaan `selesai`). Waka/kepala menunjuk (`tunjuk-bk`) atau memindahkan (`pindah-bk`, alasan wajib) ke BK yang `bkAkun/{uid}/aktif`. Pembinaan lama tetap atas nama pembuatnya; BK baru melanjutkan pada record yang sama. Panel BK: Belum ditangani, Tangani saya, Ditangani BK lain; lencana = dua kelompok pertama. Usul remisi BK hanya untuk siswa yang ia klaim (field `klaimKey`).

**Izin orang tua** (bawaan: tersembunyi). `izinOrtu/{nis}/{ta}/{levelId}` (mode `ringkas` atau `lengkap`), `kunciOrtu` (hanya kepala), penanda baca-saja `izinOrtuAda`, dan proyeksi `pembinaanOrtu` yang dibaca orang tua (tanpa nama pembina, uid, konseling, atau klaim). Rules menegakkan konsistensi dua arah: proyeksi hanya ada bila izin ada dan sama persis dengan record; setiap tulis record yang punya izin aktif wajib memperbarui proyeksi pada update yang sama; mencabut izin menghapus proyeksi. Waka: level wali/BK yang tidak terkunci, hanya mencabut izin buatannya. Kepala: semua; membatalkan izin waka mengunci level (kunci + hapus izin dalam satu update); hanya kepala membuka kunci. `pembinaanStatus` dihapus. Dampak yang disengaja: orang tua yang tadinya melihat status pembinaan lv01 tidak melihat apa pun sampai diizinkan.

**Konseling.** Baca: hanya akun BK (semua BK). Kepala, waka, admin, wali, piket, ortu, alat: tidak (Permendikbud 111/2014). Tulis: BK untuk siswa terindeks mana pun (tanpa klaim). Koreksi hanya oleh pembuat lewat `konselingAudit`. Log aktivitas hanya aksi dan NIS. Admin SDK (notebook, skrip migrasi, backup) melewati rules: akses kredensial Admin SDK sama dengan akses data konseling.

**BK dan pelanggaran.** BK tidak lagi mencatat atau menghapus pelanggaran. Catatan lama bersumber `bk` tetap sah, terbaca, dan dihitung.

**Whitelist baca BK** (tanpa tulis): `config/students` tidak termasuk. Dibuka: `siswaKelas`, `profiles`, `attendance`, `lessonsByStudent`, `manualTapByStudent`, `validasiByStudent`, `discipline/records`, `discipline/recordMeta`, `discipline/levels`, `discipline/rules`, `discipline/remisi`, `discipline/settings`, `kalenderEfektif`, `pembinaan/wali`, `pembinaan/bk`, `klaimBK`, `bkAkun`, `izinOrtuAda` (siswa terindeks), `konseling`, `konselingAudit`. Tertutup: `parents` (PIN), `staff`, `roles` orang lain, `device`, `piket*`, `manualTap`, `izin`, `validasi`, `lessons`, `activity`. Catatan: `izin`, `validasi`, dan `lessons` sengaja tidak dibuka (keputusan v2.4: BK memakai salinan per siswa). Audit `profiles` per field (v2.5.1): hanya `nama`, `kelas`, dan `aktifSejak` (ditulis admin/skrip migrasi; tidak ada kontak atau identitas orang tua, yang ada di `parents` dan tertutup bagi BK), semuanya dibutuhkan daftar siswa dan laporan BK, sehingga tidak ada yang ditutup. Data produksi tidak diperiksa dari sini: sebelum deploy, periksa di Firebase Console bahwa `profiles/*` memang hanya berisi tiga field itu.

**Migrasi (Kepala, menu Migrasi pembinaan):** pratinjau dry-run (jumlah per kelompok, ambang diubah, record tak bisa dipindah), lalu terapkan: ambang `waka`/kosong menjadi kepala atau bawaan; record lama dipindah per batch 20 (tulis jalur baru + hapus jalur lama + penanda terpakai dalam satu update); `pembinaanStatus` dihapus. Semua berlog `migrasi-pembinaan`. Aman diulang. Urutan deploy: rules dulu (`--only database`), lalu hosting, lalu jalankan migrasi sekali sebagai Kepala. Selama belum migrasi, record lama tidak terlihat di rekap baru.

**Uji v2.5 yang sudah dijalankan:** `tsc` dan `npm run build` bersih; `npm run test:unit` lolos (termasuk `tests/bk.test.mjs`); `npm run test:rules` 2177 lolos, 0 gagal.

**Uji tertunda v2.5** (fase pengujian akhir): mutasi semua grup (mutan lama untuk `pembinaan`, `bk`, dan `wali` merujuk struktur sebelum v2.5 dan perlu disusun ulang; grup baru klaim/izin/migrasi belum ada); E2E desktop dan HP (alur BK, izin orang tua, kunci, migrasi, dan opsi Guru BK perlu diperbarui karena menu Pelanggaran BK dan Konseling Kepala dihapus); mobile 5x; `npm run test:migrasi`; E2E v2.4-a pada jam nyata setelah 08:30 WIB.

## Laporan wali/BK, hapus akun permanen, dan lencana pembinaan (v2.5.1)

Branch `v2.5.1` (dari `v2.5`, belum di-tag, belum di-deploy).

**Laporan wali kelas dan BK** (menu Laporan di `/wali` dan `/bk`). Satu baris per siswa untuk periode (maks. 1 tahun ajaran): hari efektif, Hadir, Terlambat, Izin, Sakit, Dispensasi (dihitung hadir), Alpha, persen, A/I/S/D per jam, poin, remisi, saldo, puncak saldo, level, dan status pembinaan (status + tanggal saja) untuk level yang boleh dibaca peran itu (wali: level wali; BK: wali + bk). Rumus tidak diduplikasi: `rekapSiswa`, `rekapPerJam`, `ringkas`, `puncakSaldo` dipakai ulang (`src/lib/laporanWaliBk.ts`, fungsi murni). Tanpa PIN, UID kartu, log tap, catatan internal, isi pembinaan, konseling, klaim, atau nama BK. **Tanpa perubahan rules baca**: data dari salinan per siswa yang sudah boleh dibaca (`attendance/{nis}`, `manualTapByStudent`, `validasiByStudent`, `lessonsByStudent`, `profiles`), query rentang kunci tanggal, dibaca SEKALI saat Tampilkan. Perkiraan untuk BK dengan 500 siswa: 4 permintaan per siswa (sekitar 2000 permintaan lewat satu koneksi, 16 paralel) dan sekitar 3 sampai 5 MB per ekspor satu bulan; RTDB Spark menagih bandwidth, bukan jumlah permintaan. Level tercapai memakai puncak saldo. CSV: `formatCSV`/`downloadCSV` kini punya parameter pemisah (bawaan "," sehingga laporan lama tidak berubah); laporan wali/BK memakai ";" (BOM + CRLF, nilai dikutip). Berkas `laporan_<peran>_<kelas|semua>_<dari>_<sampai>.csv`. Cetak memakai `window.print()`. Setiap ekspor mencatat log `ekspor-laporan` (peran, kelas, periode, jumlah siswa; tanpa NIS/nama).

**Hapus akun staf permanen (tetap Spark, tanpa Cloud Functions).** Admin menandai akun yang SUDAH DICABUT (tombol Tandai hapus permanen di Wali kelas, Guru BK, dan Akun Pimpinan dan Staf; alasan 10 sampai 300 karakter + ketik email): `hapusAkun/{uid}` + log `tandai-hapus-akun` dalam satu update; dapat dibatalkan (`batal-hapus-akun`). Rules: hanya admin, bukan akun sendiri, `roles/{uid}` sudah tidak ada, peran/email/nama harus sama dengan `staff/{uid}`, wajib log. Catatan: "Cabut akses" untuk kepala/waka/piket menghapus `staff/{uid}` sekaligus. Dialog cabut punya kotak centang OPSIONAL "Tandai juga untuk hapus permanen" (bawaan TIDAK dicentang; tanpa centang cabut berperilaku persis seperti sebelum v2.5.1; dengan centang alasan 10 sampai 300 karakter wajib dan tanda ditulis dalam update yang sama). Akun kepala/waka/piket yang sudah dicabut sebelum v2.5.1 tidak memiliki jejak di database: hapus lewat Firebase Console (Authentication, Users, titik tiga, Delete account); langkahnya ada di PANDUAN_ADMIN.md. Penghapusan nyata: `python scripts/hapus_akun.py` (fungsi `hapus_akun_permanen`; juga sel "Hapus akun permanen" di `Setup_Migrasi_Firebase.ipynb`, disinkronkan oleh `python scripts/sync_notebook.py`). **Dry-run bawaan**; baru menghapus bila `dry_run=False` dan operator mengetik `HAPUS`. Skrip memeriksa ulang (Admin SDK melewati rules): roles sudah kosong, bukan admin/alat/akun sendiri, peran sah, dan untuk BK tidak ada klaim aktif (klaim yang pembinaannya belum selesai; daftar nis + kunci dicetak). Urutan per akun: hapus akun Authentication (user-not-found dianggap sudah terhapus), lalu satu update: hapus `staff`, `roles`, `waliAkun`, `bkAkun`, `piketAkun`, `hapusAkun` untuk uid itu, tulis `hapusAkunRiwayat/{uid}`, dan log `hapus-akun-permanen` (deviceId `skrip-lokal`, bentuk sama dengan entri web). Jejak audit tetap (activity, pembinaan, konseling, disiplin, usulRemisi, izinMeta). **Penghapusan TIDAK BISA dibatalkan dan email menjadi bebas dipakai ulang.** Idempoten. Penghalang wali: kelas binaan wali yang sudah dicabut hanyalah sisa pemetaan, jadi tidak memblokir; yang diblokir adalah akun yang masih memiliki role. Di halaman Guru BK versi waka tiap akun menampilkan "Klaim aktif: N", dan mencabut BK yang masih memegang klaim membuka dialog berisi daftar siswa + tombol ke Penugasan BK (peringatan UI, bukan blokir rules). Admin tidak mendapat hak baca baru.

**Lencana pembinaan.** `PembinaanDataProvider` (`src/kesiswaan/PembinaanData.tsx`) satu-satunya tempat langganan data pembinaan skala sekolah untuk waka dan kepala: `discipline/records`, `recordMeta`, `levels`, `klaimBK`, `pembinaan/bk` (+ `pembinaan/kepala` hanya kepala). Halaman Pembinaan, Penugasan BK, Izin ke orang tua, Guru BK, dan lencana menu memakai data yang sama. Kepala: bagian "Perlu dibina (Kepala)" (ambang Kepala, puncak saldo dan "saldo sudah turun" sama dengan wali/BK) dengan tombol Catat pembinaan per baris; lencana `/kepala/pembinaan` = jumlah belum selesai. Lencana `/waka/penugasan-bk` dan `/kepala/penugasan-bk` = siswa BK belum selesai dibina dan belum punya klaim. Admin, wali, BK, dan piket tidak berlangganan. **Ukuran unduhan awal terukur** (`tests/ukur-unduhan.mjs`, emulator, 500 siswa, 2139 catatan, 25 klaim, 50 pembinaan BK, 13 pembinaan kepala): waka 726,5 KB JSON mentah (sekitar 54 KB gzip); kepala 730,8 KB (sekitar 54 KB gzip). Hampir seluruhnya `discipline/records` (421,5 KB) dan `recordMeta` (282,7 KB); skala kira-kira linear terhadap jumlah catatan disiplin.

**Uji v2.5.1 yang sudah dijalankan:** `tsc` dan `npm run build` bersih; `npm run test:unit` lolos (termasuk `tests/laporan.test.mjs`: CSV kedua pemisah dan escape, rekap, persen, kolom terlarang, lencana, klaim aktif); `npm run test:rules` 2272 lolos, 0 gagal (hapusAkun termasuk jalur cabut dengan dan tanpa tanda, aksi log baru, tanpa hak baca baru); `npm run test:migrasi` 97 + 41 lolos (termasuk: setelah wali dicabut dan dihapus skrip, konsistensi staff/roles/waliAkun bersih dan kelasnya langsung dapat diberikan ke wali baru tanpa konflik waliPemegangKelas) (`tests/hapus_akun.test.mjs`: dry-run tidak mengubah apa pun, akun aktif/admin/akun sendiri/BK berklaim ditolak, konfirmasi salah tidak menghapus, sukses menghapus Auth + node, idempoten, log lolos rules).

**E2E v2.5.1** (`tests/e2e/v251.spec.mjs`): 5 skenario, desktop 5/5 dan mobile 5/5 (laporan wali, laporan BK, tandai/batal hapus, cabut opsional dua jalur, lencana waka dan kepala).

**Uji tertunda** (fase uji akhir v2.4 + v2.5 + v2.5.1): mutasi semua grup; E2E penuh `flow.spec.mjs`; mobile 5x.

## Satu tugas satu pengisi (v2.5.2; keputusan Kepala Madrasah)

Setiap data punya SATU peran pengisi; peran lain hanya melihat. Ditegakkan Security Rules (bukan hanya UI), dibangkitkan `scripts/build-rules.mjs`.

| Data | Pengisi | Dicabut dari |
|---|---|---|
| Izin harian (`izin`, `izinMeta`, `attendance/.../ket`, `catatan`) | piket, waka, kepala | admin (TU), wali kelas |
| Pelanggaran baru | piket (Ringan/bertakziran), waka, kepala | wali kelas (menu Pelanggaran dihapus) |
| Kalender (`kalender`), ambang (`sistem/ambangHariEfektif`), konfirmasi `normal` | **waka**, **kepala** (cadangan Wakasis) | admin (TU) |
| `kalenderEfektif` (hitung otomatis/ulang) | waka, kepala; piket dengan log `hitung-kalender` | admin |
| `attendance/{nis}/{tgl}` | hanya alat (`device`), sekali tulis | admin |

Catatan: (1) data lama TIDAK diubah; catatan pelanggaran/izin bersumber `wali` yang sudah ada tetap terbaca dan dihitung (waka/kepala masih dapat menghapus lunak). (2) Wali kelas kini memakai halaman baca-saja **Kehadiran kelas** (`src/wali/KehadiranKelas.tsx`) dengan catatan "kabar izin diteruskan ke Guru Piket"; alamat `/wali/izin` dialihkan ke sana. (3) Hitung otomatis `kalenderEfektif` (`useKalenderOtomatis`) dimatikan menurut PERAN sesi, bukan komponen: admin dan ortu tidak menulis; kepala (yang memakai Dashboard yang sama dengan admin), waka, dan piket tetap menghitung. (4) Kartu **Kontrol kalender** (`src/lib/kontrolKalender.ts` + `src/kesiswaan/KontrolKalender.tsx`, fungsi murni; Dashboard TU dan Waka/Kepala): hari kerja pada tahun ajaran berjalan sampai kemarin dengan tap 0, manual 0, tanpa override = kandidat tanggal merah/kegiatan; TU hanya mengingatkan Waka, Waka/Kepala punya tautan ke Kalender. Hari tanpa ringkasan dilaporkan terpisah ("belum dihitung") dan tidak dituduh. (5) `aktifSejak` migrasi kalender kini ditulis waka/kepala sekali saja per siswa dengan log `migrasi-kalender` (rules: tanpa data lama, tanggal valid); penanda `sistem/migrasiKalender` (sekali tulis, oleh/ts/dari/sampai, baca admin/waka/kepala) menonaktifkan tombol migrasi setelah dijalankan. (6) Panduan dan `docs/SOP_HARIAN.md` memuat bagian "Pembagian tugas" satu baris per peran; generator `scripts/buat-panduan.mjs` tidak diubah.

**Status uji v2.5.2** (dijalankan 27 Oktober 2026 di emulator; tiap proses dibatasi 10 menit, log di luar repo; belum di-merge, belum di-tag, belum di-deploy):
- `tsc` + `npm run build` bersih; `npm run test:unit` lolos (termasuk `tests/kontrolKalender.test.mjs` yang baru); `npm run test:rules` **2317 lolos, 0 gagal** (26 uji lama dibalik sesuai peran baru; uji baru: wali ditolak, admin ditolak, kepala boleh kalender/ambang/normal, `aktifSejak` dan penanda migrasi); `npm run test:migrasi` **97 + 41 lolos** (replay izin kini memakai Waka).
- **E2E penuh**: desktop **51/51**, HP **51/51** (skenario baru: Data siswa tanpa ikon izin, Kontrol kalender TU lalu Waka, hitung kalender menurut peran, kepala mengatur override, admin hanya lihat, penanda migrasi, wali memantau saja). Seed E2E diperbaiki: tanggal skenario yang bisa kembar pada hari tertentu (Selasa sesudah Minggu terakhir bulan) kini digabung, bukan saling menimpa (kegagalan "5 vs 6 saran" itu ada juga di v2.5.1).
- **Mutasi** (`tests/mutation.mjs`): `dasar` **31/31** (+2 ekuivalen), `kalender` **49/49**, `kritis` **41/41** (+1 ekuivalen), `wali` seluruh mutan hidup tertangkap (1 ekuivalen baru: izinMeta lingkup jam oleh wali, karena wali tidak lagi punya jalur tulis `izinMeta`); 24 mutan baru/diganti (hak wali dan admin yang dicabut, penanda migrasi, `aktifSejak`, kepala cadangan). Mutan lama bersumber hak wali yang kini mustahil dilaporkan USANG oleh harness (tidak dihapus). Grup `pembinaan`, `bk`, `manual`, `saran`, `perjam`, `piket` tidak dijalankan di sprint ini.

## Status uji sprint final (tag `v2.5.1`; mencakup v2.4 + v2.5 + v2.5.1)

Dijalankan 26 Oktober 2026 di emulator; tiap proses uji dibatasi 10 menit (log di luar repo).
- `tsc` + `npm run build` bersih; `npm run test:unit` lolos; `npm run test:rules` **2277 lolos, 0 gagal**; `npm run test:migrasi` **97 + 41 lolos** (migrasi + hapus akun).
- **E2E penuh** (`flow.spec.mjs` + `v251.spec.mjs`): desktop **48/48**, HP **48/48**. Skenario usang disesuaikan (BK tanpa pelanggaran + klaim dulu, konseling hanya BK, ortu tidak melihat pembinaan sampai diizinkan, admin tanpa menu Pembinaan, penanggung jawab ambang hanya kepala). E2E v2.4-a (jam manual, lupa KTM) ikut lolos karena dijalankan setelah 08:30 WIB.
- **Mutasi** (`tests/mutation.mjs`; kini berhenti pada kegagalan uji pertama via `RULES_FAIL_FAST`): grup `kritis` (baru, 42 mutan: hierarki baca, konseling, penanggung jawab, klaim, izin/kunci/proyeksi ortu, hapus akun, BK) **41/41 tertangkap + 1 ekuivalen** (hapusAkun diri sendiri: lapisan roles menahan); grup `alat` **7/7**; grup `dasar` **28/28 + 2 ekuivalen**. Satu mutan awalnya LOLOS (waka mencabut izin saat level terkunci): ditambahkan uji isolasi di rules.test, lalu tertangkap.
- Regresi nyata yang ditemukan E2E dan diperbaiki: (1) "Isi data awal" oleh waka ditolak karena penanggung jawab ambang kini hanya kepala (seed lv04 sampai lv06 kini kepala; waka mengisi tanpa penanggung jawab, kepala mengisi bawaan); (2) detail siswa di panel wali/BK membaca `pembinaanOrtu` (ditolak rules, galat di konsol): kini tidak dibaca di panel staf.
- Harness mutasi: mutan yang polanya sudah tidak ada setelah v2.5 dilaporkan sebagai USANG (tidak dihapus, tidak menggagalkan seluruh run): `pembinaan` 39 USANG (+38 masih berlaku), `bk` 16 USANG (+46), `wali` 0 USANG (43).

**Belum dijalankan di sprint ini (pengerasan pasca-rilis, wajib dalam 7 hari sejak deploy):** mutan lengkap `pembinaan`, `bk`, dan `wali` (55 mutan USANG disusun ulang; yang masih berlaku dijalankan), grup `manual`, `saran`, `kalender`, `perjam`, `piket` (terakhir dijalankan sebelum v2.4/v2.5), grup baru klaim/izin/migrasi/hapus-akun/laporan yang lebih rinci, dan mobile 5x berturut-turut. Uji fisik ESP32 (tap masuk, tap kedua tidak menimpa, retry setelah WiFi putus, Serial Monitor tanpa DITOLAK) hanya dapat dilakukan manusia di alat.


## Panduan pengguna
Folder `docs/` berisi panduan singkat (maks. 2 halaman per peran): `PANDUAN_ADMIN.md`, `PANDUAN_KEPALA.md`, `PANDUAN_WAKA.md`, `PANDUAN_PIKET.md`, `PANDUAN_WALI.md`, `PANDUAN_ORANG_TUA.md`, dan `SOP_HARIAN.md`.
Isinya dibuat dari satu sumber, `src/lib/panduan.ts`, yang juga dipakai menu **Panduan** di aplikasi (halaman statis tanpa data). Setelah mengubah isi, jalankan `node scripts/buat-panduan.mjs`; `tests/panduan.test.mjs` memastikan docs dan aplikasi selalu sama.

## Migrasi dari Google Sheet
`Setup_Migrasi_Firebase.ipynb` memakai Admin SDK yang **melewati Security Rules**. Kodenya bersumber di `scripts/migrasi_firebase.py` (disalin ke notebook oleh `python scripts/sync_notebook.py`). Skrip: berjalan **DRY-RUN** secara bawaan; hanya menulis ke `config/`, `siswaKelas/` (indeks kelas wali, satu update dengan `config/students`), `profiles/`, `parents/`, `attendance/`, `log/`, `izin/` (jalur lain, termasuk peran staf, kesiswaan, piket, presensi manual, ditolak); memvalidasi data seperti rules; tidak menimpa presensi alat atau izin yang sudah ada; merotasi password alat hanya bila Anda mengetik `YA` (firmware wajib di-flash ulang). Uji: `npm run test:migrasi` (emulator + `pip install firebase-admin`).
