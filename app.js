// ================= STATE =================
const state = {
  map: null,
  currentPosition: null,
  destination: null,
  selectedAutocompleteItem: null,

  routeData: null,
  routeLine: null,
  userMarker: null,
  destMarker: null,

  fuelPriceOverrides: [],
  osmFuelStations: [],
  fuelMarkers: [],

  settings: {
    region: "dk",
    fuelType: "benzin95",
    searchRadiusBase: 100000
  }
};

// ================= INIT =================
init();

async function init() {
  initMap();
  bindEvents();
  await loadFuelPrices();
}

// ================= MAP =================
function initMap() {
  state.map = L.map("map").setView([56.2, 9.5], 7);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19
  }).addTo(state.map);
}

// ================= EVENTS =================
function bindEvents() {
  document.getElementById("calcRouteBtn").onclick = calculateRoute;
}

// ================= ROUTE =================
async function calculateRoute() {
  const input = document.getElementById("destinationInput").value.trim();
  if (!input) return;

  state.currentPosition = await getPosition();

  const dest = await geocode(input);
  state.destination = dest;

  const route = await fetchRoute(state.currentPosition, dest);
  state.routeData = route;

  drawRoute(route.geometry);

  await loadFuelStations(route.geometry);
  applyPricesToStations();
  updateFuelMarkers();
  updateFuelBox();
}

// ================= OSM STATIONS =================
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
  } catch (e) {
    console.error(e);
    state.osmFuelStations = [];
  }
}

function sampleRoutePoints(geometry) {
  const points = [];

  for (let i = 0; i < geometry.length; i += 80) {
    points.push({
      lng: geometry[i][0],
      lat: geometry[i][1]
    });
  }

  if (geometry.length) {
    const last = geometry[geometry.length - 1];
    points.push({ lng: last[0], lat: last[1] });
  }

  const seen = new Set();

  return points
    .filter(p => {
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
    lat,
    lng,
    name,
    brand,
    address,
    city: tags["addr:city"] || "",
    price: null,
    source: "OSM",
    matchMode: null
  };
}

// ================= PRICES =================
async function loadFuelPrices() {
  try {
    const res = await fetch("./fuel-prices.json", { cache: "no-store" });
    const raw = await res.json();
    state.fuelPriceOverrides = normalizeFuelPrices(Array.isArray(raw) ? raw : []);
    console.log("Prisposter:", state.fuelPriceOverrides.length);
  } catch {
    state.fuelPriceOverrides = [];
  }
}

function normalizeFuelPrices(rawStations) {
  const out = [];

  rawStations.forEach(station => {
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
    }
  });

  return out;
}

function applyPricesToStations() {
  state.osmFuelStations = state.osmFuelStations.map(station => {
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
  const candidates = state.fuelPriceOverrides.filter(item =>
    item.fuelType === state.settings.fuelType &&
    typeof item.price === "number" &&
    isFuelRecordCompatible(item)
  );

  if (!candidates.length) return null;

  const stationBrand = normalizeBrand(station.brand || station.name);
  const stationName = normalizeText(station.name);
  const stationCity = normalizeText(station.city || extractCity(station.address));

  const coordMatches = candidates
    .filter(item => Number.isFinite(item.lat) && Number.isFinite(item.lng))
    .map(item => ({
      ...item,
      distance: haversine(
        station.lat,
        station.lng,
        item.lat,
        item.lng
      ),
      matchMode: "koordinat"
    }))
    .filter(item => item.distance <= 150)
    .sort((a, b) => a.distance - b.distance);

  if (coordMatches.length) return coordMatches[0];

  const scored = candidates
    .map(item => {
      const itemBrand = normalizeBrand(item.brand || item.name);
      const itemName = normalizeText(item.name);
      const itemCity = normalizeText(item.city || extractCity(item.address));

      let score = 0;

      if (stationBrand && itemBrand && stationBrand === itemBrand) score += 60;
      if (stationCity && itemCity && stationCity === itemCity) score += 35;

      if (stationName && itemName) {
        if (stationName === itemName) score += 40;
        else if (stationName.includes(itemName) || itemName.includes(stationName)) score += 25;
        else score += sharedWordScore(stationName, itemName);
      }

      return {
        ...item,
        score,
        matchMode: "brand/navn/by"
      };
    })
    .filter(item => item.score >= 45)
    .sort((a, b) => b.score - a.score || a.price - b.price);

  if (scored.length) return scored[0];

  const sameBrand = candidates
    .filter(item => normalizeBrand(item.brand || item.name) === stationBrand)
    .sort((a, b) => a.price - b.price);

  if (sameBrand.length) {
    return {
      ...sameBrand[0],
      matchMode: "samme brand fallback"
    };
  }

  return null;
}

function isFuelRecordCompatible(item) {
  if (state.settings.region === "us") {
    return item.country === "US" || item.currency === "USD" || item.unit === "gallon";
  }

  return item.country !== "US" && item.currency !== "USD";
}

// ================= FILTER =================
function getSearchRadiusMeters() {
  const base = state.settings.searchRadiusBase;

  if (state.settings.region === "us") {
    return (base / 1000) * 1609.344;
  }

  return base;
}

function getFuelCandidates() {
  if (!state.currentPosition) return [];

  const radius = getSearchRadiusMeters();

  return state.osmFuelStations
    .filter(s => typeof s.price === "number")
    .map(s => {
      const distanceFromCurrent = haversine(
        state.currentPosition.lat,
        state.currentPosition.lng,
        s.lat,
        s.lng
      );

      const distanceToRoute = state.routeData
        ? distanceToRouteMetersFromGeometry({ lat: s.lat, lng: s.lng }, state.routeData.geometry)
        : 0;

      return {
        ...s,
        distanceFromCurrent,
        distanceToRoute,
        extraDetourMeters: distanceToRoute * 2
      };
    })
    .filter(s => s.distanceFromCurrent <= radius);
}

// ================= UI =================
function updateFuelBox() {
  const el = document.getElementById("fuelContent");
  if (!el) return;

  const candidates = getFuelCandidates();

  if (!state.routeData) {
    el.innerHTML = "Beregn en rute først.";
    return;
  }

  if (!candidates.length) {
    el.innerHTML = `
      <div class="fuel-name">Ingen prisdata fundet</div>
      <div class="fuel-meta">Tankstationer fundet: ${state.osmFuelStations.length}</div>
      <div class="fuel-meta">Prisposter: ${state.fuelPriceOverrides.length}</div>
    `;
    return;
  }

  const best = candidates
    .slice()
    .sort((a, b) => a.price - b.price || a.distanceFromCurrent - b.distanceFromCurrent)[0];

  el.innerHTML = `
    <div class="fuel-name">${escapeHtml(best.name)}</div>
    <div class="fuel-price">${formatPrice(best.price)}</div>
    <div class="fuel-meta">Afstand: ${formatDistance(best.distanceFromCurrent)}</div>
    <div class="fuel-meta">Fra rute: ${formatDistance(best.distanceToRoute)}</div>
    <div class="fuel-meta">Match: ${escapeHtml(best.matchMode || "prisdata")}</div>
    <a class="fuel-link" href="${buildGoogleMapsLink(best)}" target="_blank">
      Åbn via Google Maps
    </a>
  `;
}

// ================= MARKERS =================
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
      html: `
        <div class="fuel-price-label ${isBest ? "best" : ""}">
          ${formatPriceShort(s.price)}
        </div>
      `,
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
        <a href="${buildGoogleMapsLink(s)}" target="_blank">Åbn via Google Maps</a>
      `);

    state.fuelMarkers.push(marker);
  });
}

function clearFuelMarkers() {
  state.fuelMarkers.forEach(m => state.map.removeLayer(m));
  state.fuelMarkers = [];
}

// ================= ROUTE DRAW =================
function drawRoute(geometry) {
  if (state.routeLine) state.map.removeLayer(state.routeLine);

  const latlngs = geometry.map(p => [p[1], p[0]]);

  state.routeLine = L.polyline(latlngs, {
    color: "#5ea2ff",
    weight: 6,
    opacity: 0.9
  }).addTo(state.map);

  state.map.fitBounds(state.routeLine.getBounds(), {
    padding: [30, 30]
  });
}

// ================= API =================
async function geocode(q) {
  const country = state.settings.region === "us" ? "us" : "dk";

  const res = await fetch(
    `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=${country}&q=${encodeURIComponent(q)}`
  );

  const data = await res.json();

  if (!data.length) throw new Error("Destination ikke fundet");

  return {
    lat: Number(data[0].lat),
    lng: Number(data[0].lon),
    displayName: data[0].display_name
  };
}

async function fetchRoute(from, to) {
  const res = await fetch(
    `https://router.project-osrm.org/route/v1/driving/${from.lng},${from.lat};${to.lng},${to.lat}?overview=full&geometries=geojson`
  );

  const data = await res.json();

  if (!data.routes?.length) throw new Error("Ingen rute fundet");

  return {
    geometry: data.routes[0].geometry.coordinates,
    distance: data.routes[0].distance,
    duration: data.routes[0].duration
  };
}

// ================= GEO =================
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

// ================= HELPERS =================
function dedupeStations(stations) {
  const result = [];

  stations.forEach(s => {
    const duplicate = result.find(x =>
      haversine(s.lat, s.lng, x.lat, x.lng) < 35
    );

    if (!duplicate) result.push(s);
  });

  return result;
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

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
