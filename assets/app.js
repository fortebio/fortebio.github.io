async function loadFirmwareData() {
    const res = await fetch("firmware/versions.json");
    const data = await res.json();

    const latest = data.versions[0];
    const latestBox = document.getElementById("latest-info");

    latestBox.innerHTML = `
        <h3>${latest.version}</h3>
        <p>Ngày phát hành: ${latest.date}</p>
        <p>${latest.note}</p>
        <a href="firmware/${latest.file}" class="download-btn">Tải Firmware</a>
    `;

    // Load all versions
    const list = document.getElementById("all-versions");
    data.versions.forEach(v => {
        const item = document.createElement("div");
        item.classList.add("item");
        item.innerHTML = `
            <strong>${v.version}</strong> - <em>${v.date}</em><br>
            ${v.note}<br>
            <a class="download-btn" href="firmware/${v.file}">Download</a>
        `;
        list.appendChild(item);
    });
}

loadFirmwareData();
