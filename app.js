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
    searchRadiusBase: 100000 // 100 km default
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
  const input = document.getElementById("destinationInput").value;

  state.currentPosition = await getPosition();

  const dest = await geocode(input);
  state.destination = dest;

  const route = await fetchRoute(state.currentPosition, dest);
  state.routeData = route;

  drawRoute(route.geometry);

  await loadFuelStations(route.geometry);
  updateFuelMarkers();
}

// ================= OSM (FIXED!) =================
async function loadFuelStations(geometry) {
  try {
    const points = geometry.slice(0, 20);

    const query = `
      [out:json];
      (
        ${points.map(p => `
          node(around:2500,${p[1]},${p[0]})["amenity"="fuel"];
        `).join("")}
      );
      out;
    `;

    const res = await fetch("https://overpass-api.de/api/interpreter", {
      method: "POST",
      body: query
    });

    const data = await res.json();

    state.osmFuelStations = data.elements.map(el => ({
      lat: el.lat,
      lng: el.lon,
      name: el.tags?.name || "Tankstation"
    }));

  } catch (e) {
    console.error(e);
    state.osmFuelStations = [];
  }
}

// ================= FILTER =================
function getSearchRadiusMeters() {
  const base = state.settings.searchRadiusBase;

  if (state.settings.region === "us") {
    return (base / 1000) * 1609;
  }

  return base;
}

function getFuelCandidates() {
  const radius = getSearchRadiusMeters();

  return state.osmFuelStations.filter(s => {
    const d = haversine(
      state.currentPosition.lat,
      state.currentPosition.lng,
      s.lat,
      s.lng
    );
    return d <= radius;
  });
}

// ================= MARKERS =================
function updateFuelMarkers() {
  clearFuelMarkers();

  const stations = getFuelCandidates();

  stations.slice(0, 10).forEach(s => {
    const marker = L.marker([s.lat, s.lng])
      .addTo(state.map)
      .bindPopup(s.name);

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

  state.routeLine = L.polyline(latlngs).addTo(state.map);
  state.map.fitBounds(state.routeLine.getBounds());
}

// ================= API =================
async function geocode(q) {
  const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${q}`);
  const data = await res.json();

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

  return {
    geometry: data.routes[0].geometry.coordinates
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
    }, reject);
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

// ================= FUEL DATA =================
async function loadFuelPrices() {
  try {
    const res = await fetch("./fuel-prices.json");
    state.fuelPriceOverrides = await res.json();
  } catch {
    state.fuelPriceOverrides = [];
  }
}
