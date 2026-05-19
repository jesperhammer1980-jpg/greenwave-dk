export function setStatus(gpsText, navText, mapText) {
  setText("gpsStatus", cleanStatus(gpsText, "GPS:"));
  setText("navStatus", cleanStatus(navText, "Navigation:"));
  setText("mapStatus", cleanStatus(mapText, "Kort:"));
}

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value || "—";
}

function cleanStatus(value, prefix) {
  return String(value || "").replace(prefix, "").trim();
}

export function getPosition() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("GPS understøttes ikke."));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      position => {
        resolve({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          speed: typeof position.coords.speed === "number"
            ? Math.max(0, position.coords.speed * 3.6)
            : 0,
          heading: typeof position.coords.heading === "number"
            ? position.coords.heading
            : 0,
          accuracy: position.coords.accuracy || null,
          timestamp: position.timestamp || Date.now()
        });
      },
      error => {
        reject(new Error("Kunne ikke hente GPS-position: " + (error.message || error)));
      },
      {
        enableHighAccuracy: true,
        maximumAge: 1000,
        timeout: 15000
      }
    );
  });
}

export function haversine(lat1, lng1, lat2, lng2) {
  const r = 6371000;
  const toRad = value => value * Math.PI / 180;

  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) *
    Math.cos(toRad(lat2)) *
    Math.sin(dLng / 2) ** 2;

  return r * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function projectPointToSegment(lat, lng, lat1, lng1, lat2, lng2) {
  const metersPerDegreeLat = 111320;
  const metersPerDegreeLng = 111320 * Math.cos(lat * Math.PI / 180);

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

  let t = ((px - ax) * dx + (py - ay) * dy) / lengthSquared;
  t = Math.max(0, Math.min(1, t));

  return {
    t,
    distanceMeters: Math.hypot(
      px - (ax + t * dx),
      py - (ay + t * dy)
    )
  };
}

export function formatDistance(meters) {
  if (!Number.isFinite(meters)) return "—";
  if (meters < 1000) return `${Math.round(meters)} m`;
  if (meters < 10000) return `${(meters / 1000).toFixed(1)} km`;
  return `${Math.round(meters / 1000)} km`;
}

export function formatDuration(seconds) {
  if (!Number.isFinite(seconds)) return "—";

  const minutes = Math.max(1, Math.round(seconds / 60));

  if (minutes < 60) return `${minutes} min`;

  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;

  return rest === 0 ? `${hours} t` : `${hours} t ${rest} min`;
}

export function formatPrice(price) {
  if (typeof price !== "number" || !Number.isFinite(price)) return "—";

  return price.toLocaleString("da-DK", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

export function formatPriceShort(price) {
  if (typeof price !== "number" || !Number.isFinite(price)) return "—";

  return price.toLocaleString("da-DK", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1
  });
}

export function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9æøå\s-]/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeBrand(value) {
  const text = normalizeText(value);

  if (!text) return "";
  if (text.includes("circle")) return "circle k";
  if (text.includes("shell")) return "shell";
  if (text.includes("q8")) return "q8";
  if (text === "ok" || text.includes(" ok ")) return "ok";
  if (text.includes("ingo")) return "ingo";
  if (text.includes("uno")) return "uno-x";
  if (text.includes("f24")) return "f24";
  if (text.includes("go on") || text.includes("goon")) return "goon";

  return text;
}

export function buildGoogleMapsLink(station) {
  if (
    Number.isFinite(station?.lat) &&
    Number.isFinite(station?.lng)
  ) {
    return `https://www.google.com/maps/search/?api=1&query=${station.lat},${station.lng}`;
  }

  const query = encodeURIComponent(
    [station?.name, station?.address]
      .filter(Boolean)
      .join(" ")
  );

  return `https://www.google.com/maps/search/?api=1&query=${query}`;
}

export function smoothValue(current, target, alpha = 0.2) {
  if (!Number.isFinite(current)) return target;
  if (!Number.isFinite(target)) return current;

  return current + (target - current) * alpha;
}
