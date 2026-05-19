import { state } from "./state.js";
import { els } from "./dom.js";

import {
  updateUserMarker,
  followNavigationCamera,
  resetMapBearing,
  enterNavigationView,
  exitNavigationView
} from "./map.js";

import { setStatus, formatDistance, formatDuration, haversine, projectPointToSegment } from "./utils.js";
import { recalculateRouteFromCurrentPosition } from "./routing.js";
import { getGreenWaveRecommendation } from "./greenwave.js";
import { updateCurrentMaxSpeed } from "./maxspeed.js";

const OFF_ROUTE_DISTANCE = 90;
const OFF_ROUTE_DELAY = 7000;
const REROUTE_COOLDOWN = 22000;

export function startLiveNavigation() {
  if (!state.routeData?.geometry?.length) {
    alert("Beregn en rute først.");
    return;
  }

  if (!navigator.geolocation) {
    alert("GPS understøttes ikke.");
    return;
  }

  prepareRouteMeasurements();
  resetEcoScore();

  state.navigationActive = true;

  enterNavigationView();
  els.navOverlay?.classList.remove("hidden");

  if (els.startNavBtn) els.startNavBtn.disabled = true;

  setStatus("GPS: live", "Navigation: aktiv", "Kort: navigation");

  if (state.navigationWatcherId) {
    navigator.geolocation.clearWatch(state.navigationWatcherId);
  }

  state.navigationWatcherId = navigator.geolocation.watchPosition(
    handlePosition,
    handleGpsError,
    {
      enableHighAccuracy: true,
      maximumAge: 700,
      timeout: 10000
    }
  );
}

export function stopLiveNavigation() {
  if (state.navigationWatcherId) {
    navigator.geolocation.clearWatch(state.navigationWatcherId);
    state.navigationWatcherId = null;
  }

  state.navigationActive = false;

  els.navOverlay?.classList.add("hidden");
  resetMapBearing();
  exitNavigationView();

  if (els.startNavBtn) els.startNavBtn.disabled = !state.routeData;

  setStatus("GPS: klar", "Navigation: stoppet", "Kort: klar");
}

async function handlePosition(position) {
  const raw = {
    lat: position.coords.latitude,
    lng: position.coords.longitude,
    speed:
      typeof position.coords.speed === "number"
        ? Math.max(0, position.coords.speed * 3.6)
        : 0,
    heading:
      typeof position.coords.heading === "number"
        ? position.coords.heading
        : state.lastKnownHeading || 0,
    accuracy: position.coords.accuracy || null,
    timestamp: position.timestamp || Date.now()
  };

  const current = smoothPosition(raw);

  state.currentPosition = current;
  state.currentSpeed = current.speed;
  state.lastKnownHeading = current.heading;

  updateUserMarker(current.lat, current.lng);
  updateCurrentMaxSpeed(current);

  const progress = getRouteProgress(current);
  state.routeProgress = progress;

  followNavigationCamera(current, { routeProgress: progress });

  updateNavigationUi(current, progress);
  updateEcoScore(current);

  await maybeReroute(current, progress);
}

function handleGpsError(error) {
  console.error("GPS fejl", error);
  setStatus("GPS: fejl", "Navigation: aktiv", "Kort: navigation");
}

function smoothPosition(raw) {
  if (!state.currentPosition) return raw;

  const prev = state.currentPosition;
  const distance = haversine(prev.lat, prev.lng, raw.lat, raw.lng);

  let alpha = raw.speed > 80 ? 0.65 : raw.speed > 40 ? 0.52 : 0.38;

  if (distance > 150) alpha = 0.85;

  return {
    ...raw,
    lat: prev.lat + (raw.lat - prev.lat) * alpha,
    lng: prev.lng + (raw.lng - prev.lng) * alpha,
    heading: smoothHeading(prev.heading || 0, raw.heading || 0, raw.speed)
  };
}

function smoothHeading(current, target, speed) {
  let delta = target - current;

  while (delta > 180) delta -= 360;
  while (delta < -180) delta += 360;

  const alpha = speed > 40 ? 0.45 : speed > 15 ? 0.34 : 0.22;

  return (current + delta * alpha + 360) % 360;
}

function prepareRouteMeasurements() {
  const geometry = state.routeData.geometry;
  const cumulative = [0];

  let total = 0;

  for (let i = 1; i < geometry.length; i++) {
    const a = geometry[i - 1];
    const b = geometry[i];

    total += haversine(a[1], a[0], b[1], b[0]);
    cumulative.push(total);
  }

  state.routeData._cumulativeMeters = cumulative;
  state.routeData._measuredDistance = total;
}

function getRouteProgress(current) {
  const geometry = state.routeData.geometry;

  let best = {
    distanceToRoute: Infinity,
    alongMeters: 0,
    segmentIndex: 0
  };

  for (let i = 1; i < geometry.length; i++) {
    const a = geometry[i - 1];
    const b = geometry[i];

    const projected = projectPointToSegment(
      current.lat,
      current.lng,
      a[1],
      a[0],
      b[1],
      b[0]
    );

    if (projected.distanceMeters < best.distanceToRoute) {
      const segmentLength = haversine(a[1], a[0], b[1], b[0]);

      best = {
        distanceToRoute: projected.distanceMeters,
        alongMeters:
          state.routeData._cumulativeMeters[i - 1] +
          segmentLength * projected.t,
        segmentIndex: i
      };
    }
  }

  const total = state.routeData.distance || state.routeData._measuredDistance;
  const ratio = total > 0 ? Math.min(1, best.alongMeters / total) : 0;

  return {
    ...best,
    progressRatio: ratio,
    remainingMeters: Math.max(0, total - best.alongMeters),
    remainingSeconds: (state.routeData.duration || 0) * (1 - ratio),
    isOffRoute: best.distanceToRoute > OFF_ROUTE_DISTANCE
  };
}

function updateNavigationUi(current, progress) {
  if (els.driveRemainingDistance) {
    els.driveRemainingDistance.textContent = formatDistance(progress.remainingMeters);
  }

  if (els.driveRemainingTime) {
    els.driveRemainingTime.textContent = formatDuration(progress.remainingSeconds);
  }

  if (els.driveEtaValue) {
    els.driveEtaValue.textContent = new Date(
      Date.now() + progress.remainingSeconds * 1000
    ).toLocaleTimeString("da-DK", {
      hour: "2-digit",
      minute: "2-digit"
    });
  }

  updateStepUi(progress);
  updateSpeedUi(current);
}

function updateStepUi(progress) {
  const step = findCurrentStep(progress.alongMeters);

  if (!step) {
    if (els.nextTurnInstruction) els.nextTurnInstruction.textContent = "Fortsæt";
    return;
  }

  const distanceToStep = Math.max(0, step.endDistance - progress.alongMeters);

  if (els.nextTurnDistance) {
    els.nextTurnDistance.textContent =
      distanceToStep < 8 ? "Nu" : formatDistance(distanceToStep);
  }

  if (els.nextTurnInstruction) {
    els.nextTurnInstruction.textContent = getInstruction(step);
  }

  if (els.nextTurnRoad) {
    els.nextTurnRoad.textContent = getLaneText(step);
  }

  if (els.turnIcon) {
    els.turnIcon.textContent = getTurnIcon(step);
  }
}

function findCurrentStep(alongMeters) {
  return state.routeSteps.find(step =>
    alongMeters >= step.startDistance &&
    alongMeters <= step.endDistance
  ) || state.routeSteps[state.routeSteps.length - 1];
}

function getInstruction(step) {
  const modifier = String(step.maneuverModifier || "").toLowerCase();
  const type = String(step.maneuverType || "").toLowerCase();

  if (type.includes("arrive")) return "Du er fremme";
  if (type.includes("roundabout") || type.includes("rotary")) return "Kør gennem rundkørslen";
  if (modifier.includes("left")) return "Drej til venstre";
  if (modifier.includes("right")) return "Drej til højre";
  if (modifier.includes("straight")) return "Fortsæt ligeud";

  return "Fortsæt";
}

function getTurnIcon(step) {
  const modifier = String(step.maneuverModifier || "").toLowerCase();

  if (modifier.includes("left")) return "←";
  if (modifier.includes("right")) return "→";

  return "↑";
}

function getLaneText(step) {
  const modifier = String(step.maneuverModifier || "").toLowerCase();

  if (!state.settings.laneGuidanceEnabled) return "";
  if (modifier.includes("left")) return "Hold venstre vognbane";
  if (modifier.includes("right")) return "Hold højre vognbane";

  return "";
}

function updateSpeedUi(current) {
  const recommendation = getGreenWaveRecommendation(current);

  if (els.currentSpeedValue) els.currentSpeedValue.textContent = Math.round(current.speed);
  if (els.speedLimitValue) els.speedLimitValue.textContent = state.currentMaxSpeed || "?";
  if (els.recommendedSpeedValue) els.recommendedSpeedValue.textContent = recommendation.speedKmh || "--";
}

async function maybeReroute(current, progress) {
  if (!state.settings.autoRerouteEnabled) return;

  const now = Date.now();

  if (!progress.isOffRoute) {
    state.rerouteOffSince = null;
    return;
  }

  if (!state.rerouteOffSince) {
    state.rerouteOffSince = now;
    return;
  }

  if (now - state.rerouteOffSince < OFF_ROUTE_DELAY) return;
  if (now - (state.lastRerouteAt || 0) < REROUTE_COOLDOWN) return;

  state.lastRerouteAt = now;

  setStatus("GPS: live", "Navigation: omberegner", "Kort: navigation");

  await recalculateRouteFromCurrentPosition(current);

  prepareRouteMeasurements();

  setStatus("GPS: live", "Navigation: aktiv", "Kort: navigation");
}

function resetEcoScore() {
  state.ecoScore = {
    accelerationQualitySum: 0,
    accelerationEvents: 0,
    brakingQualitySum: 0,
    brakingEvents: 0,
    steadyQualitySum: 0,
    steadySamples: 0,
    currentScore: 70,
    lastSpeed: null
  };

  updateEcoBadge(70);
}

function updateEcoScore(current) {
  const eco = state.ecoScore;
  const speed = current.speed;

  if (eco.lastSpeed === null) {
    eco.lastSpeed = speed;
    return;
  }

  const delta = speed - eco.lastSpeed;
  eco.lastSpeed = speed;

  if (Math.abs(delta) < 2 && speed >= 20) {
    eco.steadyQualitySum += 100;
    eco.steadySamples++;
  }

  if (delta > 0.8) {
    eco.accelerationQualitySum += Math.max(0, 100 - delta * 6);
    eco.accelerationEvents++;
  }

  if (delta < -0.8) {
    eco.brakingQualitySum += Math.max(0, 100 - Math.abs(delta) * 5);
    eco.brakingEvents++;
  }

  const a = average(eco.accelerationQualitySum, eco.accelerationEvents, 70);
  const b = average(eco.brakingQualitySum, eco.brakingEvents, 70);
  const s = average(eco.steadyQualitySum, eco.steadySamples, 70);

  const total = Math.round(a * 0.3 + b * 0.3 + s * 0.4);

  eco.currentScore = total;

  updateEcoBadge(total);
}

function updateEcoBadge(score) {
  if (!els.ecoScoreBadge) return;

  els.ecoScoreBadge.textContent = `Eco ${score}`;

  els.ecoScoreBadge.classList.remove("eco-ok", "eco-mid", "eco-low");

  if (score >= 82) els.ecoScoreBadge.classList.add("eco-ok");
  else if (score >= 58) els.ecoScoreBadge.classList.add("eco-mid");
  else els.ecoScoreBadge.classList.add("eco-low");
}

function average(sum, count, fallback) {
  return count > 0 ? sum / count : fallback;
}
