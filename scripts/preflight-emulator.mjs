// Preflight uji emulator: GAGAL dengan pesan jelas bila port emulator (atau server uji E2E) sudah dipakai proses lain.
// Penyebab umum: emulator Java sisa dari run yang dihentikan paksa. Hasil uji pada emulator sisa TIDAK dapat dipercaya
// (rules lama bisa berlaku), jadi lebih baik berhenti daripada menghasilkan angka palsu.
// Pakai:  node scripts/preflight-emulator.mjs [--e2e]        (dipanggil otomatis oleh skrip npm test:*)
import net from "node:net";
import { execFileSync } from "node:child_process";

const e2e = process.argv.includes("--e2e");
const PORTS = [
  [9000, "Database Emulator"], [9099, "Authentication Emulator"], [4400, "Emulator Hub"], [4500, "Logging Emulator"],
  ...(e2e ? [[5199, "server uji E2E desktop"], [5198, "server uji E2E HP"]] : []),
];

const bebas = (port) => new Promise((selesai) => {
  const s = net.createServer();
  s.once("error", () => selesai(false));
  s.once("listening", () => s.close(() => selesai(true)));
  s.listen(port, "127.0.0.1");
});
const pemilik = (port) => {
  try {
    if (process.platform === "win32") {
      const out = execFileSync("netstat", ["-ano", "-p", "TCP"], { encoding: "utf8" });
      const baris = out.split(/\r?\n/).find((l) => l.includes(`:${port} `) && /LISTENING/i.test(l));
      const pid = baris?.trim().split(/\s+/).pop();
      if (pid) {
        const t = execFileSync("tasklist", ["/FI", `PID eq ${pid}`, "/FO", "CSV", "/NH"], { encoding: "utf8" }).trim().split(",")[0]?.replace(/"/g, "");
        return `PID ${pid}${t ? ` (${t})` : ""}`;
      }
    } else {
      return execFileSync("lsof", ["-nP", `-iTCP:${port}`, "-sTCP:LISTEN", "-t"], { encoding: "utf8" }).trim().split("\n")[0] ? `PID ${execFileSync("lsof", ["-nP", `-iTCP:${port}`, "-sTCP:LISTEN", "-t"], { encoding: "utf8" }).trim().split("\n")[0]}` : "";
    }
  } catch { /* tidak diketahui */ }
  return "";
};

const dipakai = [];
for (const [port, nama] of PORTS) if (!(await bebas(port))) dipakai.push({ port, nama, siapa: pemilik(port) });
if (dipakai.length) {
  console.error("\n✗ PREFLIGHT GAGAL: port berikut sudah dipakai proses lain, uji emulator DIBATALKAN:");
  for (const d of dipakai) console.error(`   - ${d.port} (${d.nama})${d.siapa ? ` dipakai ${d.siapa}` : ""}`);
  console.error("\nBiasanya ini emulator Java sisa dari run yang dihentikan paksa (hasil uji pada emulator sisa tidak dapat dipercaya).");
  console.error(process.platform === "win32" ? "Hentikan:  taskkill /F /IM java.exe   (dan  taskkill /F /PID <pid>  untuk server uji), lalu ulangi." : "Hentikan proses di atas (kill <pid>), lalu ulangi.");
  process.exit(3);
}
console.log(`preflight OK: port ${PORTS.map((p) => p[0]).join(", ")} bebas`);
