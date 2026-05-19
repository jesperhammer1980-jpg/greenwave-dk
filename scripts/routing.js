import { state } from "./state.js";
import { els } from "./dom.js";

import { getPosition, setStatus } from "./utils.js";
import { drawRoute, updateUserMarker, updateDestinationMarker } from "./map.js";
import {
  loadFuelStations,
  computeRouteDistances,
  applyPricesToStations,
  updateFuelBox,
  updateFuelMarkers
} from "./fuel.js";
import { loadTrafficSignals } from "./greenwave.js";
import { loadMaxSpeedZones } from "./maxspeed.js";
import { prepareRouteSteps } from "./route-progress.js";
import { saveHistory, renderHistory } from "./history.js";
import { fetchTomTomRoute } from "./tomtom.js";

export async function calculateRoute() {
  const input = els.destinationInput?.value.trim();

  if (!input) {
    alert("Indtast en destination først.");
    return;
  }

  try {
    setRouteBusy(true);

    setStatus("GPS: henter position", "Navigation: beregner", "Kort: beregner");

    state.currentPosition = await getPosition();

    updateUserMarker(state.currentPosition.lat, state.currentPosition.lng);

    state.destination =
      state.selectedAutocompleteItem || await geocode(input);

    updateDestinationMarker(state.destination.lat, state.destination.lng);

    const route = await fetchBestRoute(
      state.currentPosition,
      state.destination
    );

    await applyRoute(route, true);

    setStatus("GPS: klar", "Navigation: rute klar", "Kort: klar");
  } catch (error) {
    console.error("Rutefejl", error);
    alert("Kunne ikke beregne rute:\n\n" + (error.message || error));
    setStatus("GPS: fejl", "Navigation: fejl", "Kort: fejl");
    setRouteReady(false);
  } finally {
    setRouteBusy(false);
  }
}

export async function recalculateRouteFromCurrentPosition(position) {
  if (!position || !state.destination) {
    throw new Error("Mangler aktuel position eller destination");
  }

  const route = await fetchBestRoute(position, state.destination);

  await applyRoute(route, false);

  return route;
}

async function applyRoute(route, saveToHistory) {
  state.routeData = route;
  state.routeSteps = route.steps || [];
  state.currentStepIndex = 0;

  state.routeProgress = {
    alongMeters: 0,
    remainingMeters: route.distance || 0,
    remainingSeconds: route.duration || 0,
    progressRatio: 0,
    segmentIndex: 0,
    distanceToRoute: Infinity,
    isOffRoute: false
  };

  drawRoute(route.geometry);
  prepareRouteSteps();

  if (saveToHistory && state.destination) {
    saveHistory(state.destination);
    renderHistory();
  }

  setRouteReady(true);

  await Promise.allSettled([
    loadFuelStations(route.geometry),
    loadTrafficSignals(route.geometry),
    loadMaxSpeedZones()
  ]);

  computeRouteDistances();
  applyPricesToStations();
  updateFuelBox();
  updateFuelMarkers();
}

async function fetchBestRoute(from, to) {
  try {
    const route = await fetchTomTomRoute(from, to);

    return {
      ...route,
      provider: "tomtom"
    };
  } catch (error) {
    console.warn("TomTom fejlede. Bruger OSRM.", error);

    const route = await fetchOsrmRoute(from, to);

    return {
      ...route,
      provider: "osrm"
    };
  }
}

export async function geocode(query) {
  const country = state.settings.region === "us" ? "us" : "dk";

  const url =
    `https://nominatim.openstreetmap.org/search` +
    `?format=jsonv2&limit=1&addressdetails=1` +
    `&countrycodes=${country}` +
    `&q=${encodeURIComponent(query)}`;

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error("Geocoding fejlede");
  }

  const data = await response.json();

  if (!Array.isArray(data) || !data.length) {
    throw new Error("Destination ikke fundet");
  }

  const item = data[0];

  return {
    lat: Number(item.lat),
    lng: Number(item.lon),
    inputLabel:
      item.name ||
      item.address?.road ||
      item.address?.city ||
      query,
    displayName: item.display_name || query
  };
}

export async function fetchOsrmRoute(from, to) {
  const url =
    `https://router.project-osrm.org/route/v1/driving/` +
    `${from.lng},${from.lat};${to.lng},${to.lat}` +
    `?overview=full&geometries=geojson&steps=true`;

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error("OSRM kunne ikke kontaktes");
  }

  const data = await response.json();

  if (!data.routes?.length) {
    throw new Error("Ingen rute fundet");
  }

  const route = data.routes[0];

  return {
    geometry: route.geometry.coordinates,
    distance: Number(route.distance || 0),
    duration: Number(route.duration || 0),
    trafficDelay: 0,
    steps: extractOsrmSteps(route)
  };
}

function extractOsrmSteps(route) {
  const steps = [];

  (route.legs || []).forEach(leg => {
    (leg.steps || []).forEach(step => {
      const maneuver = step.maneuver || {};
      const location = maneuver.location;

      if (!Array.isArray(location)) return;

      steps.push({
        distance: Number(step.distance || 0),
        duration: Number(step.duration || 0),
        name: step.name || "",
        geometry: step.geometry?.coordinates || [],
        maneuverType: maneuver.type || "continue",
        maneuverModifier: maneuver.modifier || "",
        location: {
          lng: Number(location[0]),
          lat: Number(location[1])
        },
        roundaboutExit: maneuver.exit || null
      });
    });
  });

  return steps;
}

function setRouteBusy(isBusy) {
  if (els.calcRouteBtn) els.calcRouteBtn.disabled = isBusy;
  if (isBusy && els.startNavBtn) els.startNavBtn.disabled = true;
}

function setRouteReady(isReady) {
  if (els.startNavBtn) els.startNavBtn.disabled = !isReady;
  if (els.openFuelListBtn) els.openFuelListBtn.disabled = !isReady;
}
