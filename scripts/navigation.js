import { state } from "./state.js";
import { els } from "./dom.js";

import {
  formatDistance,
  setStatus,
  haversine
} from "./utils.js";

import {
  updateUserMarker,
  recenterMap,
  followNavigationCamera,
  setMapBearing,
  resetMapBearing
} from "./map.js";

import {
  getGreenWaveRecommendation
} from "./greenwave.js";

import {
  getActiveStep,
  getRouteBearingAtProgress
} from "./route-progress.js";

export async function startLiveNavigation() {
  if (!state.routeData || !state.destination) {
    return;
  }

  state.isNavigating = true;
  state.currentStepIndex = 0;

  state.rawPosition = null;
  state.previousPosition = null;
  state.smoothedPosition = null;
  state.currentHeading = null;
  state.smoothedHeading = null;

  document.body.classList.add("navigation-active");
  els.navOverlay?.classList.remove("hidden");

  await requestWakeLock();

  document.addEventListener(
    "visibilitychange",
    handleVisibilityChange
  );

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

export async function stopLiveNavigation() {
  state.isNavigating = false;

  if (state.watchId !== null) {
    navigator.geolocation.clearWatch(state.watchId);
    state.watchId = null;
  }

  document.removeEventListener(
    "visibilitychange",
    handleVisibilityChange
  );

  await releaseWakeLock();

  document.body.classList.remove("navigation-active");
  els.navOverlay?.classList.add("hidden");

  resetMapBearing();

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
  updateSpeedSigns(0, 45);
}

function handleNavigationPosition(position) {
  const raw = {
    lat: position.coords.latitude,
    lng: position.coords.longitude,
    speed: position.coords.speed,
    heading: position.coords.heading,
    accuracy: position.coords.accuracy,
    timestamp: position.timestamp || Date.now()
  };

  state.rawPosition = raw;

  const smooth = smoothPosition(raw);

  const active = getActiveStep(smooth);
  const routeBearing =
    getRouteBearingAtProgress(active?.progress);

  const heading =
    getStableNavigationHeading(raw, smooth, routeBearing);

  state.previousPosition = state.currentPosition;
  state.currentPosition = smooth;
  state.smoothedPosition = smooth;
  state.currentHeading = heading;

  updateUserMarker(smooth.lat, smooth.lng);

  updateNavigationStats(smooth);
  updateTurnCardFromStep(
    active?.step || null,
    active?.distanceToStep ?? null
  );

  followNavigationCamera(smooth);

  if (shouldRotateMap(raw, heading)) {
    setMapBearing(heading);
  }
}

function handleNavigationError(error) {
  console.error("Navigation GPS fejl", error);

  setStatus(
    "GPS: fejl",
    "Navigation: live",
    "Kort: GPS fejl"
  );
}

function smoothPosition(raw) {
  if (!state.smoothedPosition) {
    return { ...raw };
  }

  const previous = state.smoothedPosition;

  const distance = haversine(
    previous.lat,
    previous.lng,
    raw.lat,
    raw.lng
  );

  const speedKmh = getCurrentSpeedKmh(raw);

  if (distance < 2.5 && speedKmh < 10) {
    return previous;
  }

  let alpha = 0.28;

  if (speedKmh > 25) {
    alpha = 0.38;
  }

  if (speedKmh > 60) {
    alpha = 0.48;
  }

  if (distance > 80 && speedKmh < 25) {
    alpha = 0.12;
  }

  return {
    ...raw,
    lat: previous.lat + (raw.lat - previous.lat) * alpha,
    lng: previous.lng + (raw.lng - previous.lng) * alpha
  };
}

function getStableNavigationHeading(raw, smooth, routeBearing) {
  const speedKmh = getCurrentSpeedKmh(raw);

  /*
    Vigtig ændring:
    Rå GPS-heading på telefon kan være ustabil og give spin.
    Ved navigation prioriterer vi rutens bearing, hvis den findes.
  */

  let targetHeading = null;

  if (
    typeof routeBearing === "number" &&
    Number.isFinite(routeBearing)
  ) {
    targetHeading = routeBearing;
  } else if (
    speedKmh > 12 &&
    typeof raw.heading === "number" &&
    Number.isFinite(raw.heading) &&
    raw.heading >= 0
  ) {
    targetHeading = raw.heading;
  } else if (state.previousPosition) {
    const moved = haversine(
      state.previousPosition.lat,
      state.previousPosition.lng,
      smooth.lat,
      smooth.lng
    );

    if (moved > 8) {
      targetHeading = calculateBearing(
        state.previousPosition.lat,
        state.previousPosition.lng,
        smooth.lat,
        smooth.lng
      );
    }
  }

  if (
    typeof targetHeading !== "number" ||
    !Number.isFinite(targetHeading)
  ) {
    return state.smoothedHeading;
  }

  if (
    typeof state.smoothedHeading !== "number" ||
    !Number.isFinite(state.smoothedHeading)
  ) {
    state.smoothedHeading = targetHeading;
    return targetHeading;
  }

  const alpha =
    speedKmh > 70
      ? 0.10
      : speedKmh > 35
        ? 0.13
        : 0.08;

  state.smoothedHeading =
    smoothAngleLimited(
      state.smoothedHeading,
      targetHeading,
      alpha,
      18
    );

  return state.smoothedHeading;
}

function shouldRotateMap(raw, heading) {
  const speedKmh = getCurrentSpeedKmh(raw);

  if (speedKmh < 10) {
    return false;
  }

  if (
    typeof heading !== "number" ||
    !Number.isFinite(heading)
  ) {
    return false;
  }

  if (
    typeof raw.accuracy === "number" &&
    raw.accuracy > 45
  ) {
    return false;
  }

  return true;
}

function calculateBearing(lat1, lng1, lat2, lng2) {
  const toRad = value => value * Math.PI / 180;
  const toDeg = value => value * 180 / Math.PI;

  const φ1 = toRad(lat1);
  const φ2 = toRad(lat2);
  const Δλ = toRad(lng2 - lng1);

  const y =
    Math.sin(Δλ) *
    Math.cos(φ2);

  const x =
    Math.cos(φ1) *
    Math.sin(φ2) -
    Math.sin(φ1) *
    Math.cos(φ2) *
    Math.cos(Δλ);

  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

function smoothAngleLimited(current, target, alpha, maxStepDegrees) {
  const diff =
    ((target - current + 540) % 360) - 180;

  const limitedDiff =
    Math.max(
      -maxStepDegrees,
      Math.min(maxStepDegrees, diff)
    );

  return (
    current +
    limitedDiff * alpha +
    360
  ) % 360;
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

function updateRemainingTripStats(current, speedKmh) {
  if (!state.destination || !els.driveRemainingDistance) {
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

function updateSpeedSigns(currentSpeedKmh, recommendedSpeedKmh) {
  const maxSpeed = getCurrentMaxSpeed();

  if (els.speedLimitValue) {
    els.speedLimitValue.textContent =
      maxSpeed ? String(maxSpeed) : "?";
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

  const referenceSpeed =
    maxSpeed || recommendedSpeedKmh;

  const diff =
    currentSpeedKmh - referenceSpeed;

  if (
    diff <= 4 &&
    Math.abs(currentSpeedKmh - recommendedSpeedKmh) <= 7
  ) {
    els.currentSpeedSign.classList.add("speed-ok");
    return;
  }

  if (diff <= 10) {
    els.currentSpeedSign.classList.add("speed-warning");
    return;
  }

  els.currentSpeedSign.classList.add("speed-danger");
}

function getCurrentMaxSpeed() {
  if (
    typeof state.currentMaxSpeed === "number" &&
    Number.isFinite(state.currentMaxSpeed)
  ) {
    return state.currentMaxSpeed;
  }

  return null;
}

function updateTurnCardFromStep(step, distanceToStep) {
  if (!step) {
    if (els.turnIcon) {
      els.turnIcon.textContent = "↑";
    }

    if (els.nextTurnDistance) {
      els.nextTurnDistance.textContent = "Følg ruten";
    }

    if (els.nextTurnInstruction) {
      els.nextTurnInstruction.textContent = "Fortsæt ligeud";
    }

    if (els.nextTurnRoad) {
      els.nextTurnRoad.textContent = "GreenWave navigation";
    }

    updateTurnProgress(0.12);
    return;
  }

  if (els.turnIcon) {
    els.turnIcon.textContent = getTurnIcon(step);
  }

  if (els.nextTurnDistance) {
    els.nextTurnDistance.textContent =
      Number.isFinite(distanceToStep)
        ? formatDistance(distanceToStep)
        : "Snart";
  }

  if (els.nextTurnInstruction) {
    els.nextTurnInstruction.textContent =
      getTurnInstruction(step);
  }

  if (els.nextTurnRoad) {
    els.nextTurnRoad.textContent =
      getRoadName(step);
  }

  updateTurnProgress(
    calculateStepProgress(step, distanceToStep)
  );
}

function calculateStepProgress(step, distanceToStep) {
  if (
    !step ||
    !Number.isFinite(distanceToStep) ||
    !Number.isFinite(step.distance) ||
    step.distance <= 0
  ) {
    return 0.18;
  }

  const done =
    1 -
    Math.min(
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
  const type = String(step.maneuverType || "").toLowerCase();
  const modifier = String(step.maneuverModifier || "").toLowerCase();
  const message = String(step.message || "").toLowerCase();

  if (type.includes("arrive")) return "🏁";

  if (
    type.includes("roundabout") ||
    type.includes("rotary") ||
    message.includes("rundkør") ||
    message.includes("roundabout")
  ) {
    return "↻";
  }

  if (modifier.includes("left")) return "↰";
  if (modifier.includes("right")) return "↱";
  if (modifier.includes("uturn")) return "↶";
  if (modifier.includes("straight")) return "↑";

  if (type.includes("depart")) return "↑";
  if (type.includes("merge")) return "⇢";
  if (type.includes("fork")) return "↗";
  if (type.includes("ramp")) return "↘";

  return "↑";
}

function getTurnInstruction(step) {
  const type = String(step.maneuverType || "").toLowerCase();
  const modifier = String(step.maneuverModifier || "").toLowerCase();
  const message = String(step.message || "");

  if (message && message.length < 80) {
    return cleanInstruction(message);
  }

  if (type.includes("arrive")) return "Du er fremme";
  if (type.includes("depart")) return "Start og fortsæt";

  if (
    type.includes("roundabout") ||
    type.includes("rotary")
  ) {
    return getRoundaboutInstruction(step);
  }

  if (type.includes("merge")) return "Flet ind";

  if (type.includes("fork")) {
    if (modifier.includes("left")) return "Hold til venstre";
    if (modifier.includes("right")) return "Hold til højre";
    return "Hold retningen";
  }

  if (type.includes("on ramp")) return "Kør på rampen";
  if (type.includes("off ramp")) return "Tag afkørslen";

  if (modifier.includes("left")) return "Drej til venstre";
  if (modifier.includes("right")) return "Drej til højre";
  if (modifier.includes("uturn")) return "Vend om";
  if (modifier.includes("straight")) return "Fortsæt ligeud";

  return "Fortsæt";
}

function getRoundaboutInstruction(step) {
  const exit =
    step.roundaboutExit ||
    step.exitNumber ||
    step.exit;

  if (exit) {
    return `Tag ${exit}. afkørsel`;
  }

  return "Kør gennem rundkørslen";
}

function cleanInstruction(value) {
  return String(value)
    .replace(/\s+/g, " ")
    .trim();
}

function getRoadName(step) {
  if (step.name) {
    return step.name;
  }

  if (String(step.maneuverType || "").toLowerCase().includes("arrive")) {
    return "Destination";
  }

  return "Næste vej";
}

function getCurrentSpeedKmh(current) {
  if (
    typeof current?.speed === "number" &&
    Number.isFinite(current.speed)
  ) {
    return Math.max(
      0,
      Math.round(current.speed * 3.6)
    );
  }

  return 0;
}

function estimateRemainingSeconds(distanceMeters, speedKmh) {
  if (!Number.isFinite(distanceMeters)) {
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
  if (!Number.isFinite(seconds)) {
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

async function requestWakeLock() {
  try {
    if (!("wakeLock" in navigator)) {
      return;
    }

    state.wakeLock =
      await navigator.wakeLock.request("screen");

    state.wakeLock.addEventListener("release", () => {
      state.wakeLock = null;
    });
  } catch (error) {
    console.warn("Wake Lock ikke tilgængelig", error);
    state.wakeLock = null;
  }
}

async function releaseWakeLock() {
  try {
    if (state.wakeLock) {
      await state.wakeLock.release();
      state.wakeLock = null;
    }
  } catch (error) {
    console.warn("Kunne ikke frigive Wake Lock", error);
    state.wakeLock = null;
  }
}

async function handleVisibilityChange() {
  if (
    document.visibilityState === "visible" &&
    state.isNavigating &&
    !state.wakeLock
  ) {
    await requestWakeLock();
  }
}
