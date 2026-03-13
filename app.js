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
const circleBtn = document.getElementById("circleBtn");
const gotoTwd97Btn = document.getElementById("gotoTwd97Btn");
const rayBtn = document.getElementById("rayBtn");
const styleDialog = document.getElementById("styleDialog");
const styleForm = document.getElementById("styleForm");
const styleTitle = document.getElementById("styleTitle");
const styleColorInput = document.getElementById("styleColorInput");
const styleMarkerSelect = document.getElementById("styleMarkerSelect");
const styleVisibleCheckbox = document.getElementById("styleVisibleCheckbox");

const gotoDialog = document.getElementById("gotoDialog");
const gotoForm = document.getElementById("gotoForm");
const gotoZoneSelect = document.getElementById("gotoZoneSelect");
const gotoXInput = document.getElementById("gotoXInput");
const gotoYInput = document.getElementById("gotoYInput");

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
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  }),
  googleSat: L.tileLayer("https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}", {
    maxZoom: 19,
    attribution: "© Google",
  }),
  googleTerrain: L.tileLayer("https://mt1.google.com/vt/lyrs=p&x={x}&y={y}&z={z}", {
    maxZoom: 19,
    attribution: "© Google",
  }),
};

let currentBase = baseLayers.osm;
currentBase.addTo(map);

const epsg3826 = "+proj=tmerc +lat_0=0 +lon_0=121 +k=0.9999 +x_0=250000 +y_0=0 +ellps=GRS80 +units=m +no_defs";
const epsg3825 = "+proj=tmerc +lat_0=0 +lon_0=119 +k=0.9999 +x_0=250000 +y_0=0 +ellps=GRS80 +units=m +no_defs";
proj4.defs("EPSG:3826", epsg3826);
proj4.defs("EPSG:3825", epsg3825);

const activeLayers = [];
const palette = ["#2563eb", "#dc2626", "#16a34a", "#9333ea", "#ea580c", "#0891b2"];

let measureMode = "none";
let measurePoints = [];
let measureLayer = null;
let rayLayer = null;
let rayPoints = [];
let circleMode = false;
let circleRadius = 0;
let circleLayers = [];

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
    editingStyleLayerId = item.id;
    styleTitle.textContent = `圖層樣式：${item.name}`;
    styleColorInput.value = item.style.color;
    styleMarkerSelect.value = item.style.marker;
    styleVisibleCheckbox.checked = item.style.visible;
    styleDialog.showModal();
  } else if (action === "toggle") {
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

styleForm.addEventListener("submit", (event) => {
  event.preventDefault();
  if (!editingStyleLayerId) {
    styleDialog.close("cancel");
    return;
  }
  const index = activeLayers.findIndex((item) => item.id === editingStyleLayerId);
  if (index < 0) {
    styleDialog.close("cancel");
    return;
  }
  const item = activeLayers[index];
  item.style.color = styleColorInput.value || item.style.color;
  item.style.marker = styleMarkerSelect.value;
  item.style.visible = styleVisibleCheckbox.checked;

  map.removeLayer(item.layer);
  const newLayer = createLeafletLayer(item.geojson, item.style);
  item.layer = newLayer;
  if (item.style.visible) {
    item.layer.addTo(map);
  }
  refreshLayerList();
  styleDialog.close("default");
  setStatus(`已更新圖層樣式：${item.name}`);
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
  if (!navigator.serviceWorker?.controller) {
    window.location.reload();
    return;
  }
  navigator.serviceWorker.controller.postMessage({ type: "CLEAR_CACHE_AND_RELOAD" });
  setStatus("已送出更新 / 清除快取指令，請稍候 ...");
});

basemapSelect.addEventListener("change", () => {
  const value = basemapSelect.value;
  const next = baseLayers[value] || baseLayers.osm;
  if (next === currentBase) return;
  map.removeLayer(currentBase);
  currentBase = next;
  currentBase.addTo(map);
  setStatus(`已切換底圖：${basemapSelect.options[basemapSelect.selectedIndex].textContent}`);
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
    const layerName = `${file.name} - ${item.name || `圖層${idx + 1}`}`;
    const sourceGeojson = item.geojson;
    const projected = maybeReprojectTwd97(sourceGeojson);
    addGeoJsonLayer(layerName, projected.geojson, projected.colorHint);
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

function updateMeasureGraphics() {
  if (measureLayer) {
    map.removeLayer(measureLayer);
    measureLayer = null;
  }
  if (!measurePoints.length) {
    setStatus("已清除量測。");
    return;
  }

  if (measureMode === "distance") {
    measureLayer = L.polyline(measurePoints, {
      color: "#f97316",
      weight: 3,
    }).addTo(map);

    let total = 0;
    for (let i = 1; i < measurePoints.length; i += 1) {
      total += map.distance(measurePoints[i - 1], measurePoints[i]);
    }
    setStatus(`距離：${total.toFixed(1)} m`);
  } else if (measureMode === "area") {
    if (measurePoints.length < 3) {
      measureLayer = L.polyline(measurePoints, {
        color: "#f97316",
        weight: 3,
      }).addTo(map);
      setStatus("請至少點三個點以計算面積。");
      return;
    }
    measureLayer = L.polygon(measurePoints, {
      color: "#f97316",
      weight: 2,
      fillColor: "#fb923c",
      fillOpacity: 0.35,
    }).addTo(map);

    const area = polygonAreaMeters2(measurePoints);
    setStatus(`面積：${area.toFixed(1)} m²`);
  }
}

function polygonAreaMeters2(points) {
  if (points.length < 3) return 0;
  const R = 6378137;
  const coords = points.map((p) => {
    const lon = (p.lng * Math.PI) / 180;
    const lat = (p.lat * Math.PI) / 180;
    const x = R * lon;
    const y = R * Math.log(Math.tan(Math.PI / 4 + lat / 2));
    return { x, y };
  });

  let sum = 0;
  for (let i = 0; i < coords.length; i += 1) {
    const a = coords[i];
    const b = coords[(i + 1) % coords.length];
    sum += a.x * b.y - b.x * a.y;
  }
  return Math.abs(sum) / 2;
}

measureDistanceBtn.addEventListener("click", () => {
  measureMode = "distance";
  measurePoints = [];
  if (measureLayer) {
    map.removeLayer(measureLayer);
    measureLayer = null;
  }
  setStatus("量距離模式：請在地圖上連續點擊路徑節點。");
});

measureAreaBtn.addEventListener("click", () => {
  measureMode = "area";
  measurePoints = [];
  if (measureLayer) {
    map.removeLayer(measureLayer);
    measureLayer = null;
  }
  setStatus("量面積模式：請在地圖上點出多邊形各頂點。");
});

measureClearBtn.addEventListener("click", () => {
  measureMode = "none";
  measurePoints = [];
  if (measureLayer) {
    map.removeLayer(measureLayer);
    measureLayer = null;
  }
  circleMode = false;
  circleRadius = 0;
  circleLayers.forEach((c) => map.removeLayer(c));
  circleLayers = [];
  if (rayLayer) {
    map.removeLayer(rayLayer);
    rayLayer = null;
  }
  setStatus("已清除量測。");
});

circleBtn.addEventListener("click", () => {
  const input = window.prompt("請輸入圓半徑（公尺）", circleRadius || "100");
  if (input == null) {
    return;
  }
  const r = Number(input);
  if (!Number.isFinite(r) || r <= 0) {
    setStatus("半徑必須為正數。", true);
    return;
  }
  circleRadius = r;
  circleMode = true;
  measureMode = "none";
  measurePoints = [];
  if (measureLayer) {
    map.removeLayer(measureLayer);
    measureLayer = null;
  }
  setStatus("畫圓模式：請在地圖上點選圓心位置。");
});

map.on("click", (event) => {
  if (measureMode !== "none") {
    measurePoints.push(event.latlng);
    updateMeasureGraphics();
    return;
  }

  if (circleMode && circleRadius > 0) {
    const circle = L.circle(event.latlng, {
      radius: circleRadius,
      color: "#0ea5e9",
      weight: 2,
      fillColor: "#38bdf8",
      fillOpacity: 0.25,
    }).addTo(map);
    circleLayers.push(circle);
    setStatus(`圓：半徑 ${circleRadius.toFixed(2)} m。可再次點選以新增其他圓。`);
  }
});

rayBtn.addEventListener("click", () => {
  measureMode = "none";
  measurePoints = [];
  if (measureLayer) {
    map.removeLayer(measureLayer);
    measureLayer = null;
  }
  if (rayLayer) {
    map.removeLayer(rayLayer);
    rayLayer = null;
  }
  rayPoints = [];
  setStatus("兩點射線模式：請在地圖上點選起點與終點。");

  const onceClick = (event) => {
    rayPoints.push(event.latlng);
    if (rayPoints.length < 2) {
      setStatus("已選起點，請再點一次終點。");
      return;
    }

    map.off("click", onceClick);
    const [p1, p2] = rayPoints;
    const bounds = map.getBounds();

    const lat1 = (p1.lat * Math.PI) / 180;
    const lon1 = (p1.lng * Math.PI) / 180;
    const lat2 = (p2.lat * Math.PI) / 180;
    const lon2 = (p2.lng * Math.PI) / 180;

    const dLon = lon2 - lon1;
    const y = Math.sin(dLon) * Math.cos(lat2);
    const x =
      Math.cos(lat1) * Math.sin(lat2) -
      Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
    const bearing = Math.atan2(y, x);

    const extendPoint = (distanceMeters) => {
      const R = 6378137;
      const angDist = distanceMeters / R;
      const lat = Math.asin(
        Math.sin(lat1) * Math.cos(angDist) +
          Math.cos(lat1) * Math.sin(angDist) * Math.cos(bearing)
      );
      const lon =
        lon1 +
        Math.atan2(
          Math.sin(bearing) * Math.sin(angDist) * Math.cos(lat1),
          Math.cos(angDist) - Math.sin(lat1) * Math.sin(lat)
        );
      return L.latLng((lat * 180) / Math.PI, (lon * 180) / Math.PI);
    };

    const diag = map.distance(bounds.getSouthWest(), bounds.getNorthEast());
    let length = diag * 2;
    const input = window.prompt(
      "請輸入射線長度（公尺，留空則自動）",
      Math.round(length).toString()
    );
    if (input != null && input.trim() !== "") {
      const v = Number(input);
      if (Number.isFinite(v) && v > 0) {
        length = v;
      }
    }

    const end = extendPoint(length);

    if (rayLayer) {
      map.removeLayer(rayLayer);
    }
    rayLayer = L.polyline([p1, end], { color: "#22c55e", weight: 3 }).addTo(map);

    const dist = map.distance(p1, p2);
    const deg = ((bearing * 180) / Math.PI + 360) % 360;
    setStatus(
      `兩點射線：起點到終點距離 ${dist.toFixed(
        1
      )} m，方位角約 ${deg.toFixed(1)}°（由起點指向終點延伸）。`
    );
  };

  map.on("click", onceClick);
});

gotoTwd97Btn.addEventListener("click", () => {
  gotoXInput.value = "";
  gotoYInput.value = "";
  gotoDialog.showModal();
});

gotoForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const action = event.submitter?.value;
  if (action !== "default") {
    gotoDialog.close("cancel");
    return;
  }

  const x = Number(gotoXInput.value);
  const y = Number(gotoYInput.value);
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    setStatus("請輸入有效的 X / Y 數值。", true);
    gotoDialog.close("cancel");
    return;
  }

  const zone = gotoZoneSelect.value === "119" ? "EPSG:3825" : "EPSG:3826";
  const [lon, lat] = proj4(zone, "EPSG:4326", [x, y]);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    setStatus("座標轉換失敗。", true);
    gotoDialog.close("cancel");
    return;
  }

  map.setView([lat, lon], 17);
  L.marker([lat, lon])
    .addTo(map)
    .bindPopup(`TWD97 ${zone} 座標<br/>X=${x}, Y=${y}`)
    .openPopup();

  setStatus("已定位到指定 TWD97 座標。");
  gotoDialog.close("default");
});

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

map.on("contextmenu", (event) => {
  const { lat, lng } = event.latlng;
  const googleNav = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
  const googleStreet = `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${lat},${lng}`;
  const appleNav = `https://maps.apple.com/?daddr=${lat},${lng}`;

  const html = `
    <div style="font-size:12px">
      <div>座標：${lat.toFixed(6)}, ${lng.toFixed(6)}</div>
      <ul style="margin:6px 0 0;padding-left:18px;">
        <li><a href="${googleNav}" target="_blank" rel="noopener">Google 地圖導航</a></li>
        <li><a href="${googleStreet}" target="_blank" rel="noopener">Google 街景</a></li>
        <li><a href="${appleNav}" target="_blank" rel="noopener">Apple 地圖導航</a></li>
      </ul>
    </div>
  `;

  L.popup().setLatLng(event.latlng).setContent(html).openOn(map);
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
