// assets/app.js
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
  let reader = null;
  let abortController = null;

  // Utility: Convert ArrayBuffer to HEX
  function bufToHex(buffer) {
    return [...new Uint8Array(buffer)]
      .map(b => b.toString(16).padStart(2, "0"))
      .join("");
  }

  // Compute SHA-256 using SubtleCrypto
  async function sha256(buffer) {
    const hash = await crypto.subtle.digest("SHA-256", buffer);
    return bufToHex(hash);
  }

  // Safe fetch wrapper
  async function fetchJson(url) {
    const resp = await fetch(url, {cache: "no-store"});
    if (!resp.ok) throw new Error(`HTTP ${resp.status} for ${url}`);
    return resp.json();
  }

  async function init() {
    // Check Web Serial API availability
    if (!("serial" in navigator)) {
      portStatus.innerHTML = "<strong style='color:red'>Web Serial not supported in this browser.</strong>";
      connectBtn.disabled = true;
      flashBtn.disabled = true;
    }

    try {
      manifest = await fetchJson("manifest.json?ts=" + Date.now());
      // Build version selector (manifest can contain an array later)
      const versions = manifest.versions || [{ id: manifest.latest || manifest.device, label: manifest.latest || manifest.device }];
      versionSelect.innerHTML = `<option value="">-- Select RAPIDPLUS Firmware --</option>` +
        versions.map(v => `<option value="${v.id}">${v.label || v.id}</option>`).join("");
      // Prepare download
      // Use the path exactly as provided in manifest (case-sensitive). If your file is lowercase, ensure manifest matches.
      downloadBtn.href = manifest.bin;
      downloadBtn.download = manifest.bin.split("/").pop();
      loadVersionBtn.disabled = false;
      flashStatus.innerText = "Manifest loaded.";
    } catch (err) {
      console.error("Failed to load manifest:", err);
      versionSelect.innerHTML = `<option value="">Error loading manifest</option>`;
      loadVersionBtn.disabled = true;
      flashStatus.innerHTML = `<strong style="color:red">Error loading manifest.json</strong>`;
    }
  }

  init();

  loadVersionBtn.onclick = () => {
    if (!manifest) return;
    // Show more info
    versionInfo.innerHTML = `
      <strong>Version:</strong> ${manifest.latest || "n/a"}<br>
      <strong>Released:</strong> ${manifest.release_date || "n/a"}<br>
      <strong>SHA256:</strong> ${manifest.sha256 || "<em>not provided</em>"}<br>
      <strong>Bin path:</strong> ${manifest.bin || "n/a"}
    `;
  };

  // Connect RAPIDPLUS via WebSerial
  connectBtn.onclick = async () => {
    try {
      port = await navigator.serial.requestPort();
      await port.open({ baudRate: 115200 }); // default; some bootloaders use 115200/921600
      writer = port.writable.getWriter();
      // Try to obtain a reader (optional) to allow reading device responses
      try {
        reader = port.readable ? port.readable.getReader() : null;
      } catch (e) {
        reader = null;
      }
      portStatus.innerHTML = "<strong style='color:green'>RAPIDPLUS Connected ✓</strong>";
      flashBtn.disabled = false;
    } catch (err) {
      console.error("Connect failed:", err);
      portStatus.innerHTML = "<strong style='color:red'>Failed to connect</strong>";
      flashBtn.disabled = true;
    }
  };

  async function closePort() {
    try {
      if (reader) {
        try { await reader.cancel(); } catch(e){}
        try { reader.releaseLock(); } catch(e){}
        reader = null;
      }
      if (writer) {
        try { await writer.close(); } catch(e){}
        try { writer.releaseLock(); } catch(e){}
        writer = null;
      }
      if (port) {
        try { await port.close(); } catch(e){}
        port = null;
      }
      portStatus.innerHTML = "<strong style='color:gray'>Disconnected</strong>";
    } catch (err) {
      console.warn("Error closing port:", err);
    }
  }

  // Graceful abort support
  function resetProgress() {
    progressBar.style.width = "0%";
    pctEl.innerText = "0%";
    speedEl.innerText = "0 KB/s";
    etaEl.innerText = "ETA --:--";
  }

  flashBtn.onclick = async () => {
    if (!manifest) {
      flashStatus.innerHTML = `<strong style="color:red">Manifest not loaded</strong>`;
      return;
    }
    if (versionSelect.value === "" ) {
      flashStatus.innerHTML = `<strong style="color:red">Please select a firmware version</strong>`;
      return;
    }
    if (!port || !writer) {
      flashStatus.innerHTML = `<strong style="color:red">Please connect the device first</strong>`;
      return;
    }

    flashStatus.innerHTML = "Downloading firmware…";
    resetProgress();

    try {
      // 1) Download firmware file
      const resp = await fetch(manifest.bin, {cache: "no-store"});
      if (!resp.ok) throw new Error(`Failed to download firmware: ${resp.status}`);
      const buffer = await resp.arrayBuffer();
      const firmware = new Uint8Array(buffer);

      flashStatus.innerHTML = "Verifying checksum…";

      // 2) Calculate SHA256
      const calculatedHash = await sha256(buffer);

      // 3) Compare with manifest.json
      if (manifest.sha256 && calculatedHash.toLowerCase() !== manifest.sha256.toLowerCase()) {
        flashStatus.innerHTML =
          `<strong style="color:red">SHA256 mismatch! Aborting.</strong><br>
           Expected: ${manifest.sha256}<br>
           Got: ${calculatedHash}`;
        console.error("SHA mismatch", manifest.sha256, calculatedHash);
        return;
      }

      flashStatus.innerHTML = "<strong style='color:green'>Checksum OK ✓</strong><br>Preparing to flash…";

      // Optional: verify signature if manifest.signature exists
      // TODO: implement signature verification with a known public key if required
      if (manifest.signature) {
        // stub: fetch signature and verify - requires public key configuration
        flashStatus.innerHTML += "<br><em>Signature present; verification not implemented in this build.</em>";
      }

      // ASK user to confirm device is in bootloader mode:
      const go = confirm("Please put RAPIDPLUS into bootloader mode (hold BOOT, press RESET) if required. Click OK to continue flashing.");
      if (!go) {
        flashStatus.innerHTML = "Flashing cancelled by user.";
        return;
      }

      // chunked write
      flashStatus.innerHTML = "<strong style='color:green'>Starting flash…</strong>";
      const total = firmware.length;
      const chunkSize = 2048; // adjust as needed; keep moderate for reliability
      let offset = 0;
      const start = performance.now();

      // Setup abort controller (in case you want to add cancel)
      abortController = new AbortController();

      while (offset < total) {
        if (abortController.signal.aborted) throw new Error("Aborted by user");

        const end = Math.min(offset + chunkSize, total);
        const slice = firmware.slice(offset, end);

        // Write - convert to Uint8Array
        try {
          await writer.write(slice);
        } catch (err) {
          console.error("Write failed at offset", offset, err);
          flashStatus.innerHTML = `<strong style="color:red">Write failed at ${offset}</strong>`;
          throw err;
        }

        offset = end;

        // UI progress
        const pct = Math.round((offset / total) * 100);
        progressBar.style.width = pct + "%";
        pctEl.innerText = pct + "%";

        const elapsed = (performance.now() - start) / 1000;
        const speed = (offset / 1024 / Math.max(elapsed, 0.001)).toFixed(1);
        speedEl.innerText = `${speed} KB/s`;

        const remaining = total - offset;
        const eta = speed > 0 ? Math.round(remaining / 1024 / speed) : 0;
        etaEl.innerText = eta > 0 ? eta + "s" : "--";
      }

      flashStatus.innerHTML = "<strong style='color:green'>Upload finished — finalizing…</strong>";

      // Important: close writer & port cleanly so device can reboot
      await closePort();

      flashStatus.innerHTML = "<strong style='color:green'>RAPIDPLUS Updated Successfully ✓</strong>";
    } catch (err) {
      console.error("Flash flow error:", err);
      flashStatus.innerHTML = `<strong style="color:red">Error: ${String(err)}</strong>`;
      // ensure port is closed to avoid locked COM
      try { await closePort(); } catch(e){}
    } finally {
      abortController = null;
    }
  };

  // Optional: beforeunload, close port
  window.addEventListener("beforeunload", async () => {
    try { await closePort(); } catch(e){}
  });
});
