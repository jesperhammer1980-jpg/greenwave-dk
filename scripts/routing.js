import { state } from "./state.js";
import { els } from "./dom.js";
import { getPosition, setStatus } from "./utils.js";
import { drawRoute, updateUserMarker, updateDestinationMarker } from "./map.js";
import { saveHistory, renderHistory } from "./history.js";
import { loadFuelStations, computeRouteDistances, applyPricesToStations, updateFuelBox, updateFuelMarkers } from "./fuel.js";
import { prepareRouteSteps } from "./route-progress.js";

export async function calculateRoute() {
  const input = els.destinationInput.value.trim();
  if (!input) {
    alert("Indtast en destination først.");
    return;
  }

  try {
    setStatus("GPS: henter", "Navigation: beregner", "Kort: beregner");
    els.calcRouteBtn.disabled = true;
    els.startNavBtn.disabled = true;

    state.currentPosition = await getPosition();
    updateUserMarker(state.currentPosition.lat, state.currentPosition.lng);

    state.destination = state.selectedAutocompleteItem || await geocode(input);
    updateDestinationMarker(state.destination.lat, state.destination.lng);

    const route = await fetchOsrmRoute(state.currentPosition, state.destination);
    state.routeData = route;
    state.routeSteps = route.steps;
    state.currentStepIndex = 0;

    drawRoute(route.geometry);
    prepareRouteSteps();

    saveHistory(state.destination);
    renderHistory();

    await loadFuelStations(route.geometry);
    computeRouteDistances();
    applyPricesToStations();
    updateFuelBox();
    updateFuelMarkers();

    els.startNavBtn.disabled = false;
    els.openFuelListBtn.disabled = false;
    setStatus("GPS: klar", "Navigation: rute klar", "Kort: klar");
  } catch (error) {
    console.error(error);
    alert("Kunne ikke beregne rute:\n\n" + (error.message || error));
    setStatus("GPS: fejl", "Navigation: fejl", "Kort: fejl");
  } finally {
    els.calcRouteBtn.disabled = false;
  }
}

export async function recalculateRouteFromCurrentPosition(position) {
  if (!state.destination) return;
  const route = await fetchOsrmRoute(position, state.destination);
  state.routeData = route;
  state.routeSteps = route.steps;
  drawRoute(route.geometry);
  prepareRouteSteps();
}

async function geocode(query) {
  const country = state.settings.region === "us" ? "us" : "dk";
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&addressdetails=1&countrycodes=${country}&q=${encodeURIComponent(query)}`;
  const res = await fetch(url);
  const data = await res.json();

  if (!Array.isArray(data) || !data.length) {
    throw new Error("Destination ikke fundet.");
  }

  const item = data[0];
  return {
    lat: Number(item.lat),
    lng: Number(item.lon),
    inputLabel: item.name || item.address?.road || query,
    displayName: item.display_name || query
  };
}

async function fetchOsrmRoute(from, to) {
  const url = `https://router.project-osrm.org/route/v1/driving/${from.lng},${from.lat};${to.lng},${to.lat}?overview=full&geometries=geojson&steps=true`;
  const res = await fetch(url);
  const data = await res.json();

  if (!data.routes?.length) throw new Error("Ingen rute fundet.");

  const route = data.routes[0];

  return {
    geometry: route.geometry.coordinates,
    distance: Number(route.distance || 0),
    duration: Number(route.duration || 0),
    steps: extractSteps(route)
  };
}

function extractSteps(route) {
  const steps = [];
  (route.legs || []).forEach(leg => {
    (leg.steps || []).forEach(step => {
      const maneuver = step.maneuver || {};
      steps.push({
        distance: Number(step.distance || 0),
        duration: Number(step.duration || 0),
        name: step.name || "",
        maneuverType: maneuver.type || "continue",
        maneuverModifier: maneuver.modifier || "",
        location: maneuver.location
      });
    });
  });
  return steps;
}
