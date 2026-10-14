import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useNavigate } from "react-router";
import Icon from "../components/Icon";
import { Empty, Spinner } from "../components/ui";
import { logout } from "../services/auth";
import { catatAktivitas, daftarkanPerangkatPiket, setPetugasAktivitas } from "../services/aktivitas";
import { siapkanLabelPerangkat } from "../lib/perangkat";
import { useLive } from "../services/db";

const KEY = "piket-petugas"; // sessionStorage: berlaku per tab/sesi; dihapus saat keluar

export type Petugas = { id: string; nama: string };
type Ctx = { petugas: Petugas | null; pilih: (p: Petugas) => void; ganti: () => void };
const PetugasCtx = createContext<Ctx>({ petugas: null, pilih: () => {}, ganti: () => {} });
export const usePetugas = () => useContext(PetugasCtx);

const baca = (): Petugas | null => {
  try { const v = JSON.parse(sessionStorage.getItem(KEY) ?? "null"); return v?.id && v?.nama ? v : null; } catch { return null; }
};

/**
 * Akun piket dipakai bersama, jadi "siapa" = nama petugas yang DIPILIH SENDIRI (deklarasi mandiri, bukan autentikasi).
 * Pilihan disimpan di sessionStorage sehingga tab/sesi baru selalu menanyakan lagi.
 */
export function PetugasProvider({ children }: { children: ReactNode }) {
  const [petugas, setPetugas] = useState<Petugas | null>(baca);
  useEffect(() => { void siapkanLabelPerangkat(); }, []); // label perangkat yang lebih rinci (userAgentData) disiapkan sebelum aksi pertama
  // nama petugas harus sudah terpasang di modul aktivitas SEBELUM tulisan pertama (sinkron, bukan lewat efek)
  if (petugas) setPetugasAktivitas(petugas.nama);
  const pilih = useCallback((p: Petugas) => {
    try { sessionStorage.setItem(KEY, JSON.stringify(p)); } catch { /* tanpa penyimpanan: tetap berlaku selama tab terbuka */ }
    setPetugasAktivitas(p.nama);
    setPetugas(p);
    void daftarkanPerangkatPiket();
    void catatAktivitas("pilih-petugas", `Memilih petugas: ${p.nama}`);
  }, []);
  const ganti = useCallback(() => {
    try { sessionStorage.removeItem(KEY); } catch { /* abaikan */ }
    setPetugasAktivitas(undefined);
    setPetugas(null);
  }, []);
  const value = useMemo(() => ({ petugas, pilih, ganti }), [petugas, pilih, ganti]);
  return <PetugasCtx.Provider value={value}>{children}</PetugasCtx.Provider>;
}

/** Layar wajib sebelum menu apa pun dapat dipakai. */
export function PilihPetugas() {
  const { pilih } = usePetugas();
  const navigate = useNavigate();
  const roster = useLive<Record<string, { nama: string; aktif: boolean }>>("piketRoster");
  const daftar = Object.entries(roster.data ?? {}).filter(([, x]) => x.aktif).sort((a, b) => a[1].nama.localeCompare(b[1].nama));
  return (
    <main className="route-loader">
      <div className="setup-card pilih-petugas">
        <p className="login-title">Siapa yang bertugas?</p>
        <p className="login-subtitle">Pilih nama Anda. Nama ini dicatat pada setiap izin dan pelanggaran yang Anda input.</p>
        {roster.loading ? <div className="page-loader"><Spinner dark /></div> : roster.error ? (
          <Empty icon="alert" title="Daftar petugas tidak dapat dimuat" text={roster.error} />
        ) : daftar.length === 0 ? (
          <Empty icon="users" title="Belum ada petugas aktif" text="Minta Waka Kesiswaan atau Admin menambahkan nama di menu Petugas piket." />
        ) : (
          <div className="petugas-list" role="listbox" aria-label="Daftar petugas">
            {daftar.map(([id, x]) => (
              <button key={id} role="option" aria-selected="false" className="petugas-item" onClick={() => pilih({ id, nama: x.nama })}>
                <Icon name="users" size={18} /><span>{x.nama}</span><Icon name="chevronRight" size={16} />
              </button>
            ))}
          </div>
        )}
        <button className="secondary-button" onClick={async () => { await logout(); navigate("/login", { replace: true }); }}><Icon name="logout" size={15} />Keluar</button>
      </div>
    </main>
  );
}
