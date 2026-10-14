"""Sinkronkan Setup_Migrasi_Firebase.ipynb dengan scripts/migrasi_firebase.py (sumber tunggal) dan sel konfigurasi/eksekusi.
Jalankan:  python scripts/sync_notebook.py   (output sel dikosongkan: notebook tidak boleh memuat kredensial)."""
import json
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
NB = os.path.join(ROOT, "Setup_Migrasi_Firebase.ipynb")
PY = os.path.join(ROOT, "scripts", "migrasi_firebase.py")


def baris(teks: str):
    parts = teks.split("\n")
    return [p + "\n" for p in parts[:-1]] + ([parts[-1]] if parts[-1] else [])


CFG = '''# 2) Konfigurasi
import os, json, getpass
from google.colab import files

DB_URL = "https://ISI-URL-DATABASE.asia-southeast1.firebasedatabase.app"   # dari langkah 1
SPREADSHEET_ID = "ISI_ID_SPREADSHEET"                                     # docs.google.com/spreadsheets/d/<ID>/edit
ADMIN_EMAIL = "admin@manurulhuda.sch.id"                                   # email login admin web (boleh fiktif)

# DRY-RUN (bawaan): hanya MEMVALIDASI dan meringkas. Tidak menulis data, tidak membuat akun, tidak mengubah password.
# Setelah ringkasan Anda periksa dan benar, ubah menjadi False lalu jalankan ulang sel 4.
DRY_RUN = True

if not os.path.exists("/content/sa.json"):
    print("Upload file JSON service account Firebase:")
    up = files.upload(); os.rename(list(up.keys())[0], "/content/sa.json")
sa_email = json.load(open("/content/sa.json"))["client_email"]
print("Spreadsheet harus di-SHARE (Viewer) ke:", sa_email)
ADMIN_PASSWORD = getpass.getpass("Password admin web (min. 8 karakter): ")
assert len(ADMIN_PASSWORD) >= 8, "Password admin terlalu pendek"
assert DB_URL.startswith("https://") and "ISI-URL" not in DB_URL, "Isi DB_URL dulu"
assert "ISI_ID" not in SPREADSHEET_ID, "Isi SPREADSHEET_ID dulu"
print("MODE:", "DRY-RUN (tidak ada yang ditulis)" if DRY_RUN else "TULIS NYATA ke database")
'''

JALAN = '''# 4) Migrasi ke Firebase  (DRY_RUN=True: hanya validasi & ringkasan)
import migrasi as M
from datetime import datetime
M.init("/content/sa.json", DB_URL)

# ==================================================================================================
# ⚠️⚠️  PERINGATAN: ROTASI PASSWORD ALAT  ⚠️⚠️
# Bila akun alat ESP32 SUDAH ADA, melanjutkan akan MENGGANTI password-nya. Firmware di alat TIDAK akan bisa login
# sampai di-flash ulang dengan kredensial baru. Jangan lakukan saat jam sekolah.
# Biarkan kosong bila alat sudah berjalan normal.
# ==================================================================================================
KONFIRMASI = ""
if not DRY_RUN and M._user_by_email(M.DEVICE_EMAIL) is not None:
    KONFIRMASI = input("Akun alat sudah ada. Rotasi password alat (firmware HARUS di-flash ulang)? Ketik YA untuk merotasi, atau Enter untuk TIDAK: ").strip()
    if KONFIRMASI != "YA":
        KONFIRMASI = ""

print("[1] Akun admin & alat");  AK = M.setup_akun_inti(ADMIN_EMAIL, ADMIN_PASSWORD, dry_run=DRY_RUN, konfirmasi_rotasi=KONFIRMASI)
csv_pin = f"/content/PIN_ortu_{datetime.now():%Y%m%d_%H%M}.csv"
print("[2] Siswa & akun orang tua"); S = M.migrasi_siswa(INDUK, csv_pin, dry_run=DRY_RUN)
for m in S["masalah"]: print("    ⚠️", m)
print("[3] Jadwal");            M.migrasi_jadwal(JADWAL, dry_run=DRY_RUN)
print("[4] Riwayat presensi");  M.migrasi_riwayat(TAP, IZIN, S["nis_ke_uid"], dry_run=DRY_RUN)
print("[5] Versi data");        M.naikkan_versi(dry_run=DRY_RUN)

if DRY_RUN:
    print("\\nℹ️  DRY-RUN selesai: TIDAK ada yang ditulis. Periksa ringkasan & peringatan di atas; bila benar, set DRY_RUN = False di sel 2 lalu jalankan ulang sel 4.")
elif AK.get("device_password"):
    with open("/content/kredensial_esp32.txt", "w") as f:
        f.write(f"DEVICE_EMAIL    = \\"{AK['device_email']}\\"\\nDEVICE_PASSWORD = \\"{AK['device_password']}\\"\\n")
    print("\\n✅ Selesai. Siswa yang dilewati (lihat ⚠️) perbaiki di Sheet lalu jalankan ulang sel ini.")
else:
    print("\\n✅ Selesai. Password alat TIDAK diubah (tidak ada kredensial baru).")
'''

UNDUH = '''# 5) Unduh hasil (RAHASIA — simpan aman, jangan kirim lewat grup)
import os
if DRY_RUN:
    print("DRY-RUN: tidak ada berkas untuk diunduh.")
else:
    if os.path.exists(csv_pin): files.download(csv_pin)
    else: print("Tidak ada akun ortu baru (semua sudah dibuat sebelumnya) — PIN lama tetap berlaku.")
    if os.path.exists("/content/kredensial_esp32.txt"): files.download("/content/kredensial_esp32.txt")
    else: print("Tidak ada kredensial alat baru (password alat tidak diubah).")
'''

CATATAN = '''
### Keamanan data (baca sebelum menjalankan)
- Notebook memakai **Admin SDK yang MELEWATI Security Rules**. Karena itu skrip hanya boleh menulis ke `config/`, `profiles/`, `parents/`, `attendance/`, `log/`, `izin/`;
  jalur lain (`roles` milik kepala/waka/piket, `staff`, `discipline`, `lessons*`, `validasi*`, `izinMeta`, `activity*`, `piket*`, `manualTap*`, `sistem`) **ditolak** oleh skrip.
- **DRY-RUN adalah bawaan**: sel 4 hanya memvalidasi data terhadap aturan database dan mencetak ringkasan. Ubah `DRY_RUN = False` (sel 2) setelah ringkasan benar.
- Data yang sudah ada **tidak ditimpa**: presensi hasil alat dan keterangan izin/sakit/dispensasi dari piket/waka dilewati.
- ⚠️ **Rotasi password alat**: bila akun alat sudah ada, password-nya hanya diganti jika Anda mengetik `YA`. Setelah rotasi, firmware ESP32 **wajib di-flash ulang**.
'''


def main():
    with open(NB, encoding="utf-8") as f:
        nb = json.load(f)
    kode = open(PY, encoding="utf-8").read()
    cells = nb["cells"]
    assert len(cells) == 8, "struktur notebook tidak dikenali"
    md = "".join(cells[0]["source"])
    if "### Keamanan data" not in md:
        cells[0]["source"] = baris(md.rstrip("\n") + "\n" + CATATAN)
    md = "".join(cells[0]["source"])
    md = md.replace("Aman dijalankan ulang: akun/PIN yang sudah ada **tidak** diubah (kecuali password alat — selalu dibuat baru).",
                    "Aman dijalankan ulang: akun/PIN yang sudah ada **tidak** diubah, dan password alat **hanya** dirotasi bila Anda mengetik `YA`.")
    cells[0]["source"] = baris(md)
    cells[2]["source"] = baris(CFG.rstrip("\n"))
    cells[3]["source"] = baris("%%writefile /content/migrasi.py\n" + kode.rstrip("\n"))
    cells[5]["source"] = baris(JALAN.rstrip("\n"))
    cells[6]["source"] = baris(UNDUH.rstrip("\n"))
    for c in cells:
        if c["cell_type"] == "code":
            c["outputs"] = []
            c["execution_count"] = None
    with open(NB, "w", encoding="utf-8") as f:
        json.dump(nb, f, ensure_ascii=False, indent=1)
        f.write("\n")
    print("notebook disinkronkan")


if __name__ == "__main__":
    main()
