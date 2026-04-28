import {
  TOMTOM_API_KEY,
  TOMTOM_ROUTING_BASE
} from "./config.js";

export async function fetchTomTomRoute(from, to) {
  const locations =
    `${from.lat},${from.lng}:${to.lat},${to.lng}`;

  const params = new URLSearchParams({
    key: TOMTOM_API_KEY,
    traffic: "true",
    travelMode: "car",
    routeType: "fastest",
    instructionsType: "text",
    language: "da-DK",
    routeRepresentation: "polyline",
    computeTravelTimeFor: "all"
  });

  const url =
    `${TOMTOM_ROUTING_BASE}/calculateRoute/${locations}/json?${params.toString()}`;

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error("TomTom rute kunne ikke hentes");
  }

  const data = await response.json();

  if (!data.routes?.length) {
    throw new Error("TomTom fandt ingen rute");
  }

  return normalizeTomTomRoute(data.routes[0]);
}

function normalizeTomTomRoute(route) {
  const points = [];

  route.legs?.forEach(leg => {
    leg.points?.forEach(point => {
      points.push([
        point.longitude,
        point.latitude
      ]);
    });
  });

  const steps =
    route.guidance?.instructions?.map(instruction => ({
      distance: Number(instruction.routeOffsetInMeters || 0),
      duration: 0,
      name: instruction.street || "",
      maneuverType: instruction.maneuver || "continue",
      maneuverModifier: "",
      message: instruction.message || "",
      location: {
        lat: instruction.point?.latitude,
        lng: instruction.point?.longitude
      }
    })) || [];

  return {
    geometry: points,
    distance: route.summary?.lengthInMeters || 0,
    duration: route.summary?.travelTimeInSeconds || 0,
    trafficDelay:
      route.summary?.trafficDelayInSeconds || 0,
    steps
  };
}
