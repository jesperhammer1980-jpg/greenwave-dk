export function setStatus(gpsText, navText, mapText) {
  setText("gpsStatus", clean(gpsText, "GPS:"));
  setText("navStatus", clean(navText, "Navigation:"));
  setText("mapStatus", clean(mapText, "Kort:"));
}
function clean(v, p) { return String(v || "").replace(p, "").trim(); }
function setText(id, v) { const el = document.getElementById(id); if (el) el.textContent = v || "—"; }

export function getPosition() {
  return new Promise(resolve => {
    if (!navigator.geolocation) {
      resolve(getDemoPosition());
      return;
    }

    navigator.geolocation.getCurrentPosition(
      p => resolve({
        lat: p.coords.latitude,
        lng: p.coords.longitude,
        speed: typeof p.coords.speed === "number" ? Math.max(0, p.coords.speed * 3.6) : 0,
        heading: typeof p.coords.heading === "number" ? p.coords.heading : 0,
        timestamp: p.timestamp || Date.now()
      }),
      () => {
        alert("GPS blev afvist. Jeg bruger demo-startpunkt i København på PC. På mobil/Vercel skal GPS tillades.");
        resolve(getDemoPosition());
      },
      { enableHighAccuracy: true, maximumAge: 1000, timeout: 9000 }
    );
  });
}

function getDemoPosition() {
  return { lat: 55.6761, lng: 12.5683, speed: 0, heading: 0, timestamp: Date.now(), demo: true };
}

export function haversine(lat1, lng1, lat2, lng2) {
  const r = 6371000;
  const toRad = v => v * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return r * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function projectPointToSegment(lat, lng, lat1, lng1, lat2, lng2) {
  const mLat = 111320;
  const mLng = 111320 * Math.cos(lat * Math.PI / 180);
  const px = lng * mLng, py = lat * mLat;
  const ax = lng1 * mLng, ay = lat1 * mLat;
  const bx = lng2 * mLng, by = lat2 * mLat;
  const dx = bx - ax, dy = by - ay;
  const len = dx * dx + dy * dy;
  if (len === 0) return { t: 0, distanceMeters: Math.hypot(px - ax, py - ay) };
  let t = ((px - ax) * dx + (py - ay) * dy) / len;
  t = Math.max(0, Math.min(1, t));
  return { t, distanceMeters: Math.hypot(px - (ax + t * dx), py - (ay + t * dy)) };
}

export function formatDistance(m) {
  if (!Number.isFinite(m)) return "—";
  if (m < 1000) return `${Math.round(m)} m`;
  if (m < 10000) return `${(m / 1000).toFixed(1)} km`;
  return `${Math.round(m / 1000)} km`;
}

export function formatDuration(s) {
  if (!Number.isFinite(s)) return "—";
  const min = Math.max(1, Math.round(s / 60));
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60), r = min % 60;
  return r === 0 ? `${h} t` : `${h} t ${r} min`;
}

export function formatPrice(p) {
  if (typeof p !== "number" || !Number.isFinite(p)) return "—";
  return p.toLocaleString("da-DK", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function escapeHtml(v) {
  return String(v ?? "").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;");
}

export function normalizeBrand(v) {
  const t = String(v || "").toLowerCase();
  if (t.includes("circle")) return "circle k";
  if (t.includes("shell")) return "shell";
  if (t.includes("q8")) return "q8";
  if (t.includes("ingo")) return "ingo";
  if (t.includes("uno")) return "uno-x";
  if (t.includes("ok")) return "ok";
  return t.trim();
}

export function buildGoogleMapsLink(s) {
  return `https://www.google.com/maps/search/?api=1&query=${s.lat},${s.lng}`;
}
