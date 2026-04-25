const state = {
  map: null,
  currentPosition: null,
  destination: null,
  selectedAutocompleteItem: null,
  routeData: null,
  routeLine: null,
  userMarker: null,
  destMarker: null,
  watchId: null,
  fuelPriceOverrides: [],
  osmFuelStations: [],
  currentFuelStation: null,
  fuelListSort: "price",
  settings: {
    language: "da",
    region: "dk",
    routeMode: "fast",
    fuelType: "benzin95",
    maxDetourMeters: 2000
  }
};

const SETTINGS_KEY = "greenwave_settings_v7";
const HISTORY_KEY = "greenwave_history_v7";
const PRICE_HISTORY_KEY = "greenwave_price_history_v1";
const FUEL_DATA_URL = "./fuel-prices.json";

const els = {};
[
  "destinationInput","autocompleteBox","autocompleteList",
  "calcRouteBtn","startNavBtn","stopNavBtn","recenterBtn",
  "historyToggleBtn","historyBox","historyList",
  "openSettingsBtn","closeSettingsBtn","saveSettingsBtn",
  "settingsBackdrop","settingsPanel","languageDa","languageEn",
  "regionDK","regionUS","settingsRouteFast","settingsRouteEco",
  "gpsStatusChip","navStatusChip","mapModeLabel",
  "fuelDisclaimer","fuelContent","openFuelListBtn",
  "openFuelHistoryBtn","fuelListBackdrop","fuelListModal",
  "closeFuelListBtn","sortFuelByPriceBtn","sortFuelByDetourBtn",
  "fuelListContent","fuelHistoryBackdrop","fuelHistoryModal",
  "closeFuelHistoryBtn","fuelHistoryContent",
  "navOverlay","exitNavOverlayBtn","navBannerMain","navBannerSub",
  "driveRemainingDistance","driveRemainingTime","driveCurrentValue",
  "mapRotationInner","titleText"
].forEach(id => els[id] = document.getElementById(id));

const i18n = {
  da: {
    title: "Billigste brændstof",
    destination: "Indtast adresse...",
    calc: "Beregn rute",
    start: "Start",
    stop: "Stop",
    center: "Centrér",
    history: "Historik",
    settings: "Settings",
    cheapestRoute: "Se billigste på ruten",
    priceHistory: "Se prishistorik",
    noRoute: "Beregn en rute først.",
    noPrices: "Ingen prisdata fundet",
    fuelReady: "Brændstofpriser indlæst",
    gpsReady: "GPS: klar",
    navInactive: "Navigation: inaktiv",
    mapReady: "Kort: klar"
  },
  en: {
    title: "Cheapest fuel",
    destination: "Enter address...",
    calc: "Calculate route",
    start: "Start",
    stop: "Stop",
    center: "Center",
    history: "History",
    settings: "Settings",
    cheapestRoute: "Cheapest on route",
    priceHistory: "Price history",
    noRoute: "Calculate a route first.",
    noPrices: "No price data found",
    fuelReady: "Fuel prices loaded",
    gpsReady: "GPS: ready",
    navInactive: "Navigation: inactive",
    mapReady: "Map: ready"
  }
};

init();

async function init() {
  loadSettings();
  initMap();
  bindEvents();
  applySettingsToControls();
  applyTranslations();
  renderHistory();
  await loadFuelPrices();
  updateFuelBox();
}

function t(key) {
  return i18n[state.settings.language]?.[key] || key;
}

function initMap() {
  state.map = L.map("map").setView([56.2639, 9.5018], 7);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "&copy; OpenStreetMap contributors",
    maxZoom: 19
  }).addTo(state.map);
}

function bindEvents() {
  els.destinationInput?.addEventListener("input", () => {
    state.selectedAutocompleteItem = null;
    clearTimeout(state.autocompleteTimer);
    state.autocompleteTimer = setTimeout(runAutocomplete, 250);
  });

  els.calcRouteBtn?.addEventListener("click", calculateRoute);
  els.startNavBtn?.addEventListener("click", startLiveNavigation);
  els.stopNavBtn?.addEventListener("click", stopLiveNavigation);
  els.recenterBtn?.addEventListener("click", recenterMap);

  els.historyToggleBtn?.addEventListener("click", () => {
    els.historyBox.classList.toggle("hidden");
  });

  els.openSettingsBtn?.addEventListener("click", openSettings);
  els.closeSettingsBtn?.addEventListener("click", closeSettings);
  els.settingsBackdrop?.addEventListener("click", closeSettings);
  els.saveSettingsBtn?.addEventListener("click", saveSettingsFromControls);

  els.openFuelListBtn?.addEventListener("click", openFuelList);
  els.closeFuelListBtn?.addEventListener("click", closeFuelList);
  els.fuelListBackdrop?.addEventListener("click", closeFuelList);

  els.sortFuelByPriceBtn?.addEventListener("click", () => {
    state.fuelListSort = "price";
    renderFuelList();
  });

  els.sortFuelByDetourBtn?.addEventListener("click", () => {
    state.fuelListSort = "detour";
    renderFuelList();
  });

  els.openFuelHistoryBtn?.addEventListener("click", openFuelHistory);
  els.closeFuelHistoryBtn?.addEventListener("click", closeFuelHistory);
  els.fuelHistoryBackdrop?.addEventListener("click", closeFuelHistory);

  els.exitNavOverlayBtn?.addEventListener("click", stopLiveNavigation);
}

function loadSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}");
    state.settings = { ...state.settings, ...saved };
  } catch {}
}

function saveSettings() {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(state.settings));
}

function applySettingsToControls() {
  if (els.languageDa) els.languageDa.checked = state.settings.language === "da";
  if (els.languageEn) els.languageEn.checked = state.settings.language === "en";
  if (els.regionDK) els.regionDK.checked = state.settings.region === "dk";
  if (els.regionUS) els.regionUS.checked = state.settings.region === "us";
  if (els.settingsRouteFast) els.settingsRouteFast.checked = state.settings.routeMode === "fast";
  if (els.settingsRouteEco) els.settingsRouteEco.checked = state.settings.routeMode === "eco";
}

function saveSettingsFromControls() {
  state.settings.language = els.languageEn?.checked ? "en" : "da";
  state.settings.region = els.regionUS?.checked ? "us" : "dk";
  state.settings.routeMode = els.settingsRouteEco?.checked ? "eco" : "fast";

  saveSettings();
  applyTranslations();
  closeSettings();
}

function applyTranslations() {
  document.documentElement.lang = state.settings.language;
  if (els.titleText) els.titleText.textContent = t("title");
  if (els.destinationInput) els.destinationInput.placeholder = t("destination");
  if (els.calcRouteBtn) els.calcRouteBtn.textContent = t("calc");
  if (els.startNavBtn) els.startNavBtn.textContent = t("start");
  if (els.stopNavBtn) els.stopNavBtn.textContent = t("stop");
  if (els.recenterBtn) els.recenterBtn.textContent = t("center");
  if (els.historyToggleBtn) els.historyToggleBtn.textContent = t("history");
  if (els.openSettingsBtn) els.openSettingsBtn.textContent = t("settings");
  if (els.openFuelListBtn) els.openFuelListBtn.textContent = t("cheapestRoute");
  if (els.openFuelHistoryBtn) els.openFuelHistoryBtn.textContent = t("priceHistory");
  if (els.gpsStatusChip) els.gpsStatusChip.textContent = t("gpsReady");
  if (els.navStatusChip) els.navStatusChip.textContent = t("navInactive");
  if (els.mapModeLabel) els.mapModeLabel.textContent = t("mapReady");
}

function openSettings() {
  els.settingsPanel?.classList.remove("hidden");
  els.settingsBackdrop?.classList.remove("hidden");
}

function closeSettings() {
  els.settingsPanel?.classList.add("hidden");
  els.settingsBackdrop?.classList.add("hidden");
}

async function loadFuelPrices() {
  try {
    const res = await fetch(FUEL_DATA_URL, { cache: "no-store" });
    const data = await res.json();
    state.fuelPriceOverrides = normalizeFuelData(Array.isArray(data) ? data : []);
    savePriceHistorySnapshot();
    if (els.fuelDisclaimer) {
      els.fuelDisclaimer.textContent = `${t("fuelReady")}: ${state.fuelPriceOverrides.length} poster`;
    }
  } catch {
    state.fuelPriceOverrides = [];
    if (els.fuelDisclaimer) els.fuelDisclaimer.textContent = "fuel-prices.json kunne ikke hentes";
  }
}

function normalizeFuelData(raw) {
  const out = [];

  raw.forEach(station => {
    if (!station?.fuelTypes) return;

    Object.entries(station.fuelTypes).forEach(([fuelType, data]) => {
      if (!data || typeof data.price !== "number") return;

      out.push({
        id: station.id || `${station.brand}-${station.name}`,
        name: station.name || "Ukendt station",
        brand: station.brand || "",
        address: station.address || "",
        city: extractCity(station.address || ""),
        fuelType,
        price: data.price,
        currency: data.currency || "DKK",
        unit: data.unit || "liter",
        updatedAt: data.updatedAt || new Date().toISOString(),
        source: data.source || "fuel-prices.json"
      });
    });
  });

  return out;
}

function savePriceHistorySnapshot() {
  const now = new Date();
  const hourKey = `${String(now.getHours()).padStart(2, "0")}:00`;

  let history = {};
  try {
    history = JSON.parse(localStorage.getItem(PRICE_HISTORY_KEY) || "{}");
  } catch {}

  state.fuelPriceOverrides.forEach(item => {
    const key = `${normalizeBrand(item.brand)}-${normalizeText(item.name)}-${item.fuelType}`;
    if (!history[key]) {
      history[key] = {
        name: item.name,
        brand: item.brand,
        fuelType: item.fuelType,
        records: []
      };
    }

    history[key].records.push({
      price: item.price,
      hour: hourKey,
      timestamp: Date.now()
    });

    history[key].records = history[key].records.slice(-200);
  });

  localStorage.setItem(PRICE_HISTORY_KEY, JSON.stringify(history));
}

async function runAutocomplete() {
  const query = els.destinationInput.value.trim();
  if (query.length < 3) {
    hideAutocomplete();
    return;
  }

  const country = state.settings.region === "us" ? "us" : "dk";

  try {
    const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=6&addressdetails=1&countrycodes=${country}&q=${encodeURIComponent(query)}`;
    const res = await fetch(url);
    const data = await res.json();

    renderAutocomplete(Array.isArray(data) ? data : []);
  } catch {
    hideAutocomplete();
  }
}

function renderAutocomplete(items) {
  els.autocompleteList.innerHTML = "";

  if (!items.length) {
    els.autocompleteList.innerHTML = `<div class="autocomplete-empty">Ingen forslag</div>`;
    els.autocompleteBox.classList.remove("hidden");
    return;
  }

  items.forEach(item => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "autocomplete-item";

    const title = item.name || item.address?.road || item.display_name.split(",")[0];
    const sub = item.display_name;

    btn.innerHTML = `
      <span class="autocomplete-title">${escapeHtml(title)}</span>
      <span class="autocomplete-sub">${escapeHtml(sub)}</span>
    `;

    btn.addEventListener("click", () => {
      state.selectedAutocompleteItem = {
        lat: Number(item.lat),
        lng: Number(item.lon),
        displayName: item.display_name
      };
      els.destinationInput.value = title;
      hideAutocomplete();
    });

    els.autocompleteList.appendChild(btn);
  });

  els.autocompleteBox.classList.remove("hidden");
}

function hideAutocomplete() {
  els.autocompleteBox?.classList.add("hidden");
}

async function calculateRoute() {
  try {
    const destinationText = els.destinationInput.value.trim();
    if (!destinationText) return;

    els.calcRouteBtn.disabled = true;
    els.startNavBtn.disabled = true;

    const pos = await getCurrentPosition();
    state.currentPosition = {
      lat: pos.coords.latitude,
      lng: pos.coords.longitude,
      speed: pos.coords.speed,
      heading: pos.coords.heading,
      accuracy: pos.coords.accuracy
    };

    updateUserMarker(state.currentPosition.lat, state.currentPosition.lng);

    const dest = state.selectedAutocompleteItem || await geocodeDestination(destinationText);
    state.destination = dest;
    updateDestinationMarker(dest.lat, dest.lng);

    state.routeData = await fetchRoute(state.currentPosition, dest);

    drawRoute(state.routeData.geometry.map(([lng, lat]) => [lat, lng]));
    fitRouteBounds();

    saveHistory(destinationText);
    renderHistory();

    await loadOsmFuelStationsForRoute(state.routeData.geometry);
    updateFuelBox();

    els.startNavBtn.disabled = false;
  } catch (err) {
    console.error(err);
    alert("Kunne ikke beregne rute: " + (err.message || err));
  } finally {
    els.calcRouteBtn.disabled = false;
  }
}

async function geocodeDestination(query) {
  const country = state.settings.region === "us" ? "us" : "dk";
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&addressdetails=1&countrycodes=${country}&q=${encodeURIComponent(query)}`;
  const res = await fetch(url);
  const data = await res.json();
  if (!data?.length) throw new Error("Destination ikke fundet");

  return {
    lat: Number(data[0].lat),
    lng: Number(data[0].lon),
    displayName: data[0].display_name
  };
}

async function fetchRoute(from, to) {
  const url =
    `https://router.project-osrm.org/route/v1/driving/${from.lng},${from.lat};${to.lng},${to.lat}` +
    "?overview=full&geometries=geojson&steps=true&annotations=distance,duration";

  const res = await fetch(url);
  const data = await res.json();

  if (!data.routes?.length) throw new Error("Ingen rute fundet");

  const route = data.routes[0];

  return {
    distance: route.distance,
    duration: route.duration,
    geometry: route.geometry.coordinates,
    steps: route.legs?.[0]?.steps || []
  };
}

async function loadOsmFuelStationsForRoute(geometry) {
  const samples = sampleRoutePoints(geometry);
  const queryParts = samples.map(p => `
    node(around:2500,${p.lat},${p.lng})["amenity"="fuel"];
    way(around:2500,${p.lat},${p.lng})["amenity"="fuel"];
  `);

  const query = `
    [out:json][timeout:25];
    (${queryParts.join("\n")});
    out center tags;
  `;

  const res = await fetch("https://overpass-api.de/api/interpreter", {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=UTF-8" },
    body: query
  });

  const data = await res.json();

  state.osmFuelStations = dedupeStations(
    (data.elements || [])
      .map(normalizeOsmFuelStation)
      .filter(Boolean)
      .map(applyPriceToStation)
  );
}

function sampleRoutePoints(geometry) {
  const points = [];
  for (let i = 0; i < geometry.length; i += 35) {
    points.push({ lng: geometry[i][0], lat: geometry[i][1] });
  }

  if (geometry.length) {
    const last = geometry[geometry.length - 1];
    points.push({ lng: last[0], lat: last[1] });
  }

  return points.slice(0, 25);
}

function normalizeOsmFuelStation(el) {
  const lat = typeof el.lat === "number" ? el.lat : el.center?.lat;
  const lng = typeof el.lon === "number" ? el.lon : el.center?.lon;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  const tags = el.tags || {};
  const name = tags.name || tags.brand || tags.operator || "Tankstation";
  const brand = normalizeBrand(tags.brand || tags.operator || name);

  return {
    id: `osm-${el.type}-${el.id}`,
    name,
    brand,
    address: buildOsmAddress(tags),
    city: tags["addr:city"] || "",
    lat,
    lng,
    price: null,
    fuelType: state.settings.fuelType,
    source: "OSM"
  };
}

function buildOsmAddress(tags) {
  return [
    tags["addr:street"],
    tags["addr:housenumber"],
    tags["addr:postcode"],
    tags["addr:city"]
  ].filter(Boolean).join(" ") || "Adresse mangler";
}

function applyPriceToStation(station) {
  const match = findFuelPrice(station);
  if (!match) return station;

  return {
    ...station,
    price: match.price,
    source: match.source,
    priceMatchMode: match.matchMode,
    updatedAt: match.updatedAt
  };
}

function findFuelPrice(station) {
  const candidates = state.fuelPriceOverrides.filter(x =>
    x.fuelType === state.settings.fuelType &&
    typeof x.price === "number"
  );

  const sBrand = normalizeBrand(station.brand || station.name);
  const sName = normalizeText(station.name);
  const sCity = normalizeText(station.city || extractCity(station.address));

  const scored = candidates.map(item => {
    const iBrand = normalizeBrand(item.brand || item.name);
    const iName = normalizeText(item.name);
    const iCity = normalizeText(item.city || extractCity(item.address));

    let score = 0;
    if (sBrand && iBrand && sBrand === iBrand) score += 60;
    if (sCity && iCity && sCity === iCity) score += 35;
    if (sName && iName && (sName.includes(iName) || iName.includes(sName))) score += 25;

    return { ...item, score, matchMode: "brand/navn/by" };
  }).filter(x => x.score >= 45)
    .sort((a, b) => b.score - a.score || a.price - b.price);

  if (scored.length) return scored[0];

  const sameBrand = candidates
    .filter(x => normalizeBrand(x.brand || x.name) === sBrand)
    .sort((a, b) => a.price - b.price);

  if (sameBrand.length) {
    return { ...sameBrand[0], matchMode: "samme brand fallback" };
  }

  return null;
}

function updateFuelBox() {
  const candidates = getFuelCandidates();

  if (!state.routeData) {
    els.fuelContent.innerHTML = t("noRoute");
    els.openFuelListBtn.disabled = true;
    return;
  }

  if (!candidates.length) {
    els.fuelContent.innerHTML = `
      <div class="fuel-name">${t("noPrices")}</div>
      <div class="fuel-meta">Stationer langs ruten: ${state.osmFuelStations.length}</div>
      <div class="fuel-meta">Prisposter: ${state.fuelPriceOverrides.length}</div>
    `;
    els.openFuelListBtn.disabled = true;
    return;
  }

  const best = candidates.sort((a, b) => a.price - b.price || a.extraDetourMeters - b.extraDetourMeters)[0];
  state.currentFuelStation = best;
  els.openFuelListBtn.disabled = false;

  els.fuelContent.innerHTML = `
    <div class="fuel-name">${escapeHtml(best.name)}</div>
    <div class="fuel-price">${formatFuelPrice(best.price)}</div>
    <div class="fuel-meta">Omvej: ${formatDistance(best.extraDetourMeters)}</div>
    <div class="fuel-meta">Fra rute: ${formatDistance(best.distanceToRouteMeters)}</div>
    <a class="fuel-link" href="${buildGoogleMapsLink(best)}" target="_blank">Åbn via Google Maps</a>
  `;
}

function getFuelCandidates() {
  if (!state.routeData) return [];

  return state.osmFuelStations
    .filter(s => typeof s.price === "number")
    .map(s => {
      const d = distanceToRouteMetersFromGeometry({ lat: s.lat, lng: s.lng }, state.routeData.geometry);
      return { ...s, distanceToRouteMeters: d, extraDetourMeters: d * 2 };
    })
    .filter(s => s.distanceToRouteMeters <= 1000)
    .filter(s => s.extraDetourMeters <= state.settings.maxDetourMeters);
}

function openFuelList() {
  renderFuelList();
  els.fuelListModal.classList.remove("hidden");
  els.fuelListBackdrop.classList.remove("hidden");
}

function closeFuelList() {
  els.fuelListModal.classList.add("hidden");
  els.fuelListBackdrop.classList.add("hidden");
}

function renderFuelList() {
  const candidates = getFuelCandidates();

  if (!candidates.length) {
    els.fuelListContent.innerHTML = `<div class="fuel-list-empty">Ingen stationer med pris på ruten.</div>`;
    return;
  }

  const sorted = candidates.sort((a, b) => {
    if (state.fuelListSort === "detour") return a.extraDetourMeters - b.extraDetourMeters || a.price - b.price;
    return a.price - b.price || a.extraDetourMeters - b.extraDetourMeters;
  }).slice(0, 10);

  els.fuelListContent.innerHTML = sorted.map((s, i) => `
    <article class="fuel-list-item">
      <div class="fuel-list-item-top">
        <div>
          <div class="fuel-list-name">${i + 1}. ${escapeHtml(s.name)}</div>
          <div class="fuel-list-brand">${escapeHtml(s.brand || "Ukendt")}</div>
        </div>
        <div class="fuel-list-price">${formatFuelPrice(s.price)}</div>
      </div>
      <div class="fuel-list-meta-grid">
        <div class="fuel-list-meta">Omvej<br><strong>${formatDistance(s.extraDetourMeters)}</strong></div>
        <div class="fuel-list-meta">Fra rute<br><strong>${formatDistance(s.distanceToRouteMeters)}</strong></div>
        <div class="fuel-list-meta">Match<br><strong>${escapeHtml(s.priceMatchMode || "prisdata")}</strong></div>
        <div class="fuel-list-meta">Kilde<br><strong>${escapeHtml(s.source || "fuel-prices.json")}</strong></div>
      </div>
      <div class="fuel-list-actions">
        <a class="fuel-list-map-link" href="${buildGoogleMapsLink(s)}" target="_blank">Åbn via Google Maps</a>
      </div>
    </article>
  `).join("");
}

function openFuelHistory() {
  renderFuelHistory();
  els.fuelHistoryModal.classList.remove("hidden");
  els.fuelHistoryBackdrop.classList.remove("hidden");
}

function closeFuelHistory() {
  els.fuelHistoryModal.classList.add("hidden");
  els.fuelHistoryBackdrop.classList.add("hidden");
}

function renderFuelHistory() {
  let history = {};
  try {
    history = JSON.parse(localStorage.getItem(PRICE_HISTORY_KEY) || "{}");
  } catch {}

  const candidates = getFuelCandidates();

  if (!candidates.length) {
    els.fuelHistoryContent.innerHTML = `<div class="fuel-list-empty">Beregn en rute med priser først.</div>`;
    return;
  }

  const cards = candidates.slice(0, 10).map(station => {
    const keyPart = normalizeBrand(station.brand);
    const found = Object.values(history).find(h =>
      normalizeBrand(h.brand) === keyPart &&
      h.fuelType === state.settings.fuelType
    );

    if (!found || !found.records?.length) {
      return `
        <article class="fuel-list-item">
          <div class="fuel-list-name">${escapeHtml(station.name)}</div>
          <div class="fuel-list-meta">Ikke nok historik endnu.</div>
        </article>
      `;
    }

    const byHour = {};
    found.records.forEach(r => {
      if (!byHour[r.hour]) byHour[r.hour] = [];
      byHour[r.hour].push(r.price);
    });

    const avg = Object.entries(byHour).map(([hour, prices]) => ({
      hour,
      avg: prices.reduce((a, b) => a + b, 0) / prices.length
    })).sort((a, b) => a.avg - b.avg);

    const best = avg[0];
    const worst = avg[avg.length - 1];

    return `
      <article class="fuel-list-item">
        <div class="fuel-list-name">${escapeHtml(station.name)}</div>
        <div class="fuel-list-meta-grid">
          <div class="fuel-list-meta">Billigst ca.<br><strong>${best.hour}</strong></div>
          <div class="fuel-list-meta">Pris<br><strong>${formatFuelPrice(best.avg)}</strong></div>
          <div class="fuel-list-meta">Dyrest ca.<br><strong>${worst.hour}</strong></div>
          <div class="fuel-list-meta">Pris<br><strong>${formatFuelPrice(worst.avg)}</strong></div>
        </div>
      </article>
    `;
  });

  els.fuelHistoryContent.innerHTML = cards.join("");
}

function buildGoogleMapsLink(station) {
  const params = new URLSearchParams({
    api: "1",
    travelmode: "driving",
    destination: `${state.destination.lat},${state.destination.lng}`,
    waypoints: `${station.lat},${station.lng}`
  });

  if (state.currentPosition) {
    params.set("origin", `${state.currentPosition.lat},${state.currentPosition.lng}`);
  }

  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

function startLiveNavigation() {
  if (!state.routeData) return;

  els.navOverlay?.classList.remove("hidden");
  els.startNavBtn.disabled = true;
  els.stopNavBtn.disabled = false;
  els.navStatusChip.textContent = "Navigation: live";

  state.watchId = navigator.geolocation.watchPosition(pos => {
    const cur = {
      lat: pos.coords.latitude,
      lng: pos.coords.longitude,
      speed: pos.coords.speed
    };

    state.currentPosition = cur;
    updateUserMarker(cur.lat, cur.lng);

    if (typeof cur.speed === "number") {
      els.driveCurrentValue.textContent = `${Math.round(cur.speed * 3.6)} km/t`;
    }

    const remaining = state.destination
      ? haversineMeters(cur.lat, cur.lng, state.destination.lat, state.destination.lng)
      : 0;

    els.driveRemainingDistance.textContent = formatDistance(remaining);
  }, console.error, {
    enableHighAccuracy: true,
    maximumAge: 500,
    timeout: 15000
  });
}

function stopLiveNavigation() {
  if (state.watchId !== null) navigator.geolocation.clearWatch(state.watchId);
  state.watchId = null;

  els.navOverlay?.classList.add("hidden");
  els.startNavBtn.disabled = !state.routeData;
  els.stopNavBtn.disabled = true;
  els.navStatusChip.textContent = t("navInactive");
}

function drawRoute(latLngs) {
  if (state.routeLine) state.map.removeLayer(state.routeLine);
  state.routeLine = L.polyline(latLngs, { color: "#5ea2ff", weight: 6 }).addTo(state.map);
}

function fitRouteBounds() {
  if (state.routeLine) state.map.fitBounds(state.routeLine.getBounds(), { padding: [30, 30] });
}

function recenterMap() {
  if (state.currentPosition) state.map.setView([state.currentPosition.lat, state.currentPosition.lng], 15);
  else if (state.routeLine) fitRouteBounds();
}

function updateUserMarker(lat, lng) {
  if (!state.userMarker) state.userMarker = L.marker([lat, lng]).addTo(state.map);
  else state.userMarker.setLatLng([lat, lng]);
}

function updateDestinationMarker(lat, lng) {
  if (!state.destMarker) state.destMarker = L.marker([lat, lng]).addTo(state.map);
  else state.destMarker.setLatLng([lat, lng]);
}

function saveHistory(destination) {
  const list = getHistory();
  const next = [destination, ...list.filter(x => x !== destination)].slice(0, 5);
  localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
}

function getHistory() {
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]"); }
  catch { return []; }
}

function renderHistory() {
  if (!els.historyList) return;
  els.historyList.innerHTML = "";
  getHistory().forEach(item => {
    const btn = document.createElement("button");
    btn.className = "history-chip";
    btn.textContent = item;
    btn.onclick = () => {
      els.destinationInput.value = item;
      state.selectedAutocompleteItem = null;
      els.historyBox.classList.add("hidden");
    };
    els.historyList.appendChild(btn);
  });
}

function dedupeStations(stations) {
  const result = [];
  stations.forEach(s => {
    if (!result.some(x => haversineMeters(s.lat, s.lng, x.lat, x.lng) < 35)) result.push(s);
  });
  return result;
}

function distanceToRouteMetersFromGeometry(point, geometry) {
  let min = Infinity;
  for (let i = 1; i < geometry.length; i++) {
    const a = { lng: geometry[i - 1][0], lat: geometry[i - 1][1] };
    const b = { lng: geometry[i][0], lat: geometry[i][1] };
    min = Math.min(min, pointToSegmentDistanceMeters(point, a, b));
  }
  return min;
}

function pointToSegmentDistanceMeters(p, a, b) {
  const meanLatRad = ((p.lat + a.lat + b.lat) / 3) * Math.PI / 180;
  const mLat = 111320;
  const mLng = 111320 * Math.cos(meanLatRad);

  const px = p.lng * mLng, py = p.lat * mLat;
  const ax = a.lng * mLng, ay = a.lat * mLat;
  const bx = b.lng * mLng, by = b.lat * mLat;

  const dx = bx - ax, dy = by - ay;
  if (dx === 0 && dy === 0) return Math.hypot(px - ax, py - ay);

  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

function haversineMeters(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const rad = d => d * Math.PI / 180;
  const dLat = rad(lat2 - lat1);
  const dLng = rad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function extractCity(value) {
  const parts = String(value || "").split(",").map(x => x.trim()).filter(Boolean);
  return (parts.at(-1) || "").replace(/^\d{4}\s*/, "");
}

function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .replaceAll("æ", "ae")
    .replaceAll("ø", "oe")
    .replaceAll("å", "aa")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function normalizeBrand(value) {
  const text = normalizeText(value);
  if (text.includes("uno x") || text.includes("unox")) return "uno-x";
  if (text.includes("f24")) return "f24";
  if (text.includes("ingo")) return "ingo";
  if (text.includes("circle")) return "circle-k";
  if (text === "ok" || text.startsWith("ok ")) return "ok";
  if (text.includes("q8")) return "q8";
  if (text.includes("shell")) return "shell";
  if (text.includes("go on") || text.includes("goon")) return "goon";
  return text;
}

function formatFuelPrice(price) {
  if (state.settings.region === "us") {
    return `$${Number(price).toFixed(2)}/gal`;
  }
  return `${Number(price).toFixed(2).replace(".", ",")} kr/L`;
}

function formatDistance(meters) {
  if (!Number.isFinite(meters)) return "—";
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(1).replace(".", ",")} km`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function getCurrentPosition() {
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      maximumAge: 0,
      timeout: 15000
    });
  });
}
