const state = {
  map: null,
  currentPosition: null,
  destination: null,
  selectedAutocompleteItem: null,
  autocompleteTimer: null,

  routeData: null,
  routeLine: null,
  userMarker: null,
  destMarker: null,

  fuelPriceOverrides: [],
  osmFuelStations: [],
  fuelMarkers: [],
  currentFuelStation: null,
  fuelListSort: "price",

  settings: {
    language: "da",
    region: "dk",
    routeMode: "fast",
    fuelType: "benzin95",
    maxDetourMeters: 2000,
    searchRadiusBase: 100000
  }
};

const SETTINGS_KEY = "greenwave_settings_final_v1";
const HISTORY_KEY = "greenwave_history_final_v1";
const FUEL_DATA_URL = "./fuel-prices.json";

const els = {};
[
  "destinationInput",
  "autocompleteBox",
  "autocompleteList",
  "calcRouteBtn",
  "startNavBtn",
  "stopNavBtn",
  "recenterBtn",
  "historyToggleBtn",
  "historyBox",
  "historyList",

  "openSettingsBtn",
  "closeSettingsBtn",
  "saveSettingsBtn",
  "settingsBackdrop",
  "settingsPanel",
  "languageDa",
  "languageEn",
  "regionDK",
  "regionUS",
  "settingsRouteFast",
  "settingsRouteEco",
  "settingsFuelType",
  "settingsMaxDetour",
  "settingsSearchRadius",

  "gpsStatusChip",
  "navStatusChip",
  "mapModeLabel",

  "fuelDisclaimer",
  "fuelContent",
  "openFuelListBtn",
  "openFuelHistoryBtn",

  "fuelListBackdrop",
  "fuelListModal",
  "closeFuelListBtn",
  "sortFuelByPriceBtn",
  "sortFuelByDetourBtn",
  "fuelListContent",

  "fuelHistoryBackdrop",
  "fuelHistoryModal",
  "closeFuelHistoryBtn",
  "fuelHistoryContent",

  "navOverlay",
  "exitNavOverlayBtn",
  "driveRemainingDistance",
  "driveRemainingTime",
  "driveCurrentValue"
].forEach((id) => {
  els[id] = document.getElementById(id);
});

init();

async function init() {
  loadSettings();
  initMap();
  bindEvents();
  applySettingsToUI();
  renderHistory();

  setGpsStatus("GPS: klar");
  setNavStatus("Navigation: inaktiv");
  setMapStatus("Kort: klar");

  await loadFuelPrices();
  updateFuelBox();
}

function initMap() {
  state.map = L.map("map").setView([56.2, 9.5], 7);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "© OpenStreetMap"
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
    els.historyBox?.classList.toggle("hidden");
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

  document.addEventListener("click", (event) => {
    if (!event.target.closest(".search-wrap")) {
      els.autocompleteBox?.classList.add("hidden");
    }
  });
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

function applySettingsToUI() {
  if (els.languageDa) els.languageDa.checked = state.settings.language === "da";
  if (els.languageEn) els.languageEn.checked = state.settings.language === "en";
  if (els.regionDK) els.regionDK.checked = state.settings.region === "dk";
  if (els.regionUS) els.regionUS.checked = state.settings.region === "us";
  if (els.settingsRouteFast) els.settingsRouteFast.checked = state.settings.routeMode === "fast";
  if (els.settingsRouteEco) els.settingsRouteEco.checked = state.settings.routeMode === "eco";
  if (els.settingsFuelType) els.settingsFuelType.value = state.settings.fuelType;
  if (els.settingsMaxDetour) els.settingsMaxDetour.value = String(state.settings.maxDetourMeters);
  if (els.settingsSearchRadius) els.settingsSearchRadius.value = String(state.settings.searchRadiusBase);
}

function saveSettingsFromControls() {
  state.settings.language = els.languageEn?.checked ? "en" : "da";
  state.settings.region = els.regionUS?.checked ? "us" : "dk";
  state.settings.routeMode = els.settingsRouteEco?.checked ? "eco" : "fast";
  state.settings.fuelType = els.settingsFuelType?.value || "benzin95";
  state.settings.maxDetourMeters = Number(els.settingsMaxDetour?.value || 2000);
  state.settings.searchRadiusBase = Number(els.settingsSearchRadius?.value || 100000);

  saveSettings();
  closeSettings();

  if (state.routeData) {
    applyPricesToStations();
    updateFuelBox();
    updateFuelMarkers();
  }
}

function openSettings() {
  els.settingsPanel?.classList.remove("hidden");
  els.settingsBackdrop?.classList.remove("hidden");
}

function closeSettings() {
  els.settingsPanel?.classList.add("hidden");
  els.settingsBackdrop?.classList.add("hidden");
}

async function runAutocomplete() {
  const query = els.destinationInput?.value.trim();

  if (!query || query.length < 3) {
    els.autocompleteBox?.classList.add("hidden");
    return;
  }

  const country = state.settings.region === "us" ? "us" : "dk";

  try {
    const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=6&addressdetails=1&countrycodes=${country}&q=${encodeURIComponent(query)}`;
    const res = await fetch(url);
    const data = await res.json();

    renderAutocomplete(Array.isArray(data) ? data : []);
  } catch {
    els.autocompleteBox?.classList.add("hidden");
  }
}

function renderAutocomplete(items) {
  if (!els.autocompleteList || !els.autocompleteBox) return;

  els.autocompleteList.innerHTML = "";

  if (!items.length) {
    els.autocompleteList.innerHTML = `<div class="autocomplete-empty">Ingen forslag</div>`;
    els.autocompleteBox.classList.remove("hidden");
    return;
  }

  items.forEach((item) => {
    const title =
      item.name ||
      item.address?.road ||
      item.address?.city ||
      item.address?.town ||
      String(item.display_name || "").split(",")[0];

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "autocomplete-item";
    btn.innerHTML = `
      <span class="autocomplete-title">${escapeHtml(title)}</span>
      <span class="autocomplete-sub">${escapeHtml(item.display_name || "")}</span>
    `;

    btn.addEventListener("click", () => {
      state.selectedAutocompleteItem = {
        lat: Number(item.lat),
        lng: Number(item.lon),
        displayName: item.display_name || title
      };

      els.destinationInput.value = title;
      els.autocompleteBox.classList.add("hidden");
    });

    els.autocompleteList.appendChild(btn);
  });

  els.autocompleteBox.classList.remove("hidden");
}

async function calculateRoute() {
  const input = els.destinationInput?.value.trim();
  if (!input) return;

  try {
    els.calcRouteBtn.disabled = true;
    els.startNavBtn.disabled = true;
    els.openFuelListBtn.disabled = true;

    setGpsStatus("GPS: henter position");
    setMapStatus("Kort: beregner");

    state.currentPosition = await getPosition();
    updateUserMarker(state.currentPosition.lat, state.currentPosition.lng);

    state.destination = state.selectedAutocompleteItem || await geocode(input);
    updateDestinationMarker(state.destination.lat, state.destination.lng);

    state.routeData = await fetchRoute(state.currentPosition, state.destination);

    drawRoute(state.routeData.geometry);

    saveHistory(input);
    renderHistory();

    await loadFuelStations(state.routeData.geometry);
    applyPricesToStations();
    updateFuelBox();
    updateFuelMarkers();

    els.startNavBtn.disabled = false;

    setGpsStatus("GPS: klar");
    setNavStatus("Navigation: rute klar");
    setMapStatus("Kort: klar");
  } catch (error) {
    console.error(error);
    alert("Kunne ikke beregne rute: " + (error.message || error));
    setGpsStatus("GPS: fejl");
    setMapStatus("Kort: fejl");
  } finally {
    els.calcRouteBtn.disabled = false;
  }
}

async function geocode(query) {
  const country = state.settings.region === "us" ? "us" : "dk";
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=${country}&q=${encodeURIComponent(query)}`;

  const res = await fetch(url);
  const data = await res.json();

  if (!data.length) throw new Error("Destination ikke fundet");

  return {
    lat: Number(data[0].lat),
    lng: Number(data[0].lon),
    displayName: data[0].display_name
  };
}

async function fetchRoute(from, to) {
  const url =
    `https://router.project-osrm.org/route/v1/driving/${from.lng},${from.lat};${to.lng},${to.lat}` +
    "?overview=full&geometries=geojson&steps=true";

  const res = await fetch(url);
  const data = await res.json();

  if (!data.routes?.length) throw new Error("Ingen rute fundet");

  return {
    geometry: data.routes[0].geometry.coordinates,
    distance: data.routes[0].distance,
    duration: data.routes[0].duration,
    steps: data.routes[0].legs?.[0]?.steps || []
  };
}

async function loadFuelStations(geometry) {
  try {
    const points = sampleRoutePoints(geometry);

    const query = `
      [out:json][timeout:25];
      (
        ${points.map(p => `
          node(around:2500,${p.lat},${p.lng})["amenity"="fuel"];
          way(around:2500,${p.lat},${p.lng})["amenity"="fuel"];
        `).join("")}
      );
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
    );
  } catch (error) {
    console.error(error);
    state.osmFuelStations = [];
  }
}

function sampleRoutePoints(geometry) {
  const points = [];

  for (let i = 0; i < geometry.length; i += 80) {
    points.push({ lng: geometry[i][0], lat: geometry[i][1] });
  }

  if (geometry.length) {
    const last = geometry[geometry.length - 1];
    points.push({ lng: last[0], lat: last[1] });
  }

  const seen = new Set();

  return points
    .filter((p) => {
      const key = `${p.lat.toFixed(3)},${p.lng.toFixed(3)}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 12);
}

function normalizeOsmFuelStation(el) {
  const lat = typeof el.lat === "number" ? el.lat : el.center?.lat;
  const lng = typeof el.lon === "number" ? el.lon : el.center?.lon;

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  const tags = el.tags || {};
  const name = tags.name || tags.brand || tags.operator || "Tankstation";
  const brand = normalizeBrand(tags.brand || tags.operator || name);

  const address = [
    tags["addr:street"],
    tags["addr:housenumber"],
    tags["addr:postcode"],
    tags["addr:city"]
  ].filter(Boolean).join(" ");

  return {
    id: `${el.type}-${el.id}`,
    lat,
    lng,
    name,
    brand,
    address,
    city: tags["addr:city"] || extractCity(address),
    price: null,
    source: "OSM",
    matchMode: null
  };
}

async function loadFuelPrices() {
  try {
    const res = await fetch(FUEL_DATA_URL, { cache: "no-store" });
    const raw = await res.json();
    state.fuelPriceOverrides = normalizeFuelPrices(Array.isArray(raw) ? raw : []);

    if (els.fuelDisclaimer) {
      els.fuelDisclaimer.textContent = `Prisposter: ${state.fuelPriceOverrides.length}`;
    }
  } catch {
    state.fuelPriceOverrides = [];
    if (els.fuelDisclaimer) els.fuelDisclaimer.textContent = "fuel-prices.json kunne ikke hentes";
  }
}

function normalizeFuelPrices(rawStations) {
  const out = [];

  rawStations.forEach((station) => {
    if (!station || typeof station !== "object") return;

    const country = String(station.country || station.market || "DK").toUpperCase();

    if (station.fuelTypes && typeof station.fuelTypes === "object") {
      Object.entries(station.fuelTypes).forEach(([fuelType, data]) => {
        if (!data || typeof data.price !== "number") return;

        out.push({
          id: station.id || `${station.brand}-${station.name}-${fuelType}`,
          name: station.name || "Ukendt station",
          brand: station.brand || "",
          address: station.address || "",
          city: extractCity(station.address || ""),
          lat: numberOrNull(station.lat),
          lng: numberOrNull(station.lng),
          country,
          fuelType,
          price: data.price,
          currency: data.currency || "DKK",
          unit: data.unit || "liter",
          updatedAt: data.updatedAt || null,
          source: data.source || "fuel-prices.json"
        });
      });
      return;
    }

    if (typeof station.price === "number") {
      out.push({
        id: station.id || `${station.brand}-${station.name}`,
        name: station.name || "Ukendt station",
        brand: station.brand || "",
        address: station.address || "",
        city: extractCity(station.address || ""),
        lat: numberOrNull(station.lat),
        lng: numberOrNull(station.lng),
        country,
        fuelType: station.fuelType || state.settings.fuelType,
        price: station.price,
        currency: station.currency || "DKK",
        unit: station.unit || "liter",
        updatedAt: station.updatedAt || null,
        source: station.source || "fuel-prices.json"
      });
    }
  });

  return out;
}

function applyPricesToStations() {
  state.osmFuelStations = state.osmFuelStations.map((station) => {
    const match = findFuelPrice(station);

    if (!match) return station;

    return {
      ...station,
      price: match.price,
      source: match.source,
      matchMode: match.matchMode,
      updatedAt: match.updatedAt
    };
  });
}

function findFuelPrice(station) {
  const candidates = state.fuelPriceOverrides.filter((item) =>
    item.fuelType === state.settings.fuelType &&
    typeof item.price === "number" &&
    isCompatiblePrice(item)
  );

  if (!candidates.length) return null;

  const sBrand = normalizeBrand(station.brand || station.name);
  const sName = normalizeText(station.name);
  const sCity = normalizeText(station.city || extractCity(station.address));

  const coordinate = candidates
    .filter((item) => Number.isFinite(item.lat) && Number.isFinite(item.lng))
    .map((item) => ({
      ...item,
      distance: haversine(station.lat, station.lng, item.lat, item.lng),
      matchMode: "koordinat"
    }))
    .filter((item) => item.distance <= 150)
    .sort((a, b) => a.distance - b.distance);

  if (coordinate.length) return coordinate[0];

  const scored = candidates
    .map((item) => {
      const iBrand = normalizeBrand(item.brand || item.name);
      const iName = normalizeText(item.name);
      const iCity = normalizeText(item.city || extractCity(item.address));

      let score = 0;

      if (sBrand && iBrand && sBrand === iBrand) score += 60;
      if (sCity && iCity && sCity === iCity) score += 35;

      if (sName && iName) {
        if (sName === iName) score += 40;
        else if (sName.includes(iName) || iName.includes(sName)) score += 25;
        else score += sharedWordScore(sName, iName);
      }

      return { ...item, score, matchMode: "brand/navn/by" };
    })
    .filter((item) => item.score >= 45)
    .sort((a, b) => b.score - a.score || a.price - b.price);

  if (scored.length) return scored[0];

  const sameBrand = candidates
    .filter((item) => normalizeBrand(item.brand || item.name) === sBrand)
    .sort((a, b) => a.price - b.price);

  if (sameBrand.length) {
    return { ...sameBrand[0], matchMode: "samme brand fallback" };
  }

  return null;
}

function isCompatiblePrice(item) {
  if (state.settings.region === "us") {
    return item.country === "US" || item.currency === "USD" || item.unit === "gallon";
  }

  return item.country !== "US" && item.currency !== "USD";
}

function getFuelCandidates() {
  if (!state.currentPosition || !state.routeData) return [];

  const radius = getSearchRadiusMeters();

  return state.osmFuelStations
    .filter((station) => typeof station.price === "number")
    .map((station) => {
      const distanceFromCurrent = haversine(
        state.currentPosition.lat,
        state.currentPosition.lng,
        station.lat,
        station.lng
      );

      const distanceToRoute = distanceToRouteMetersFromGeometry(
        { lat: station.lat, lng: station.lng },
        state.routeData.geometry
      );

      return {
        ...station,
        distanceFromCurrent,
        distanceToRoute,
        extraDetourMeters: distanceToRoute * 2
      };
    })
    .filter((station) => station.distanceFromCurrent <= radius);
}

function getSearchRadiusMeters() {
  const base = Number(state.settings.searchRadiusBase || 100000);

  if (state.settings.region === "us") {
    return (base / 1000) * 1609.344;
  }

  return base;
}

function updateFuelBox() {
  if (!els.fuelContent) return;

  if (!state.routeData) {
    els.fuelContent.innerHTML = "Beregn en rute først.";
    if (els.openFuelListBtn) els.openFuelListBtn.disabled = true;
    return;
  }

  const candidates = getFuelCandidates();

  if (!candidates.length) {
    els.fuelContent.innerHTML = `
      <div class="fuel-name">Ingen prisdata fundet</div>
      <div class="fuel-meta">Tankstationer fundet: ${state.osmFuelStations.length}</div>
      <div class="fuel-meta">Prisposter: ${state.fuelPriceOverrides.length}</div>
    `;
    if (els.openFuelListBtn) els.openFuelListBtn.disabled = true;
    return;
  }

  const best = candidates
    .slice()
    .sort((a, b) => a.price - b.price || a.distanceFromCurrent - b.distanceFromCurrent)[0];

  state.currentFuelStation = best;

  if (els.openFuelListBtn) els.openFuelListBtn.disabled = false;

  els.fuelContent.innerHTML = `
    <div class="fuel-name">${escapeHtml(best.name)}</div>
    <div class="fuel-price">${formatPrice(best.price)}</div>
    <div class="fuel-meta">Afstand: ${formatDistance(best.distanceFromCurrent)}</div>
    <div class="fuel-meta">Fra rute: ${formatDistance(best.distanceToRoute)}</div>
    <div class="fuel-meta">Match: ${escapeHtml(best.matchMode || "prisdata")}</div>
    <a class="fuel-link" href="${buildGoogleMapsLink(best)}" target="_blank" rel="noopener noreferrer">
      Åbn via Google Maps
    </a>
  `;
}

function openFuelList() {
  renderFuelList();
  els.fuelListModal?.classList.remove("hidden");
  els.fuelListBackdrop?.classList.remove("hidden");
}

function closeFuelList() {
  els.fuelListModal?.classList.add("hidden");
  els.fuelListBackdrop?.classList.add("hidden");
}

function renderFuelList() {
  if (!els.fuelListContent) return;

  const candidates = getFuelCandidates();

  if (!candidates.length) {
    els.fuelListContent.innerHTML = `<div class="fuel-list-empty">Ingen stationer med pris på ruten.</div>`;
    return;
  }

  const sorted = candidates
    .slice()
    .sort((a, b) => {
      if (state.fuelListSort === "detour") {
        return a.distanceToRoute - b.distanceToRoute || a.price - b.price;
      }
      return a.price - b.price || a.distanceToRoute - b.distanceToRoute;
    })
    .slice(0, 10);

  els.fuelListContent.innerHTML = sorted.map((s, i) => `
    <article class="fuel-list-item">
      <div class="fuel-list-item-top">
        <div>
          <div class="fuel-list-name">${i + 1}. ${escapeHtml(s.name)}</div>
          <div class="fuel-list-brand">${escapeHtml(s.brand || "Ukendt")}</div>
        </div>
        <div class="fuel-list-price">${formatPrice(s.price)}</div>
      </div>

      <div class="fuel-list-meta-grid">
        <div class="fuel-list-meta">Afstand<br><strong>${formatDistance(s.distanceFromCurrent)}</strong></div>
        <div class="fuel-list-meta">Fra rute<br><strong>${formatDistance(s.distanceToRoute)}</strong></div>
        <div class="fuel-list-meta">Match<br><strong>${escapeHtml(s.matchMode || "prisdata")}</strong></div>
        <div class="fuel-list-meta">Kilde<br><strong>${escapeHtml(s.source || "fuel-prices.json")}</strong></div>
      </div>

      <div class="fuel-list-actions">
        <a class="fuel-list-map-link" href="${buildGoogleMapsLink(s)}" target="_blank" rel="noopener noreferrer">
          Åbn via Google Maps
        </a>
      </div>
    </article>
  `).join("");
}

function openFuelHistory() {
  if (!els.fuelHistoryContent) return;

  els.fuelHistoryContent.innerHTML = `
    <div class="fuel-list-empty">
      Prishistorik kommer først, når der er gemt flere prisopdateringer over tid.
    </div>
  `;

  els.fuelHistoryModal?.classList.remove("hidden");
  els.fuelHistoryBackdrop?.classList.remove("hidden");
}

function closeFuelHistory() {
  els.fuelHistoryModal?.classList.add("hidden");
  els.fuelHistoryBackdrop?.classList.add("hidden");
}

function updateFuelMarkers() {
  clearFuelMarkers();

  const stations = getFuelCandidates()
    .slice()
    .sort((a, b) => a.price - b.price || a.distanceFromCurrent - b.distanceFromCurrent)
    .slice(0, 10);

  stations.forEach((s, index) => {
    const isBest = index === 0;

    const icon = L.divIcon({
      className: "fuel-price-marker",
      html: `<div class="fuel-price-label ${isBest ? "best" : ""}">${formatPriceShort(s.price)}</div>`,
      iconSize: [74, 34],
      iconAnchor: [37, 17]
    });

    const marker = L.marker([s.lat, s.lng], { icon })
      .addTo(state.map)
      .bindPopup(`
        <strong>${escapeHtml(s.name)}</strong><br>
        ${formatPrice(s.price)}<br>
        Afstand: ${formatDistance(s.distanceFromCurrent)}<br>
        Fra rute: ${formatDistance(s.distanceToRoute)}<br>
        <a href="${buildGoogleMapsLink(s)}" target="_blank" rel="noopener noreferrer">Åbn via Google Maps</a>
      `);

    state.fuelMarkers.push(marker);
  });
}

function clearFuelMarkers() {
  state.fuelMarkers.forEach((marker) => state.map.removeLayer(marker));
  state.fuelMarkers = [];
}

function startLiveNavigation() {
  if (!state.routeData || !state.destination) return;

  els.navOverlay?.classList.remove("hidden");

  if (els.startNavBtn) els.startNavBtn.disabled = true;
  if (els.stopNavBtn) els.stopNavBtn.disabled = false;
  setNavStatus("Navigation: live");

  if (state.watchId !== null) {
    navigator.geolocation.clearWatch(state.watchId);
  }

  state.watchId = navigator.geolocation.watchPosition(position => {
    const current = {
      lat: position.coords.latitude,
      lng: position.coords.longitude,
      speed: position.coords.speed
    };

    state.currentPosition = current;
    updateUserMarker(current.lat, current.lng);

    const kmh = typeof current.speed === "number" ? Math.round(current.speed * 3.6) : 0;

    if (els.driveCurrentValue) els.driveCurrentValue.textContent = `${kmh} km/t`;

    if (els.driveRemainingDistance) {
      const remaining = haversine(
        current.lat,
        current.lng,
        state.destination.lat,
        state.destination.lng
      );

      els.driveRemainingDistance.textContent = formatDistance(remaining);
    }
  }, console.error, {
    enableHighAccuracy: true,
    maximumAge: 500,
    timeout: 15000
  });
}

function stopLiveNavigation() {
  if (state.watchId !== null) {
    navigator.geolocation.clearWatch(state.watchId);
    state.watchId = null;
  }

  els.navOverlay?.classList.add("hidden");

  if (els.startNavBtn) els.startNavBtn.disabled = !state.routeData;
  if (els.stopNavBtn) els.stopNavBtn.disabled = true;
  setNavStatus("Navigation: inaktiv");
}

function recenterMap() {
  if (state.currentPosition) {
    state.map.setView([state.currentPosition.lat, state.currentPosition.lng], 15);
    return;
  }

  if (state.routeLine) {
    state.map.fitBounds(state.routeLine.getBounds(), { padding: [30, 30] });
  }
}

function drawRoute(geometry) {
  if (state.routeLine) state.map.removeLayer(state.routeLine);

  const latlngs = geometry.map(p => [p[1], p[0]]);

  state.routeLine = L.polyline(latlngs, {
    color: "#5ea2ff",
    weight: 6,
    opacity: 0.9
  }).addTo(state.map);

  state.map.fitBounds(state.routeLine.getBounds(), { padding: [30, 30] });
}

function updateUserMarker(lat, lng) {
  if (!state.userMarker) {
    state.userMarker = L.marker([lat, lng]).addTo(state.map);
  } else {
    state.userMarker.setLatLng([lat, lng]);
  }
}

function updateDestinationMarker(lat, lng) {
  if (!state.destMarker) {
    state.destMarker = L.marker([lat, lng]).addTo(state.map);
  } else {
    state.destMarker.setLatLng([lat, lng]);
  }
}

function saveHistory(destination) {
  const list = getHistory();
  const next = [destination, ...list.filter(x => x !== destination)].slice(0, 5);
  localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
}

function getHistory() {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");
  } catch {
    return [];
  }
}

function renderHistory() {
  if (!els.historyList) return;

  els.historyList.innerHTML = "";

  getHistory().forEach((item) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "history-chip";
    button.textContent = item;

    button.addEventListener("click", () => {
      els.destinationInput.value = item;
      state.selectedAutocompleteItem = null;
      els.historyBox?.classList.add("hidden");
    });

    els.historyList.appendChild(button);
  });
}

function dedupeStations(stations) {
  const result = [];

  stations.forEach((s) => {
    const duplicate = result.find((x) => haversine(s.lat, s.lng, x.lat, x.lng) < 35);
    if (!duplicate) result.push(s);
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

  const px = p.lng * mLng;
  const py = p.lat * mLat;
  const ax = a.lng * mLng;
  const ay = a.lat * mLat;
  const bx = b.lng * mLng;
  const by = b.lat * mLat;

  const dx = bx - ax;
  const dy = by - ay;

  if (dx === 0 && dy === 0) return Math.hypot(px - ax, py - ay);

  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const toRad = x => x * Math.PI / 180;

  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) *
    Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) ** 2;

  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
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
  if (text === "ok" || text.startsWith("ok ") || text.includes(" ok ")) return "ok";
  if (text.includes("q8")) return "q8";
  if (text.includes("shell")) return "shell";
  if (text.includes("go on") || text.includes("goon")) return "goon";
  if (text.includes("oil")) return "oil";

  return text;
}

function sharedWordScore(a, b) {
  const aw = new Set(a.split(" ").filter(x => x.length >= 3));
  const bw = new Set(b.split(" ").filter(x => x.length >= 3));

  let score = 0;
  aw.forEach(word => {
    if (bw.has(word)) score += 8;
  });

  return score;
}

function extractCity(value) {
  const parts = String(value || "").split(",").map(x => x.trim()).filter(Boolean);
  return (parts.at(-1) || "").replace(/^\d{4}\s*/, "");
}

function numberOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function formatPrice(price) {
  if (state.settings.region === "us") {
    return `$${Number(price).toFixed(2)}/gal`;
  }

  return `${Number(price).toFixed(2).replace(".", ",")} kr/L`;
}

function formatPriceShort(price) {
  if (state.settings.region === "us") {
    return `$${Number(price).toFixed(2)}`;
  }

  return Number(price).toFixed(2).replace(".", ",");
}

function formatDistance(meters) {
  if (!Number.isFinite(meters)) return "—";

  if (state.settings.region === "us") {
    return `${(meters / 1609.344).toFixed(1)} mi`;
  }

  if (meters < 1000) return `${Math.round(meters)} m`;

  return `${(meters / 1000).toFixed(1).replace(".", ",")} km`;
}

function buildGoogleMapsLink(station) {
  if (!state.destination) {
    return `https://www.google.com/maps/search/?api=1&query=${station.lat},${station.lng}`;
  }

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

function setGpsStatus(text) {
  if (els.gpsStatusChip) els.gpsStatusChip.textContent = text;
}

function setNavStatus(text) {
  if (els.navStatusChip) els.navStatusChip.textContent = text;
}

function setMapStatus(text) {
  if (els.mapModeLabel) els.mapModeLabel.textContent = text;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function getPosition() {
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(pos => {
      resolve({
        lat: pos.coords.latitude,
        lng: pos.coords.longitude
      });
    }, reject, {
      enableHighAccuracy: true,
      maximumAge: 0,
      timeout: 15000
    });
  });
}
