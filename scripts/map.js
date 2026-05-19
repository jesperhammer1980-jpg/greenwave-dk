import { state } from "./state.js";

import {
  smoothValue
} from "./utils.js";

let navigationAnimationFrame = null;

export async function initMap() {

  state.map = L.map(
    "map",
    {
      zoomControl: false,
      attributionControl: false,
      preferCanvas: true
    }
  );

  const darkTiles = L.tileLayer(
    "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
    {
      maxZoom: 20,
      subdomains: "abcd"
    }
  );

  darkTiles.addTo(state.map);

  state.map.setView(
    [55.6761, 12.5683],
    12
  );

  state.map.on(
    "movestart",
    () => {
      state.camera.lastMoveAt = Date.now();
    }
  );
}

/* =========================
   ROUTE
========================= */

export function drawRoute(geometry = []) {

  if (!state.map) {
    return;
  }

  if (state.routeLine) {
    state.map.removeLayer(
      state.routeLine
    );
  }

  const latlngs = geometry.map(
    point => [
      point[1],
      point[0]
    ]
  );

  state.routeLine = L.polyline(
    latlngs,
    {
      color: "#4da3ff",
      weight: 8,
      opacity: 0.92,
      lineJoin: "round",
      lineCap: "round"
    }
  );

  state.routeLine.addTo(
    state.map
  );

  try {
    state.map.fitBounds(
      state.routeLine.getBounds(),
      {
        padding: [50, 50],
        animate: true
      }
    );
  } catch (error) {
    console.warn(
      "fitBounds fejl",
      error
    );
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

  const icon = L.divIcon({
    className: "user-marker-wrap",

    html: `
      <div class="user-marker">
        <div class="user-marker-inner"></div>
      </div>
    `,

    iconSize: [26, 26],
    iconAnchor: [13, 13]
  });

  if (!state.userMarker) {

    state.userMarker = L.marker(
      [lat, lng],
      {
        icon,
        zIndexOffset: 10000
      }
    );

    state.userMarker.addTo(
      state.map
    );

    return;
  }

  state.userMarker.setLatLng(
    [lat, lng]
  );
}

/* =========================
   DESTINATION MARKER
========================= */

export function updateDestinationMarker(
  lat,
  lng
) {

  if (!state.map) {
    return;
  }

  const icon = L.divIcon({
    className: "destination-marker-wrap",

    html: `
      <div class="destination-marker">
        <div class="destination-marker-inner"></div>
      </div>
    `,

    iconSize: [30, 30],
    iconAnchor: [15, 15]
  });

  if (!state.destMarker) {

    state.destMarker = L.marker(
      [lat, lng],
      {
        icon,
        zIndexOffset: 9000
      }
    );

    state.destMarker.addTo(
      state.map
    );

    return;
  }

  state.destMarker.setLatLng(
    [lat, lng]
  );
}

/* =========================
   NAVIGATION CAMERA
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

  const {
    lat,
    lng,
    speed = 0,
    heading = 0
  } = position;

  const zoom =
    calculateDynamicZoom(speed);

  const smoothedHeading =
    smoothHeading(heading);

  const target =
    calculateForwardCameraPosition(
      lat,
      lng,
      smoothedHeading,
      speed
    );

  state.camera.targetZoom =
    zoom;

  state.camera.targetBearing =
    smoothedHeading;

  if (navigationAnimationFrame) {
    cancelAnimationFrame(
      navigationAnimationFrame
    );
  }

  navigationAnimationFrame =
    requestAnimationFrame(() => {

      state.map.flyTo(
        [
          target.lat,
          target.lng
        ],
        zoom,
        {
          animate: true,
          duration: 0.9,
          easeLinearity: 0.18
        }
      );

    });
}

/* =========================
   CAMERA OFFSET
========================= */

function calculateForwardCameraPosition(
  lat,
  lng,
  heading,
  speed
) {

  const distanceMeters =
    Math.min(
      140,
      Math.max(
        45,
        speed * 1.5
      )
    );

  const radians =
    heading * Math.PI / 180;

  const latOffset =
    (Math.cos(radians) * distanceMeters) /
    111320;

  const lngOffset =
    (Math.sin(radians) * distanceMeters) /
    (
      111320 *
      Math.cos(lat * Math.PI / 180)
    );

  return {
    lat: lat + latOffset,
    lng: lng + lngOffset
  };
}

/* =========================
   DYNAMIC ZOOM
========================= */

function calculateDynamicZoom(
  speed
) {

  if (
    !state.settings.dynamicZoomEnabled
  ) {
    return 16;
  }

  if (speed < 20) {
    return 18;
  }

  if (speed < 40) {
    return 17;
  }

  if (speed < 70) {
    return 16;
  }

  if (speed < 100) {
    return 15;
  }

  return 14;
}

/* =========================
   HEADING SMOOTHING
========================= */

function smoothHeading(
  newHeading
) {

  if (
    !Number.isFinite(
      newHeading
    )
  ) {
    return state.lastHeading || 0;
  }

  const current =
    state.smoothedHeading ??
    newHeading;

  let delta =
    newHeading - current;

  while (delta > 180) {
    delta -= 360;
  }

  while (delta < -180) {
    delta += 360;
  }

  const result =
    current + delta * 0.18;

  state.smoothedHeading =
    result;

  return result;
}

/* =========================
   MAP ROTATION
========================= */

export function setMapBearing(
  bearing
) {

  if (
    !Number.isFinite(
      bearing
    )
  ) {
    return;
  }

  const current =
    state.camera.lastBearing || 0;

  const smoothed =
    smoothValue(
      current,
      bearing,
      0.12
    );

  state.camera.lastBearing =
    smoothed;

  document.documentElement
    .style
    .setProperty(
      "--map-bearing",
      `${-smoothed}deg`
    );
}

export function resetMapBearing() {

  document.documentElement
    .style
    .setProperty(
      "--map-bearing",
      `0deg`
    );

  state.camera.lastBearing = 0;
}

/* =========================
   NAVIGATION VIEW
========================= */

export function enterNavigationView() {

  state.camera.mode =
    "navigation";

  document.body.classList.add(
    "navigation-active"
  );
}

export function exitNavigationView() {

  state.camera.mode =
    "overview";

  document.body.classList.remove(
    "navigation-active"
  );

  if (
    state.routeLine
  ) {
    try {

      state.map.fitBounds(
        state.routeLine.getBounds(),
        {
          padding: [50, 50],
          animate: true
        }
      );

    } catch (error) {
      console.warn(error);
    }
  }
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

  const {
    lat,
    lng
  } = state.currentPosition;

  state.map.flyTo(
    [lat, lng],
    state.camera.targetZoom || 16,
    {
      animate: true,
      duration: 0.9
    }
  );
}
