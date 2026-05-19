import { state } from "./state.js";

let smoothAnimationFrame = null;

export function initMap() {

  state.map = L.map("map", {
    zoomControl: false,
    attributionControl: false,
    preferCanvas: true,

    zoomSnap: 0.1,
    zoomDelta: 0.25,

    fadeAnimation: true,
    markerZoomAnimation: true,

    inertia: true,
    inertiaDeceleration: 3000
  });

  const tileLayer =
    getTileLayer();

  tileLayer.addTo(state.map);

  state.map.setView(
    [55.6761, 12.5683],
    13
  );

  state.mapReady = true;

  requestAnimationFrame(() => {
    state.map.invalidateSize();
  });
}

/* =========================
   TILE LAYERS
========================= */

function getTileLayer() {

  if (
    state.settings.mapStyleMode === "standard"
  ) {
    return L.tileLayer(
      "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
      {
        subdomains: "abcd",
        maxZoom: 20
      }
    );
  }

  return L.tileLayer(
    "https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png",
    {
      subdomains: "abcd",
      maxZoom: 20
    }
  );
}

/* =========================
   ROUTE
========================= */

export function drawRoute(
  geometry
) {

  if (!state.map) {
    return;
  }

  clearRoute();

  if (
    !Array.isArray(geometry) ||
    !geometry.length
  ) {
    return;
  }

  const latlngs =
    geometry.map(point => [
      point[1],
      point[0]
    ]);

  const glow =
    L.polyline(
      latlngs,
      {
        color: "#57b0ff",
        weight: 18,
        opacity: 0.18,
        lineCap: "round",
        lineJoin: "round"
      }
    ).addTo(state.map);

  const route =
    L.polyline(
      latlngs,
      {
        color: "#2b91ff",
        weight: 8,
        opacity: 1,

        lineCap: "round",
        lineJoin: "round"
      }
    ).addTo(state.map);

  state.routeGlow = glow;
  state.routeLine = route;

  fitRouteToScreen(route);
}

function fitRouteToScreen(route) {

  if (!route) {
    return;
  }

  const bounds =
    route.getBounds();

  state.map.fitBounds(
    bounds,
    {
      paddingTopLeft: [40, 220],
      paddingBottomRight: [40, 240],

      animate: true,
      duration: 1.2
    }
  );
}

export function clearRoute() {

  if (state.routeGlow) {
    state.map.removeLayer(
      state.routeGlow
    );

    state.routeGlow = null;
  }

  if (state.routeLine) {
    state.map.removeLayer(
      state.routeLine
    );

    state.routeLine = null;
  }
}

/* =========================
   USER MARKER
========================= */

export function updateUserMarker(
  lat,
  lng
) {

  if (!state.map) {
    return;
  }

  const icon =
    createUserMarkerIcon();

  if (!state.userMarker) {

    state.userMarker =
      L.marker(
        [lat, lng],
        {
          icon,
          zIndexOffset: 5000
        }
      ).addTo(state.map);

    return;
  }

  state.userMarker.setLatLng(
    [lat, lng]
  );
}

function createUserMarkerIcon() {

  return L.divIcon({
    className:
      "greenwave-user-marker",

    html: `
      <div class="user-marker-wrap">

        <div class="user-marker-shadow"></div>

        <div class="user-marker-ring"></div>

        <div class="user-marker-core"></div>

      </div>
    `,

    iconSize: [64, 64],
    iconAnchor: [32, 32]
  });
}

/* =========================
   DESTINATION
========================= */

export function updateDestinationMarker(
  lat,
  lng
) {

  if (!state.map) {
    return;
  }

  const icon =
    createDestinationMarker();

  if (!state.destinationMarker) {

    state.destinationMarker =
      L.marker(
        [lat, lng],
        {
          icon,
          zIndexOffset: 4500
        }
      ).addTo(state.map);

    return;
  }

  state.destinationMarker.setLatLng(
    [lat, lng]
  );
}

function createDestinationMarker() {

  return L.divIcon({
    className:
      "greenwave-destination-marker",

    html: `
      <div class="destination-marker">
        ⌖
      </div>
    `,

    iconSize: [58, 58],
    iconAnchor: [29, 29]
  });
}

/* =========================
   CAMERA
========================= */

export function followNavigationCamera(
  position,
  options = {}
) {

  if (
    !state.map ||
    !position
  ) {
    return;
  }

  const heading =
    Number(
      position.heading || 0
    );

  const speed =
    Number(
      position.speed || 0
    );

  const zoom =
    getDynamicZoom(speed);

  const targetCenter =
    calculateRoadAheadCenter(
      position,
      heading,
      speed
    );

  smoothMoveCamera({
    lat: targetCenter.lat,
    lng: targetCenter.lng,
    zoom,
    heading
  });
}

function smoothMoveCamera({
  lat,
  lng,
  zoom,
  heading
}) {

  if (!state.map) {
    return;
  }

  cancelAnimationFrame(
    smoothAnimationFrame
  );

  const startCenter =
    state.map.getCenter();

  const startZoom =
    state.map.getZoom();

  const startHeading =
    state.smoothCameraBearing || 0;

  const targetHeading =
    normalizeHeading(
      heading
    );

  const duration = 380;

  const start =
    performance.now();

  function animate(now) {

    const progress =
      Math.min(
        1,
        (now - start) / duration
      );

    const eased =
      easeOutCubic(progress);

    const currentLat =
      lerp(
        startCenter.lat,
        lat,
        eased
      );

    const currentLng =
      lerp(
        startCenter.lng,
        lng,
        eased
      );

    const currentZoom =
      lerp(
        startZoom,
        zoom,
        eased
      );

    const currentHeading =
      interpolateHeading(
        startHeading,
        targetHeading,
        eased
      );

    state.map.setView(
      [currentLat, currentLng],
      currentZoom,
      {
        animate: false
      }
    );

    rotateMap(
      currentHeading
    );

    if (progress < 1) {
      smoothAnimationFrame =
        requestAnimationFrame(
          animate
        );
    } else {
      state.smoothCameraBearing =
        currentHeading;
    }
  }

  smoothAnimationFrame =
    requestAnimationFrame(
      animate
    );
}

/* =========================
   ROTATION
========================= */

function rotateMap(
  heading
) {

  const pane =
    state.map
      ?.getPane("mapPane");

  if (!pane) {
    return;
  }

  pane.style.transformOrigin =
    "50% 50%";

  pane.style.transition =
    "transform 0.12s linear";

  pane.style.transform =
    `rotate(${-heading}deg) scale(1.25)`;
}

export function resetMapBearing() {

  const pane =
    state.map
      ?.getPane("mapPane");

  if (!pane) {
    return;
  }

  pane.style.transform =
    "rotate(0deg) scale(1)";
}

/* =========================
   ZOOM
========================= */

function getDynamicZoom(
  speed
) {

  if (
    !state.settings.dynamicZoomEnabled
  ) {
    return 16;
  }

  if (speed < 15) return 17.8;
  if (speed < 30) return 17.2;
  if (speed < 50) return 16.7;
  if (speed < 70) return 16.1;
  if (speed < 90) return 15.5;

  return 14.8;
}

/* =========================
   ROAD AHEAD
========================= */

function calculateRoadAheadCenter(
  position,
  heading,
  speed
) {

  const distance =
    Math.max(
      0.0007,
      speed * 0.000012
    );

  const radians =
    heading * Math.PI / 180;

  return {
    lat:
      position.lat +
      Math.cos(radians) *
      distance,

    lng:
      position.lng +
      Math.sin(radians) *
      distance
  };
}

/* =========================
   HELPERS
========================= */

function lerp(
  start,
  end,
  t
) {
  return start + (end - start) * t;
}

function easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3);
}

function normalizeHeading(
  value
) {

  let heading =
    value % 360;

  if (heading < 0) {
    heading += 360;
  }

  return heading;
}

function interpolateHeading(
  start,
  end,
  t
) {

  let delta =
    end - start;

  while (delta > 180) {
    delta -= 360;
  }

  while (delta < -180) {
    delta += 360;
  }

  return start + delta * t;
}

/* =========================
   VIEW MODES
========================= */

export function enterNavigationView() {

  document.body.classList.add(
    "navigation-active"
  );
}

export function exitNavigationView() {

  document.body.classList.remove(
    "navigation-active"
  );

  resetMapBearing();
}

/* =========================
   RECENTER
========================= */

export function recenterMap() {

  if (
    !state.currentPosition ||
    !state.map
  ) {
    return;
  }

  state.map.flyTo(
    [
      state.currentPosition.lat,
      state.currentPosition.lng
    ],
    16,
    {
      duration: 1
    }
  );
}
