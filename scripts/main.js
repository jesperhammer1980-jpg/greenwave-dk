import { state } from "./state.js";
import { els, cacheDom } from "./dom.js";
import {
  loadSettings,
  applySettingsToUI,
  saveSettingsFromControls,
  openSettings,
  closeSettings
} from "./settings.js";
import { initMap, recenterMap } from "./map.js";
import { runAutocomplete, hideAutocomplete } from "./autocomplete.js";
import { calculateRoute } from "./routing.js";
import {
  loadFuelPrices,
  updateFuelBox,
  openFuelList,
  closeFuelList,
  renderFuelList,
  openFuelHistory,
  closeFuelHistory
} from "./fuel.js";
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

function byId(id) {
  return document.getElementById(id);
}

function bindEvents() {
  const destinationInput =
    els.destinationInput || byId("destinationInput");

  const calcRouteBtn =
    els.calcRouteBtn || byId("calcRouteBtn");

  const startNavBtn =
    els.startNavBtn || byId("startNavBtn");

  const stopNavBtn =
    els.stopNavBtn || byId("stopNavBtn");

  const centerBtn =
    els.recenterBtn || els.centerBtn || byId("centerBtn");

  const historyBtn =
    els.historyToggleBtn || els.historyBtn || byId("historyBtn");

  const settingsBtn =
    els.openSettingsBtn || els.settingsBtn || byId("settingsBtn");

  const closeSettingsBtn =
    els.closeSettingsBtn || byId("closeSettingsBtn");

  const settingsBackdrop =
    els.settingsBackdrop || byId("settingsBackdrop");

  const saveSettingsBtn =
    els.saveSettingsBtn || byId("saveSettingsBtn");

  const openFuelListBtn =
    els.openFuelListBtn || byId("openFuelListBtn");

  const closeFuelListBtn =
    els.closeFuelListBtn || byId("closeFuelListBtn");

  const fuelListBackdrop =
    els.fuelListBackdrop || byId("fuelListBackdrop");

  const sortFuelByPriceBtn =
    els.sortFuelByPriceBtn || byId("sortFuelByPriceBtn");

  const sortFuelByDetourBtn =
    els.sortFuelByDetourBtn || byId("sortFuelByDetourBtn");

  const openFuelHistoryBtn =
    els.openFuelHistoryBtn || els.fuelHistoryBtn || byId("fuelHistoryBtn");

  const closeFuelHistoryBtn =
    els.closeFuelHistoryBtn || byId("closeFuelHistoryBtn");

  const fuelHistoryBackdrop =
    els.fuelHistoryBackdrop || byId("fuelHistoryBackdrop");

  const overlayStopBtn =
    els.exitNavOverlayBtn || els.overlayStopBtn || byId("overlayStopBtn");

  destinationInput?.addEventListener("input", () => {
    state.selectedAutocompleteItem = null;

    clearTimeout(state.autocompleteTimer);
    state.autocompleteTimer = setTimeout(runAutocomplete, 250);
  });

  calcRouteBtn?.addEventListener("click", calculateRoute);
  startNavBtn?.addEventListener("click", startLiveNavigation);
  stopNavBtn?.addEventListener("click", stopLiveNavigation);
  overlayStopBtn?.addEventListener("click", stopLiveNavigation);

  centerBtn?.addEventListener("click", recenterMap);

  historyBtn?.addEventListener("click", () => {
    els.historyBox?.classList.toggle("hidden");
    hideAutocomplete();
  });

  settingsBtn?.addEventListener("click", openSettings);
  closeSettingsBtn?.addEventListener("click", closeSettings);
  settingsBackdrop?.addEventListener("click", closeSettings);
  saveSettingsBtn?.addEventListener("click", saveSettingsFromControls);

  openFuelListBtn?.addEventListener("click", openFuelList);
  closeFuelListBtn?.addEventListener("click", closeFuelList);
  fuelListBackdrop?.addEventListener("click", closeFuelList);

  sortFuelByPriceBtn?.addEventListener("click", () => {
    state.fuelListSort = "price";
    renderFuelList();
  });

  sortFuelByDetourBtn?.addEventListener("click", () => {
    state.fuelListSort = "detour";
    renderFuelList();
  });

  openFuelHistoryBtn?.addEventListener("click", openFuelHistory);
  closeFuelHistoryBtn?.addEventListener("click", closeFuelHistory);
  fuelHistoryBackdrop?.addEventListener("click", closeFuelHistory);

  document.addEventListener("click", event => {
    if (!event.target.closest(".search-wrap")) {
      hideAutocomplete();
    }
  });
}
