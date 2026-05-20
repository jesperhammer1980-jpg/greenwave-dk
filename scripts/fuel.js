import { state } from "./state.js";
import { els } from "./dom.js";
import { escapeHtml, formatDistance, formatPrice, haversine, projectPointToSegment, normalizeBrand, buildGoogleMapsLink } from "./utils.js";

export async function loadFuelStations(geometry) {
  const sample = sampleRoutePoints(geometry);
  const query = `[out:json][timeout:25];(${sample.map(p => `node(around:2500,${p.lat},${p.lng})["amenity"="fuel"];way(around:2500,${p.lat},${p.lng})["amenity"="fuel"];`).join("")});out center tags;`;

  try {
    const res = await fetch("https://overpass-api.de/api/interpreter", { method: "POST", headers: { "Content-Type": "text/plain;charset=UTF-8" }, body: query });
    const data = await res.json();
    state.fuelStations = (data.elements || []).map(normalizeStation).filter(Boolean);
  } catch {
    state.fuelStations = [];
  }
}

export function computeRouteDistances() {
  const route = state.routeData?.geometry || [];
  const segments = [];
  let cumulative = 0;

  for (let i = 1; i < route.length; i++) {
    const start = route[i - 1], end = route[i];
    const length = haversine(start[1], start[0], end[1], end[0]);
    segments.push({ start, end, startMeters: cumulative, length });
    cumulative += length;
  }

  state.fuelStations.forEach(station => {
    let bestDistance = Infinity, bestAlong = Infinity;
    segments.forEach(segment => {
      const projected = projectPointToSegment(station.lat, station.lng, segment.start[1], segment.start[0], segment.end[1], segment.end[0]);
      if (projected.distanceMeters < bestDistance) {
        bestDistance = projected.distanceMeters;
        bestAlong = segment.startMeters + segment.length * projected.t;
      }
    });
    station.distanceToRoute = bestDistance;
    station.distanceAlongRoute = bestAlong;
  });
}

export function applyPricesToStations() {
  state.fuelStations = state.fuelStations.map(station => {
    const brand = normalizeBrand(station.brand || station.name);
    let price = state.settings.fuelType === "diesel" ? 12.99 : 14.99;
    if (brand === "ingo" || brand === "uno-x") price -= 0.25;
    if (brand === "circle k" || brand === "shell") price += 0.2;
    return { ...station, price, brandLabel: label(brand), dataAgeLabel: "Estimeret pris", favoriteScore: favorite(station) };
  });
}

export function updateFuelBox() {
  if (!els.fuelContent) return;
  if (!state.routeData) {
    els.fuelContent.textContent = "Beregn en rute først.";
    return;
  }

  const stations = getStations();
  if (!stations.length) {
    els.fuelContent.innerHTML = `<div class="fuel-name">Ingen tankstationer fundet</div>`;
    return;
  }

  const best = stations[0];
  els.fuelContent.innerHTML = `
    <div class="fuel-name">${escapeHtml(best.name)}</div>
    <div class="fuel-meta">${escapeHtml(best.brandLabel || best.brand || "Ukendt")} · ${formatDistance(best.distanceAlongRoute)} langs ruten</div>
    <div class="fuel-meta">${formatDistance(best.distanceToRoute)} fra ruten · ${escapeHtml(best.dataAgeLabel)}</div>
    <div class="fuel-price">${formatPrice(best.price)}</div>
  `;
}

export function updateFuelMarkers() {
  clearFuelMarkers();
  getStations().slice(0, 5).forEach(station => {
    const icon = L.divIcon({
      className: "fuel-marker",
      html: `<div class="fuel-overview-pin">${escapeHtml((station.brandLabel || "⛽").slice(0,2).toUpperCase())} ${formatPrice(station.price)}</div>`,
      iconSize: [105, 38],
      iconAnchor: [52, 38]
    });
    const marker = L.marker([station.lat, station.lng], { icon }).addTo(state.map);
    state.fuelMarkers.push(marker);
  });
}

export function clearFuelMarkers() {
  state.fuelMarkers.forEach(marker => state.map.removeLayer(marker));
  state.fuelMarkers = [];
}

export function openFuelList() {
  renderFuelList();
  els.fuelListModal.classList.remove("hidden");
  els.fuelListBackdrop.classList.remove("hidden");
}

export function closeFuelList() {
  els.fuelListModal.classList.add("hidden");
  els.fuelListBackdrop.classList.add("hidden");
}

export function renderFuelList() {
  const stations = getStations();
  els.fuelListContent.innerHTML = stations.length ? stations.map(station => `
    <article class="fuel-card">
      <div class="fuel-name">${escapeHtml(station.name)}</div>
      <div class="fuel-meta">${escapeHtml(station.brandLabel || station.brand || "Ukendt")} · ${formatDistance(station.distanceAlongRoute)} langs ruten · ${formatDistance(station.distanceToRoute)} fra ruten</div>
      <div class="fuel-price">${formatPrice(station.price)}</div>
      <a class="fuel-map-link" href="${buildGoogleMapsLink(station)}" target="_blank">Åbn i Google Maps</a>
    </article>
  `).join("") : `<div class="fuel-card">Ingen tankstationer fundet.</div>`;
}

function getStations() {
  const favorite = normalizeBrand(state.settings.favoriteFuelBrand);
  let stations = state.fuelStations.filter(s => s.distanceToRoute <= 2500);

  if (favorite !== "all" && state.settings.favoriteMode === "only") {
    stations = stations.filter(s => normalizeBrand(s.brand || s.name) === favorite);
  }

  stations.sort((a, b) => {
    if (state.fuelListSort === "detour") return a.distanceToRoute - b.distanceToRoute;
    return (a.price - b.price) || (a.distanceToRoute - b.distanceToRoute);
  });

  return stations.slice(0, 12);
}

function normalizeStation(el) {
  const lat = typeof el.lat === "number" ? el.lat : el.center?.lat;
  const lng = typeof el.lon === "number" ? el.lon : el.center?.lon;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  const tags = el.tags || {};
  const name = tags.name || tags.brand || tags.operator || "Tankstation";
  const brand = tags.brand || tags.operator || name;

  return { id: `${el.type}-${el.id}`, lat, lng, name, brand, distanceToRoute: Infinity, distanceAlongRoute: Infinity };
}

function sampleRoutePoints(geometry) {
  const points = [];
  for (let i = 0; i < 18; i++) {
    const index = Math.round((geometry.length - 1) * (i / 17));
    const p = geometry[index];
    if (p) points.push({ lng: p[0], lat: p[1] });
  }
  return points;
}

function favorite(station) {
  const fav = normalizeBrand(state.settings.favoriteFuelBrand);
  return fav !== "all" && normalizeBrand(station.brand || station.name) === fav ? 1 : 0;
}

function label(brand) {
  if (brand === "circle k") return "Circle K";
  if (brand === "uno-x") return "Uno-X";
  if (brand === "q8") return "Q8";
  if (brand === "ok") return "OK";
  if (brand === "ingo") return "Ingo";
  if (brand === "shell") return "Shell";
  return brand;
}
