import { state } from "./state.js";

import {
  haversine
} from "./utils.js";

export async function loadTrafficSignals(geometry = []) {
  if (!Array.isArray(geometry) || !geometry.length) {
    state.trafficSignals = [];
    return;
  }

  const sample = sampleRoutePoints(geometry);

  if (!sample.length) {
    state.trafficSignals = [];
    return;
  }

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
  const speedLimit =
    typeof state.currentMaxSpeed === "number" &&
    Number.isFinite(state.currentMaxSpeed)
      ? state.currentMaxSpeed
      : null;

  const nextStep = getNextStepEstimate(current);

  const nextSignalDistance =
    getNearestTrafficSignalDistance(current);

  let recommended =
    calculateBaseRecommendedSpeed(speedLimit);

  if (nextStep) {
    recommended = applyTurnBasedSpeed(
      recommended,
      nextStep
    );
  }

  if (
    Number.isFinite(nextSignalDistance) &&
    nextSignalDistance < 350
  ) {
    recommended = Math.min(
      recommended,
      calculateApproachSpeed(nextSignalDistance)
    );
  }

  recommended = clampRecommendedSpeed(
    recommended,
    speedLimit
  );

  return {
    speedKmh: recommended,
    reason: getRecommendationReason(
      speedLimit,
      nextStep,
      nextSignalDistance
    )
  };
}

function calculateBaseRecommendedSpeed(speedLimit) {
  if (!speedLimit) {
    return null;
  }

  if (speedLimit <= 40) {
    return Math.max(25, Math.round(speedLimit * 0.9));
  }

  if (speedLimit <= 60) {
    return Math.round(speedLimit * 0.88);
  }

  if (speedLimit <= 90) {
    return Math.round(speedLimit * 0.9);
  }

  return Math.round(speedLimit * 0.88);
}

function applyTurnBasedSpeed(currentRecommendation, step) {
  if (!Number.isFinite(currentRecommendation)) {
    return currentRecommendation;
  }

  const distance =
    Number(step.distanceToStep || step.distance || Infinity);

  const type =
    String(step.maneuverType || "").toLowerCase();

  const modifier =
    String(step.maneuverModifier || "").toLowerCase();

  const isTurn =
    modifier.includes("left") ||
    modifier.includes("right") ||
    type.includes("turn");

  const isRoundabout =
    type.includes("roundabout") ||
    type.includes("rotary");

  const isRamp =
    type.includes("ramp") ||
    type.includes("merge");

  if (isRoundabout && distance < 300) {
    return Math.min(currentRecommendation, 35);
  }

  if (isTurn && distance < 250) {
    return Math.min(currentRecommendation, 35);
  }

  if (isRamp && distance < 350) {
    return Math.min(currentRecommendation, 55);
  }

  if (distance < 120) {
    return Math.min(currentRecommendation, 35);
  }

  return currentRecommendation;
}

function calculateApproachSpeed(distanceMeters) {
  if (distanceMeters < 80) {
    return 25;
  }

  if (distanceMeters < 150) {
    return 35;
  }

  if (distanceMeters < 250) {
    return 45;
  }

  return 55;
}

function clampRecommendedSpeed(value, speedLimit) {
  if (!Number.isFinite(value)) {
    return null;
  }

  let min = 25;
  let max = speedLimit || 90;

  if (speedLimit && speedLimit <= 40) {
    min = 20;
  }

  const rounded =
    Math.round(value / 5) * 5;

  return Math.max(
    min,
    Math.min(max, rounded)
  );
}

function getNextStepEstimate(current) {
  const steps = state.routeSteps || [];

  if (!steps.length) {
    return null;
  }

  return steps[state.currentStepIndex || 0] || null;
}

function getNearestTrafficSignalDistance(current) {
  if (!current || !Array.isArray(state.trafficSignals)) {
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

function getRecommendationReason(
  speedLimit,
  nextStep,
  nextSignalDistance
) {
  if (!speedLimit) {
    return "Mangler fartgrænse";
  }

  if (
    nextStep &&
    Number(nextStep.distance || Infinity) < 300
  ) {
    return "Tilpasset kommende manøvre";
  }

  if (
    Number.isFinite(nextSignalDistance) &&
    nextSignalDistance < 350
  ) {
    return "Rolig tilgang mod trafiklys";
  }

  return "Økonomisk anbefalet fart";
}

function sampleRoutePoints(geometry) {
  const points = [];
  const maxSamples = 18;

  if (!Array.isArray(geometry) || !geometry.length) {
    return points;
  }

  for (let i = 0; i < maxSamples; i++) {
    const index = Math.round(
      (geometry.length - 1) *
      (i / (maxSamples - 1))
    );

    const point = geometry[index];

    if (!point) {
      continue;
    }

    points.push({
      lng: point[0],
      lat: point[1]
    });
  }

  const seen = new Set();

  return points.filter(point => {
    const key =
      `${point.lat.toFixed(4)},${point.lng.toFixed(4)}`;

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}
