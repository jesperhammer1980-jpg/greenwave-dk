const state = {
  map: null,
  currentPosition: null,
  destination: null,
  routeData: null,
  routeLine: null,
  userMarker: null,
  destMarker: null,

  fuelPriceOverrides: [],
  osmFuelStations: [],
  currentFuelStation: null,

  settings: {
    fuelType: "benzin95",
    maxDetourMeters: 2000
  }
};

const FUEL_DATA_URL = "./fuel-prices.json";

init();

async function init() {
  initMap();
  bindEvents();
  await loadFuelPrices();
}

function initMap() {
  state.map = L.map("map").setView([56.2639, 9.5018], 7);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "&copy; OpenStreetMap"
  }).addTo(state.map);
}

function bindEvents() {
  document.getElementById("calcRouteBtn").onclick = calculateRoute;
}

async function loadFuelPrices() {
  try {
    const res = await fetch(FUEL_DATA_URL);
    state.fuelPriceOverrides = await res.json();
    console.log("Fuel loaded:", state.fuelPriceOverrides.length);
  } catch {
    console.log("Fuel load failed");
  }
}

async function calculateRoute() {
  const input = document.getElementById("destinationInput").value;
  if (!input) return;

  const pos = await getPosition();

  const dest = await geocode(input);

  drawRoute(pos, dest);

  await loadFuelStations();

  updateFuel();
}

async function getPosition() {
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (p) =>
        resolve({
          lat: p.coords.latitude,
          lng: p.coords.longitude
        }),
      reject
    );
  });
}

async function geocode(query) {
  const res = await fetch(
    `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
      query
    )}`
  );
  const data = await res.json();
  return {
    lat: Number(data[0].lat),
    lng: Number(data[0].lon)
  };
}

function drawRoute(from, to) {
  if (state.routeLine) state.map.removeLayer(state.routeLine);

  const line = [
    [from.lat, from.lng],
    [to.lat, to.lng]
  ];

  state.routeLine = L.polyline(line, { color: "blue" }).addTo(state.map);
  state.map.fitBounds(state.routeLine.getBounds());
}

async function loadFuelStations() {
  const res = await fetch(
    "https://overpass-api.de/api/interpreter",
    {
      method: "POST",
      body: `[out:json];node["amenity"="fuel"](55,7,58,13);out;`
    }
  );

  const data = await res.json();

  state.osmFuelStations = data.elements.map((el) => ({
    lat: el.lat,
    lng: el.lon,
    name: el.tags?.name || "Station"
  }));
}

function updateFuel() {
  const el = document.getElementById("fuelContent");

  if (!state.osmFuelStations.length || !state.fuelPriceOverrides.length) {
    el.innerHTML = "Ingen prisdata fundet";
    return;
  }

  const best = state.osmFuelStations
    .map((station) => {
      const price = findFuelPriceOverride(station);
      if (!price) return null;

      return {
        ...station,
        price: price.price
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.price - b.price)[0];

  if (!best) {
    el.innerHTML = "Ingen prisdata fundet";
    return;
  }

  el.innerHTML = `
    <b>${best.name}</b><br>
    ${best.price.toFixed(2)} kr/L
  `;
}

function findFuelPriceOverride(osmStation) {
  const fuelType = state.settings.fuelType;

  const candidates = state.fuelPriceOverrides.filter(
    (item) =>
      item.fuelType === fuelType &&
      typeof item.price === "number"
  );

  if (!candidates.length) return null;

  return candidates.sort((a, b) => a.price - b.price)[0];
}
