import { state, FUEL_DATA_URL } from "./state.js";
import { els } from "./dom.js";

import {
  buildGoogleMapsLink,
  dedupeStations,
  escapeHtml,
  extractCity,
  formatDistance,
  formatPrice,
  formatPriceShort,
  haversine,
  normalizeBrand,
  normalizeText,
  numberOrNull,
  projectPointToSegment,
  sharedWordScore
} from "./utils.js";

import {
  estimateUsFuelPrice
} from "./usa-fuel-estimates.js";

export async function loadFuelPrices() {
  try {
    const response = await fetch(FUEL_DATA_URL, {
      cache: "no-store"
    });

    if (!response.ok) {
      throw new Error("fuel-prices.json kunne ikke hentes");
    }

    const raw = await response.json();

    state.fuelPriceOverrides = normalizeFuelPrices(
      Array.isArray(raw) ? raw : []
    );

    if (els.fuelDisclaimer) {
      els.fuelDisclaimer.textContent =
        `Prisposter: ${state.fuelPriceOverrides.length}`;
    }
  } catch (error) {
    console.error("Prisdata fejl", error);

    state.fuelPriceOverrides = [];

    if (els.fuelDisclaimer) {
      els.fuelDisclaimer.textContent =
        "fuel-prices.json kunne ikke hentes";
    }
  }
}

function normalizeFuelPrices(rawStations) {
  const out = [];

  rawStations.forEach(station => {
    if (!station || typeof station !== "object") {
      return;
    }

    const country = String(
      station.country || station.market || "DK"
    ).toUpperCase();

    if (
      station.fuelTypes &&
      typeof station.fuelTypes === "object"
    ) {
      Object.entries(station.fuelTypes).forEach(
        ([fuelType, data]) => {
          if (!data || typeof data.price !== "number") {
            return;
          }

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
        }
      );

      return;
    }

    if (typeof station.price === "number") {
      out.push({
        name: station.name || "Ukendt station",
        brand: station.brand || "",
        address: station.address || "",
        city: extractCity(station.address || ""),
        lat: numberOrNull(station.lat),
        lng: numberOrNull(station.lng),
        country,
        fuelType: station.fuelType || state.settings.fuelType,
        price: station.price,
        currency: station.currency || "DKK",
        unit: station.unit || "liter",
        source: station.source || "fuel-prices.json",
        updatedAt: station.updatedAt || null
      });
    }
  });

  return out;
}

export async function loadFuelStations(geometry) {
  const sample = sampleRoutePoints(geometry);

  if (!sample.length) {
    state.osmFuelStations = [];
    return;
  }

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
      throw new Error("Overpass kunne ikke hentes");
    }

    const data = await response.json();

    state.osmFuelStations = dedupeStations(
      (data.elements || [])
        .map(normalizeOsmStation)
        .filter(Boolean)
    );
  } catch (error) {
    console.error("Tankstationer fejl", error);
    state.osmFuelStations = [];
  }
}

function sampleRoutePoints(geometry) {
  const points = [];
  const maxSamples = 20;

  if (!Array.isArray(geometry) || !geometry.length) {
    return points;
  }

  for (let i = 0; i < maxSamples; i++) {
    const index = Math.round(
      (geometry.length - 1) * (i / (maxSamples - 1))
    );

    const point = geometry[index];

    if (!point) {
      continue;
    }

    points.push({
      lng: point[0],
      lat: point[1]
    });
  }

  const seen = new Set();

  return points.filter(point => {
    const key =
      `${point.lat.toFixed(3)},${point.lng.toFixed(3)}`;

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
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

  const brand = normalizeBrand(
    tags.brand ||
    tags.operator ||
    name
  );

  const address = [
    tags["addr:street"],
    tags["addr:housenumber"],
    tags["addr:postcode"],
    tags["addr:city"]
  ].filter(Boolean).join(" ");

  return {
    id: `${element.type}-${element.id}`,
    lat,
    lng,
    name,
    brand,
    address,
    city: tags["addr:city"] || extractCity(address),
    price: null,
    currency: null,
    unit: null,
    source: "OSM",
    matchMode: null,
    updatedAt: null,
    distanceAlongRoute: Infinity,
    distanceToRoute: Infinity
  };
}

export function computeRouteDistances() {
  if (!state.routeData?.geometry?.length) {
    return;
  }

  const route = state.routeData.geometry;
  let cumulative = 0;
  const segments = [];

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

  state.osmFuelStations.forEach(station => {
    let bestDistanceToRoute = Infinity;
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

      if (projected.distanceMeters < bestDistanceToRoute) {
        bestDistanceToRoute = projected.distanceMeters;
        bestAlong =
          segment.startMeters +
          segment.length * projected.t;
      }
    });

    station.distanceToRoute = bestDistanceToRoute;
    station.distanceAlongRoute = bestAlong;
  });
}

export function applyPricesToStations() {
  state.osmFuelStations = state.osmFuelStations.map(station => {
    const realMatch = findFuelPrice(station);

    if (realMatch) {
      return {
        ...station,
        price: realMatch.price,
        currency: realMatch.currency || null,
        unit: realMatch.unit || null,
        source: realMatch.source,
        matchMode: realMatch.matchMode,
        updatedAt: realMatch.updatedAt
      };
    }

    if (state.settings.region === "us") {
      const estimate = estimateUsFuelPrice(
        station,
        state.settings.fuelType
      );

      return {
        ...station,
        price: estimate.price,
        currency: estimate.currency,
        unit: estimate.unit,
        source: estimate.source,
        matchMode: estimate.matchMode,
        updatedAt: null
      };
    }

    return {
      ...station,
      price: null,
      currency: null,
      unit: null,
      matchMode: null,
      updatedAt: null
    };
  });
}

function findFuelPrice(station) {
  const candidates = state.fuelPriceOverrides.filter(item =>
    item.fuelType === state.settings.fuelType &&
    typeof item.price === "number" &&
    isCompatiblePrice(item)
  );

  if (!candidates.length) {
    return null;
  }

  const stationBrand = normalizeBrand(
    station.brand || station.name
  );

  const stationName = normalizeText(station.name);

  const stationCity = normalizeText(
    station.city || extractCity(station.address)
  );

  const coordMatch = candidates
    .filter(item =>
      Number.isFinite(item.lat) &&
      Number.isFinite(item.lng)
    )
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
    .sort((a, b) => a.distance - b.distance)[0];

  if (coordMatch) {
    return coordMatch;
  }

  const scored = candidates
    .map(item => {
      const itemBrand = normalizeBrand(
        item.brand || item.name
      );

      const itemName = normalizeText(item.name);

      const itemCity = normalizeText(
        item.city || extractCity(item.address)
      );

      let score = 0;

      if (
        stationBrand &&
        itemBrand &&
        stationBrand === itemBrand
      ) {
        score += 60;
      }

      if (
        stationCity &&
        itemCity &&
        stationCity === itemCity
      ) {
        score += 35;
      }

      if (stationName && itemName) {
        if (stationName === itemName) {
          score += 40;
        } else if (
          stationName.includes(itemName) ||
          itemName.includes(stationName)
        ) {
          score += 25;
        } else {
          score += sharedWordScore(stationName, itemName);
        }
      }

      return {
        ...item,
        score,
        matchMode: "brand/navn/by"
      };
    })
    .filter(item => item.score >= 45)
    .sort((a, b) => b.score - a.score || a.price - b.price);

  if (scored.length) {
    return scored[0];
  }

  const sameBrand = candidates
    .filter(item =>
      normalizeBrand(item.brand || item.name) === stationBrand
    )
    .sort((a, b) => a.price - b.price)[0];

  if (sameBrand) {
    return {
      ...sameBrand,
      matchMode: "samme brand fallback"
    };
  }

  return null;
}

function isCompatiblePrice(item) {
  if (state.settings.region === "us") {
    return (
      item.country === "US" ||
      item.currency === "USD" ||
      item.unit === "gallon"
    );
  }

  return item.country !== "US" && item.currency !== "USD";
}

function getRouteLimitMeters() {
  return Number(state.settings.searchRadiusBase || 100000);
}

export function getStationsInRange() {
  const limit = getRouteLimitMeters();

  const stations = state.osmFuelStations
    .filter(station => station.distanceAlongRoute <= limit)
    .filter(station => station.distanceToRoute <= 2500);

  const withPrice = stations.filter(
    station => typeof station.price === "number"
  );

  const withoutPrice = stations.filter(
    station => typeof station.price !== "number"
  );

  if (state.fuelListSort === "detour") {
    withPrice.sort((a, b) =>
      a.distanceToRoute - b.distanceToRoute ||
      a.price - b.price ||
      a.distanceAlongRoute - b.distanceAlongRoute
    );
  } else {
    withPrice.sort((a, b) =>
      a.price - b.price ||
      a.distanceToRoute - b.distanceToRoute ||
      a.distanceAlongRoute - b.distanceAlongRoute
    );
  }

  withoutPrice.sort((a, b) =>
    a.distanceToRoute - b.distanceToRoute ||
    a.distanceAlongRoute - b.distanceAlongRoute
  );

  return [
    ...withPrice,
    ...withoutPrice
  ].slice(0, 10);
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
  const priced = stations.filter(
    station => typeof station.price === "number"
  );

  if (!stations.length) {
    els.fuelContent.innerHTML = `
      <div class="fuel-name">Ingen tankstationer fundet</div>
      <div class="fuel-meta">Inden for valgt afstand langs ruten.</div>
    `;
    return;
  }

  if (!priced.length) {
    els.fuelContent.innerHTML = `
      <div class="fuel-name">Pris mangler</div>
      <div class="fuel-meta">Tankstationer fundet: ${stations.length}</div>
      <div class="fuel-meta">Prisposter: ${state.fuelPriceOverrides.length}</div>
    `;
    return;
  }

  const best = priced
    .slice()
    .sort((a, b) =>
      a.price - b.price ||
      a.distanceToRoute - b.distanceToRoute ||
      a.distanceAlongRoute - b.distanceAlongRoute
    )[0];

  els.fuelContent.innerHTML = `
    <div class="fuel-name">${escapeHtml(best.name)}</div>
    <div class="fuel-price">${formatPrice(best.price)}</div>
    <div class="fuel-meta">Langs ruten: ${formatDistance(best.distanceAlongRoute)}</div>
    <div class="fuel-meta">Fra rute: ${formatDistance(best.distanceToRoute)}</div>
    <div class="fuel-meta">Match: ${escapeHtml(best.matchMode || "prisdata")}</div>
    <div class="fuel-meta">Kilde: ${escapeHtml(best.source || "OSM")}</div>
    <a class="fuel-link" href="${buildGoogleMapsLink(best)}" target="_blank" rel="noopener noreferrer">
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
    els.fuelListContent.innerHTML =
      `<div class="fuel-list-empty">Ingen stationer fundet inden for valgt afstand langs ruten.</div>`;
    return;
  }

  els.fuelListContent.innerHTML = stations.map((station, index) => `
    <article class="fuel-list-item">
      <div class="fuel-list-item-top">
        <div>
          <div class="fuel-list-name">${index + 1}. ${escapeHtml(station.name)}</div>
          <div class="fuel-list-brand">${escapeHtml(station.brand || "Ukendt")}</div>
        </div>

        <div class="fuel-list-price">
          ${typeof station.price === "number" ? formatPrice(station.price) : "Pris mangler"}
        </div>
      </div>

      <div class="fuel-list-meta-grid">
        <div class="fuel-list-meta">
          Langs ruten<br>
          <strong>${formatDistance(station.distanceAlongRoute)}</strong>
        </div>

        <div class="fuel-list-meta">
          Fra rute<br>
          <strong>${formatDistance(station.distanceToRoute)}</strong>
        </div>

        <div class="fuel-list-meta">
          Match<br>
          <strong>${escapeHtml(station.matchMode || "—")}</strong>
        </div>

        <div class="fuel-list-meta">
          Kilde<br>
          <strong>${escapeHtml(station.source || "OSM")}</strong>
        </div>
      </div>

      <div class="fuel-list-actions">
        <a class="fuel-list-map-link" href="${buildGoogleMapsLink(station)}" target="_blank" rel="noopener noreferrer">
          Åbn via Google Maps
        </a>
      </div>
    </article>
  `).join("");
}

export function openFuelHistory() {
  if (!els.fuelHistoryContent) {
    return;
  }

  const history = state.fuelPriceOverrides
    .filter(item => item.fuelType === state.settings.fuelType)
    .filter(item => item.updatedAt)
    .slice()
    .sort((a, b) =>
      String(b.updatedAt).localeCompare(String(a.updatedAt))
    )
    .slice(0, 30);

  if (!history.length) {
    els.fuelHistoryContent.innerHTML = `
      <div class="fuel-list-empty">
        Prishistorik kommer, når der er gemt flere prisopdateringer over tid.
      </div>
    `;
  } else {
    els.fuelHistoryContent.innerHTML = history.map(item => `
      <article class="fuel-list-item">
        <div class="fuel-list-item-top">
          <div>
            <div class="fuel-list-name">${escapeHtml(item.name)}</div>
            <div class="fuel-list-brand">${escapeHtml(item.brand || item.city || "Ukendt")}</div>
          </div>

          <div class="fuel-list-price">
            ${formatPrice(item.price)}
          </div>
        </div>

        <div class="fuel-list-meta-grid">
          <div class="fuel-list-meta">
            Brændstof<br>
            <strong>${escapeHtml(item.fuelType)}</strong>
          </div>

          <div class="fuel-list-meta">
            Opdateret<br>
            <strong>${escapeHtml(formatDateTime(item.updatedAt))}</strong>
          </div>

          <div class="fuel-list-meta">
            Kilde<br>
            <strong>${escapeHtml(item.source || "fuel-prices.json")}</strong>
          </div>

          <div class="fuel-list-meta">
            Land<br>
            <strong>${escapeHtml(item.country || "DK")}</strong>
          </div>
        </div>
      </article>
    `).join("");
  }

  els.fuelHistoryModal?.classList.remove("hidden");
  els.fuelHistoryBackdrop?.classList.remove("hidden");
}

export function closeFuelHistory() {
  els.fuelHistoryModal?.classList.add("hidden");
  els.fuelHistoryBackdrop?.classList.add("hidden");
}

export function updateFuelMarkers() {
  clearFuelMarkers();

  if (!state.map) {
    return;
  }

  const stations = getStationsInRange();

  const bestPriced = stations
    .filter(station => typeof station.price === "number")
    .slice()
    .sort((a, b) =>
      a.price - b.price ||
      a.distanceToRoute - b.distanceToRoute ||
      a.distanceAlongRoute - b.distanceAlongRoute
    )[0];

  stations.forEach(station => {
    const isBest =
      bestPriced &&
      station.id === bestPriced.id;

    const icon = L.divIcon({
      className: "fuel-price-marker",
      html: `
        <div class="fuel-price-label ${isBest ? "best" : ""} ${typeof station.price !== "number" ? "no-price" : ""}">
          ${typeof station.price === "number" ? formatPriceShort(station.price) : "—"}
        </div>
      `,
      iconSize: [74, 34],
      iconAnchor: [37, 17]
    });

    const marker = L.marker(
      [station.lat, station.lng],
      { icon }
    )
      .addTo(state.map)
      .bindPopup(`
        <strong>${escapeHtml(station.name)}</strong><br>
        ${typeof station.price === "number" ? formatPrice(station.price) : "Pris mangler"}<br>
        Langs ruten: ${formatDistance(station.distanceAlongRoute)}<br>
        Fra rute: ${formatDistance(station.distanceToRoute)}<br>
        Kilde: ${escapeHtml(station.source || "OSM")}<br>
        <a href="${buildGoogleMapsLink(station)}" target="_blank" rel="noopener noreferrer">
          Åbn via Google Maps
        </a>
      `);

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

function formatDateTime(value) {
  try {
    return new Date(value).toLocaleString("da-DK", {
      dateStyle: "short",
      timeStyle: "short"
    });
  } catch {
    return value || "—";
  }
}
