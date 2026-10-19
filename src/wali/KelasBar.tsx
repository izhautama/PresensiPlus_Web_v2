import Icon from "../components/Icon";
import { decodeKelas } from "../lib/wali";
import { useKelasWali } from "./WaliData";

/** Topbar wali: kelas binaan aktif. Pemilih kelas hanya muncul bila memegang lebih dari satu kelas. */
export default function KelasBar() {
  const { kelas, aktif, setAktif } = useKelasWali();
  if (kelas.length === 0) return null;
  return (
    <span className="petugas-bar no-print" data-testid="kelas-bar">
      <Icon name="users" size={15} />
      {kelas.length === 1 ? <span>Kelas: <b data-testid="kelas-aktif">{decodeKelas(kelas[0])}</b></span> : (
        <label>Kelas:{" "}
          <select className="text-input auto" aria-label="Kelas binaan" data-testid="kelas-pilih" value={aktif ?? ""} onChange={(e) => setAktif(e.target.value)}>
            {kelas.map((k) => <option key={k} value={k}>{decodeKelas(k)}</option>)}
          </select>
        </label>
      )}
    </span>
  );
}
