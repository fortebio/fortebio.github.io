document.addEventListener("DOMContentLoaded", () => {
  const versionSelect = document.getElementById("versionSelect");
  const loadVersionBtn = document.getElementById("loadVersionBtn");
  const versionInfo = document.getElementById("versionInfo");

  const connectBtn = document.getElementById("connectBtn");
  const flashBtn = document.getElementById("flashBtn");
  const downloadBtn = document.getElementById("downloadBtn");

  const portStatus = document.getElementById("portStatus");
  const flashStatus = document.getElementById("flashStatus");

  const progressBar = document.querySelector("#progressBar span");
  const pctEl = document.getElementById("pct");
  const speedEl = document.getElementById("speed");
  const etaEl = document.getElementById("eta");

  let manifest = null;
  let port = null;
  let writer = null;

  // Utility: Convert ArrayBuffer to HEX
  function bufToHex(buffer) {
    return [...new Uint8Array(buffer)]
      .map(b => b.toString(16).padStart(2, "0"))
      .join("");
  }

  async function sha256(buffer) {
    const hash = await crypto.subtle.digest("SHA-256", buffer);
    return bufToHex(hash);
  }

  // Load manifest.json
  fetch("manifest.json?ts=" + Date.now())
    .then(r => r.json())
    .then(m => {
      manifest = m;
      versionSelect.innerHTML = `
        <option value="">-- Select RAPIDPLUS Firmware --</option>
        <option value="${m.latest}">${m.latest}</option>
      `;
      downloadBtn.href = m.bin;
      loadVersionBtn.disabled = false;
    });

  loadVersionBtn.onclick = () => {
    versionInfo.innerHTML = `
      <strong>Version:</strong> ${manifest.latest}<br>
      <strong>Released:</strong> ${manifest.release_date}<br>
      <strong>SHA256:</strong> ${manifest.sha256}<br>
    `;
  };

  // Connect RAPIDPLUS via WebSerial
  connectBtn.onclick = async () => {
    try {
      port = await navigator.serial.requestPort();
      await port.open({ baudRate: 115200 });
      writer = port.writable.getWriter();

      portStatus.innerHTML =
        "<strong style='color:green'>RAPIDPLUS Connected ✓</strong>";
      flashBtn.disabled = false;

    } catch (err) {
      portStatus.innerHTML =
        "<strong style='color:red'>Failed to connect</strong>";
    }
  };

  // FLASH with SHA256 verification
  flashBtn.onclick = async () => {
    flashStatus.innerHTML = "Downloading firmware…";

    // 1) Download firmware file
    const resp = await fetch(manifest.bin);
    const buffer = await resp.arrayBuffer();
    const firmware = new Uint8Array(buffer);

    flashStatus.innerHTML = "Verifying checksum…";

    // 2) Calculate SHA256
    const calculatedHash = await sha256(buffer);

    // 3) Compare with manifest.json
    if (calculatedHash.toLowerCase() !== manifest.sha256.toLowerCase()) {
      flashStatus.innerHTML =
        `<strong style="color:red">SHA256 mismatch! Aborting.</strong><br>
         Expected: ${manifest.sha256}<br>
         Got: ${calculatedHash}`;
      progressBar.style.width = "0%";
      return;
    }

    flashStatus.innerHTML =
      "<strong style='color:green'>Checksum OK ✓</strong><br>Starting flash…";

    // FLASH after validated
    let offset = 0;
    const total = firmware.length;
    const chunk = 2048;

    const start = performance.now();

    while (offset < total) {
      const end = Math.min(offset + chunk, total);
      const slice = firmware.slice(offset, end);
      await writer.write(slice);
      offset = end;

      // Progress UI
      const pct = Math.round((offset / total) * 100);
      progressBar.style.width = pct + "%";
      pctEl.innerText = pct + "%";

      const elapsed = (performance.now() - start) / 1000;
      const speed = (offset / 1024 / elapsed).toFixed(1);
      speedEl.innerText = `${speed} KB/s`;

      const remaining = total - offset;
      const eta = speed > 0 ? Math.round(remaining / 1024 / speed) : 0;
      etaEl.innerText = eta > 0 ? eta + "s" : "--";
    }

    flashStatus.innerHTML =
      "<strong style='color:green'>RAPIDPLUS Updated Successfully ✓</strong>";
  };
});
