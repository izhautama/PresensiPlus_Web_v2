import type { AutoMap, Level, Remisi, Rule } from "../lib/discipline";

type RuleSeed = Omit<Rule, "diubahOleh" | "diubahTs" | "aktif">;
type RemisiSeed = Omit<Remisi, "diubahOleh" | "diubahTs" | "aktif">;

/** Poin mengikuti tabel klasifikasi; takziran hanya teks sanksi (tidak menambah poin). */
export const SEED_RULES: Record<string, RuleSeed> = {
  sb01: { kategori: "Sangat Berat", nama: "Membawa/menggunakan/mengedarkan narkotika, miras, atau zat adiktif", poin: 250 },
  sb02: { kategori: "Sangat Berat", nama: "Membawa senjata tajam/benda berbahaya tanpa izin", poin: 250 },
  sb03: { kategori: "Sangat Berat", nama: "Tindakan asusila/bertentangan dengan norma agama dan kesusilaan", poin: 250 },
  sb04: { kategori: "Sangat Berat", nama: "Pencurian", poin: 200 },
  sb05: { kategori: "Sangat Berat", nama: "Penganiayaan/kekerasan yang mengakibatkan korban terluka", poin: 200 },
  sb06: { kategori: "Sangat Berat", nama: "Mengunggah/membuat/menyebarkan konten yang mencemarkan nama baik sekolah, pondok, guru, tendik, atau murid", poin: 200 },
  sb07: { kategori: "Sangat Berat", nama: "Menyimpan/menyebarkan pornografi", poin: 200 },
  sb08: { kategori: "Sangat Berat", nama: "Pemerasan, intimidasi berat, atau tindakan kriminal lain", poin: 200 },
  sb09: { kategori: "Sangat Berat", nama: "Memalsukan dokumen resmi sekolah atau tanda tangan kepala madrasah/guru/wali kelas/tendik", poin: 150 },

  br01: { kategori: "Berat", nama: "Merokok atau membawa rokok/vape di lingkungan sekolah", poin: 100 },
  br02: { kategori: "Berat", nama: "Berkelahi", poin: 75 },
  br03: { kategori: "Berat", nama: "Tidak sopan, menghina, atau mengancam guru/tendik", poin: 100 },
  br04: { kategori: "Berat", nama: "Memalsukan surat izin atau tanda tangan orang tua/wali", poin: 100 },
  br05: { kategori: "Berat", nama: "Berpacaran/berduaan/berboncengan dengan lawan jenis bukan mahram", poin: 100 },
  br06: { kategori: "Berat", nama: "Perundungan fisik, verbal, atau media sosial", poin: 100 },
  br07: { kategori: "Berat", nama: "Menggunakan mushola/kelas/fasilitas untuk keperluan yang bertentangan dengan fungsinya", poin: 75 },

  sd01: { kategori: "Sedang", nama: "Menghasut/memprovokasi murid lain hingga menimbulkan keresahan", poin: 50 },
  sd02: { kategori: "Sedang", nama: "Membawa HP/laptop tanpa izin", poin: 50, takziran: "HP disita tanpa batas waktu; hanya diambil orang tua/wali setelah memenuhi ketentuan" },
  sd03: { kategori: "Sedang", nama: "Tidak masuk kelas tanpa keterangan, atau keluar kelas saat pembelajaran tanpa izin", poin: 30 },
  sd04: { kategori: "Sedang", nama: "Berada di area terlarang tanpa izin", poin: 30 },
  sd05: { kategori: "Sedang", nama: "Tidak mengikuti Salat Zuhur berjamaah tanpa alasan sah", poin: 30, takziran: "Membersihkan lorong/kantor/kelas sesuai arahan guru piket" },
  sd06: { kategori: "Sedang", nama: "Tidak mengikuti upacara/kegiatan wajib tanpa izin sah", poin: 30 },
  sd07: { kategori: "Sedang", nama: "Kecurangan pada tugas/ulangan/ujian", poin: 50 },
  sd08: { kategori: "Sedang", nama: "Menitipkan KTM atau absensi memakai KTM orang lain", poin: 25 },

  rg01: { kategori: "Ringan", nama: "Seragam tidak sesuai ketentuan", poin: 20 },
  rg02: { kategori: "Ringan", nama: "Tidak memakai atribut lengkap", poin: 10, takziran: "Atribut yang tidak sesuai (gelang, kalung, anting, cermin, dsb.) disita" },
  rg03: { kategori: "Ringan", nama: "Rambut tidak sesuai ketentuan", poin: 15 },
  rg04: { kategori: "Ringan", nama: "Aksesori/riasan berlebihan", poin: 15, takziran: "Riasan dihapus, barang disita tanpa batas waktu" },
  rg05: { kategori: "Ringan", nama: "Tidak mengerjakan tugas", poin: 5 },
  rg06: { kategori: "Ringan", nama: "Tidak membawa buku/perlengkapan belajar", poin: 5 },
  rg07: { kategori: "Ringan", nama: "Datang terlambat ke sekolah", poin: 5, takziran: "Berdiri di depan kelas SMP sesuai lama keterlambatan sambil membaca Al-Qur'an" },
  rg08: { kategori: "Ringan", nama: "Tidak melaksanakan tugas piket", poin: 5 },
  rg09: { kategori: "Ringan", nama: "Tidak menjaga kebersihan kelas/lingkungan", poin: 5 },
  rg10: { kategori: "Ringan", nama: "Mencoret-coret fasilitas/atribut sekolah", poin: 15 },
  rg11: { kategori: "Ringan", nama: "Seragam tidak rapi", poin: 5 },
  rg12: { kategori: "Ringan", nama: "Kuku panjang/cat kuku", poin: 5 },
  rg13: { kategori: "Ringan", nama: "Tidak tap in dan tap out pada hari yang sama tanpa alasan sah", poin: 5 },
  rg14: { kategori: "Ringan", nama: "Lupa membawa KTM", poin: 5 },
  rg15: { kategori: "Ringan", nama: "Menghilangkan KTM", poin: 10, takziran: "Mengganti biaya kartu Rp50.000" },
  rg16: { kategori: "Ringan", nama: "Merusak sarana/prasarana sekolah", poin: 20, takziran: "Mengganti yang dirusak; poin 20–100 sesuai tingkat kerusakan (ubah poin saat input)" },
};

export const SEED_REMISI: Record<string, RemisiSeed> = {
  rm01: { kelompok: "Prestasi", nama: "Juara lomba tingkat nasional", poin: 100 },
  rm02: { kelompok: "Prestasi", nama: "Juara lomba tingkat provinsi", poin: 75 },
  rm03: { kelompok: "Prestasi", nama: "Juara lomba tingkat kota/kabupaten", poin: 50 },
  rm04: { kelompok: "Prestasi", nama: "Juara lomba tingkat kecamatan", poin: 25 },
  rm05: { kelompok: "Prestasi", nama: "Peserta lomba (tidak juara)", poin: 10 },
  rm06: { kelompok: "Prestasi", nama: "Diangkat menjadi ketua OSIS", poin: 25 },
  rm07: { kelompok: "Prestasi", nama: "Diangkat menjadi pengurus OSIS", poin: 20 },
  rm08: { kelompok: "Tanpa prestasi", nama: "Tidak pernah alpa selama 1 semester berturut-turut", poin: 25, syarat: "Khusus murid yang memiliki catatan pelanggaran" },
  rm09: { kelompok: "Tanpa prestasi", nama: "Tidak pernah terlambat selama 1 bulan berturut-turut", poin: 15, syarat: "Khusus murid yang memiliki catatan pelanggaran" },
  rm10: { kelompok: "Tanpa prestasi", nama: "Menunjukkan catatan pelajaran lengkap tepat waktu", poin: 30, syarat: "Khusus murid yang memiliki catatan pelanggaran" },
};

export const SEED_LEVELS: Record<string, Level> = {
  lv01: { poin: 100, tindakan: "Teguran 1 — pembinaan wali kelas", penanggungJawab: "wali" },
  lv02: { poin: 200, tindakan: "Teguran 2 — pembinaan BK", penanggungJawab: "bk" },
  lv03: { poin: 300, tindakan: "Teguran 3 — surat peringatan pembinaan & pembinaan intensif oleh Kepala Madrasah dan Ndalem", penanggungJawab: "kepala" },
  lv04: { poin: 400, tindakan: "Surat Peringatan 1", penanggungJawab: "kepala" },
  lv05: { poin: 500, tindakan: "Surat Peringatan 2 + pemanggilan orang tua/wali", penanggungJawab: "kepala" },
  lv06: { poin: 600, tindakan: "Surat Peringatan 3, sidang disiplin, pertimbangan pengembalian murid kepada orang tua/wali", penanggungJawab: "kepala" },
};

/** Alfa sengaja kosong: tidak ada saran poin untuk Alfa sampai diatur. */
export const SEED_AUTOMAP: AutoMap = { terlambat: "rg07", tanpaTapPulang: "rg13", bolosJam: "sd03", lupaKtm: "rg14", ktmHilang: "rg15" };
