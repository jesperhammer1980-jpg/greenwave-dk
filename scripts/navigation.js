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

let watchId = null;
let lastRerouteTime = 0;

const REROUTE_COOLDOWN = 12000;
const REROUTE_DISTANCE = 90;

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

  state.isNavigating = true;

  document.body.classList.add("navigation-active");

  enterNavigationView?.();

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

  document.body.classList.remove("navigation-active");

  els.navOverlay?.classList.add("hidden");

  resetMapBearing?.();
  exitNavigationView?.();

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
      maximumAge: 1000,
      timeout: 10000
    }
  );
}

async function handleGpsUpdate(position) {
  const lat = position.coords.latitude;
  const lng = position.coords.longitude;

  const speed =
    position.coords.speed != null
      ? Math.max(0, position.coords.speed * 3.6)
      : 0;

  const heading =
    position.coords.heading != null &&
    Number.isFinite(position.coords.heading)
      ? position.coords.heading
      : state.lastHeading || 0;

  state.lastHeading = heading;

  state.currentPosition = {
    lat,
    lng,
    speed,
    heading
  };

  updateUserMarker?.(lat, lng);

  const progress = getRouteProgress({ lat, lng });

  followNavigationCamera?.(
    {
      lat,
      lng,
      speed,
      heading
    },
    {
      routeProgress: progress,
      snap: false
    }
  );

  if (speed > 5) {
    setMapBearing?.(heading);
  }

  updateSpeedDisplay(speed);
  updateNavigationProgress({ lat, lng }, progress);
  updateTurnInstruction(progress);
  updateEcoScore(speed);

  await maybeReroute({ lat, lng }, progress);
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
   ROUTE MEASUREMENTS
========================= */

function prepareRouteMeasurements() {
  const geometry = state.routeData?.geometry || [];

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

  state.routeData._cumulativeMeters = cumulative;
  state.routeData._measuredDistance = total;
}

function getRouteProgress(current) {
  const geometry = state.routeData?.geometry || [];
  const cumulative = state.routeData?._cumulativeMeters || [];

  if (geometry.length < 2 || cumulative.length !== geometry.length) {
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

    const projected = projectPointToSegment(
      current.lat,
      current.lng,
      start[1],
      start[0],
      end[1],
      end[0]
    );

    if (projected.distanceMeters < best.distanceToRoute) {
      const startAlong =
        state.routeData._cumulativeMeters?.[i - 1] || 0;

      const segmentLength =
        haversine(
          start[1],
          start[0],
          end[1],
          end[0]
        );

      best = {
        distanceToRoute: projected.distanceMeters,
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
    Math.max(0, totalDistance - best.alongMeters);

  const progressRatio =
    totalDistance > 0
      ? Math.max(0, Math.min(1, best.alongMeters / totalDistance))
      : 0;

  return {
    ...best,
    totalDistance,
    remainingMeters,
    progressRatio
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
    111320 * Math.cos(lat * Math.PI / 180);

  const px = lng * metersPerDegreeLng;
  const py = lat * metersPerDegreeLat;

  const ax = lng1 * metersPerDegreeLng;
  const ay = lat1 * metersPerDegreeLat;

  const bx = lng2 * metersPerDegreeLng;
  const by = lat2 * metersPerDegreeLat;

  const dx = bx - ax;
  const dy = by - ay;

  const lengthSquared = dx * dx + dy * dy;

  if (lengthSquared === 0) {
    return {
      t: 0,
      distanceMeters: Math.hypot(px - ax, py - ay)
    };
  }

  let t =
    ((px - ax) * dx + (py - ay) * dy) /
    lengthSquared;

  t = Math.max(0, Math.min(1, t));

  const projectedX = ax + t * dx;
  const projectedY = ay + t * dy;

  return {
    t,
    distanceMeters:
      Math.hypot(px - projectedX, py - projectedY)
  };
}

/* =========================
   NAVIGATION DISPLAY
========================= */

function updateNavigationProgress(current, progress) {
  if (!state.routeData?.geometry?.length || !progress) {
    return;
  }

  const remainingMeters =
    progress.remainingMeters;

  const routeDuration =
    Number(state.routeData.duration || 0);

  const remainingSeconds =
    routeDuration > 0
      ? routeDuration * (1 - progress.progressRatio)
      : null;

  if (els.driveRemainingDistance) {
    els.driveRemainingDistance.textContent =
      formatDistance(remainingMeters);
  }

  if (els.driveRemainingTime) {
    els.driveRemainingTime.textContent =
      Number.isFinite(remainingSeconds)
        ? formatDuration(remainingSeconds)
        : "—";
  }

  if (els.driveEtaValue) {
    if (Number.isFinite(remainingSeconds)) {
      const eta = new Date(
        Date.now() + remainingSeconds * 1000
      );

      els.driveEtaValue.textContent =
        eta.toLocaleTimeString("da-DK", {
          hour: "2-digit",
          minute: "2-digit"
        });
    } else {
      els.driveEtaValue.textContent = "—";
    }
  }
}

function updateTurnInstruction(progress) {
  const steps = state.routeSteps || [];

  if (!steps.length) {
    setDefaultTurnInstruction();
    return;
  }

  let activeStep = steps[0];
  let activeIndex = 0;
  let accumulated = 0;

  for (let i = 0; i < steps.length; i++) {
    const stepDistance = Number(steps[i].distance || 0);

    if (accumulated + stepDistance >= progress.alongMeters) {
      activeStep = steps[i];
      activeIndex = i;
      break;
    }

    accumulated += stepDistance;
  }

  state.currentStepIndex = activeIndex;

  const distanceIntoStep =
    Math.max(0, progress.alongMeters - accumulated);

  const distanceToNext =
    Math.max(
      0,
      Number(activeStep.distance || 0) - distanceIntoStep
    );

  if (els.nextTurnInstruction) {
    els.nextTurnInstruction.textContent =
      getInstruction(activeStep);
  }

  if (els.nextTurnDistance) {
    els.nextTurnDistance.textContent =
      formatDistance(distanceToNext);
  }

  if (els.nextTurnRoad) {
    els.nextTurnRoad.textContent = "";
  }

  if (els.turnIcon) {
    els.turnIcon.textContent =
      getTurnSymbol(activeStep);
  }

  if (els.turnProgressBar) {
    const stepDistance = Number(activeStep.distance || 0);

    const pct =
      stepDistance > 0
        ? Math.max(
            8,
            Math.min(100, (distanceIntoStep / stepDistance) * 100)
          )
        : 12;

    els.turnProgressBar.style.width =
      `${pct}%`;
  }
}

function setDefaultTurnInstruction() {
  if (els.nextTurnInstruction) {
    els.nextTurnInstruction.textContent = "Fortsæt";
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
    String(step.maneuverModifier || "").toLowerCase();

  const type =
    String(step.maneuverType || "").toLowerCase();

  if (type.includes("arrive")) {
    return "Du er fremme";
  }

  if (
    type.includes("roundabout") ||
    type.includes("rotary")
  ) {
    return "Kør gennem rundkørslen";
  }

  if (modifier.includes("left")) {
    return "Drej til venstre";
  }

  if (modifier.includes("right")) {
    return "Drej til højre";
  }

  if (modifier.includes("straight")) {
    return "Fortsæt ligeud";
  }

  return "Fortsæt";
}

function getTurnSymbol(step) {
  const modifier =
    String(step.maneuverModifier || "").toLowerCase();

  if (modifier.includes("left")) {
    return "←";
  }

  if (modifier.includes("right")) {
    return "→";
  }

  return "↑";
}

function updateSpeedDisplay(speed) {
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

  const recommended =
    limit
      ? Math.max(30, Math.round(limit * 0.92))
      : null;

  if (els.recommendedSpeedValue) {
    els.recommendedSpeedValue.textContent =
      recommended ? String(recommended) : "?";
  }

  if (!els.currentSpeedSign) {
    return;
  }

  els.currentSpeedSign.classList.remove(
    "speed-ok",
    "speed-warning",
    "speed-danger"
  );

  if (!recommended) {
    els.currentSpeedSign.classList.add("speed-warning");
    return;
  }

  if (speed <= recommended + 3) {
    els.currentSpeedSign.classList.add("speed-ok");
  } else if (speed <= recommended + 10) {
    els.currentSpeedSign.classList.add("speed-warning");
  } else {
    els.currentSpeedSign.classList.add("speed-danger");
  }
}

/* =========================
   REROUTE
========================= */

async function maybeReroute(current, progress) {
  if (!state.routeData?.geometry?.length || !progress) {
    return;
  }

  const now = Date.now();

  if (now - lastRerouteTime < REROUTE_COOLDOWN) {
    return;
  }

  if (progress.distanceToRoute > REROUTE_DISTANCE) {
    lastRerouteTime = now;

    setStatus(
      "GPS: live",
      "Navigation: omberegner",
      "Kort: navigation"
    );

    try {
      await recalculateRouteFromCurrentPosition(current);

      prepareRouteMeasurements();

      setStatus(
        "GPS: live",
        "Navigation: aktiv",
        "Kort: navigation"
      );
    } catch (error) {
      console.error("Omberegning fejlede", error);
    }
  }
}

/* =========================
   ECO SCORE
========================= */

function updateEcoScore(speed) {
  if (!state.ecoScore) {
    state.ecoScore = {
      value: 70,
      accelerationQualitySum: 0,
      accelerationEvents: 0,
      brakingQualitySum: 0,
      brakingEvents: 0,
      steadyQualitySum: 0,
      steadySamples: 0,
      lastSpeed: speed
    };
  }

  const eco = state.ecoScore;
  const delta = speed - eco.lastSpeed;

  eco.lastSpeed = speed;

  if (Math.abs(delta) < 2 && speed >= 20) {
    eco.steadyQualitySum += 100;
    eco.steadySamples++;
  }

  if (delta > 0.8) {
    const score = Math.max(0, 100 - delta * 6);
    eco.accelerationQualitySum += score;
    eco.accelerationEvents++;
  }

  if (delta < -0.8) {
    const braking = Math.abs(delta);
    const score = Math.max(0, 100 - braking * 5);
    eco.brakingQualitySum += score;
    eco.brakingEvents++;
  }

  const acceleration = average(
    eco.accelerationQualitySum,
    eco.accelerationEvents,
    70
  );

  const braking = average(
    eco.brakingQualitySum,
    eco.brakingEvents,
    70
  );

  const steady = average(
    eco.steadyQualitySum,
    eco.steadySamples,
    70
  );

  eco.value =
    acceleration * 0.3 +
    braking * 0.3 +
    steady * 0.4;

  updateEcoBadge(Math.round(eco.value));
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

  if (score >= 80) {
    els.ecoScoreBadge.classList.add("eco-ok");
  } else if (score >= 60) {
    els.ecoScoreBadge.classList.add("eco-mid");
  } else {
    els.ecoScoreBadge.classList.add("eco-low");
  }
}

function showEcoScoreSummary() {
  const eco = state.ecoScore;

  if (!eco) {
    return;
  }

  const acceleration = average(
    eco.accelerationQualitySum,
    eco.accelerationEvents,
    70
  );

  const braking = average(
    eco.brakingQualitySum,
    eco.brakingEvents,
    70
  );

  const steady = average(
    eco.steadyQualitySum,
    eco.steadySamples,
    70
  );

  const total = Math.round(
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

function average(sum, count, fallback) {
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
    Math.max(1, Math.round(seconds / 60));

  if (minutes < 60) {
    return `${minutes} min`;
  }

  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;

  if (rest === 0) {
    return `${hours} t`;
  }

  return `${hours} t ${rest} min`;
}
