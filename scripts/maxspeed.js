import { state } from "./state.js";

import {
  haversine
} from "./utils.js";

export async function loadMaxSpeedZones() {

  if (
    !state.routeData?.geometry
      ?.length
  ) {
    return;
  }

  try {

    const sample =
      sampleRoutePoints(
        state.routeData.geometry
      );

    const query = `
      [out:json][timeout:25];
      (
        ${sample.map(point => `
          way(around:1200,${point.lat},${point.lng})["highway"]["maxspeed"];
        `).join("")}
      );
      out tags center;
    `;

    const response =
      await fetch(
        "https://overpass-api.de/api/interpreter",
        {
          method: "POST",
          headers: {
            "Content-Type":
              "text/plain;charset=UTF-8"
          },
          body: query
        }
      );

    if (!response.ok) {
      throw new Error(
        "Maxspeed API fejl"
      );
    }

    const data =
      await response.json();

    state.maxSpeedZones =
      (data.elements || [])
        .map(normalizeZone)
        .filter(Boolean);

  } catch (error) {

    console.warn(
      "Kunne ikke hente fartzoner",
      error
    );

    state.maxSpeedZones = [];
  }
}

export function updateCurrentMaxSpeed(
  position
) {

  if (
    !position ||
    !state.maxSpeedZones.length
  ) {
    return null;
  }

  let nearest = null;
  let bestDistance = Infinity;

  state.maxSpeedZones.forEach(zone => {

    const distance =
      haversine(
        position.lat,
        position.lng,
        zone.lat,
        zone.lng
      );

    if (
      distance < bestDistance
    ) {
      bestDistance = distance;
      nearest = zone;
    }
  });

  if (
    nearest &&
    bestDistance < 250
  ) {

    state.currentMaxSpeed =
      nearest.maxspeed;

    return nearest.maxspeed;
  }

  return state.currentMaxSpeed;
}

function normalizeZone(
  item
) {

  const tags =
    item.tags || {};

  const maxspeed =
    parseSpeed(
      tags.maxspeed
    );

  if (!maxspeed) {
    return null;
  }

  const lat =
    item.center?.lat;

  const lng =
    item.center?.lon;

  if (
    !Number.isFinite(lat) ||
    !Number.isFinite(lng)
  ) {
    return null;
  }

  return {
    lat,
    lng,

    maxspeed,

    highway:
      tags.highway ||
      "road"
  };
}

function parseSpeed(
  value
) {

  if (!value) {
    return null;
  }

  const clean =
    String(value)
      .replace(
        /km\/h/gi,
        ""
      )
      .trim();

  const speed =
    Number(clean);

  if (
    !Number.isFinite(speed)
  ) {
    return null;
  }

  return speed;
}

function sampleRoutePoints(
  geometry
) {

  const out = [];

  const maxSamples = 20;

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

    out.push({
      lng: point[0],
      lat: point[1]
    });
  }

  return out;
}
