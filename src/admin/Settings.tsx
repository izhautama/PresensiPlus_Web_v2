import { useAdminData } from "./AdminData";
import GantiPassword from "./GantiPassword";
import BackupPengingat from "./BackupPengingat";
import StaffAccounts from "./StaffAccounts";

export default function Settings() {
  const { students, schedule } = useAdminData();

  return (
    <section className="data-page">
      <div className="section-heading"><div><p>Pengaturan</p><span>Akun admin, akun pimpinan &amp; staf, dan informasi sistem</span></div></div>
      <div className="device-grid">
        <GantiPassword judul="Ganti password admin" />
        <article className="panel">
          <div className="panel-header"><div><p className="panel-title">Informasi sistem</p><span>Firebase Realtime Database · paket Spark (gratis)</span></div></div>
          <div className="kv-list">
            <div><span>Siswa terdaftar</span><b>{students.length}</b></div>
            <div><span>Baris jadwal</span><b>{schedule.length}</b></div>
            <div><span>Hari libur</span><b>Minggu (otomatis)</b></div>
            <div><span>Sesi orang tua</span><b>Keluar otomatis setelah 30 menit tidak aktif</b></div>
            <div><span>Project</span><b>{import.meta.env.VITE_FIREBASE_PROJECT_ID}</b></div>
          </div>
          <p className="modal-note">Akun admin tambahan dibuat lewat Firebase Console (Authentication), lalu UID-nya diberi peran <code>admin</code> di Realtime Database &gt; <code>roles</code>.</p>
        </article>
      </div>
      <BackupPengingat />
      <StaffAccounts />
    </section>
  );
}
