import { ESPLoader, Transport } 
  from "https://cdn.jsdelivr.net/npm/esptool-js@0.6.0/dist/web/index.js";

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
let loader = null;
let port = null;

/* ------------------------------------------------------
   Helpers
------------------------------------------------------*/
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

/* ------------------------------------------------------
   Step 1 — Load manifest.json
------------------------------------------------------*/
async function init() {
  try {
    const resp = await fetch("manifest.json", { cache: "no-store" });
    manifest = await resp.json();

    versionSelect.innerHTML = manifest.firmwares
      .map(f => `<option value="${f.version}">${f.version}</option>`)
      .join("");

    loadBtn.disabled = false;
  } catch (e) {
    versionSelect.innerHTML = `<option>Error loading manifest</option>`;
  }
}
init();

loadBtn.onclick = async () => {
  const version = versionSelect.value;
  const entry = manifest.firmwares.find(f => f.version === version);

  let html = `<strong>Version:</strong> ${version}<br><br>`;

  for (const f of entry.files) {
    const ok = await fileExists(f.path);
    html += `File: <code>${f.path}</code> @ <strong>${f.offset}</strong> → `;
    html += ok
      ? `<span style="color:green">OK</span><br>`
      : `<span style="color:red">MISSING</span><br>`;
  }

  versionInfo.innerHTML = html;
};

/* ------------------------------------------------------
   Step 2 — Connect device
------------------------------------------------------*/
connectBtn.onclick = async () => {
  try {
    flashStatus.innerText = "Opening serial port…";

    port = await navigator.serial.requestPort();
    await port.open({ baudRate: 115200 });

    const transport = new Transport(port);
    loader = new ESPLoader(transport, 115200);

    flashStatus.innerText = "Initializing bootloader…";
    await loader.initialize();

    portStatus.innerHTML = "<strong style='color:green'>Connected ✓</strong>";
    flashBtn.disabled = false;

  } catch (e) {
    flashStatus.innerHTML = `<span style="color:red">Connect error: ${e}</span>`;
  }
};

/* ------------------------------------------------------
   Step 3 — Flash
------------------------------------------------------*/
flashBtn.onclick = async () => {
  try {
    const version = versionSelect.value;
    const entry = manifest.firmwares.find(f => f.version === version);

    if (!entry) throw new Error("Firmware not found");

    resetProgress();
    flashStatus.innerText = "Loading binaries…";

    const parts = [];
    for (const f of entry.files) {
      const resp = await fetch(f.path);
      if (!resp.ok) throw new Error(`Missing file: ${f.path}`);

      const bin = new Uint8Array(await resp.arrayBuffer());
      parts.push({
        data: bin,
        address: parseInt(f.offset)
      });
    }

    const totalBytes =
      parts.reduce((sum, p) => sum + p.data.length, 0);

    flashStatus.innerText = "Flashing…";

    const start = performance.now();
    let writtenBytes = 0;

    await loader.program(parts, (written) => {
      writtenBytes = written;

      const pct = Math.round((written / totalBytes) * 100);
      progressBar.style.width = pct + "%";
      pctEl.innerText = pct + "%";

      const elapsed = (performance.now() - start) / 1000;
      const speed = (written / 1024 / elapsed).toFixed(1);
      speedEl.innerText = `${speed} KB/s`;

      const remain = totalBytes - written;
      const eta = Math.round(remain / 1024 / speed);
      etaEl.innerText = `ETA ${eta}s`;
    });

    flashStatus.innerHTML = "<span style='color:green'>Flash OK ✓</span>";
    await loader.disconnect();

  } catch (e) {
    flashStatus.innerHTML = `<span style="color:red">Flash error: ${e}</span>`;
  }
};
