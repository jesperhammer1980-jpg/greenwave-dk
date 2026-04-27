// ================= STATE =================
const state = {
  map: null,
  currentPosition: null,
  destination: null,
  routeData: null,
  routeLine: null,

  osmFuelStations: [],
  fuelMarkers: [],

  settings: {
    routeLimitKm: 100 // 50 / 100 / 200
  }
};

// ================= INIT =================
init();

function init() {
  initMap();
  bindUI();
}

// ================= MAP =================
function initMap() {
  state.map = L.map("map").setView([56.2, 9.5], 7);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png")
    .addTo(state.map);
}

// ================= UI =================
function bindUI() {
  document.getElementById("calcRouteBtn").onclick = calculateRoute;
  document.getElementById("openFuelListBtn").onclick = showFuelList;

  document.getElementById("range50").onclick = () => state.settings.routeLimitKm = 50;
  document.getElementById("range100").onclick = () => state.settings.routeLimitKm = 100;
  document.getElementById("range200").onclick = () => state.settings.routeLimitKm = 200;
}

// ================= ROUTE =================
async function calculateRoute() {
  const input = document.getElementById("destinationInput").value;

  state.currentPosition = await getPosition();
  const dest = await geocode(input);

  const route = await fetchRoute(state.currentPosition, dest);
  state.routeData = route;

  drawRoute(route.geometry);

  await loadFuelStations(route.geometry);
  computeRouteDistances();
  updateMarkers();
}

// ================= OSM =================
async function loadFuelStations(geometry) {
  const sample = geometry.filter((_, i) => i % 50 === 0);

  const query = `
    [out:json];
    (
      ${sample.map(p => `
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
    distanceAlongRoute: Infinity
  }));
}

// ================= DISTANCE ALONG ROUTE =================
function computeRouteDistances() {
  const route = state.routeData.geometry;

  let cumulative = 0;
  const segments = [];

  for (let i = 1; i < route.length; i++) {
    const d = haversine(route[i-1][1], route[i-1][0], route[i][1], route[i][0]);
    cumulative += d;

    segments.push({
      start: route[i-1],
      end: route[i],
      distStart: cumulative - d,
      distEnd: cumulative
    });
  }

  state.osmFuelStations.forEach(station => {
    let best = Infinity;

    segments.forEach(seg => {
      const d = distanceToSegment(
        station.lat, station.lng,
        seg.start[1], seg.start[0],
        seg.end[1], seg.end[0]
      );

      if (d < 2000) {
        best = Math.min(best, seg.distStart);
      }
    });

    station.distanceAlongRoute = best;
  });
}

// ================= FILTER =================
function getStationsInRange() {
  const limit = state.settings.routeLimitKm * 1000;

  return state.osmFuelStations
    .filter(s => s.distanceAlongRoute <= limit)
    .sort((a, b) => a.distanceAlongRoute - b.distanceAlongRoute)
    .slice(0, 10);
}

// ================= UI =================
function showFuelList() {
  const stations = getStationsInRange();

  if (!stations.length) {
    alert("Ingen stationer fundet på ruten");
    return;
  }

  alert(
    stations.map(s =>
      `${s.name} - ${(s.distanceAlongRoute/1000).toFixed(1)} km`
    ).join("\n")
  );
}

// ================= MARKERS =================
function updateMarkers() {
  clearMarkers();

  getStationsInRange().forEach(s => {
    const m = L.marker([s.lat, s.lng])
      .addTo(state.map)
      .bindPopup(`${s.name}`);

    state.fuelMarkers.push(m);
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

// ================= HELPERS =================
function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const toRad = x => x * Math.PI/180;

  const dLat = toRad(lat2-lat1);
  const dLon = toRad(lon2-lon1);

  const a = Math.sin(dLat/2)**2 +
    Math.cos(toRad(lat1)) *
    Math.cos(toRad(lat2)) *
    Math.sin(dLon/2)**2;

  return 2*R*Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

function distanceToSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;

  const t = ((px-ax)*dx + (py-ay)*dy) / (dx*dx + dy*dy);
  const tt = Math.max(0, Math.min(1, t));

  const x = ax + tt*dx;
  const y = ay + tt*dy;

  return haversine(py, px, y, x);
}

async function getPosition() {
  return new Promise(res => {
    navigator.geolocation.getCurrentPosition(p =>
      res({ lat: p.coords.latitude, lng: p.coords.longitude })
    );
  });
}

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
