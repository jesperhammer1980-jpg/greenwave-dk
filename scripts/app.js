const SETTINGS_KEY = "greenwave_companion_dk_settings_v3";
const HISTORY_KEY = "greenwave_companion_dk_history_v1";

const state = {
  map: null,
  userMarker: null,
  destinationMarker: null,
  routeLine: null,
  routeGlow: null,
  fuelMarkers: [],
  currentPosition: null,
  smoothedSpeed: null,
  destination: null,
  route: null,
  routeSteps: [],
  routeMeasurements: null,
  selectedAutocomplete: null,
  autocompleteTimer: null,
  watchId: null,
  wakeLock: null,
  offRouteSince: null,
  lastRerouteAt: 0,
  stations: [],
  priceData: null,
  roadContext: { ways: [], signals: [] },
  history: [],
  settings: {
    fuelType: "benzin95",
    maxFuelDetourMeters: 5000,
    routeMode: "fast", fuelAlongMeters: 50000, fuelSort: "cheapest"
  }
};

const els = {};

const requiredIds = [
  "map","destinationInput","goBtn","autocompleteResults","historySection","historyList",
  "settingsBtn","settingsBackdrop","settingsModal","closeSettingsBtn","saveSettingsBtn",
  "fuelTypeSelect","fuelDetourSelect","fuelAlongSelect","fuelSortSelect","routeModeSelect","statusText","recommendedSpeed",
  "speedLimit","currentSpeed","reasonText","startBtn","stopBtn","recalcBtn",
  "routeDistance","routeDuration","routeEta","fuelRefreshBtn","fuelSummary","fuelList"
];

document.addEventListener("DOMContentLoaded", () => {
  try {
    cacheDom();
    bindEvents();
    safeRun(loadSettings, "loadSettings");
    safeRun(loadHistory, "loadHistory");
    safeRun(initMap, "initMap");
    safeRun(syncSettingsUi, "syncSettingsUi");
    safeRun(renderHistory, "renderHistory");
    setStatus("Klar");
  } catch (error) {
    showStartupError(error);
  }
});

function cacheDom() {
  requiredIds.forEach(id => {
    els[id] = document.getElementById(id);
    if (!els[id]) console.warn(`Mangler HTML-element: ${id}`);
  });
}

function bindEvents() {
  on(els.destinationInput, "input", () => {
    state.selectedAutocomplete = null;
    clearTimeout(state.autocompleteTimer);
    state.autocompleteTimer = setTimeout(searchAutocomplete, 250);
  });

  on(els.goBtn, "click", calculateRoute);
  on(els.startBtn, "click", startCompanion);
  on(els.stopBtn, "click", stopCompanion);
  on(els.recalcBtn, "click", recalculateFromCurrentPosition);
  on(els.fuelRefreshBtn, "click", refreshFuel);

  on(els.settingsBtn, "click", openSettings);
  on(els.closeSettingsBtn, "click", closeSettings);
  on(els.settingsBackdrop, "click", closeSettings);
  on(els.saveSettingsBtn, "click", saveSettings);

  document.addEventListener("click", event => {
    if (!event.target.closest(".search-card") && !event.target.closest(".autocomplete")) hideAutocomplete();
  });
}

function initMap() {
  if (typeof L === "undefined") {
    console.warn("Leaflet er ikke indlæst endnu. Kort deaktiveret, men knapper/søg virker.");
    setStatus("Kort kunne ikke indlæses, men søgning virker.");
    return;
  }

  state.map = L.map("map", { zoomControl: false, attributionControl: false, preferCanvas: true });
  L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
    subdomains: "abcd",
    maxZoom: 20
  }).addTo(state.map);
  state.map.setView([55.6761, 12.5683], 12);
}

async function calculateRoute() {
  const query = els.destinationInput.value.trim();
  if (!query) {
    alert("Indtast en destination.");
    return;
  }

  try {
    setStatus("Finder position og beregner rute...");
    els.goBtn.disabled = true;
    els.startBtn.disabled = true;
    els.fuelRefreshBtn.disabled = true;

    const position = await getCurrentPosition();
    updateCurrentPosition(position, true);

    const destination = state.selectedAutocomplete || await geocode(query);
    state.destination = destination;
    updateDestinationMarker(destination);
    saveHistory(destination);
    renderHistory();

    const route = await fetchRoute(position, destination);
    applyRoute(route);

    els.startBtn.disabled = false;
    els.recalcBtn.disabled = false;
    els.fuelRefreshBtn.disabled = false;

    setStatus("Rute klar. Henter vejdata, stationer og priser...");

    await Promise.allSettled([
      loadRoadContext(route.geometry),
      refreshFuel()
    ]);

    updateGreenWave();
    setStatus("Rute klar.");
  } catch (error) {
    console.error(error);
    alert(`Kunne ikke beregne rute:\n${error.message || error}`);
    setStatus("Fejl ved ruteberegning.");
  } finally {
    els.goBtn.disabled = false;
  }
}

async function recalculateFromCurrentPosition() {
  if (!state.currentPosition || !state.destination) return;
  setStatus("Genberegner rute...");

  const route = await fetchRoute(state.currentPosition, state.destination);
  applyRoute(route);

  await Promise.allSettled([
    loadRoadContext(route.geometry),
    refreshFuel()
  ]);

  updateGreenWave();
  setStatus("Rute genberegnet.");
}

function applyRoute(route) {
  state.route = route;
  state.routeSteps = prepareSteps(route.steps);
  state.routeMeasurements = measureRoute(route.geometry);
  drawRoute(route.geometry);
  updateTripInfo(route);
  updateGreenWave();
}

async function startCompanion() {
  if (!state.route) {
    alert("Beregn en rute først.");
    return;
  }

  if (!navigator.geolocation) {
    alert("GPS understøttes ikke.");
    return;
  }

  await requestWakeLock();

  state.watchId = navigator.geolocation.watchPosition(position => {
    const current = normalizePosition(position);
    updateCurrentPosition(current, false);
    const progress = getRouteProgress(state.currentPosition);
    updateGreenWave(progress);
    maybeReroute(progress);
  }, error => {
    console.warn(error);
    setStatus(`GPS-fejl: ${error.message}`);
  }, { enableHighAccuracy: true, maximumAge: 1000, timeout: 10000 });

  els.startBtn.disabled = true;
  els.stopBtn.disabled = false;
  setStatus("Companion aktiv.");
}

function stopCompanion() {
  if (state.watchId) navigator.geolocation.clearWatch(state.watchId);
  state.watchId = null;
  releaseWakeLock();
  els.startBtn.disabled = !state.route;
  els.stopBtn.disabled = true;
  setStatus("Companion stoppet.");
}

function updateCurrentPosition(position, centerMap) {
  const smoothed = smoothSpeed(position);
  state.currentPosition = smoothed;
  if (els.currentSpeed) els.currentSpeed.textContent = Math.round(smoothed.speed || 0);
  if (!state.map || typeof L === "undefined") return;

  const icon = L.divIcon({
    className: "user-marker-icon",
    html: '<div class="user-marker-dot"></div>',
    iconSize: [28, 28],
    iconAnchor: [14, 14]
  });

  if (!state.userMarker) state.userMarker = L.marker([smoothed.lat, smoothed.lng], { icon, zIndexOffset: 5000 }).addTo(state.map);
  else state.userMarker.setLatLng([smoothed.lat, smoothed.lng]);

  if (centerMap) state.map.flyTo([smoothed.lat, smoothed.lng], 14, { duration: 0.7 });
}

function smoothSpeed(position) {
  const speed = position.speed || 0;
  if (state.smoothedSpeed === null) state.smoothedSpeed = speed;
  else {
    const alpha = speed < 10 ? 0.18 : 0.28;
    state.smoothedSpeed = state.smoothedSpeed * (1 - alpha) + speed * alpha;
  }
  return { ...position, speed: state.smoothedSpeed };
}

function updateDestinationMarker(destination) {
  if (!state.map || typeof L === "undefined") return;
  const icon = L.divIcon({
    className: "dest-marker-icon",
    html: '<div class="dest-marker-dot">⌖</div>',
    iconSize: [40, 40],
    iconAnchor: [20, 20]
  });

  if (!state.destinationMarker) state.destinationMarker = L.marker([destination.lat, destination.lng], { icon, zIndexOffset: 4500 }).addTo(state.map);
  else state.destinationMarker.setLatLng([destination.lat, destination.lng]);
}

function drawRoute(geometry) {
  if (!state.map || typeof L === "undefined") return;
  if (state.routeGlow) state.map.removeLayer(state.routeGlow);
  if (state.routeLine) state.map.removeLayer(state.routeLine);

  const latlngs = geometry.map(point => [point[1], point[0]]);
  state.routeGlow = L.polyline(latlngs, { color: "#68c4ff", weight: 18, opacity: 0.22, lineCap: "round", lineJoin: "round" }).addTo(state.map);
  state.routeLine = L.polyline(latlngs, { color: "#2b91ff", weight: 7, opacity: 1, lineCap: "round", lineJoin: "round" }).addTo(state.map);
  state.map.fitBounds(state.routeLine.getBounds(), { padding: [70, 70], animate: true });
}

function updateTripInfo(route) {
  els.routeDistance.textContent = formatDistance(route.distance);
  els.routeDuration.textContent = formatDuration(route.duration);
  els.routeEta.textContent = new Date(Date.now() + route.duration * 1000).toLocaleTimeString("da-DK", { hour: "2-digit", minute: "2-digit" });
}

function updateGreenWave(progress = null) {
  const current = state.currentPosition;
  if (!current || !state.route) {
    setRecommendation(null, "Beregn en rute for at starte GreenWave.");
    return;
  }

  if (!progress) progress = getRouteProgress(current);

  const maxSpeed = findMaxSpeedByRouteProgress(progress) || findMaxSpeedByPosition(current);
  els.speedLimit.textContent = maxSpeed || "?";

  if (!maxSpeed) {
    setRecommendation(null, "Maxhastighed ukendt på dette vejstykke.");
    return;
  }

  const step = findCurrentStep(progress);
  const signal = findUpcomingSignal(progress);
  const recommendation = calculateRecommendedSpeed(maxSpeed, progress, step, signal);
  setRecommendation(recommendation.speed, recommendation.reason);
}

function calculateRecommendedSpeed(maxSpeed, progress, step, signal) {
  if (step) {
    const distanceToStep = Math.max(0, step.endDistance - progress.alongMeters);
    const type = `${step.maneuverType} ${step.maneuverModifier}`.toLowerCase();

    if (distanceToStep < 500) {
      if (type.includes("roundabout")) return speedPlan(maxSpeed, distanceToStep, 28, "Rundkørsel forude.");
      if (type.includes("left") || type.includes("right") || type.includes("turn")) return speedPlan(maxSpeed, distanceToStep, 25, "Sving forude.");
      if (type.includes("arrive")) return speedPlan(maxSpeed, distanceToStep, 15, "Destination tæt på.");
    }
  }

  if (signal && signal.distanceAhead < 850) {
    const speed = signal.distanceAhead < 220 ? Math.round(maxSpeed * 0.72 / 5) * 5 : Math.round(maxSpeed * 0.84 / 5) * 5;
    return { speed: clamp(speed, 25, maxSpeed), reason: "Signalreguleret kryds forude. Forsigtig GreenWave-estimering." };
  }

  return { speed: maxSpeed, reason: "Ingen konkret grund til at køre under max." };
}

function speedPlan(maxSpeed, distance, target, reason) {
  if (distance < 100) return { speed: Math.min(maxSpeed, target), reason };
  if (distance < 250) return { speed: Math.min(maxSpeed, Math.max(target + 10, Math.round(maxSpeed * 0.65 / 5) * 5)), reason };
  return { speed: Math.min(maxSpeed, Math.max(target + 20, Math.round(maxSpeed * 0.8 / 5) * 5)), reason };
}

function setRecommendation(speed, reason) {
  els.recommendedSpeed.textContent = speed || "--";
  els.reasonText.textContent = reason || "";
}

async function refreshFuel() {
  if (!state.route) return;
  els.fuelRefreshBtn.disabled = true;
  els.fuelSummary.textContent = "Henter stationer og priser...";

  try {
    const response = await fetch("/api/fuel-route", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        geometry: state.route.geometry,
        fuelType: state.settings.fuelType,
        maxDetourMeters: state.settings.maxFuelDetourMeters,
        fuelAlongMeters: state.settings.fuelAlongMeters || 50000
      })
    });

    const data = await response.json();

    if (!response.ok || !data.ok) {
      throw new Error(data.error || `/api/fuel-route ${response.status}`);
    }

    state.priceData = { sources: data.sources || [] };

    state.stations = (data.stations || [])
      .map(station => ({
        ...station,
        distanceToRoute: Number(station.distanceToRoute),
        distanceAlongRoute: Number(station.distanceAlongRoute),
        price: Number.isFinite(Number(station.price)) ? Number(station.price) : null
      }))
      .filter(station => station.distanceToRoute <= state.settings.maxFuelDetourMeters)
      .filter(station => station.distanceAlongRoute <= (state.settings.fuelAlongMeters || 50000))
      .sort(sortStations);

    renderFuel();
    drawFuelMarkers();

    if (state.stations.length === 0 && data.debug) {
      console.warn("Fuel-route returned no stations", data.debug);
      els.fuelSummary.textContent = `0 stationer. Debug: OSM=${data.counts?.osmStations ?? 0}, raw=${data.debug?.osm?.rawElementsTotal ?? "?"}, norm=${data.debug?.osm?.normalizedStations ?? "?"}, attempts=${(data.debug?.osm?.attempts || []).map(a => `${a.name}:${a.ok ? a.rawElements : a.error}`).join(" / ")}, API m. DK-koordinater=${data.counts?.apiStations ?? 0}, API uden/ugyldige koordinater=${data.counts?.priceApiWithoutCoords ?? 0}, merged=${data.counts?.merged ?? 0}, nærmeste=${(data.debug?.nearestRaw || []).slice(0,3).map(s => `${s.name}:${s.distanceToRoute}m`).join(" / ")}, errors=${(data.debug?.errors || []).join(" | ")}`;
    }
  } catch (error) {
    console.error(error);
    els.fuelSummary.textContent = `Kunne ikke hente tankstationer/priser: ${error.message}`;
  } finally {
    els.fuelRefreshBtn.disabled = false;
  }
}

function sortStations(a, b) {
  const mode = state.settings.fuelSort || "cheapest";
  if (mode === "detour") return a.distanceToRoute - b.distanceToRoute;
  if (mode === "upcoming") return a.distanceAlongRoute - b.distanceAlongRoute;
  if (Number.isFinite(a.price) && Number.isFinite(b.price)) return a.price - b.price;
  if (Number.isFinite(a.price)) return -1;
  if (Number.isFinite(b.price)) return 1;
  return a.distanceAlongRoute - b.distanceAlongRoute;
}

function renderFuel() {
  const count = state.stations.length;
  const priced = state.stations.filter(station => Number.isFinite(station.price)).length;
  const sources = state.priceData?.sources?.filter(source => source.ok).map(source => source.stations ? `${source.name} (${source.stations})` : source.name).join(", ");

  els.fuelSummary.textContent = count
    ? `${count} stationer fundet inden for ${formatDistance(state.settings.fuelAlongMeters || 50000)} langs ruten. ${priced} med pris. ${sources ? "Kilder: " + sources : ""}`
    : "Ingen stationer inden for valgt afstand fra ruten.";

  els.fuelList.innerHTML = state.stations.slice(0, 12).map(station => {
    const price = Number.isFinite(station.price) ? `${station.price.toFixed(2).replace(".", ",")} kr/l` : "Pris ikke tilgængelig";
    const meta = [
      `${formatDistance(station.distanceAlongRoute)} langs ruten`,
      `${formatDistance(station.distanceToRoute)} fra ruten`,
      station.priceProduct || "",
      station.priceSource ? `Pris fra ${station.priceSource}` : ""
    ].filter(Boolean).join(" · ");

    return `
      <article class="fuel-item">
        <div class="fuel-title"><span>${escapeHtml(station.name)}</span><span class="fuel-price">${escapeHtml(price)}</span></div>
        <div class="fuel-meta">${escapeHtml(meta)}</div>
        <a href="https://www.google.com/maps/search/?api=1&query=${station.lat},${station.lng}" target="_blank">Åbn i Google Maps</a>
      </article>
    `;
  }).join("");
}

function drawFuelMarkers() {
  if (!state.map || typeof L === "undefined") return;
  state.fuelMarkers.forEach(marker => state.map.removeLayer(marker));
  state.fuelMarkers = [];

  state.stations.slice(0, 12).forEach(station => {
    const label = Number.isFinite(station.price) ? station.price.toFixed(2).replace(".", ",") : station.name.slice(0, 8);
    const icon = L.divIcon({ className: "fuel-marker", html: `<div class="fuel-pin">⛽ ${escapeHtml(label)}</div>`, iconSize: [100, 34], iconAnchor: [50, 34] });
    state.fuelMarkers.push(L.marker([station.lat, station.lng], { icon }).addTo(state.map));
  });
}

async function searchAutocomplete() {
  const query = els.destinationInput.value.trim();
  if (query.length < 2) {
    hideAutocomplete();
    return;
  }

  try {
    const response = await fetch(`/api/geocode?q=${encodeURIComponent(query)}&limit=6&mode=suggest`, { cache: "no-store" });
    const data = await response.json();
    const items = Array.isArray(data) ? data : (data.results || []);

    if (!items.length) {
      hideAutocomplete();
      return;
    }

    els.autocompleteResults.innerHTML = items.map((item, index) => {
      const label = item.displayName || item.label || "Ukendt adresse";
      const parts = splitDisplayAddress(label);
      return `<button type="button" data-index="${index}"><strong>${escapeHtml(parts.title)}</strong><small>${escapeHtml(parts.subtitle)}</small></button>`;
    }).join("");

    els.autocompleteResults.classList.remove("hidden");

    [...els.autocompleteResults.querySelectorAll("button")].forEach(button => {
      button.addEventListener("click", () => {
        const item = items[Number(button.dataset.index)];
        const label = item.displayName || item.label || "Destination";
        const parts = splitDisplayAddress(label);
        state.selectedAutocomplete = {
          lat: Number(item.lat),
          lng: Number(item.lng ?? item.lon),
          label: parts.title,
          displayName: label
        };
        els.destinationInput.value = parts.title;
        hideAutocomplete();
      });
    });
  } catch (error) {
    console.warn("Autocomplete failed", error);
    hideAutocomplete();
  }
}

function hideAutocomplete() {
  els.autocompleteResults.classList.add("hidden");
  els.autocompleteResults.innerHTML = "";
}

function formatAddress(item) {
  if (item.displayName) {
    const parts = String(item.displayName).split(',').map(part => part.trim()).filter(Boolean);
    return { title: parts[0] || item.displayName, subtitle: parts.slice(1, 3).join(', ') };
  }

  const address = item.address || {};
  const road = address.road || address.pedestrian || item.name || "";
  const number = address.house_number || "";
  const city = address.city || address.town || address.village || address.municipality || "";
  const postcode = address.postcode || "";
  return { title: [road, number].filter(Boolean).join(" ") || item.display_name || "Ukendt", subtitle: [postcode, city].filter(Boolean).join(" ") };
}

async function geocode(query) {
  const response = await fetch(`/api/geocode?q=${encodeURIComponent(query)}&limit=1`, { cache: "no-store" });
  const data = await response.json();
  const item = Array.isArray(data) ? data[0] : (data.result || data.results?.[0]);

  if (!response.ok || !item) {
    throw new Error(data?.message || data?.error || `Geocode HTTP ${response.status}`);
  }

  const lat = Number(item.lat);
  const lng = Number(item.lng ?? item.lon);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    throw new Error(`Geocode returned invalid coordinates for ${query}`);
  }

  const displayName = item.displayName || item.label || query;
  const parts = splitDisplayAddress(displayName);

  return {
    lat,
    lng,
    label: parts.title,
    displayName
  };
}

async function fetchRoute(from, to) {
  const response = await fetch(`/api/route?fromLat=${from.lat}&fromLng=${from.lng}&toLat=${to.lat}&toLng=${to.lng}&mode=${encodeURIComponent(state.settings.routeMode)}`);
  const data = await response.json();
  if (!data.routes?.length) throw new Error("Ingen rute fundet.");
  const route = selectRoute(data.routes);
  return { geometry: route.geometry.coordinates, distance: Number(route.distance || 0), duration: Number(route.duration || 0), steps: extractSteps(route) };
}

function selectRoute(routes) {
  if (state.settings.routeMode === "eco") return [...routes].sort((a, b) => ecoRouteScore(a) - ecoRouteScore(b))[0];
  return [...routes].sort((a, b) => Number(a.duration || Infinity) - Number(b.duration || Infinity))[0];
}

function ecoRouteScore(route) {
  return Number(route.distance || 0) / 1000 + Number(route.duration || 0) / 60 * 0.22;
}

function extractSteps(route) {
  const steps = [];
  (route.legs || []).forEach(leg => {
    (leg.steps || []).forEach(step => {
      const maneuver = step.maneuver || {};
      steps.push({ distance: Number(step.distance || 0), duration: Number(step.duration || 0), name: step.name || "", maneuverType: maneuver.type || "", maneuverModifier: maneuver.modifier || "" });
    });
  });
  return steps;
}

function prepareSteps(steps) {
  let total = 0;
  return steps.map((step, index) => {
    const output = { ...step, index, startDistance: total, endDistance: total + step.distance };
    total += step.distance;
    return output;
  });
}

function measureRoute(geometry) {
  const cumulative = [0];
  let total = 0;
  for (let i = 1; i < geometry.length; i++) {
    const a = geometry[i - 1];
    const b = geometry[i];
    total += haversine(a[1], a[0], b[1], b[0]);
    cumulative.push(total);
  }
  return { cumulative, total };
}

function getRouteProgress(position) {
  const geometry = state.route.geometry;
  const cumulative = state.routeMeasurements.cumulative;
  let best = { distanceToRoute: Infinity, alongMeters: 0, segmentIndex: 1 };

  for (let i = 1; i < geometry.length; i++) {
    const a = geometry[i - 1];
    const b = geometry[i];
    const projection = projectPointToSegment(position.lat, position.lng, a[1], a[0], b[1], b[0]);
    if (projection.distanceMeters < best.distanceToRoute) {
      const segmentLength = haversine(a[1], a[0], b[1], b[0]);
      best = { distanceToRoute: projection.distanceMeters, alongMeters: cumulative[i - 1] + segmentLength * projection.t, segmentIndex: i };
    }
  }

  const progressRatio = Math.min(1, best.alongMeters / state.route.distance);
  return { ...best, remainingMeters: Math.max(0, state.route.distance - best.alongMeters), remainingSeconds: Math.max(0, state.route.duration * (1 - progressRatio)) };
}

function maybeReroute(progress) {
  const now = Date.now();
  if (progress.distanceToRoute <= 90) {
    state.offRouteSince = null;
    return;
  }
  if (!state.offRouteSince) {
    state.offRouteSince = now;
    return;
  }
  if (now - state.offRouteSince < 7000 || now - state.lastRerouteAt < 25000) return;
  state.lastRerouteAt = now;
  state.offRouteSince = null;
  recalculateFromCurrentPosition().catch(console.warn);
}

function findCurrentStep(progress) {
  return state.routeSteps.find(step => progress.alongMeters >= step.startDistance && progress.alongMeters <= step.endDistance) || state.routeSteps[state.routeSteps.length - 1];
}

function findUpcomingSignal(progress) {
  return (state.roadContext.signals || [])
    .map(signal => ({ ...signal, distanceAhead: signal.distanceAlongRoute - progress.alongMeters }))
    .filter(signal => signal.distanceAhead > 40 && signal.distanceAhead < 900)
    .sort((a, b) => a.distanceAhead - b.distanceAhead)[0] || null;
}

function findMaxSpeedByRouteProgress(progress) {
  const along = progress.alongMeters;
  const candidates = (state.roadContext.ways || [])
    .filter(way => way.routeStart <= along + 220 && way.routeEnd >= along - 220)
    .sort((a, b) => a.distanceToRoute - b.distanceToRoute);
  return candidates[0]?.maxspeed || null;
}

function findMaxSpeedByPosition(position) {
  let best = null;
  for (const way of state.roadContext.ways || []) {
    for (let i = 1; i < way.geometry.length; i++) {
      const a = way.geometry[i - 1];
      const b = way.geometry[i];
      const projection = projectPointToSegment(position.lat, position.lng, a[0], a[1], b[0], b[1]);
      if (!best || projection.distanceMeters < best.distance) best = { distance: projection.distanceMeters, speed: way.maxspeed };
    }
  }
  return best && best.distance <= 75 ? best.speed : null;
}

async function loadRoadContext(geometry) {
  const boxes = routeCorridorBoxes(geometry, 0.025, 10);
  const ways = [];
  const signals = [];

  for (const box of boxes) {
    const b = `${box.south},${box.west},${box.north},${box.east}`;
    const query = `[out:json][timeout:25];(way["highway"]["maxspeed"](${b});node["highway"="traffic_signals"](${b}););out body geom;`;
    try {
      const data = await runOverpass(query, 9000);
      for (const element of data.elements || []) {
        if (element.type === "way" && element.geometry?.length) {
          const maxspeed = parseMaxspeed(element.tags?.maxspeed);
          if (maxspeed) ways.push({ id: element.id, maxspeed, geometry: element.geometry.map(point => [point.lat, point.lon]) });
        }
        if (element.type === "node" && element.tags?.highway === "traffic_signals") signals.push({ id: element.id, lat: element.lat, lng: element.lon });
      }
    } catch (error) {
      console.warn("Road context box failed", error);
    }
  }

  const measuredWays = dedupeById(ways).map(way => attachWayRouteSpan(way, geometry)).filter(way => way.distanceToRoute <= 80);
  state.roadContext = {
    ways: measuredWays,
    signals: attachRouteDistances(dedupeById(signals).map(signal => ({ ...signal, name: "Traffic signal" })), geometry).filter(signal => signal.distanceToRoute <= 55)
  };
}

function attachWayRouteSpan(way, routeGeometry) {
  let best = Infinity;
  let minAlong = Infinity;
  let maxAlong = -Infinity;
  const routeMeasures = measureRoute(routeGeometry);

  for (const point of way.geometry) {
    for (let i = 1; i < routeGeometry.length; i++) {
      const a = routeGeometry[i - 1];
      const b = routeGeometry[i];
      const projection = projectPointToSegment(point[0], point[1], a[1], a[0], b[1], b[0]);
      if (projection.distanceMeters < best) best = projection.distanceMeters;
      if (projection.distanceMeters <= 100) {
        const segmentLength = haversine(a[1], a[0], b[1], b[0]);
        const along = routeMeasures.cumulative[i - 1] + segmentLength * projection.t;
        minAlong = Math.min(minAlong, along);
        maxAlong = Math.max(maxAlong, along);
      }
    }
  }

  return { ...way, distanceToRoute: best, routeStart: Number.isFinite(minAlong) ? minAlong : 0, routeEnd: Number.isFinite(maxAlong) ? maxAlong : 0 };
}

async function findFuelStations(geometry) {
  const boxes = routeCorridorBoxes(geometry, 0.08, 8);
  const stations = [];

  for (const box of boxes) {
    const b = `${box.south},${box.west},${box.north},${box.east}`;
    const query = `[out:json][timeout:35];(node["amenity"="fuel"](${b});way["amenity"="fuel"](${b});relation["amenity"="fuel"](${b}););out center tags;`;
    try {
      const data = await runOverpass(query, 10000);
      stations.push(...(data.elements || []).map(normalizeFuelStation).filter(Boolean));
    } catch (error) {
      console.warn("Fuel box failed", error);
    }
  }

  return dedupeStations(stations);
}

function routeCorridorBoxes(geometry, padding, count) {
  const boxes = [];
  for (let i = 0; i < count; i++) {
    const start = Math.floor((geometry.length - 1) * (i / count));
    const end = Math.max(start + 1, Math.floor((geometry.length - 1) * ((i + 1) / count)));
    boxes.push(routeBbox(geometry.slice(start, end + 1), padding));
  }
  return boxes;
}

async function runOverpass(query, timeoutMs) {
  const response = await fetch('/api/overpass', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, timeoutMs })
  });

  if (!response.ok) {
    let message = `/api/overpass ${response.status}`;
    try {
      const error = await response.json();
      message = error.error || message;
    } catch {}
    throw new Error(message);
  }

  return await response.json();
}

function normalizeFuelStation(element) {
  const lat = typeof element.lat === "number" ? element.lat : element.center?.lat;
  const lng = typeof element.lon === "number" ? element.lon : element.center?.lon;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const tags = element.tags || {};
  return { id: `${element.type}-${element.id}`, lat, lng, name: tags.name || tags.brand || tags.operator || "Tankstation", brand: tags.brand || tags.operator || tags.name || "", address: [tags["addr:street"], tags["addr:housenumber"]].filter(Boolean).join(" "), postalCode: tags["addr:postcode"] || "", city: tags["addr:city"] || "", distanceToRoute: Infinity, distanceAlongRoute: Infinity };
}

function attachRouteDistances(stations, geometry) {
  const segments = [];
  let cumulative = 0;
  for (let i = 1; i < geometry.length; i++) {
    const a = geometry[i - 1];
    const b = geometry[i];
    const length = haversine(a[1], a[0], b[1], b[0]);
    segments.push({ start: a, end: b, startMeters: cumulative, length });
    cumulative += length;
  }

  return stations.map(station => {
    let best = Infinity;
    let along = Infinity;
    for (const segment of segments) {
      const projection = projectPointToSegment(station.lat, station.lng, segment.start[1], segment.start[0], segment.end[1], segment.end[0]);
      if (projection.distanceMeters < best) {
        best = projection.distanceMeters;
        along = segment.startMeters + segment.length * projection.t;
      }
    }
    return { ...station, distanceToRoute: best, distanceAlongRoute: along };
  });
}

async function fetchPriceData() {
  const response = await fetch(`/api/fuel-prices?v=${Date.now()}`, { cache: "no-store" });
  if (!response.ok) throw new Error(`/api/fuel-prices ${response.status}`);
  return await response.json();
}

function attachDirectPrice(station, fuelType) {
  const product = chooseProduct(station.prices || [], fuelType);
  return product ? { ...station, price: Number(product.price), priceProduct: product.productName || product.displayName || product.fuelType, priceSource: station.source } : { ...station, price: null };
}

function attachMatchedPrice(station, priceData, fuelType) {
  let best = null;
  for (const candidate of priceData.stations || []) {
    const score = scorePriceMatch(station, candidate);
    if (!best || score.value > best.score) best = { candidate, score: score.value };
  }
  if (!best || best.score < 50) return { ...station, price: null };
  const product = chooseProduct(best.candidate.prices || [], fuelType);
  return product ? { ...station, price: Number(product.price), priceProduct: product.productName || product.displayName || product.fuelType, priceSource: best.candidate.source } : { ...station, price: null };
}

function scorePriceMatch(osm, price) {
  let score = 0;
  if (normalizeBrand(osm.brand || osm.name) === normalizeBrand(price.brand || price.name)) score += 35;
  if (sharesToken(osm.name, price.name)) score += 20;
  if (sharesToken(osm.address, price.addressText)) score += 25;
  if (osm.postalCode && price.postalCode && String(osm.postalCode) === String(price.postalCode)) score += 18;
  if (Number.isFinite(price.lat) && Number.isFinite(price.lng)) {
    const meters = haversine(osm.lat, osm.lng, price.lat, price.lng);
    if (meters < 120) score += 60;
    else if (meters < 350) score += 46;
    else if (meters < 900) score += 28;
    else if (meters < 1800) score += 12;
  }
  return { value: score };
}

function chooseProduct(prices, fuelType) {
  const candidates = prices.filter(price => Number.isFinite(Number(price.price)));
  const text = price => normalizeText(`${price.code} ${price.octane} ${price.fuelType} ${price.productName} ${price.displayName}`);

  if (fuelType === "diesel") return candidates.find(p => /diesel/.test(text(p)) && !/premium|plus|extra|deluxe|hvo/.test(text(p))) || candidates.find(p => /diesel/.test(text(p))) || null;
  if (fuelType === "premiumDiesel") return candidates.find(p => /diesel/.test(text(p)) && /premium|plus|extra|deluxe/.test(text(p))) || candidates.find(p => /diesel/.test(text(p))) || null;
  if (fuelType === "benzin98") return candidates.find(p => /98|100|e5|oktan 98|oktan 100|blyfri 98/.test(text(p)) && !/diesel/.test(text(p))) || null;
  return candidates.find(p => /95|e10|blyfri 95|miles 95|benzin|gasoline|petrol/.test(text(p)) && !/98|100|premium|diesel/.test(text(p))) || candidates.find(p => /benzin|gasoline|petrol/.test(text(p)) && !/diesel/.test(text(p))) || null;
}

function openSettings() {
  syncSettingsUi();
  els.settingsModal.classList.remove("hidden");
  els.settingsBackdrop.classList.remove("hidden");
}

function closeSettings() {
  els.settingsModal.classList.add("hidden");
  els.settingsBackdrop.classList.add("hidden");
}

function saveSettings() {
  if (els.fuelTypeSelect) state.settings.fuelType = els.fuelTypeSelect.value;
  if (els.fuelDetourSelect) state.settings.maxFuelDetourMeters = Number(els.fuelDetourSelect.value);
  if (els.fuelAlongSelect) state.settings.fuelAlongMeters = Number(els.fuelAlongSelect.value);
  if (els.fuelSortSelect) state.settings.fuelSort = els.fuelSortSelect.value;
  if (els.routeModeSelect) state.settings.routeMode = els.routeModeSelect.value;

  localStorage.setItem(SETTINGS_KEY, JSON.stringify(state.settings));
  closeSettings();
  if (state.route) refreshFuel().catch(console.warn);
}

function loadSettings() {
  try { state.settings = { ...state.settings, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}") }; } catch {}
}

function syncSettingsUi() {
  if (els.fuelTypeSelect) els.fuelTypeSelect.value = state.settings.fuelType || "benzin95";
  if (els.fuelDetourSelect) els.fuelDetourSelect.value = String(state.settings.maxFuelDetourMeters || 5000);
  if (els.fuelAlongSelect) els.fuelAlongSelect.value = String(state.settings.fuelAlongMeters || 50000);
  if (els.fuelSortSelect) els.fuelSortSelect.value = state.settings.fuelSort || "cheapest";
  if (els.routeModeSelect) els.routeModeSelect.value = state.settings.routeMode || "fast";
}

function loadHistory() {
  try { state.history = JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]"); } catch { state.history = []; }
}

function saveHistory(destination) {
  const item = { label: destination.label, displayName: destination.displayName, lat: destination.lat, lng: destination.lng };
  state.history = [item, ...state.history.filter(old => old.label !== item.label)].slice(0, 5);
  localStorage.setItem(HISTORY_KEY, JSON.stringify(state.history));
}

function renderHistory() {
  if (!state.history.length) {
    els.historySection.classList.add("hidden");
    return;
  }
  els.historySection.classList.remove("hidden");
  els.historyList.innerHTML = state.history.map((item, index) => `<button type="button" data-index="${index}"><strong>${escapeHtml(item.label)}</strong><small>${escapeHtml(item.displayName || "")}</small></button>`).join("");
  [...els.historyList.querySelectorAll("button")].forEach(button => {
    button.addEventListener("click", () => {
      const item = state.history[Number(button.dataset.index)];
      state.selectedAutocomplete = { ...item };
      els.destinationInput.value = item.label;
    });
  });
}

function setStatus(text) { els.statusText.textContent = text; }

function routeBbox(geometry, padding) {
  let south = Infinity, west = Infinity, north = -Infinity, east = -Infinity;
  for (const point of geometry) {
    south = Math.min(south, point[1]);
    north = Math.max(north, point[1]);
    west = Math.min(west, point[0]);
    east = Math.max(east, point[0]);
  }
  return { south: south - padding, west: west - padding, north: north + padding, east: east + padding };
}

function parseMaxspeed(value) {
  if (!value) return null;
  const text = String(value).toLowerCase();
  if (text.includes("none")) return 130;
  const match = text.match(/\d+/);
  if (!match) return null;
  let speed = Number(match[0]);
  if (text.includes("mph")) speed = Math.round(speed * 1.60934);
  return speed >= 5 && speed <= 140 ? speed : null;
}

function getCurrentPosition() {
  return new Promise(resolve => {
    if (!navigator.geolocation) { resolve({ lat: 55.6761, lng: 12.5683, speed: 0, heading: 0 }); return; }
    navigator.geolocation.getCurrentPosition(position => resolve(normalizePosition(position)), () => resolve({ lat: 55.6761, lng: 12.5683, speed: 0, heading: 0 }), { enableHighAccuracy: true, maximumAge: 1000, timeout: 9000 });
  });
}

function normalizePosition(position) {
  return { lat: position.coords.latitude, lng: position.coords.longitude, speed: typeof position.coords.speed === "number" ? Math.max(0, position.coords.speed * 3.6) : 0, heading: typeof position.coords.heading === "number" ? position.coords.heading : 0, accuracy: typeof position.coords.accuracy === "number" ? position.coords.accuracy : null };
}

async function requestWakeLock() { try { if ("wakeLock" in navigator) state.wakeLock = await navigator.wakeLock.request("screen"); } catch {} }
async function releaseWakeLock() { try { if (state.wakeLock) await state.wakeLock.release(); } catch {} state.wakeLock = null; }

function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...options, signal: controller.signal }).finally(() => clearTimeout(timeout));
}

function haversine(lat1, lng1, lat2, lng2) {
  const radius = 6371000;
  const toRad = value => value * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return radius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function projectPointToSegment(lat, lng, lat1, lng1, lat2, lng2) {
  const mLat = 111320;
  const mLng = 111320 * Math.cos(lat * Math.PI / 180);
  const px = lng * mLng;
  const py = lat * mLat;
  const ax = lng1 * mLng;
  const ay = lat1 * mLat;
  const bx = lng2 * mLng;
  const by = lat2 * mLat;
  const dx = bx - ax;
  const dy = by - ay;
  const len = dx * dx + dy * dy;
  if (!len) return { t: 0, distanceMeters: Math.hypot(px - ax, py - ay) };
  let t = ((px - ax) * dx + (py - ay) * dy) / len;
  t = clamp(t, 0, 1);
  return { t, distanceMeters: Math.hypot(px - (ax + t * dx), py - (ay + t * dy)) };
}

function formatDistance(meters) {
  if (!Number.isFinite(meters)) return "—";
  if (meters < 1000) return `${Math.round(meters)} m`;
  if (meters < 10000) return `${(meters / 1000).toFixed(1).replace(".", ",")} km`;
  return `${Math.round(meters / 1000)} km`;
}

function formatDuration(seconds) {
  if (!Number.isFinite(seconds)) return "—";
  const minutes = Math.max(1, Math.round(seconds / 60));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} t ${rest} min` : `${hours} t`;
}

function escapeHtml(value) {
  return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}

function normalizeBrand(value) {
  const text = normalizeText(value);
  if (text.includes("circle")) return "circle k";
  if (text.includes("ingo")) return "ingo";
  if (text.includes("ok")) return "ok";
  if (text.includes("uno")) return "uno-x";
  if (text.includes("q8")) return "q8";
  if (text.includes("shell")) return "shell";
  return text;
}

function normalizeText(value) {
  return String(value || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/æ/g, "ae").replace(/ø/g, "oe").replace(/å/g, "aa").replace(/[^a-z0-9]+/g, " ").trim();
}

function sharesToken(a, b) {
  const ignore = new Set(["vej", "gade", "alle", "tank", "station", "automat", "circle", "ingo", "uno", "ok"]);
  const aTokens = normalizeText(a).split(" ").filter(token => token.length > 2 && !ignore.has(token));
  const bTokens = new Set(normalizeText(b).split(" ").filter(token => token.length > 2 && !ignore.has(token)));
  return aTokens.some(token => bTokens.has(token));
}

function dedupeStations(stations) {
  const seen = new Set();
  return stations.filter(station => {
    const key = station.id || `${Math.round(station.lat * 10000)}:${Math.round(station.lng * 10000)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function dedupeById(items) {
  const seen = new Set();
  return items.filter(item => {
    const key = item.id || `${item.lat}:${item.lng}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }


function sortFuelStations(a,b){
  const mode=state.settings.fuelSort||"cheapest";
  if(mode==="detour")return a.distanceToRoute-b.distanceToRoute;
  if(mode==="upcoming")return a.distanceAlongRoute-b.distanceAlongRoute;
  if(Number.isFinite(a.price)&&Number.isFinite(b.price))return a.price-b.price;
  if(Number.isFinite(a.price))return-1;
  if(Number.isFinite(b.price))return 1;
  return a.distanceAlongRoute-b.distanceAlongRoute;
}



function on(element, eventName, handler) {
  if (!element) {
    console.warn("Kan ikke binde event", eventName);
    return;
  }
  element.addEventListener(eventName, handler);
}

function safeRun(fn, label) {
  try {
    return fn();
  } catch (error) {
    console.error(`GreenWave startup step failed: ${label}`, error);
    showStartupError(error, label);
    return null;
  }
}

function showStartupError(error, label = "startup") {
  console.error(error);
  const box = document.createElement("div");
  box.style.cssText = "position:fixed;left:12px;right:12px;bottom:12px;z-index:99999;background:#230b0b;color:#fff;border:1px solid #ff6868;border-radius:16px;padding:12px;font-family:system-ui;font-size:13px;box-shadow:0 16px 50px rgba(0,0,0,.45)";
  box.innerHTML = `<strong>GreenWave fejl (${label})</strong><br>${String(error?.message || error)}`;
  document.body.appendChild(box);
}


function splitDisplayAddress(displayName) {
  const text = String(displayName || "").trim();
  const parts = text.split(",").map(part => part.trim()).filter(Boolean);
  if (parts.length >= 2) return { title: parts[0], subtitle: parts.slice(1).join(", ") };

  const match = text.match(/^(.+?\d+[A-Za-z]?)\s+(\d{4}\s+.+)$/);
  if (match) return { title: match[1], subtitle: match[2] };

  return { title: text || "Destination", subtitle: "" };
}
