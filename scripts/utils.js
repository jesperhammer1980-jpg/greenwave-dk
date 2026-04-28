import { state } from "./state.js";
import { els } from "./dom.js";

export function setStatus(gps, nav, map) {
  if (els.gpsStatusChip) {
    els.gpsStatusChip.textContent = gps;
  }

  if (els.navStatusChip) {
    els.navStatusChip.textContent = nav;
  }

  if (els.mapModeLabel) {
    els.mapModeLabel.textContent = map;
  }
}

export function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function numberOrNull(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const n = Number(value);

  return Number.isFinite(n) ? n : null;
}

export function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .replaceAll("æ", "ae")
    .replaceAll("ø", "oe")
    .replaceAll("å", "aa")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function normalizeBrand(value) {
  const text = normalizeText(value);

  if (text.includes("uno x") || text.includes("unox")) {
    return "uno-x";
  }

  if (text.includes("f24")) {
    return "f24";
  }

  if (text.includes("ingo")) {
    return "ingo";
  }

  if (text.includes("circle")) {
    return "circle-k";
  }

  if (text === "ok" || text.startsWith("ok ") || text.includes(" ok ")) {
    return "ok";
  }

  if (text.includes("q8")) {
    return "q8";
  }

  if (text.includes("shell")) {
    return "shell";
  }

  if (text.includes("go on") || text.includes("goon")) {
    return "goon";
  }

  if (text.includes("oil")) {
    return "oil";
  }

  if (text.includes("chevron")) {
    return "chevron";
  }

  if (text.includes("exxon")) {
    return "exxon";
  }

  if (text.includes("mobil")) {
    return "mobil";
  }

  if (text.includes("bp")) {
    return "bp";
  }

  if (text.includes("speedway")) {
    return "speedway";
  }

  return text;
}

export function sharedWordScore(a, b) {
  const aw = new Set(
    a.split(" ").filter(word => word.length >= 3)
  );

  const bw = new Set(
    b.split(" ").filter(word => word.length >= 3)
  );

  let score = 0;

  aw.forEach(word => {
    if (bw.has(word)) {
      score += 8;
    }
  });

  return score;
}

export function extractCity(value) {
  const parts = String(value || "")
    .split(",")
    .map(x => x.trim())
    .filter(Boolean);

  return (parts.at(-1) || "")
    .replace(/^\d{4}\s*/, "");
}

export function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371000;

  const toRad = value => value * Math.PI / 180;

  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) *
    Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) ** 2;

  return 2 * R * Math.atan2(
    Math.sqrt(a),
    Math.sqrt(1 - a)
  );
}

export function projectPointToSegment(
  pxLat,
  pxLng,
  aLat,
  aLng,
  bLat,
  bLng
) {
  const meanLatRad =
    ((pxLat + aLat + bLat) / 3) * Math.PI / 180;

  const metersPerLat = 111320;
  const metersPerLng =
    111320 * Math.cos(meanLatRad);

  const px = pxLng * metersPerLng;
  const py = pxLat * metersPerLat;

  const ax = aLng * metersPerLng;
  const ay = aLat * metersPerLat;

  const bx = bLng * metersPerLng;
  const by = bLat * metersPerLat;

  const dx = bx - ax;
  const dy = by - ay;

  if (dx === 0 && dy === 0) {
    return {
      distanceMeters: Math.hypot(px - ax, py - ay),
      t: 0
    };
  }

  const t = Math.max(
    0,
    Math.min(
      1,
      (
        ((px - ax) * dx) +
        ((py - ay) * dy)
      ) / (dx * dx + dy * dy)
    )
  );

  const cx = ax + t * dx;
  const cy = ay + t * dy;

  return {
    distanceMeters: Math.hypot(px - cx, py - cy),
    t
  };
}

export function dedupeStations(stations) {
  const result = [];

  stations.forEach(station => {
    const exists = result.some(existing =>
      haversine(
        station.lat,
        station.lng,
        existing.lat,
        existing.lng
      ) < 35
    );

    if (!exists) {
      result.push(station);
    }
  });

  return result;
}

export function formatPrice(price) {
  if (state.settings.region === "us") {
    return `$${Number(price).toFixed(2)}/gal`;
  }

  return `${Number(price)
    .toFixed(2)
    .replace(".", ",")} kr/L`;
}

export function formatPriceShort(price) {
  if (state.settings.region === "us") {
    return `$${Number(price).toFixed(2)}`;
  }

  return Number(price)
    .toFixed(2)
    .replace(".", ",");
}

export function formatDistance(meters) {
  if (!Number.isFinite(meters)) {
    return "—";
  }

  if (state.settings.region === "us") {
    return `${(meters / 1609.344).toFixed(1)} mi`;
  }

  if (meters < 1000) {
    return `${Math.round(meters)} m`;
  }

  return `${(meters / 1000)
    .toFixed(1)
    .replace(".", ",")} km`;
}

export function buildGoogleMapsLink(station) {
  const params = new URLSearchParams({
    api: "1",
    travelmode: "driving",
    destination: `${state.destination.lat},${state.destination.lng}`,
    waypoints: `${station.lat},${station.lng}`
  });

  if (state.currentPosition) {
    params.set(
      "origin",
      `${state.currentPosition.lat},${state.currentPosition.lng}`
    );
  }

  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

export function getPosition() {
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      position => {
        resolve({
          lat: position.coords.latitude,
          lng: position.coords.longitude
        });
      },
      reject,
      {
        enableHighAccuracy: true,
        maximumAge: 0,
        timeout: 15000
      }
    );
  });
}
