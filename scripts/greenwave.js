import { state } from "./state.js";

import {
  haversine
} from "./utils.js";

/* =========================
   LOAD TRAFFIC SIGNALS
========================= */

export async function loadTrafficSignals(geometry = []) {
  if (
    !Array.isArray(geometry) ||
    !geometry.length
  ) {
    state.trafficSignals = [];
    return;
  }

  const sample =
    sampleRoutePoints(geometry);

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
    const response =
      await fetch(
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
      throw new Error(
        "Trafiklys kunne ikke hentes"
      );
    }

    const data =
      await response.json();

    state.trafficSignals =
      (data.elements || [])
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
    console.warn(
      "Trafiklys-data ikke tilgængelig",
      error
    );

    state.trafficSignals = [];
  }
}

/* =========================
   PUBLIC RECOMMENDATION
========================= */

export function getGreenWaveRecommendation(current) {
  if (
    !state.settings.greenWaveEnabled
  ) {
    return {
      speedKmh: null,
      reason: "Anbefalet fart slået fra"
    };
  }

  const speedLimit =
    getReliableSpeedLimit();

  const nextStep =
    getNextStepEstimate();

  const nextSignalDistance =
    getNearestTrafficSignalDistance(current);

  const curveSpeed =
    getCurveOrTurnSpeed(nextStep);

  let recommended =
    calculateBaseRecommendedSpeed(
      speedLimit,
      current
    );

  if (
    Number.isFinite(curveSpeed)
  ) {
    recommended =
      Math.min(
        recommended || curveSpeed,
        curveSpeed
      );
  }

  if (
    Number.isFinite(nextSignalDistance)
  ) {
    recommended =
      applyTrafficSignalApproach(
        recommended,
        nextSignalDistance,
        current
      );
  }

  recommended =
    clampRecommendedSpeed(
      recommended,
      speedLimit
    );

  return {
    speedKmh: recommended,
    reason:
      getRecommendationReason({
        speedLimit,
        nextStep,
        nextSignalDistance,
        curveSpeed,
        recommended
      })
  };
}

/* =========================
   SPEED LIMIT HANDLING
========================= */

function getReliableSpeedLimit() {
  if (
    typeof state.currentMaxSpeed === "number" &&
    Number.isFinite(state.currentMaxSpeed) &&
    state.currentMaxSpeed >= 20 &&
    state.currentMaxSpeed <= 130
  ) {
    return state.currentMaxSpeed;
  }

  return null;
}

/* =========================
   BASE SPEED
========================= */

function calculateBaseRecommendedSpeed(
  speedLimit,
  current
) {
  const speed =
    Number(current?.speed || 0);

  if (!speedLimit) {
    if (speed > 90) return 90;
    if (speed > 65) return 75;
    if (speed > 40) return 55;
    if (speed > 15) return 40;

    return null;
  }

  if (speedLimit <= 30) {
    return 25;
  }

  if (speedLimit <= 40) {
    return 35;
  }

  if (speedLimit <= 50) {
    return 45;
  }

  if (speedLimit <= 60) {
    return 55;
  }

  if (speedLimit <= 80) {
    return 70;
  }

  if (speedLimit <= 90) {
    return 80;
  }

  if (speedLimit <= 110) {
    return 95;
  }

  return 105;
}

/* =========================
   TURN / CURVE SPEED
========================= */

function getCurveOrTurnSpeed(step) {
  if (
    !state.settings.curveSpeedAssist &&
    !state.navigationView.curveSpeedAssist
  ) {
    return null;
  }

  if (!step) {
    return null;
  }

  const distance =
    Number(
      step.distanceToStep ||
      step.distance ||
      Infinity
    );

  const type =
    String(
      step.maneuverType || ""
    ).toLowerCase();

  const modifier =
    String(
      step.maneuverModifier || ""
    ).toLowerCase();

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

  if (
    isRoundabout &&
    distance < 350
  ) {
    if (distance < 120) return 25;
    if (distance < 220) return 35;

    return 45;
  }

  if (
    isTurn &&
    distance < 300
  ) {
    if (distance < 80) return 25;
    if (distance < 180) return 35;

    return 45;
  }

  if (
    isRamp &&
    distance < 450
  ) {
    if (distance < 140) return 45;
    if (distance < 280) return 55;

    return 65;
  }

  return null;
}

/* =========================
   TRAFFIC SIGNAL APPROACH
========================= */

function applyTrafficSignalApproach(
  currentRecommendation,
  distanceMeters,
  current
) {
  if (
    !Number.isFinite(distanceMeters) ||
    distanceMeters > 450
  ) {
    return currentRecommendation;
  }

  const currentSpeed =
    Number(current?.speed || 0);

  let signalSpeed = null;

  if (distanceMeters < 70) {
    signalSpeed = 25;
  } else if (distanceMeters < 140) {
    signalSpeed = 35;
  } else if (distanceMeters < 260) {
    signalSpeed = 45;
  } else if (distanceMeters < 450) {
    signalSpeed = 55;
  }

  if (!Number.isFinite(signalSpeed)) {
    return currentRecommendation;
  }

  if (!Number.isFinite(currentRecommendation)) {
    return signalSpeed;
  }

  if (currentSpeed > signalSpeed + 12) {
    return Math.min(
      currentRecommendation,
      signalSpeed
    );
  }

  return Math.min(
    currentRecommendation,
    signalSpeed + 5
  );
}

/* =========================
   CLAMPING
========================= */

function clampRecommendedSpeed(
  value,
  speedLimit
) {
  if (!Number.isFinite(value)) {
    return null;
  }

  const max =
    speedLimit || 110;

  let min = 25;

  if (
    speedLimit &&
    speedLimit <= 30
  ) {
    min = 20;
  }

  const rounded =
    Math.round(value / 5) * 5;

  return Math.max(
    min,
    Math.min(max, rounded)
  );
}

/* =========================
   CONTEXT HELPERS
========================= */

function getNextStepEstimate() {
  const steps =
    state.routeSteps || [];

  if (!steps.length) {
    return null;
  }

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
    const distance =
      haversine(
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

function getRecommendationReason({
  speedLimit,
  nextStep,
  nextSignalDistance,
  curveSpeed,
  recommended
}) {
  if (!Number.isFinite(recommended)) {
    return "Mangler data";
  }

  if (
    Number.isFinite(curveSpeed)
  ) {
    return "Tilpasset kommende sving";
  }

  if (
    Number.isFinite(nextSignalDistance) &&
    nextSignalDistance < 450
  ) {
    return "Rolig tilgang mod trafiklys";
  }

  if (!speedLimit) {
    return "Anbefalet økonomisk fart";
  }

  if (nextStep) {
    return "Tilpasset rute og fartgrænse";
  }

  return "Økonomisk anbefalet fart";
}

/* =========================
   ROUTE SAMPLING
========================= */

function sampleRoutePoints(geometry) {
  const points = [];
  const maxSamples = 18;

  if (
    !Array.isArray(geometry) ||
    !geometry.length
  ) {
    return points;
  }

  for (
    let i = 0;
    i < maxSamples;
    i++
  ) {
    const index =
      Math.round(
        (geometry.length - 1) *
        (i / (maxSamples - 1))
      );

    const point =
      geometry[index];

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
