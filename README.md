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
| `admin` | Firebase Console | Kelola siswa, jadwal, alat, akun pimpinan/staf. Kesiswaan hanya lihat. |
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

## Panduan pengguna
Folder `docs/` berisi panduan singkat (maks. 2 halaman per peran): `PANDUAN_ADMIN.md`, `PANDUAN_KEPALA.md`, `PANDUAN_WAKA.md`, `PANDUAN_PIKET.md`, `PANDUAN_WALI.md`, `PANDUAN_ORANG_TUA.md`, dan `SOP_HARIAN.md`.
Isinya dibuat dari satu sumber, `src/lib/panduan.ts`, yang juga dipakai menu **Panduan** di aplikasi (halaman statis tanpa data). Setelah mengubah isi, jalankan `node scripts/buat-panduan.mjs`; `tests/panduan.test.mjs` memastikan docs dan aplikasi selalu sama.

## Migrasi dari Google Sheet
`Setup_Migrasi_Firebase.ipynb` memakai Admin SDK yang **melewati Security Rules**. Kodenya bersumber di `scripts/migrasi_firebase.py` (disalin ke notebook oleh `python scripts/sync_notebook.py`). Skrip: berjalan **DRY-RUN** secara bawaan; hanya menulis ke `config/`, `siswaKelas/` (indeks kelas wali, satu update dengan `config/students`), `profiles/`, `parents/`, `attendance/`, `log/`, `izin/` (jalur lain, termasuk peran staf, kesiswaan, piket, presensi manual, ditolak); memvalidasi data seperti rules; tidak menimpa presensi alat atau izin yang sudah ada; merotasi password alat hanya bila Anda mengetik `YA` (firmware wajib di-flash ulang). Uji: `npm run test:migrasi` (emulator + `pip install firebase-admin`).
