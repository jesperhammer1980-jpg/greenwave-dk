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
        currency: station.currency || "
