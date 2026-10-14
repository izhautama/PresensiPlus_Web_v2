// Uji unit identitas/label perangkat (tanpa emulator).
import assert from "node:assert/strict";
import { labelDariUA } from "../src/lib/perangkat.ts";

const UA = {
  androidChrome: "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36",
  windowsEdge: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36 Edg/129.0.0.0",
  windowsChrome: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
  iphoneSafari: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
  firefoxLinux: "Mozilla/5.0 (X11; Linux x86_64; rv:130.0) Gecko/20100101 Firefox/130.0",
  samsung: "Mozilla/5.0 (Linux; Android 13; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/24.0 Chrome/117.0.0.0 Mobile Safari/537.36",
  macChrome: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36",
};

// Chrome membekukan versi Android di UA (10): platformVersion dari userAgentData diutamakan
assert.equal(labelDariUA(UA.androidChrome, { platform: "Android", platformVersion: "14.0.0", brands: [{ brand: "Chromium", version: "129" }, { brand: "Google Chrome", version: "129" }, { brand: "Not=A?Brand", version: "24" }] }), "Android 14 · Chrome 129");
assert.equal(labelDariUA(UA.androidChrome), "Android 10 · Chrome 129", "tanpa userAgentData: pakai UA");
assert.equal(labelDariUA(UA.windowsEdge), "Windows · Edge 129");
assert.equal(labelDariUA(UA.windowsEdge, { platform: "Windows", platformVersion: "15.0.0", brands: [{ brand: "Microsoft Edge", version: "129" }] }), "Windows 11 · Edge 129");
assert.equal(labelDariUA(UA.windowsChrome, { platform: "Windows", platformVersion: "10.0.0" }), "Windows · Chrome 130");
assert.equal(labelDariUA(UA.iphoneSafari), "iOS 17 · Safari 17");
assert.equal(labelDariUA(UA.firefoxLinux), "Linux · Firefox 130");
assert.equal(labelDariUA(UA.samsung), "Android 13 · Samsung Internet 24");
assert.equal(labelDariUA(UA.macChrome), "macOS · Chrome 129");
assert.equal(labelDariUA(""), "Perangkat tidak dikenal");
assert.equal(labelDariUA("curl/8.0"), "Perangkat tidak dikenal");
assert.ok(labelDariUA("x".repeat(500) + " Android 14 Chrome/1").length <= 100, "label dipotong 100 karakter");
// tidak memuat data pribadi: tidak ada IP/lokasi/ID perangkat keras pada label
for (const ua of Object.values(UA)) assert.ok(!/\d+\.\d+\.\d+\.\d+/.test(labelDariUA(ua)), "label tidak memuat IP");

console.log("perangkat.test: OK");
