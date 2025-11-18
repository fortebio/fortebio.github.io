// STEP 1 — LOAD FIRMWARE VERSION
document.addEventListener("DOMContentLoaded", () => {
  const versionSelect = document.getElementById("versionSelect");
  const loadBtn = document.getElementById("loadVersionBtn");
  const info = document.getElementById("versionInfo");
  const flashBtn = document.getElementById("flashBtn");

  fetch("manifest.json")
    .then(r => r.json())
    .then(m => {
      versionSelect.innerHTML += `<option value="${m.latest}">${m.latest}</option>`;
      window.manifest = m;
    });

  loadBtn.onclick = () => {
    if (!versionSelect.value) {
      info.innerHTML = "<span style='color:red'>Please select a version.</span>";
      return;
    }

    info.innerHTML = `
      <p><strong>Latest Version:</strong> ${manifest.latest}</p>
      <p><strong>Release date:</strong> ${manifest.release_date}</p>
      <p><strong>SHA256:</strong> ${manifest.sha256}</p>
    `;

    flashBtn.disabled = false;
  };
});

// STEP 2 — CONNECT ESP32 (WebSerial)
let espPort;
const connectBtn = document.getElementById("connectBtn");
const portStatus = document.getElementById("portStatus");

connectBtn.onclick = async () => {
  try {
    espPort = await navigator.serial.requestPort();
    await espPort.open({ baudRate: 115200 });
    portStatus.innerHTML = "<span style='color:green'>ESP32 Connected ✓</span>";
  } catch (err) {
    portStatus.innerHTML = "<span style='color:red'>Failed to connect.</span>";
  }
};

// STEP 3 — FLASH FIRMWARE
const flashBtn = document.getElementById("flashBtn");
const flashStatus = document.getElementById("flashStatus");
const progressBar = document.querySelector("#progressBar span");

flashBtn.onclick = async () => {
  flashStatus.innerHTML = "Preparing to flash...";

  const firmwareUrl = window.manifest.bin;

  const resp = await fetch(firmwareUrl);
  const firmware = new Uint8Array(await resp.arrayBuffer());

  let writer = espPort.writable.getWriter();

  let chunkSize = 2048;
  let total = firmware.length;
  let sent = 0;

  flashStatus.innerHTML = "Flashing...";

  while (sent < total) {
    let chunk = firmware.slice(sent, sent + chunkSize);
    await writer.write(chunk);
    sent += chunk.length;

    let percent = Math.floor((sent / total) * 100);
    progressBar.style.width = percent + "%";
  }

  writer.releaseLock();

  flashStatus.innerHTML = "<span style='color:green'>Flash complete! ✓</span>";
};
