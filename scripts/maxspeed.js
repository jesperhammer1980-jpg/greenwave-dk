import { state } from "./state.js";
import { haversine } from "./utils.js";

/*
  Henter maxspeed fra OSM via Overpass
  baseret på rute-bounding-box
*/

export async function loadMaxSpeedZones() {
  if (!state.routeData?.geometry?.length) {
    return;
  }

  const bbox = getRouteBoundingBox(state.routeData.geometry);

  const query = `
    [out:json][timeout:25];
    (
      way["highway"]["maxspeed"](${bbox});
    );
    out geom;
  `;

  try {
    const res = await fetch("https://overpass-api.de/api/interpreter", {
      method: "POST",
      body: query
    });

    const data = await res.json();

    state.maxSpeedZones = parseMaxSpeedWays(data.elements);

    console.log("MaxSpeed zones loaded:", state.maxSpeedZones.length);
  } catch (err) {
    console.warn("Kunne ikke hente maxspeed", err);
    state.maxSpeedZones = [];
  }
}

function getRouteBoundingBox(geometry) {
  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLng = Infinity;
  let maxLng = -Infinity;

  for (const [lng, lat] of geometry) {
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
    if (lng < minLng) minLng = lng;
    if (lng > maxLng) maxLng = lng;
  }

  return `${minLat},${minLng},${maxLat},${maxLng}`;
}

function parseMaxSpeedWays(elements) {
  const zones = [];

  for (const el of elements) {
    if (!el.tags?.maxspeed || !el.geometry) continue;

    const speed = parseMaxSpeed(el.tags.maxspeed);

    if (!speed) continue;

    for (const node of el.geometry) {
      zones.push({
        lat: node.lat,
        lng: node.lon,
        speed
      });
    }
  }

  return zones;
}

function parseMaxSpeed(value) {
  if (!value) return null;

  const str = String(value).toLowerCase();

  if (str.includes("dk:urban")) return 50;
  if (str.includes("dk:rural")) return 80;
  if (str.includes("dk:motorway")) return 130;

  const num = parseInt(str.replace(/[^\d]/g, ""), 10);

  if (!Number.isFinite(num)) return null;

  return num;
}

/*
  Finder aktuel maxspeed baseret på nærmeste zone
*/

export function updateCurrentMaxSpeed(position) {
  if (!position || !state.maxSpeedZones.length) {
    state.currentMaxSpeed = null;
    return;
  }

  let best = null;

  for (const zone of state.maxSpeedZones) {
    const d = haversine(
      position.lat,
      position.lng,
      zone.lat,
      zone.lng
    );

    if (d > 120) continue;

    if (!best || d < best.distance) {
      best = {
        speed: zone.speed,
        distance: d
      };
    }
  }

  state.currentMaxSpeed = best?.speed ?? null;
}
