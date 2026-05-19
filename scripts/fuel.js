import { state } from "./state.js";
import { els } from "./dom.js";

import {
  escapeHtml,
  formatDistance,
  formatPrice,
  formatPriceShort,
  haversine,
  normalizeBrand,
  buildGoogleMapsLink
} from "./utils.js";

import {
  estimateUsFuelPrice
} from "./usa-fuel-estimates.js";

export async function loadFuelPrices() {
  state.fuelPricesLoaded = true;
}

export async function loadFuelStations(geometry = []) {
  if (!Array.isArray(geometry) || !geometry.length) {
    state.fuelStations = [];
    return;
  }

  const sample = sampleRoutePoints(geometry);

  const query = `
    [out:json][timeout:25];
    (
      ${sample.map(point => `
        node(around:2500,${point.lat},${point.lng})["amenity"="fuel"];
        way(around:2500,${point.lat},${point.lng})["amenity"="fuel"];
      `).join("")}
    );
    out center tags;
  `;

  try {
    const response = await fetch(
      "https://overpass-api.de/api/interpreter",
      {
        method: "POST",
        headers: {
          "Content-Type": "text/plain;charset=UTF-8"
        },
        body: query
      }
    );

    if (!response.ok) {
      throw new Error("Kunne ikke hente tankstationer");
    }

    const data = await response.json();

    state.fuelStations = dedupeStations(
      (data.elements || [])
        .map(normalizeOsmStation)
        .filter(Boolean)
    );
  } catch (error) {
    console.warn("Fuel stations fejl", error);
    state.fuelStations = [];
  }
}

export function computeRouteDistances() {
  if (!state.routeData?.geometry?.length) {
    return;
  }

  const route = state.routeData.geometry;
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

    station.distanceToRoute = bestDistance;
    station.distanceAlongRoute = bestAlong;
  });
}

export function applyPricesToStations() {
  state.fuelStations = state.fuelStations.map(station => {
    const estimate =
      state.settings.region === "us"
        ? estimateUsFuelPrice(station, state.settings.fuelType)
        : estimateDanishFuelPrice(station);

    return {
      ...station,
      price: estimate.price,
      currency: estimate.currency,
      unit: estimate.unit,
      source: estimate.source,
      matchMode: estimate.matchMode,
      dataAgeLabel: estimate.dataAgeLabel,
      brandLabel: getFuelBrandLabel(station.brand || station.name),
      favoriteScore: getFavoriteScore(station)
    };
  });
}

export function updateFuelBox() {
  if (!els.fuelContent) {
    return;
  }

  if (!state.routeData) {
    els.fuelContent.innerHTML = "Beregn en rute først.";
    return;
  }

  const stations = getStationsInRange();

  if (!stations.length) {
    els.fuelContent.innerHTML = `
      <div class="fuel-name">Ingen tankstationer fundet</div>
      <div class="fuel-meta">Prøv større søgeradius under settings.</div>
    `;
    return;
  }

  const best = stations[0];

  els.fuelContent.innerHTML = `
    <div class="fuel-station-card">
      <div class="fuel-brand-logo">
        <span>${escapeHtml(getFuelBrandInitials(best.brand || best.name))}</span>
      </div>

      <div class="fuel-info">
        <div class="fuel-name">${escapeHtml(best.name)}</div>
        <div class="fuel-meta">
          ${escapeHtml(best.brandLabel || best.brand || "Ukendt")}
          · ${formatDistance(best.distanceAlongRoute)} langs ruten
        </div>
        <div class="fuel-meta">
          ${formatDistance(best.distanceToRoute)} fra ruten
        </div>
        <div class="fuel-meta">
          ${escapeHtml(best.dataAgeLabel || "Estimeret pris")}
        </div>
      </div>

      <div class="fuel-price">
        ${typeof best.price === "number" ? formatPrice(best.price) : "—"}
      </div>
    </div>

    <a
      class="fuel-map-link"
      href="${buildGoogleMapsLink(best)}"
      target="_blank"
      rel="noopener noreferrer"
    >
      Åbn via Google Maps
    </a>
  `;
}

export function openFuelList() {
  renderFuelList();

  els.fuelListModal?.classList.remove("hidden");
  els.fuelListBackdrop?.classList.remove("hidden");
}

export function closeFuelList() {
  els.fuelListModal?.classList.add("hidden");
  els.fuelListBackdrop?.classList.add("hidden");
}

export function renderFuelList() {
  if (!els.fuelListContent) {
    return;
  }

  const stations = getStationsInRange();

  if (!stations.length) {
    els.fuelListContent.innerHTML = `
      <div class="fuel-list-empty">
        Ingen tankstationer fundet på ruten.
      </div>
    `;
    return;
  }

  els.fuelListContent.innerHTML = stations
    .map((station, index) => renderFuelListItem(station, index))
    .join("");
}

export function updateFuelMarkers() {
  clearFuelMarkers();

  if (!state.map) {
    return;
  }

  getStationsInRange()
    .slice(0, 5)
    .forEach((station, index) => {
      const marker = L.marker(
        [station.lat, station.lng],
        {
          icon: createFuelIcon(station, index),
          zIndexOffset: 6000 - index
        }
      )
        .addTo(state.map)
        .bindPopup(renderFuelPopup(station));

      state.fuelMarkers.push(marker);
    });
}

export function clearFuelMarkers() {
  if (!state.map) {
    state.fuelMarkers = [];
    return;
  }

  state.fuelMarkers.forEach(marker => {
    state.map.removeLayer(marker);
  });

  state.fuelMarkers = [];
}

export function openFuelHistory() {}
export function closeFuelHistory() {}

function getStationsInRange() {
  const limit = Number(state.settings.searchRadiusBase || 100000);

  let stations = state.fuelStations
    .filter(station => station.distanceAlongRoute <= limit)
    .filter(station => station.distanceToRoute <= 2500);

  const favorite = normalizeBrand(state.settings.favoriteFuelBrand || "all");

  if (
    favorite !== "all" &&
    state.settings.favoriteFuelMode === "only"
  ) {
    stations = stations.filter(station =>
      normalizeBrand(station.brand || station.name) === favorite
    );
  }

  const favoriteBoost =
    state.settings.favoriteFuelMode === "boost"
      ? 0.18
      : 0;

  stations.sort((a, b) => {
    if (state.fuelListSort === "detour") {
      return (
        b.favoriteScore - a.favoriteScore ||
        a.distanceToRoute - b.distanceToRoute ||
        adjustedPrice(a, favoriteBoost) -
          adjustedPrice(b, favoriteBoost)
      );
    }

    return (
      adjustedPrice(a, favoriteBoost) -
        adjustedPrice(b, favoriteBoost) ||
      a.distanceToRoute - b.distanceToRoute
    );
  });

  return stations.slice(0, 12);
}

function adjustedPrice(station, favoriteBoost) {
  if (typeof station.price !== "number") {
    return Infinity;
  }

  return station.price - station.favoriteScore * favoriteBoost;
}

function getFavoriteScore(station) {
  const favorite = normalizeBrand(state.settings.favoriteFuelBrand || "all");

  if (favorite === "all") {
    return 0;
  }

  return normalizeBrand(station.brand || station.name) === favorite ? 1 : 0;
}

function estimateDanishFuelPrice(station) {
  const base =
    state.settings.fuelType === "diesel"
      ? 12.99
      : 14.99;

  const brand = normalizeBrand(station.brand || station.name);

  let adjustment = 0;

  if (brand === "ingo" || brand === "uno-x") {
    adjustment = -0.25;
  }

  if (brand === "circle k" || brand === "shell") {
    adjustment = 0.2;
  }

  return {
    price: base + adjustment,
    currency: "DKK",
    unit: "liter",
    source: "Estimat",
    matchMode: "estimat",
    dataAgeLabel: "Estimeret pris"
  };
}

function renderFuelListItem(station, index) {
  return `
    <article class="fuel-list-item">
      <div class="fuel-list-item-top">
        <div class="fuel-brand-logo">
          <span>${escapeHtml(getFuelBrandInitials(station.brand || station.name))}</span>
        </div>

        <div class="fuel-list-title-wrap">
          <div class="fuel-list-name">
            ${index + 1}. ${escapeHtml(station.name)}
          </div>

          <div class="fuel-list-brand">
            ${escapeHtml(station.brandLabel || station.brand || "Ukendt")}
            ${
              station.favoriteScore
                ? `<span class="favorite-pill">Favorit</span>`
                : ""
            }
          </div>
        </div>

        <div class="fuel-list-price">
          ${typeof station.price === "number" ? formatPrice(station.price) : "—"}
        </div>
      </div>

      <div class="fuel-list-meta-grid">
        <div class="fuel-list-meta">
          Langs ruten
          <strong>${formatDistance(station.distanceAlongRoute)}</strong>
        </div>

        <div class="fuel-list-meta">
          Fra rute
          <strong>${formatDistance(station.distanceToRoute)}</strong>
        </div>

        <div class="fuel-list-meta">
          Kilde
          <strong>${escapeHtml(station.source || "OSM")}</strong>
        </div>

        <div class="fuel-list-meta">
          Status
          <strong>${escapeHtml(station.dataAgeLabel || "—")}</strong>
        </div>
      </div>

      <div class="fuel-list-actions">
        <a
          class="fuel-list-map-link"
          href="${buildGoogleMapsLink(station)}"
          target="_blank"
          rel="noopener noreferrer"
        >
          Åbn via Google Maps
        </a>
      </div>
    </article>
  `;
}

function createFuelIcon(station, index) {
  return L.divIcon({
    className: "fuel-overview-marker",
    html: `
      <div class="fuel-overview-pin ${index === 0 ? "best" : ""}">
        <div class="fuel-overview-logo">
          ${escapeHtml(getFuelBrandInitials(station.brand || station.name))}
        </div>

        <div class="fuel-overview-price">
          ${typeof station.price === "number" ? formatPriceShort(station.price) : "—"}
        </div>
      </div>
    `,
    iconSize: [118, 44],
    iconAnchor: [59, 44]
  });
}

function renderFuelPopup(station) {
  return `
    <strong>${escapeHtml(station.name)}</strong><br>
    ${typeof station.price === "number" ? formatPrice(station.price) : "Pris mangler"}<br>
    Langs ruten: ${formatDistance(station.distanceAlongRoute)}<br>
    Fra rute: ${formatDistance(station.distanceToRoute)}<br>
    ${escapeHtml(station.dataAgeLabel || "")}<br>
    <a href="${buildGoogleMapsLink(station)}" target="_blank" rel="noopener noreferrer">
      Åbn via Google Maps
    </a>
  `;
}

function normalizeOsmStation(element) {
  const lat =
    typeof element.lat === "number"
      ? element.lat
      : element.center?.lat;

  const lng =
    typeof element.lon === "number"
      ? element.lon
      : element.center?.lon;

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return null;
  }

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
    brandLabel: getFuelBrandLabel(brand),
    address: "",
    price: null,
    distanceAlongRoute: Infinity,
    distanceToRoute: Infinity,
    favoriteScore: 0
  };
}

function sampleRoutePoints(geometry) {
  const points = [];
  const maxSamples = 22;

  for (let i = 0; i < maxSamples; i++) {
    const index = Math.round(
      (geometry.length - 1) *
      (i / (maxSamples - 1))
    );

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

function dedupeStations(stations) {
  const seen = new Set();

  return stations.filter(station => {
    const key = station.id;

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

function projectPointToSegment(
  lat,
  lng,
  lat1,
  lng1,
  lat2,
  lng2
) {
  const metersPerDegreeLat = 111320;
  const metersPerDegreeLng =
    111320 * Math.cos(lat * Math.PI / 180);

  const px = lng * metersPerDegreeLng;
  const py = lat * metersPerDegreeLat;

  const ax = lng1 * metersPerDegreeLng;
  const ay = lat1 * metersPerDegreeLat;

  const bx = lng2 * metersPerDegreeLng;
  const by = lat2 * metersPerDegreeLat;

  const dx = bx - ax;
  const dy = by - ay;

  const lengthSquared = dx * dx + dy * dy;

  if (lengthSquared === 0) {
    return {
      t: 0,
      distanceMeters: Math.hypot(px - ax, py - ay)
    };
  }

  let t =
    ((px - ax) * dx + (py - ay) * dy) /
    lengthSquared;

  t = Math.max(0, Math.min(1, t));

  return {
    t,
    distanceMeters: Math.hypot(
      px - (ax + t * dx),
      py - (ay + t * dy)
    )
  };
}

function getFuelBrandLabel(value) {
  const brand = normalizeBrand(value);

  if (brand === "circle k") return "Circle K";
  if (brand === "shell") return "Shell";
  if (brand === "q8") return "Q8";
  if (brand === "ok") return "OK";
  if (brand === "ingo") return "Ingo";
  if (brand === "uno-x") return "Uno-X";
  if (brand === "f24") return "F24";
  if (brand === "goon") return "Go’on";

  return value || "";
}

function getFuelBrandInitials(value) {
  const brand = getFuelBrandLabel(value).toUpperCase();

  if (brand.includes("CIRCLE")) return "CK";
  if (brand.includes("SHELL")) return "SH";
  if (brand.includes("Q8")) return "Q8";
  if (brand.includes("OK")) return "OK";
  if (brand.includes("INGO")) return "IN";
  if (brand.includes("UNO")) return "UX";
  if (brand.includes("F24")) return "F24";
  if (brand.includes("GO")) return "GO";

  return brand.slice(0, 2) || "⛽";
}
