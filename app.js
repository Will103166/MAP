/* global L, Papa, proj4, shp, JSZip, toGeoJSON */

const statusEl = document.getElementById("status");
const fileInput = document.getElementById("fileInput");
const sheetUrlInput = document.getElementById("sheetUrlInput");
const importSheetBtn = document.getElementById("importSheetBtn");
const clearLayersBtn = document.getElementById("clearLayersBtn");
const locateBtn = document.getElementById("locateBtn");
const refreshBtn = document.getElementById("refreshBtn");
const basemapSelect = document.getElementById("basemapSelect");
const measureDistanceBtn = document.getElementById("measureDistanceBtn");
const measureAreaBtn = document.getElementById("measureAreaBtn");
const measureClearBtn = document.getElementById("measureClearBtn");
const rayBtn = document.getElementById("rayBtn");
const coordLocateBtn = document.getElementById("coordLocateBtn");
const adminBtn = document.getElementById("adminBtn");

const styleDialog = document.getElementById("styleDialog");
const styleForm = document.getElementById("styleForm");
const styleTitle = document.getElementById("styleTitle");
const styleColorInput = document.getElementById("styleColorInput");
const styleMarkerSelect = document.getElementById("styleMarkerSelect");
const styleVisibleCheckbox = document.getElementById("styleVisibleCheckbox");

const adminDialog = document.getElementById("adminDialog");
const adminForm = document.getElementById("adminForm");
const adminPasswordInput = document.getElementById("adminPasswordInput");

const coordDialog = document.getElementById("coordDialog");
const coordForm = document.getElementById("coordForm");
const coordInputSystem = document.getElementById("coordInputSystem");
const coordInputZoneWrap = document.getElementById("coordInputZoneWrap");
const coordInputZone = document.getElementById("coordInputZone");
const coordInputX = document.getElementById("coordInputX");
const coordInputY = document.getElementById("coordInputY");
const coordResult = document.getElementById("coordResult");

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

const baseLayers = {
  osm: L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "&copy; OpenStreetMap 貢獻者",
  }),
  googleSat: L.tileLayer("https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}", {
    maxZoom: 20,
  }),
  googleTerrain: L.tileLayer("https://mt1.google.com/vt/lyrs=p&x={x}&y={y}&z={z}", {
    maxZoom: 18,
  }),
  nlscPhoto: L.tileLayer(
    "https://wmts.nlsc.gov.tw/wmts/PHOTO2/default/GoogleMapsCompatible/{z}/{y}/{x}",
    { maxZoom: 20 }
  ),
};

baseLayers.osm.addTo(map);

const epsg3826 = "+proj=tmerc +lat_0=0 +lon_0=121 +k=0.9999 +x_0=250000 +y_0=0 +ellps=GRS80 +units=m +no_defs";
const epsg3825 = "+proj=tmerc +lat_0=0 +lon_0=119 +k=0.9999 +x_0=250000 +y_0=0 +ellps=GRS80 +units=m +no_defs";
proj4.defs("EPSG:3826", epsg3826);
proj4.defs("EPSG:3825", epsg3825);

const activeLayers = [];
const palette = ["#2563eb", "#dc2626", "#16a34a", "#9333ea", "#ea580c", "#0891b2"];

let isAdmin = false;
let measureMode = null;
let measurePoints = [];
let measureLayer = null;
let rayPoints = [];
let rayLayer = null;

function setStatus(message, isError = false) {
  statusEl.textContent = message;
  statusEl.style.background = isError ? "#fef2f2" : "#eff6ff";
  statusEl.style.color = isError ? "#991b1b" : "#1e3a8a";
}

let editingStyleLayerId = null;

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

function createLeafletLayer(geojson, style) {
  const color = style.color;
  const markerType = style.marker;
  return L.geoJSON(geojson, {
    style: () => ({ color, weight: 2, fillOpacity: 0.18 }),
    pointToLayer: (feature, latlng) => {
      if (markerType === "marker") {
        return L.marker(latlng);
      }
      return L.circleMarker(latlng, {
        radius: 5,
        color,
        fillColor: color,
        fillOpacity: 0.75,
        weight: 1,
      });
    },
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
  });
}

function addGeoJsonLayer(layerName, geojson, colorHint) {
  const color = colorHint || palette[activeLayers.length % palette.length];
  const style = { color, marker: "circle", visible: true };
  const layer = createLeafletLayer(geojson, style).addTo(map);

  const item = {
    id: crypto.randomUUID(),
    name: layerName,
    geojson,
    style,
    layer,
    count: geojson?.features?.length || 0,
    ownedByAdmin: isAdmin,
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
    if (isAdmin) {
      li.innerHTML = `
        <strong>${item.name}（${item.count} 筆）${item.style.visible ? "" : "（已隱藏）"}</strong>
        <div class="layer-actions">
          <button type="button" data-action="zoom" data-id="${item.id}">定位</button>
          <button type="button" data-action="style" data-id="${item.id}">樣式</button>
          <button type="button" data-action="toggle" data-id="${item.id}">${
            item.style.visible ? "隱藏" : "顯示"
          }</button>
          <button type="button" data-action="remove" data-id="${item.id}">移除</button>
        </div>
      `;
    } else {
      li.innerHTML = `<strong>${item.name}（${item.count} 筆）</strong>`;
    }
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
  } else if (action === "style") {
    if (item.ownedByAdmin && !isAdmin) return;
    editingStyleLayerId = item.id;
    styleTitle.textContent = `圖層樣式：${item.name}`;
    styleColorInput.value = item.style.color;
    styleMarkerSelect.value = item.style.marker;
    styleVisibleCheckbox.checked = item.style.visible;
    styleDialog.showModal();
  } else if (action === "toggle") {
    if (item.ownedByAdmin && !isAdmin) return;
    item.style.visible = !item.style.visible;
    if (item.style.visible) {
      if (!map.hasLayer(item.layer)) {
        item.layer.addTo(map);
      }
    } else {
      map.removeLayer(item.layer);
    }
    refreshLayerList();
  } else if (action === "remove") {
    if (item.ownedByAdmin && !isAdmin) return;
    map.removeLayer(item.layer);
    activeLayers.splice(index, 1);
    refreshLayerList();
  }
});

clearLayersBtn.addEventListener("click", () => {
  if (!isAdmin) {
    setStatus("請先登入後台再清除圖層。", true);
    return;
  }
  activeLayers.forEach((item) => map.removeLayer(item.layer));
  activeLayers.length = 0;
  refreshLayerList();
  setStatus("已清除全部圖層。");
  savePersistentLayers();
});

locateBtn.addEventListener("click", () => {
  if (!navigator.geolocation) {
    setStatus("此瀏覽器不支援定位。", true);
    return;
  }
  setStatus("定位中，請稍候 ...");
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      const { latitude, longitude } = pos.coords;
      map.setView([latitude, longitude], 15);
      L.circleMarker([latitude, longitude], {
        radius: 6,
        color: "#22c55e",
        fillColor: "#22c55e",
        fillOpacity: 0.9,
        weight: 2,
      })
        .addTo(map)
        .bindPopup("目前位置")
        .openPopup();
      setStatus("已定位到目前位置。");
    },
    (err) => {
      setStatus(`定位失敗：${err.message}`, true);
    },
    { enableHighAccuracy: true, timeout: 10000 }
  );
});

refreshBtn.addEventListener("click", () => {
  if (!isAdmin) {
    setStatus("請先登入後台再更新快取。", true);
    return;
  }
  if (!navigator.serviceWorker?.controller) {
    window.location.reload();
    return;
  }
  navigator.serviceWorker.controller.postMessage({ type: "CLEAR_CACHE_AND_RELOAD" });
  setStatus("已送出更新 / 清除快取指令，請稍候 ...");
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
  savePersistentLayers();
}

async function importZipShapefile(file) {
  const buffer = await file.arrayBuffer();
  const result = await shp(buffer);
  const collections = normalizeLayerInput(result);

  if (collections.length === 0) {
    throw new Error("ZIP 內找不到可用 SHP。");
  }

  collections.forEach((item, idx) => {
    const layerName = `${file.name} - ${item.name || `圖層${idx + 1}`}`;
    const sourceGeojson = item.geojson;
    const projected = maybeReprojectTwd97(sourceGeojson);
    addGeoJsonLayer(layerName, projected.geojson, projected.colorHint);
  });

  setStatus(`匯入完成：${file.name}（${collections.length} 個圖層）`);
  savePersistentLayers();
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

function reprojectGeoJSON(geojson, sourceDef) {
  function projectCoord(coord) {
    const [x, y] = coord;
    const [lon, lat] = proj4(sourceDef, "EPSG:4326", [x, y]);
    return [lon, lat];
  }

  function projectCoordsArray(coords) {
    if (typeof coords[0] === "number") {
      return projectCoord(coords);
    }
    return coords.map((c) => projectCoordsArray(c));
  }

  return {
    type: "FeatureCollection",
    features: (geojson.features || []).map((f) => ({
      ...f,
      geometry: f.geometry
        ? {
            ...f.geometry,
            coordinates: projectCoordsArray(f.geometry.coordinates),
          }
        : f.geometry,
    })),
  };
}

function maybeReprojectTwd97(geojson) {
  const features = geojson.features || [];
  if (!features.length) {
    return { geojson, colorHint: undefined };
  }

  let count = 0;
  let within = 0;
  let minX = Infinity;
  let maxX = -Infinity;
  features.slice(0, 200).forEach((f) => {
    const g = f.geometry;
    if (!g) return;

    function collect(coords) {
      if (typeof coords[0] === "number") {
        const x = coords[0];
        const y = coords[1];
        count += 1;
        if (x > 150000 && x < 300000 && y > 2400000 && y < 2800000) {
          within += 1;
          minX = Math.min(minX, x);
          maxX = Math.max(maxX, x);
        }
        return;
      }
      coords.forEach(collect);
    }

    collect(g.coordinates);
  });

  if (!count || within / count < 0.5) {
    return { geojson, colorHint: undefined };
  }

  const lon0 = minX < 200000 ? 119 : 121;
  const sourceDef =
    lon0 === 119
      ? "+proj=tmerc +lat_0=0 +lon_0=119 +k=0.9999 +x_0=250000 +y_0=0 +ellps=GRS80 +units=m +no_defs"
      : "+proj=tmerc +lat_0=0 +lon_0=121 +k=0.9999 +x_0=250000 +y_0=0 +ellps=GRS80 +units=m +no_defs";

  const projected = reprojectGeoJSON(geojson, sourceDef);
  return { geojson: projected, colorHint: "#16a34a" };
}

async function readTextWithEncodingFallback(file) {
  const buffer = await file.arrayBuffer();
  let text = "";
  try {
    text = new TextDecoder("utf-8", { fatal: false }).decode(buffer);
  } catch {
    text = "";
  }

  if (text && !text.includes("�")) {
    return text;
  }

  try {
    const big5Decoder = new TextDecoder("big5", { fatal: false });
    const big5Text = big5Decoder.decode(buffer);
    if (big5Text && (!text || big5Text.includes("店家名稱") || big5Text.includes("緯度") || big5Text.includes("經度"))) {
      return big5Text;
    }
    return big5Text || text;
  } catch {
    return text;
  }
}

async function importFile(file) {
  const lower = file.name.toLowerCase();
  if (lower.endsWith(".csv")) {
    const csvText = await readTextWithEncodingFallback(file);
    await importCsvContent(csvText, file.name);
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

function savePersistentLayers() {
  const toSave = activeLayers
    .filter((it) => it.ownedByAdmin)
    .map((it) => ({
      name: it.name,
      geojson: it.geojson,
      style: it.style,
    }));
  try {
    localStorage.setItem("online-map-layers-v1", JSON.stringify(toSave));
  } catch {
    // ignore storage errors
  }
}

function loadPersistentLayers() {
  let raw;
  try {
    raw = localStorage.getItem("online-map-layers-v1");
  } catch {
    raw = null;
  }
  if (!raw) return;
  try {
    const list = JSON.parse(raw);
    if (!Array.isArray(list)) return;
    list.forEach((entry) => {
      if (!entry || !entry.geojson) return;
      const color = entry.style?.color;
      const prevAdmin = isAdmin;
      isAdmin = true;
      addGeoJsonLayer(entry.name || "圖層", entry.geojson, color);
      const last = activeLayers[activeLayers.length - 1];
      if (last) {
        last.style = {
          color: entry.style?.color || last.style.color,
          marker: entry.style?.marker || last.style.marker,
          visible: entry.style?.visible ?? last.style.visible,
        };
        last.ownedByAdmin = true;
        map.removeLayer(last.layer);
        last.layer = createLeafletLayer(last.geojson, last.style);
        if (last.style.visible) last.layer.addTo(map);
      }
      isAdmin = prevAdmin;
    });
    refreshLayerList();
  } catch {
    // ignore
  }
}

fileInput.addEventListener("change", async (event) => {
  if (!isAdmin) {
    setStatus("請先登入後台再匯入資料。", true);
    event.target.value = "";
    return;
  }
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
  if (!isAdmin) {
    setStatus("請先登入後台再匯入線上儲存格。", true);
    return;
  }
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
    loadPersistentLayers();
  });
}

function updateAdminUI() {
  document.querySelectorAll(".admin-only").forEach((el) => {
    el.classList.toggle("hidden", !isAdmin);
  });
  refreshLayerList();
}

updateAdminUI();

adminBtn.addEventListener("click", () => {
  adminPasswordInput.value = "";
  adminDialog.showModal();
});

adminForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const pwd = adminPasswordInput.value;
  if (pwd === "ABC123") {
    isAdmin = true;
    updateAdminUI();
    setStatus("已登入後台。");
    adminDialog.close();
  } else {
    setStatus("密碼錯誤。", true);
  }
});

styleForm.addEventListener("submit", (event) => {
  event.preventDefault();
  if (!editingStyleLayerId) {
    return;
  }
  const item = activeLayers.find((l) => l.id === editingStyleLayerId);
  editingStyleLayerId = null;
  if (!item) return;

  item.style.color = styleColorInput.value || item.style.color;
  item.style.marker = styleMarkerSelect.value;
  item.style.visible = styleVisibleCheckbox.checked;

  map.removeLayer(item.layer);
  item.layer = createLeafletLayer(item.geojson, item.style);
  if (item.style.visible) {
    item.layer.addTo(map);
  }
  refreshLayerList();
  savePersistentLayers();
  styleDialog.close();
});

basemapSelect.addEventListener("change", () => {
  const key = basemapSelect.value;
  Object.values(baseLayers).forEach((layer) => {
    if (map.hasLayer(layer)) {
      map.removeLayer(layer);
    }
  });
  const next = baseLayers[key] || baseLayers.osm;
  next.addTo(map);
});

measureDistanceBtn.addEventListener("click", () => {
  measureMode = "distance";
  measurePoints = [];
  if (measureLayer) {
    map.removeLayer(measureLayer);
    measureLayer = null;
  }
  setStatus("量距模式：請在地圖上連續點擊。");
});

measureAreaBtn.addEventListener("click", () => {
  measureMode = "area";
  measurePoints = [];
  if (measureLayer) {
    map.removeLayer(measureLayer);
    measureLayer = null;
  }
  setStatus("量面積模式：請在地圖上連續點擊。");
});

measureClearBtn.addEventListener("click", () => {
  measureMode = null;
  measurePoints = [];
  if (measureLayer) {
    map.removeLayer(measureLayer);
    measureLayer = null;
  }
  rayPoints = [];
  if (rayLayer) {
    map.removeLayer(rayLayer);
    rayLayer = null;
  }
  setStatus("已清除量測。");
});

rayBtn.addEventListener("click", () => {
  measureMode = "ray";
  rayPoints = [];
  if (rayLayer) {
    map.removeLayer(rayLayer);
    rayLayer = null;
  }
  setStatus("射線模式：請在地圖上點兩下，第一點為起點。");
});

map.on("click", (event) => {
  if (!measureMode) return;
  const latlng = event.latlng;
  if (measureMode === "ray") {
    rayPoints.push(latlng);
    if (rayPoints.length === 2) {
      const [p1, p2] = rayPoints;
      const dx = p2.lng - p1.lng;
      const dy = p2.lat - p1.lat;
      const factor = 5;
      const p3 = L.latLng(p1.lat + dy * factor, p1.lng + dx * factor);
      if (rayLayer) {
        map.removeLayer(rayLayer);
      }
      rayLayer = L.polyline([p1, p3], {
        color: "#ef4444",
        weight: 2,
        dashArray: "6,4",
      }).addTo(map);
      const dist = p1.distanceTo(p2);
      setStatus(`射線：起點到第二點距離約 ${dist.toFixed(1)} 公尺。`);
      measureMode = null;
    }
    return;
  }

  measurePoints.push(latlng);

  if (measureLayer) {
    map.removeLayer(measureLayer);
    measureLayer = null;
  }

  if (measureMode === "distance") {
    measureLayer = L.polyline(measurePoints, { color: "#f97316", weight: 3 }).addTo(map);
    if (measurePoints.length >= 2) {
      let total = 0;
      for (let i = 1; i < measurePoints.length; i += 1) {
        total += measurePoints[i - 1].distanceTo(measurePoints[i]);
      }
      const km = total / 1000;
      setStatus(`距離：${total.toFixed(1)} 公尺（約 ${km.toFixed(3)} 公里）`);
    }
  } else if (measureMode === "area") {
    if (measurePoints.length >= 3) {
      measureLayer = L.polygon(measurePoints, {
        color: "#22c55e",
        weight: 2,
        fillOpacity: 0.25,
      }).addTo(map);
      const latlngs = measurePoints.map((p) => [p.lat, p.lng]);
      const area = L.GeometryUtil.geodesicArea(latlngs);
      const ha = area / 10000;
      setStatus(`面積：${area.toFixed(1)} 平方公尺（約 ${ha.toFixed(3)} 公頃）。雙擊可結束量測。`);
    }
  }
});

map.on("dblclick", () => {
  if (measureMode === "area") {
    measureMode = null;
    setStatus("面積量測已結束。");
  }
});

coordInputSystem.addEventListener("change", () => {
  coordInputZoneWrap.classList.toggle("hidden", coordInputSystem.value !== "twd97");
});

coordLocateBtn.addEventListener("click", () => {
  coordResult.textContent = "";
  coordDialog.showModal();
});

coordForm.addEventListener("submit", () => {
  if (coordDialog.returnValue !== "default") {
    return;
  }
  const sys = coordInputSystem.value;
  const zone = coordInputZone.value || "121";
  const x = Number(coordInputX.value);
  const y = Number(coordInputY.value);
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    coordResult.textContent = "請輸入有效數值。";
    return;
  }

  let lon;
  let lat;
  if (sys === "wgs84") {
    lon = x;
    lat = y;
  } else {
    const src =
      zone === "119"
        ? "+proj=tmerc +lat_0=0 +lon_0=119 +k=0.9999 +x_0=250000 +y_0=0 +ellps=GRS80 +units=m +no_defs"
        : "+proj=tmerc +lat_0=0 +lon_0=121 +k=0.9999 +x_0=250000 +y_0=0 +ellps=GRS80 +units=m +no_defs";
    [lon, lat] = proj4(src, "EPSG:4326", [x, y]);
  }

  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    coordResult.textContent = "坐標轉換失敗。";
    return;
  }

  map.setView([lat, lon], 16);
  L.circleMarker([lat, lon], {
    radius: 6,
    color: "#0ea5e9",
    fillColor: "#0ea5e9",
    fillOpacity: 0.9,
    weight: 2,
  })
    .addTo(map)
    .bindPopup(`WGS84: ${lon.toFixed(6)}, ${lat.toFixed(6)}`)
    .openPopup();

  if (sys === "wgs84") {
    const src =
      zone === "119"
        ? "+proj=tmerc +lat_0=0 +lon_0=119 +k=0.9999 +x_0=250000 +y_0=0 +ellps=GRS80 +units=m +no_defs"
        : "+proj=tmerc +lat_0=0 +lon_0=121 +k=0.9999 +x_0=250000 +y_0=0 +ellps=GRS80 +units=m +no_defs";
    const [tx, ty] = proj4("EPSG:4326", src, [lon, lat]);
    coordResult.textContent = `WGS84: (${lon.toFixed(
      6
    )}, ${lat.toFixed(6)})；TWD97(${zone}): (${tx.toFixed(3)}, ${ty.toFixed(3)})`;
  } else {
    coordResult.textContent = `TWD97(${zone}): (${x.toFixed(
      3
    )}, ${y.toFixed(3)})；WGS84: (${lon.toFixed(6)}, ${lat.toFixed(6)})`;
  }
});
