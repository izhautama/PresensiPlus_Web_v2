"""Pelari uji migrasi terhadap EMULATOR (dipanggil tests/migrasi.test.mjs). Tidak pernah menyentuh produksi:
wajib FIREBASE_AUTH_EMULATOR_HOST dan FIREBASE_DATABASE_EMULATOR_HOST. Argumen: <ns> <mode> [csv_path]
mode: dry | real | rotasi | guard"""
import json
import os
import sys

HOME = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(HOME, "scripts"))
assert os.environ.get("FIREBASE_AUTH_EMULATOR_HOST") and os.environ.get("FIREBASE_DATABASE_EMULATOR_HOST"), "hanya untuk emulator"

import migrasi_firebase as M  # noqa: E402
from firebase_admin import auth, db  # noqa: E402

ns, mode = sys.argv[1], sys.argv[2]
csv_path = sys.argv[3] if len(sys.argv) > 3 else "pin_uji.csv"
M.init(None, f"https://{ns}.firebaseio.com", "demo-presensi")

INDUK = [
    ["AAAAAAA1", "ANDI SATU", "XI IPS", "9001"],
    ["BBBBBBB2", "BUDI DUA", "XI IPS", "9002"],
    ["CCCCCCC3", "CITRA TIGA", "X IPA", "9003"],
    ["XYZ", "UID BURUK", "X", "9004"],                 # UID bukan hex 8-20
    ["DDDDDDD4", "N" * 61, "X", "9005"],               # nama > 60
    ["EEEEEEE5", "DINA", "K" * 16, "9006"],            # kelas > 15
    ["FFFFFFF6", "NIS GANDA", "X", "9001"],            # NIS ganda
    ["GGGGGGG7", "NIS HURUF", "X", "ab12"],            # NIS bukan angka
    ["HHHHHHH8", "", "X", "9008"],                     # nama kosong
]
JADWAL = [
    ["Semua", "Semua", "Masuk", "07:00", "07:15"], ["Semua", "Semua", "Terlambat", "07:16", "14:10"],
    ["Semua", "Semua", "Pulang", "14:15", "15:00"], ["X IPA", "Senin", "Masuk", "6:45", "07:00"],
    ["Semua", "Semua", "Istirahat", "10:00", "10:15"],   # jenis tak dikenal
    ["Semua", "Semua", "Masuk", "25:99", "26:00"],       # jam mustahil
    ["Semua", "Funday", "Masuk", "07:00", "07:15"],      # hari tak dikenal
    ["Semua", "Semua", "Masuk", "08:00", "07:00"],       # mulai > selesai
]
TAP = [
    ["2026-09-01", "07:05:00", "AAAAAAA1", "ANDI SATU", "Siswa", "XI IPS", "Hadir", "9001"],
    ["2026-09-01", "15:01:00", "AAAAAAA1", "ANDI SATU", "Siswa", "XI IPS", "Pulang", "9001"],
    ["01/09/2026", "07:20:00", "BBBBBBB2", "BUDI DUA", "Siswa", "XI IPS", "Terlambat", "9002"],
    ["2026-09-02", "07:00:00", "AAAAAAA1", "ANDI SATU", "Siswa", "XI IPS", "Hadir", "9001"],   # hari ini SUDAH punya data alat di DB
    ["2026-09-01", "7pm", "CCCCCCC3", "CITRA TIGA", "Siswa", "X IPA", "Hadir", "9003"],          # jam tidak valid
    ["2026-09-01", "07:00:00", "CCCCCCC3", "GURU X", "Guru", "-", "Hadir", "9003"],              # guru: dilewati
    ["2026-09-01", "24:30:00", "CCCCCCC3", "CITRA TIGA", "Siswa", "X IPA", "Hadir", "9003"],     # jam 24
]
IZIN = [
    ["9003", "2026-09-03", "Sakit", "demam"], ["9003", "2026-09-04", "Izin", "acara keluarga"],
    ["9002", "2026-09-05", "Izin", "tidak boleh menimpa Dispensasi"],                              # SUDAH ada Dispensasi di DB
]

hasil = {}
if mode == "kunci":
    contoh = ["X IPA", "XI/IPS.1", "X-A#2", "K$[1]", "100%", "a.b/c", "Kelas Ü"]
    hasil = {k: M.kunci_kelas(k) for k in contoh}
elif mode == "batch":
    # penulisan satu siswa (config + profil nama/kelas + indeks kelas) TIDAK boleh terpecah antar-update (batch)
    class _Ref:
        def __init__(self, sink): self.sink = sink
        def update(self, d): self.sink.append(dict(d))
    class _Db:
        def __init__(self): self.sink = []
        def reference(self, p): return _Ref(self.sink)
    fake = _Db(); asli = M.db; M.db = fake
    try:
        paths = {}
        for i in range(1, 251):
            nis = str(1000 + i)
            paths[f"config/students/AB{i:06d}"] = {"nis": nis, "nama": "S", "kelas": "X"}
            paths[f"profiles/{nis}/nama"] = "S"; paths[f"profiles/{nis}/kelas"] = "X"
            paths[f"siswaKelas/{nis}"] = "X"
        M._update_batch(paths, "uji", dry_run=False, unit=4)
    finally:
        M.db = asli
    utuh = True
    for b in fake.sink:
        for nis in {k.split("/")[1] for k in b if k.startswith("siswaKelas/")}:
            utuh = utuh and f"profiles/{nis}/nama" in b and f"profiles/{nis}/kelas" in b
        for k in b:
            if k.startswith("profiles/"):
                utuh = utuh and f"siswaKelas/{k.split('/')[1]}" in b
    hasil = {"batch": [len(b) for b in fake.sink], "utuh": utuh, "total": sum(len(b) for b in fake.sink)}
elif mode == "guard":
    # 1) jalur terlarang ditolak oleh skrip (Admin SDK melewati rules, jadi penjaga ada di skrip)
    galat = {}
    for p in ["discipline/rules/x", "roles/abc", "staff/abc", "validasi/2026-09-01/9001", "izinMeta/a/b/c", "manualTap/2026-09-01/9001",
              "manualTapByStudent/9001/2026-09-01", "activity/2026-09-01/a", "piketRoster/p1", "sistem/backupTerakhir", "lessons/2026-09-01/X/absen"]:
        try:
            M._update_batch({p: 1}, "uji", dry_run=False)
            galat[p] = "DITULIS (SALAH)"
        except M.MigrasiError:
            galat[p] = "ditolak"
    hasil["jalur"] = galat
    # 2) uid yang sudah berperan waka tidak boleh dijadikan admin
    u = auth.create_user(email="calon.admin.waka@uji.test", password="password-uji-123")
    db.reference("roles").update({u.uid: "waka"})
    try:
        M.setup_akun_inti("calon.admin.waka@uji.test", "password-uji-123", dry_run=False)
        hasil["peran_waka"] = "DITIMPA (SALAH)"
    except M.MigrasiError:
        hasil["peran_waka"] = "ditolak"
    hasil["role_waka_setelah"] = db.reference(f"roles/{u.uid}").get()
else:
    dry = mode == "dry"
    konf = "YA" if mode == "rotasi" else ""
    AK = M.setup_akun_inti("admin.migrasi@uji.test", "password-admin-123", dry_run=dry, konfirmasi_rotasi=konf)
    S = M.migrasi_siswa(INDUK, csv_path, dry_run=dry)
    M.migrasi_jadwal(JADWAL, dry_run=dry)
    R = M.migrasi_riwayat(TAP, IZIN, S["nis_ke_uid"], dry_run=dry)
    M.naikkan_versi(dry_run=dry)
    hasil = {"masalah": S["masalah"], "ortu_baru": S["ortu_baru"], "riwayat": R, "rotasi_alat": AK.get("rotasi_alat"),
             "device_password": AK.get("device_password"), "admin_uid": AK.get("admin_uid"), "device_uid": AK.get("device_uid"), "indeks": S["indeks"]}
print("HASIL_JSON=" + json.dumps(hasil))
