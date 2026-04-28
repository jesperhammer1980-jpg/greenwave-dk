import { state } from "./state.js";
import { els } from "./dom.js";

import {
  formatDistance,
  setStatus,
  haversine
} from "./utils.js";

import {
  updateUserMarker,
  recenterMap
} from "./map.js";

import {
  getGreenWaveRecommendation
} from "./greenwave.js";

export function startLiveNavigation() {
  if (!state.routeData || !state.destination) {
    return;
  }

  state.isNavigating = true;

  document.body.classList.add("navigation-active");
  els.navOverlay?.classList.remove("hidden");

  setTimeout(() => {
    state.map?.invalidateSize();
  }, 250);

  if (els.startNavBtn) {
    els.startNavBtn.disabled = true;
  }

  if (els.stopNavBtn) {
    els.stopNavBtn.disabled = false;
  }

  setStatus(
    "GPS: live",
    "Navigation: live",
    "Kort: følger position"
  );

  initializeNavigationUi();

  if (state.watchId !== null) {
    navigator.geolocation.clearWatch(state.watchId);
    state.watchId = null;
  }

  state.watchId = navigator.geolocation.watchPosition(
    handleNavigationPosition,
    handleNavigationError,
    {
      enableHighAccuracy: true,
      maximumAge: 500,
      timeout: 15000
    }
  );
}

export function stopLiveNavigation() {
  state.isNavigating = false;

  if (state.watchId !== null) {
    navigator.geolocation.clearWatch(state.watchId);
    state.watchId = null;
  }

  document.body.classList.remove("navigation-active");
  els.navOverlay?.classList.add("hidden");

  setTimeout(() => {
    state.map?.invalidateSize();
  }, 250);

  if (els.startNavBtn) {
    els.startNavBtn.disabled = !state.routeData;
  }

  if (els.stopNavBtn) {
    els.stopNavBtn.disabled = true;
  }

  setStatus(
    "GPS: klar",
    "Navigation: inaktiv",
    "Kort: klar"
  );

  recenterMap();
}

function initializeNavigationUi() {
  if (els.turnIcon) {
    els.turnIcon.textContent = "↑";
  }

  if (els.nextTurnDistance) {
    els.nextTurnDistance.textContent = "Følg ruten";
  }

  if (els.nextTurnInstruction) {
    els.nextTurnInstruction.textContent =
      "Fortsæt ligeud";
  }

  if (els.nextTurnRoad) {
    els.nextTurnRoad.textContent =
      "GreenWave navigation";
  }

  updateTurnProgress(0.15);
}

function handleNavigationPosition(position) {
  const current = {
    lat: position.coords.latitude,
    lng: position.coords.longitude,
    speed: position.coords.speed,
    heading: position.coords.heading,
    accuracy: position.coords.accuracy
  };

  state.currentPosition = current;

  updateUserMarker(current.lat, current.lng);

  updateNavigationStats(current);
  updateTurnCard(current);

  followCurrentPosition(current);
}

function handleNavigationError(error) {
  console.error("Navigation GPS fejl", error);

  setStatus(
    "GPS: fejl",
    "Navigation: live",
    "Kort: GPS fejl"
  );
}

function updateNavigationStats(current) {
  const currentSpeedKmh =
    getCurrentSpeedKmh(current);

  if (els.driveCurrentValue) {
    els.driveCurrentValue.textContent =
      `${currentSpeedKmh} km/t`;
  }

  updateRemainingTripStats(
    current,
    currentSpeedKmh
  );

  const recommendation =
    updateGreenWaveBanner(current);

  updateSpeedSigns(
    currentSpeedKmh,
    recommendation.speedKmh
  );
}

function updateRemainingTripStats(
  current,
  speedKmh
) {
  if (
    !state.destination ||
    !els.driveRemainingDistance
  ) {
    return;
  }

  const remainingMeters = haversine(
    current.lat,
    current.lng,
    state.destination.lat,
    state.destination.lng
  );

  els.driveRemainingDistance.textContent =
    formatDistance(remainingMeters);

  if (els.driveRemainingTime) {
    const estimatedSeconds =
      estimateRemainingSeconds(
        remainingMeters,
        speedKmh
      );

    els.driveRemainingTime.textContent =
      formatDuration(estimatedSeconds);
  }
}

function updateGreenWaveBanner(current) {
  const recommendation =
    getGreenWaveRecommendation(current);

  return recommendation;
}

function updateSpeedSigns(
  currentSpeedKmh,
  recommendedSpeedKmh
) {
  if (els.speedLimitValue) {
    els.speedLimitValue.textContent = "?";
  }

  if (els.currentSpeedValue) {
    els.currentSpeedValue.textContent =
      String(currentSpeedKmh);
  }

  if (els.recommendedSpeedValue) {
    els.recommendedSpeedValue.textContent =
      String(recommendedSpeedKmh);
  }

  if (!els.currentSpeedSign) {
    return;
  }

  els.currentSpeedSign.classList.remove(
    "speed-ok",
    "speed-warning",
    "speed-danger"
  );

  const diff =
    currentSpeedKmh -
    recommendedSpeedKmh;

  if (Math.abs(diff) <= 4) {
    els.currentSpeedSign.classList.add(
      "speed-ok"
    );
    return;
  }

  if (Math.abs(diff) <= 10) {
    els.currentSpeedSign.classList.add(
      "speed-warning"
    );
    return;
  }

  els.currentSpeedSign.classList.add(
    "speed-danger"
  );
}

function updateTurnCard(current) {
  /*
    Første premium navigation version.
    Rigtige OSRM maneuvers kommer senere.
  */

  const speedKmh =
    getCurrentSpeedKmh(current);

  let instruction =
    "Fortsæt ligeud";

  let icon = "↑";

  if (speedKmh < 8) {
    instruction =
      "Kør roligt frem";
  }

  if (speedKmh > 70) {
    instruction =
      "Hold banen";
  }

  if (els.turnIcon) {
    els.turnIcon.textContent = icon;
  }

  if (els.nextTurnDistance) {
    els.nextTurnDistance.textContent =
      "Næste instruktion";
  }

  if (els.nextTurnInstruction) {
    els.nextTurnInstruction.textContent =
      instruction;
  }

  if (els.nextTurnRoad) {
    els.nextTurnRoad.textContent =
      "GreenWave Route";
  }

  const progress =
    Math.min(
      1,
      Math.max(
        0.1,
        speedKmh / 100
      )
    );

  updateTurnProgress(progress);
}

function updateTurnProgress(progress) {
  if (!els.turnProgressBar) {
    return;
  }

  els.turnProgressBar.style.width =
    `${progress * 100}%`;
}

function followCurrentPosition(current) {
  if (
    !state.map ||
    !state.isNavigating
  ) {
    return;
  }

  const zoom = Math.max(
    state.map.getZoom(),
    17
  );

  state.map.setView(
    [current.lat, current.lng],
    zoom,
    {
      animate: true,
      duration: 0.4
    }
  );

  window.requestAnimationFrame(() => {
    if (
      !state.map ||
      !state.isNavigating
    ) {
      return;
    }

    state.map.panBy(
      [0, 120],
      {
        animate: true,
        duration: 0.25
      }
    );
  });
}

function getCurrentSpeedKmh(current) {
  if (
    typeof current.speed === "number" &&
    Number.isFinite(current.speed)
  ) {
    return Math.max(
      0,
      Math.round(current.speed * 3.6)
    );
  }

  return 0;
}

function estimateRemainingSeconds(
  distanceMeters,
  speedKmh
) {
  if (
    !Number.isFinite(distanceMeters)
  ) {
    return null;
  }

  const fallbackSpeedKmh = 70;

  const safeSpeedKmh =
    speedKmh > 5
      ? speedKmh
      : fallbackSpeedKmh;

  return Math.round(
    distanceMeters /
    (safeSpeedKmh * 1000 / 3600)
  );
}

function formatDuration(seconds) {
  if (
    !Number.isFinite(seconds)
  ) {
    return "—";
  }

  const minutes = Math.max(
    1,
    Math.round(seconds / 60)
  );

  if (minutes < 60) {
    return `${minutes} min`;
  }

  const hours =
    Math.floor(minutes / 60);

  const restMinutes =
    minutes % 60;

  if (restMinutes === 0) {
    return `${hours} t`;
  }

  return `${hours} t ${restMinutes} min`;
}
