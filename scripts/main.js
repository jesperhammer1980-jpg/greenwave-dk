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
  setStatus
} from "./utils.js";

document.addEventListener(
  "DOMContentLoaded",
  init
);

async function init() {
  try {
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

    console.log("GreenWave init OK");
  } catch (error) {
    console.error(
      "INIT FEJL:",
      error
    );
  }
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

      clearTimeout(
        state.autocompleteTimer
      );

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
    async () => {
      try {
        const nav = await import("./navigation.js");

        if (nav.startLiveNavigation) {
          nav.startLiveNavigation();
        }
      } catch (error) {
        console.error(
          "Start navigation fejl",
          error
        );
      }
    }
  );

  els.stopNavBtn?.addEventListener(
    "click",
    async () => {
      try {
        const nav = await import("./navigation.js");

        if (nav.stopLiveNavigation) {
          nav.stopLiveNavigation();
        }
      } catch (error) {
        console.error(
          "Stop navigation fejl",
          error
        );
      }
    }
  );

  els.overlayStopBtn?.addEventListener(
    "click",
    async () => {
      try {
        const nav = await import("./navigation.js");

        if (nav.stopLiveNavigation) {
          nav.stopLiveNavigation();
        }
      } catch (error) {
        console.error(
          "Overlay stop fejl",
          error
        );
      }
    }
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
    async () => {
      try {
        toggleEcoScoreModal();
      } catch (error) {
        console.error(
          "Eco modal fejl",
          error
        );
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

function toggleEcoScoreModal() {
  if (
    els.ecoScoreModal?.classList.contains(
      "hidden"
    )
  ) {
    openEcoScoreModal();
  } else {
    closeEcoScoreModal();
  }
}

function openEcoScoreModal() {
  updateEcoScoreModal();

  els.ecoScoreModal?.classList.remove(
    "hidden"
  );

  els.ecoScoreBackdrop?.classList.remove(
    "hidden"
  );
}

function closeEcoScoreModal() {
  els.ecoScoreModal?.classList.add(
    "hidden"
  );

  els.ecoScoreBackdrop?.classList.add(
    "hidden"
  );
}

function updateEcoScoreModal() {
  const eco = state.ecoScore;

  if (!eco) {
    return;
  }

  const acceleration =
    calculateAverage(
      eco.accelerationQualitySum,
      eco.accelerationEvents,
      70
    );

  const braking =
    calculateAverage(
      eco.brakingQualitySum,
      eco.brakingEvents,
      70
    );

  const steady =
    calculateAverage(
      eco.steadyQualitySum,
      eco.steadySamples,
      70
    );

  const total =
    Math.round(
      acceleration * 0.30 +
      braking * 0.30 +
      steady * 0.40
    );

  if (els.ecoScoreTotalValue) {
    els.ecoScoreTotalValue.textContent =
      `${total}/100`;
  }

  if (els.ecoScoreAccelerationValue) {
    els.ecoScoreAccelerationValue.textContent =
      `${Math.round(acceleration)}/100`;
  }

  if (els.ecoScoreBrakingValue) {
    els.ecoScoreBrakingValue.textContent =
      `${Math.round(braking)}/100`;
  }

  if (els.ecoScoreSteadyValue) {
    els.ecoScoreSteadyValue.textContent =
      `${Math.round(steady)}/100`;
  }

  if (els.ecoScoreComment) {
    els.ecoScoreComment.textContent =
      getEcoComment(total);
  }
}

function calculateAverage(
  sum,
  count,
  fallback
) {
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
        !event.target.closest(
          ".search-wrap"
        )
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
