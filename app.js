/* global L, Papa, proj4, shp, JSZip, toGeoJSON */

const statusEl = document.getElementById("status");
const fileInput = document.getElementById("fileInput");
const sheetUrlInput = document.getElementById("sheetUrlInput");
const importSheetBtn = document.getElementById("importSheetBtn");
const clearLayersBtn = document.getElementById("clearLayersBtn");
const layerListEl = document.getElementById("layerList");
const tabularDialog = document.getElementById("tabularDialog");
const tabularForm = document.getElementById("tabularForm");
const tabularTitle = document.getElementById("tabularTitle");
const coordSystemSelect = document.getElementById("coordSystemSelect");
const twd97ZoneWrap = document.getElementById("twd97ZoneWrap");
const twd97ZoneSelect = document.getElementById("twd97ZoneSelect");
const xFieldSelect = document.getElementById("xFieldSelect");
const yFieldSelect = document.getElementById("yFieldSelect");
const nameFieldSelect = document.getElementById("nameFieldSelect");

const map = L.map("map").setView([23.75, 121], 7);
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19,
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
}).addTo(map);

const epsg3826 = "+proj=tmerc +lat_0=0 +lon_0=121 +k=0.9999 +x_0=250000 +y_0=0 +ellps=GRS80 +units=m +no_defs";
const epsg3825 = "+proj=tmerc +lat_0=0 +lon_0=119 +k=0.9999 +x_0=250000 +y_0=0 +ellps=GRS80 +units=m +no_defs";
proj4.defs("EPSG:3826", epsg3826);
proj4.defs("EPSG:3825", epsg3825);

const activeLayers = [];
const palette = ["#2563eb", "#dc2626", "#16a34a", "#9333ea", "#ea580c", "#0891b2"];

function setStatus(message, isError = false) {
  statusEl.textContent = message;
  statusEl.style.background = isError ? "#fef2f2" : "#eff6ff";
  statusEl.style.color = isError ? "#991b1b" : "#1e3a8a";
}

function normalizeLayerInput(geojson) {
  if (!geojson) {
    return [];
  }
  if (Array.isArray(geojson)) {
    return geojson.filter(Boolean).map((item, idx) => ({
      name: `圖層 ${idx + 1}`,
      geojson: item,
    }));
  }
  return [{ name: "圖層 1", geojson }];
}

function addGeoJsonLayer(layerName, geojson, colorHint) {
  const color = colorHint || palette[activeLayers.length % palette.length];
  const layer = L.geoJSON(geojson, {
    style: () => ({ color, weight: 2, fillOpacity: 0.18 }),
    pointToLayer: (feature, latlng) =>
      L.circleMarker(latlng, {
        radius: 5,
        color,
        fillColor: color,
        fillOpacity: 0.75,
        weight: 1,
      }),
    onEachFeature: (feature, l) => {
      const props = feature?.properties || {};
      const name = props.name || props.名稱 || props.title || "";
      if (name) {
        l.bindPopup(String(name));
      } else if (Object.keys(props).length > 0) {
        l.bindPopup(
          Object.entries(props)
            .slice(0, 8)
            .map(([k, v]) => `${k}: ${v ?? ""}`)
            .join("<br>")
        );
      }
    },
  }).addTo(map);

  const item = {
    id: crypto.randomUUID(),
    name: layerName,
    layer,
    count: geojson?.features?.length || 0,
  };
  activeLayers.push(item);
  refreshLayerList();

  const bounds = layer.getBounds();
  if (bounds.isValid()) {
    map.fitBounds(bounds.pad(0.15));
  }
}

function refreshLayerList() {
  layerListEl.innerHTML = "";
  for (const item of activeLayers) {
    const li = document.createElement("li");
    li.className = "layer-item";
    li.innerHTML = `
      <strong>${item.name}（${item.count} 筆）</strong>
      <div class="layer-actions">
        <button type="button" data-action="zoom" data-id="${item.id}">定位</button>
        <button type="button" data-action="remove" data-id="${item.id}">移除</button>
      </div>
    `;
    layerListEl.appendChild(li);
  }
}

layerListEl.addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLButtonElement)) {
    return;
  }

  const id = target.dataset.id;
  const action = target.dataset.action;
  const index = activeLayers.findIndex((layer) => layer.id === id);
  if (index < 0) {
    return;
  }

  const item = activeLayers[index];
  if (action === "zoom") {
    const bounds = item.layer.getBounds();
    if (bounds.isValid()) {
      map.fitBounds(bounds.pad(0.15));
    }
  } else if (action === "remove") {
    map.removeLayer(item.layer);
    activeLayers.splice(index, 1);
    refreshLayerList();
  }
});

clearLayersBtn.addEventListener("click", () => {
  activeLayers.forEach((item) => map.removeLayer(item.layer));
  activeLayers.length = 0;
  refreshLayerList();
  setStatus("已清除全部圖層。");
});

coordSystemSelect.addEventListener("change", () => {
  twd97ZoneWrap.classList.toggle("hidden", coordSystemSelect.value !== "twd97");
});

function fillSelect(selectEl, options, optional = false) {
  selectEl.innerHTML = "";
  if (optional) {
    const none = document.createElement("option");
    none.value = "";
    none.textContent = "(不使用)";
    selectEl.appendChild(none);
  }
  options.forEach((name) => {
    const option = document.createElement("option");
    option.value = name;
    option.textContent = name;
    selectEl.appendChild(option);
  });
}

function guessField(headers, patterns) {
  return (
    headers.find((h) => patterns.some((p) => p.test(h))) ||
    headers.find((h) => patterns.some((p) => p.test(h.toLowerCase()))) ||
    headers[0]
  );
}

function openTabularDialog(headers, title) {
  return new Promise((resolve) => {
    tabularTitle.textContent = title;
    fillSelect(xFieldSelect, headers);
    fillSelect(yFieldSelect, headers);
    fillSelect(nameFieldSelect, headers, true);

    xFieldSelect.value = guessField(headers, [/經度/, /^lon$/, /^lng$/, /x/i]);
    yFieldSelect.value = guessField(headers, [/緯度/, /^lat$/, /y/i]);
    const guessName = headers.find((h) => /(店家名稱|名稱|name|title)/i.test(h));
    if (guessName) {
      nameFieldSelect.value = guessName;
    }

    const onClose = () => {
      tabularDialog.removeEventListener("close", onClose);
      if (tabularDialog.returnValue !== "default") {
        resolve(null);
        return;
      }
      resolve({
        coordSystem: coordSystemSelect.value,
        zone: twd97ZoneSelect.value,
        xField: xFieldSelect.value,
        yField: yFieldSelect.value,
        nameField: nameFieldSelect.value || null,
      });
    };

    tabularDialog.addEventListener("close", onClose);
    tabularDialog.showModal();
  });
}

function rowsToGeoJSON(rows, config) {
  const source = config.coordSystem === "twd97" ? `EPSG:${config.zone === "119" ? "3825" : "3826"}` : "EPSG:4326";

  const features = [];
  for (const row of rows) {
    const x = Number(row[config.xField]);
    const y = Number(row[config.yField]);
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      continue;
    }

    let lon = x;
    let lat = y;
    if (source !== "EPSG:4326") {
      [lon, lat] = proj4(source, "EPSG:4326", [x, y]);
    }

    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      continue;
    }

    const properties = { ...row };
    if (config.nameField && row[config.nameField] != null) {
      properties.name = row[config.nameField];
    }

    features.push({
      type: "Feature",
      properties,
      geometry: {
        type: "Point",
        coordinates: [lon, lat],
      },
    });
  }

  return {
    type: "FeatureCollection",
    features,
  };
}

async function importCsvContent(csvText, sourceName) {
  const parsed = Papa.parse(csvText, {
    header: true,
    skipEmptyLines: true,
    dynamicTyping: false,
  });

  if (parsed.errors.length > 0) {
    throw new Error(parsed.errors[0].message);
  }
  if (!parsed.meta.fields || parsed.meta.fields.length < 2) {
    throw new Error("CSV 欄位不足，至少需要 2 欄座標欄位。");
  }

  const config = await openTabularDialog(parsed.meta.fields, `${sourceName} 欄位設定`);
  if (!config) {
    setStatus(`已取消匯入：${sourceName}`);
    return;
  }

  const geojson = rowsToGeoJSON(parsed.data, config);
  addGeoJsonLayer(sourceName, geojson);
  setStatus(`匯入完成：${sourceName}，共 ${geojson.features.length} 筆點位。`);
}

async function importZipShapefile(file) {
  const buffer = await file.arrayBuffer();
  const result = await shp(buffer);
  const collections = normalizeLayerInput(result);

  if (collections.length === 0) {
    throw new Error("ZIP 內找不到可用 SHP。");
  }

  collections.forEach((item, idx) => {
    addGeoJsonLayer(`${file.name} - ${item.name || `圖層${idx + 1}`}`, item.geojson);
  });

  setStatus(`匯入完成：${file.name}（${collections.length} 個圖層）`);
}

async function importKmlText(kmlText, sourceName) {
  const xml = new DOMParser().parseFromString(kmlText, "text/xml");
  const geojson = toGeoJSON.kml(xml);
  addGeoJsonLayer(sourceName, geojson);
  setStatus(`匯入完成：${sourceName}`);
}

async function importKmzFile(file) {
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const kmlEntry = Object.values(zip.files).find((entry) => /\.kml$/i.test(entry.name));
  if (!kmlEntry) {
    throw new Error("KMZ 內找不到 KML。");
  }
  const kmlText = await kmlEntry.async("text");
  await importKmlText(kmlText, file.name);
}

async function importFile(file) {
  const lower = file.name.toLowerCase();
  if (lower.endsWith(".csv")) {
    await importCsvContent(await file.text(), file.name);
    return;
  }
  if (lower.endsWith(".zip")) {
    await importZipShapefile(file);
    return;
  }
  if (lower.endsWith(".kml")) {
    await importKmlText(await file.text(), file.name);
    return;
  }
  if (lower.endsWith(".kmz")) {
    await importKmzFile(file);
    return;
  }
  throw new Error(`不支援的格式：${file.name}`);
}

fileInput.addEventListener("change", async (event) => {
  const target = event.target;
  if (!(target instanceof HTMLInputElement) || !target.files?.length) {
    return;
  }

  for (const file of target.files) {
    setStatus(`匯入中：${file.name} ...`);
    try {
      await importFile(file);
    } catch (error) {
      setStatus(`匯入失敗：${file.name}，${error.message}`, true);
    }
  }

  target.value = "";
});

function toGoogleCsvUrl(inputUrl) {
  let url;
  try {
    url = new URL(inputUrl);
  } catch {
    return inputUrl;
  }

  const directCsv = /\.(csv)(\?.*)?$/i.test(url.pathname) || url.searchParams.get("output") === "csv";
  if (directCsv) {
    return inputUrl;
  }

  const match = url.pathname.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (!match) {
    return inputUrl;
  }

  const gid = url.searchParams.get("gid");
  const id = match[1];
  const csvUrl = new URL(`https://docs.google.com/spreadsheets/d/${id}/export`);
  csvUrl.searchParams.set("format", "csv");
  if (gid) {
    csvUrl.searchParams.set("gid", gid);
  }
  return csvUrl.toString();
}

importSheetBtn.addEventListener("click", async () => {
  const raw = sheetUrlInput.value.trim();
  if (!raw) {
    setStatus("請先貼上線上儲存格網址。", true);
    return;
  }

  const csvUrl = toGoogleCsvUrl(raw);
  setStatus("下載線上儲存格中 ...");

  try {
    const response = await fetch(csvUrl);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const csvText = await response.text();
    await importCsvContent(csvText, "線上儲存格");
  } catch (error) {
    setStatus(`線上匯入失敗：${error.message}`, true);
  }
});

tabularForm.addEventListener("submit", () => {
  if (coordSystemSelect.value === "twd97" && !twd97ZoneSelect.value) {
    twd97ZoneSelect.value = "121";
  }
});

if ("serviceWorker" in navigator) {
  window.addEventListener("load", async () => {
    try {
      await navigator.serviceWorker.register("./sw.js");
    } catch (error) {
      console.warn("SW 註冊失敗:", error);
    }
  });
}
