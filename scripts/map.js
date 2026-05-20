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

  const latlngs = geometry.map(point => [point[1], point[0]]);

  state.routeGlow = L.polyline(latlngs, {
    color: "#58b4ff",
    weight: 18,
    opacity: 0.22,
    lineCap: "round",
    lineJoin: "round",
    interactive: false
  }).addTo(state.map);

  state.routeLine = L.polyline(latlngs, {
    color: "#2b91ff",
    weight: 7,
    opacity: 1,
    lineCap: "round",
    lineJoin: "round",
    interactive: false
  }).addTo(state.map);

  state.map.fitBounds(state.routeLine.getBounds(), {
    paddingTopLeft: [55, 260],
    paddingBottomRight: [55, 260],
    animate: true
  });
}

export function clearRoute() {
  if (state.routeGlow) state.map.removeLayer(state.routeGlow);
  if (state.routeLine) state.map.removeLayer(state.routeLine);
  state.routeGlow = null;
  state.routeLine = null;
}

export function updateUserMarker(lat, lng, heading = 0) {
  if (!state.map || !Number.isFinite(lat) || !Number.isFinite(lng)) return;

  const icon = L.divIcon({
    className: "user-marker-icon",
    html: `
      <div class="user-marker-wrap">
        <div class="user-marker-pulse"></div>
        <div class="user-marker-heading"></div>
        <div class="user-marker-ring"></div>
        <div class="user-marker-core"></div>
      </div>
    `,
    iconSize: [54, 54],
    iconAnchor: [27, 27]
  });

  if (!state.userMarker) {
    state.userMarker = L.marker([lat, lng], {
      icon,
      zIndexOffset: 10000,
      keyboard: false
    }).addTo(state.map);
  } else {
    state.userMarker.setLatLng([lat, lng]);
  }

  const element = state.userMarker.getElement();
  const arrow = element?.querySelector(".user-marker-heading");

  if (arrow && Number.isFinite(heading)) {
    arrow.style.transform = `translateX(-50%) rotate(${heading}deg)`;
  }
}

export function updateDestinationMarker(lat, lng) {
  if (!state.map || !Number.isFinite(lat) || !Number.isFinite(lng)) return;

  const icon = L.divIcon({
    className: "dest-marker-icon",
    html: '<div class="dest-marker-dot">⌖</div>',
    iconSize: [40, 40],
    iconAnchor: [20, 20]
  });

  if (!state.destinationMarker) {
    state.destinationMarker = L.marker([lat, lng], {
      icon,
      zIndexOffset: 9000,
      keyboard: false
    }).addTo(state.map);
    return;
  }

  state.destinationMarker.setLatLng([lat, lng]);
}

export function followNavigationCamera(position) {
  if (!state.map || !position) return;

  const zoom =
    position.speed > 80 ? 15 :
    position.speed > 45 ? 16 :
    17;

  state.map.flyTo([position.lat, position.lng], zoom, {
    animate: true,
    duration: 0.55
  });
}

export function enterNavigationView() {
  document.body.classList.add("navigation-active");
  setTimeout(() => state.map?.invalidateSize(), 150);
}

export function exitNavigationView() {
  document.body.classList.remove("navigation-active");
  setTimeout(() => state.map?.invalidateSize(), 150);
}

export function resetMapBearing() {}

export function recenterMap() {
  if (!state.map) return;

  if (!state.currentPosition) {
    state.map.flyTo([55.6761, 12.5683], 12, { duration: 0.8 });
    return;
  }

  state.map.flyTo(
    [state.currentPosition.lat, state.currentPosition.lng],
    17,
    { duration: 0.8 }
  );
}
