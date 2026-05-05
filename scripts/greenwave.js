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
  const maxSpeed = getCurrentMaxSpeed();

  /*
    SIKKERHEDSREGEL:
    Hvis maxhastighed er ukendt, må appen ikke gætte.
    Derfor vises anbefalet hastighed som ?.
  */
  if (!maxSpeed) {
    return {
      speedKmh: null,
      distanceToSignal: null,
      message: "Ukendt hastighedsgrænse"
    };
  }

  const nextSignal = findNextTrafficSignal(current);

  /*
    Hvis der ikke er trafiklys forude:
    anbefalet hastighed = maxhastighed.
    Ikke aktuel hastighed.
    Ikke max - 5.
  */
  if (!nextSignal) {
    return {
      speedKmh: maxSpeed,
      distanceToSignal: null,
      message: `Ingen trafiklys forude · hold ${maxSpeed} km/t`
    };
  }

  const distance = nextSignal.distance;

  const recommended =
    calculateSignalAwareSpeed(distance, maxSpeed);

  return {
    speedKmh: recommended,
    distanceToSignal: distance,
    message:
      `Trafiklys om ${formatDistance(distance)} · anbefalet ${recommended} km/t`
  };
}

function calculateSignalAwareSpeed(distanceMeters, maxSpeed) {
  if (!maxSpeed) {
    return null;
  }

  if (distanceMeters < 80) {
    return Math.min(maxSpeed, 30);
  }

  if (distanceMeters < 180) {
    return Math.min(maxSpeed, 40);
  }

  if (distanceMeters < 350) {
    return Math.min(maxSpeed, 50);
  }

  return maxSpeed;
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
