const i18n = {
  da: {
    title: "Billigste brændstof",
    calc: "Beregn rute",
    start: "Start live navigation",
    noPrice: "Ingen prisdata fundet",
    cheapest: "Billigste station",
  },
  en: {
    title: "Cheapest fuel",
    calc: "Calculate route",
    start: "Start live navigation",
    noPrice: "No price data found",
    cheapest: "Cheapest station",
  }
};

const state = {
  map: null,
  currentPosition: null,
  destination: null,
  selectedAutocompleteItem: null,
  autocompleteTimer: null,
  autocompleteAbortController: null,

  routeData: null,
  routeLine: null,
  userMarker: null,
  destMarker: null,

  watchId: null,
  wakeLock: null,
  wakeLockIntervalId: null,
  navActive: false,
  recalculating: false,
  lastRerouteAt: 0,

  currentProgress: {
    closestIndex: 0,
    distanceAlongRoute: 0,
    activeStepIndex: 0
  },

  currentSpeedLimit: {
    value: null,
    source: "ukendt",
    confidence: "ukendt",
    note: "Ingen aktiv rute",
    roadName: "—"
  },

  currentActualSpeedKmh: null,
  lastSpeeds: [],
  lastObservationPoint: null,

  currentHeadingDeg: 0,
  smoothedHeadingDeg: 0,
  cameraLock: false,

  fuelPriceOverrides: [],
  osmFuelStations: [],
  currentFuelStation: null,
  fuelListSort: "price",

  settings: {
    language: "da",
    routeMode: "fast",
    headingUp: true,
    smoothNavigation: true,
    fuelType: "benzin95",
    maxDetourMeters: 2000,
    showFuelBox: true,
    useOsmSpeed: true,
    allowRoadTypeFallback: false
  },

  speedCache: new Map(),
  speedLookupQueue: new Set()
};

const HISTORY_KEY = "greenwave_dk_history_v6";
const OBS_KEY = "greenwave_dk_observations_v6";
const SETTINGS_KEY = "greenwave_dk_settings_v6";
const FUEL_DATA_URL = "./fuel-prices.json";

const MAX_FUEL_DISTANCE_FROM_ROUTE_METERS = 1000;
const OSM_FUEL_ROUTE_SAMPLE_EVERY = 35;
const OSM_FUEL_AROUND_METERS = 2500;
const OSM_FUEL_MAX_QUERY_POINTS = 25;

const els = {
  destinationInput: document.getElementById("destinationInput"),
  autocompleteBox: document.getElementById("autocompleteBox"),
  autocompleteList: document.getElementById("autocompleteList"),

  historyToggleBtn: document.getElementById("historyToggleBtn"),
  historyBox: document.getElementById("historyBox"),
  historyList: document.getElementById("historyList"),

  calcRouteBtn: document.getElementById("calcRouteBtn"),
  startNavBtn: document.getElementById("startNavBtn"),
  stopNavBtn: document.getElementById("stopNavBtn"),
  recenterBtn: document.getElementById("recenterBtn"),

  openSettingsBtn: document.getElementById("openSettingsBtn"),
  closeSettingsBtn: document.getElementById("closeSettingsBtn"),
  saveSettingsBtn: document.getElementById("saveSettingsBtn"),
  settingsBackdrop: document.getElementById("settingsBackdrop"),
  settingsPanel: document.getElementById("settingsPanel"),

  languageDa: document.getElementById("languageDa"),
  languageEn: document.getElementById("languageEn"),
  settingsRouteFast: document.getElementById("settingsRouteFast"),
  settingsRouteEco: document.getElementById("settingsRouteEco"),
  settingsHeadingUp: document.getElementById("settingsHeadingUp"),
  settingsSmoothNavigation: document.getElementById("settingsSmoothNavigation"),
  settingsFuelType: document.getElementById("settingsFuelType"),
  settingsMaxDetour: document.getElementById("settingsMaxDetour"),
  settingsShowFuelBox: document.getElementById("settingsShowFuelBox"),
  settingsUseOsmSpeed: document.getElementById("settingsUseOsmSpeed"),
  settingsAllowRoadTypeFallback: document.getElementById("settingsAllowRoadTypeFallback"),

  gpsStatusChip: document.getElementById("gpsStatusChip"),
  navStatusChip: document.getElementById("navStatusChip"),
  mapModeLabel: document.getElementById("mapModeLabel"),
  navMessage: document.getElementById("navMessage"),

  routeStatusLabel: document.getElementById("routeStatusLabel"),
  fromLabel: document.getElementById("fromLabel"),
  toLabel: document.getElementById("toLabel"),
  routeModeSummary: document.getElementById("routeModeSummary"),
  routeDistanceLabel: document.getElementById("routeDistanceLabel"),
  routeDurationLabel: document.getElementById("routeDurationLabel"),

  speedLimitValue: document.getElementById("speedLimitValue"),
  speedLimitNote: document.getElementById("speedLimitNote"),
  recommendedSpeedCard: document.getElementById("recommendedSpeedCard"),
  recommendedSpeedValue: document.getElementById("recommendedSpeedValue"),
  recommendedSpeedNote: document.getElementById("recommendedSpeedNote"),
  currentSpeedValue: document.getElementById("currentSpeedValue"),
  currentSpeedNote: document.getElementById("currentSpeedNote"),
  remainingDistanceValue: document.getElementById("remainingDistanceValue"),
  remainingDistanceNote: document.getElementById("remainingDistanceNote"),
  nextInstructionValue: document.getElementById("nextInstructionValue"),
  nextInstructionNote: document.getElementById("nextInstructionNote"),

  speedSourceValue: document.getElementById("speedSourceValue"),
  speedConfidenceValue: document.getElementById("speedConfidenceValue"),
  speedSegmentValue: document.getElementById("speedSegmentValue"),

  observationCountLabel: document.getElementById("observationCountLabel"),
  greenWaveSummary: document.getElementById("greenWaveSummary"),
  timeSlotLabel: document.getElementById("timeSlotLabel"),
  stopPatternLabel: document.getElementById("stopPatternLabel"),

  fuelPanel: document.getElementById("fuelPanel"),
  fuelContent: document.getElementById("fuelContent"),
  fuelDisclaimer: document.getElementById("fuelDisclaimer"),
  openFuelListBtn: document.getElementById("openFuelListBtn"),
  fuelListBackdrop: document.getElementById("fuelListBackdrop"),
  fuelListModal: document.getElementById("fuelListModal"),
  closeFuelListBtn: document.getElementById("closeFuelListBtn"),
  sortFuelByPriceBtn: document.getElementById("sortFuelByPriceBtn"),
  sortFuelByDetourBtn: document.getElementById("sortFuelByDetourBtn"),
  fuelListContent: document.getElementById("fuelListContent"),

  navOverlay: document.getElementById("navOverlay"),
  navBannerMain: document.getElementById("navBannerMain"),
  navBannerSub: document.getElementById("navBannerSub"),
  exitNavOverlayBtn: document.getElementById("exitNavOverlayBtn"),
  addFuelStopBtn: document.getElementById("addFuelStopBtn"),

  driveRecommendedCard: document.getElementById("driveRecommendedCard"),
  driveRecommendedValue: document.getElementById("driveRecommendedValue"),
  driveCurrentValue: document.getElementById("driveCurrentValue"),
  driveMaxValue: document.getElementById("driveMaxValue"),
  driveRemainingDistance: document.getElementById("driveRemainingDistance"),
  driveRemainingTime: document.getElementById("driveRemainingTime"),
  driveGreenWaveStatus: document.getElementById("driveGreenWaveStatus"),
  wakeLockStatus: document.getElementById("wakeLockStatus"),
  driveObservationCount: document.getElementById("driveObservationCount"),
  driveTimeSlot: document.getElementById("driveTimeSlot"),

  mapRotationInner: document.getElementById("map-rotation-inner")
};

init();

async function init() {
  try {
    loadSettings();
    initMap();
    bindEvents();
    applySettingsToControls();
    renderHistory();
    applyFuelVisibility();

    setGpsStatus("GPS: ikke startet");
    setNavStatus("Navigation: inaktiv");
    setMapMode("Kort: klar");
    setInfoMessage("Beregn en rute først. Start derefter live navigation.");

    renderSpeedState();
    renderRecommendedSpeedState();
    refreshObservationUI();

    await loadFuelPriceOverrides();
    updateFuelBox();
  } catch (error) {
    console.error("Init-fejl:", error);
  }
}

function initMap() {
  state.map = L.map("map", {
    zoomControl: true,
    zoomSnap: 0.25,
    zoomDelta: 0.25
  }).setView([56.2639, 9.5018], 7);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "&copy; OpenStreetMap contributors",
    maxZoom: 19
  }).addTo(state.map);
}

function bindEvents() {
  els.historyToggleBtn?.addEventListener("click", () => {
    els.historyBox.classList.toggle("hidden");
    hideAutocomplete();
  });

  els.destinationInput?.addEventListener("input", () => {
    state.selectedAutocompleteItem = null;
    scheduleAutocompleteSearch();
  });

  els.destinationInput?.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      hideAutocomplete();
      handleCalculateRoute();
    }

    if (event.key === "Escape") {
      hideAutocomplete();
      closeSettings();
      closeFuelList();
    }
  });

  document.addEventListener("click", (event) => {
    if (!event.target.closest(".search-wrap")) hideAutocomplete();
  });

  els.calcRouteBtn?.addEventListener("click", handleCalculateRoute);
  els.startNavBtn?.addEventListener("click", startLiveNavigation);
  els.stopNavBtn?.addEventListener("click", stopLiveNavigation);
  els.exitNavOverlayBtn?.addEventListener("click", stopLiveNavigation);

  els.recenterBtn?.addEventListener("click", () => {
    state.cameraLock = false;
    recenterMap();
  });

  els.addFuelStopBtn?.addEventListener("click", handleAddFuelStop);

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

  els.openSettingsBtn?.addEventListener("click", openSettings);
  els.closeSettingsBtn?.addEventListener("click", closeSettings);
  els.settingsBackdrop?.addEventListener("click", closeSettings);
  els.saveSettingsBtn?.addEventListener("click", saveSettingsFromControls);

  document.addEventListener("visibilitychange", async () => {
    if (document.visibilityState === "visible" && state.navActive) {
      await requestWakeLock();
    }
  });

  window.addEventListener("focus", async () => {
    if (state.navActive) await requestWakeLock();
  });

  ["touchstart", "pointerdown", "click"].forEach((eventName) => {
    document.addEventListener(
      eventName,
      async () => {
        if (state.navActive) await requestWakeLock();
      },
      { passive: true }
    );
  });
}

function openSettings() {
  els.settingsPanel.classList.remove("hidden");
  els.settingsBackdrop.classList.remove("hidden");
  els.settingsPanel.setAttribute("aria-hidden", "false");
}

function closeSettings() {
  els.settingsPanel.classList.add("hidden");
  els.settingsBackdrop.classList.add("hidden");
  els.settingsPanel.setAttribute("aria-hidden", "true");
}

function openFuelList() {
  renderFuelList();
  els.fuelListModal.classList.remove("hidden");
  els.fuelListBackdrop.classList.remove("hidden");
  els.fuelListModal.setAttribute("aria-hidden", "false");
}

function closeFuelList() {
  els.fuelListModal.classList.add("hidden");
  els.fuelListBackdrop.classList.add("hidden");
  els.fuelListModal.setAttribute("aria-hidden", "true");
}

function loadSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}");
    state.settings = { ...state.settings, ...saved };
  } catch {
    localStorage.removeItem(SETTINGS_KEY);
  }
}

function saveSettings() {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(state.settings));
}

function applySettingsToControls() {
  if (!els.languageDa) return;

  els.languageDa.checked = state.settings.language === "da";
  els.languageEn.checked = state.settings.language === "en";
  els.settingsRouteFast.checked = state.settings.routeMode === "fast";
  els.settingsRouteEco.checked = state.settings.routeMode === "eco";
  els.settingsHeadingUp.checked = state.settings.headingUp;
  els.settingsSmoothNavigation.checked = state.settings.smoothNavigation;
  els.settingsFuelType.value = state.settings.fuelType;
  els.settingsMaxDetour.value = String(state.settings.maxDetourMeters);
  els.settingsShowFuelBox.checked = state.settings.showFuelBox;
  els.settingsUseOsmSpeed.checked = state.settings.useOsmSpeed;
  els.settingsAllowRoadTypeFallback.checked = state.settings.allowRoadTypeFallback;
}

function saveSettingsFromControls() {
  state.settings.language = els.languageEn.checked ? "en" : "da";
  state.settings.routeMode = els.settingsRouteEco.checked ? "eco" : "fast";
  state.settings.headingUp = els.settingsHeadingUp.checked;
  state.settings.smoothNavigation = els.settingsSmoothNavigation.checked;
  state.settings.fuelType = els.settingsFuelType.value;
  state.settings.maxDetourMeters = Number(els.settingsMaxDetour.value) || 2000;
  state.settings.showFuelBox = els.settingsShowFuelBox.checked;
  state.settings.useOsmSpeed = els.settingsUseOsmSpeed.checked;
  state.settings.allowRoadTypeFallback = els.settingsAllowRoadTypeFallback.checked;

  saveSettings();
  applyFuelVisibility();
  updateFuelBox();
  renderRouteSummary();
  resetMapRotation();

  closeSettings();
  setSuccessMessage("Indstillinger gemt.");
}

function applyFuelVisibility() {
  els.fuelPanel?.classList.toggle("hidden", !state.settings.showFuelBox);
}

async function loadFuelPriceOverrides() {
  try {
    const response = await fetch(FUEL_DATA_URL, { cache: "no-store" });
    if (!response.ok) throw new Error("fuel-prices.json kunne ikke hentes.");

    const data = await response.json();
    state.fuelPriceOverrides = normalizeFuelData(Array.isArray(data) ? data : []);

    els.fuelDisclaimer.textContent =
      "Tankstationer hentes fra OSM. Priser matches fra fuel-prices.json.";
  } catch (error) {
    console.warn(error);
    state.fuelPriceOverrides = [];
    els.fuelDisclaimer.textContent =
      "Tankstationer hentes fra OSM. fuel-prices.json kunne ikke hentes, så priser vises som manglende.";
  }
}

function normalizeFuelData(rawStations) {
  const normalized = [];

  rawStations.forEach((station) => {
    if (!station || typeof station !== "object") return;

    const lat = station.lat === null || station.lat === undefined ? null : Number(station.lat);
    const lng = station.lng === null || station.lng === undefined ? null : Number(station.lng);

    if ((lat !== null && !Number.isFinite(lat)) || (lng !== null && !Number.isFinite(lng))) return;

    if (station.fuelTypes && typeof station.fuelTypes === "object") {
      Object.entries(station.fuelTypes).forEach(([fuelType, data]) => {
        if (!data || typeof data !== "object") return;

        normalized.push({
          id: station.id || `${station.name}-${fuelType}`,
          name: station.name || "Ukendt station",
          brand: station.brand || "",
          address: station.address || "",
          city: extractCity(station.address || ""),
          lat,
          lng,
          fuelType,
          price: typeof data.price === "number" ? data.price : null,
          currency: data.currency || "DKK",
          unit: data.unit || "liter",
          updatedAt: data.updatedAt || null,
          source: data.source || "fuel-prices.json"
        });
      });
      return;
    }

    normalized.push({
      id: station.id || station.name || "station",
      name: station.name || "Ukendt station",
      brand: station.brand || "",
      address: station.address || "",
      city: extractCity(station.address || ""),
      lat,
      lng,
      fuelType: station.fuelType || "benzin95",
      price: typeof station.price === "number" ? station.price : null,
      currency: station.currency || "DKK",
      unit: station.unit || "liter",
      updatedAt: station.updatedAt || null,
      source: station.source || "fuel-prices.json"
    });
  });

  return normalized;
}

function scheduleAutocompleteSearch() {
  clearTimeout(state.autocompleteTimer);
  state.autocompleteTimer = setTimeout(runAutocompleteSearch, 250);
}

async function runAutocompleteSearch() {
  const query = els.destinationInput.value.trim();

  if (query.length < 3) {
    hideAutocomplete();
    return;
  }

  if (state.autocompleteAbortController) {
    state.autocompleteAbortController.abort();
  }

  state.autocompleteAbortController = new AbortController();

  try {
    const url =
      "https://nominatim.openstreetmap.org/search" +
      `?format=jsonv2&limit=6&addressdetails=1&countrycodes=dk&q=${encodeURIComponent(query)}`;

    const res = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: state.autocompleteAbortController.signal
    });

    if (!res.ok) throw new Error("Adresseforslag kunne ikke hentes.");

    const data = await res.json();
    renderAutocompleteResults(Array.isArray(data) ? data : []);
  } catch (error) {
    if (error.name === "AbortError") return;
    console.warn(error);
    hideAutocomplete();
  }
}

function renderAutocompleteResults(results) {
  els.autocompleteList.innerHTML = "";

  if (!results.length) {
    els.autocompleteList.innerHTML = `<div class="autocomplete-empty">Ingen forslag fundet.</div>`;
    els.autocompleteBox.classList.remove("hidden");
    return;
  }

  results.forEach((item) => {
    const title = buildAutocompleteTitle(item);
    const subtitle = buildAutocompleteSubtitle(item);

    const button = document.createElement("button");
    button.type = "button";
    button.className = "autocomplete-item";
    button.innerHTML = `
      <span class="autocomplete-title">${escapeHtml(title)}</span>
      <span class="autocomplete-sub">${escapeHtml(subtitle)}</span>
    `;

    button.addEventListener("click", () => {
      state.selectedAutocompleteItem = {
        lat: Number(item.lat),
        lng: Number(item.lon),
        displayName: item.display_name
      };

      els.destinationInput.value = title;
      hideAutocomplete();
    });

    els.autocompleteList.appendChild(button);
  });

  els.autocompleteBox.classList.remove("hidden");
}

function hideAutocomplete() {
  els.autocompleteBox?.classList.add("hidden");
}

function buildAutocompleteTitle(item) {
  const address = item.address || {};
  return (
    address.road ||
    address.pedestrian ||
    address.suburb ||
    address.neighbourhood ||
    item.name ||
    String(item.display_name || "").split(",")[0]
  );
}

function buildAutocompleteSubtitle(item) {
  const address = item.address || {};
  return [
    address.house_number,
    address.postcode,
    address.city || address.town || address.village || address.municipality,
    address.country
  ]
    .filter(Boolean)
    .join(" • ") || item.display_name || "";
}

async function handleCalculateRoute() {
  const destinationText = els.destinationInput.value.trim();

  if (!destinationText) {
    setWarningMessage("Skriv en destination først.");
    return;
  }

  hideAutocomplete();

  try {
    els.calcRouteBtn.disabled = true;
    els.startNavBtn.disabled = true;
    if (els.openFuelListBtn) els.openFuelListBtn.disabled = true;

    setGpsStatus("GPS: henter position");
    setNavStatus("Navigation: beregner");
    setMapMode("Kort: beregner");
    setInfoMessage("Finder din position og beregner rute …");

    const position = await getCurrentPosition();
    const current = positionToSimple(position);
    state.currentPosition = current;

    updateUserMarker(current.lat, current.lng);

    const destination =
      state.selectedAutocompleteItem || (await geocodeDestination(destinationText));

    state.destination = destination;
    updateDestinationMarker(destination.lat, destination.lng);

    await calculateAndRenderRoute(current, destination);

    saveHistory(destinationText);
    renderHistory();

    els.fromLabel.textContent = "Nuværende position";
    els.toLabel.textContent = destination.displayName;
    els.routeStatusLabel.textContent = "Rute klar";

    setGpsStatus(`GPS: klar (${Math.round(current.accuracy || 0)} m)`);
    setNavStatus("Navigation: rute klar");
    setMapMode("Kort: rute klar");
    setInfoMessage("Rute beregnet. Start live navigation for løbende GPS-opdatering.");

    els.startNavBtn.disabled = false;
  } catch (error) {
    console.error(error);
    setWarningMessage(getFriendlyError(error));
    setGpsStatus("GPS: fejl");
    setNavStatus("Navigation: fejl");
    setMapMode("Kort: fejl");
    resetSpeedState("Kunne ikke beregne rute.");
  } finally {
    els.calcRouteBtn.disabled = false;
  }
}

async function calculateAndRenderRoute(current, destination) {
  const routeData = await fetchRoute(
    current.lng,
    current.lat,
    destination.lng,
    destination.lat,
    state.settings.routeMode
  );

  state.routeData = routeData;
  state.speedCache.clear();
  state.speedLookupQueue.clear();
  state.lastObservationPoint = null;
  state.lastSpeeds = [];

  drawRoute(routeData.geometry.map(([lng, lat]) => [lat, lng]));
  fitRouteBounds();

  updateRouteSummary();

  setFuelLoadingMessage();
  await loadOsmFuelStationsForRoute(routeData.geometry);
  updateFuelBox();

  updateProgressUI(current);
  await updateSpeedForCurrentSegment();
  updateGreenWaveUI();
}

async function fetchRoute(fromLng, fromLat, toLng, toLat, mode) {
  const url =
    `https://router.project-osrm.org/route/v1/driving/${fromLng},${fromLat};${toLng},${toLat}` +
    "?overview=full&geometries=geojson&steps=true&alternatives=true&annotations=distance,duration";

  const res = await fetch(url);
  if (!res.ok) throw new Error("Kunne ikke hente rute.");

  const data = await res.json();
  if (!data.routes || !data.routes.length) throw new Error("Ingen rute fundet.");

  const selected =
    mode === "eco"
      ? data.routes.reduce((best, route) => (route.distance < best.distance ? route : best), data.routes[0])
      : data.routes.reduce((best, route) => (route.duration < best.duration ? route : best), data.routes[0]);

  return normalizeRoute(selected);
}

function normalizeRoute(route) {
  const steps = [];
  let cumulativeDistance = 0;

  route.legs.forEach((leg) => {
    leg.steps.forEach((step) => {
      const startDistance = cumulativeDistance;
      cumulativeDistance += step.distance;

      steps.push({
        ...step,
        startDistance,
        cumulativeDistance
      });
    });
  });

  return {
    distance: route.distance,
    duration: route.duration,
    geometry: route.geometry.coordinates,
    steps
  };
}

function setFuelLoadingMessage() {
  if (!state.settings.showFuelBox) return;

  els.fuelContent.innerHTML = `
    <div class="fuel-meta">
      Henter tankstationer fra OSM langs ruten …
    </div>
  `;
}

async function loadOsmFuelStationsForRoute(geometry) {
  try {
    const samplePoints = sampleRoutePointsForFuelSearch(geometry);

    if (!samplePoints.length) {
      state.osmFuelStations = [];
      return;
    }

    const queryParts = samplePoints.map((point) => {
      return `
        node(around:${OSM_FUEL_AROUND_METERS},${point.lat},${point.lng})["amenity"="fuel"];
        way(around:${OSM_FUEL_AROUND_METERS},${point.lat},${point.lng})["amenity"="fuel"];
      `;
    });

    const query = `
      [out:json][timeout:25];
      (
        ${queryParts.join("\n")}
      );
      out center tags;
    `;

    const response = await fetch("https://overpass-api.de/api/interpreter", {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=UTF-8" },
      body: query
    });

    if (!response.ok) throw new Error("OSM tankstationsopslag fejlede.");

    const data = await response.json();
    const elements = Array.isArray(data.elements) ? data.elements : [];

    state.osmFuelStations = dedupeFuelStations(
      elements
        .map(normalizeOsmFuelElement)
        .filter(Boolean)
        .map(applyPriceOverrideToOsmStation)
    );
  } catch (error) {
    console.warn(error);
    state.osmFuelStations = [];
    els.fuelContent.innerHTML = `
      <div class="fuel-meta">
        Kunne ikke hente tankstationer fra OSM lige nu. Prøv igen senere.
      </div>
    `;
  }
}

function sampleRoutePointsForFuelSearch(geometry) {
  if (!Array.isArray(geometry) || geometry.length === 0) return [];

  const points = [];

  for (let i = 0; i < geometry.length; i += OSM_FUEL_ROUTE_SAMPLE_EVERY) {
    const coord = geometry[i];
    points.push({ lng: coord[0], lat: coord[1] });
  }

  const last = geometry[geometry.length - 1];
  points.push({ lng: last[0], lat: last[1] });

  const deduped = [];
  const seen = new Set();

  points.forEach((point) => {
    const key = `${point.lat.toFixed(3)},${point.lng.toFixed(3)}`;
    if (!seen.has(key)) {
      seen.add(key);
      deduped.push(point);
    }
  });

  if (deduped.length <= OSM_FUEL_MAX_QUERY_POINTS) return deduped;

  const step = Math.ceil(deduped.length / OSM_FUEL_MAX_QUERY_POINTS);
  return deduped.filter((_, index) => index % step === 0).slice(0, OSM_FUEL_MAX_QUERY_POINTS);
}

function normalizeOsmFuelElement(element) {
  if (!element || !element.tags) return null;

  const lat = typeof element.lat === "number" ? element.lat : element.center?.lat;
  const lng = typeof element.lon === "number" ? element.lon : element.center?.lon;

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  const tags = element.tags;
  const brand = normalizeBrand(tags.brand || tags.operator || tags.name || "");
  const name = tags.name || tags.brand || tags.operator || "Tankstation";
  const address = buildOsmAddress(tags);

  return {
    id: `osm-${element.type}-${element.id}`,
    osmId: `${element.type}/${element.id}`,
    name,
    brand,
    address,
    city: extractCity(address),
    lat,
    lng,
    fuelType: state.settings.fuelType,
    price: null,
    currency: "DKK",
    unit: state.settings.fuelType === "electric" ? "kWh" : "liter",
    updatedAt: null,
    source: "OSM station + ingen prisdata",
    rawTags: tags
  };
}

function buildOsmAddress(tags) {
  const street = [tags["addr:street"], tags["addr:housenumber"]].filter(Boolean).join(" ");
  const city = [tags["addr:postcode"], tags["addr:city"]].filter(Boolean).join(" ");

  if (street && city) return `${street}, ${city}`;
  if (street) return street;
  if (city) return city;

  return "Adresse mangler i OSM";
}

function applyPriceOverrideToOsmStation(osmStation) {
  const match = findFuelPriceOverride(osmStation);

  if (!match) return osmStation;

  return {
    ...osmStation,
    price: match.price,
    currency: match.currency,
    unit: match.unit,
    updatedAt: match.updatedAt,
    source: match.source || "fuel-prices.json",
    priceMatched: true,
    priceMatchMode: match.matchMode || "ukendt"
  };
}

function findFuelPriceOverride(osmStation) {
  const fuelType = state.settings.fuelType;

  const candidates = state.fuelPriceOverrides.filter(
    (item) =>
      item.fuelType === fuelType &&
      typeof item.price === "number"
  );

  if (!candidates.length) return null;

  const osmBrand = normalizeBrand(osmStation.brand || osmStation.name || "");
  const osmName = normalizeText(osmStation.name || "");
  const osmCity = normalizeText(osmStation.city || extractCity(osmStation.address || ""));

  const scored = candidates
    .map((item) => {
      const itemBrand = normalizeBrand(item.brand || item.name || "");
      const itemName = normalizeText(item.name || "");
      const itemCity = normalizeText(item.city || extractCity(item.address || ""));

      let score = 0;

      if (osmBrand && itemBrand && osmBrand === itemBrand) score += 50;
      if (osmCity && itemCity && osmCity === itemCity) score += 35;

      if (osmName && itemName) {
        if (osmName === itemName) score += 40;
        else if (osmName.includes(itemName) || itemName.includes(osmName)) score += 25;
        else score += sharedWordScore(osmName, itemName);
      }

      return {
        ...item,
        matchScore: score,
        matchMode: "brand/navn/by"
      };
    })
    .filter((item) => item.matchScore >= 45)
    .sort((a, b) => {
      if (b.matchScore !== a.matchScore) return b.matchScore - a.matchScore;
      return a.price - b.price;
    });

  if (scored.length) return scored[0];

  const sameBrand = candidates
    .filter((item) => normalizeBrand(item.brand || item.name || "") === osmBrand)
    .sort((a, b) => a.price - b.price);

  if (sameBrand.length) {
    return {
      ...sameBrand[0],
      matchMode: "samme brand fallback"
    };
  }

  return null;
}

function sharedWordScore(a, b) {
  const aw = new Set(a.split(" ").filter((x) => x.length >= 3));
  const bw = new Set(b.split(" ").filter((x) => x.length >= 3));

  let count = 0;
  aw.forEach((word) => {
    if (bw.has(word)) count++;
  });

  return count * 8;
}

function dedupeFuelStations(stations) {
  const sorted = stations.slice().sort((a, b) => {
    const nameA = a.name || "";
    const nameB = b.name || "";
    return nameA.localeCompare(nameB);
  });

  const result = [];

  sorted.forEach((station) => {
    const duplicate = result.find((existing) => {
      return haversineMeters(station.lat, station.lng, existing.lat, existing.lng) < 35;
    });

    if (!duplicate) result.push(station);
  });

  return result;
}

function updateFuelBox() {
  if (!state.settings.showFuelBox) return;

  if (!state.routeData) {
    els.fuelContent.textContent = "Beregn en rute for at se billigste brændstof.";
    state.currentFuelStation = null;
    if (els.openFuelListBtn) els.openFuelListBtn.disabled = true;
    return;
  }

  if (!state.osmFuelStations.length) {
    els.fuelContent.innerHTML = `
      <div class="fuel-meta">
        Ingen OSM-tankstationer fundet langs ruten.
      </div>
    `;
    state.currentFuelStation = null;
    if (els.openFuelListBtn) els.openFuelListBtn.disabled = true;
    return;
  }

  const fuelCandidates = getFuelCandidatesOnRoute();

  if (!fuelCandidates.length) {
    els.fuelContent.innerHTML = `
      <div class="fuel-name">Ingen prisdata fundet</div>
      <div class="fuel-meta">Kan ikke afgøre billigste tank endnu.</div>
      <div class="fuel-meta">Stationer fundet langs ruten: ${state.osmFuelStations.length}</div>
      <div class="fuel-meta">Prisposter i fuel-prices.json: ${state.fuelPriceOverrides.length}</div>
    `;
    state.currentFuelStation = null;
    if (els.openFuelListBtn) els.openFuelListBtn.disabled = true;
    return;
  }

  const best = fuelCandidates.slice().sort((a, b) => {
    if (a.price !== b.price) return a.price - b.price;
    return a.extraDetourMeters - b.extraDetourMeters;
  })[0];

  state.currentFuelStation = best;
  if (els.openFuelListBtn) els.openFuelListBtn.disabled = false;

  const mapsLink = buildGoogleMapsFuelRouteLink(best);

  els.fuelContent.innerHTML = `
    <div class="fuel-name">${escapeHtml(best.name)}</div>

    <div class="fuel-price">
      ${best.price.toFixed(2).replace(".", ",")} kr/L
    </div>

    <div class="fuel-meta">
      📍 ${formatDistance(best.distanceToRouteMeters)} fra rute
    </div>

    <div class="fuel-meta">
      ↪ Omvej ${formatDistance(best.extraDetourMeters)}
    </div>

    <div class="fuel-meta">
      Match: ${escapeHtml(best.priceMatchMode || "prisdata")}
    </div>

    <div class="fuel-meta">
      ${fuelCandidates.length} stationer med pris / ${state.osmFuelStations.length} stationer fundet
    </div>

    <a class="fuel-link" href="${mapsLink}" target="_blank" rel="noopener noreferrer">
      Åbn via Google Maps
    </a>
  `;
}

function getFuelCandidatesOnRoute() {
  if (!state.routeData) return [];

  return state.osmFuelStations
    .filter((station) => typeof station.price === "number")
    .map((station) => {
      const distanceToRouteMeters = distanceToRouteMetersFromGeometry(
        { lat: station.lat, lng: station.lng },
        state.routeData.geometry
      );

      const extraDetourMeters = distanceToRouteMeters * 2;

      return {
        ...station,
        distanceToRouteMeters,
        extraDetourMeters
      };
    })
    .filter((station) => station.distanceToRouteMeters <= MAX_FUEL_DISTANCE_FROM_ROUTE_METERS)
    .filter((station) => station.extraDetourMeters <= state.settings.maxDetourMeters);
}

function renderFuelList() {
  const candidates = getFuelCandidatesOnRoute();

  if (!state.routeData || !state.destination) {
    els.fuelListContent.innerHTML = `
      <div class="fuel-list-empty">Beregn en rute først.</div>
    `;
    return;
  }

  if (!candidates.length) {
    els.fuelListContent.innerHTML = `
      <div class="fuel-list-empty">
        Ingen tankstationer med kendt pris inden for den valgte omvej.
      </div>
    `;
    return;
  }

  const sorted = candidates.slice().sort((a, b) => {
    if (state.fuelListSort === "detour") {
      if (a.extraDetourMeters !== b.extraDetourMeters) {
        return a.extraDetourMeters - b.extraDetourMeters;
      }
      return a.price - b.price;
    }

    if (a.price !== b.price) return a.price - b.price;
    return a.extraDetourMeters - b.extraDetourMeters;
  }).slice(0, 10);

  els.sortFuelByPriceBtn.classList.toggle("btn-primary", state.fuelListSort === "price");
  els.sortFuelByPriceBtn.classList.toggle("btn-muted", state.fuelListSort !== "price");
  els.sortFuelByDetourBtn.classList.toggle("btn-primary", state.fuelListSort === "detour");
  els.sortFuelByDetourBtn.classList.toggle("btn-muted", state.fuelListSort !== "detour");

  els.fuelListContent.innerHTML = sorted.map((station, index) => {
    const mapsLink = buildGoogleMapsFuelRouteLink(station);

    return `
      <article class="fuel-list-item">
        <div class="fuel-list-item-top">
          <div>
            <div class="fuel-list-name">${index + 1}. ${escapeHtml(station.name)}</div>
            <div class="fuel-list-brand">${escapeHtml(station.brand || "Ukendt kæde")}</div>
          </div>
          <div class="fuel-list-price">${station.price.toFixed(2).replace(".", ",")} kr/L</div>
        </div>

        <div class="fuel-list-meta-grid">
          <div class="fuel-list-meta">Omvej<br><strong>${formatDistance(station.extraDetourMeters)}</strong></div>
          <div class="fuel-list-meta">Fra rute<br><strong>${formatDistance(station.distanceToRouteMeters)}</strong></div>
          <div class="fuel-list-meta">Match<br><strong>${escapeHtml(station.priceMatchMode || "prisdata")}</strong></div>
          <div class="fuel-list-meta">Kilde<br><strong>${escapeHtml(station.source || "fuel-prices.json")}</strong></div>
        </div>

        <div class="fuel-list-actions">
          <a class="fuel-list-map-link" href="${mapsLink}" target="_blank" rel="noopener noreferrer">
            Åbn via Google Maps
          </a>
        </div>
      </article>
    `;
  }).join("");
}

function buildGoogleMapsFuelRouteLink(station) {
  const origin = state.currentPosition
    ? `${state.currentPosition.lat},${state.currentPosition.lng}`
    : "";

  const waypoint = `${station.lat},${station.lng}`;
  const destination = state.destination
    ? `${state.destination.lat},${state.destination.lng}`
    : waypoint;

  const params = new URLSearchParams({
    api: "1",
    destination,
    travelmode: "driving"
  });

  if (origin) params.set("origin", origin);
  params.set("waypoints", waypoint);

  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

function findBestFuelStationNearRoute(geometry) {
  return getFuelCandidatesOnRoute()
    .sort((a, b) => {
      if (a.price !== b.price) return a.price - b.price;
      return a.extraDetourMeters - b.extraDetourMeters;
    })[0] || null;
}

async function startLiveNavigation() {
  if (!state.routeData || !state.destination) {
    setWarningMessage("Beregn en rute først.");
    return;
  }

  if (state.watchId !== null) {
    navigator.geolocation.clearWatch(state.watchId);
    state.watchId = null;
  }

  state.navActive = true;
  state.cameraLock = false;

  document.body.classList.add("navigation-active");
  els.navOverlay.classList.remove("hidden");

  setNavStatus("Navigation: live");
  setMapMode("Kort: live");
  setInfoMessage("Live navigation startet.");

  els.startNavBtn.disabled = true;
  els.stopNavBtn.disabled = false;

  await requestWakeLock();
  startWakeLockMaintenance();

  setTimeout(() => {
    state.map.invalidateSize();
    if (state.currentPosition) updateNavigationCamera(state.currentPosition);
  }, 120);

  state.watchId = navigator.geolocation.watchPosition(
    async (position) => {
      const current = positionToSimple(position);
      state.currentPosition = current;

      updateUserMarker(current.lat, current.lng);
      updateCurrentSpeed(current);
      updateProgressUI(current);
      updateHeading(current);
      updateNavigationCamera(current);

      registerObservation(current, state.currentActualSpeedKmh);
      updateGreenWaveUI();

      await updateSpeedForCurrentSegment();
      renderRecommendedSpeedState();
      await maybeReroute(current);
      updateArrivalState(current);

      setGpsStatus(`GPS: live (${Math.round(current.accuracy || 0)} m)`);
    },
    (error) => {
      console.error(error);
      setWarningMessage(`GPS-fejl: ${error.message}`);
      setGpsStatus("GPS: live fejl");
    },
    {
      enableHighAccuracy: true,
      timeout: 15000,
      maximumAge: 500
    }
  );
}

function stopLiveNavigation() {
  if (state.watchId !== null) {
    navigator.geolocation.clearWatch(state.watchId);
    state.watchId = null;
  }

  state.navActive = false;

  stopWakeLockMaintenance();
  releaseWakeLock();

  document.body.classList.remove("navigation-active");
  els.navOverlay.classList.add("hidden");
  resetMapRotation();

  els.startNavBtn.disabled = !state.routeData;
  els.stopNavBtn.disabled = true;

  setNavStatus("Navigation: stoppet");
  setMapMode("Kort: klar");
  setInfoMessage("Live navigation stoppet.");

  setTimeout(() => {
    state.map.invalidateSize();
    if (state.routeLine) fitRouteBounds();
  }, 120);
}

function updateProgressUI(current) {
  if (!state.routeData) {
    els.nextInstructionValue.textContent = "Ingen rute endnu";
    els.nextInstructionNote.textContent = "—";
    return;
  }

  const progress = estimateProgressAlongRoute(current, state.routeData.geometry);
  progress.activeStepIndex = findActiveStepIndex(progress.distanceAlongRoute, state.routeData.steps);
  state.currentProgress = progress;

  updateRemainingDistance(progress);
  updateNextInstruction(progress);
  updateNavBanner(progress.activeStepIndex);
}

function updateRemainingDistance(progress) {
  const remainingDistance = Math.max(0, state.routeData.distance - progress.distanceAlongRoute);
  const ratio = state.routeData.distance > 0 ? remainingDistance / state.routeData.distance : 0;
  const remainingTime = state.routeData.duration * ratio;

  const distanceText = formatDistance(remainingDistance);
  const timeText = formatDuration(remainingTime);

  els.remainingDistanceValue.textContent = distanceText;
  els.remainingDistanceNote.textContent = timeText;
  els.driveRemainingDistance.textContent = distanceText;
  els.driveRemainingTime.textContent = timeText;
}

function updateNextInstruction(progress) {
  const nextStep = state.routeData.steps.find(
    (step) => step.cumulativeDistance > progress.distanceAlongRoute
  );

  if (!nextStep) {
    els.nextInstructionValue.textContent = "Fortsæt mod destinationen";
    els.nextInstructionNote.textContent = "Sidste del af ruten";
    return;
  }

  const metersToStep = Math.max(0, nextStep.cumulativeDistance - progress.distanceAlongRoute);

  els.nextInstructionValue.textContent = buildInstructionText(nextStep);
  els.nextInstructionNote.textContent = `${formatDistance(metersToStep)} til næste manøvre`;
}

function updateNavBanner(stepIndex) {
  const step = state.routeData?.steps?.[stepIndex];

  if (!step) {
    els.navBannerMain.textContent = "Ingen aktiv navigation";
    els.navBannerSub.textContent = "—";
    return;
  }

  els.navBannerMain.textContent = buildInstructionText(step);
  els.navBannerSub.textContent = els.nextInstructionNote.textContent || "—";
}

async function updateSpeedForCurrentSegment() {
  if (!state.routeData) {
    resetSpeedState("Ingen aktiv rute.");
    return;
  }

  const step = state.routeData.steps[state.currentProgress.activeStepIndex];

  if (!step) {
    resetSpeedState("Aktivt segment mangler.");
    return;
  }

  const coord = getStepReferenceCoordinate(step);

  if (!coord) {
    resetSpeedState("Segment mangler koordinat.");
    return;
  }

  const cacheKey = `${coord.lat.toFixed(5)},${coord.lng.toFixed(5)}`;

  if (state.speedCache.has(cacheKey)) {
    state.currentSpeedLimit = state.speedCache.get(cacheKey);
    renderSpeedState();
    renderRecommendedSpeedState();
    return;
  }

  if (state.speedLookupQueue.has(cacheKey)) return;

  state.speedLookupQueue.add(cacheKey);

  try {
    const result = await lookupSpeedLimit(coord.lat, coord.lng, step);
    state.speedCache.set(cacheKey, result);
    state.currentSpeedLimit = result;
  } catch (error) {
    console.warn(error);
    state.currentSpeedLimit = {
      value: null,
      source: "ukendt",
      confidence: "lav",
      note: "Opslag fejlede.",
      roadName: step.name || "—"
    };
  } finally {
    state.speedLookupQueue.delete(cacheKey);
  }

  renderSpeedState();
  renderRecommendedSpeedState();
}

function getStepReferenceCoordinate(step) {
  if (Array.isArray(step.maneuver?.location)) {
    return {
      lng: step.maneuver.location[0],
      lat: step.maneuver.location[1]
    };
  }

  if (Array.isArray(state.routeData?.geometry?.[state.currentProgress.closestIndex])) {
    const coord = state.routeData.geometry[state.currentProgress.closestIndex];
    return {
      lng: coord[0],
      lat: coord[1]
    };
  }

  return null;
}

async function lookupSpeedLimit(lat, lng, step) {
  if (state.settings.useOsmSpeed) {
    const osm = await lookupOsmMaxspeed(lat, lng);

    if (osm.value !== null) {
      return {
        value: osm.value,
        source: "OSM maxspeed",
        confidence: "middel",
        note: "Fundet via OSM maxspeed. Ikke myndighedsbekræftet.",
        roadName: step.name || osm.roadName || "—"
      };
    }
  }

  if (state.settings.allowRoadTypeFallback) {
    const fallback = inferCarefulRoadTypeFallback(step);

    if (fallback.value !== null) {
      return {
        value: fallback.value,
        source: "vejtype-fallback",
        confidence: "lav",
        note: fallback.note,
        roadName: step.name || "—"
      };
    }
  }

  return {
    value: null,
    source: "ukendt",
    confidence: "ukendt",
    note: "Ingen sikker fartgrænse fundet. Viser derfor ukendt.",
    roadName: step.name || "—"
  };
}

async function lookupOsmMaxspeed(lat, lng) {
  const query = `
    [out:json][timeout:12];
    way(around:25,${lat},${lng})["highway"]["maxspeed"];
    out tags center;
  `;

  const res = await fetch("https://overpass-api.de/api/interpreter", {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=UTF-8" },
    body: query
  });

  if (!res.ok) return { value: null, roadName: null };

  const data = await res.json();
  const elements = Array.isArray(data.elements) ? data.elements : [];

  const candidates = elements
    .map((el) => {
      const value = parseMaxspeed(el.tags?.maxspeed);
      const centerLat = el.center?.lat;
      const centerLng = el.center?.lon;
      const distance =
        typeof centerLat === "number" && typeof centerLng === "number"
          ? haversineMeters(lat, lng, centerLat, centerLng)
          : Number.POSITIVE_INFINITY;

      return {
        value,
        distance,
        roadName: el.tags?.name || null
      };
    })
    .filter((item) => item.value !== null)
    .sort((a, b) => a.distance - b.distance);

  if (!candidates.length) return { value: null, roadName: null };

  const close = candidates.filter((item) => item.distance <= 30).slice(0, 3);
  const unique = [...new Set(close.map((item) => item.value))];

  if (unique.length !== 1) return { value: null, roadName: close[0]?.roadName || null };

  return {
    value: unique[0],
    roadName: close[0]?.roadName || null
  };
}

function parseMaxspeed(raw) {
  const value = String(raw || "").trim().toLowerCase();

  if (/^\d{1,3}$/.test(value)) {
    const num = Number(value);
    if (num >= 5 && num <= 140) return num;
  }

  return null;
}

function inferCarefulRoadTypeFallback(step) {
  const road = String(step.name || "").toLowerCase();
  const destinations = JSON.stringify(step.destinations || "").toLowerCase();

  if (road.includes("motorvej") || destinations.includes("motorvej")) {
    return {
      value: 130,
      note: "Forsigtigt estimat baseret på motorvejs-indikation. Ikke bekræftet."
    };
  }

  return {
    value: null,
    note: "Ingen sikker vejtype-fallback."
  };
}

function resetSpeedState(note) {
  state.currentSpeedLimit = {
    value: null,
    source: "ukendt",
    confidence: "ukendt",
    note,
    roadName: "—"
  };

  renderSpeedState();
  renderRecommendedSpeedState();
}

function renderSpeedState() {
  const limit = state.currentSpeedLimit;

  els.speedLimitValue.textContent = limit.value === null ? "ukendt" : `${limit.value} km/t`;
  els.driveMaxValue.textContent = limit.value === null ? "ukendt" : `${limit.value}`;

  els.speedLimitNote.textContent = limit.note;
  els.speedSourceValue.textContent = limit.source;
  els.speedConfidenceValue.textContent = limit.confidence;
  els.speedSegmentValue.textContent = limit.roadName || "—";
}

function renderRecommendedSpeedState() {
  const limit = state.currentSpeedLimit.value;
  const actual = state.currentActualSpeedKmh;

  els.recommendedSpeedCard.classList.remove("warning");
  els.driveRecommendedCard.classList.remove("warning");

  if (typeof limit !== "number") {
    els.recommendedSpeedValue.textContent = "ukendt";
    els.recommendedSpeedNote.textContent = "Kræver kendt fartgrænse.";
    els.driveRecommendedValue.textContent = "ukendt";
    return;
  }

  const recommended = calculateRecommendedSpeed(limit);

  els.recommendedSpeedValue.textContent = `${recommended} km/t`;
  els.driveRecommendedValue.textContent = `${recommended}`;
  els.recommendedSpeedNote.textContent = "Konservativ anbefaling baseret på aktuel rute og fartgrænse.";

  if (typeof actual === "number" && actual > limit) {
    els.recommendedSpeedCard.classList.add("warning");
    els.driveRecommendedCard.classList.add("warning");
  }
}

function calculateRecommendedSpeed(limit) {
  const step = state.routeData?.steps?.[state.currentProgress.activeStepIndex];
  const metersToStep = extractMetersToNextStep();

  if (!step || !Number.isFinite(metersToStep)) return limit;

  const floor = getManeuverAdvisoryFloor(step);

  if (floor >= limit) return limit;
  if (metersToStep > 500) return limit;
  if (metersToStep <= 50) return floor;

  const ratio = (metersToStep - 50) / 450;
  const value = floor + (limit - floor) * ratio;

  return Math.max(floor, Math.min(limit, Math.round(value / 5) * 5));
}

function getManeuverAdvisoryFloor(step) {
  const type = step.maneuver?.type || "";
  const modifier = step.maneuver?.modifier || "";

  if (type === "roundabout") return 25;
  if (type === "off ramp") return 30;

  if (type === "turn") {
    if (modifier === "sharp left" || modifier === "sharp right" || modifier === "uturn") return 20;
    if (modifier === "left" || modifier === "right") return 30;
    if (modifier === "slight left" || modifier === "slight right") return 40;
  }

  return 999;
}

function extractMetersToNextStep() {
  const text = els.nextInstructionNote.textContent || "";

  const kmMatch = text.match(/([\d.,]+)\s*km/i);
  if (kmMatch) return Number(kmMatch[1].replace(",", ".")) * 1000;

  const mMatch = text.match(/(\d+)\s*m/i);
  if (mMatch) return Number(mMatch[1]);

  return null;
}

function updateCurrentSpeed(current) {
  if (typeof current.speed === "number" && current.speed >= 0) {
    const kmh = Math.round(current.speed * 3.6);
    state.currentActualSpeedKmh = kmh;

    els.currentSpeedValue.textContent = `${kmh} km/t`;
    els.currentSpeedNote.textContent = "GPS-baseret";
    els.driveCurrentValue.textContent = `${kmh}`;
  } else {
    state.currentActualSpeedKmh = null;

    els.currentSpeedValue.textContent = "ukendt";
    els.currentSpeedNote.textContent = "GPS gav ingen hastighed";
    els.driveCurrentValue.textContent = "ukendt";
  }
}

function updateHeading(current) {
  if (!state.settings.headingUp) return;

  const gpsHeading =
    typeof current.heading === "number" && !Number.isNaN(current.heading)
      ? normalizeDegrees(current.heading)
      : estimateBearingFromRoute();

  if (gpsHeading === null) return;

  state.currentHeadingDeg = gpsHeading;
  state.smoothedHeadingDeg = lerpAngle(state.smoothedHeadingDeg || gpsHeading, gpsHeading, 0.18);

  applyMapRotation();
}

function estimateBearingFromRoute() {
  if (!state.routeData?.geometry?.length) return null;

  const idx = state.currentProgress.closestIndex || 0;
  const nextIdx = Math.min(idx + 4, state.routeData.geometry.length - 1);

  const from = state.routeData.geometry[idx];
  const to = state.routeData.geometry[nextIdx];

  if (!from || !to) return null;

  return bearingBetween(from[1], from[0], to[1], to[0]);
}

function applyMapRotation() {
  if (!state.navActive || !state.settings.headingUp) return;
  els.mapRotationInner.style.transform = `rotate(${-state.smoothedHeadingDeg}deg)`;
}

function resetMapRotation() {
  els.mapRotationInner.style.transform = "rotate(0deg)";
}

function updateNavigationCamera(current) {
  const speed = typeof state.currentActualSpeedKmh === "number" ? state.currentActualSpeedKmh : 0;

  let zoom = 17;
  if (speed > 90) zoom = 15.25;
  else if (speed > 60) zoom = 16;
  else if (speed > 30) zoom = 16.5;

  if (!state.cameraLock) {
    state.map.setView([current.lat, current.lng], zoom, {
      animate: state.settings.smoothNavigation,
      duration: 0.8
    });
    state.cameraLock = true;
    return;
  }

  if (state.settings.smoothNavigation) {
    state.map.flyTo([current.lat, current.lng], zoom, {
      animate: true,
      duration: 0.8
    });
  } else {
    state.map.setView([current.lat, current.lng], zoom, { animate: false });
  }
}

async function maybeReroute(current) {
  if (!state.routeData || state.recalculating) return;

  const offRouteMeters = distanceToRouteMeters(current, state.routeData.geometry);
  const now = Date.now();

  if (offRouteMeters > 120 && now - state.lastRerouteAt > 12000) {
    state.recalculating = true;
    state.lastRerouteAt = now;

    setWarningMessage(`Du er ca. ${formatDistance(offRouteMeters)} fra ruten. Genberegner …`);

    try {
      await calculateAndRenderRoute(current, state.destination);
      setSuccessMessage("Ny rute beregnet.");
    } catch (error) {
      console.error(error);
      setWarningMessage("Kunne ikke genberegne ruten lige nu.");
    } finally {
      state.recalculating = false;
    }
  }
}

function updateArrivalState(current) {
  if (!state.destination) return;

  const distance = haversineMeters(
    current.lat,
    current.lng,
    state.destination.lat,
    state.destination.lng
  );

  if (distance <= 35) {
    els.routeStatusLabel.textContent = "Ankommet";
    els.nextInstructionValue.textContent = "Du er fremme";
    els.nextInstructionNote.textContent = "Destination nået";
    els.navBannerMain.textContent = "Du er fremme";
    els.navBannerSub.textContent = "Destination nået";
    els.remainingDistanceValue.textContent = "0 m";
    els.remainingDistanceNote.textContent = "0 min";
    els.driveRemainingDistance.textContent = "0 m";
    els.driveRemainingTime.textContent = "0 min";
    setSuccessMessage("Du er ankommet.");
  }
}

function registerObservation(current, speedKmh) {
  if (!state.routeData || typeof speedKmh !== "number") return;

  const step = state.routeData.steps[state.currentProgress.activeStepIndex];
  const coord = step?.maneuver?.location;

  if (!coord) return;

  const lat = coord[1];
  const lng = coord[0];
  const distance = haversineMeters(current.lat, current.lng, lat, lng);

  if (distance > 40) return;

  if (
    state.lastObservationPoint &&
    haversineMeters(state.lastObservationPoint.lat, state.lastObservationPoint.lng, lat, lng) < 30
  ) {
    return;
  }

  const stopped = detectStop(speedKmh);

  const obs = {
    lat,
    lng,
    timeSlot: getTimeSlot(),
    stopped,
    speedKmh,
    timestamp: Date.now()
  };

  const list = getObservations();
  list.push(obs);
  localStorage.setItem(OBS_KEY, JSON.stringify(list));

  state.lastObservationPoint = { lat, lng };

  refreshObservationUI();
}

function detectStop(speedKmh) {
  state.lastSpeeds.push(speedKmh);
  if (state.lastSpeeds.length > 5) state.lastSpeeds.shift();

  const avg = state.lastSpeeds.reduce((sum, value) => sum + value, 0) / state.lastSpeeds.length;
  return avg < 5;
}

function getObservations() {
  try {
    return JSON.parse(localStorage.getItem(OBS_KEY) || "[]");
  } catch {
    return [];
  }
}

function refreshObservationUI() {
  const observations = getObservations();

  els.observationCountLabel.textContent = String(observations.length);
  els.driveObservationCount.textContent = String(observations.length);
  els.timeSlotLabel.textContent = getTimeSlot();
  els.driveTimeSlot.textContent = getTimeSlot();

  const stats = getCurrentStopPattern();
  els.stopPatternLabel.textContent = stats;
}

function getCurrentStopPattern() {
  if (!state.routeData) return "ikke nok data";

  const step = state.routeData.steps[state.currentProgress.activeStepIndex];
  const coord = step?.maneuver?.location;

  if (!coord) return "ikke nok data";

  const observations = getObservations().filter((obs) => {
    return (
      obs.timeSlot === getTimeSlot() &&
      haversineMeters(obs.lat, obs.lng, coord[1], coord[0]) < 50
    );
  });

  if (observations.length < 3) return "ikke nok data";

  const stops = observations.filter((obs) => obs.stopped).length;
  const ratio = stops / observations.length;

  if (ratio > 0.7) return "ofte stop";
  if (ratio < 0.3) return "ofte grønt";
  return "ustabilt";
}

function updateGreenWaveUI() {
  const status = getCurrentStopPattern();

  els.greenWaveSummary.textContent = status;
  els.driveGreenWaveStatus.textContent = status;
}

function handleAddFuelStop() {
  if (!state.currentFuelStation) {
    setWarningMessage("Ingen billig station med pris klar endnu.");
    return;
  }

  stopLiveNavigation();

  state.selectedAutocompleteItem = {
    lat: state.currentFuelStation.lat,
    lng: state.currentFuelStation.lng,
    displayName: state.currentFuelStation.address
  };

  els.destinationInput.value =
    state.currentFuelStation.address !== "Adresse mangler i OSM"
      ? state.currentFuelStation.address
      : `${state.currentFuelStation.lat},${state.currentFuelStation.lng}`;

  setInfoMessage("Billigste station med pris er sat som destination. Beregn ruten igen.");
}

function drawRoute(latLngs) {
  if (state.routeLine) state.map.removeLayer(state.routeLine);

  state.routeLine = L.polyline(latLngs, {
    color: "#5ea2ff",
    weight: 6,
    opacity: 0.92,
    lineJoin: "round"
  }).addTo(state.map);
}

function fitRouteBounds() {
  if (!state.routeLine) return;
  state.map.fitBounds(state.routeLine.getBounds(), { padding: [30, 30] });
}

function recenterMap() {
  if (state.navActive && state.currentPosition) {
    updateNavigationCamera(state.currentPosition);
    return;
  }

  if (state.routeLine) {
    fitRouteBounds();
    return;
  }

  if (state.currentPosition) {
    state.map.setView([state.currentPosition.lat, state.currentPosition.lng], 15);
  }
}

function updateUserMarker(lat, lng) {
  const icon = L.divIcon({
    className: "",
    html: `<div class="user-marker-dot"></div>`,
    iconSize: [22, 22],
    iconAnchor: [11, 11]
  });

  if (!state.userMarker) {
    state.userMarker = L.marker([lat, lng], { icon }).addTo(state.map);
  } else {
    state.userMarker.setLatLng([lat, lng]);
  }
}

function updateDestinationMarker(lat, lng) {
  const icon = L.divIcon({
    className: "",
    html: `<div class="dest-marker-dot"></div>`,
    iconSize: [20, 20],
    iconAnchor: [10, 10]
  });

  if (!state.destMarker) {
    state.destMarker = L.marker([lat, lng], { icon }).addTo(state.map);
  } else {
    state.destMarker.setLatLng([lat, lng]);
  }
}

function renderRouteSummary() {
  if (!state.routeData) {
    els.routeModeSummary.textContent = state.settings.routeMode === "fast" ? "Hurtigst" : "Mest økonomisk";
    return;
  }

  els.routeModeSummary.textContent = state.settings.routeMode === "fast" ? "Hurtigst" : "Mest økonomisk";
  els.routeDistanceLabel.textContent = formatDistance(state.routeData.distance);
  els.routeDurationLabel.textContent = formatDuration(state.routeData.duration);
}

function updateRouteSummary() {
  renderRouteSummary();
}

async function geocodeDestination(query) {
  const url =
    "https://nominatim.openstreetmap.org/search" +
    `?format=jsonv2&limit=1&addressdetails=1&countrycodes=dk&q=${encodeURIComponent(query)}`;

  const res = await fetch(url, { headers: { Accept: "application/json" } });

  if (!res.ok) throw new Error("Kunne ikke søge destination.");

  const data = await res.json();

  if (!Array.isArray(data) || !data.length) {
    throw new Error("Destination ikke fundet.");
  }

  return {
    lat: Number(data[0].lat),
    lng: Number(data[0].lon),
    displayName: data[0].display_name
  };
}

function saveHistory(destination) {
  const current = getHistory();
  const next = [destination, ...current.filter((item) => item !== destination)].slice(0, 5);
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
  const history = getHistory();
  els.historyList.innerHTML = "";

  if (!history.length) {
    els.historyBox.classList.add("hidden");
    return;
  }

  history.forEach((item) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "history-chip";
    button.textContent = item;
    button.addEventListener("click", () => {
      els.destinationInput.value = item;
      state.selectedAutocompleteItem = null;
      els.historyBox.classList.add("hidden");
    });
    els.historyList.appendChild(button);
  });
}

async function requestWakeLock() {
  if (!("wakeLock" in navigator)) {
    updateWakeLockStatus("ikke understøttet");
    return;
  }

  try {
    if (!state.wakeLock) {
      state.wakeLock = await navigator.wakeLock.request("screen");
      updateWakeLockStatus("aktiv");

      state.wakeLock.addEventListener?.("release", async () => {
        state.wakeLock = null;
        updateWakeLockStatus("tabt");

        if (state.navActive) {
          await requestWakeLock();
        }
      });
    } else {
      updateWakeLockStatus("aktiv");
    }
  } catch (error) {
    console.warn(error);
    updateWakeLockStatus("fejl");
  }
}

async function releaseWakeLock() {
  try {
    if (state.wakeLock) {
      await state.wakeLock.release();
      state.wakeLock = null;
    }
  } catch (error) {
    console.warn(error);
  } finally {
    updateWakeLockStatus("inaktiv");
  }
}

function startWakeLockMaintenance() {
  stopWakeLockMaintenance();

  state.wakeLockIntervalId = setInterval(async () => {
    if (state.navActive) {
      await requestWakeLock();
    }
  }, 15000);
}

function stopWakeLockMaintenance() {
  if (state.wakeLockIntervalId !== null) {
    clearInterval(state.wakeLockIntervalId);
    state.wakeLockIntervalId = null;
  }
}

function updateWakeLockStatus(text) {
  els.wakeLockStatus.textContent = text || (state.wakeLock ? "aktiv" : "inaktiv");
}

function estimateProgressAlongRoute(current, geometry) {
  if (!geometry || geometry.length < 2) {
    return {
      closestIndex: 0,
      distanceAlongRoute: 0,
      activeStepIndex: 0
    };
  }

  let closestIndex = 0;
  let closestDistance = Number.POSITIVE_INFINITY;

  for (let i = 0; i < geometry.length; i++) {
    const [lng, lat] = geometry[i];
    const d = haversineMeters(current.lat, current.lng, lat, lng);

    if (d < closestDistance) {
      closestDistance = d;
      closestIndex = i;
    }
  }

  let distanceAlongRoute = 0;

  for (let i = 1; i <= closestIndex; i++) {
    const [lng1, lat1] = geometry[i - 1];
    const [lng2, lat2] = geometry[i];
    distanceAlongRoute += haversineMeters(lat1, lng1, lat2, lng2);
  }

  return {
    closestIndex,
    distanceAlongRoute,
    activeStepIndex: 0
  };
}

function findActiveStepIndex(distanceAlongRoute, steps) {
  if (!steps?.length) return 0;

  const index = steps.findIndex(
    (step) => distanceAlongRoute >= step.startDistance && distanceAlongRoute < step.cumulativeDistance
  );

  return index >= 0 ? index : steps.length - 1;
}

function distanceToRouteMeters(current, geometry) {
  return distanceToRouteMetersFromGeometry(current, geometry);
}

function distanceToRouteMetersFromGeometry(point, geometry) {
  if (!geometry || geometry.length < 2) return Number.POSITIVE_INFINITY;

  let minDistance = Number.POSITIVE_INFINITY;

  for (let i = 1; i < geometry.length; i++) {
    const a = { lng: geometry[i - 1][0], lat: geometry[i - 1][1] };
    const b = { lng: geometry[i][0], lat: geometry[i][1] };
    const d = pointToSegmentDistanceMeters(point, a, b);

    if (d < minDistance) minDistance = d;
  }

  return minDistance;
}

function pointToSegmentDistanceMeters(point, a, b) {
  const meanLatRad = ((point.lat + a.lat + b.lat) / 3) * Math.PI / 180;

  const metersPerDegLat = 111320;
  const metersPerDegLng = 111320 * Math.cos(meanLatRad);

  const px = point.lng * metersPerDegLng;
  const py = point.lat * metersPerDegLat;

  const ax = a.lng * metersPerDegLng;
  const ay = a.lat * metersPerDegLat;

  const bx = b.lng * metersPerDegLng;
  const by = b.lat * metersPerDegLat;

  const dx = bx - ax;
  const dy = by - ay;

  if (dx === 0 && dy === 0) {
    return Math.hypot(px - ax, py - ay);
  }

  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));

  const cx = ax + t * dx;
  const cy = ay + t * dy;

  return Math.hypot(px - cx, py - cy);
}

function haversineMeters(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const toRad = (deg) => deg * Math.PI / 180;

  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLng / 2) ** 2;

  return 2 * R * Math.asin(Math.sqrt(a));
}

function bearingBetween(lat1, lng1, lat2, lng2) {
  const toRad = (deg) => deg * Math.PI / 180;
  const toDeg = (rad) => rad * 180 / Math.PI;

  const y = Math.sin(toRad(lng2 - lng1)) * Math.cos(toRad(lat2));

  const x =
    Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
    Math.sin(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.cos(toRad(lng2 - lng1));

  return normalizeDegrees(toDeg(Math.atan2(y, x)));
}

function normalizeDegrees(deg) {
  let out = deg % 360;
  if (out < 0) out += 360;
  return out;
}

function lerpAngle(from, to, amount) {
  const delta = ((to - from + 540) % 360) - 180;
  return normalizeDegrees(from + delta * amount);
}

function buildInstructionText(step) {
  const type = step.maneuver?.type || "";
  const modifier = step.maneuver?.modifier || "";
  const name = step.name ? ` ad ${step.name}` : "";

  if (type === "arrive") return "Ankomst ved destination";
  if (type === "depart") return `Start${name}`;
  if (type === "roundabout") return `Kør i rundkørsel${name}`;
  if (type === "merge") return `Flet${name}`;
  if (type === "on ramp") return `Kør på tilkørsel${name}`;
  if (type === "off ramp") return `Tag frakørsel${name}`;
  if (type === "fork") return `Hold retning${name}`;

  if (type === "turn") {
    const map = {
      left: "Drej til venstre",
      right: "Drej til højre",
      straight: "Fortsæt ligeud",
      "slight left": "Hold let til venstre",
      "slight right": "Hold let til højre",
      "sharp left": "Skarpt til venstre",
      "sharp right": "Skarpt til højre",
      uturn: "Foretag vending"
    };

    return `${map[modifier] || "Drej"}${name}`;
  }

  if (type === "new name" || type === "continue") return `Fortsæt${name}`;

  return step.name ? `Følg ${step.name}` : "Fortsæt på ruten";
}

function getTimeSlot() {
  const now = new Date();
  const h = String(now.getHours()).padStart(2, "0");
  const m = now.getMinutes() < 30 ? "00" : "30";
  return `${h}:${m}`;
}

function formatDistance(meters) {
  if (!Number.isFinite(meters)) return "—";
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(1).replace(".", ",")} km`;
}

function formatDuration(seconds) {
  if (!Number.isFinite(seconds)) return "—";

  const totalMinutes = Math.round(seconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours === 0) return `${minutes} min`;
  return `${hours} t ${minutes} min`;
}

function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
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
  if (text === "ok" || text.includes(" ok ") || text.startsWith("ok ")) return "ok";
  if (text.includes("q8")) return "q8";
  if (text.includes("shell")) return "shell";
  if (text.includes("go on") || text.includes("goon")) return "goon";
  if (text.includes("oil")) return "oil";

  return text;
}

function extractCity(value) {
  const text = String(value || "").trim();
  const parts = text.split(",").map((part) => part.trim()).filter(Boolean);

  if (parts.length >= 2) {
    const last = parts[parts.length - 1];
    return last.replace(/^\d{4}\s*/, "").trim();
  }

  return text.replace(/^\d{4}\s*/, "").trim();
}

function getFriendlyError(error) {
  if (!error) return "Ukendt fejl.";

  if (error.code === 1) return "Adgang til position blev afvist.";
  if (error.code === 2) return "Position kunne ikke bestemmes.";
  if (error.code === 3) return "Timeout ved hentning af position.";

  return error.message || "Noget gik galt.";
}

function setGpsStatus(text) {
  els.gpsStatusChip.textContent = text;
}

function setNavStatus(text) {
  els.navStatusChip.textContent = text;
}

function setMapMode(text) {
  els.mapModeLabel.textContent = text;
}

function setInfoMessage(text) {
  els.navMessage.className = "notice info large";
  els.navMessage.textContent = text;
}

function setSuccessMessage(text) {
  els.navMessage.className = "notice success large";
  els.navMessage.textContent = text;
}

function setWarningMessage(text) {
  els.navMessage.className = "notice warning large";
  els.navMessage.textContent = text;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function positionToSimple(pos) {
  return {
    lat: pos.coords.latitude,
    lng: pos.coords.longitude,
    accuracy: pos.coords.accuracy,
    heading: pos.coords.heading,
    speed: pos.coords.speed
  };
}

function getCurrentPosition() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("Geolocation understøttes ikke i denne browser."));
      return;
    }

    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      maximumAge: 0,
      timeout: 15000
    });
  });
}
