//import { ESPLoader, Transport } from "https://cdn.jsdelivr.net/npm/esptool-js@0.6.0/dist/web/index.js";
//import { ESPLoader, Transport } from "./esptool-js/bundle.js"
// import {
//   getInstallManifest,
//   detectChipFamily,
//   load_chip,
//   flash_firmware
// } from "https://unpkg.com/esp-web-tools@9/dist/web/install.js";
import { ESPLoader, Transport } from "https://unpkg.com/esptool-js/bundle.js";

const versionSelect = document.getElementById("versionSelect");
const loadBtn = document.getElementById("loadVersionBtn");
const versionInfo = document.getElementById("versionInfo");

const connectBtn = document.getElementById("connectBtn");
const flashBtn = document.getElementById("flashBtn");

const portStatus = document.getElementById("portStatus");
const flashStatus = document.getElementById("flashStatus");

const progressBar = document.querySelector("#progressBar span");
const pctEl = document.getElementById("pct");
const speedEl = document.getElementById("speed");
const etaEl = document.getElementById("eta");

let manifest = null;
let chosenBuild = null;
let selectedVersion = null;
let port = null;
let chip = null;

function resetProgress() {
  progressBar.style.width = "0%";
  pctEl.innerText = "0%";
  speedEl.innerText = "0 KB/s";
  etaEl.innerText = "ETA --:--";
}

async function fileExists(path) {
  try {
    const r = await fetch(path, { method: "HEAD" });
    return r.ok;
  } catch (_) {
    return false;
  }
}

async function init() {
  const resp = await fetch("manifest.json", { cache: "no-store" });
  manifest = await resp.json();

  versionSelect.innerHTML = `
    <option value="${manifest.version}">${manifest.version}</option>
  `;

  loadBtn.disabled = false;
}
init();

/* ------------------------------------------------
 * Step 1 — Load Firmware Files
--------------------------------------------------*/
loadBtn.onclick = async () => {
  selectedVersion = versionSelect.value;

  let html = `<b>Version:</b> ${selectedVersion}<br><br>`;

  const builds = manifest.builds;

  for (const b of builds) {
    for (const part of b.parts) {
      const ok = await fileExists(part.path);
      html += `File: <code>${part.path}</code> @ ${part.offset} → ${
        ok ? "<span style='color:green'>OK</span>" : "<span style='color:red'>MISSING</span>"
      }<br>`;
    }
  }

  versionInfo.innerHTML = html;
};

/* ------------------------------------------------
 * Step 2 — Connect ESP Device
--------------------------------------------------*/
connectBtn.onclick = async () => {
  try {
    flashStatus.innerText = "Requesting serial port…";
    port = await navigator.serial.requestPort();
    await port.open({ baudRate: 115200 });

    flashStatus.innerText = "Detecting chip…";
    const chipFamily = await detectChipFamily(port);

    if (!chipFamily) throw new Error("Chip not detected");

    flashStatus.innerHTML = `<b>Chip:</b> ${chipFamily}`;

    chosenBuild = manifest.builds.find(
      (b) => b.chipFamily.toLowerCase() === chipFamily.toLowerCase()
    );

    if (!chosenBuild) throw new Error("No matching build for this chip");

    chip = await load_chip(port);

    portStatus.innerHTML = "<b style='color:green'>Connected ✓</b>";
    flashBtn.disabled = false;

  } catch (err) {
    flashStatus.innerHTML = `<span style="color:red">Connect error: ${err}</span>`;
  }
};

/* ------------------------------------------------
 * Step 3 — FLASH FIRMWARE (ESP Web Tools API)
--------------------------------------------------*/
flashBtn.onclick = async () => {
  try {
    resetProgress();

    const totalSize = chosenBuild.parts.reduce((s, p) => s + p.data?.length || 0, 0);

    flashStatus.innerText = "Reading firmware files…";

    for (const part of chosenBuild.parts) {
      const resp = await fetch(part.path);
      const buf = new Uint8Array(await resp.arrayBuffer());
      part.data = buf;
    }

    flashStatus.innerText = "Flashing… Do not disconnect.";

    const start = performance.now();
    let writtenBytes = 0;

    await flash_firmware(chip, chosenBuild.parts, (written, total) => {
      writtenBytes = written;

      const pct = Math.round((written / total) * 100);
      progressBar.style.width = pct + "%";
      pctEl.innerText = pct + "%";

      const elapsed = (performance.now() - start) / 1000;
      const speed = (written / 1024 / elapsed).toFixed(1);
      speedEl.innerText = `${speed} KB/s`;

      const remain = total - written;
      const eta = Math.round(remain / 1024 / speed);
      etaEl.innerText = `ETA ${eta}s`;
    });

    flashStatus.innerHTML = "<b style='color:green'>Flash OK ✓</b>";

  } catch (err) {
    flashStatus.innerHTML = `<span style="color:red">Flash error: ${err}</span>`;
  }
};
