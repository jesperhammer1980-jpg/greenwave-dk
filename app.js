// ================= STATE =================
const state = {
  map: null,
  currentPosition: null,
  destination: null,

  routeLine: null,
  routeData: null,

  userMarker: null,
  destMarker: null,

  fuelPriceOverrides: [],
  osmFuelStations: [],
  fuelMarkers: [],

  watchId: null,

  settings: {
    fuelType: "benzin95",
    searchRadius: 100000
  }
};

// ================= INIT =================
init();

async function init() {
  initMap();
  bindUI();
  await loadFuelPrices();
}

// ================= MAP =================
function initMap() {
  state.map = L.map("map").setView([56.2, 9.5], 7);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png").addTo(state.map);
}

// ================= UI =================
function bindUI() {
  document.getElementById("calcRouteBtn").onclick = calculateRoute;
  document.getElementById("startNavBtn").onclick = startNav;
  document.getElementById("openFuelListBtn").onclick = showFuelList;
  document.getElementById("openSettingsBtn").onclick = () => alert("Settings virker igen 👍");
}

// ================= ROUTE =================
async function calculateRoute() {
  const input = document.getElementById("destinationInput").value;

  state.currentPosition = await getPosition();
  state.destination = await geocode(input);

  const route = await fetchRoute(state.currentPosition, state.destination);
  state.routeData = route;

  drawRoute(route.geometry);

  await loadFuelStations(route.geometry);
  applyPrices();

  updateFuelMarkers();
  updateFuelBox();

  document.getElementById("startNavBtn").disabled = false;
  document.getElementById("openFuelListBtn").disabled = false;
}

// ================= NAV =================
function startNav() {
  alert("Live navigation startet (simpel version)");
}

// ================= OSM =================
async function loadFuelStations(geometry) {
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
    name: el.tags?.name || "Tankstation",
    brand: normalize(el.tags?.brand || ""),
    price: null
  }));
}

// ================= PRISER =================
async function loadFuelPrices() {
  try {
    const res = await fetch("./fuel-prices.json");
    state.fuelPriceOverrides = await res.json();
  } catch {
    state.fuelPriceOverrides = [];
  }
}

function applyPrices() {
  state.osmFuelStations = state.osmFuelStations.map(s => {
    const match = state.fuelPriceOverrides.find(p =>
      normalize(p.brand) === s.brand
    );

    if (match) {
      s.price = match.price;
    }

    return s;
  });
}

// ================= UI OUTPUT =================
function updateFuelBox() {
  const el = document.getElementById("fuelContent");

  const stations = state.osmFuelStations.filter(s => s.price);

  if (!stations.length) {
    el.innerHTML = "Ingen prisdata";
    return;
  }

  const best = stations.sort((a, b) => a.price - b.price)[0];

  el.innerHTML = `
    <strong>${best.name}</strong><br>
    ${best.price.toFixed(2)} kr/L
  `;
}

// ================= LISTE =================
function showFuelList() {
  const stations = state.osmFuelStations
    .filter(s => s.price)
    .sort((a, b) => a.price - b.price)
    .slice(0, 10);

  alert(
    stations.map(s => `${s.name} - ${s.price}`).join("\n")
  );
}

// ================= MARKERS =================
function updateFuelMarkers() {
  clearMarkers();

  state.osmFuelStations
    .filter(s => s.price)
    .slice(0, 10)
    .forEach(s => {
      const marker = L.marker([s.lat, s.lng])
        .addTo(state.map)
        .bindPopup(`${s.name}<br>${s.price}`);

      state.fuelMarkers.push(marker);
    });
}

function clearMarkers() {
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
  return new Promise((res, rej) => {
    navigator.geolocation.getCurrentPosition(pos => {
      res({
        lat: pos.coords.latitude,
        lng: pos.coords.longitude
      });
    }, rej);
  });
}

// ================= HELPERS =================
function normalize(text) {
  return (text || "").toLowerCase().replace(/\s/g, "");
}
