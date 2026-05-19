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
const REROUTE_DISTANCE = 80;

export async function startLiveNavigation() {
  if (!state.routeData) {
    alert("Beregn en rute først.");
    return;
  }

  if (!navigator.geolocation) {
    alert("GPS understøttes ikke.");
    return;
  }

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

  followNavigationCamera?.(
    {
      lat,
      lng,
      speed,
      heading
    },
    {
      snap: false
    }
  );

  if (speed > 5) {
    setMapBearing?.(heading);
  }

  updateSpeedDisplay(speed);
  updateNavigationProgress({ lat, lng });
  updateEcoScore(speed);

  await maybeReroute({ lat, lng });
}

function handleGpsError(error) {
  console.error("GPS fejl", error);

  setStatus(
    "GPS: fejl",
    "Navigation: aktiv",
    "Kort: navigation"
  );
}

function updateSpeedDisplay(speed) {
  if (els.currentSpeedValue) {
    els.currentSpeedValue.textContent = Math.round(speed);
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

function updateNavigationProgress(current) {
  if (!state.routeData?.geometry?.length) {
    return;
  }

  const route = state.routeData.geometry;
  const destination = route[route.length - 1];

  const remainingMeters = haversine(
    current.lat,
    current.lng,
    destination[1],
    destination[0]
  );

  const remainingSeconds = remainingMeters / 18;

  if (els.driveRemainingDistance) {
    els.driveRemainingDistance.textContent =
      formatDistance(remainingMeters);
  }

  if (els.driveRemainingTime) {
    els.driveRemainingTime.textContent =
      formatDuration(remainingSeconds);
  }

  if (els.driveEtaValue) {
    const eta = new Date(
      Date.now() + remainingSeconds * 1000
    );

    els.driveEtaValue.textContent =
      eta.toLocaleTimeString("da-DK", {
        hour: "2-digit",
        minute: "2-digit"
      });
  }

  updateTurnInstruction();
}

function updateTurnInstruction() {
  const steps = state.routeSteps || [];

  if (!steps.length) {
    return;
  }

  const step = steps[state.currentStepIndex || 0];

  if (!step) {
    return;
  }

  if (els.nextTurnInstruction) {
    els.nextTurnInstruction.textContent =
      getInstruction(step);
  }

  if (els.nextTurnDistance) {
    els.nextTurnDistance.textContent =
      formatDistance(step.distance || 0);
  }

  if (els.nextTurnRoad) {
    els.nextTurnRoad.textContent = "";
  }

  if (els.turnIcon) {
    els.turnIcon.textContent =
      getTurnSymbol(step);
  }
}

function getInstruction(step) {
  const modifier = String(step.maneuverModifier || "").toLowerCase();
  const type = String(step.maneuverType || "").toLowerCase();

  if (type.includes("arrive")) {
    return "Du er fremme";
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
  const modifier = String(step.maneuverModifier || "").toLowerCase();

  if (modifier.includes("left")) {
    return "←";
  }

  if (modifier.includes("right")) {
    return "→";
  }

  return "↑";
}

async function maybeReroute(current) {
  if (!state.routeData?.geometry?.length) {
    return;
  }

  const now = Date.now();

  if (now - lastRerouteTime < REROUTE_COOLDOWN) {
    return;
  }

  const route = state.routeData.geometry;
  let minDistance = Infinity;

  for (const point of route) {
    const distance = haversine(
      current.lat,
      current.lng,
      point[1],
      point[0]
    );

    if (distance < minDistance) {
      minDistance = distance;
    }
  }

  if (minDistance > REROUTE_DISTANCE) {
    lastRerouteTime = now;

    setStatus(
      "GPS: live",
      "Navigation: omberegner",
      "Kort: navigation"
    );

    try {
      await recalculateRouteFromCurrentPosition(current);

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

  els.ecoScoreBadge.textContent = `Eco ${score}`;

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

  const minutes = Math.max(1, Math.round(seconds / 60));

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
