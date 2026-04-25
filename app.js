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

  watchId: null,

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

const SETTINGS_KEY = "greenwave_settings_radius_v1";
const HISTORY_KEY = "greenwave_history_radius_v1";
const PRICE_HISTORY_KEY = "greenwave_price_history_radius_v1";
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
  "navBannerMain",
  "navBannerSub",
  "driveRemainingDistance",
  "driveRemainingTime",
  "driveCurrentValue",

  "titleText",
  "subtitleText",
  "destinationLabel",
  "historyTitle",
  "fuelPanelTitle",
  "settingsTitle",
  "languageTitle",
  "regionTitle",
  "regionNote",
  "routeTitle",
  "routeFastText",
  "routeEcoText",
  "fuelSettingsTitle",
  "fuelTypeLabel",
  "maxDetourLabel",
  "searchRadiusLabel",
  "radiusNote",
  "fuelListTitle",
  "fuelHistoryTitle",
  "navDistanceLabel",
  "navTimeLabel",
  "navSpeedLabel"
].forEach((id) => {
  els[id] = document.getElementById(id);
});

const i18n = {
  da: {
    title: "Billigste brændstof",
    subtitle: "Find billigste tankstation langs din rute",
    destination: "Destination",
    destinationPlaceholder: "Indtast adresse...",
    calc: "Beregn rute",
    start: "Start",
    stop: "Stop",
    center: "Centrér",
    history: "Historik",
    settings: "Settings",
    recentDestinations: "Seneste destinationer",
    cheapestTank: "Billigste tank",
    cheapest: "Se billigste på ruten",
    priceHistory: "Se prishistorik",
    noRoute: "Beregn en rute først.",
    noPrices: "Ingen prisdata fundet",
    fuelLoaded: "Brændstofpriser indlæst",
    gpsReady: "GPS: klar",
    gpsLoading: "GPS: henter position",
    navInactive: "Navigation: inaktiv",
    navReady: "Navigation: rute klar",
    navLive: "Navigation: live",
    mapReady: "Kort: klar",
    routeCalculating: "Beregner rute...",
    routeFailed: "Kunne ikke beregne rute",
    noFuelOnRoute: "Ingen stationer med pris inden for den valgte afstand.",
    openMaps: "Åbn via Google Maps",
    detour: "Omvej",
    fromRoute: "Fra rute",
    source: "Kilde",
    match: "Match",
    settingsTitle: "Indstillinger",
    languageTitle: "Sprog",
    regionTitle: "Marked",
    routeTitle: "Rute",
    fuelSettingsTitle: "Brændstof",
    fuelType: "Brændstoftype",
    maxDetour: "Maks ekstra omvej",
    searchRadius: "Søg tankstationer inden for",
    regionNote: "USA kræver amerikanske prisdata. Danske priser bruges ikke som USA-priser.",
    radiusNote: "I Danmark tolkes dette som kilometer. I USA tolkes det som miles.",
    fast: "Hurtigste",
    eco: "Økonomisk",
    fuelListTitle: "Billigste stationer",
    fuelHistoryTitle: "Prishistorik",
    distance: "Afstand",
    time: "Tid",
    speed: "Speed",
    cheapestAround: "Billigst ca.",
    mostExpensiveAround: "Dyrest ca.",
    notEnoughHistory: "Ikke nok historik endnu.",
    noUsPriceData: "USA-mode kræver amerikanske prisdata i fuel-prices.json.",
    pricePosts: "Prisposter",
    stationsOnRoute: "Stationer fundet"
  },
  en: {
    title: "Cheapest fuel",
    subtitle: "Find the cheapest fuel station along your route",
    destination: "Destination",
    destinationPlaceholder: "Enter address...",
    calc: "Calculate route",
    start: "Start",
    stop: "Stop",
    center: "Center",
    history: "History",
    settings: "Settings",
    recentDestinations: "Recent destinations",
    cheapestTank: "Cheapest fuel",
    cheapest: "Cheapest on route",
    priceHistory: "Price history",
    noRoute: "Calculate a route first.",
    noPrices: "No price data found",
    fuelLoaded: "Fuel prices loaded",
    gpsReady: "GPS: ready",
    gpsLoading: "GPS: finding position",
    navInactive: "Navigation: inactive",
    navReady: "Navigation: route ready",
    navLive: "Navigation: live",
    mapReady: "Map: ready",
    routeCalculating: "Calculating route...",
    routeFailed: "Could not calculate route",
    noFuelOnRoute: "No stations with prices within the selected distance.",
    openMaps: "Open in Google Maps",
    detour: "Detour",
    fromRoute: "From route",
    source: "Source",
    match: "Match",
    settingsTitle: "Settings",
    languageTitle: "Language",
    regionTitle: "Market",
    routeTitle: "Route",
    fuelSettingsTitle: "Fuel",
    fuelType: "Fuel type",
    maxDetour: "Max extra detour",
    searchRadius: "Search fuel stations within",
    regionNote: "USA mode requires US price data. Danish prices are not used as US prices.",
    radiusNote: "In Denmark this is interpreted as kilometers. In the USA it is interpreted as miles.",
    fast: "Fastest",
    eco: "Eco",
    fuelListTitle: "Cheapest stations",
    fuelHistoryTitle: "Price history",
    distance: "Distance",
    time: "Time",
    speed: "Speed",
    cheapestAround: "Cheapest around",
    mostExpensiveAround: "Most expensive around",
    notEnoughHistory: "Not enough history yet.",
    noUsPriceData: "USA mode requires US price data in fuel-prices.json.",
    pricePosts: "Price records",
    stationsOnRoute: "Stations found"
  }
};

init();

async function init() {
  try {
    loadSettings();
    initMap();
    bindEvents();
    applySettingsToUI();
    applyTranslations();
    renderHistory();

    setGpsStatus(t("gpsReady"));
    setNavStatus(t("navInactive"));
    setMapStatus(t("mapReady"));

    await loadFuelPrices();
    updateFuelBox();

    setInterval(async () => {
      await loadFuelPrices();
      updateFuelBox();
      updateFuelMarkers();
    }, 5 * 60 * 1000);
  } catch (error) {
    console.error("Init error:", error);
  }
}

function t(key) {
  return i18n[state.settings.language]?.[key] || key;
}

function initMap() {
  state.map = L.map("map", {
    zoomControl: true,
    zoomSnap: 0.25,
    zoomDelta: 0.25
  }).setView([56.2, 9.5], 7);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "© OpenStreetMap contributors",
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
    els.historyBox?.classList.toggle("hidden");
    hideAutocomplete();
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
      hideAutocomplete();
    }
  });
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
  applyTranslations();
  closeSettings();

  if (state.routeData) {
    updateFuelBox();
    updateFuelMarkers();
  }
}

function applyTranslations() {
  document.documentElement.lang = state.settings.language;

  setText("titleText", t("title"));
  setText("subtitleText", t("subtitle"));
  setText("destinationLabel", t("destination"));
  setText("historyTitle", t("recentDestinations"));
  setText("fuelPanelTitle", t("cheapestTank"));
  setText("settingsTitle", t("settingsTitle"));
  setText("languageTitle", t("languageTitle"));
  setText("regionTitle", t("regionTitle"));
  setText("regionNote", t("regionNote"));
  setText("routeTitle", t("routeTitle"));
  setText("routeFastText", t("fast"));
  setText("routeEcoText", t("eco"));
  setText("fuelSettingsTitle", t("fuelSettingsTitle"));
  setText("fuelTypeLabel", t("fuelType"));
  setText("maxDetourLabel", t("maxDetour"));
  setText("searchRadiusLabel", t("searchRadius"));
  setText("radiusNote", t("radiusNote"));
  setText("fuelListTitle", t("fuelListTitle"));
  setText("fuelHistoryTitle", t("fuelHistoryTitle"));
  setText("navDistanceLabel", t("distance"));
  setText("navTimeLabel", t("time"));
  setText("navSpeedLabel", t("speed"));

  if (els.destinationInput) els.destinationInput.placeholder = t("destinationPlaceholder");
  if (els.calcRouteBtn) els.calcRouteBtn.textContent = t("calc");
  if (els.startNavBtn) els.startNavBtn.textContent = t("start");
  if (els.stopNavBtn) els.stopNavBtn.textContent = t("stop");
  if (els.recenterBtn) els.recenterBtn.textContent = t("center");
  if (els.historyToggleBtn) els.historyToggleBtn.textContent = t("history");
  if (els.openSettingsBtn) els.openSettingsBtn.textContent = t("settings");
  if (els.openFuelListBtn) els.openFuelListBtn.textContent = t("cheapest");
  if (els.openFuelHistoryBtn) els.openFuelHistoryBtn.textContent = t("priceHistory");

  setGpsStatus(t("gpsReady"));
  setNavStatus(state.watchId ? t("navLive") : t("navInactive"));
  setMapStatus(t("mapReady"));
}

function setText(id, value) {
  if (els[id]) els[id].textContent = value;
}

function openSettings() {
  els.settingsPanel?.classList.remove("hidden");
  els.settingsBackdrop?.classList.remove("hidden");
}

function closeSettings() {
  els.settingsPanel?.classList.add("hidden");
  els.settingsBackdrop?.classList.add("hidden");
}

function getSearchRadiusMeters() {
  const base = Number(state.settings.searchRadiusBase || 100000);

  if (state.settings.region === "us") {
    const miles = base / 1000;
    return miles * 1609.344;
  }

  return base;
}

function getSearchRadiusLabel() {
  const base = Number(state.settings.searchRadiusBase || 100000);
  const value = base / 1000;

  if (state.settings.region === "us") {
    return `${value} miles`;
  }

  return `${value} km`;
}

async function loadFuelPrices() {
  try {
    const response = await fetch(FUEL_DATA_URL, { cache: "no-store" });
    if (!response.ok) throw new Error("fuel-prices.json kunne ikke hentes.");

    const data = await response.json();
    state.fuelPriceOverrides = normalizeFuelData(Array.isArray(data) ? data : []);
    savePriceHistorySnapshot();

    if (els.fuelDisclaimer) {
      els.fuelDisclaimer.textContent = `${t("fuelLoaded")}: ${state.fuelPriceOverrides.length}`;
    }
  } catch (error) {
    console.warn(error);
    state.fuelPriceOverrides = [];

    if (els.fuelDisclaimer) {
      els.fuelDisclaimer.textContent = "fuel-prices.json kunne ikke hentes";
    }
  }
}

function normalizeFuelData(rawStations) {
  const out = [];

  rawStations.forEach((station) => {
    if (!station || typeof station !== "object") return;

    const stationLat = numberOrNull(station.lat);
    const stationLng = numberOrNull(station.lng);
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
          lat: stationLat,
          lng: stationLng,
          country,
          fuelType,
          price: data.price,
          currency: data.currency || "DKK",
          unit: data.unit || "liter",
          updatedAt: data.updatedAt || new Date().toISOString(),
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
        lat: stationLat,
        lng: stationLng,
        country,
        fuelType: station.fuelType || state.settings.fuelType,
        price: station.price,
        currency: station.currency || "DKK",
        unit: station.unit || "liter",
        updatedAt: station.updatedAt || new Date().toISOString(),
        source: station.source || "fuel-prices.json"
      });
    }
  });

  return out;
}

function isFuelRecordCompatible(item) {
  if (state.settings.region === "us") {
    return item.country === "US" || item.currency === "USD" || item.unit === "gallon";
  }

  return item.country !== "US" && item.currency !== "USD";
}

async function runAutocomplete() {
  const query = els.destinationInput?.value.trim() || "";

  if (query.length < 3) {
    hideAutocomplete();
    return;
  }

  const country = state.settings.region === "us" ? "us" : "dk";

  try {
    const url =
      `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=6&addressdetails=1&countrycodes=${country}&q=${encodeURIComponent(query)}`;

    const response = await fetch(url, {
      headers: { Accept: "application/json" }
    });

    if (!response.ok) throw new Error("Autocomplete fejlede.");

    const data = await response.json();
    renderAutocomplete(Array.isArray(data) ? data : []);
  } catch (error) {
    console.warn(error);
    hideAutocomplete();
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
    const title = getAutocompleteTitle(item);
    const subtitle = item.display_name || "";

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
        displayName: item.display_name || title
      };

      els.destinationInput.value = title;
      hideAutocomplete();
    });

    els.autocompleteList.appendChild(button);
  });

  els.autocompleteBox.classList.remove("hidden");
}

function getAutocompleteTitle(item) {
  const a = item.address || {};

  return (
    item.name ||
    a.road ||
    a.pedestrian ||
    a.suburb ||
    a.city ||
    a.town ||
    a.village ||
    String(item.display_name || "").split(",")[0] ||
    "Adresse"
  );
}

function hideAutocomplete() {
  els.autocompleteBox?.classList.add("hidden");
}

async function calculateRoute() {
  const destinationText = els.destinationInput?.value.trim() || "";
  if (!destinationText) return;

  try {
    setGpsStatus(t("gpsLoading"));
    setMapStatus(t("routeCalculating"));
    setNavStatus(t("navInactive"));

    if (els.calcRouteBtn) els.calcRouteBtn.disabled = true;
    if (els.startNavBtn) els.startNavBtn.disabled = true;
    if (els.openFuelListBtn) els.openFuelListBtn.disabled = true;

    state.currentPosition = await getPosition();
    updateUserMarker(state.currentPosition.lat, state.currentPosition.lng);

    state.destination = state.selectedAutocompleteItem || await geocodeDestination(destinationText);
    updateDestinationMarker(state.destination.lat, state.destination.lng);

    state.routeData = await fetchRoute(state.currentPosition, state.destination);

    drawRoute(state.routeData.geometry.map(([lng, lat]) => [lat, lng]));
    fitRoute();

    saveHistory(destinationText);
    renderHistory();

    await loadFuelStations(state.routeData.geometry);
    updateFuelBox();
    updateFuelMarkers();

    setGpsStatus(t("gpsReady"));
    setNavStatus(t("navReady"));
    setMapStatus(`${t("mapReady")} • ${getSearchRadiusLabel()}`);

    if (els.startNavBtn) els.startNavBtn.disabled = false;
  } catch (error) {
    console.error(error);
    alert(`${t("routeFailed")}: ${error.message || error}`);
    setGpsStatus(t("gpsReady"));
    setNavStatus(t("navInactive"));
    setMapStatus(t("mapReady"));
  } finally {
    if (els.calcRouteBtn) els.calcRouteBtn.disabled = false;
  }
}

async function geocodeDestination(query) {
  const country = state.settings.region === "us" ? "us" : "dk";

  const url =
    `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&addressdetails=1&countrycodes=${country}&q=${encodeURIComponent(query)}`;

  const response = await fetch(url, {
    headers: { Accept: "application/json" }
  });

  if (!response.ok) throw new Error("Destination kunne ikke søges.");

  const data = await response.json();

  if (!Array.isArray(data) || !data.length) {
    throw new Error("Destination ikke fundet.");
  }

  return {
    lat: Number(data[0].lat),
    lng: Number(data[0].lon),
    displayName: data[0].display_name || query
  };
}

async function fetchRoute(from, to) {
  const url =
    `https://router.project-osrm.org/route/v1/driving/${from.lng},${from.lat};${to.lng},${to.lat}` +
    "?overview=full&geometries=geojson&steps=true&annotations=distance,duration";

  const response = await fetch(url);

  if (!response.ok) throw new Error("OSRM kunne ikke hente rute.");

  const data = await response.json();

  if (!data.routes || !data.routes.length) {
    throw new Error("Ingen rute fundet.");
  }

  const route = data.routes[0];

  return {
    distance: route.distance,
    duration: route.duration,
    geometry: route.geometry.coordinates,
    steps: route.legs?.[0]?.steps || []
  };
}

async function loadFuelStations(geometry) {
  try {
    const points = sampleRoutePoints(geometry);

    if (!points.length) {
      state.osmFuelStations = [];
      return;
    }

    const radiusMeters = Math.min(getSearchRadiusMeters(), 50000);

    const queryParts = points.map((p) => `
      node(around:${Math.round(radiusMeters)},${p.lat},${p.lng})["amenity"="fuel"];
      way(around:${Math.round(radiusMeters)},${p.lat},${p.lng})["amenity"="fuel"];
    `);

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

    if (!response.ok) throw new Error("Overpass fejlede.");

    const data = await response.json();

    state.osmFuelStations = dedupeStations(
      (data.elements || [])
        .map(normalizeOsmFuelStation)
        .filter(Boolean)
        .map(applyPriceToStation)
    );
  } catch (error) {
    console.warn(error);
    state.osmFuelStations = [];
  }
}

function sampleRoutePoints(geometry) {
  if (!Array.isArray(geometry) || !geometry.length) return [];

  const points = [];

  for (let i = 0; i < geometry.length; i += 80) {
    points.push({
      lng: geometry[i][0],
      lat: geometry[i][1]
    });
  }

  const last = geometry[geometry.length - 1];
  points.push({
    lng: last[0],
    lat: last[1]
  });

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
  const address = buildOsmAddress(tags);

  return {
    id: `osm-${el.type}-${el.id}`,
    name,
    brand,
    address,
    city: tags["addr:city"] || extractCity(address),
    lat,
    lng,
    price: null,
    source: "OSM",
    priceMatchMode: null
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
  const candidates = state.fuelPriceOverrides.filter((x) =>
    x.fuelType === state.settings.fuelType &&
    typeof x.price === "number" &&
    isFuelRecordCompatible(x)
  );

  if (!candidates.length) return null;

  const sBrand = normalizeBrand(station.brand || station.name);
  const sName = normalizeText(station.name);
  const sCity = normalizeText(station.city || extractCity(station.address));

  const coordinateMatches = candidates
    .filter((x) => Number.isFinite(x.lat) && Number.isFinite(x.lng))
    .map((x) => ({
      ...x,
      distanceMeters: haversineMeters(station.lat, station.lng, x.lat, x.lng),
      matchMode: "koordinat"
    }))
    .filter((x) => x.distanceMeters <= 100)
    .sort((a, b) => a.distanceMeters - b.distanceMeters);

  if (coordinateMatches.length) return coordinateMatches[0];

  const scored = candidates.map((item) => {
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

    return {
      ...item,
      score,
      matchMode: "brand/navn/by"
    };
  })
  .filter((x) => x.score >= 45)
  .sort((a, b) => b.score - a.score || a.price - b.price);

  if (scored.length) return scored[0];

  const sameBrand = candidates
    .filter((x) => normalizeBrand(x.brand || x.name) === sBrand)
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

  let score = 0;

  aw.forEach((word) => {
    if (bw.has(word)) score += 8;
  });

  return score;
}

function updateFuelBox() {
  if (!state.routeData) {
    if (els.fuelContent) els.fuelContent.innerHTML = t("noRoute");
    if (els.openFuelListBtn) els.openFuelListBtn.disabled = true;
    return;
  }

  const candidates = getFuelCandidates();

  if (!candidates.length) {
    const extra =
      state.settings.region === "us"
        ? `<div class="fuel-meta">${t("noUsPriceData")}</div>`
        : "";

    if (els.fuelContent) {
      els.fuelContent.innerHTML = `
        <div class="fuel-name">${t("noPrices")}</div>
        ${extra}
        <div class="fuel-meta">${t("stationsOnRoute")}: ${state.osmFuelStations.length}</div>
        <div class="fuel-meta">${t("pricePosts")}: ${state.fuelPriceOverrides.length}</div>
        <div class="fuel-meta">${t("searchRadius")}: ${getSearchRadiusLabel()}</div>
      `;
    }

    if (els.openFuelListBtn) els.openFuelListBtn.disabled = true;
    state.currentFuelStation = null;
    return;
  }

  const best = candidates.slice().sort((a, b) =>
    a.price - b.price || a.distanceFromCurrentMeters - b.distanceFromCurrentMeters
  )[0];

  state.currentFuelStation = best;

  if (els.openFuelListBtn) els.openFuelListBtn.disabled = false;

  if (els.fuelContent) {
    els.fuelContent.innerHTML = `
      <div class="fuel-name">${escapeHtml(best.name)}</div>
      <div class="fuel-price">${formatPrice(best.price)}</div>
      <div class="fuel-meta">${t("distance")}: ${formatDistance(best.distanceFromCurrentMeters)}</div>
      <div class="fuel-meta">${t("fromRoute")}: ${formatDistance(best.distanceToRouteMeters)}</div>
      <div class="fuel-meta">${t("searchRadius")}: ${getSearchRadiusLabel()}</div>
      <div class="fuel-meta">${t("match")}: ${escapeHtml(best.priceMatchMode || "prisdata")}</div>
      <a class="fuel-link" href="${buildGoogleMapsLink(best)}" target="_blank" rel="noopener noreferrer">
        ${t("openMaps")}
      </a>
    `;
  }
}

function getFuelCandidates() {
  if (!state.routeData || !state.currentPosition) return [];

  const radiusMeters = getSearchRadiusMeters();

  return state.osmFuelStations
    .filter((s) => typeof s.price === "number")
    .map((s) => {
      const distanceFromCurrentMeters = haversineMeters(
        state.currentPosition.lat,
        state.currentPosition.lng,
        s.lat,
        s.lng
      );

      const distanceToRouteMeters = distanceToRouteMetersFromGeometry(
        { lat: s.lat, lng: s.lng },
        state.routeData.geometry
      );

      return {
        ...s,
        distanceFromCurrentMeters,
        distanceToRouteMeters,
        extraDetourMeters: distanceToRouteMeters * 2
      };
    })
    .filter((s) => s.distanceFromCurrentMeters <= radiusMeters);
}

function updateFuelMarkers() {
  clearFuelMarkers();

  if (!state.map || !state.routeData) return;

  const candidates = getFuelCandidates()
    .slice()
    .sort((a, b) => a.price - b.price || a.distanceFromCurrentMeters - b.distanceFromCurrentMeters)
    .slice(0, 10);

  candidates.forEach((station, index) => {
    const isBest = index === 0;

    const icon = L.divIcon({
      className: "fuel-price-marker",
      html: `
        <div class="fuel-price-label ${isBest ? "best" : ""}">
          ${formatPriceShort(station.price)}
        </div>
      `,
      iconSize: [74, 34],
      iconAnchor: [37, 17]
    });

    const marker = L.marker([station.lat, station.lng], { icon })
      .addTo(state.map)
      .bindPopup(`
        <strong>${escapeHtml(station.name)}</strong><br>
        ${formatPrice(station.price)}<br>
        ${t("distance")}: ${formatDistance(station.distanceFromCurrentMeters)}<br>
        ${t("fromRoute")}: ${formatDistance(station.distanceToRouteMeters)}<br>
        <a href="${buildGoogleMapsLink(station)}" target="_blank" rel="noopener noreferrer">
          ${t("openMaps")}
        </a>
      `);

    state.fuelMarkers.push(marker);
  });
}

function clearFuelMarkers() {
  state.fuelMarkers.forEach((marker) => {
    state.map.removeLayer(marker);
  });

  state.fuelMarkers = [];
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
  const candidates = getFuelCandidates();

  if (!els.fuelListContent) return;

  if (!candidates.length) {
    els.fuelListContent.innerHTML = `<div class="fuel-list-empty">${t("noFuelOnRoute")}</div>`;
    return;
  }

  const sorted = candidates.slice().sort((a, b) => {
    if (state.fuelListSort === "detour") {
      return a.distanceFromCurrentMeters - b.distanceFromCurrentMeters || a.price - b.price;
    }

    return a.price - b.price || a.distanceFromCurrentMeters - b.distanceFromCurrentMeters;
  }).slice(0, 10);

  els.fuelListContent.innerHTML = sorted.map((station, index) => `
    <article class="fuel-list-item">
      <div class="fuel-list-item-top">
        <div>
          <div class="fuel-list-name">${index + 1}. ${escapeHtml(station.name)}</div>
          <div class="fuel-list-brand">${escapeHtml(station.brand || "Ukendt")}</div>
        </div>
        <div class="fuel-list-price">${formatPrice(station.price)}</div>
      </div>

      <div class="fuel-list-meta-grid">
        <div class="fuel-list-meta">${t("distance")}<br><strong>${formatDistance(station.distanceFromCurrentMeters)}</strong></div>
        <div class="fuel-list-meta">${t("fromRoute")}<br><strong>${formatDistance(station.distanceToRouteMeters)}</strong></div>
        <div class="fuel-list-meta">${t("match")}<br><strong>${escapeHtml(station.priceMatchMode || "prisdata")}</strong></div>
        <div class="fuel-list-meta">${t("source")}<br><strong>${escapeHtml(station.source || "fuel-prices.json")}</strong></div>
      </div>

      <div class="fuel-list-actions">
        <a class="fuel-list-map-link" href="${buildGoogleMapsLink(station)}" target="_blank" rel="noopener noreferrer">
          ${t("openMaps")}
        </a>
      </div>
    </article>
  `).join("");
}

function openFuelHistory() {
  renderFuelHistory();
  els.fuelHistoryModal?.classList.remove("hidden");
  els.fuelHistoryBackdrop?.classList.remove("hidden");
}

function closeFuelHistory() {
  els.fuelHistoryModal?.classList.add("hidden");
  els.fuelHistoryBackdrop?.classList.add("hidden");
}

function savePriceHistorySnapshot() {
  let history = {};

  try {
    history = JSON.parse(localStorage.getItem(PRICE_HISTORY_KEY) || "{}");
  } catch {}

  const now = new Date();
  const hour = `${String(now.getHours()).padStart(2, "0")}:00`;

  state.fuelPriceOverrides.forEach((item) => {
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
      hour,
      timestamp: Date.now()
    });

    history[key].records = history[key].records.slice(-200);
  });

  localStorage.setItem(PRICE_HISTORY_KEY, JSON.stringify(history));
}

function renderFuelHistory() {
  if (!els.fuelHistoryContent) return;

  let history = {};

  try {
    history = JSON.parse(localStorage.getItem(PRICE_HISTORY_KEY) || "{}");
  } catch {}

  const candidates = getFuelCandidates();

  if (!candidates.length) {
    els.fuelHistoryContent.innerHTML = `<div class="fuel-list-empty">${t("noFuelOnRoute")}</div>`;
    return;
  }

  els.fuelHistoryContent.innerHTML = candidates.slice(0, 10).map((station) => {
    const found = Object.values(history).find((h) =>
      normalizeBrand(h.brand) === normalizeBrand(station.brand) &&
      h.fuelType === state.settings.fuelType
    );

    if (!found?.records?.length) {
      return `
        <article class="fuel-list-item">
          <div class="fuel-list-name">${escapeHtml(station.name)}</div>
          <div class="fuel-list-meta">${t("notEnoughHistory")}</div>
        </article>
      `;
    }

    const byHour = {};

    found.records.forEach((record) => {
      if (!byHour[record.hour]) byHour[record.hour] = [];
      byHour[record.hour].push(record.price);
    });

    const avg = Object.entries(byHour).map(([hour, prices]) => ({
      hour,
      avg: prices.reduce((sum, price) => sum + price, 0) / prices.length
    })).sort((a, b) => a.avg - b.avg);

    const best = avg[0];
    const worst = avg[avg.length - 1];

    return `
      <article class="fuel-list-item">
        <div class="fuel-list-name">${escapeHtml(station.name)}</div>
        <div class="fuel-list-meta-grid">
          <div class="fuel-list-meta">${t("cheapestAround")}<br><strong>${best.hour}</strong></div>
          <div class="fuel-list-meta">Pris<br><strong>${formatPrice(best.avg)}</strong></div>
          <div class="fuel-list-meta">${t("mostExpensiveAround")}<br><strong>${worst.hour}</strong></div>
          <div class="fuel-list-meta">Pris<br><strong>${formatPrice(worst.avg)}</strong></div>
        </div>
      </article>
    `;
  }).join("");
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
  if (els.startNavBtn) els.startNavBtn.disabled = true;
  if (els.stopNavBtn) els.stopNavBtn.disabled = false;

  setNavStatus(t("navLive"));

  if (state.watchId !== null) {
    navigator.geolocation.clearWatch(state.watchId);
  }

  state.watchId = navigator.geolocation.watchPosition((position) => {
    const current = {
      lat: position.coords.latitude,
      lng: position.coords.longitude,
      speed: position.coords.speed
    };

    state.currentPosition = current;
    updateUserMarker(current.lat, current.lng);

    const kmh = typeof current.speed === "number" ? Math.round(current.speed * 3.6) : 0;

    if (els.driveCurrentValue) {
      els.driveCurrentValue.textContent = `${kmh} km/t`;
    }

    if (state.destination && els.driveRemainingDistance) {
      const remaining = haversineMeters(
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

  setNavStatus(t("navInactive"));
}

function drawRoute(latLngs) {
  if (state.routeLine) {
    state.map.removeLayer(state.routeLine);
  }

  state.routeLine = L.polyline(latLngs, {
    color: "#5ea2ff",
    weight: 6,
    opacity: 0.92
  }).addTo(state.map);
}

function fitRoute() {
  if (state.routeLine) {
    state.map.fitBounds(state.routeLine.getBounds(), {
      padding: [30, 30]
    });
  }
}

function recenterMap() {
  if (state.currentPosition) {
    state.map.setView([state.currentPosition.lat, state.currentPosition.lng], 15);
    return;
  }

  if (state.routeLine) {
    fitRoute();
  }
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
  const next = [destination, ...list.filter((x) => x !== destination)].slice(0, 5);
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

  stations.forEach((station) => {
    const duplicate = result.find((existing) =>
      haversineMeters(station.lat, station.lng, existing.lat, existing.lng) < 35
    );

    if (!duplicate) result.push(station);
  });

  return result;
}

function distanceToRouteMetersFromGeometry(point, geometry) {
  if (!Array.isArray(geometry) || geometry.length < 2) return Infinity;

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
  const metersLat = 111320;
  const metersLng = 111320 * Math.cos(meanLatRad);

  const px = p.lng * metersLng;
  const py = p.lat * metersLat;
  const ax = a.lng * metersLng;
  const ay = a.lat * metersLat;
  const bx = b.lng * metersLng;
  const by = b.lat * metersLat;

  const dx = bx - ax;
  const dy = by - ay;

  if (dx === 0 && dy === 0) {
    return Math.hypot(px - ax, py - ay);
  }

  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));

  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

function haversineMeters(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const rad = (deg) => deg * Math.PI / 180;

  const dLat = rad(lat2 - lat1);
  const dLng = rad(lng2 - lng1);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(lat1)) *
    Math.cos(rad(lat2)) *
    Math.sin(dLng / 2) ** 2;

  return 2 * R * Math.asin(Math.sqrt(a));
}

function extractCity(value) {
  const parts = String(value || "").split(",").map((x) => x.trim()).filter(Boolean);
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
  if (text === "ok" || text.startsWith("ok ") || text.includes(" ok ")) return "ok";
  if (text.includes("q8")) return "q8";
  if (text.includes("shell")) return "shell";
  if (text.includes("go on") || text.includes("goon")) return "goon";
  if (text.includes("oil")) return "oil";
  if (text.includes("chevron")) return "chevron";
  if (text.includes("exxon")) return "exxon";
  if (text.includes("mobil")) return "mobil";
  if (text.includes("bp")) return "bp";
  if (text.includes("speedway")) return "speedway";
  if (text.includes("7 eleven")) return "7-eleven";

  return text;
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
    const miles = meters / 1609.344;
    return `${miles.toFixed(1)} mi`;
  }

  if (meters < 1000) {
    return `${Math.round(meters)} m`;
  }

  return `${(meters / 1000).toFixed(1).replace(".", ",")} km`;
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
    if (!navigator.geolocation) {
      reject(new Error("Geolocation understøttes ikke."));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          lat: position.coords.latitude,
          lng: position.coords.longitude
        });
      },
      reject,
      {
        enableHighAccuracy: true,
        maximumAge: 0,
        timeout: 15000
      }
    );
  });
}
