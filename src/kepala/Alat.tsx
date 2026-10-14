import { StatusBadge } from "../components/ui";
import Icon from "../components/Icon";
import { fmtBytes, fmtUptime } from "../lib/format";
import { jamDariMs, relatif } from "../lib/time";
import { useAdminData } from "../admin/AdminData";

/** Status alat — hanya kondisi. Tanpa perintah, log kejadian, maupun kartu tidak terdaftar. */
export default function Alat() {
  const { device: d, online, serverNow, studentMap } = useAdminData();
  const flashPct = d?.flashUsed && d.flashTotal ? Math.round((d.flashUsed / d.flashTotal) * 100) : null;
  const jumlahSiswa = Object.keys(studentMap).length;

  return (
    <section className="data-page">
      <div className="section-heading"><div><p>Status alat</p><span>Kondisi alat presensi (hanya pantau)</span></div></div>

      <div className="device-hero">
        <div className={`device-illustration ${online ? "" : "off"}`}><Icon name="device" size={48} /><span className="device-signal"><Icon name="wifi" size={20} /></span></div>
        <div>
          <StatusBadge status={online ? "Online" : "Offline"} />
          <p>ESP32-RFID-01</p>
          <span>{d?.firmware ? `Firmware ${d.firmware}` : "Firmware -"} · {d?.lastSeen ? `laporan ${relatif(d.lastSeen, serverNow())} (${jamDariMs(d.lastSeen)})` : "belum pernah melapor"}</span>
        </div>
        <div className="device-metrics">
          <div><span>Sinyal WiFi</span><b>{d?.rssi != null ? `${d.rssi} dBm` : "-"}</b></div>
          <div><span>Antrian kirim</span><b>{d?.antrian ?? 0} data</b></div>
          <div><span>Aktif sejak</span><b>{fmtUptime(d?.uptime)}</b></div>
        </div>
      </div>

      {!online && (
        <div className="notice warn"><Icon name="warning" size={17} /><span>Alat offline. Tap kartu tetap tersimpan di alat dan dikirim saat alat kembali online.</span></div>
      )}

      <article className="panel">
        <div className="panel-header"><div><p className="panel-title">Kondisi alat</p><span>Dari laporan rutin alat (tiap 60 detik)</span></div></div>
        <div className="kv-list">
          <Kv k="Pembaca RFID" v={d?.rfid === false ? "Tidak terdeteksi" : d?.rfid ? "Normal" : "-"} bad={d?.rfid === false} />
          <Kv k="Sinkron waktu (NTP)" v={d?.ntp === false ? "Belum sinkron" : d?.ntp ? "Sinkron" : "-"} bad={d?.ntp === false} />
          <Kv k="Jaringan WiFi" v={d?.ssid ?? "-"} />
          <Kv k="Data siswa di alat" v={`${d?.kartu ?? "-"} kartu · ${d?.jadwal ?? "-"} baris jadwal`} bad={d?.kartu != null && d.kartu !== jumlahSiswa} />
          <Kv k="Memori bebas" v={`${fmtBytes(d?.heap)} (terendah ${fmtBytes(d?.heapMin)})`} bad={(d?.heapMin ?? 1e9) < 40000} />
          <Kv k="Flash" v={flashPct == null ? "-" : `${flashPct}% terpakai`} bad={(flashPct ?? 0) > 85} />
          <Kv k="Gagal kirim (dead-letter)" v={`${d?.dead ?? 0} data`} bad={(d?.dead ?? 0) > 0} />
          <Kv k="Ditolak server" v={`${d?.ditolak ?? 0} data`} bad={(d?.ditolak ?? 0) > 0} />
        </div>
      </article>
    </section>
  );
}

function Kv({ k, v, bad }: { k: string; v: string; bad?: boolean }) {
  return <div className={bad ? "bad" : ""}><span>{k}</span><b>{v}</b></div>;
}
