import {state} from "./state.js";
import {cacheDom,els} from "./dom.js";
import {initMap,recenterMap} from "./map.js";
import {loadSettings,openSettings,closeSettings,saveSettingsFromControls,renderSettings} from "./settings.js";
import {loadHistory,renderHistory} from "./history.js";
import {runAutocomplete,hideAutocomplete} from "./autocomplete.js";
import {calculateRoute} from "./routing.js";
import {startLiveNavigation,stopLiveNavigation} from "./navigation.js";
import {updateFuelBox,openFuelList,closeFuelList,renderFuelList} from "./fuel.js";

window.addEventListener("error", event => {
  console.error("GreenWave runtime error", event.error || event.message);
});

window.addEventListener("unhandledrejection", event => {
  console.error("GreenWave promise error", event.reason);
});

document.addEventListener("DOMContentLoaded", () => {
  try {
    cacheDom();
    loadSettings();
    loadHistory();
    initMap();
    renderSettings();
    renderHistory();
    updateFuelBox();
    bind();
  } catch (error) {
    console.error("GreenWave startup failed", error);
    showFatalError(error);
  }
});

function bind() {
  on(els.destinationInput, "input", () => {
    state.selectedAutocompleteItem = null;
    clearTimeout(state.autocompleteTimer);
    state.autocompleteTimer = setTimeout(runAutocomplete, 220);
  });

  on(els.calcRouteBtn, "click", async () => {
    await calculateRoute();
  });

  on(els.startNavBtn, "click", startLiveNavigation);
  on(els.overlayStopBtn, "click", stopLiveNavigation);
  on(els.centerBtn, "click", recenterMap);

  on(els.settingsBtn, "click", openSettings);
  on(els.closeSettingsBtn, "click", closeSettings);
  on(els.settingsBackdrop, "click", closeSettings);
  on(els.saveSettingsBtn, "click", saveSettingsFromControls);

  on(els.openFuelListBtn, "click", openFuelList);
  on(els.closeFuelListBtn, "click", closeFuelList);
  on(els.fuelListBackdrop, "click", closeFuelList);

  on(els.sortFuelByPriceBtn, "click", () => {
    state.fuelListSort = "route";
    renderFuelList();
  });

  on(els.sortFuelByDetourBtn, "click", () => {
    state.fuelListSort = "detour";
    renderFuelList();
  });

  on(els.ecoScoreBadge, "click", openEcoModal);
  on(els.closeEcoScoreBtn, "click", closeEcoModal);
  on(els.ecoScoreBackdrop, "click", closeEcoModal);

  document.addEventListener("click", event => {
    if (
      !event.target.closest(".search-card") &&
      !event.target.closest(".autocomplete-results")
    ) {
      hideAutocomplete();
    }
  });
}

function on(element, eventName, handler) {
  if (!element) {
    console.warn("Missing DOM element for event", eventName);
    return;
  }

  element.addEventListener(eventName, handler);
}

function openEcoModal() {
  updateEcoModal();
  els.ecoScoreModal.classList.remove("hidden");
  els.ecoScoreBackdrop.classList.remove("hidden");
}

function closeEcoModal() {
  els.ecoScoreModal.classList.add("hidden");
  els.ecoScoreBackdrop.classList.add("hidden");
}

function updateEcoModal() {
  const eco = state.ecoScore;
  const acceleration = average(eco.accelerationQualitySum, eco.accelerationEvents, 70);
  const braking = average(eco.brakingQualitySum, eco.brakingEvents, 70);
  const steady = average(eco.steadyQualitySum, eco.steadySamples, 65);
  const total = eco.currentScore || Math.round(acceleration * 0.28 + braking * 0.28 + steady * 0.44);
  const km = ((eco.totalMeters || eco.measuredMeters || 0) / 1000).toFixed(1).replace(".", ",");

  if (els.ecoLiveSpeed) els.ecoLiveSpeed.textContent = Math.round(state.currentPosition?.speed || 0);
  if (els.ecoScoreTotalValue) els.ecoScoreTotalValue.textContent = `${total}/100`;
  if (els.ecoScoreAccelerationValue) els.ecoScoreAccelerationValue.textContent = `${Math.round(acceleration)}/100`;
  if (els.ecoScoreBrakingValue) els.ecoScoreBrakingValue.textContent = `${Math.round(braking)}/100`;
  if (els.ecoScoreSteadyValue) els.ecoScoreSteadyValue.textContent = `${Math.round(steady)}/100`;

  setRating(els.ecoAccelerationStatus, eco.lastAccelerationLabel || "—", eco.lastAccelerationClass || "rating-neutral");
  setRating(els.ecoBrakingStatus, eco.lastBrakingLabel || "—", eco.lastBrakingClass || "rating-neutral");
  setRating(els.ecoMeasuredDistance, `${km} km målt`, eco.lastSteadyClass || "rating-neutral");

  if (els.ecoAccelerationBarNeedle) els.ecoAccelerationBarNeedle.style.left = `${eco.lastAccelerationBalance ?? 50}%`;
  if (els.ecoBrakingBarNeedle) els.ecoBrakingBarNeedle.style.left = `${eco.lastBrakingBalance ?? 50}%`;

  if (els.ecoScoreComment) {
    els.ecoScoreComment.textContent =
      (total >= 82 ? "Meget økonomisk og stabil kørsel." :
       total >= 70 ? "Generelt rolig og effektiv kørestil." :
       total >= 55 ? "Forbedringspotentiale." :
       "Ujævn kørestil.") +
      ` Måling: ${km} km.`;
  }
}

function setRating(element, text, className) {
  if (!element) return;
  element.textContent = text;
  element.className = `rating-pill ${className}`;
}

function average(sum, count, fallback) {
  return count > 0 ? sum / count : fallback;
}

function showFatalError(error) {
  const box = document.createElement("div");
  box.style.cssText = `
    position:fixed;left:16px;right:16px;bottom:16px;z-index:99999;
    background:#230b0b;color:#fff;border:1px solid #ff5f5f;border-radius:18px;
    padding:16px;font-family:system-ui;box-shadow:0 20px 60px rgba(0,0,0,.45)
  `;
  box.innerHTML = `<strong>GreenWave fejl</strong><br>${String(error?.message || error || "Ukendt fejl")}`;
  document.body.appendChild(box);
}
