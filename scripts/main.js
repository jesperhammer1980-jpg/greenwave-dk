import { state } from "./state.js";

import {
  els,
  cacheDom
} from "./dom.js";

import {
  loadSettings,
  applySettingsToUI,
  saveSettingsFromControls,
  openSettings,
  closeSettings
} from "./settings.js";

import {
  initMap,
  recenterMap
} from "./map.js";

import {
  runAutocomplete,
  hideAutocomplete
} from "./autocomplete.js";

import {
  calculateRoute
} from "./routing.js";

import {
  loadFuelPrices,
  updateFuelBox,
  openFuelList,
  closeFuelList,
  renderFuelList,
  openFuelHistory,
  closeFuelHistory
} from "./fuel.js";

import {
  renderHistory
} from "./history.js";

import {
  startLiveNavigation,
  stopLiveNavigation
} from "./navigation.js";

import {
  setStatus
} from "./utils.js";

document.addEventListener(
  "DOMContentLoaded",
  init
);

async function init() {
  cacheDom();

  loadSettings();

  initMap();

  bindEvents();

  applySettingsToUI();

  renderHistory();

  setStatus(
    "GPS: klar",
    "Navigation: inaktiv",
    "Kort: klar"
  );

  await loadFuelPrices();

  updateFuelBox();
}

function bindEvents() {
  bindSearchEvents();

  bindNavigationEvents();

  bindSettingsEvents();

  bindFuelEvents();

  bindEcoScoreEvents();

  bindGlobalEvents();
}

/* =========================
   SEARCH
========================= */

function bindSearchEvents() {
  els.destinationInput?.addEventListener(
    "input",
    () => {
      state.selectedAutocompleteItem = null;

      clearTimeout(state.autocompleteTimer);

      state.autocompleteTimer =
        setTimeout(
          runAutocomplete,
          250
        );
    }
  );
}

/* =========================
   NAVIGATION
========================= */

function bindNavigationEvents() {
  els.calcRouteBtn?.addEventListener(
    "click",
    calculateRoute
  );

  els.startNavBtn?.addEventListener(
    "click",
    startLiveNavigation
  );

  els.stopNavBtn?.addEventListener(
    "click",
    stopLiveNavigation
  );

  els.overlayStopBtn?.addEventListener(
    "click",
    stopLiveNavigation
  );

  els.centerBtn?.addEventListener(
    "click",
    recenterMap
  );
}

/* =========================
   SETTINGS
========================= */

function bindSettingsEvents() {
  els.settingsBtn?.addEventListener(
    "click",
    openSettings
  );

  els.closeSettingsBtn?.addEventListener(
    "click",
    closeSettings
  );

  els.settingsBackdrop?.addEventListener(
    "click",
    closeSettings
  );

  els.saveSettingsBtn?.addEventListener(
    "click",
    saveSettingsFromControls
  );
}

/* =========================
   FUEL
========================= */

function bindFuelEvents() {
  els.openFuelListBtn?.addEventListener(
    "click",
    openFuelList
  );

  els.closeFuelListBtn?.addEventListener(
    "click",
    closeFuelList
  );

  els.fuelListBackdrop?.addEventListener(
    "click",
    closeFuelList
  );

  els.sortFuelByPriceBtn?.addEventListener(
    "click",
    () => {
      state.fuelListSort = "price";

      renderFuelList();
    }
  );

  els.sortFuelByDetourBtn?.addEventListener(
    "click",
    () => {
      state.fuelListSort = "detour";

      renderFuelList();
    }
  );

  els.fuelHistoryBtn?.addEventListener(
    "click",
    openFuelHistory
  );

  els.closeFuelHistoryBtn?.addEventListener(
    "click",
    closeFuelHistory
  );

  els.fuelHistoryBackdrop?.addEventListener(
    "click",
    closeFuelHistory
  );
}

/* =========================
   ECO SCORE
========================= */

function bindEcoScoreEvents() {
  els.ecoScoreBadge?.addEventListener(
    "click",
    () => {
      if (
        els.ecoScoreModal?.classList.contains("hidden")
      ) {
        openEcoScoreModal();
      } else {
        closeEcoScoreModal();
      }
    }
  );

  els.closeEcoScoreBtn?.addEventListener(
    "click",
    closeEcoScoreModal
  );

  els.ecoScoreBackdrop?.addEventListener(
    "click",
    closeEcoScoreModal
  );
}

export function openEcoScoreModal() {
  updateEcoScoreModal();

  els.ecoScoreModal?.classList.remove("hidden");

  els.ecoScoreBackdrop?.classList.remove("hidden");
}

export function closeEcoScoreModal() {
  els.ecoScoreModal?.classList.add("hidden");

  els.ecoScoreBackdrop?.classList.add("hidden");
}

export function updateEcoScoreModal(summary = null) {
  const eco =
    summary ||
    getEcoSummary();

  if (!eco) {
    return;
  }

  if (els.ecoScoreTotalValue) {
    els.ecoScoreTotalValue.textContent =
      `${eco.total}/100`;
  }

  if (els.ecoScoreAccelerationValue) {
    els.ecoScoreAccelerationValue.textContent =
      `${eco.acceleration}/100`;
  }

  if (els.ecoScoreBrakingValue) {
    els.ecoScoreBrakingValue.textContent =
      `${eco.braking}/100`;
  }

  if (els.ecoScoreSteadyValue) {
    els.ecoScoreSteadyValue.textContent =
      `${eco.steady}/100`;
  }

  if (els.ecoScoreComment) {
    els.ecoScoreComment.textContent =
      getEcoComment(eco.total);
  }
}

function getEcoSummary() {
  const eco = state.ecoScore;

  if (!eco) {
    return null;
  }

  return {
    total:
      Math.round(eco.value || 0),

    acceleration:
      Math.round(
        calculateAverage(
          eco.accelerationQualitySum,
          eco.accelerationEvents,
          70
        )
      ),

    braking:
      Math.round(
        calculateAverage(
          eco.brakingQualitySum,
          eco.brakingEvents,
          70
        )
      ),

    steady:
      Math.round(
        calculateAverage(
          eco.steadyQualitySum,
          eco.steadySamples,
          70
        )
      )
  };
}

function calculateAverage(sum, count, fallback) {
  if (!count || count <= 0) {
    return fallback;
  }

  return sum / count;
}

function getEcoComment(score) {
  if (score >= 92) {
    return "Ekstremt rolig og effektiv kørsel.";
  }

  if (score >= 82) {
    return "Meget økonomisk og stabil kørsel.";
  }

  if (score >= 70) {
    return "Generelt rolig og effektiv kørestil.";
  }

  if (score >= 55) {
    return "Lidt ujævn kørestil med potentiale for forbedring.";
  }

  if (score >= 40) {
    return "Mange hårde accelerationer eller opbremsninger.";
  }

  return "Aggressiv og ineffektiv kørestil.";
}

/* =========================
   GLOBAL
========================= */

function bindGlobalEvents() {
  document.addEventListener(
    "click",
    event => {
      if (
        !event.target.closest(".search-wrap")
      ) {
        hideAutocomplete();
      }
    }
  );

  document.addEventListener(
    "keydown",
    event => {
      if (event.key === "Escape") {
        closeSettings();
        closeFuelList();
        closeFuelHistory();
        closeEcoScoreModal();
      }
    }
  );
}
