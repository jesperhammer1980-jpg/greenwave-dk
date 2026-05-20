import { state } from "./state.js";
import { els } from "./dom.js";

import {
  escapeHtml,
  formatDistance,
  formatPrice,
  haversine,
  projectPointToSegment,
  normalizeBrand,
  buildGoogleMapsLink
} from "./utils.js";

export async function loadFuelStations(geometry) {
  state.fuelStations = [];

  if (!Array.isArray(geometry) || geometry.length < 2) return;

  const sample = sampleRoutePoints(geometry);

  const query = `
    [out:json][timeout:25];
    (
      ${sample.map(point => `
        node(around:4500,${point.lat},${point.lng})["amenity"="fuel"];
        way(around:4500,${point.lat},${point.lng})["amenity"="fuel"];
      `).join("")}
    );
    out center tags;
  `;

  try {
    const res = await fetch(
      "https://overpass-api.de/api/interpreter",
      {
        method: "POST",
        headers: {
          "Content-Type": "text/plain;charset=UTF-8"
        },
        body: query
      }
    );

    const data = await res.json();

    state.fuelStations = dedupe(
      (data.elements || [])
        .map(normalizeStation)
        .filter(Boolean)
    );
  } catch {
    state.fuelStations = [];
  }

  if (!state.fuelStations.length) {
    state.fuelStations = createFallbackStations(geometry);
  }
}

export function computeRouteDistances() {
  const route = state.routeData?.geometry || [];
  const segments = [];

  let cumulative = 0;

  for (let i = 1; i < route.length; i++) {
    const start = route[i - 1];
    const end = route[i];

    const length = haversine(
      start[1],
      start[0],
      end[1],
      end[0]
    );

    segments.push({
      start,
      end,
      startMeters: cumulative,
      length
    });

    cumulative += length;
  }

  state.fuelStations.forEach(station => {
    let bestDistance = Infinity;
    let bestAlong = Infinity;

    segments.forEach(segment => {
      const projected = projectPointToSegment(
        station.lat,
        station.lng,
        segment.start[1],
        segment.start[0],
        segment.end[1],
        segment.end[0]
      );

      if (projected.distanceMeters < bestDistance) {
        bestDistance = projected.distanceMeters;
        bestAlong =
          segment.startMeters +
          segment.length * projected.t;
      }
    });

    station.distanceToRoute =
      Number.isFinite(bestDistance)
        ? bestDistance
        : station.distanceToRoute;

    station.distanceAlongRoute =
      Number.isFinite(bestAlong)
        ? bestAlong
        : station.distanceAlongRoute;
  });
}

export function applyPricesToStations() {
  state.fuelStations = state.fuelStations.map(station => {
    const brand = normalizeBrand(station.brand || station.name);

    let price =
      state.settings.fuelType === "diesel"
        ? 12.99
        : 14.99;

    if (brand === "ingo" || brand === "uno-x") price -= 0.25;
    if (brand === "circle k" || brand === "shell") price += 0.2;
    if (station.isFallback) price -= 0.05;

    return {
      ...station,
      price,
      brandLabel: label(brand),
      dataAgeLabel:
        station.isFallback
          ? "Estimeret fallback"
          : "Estimeret pris",
      favoriteScore: favorite(station)
    };
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
    els.fuelContent.innerHTML = `
      <div class="fuel-name">Ingen tankstationer fundet</div>
      <div class="fuel-meta">Prøv igen eller øg radius senere.</div>
    `;
    return;
  }

  const best = stations[0];

  els.fuelContent.innerHTML = `
    <div class="fuel-name">${escapeHtml(best.name)}</div>
    <div class="fuel-meta">
      ${escapeHtml(best.brandLabel || best.brand || "Ukendt")}
      · ${formatDistance(best.distanceAlongRoute)} langs ruten
    </div>
    <div class="fuel-meta">
      ${formatDistance(best.distanceToRoute)} fra ruten
      · ${escapeHtml(best.dataAgeLabel)}
    </div>
    <div class="fuel-price">${formatPrice(best.price)}</div>
  `;
}

export function updateFuelMarkers() {
  clearFuelMarkers();

  getStations().slice(0, 5).forEach(station => {
    const icon = L.divIcon({
      className: "fuel-marker",
      html: `
        <div class="fuel-overview-pin">
          ${escapeHtml((station.brandLabel || "⛽").slice(0, 2).toUpperCase())}
          ${formatPrice(station.price)}
        </div>
      `,
      iconSize: [115, 38],
      iconAnchor: [57, 38]
    });

    const marker = L.marker(
      [station.lat, station.lng],
      {
        icon,
        zIndexOffset: 8500,
        keyboard: false
      }
    ).addTo(state.map);

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

  els.fuelListContent.innerHTML = stations.length
    ? stations.map(station => `
      <article class="fuel-card">
        <div class="fuel-name">${escapeHtml(station.name)}</div>
        <div class="fuel-meta">
          ${escapeHtml(station.brandLabel || station.brand || "Ukendt")}
          · ${formatDistance(station.distanceAlongRoute)} langs ruten
          · ${formatDistance(station.distanceToRoute)} fra ruten
        </div>
        <div class="fuel-price">${formatPrice(station.price)}</div>
        <a class="fuel-map-link" href="${buildGoogleMapsLink(station)}" target="_blank">
          Åbn i Google Maps
        </a>
      </article>
    `).join("")
    : `<div class="fuel-card">Ingen tankstationer fundet.</div>`;
}

function getStations() {
  const favorite = normalizeBrand(state.settings.favoriteFuelBrand);

  let stations = state.fuelStations.filter(
    station =>
      station.distanceToRoute <= 6000 ||
      station.isFallback
  );

  if (
    favorite !== "all" &&
    state.settings.favoriteMode === "only"
  ) {
    stations = stations.filter(
      station =>
        normalizeBrand(station.brand || station.name) === favorite
    );
  }

  stations.sort((a, b) => {
    if (state.fuelListSort === "detour") {
      return a.distanceToRoute - b.distanceToRoute;
    }

    return (
      a.price - b.price ||
      a.distanceToRoute - b.distanceToRoute
    );
  });

  return stations.slice(0, 12);
}

function normalizeStation(element) {
  const lat =
    typeof element.lat === "number"
      ? element.lat
      : element.center?.lat;

  const lng =
    typeof element.lon === "number"
      ? element.lon
      : element.center?.lon;

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  const tags = element.tags || {};

  const name =
    tags.name ||
    tags.brand ||
    tags.operator ||
    "Tankstation";

  const brand =
    tags.brand ||
    tags.operator ||
    name;

  return {
    id: `${element.type}-${element.id}`,
    lat,
    lng,
    name,
    brand,
    distanceToRoute: Infinity,
    distanceAlongRoute: Infinity
  };
}

function createFallbackStations(geometry) {
  const brands = ["OK", "Circle K", "Uno-X", "Q8"];
  const positions = [0.18, 0.38, 0.62, 0.82];

  return positions.map((ratio, index) => {
    const point = geometry[
      Math.max(
        0,
        Math.min(
          geometry.length - 1,
          Math.round((geometry.length - 1) * ratio)
        )
      )
    ];

    return {
      id: `fallback-${index}`,
      lat: point[1] + (index % 2 ? 0.008 : -0.008),
      lng: point[0] + (index % 2 ? -0.008 : 0.008),
      name: `${brands[index]} langs ruten`,
      brand: brands[index],
      brandLabel: brands[index],
      address: "",
      price: null,
      distanceAlongRoute: Infinity,
      distanceToRoute: 1200 + index * 250,
      favoriteScore: 0,
      isFallback: true
    };
  });
}

function sampleRoutePoints(geometry) {
  const points = [];

  for (let i = 0; i < 22; i++) {
    const index = Math.round((geometry.length - 1) * (i / 21));
    const point = geometry[index];

    if (point) {
      points.push({
        lng: point[0],
        lat: point[1]
      });
    }
  }

  return points;
}

function dedupe(stations) {
  const seen = new Set();

  return stations.filter(station => {
    const key = station.id;

    if (seen.has(key)) return false;

    seen.add(key);

    return true;
  });
}

function favorite(station) {
  const fav = normalizeBrand(state.settings.favoriteFuelBrand);

  return (
    fav !== "all" &&
    normalizeBrand(station.brand || station.name) === fav
  )
    ? 1
    : 0;
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
