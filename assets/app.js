// ====== RAPIDPLUS OTA — ESPTOOL.JS VERSION =======
import { ESPLoader } from "./esptool.min.js";

document.addEventListener("DOMContentLoaded", () => {
  const versionSelect = document.getElementById("versionSelect");
  const loadVersionBtn = document.getElementById("loadVersionBtn");
  const versionInfo = document.getElementById("versionInfo");

  const connectBtn = document.getElementById("connectBtn");
  const flashBtn = document.getElementById("flashBtn");

  const flashStatus = document.getElementById("flashStatus");
  const progressBar = document.querySelector("#progressBar span");
  const pctEl = document.getElementById("pct");

  let manifest = null;
  let transporter = null;
  let esp = null;

  // ---- UI Helpers ----
  function log(msg) {
    flashStatus.innerHTML = msg;
  }

  function updateProgress(pct) {
    progressBar.style.width = pct + "%";
    pctEl.innerText = pct + "%";
  }

  // ---- Load manifest ----
  fetch("manifest.json?ts=" + Date.now())
    .then(r => r.json())
    .then(m => {
      manifest = m;
      versionSelect.innerHTML = `
        <option value="${m.latest}">${m.latest}</option>
      `;
      loadVersionBtn.disabled = false;
    });

  loadVersionBtn.onclick = () => {
    versionInfo.innerHTML = `
      <strong>Version:</strong> ${manifest.latest}<br>
      <strong>Released:</strong> ${manifest.release_date}<br>
      <strong>Firmware:</strong> ${manifest.bin}<br>
    `;
  };

  // ---- CONNECT ----
  connectBtn.onclick = async () => {
    try {
      const port = await navigator.serial.requestPort();
      await port.open({ baudRate: 115200 });

      transporter = new ESPLoader(port, 115200, log);
      log("Connecting to bootloader…");

      esp = await transporter.connect();
      log(`<strong style="color:green">Connected ✓</strong><br>Chip: ${esp.chipName}`);

      flashBtn.disabled = false;

    } catch (e) {
      log(`<strong style="color:red">Connection failed: ${e}</strong>`);
    }
  };

  // ---- FLASH ----
  flashBtn.onclick = async () => {
    if (!esp) {
      log(`<strong style="color:red">Not connected</strong>`);
      return;
    }

    log("Downloading firmware…");

    try {
      const resp = await fetch(manifest.bin);
      const arrayBuf = await resp.arrayBuffer();
      const firmware = new Uint8Array(arrayBuf);

      // ESP32 flash offset for app
      const flashOffset = 0x10000;

      log("Preparing to flash…");

      await esp.flashData(
        [{ data: firmware, address: flashOffset }],
        (bytesWritten, totalBytes) => {
          const pct = Math.round((bytesWritten / totalBytes) * 100);
          updateProgress(pct);
        }
      );

      log(`<strong style="color:green">Flash completed ✓</strong>`);

      await esp.hardReset();

    } catch (e) {
      log(`<strong style="color:red">Flash error: ${e}</strong>`);
    }
  };
});
