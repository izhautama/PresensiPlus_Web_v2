"""
Setup & migrasi Presensi MA Nurul Huda: Google Sheet v11.1 -> Firebase RTDB.
SUMBER TUNGGAL: berkas ini disalin ke sel notebook `Setup_Migrasi_Firebase.ipynb` oleh `python scripts/sync_notebook.py`.
Dijalankan dari Colab (lihat notebook) atau terhadap Emulator untuk uji (`npm run test:migrasi`).

PENTING: Admin SDK MELEWATI Security Rules. Karena itu berkas ini:
  * hanya boleh menulis ke JALUR YANG DIIZINKAN (config/, profiles/, parents/, attendance/, log/, izin/) dan ke
    roles/{uid} milik admin & alat sendiri; semua jalur lain DITOLAK (roles milik kepala/waka/piket, staff, discipline,
    lessons*, validasi*, izinMeta, activity*, piket*, manualTap*, sistem) agar data modul baru tidak tertimpa/terhapus;
  * memvalidasi setiap nilai dengan aturan yang sama dengan database.rules.json (format jam, panjang, nilai izin ...);
  * berjalan DRY-RUN secara bawaan: hanya memvalidasi & meringkas, tidak menulis, tidak membuat akun, tidak mengubah password;
  * tidak menimpa data yang sudah ada (presensi alat, keterangan izin/sakit/dispensasi dari piket/waka).
"""
import csv
import re
import secrets
import time
from datetime import datetime

import firebase_admin
from firebase_admin import auth, credentials, db

ORTU_DOMAIN = "ortu.presensi-ma.local"     # domain fiktif; HARUS sama dengan konstanta di web
DEVICE_EMAIL = "esp32-01@device.presensi-ma.local"
BATCH = 400                                  # path per update() agar request tidak terlalu besar
RE_UID = re.compile(r"^[0-9A-F]{8,20}$")
RE_NIS = re.compile(r"^[0-9]{1,20}$")
RE_JAM = re.compile(r"^\d{1,2}:\d{2}(:\d{2})?$")
RE_JAM_RULES = re.compile(r"^[0-2][0-9]:[0-5][0-9]:[0-5][0-9]$")   # sama dengan rules attendance/log (jam masuk/pulang)
RE_TGL = re.compile(r"^20[0-9]{2}-[01][0-9]-[0-3][0-9]$")
HARI_VALID = {"Semua", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu", "Minggu"}

# Jalur yang BOLEH ditulis (awalan). Selain itu -> ditolak, apa pun alasannya.
JALUR_BOLEH = ("config/students/", "config/schedule", "config/version", "profiles/", "parents/", "attendance/", "log/", "izin/")
# Jalur yang tidak pernah boleh disentuh (daftar eksplisit agar pesan galatnya jelas; JALUR_BOLEH sudah menolak semuanya)
JALUR_TERLARANG = ("staff", "discipline", "lessons", "lessonsByStudent", "validasi", "validasiByStudent", "izinMeta",
                   "activity", "activityLast", "piketRoster", "piketAkun", "piketPerangkat", "piketHarian",
                   "manualTap", "manualTapByStudent", "sistem", "device", "unknown")


class MigrasiError(Exception):
    pass


def email_ortu(nis: str, ver: int) -> str:
    return f"{nis}.{ver}@{ORTU_DOMAIN}"


def buat_pin() -> str:
    return f"{secrets.randbelow(1_000_000):06d}"   # CSPRNG, bukan random.random


def init(sa_file, db_url: str, project_id: str = None):
    """sa_file = None untuk Emulator (set FIREBASE_AUTH_EMULATOR_HOST + FIREBASE_DATABASE_EMULATOR_HOST)."""
    if firebase_admin._apps:
        return
    cred = credentials.Certificate(sa_file) if sa_file else None
    opsi = {"databaseURL": db_url}
    if project_id:
        opsi["projectId"] = project_id
    firebase_admin.initialize_app(cred, opsi)


# ------------------------------------------------------------------ penulisan aman
def _periksa_jalur(path: str):
    p = path.lstrip("/")
    if not p.startswith(JALUR_BOLEH):
        raise MigrasiError(f"jalur '{path}' tidak boleh ditulis oleh skrip migrasi (data modul lain dilindungi)")


def _update_batch(paths: dict, label: str, dry_run: bool):
    for k in paths:
        _periksa_jalur(k)
    items = list(paths.items())
    if not dry_run:
        for i in range(0, len(items), BATCH):
            db.reference("/").update(dict(items[i:i + BATCH]))
    print(f"  {label}: {len(items)} path {'AKAN ditulis (dry-run)' if dry_run else 'ditulis'}")


def _user_by_email(email):
    try:
        return auth.get_user_by_email(email)
    except auth.UserNotFoundError:
        return None


def _baca_roles() -> dict:
    return db.reference("roles").get() or {}


# ------------------------------------------------------------------ 1. akun inti
def setup_akun_inti(admin_email: str, admin_password: str, dry_run: bool = True, konfirmasi_rotasi: str = "") -> dict:
    """Admin pakai password pilihan Anda; alat dapat password acak 24 karakter.

    !!! PERINGATAN !!! Bila akun alat SUDAH ADA, password-nya DIROTASI dan firmware ESP32 HARUS di-flash ulang dengan
    kredensial baru. Rotasi hanya dilakukan bila `konfirmasi_rotasi == "YA"`; selain itu password alat TIDAK diubah.
    Peran (roles) milik kepala/waka/piket TIDAK disentuh; peran admin/alat hanya dipasang pada uid-nya sendiri dan
    ditolak bila uid itu sudah memegang peran lain."""
    hasil = {"rotasi_alat": False}
    roles = _baca_roles()

    u = _user_by_email(admin_email)
    if u is None:
        print("  akun admin AKAN dibuat:" if dry_run else "  akun admin dibuat:", admin_email)
        if not dry_run:
            u = auth.create_user(email=admin_email, password=admin_password)
    else:
        print("  akun admin sudah ada:", admin_email)
        if roles.get(u.uid) not in (None, "admin"):
            raise MigrasiError(f"uid {admin_email} sudah berperan '{roles.get(u.uid)}', bukan admin: peran TIDAK ditimpa")
    hasil["admin_uid"] = u.uid if u else None

    d = _user_by_email(DEVICE_EMAIL)
    if d is None:
        dev_pw = secrets.token_urlsafe(18)
        print("  akun alat AKAN dibuat:" if dry_run else "  akun alat dibuat:", DEVICE_EMAIL)
        if not dry_run:
            d = auth.create_user(email=DEVICE_EMAIL, password=dev_pw)
        hasil.update(device_password=dev_pw)
    else:
        if roles.get(d.uid) not in (None, "device"):
            raise MigrasiError(f"uid alat sudah berperan '{roles.get(d.uid)}': peran TIDAK ditimpa")
        if konfirmasi_rotasi == "YA":
            dev_pw = secrets.token_urlsafe(18)
            print("  ⚠️  password alat AKAN DIROTASI — flash ulang firmware dengan kredensial baru!" if dry_run else "  ⚠️  password alat DIROTASI — flash ulang firmware dengan kredensial baru!")
            if not dry_run:
                auth.update_user(d.uid, password=dev_pw)
            hasil.update(device_password=dev_pw, rotasi_alat=True)
        else:
            print("  akun alat sudah ada: password TIDAK diubah (ketik YA pada konfirmasi bila memang ingin merotasi)")
    hasil.update(device_uid=d.uid if d else None, device_email=DEVICE_EMAIL)

    if not dry_run and u is not None and d is not None:
        baru = {}
        if roles.get(u.uid) != "admin":
            baru[u.uid] = "admin"
        if roles.get(d.uid) != "device":
            baru[d.uid] = "device"
        if baru:
            db.reference("roles").update(baru)   # HANYA uid admin & alat; peran lain tidak disentuh
    return hasil


# ------------------------------------------------------------------ validasi (mirror rules)
def _valid_siswa(uid: str, nis: str, nama: str, kelas: str):
    """config/students: UID kartu hex 8-20, NIS angka 1-20, nama 1-60, kelas 1-15. Kembalikan alasan galat atau None."""
    if not RE_UID.match(uid):
        return f"UID tidak valid '{uid}' (harus hex 8-20)"
    if not RE_NIS.match(nis):
        return f"NIS kosong/tidak valid '{nis}'"
    if not (1 <= len(nama) <= 60):
        return f"nama kosong atau > 60 karakter ({nis})"
    if not (1 <= len(kelas) <= 15):
        return f"kelas kosong atau > 15 karakter ({nis})"
    return None


# ------------------------------------------------------------------ 2+3. siswa & ortu
def migrasi_siswa(induk_rows: list, csv_path: str, dry_run: bool = True) -> dict:
    """induk_rows: baris Data_Induk TANPA header: [UID, Nama, Kelas, NIS]."""
    siswa, masalah, nis_ke_uid = {}, [], {}
    for i, r in enumerate(induk_rows, start=2):
        r = [str(x).strip() for x in (list(r) + [""] * 4)[:4]]
        uid, nama, kelas, nis = r[0].upper(), r[1], r[2], r[3]
        if not uid:
            continue
        if len(nama) > 60 or len(kelas) > 15:
            masalah.append(f"baris {i}: nama > 60 atau kelas > 15 karakter ({nama[:20]}...) — dilewati, bukan dipotong diam-diam")
            continue
        galat = _valid_siswa(uid, nis, nama, kelas)
        if galat:
            masalah.append(f"baris {i}: {galat}")
            continue
        if uid in siswa:
            masalah.append(f"baris {i}: UID ganda {uid}")
            continue
        if nis in nis_ke_uid:
            masalah.append(f"baris {i}: NIS ganda {nis}")
            continue
        siswa[uid] = {"nis": nis, "nama": nama, "kelas": kelas}
        nis_ke_uid[nis] = uid

    paths = {}
    for uid, s in siswa.items():
        paths[f"config/students/{uid}"] = s
        # per-field: JANGAN menimpa profiles/{nis}/aktifSejak (tanggal mulai dihitung hari efektif)
        paths[f"profiles/{s['nis']}/nama"] = s["nama"]
        paths[f"profiles/{s['nis']}/kelas"] = s["kelas"]
    _update_batch(paths, "siswa & profil", dry_run)

    # Akun ortu: hanya dibuat jika belum ada -> PIN lama tidak berubah saat skrip diulang
    ada = db.reference("parents").get() or {}
    baru, parents = [], {}
    for nis, uid in nis_ke_uid.items():
        if nis in ada and ada[nis].get("uid"):
            continue
        pin = buat_pin()
        if not dry_run:
            email = email_ortu(nis, 1)
            u = _user_by_email(email)
            if u is None:
                u = auth.create_user(email=email, password=pin)
            else:
                auth.update_user(u.uid, password=pin)
            parents[f"parents/{nis}"] = {"uid": u.uid, "ver": 1}
        baru.append((nis, siswa[uid]["nama"], siswa[uid]["kelas"], pin))
    if parents:
        _update_batch(parents, "akun ortu baru", dry_run)

    if baru and not dry_run:
        with open(csv_path, "w", newline="", encoding="utf-8-sig") as f:
            w = csv.writer(f)
            w.writerow(["NIS", "Nama", "Kelas", "PIN"])
            w.writerows(sorted(baru, key=lambda x: (x[2], x[1])))
    print(f"  {len(siswa)} siswa valid, {len(baru)} akun ortu baru{' (dry-run: belum dibuat)' if dry_run else ''}, {len(masalah)} baris dilewati")
    return {"nis_ke_uid": nis_ke_uid, "masalah": masalah, "ortu_baru": len(baru)}


# ------------------------------------------------------------------ 4. jadwal
def migrasi_jadwal(jadwal_rows: list, dry_run: bool = True) -> int:
    """Data_Jadwal v11.1 tanpa header: [Kelas, Hari, Jenis, Jam_Mulai, Jam_Selesai]. Menggantikan config/schedule seluruhnya."""
    out, n = {}, 0
    for r in jadwal_rows:
        r = [str(x).strip() for x in (list(r) + [""] * 5)[:5]]
        if r[2] not in ("Masuk", "Terlambat", "Pulang") or not (RE_JAM.match(r[3]) and RE_JAM.match(r[4])):
            continue
        if r[1] not in HARI_VALID or not (1 <= len(r[0]) <= 15) or r[0] == "":
            continue
        mulai, selesai = r[3][:5].zfill(5), r[4][:5].zfill(5)
        if not (RE_JAM_RULES.match(mulai + ":00") and RE_JAM_RULES.match(selesai + ":00")) or mulai > selesai:
            continue
        out[f"s{n:03d}"] = {"kelas": r[0], "hari": r[1], "jenis": r[2], "mulai": mulai, "selesai": selesai}
        n += 1
    if not dry_run:
        _periksa_jalur("config/schedule")
        db.reference("config/schedule").set(out)
    print(f"  jadwal: {n} baris {'AKAN ditulis (dry-run)' if dry_run else 'ditulis'}")
    return n


# ------------------------------------------------------------------ 5. riwayat
def _tgl(s: str):
    s = str(s).strip()
    for fmt in ("%Y-%m-%d", "%d/%m/%Y", "%d-%m-%Y", "%m/%d/%Y"):
        try:
            return datetime.strptime(s, fmt).strftime("%Y-%m-%d")
        except ValueError:
            pass
    return None


def _jam(s: str):
    s = str(s).strip()
    if not RE_JAM.match(s):
        return None
    p = s.split(":")
    j = f"{int(p[0]):02d}:{p[1]}:{p[2] if len(p) > 2 else '00'}"
    return j if RE_JAM_RULES.match(j) and int(p[0]) < 24 else None


def migrasi_riwayat(tap_rows: list, izin_rows: list, nis_ke_uid: dict, dry_run: bool = True) -> dict:
    """tap_rows: Data_UtamaSiswa tanpa header: [Tanggal, Jam, UID, Nama, Jabatan, Kelas, Status, NIS].
    Ambil tap Masuk & Pulang PERTAMA per siswa per tanggal (sama dgn aturan alat).
    TIDAK menimpa: hari yang sudah punya data alat (masuk/status/pulang) dan keterangan izin yang sudah ada."""
    uid_ke_nis = {u: n for n, u in nis_ke_uid.items()}
    masuk, pulang, lewat = {}, {}, 0
    for r in tap_rows:
        r = [str(x).strip() for x in (list(r) + [""] * 8)[:8]]
        tgl, jam, uid, status = _tgl(r[0]), _jam(r[1]), r[2].upper(), r[6]
        nis = r[7] or uid_ke_nis.get(uid, "")
        if not (tgl and jam and RE_TGL.match(tgl) and RE_UID.match(uid) and RE_NIS.match(nis)) or r[4] == "Guru":
            lewat += 1
            continue
        key = (nis, tgl)
        info = {"uid": uid, "jam": jam, "nama": r[3][:60], "kelas": r[5][:15], "status": status}
        if status in ("Hadir", "Terlambat"):
            if key not in masuk or jam < masuk[key]["jam"]:
                masuk[key] = info
        elif status == "Pulang":
            if key not in pulang or jam < pulang[key]["jam"]:
                pulang[key] = info
        else:
            lewat += 1

    # data yang SUDAH ADA di database (alat / piket / waka) tidak ditimpa
    nis_terlibat = {n for n, _ in masuk} | {n for n, _ in pulang} | {str(r[0]).strip() for r in (izin_rows or []) if r and str(r[0]).strip().isdigit()}
    ada_att = {n: (db.reference(f"attendance/{n}").get() or {}) for n in nis_terlibat}

    paths, dilewati_ada = {}, 0
    for (nis, tgl), m in masuk.items():
        if ada_att.get(nis, {}).get(tgl, {}).get("status") or ada_att.get(nis, {}).get(tgl, {}).get("masuk"):
            dilewati_ada += 1
            continue
        paths[f"attendance/{nis}/{tgl}/masuk"] = m["jam"]
        paths[f"attendance/{nis}/{tgl}/status"] = m["status"]
        paths[f"log/{tgl}/{m['uid']}_M"] = {"jam": m["jam"], "nis": nis, "nama": m["nama"], "kelas": m["kelas"], "status": m["status"]}
    for (nis, tgl), p in pulang.items():
        if ada_att.get(nis, {}).get(tgl, {}).get("pulang"):
            dilewati_ada += 1
            continue
        paths[f"attendance/{nis}/{tgl}/pulang"] = p["jam"]
        paths[f"log/{tgl}/{p['uid']}_P"] = {"jam": p["jam"], "nis": nis, "nama": p["nama"], "kelas": p["kelas"], "status": "Pulang"}

    n_izin = 0
    for r in izin_rows or []:   # Data_Izin: [NIS, Tanggal, Jenis, Keterangan]
        r = [str(x).strip() for x in (list(r) + [""] * 4)[:4]]
        tgl = _tgl(r[1])
        jenis = "Sakit" if r[2].lower().startswith("sakit") else ("Izin" if r[2] else "")
        if not (RE_NIS.match(r[0]) and tgl and jenis) or (r[0], tgl) in masuk:
            continue
        if ada_att.get(r[0], {}).get(tgl, {}).get("ket"):
            dilewati_ada += 1                      # keterangan sudah ada (mungkin Dispensasi dari piket/waka): tidak ditimpa
            continue
        paths[f"attendance/{r[0]}/{tgl}/ket"] = jenis        # nilai: Izin | Sakit | Dispensasi (rules)
        paths[f"izin/{tgl}/{r[0]}"] = jenis                  # indeks harian utk dashboard admin
        if r[3]:
            paths[f"attendance/{r[0]}/{tgl}/catatan"] = r[3][:200]
        n_izin += 1

    _update_batch(paths, "riwayat presensi", dry_run)
    print(f"  {len(masuk)} hari-masuk, {len(pulang)} hari-pulang, {n_izin} izin/sakit, {lewat} baris dilewati (tidak valid), {dilewati_ada} sudah ada (tidak ditimpa)")
    return {"masuk": len(masuk), "pulang": len(pulang), "izin": n_izin, "lewat": lewat, "sudah_ada": dilewati_ada}


def naikkan_versi(dry_run: bool = True):
    v = int(time.time())
    if not dry_run:
        _periksa_jalur("config/version")
        db.reference("config/version").set(v)
    print("  config/version =", v, "(dry-run: belum ditulis)" if dry_run else "")
    return v
