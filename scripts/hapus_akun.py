"""
Hapus akun staf PERMANEN (Presensi+ MA Nurul Huda v2.5.1): Firebase Authentication + node akun di Realtime Database.
SUMBER TUNGGAL: berkas ini disalin ke sel notebook `Setup_Migrasi_Firebase.ipynb` oleh `python scripts/sync_notebook.py`.
Dijalankan dari Colab/laptop (lihat notebook) atau terhadap Emulator untuk uji (`npm run test:migrasi`).

Admin menandai akun di web (Pengaturan, "Menunggu dihapus permanen"): node hapusAkun/{uid}. Skrip ini yang benar-benar menghapus.

PENTING:
  * Admin SDK MELEWATI Security Rules, jadi semua syarat DIPERIKSA ULANG di sini (bukan hanya di web).
  * DRY-RUN bawaan: hanya mencetak daftar tanda, hasil pemeriksaan, dan jalur yang akan dihapus. Menulis/menghapus HANYA bila dry_run=False
    dan operator mengetik "HAPUS".
  * Yang dihapus: akun Authentication + staff/roles/waliAkun/bkAkun/piketAkun/hapusAkun/{uid}. Yang TETAP (jejak audit): activity, pembinaan,
    konseling, konselingAudit, discipline/*, usulRemisi, izinMeta, dan semua data lain yang menyimpan uid/nama pembuat.
  * Penghapusan TIDAK BISA dibatalkan; email akun menjadi bebas dipakai ulang.
  * Idempoten: aman diulang (akun Auth yang sudah tidak ada dianggap terhapus; tanda yang sudah diproses hilang dari daftar).
"""
import time
from datetime import datetime, timedelta, timezone

import firebase_admin
from firebase_admin import auth, credentials, db

PERAN_BOLEH = ("kepala", "waka", "piket", "wali", "bk")
KATA_KONFIRMASI = "HAPUS"
JALUR_AKUN = ("staff", "roles", "waliAkun", "bkAkun", "piketAkun", "hapusAkun")   # node per-uid yang dihapus
WIB = timezone(timedelta(hours=7))


def init_hapus(sa_file, db_url: str, project_id: str = None):
    """sa_file = None untuk Emulator (set FIREBASE_AUTH_EMULATOR_HOST + FIREBASE_DATABASE_EMULATOR_HOST)."""
    if firebase_admin._apps:
        return
    cred = credentials.Certificate(sa_file) if sa_file else None
    opsi = {"databaseURL": db_url}
    if project_id:
        opsi["projectId"] = project_id
    firebase_admin.initialize_app(cred, opsi)


def periksa_tanda(uid: str, tanda: dict, roles: dict, staff: dict, klaim: dict, pembinaan_bk: dict) -> list:
    """FUNGSI MURNI: daftar masalah (kosong = boleh dihapus). Tidak membaca database."""
    masalah = []
    peran = tanda.get("peran")
    role_kini = roles.get(uid)
    if role_kini is not None:
        masalah.append(f"akun masih memiliki role '{role_kini}' (cabut aksesnya dulu)" + (" - admin/alat TIDAK dapat dihapus" if role_kini in ("admin", "device") else ""))
    if peran not in PERAN_BOLEH:
        masalah.append(f"peran '{peran}' tidak boleh dihapus (hanya {', '.join(PERAN_BOLEH)})")
    if tanda.get("olehUid") == uid:
        masalah.append("akun tidak boleh menghapus dirinya sendiri")
    s = staff.get(uid)
    if s is not None and s.get("role") not in PERAN_BOLEH:
        masalah.append(f"staff/{uid}/role = '{s.get('role')}' bukan peran yang boleh dihapus")
    if s is not None and peran in PERAN_BOLEH and s.get("role") != peran:
        masalah.append(f"peran pada tanda ('{peran}') berbeda dengan staff/{uid}/role ('{s.get('role')}')")
    if not (isinstance(tanda.get("alasan"), str) and 10 <= len(tanda["alasan"]) <= 300):
        masalah.append("alasan pada tanda tidak sah (10-300 karakter)")
    if peran == "bk":
        for nis, per in (klaim or {}).items():
            for kunci, k in (per or {}).items():
                if k.get("bkUid") != uid:
                    continue
                status = ((pembinaan_bk or {}).get(nis) or {}).get(kunci, {}).get("status")
                if status != "selesai":
                    masalah.append(f"klaim BK aktif: nis {nis}, kunci {kunci} (pembinaan belum selesai; lepas/pindahkan klaim dulu)")
    return masalah


def jalur_dihapus(uid: str) -> list:
    return [f"{p}/{uid}" for p in JALUR_AKUN]


def _baca(path: str) -> dict:
    return db.reference(path).get() or {}


def _entri_log(olehUid: str, email_admin: str, peran: str, email: str, alasan: str) -> tuple:
    """(path, isi) entri activity dengan bentuk SAMA dengan yang ditulis web (src/services/aktivitas.ts sisipkanAktivitas), agar tampil di Log aktivitas."""
    sekarang = datetime.now(WIB)
    tgl = sekarang.strftime("%Y-%m-%d")
    hari_ke = int((time.time() * 1000 + 7 * 3600_000) // 86_400_000)
    id_log = db.reference("activity/x").push().key
    isi = {
        "uid": olehUid, "peran": "admin", "akunEmail": (email_admin or "-")[:120], "aksi": "hapus-akun-permanen",
        "detail": f"Hapus permanen {peran} {email} - {alasan}"[:300], "deviceId": "skrip-lokal", "deviceLabel": "Skrip lokal hapus_akun.py",
        "ts": {".sv": "timestamp"}, "hariKe": hari_ke,
    }
    return f"activity/{tgl}/{id_log}", isi


def hapus_akun_permanen(dry_run: bool = True, konfirmasi: str = "") -> dict:
    """Proses semua tanda hapusAkun. dry_run=True (bawaan): tidak menulis/menghapus apa pun. Mengembalikan ringkasan."""
    tanda_semua = _baca("hapusAkun")
    roles, staff = _baca("roles"), _baca("staff")
    klaim, pembinaan_bk = _baca("klaimBK"), _baca("pembinaan/bk")
    hasil = {"ditandai": len(tanda_semua), "layak": [], "ditolak": {}, "berhasil": [], "gagal": {}}
    print(f"Tanda hapus akun: {len(tanda_semua)}")
    for uid, tanda in sorted(tanda_semua.items()):
        masalah = periksa_tanda(uid, tanda, roles, staff, klaim, pembinaan_bk)
        etiket = f"{uid} ({tanda.get('peran')}, {tanda.get('email')})"
        if masalah:
            hasil["ditolak"][uid] = masalah
            print(f"  DITOLAK {etiket}")
            for m in masalah:
                print(f"     - {m}")
        else:
            hasil["layak"].append(uid)
            print(f"  LAYAK   {etiket}: akan menghapus Auth + {', '.join(jalur_dihapus(uid))}; jejak audit tetap")
    if dry_run:
        print(f"\nDRY-RUN: tidak ada yang dihapus. Layak {len(hasil['layak'])}, ditolak {len(hasil['ditolak'])}. Untuk menghapus: dry_run=False lalu ketik {KATA_KONFIRMASI}.")
        return hasil
    if konfirmasi != KATA_KONFIRMASI:
        print(f"\nDibatalkan: konfirmasi harus persis '{KATA_KONFIRMASI}'. Tidak ada yang dihapus.")
        hasil["dibatalkan"] = True
        return hasil
    for uid in hasil["layak"]:
        tanda = tanda_semua[uid]
        try:
            try:
                auth.delete_user(uid)
            except auth.UserNotFoundError:
                print(f"  {uid}: akun Auth sudah tidak ada (dilanjutkan)")
            email_admin = None
            try:
                email_admin = auth.get_user(tanda["olehUid"]).email
            except Exception:
                pass
            lokasi, log = _entri_log(tanda["olehUid"], email_admin, tanda["peran"], tanda["email"], tanda["alasan"])
            ubah = {p: None for p in jalur_dihapus(uid)}
            ubah[f"hapusAkunRiwayat/{uid}"] = {
                "email": tanda["email"], "nama": tanda["nama"], "peran": tanda["peran"], "alasan": tanda["alasan"],
                "olehUid": tanda["olehUid"], "ditandaiTs": tanda["ts"], "dihapusTs": {".sv": "timestamp"},
            }
            ubah[lokasi] = log
            db.reference("/").update(ubah)   # satu update atomik: hapus node akun + riwayat + log
            hasil["berhasil"].append(uid)
            print(f"  OK {uid}: dihapus")
        except Exception as e:  # noqa: BLE001 - laporan akhir memuat semua kegagalan
            hasil["gagal"][uid] = str(e)
            print(f"  GAGAL {uid}: {e}")
    print(f"\nSelesai: berhasil {len(hasil['berhasil'])}, gagal {len(hasil['gagal'])}, ditolak {len(hasil['ditolak'])}.")
    return hasil
