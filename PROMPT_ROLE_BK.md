# PROMPT IMPLEMENTASI — Role BK + Refactor Hierarki Pembinaan & Izin Orang Tua (v2.5)

> Tempel seluruh isi file ini ke sesi AI coding yang bekerja di repo `PresensiPlus_Web_v2`.

## 0. Peran & aturan kerja

Anda adalah Senior Full Stack Engineer (React + TypeScript + Vite + Firebase Realtime Database + Security Rules). Kerjakan perubahan di bawah pada repo ini.

**Wajib dipatuhi:**
1. **Baca dulu, ubah kemudian.** Sebelum menulis kode, baca: `README.md`, `scripts/build-rules.mjs`, `src/lib/pembinaan.ts`, `src/services/pembinaan.ts`, `src/lib/discipline.ts`, `src/lib/wali.ts`, `src/services/wali.ts`, `src/auth/AuthContext.tsx`, `src/app/routes.tsx`, `src/admin/AdminLayout.tsx`, `src/admin/StaffAccounts.tsx`, `src/kesiswaan/WaliKelas.tsx`, `src/kesiswaan/TataTertib.tsx`, `src/kesiswaan/PembinaanRekap.tsx`, `src/kesiswaan/FormPembinaan.tsx`, `src/wali/*`, `src/pages/StudentPage.tsx`, `tests/rules.test.mjs`, `tests/mutation.mjs`, `tests/pembinaan.test.mjs`, `tests/e2e/flow.spec.mjs`.
2. **`database.rules.json` adalah hasil generate.** Ubah sumbernya di `scripts/build-rules.mjs`, lalu jalankan `npm run rules`. Jangan mengedit JSON secara manual.
3. **Pola yang sudah ada harus diikuti:**
   - Logika bisnis ditulis sebagai fungsi MURNI di `src/lib/*` dan dicerminkan di rules.
   - Semua tulisan multi-path dikirim dalam SATU `update` atomik (`kirimUpdate`).
   - Setiap tulisan staf menyertakan log aktivitas (`sisipkanAktivitas`).
   - Tidak ada hapus fisik untuk data pembinaan atau konseling.
4. **Wewenang yang sudah ada tidak boleh berubah**, kecuali yang tercantum di dokumen ini. Ini berlaku untuk admin, kepala, waka, piket, wali, dan ortu. Kalau ditemukan konflik dengan perilaku yang ada, BERHENTI dan tanyakan.
5. **Jangan deploy.** Jangan menjalankan `npm run deploy` dan jangan menulis ke database produksi. Semua uji dijalankan di emulator.
6. Kalau ada requirement yang ambigu atau tidak bisa ditegakkan rules, BERHENTI dan ajukan pertanyaan. Jangan berasumsi.

---

## 1. Konteks domain (tata tertib madrasah — Akumulasi Poin)

| Ambang | Poin | Tindak lanjut | `penanggungJawab` (BARU) |
|---|---|---|---|
| lv01 | 100 | Teguran 1: pembinaan oleh wali kelas | `wali` |
| lv02 | 200 | Teguran 2: pembinaan oleh BK | `bk` |
| lv03 | 300 | Teguran 3: SP pembinaan + pembinaan intensif oleh Kepala Madrasah & Ndalem | `kepala` |
| lv04 | 400 | Surat Peringatan 1 | `kepala` (sebelumnya `waka`) |
| lv05 | 500 | SP 2 + pemanggilan orang tua/wali | `kepala` (sebelumnya `waka`) |
| lv06 | 600 | SP 3, sidang disiplin, pertimbangan pengembalian murid | `kepala` (sebelumnya `waka`) |

- Ubah `penanggungJawabBawaan()` di `src/lib/pembinaan.ts`: lv04–lv06 dan `poin >= 400` menjadi `kepala`.
- Waka **tidak lagi punya level pembinaan sendiri**.
- `PJ_LIST` tetap mengizinkan nilai `waka` di validasi supaya data lama terbaca. UI Tata tertib hanya menawarkan `wali | bk | kepala`.

---

## 2. Hierarki baca pembinaan (inti refactor)

Peringkat role: `wali = 1 < bk = 2 < waka = 3 < kepala = 4`. Admin **tidak** ikut hierarki.

Aturan baca record `pembinaan/{nis}/{ta}_{levelId}`. Peringkat record diambil dari field `pj` di record itu sendiri:

| Pembaca | Boleh membaca record dengan `pj` = |
|---|---|
| wali | `wali`, hanya untuk siswa binaannya (`waliDari($nis)`) |
| bk | `wali` dan `bk`, untuk semua siswa |
| waka | `wali`, `bk` (data lama `pj: waka` juga boleh). **TIDAK** `kepala` |
| kepala | semua |
| admin, piket, ortu | tidak ada (ortu memakai proyeksi di §5) |

**Ketentuan teknis wajib:**
1. **Snapshot `pj`.** Tambahkan field `pj: PenanggungJawab` ke tipe `Pembinaan`.
   - Field ini disalin dari `discipline/levels/{levelId}/penanggungJawab` saat record DIBUAT.
   - Rules memvalidasi kesamaannya saat create dan menolak perubahan setelahnya (immutable).
   - Hak baca bergantung pada `pj` milik record, bukan pada level, sehingga mengubah level tidak mengubah hak baca record lama.
2. **RTDB tidak memfilter isi list.** Hapus `.read` di level `pembinaan` dan `pembinaan/{nis}`, lalu pindahkan ke `pembinaan/{nis}/{id}` dengan `data.child('pj').val()`.
   - Semua pembacaan yang sekarang mengambil node `pembinaan` atau `pembinaan/{nis}` secara utuh (`useLive`/`get`) WAJIB di-refactor menjadi pembacaan per kunci `{ta}_{levelId}`. Kuncinya bisa dihitung dari `discipline/levels` × TA.
   - Buat helper terpusat, misalnya `bacaPembinaanSiswa(nis, ta, levels, peran)` di `src/services/pembinaan.ts`. Helper ini hanya meminta kunci yang boleh dibaca peran tersebut, supaya tidak ada *permission denied* yang tidak perlu.
   - Inventarisir SEMUA pemanggil (grep `pembinaan/`): halaman wali, `PembinaanRekap`, `DetailSiswa` kesiswaan, laporan, konsistensi, dan lainnya.
3. **Hak tulis/koreksi:**
   - Penulis level: wali untuk `pj: wali` (aturan wali yang ada tetap), bk untuk `pj: bk` (lihat §4), kepala untuk `pj: kepala`.
   - Setelah `status = selesai`, hanya role dengan peringkat LEBIH TINGGI dari `pj` yang boleh mengoreksi. Akibatnya waka tidak bisa menyentuh record `pj: kepala`.
4. **Pengubahan `penanggungJawab` di `discipline/levels`:**
   - HANYA `kepala` yang boleh mengubahnya (sekarang waka juga bisa; cabut hak waka untuk field ini saja, waka tetap boleh mengedit `poin` dan `tindakan`).
   - **Kunci level terpakai:** saat record pembinaan pertama untuk sebuah level dibuat, tulis `discipline/levelTerpakai/{levelId}: true` di update yang SAMA. Rules memaksa penanda ini ada bila record dibuat, dan menolak perubahan `penanggungJawab` bila penanda sudah ada.
   - UI Tata tertib menonaktifkan pilihan penanggung jawab untuk level yang sudah terkunci, disertai penjelasan.
   - Tombol "Isi penanggung jawab bawaan" hanya untuk kepala.

---

## 3. Role baru `bk` (akun per guru BK)

### 3.1 Akun & auth
- Tambahkan `"bk"` ke tipe `Session`, `mulaiAktivitas`, pemeriksaan role di `AuthContext`, dan watcher pencabutan role.
- Tambahkan juga ke `HOME`, `PanelGuard`, dan `routes.tsx` (`/bk/*` → `BkLayout`), serta `PanelMode` dan `Shell` di `AdminLayout.tsx`.
- Rules `roles/$uid`:
  - **admin** boleh memasang dan mencabut `bk`.
  - **waka** boleh memasang `bk` (hanya bila role belum ada dan `staff/{uid}/role === 'bk'` ditulis pada update yang sama; pola persis seperti wali/piket), serta mencabut dan memasang kembali.
- Data akun di `staff/{uid}` ({email, nama, role: "bk", dibuat}) ditambah cermin `bkAkun/{uid}` ({email, nama, aktif}). Cermin ini bisa dibaca admin/waka/kepala dan semua akun bk (untuk daftar BK saat penunjukan dan pemindahan).
- **Admin:** tambahkan BK ke form "Tambah akun pimpinan / staf" (`PERAN_STAF_UMUM` + hint peran).
- **Waka:** buat halaman kelola akun BK (daftar, tambah, cabut, pasang kembali) di panel waka.
- Tambahkan catatan di modal admin: *"Akun Wali Kelas dibuat di menu Wali kelas (perlu pemetaan kelas)."*

### 3.2 Hak baca BK (read-only, semua siswa)
- Gunakan pendekatan **whitelist**: daftar node yang dibuka untuk bk ditulis eksplisit di `build-rules.mjs` dan di README.
- Kandidat yang dibuka: `config/students`, `siswaKelas`, `attendance`, `discipline/*` (records, recordMeta, levels, rules master), `izin`, `validasi`, `lessons`/`lessonsByStudent`, dan `kalender`.
- **DILARANG** dibuka untuk bk: `parents` (PIN), `profiles` (bila berisi data sensitif ortu), `staff`, `roles` milik orang lain, `device`, `piket*`, `activity` milik orang lain, `manualTap*`, dan `config` selain students. Verifikasi isi tiap node sebelum memutuskan, lalu laporkan daftarnya.
- BK **tidak boleh menulis** kehadiran, izin, pelanggaran, remisi langsung, master, maupun kalender.

### 3.3 Wewenang tulis BK
| Aksi | Syarat |
|---|---|
| Klaim siswa lv02 | Lihat §4 |
| Catat dan ubah pembinaan `pj: bk` | Hanya pemegang klaim aktif (`klaimBK/{nis}/{ta}_{levelId}/bkUid === auth.uid`), selama `status != selesai` |
| Catatan konseling (rahasia) | Lihat §6 |
| Usulan remisi | Membuat dan membatalkan usulan sendiri yang `menunggu` (pola `usulRemisi` wali), hanya untuk siswa yang ia klaim. Keputusan tetap di waka/kepala |
| Mencatat pelanggaran | **TIDAK BOLEH** |

### 3.4 Panel `/bk`
Menu: Dashboard · Perlu dibina (lencana) · Siswa · Detail siswa · Catatan konseling · Usulan remisi · Panduan · Pengaturan (ganti password) · Keluar.
- **Perlu dibina:** gunakan `daftarPerluDibina(..., pj = "bk")`. Tampilkan tiga kelompok: *Belum ditangani*, *Tangani saya*, *Ditangani BK lain* (nama BK).
- **Lencana** = jumlah *Belum ditangani* + *Tangani saya* yang belum selesai.
- **Detail siswa:** rekap kehadiran, saldo poin, riwayat pelanggaran, **pembinaan lv01 (isi lengkap)** + lv02, catatan konseling, dan status klaim.
- Siswa yang poinnya turun setelah mencapai lv02 tetap tampil (label "saldo sudah turun") sampai pembinaan lv02 berstatus `selesai`. Logikanya sama dengan wali.

---

## 4. Klaim & penugasan BK (siapa cepat dia dapat)

Node: `klaimBK/{nis}/{ta}_{levelId}` = `{ bkUid, bkNama, sejak (serverTs), cara: "klaim" | "tunjuk", olehUid }`

| Aksi | Siapa | Rules |
|---|---|---|
| Klaim | bk | Hanya bila node BELUM ada, `bkUid === auth.uid`, `cara = "klaim"`. Bila dua BK mengklaim serentak, tepat satu yang berhasil (uji ini) |
| Lepas klaim | bk pemegang | Hanya bila pembinaan lv02 belum `selesai`. Wajib alasan (10–300 karakter) di log aktivitas (aksi `lepas-klaim-bk`). Node dihapus |
| Tunjuk | waka, kepala | Untuk siswa yang belum diklaim, `cara = "tunjuk"`. Wajib log aktivitas |
| Pindahkan | waka, kepala | Menimpa klaim yang ada ke BK lain yang `bkAkun/{uid}/aktif === true`. Wajib alasan + log (aksi `pindah-bk`) |

- Tidak ada batas waktu klaim; waka yang memutuskan kapan menunjuk.
- Tambahkan halaman **Penugasan BK** di panel waka (juga bisa diakses kepala): daftar siswa lv02 beserta status klaim, tombol Tunjuk/Pindahkan, dan pemilih BK.
- Pembinaan yang sudah ditulis BK lama tetap tersimpan (field `oleh` tidak berubah). BK baru melanjutkan pada record yang sama.

---

## 5. Visibilitas orang tua (REFACTOR TOTAL — model "tersembunyi sampai diizinkan")

**Perilaku baru:** secara bawaan orang tua TIDAK melihat pembinaan apa pun, termasuk lv01. Data hanya tampil bila diizinkan, **per siswa × per TA × per level**.

### 5.1 Node
- `izinOrtu/{nis}/{ta}/{levelId}` = `{ mode: "ringkas" | "lengkap", olehUid, olehPeran: "waka" | "kepala", ts }`
- `kunciOrtu/{nis}/{ta}/{levelId}` = `{ olehUid, ts, alasan }`. Hanya kepala yang boleh menulis.
- `pembinaanOrtu/{nis}/{ta}/{levelId}` adalah proyeksi yang dibaca ortu (menggantikan `pembinaanStatus`):
  - `ringkas`: `{ status, tanggal, levelPoin, mode }`
  - `lengkap`: ditambah `{ tindakan, hasil, tindakLanjut? }`
  - TIDAK PERNAH berisi nama pembina, uid, catatan konseling, maupun data klaim.

### 5.2 Wewenang
| Aksi | waka | kepala |
|---|---|---|
| Beri/ubah izin level `pj ∈ {wali, bk}` | ✅ bila tidak ada `kunciOrtu` | ✅ |
| Beri/ubah izin level `pj: kepala` | ❌ | ✅ |
| Cabut izin | ✅ hanya izin yang ia berikan dan bila tidak terkunci | ✅ semua |
| Batalkan izin waka → **mengunci** level itu untuk siswa tsb pada TA itu | ❌ | ✅ (hapus izin + proyeksi, tulis `kunciOrtu`, dalam satu update) |
| Buka kunci | ❌ | ✅ |

- Izin boleh diberikan walaupun record pembinaan belum ada. Dalam kasus itu proyeksi baru ditulis saat record dibuat.
- Pilihan "hanya status + tanggal" = mode `ringkas`. Pilihan ini harus selalu tersedia supaya waka/kepala bisa memberi tahu ortu tanpa membuka isi.

### 5.3 Konsistensi (ditegakkan rules, dua arah)
- `pembinaanOrtu/{nis}/{ta}/{lv}` hanya boleh ada bila `izinOrtu/{nis}/{ta}/{lv}` ada, dan isinya sama persis dengan record `pembinaan/{nis}/{ta}_{lv}` sesuai mode.
- Setiap tulis atau ubah record pembinaan yang punya izin aktif WAJIB memperbarui proyeksi di update yang SAMA. Rules menolak bila tidak.
  - Catatan: wali dan bk tidak bisa membaca `izinOrtu`. Sediakan penanda baca-saja `izinOrtuAda/{nis}/{ta}/{lv}: "ringkas" | "lengkap"` yang boleh dibaca penulis level tersebut, supaya service tahu proyeksi apa yang harus ditulis.
- Mencabut izin menghapus proyeksi di update yang sama.

### 5.4 Migrasi data lama
- `pembinaanStatus` dihapus dari rules, UI ortu (`StudentPage.tsx`), dan service.
- Sediakan aksi migrasi khusus kepala (pratinjau dry-run, lalu terapkan) untuk:
  - menghapus seluruh `pembinaanStatus`;
  - mengisi `pj` pada record pembinaan lama (dari level saat ini, atau `penanggungJawabBawaan`);
  - mengisi `discipline/levelTerpakai`;
  - mengubah lv04–06 dari `waka` ke `kepala`.

  Semua tercatat di log aktivitas.
- Perbarui juga `scripts/migrasi_firebase.py` dan notebook (`python scripts/sync_notebook.py`) bila keduanya menyentuh jalur ini.
- **Dampak yang disengaja:** ortu yang sekarang melihat status pembinaan lv01 akan kehilangan tampilan itu sampai diizinkan. Cantumkan di README dan `PANDUAN_ORANG_TUA.md`.

---

## 6. Catatan konseling (RAHASIA — Permendikbud No. 111 Tahun 2014, asas kerahasiaan)

- Node: `konseling/{nis}/{id}` = `{ tanggal, isi (10–3000 karakter), oleh, olehNama, dibuatTs, diubahTs? }`
- **Baca:** HANYA role `bk` (semua akun BK, supaya penanganan bisa berlanjut bila siswa dipindah). **TIDAK** admin, kepala, waka, wali, piket, maupun ortu.
- **Tulis:** bk menambah catatan baru untuk siswa mana pun yang sedang ia klaim. Ia hanya boleh mengubah catatan miliknya sendiri, dan tidak boleh menghapus.
- **Log aktivitas:** cukup aksi + nis. **Jangan** salin isi catatan ke log (log dibaca waka/kepala/admin).
- Konseling TIDAK ikut hierarki §2 dan TIDAK pernah diproyeksikan ke ortu.
- Yang dibaca level atas adalah **hasil pembinaan lv02** (record `pembinaan` `pj: bk`). Tampilkan petunjuk di form BK: *"Hasil pembinaan dapat dibaca Waka/Kepala; tulis hal rahasia di Catatan konseling."*
- Tulis di README: Admin SDK (notebook/skrip migrasi, backup) melewati rules. Akses ke kredensial Admin SDK = akses ke data konseling.

---

## 7. Perubahan pada panel lain (ringkas)
- **Wali:** detail siswa hanya menampilkan pembinaan `pj: wali` (sudah dibatasi rules). Tidak ada perubahan wewenang lain.
- **Waka:**
  - Rekap pembinaan hanya menampilkan `pj ∈ {wali, bk, waka-lama}`.
  - Ditambah: Penugasan BK, Kelola akun BK, dan Izin tampil ortu.
  - Tata tertib: field penanggung jawab hanya-baca.
- **Kepala:**
  - Rekap semua level; menulis pembinaan lv03–06.
  - Izin ortu, kunci/buka kunci, migrasi §5.4, dan edit penanggung jawab.
- **Admin:**
  - Kehilangan akses baca `pembinaan`. Konfirmasi tidak ada fitur admin (konsistensi, laporan, backup) yang bergantung pada akses ini; kalau ada, BERHENTI dan laporkan.
  - Ditambah: kelola akun BK.
- **Ortu:** bagian status pembinaan membaca `pembinaanOrtu`. Mode `lengkap` menampilkan tindakan, hasil, dan tindak lanjut.

---

## 8. Pengujian (semua harus lolos sebelum selesai)
1. **Unit** (`tests/pembinaan.test.mjs` + berkas baru `tests/bk.test.mjs`, daftarkan di `test:unit`):
   - `penanggungJawabBawaan` yang baru;
   - fungsi peringkat/hierarki baca;
   - `daftarPerluDibina` dengan `pj = "bk"`;
   - pembentuk proyeksi ortu untuk mode ringkas/lengkap.
2. **Rules** (`tests/rules.test.mjs`): untuk SETIAP sel matriks di §2, §3, §4, §5, §6, uji kasus boleh DAN ditolak. Wajib mencakup:
   - waka gagal membaca record `pj: kepala`;
   - wali gagal membaca `pj: bk`;
   - bk gagal membaca `konseling` lewat jalur lain, dan kepala gagal membaca `konseling`;
   - waka gagal mengubah `penanggungJawab`, dan kepala gagal mengubahnya pada level terpakai;
   - perubahan `pj` record ditolak;
   - dua klaim serentak: tepat satu berhasil;
   - lepas klaim tanpa log ditolak;
   - waka gagal memberi izin pada level terkunci atau level `pj: kepala`;
   - proyeksi ortu yang tidak konsisten ditolak, dan update pembinaan tanpa pembaruan proyeksi ditolak;
   - ortu gagal membaca `pembinaan`, `konseling`, `klaimBK`, `izinOrtu`;
   - bk gagal menulis pelanggaran, kehadiran, dan izin, serta gagal membaca `parents`.
3. **Mutasi:** tambahkan grup `bk` (`npm run test:mutation:bk`). Jalankan juga `:pembinaan`, `:wali`, `:dasar` dan pastikan semuanya 100% terbunuh, atau ekuivalen yang terdokumentasi.
4. **E2E** (`tests/e2e/flow.spec.mjs`), desktop + HP:
   1. admin/waka membuat akun BK;
   2. BK mengklaim siswa lv02 dan mencatat pembinaan + konseling;
   3. waka memindahkan siswa ke BK lain;
   4. waka mengizinkan lv01 mode ringkas, lalu ortu melihat status + tanggal;
   5. kepala membatalkan, lalu ortu tidak melihat apa pun dan waka tidak bisa mengizinkan ulang;
   6. kepala membuka kunci dan memberi mode lengkap.
5. `npm run build` (termasuk `tsc --noEmit`) dan `npm run test:migrasi` harus bersih.

---

## 9. Dokumentasi
- Baru: `docs/PANDUAN_BK.md` (maksimal 2 halaman, gaya sama dengan panduan lain) + entri peran `bk` di `src/lib/panduan.ts`. Pastikan `tests/panduan.test.mjs` lolos.
- Perbarui: `PANDUAN_WALI.md`, `PANDUAN_WAKA.md`, `PANDUAN_KEPALA.md`, `PANDUAN_ADMIN.md`, `PANDUAN_ORANG_TUA.md`, `SOP_HARIAN.md`.
- README: bagian v2.5 berisi matriks wewenang BK, hierarki baca, klaim, izin ortu, konseling, whitelist node bk, migrasi, dampak ke ortu, dan perintah uji.

---

## 10. Urutan kerja & laporan
1. **Tahap A — Analisis (tanpa menulis kode):** laporkan inventaris pemanggil `pembinaan/` dan `pembinaanStatus/`, whitelist node bk beserta alasannya, serta konflik yang ditemukan. TUNGGU persetujuan.
2. **Tahap B:** fungsi murni + rules + uji rules.
3. **Tahap C:** service + refactor pembacaan per record + migrasi.
4. **Tahap D:** UI (panel BK, waka, kepala, admin, ortu).
5. **Tahap E:** uji mutasi, E2E, build, dokumentasi.

Setiap akhir tahap, laporkan: berkas yang diubah, hasil uji (angka lolos/total), dan risiko yang tersisa. Jangan menggabungkan tahap tanpa laporan.
