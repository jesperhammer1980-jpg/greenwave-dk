import { state } from "./state.js";

export function initMap() {
  state.map = L.map("map", {
    zoomControl: false,
    attributionControl: false,
    preferCanvas: true
  });

  L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
    subdomains: "abcd",
    maxZoom: 20
  }).addTo(state.map);

  state.map.setView([55.6761, 12.5683], 12);
}

export function drawRoute(geometry) {
  if (!state.map || !Array.isArray(geometry)) return;
  clearRoute();
  const latlngs = geometry.map(p => [p[1], p[0]]);

  state.routeGlow = L.polyline(latlngs, { color: "#58b4ff", weight: 16, opacity: 0.22, lineCap: "round", lineJoin: "round" }).addTo(state.map);
  state.routeLine = L.polyline(latlngs, { color: "#2b91ff", weight: 7, opacity: 1, lineCap: "round", lineJoin: "round" }).addTo(state.map);

  state.map.fitBounds(state.routeLine.getBounds(), { padding: [55, 55], animate: true });
}

export function clearRoute() {
  if (state.routeGlow) state.map.removeLayer(state.routeGlow);
  if (state.routeLine) state.map.removeLayer(state.routeLine);
  state.routeGlow = null;
  state.routeLine = null;
}

export function updateUserMarker(lat, lng) {
  const icon = L.divIcon({
    className: "user-marker-icon",
    html: '<div class="user-marker-dot"></div>',
    iconSize: [28, 28],
    iconAnchor: [14, 14]
  });

  if (!state.userMarker) {
    state.userMarker = L.marker([lat, lng], { icon, zIndexOffset: 5000 }).addTo(state.map);
    return;
  }
  state.userMarker.setLatLng([lat, lng]);
}

export function updateDestinationMarker(lat, lng) {
  const icon = L.divIcon({
    className: "dest-marker-icon",
    html: '<div class="dest-marker-dot">⌖</div>',
    iconSize: [40, 40],
    iconAnchor: [20, 20]
  });

  if (!state.destinationMarker) {
    state.destinationMarker = L.marker([lat, lng], { icon, zIndexOffset: 4500 }).addTo(state.map);
    return;
  }
  state.destinationMarker.setLatLng([lat, lng]);
}

export function followNavigationCamera(position) {
  if (!state.map || !position) return;
  const zoom = position.speed > 70 ? 15 : position.speed > 35 ? 16 : 17;
  state.map.flyTo([position.lat, position.lng], zoom, { animate: true, duration: 0.6 });
}

export function enterNavigationView() {
  document.body.classList.add("navigation-active");
}

export function exitNavigationView() {
  document.body.classList.remove("navigation-active");
}

export function resetMapBearing() {}

export function recenterMap() {
  if (!state.currentPosition) {
    state.map.setView([55.6761, 12.5683], 12);
    return;
  }
  state.map.flyTo([state.currentPosition.lat, state.currentPosition.lng], 16, { duration: 0.8 });
}
