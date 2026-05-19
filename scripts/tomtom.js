const TOMTOM_API_KEY = "";

export async function fetchTomTomRoute(from, to) {
  if (!TOMTOM_API_KEY) {
    throw new Error("TomTom API-key mangler");
  }

  if (!from || !to) {
    throw new Error("Mangler start eller destination");
  }

  const url =
    `https://api.tomtom.com/routing/1/calculateRoute/` +
    `${from.lat},${from.lng}:${to.lat},${to.lng}/json` +
    `?key=${encodeURIComponent(TOMTOM_API_KEY)}` +
    `&traffic=true` +
    `&travelMode=car` +
    `&routeType=fastest` +
    `&instructionsType=text` +
    `&language=da-DK` +
    `&computeTravelTimeFor=all`;

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error("TomTom route request fejlede");
  }

  const data = await response.json();

  if (!data.routes?.length) {
    throw new Error("TomTom fandt ingen rute");
  }

  const route = data.routes[0];

  return {
    geometry: extractTomTomGeometry(route),
    distance: Number(route.summary?.lengthInMeters || 0),
    duration: Number(route.summary?.travelTimeInSeconds || 0),
    trafficDelay: Number(route.summary?.trafficDelayInSeconds || 0),
    steps: extractTomTomSteps(route)
  };
}

function extractTomTomGeometry(route) {
  const points = route.legs
    ?.flatMap(leg => leg.points || [])
    ?.map(point => [
      Number(point.longitude),
      Number(point.latitude)
    ]);

  if (!Array.isArray(points) || !points.length) {
    throw new Error("TomTom geometri mangler");
  }

  return points;
}

function extractTomTomSteps(route) {
  const instructions = route.guidance?.instructions || [];

  return instructions.map(instruction => ({
    distance: Number(instruction.routeOffsetInMeters || 0),
    duration: 0,
    name: instruction.street || "",
    geometry: [],
    maneuverType: normalizeTomTomType(instruction.maneuver),
    maneuverModifier: normalizeTomTomModifier(instruction.maneuver),
    message: instruction.message || "",
    location: {
      lat: Number(instruction.point?.latitude || 0),
      lng: Number(instruction.point?.longitude || 0)
    },
    roundaboutExit: instruction.roundaboutExitNumber || null
  }));
}

function normalizeTomTomType(value) {
  const text = String(value || "").toLowerCase();

  if (text.includes("arrive")) return "arrive";
  if (text.includes("roundabout")) return "roundabout";
  if (text.includes("turn")) return "turn";
  if (text.includes("depart")) return "depart";

  return "continue";
}

function normalizeTomTomModifier(value) {
  const text = String(value || "").toLowerCase();

  if (text.includes("left")) return "left";
  if (text.includes("right")) return "right";
  if (text.includes("straight")) return "straight";

  return "";
}
