import { state } from "./state.js";
import { els } from "./dom.js";
import { updateUserMarker, followNavigationCamera, enterNavigationView, exitNavigationView } from "./map.js";
import { formatDistance, formatDuration, haversine, projectPointToSegment, setStatus } from "./utils.js";
import { getGreenWaveRecommendation } from "./greenwave.js";
import { recalculateRouteFromCurrentPosition } from "./routing.js";

const OFF_ROUTE_DISTANCE = 90;

export function startLiveNavigation() {
  if (!state.routeData?.geometry?.length) {
    alert("Beregn en rute først.");
    return;
  }

  prepareRouteMeasurements();
  resetEco();

  state.navigationActive = true;
  enterNavigationView();
  els.navOverlay.classList.remove("hidden");

  setStatus("GPS: live", "Navigation: aktiv", "Kort: navigation");

  if (state.navigationWatcherId) navigator.geolocation.clearWatch(state.navigationWatcherId);

  if (!navigator.geolocation) {
    alert("GPS understøttes ikke.");
    return;
  }

  state.navigationWatcherId = navigator.geolocation.watchPosition(handlePosition, error => {
    alert("GPS-fejl: " + error.message);
  }, { enableHighAccuracy: true, maximumAge: 700, timeout: 10000 });
}

export function stopLiveNavigation() {
  if (state.navigationWatcherId) navigator.geolocation.clearWatch(state.navigationWatcherId);
  state.navigationWatcherId = null;
  state.navigationActive = false;
  els.navOverlay.classList.add("hidden");
  exitNavigationView();
  els.startNavBtn.disabled = !state.routeData;
  setStatus("GPS: klar", "Navigation: stoppet", "Kort: klar");
}

async function handlePosition(pos) {
  const current = {
    lat: pos.coords.latitude,
    lng: pos.coords.longitude,
    speed: typeof pos.coords.speed === "number" ? Math.max(0, pos.coords.speed * 3.6) : 0,
    heading: typeof pos.coords.heading === "number" ? pos.coords.heading : 0
  };

  state.currentPosition = current;
  updateUserMarker(current.lat, current.lng);
  followNavigationCamera(current);

  const progress = getRouteProgress(current);
  state.routeProgress = progress;

  updateUi(current, progress);
  updateEco(current);
}

function prepareRouteMeasurements() {
  const geometry = state.routeData.geometry;
  let total = 0;
  const cumulative = [0];

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
  let best = { distanceToRoute: Infinity, alongMeters: 0, segmentIndex: 0 };

  for (let i = 1; i < geometry.length; i++) {
    const a = geometry[i - 1];
    const b = geometry[i];
    const projected = projectPointToSegment(current.lat, current.lng, a[1], a[0], b[1], b[0]);

    if (projected.distanceMeters < best.distanceToRoute) {
      const segmentLength = haversine(a[1], a[0], b[1], b[0]);
      best = {
        distanceToRoute: projected.distanceMeters,
        alongMeters: state.routeData._cumulativeMeters[i - 1] + segmentLength * projected.t,
        segmentIndex: i
      };
    }
  }

  const total = state.routeData.distance || state.routeData._measuredDistance;
  const ratio = total > 0 ? Math.min(1, best.alongMeters / total) : 0;

  return {
    ...best,
    remainingMeters: Math.max(0, total - best.alongMeters),
    remainingSeconds: (state.routeData.duration || 0) * (1 - ratio),
    progressRatio: ratio,
    isOffRoute: best.distanceToRoute > OFF_ROUTE_DISTANCE
  };
}

function updateUi(current, progress) {
  els.driveRemainingDistance.textContent = formatDistance(progress.remainingMeters);
  els.driveRemainingTime.textContent = formatDuration(progress.remainingSeconds);
  els.driveEtaValue.textContent = new Date(Date.now() + progress.remainingSeconds * 1000).toLocaleTimeString("da-DK", { hour: "2-digit", minute: "2-digit" });

  const step = findCurrentStep(progress.alongMeters);
  if (step) {
    const distanceToStep = Math.max(0, step.endDistance - progress.alongMeters);
    els.nextTurnDistance.textContent = distanceToStep < 8 ? "Nu" : formatDistance(distanceToStep);
    els.nextTurnInstruction.textContent = instruction(step);
    els.nextTurnRoad.textContent = step.name || "";
    els.turnIcon.textContent = icon(step);
  }

  const rec = getGreenWaveRecommendation(current);
  els.currentSpeedValue.textContent = Math.round(current.speed);
  els.speedLimitValue.textContent = state.currentMaxSpeed || "?";
  els.recommendedSpeedValue.textContent = rec.speedKmh || "--";
}

function findCurrentStep(along) {
  return state.routeSteps.find(s => along >= s.startDistance && along <= s.endDistance) || state.routeSteps[state.routeSteps.length - 1];
}

function instruction(step) {
  const type = String(step.maneuverType || "").toLowerCase();
  const mod = String(step.maneuverModifier || "").toLowerCase();
  if (type.includes("arrive")) return "Du er fremme";
  if (type.includes("roundabout")) return "Kør gennem rundkørslen";
  if (mod.includes("left")) return "Drej til venstre";
  if (mod.includes("right")) return "Drej til højre";
  if (mod.includes("straight")) return "Fortsæt ligeud";
  return "Fortsæt";
}

function icon(step) {
  const mod = String(step.maneuverModifier || "").toLowerCase();
  if (mod.includes("left")) return "←";
  if (mod.includes("right")) return "→";
  return "↑";
}

function resetEco() {
  state.ecoScore = { accelerationQualitySum:0, accelerationEvents:0, brakingQualitySum:0, brakingEvents:0, steadyQualitySum:0, steadySamples:0, currentScore:70, lastSpeed:null };
  updateEcoBadge(70);
}

function updateEco(current) {
  const eco = state.ecoScore;
  const speed = current.speed;

  if (eco.lastSpeed === null) {
    eco.lastSpeed = speed;
    return;
  }

  const delta = speed - eco.lastSpeed;
  eco.lastSpeed = speed;

  if (Math.abs(delta) < 2 && speed >= 20) { eco.steadyQualitySum += 100; eco.steadySamples++; }
  if (delta > 0.8) { eco.accelerationQualitySum += Math.max(0, 100 - delta * 6); eco.accelerationEvents++; }
  if (delta < -0.8) { eco.brakingQualitySum += Math.max(0, 100 - Math.abs(delta) * 5); eco.brakingEvents++; }

  const a = avg(eco.accelerationQualitySum, eco.accelerationEvents, 70);
  const b = avg(eco.brakingQualitySum, eco.brakingEvents, 70);
  const s = avg(eco.steadyQualitySum, eco.steadySamples, 70);
  const total = Math.round(a * 0.3 + b * 0.3 + s * 0.4);

  updateEcoBadge(total);
}

function updateEcoBadge(score) {
  els.ecoScoreBadge.textContent = `Eco ${score}`;
  els.ecoScoreBadge.classList.remove("eco-ok", "eco-mid", "eco-low");
  els.ecoScoreBadge.classList.add(score >= 82 ? "eco-ok" : score >= 58 ? "eco-mid" : "eco-low");
}

function avg(sum, count, fallback) { return count > 0 ? sum / count : fallback; }
