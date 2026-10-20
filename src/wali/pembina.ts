import { useAuth } from "../auth/AuthContext";

/** Guru pembina per akun: wali kelas atau BK. Halaman Pembinaan/Usulan dipakai bersama; yang berbeda hanya label dan ambang tanggung jawab. */
export function usePembina() {
  const { session } = useAuth();
  const peran: "wali" | "bk" = session?.role === "bk" ? "bk" : "wali";
  const akun = session?.role === "wali" || session?.role === "bk" ? session : null;
  return { peran, uid: akun?.uid ?? "", nama: akun?.nama ?? "", label: peran === "bk" ? "BK" : "wali kelas", base: peran === "bk" ? "/bk" : "/wali" };
}
