import { state } from "./state.js";
import { els } from "./dom.js";

import {
  updateUserMarker,
  followNavigationCamera,
  setMapBearing,
  resetMapBearing,
  enterNavigationView,
  exitNavigationView
} from "./map.js";

import {
  setStatus,
  formatDistance,
  haversine
} from "./utils.js";

import {
  recalculateRouteFromCurrentPosition
} from "./routing.js";

import {
  getGreenWaveRecommendation
} from "./greenwave.js";

let watchId = null;
let lastRerouteTime = 0;

const REROUTE_COOLDOWN = 22000;
const OFF_ROUTE_DISTANCE = 90;
const OFF_ROUTE_DELAY = 7000;

export async function startLiveNavigation() {
  if (!state.routeData?.geometry?.length) {
    alert("Beregn en rute først.");
    return;
  }

  if (!navigator.geolocation) {
    alert("GPS understøttes ikke.");
    return;
  }

  prepareRouteMeasurements();
  resetTripEcoScore();

  state.isNavigating = true;

  enterNavigationView();

  els.navOverlay?.classList.remove("hidden");

  if (els.startNavBtn) {
    els.startNavBtn.disabled = true;
  }

  if (els.stopNavBtn) {
    els.stopNavBtn.disabled = false;
  }

  setStatus(
    "GPS: live",
    "Navigation: aktiv",
    "Kort: navigation"
  );

  startGpsWatch();
}

export function stopLiveNavigation() {
  if (watchId !== null) {
    navigator.geolocation.clearWatch(watchId);
    watchId = null;
  }

  state.isNavigating = false;

  els.navOverlay?.classList.add("hidden");

  resetMapBearing();
  exitNavigationView();

  if (els.startNavBtn) {
    els.startNavBtn.disabled = !state.routeData;
  }

  if (els.stopNavBtn) {
    els.stopNavBtn.disabled = true;
  }

  setStatus(
    "GPS: klar",
    "Navigation: stoppet",
    "Kort: klar"
  );

  showEcoScoreSummary();
}

function startGpsWatch() {
  if (watchId !== null) {
    navigator.geolocation.clearWatch(watchId);
  }

  watchId = navigator.geolocation.watchPosition(
    handleGpsUpdate,
    handleGpsError,
    {
      enableHighAccuracy: true,
      maximumAge: 700,
      timeout: 10000
    }
  );
}

async function handleGpsUpdate(position) {
  const raw = {
    lat: position.coords.latitude,
    lng: position.coords.longitude,
    speed:
      position.coords.speed != null
        ? Math.max(0, position.coords.speed * 3.6)
        : 0,
    heading:
      position.coords.heading != null &&
      Number.isFinite(position.coords.heading)
        ? position.coords.heading
        : state.lastHeading || 0,
    accuracy: position.coords.accuracy,
    timestamp: position.timestamp || Date.now()
  };

  const smooth = smoothGpsPosition(raw);

  state.lastHeading = smooth.heading;
  state.currentPosition = smooth;

  updateUserMarker(
    smooth.lat,
    smooth.lng
  );

  const progress =
    getRouteProgress(smooth);

  state.routeProgress = progress;

  followNavigationCamera(
    smooth,
    {
      routeProgress: progress,
      snap: false
    }
  );

  if (smooth.speed > 5) {
    setMapBearing(smooth.heading);
  }

  updateSpeedDisplay(smooth);
  updateNavigationProgress(progress);
  updateTurnInstruction(progress);
  updateEcoScore(smooth);

  await maybeReroute(smooth, progress);
}

function handleGpsError(error) {
  console.error("GPS fejl", error);

  setStatus(
    "GPS: fejl",
    "Navigation: aktiv",
    "Kort: navigation"
  );
}

/* =========================
   GPS SMOOTHING
========================= */

function smoothGpsPosition(raw) {
  if (!state.smoothedPosition) {
    state.smoothedPosition = raw;
    return raw;
  }

  const previous = state.smoothedPosition;

  const distance = haversine(
    previous.lat,
    previous.lng,
    raw.lat,
    raw.lng
  );

  let alpha = 0.36;

  if (raw.speed > 20) {
    alpha = 0.46;
  }

  if (raw.speed > 50) {
    alpha = 0.56;
  }

  if (raw.speed > 85) {
    alpha = 0.64;
  }

  if (distance > 180) {
    alpha = 0.85;
  }

  const heading =
    getSmoothedHeading(
      previous.heading || raw.heading || 0,
      raw.heading || previous.heading || 0,
      raw.speed
    );

  const smooth = {
    ...raw,
    lat:
      previous.lat +
      (raw.lat - previous.lat) * alpha,
    lng:
      previous.lng +
      (raw.lng - previous.lng) * alpha,
    heading
  };

  state.smoothedPosition = smooth;

  return smooth;
}

function getSmoothedHeading(
  current,
  target,
  speed
) {
  let delta = target - current;

  while (delta > 180) {
    delta -= 360;
  }

  while (delta < -180) {
    delta += 360;
  }

  let alpha = 0.20;

  if (speed > 15) {
    alpha = 0.34;
  }

  if (speed > 40) {
    alpha = 0.42;
  }

  if (Math.abs(delta) > 45 && speed > 10) {
    alpha = 0.58;
  }

  return (current + delta * alpha + 360) % 360;
}

/* =========================
   ROUTE MEASUREMENTS
========================= */

function prepareRouteMeasurements() {
  const geometry =
    state.routeData?.geometry || [];

  const cumulative = [0];
  let total = 0;

  for (let i = 1; i < geometry.length; i++) {
    const prev = geometry[i - 1];
    const curr = geometry[i];

    total += haversine(
      prev[1],
      prev[0],
      curr[1],
      curr[0]
    );

    cumulative.push(total);
  }

  state.routeData._cumulativeMeters =
    cumulative;

  state.routeData._measuredDistance =
    total;
}

function getRouteProgress(current) {
  const geometry =
    state.routeData?.geometry || [];

  if (geometry.length < 2) {
    return {
      alongMeters: 0,
      remainingMeters: 0,
      remainingSeconds: 0,
      progressRatio: 0,
      distanceToRoute: Infinity,
      segmentIndex: 0,
      isOffRoute: false
    };
  }

  if (
    !state.routeData._cumulativeMeters ||
    state.routeData._cumulativeMeters.length !== geometry.length
  ) {
    prepareRouteMeasurements();
  }

  let best = {
    distanceToRoute: Infinity,
    alongMeters: 0,
    segmentIndex: 0,
    t: 0
  };

  for (let i = 1; i < geometry.length; i++) {
    const start = geometry[i - 1];
    const end = geometry[i];

    const projected =
      projectPointToSegment(
        current.lat,
        current.lng,
        start[1],
        start[0],
        end[1],
        end[0]
      );

    if (
      projected.distanceMeters <
      best.distanceToRoute
    ) {
      const startAlong =
        state.routeData._cumulativeMeters[i - 1] || 0;

      const segmentLength =
        haversine(
          start[1],
          start[0],
          end[1],
          end[0]
        );

      best = {
        distanceToRoute:
          projected.distanceMeters,
        alongMeters:
          startAlong +
          segmentLength * projected.t,
        segmentIndex: i,
        t: projected.t
      };
    }
  }

  const totalDistance =
    state.routeData.distance ||
    state.routeData._measuredDistance ||
    0;

  const remainingMeters =
    Math.max(
      0,
      totalDistance - best.alongMeters
    );

  const progressRatio =
    totalDistance > 0
      ? Math.max(
          0,
          Math.min(
            1,
            best.alongMeters / totalDistance
          )
        )
      : 0;

  const routeDuration =
    Number(state.routeData.duration || 0);

  const remainingSeconds =
    routeDuration > 0
      ? routeDuration * (1 - progressRatio)
      : 0;

  return {
    ...best,
    totalDistance,
    remainingMeters,
    remainingSeconds,
    progressRatio,
    isOffRoute:
      best.distanceToRoute >
      OFF_ROUTE_DISTANCE
  };
}

function projectPointToSegment(
  lat,
  lng,
  lat1,
  lng1,
  lat2,
  lng2
) {
  const metersPerDegreeLat = 111320;

  const metersPerDegreeLng =
    111320 *
    Math.cos(lat * Math.PI / 180);

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
    return {
      t: 0,
      distanceMeters:
        Math.hypot(px - ax, py - ay)
    };
  }

  let t =
    ((px - ax) * dx +
      (py - ay) * dy) /
    lengthSquared;

  t = Math.max(0, Math.min(1, t));

  const projectedX = ax + t * dx;
  const projectedY = ay + t * dy;

  return {
    t,
    distanceMeters:
      Math.hypot(
        px - projectedX,
        py - projectedY
      )
  };
}

/* =========================
   DISPLAY
========================= */

function updateNavigationProgress(progress) {
  if (!progress) {
    return;
  }

  if (els.driveRemainingDistance) {
    els.driveRemainingDistance.textContent =
      formatDistance(
        progress.remainingMeters
      );
  }

  if (els.driveRemainingTime) {
    els.driveRemainingTime.textContent =
      formatDuration(
        progress.remainingSeconds
      );
  }

  if (els.driveEtaValue) {
    const eta = new Date(
      Date.now() +
      progress.remainingSeconds * 1000
    );

    els.driveEtaValue.textContent =
      eta.toLocaleTimeString(
        "da-DK",
        {
          hour: "2-digit",
          minute: "2-digit"
        }
      );
  }
}

function updateTurnInstruction(progress) {
  const steps = state.routeSteps || [];

  if (!steps.length || !progress) {
    setDefaultTurnInstruction();
    return;
  }

  let activeStep = steps[0];
  let activeIndex = 0;
  let accumulated = 0;

  for (let i = 0; i < steps.length; i++) {
    const stepDistance =
      Number(steps[i].distance || 0);

    if (
      accumulated + stepDistance >=
      progress.alongMeters
    ) {
      activeStep = steps[i];
      activeIndex = i;
      break;
    }

    accumulated += stepDistance;
  }

  state.currentStepIndex = activeIndex;

  const distanceIntoStep =
    Math.max(
      0,
      progress.alongMeters - accumulated
    );

  const distanceToNext =
    Math.max(
      0,
      Number(activeStep.distance || 0) -
        distanceIntoStep
    );

  if (els.nextTurnInstruction) {
    els.nextTurnInstruction.textContent =
      getInstruction(activeStep);
  }

  if (els.nextTurnDistance) {
    els.nextTurnDistance.textContent =
      distanceToNext < 8
        ? "Nu"
        : formatDistance(distanceToNext);
  }

  if (els.nextTurnRoad) {
    els.nextTurnRoad.textContent =
      getLaneGuidanceText(activeStep);
  }

  if (els.turnIcon) {
    els.turnIcon.textContent =
      getTurnSymbol(activeStep);
  }

  if (els.turnProgressBar) {
    const stepDistance =
      Number(activeStep.distance || 0);

    const pct =
      stepDistance > 0
        ? Math.max(
            8,
            Math.min(
              100,
              (distanceIntoStep /
                stepDistance) *
                100
            )
          )
        : 12;

    els.turnProgressBar.style.width =
      `${pct}%`;
  }
}

function setDefaultTurnInstruction() {
  if (els.nextTurnInstruction) {
    els.nextTurnInstruction.textContent =
      "Fortsæt";
  }

  if (els.nextTurnDistance) {
    els.nextTurnDistance.textContent = "—";
  }

  if (els.nextTurnRoad) {
    els.nextTurnRoad.textContent = "";
  }

  if (els.turnIcon) {
    els.turnIcon.textContent = "↑";
  }
}

function getInstruction(step) {
  const modifier =
    String(
      step.maneuverModifier || ""
    ).toLowerCase();

  const type =
    String(
      step.maneuverType || ""
    ).toLowerCase();

  if (type.includes("arrive")) {
    return "Du er fremme";
  }

  if (
    type.includes("roundabout") ||
    type.includes("rotary")
  ) {
    return "Kør gennem rundkørslen";
  }

  if (
    modifier.includes("left")
  ) {
    return "Drej til venstre";
  }

  if (
    modifier.includes("right")
  ) {
    return "Drej til højre";
  }

  if (
    modifier.includes("straight")
  ) {
    return "Fortsæt ligeud";
  }

  return "Fortsæt";
}

function getTurnSymbol(step) {
  const modifier =
    String(
      step.maneuverModifier || ""
    ).toLowerCase();

  if (
    modifier.includes("left")
  ) {
    return "←";
  }

  if (
    modifier.includes("right")
  ) {
    return "→";
  }

  return "↑";
}

function getLaneGuidanceText(step) {
  if (!state.settings.laneGuidanceEnabled) {
    return "";
  }

  const modifier =
    String(
      step.maneuverModifier || ""
    ).toLowerCase();

  if (modifier.includes("left")) {
    return "Hold venstre vognbane";
  }

  if (modifier.includes("right")) {
    return "Hold højre vognbane";
  }

  return "";
}

function updateSpeedDisplay(position) {
  const speed =
    position.speed || 0;

  if (els.currentSpeedValue) {
    els.currentSpeedValue.textContent =
      Math.round(speed);
  }

  const limit =
    state.currentMaxSpeed || null;

  if (els.speedLimitValue) {
    els.speedLimitValue.textContent =
      limit ? String(limit) : "?";
  }

  const recommendation =
    getGreenWaveRecommendation(position);

  if (els.recommendedSpeedValue) {
    els.recommendedSpeedValue.textContent =
      Number.isFinite(
        recommendation.speedKmh
      )
        ? String(recommendation.speedKmh)
        : "--";
  }

  if (!els.currentSpeedSign) {
    return;
  }

  els.currentSpeedSign.classList.remove(
    "speed-ok",
    "speed-warning",
    "speed-danger"
  );

  if (
    Number.isFinite(
      recommendation.speedKmh
    )
  ) {
    const diff =
      speed - recommendation.speedKmh;

    if (diff <= 5) {
      els.currentSpeedSign.classList.add(
        "speed-ok"
      );
    } else if (diff <= 12) {
      els.currentSpeedSign.classList.add(
        "speed-warning"
      );
    } else {
      els.currentSpeedSign.classList.add(
        "speed-danger"
      );
    }
  } else {
    els.currentSpeedSign.classList.add(
      "speed-warning"
    );
  }
}

/* =========================
   REROUTE
========================= */

async function maybeReroute(
  current,
  progress
) {
  if (
    !state.settings.autoRerouteEnabled ||
    !progress
  ) {
    return;
  }

  const now = Date.now();

  if (!progress.isOffRoute) {
    state.reroute.offRouteSince = null;
    return;
  }

  if (!state.reroute.offRouteSince) {
    state.reroute.offRouteSince = now;
    return;
  }

  const offRouteDuration =
    now - state.reroute.offRouteSince;

  const cooldownPassed =
    now - lastRerouteTime >
    REROUTE_COOLDOWN;

  if (
    offRouteDuration < OFF_ROUTE_DELAY ||
    !cooldownPassed
  ) {
    return;
  }

  lastRerouteTime = now;

  setStatus(
    "GPS: live",
    "Navigation: omberegner",
    "Kort: navigation"
  );

  try {
    await recalculateRouteFromCurrentPosition(
      current
    );

    prepareRouteMeasurements();

    setStatus(
      "GPS: live",
      "Navigation: aktiv",
      "Kort: navigation"
    );
  } catch (error) {
    console.error(
      "Omberegning fejlede",
      error
    );

    setStatus(
      "GPS: live",
      "Navigation: fejl",
      "Kort: navigation"
    );
  }
}

/* =========================
   ECO SCORE
========================= */

function resetTripEcoScore() {
  state.ecoScore = {
    value: 70,

    samples: 0,
    movingSamples: 0,

    lastSpeed: null,
    lastSpeedKmh: null,
    lastTimestamp: null,

    accelerationQualitySum: 0,
    accelerationEvents: 0,

    brakingQualitySum: 0,
    brakingEvents: 0,

    steadyQualitySum: 0,
    steadySamples: 0,

    tripStartedAt: Date.now(),
    tripEndedAt: null
  };

  updateEcoBadge(70);
}

function updateEcoScore(position) {
  const speed =
    position.speed || 0;

  const eco =
    state.ecoScore;

  if (!eco) {
    return;
  }

  if (
    eco.lastSpeed === null ||
    !Number.isFinite(eco.lastSpeed)
  ) {
    eco.lastSpeed = speed;
    return;
  }

  const delta =
    speed - eco.lastSpeed;

  eco.lastSpeed = speed;
  eco.samples++;

  if (speed > 8) {
    eco.movingSamples++;
  }

  if (
    Math.abs(delta) < 2 &&
    speed >= 20
  ) {
    eco.steadyQualitySum += 100;
    eco.steadySamples++;
  }

  if (delta > 0.8) {
    const score =
      Math.max(
        0,
        100 - delta * 6
      );

    eco.accelerationQualitySum += score;
    eco.accelerationEvents++;
  }

  if (delta < -0.8) {
    const braking =
      Math.abs(delta);

    const score =
      Math.max(
        0,
        100 - braking * 5
      );

    eco.brakingQualitySum += score;
    eco.brakingEvents++;
  }

  const acceleration =
    average(
      eco.accelerationQualitySum,
      eco.accelerationEvents,
      70
    );

  const braking =
    average(
      eco.brakingQualitySum,
      eco.brakingEvents,
      70
    );

  const steady =
    average(
      eco.steadyQualitySum,
      eco.steadySamples,
      70
    );

  eco.value =
    acceleration * 0.3 +
    braking * 0.3 +
    steady * 0.4;

  updateEcoBadge(
    Math.round(eco.value)
  );
}

function updateEcoBadge(score) {
  if (!els.ecoScoreBadge) {
    return;
  }

  els.ecoScoreBadge.textContent =
    `Eco ${score}`;

  els.ecoScoreBadge.classList.remove(
    "eco-ok",
    "eco-mid",
    "eco-low"
  );

  if (score >= 82) {
    els.ecoScoreBadge.classList.add(
      "eco-ok"
    );
  } else if (score >= 58) {
    els.ecoScoreBadge.classList.add(
      "eco-mid"
    );
  } else {
    els.ecoScoreBadge.classList.add(
      "eco-low"
    );
  }
}

function showEcoScoreSummary() {
  const eco =
    state.ecoScore;

  if (
    !eco ||
    eco.samples < 4
  ) {
    return;
  }

  const acceleration =
    average(
      eco.accelerationQualitySum,
      eco.accelerationEvents,
      70
    );

  const braking =
    average(
      eco.brakingQualitySum,
      eco.brakingEvents,
      70
    );

  const steady =
    average(
      eco.steadyQualitySum,
      eco.steadySamples,
      70
    );

  const total =
    Math.round(
      acceleration * 0.3 +
      braking * 0.3 +
      steady * 0.4
    );

  alert(
    `EcoScore for turen\n\n` +
    `Samlet score: ${total}/100\n\n` +
    `Acceleration: ${Math.round(acceleration)}/100\n` +
    `Nedbremsning: ${Math.round(braking)}/100\n` +
    `Jævn hastighed: ${Math.round(steady)}/100`
  );
}

function average(
  sum,
  count,
  fallback
) {
  if (!count || count <= 0) {
    return fallback;
  }

  return sum / count;
}

function formatDuration(seconds) {
  if (!Number.isFinite(seconds)) {
    return "—";
  }

  const minutes =
    Math.max(
      1,
      Math.round(seconds / 60)
    );

  if (minutes < 60) {
    return `${minutes} min`;
  }

  const hours =
    Math.floor(minutes / 60);

  const rest =
    minutes % 60;

  if (rest === 0) {
    return `${hours} t`;
  }

  return `${hours} t ${rest} min`;
}
