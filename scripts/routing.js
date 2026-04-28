import { state } from "./state.js";
import { els } from "./dom.js";

import {
  getPosition,
  setStatus
} from "./utils.js";

import {
  drawRoute,
  updateUserMarker,
  updateDestinationMarker
} from "./map.js";

import {
  loadFuelStations,
  computeRouteDistances,
  applyPricesToStations,
  updateFuelBox,
  updateFuelMarkers
} from "./fuel.js";

import {
  loadTrafficSignals
} from "./greenwave.js";

import {
  saveHistory,
  renderHistory
} from "./history.js";

export async function calculateRoute() {
  const input = els.destinationInput?.value.trim();

  if (!input) {
    alert("Indtast en destination først.");
    return;
  }

  try {
    setRouteBusy(true);

    setStatus(
      "GPS: henter position",
      "Navigation: beregner",
      "Kort: beregner"
    );

    state.currentPosition = await getPosition();

    updateUserMarker(
      state.currentPosition.lat,
      state.currentPosition.lng
    );

    state.destination =
      state.selectedAutocompleteItem || await geocode(input);

    updateDestinationMarker(
      state.destination.lat,
      state.destination.lng
    );

    const route = await fetchRoute(
      state.currentPosition,
      state.destination
    );

    state.routeData = route;
    state.routeSteps = route.steps;
    state.currentStepIndex = 0;

    drawRoute(state.routeData.geometry);

    saveHistory(state.destination);
    renderHistory();

    await Promise.allSettled([
      loadFuelStations(state.routeData.geometry),
      loadTrafficSignals(state.routeData.geometry)
    ]);

    computeRouteDistances();
    applyPricesToStations();

    updateFuelBox();
    updateFuelMarkers();

    setRouteReady(true);

    setStatus(
      "GPS: klar",
      "Navigation: rute klar",
      "Kort: klar"
    );
  } catch (error) {
    console.error("Rutefejl", error);

    setRouteReady(false);

    alert(
      "Kunne ikke beregne rute: " +
      (error.message || error)
    );

    setStatus(
      "GPS: fejl",
      "Navigation: fejl",
      "Kort: fejl"
    );
  } finally {
    setRouteBusy(false);
  }
}

function setRouteBusy(isBusy) {
  if (els.calcRouteBtn) {
    els.calcRouteBtn.disabled = isBusy;
  }

  if (isBusy) {
    if (els.startNavBtn) {
      els.startNavBtn.disabled = true;
    }

    if (els.openFuelListBtn) {
      els.openFuelListBtn.disabled = true;
    }
  }
}

function setRouteReady(isReady) {
  if (els.startNavBtn) {
    els.startNavBtn.disabled = !isReady;
  }

  if (els.openFuelListBtn) {
    els.openFuelListBtn.disabled = !isReady;
  }
}

export async function geocode(query) {
  const country =
    state.settings.region === "us" ? "us" : "dk";

  const url =
    `https://nominatim.openstreetmap.org/search` +
    `?format=jsonv2` +
    `&limit=1` +
    `&addressdetails=1` +
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
    displayName: item.display_name || query,
    inputLabel:
      item.name ||
      item.address?.road ||
      item.address?.city ||
      item.address?.town ||
      query
  };
}

export async function fetchRoute(from, to) {
  if (!from || !to) {
    throw new Error("Mangler start eller destination");
  }

  const url =
    `https://router.project-osrm.org/route/v1/driving/` +
    `${from.lng},${from.lat};${to.lng},${to.lat}` +
    `?overview=full` +
    `&geometries=geojson` +
    `&steps=true`;

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error("OSRM kunne ikke kontaktes");
  }

  const data = await response.json();

  if (!data.routes?.length) {
    throw new Error("Ingen rute fundet");
  }

  const route = data.routes[0];

  const steps = extractRouteSteps(route);

  return {
    geometry: route.geometry.coordinates,
    distance: route.distance,
    duration: route.duration,
    steps
  };
}

function extractRouteSteps(route) {
  const steps = [];

  const legs = Array.isArray(route.legs)
    ? route.legs
    : [];

  legs.forEach(leg => {
    const legSteps = Array.isArray(leg.steps)
      ? leg.steps
      : [];

    legSteps.forEach(step => {
      const maneuver = step.maneuver || {};

      const location = Array.isArray(maneuver.location)
        ? maneuver.location
        : null;

      if (!location) {
        return;
      }

      steps.push({
        distance: Number(step.distance || 0),
        duration: Number(step.duration || 0),
        name: step.name || "",
        mode: step.mode || "driving",
        geometry: step.geometry?.coordinates || [],
        maneuverType: maneuver.type || "continue",
        maneuverModifier: maneuver.modifier || "",
        location: {
          lng: Number(location[0]),
          lat: Number(location[1])
        }
      });
    });
  });

  return steps;
}
