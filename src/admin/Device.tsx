import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import Icon, { type IconName } from "../components/Icon";
import { Empty, Modal, Spinner, StatusBadge } from "../components/ui";
import { fmtBytes, fmtUptime } from "../lib/format";
import { jamDariMs, relatif } from "../lib/time";
import type { Ack, CommandName, DeviceEvent } from "../lib/types";
import { eventsQuery, kirimPerintah, tungguAck, useLive, useWatching } from "../services/db";
import { useAdminData } from "./AdminData";
import { useToast } from "./AdminLayout";

type Riwayat = { id: string; cmd: CommandName; arg?: string; waktu: number; ack?: Ack | null; menunggu: boolean };

const PERINTAH: { cmd: CommandName; label: string; desc: string; icon: IconName; danger?: boolean }[] = [
  { cmd: "diagnostik", label: "Cek sistem", desc: "RFID, LCD, WiFi, NTP, memori, flash, antrian", icon: "activity" },
  { cmd: "sync", label: "Sinkron ulang data", desc: "Unduh ulang data siswa & jadwal", icon: "refresh" },
  { cmd: "buzzer", label: "Tes buzzer", desc: "Bunyikan pola tes", icon: "volume" },
  { cmd: "lcd", label: "Pesan di LCD", desc: "Tampilkan teks 2 baris", icon: "message" },
  { cmd: "restart", label: "Restart alat", desc: "Antrian tersimpan aman di flash", icon: "power", danger: true },
];

export default function Device() {
  const { device, online, serverNow, today, studentMap } = useAdminData();
  const notify = useToast();
  const events = useLive<Record<string, DeviceEvent>>("device/events", eventsQuery);
  const unknown = useLive<Record<string, { jam: string }>>(`unknown/${today}`);
  const [riwayat, setRiwayat] = useState<Riwayat[]>([]);
  const [lcdOpen, setLcdOpen] = useState(false);
  const [konfirmasi, setKonfirmasi] = useState<CommandName | null>(null);
  const stops = useRef<(() => void)[]>([]);
  useWatching(true);
  useEffect(() => () => stops.current.forEach((s) => s()), []);

  const kirim = async (cmd: CommandName, arg?: string) => {
    try {
      const id = await kirimPerintah(cmd, arg);
      setRiwayat((r) => [{ id, cmd, arg, waktu: Date.now(), menunggu: true }, ...r].slice(0, 10));
      stops.current.push(tungguAck(id, cmd === "diagnostik" || cmd === "sync" ? 45000 : 20000, (ack) => {
        setRiwayat((r) => r.map((x) => (x.id === id ? { ...x, ack, menunggu: false } : x)));
        if (!ack) notify("Alat tidak merespons. Pastikan alat online.", "err");
      }));
    } catch (e) {
      notify((e as Error).message, "err");
    }
  };

  const d = device;
  const flashPct = d?.flashUsed && d.flashTotal ? Math.round((d.flashUsed / d.flashTotal) * 100) : null;
  const eventList = Object.values(events.data ?? {}).sort((a, b) => b.ts - a.ts);
  const asing = Object.entries(unknown.data ?? {}).filter(([uid]) => !studentMap[uid]).sort((a, b) => b[1].jam.localeCompare(a[1].jam));
  const diag = riwayat.find((x) => x.cmd === "diagnostik" && x.ack?.detail);

  return (
    <section className="data-page">
      <div className="section-heading">
        <div><p>Perangkat & sinkronisasi</p><span>Pantau dan kendalikan alat presensi dari jarak jauh</span></div>
      </div>

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
        <div className="notice warn"><Icon name="warning" size={17} /><span>Alat offline. Perintah akan menunggu dan dijalankan saat alat kembali online (maks. 20–45 detik ditunggu di sini). Tap kartu tetap tersimpan di alat.</span></div>
      )}

      <div className="device-grid">
        <article className="panel">
          <div className="panel-header"><div><p className="panel-title">Kirim perintah</p><span>Diterima alat dalam ±2 detik saat halaman ini terbuka</span></div></div>
          <div className="command-list">
            {PERINTAH.map((p) => (
              <button key={p.cmd} className={`command-button ${p.danger ? "danger" : ""}`}
                onClick={() => (p.cmd === "lcd" ? setLcdOpen(true) : p.danger ? setKonfirmasi(p.cmd) : kirim(p.cmd))}>
                <span className="system-icon"><Icon name={p.icon} size={18} /></span>
                <span><b>{p.label}</b><small>{p.desc}</small></span>
                <Icon name="chevronRight" size={16} />
              </button>
            ))}
          </div>
          {riwayat.length > 0 && (
            <div className="ack-list">
              {riwayat.map((x) => (
                <div key={x.id} className="ack-row">
                  <span className="mono">{jamDariMs(x.waktu).slice(0, 5)}</span>
                  <b>{PERINTAH.find((p) => p.cmd === x.cmd)?.label}{x.arg ? ` "${x.arg}"` : ""}</b>
                  {x.menunggu ? <span className="ack-wait"><Spinner dark /> menunggu</span>
                    : x.ack ? <StatusBadge status={x.ack.ok ? "Berhasil" : "Gagal"} /> : <StatusBadge status="Tidak ada respons" />}
                  {x.ack?.hasil && <small>{x.ack.hasil}</small>}
                </div>
              ))}
            </div>
          )}
        </article>

        <article className="panel">
          <div className="panel-header"><div><p className="panel-title">Kondisi alat</p><span>{diag ? `Hasil cek sistem ${jamDariMs(diag.waktu).slice(0, 5)}` : "Dari laporan rutin alat (tiap 60 detik)"}</span></div></div>
          <div className="kv-list">
            <Kv k="Pembaca RFID" v={d?.rfid === false ? "Tidak terdeteksi" : d?.rfid ? "Normal" : "-"} bad={d?.rfid === false} />
            <Kv k="Sinkron waktu (NTP)" v={d?.ntp === false ? "Belum sinkron" : d?.ntp ? "Sinkron" : "-"} bad={d?.ntp === false} />
            <Kv k="Jaringan" v={`${d?.ssid ?? "-"} · ${d?.ip ?? "-"}`} />
            <Kv k="Data siswa di alat" v={`${d?.kartu ?? "-"} kartu · ${d?.jadwal ?? "-"} baris jadwal`} bad={d?.kartu != null && d.kartu !== Object.keys(studentMap).length} hint={d?.kartu != null && d.kartu !== Object.keys(studentMap).length ? `Server: ${Object.keys(studentMap).length} — kirim "Sinkron ulang data"` : undefined} />
            <Kv k="Memori bebas" v={`${fmtBytes(d?.heap)} (terendah ${fmtBytes(d?.heapMin)})`} bad={(d?.heapMin ?? 1e9) < 40000} />
            <Kv k="Flash" v={flashPct == null ? "-" : `${flashPct}% terpakai`} bad={(flashPct ?? 0) > 85} />
            <Kv k="Gagal kirim (dead-letter)" v={`${d?.dead ?? 0} data`} bad={(d?.dead ?? 0) > 0} />
            <Kv k="Ditolak server" v={`${d?.ditolak ?? 0} data`} bad={(d?.ditolak ?? 0) > 0} />
          </div>
          {diag?.ack?.detail && (
            <details className="diag-raw"><summary>Detail lengkap cek sistem</summary><pre>{JSON.stringify(diag.ack.detail, null, 2)}</pre></details>
          )}
        </article>

        <article className="panel">
          <div className="panel-header"><div><p className="panel-title">Kartu tidak terdaftar hari ini</p><span>Klik "Daftarkan" untuk menambah sebagai siswa</span></div></div>
          {asing.length === 0 ? <Empty icon="card" title="Tidak ada kartu asing hari ini" /> : (
            <div className="simple-list">
              {asing.map(([uid, v]) => (
                <div key={uid}><span className="mono">{uid}</span><small>{v.jam.slice(0, 5)}</small><Link className="ghost-button" to={`/admin/siswa?daftar=${uid}`}>Daftarkan <Icon name="arrow" size={14} /></Link></div>
              ))}
            </div>
          )}
        </article>

        <article className="panel">
          <div className="panel-header"><div><p className="panel-title">Log kejadian alat</p><span>30 kejadian terakhir</span></div></div>
          {eventList.length === 0 ? <Empty icon="activity" title="Belum ada kejadian" /> : (
            <div className="simple-list">
              {eventList.map((e, i) => (
                <div key={`${e.ts}-${i}`}><b>{e.jenis.replace(/_/g, " ")}</b><small>{e.detail}</small><time className="mono">{new Date(e.ts).toLocaleString("id-ID", { timeZone: "Asia/Jakarta", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</time></div>
              ))}
            </div>
          )}
        </article>
      </div>

      {lcdOpen && <LcdDialog onClose={() => setLcdOpen(false)} onSend={(t) => { setLcdOpen(false); kirim("lcd", t); }} />}
      {konfirmasi && (
        <Modal title="Restart alat?" subtitle="Alat mati ±10 detik. Tap selama itu tidak terbaca." onClose={() => setKonfirmasi(null)} width={400}>
          <div className="modal-actions">
            <button className="secondary-button" onClick={() => setKonfirmasi(null)}>Batal</button>
            <button className="danger-button" onClick={() => { kirim(konfirmasi); setKonfirmasi(null); }}><Icon name="power" size={15} />Restart</button>
          </div>
        </Modal>
      )}
    </section>
  );
}

function Kv({ k, v, bad, hint }: { k: string; v: string; bad?: boolean; hint?: string }) {
  return <div className={bad ? "bad" : ""}><span>{k}</span><b>{v}{hint && <small>{hint}</small>}</b></div>;
}

function LcdDialog({ onClose, onSend }: { onClose: () => void; onSend: (t: string) => void }) {
  const [l1, setL1] = useState("");
  const [l2, setL2] = useState("");
  const [detik, setDetik] = useState("10");
  const clean = (s: string) => s.replace(/[^\x20-\x7E]/g, "").slice(0, 16); // LCD 16x2 hanya ASCII
  return (
    <Modal title="Pesan di LCD" subtitle="Maks. 16 karakter per baris, tanpa emoji/huruf khusus." onClose={onClose} width={420}>
      <form className="modal-form" onSubmit={(e) => { e.preventDefault(); if (l1 || l2) onSend(`${clean(l1)}|${clean(l2)}|${detik}`); }}>
        <div className="lcd-preview" aria-hidden="true"><span>{clean(l1).padEnd(16, " ")}</span><span>{clean(l2).padEnd(16, " ")}</span></div>
        <input className="text-input mono" placeholder="Baris 1" value={l1} onChange={(e) => setL1(clean(e.target.value))} aria-label="Baris 1" />
        <input className="text-input mono" placeholder="Baris 2" value={l2} onChange={(e) => setL2(clean(e.target.value))} aria-label="Baris 2" />
        <label className="inline-field">Tampil selama
          <select className="text-input" value={detik} onChange={(e) => setDetik(e.target.value)}>{["5", "10", "30", "60"].map((x) => <option key={x} value={x}>{x} detik</option>)}</select>
        </label>
        <div className="modal-actions">
          <button type="button" className="secondary-button" onClick={onClose}>Batal</button>
          <button className="primary-button" disabled={!l1 && !l2}>Kirim</button>
        </div>
      </form>
    </Modal>
  );
}
