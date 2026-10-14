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

**Dispensasi** = siswa mewakili sekolah; dihitung **hadir** pada persentase. Kode per jam: `A` alfa, `I` izin, `S` sakit, `D` dispensasi.

## Security Rules
`database.rules.json` **dihasilkan** dari `scripts/build-rules.mjs` (`npm run rules`; otomatis saat `npm run build`/`deploy`). Jangan mengedit JSON-nya langsung.

## Uji
Butuh Java (emulator Database) dan, untuk E2E, `npx playwright install chromium`.
| Perintah | Isi |
|---|---|
| `npm run test:unit` | Logika murni: per jam, saran otomatis, kehadiran (Dispensasi), aturan piket, label perangkat, rekap per jam (Minggu diabaikan), jangkar tanggal E2E |
| `npm run test:rules` | Security Rules di Emulator (semua peran + jalur firmware alat) |
| `npm run test:mutation` | Merusak rules satu per satu; suite WAJIB gagal (mutasi ekuivalen terdokumentasi) |
| `npm run test:e2e` | Playwright terhadap emulator, viewport desktop **dan** HP. Tidak menyentuh produksi. |

## Rollback
| Yang dipulihkan | Cara |
|---|---|
| **Rules** | Firebase Console > Realtime Database > Rules > tombol riwayat (Rules history) > pilih versi lama > Publish. Atau dari source: `git checkout <tag> -- database.rules.json` lalu `npx firebase-tools deploy --only database`. |
| **Hosting** | Firebase Console > Hosting > Release history > menu ⋮ pada rilis lama > **Rollback**. |
| **Source** | `git tag` untuk daftar rilis, `git checkout <tag>` untuk melihat/memulihkan (mis. `v2.0-piket-b`). Buat cabang dulu bila ingin melanjutkan kerja: `git switch -c perbaikan <tag>`. |
| **Data** | Ekspor JSON manual dari Console (lihat pengingat "Backup terakhir" di Pengaturan admin). Rollback rules/hosting tidak mengembalikan data. |

Catatan: `releases/` (snapshot dist + rules) tidak ikut Git. Source selalu dipulihkan dari tag Git; build ulang dengan `npm ci && npm run build`.
