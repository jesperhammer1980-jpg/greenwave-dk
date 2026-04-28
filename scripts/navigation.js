import { state } from "./state.js";
import { els } from "./dom.js";

import {
  formatDistance,
  setStatus,
  haversine
} from "./utils.js";

import {
  updateUserMarker,
  recenterMap
} from "./map.js";

import {
  getGreenWaveRecommendation
} from "./greenwave.js";

export function startLiveNavigation() {
  if (!state.routeData || !state.destination) {
    return;
  }

  state.isNavigating = true;

  document.body.classList.add("navigation-active");
  els.navOverlay?.classList.remove("hidden");

  if (els.startNavBtn) {
    els.startNavBtn.disabled = true;
  }

  if (els.stopNavBtn) {
    els.stopNavBtn.disabled = false;
  }

  setStatus(
    "GPS: live",
    "Navigation: live",
    "Kort: følger position"
  );

  if (state.watchId !== null) {
    navigator.geolocation.clearWatch(state.watchId);
    state.watchId = null;
  }

  state.watchId = navigator.geolocation.watchPosition(
    handleNavigationPosition,
    handleNavigationError,
    {
      enableHighAccuracy: true,
      maximumAge: 500,
      timeout: 15000
    }
  );
}

export function stopLiveNavigation() {
  state.isNavigating = false;

  if (state.watchId !== null) {
    navigator.geolocation.clearWatch(state.watchId);
    state.watchId = null;
  }

  document.body.classList.remove("navigation-active");
  els.navOverlay?.classList.add("hidden");

  if (els.startNavBtn) {
    els.startNavBtn.disabled = !state.routeData;
  }

  if (els.stopNavBtn) {
    els.stopNavBtn.disabled = true;
  }

  setStatus(
    "GPS: klar",
    "Navigation: inaktiv",
    "Kort: klar"
  );

  recenterMap();
}

function handleNavigationPosition(position) {
  const current = {
    lat: position.coords.latitude,
    lng: position.coords.longitude,
    speed: position.coords.speed,
    heading: position.coords.heading,
    accuracy: position.coords.accuracy
  };

  state.currentPosition = current;

  updateUserMarker(current.lat, current.lng);
  updateNavigationStats(current);
  followCurrentPosition(current);
}

function handleNavigationError(error) {
  console.error("Navigation GPS fejl", error);

  setStatus(
    "GPS: fejl",
    "Navigation: live",
    "Kort: GPS fejl"
  );
}

function updateNavigationStats(current) {
  const speedKmh = getCurrentSpeedKmh(current);

  if (els.driveCurrentValue) {
    els.driveCurrentValue.textContent = `${speedKmh} km/t`;
  }

  updateRemainingTripStats(current, speedKmh);
  updateGreenWaveBanner(current);
}

function updateRemainingTripStats(current, speedKmh) {
  if (!state.destination || !els.driveRemainingDistance) {
    return;
  }

  const remainingMeters = haversine(
    current.lat,
    current.lng,
    state.destination.lat,
    state.destination.lng
  );

  els.driveRemainingDistance.textContent =
    formatDistance(remainingMeters);

  if (els.driveRemainingTime) {
    const estimatedSeconds = estimateRemainingSeconds(
      remainingMeters,
      speedKmh
    );

    els.driveRemainingTime.textContent =
      formatDuration(estimatedSeconds);
  }
}

function updateGreenWaveBanner(current) {
  const recommendation =
    getGreenWaveRecommendation(current);

  if (els.navBannerMain) {
    els.navBannerMain.textContent =
      `Anbefalet fart: ${recommendation.speedKmh} km/t`;
  }

  if (els.navBannerSub) {
    if (recommendation.distanceToSignal !== null) {
      els.navBannerSub.textContent =
        `Næste trafiklys: ${formatDistance(recommendation.distanceToSignal)} · ${recommendation.message}`;
    } else {
      els.navBannerSub.textContent =
        recommendation.message;
    }
  }
}

function followCurrentPosition(current) {
  if (!state.map || !state.isNavigating) {
    return;
  }

  const zoom = Math.max(state.map.getZoom(), 17);

  state.map.setView(
    [current.lat, current.lng],
    zoom,
    {
      animate: true,
      duration: 0.4
    }
  );

  /*
    Navigation offset:
    Leaflet centrerer normalt positionen midt på skærmen.
    Her flyttes kortet lidt, så bilen ligger lavere på skærmen,
    og brugeren kan se mere vej foran sig.
  */
  window.requestAnimationFrame(() => {
    if (!state.map || !state.isNavigating) {
      return;
    }

    state.map.panBy(
      [0, 120],
      {
        animate: true,
        duration: 0.25
      }
    );
  });
}

function getCurrentSpeedKmh(current) {
  if (
    typeof current.speed === "number" &&
    Number.isFinite(current.speed)
  ) {
    return Math.max(0, Math.round(current.speed * 3.6));
  }

  return 0;
}

function estimateRemainingSeconds(distanceMeters, speedKmh) {
  if (!Number.isFinite(distanceMeters)) {
    return null;
  }

  const fallbackSpeedKmh = 70;
  const safeSpeedKmh =
    speedKmh > 5 ? speedKmh : fallbackSpeedKmh;

  return Math.round(
    distanceMeters / (safeSpeedKmh * 1000 / 3600)
  );
}

function formatDuration(seconds) {
  if (!Number.isFinite(seconds)) {
    return "—";
  }

  const minutes = Math.max(1, Math.round(seconds / 60));

  if (minutes < 60) {
    return `${minutes} min`;
  }

  const hours = Math.floor(minutes / 60);
  const restMinutes = minutes % 60;

  if (restMinutes === 0) {
    return `${hours} t`;
  }

  return `${hours} t ${restMinutes} min`;
}
