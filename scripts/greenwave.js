import { state } from "./state.js";

import {
  formatDistance,
  haversine
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
    out;
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
        .filter(item =>
          typeof item.lat === "number" &&
          typeof item.lon === "number"
        )
        .map(item => ({
          id: item.id,
          lat: item.lat,
          lng: item.lon
        }))
    );
  } catch (error) {
    console.warn("Kunne ikke hente trafiklys", error);
    state.trafficSignals = [];
  }
}

export function getGreenWaveRecommendation(current) {
  const currentMaxSpeed = getCurrentMaxSpeed();
  const nextSignal = findNextTrafficSignal(current);

  /*
    VIGTIG NY LOGIK:
    Hvis der ikke er trafiklys forude, skal anbefalet hastighed IKKE følge
    aktuel hastighed og IKKE automatisk ligge 5 km/t under fartgrænsen.
    Den skal stå fast på maxhastighed, hvis den kendes.
  */

  if (!nextSignal) {
    const speedKmh =
      currentMaxSpeed ||
      getFallbackCruiseSpeed();

    return {
      speedKmh,
      distanceToSignal: null,
      message: currentMaxSpeed
        ? `Ingen trafiklys forude · hold ${currentMaxSpeed} km/t`
        : `Ingen trafiklys forude · hold jævn fart`
    };
  }

  /*
    GreenWave er kun aktiv, når der faktisk er et trafiklys forude.
  */

  const distance = nextSignal.distance;

  const recommended =
    calculateSignalAwareSpeed(
      distance,
      currentMaxSpeed
    );

  return {
    speedKmh: recommended,
    distanceToSignal: distance,
    message:
      `Trafiklys om ${formatDistance(distance)} · anbefalet ${recommended} km/t`
  };
}

function calculateSignalAwareSpeed(distanceMeters, maxSpeed) {
  const legalMax =
    maxSpeed ||
    getFallbackCruiseSpeed();

  /*
    Tæt på lyskryds:
    anbefal roligere fart.
  */
  if (distanceMeters < 80) {
    return Math.min(legalMax, 30);
  }

  if (distanceMeters < 180) {
    return Math.min(legalMax, 40);
  }

  if (distanceMeters < 350) {
    return Math.min(legalMax, 50);
  }

  /*
    Længere væk:
    brug maxhastighed som udgangspunkt.
    Ikke max - 5.
  */
  return legalMax;
}

function findNextTrafficSignal(current) {
  if (!current || !Array.isArray(state.trafficSignals)) {
    return null;
  }

  if (!state.trafficSignals.length) {
    return null;
  }

  const candidates = state.trafficSignals
    .map(signal => ({
      ...signal,
      distance: haversine(
        current.lat,
        current.lng,
        signal.lat,
        signal.lng
      )
    }))
    .filter(signal =>
      Number.isFinite(signal.distance) &&
      signal.distance > 25 &&
      signal.distance < 1200
    )
    .sort((a, b) => a.distance - b.distance);

  return candidates[0] || null;
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

function getFallbackCruiseSpeed() {
  /*
    Fallback bruges kun, når maxspeed er ukendt.
    Den følger ikke aktuel hastighed.
  */

  if (state.settings?.region === "us") {
    return 55;
  }

  return 80;
}

function sampleRoutePoints(geometry) {
  const points = [];
  const maxSamples = 18;

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
    const key =
      `${point.lat.toFixed(3)},${point.lng.toFixed(3)}`;

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

function dedupeSignals(signals) {
  const out = [];

  signals.forEach(signal => {
    const duplicate = out.some(existing =>
      haversine(
        signal.lat,
        signal.lng,
        existing.lat,
        existing.lng
      ) < 25
    );

    if (!duplicate) {
      out.push(signal);
    }
  });

  return out;
}
