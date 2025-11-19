// assets/app.js
document.addEventListener("DOMContentLoaded", () => {

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

  function resetProgress() {
    progressBar.style.width = "0%";
    pctEl.innerText = "0%";
    speedEl.innerText = "0 KB/s";
    etaEl.innerText = "ETA --:--";
  }

  // Load manifest.json
  async function init() {
    const resp = await fetch("manifest.json");
    manifest = await resp.json();

    versionSelect.innerHTML = `
      <option value="${manifest.latest}">${manifest.latest}</option>
    `;
    loadBtn.disabled = false;
  }
  init();

  loadBtn.onclick = () => {
    let txt = `<strong>Version:</strong> ${manifest.latest}<br><br>`;
    manifest.flash_files.forEach(f => {
      txt += `File: <code>${f.path}</code> @ <strong>${f.offset}</strong><br>`;
    });
    versionInfo.innerHTML = txt;
  };

  // Connect ESP32
  connectBtn.onclick = async () => {
    try {
      const port = await navigator.serial.requestPort();
      loader = new ESPLoader(port, { baudrate: 115200 });

      flashStatus.innerHTML = "Connecting to bootloader…";

      await loader.connect();
      await loader.sync();

      portStatus.innerHTML = "<strong style='color:green'>Connected ✓</strong>";
      flashBtn.disabled = false;
    } catch (err) {
      flashStatus.innerHTML = `<strong style='color:red'>Connect error: ${err}</strong>`;
    }
  };

  // FLASH 2-FILES
  flashBtn.onclick = async () => {
    if (!loader) {
      flashStatus.innerHTML = "<strong style='color:red'>Not connected</strong>";
      return;
    }

    resetProgress();
    flashStatus.innerHTML = "Downloading firmware…";

    try {
      const parts = [];

      for (const p of manifest.flash_files) {
        const bin = await fetch(p.path).then(r => r.arrayBuffer());
        parts.push({
          data: new Uint8Array(bin),
          address: parseInt(p.offset)
        });
      }

      flashStatus.innerHTML = "Flashing… Do not disconnect.";

      const start = performance.now();

      await loader.flashData(parts, (written, total) => {
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

      flashStatus.innerHTML = "<strong style='color:green'>Flash OK ✓</strong><br>Rebooting…";
      await loader.reset();

    } catch (err) {
      flashStatus.innerHTML = `<strong style='color:red'>Flash error: ${err}</strong>`;
    }
  };
});
