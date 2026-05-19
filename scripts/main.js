import { state } from "./state.js";
import { els, cacheDom } from "./dom.js";

document.addEventListener(
  "DOMContentLoaded",
  init
);

async function init() {
  try {
    cacheDom();

    bindEvents();

    await safeCall(
      "./settings.js",
      "loadSettings"
    );

    await safeCall(
      "./map.js",
      "initMap"
    );

    await safeCall(
      "./settings.js",
      "applySettingsToUI"
    );

    await safeCall(
      "./history.js",
      "renderHistory"
    );

    await safeCall(
      "./utils.js",
      "setStatus",
      "GPS: klar",
      "Navigation: inaktiv",
      "Kort: klar"
    );

    await safeCall(
      "./fuel.js",
      "loadFuelPrices"
    );

    await safeCall(
      "./fuel.js",
      "updateFuelBox"
    );

    console.log(
      "GreenWave main.js v80 loaded"
    );
  } catch (error) {
    console.error(
      "GreenWave init fejl",
      error
    );

    alert(
      "GreenWave kunne ikke starte:\n\n" +
      (error.message || error)
    );
  }
}

/* =========================
   EVENTS
========================= */

function bindEvents() {
  bindSearchEvents();
  bindRouteEvents();
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
          async () => {
            await safeCall(
              "./autocomplete.js",
              "runAutocomplete"
            );
          },
          250
        );
    }
  );
}

/* =========================
   ROUTE
========================= */

function bindRouteEvents() {
  els.calcRouteBtn?.addEventListener(
    "click",
    async () => {
      await safeCall(
        "./routing.js",
        "calculateRoute"
      );
    }
  );

  els.centerBtn?.addEventListener(
    "click",
    async () => {
      await safeCall(
        "./map.js",
        "recenterMap"
      );
    }
  );
}

/* =========================
   NAVIGATION
========================= */

function bindNavigationEvents() {
  els.startNavBtn?.addEventListener(
    "click",
    async () => {
      if (!state.routeData) {
        alert(
          "Beregn en rute først."
        );
        return;
      }

      await safeCall(
        "./navigation.js",
        "startLiveNavigation"
      );
    }
  );

  els.stopNavBtn?.addEventListener(
    "click",
    async () => {
      await safeCall(
        "./navigation.js",
        "stopLiveNavigation"
      );
    }
  );

  els.overlayStopBtn?.addEventListener(
    "click",
    async () => {
      await safeCall(
        "./navigation.js",
        "stopLiveNavigation"
      );
    }
  );
}

/* =========================
   SETTINGS
========================= */

function bindSettingsEvents() {
  els.settingsBtn?.addEventListener(
    "click",
    async () => {
      await safeCall(
        "./settings.js",
        "openSettings"
      );
    }
  );

  els.closeSettingsBtn?.addEventListener(
    "click",
    async () => {
      await safeCall(
        "./settings.js",
        "closeSettings"
      );
    }
  );

  els.settingsBackdrop?.addEventListener(
    "click",
    async () => {
      await safeCall(
        "./settings.js",
        "closeSettings"
      );
    }
  );

  els.saveSettingsBtn?.addEventListener(
    "click",
    async () => {
      await safeCall(
        "./settings.js",
        "saveSettingsFromControls"
      );
    }
  );
}

/* =========================
   FUEL
========================= */

function bindFuelEvents() {
  els.openFuelListBtn?.addEventListener(
    "click",
    async () => {
      await safeCall(
        "./fuel.js",
        "openFuelList"
      );
    }
  );

  els.closeFuelListBtn?.addEventListener(
    "click",
    async () => {
      await safeCall(
        "./fuel.js",
        "closeFuelList"
      );
    }
  );

  els.fuelListBackdrop?.addEventListener(
    "click",
    async () => {
      await safeCall(
        "./fuel.js",
        "closeFuelList"
      );
    }
  );

  els.sortFuelByPriceBtn?.addEventListener(
    "click",
    async () => {
      state.fuelListSort = "price";

      await safeCall(
        "./fuel.js",
        "renderFuelList"
      );
    }
  );

  els.sortFuelByDetourBtn?.addEventListener(
    "click",
    async () => {
      state.fuelListSort = "detour";

      await safeCall(
        "./fuel.js",
        "renderFuelList"
      );
    }
  );

  els.fuelHistoryBtn?.addEventListener(
    "click",
    async () => {
      await safeCall(
        "./fuel.js",
        "openFuelHistory"
      );
    }
  );

  els.closeFuelHistoryBtn?.addEventListener(
    "click",
    async () => {
      await safeCall(
        "./fuel.js",
        "closeFuelHistory"
      );
    }
  );

  els.fuelHistoryBackdrop?.addEventListener(
    "click",
    async () => {
      await safeCall(
        "./fuel.js",
        "closeFuelHistory"
      );
    }
  );
}

/* =========================
   ECO SCORE
========================= */

function bindEcoScoreEvents() {
  els.ecoScoreBadge?.addEventListener(
    "click",
    () => {
      openEcoScoreModal();
    }
  );

  els.closeEcoScoreBtn?.addEventListener(
    "click",
    () => {
      closeEcoScoreModal();
    }
  );

  els.ecoScoreBackdrop?.addEventListener(
    "click",
    () => {
      closeEcoScoreModal();
    }
  );
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
  const eco =
    state.ecoScore || {};

  const acceleration =
    average(
      eco.accelerationQualitySum,
      eco.accelerationEvents,
      70
    );

  const braking =
    average(
      eco.brakingQualitySum,
      eco.brakingEvents,
      70
    );

  const steady =
    average(
      eco.steadyQualitySum,
      eco.steadySamples,
      70
    );

  const total =
    Math.round(
      acceleration * 0.3 +
      braking * 0.3 +
      steady * 0.4
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

function average(
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
    async event => {
      if (
        !event.target.closest(
          ".search-wrap"
        )
      ) {
        await safeCall(
          "./autocomplete.js",
          "hideAutocomplete"
        );
      }
    }
  );

  document.addEventListener(
    "keydown",
    async event => {
      if (event.key !== "Escape") {
        return;
      }

      await safeCall(
        "./settings.js",
        "closeSettings"
      );

      await safeCall(
        "./fuel.js",
        "closeFuelList"
      );

      await safeCall(
        "./fuel.js",
        "closeFuelHistory"
      );

      closeEcoScoreModal();
    }
  );
}

/* =========================
   SAFE IMPORT CALL
========================= */

async function safeCall(
  modulePath,
  exportName,
  ...args
) {
  try {
    const module =
      await import(
        `${modulePath}?v=${Date.now()}`
      );

    if (
      typeof module[exportName] !== "function"
    ) {
      console.warn(
        `${exportName} findes ikke i ${modulePath}`
      );

      return null;
    }

    return await module[exportName](
      ...args
    );
  } catch (error) {
    console.error(
      `Fejl i ${modulePath} -> ${exportName}:`,
      error
    );

    alert(
      `Fejl i ${modulePath}\n\n` +
      `${exportName}\n\n` +
      `${error.message || error}`
    );

    return null;
  }
}
