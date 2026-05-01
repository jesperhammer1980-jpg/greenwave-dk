import { state } from "./state.js";

export function initMap() {
  state.map = L.map("map", {
    zoomControl: true,
    inertia: true,
    inertiaDeceleration: 2600
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
    color: "#62a8ff",
    weight: 7,
    opacity: 0.95,
    lineCap: "round",
    lineJoin: "round"
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

export function enterNavigationView() {
  document.body.classList.add("navigation-active");
  document.body.classList.toggle(
    "navigation-3d",
    Boolean(state.navigationView?.pseudo3d)
  );
  document.body.classList.toggle(
    "navigation-dark",
    Boolean(state.navigationView?.darkMode)
  );

  setTimeout(() => {
    state.map?.invalidateSize();
  }, 250);
}

export function exitNavigationView() {
  document.body.classList.remove(
    "navigation-active",
    "navigation-3d",
    "navigation-dark",
    "navigation-motorway",
    "navigation-night"
  );

  resetMapBearing();

  setTimeout(() => {
    state.map?.invalidateSize();
  }, 250);
}

export function followNavigationCamera(position, options = {}) {
  if (!state.map || !position) {
    return;
  }

  const speedKmh =
    typeof position.speed === "number" &&
    Number.isFinite(position.speed)
      ? position.speed * 3.6
      : 0;

  const zoom = getAdaptiveNavigationZoom(speedKmh, options);

  state.navigationView.lastZoom = zoom;

  state.map.setView(
    [position.lat, position.lng],
    zoom,
    {
      animate: true,
      duration: 0.32
    }
  );
}

function getAdaptiveNavigationZoom(speedKmh, options = {}) {
  if (!state.navigationView?.adaptiveZoom) {
    return Math.max(state.map?.getZoom?.() || 17, 17);
  }

  if (options.forceZoom) {
    return options.forceZoom;
  }

  if (speedKmh >= 95) {
    document.body.classList.add("navigation-motorway");
    return 15.8;
  }

  document.body.classList.remove("navigation-motorway");

  if (speedKmh >= 70) {
    return 16.2;
  }

  if (speedKmh >= 40) {
    return 16.7;
  }

  return 17.3;
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
    inner.style.setProperty("--map-bearing", "0deg");
    inner.style.transform = "";
    return;
  }

  const normalized =
    ((headingDegrees % 360) + 360) % 360;

  state.navigationView.lastBearing = normalized;

  inner.style.setProperty(
    "--map-bearing",
    `${-normalized}deg`
  );
}

export function resetMapBearing() {
  const inner = document.getElementById("map-rotation-inner");

  if (!inner) {
    return;
  }

  inner.style.setProperty("--map-bearing", "0deg");
  inner.style.transform = "";
}

export function setNavigationNightMode(isNight) {
  state.navigationView.nightMode = Boolean(isNight);

  document.body.classList.toggle(
    "navigation-night",
    state.navigationView.nightMode
  );
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
