import GantiPassword from "../admin/GantiPassword";

/** Pengaturan akun sendiri: dipakai peran kepala dan waka. */
export default function Pengaturan() {
  return (
    <section className="data-page">
      <div className="section-heading"><div><p>Pengaturan</p><span>Akun Anda</span></div></div>
      <div className="device-grid">
        <GantiPassword judul="Ganti password" />
      </div>
    </section>
  );
}
