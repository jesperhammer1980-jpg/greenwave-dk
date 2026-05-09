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
  resetMapBearing,
  enterNavigationView,
  exitNavigationView,
  setNavigationNightMode
} from "./map.js";

import {
  getGreenWaveRecommendation
} from "./greenwave.js";

import {
  updateCurrentMaxSpeed
} from "./maxspeed.js";

import {
  getActiveStep,
  getRouteBearingAtProgress,
  getRemainingRouteDistance,
  getRemainingRouteDuration
} from "./route-progress.js";

export async function startLiveNavigation() {
  if (!state.routeData || !state.destination) {
    return;
  }

  state.isNavigating = true;
  state.currentStepIndex = 0;

  resetNavigationPositionState();
  resetRerouteState();
  resetEcoScore();

  enterNavigationView();
  els.navOverlay?.classList.remove("hidden");

  updateNightMode();

  await requestWakeLock();

  document.addEventListener(
    "visibilitychange",
    handleVisibilityChange
  );

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
      maximumAge: 300,
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

  els.navOverlay?.classList.add("hidden");

  resetMapBearing();
  exitNavigationView();

  resetRerouteState();

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

function resetNavigationPositionState() {
  state.rawPosition = null;
  state.previousPosition = null;
  state.smoothedPosition = null;
  state.currentHeading = null;
  state.smoothedHeading = null;
  state.isRecoveringPosition = false;
  state.lastVisibilityChangeAt = null;
  state.lastGoodGpsAt = null;
  state.lastCameraMoveAt = null;
}

function resetRerouteState() {
  if (!state.reroute) {
    return;
  }

  state.reroute.isRerouting = false;
  state.reroute.offRouteSince = null;
  state.reroute.lastRerouteAt = null;
}

function resetEcoScore() {
  state.ecoScore = {
    value: 75,
    samples: 0,
    lastSpeedKmh: null,
    lastTimestamp: null,
    hardAccelerationCount: 0,
    hardBrakeCount: 0,
    speedingCount: 0,
    greenWaveMissCount: 0,
    smoothDrivingBonus: 0
  };

  updateEcoScoreBadge();
}

function initializeNavigationUi() {
  updateTurnCardFromStep(null, null);
  updateTurnProgress(0.12);
  updateSpeedSigns(0, null);
  updateEcoScoreBadge();

  if (els.driveEtaValue) {
    els.driveEtaValue.textContent = "—";
  }
}

async function handleNavigationPosition(position) {
  const raw = {
    lat: position.coords.latitude,
    lng: position.coords.longitude,
    speed: position.coords.speed,
    heading: position.coords.heading,
    accuracy: position.coords.accuracy,
    timestamp: position.timestamp || Date.now()
  };

  if (shouldIgnoreStalePosition(raw)) {
    return;
  }

  const isGoodFix = isGoodGpsFix(raw);

  if (state.isRecoveringPosition && !isGoodFix) {
    setStatus(
      "GPS: genfinder",
      "Navigation: live",
      "Kort: venter på præcis position"
    );
    return;
  }

  state.rawPosition = raw;

  const smooth = state.isRecoveringPosition
    ? { ...raw }
    : smoothPosition(raw);

  if (state.isRecoveringPosition) {
    state.smoothedPosition = smooth;
    state.previousPosition = smooth;
    state.currentPosition = smooth;
    state.lastGoodGpsAt = Date.now();
  }

  updateCurrentMaxSpeed(smooth);

  const active = getActiveStep(smooth);

  const routeBearing =
    getRouteBearingAtProgress(active?.progress);

  const heading =
    getStableNavigationHeading(raw, smooth, routeBearing);

  state.previousPosition = state.currentPosition;
  state.currentPosition = smooth;
  state.smoothedPosition = smooth;
  state.currentHeading = heading;
  state.lastGoodGpsAt = Date.now();

  updateUserMarker(smooth.lat, smooth.lng);

  updateNavigationStats(smooth);

  updateTurnCardFromStep(
    active?.step || null,
    active?.distanceToStep ?? null
  );

  updateEcoScore(smooth);

  await maybeAutoReroute(smooth);

  const snapCamera = state.isRecoveringPosition;

  followNavigationCamera(smooth, {
    routeProgress: active?.progress || null,
    nextStep: active?.step || null,
    snap: snapCamera
  });

  if (shouldRotateMap(raw, heading)) {
    setMapBearing(heading, {
      snap: snapCamera
    });
  }

  if (state.isRecoveringPosition) {
    state.isRecoveringPosition = false;

    setStatus(
      "GPS: live",
      "Navigation: live",
      "Kort: følger position"
    );
  }
}

function shouldIgnoreStalePosition(raw) {
  const age = Date.now() - raw.timestamp;
  return age > 7000;
}

function isGoodGpsFix(raw) {
  if (
    typeof raw.accuracy === "number" &&
    Number.isFinite(raw.accuracy)
  ) {
    return raw.accuracy <= 35;
  }

  return true;
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

  if (distance < 4 && speedKmh < 30) {
    return previous;
  }

  let alpha = 0.24;

  if (speedKmh > 25) {
    alpha = 0.34;
  }

  if (speedKmh > 60) {
    alpha = 0.44;
  }

  if (distance > 80 && speedKmh < 25) {
    alpha = 0.10;
  }

  return {
    ...raw,
    lat: previous.lat + (raw.lat - previous.lat) * alpha,
    lng: previous.lng + (raw.lng - previous.lng) * alpha
  };
}

function getStableNavigationHeading(raw, smooth, routeBearing) {
  const speedKmh = getCurrentSpeedKmh(raw);

  let targetHeading = null;

  if (
    typeof routeBearing === "number" &&
    Number.isFinite(routeBearing)
  ) {
    targetHeading = routeBearing;
  } else if (
    speedKmh > 14 &&
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

    if (moved > 10) {
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
    speedKmh > 75
      ? 0.18
      : speedKmh > 40
        ? 0.22
        : 0.14;

  const maxStep =
    speedKmh > 75
      ? 26
      : speedKmh > 40
        ? 30
        : 20;

  state.smoothedHeading =
    smoothAngleLimited(
      state.smoothedHeading,
      targetHeading,
      alpha,
      maxStep
    );

  return state.smoothedHeading;
}

function shouldRotateMap(raw, heading) {
  const speedKmh = getCurrentSpeedKmh(raw);

  if (speedKmh < 8) {
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
    raw.accuracy > 55
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
  if (!els.driveRemainingDistance) {
    return;
  }

  const remainingMeters =
    getRemainingRouteDistance(current);

  const remainingSeconds =
    getRemainingRouteDuration(
      current,
      speedKmh
    );

  if (Number.isFinite(remainingMeters)) {
    els.driveRemainingDistance.textContent =
      formatDistance(remainingMeters);
  } else if (state.destination) {
    const fallbackMeters = haversine(
      current.lat,
      current.lng,
      state.destination.lat,
      state.destination.lng
    );

    els.driveRemainingDistance.textContent =
      formatDistance(fallbackMeters);
  } else {
    els.driveRemainingDistance.textContent = "—";
  }

  if (els.driveRemainingTime) {
    els.driveRemainingTime.textContent =
      Number.isFinite(remainingSeconds)
        ? formatDuration(remainingSeconds)
        : "—";
  }

  if (els.driveEtaValue) {
    els.driveEtaValue.textContent =
      Number.isFinite(remainingSeconds)
        ? formatEta(remainingSeconds)
        : "—";
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
      Number.isFinite(recommendedSpeedKmh)
        ? String(recommendedSpeedKmh)
        : "?";
  }

  if (!els.currentSpeedSign) {
    return;
  }

  els.currentSpeedSign.classList.remove(
    "speed-ok",
    "speed-warning",
    "speed-danger"
  );

  if (!Number.isFinite(recommendedSpeedKmh) && !maxSpeed) {
    els.currentSpeedSign.classList.add("speed-warning");
    return;
  }

  const referenceSpeed =
    maxSpeed || recommendedSpeedKmh;

  const diff =
    currentSpeedKmh - referenceSpeed;

  if (
    diff <= 4 &&
    (
      !Number.isFinite(recommendedSpeedKmh) ||
      Math.abs(currentSpeedKmh - recommendedSpeedKmh) <= 7
    )
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
      getShortTurnInstruction(step);
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
    !Number.isFinite(distanceToStep)
  ) {
    return 0.18;
  }

  const stepDistance =
    Number(step.distance || 0);

  if (!Number.isFinite(stepDistance) || stepDistance <= 0) {
    if (distanceToStep > 5000) return 0.08;
    if (distanceToStep > 1000) return 0.22;
    if (distanceToStep > 250) return 0.55;
    return 0.82;
  }

  const done =
    1 -
    Math.min(
      1,
      Math.max(
        0,
        distanceToStep / stepDistance
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

function getShortTurnInstruction(step) {
  const type = String(step.maneuverType || "").toLowerCase();
  const modifier = String(step.maneuverModifier || "").toLowerCase();
  const message = String(step.message || "");

  if (type.includes("arrive")) return "Du er fremme";
  if (type.includes("depart")) return "Start";

  if (
    type.includes("roundabout") ||
    type.includes("rotary") ||
    message.toLowerCase().includes("rundkør")
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

  const cleaned = cleanInstruction(message);

  if (cleaned) {
    return removeRoadNameFromInstruction(cleaned);
  }

  return "Fortsæt";
}

function removeRoadNameFromInstruction(value) {
  let text = String(value)
    .replace(/\s+/g, " ")
    .trim();

  text = text.replace(/^drej til venstre ad .+$/i, "Drej til venstre");
  text = text.replace(/^drej til højre ad .+$/i, "Drej til højre");
  text = text.replace(/^fortsæt ad .+$/i, "Fortsæt ligeud");
  text = text.replace(/^følg .+$/i, "Følg vejen");
  text = text.replace(/^hold til venstre ad .+$/i, "Hold til venstre");
  text = text.replace(/^hold til højre ad .+$/i, "Hold til højre");
  text = text.replace(/^tag afkørslen mod .+$/i, "Tag afkørslen");

  return text;
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

  const message = String(step.message || "");

  const roadFromAd =
    message.match(/\bad\s+(.+)$/i)?.[1];

  if (roadFromAd) {
    return roadFromAd.trim();
  }

  if (String(step.maneuverType || "").toLowerCase().includes("arrive")) {
    return "Destination";
  }

  return "";
}

function updateEcoScore(current) {
  if (!state.settings?.ecoScoreEnabled) {
    return;
  }

  const score = state.ecoScore;

  if (!score) {
    return;
  }

  const now = current.timestamp || Date.now();
  const speedKmh = getCurrentSpeedKmh(current);
  const maxSpeed = getCurrentMaxSpeed();
  const recommendation = getGreenWaveRecommendation(current);

  if (
    typeof score.lastSpeedKmh !== "number" ||
    !Number.isFinite(score.lastSpeedKmh) ||
    typeof score.lastTimestamp !== "number" ||
    !Number.isFinite(score.lastTimestamp)
  ) {
    score.lastSpeedKmh = speedKmh;
    score.lastTimestamp = now;
    score.samples += 1;
    updateEcoScoreBadge();
    return;
  }

  const deltaSeconds =
    Math.max(0.75, (now - score.lastTimestamp) / 1000);

  const deltaSpeed =
    speedKmh - score.lastSpeedKmh;

  const acceleration =
    deltaSpeed / deltaSeconds;

  let change = 0;

  const isMoving =
    speedKmh > 8 || score.lastSpeedKmh > 8;

  if (isMoving) {
    if (Math.abs(acceleration) <= 1.5) {
      change += 0.45;
    } else if (acceleration > 1.5 && acceleration <= 4.5) {
      change += 0.25;
    } else if (acceleration < -1.5 && acceleration >= -5.5) {
      change += 0.25;
    } else if (acceleration > 7.5) {
      change -= 1.4;
      score.hardAccelerationCount += 1;
    } else if (acceleration < -9.5) {
      change -= 1.6;
      score.hardBrakeCount += 1;
    }

    if (maxSpeed) {
      if (speedKmh <= maxSpeed + 2) {
        change += 0.18;
      } else if (speedKmh > maxSpeed + 6) {
        change -= 1.1;
        score.speedingCount += 1;
      }
    }

    if (Number.isFinite(recommendation.speedKmh)) {
      const diff =
        Math.abs(speedKmh - recommendation.speedKmh);

      if (diff <= 7) {
        change += 0.3;
      } else if (diff > 18 && speedKmh > 20) {
        change -= 0.8;
        score.greenWaveMissCount += 1;
      }
    }

    if (
      Math.abs(deltaSpeed) <= 2 &&
      speedKmh >= 25
    ) {
      change += 0.25;
      score.smoothDrivingBonus += 0.1;
    }
  }

  if (
    !isMoving &&
    speedKmh < 5 &&
    score.lastSpeedKmh < 5
  ) {
    change += 0.03;
  }

  score.samples += 1;
  score.lastSpeedKmh = speedKmh;
  score.lastTimestamp = now;

  score.value =
    Math.max(
      0,
      Math.min(
        100,
        Math.round((score.value || 75) + change)
      )
    );

  updateEcoScoreBadge();
}

function updateEcoScoreBadge() {
  if (!els.ecoScoreBadge) {
    return;
  }

  const value =
    Number.isFinite(state.ecoScore?.value)
      ? state.ecoScore.value
      : 75;

  els.ecoScoreBadge.textContent =
    `Eco ${value}`;

  els.ecoScoreBadge.classList.remove(
    "eco-ok",
    "eco-mid",
    "eco-low"
  );

  if (value >= 80) {
    els.ecoScoreBadge.classList.add("eco-ok");
  } else if (value >= 55) {
    els.ecoScoreBadge.classList.add("eco-mid");
  } else {
    els.ecoScoreBadge.classList.add("eco-low");
  }
}

async function maybeAutoReroute(current) {
  if (!state.settings?.autoRerouteEnabled) {
    return;
  }

  if (!state.reroute || state.reroute.isRerouting) {
    return;
  }

  if (!state.routeData?.geometry?.length || !state.destination) {
    return;
  }

  const distanceToRoute =
    getDistanceToRouteMeters(current);

  if (!Number.isFinite(distanceToRoute)) {
    return;
  }

  const now = Date.now();

  const limit =
    state.reroute.offRouteDistanceLimitMeters || 70;

  const delay =
    state.reroute.offRouteDelayMs || 8000;

  const cooldown =
    state.reroute.rerouteCooldownMs || 25000;

  if (distanceToRoute <= limit) {
    state.reroute.offRouteSince = null;
    return;
  }

  if (!state.reroute.offRouteSince) {
    state.reroute.offRouteSince = now;
    return;
  }

  const hasBeenOffRouteLongEnough =
    now - state.reroute.offRouteSince >= delay;

  const cooldownPassed =
    !state.reroute.lastRerouteAt ||
    now - state.reroute.lastRerouteAt >= cooldown;

  if (!hasBeenOffRouteLongEnough || !cooldownPassed) {
    return;
  }

  await triggerReroute(current);
}

async function triggerReroute(current) {
  try {
    state.reroute.isRerouting = true;
    state.reroute.lastRerouteAt = Date.now();

    setStatus(
      "GPS: live",
      "Navigation: genberegner",
      "Kort: ny rute"
    );

    const routing =
      await import("./routing.js");

    if (typeof routing.recalculateRouteFromCurrentPosition !== "function") {
      throw new Error("Reroute-funktion mangler i routing.js");
    }

    await routing.recalculateRouteFromCurrentPosition(current);

    state.currentStepIndex = 0;
    state.reroute.offRouteSince = null;

    setStatus(
      "GPS: live",
      "Navigation: live",
      "Kort: ny rute klar"
    );
  } catch (error) {
    console.error("Auto-reroute fejl", error);

    setStatus(
      "GPS: live",
      "Navigation: reroute fejl",
      "Kort: fortsætter"
    );
  } finally {
    state.reroute.isRerouting = false;
  }
}

function getDistanceToRouteMeters(position) {
  const geometry = state.routeData?.geometry;

  if (!position || !Array.isArray(geometry) || geometry.length < 2) {
    return Infinity;
  }

  let best = Infinity;

  for (let i = 1; i < geometry.length; i++) {
    const start = geometry[i - 1];
    const end = geometry[i];

    const distance =
      distancePointToSegmentApproxMeters(
        position.lat,
        position.lng,
        start[1],
        start[0],
        end[1],
        end[0]
      );

    if (distance < best) {
      best = distance;
    }
  }

  return best;
}

function distancePointToSegmentApproxMeters(
  lat,
  lng,
  lat1,
  lng1,
  lat2,
  lng2
) {
  const metersPerDegreeLat = 111320;
  const metersPerDegreeLng =
    111320 * Math.cos(lat * Math.PI / 180);

  const px = lng * metersPerDegreeLng;
  const py = lat * metersPerDegreeLat;

  const ax = lng1 * metersPerDegreeLng;
  const ay = lat1 * metersPerDegreeLat;

  const bx = lng2 * metersPerDegreeLng;
  const by = lat2 * metersPerDegreeLat;

  const dx = bx - ax;
  const dy = by - ay;

  const lengthSquared =
    dx * dx + dy * dy;

  if (lengthSquared === 0) {
    return Math.hypot(px - ax, py - ay);
  }

  let t =
    ((px - ax) * dx + (py - ay) * dy) /
    lengthSquared;

  t = Math.max(0, Math.min(1, t));

  const projectedX = ax + t * dx;
  const projectedY = ay + t * dy;

  return Math.hypot(
    px - projectedX,
    py - projectedY
  );
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

function formatEta(secondsFromNow) {
  if (!Number.isFinite(secondsFromNow)) {
    return "—";
  }

  const eta = new Date(
    Date.now() + secondsFromNow * 1000
  );

  return eta.toLocaleTimeString("da-DK", {
    hour: "2-digit",
    minute: "2-digit"
  });
}

function updateNightMode() {
  const hour = new Date().getHours();

  const isNight =
    hour >= 20 || hour <= 6;

  setNavigationNightMode(isNight);
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
  if (!state.isNavigating) {
    return;
  }

  if (document.visibilityState === "hidden") {
    state.isRecoveringPosition = true;
    state.lastVisibilityChangeAt = Date.now();
    return;
  }

  if (document.visibilityState === "visible") {
    state.isRecoveringPosition = true;

    state.smoothedPosition = null;
    state.previousPosition = null;
    state.lastCameraMoveAt = null;

    setStatus(
      "GPS: genfinder",
      "Navigation: live",
      "Kort: venter på position"
    );

    if (!state.wakeLock) {
      await requestWakeLock();
    }
  }
}
