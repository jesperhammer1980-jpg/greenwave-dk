import { state } from "./state.js";

export function initMap() {
  state.map = L.map("map", {
    zoomControl: true
  }).setView([56.2, 9.5], 7);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "© OpenStreetMap"
  }).addTo(state.map);
}

export function drawRoute(geometry) {
  if (!state.map || !Array.isArray(geometry)) {
    return;
  }

  if (state.routeLine) {
    state.map.removeLayer(state.routeLine);
    state.routeLine = null;
  }

  const latlngs = geometry.map(point => [
    point[1],
    point[0]
  ]);

  state.routeLine = L.polyline(latlngs, {
    color: "#5ea2ff",
    weight: 6,
    opacity: 0.9
  }).addTo(state.map);

  state.map.fitBounds(state.routeLine.getBounds(), {
    padding: [30, 30]
  });
}

export function updateUserMarker(lat, lng) {
  if (!state.map) {
    return;
  }

  const icon = L.divIcon({
    className: "",
    html: `<div class="user-marker-dot"></div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14]
  });

  if (!state.userMarker) {
    state.userMarker = L.marker([lat, lng], { icon })
      .addTo(state.map);
  } else {
    state.userMarker.setLatLng([lat, lng]);
  }
}

export function updateDestinationMarker(lat, lng) {
  if (!state.map) {
    return;
  }

  const icon = L.divIcon({
    className: "",
    html: `<div class="dest-marker-dot"></div>`,
    iconSize: [26, 26],
    iconAnchor: [13, 13]
  });

  if (!state.destMarker) {
    state.destMarker = L.marker([lat, lng], { icon })
      .addTo(state.map);
  } else {
    state.destMarker.setLatLng([lat, lng]);
  }
}

export function recenterMap() {
  if (!state.map) {
    return;
  }

  if (state.currentPosition) {
    state.map.setView(
      [
        state.currentPosition.lat,
        state.currentPosition.lng
      ],
      15
    );

    return;
  }

  if (state.routeLine) {
    state.map.fitBounds(state.routeLine.getBounds(), {
      padding: [30, 30]
    });
  }
}

export function followNavigationCamera(position) {
  if (!state.map || !position) {
    return;
  }

  const zoom = Math.max(state.map.getZoom(), 17);

  state.map.setView(
    [position.lat, position.lng],
    zoom,
    {
      animate: true,
      duration: 0.35
    }
  );
}

export function setMapBearing(headingDegrees) {
  const inner = document.getElementById("map-rotation-inner");

  if (!inner) {
    return;
  }

  if (
    typeof headingDegrees !== "number" ||
    !Number.isFinite(headingDegrees)
  ) {
    inner.style.transform = "rotate(0deg)";
    return;
  }

  const normalized =
    ((headingDegrees % 360) + 360) % 360;

  inner.style.transform =
    `rotate(${-normalized}deg)`;
}

export function resetMapBearing() {
  const inner = document.getElementById("map-rotation-inner");

  if (!inner) {
    return;
  }

  inner.style.transform = "rotate(0deg)";
}

export function clearMapRouteAndMarkers() {
  if (!state.map) {
    return;
  }

  if (state.routeLine) {
    state.map.removeLayer(state.routeLine);
    state.routeLine = null;
  }

  if (state.destMarker) {
    state.map.removeLayer(state.destMarker);
    state.destMarker = null;
  }
}
