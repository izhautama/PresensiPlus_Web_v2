"""Pelari uji skrip hapus akun terhadap EMULATOR (dipanggil tests/hapus_akun.test.mjs). Tidak pernah menyentuh produksi.
Argumen: <ns> <mode: dry|real> [konfirmasi]"""
import json
import os
import sys

HOME = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(HOME, "scripts"))
assert os.environ.get("FIREBASE_AUTH_EMULATOR_HOST") and os.environ.get("FIREBASE_DATABASE_EMULATOR_HOST"), "hanya untuk emulator"

import hapus_akun as H  # noqa: E402

ns, mode = sys.argv[1], sys.argv[2]
konfirmasi = sys.argv[3] if len(sys.argv) > 3 else ""
H.init_hapus(None, f"https://{ns}.firebaseio.com", "demo-presensi")
hasil = H.hapus_akun_permanen(dry_run=(mode == "dry"), konfirmasi=konfirmasi)
print("HASIL_JSON=" + json.dumps(hasil))
