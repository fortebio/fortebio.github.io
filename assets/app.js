// assets/app.js (NO SHA256, NO DOWNLOAD)
document.addEventListener("DOMContentLoaded", () => {
  const versionSelect = document.getElementById("versionSelect");
  const loadVersionBtn = document.getElementById("loadVersionBtn");
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
  let port = null;
  let writer = null;

  /** RESET UI */
  function resetProgress() {
    progressBar.style.width = "0%";
    pctEl.innerText = "0%";
    speedEl.innerText = "0 KB/s";
    etaEl.innerText = "ETA --:--";
  }

  /** LOAD MANIFEST */
  async function init() {
    try {
      const resp = await fetch("manifest.json?ts=" + Date.now());
      manifest = await resp.json();

      versionSelect.innerHTML = `
        <option value="">-- Select RAPIDPLUS Firmware --</option>
        <option value="${manifest.latest}">${manifest.latest}</option>
      `;

      loadVersionBtn.disabled = false;
      flashStatus.innerText = "Manifest loaded.";
    } catch (err) {
      flashStatus.innerHTML = "<strong style='color:red'>Error loading manifest</strong>";
    }
  }
  init();

  /** LOAD VERSION INFO */
  loadVersionBtn.onclick = () => {
    versionInfo.innerHTML = `
      <strong>Version:</strong> ${manifest.latest}<br>
      <strong>Released:</strong> ${manifest.release_date}<br>
      <strong>Bin:</strong> ${manifest.bin}<br>
    `;
  };

  /** CONNECT TO DEVICE */
  connectBtn.onclick = async () => {
    try {
      port = await navigator.serial.requestPort();
      await port.open({ baudRate: 115200 });
      writer = port.writable.getWriter();

      portStatus.innerHTML = "<strong style='color:green'>Connected ✓</strong>";
      flashBtn.disabled = false;
    } catch (err) {
      portStatus.innerHTML = "<strong style='color:red'>Failed to connect</strong>";
    }
  };

  /** CLOSE PORT CLEANLY */
  async function closePort() {
    try {
      if (writer) {
        await writer.close();
        writer.releaseLock();
      }
      if (port) await port.close();
    } catch (err) {}
  }

  /** FLASH FIRMWARE */
  flashBtn.onclick = async () => {
    if (!manifest) {
      flashStatus.innerHTML = "<strong style='color:red'>Manifest missing</strong>";
      return;
    }

    if (!port) {
      flashStatus.innerHTML = "<strong style='color:red'>Device not connected</strong>";
      return;
    }

    flashStatus.innerText = "Downloading firmware…";
    resetProgress();

    try {
      const resp = await fetch(manifest.bin);
      const buffer = await resp.arrayBuffer();
      const firmware = new Uint8Array(buffer);

      flashStatus.innerText = "Flashing…";

      let offset = 0;
      const total = firmware.length;
      const chunk = 2048;

      const start = performance.now();

      while (offset < total) {
        const end = Math.min(offset + chunk, total);
        await writer.write(firmware.slice(offset, end));
        offset = end;

        // UI
        const pct = Math.round((offset / total) * 100);
        progressBar.style.width = pct + "%";
        pctEl.innerText = pct + "%";

        const elapsed = (performance.now() - start) / 1000;
        const speed = (offset / 1024 / elapsed).toFixed(1);
        speedEl.innerText = `${speed} KB/s`;

        const remaining = total - offset;
        const eta = speed > 0 ? Math.round(remaining / 1024 / speed) : "--";
        etaEl.innerText = eta + "s";
      }

      flashStatus.innerHTML = "<strong style='color:green'>Flash Done ✓</strong>";
      await closePort();

    } catch (err) {
      flashStatus.innerHTML = `<strong style='color:red'>Flash error: ${err}</strong>`;
      await closePort();
    }
  };
});
