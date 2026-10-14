import { useState } from "react";
import { Link } from "react-router";
import Icon from "../components/Icon";
import { PANDUAN, type KodePanduan } from "../lib/panduan";

/** Halaman Panduan: statis (tanpa data, tanpa langganan database). Versi lengkap ada di folder docs/. */
export function PanduanIsi({ kode }: { kode: KodePanduan }) {
  const p = PANDUAN[kode];
  return (
    <article className="panel panduan-isi" data-testid={`panduan-${kode}`}>
      <div className="panel-header"><div><p className="panel-title">{p.judul}</p><span>Untuk: {p.untuk}</span></div></div>
      {p.bagian.map((b) => (
        <section key={b.judul} className="panduan-bagian">
          <h3>{b.judul}</h3>
          <ol>{b.langkah.map((l, i) => <li key={i}>{l}</li>)}</ol>
          {b.catatan && <p className="modal-note">Catatan: {b.catatan}</p>}
        </section>
      ))}
    </article>
  );
}

/** Panel staf: panduan peran + SOP harian dalam dua tab. */
export default function PanduanStaf({ peran }: { peran: Exclude<KodePanduan, "ortu" | "sop"> }) {
  const [tab, setTab] = useState<"peran" | "sop">("peran");
  return (
    <section className="data-page">
      <div className="section-heading"><div><p>Panduan</p><span>Versi ringkas. Versi lengkap ada di folder docs/ (PANDUAN_*.md dan SOP_HARIAN.md).</span></div></div>
      <div className="chip-group tabs no-print" role="tablist">
        <button role="tab" aria-selected={tab === "peran"} className={tab === "peran" ? "active" : ""} onClick={() => setTab("peran")}>{PANDUAN[peran].judul}</button>
        <button role="tab" aria-selected={tab === "sop"} className={tab === "sop" ? "active" : ""} onClick={() => setTab("sop")}>SOP harian</button>
      </div>
      <PanduanIsi kode={tab === "peran" ? peran : "sop"} />
    </section>
  );
}

/** Portal orang tua: halaman penuh sederhana dengan tombol kembali. */
export function PanduanOrtu({ nis }: { nis: string }) {
  return (
    <main className="student-page">
      <header className="student-header no-print">
        <div className="login-logo"><div className="brand-mark"><span>NH</span></div><div><p className="brand-name">Presensi<span>+</span></p><p className="brand-school">MA Nurul Huda</p></div></div>
        <div className="student-header-right"><Link className="student-logout" to={`/siswa/${nis}`}><Icon name="arrow" size={17} />Kembali</Link></div>
      </header>
      <section className="student-content"><h2 className="section-title"><Icon name="file" size={18} />Panduan</h2><PanduanIsi kode="ortu" /></section>
    </main>
  );
}
