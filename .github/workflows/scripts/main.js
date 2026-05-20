import { state } from "./state.js";
import { cacheDom, els } from "./dom.js";
import { initMap, recenterMap } from "./map.js";
import { loadSettings, openSettings, closeSettings, saveSettingsFromControls, renderSettings } from "./settings.js";
import { loadHistory, renderHistory } from "./history.js";
import { runAutocomplete, hideAutocomplete } from "./autocomplete.js";
import { calculateRoute } from "./routing.js";
import { startLiveNavigation, stopLiveNavigation } from "./navigation.js";
import { updateFuelBox, openFuelList, closeFuelList, renderFuelList } from "./fuel.js";
import { setStatus } from "./utils.js";

document.addEventListener("DOMContentLoaded", async () => {
  cacheDom();
  loadSettings();
  loadHistory();
  initMap();
  renderSettings();
  renderHistory();
  updateFuelBox();
  setStatus("GPS: klar", "Navigation: inaktiv", "Kort: klar");

  els.destinationInput.addEventListener("input", () => {
    state.selectedAutocompleteItem = null;
    clearTimeout(state.autocompleteTimer);
    state.autocompleteTimer = setTimeout(runAutocomplete, 220);
  });

  els.calcRouteBtn.addEventListener("click", calculateRoute);
  els.startNavBtn.addEventListener("click", startLiveNavigation);
  els.overlayStopBtn.addEventListener("click", stopLiveNavigation);
  els.centerBtn.addEventListener("click", recenterMap);

  els.settingsBtn.addEventListener("click", openSettings);
  els.closeSettingsBtn.addEventListener("click", closeSettings);
  els.settingsBackdrop.addEventListener("click", closeSettings);
  els.saveSettingsBtn.addEventListener("click", saveSettingsFromControls);

  els.openFuelListBtn.addEventListener("click", openFuelList);
  els.closeFuelListBtn.addEventListener("click", closeFuelList);
  els.fuelListBackdrop.addEventListener("click", closeFuelList);
  els.sortFuelByPriceBtn.addEventListener("click", () => { state.fuelListSort = "price"; renderFuelList(); });
  els.sortFuelByDetourBtn.addEventListener("click", () => { state.fuelListSort = "detour"; renderFuelList(); });

  els.ecoScoreBadge.addEventListener("click", openEcoModal);
  els.closeEcoScoreBtn.addEventListener("click", closeEcoModal);
  els.ecoScoreBackdrop.addEventListener("click", closeEcoModal);

  document.addEventListener("click", e => {
    if (!e.target.closest(".search-card")) hideAutocomplete();
  });
});

function openEcoModal() {
  updateEcoModal();
  els.ecoScoreModal.classList.remove("hidden");
  els.ecoScoreBackdrop.classList.remove("hidden");
}

function closeEcoModal() {
  els.ecoScoreModal.classList.add("hidden");
  els.ecoScoreBackdrop.classList.add("hidden");
}

function avg(sum, count, fallback) {
  return count > 0 ? sum / count : fallback;
}

function updateEcoModal() {
  const eco = state.ecoScore;
  const a = avg(eco.accelerationQualitySum, eco.accelerationEvents, 70);
  const b = avg(eco.brakingQualitySum, eco.brakingEvents, 70);
  const s = avg(eco.steadyQualitySum, eco.steadySamples, 70);
  const total = Math.round(a * 0.3 + b * 0.3 + s * 0.4);

  els.ecoScoreTotalValue.textContent = `${total}/100`;
  els.ecoScoreAccelerationValue.textContent = `${Math.round(a)}/100`;
  els.ecoScoreBrakingValue.textContent = `${Math.round(b)}/100`;
  els.ecoScoreSteadyValue.textContent = `${Math.round(s)}/100`;
  els.ecoScoreComment.textContent =
    total >= 82 ? "Meget økonomisk og stabil kørsel." :
    total >= 70 ? "Generelt rolig og effektiv kørestil." :
    total >= 55 ? "Lidt ujævn kørestil med forbedringspotentiale." :
    "Aggressiv og ineffektiv kørestil.";
}
