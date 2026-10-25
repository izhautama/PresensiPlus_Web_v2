import { useState } from "react";
import Icon from "../components/Icon";
import { Spinner } from "../components/ui";
import { useToast } from "../admin/AdminLayout";
import { PJ_LABEL } from "../lib/pembinaan";
import { useActor, useDiscipline } from "../kesiswaan/useDiscipline";
import { pratinjauMigrasi, terapkanMigrasi, type RencanaMigrasi } from "../services/pembinaanLanjut";

/**
 * Migrasi v2.5 (khusus kepala): pratinjau (dry-run, tidak menulis) lalu terapkan. Memindahkan record pembinaan lama ke jalur berperingkat
 * pembinaan/{wali|bk|kepala}/..., mengisi penanda ambang terpakai, mengubah ambang lama 'waka' ke kepala, dan menghapus salinan status orang tua lama.
 */
export default function MigrasiPembinaan() {
  const actor = useActor();
  const notify = useToast();
  const d = useDiscipline();
  const [rencana, setRencana] = useState<RencanaMigrasi | null>(null);
  const [sibuk, setSibuk] = useState<"pratinjau" | "terapkan" | null>(null);
  const [progres, setProgres] = useState<[number, number] | null>(null);
  const [hasil, setHasil] = useState<{ record: number; level: number; statusDihapus: number } | null>(null);
  const [galat, setGalat] = useState("");

  const lihat = async () => {
    setSibuk("pratinjau"); setGalat(""); setHasil(null);
    try { setRencana(await pratinjauMigrasi(d.levels)); } catch (ex) { setGalat((ex as Error).message); } finally { setSibuk(null); }
  };
  const terapkan = async () => {
    if (!rencana) return;
    setSibuk("terapkan"); setGalat("");
    try {
      setHasil(await terapkanMigrasi(rencana, actor, (a, b) => setProgres([a, b])));
      setRencana(null); notify("Migrasi selesai");
    } catch (ex) { setGalat(`Migrasi berhenti: ${(ex as Error).message}. Jalankan pratinjau lagi untuk melanjutkan sisanya.`); } finally { setSibuk(null); setProgres(null); }
  };
  const kosong = rencana && !rencana.record.length && !rencana.levelDiubah.length && !rencana.statusLama;

  return (
    <section className="data-page" data-testid="migrasi-pembinaan">
      <div className="section-heading"><div><p>Migrasi pembinaan v2.5</p><span>Pratinjau dulu, baru terapkan. Aman dijalankan ulang: yang sudah dipindah tidak dihitung lagi.</span></div></div>
      <article className="panel">
        <div className="panel-header"><div><p className="panel-title">Yang dilakukan</p><span>
          1) ambang berpenanggung jawab waka/kosong menjadi kepala (lv04-lv06) atau bawaan; 2) record pembinaan lama dipindah ke kelompok sesuai penanggung jawab ambang
          (wali, BK, kepala), dalam satu update per batch; 3) ambang yang dipakai ditandai terpakai (mengunci penanggung jawab); 4) salinan status lama dihapus.
          Waka kehilangan akses baca ke record kepala (disengaja).</span></div></div>
        <div className="modal-actions" style={{ justifyContent: "flex-start" }}>
          <button className="secondary-button" onClick={lihat} disabled={!!sibuk || d.loading} data-testid="pratinjau-migrasi">{sibuk === "pratinjau" ? <Spinner dark /> : <Icon name="eye" size={16} />}Pratinjau (tanpa menulis)</button>
          <button className="primary-button" onClick={terapkan} disabled={!rencana || !!sibuk || !!kosong} data-testid="terapkan-migrasi">{sibuk === "terapkan" ? <Spinner /> : null}Terapkan migrasi</button>
        </div>
        {progres && <p className="modal-note" data-testid="progres-migrasi">Memindahkan {progres[0]} dari {progres[1]} record…</p>}
        {galat && <div className="login-error-box" role="alert"><div><span>{galat}</span></div></div>}
        {rencana && (
          <div className="simple-list" data-testid="rencana-migrasi">
            <div><span><b>Ambang diubah</b></span><span>{rencana.levelDiubah.length ? rencana.levelDiubah.map((l) => `${l.id}: ${l.dari ?? "kosong"} → ${PJ_LABEL[l.ke]}`).join(", ") : "Tidak ada"}</span></div>
            <div><span><b>Record dipindah</b></span><span data-testid="jumlah-record">{rencana.record.length} (wali {rencana.perKelompok.wali}, BK {rencana.perKelompok.bk}, kepala {rencana.perKelompok.kepala})</span></div>
            <div><span><b>Tidak dapat dipindah</b></span><span>{rencana.tidakBisa.length ? rencana.tidakBisa.map((x) => `${x.nis}/${x.id} (${x.alasan})`).join("; ") : "Tidak ada"}</span></div>
            <div><span><b>Ambang ditandai terpakai</b></span><span>{rencana.levelTerpakai.filter((x) => !rencana.terpakaiAda.includes(x)).join(", ") || "Tidak ada yang baru"}</span></div>
            <div><span><b>Salinan status lama (siswa)</b></span><span>{rencana.statusLama}</span></div>
            {kosong && <div><span>Tidak ada yang perlu dimigrasi.</span></div>}
          </div>
        )}
        {hasil && <p className="modal-note" data-testid="hasil-migrasi">Selesai: {hasil.record} record dipindah, {hasil.level} ambang diubah, {hasil.statusDihapus} salinan status dihapus. Tercatat di log aktivitas.</p>}
      </article>
    </section>
  );
}
