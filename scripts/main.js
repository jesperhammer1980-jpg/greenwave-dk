import { state } from "./state.js";
import { els, cacheDom } from "./dom.js";

document.addEventListener("DOMContentLoaded", init);

async function init() {
  cacheDom();

  await safeCall("./settings.js", "loadSettings");
  await safeCall("./history.js", "loadHistory");
  await safeCall("./map.js", "initMap");

  bindEvents();

  await safeCall("./settings.js", "applySettingsToUI");
  await safeCall("./history.js", "renderHistory");
  await safeCall("./utils.js", "setStatus", "GPS: klar", "Navigation: inaktiv", "Kort: klar");
  await safeCall("./fuel.js", "loadFuelPrices");
  await safeCall("./fuel.js", "updateFuelBox");
}

function bindEvents() {
  els.destinationInput?.addEventListener("input", () => {
    state.selectedAutocompleteItem = null;
    clearTimeout(state.autocompleteTimer);

    state.autocompleteTimer = setTimeout(() => {
      safeCall("./autocomplete.js", "runAutocomplete");
    }, 250);
  });

  els.calcRouteBtn?.addEventListener("click", () => {
    safeCall("./routing.js", "calculateRoute");
  });

  els.startNavBtn?.addEventListener("click", () => {
    safeCall("./navigation.js", "startLiveNavigation");
  });

  els.overlayStopBtn?.addEventListener("click", () => {
    safeCall("./navigation.js", "stopLiveNavigation");
  });

  els.centerBtn?.addEventListener("click", () => {
    safeCall("./map.js", "recenterMap");
  });

  els.settingsBtn?.addEventListener("click", () => {
    safeCall("./settings.js", "openSettings");
  });

  els.closeSettingsBtn?.addEventListener("click", () => {
    safeCall("./settings.js", "closeSettings");
  });

  els.settingsBackdrop?.addEventListener("click", () => {
    safeCall("./settings.js", "closeSettings");
  });

  els.saveSettingsBtn?.addEventListener("click", () => {
    safeCall("./settings.js", "saveSettingsFromControls");
  });

  els.openFuelListBtn?.addEventListener("click", () => {
    safeCall("./fuel.js", "openFuelList");
  });

  els.closeFuelListBtn?.addEventListener("click", () => {
    safeCall("./fuel.js", "closeFuelList");
  });

  els.fuelListBackdrop?.addEventListener("click", () => {
    safeCall("./fuel.js", "closeFuelList");
  });

  els.sortFuelByPriceBtn?.addEventListener("click", () => {
    state.fuelListSort = "price";
    safeCall("./fuel.js", "renderFuelList");
  });

  els.sortFuelByDetourBtn?.addEventListener("click", () => {
    state.fuelListSort = "detour";
    safeCall("./fuel.js", "renderFuelList");
  });

  els.ecoScoreBadge?.addEventListener("click", openEcoModal);
  els.closeEcoScoreBtn?.addEventListener("click", closeEcoModal);
  els.ecoScoreBackdrop?.addEventListener("click", closeEcoModal);

  document.addEventListener("click", event => {
    if (!event.target.closest(".search-card")) {
      safeCall("./autocomplete.js", "hideAutocomplete");
    }
  });
}

function openEcoModal() {
  updateEcoModal();

  els.ecoScoreModal?.classList.remove("hidden");
  els.ecoScoreBackdrop?.classList.remove("hidden");
}

function closeEcoModal() {
  els.ecoScoreModal?.classList.add("hidden");
  els.ecoScoreBackdrop?.classList.add("hidden");
}

function updateEcoModal() {
  const eco = state.ecoScore || {};

  const acceleration = average(eco.accelerationQualitySum, eco.accelerationEvents, 70);
  const braking = average(eco.brakingQualitySum, eco.brakingEvents, 70);
  const steady = average(eco.steadyQualitySum, eco.steadySamples, 70);

  const total = Math.round(acceleration * 0.3 + braking * 0.3 + steady * 0.4);

  if (els.ecoScoreTotalValue) els.ecoScoreTotalValue.textContent = `${total}/100`;
  if (els.ecoScoreAccelerationValue) els.ecoScoreAccelerationValue.textContent = `${Math.round(acceleration)}/100`;
  if (els.ecoScoreBrakingValue) els.ecoScoreBrakingValue.textContent = `${Math.round(braking)}/100`;
  if (els.ecoScoreSteadyValue) els.ecoScoreSteadyValue.textContent = `${Math.round(steady)}/100`;

  if (els.ecoScoreComment) {
    els.ecoScoreComment.textContent =
      total >= 82 ? "Meget økonomisk og stabil kørsel." :
      total >= 70 ? "Generelt rolig og effektiv kørestil." :
      total >= 55 ? "Lidt ujævn kørestil med forbedringspotentiale." :
      "Aggressiv og ineffektiv kørestil.";
  }
}

function average(sum, count, fallback) {
  return count > 0 ? sum / count : fallback;
}

async function safeCall(modulePath, exportName, ...args) {
  try {
    const mod = await import(`${modulePath}?v=${Date.now()}`);

    if (typeof mod[exportName] !== "function") {
      console.warn(`${exportName} findes ikke i ${modulePath}`);
      return null;
    }

    return await mod[exportName](...args);
  } catch (error) {
    console.error(`Fejl i ${modulePath} -> ${exportName}:`, error);
    alert(`Fejl i ${modulePath}\n\n${exportName}\n\n${error.message || error}`);
    return null;
  }
}
