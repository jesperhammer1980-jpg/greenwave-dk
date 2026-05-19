import { state } from "./state.js";
import { haversine } from "./utils.js";

export async function loadTrafficSignals(geometry = []) {
  if (!Array.isArray(geometry) || !geometry.length) {
    state.trafficSignals = [];
    return;
  }

  const sample = sampleRoutePoints(geometry);

  const query = `
    [out:json][timeout:25];
    (
      ${sample.map(point => `
        node(around:1200,${point.lat},${point.lng})["highway"="traffic_signals"];
      `).join("")}
    );
    out body;
  `;

  try {
    const response = await fetch(
      "https://overpass-api.de/api/interpreter",
      {
        method: "POST",
        headers: {
          "Content-Type": "text/plain;charset=UTF-8"
        },
        body: query
      }
    );

    if (!response.ok) {
      throw new Error("Trafiklys kunne ikke hentes");
    }

    const data = await response.json();

    state.trafficSignals = (data.elements || [])
      .filter(item =>
        typeof item.lat === "number" &&
        typeof item.lon === "number"
      )
      .map(item => ({
        id: item.id,
        lat: item.lat,
        lng: item.lon
      }));
  } catch (error) {
    console.warn("Trafiklys-data ikke tilgængelig", error);
    state.trafficSignals = [];
  }
}

export function getGreenWaveRecommendation(current) {
  if (!state.settings.greenWaveEnabled) {
    return {
      speedKmh: null,
      reason: "Anbefalet fart slået fra"
    };
  }

  const speedLimit = getReliableSpeedLimit();
  const step = getCurrentOrUpcomingStep();
  const signalDistance = getNearestTrafficSignalDistance(current);

  let recommended = getBaseSpeed(speedLimit, current);

  const turnSpeed = getTurnSpeed(step);

  if (Number.isFinite(turnSpeed)) {
    recommended = Math.min(recommended || turnSpeed, turnSpeed);
  }

  if (Number.isFinite(signalDistance) && signalDistance < 450) {
    recommended = applyTrafficLightSpeed(recommended, signalDistance, current);
  }

  recommended = clampSpeed(recommended, speedLimit);

  return {
    speedKmh: recommended,
    reason: getReason(speedLimit, step, signalDistance, turnSpeed, recommended)
  };
}

function getReliableSpeedLimit() {
  const value = state.currentMaxSpeed;

  if (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= 20 &&
    value <= 130
  ) {
    return value;
  }

  return null;
}

function getBaseSpeed(speedLimit, current) {
  const currentSpeed = Number(current?.speed || 0);

  if (!speedLimit) {
    if (currentSpeed > 90) return 90;
    if (currentSpeed > 65) return 75;
    if (currentSpeed > 40) return 55;
    if (currentSpeed > 15) return 40;
    return null;
  }

  if (speedLimit <= 30) return 25;
  if (speedLimit <= 40) return 35;
  if (speedLimit <= 50) return 45;
  if (speedLimit <= 60) return 55;
  if (speedLimit <= 80) return 70;
  if (speedLimit <= 90) return 80;
  if (speedLimit <= 110) return 95;

  return 105;
}

function getTurnSpeed(step) {
  if (!step) return null;

  const distance = Number(step.endDistance - state.routeProgress.alongMeters);
  const type = String(step.maneuverType || "").toLowerCase();
  const modifier = String(step.maneuverModifier || "").toLowerCase();

  const isTurn =
    modifier.includes("left") ||
    modifier.includes("right") ||
    type.includes("turn");

  const isRoundabout =
    type.includes("roundabout") ||
    type.includes("rotary");

  const isRamp =
    type.includes("ramp") ||
    type.includes("merge") ||
    type.includes("fork");

  if (isRoundabout && distance < 350) {
    if (distance < 120) return 25;
    if (distance < 220) return 35;
    return 45;
  }

  if (isTurn && distance < 300) {
    if (distance < 80) return 25;
    if (distance < 180) return 35;
    return 45;
  }

  if (isRamp && distance < 450) {
    if (distance < 140) return 45;
    if (distance < 280) return 55;
    return 65;
  }

  return null;
}

function applyTrafficLightSpeed(currentRecommendation, distanceMeters, current) {
  const currentSpeed = Number(current?.speed || 0);

  let target = null;

  if (distanceMeters < 70) target = 25;
  else if (distanceMeters < 140) target = 35;
  else if (distanceMeters < 260) target = 45;
  else if (distanceMeters < 450) target = 55;

  if (!Number.isFinite(target)) return currentRecommendation;
  if (!Number.isFinite(currentRecommendation)) return target;

  if (currentSpeed > target + 12) {
    return Math.min(currentRecommendation, target);
  }

  return Math.min(currentRecommendation, target + 5);
}

function clampSpeed(value, speedLimit) {
  if (!Number.isFinite(value)) return null;

  const max = speedLimit || 110;
  const min = speedLimit && speedLimit <= 30 ? 20 : 25;
  const rounded = Math.round(value / 5) * 5;

  return Math.max(min, Math.min(max, rounded));
}

function getCurrentOrUpcomingStep() {
  const steps = state.routeSteps || [];

  if (!steps.length) return null;

  return (
    steps[state.currentStepIndex || 0] ||
    steps[0] ||
    null
  );
}

function getNearestTrafficSignalDistance(current) {
  if (
    !current ||
    !Array.isArray(state.trafficSignals) ||
    !state.trafficSignals.length
  ) {
    return Infinity;
  }

  let nearest = Infinity;

  state.trafficSignals.forEach(signal => {
    const distance = haversine(
      current.lat,
      current.lng,
      signal.lat,
      signal.lng
    );

    if (distance < nearest) {
      nearest = distance;
    }
  });

  return nearest;
}

function getReason(speedLimit, step, signalDistance, turnSpeed, recommended) {
  if (!Number.isFinite(recommended)) return "Mangler data";
  if (Number.isFinite(turnSpeed)) return "Tilpasset kommende sving";
  if (Number.isFinite(signalDistance) && signalDistance < 450) return "Rolig tilgang mod trafiklys";
  if (!speedLimit) return "Økonomisk anbefalet fart";
  if (step) return "Tilpasset rute og fartgrænse";

  return "Økonomisk anbefalet fart";
}

function sampleRoutePoints(geometry) {
  const points = [];
  const maxSamples = 18;

  for (let i = 0; i < maxSamples; i++) {
    const index = Math.round(
      (geometry.length - 1) *
      (i / (maxSamples - 1))
    );

    const point = geometry[index];

    if (point) {
      points.push({
        lng: point[0],
        lat: point[1]
      });
    }
  }

  const seen = new Set();

  return points.filter(point => {
    const key = `${point.lat.toFixed(4)},${point.lng.toFixed(4)}`;

    if (seen.has(key)) return false;

    seen.add(key);
    return true;
  });
}
