import { state } from "./state.js";
import { els, cacheDom } from "./dom.js";
import { loadSettings, applySettingsToUI, saveSettingsFromControls, openSettings, closeSettings } from "./settings.js";
import { initMap, recenterMap } from "./map.js";
import { runAutocomplete, hideAutocomplete } from "./autocomplete.js";
import { calculateRoute } from "./routing.js";
import { loadFuelPrices, updateFuelBox, openFuelList, closeFuelList, renderFuelList, openFuelHistory, closeFuelHistory } from "./fuel.js";
import { renderHistory } from "./history.js";
import { startLiveNavigation, stopLiveNavigation } from "./navigation.js";
import { setStatus } from "./utils.js";

document.addEventListener("DOMContentLoaded", init);

async function init() {
  cacheDom();

  loadSettings();
  initMap();
  bindEvents();
  applySettingsToUI();
  renderHistory();

  setStatus("GPS: klar", "Navigation: inaktiv", "Kort: klar");

  await loadFuelPrices();
  updateFuelBox();
}

function bindEvents() {
  els.destinationInput?.addEventListener("input", () => {
    state.selectedAutocompleteItem = null;

    clearTimeout(state.autocompleteTimer);
    state.autocompleteTimer = setTimeout(runAutocomplete, 250);
  });

  els.calcRouteBtn?.addEventListener("click", calculateRoute);
  els.startNavBtn?.addEventListener("click", startLiveNavigation);
  els.stopNavBtn?.addEventListener("click", stopLiveNavigation);
  els.recenterBtn?.addEventListener("click", recenterMap);

  els.historyToggleBtn?.addEventListener("click", () => {
    els.historyBox?.classList.toggle("hidden");
    hideAutocomplete();
  });

  els.openSettingsBtn?.addEventListener("click", openSettings);
  els.closeSettingsBtn?.addEventListener("click", closeSettings);
  els.settingsBackdrop?.addEventListener("click", closeSettings);
  els.saveSettingsBtn?.addEventListener("click", saveSettingsFromControls);

  els.openFuelListBtn?.addEventListener("click", openFuelList);
  els.closeFuelListBtn?.addEventListener("click", closeFuelList);
  els.fuelListBackdrop?.addEventListener("click", closeFuelList);

  els.sortFuelByPriceBtn?.addEventListener("click", () => {
    state.fuelListSort = "price";
    renderFuelList();
  });

  els.sortFuelByDetourBtn?.addEventListener("click", () => {
    state.fuelListSort = "detour";
    renderFuelList();
  });

  els.openFuelHistoryBtn?.addEventListener("click", openFuelHistory);
  els.closeFuelHistoryBtn?.addEventListener("click", closeFuelHistory);
  els.fuelHistoryBackdrop?.addEventListener("click", closeFuelHistory);

  els.exitNavOverlayBtn?.addEventListener("click", stopLiveNavigation);

  document.addEventListener("click", event => {
    if (!event.target.closest(".search-wrap")) {
      hideAutocomplete();
    }
  });
}
