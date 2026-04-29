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
    route.guidance?.instructions?.map((instruction, index) => {
      const point = instruction.point || {};

      return {
        stepIndex: index,
        distance: Number(instruction.routeOffsetInMeters || 0),
        duration: 0,

        name:
          instruction.street ||
          instruction.roadNumbers?.join(", ") ||
          "",

        mode: "driving",

        maneuverType:
          normalizeManeuverType(instruction.maneuver),

        maneuverModifier:
          normalizeManeuverModifier(instruction.maneuver),

        message:
          instruction.message ||
          "",

        location: {
          lat: Number(point.latitude),
          lng: Number(point.longitude)
        },

        roundaboutExit:
          instruction.roundaboutExitNumber ||
          instruction.exitNumber ||
          null,

        rawManeuver:
          instruction.maneuver || "",

        rawInstruction:
          instruction
      };
    }).filter(step =>
      Number.isFinite(step.location.lat) &&
      Number.isFinite(step.location.lng)
    ) || [];

  return {
    geometry: points,
    distance: route.summary?.lengthInMeters || 0,
    duration: route.summary?.travelTimeInSeconds || 0,
    trafficDelay:
      route.summary?.trafficDelayInSeconds || 0,
    steps
  };
}

function normalizeManeuverType(value) {
  const text = String(value || "").toLowerCase();

  if (text.includes("arrive")) {
    return "arrive";
  }

  if (text.includes("depart")) {
    return "depart";
  }

  if (
    text.includes("roundabout") ||
    text.includes("rotary")
  ) {
    return "roundabout";
  }

  if (text.includes("uturn")) {
    return "turn";
  }

  if (text.includes("turn")) {
    return "turn";
  }

  if (text.includes("fork")) {
    return "fork";
  }

  if (text.includes("ramp")) {
    return "ramp";
  }

  if (text.includes("merge")) {
    return "merge";
  }

  if (text.includes("keep")) {
    return "fork";
  }

  return text || "continue";
}

function normalizeManeuverModifier(value) {
  const text = String(value || "").toLowerCase();

  if (text.includes("left")) {
    return "left";
  }

  if (text.includes("right")) {
    return "right";
  }

  if (text.includes("uturn")) {
    return "uturn";
  }

  if (text.includes("straight")) {
    return "straight";
  }

  if (text.includes("slight")) {
    if (text.includes("left")) {
      return "slight left";
    }

    if (text.includes("right")) {
      return "slight right";
    }
  }

  return "";
}
