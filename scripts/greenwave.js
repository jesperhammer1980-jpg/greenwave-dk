import { state } from "./state.js";

import {
  haversine,
  projectPointToSegment
} from "./utils.js";

export async function loadTrafficSignals(geometry) {
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
    out tags;
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

    state.trafficSignals = dedupeSignals(
      (data.elements || [])
        .map(normalizeSignal)
        .filter(Boolean)
    );

    computeSignalRouteDistances();
  } catch (error) {
    console.error("Trafiklys fejl", error);
    state.trafficSignals = [];
  }
}

function sampleRoutePoints(geometry) {
  const points = [];
  const maxSamples = 24;

  if (!Array.isArray(geometry) || !geometry.length) {
    return points;
  }

  for (let i = 0; i < maxSamples; i++) {
    const index = Math.round(
      (geometry.length - 1) * (i / (maxSamples - 1))
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
    const key = `${point.lat.toFixed(3)},${point.lng.toFixed(3)}`;

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

function normalizeSignal(element) {
  if (
    typeof element.lat !== "number" ||
    typeof element.lon !== "number"
  ) {
    return null;
  }

  return {
    id: `${element.type}-${element.id}`,
    lat: element.lat,
    lng: element.lon,
    tags: element.tags || {},
    distanceAlongRoute: Infinity,
    distanceToRoute: Infinity
  };
}

function dedupeSignals(signals) {
  const result = [];

  signals.forEach(signal => {
    const exists = result.some(existing =>
      haversine(
        signal.lat,
        signal.lng,
        existing.lat,
        existing.lng
      ) < 25
    );

    if (!exists) {
      result.push(signal);
    }
  });

  return result;
}

function computeSignalRouteDistances() {
  if (!state.routeData?.geometry?.length) {
    return;
  }

  const route = state.routeData.geometry;
  let cumulative = 0;
  const segments = [];

  for (let i = 1; i < route.length; i++) {
    const start = route[i - 1];
    const end = route[i];

    const length = haversine(
      start[1],
      start[0],
      end[1],
      end[0]
    );

    segments.push({
      start,
      end,
      startMeters: cumulative,
      length
    });

    cumulative += length;
  }

  state.trafficSignals.forEach(signal => {
    let bestDistanceToRoute = Infinity;
    let bestAlong = Infinity;

    segments.forEach(segment => {
      const projected = projectPointToSegment(
        signal.lat,
        signal.lng,
        segment.start[1],
        segment.start[0],
        segment.end[1],
        segment.end[0]
      );

      if (projected.distanceMeters < bestDistanceToRoute) {
        bestDistanceToRoute = projected.distanceMeters;
        bestAlong =
          segment.startMeters +
          segment.length * projected.t;
      }
    });

    signal.distanceToRoute = bestDistanceToRoute;
    signal.distanceAlongRoute = bestAlong;
  });

  state.trafficSignals.sort(
    (a, b) => a.distanceAlongRoute - b.distanceAlongRoute
  );
}

export function getNextTrafficSignal(currentPosition) {
  if (
    !currentPosition ||
    !state.routeData?.geometry?.length ||
    !Array.isArray(state.trafficSignals)
  ) {
    return null;
  }

  const currentAlong = getCurrentDistanceAlongRoute(currentPosition);

  if (!Number.isFinite(currentAlong)) {
    return null;
  }

  return state.trafficSignals.find(signal =>
    signal.distanceAlongRoute > currentAlong + 40 &&
    signal.distanceToRoute <= 80
  ) || null;
}

export function getGreenWaveRecommendation(currentPosition) {
  const nextSignal = getNextTrafficSignal(currentPosition);

  if (!nextSignal) {
    return {
      speedKmh: getFallbackSpeed(currentPosition?.speed),
      distanceToSignal: null,
      confidence: "low",
      message: "Ingen trafiklys fundet tæt på ruten"
    };
  }

  const currentAlong = getCurrentDistanceAlongRoute(currentPosition);
  const distanceToSignal =
    nextSignal.distanceAlongRoute - currentAlong;

  const speedKmh = calculateRecommendedSpeed(distanceToSignal);

  return {
    speedKmh,
    distanceToSignal,
    confidence: "estimated",
    message: "Estimeret grøn bølge uden live signaldata"
  };
}

function getCurrentDistanceAlongRoute(currentPosition) {
  const route = state.routeData?.geometry;

  if (!route?.length) {
    return Infinity;
  }

  let cumulative = 0;
  let bestDistanceToRoute = Infinity;
  let bestAlong = Infinity;

  for (let i = 1; i < route.length; i++) {
    const start = route[i - 1];
    const end = route[i];

    const segmentLength = haversine(
      start[1],
      start[0],
      end[1],
      end[0]
    );

    const projected = projectPointToSegment(
      currentPosition.lat,
      currentPosition.lng,
      start[1],
      start[0],
      end[1],
      end[0]
    );

    if (projected.distanceMeters < bestDistanceToRoute) {
      bestDistanceToRoute = projected.distanceMeters;
      bestAlong =
        cumulative +
        segmentLength * projected.t;
    }

    cumulative += segmentLength;
  }

  return bestAlong;
}

function calculateRecommendedSpeed(distanceToSignalMeters) {
  /*
    Første GreenWave-logik:
    Da vi ikke har live signalfaser, antager vi typiske by-cyklusser.
    Målet er jævn fart og mindre stop-start.
  */

  if (!Number.isFinite(distanceToSignalMeters)) {
    return 45;
  }

  const minSpeed = 30;
  const maxSpeed = 60;

  const cycleSeconds = 80;
  const preferredArrivalWindowSeconds = 45;

  const rawSpeedKmh =
    distanceToSignalMeters /
    preferredArrivalWindowSeconds *
    3.6;

  let speed = Math.round(rawSpeedKmh / 5) * 5;

  if (speed < minSpeed) {
    speed = minSpeed;
  }

  if (speed > maxSpeed) {
    speed = maxSpeed;
  }

  if (distanceToSignalMeters < 120) {
    speed = 30;
  }

  if (distanceToSignalMeters > 900) {
    speed = 50;
  }

  return speed;
}

function getFallbackSpeed(speedMetersPerSecond) {
  const currentSpeedKmh =
    typeof speedMetersPerSecond === "number" &&
    Number.isFinite(speedMetersPerSecond)
      ? Math.round(speedMetersPerSecond * 3.6)
      : 0;

  if (currentSpeedKmh <= 10) {
    return 45;
  }

  if (currentSpeedKmh < 35) {
    return 40;
  }

  if (currentSpeedKmh <= 55) {
    return currentSpeedKmh;
  }

  return 55;
}
