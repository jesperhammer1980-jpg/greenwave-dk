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
  state.currentStepIndex = 0;

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
  updateTurnCardFromStep(null, null);

  updateTurnProgress(0.12);
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
  updateRouteStepProgress(current);
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
    getGreenWaveRecommendation(current);

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

function updateRouteStepProgress(current) {
  const steps = Array.isArray(state.routeSteps)
    ? state.routeSteps
    : [];

  if (!steps.length) {
    updateTurnCardFromStep(null, null);
    return;
  }

  let index = state.currentStepIndex || 0;

  if (index >= steps.length) {
    index = steps.length - 1;
  }

  let step = steps[index];
  let distanceToStep = distanceToStepManeuver(
    current,
    step
  );

  while (
    index < steps.length - 1 &&
    Number.isFinite(distanceToStep) &&
    distanceToStep < 25
  ) {
    index += 1;
    step = steps[index];
    distanceToStep =
      distanceToStepManeuver(current, step);
  }

  state.currentStepIndex = index;

  updateTurnCardFromStep(
    step,
    distanceToStep
  );
}

function updateTurnCardFromStep(
  step,
  distanceToStep
) {
  if (!step) {
    if (els.turnIcon) {
      els.turnIcon.textContent = "↑";
    }

    if (els.nextTurnDistance) {
      els.nextTurnDistance.textContent =
        "Følg ruten";
    }

    if (els.nextTurnInstruction) {
      els.nextTurnInstruction.textContent =
        "Fortsæt ligeud";
    }

    if (els.nextTurnRoad) {
      els.nextTurnRoad.textContent =
        "GreenWave navigation";
    }

    updateTurnProgress(0.12);
    return;
  }

  const icon = getTurnIcon(step);
  const instruction =
    getTurnInstruction(step);
  const road =
    getRoadName(step);

  if (els.turnIcon) {
    els.turnIcon.textContent = icon;
  }

  if (els.nextTurnDistance) {
    els.nextTurnDistance.textContent =
      Number.isFinite(distanceToStep)
        ? formatDistance(distanceToStep)
        : "Snart";
  }

  if (els.nextTurnInstruction) {
    els.nextTurnInstruction.textContent =
      instruction;
  }

  if (els.nextTurnRoad) {
    els.nextTurnRoad.textContent = road;
  }

  const progress =
    calculateStepProgress(
      step,
      distanceToStep
    );

  updateTurnProgress(progress);
}

function distanceToStepManeuver(current, step) {
  if (!current || !step?.location) {
    return Infinity;
  }

  return haversine(
    current.lat,
    current.lng,
    step.location.lat,
    step.location.lng
  );
}

function calculateStepProgress(
  step,
  distanceToStep
) {
  if (
    !step ||
    !Number.isFinite(distanceToStep) ||
    !Number.isFinite(step.distance) ||
    step.distance <= 0
  ) {
    return 0.18;
  }

  const done =
    1 - Math.min(
      1,
      Math.max(
        0,
        distanceToStep / step.distance
      )
    );

  return Math.max(0.08, Math.min(1, done));
}

function updateTurnProgress(progress) {
  if (!els.turnProgressBar) {
    return;
  }

  els.turnProgressBar.style.width =
    `${Math.round(progress * 100)}%`;
}

function getTurnIcon(step) {
  const type = step.maneuverType;
  const modifier = step.maneuverModifier;

  if (type === "arrive") {
    return "🏁";
  }

  if (type === "roundabout" || type === "rotary") {
    return "↻";
  }

  if (modifier?.includes("left")) {
    return "↰";
  }

  if (modifier?.includes("right")) {
    return "↱";
  }

  if (modifier === "uturn") {
    return "↶";
  }

  if (modifier === "straight") {
    return "↑";
  }

  if (type === "depart") {
    return "↑";
  }

  if (type === "merge") {
    return "⇢";
  }

  if (type === "fork") {
    return "↗";
  }

  if (type === "on ramp") {
    return "↗";
  }

  if (type === "off ramp") {
    return "↘";
  }

  return "↑";
}

function getTurnInstruction(step) {
  const type = step.maneuverType;
  const modifier = step.maneuverModifier;

  if (type === "arrive") {
    return "Du er fremme";
  }

  if (type === "depart") {
    return "Start og fortsæt";
  }

  if (type === "roundabout" || type === "rotary") {
    return "Kør ind i rundkørslen";
  }

  if (type === "merge") {
    return "Flet ind";
  }

  if (type === "fork") {
    if (modifier?.includes("left")) {
      return "Hold til venstre";
    }

    if (modifier?.includes("right")) {
      return "Hold til højre";
    }

    return "Hold retningen";
  }

  if (type === "on ramp") {
    return "Kør på rampen";
  }

  if (type === "off ramp") {
    return "Tag afkørslen";
  }

  if (modifier?.includes("left")) {
    return "Drej til venstre";
  }

  if (modifier?.includes("right")) {
    return "Drej til højre";
  }

  if (modifier === "uturn") {
    return "Vend om";
  }

  if (modifier === "straight") {
    return "Fortsæt ligeud";
  }

  return "Fortsæt";
}

function getRoadName(step) {
  if (step.name) {
    return step.name;
  }

  if (step.maneuverType === "arrive") {
    return "Destination";
  }

  return "Næste vej";
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
