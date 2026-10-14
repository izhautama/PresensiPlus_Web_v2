// Identitas perangkat untuk log aktivitas akun bersama. Fungsi parsing MURNI (impor tanpa dependensi) agar dapat diuji unit.
// TIDAK memakai layanan pihak ketiga, TIDAK ada IP/lokasi: hanya id acak lokal + label dari userAgent/userAgentData.

export type PetunjukUA = { brands?: { brand: string; version: string }[]; platform?: string; platformVersion?: string; mobile?: boolean };

const NAMA_BROWSER: [RegExp, string][] = [
  [/edg(?:e|a|ios)?\/(\d+)/i, "Edge"],
  [/opr\/(\d+)|opera\/(\d+)/i, "Opera"],
  [/samsungbrowser\/(\d+)/i, "Samsung Internet"],
  [/firefox\/(\d+)|fxios\/(\d+)/i, "Firefox"],
  [/(?:chrome|crios)\/(\d+)/i, "Chrome"],
  [/version\/(\d+)[^]*safari/i, "Safari"],
];
const MERK: Record<string, string> = { "Microsoft Edge": "Edge", "Google Chrome": "Chrome", Opera: "Opera", "Samsung Internet": "Samsung Internet", Brave: "Brave", Vivaldi: "Vivaldi" };

/** "Android 14 · Chrome 129", "Windows · Edge 129", "iOS 17 · Safari 17". Maks. 100 karakter. */
export function labelDariUA(ua: string, h: PetunjukUA = {}): string {
  const u = ua || "";
  // ---- sistem operasi
  let os = "";
  const versiUtama = (v?: string) => (v ? String(parseInt(v, 10)) : "");
  if (/android/i.test(u) || h.platform === "Android") {
    // Chrome membekukan versi Android di userAgent (mis. 10); platformVersion dari userAgentData lebih akurat bila ada
    const v = versiUtama(h.platformVersion) || /Android (\d+)/i.exec(u)?.[1] || "";
    os = `Android${v ? ` ${v}` : ""}`;
  } else if (/iphone|ipad|ipod/i.test(u)) {
    const m = /OS (\d+)[_\d]*/i.exec(u)?.[1];
    os = `iOS${m ? ` ${m}` : ""}`;
  } else if (/windows/i.test(u) || h.platform === "Windows") {
    // Windows 11 terdeteksi lewat platformVersion >= 13
    const v = parseInt(h.platformVersion ?? "", 10);
    os = Number.isFinite(v) && v >= 13 ? "Windows 11" : "Windows";
  } else if (/mac os x|macintosh/i.test(u) || h.platform === "macOS") os = "macOS";
  else if (/cros/i.test(u)) os = "ChromeOS";
  else if (/linux/i.test(u) || h.platform === "Linux") os = "Linux";

  // ---- browser: userAgentData.brands lebih andal; cadangan: userAgent
  let browser = "";
  const merk = (h.brands ?? []).find((b) => MERK[b.brand]);
  if (merk) browser = `${MERK[merk.brand]} ${versiUtama(merk.version)}`.trim();
  else {
    for (const [re, nama] of NAMA_BROWSER) {
      const m = re.exec(u);
      if (m) { browser = `${nama} ${m.slice(1).find(Boolean) ?? ""}`.trim(); break; }
    }
  }
  const label = [os, browser].filter(Boolean).join(" · ") || "Perangkat tidak dikenal";
  return label.slice(0, 100);
}

const KEY_ID = "presensi-device-id";
const KEY_NAMA = "presensi-device-nama";
let idSesi: string | null = null; // cadangan bila localStorage tidak tersedia

const acak = () => {
  try { if (crypto?.randomUUID) return crypto.randomUUID(); } catch { /* lanjut */ }
  const a = new Uint8Array(16);
  crypto.getRandomValues(a);
  return [...a].map((x) => x.toString(16).padStart(2, "0")).join("");
};

/** deviceId acak, disimpan di localStorage. Bila tidak dapat disimpan: id per sesi bertanda `tersimpan: false` (label diberi akhiran). */
export function idPerangkat(): { id: string; tersimpan: boolean } {
  try {
    let id = localStorage.getItem(KEY_ID);
    if (!id || !/^[A-Za-z0-9_-]{8,64}$/.test(id)) { id = acak(); localStorage.setItem(KEY_ID, id); }
    return { id, tersimpan: true };
  } catch {
    idSesi ??= acak();
    return { id: idSesi, tersimpan: false };
  }
}

export function namaPerangkat(): string | undefined {
  try { return localStorage.getItem(KEY_NAMA)?.slice(0, 60) || undefined; } catch { return undefined; }
}
export function setNamaPerangkat(nama: string) {
  try { if (nama.trim()) localStorage.setItem(KEY_NAMA, nama.trim().slice(0, 60)); else localStorage.removeItem(KEY_NAMA); } catch { /* abaikan */ }
}

let labelCache: string | null = null;
/** Label perangkat. Memuat petunjuk userAgentData (platformVersion) secara asinkron sekali, lalu men-cache. */
export async function siapkanLabelPerangkat(): Promise<string> {
  if (labelCache) return labelCache;
  const uad = (typeof navigator !== "undefined" ? (navigator as unknown as { userAgentData?: { brands?: { brand: string; version: string }[]; platform?: string; mobile?: boolean; getHighEntropyValues?: (k: string[]) => Promise<{ platformVersion?: string }> } }).userAgentData : undefined);
  let platformVersion: string | undefined;
  try { platformVersion = (await uad?.getHighEntropyValues?.(["platformVersion"]))?.platformVersion; } catch { /* tidak didukung */ }
  labelCache = labelDariUA(typeof navigator !== "undefined" ? navigator.userAgent : "", { brands: uad?.brands, platform: uad?.platform, platformVersion, mobile: uad?.mobile });
  return labelCache;
}
export const labelPerangkatSekarang = () => labelCache ?? labelDariUA(typeof navigator !== "undefined" ? navigator.userAgent : "");
