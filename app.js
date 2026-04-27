const state = {
  map: null,
  currentPosition: null,
  destination: null,
  routeData: null,
  routeLine: null,

  fuelPriceOverrides: [],
  osmFuelStations: [],
  fuelMarkers: [],

  settings: {
    region: "dk",
    fuelType: "benzin95",
    routeLimitKm: 100
  }
};

init();

async function init() {
  initMap();
  bindUI();
  await loadFuelPrices();
}

function initMap() {
  state.map = L.map("map").setView([56.2, 9.5], 7);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "© OpenStreetMap"
  }).addTo(state.map);
}

function bindUI() {
  document.getElementById("calcRouteBtn")?.addEventListener("click", calculateRoute);
  document.getElementById("openFuelListBtn")?.addEventListener("click", showFuelList);
  document.getElementById("closeFuelListBtn")?.addEventListener("click", closeFuelList);
  document.getElementById("fuelListBackdrop")?.addEventListener("click", closeFuelList);

  document.getElementById("settingsSearchRadius")?.addEventListener("change", (e) => {
    state.settings.routeLimitKm = Number(e.target.value) / 1000;
    updateMarkers();
    updateFuelBox();
  });
}

async function calculateRoute() {
  const input = document.getElementById("destinationInput").value.trim();
  if (!input) return;

  state.currentPosition = await getPosition();
  state.destination = await geocode(input);

  state.routeData = await fetchRoute(state.currentPosition, state.destination);

  drawRoute(state.routeData.geometry);

  await loadFuelStations(state.routeData.geometry);
  computeRouteDistances();
  applyPricesToStations();

  updateMarkers();
  updateFuelBox();

  const listBtn = document.getElementById("openFuelListBtn");
  if (listBtn) listBtn.disabled = false;
}

async function loadFuelPrices() {
  try {
    const res = await fetch("./fuel-prices.json", { cache: "no-store" });
    const raw = await res.json();
    state.fuelPriceOverrides = normalizeFuelPrices(Array.isArray(raw) ? raw : []);

    const d = document.getElementById("fuelDisclaimer");
    if (d) d.textContent = `Prisposter: ${state.fuelPriceOverrides.length}`;
  } catch {
    state.fuelPriceOverrides = [];
  }
}

function normalizeFuelPrices(rawStations) {
  const out = [];

  rawStations.forEach(station => {
    const country = String(station.country || station.market || "DK").toUpperCase();

    if (station.fuelTypes && typeof station.fuelTypes === "object") {
      Object.entries(station.fuelTypes).forEach(([fuelType, data]) => {
        if (!data || typeof data.price !== "number") return;

        out.push({
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
          source: data.source || "fuel-prices.json",
          updatedAt: data.updatedAt || null
        });
      });
    }
  });

  return out;
}

async function loadFuelStations(geometry) {
  const sample = sampleRoutePoints(geometry);

  const query = `
    [out:json][timeout:25];
    (
      ${sample.map(p => `
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
      .map(normalizeOsmStation)
      .filter(Boolean)
  );
}

function sampleRoutePoints(geometry) {
  const points = [];
  const maxSamples = 20;

  for (let i = 0; i < maxSamples; i++) {
    const index = Math.round((geometry.length - 1) * (i / (maxSamples - 1)));
    const p = geometry[index];
    points.push({ lng: p[0], lat: p[1] });
  }

  const seen = new Set();

  return points.filter(p => {
    const key = `${p.lat.toFixed(3)},${p.lng.toFixed(3)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function normalizeOsmStation(el) {
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
    matchMode: null,
    distanceAlongRoute: Infinity,
    distanceToRoute: Infinity
  };
}

function computeRouteDistances() {
  const route = state.routeData.geometry;

  let cumulative = 0;
  const segments = [];

  for (let i = 1; i < route.length; i++) {
    const start = route[i - 1];
    const end = route[i];
    const length = haversine(start[1], start[0], end[1], end[0]);

    segments.push({
      start,
      end,
      startMeters: cumulative,
      endMeters: cumulative + length,
      length
    });

    cumulative += length;
  }

  state.osmFuelStations.forEach(station => {
    let bestDistanceToRoute = Infinity;
    let bestAlong = Infinity;

    segments.forEach(seg => {
      const projected = projectPointToSegment(
        station.lat,
        station.lng,
        seg.start[1],
        seg.start[0],
        seg.end[1],
        seg.end[0]
      );

      if (projected.distanceMeters < bestDistanceToRoute) {
        bestDistanceToRoute = projected.distanceMeters;
        bestAlong = seg.startMeters + seg.length * projected.t;
      }
    });

    station.distanceToRoute = bestDistanceToRoute;
    station.distanceAlongRoute = bestAlong;
  });
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
    isCompatiblePrice(item)
  );

  if (!candidates.length) return null;

  const stationBrand = normalizeBrand(station.brand || station.name);
  const stationName = normalizeText(station.name);
  const stationCity = normalizeText(station.city || extractCity(station.address));

  const coordinateMatch = candidates
    .filter(item => Number.isFinite(item.lat) && Number.isFinite(item.lng))
    .map(item => ({
      ...item,
      distance: haversine(station.lat, station.lng, item.lat, item.lng),
      matchMode: "koordinat"
    }))
    .filter(item => item.distance <= 150)
    .sort((a, b) => a.distance - b.distance)[0];

  if (coordinateMatch) return coordinateMatch;

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
    .sort((a, b) => a.price - b.price)[0];

  if (sameBrand) {
    return {
      ...sameBrand,
      matchMode: "samme brand fallback"
    };
  }

  return null;
}

function getStationsInRange() {
  const limit = state.settings.routeLimitKm * 1000;

  const stations = state.osmFuelStations
    .filter(s => s.distanceAlongRoute <= limit)
    .filter(s => s.distanceToRoute <= 2500);

  const withPrice = stations
    .filter(s => typeof s.price === "number")
    .sort((a, b) => a.price - b.price || a.distanceAlongRoute - b.distanceAlongRoute);

  const withoutPrice = stations
    .filter(s => typeof s.price !== "number")
    .sort((a, b) => a.distanceAlongRoute - b.distanceAlongRoute);

  return [...withPrice, ...withoutPrice].slice(0, 10);
}

function updateFuelBox() {
  const el = document.getElementById("fuelContent");
  if (!el) return;

  if (!state.routeData) {
    el.innerHTML = "Beregn en rute først.";
    return;
  }

  const stations = getStationsInRange();
  const priced = stations.filter(s => typeof s.price === "number");

  if (!stations.length) {
    el.innerHTML = `
      <div class="fuel-name">Ingen tankstationer fundet</div>
      <div class="fuel-meta">Inden for de første ${state.settings.routeLimitKm} km af ruten.</div>
    `;
    return;
  }

  if (!priced.length) {
    el.innerHTML = `
      <div class="fuel-name">Pris mangler</div>
      <div class="fuel-meta">Tankstationer fundet: ${stations.length}</div>
      <div class="fuel-meta">Prisposter: ${state.fuelPriceOverrides.length}</div>
      <div class="fuel-meta">USA kræver særskilte amerikanske prisdata.</div>
    `;
    return;
  }

  const best = priced[0];

  el.innerHTML = `
    <div class="fuel-name">${escapeHtml(best.name)}</div>
    <div class="fuel-price">${formatPrice(best.price)}</div>
    <div class="fuel-meta">Langs ruten: ${formatDistance(best.distanceAlongRoute)}</div>
    <div class="fuel-meta">Fra rute: ${formatDistance(best.distanceToRoute)}</div>
    <div class="fuel-meta">Match: ${escapeHtml(best.matchMode || "prisdata")}</div>
    <a class="fuel-link" href="${buildGoogleMapsLink(best)}" target="_blank" rel="noopener noreferrer">
      Åbn via Google Maps
    </a>
  `;
}

function showFuelList() {
  renderFuelList();

  document.getElementById("fuelListModal")?.classList.remove("hidden");
  document.getElementById("fuelListBackdrop")?.classList.remove("hidden");
}

function closeFuelList() {
  document.getElementById("fuelListModal")?.classList.add("hidden");
  document.getElementById("fuelListBackdrop")?.classList.add("hidden");
}

function renderFuelList() {
  const el = document.getElementById("fuelListContent");
  if (!el) return;

  const stations = getStationsInRange();

  if (!stations.length) {
    el.innerHTML = `<div class="fuel-list-empty">Ingen stationer fundet inden for valgt afstand langs ruten.</div>`;
    return;
  }

  el.innerHTML = stations.map((s, i) => `
    <article class="fuel-list-item">
      <div class="fuel-list-item-top">
        <div>
          <div class="fuel-list-name">${i + 1}. ${escapeHtml(s.name)}</div>
          <div class="fuel-list-brand">${escapeHtml(s.brand || "Ukendt")}</div>
        </div>
        <div class="fuel-list-price">
          ${typeof s.price === "number" ? formatPrice(s.price) : "Pris mangler"}
        </div>
      </div>

      <div class="fuel-list-meta-grid">
        <div class="fuel-list-meta">Langs ruten<br><strong>${formatDistance(s.distanceAlongRoute)}</strong></div>
        <div class="fuel-list-meta">Fra rute<br><strong>${formatDistance(s.distanceToRoute)}</strong></div>
        <div class="fuel-list-meta">Match<br><strong>${escapeHtml(s.matchMode || "—")}</strong></div>
        <div class="fuel-list-meta">Kilde<br><strong>${escapeHtml(s.source || "OSM")}</strong></div>
      </div>

      <div class="fuel-list-actions">
        <a class="fuel-list-map-link" href="${buildGoogleMapsLink(s)}" target="_blank" rel="noopener noreferrer">
          Åbn via Google Maps
        </a>
      </div>
    </article>
  `).join("");
}

function updateMarkers() {
  clearMarkers();

  getStationsInRange().forEach((s, index) => {
    const isBest = typeof s.price === "number" && index === 0;

    const icon = L.divIcon({
      className: "fuel-price-marker",
      html: `
        <div class="fuel-price-label ${isBest ? "best" : ""} ${typeof s.price !== "number" ? "no-price" : ""}">
          ${typeof s.price === "number" ? formatPriceShort(s.price) : "—"}
        </div>
      `,
      iconSize: [74, 34],
      iconAnchor: [37, 17]
    });

    const marker = L.marker([s.lat, s.lng], { icon })
      .addTo(state.map)
      .bindPopup(`
        <strong>${escapeHtml(s.name)}</strong><br>
        ${typeof s.price === "number" ? formatPrice(s.price) : "Pris mangler"}<br>
        Langs ruten: ${formatDistance(s.distanceAlongRoute)}<br>
        Fra rute: ${formatDistance(s.distanceToRoute)}<br>
        <a href="${buildGoogleMapsLink(s)}" target="_blank" rel="noopener noreferrer">Åbn via Google Maps</a>
      `);

    state.fuelMarkers.push(marker);
  });
}

function clearMarkers() {
  state.fuelMarkers.forEach(m => state.map.removeLayer(m));
  state.fuelMarkers = [];
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

async function getPosition() {
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      p => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
      reject,
      { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 }
    );
  });
}

async function geocode(q) {
  const res = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${encodeURIComponent(q)}`);
  const data = await res.json();

  if (!data.length) throw new Error("Destination ikke fundet");

  return {
    lat: Number(data[0].lat),
    lng: Number(data[0].lon)
  };
}

async function fetchRoute(from, to) {
  const res = await fetch(
    `https://router.project-osrm.org/route/v1/driving/${from.lng},${from.lat};${to.lng},${to.lat}?overview=full&geometries=geojson`
  );

  const data = await res.json();

  if (!data.routes?.length) throw new Error("Ingen rute fundet");

  return {
    geometry: data.routes[0].geometry.coordinates
  };
}

function projectPointToSegment(pxLat, pxLng, aLat, aLng, bLat, bLng) {
  const meanLatRad = ((pxLat + aLat + bLat) / 3) * Math.PI / 180;
  const mLat = 111320;
  const mLng = 111320 * Math.cos(meanLatRad);

  const px = pxLng * mLng;
  const py = pxLat * mLat;
  const ax = aLng * mLng;
  const ay = aLat * mLat;
  const bx = bLng * mLng;
  const by = bLat * mLat;

  const dx = bx - ax;
  const dy = by - ay;

  if (dx === 0 && dy === 0) {
    return { distanceMeters: Math.hypot(px - ax, py - ay), t: 0 };
  }

  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  const cx = ax + t * dx;
  const cy = ay + t * dy;

  return {
    distanceMeters: Math.hypot(px - cx, py - cy),
    t
  };
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

function dedupeStations(stations) {
  const result = [];

  stations.forEach(s => {
    if (!result.some(x => haversine(s.lat, s.lng, x.lat, x.lng) < 35)) {
      result.push(s);
    }
  });

  return result;
}

function isCompatiblePrice(item) {
  if (state.settings.region === "us") {
    return item.country === "US" || item.currency === "USD" || item.unit === "gallon";
  }

  return item.country !== "US" && item.currency !== "USD";
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
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function formatPrice(price) {
  if (state.settings.region === "us") return `$${Number(price).toFixed(2)}/gal`;
  return `${Number(price).toFixed(2).replace(".", ",")} kr/L`;
}

function formatPriceShort(price) {
  if (state.settings.region === "us") return `$${Number(price).toFixed(2)}`;
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
