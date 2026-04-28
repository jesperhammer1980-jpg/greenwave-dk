import { state, SETTINGS_KEY } from "./state.js";
import { els } from "./dom.js";
import {
  applyPricesToStations,
  updateFuelBox,
  updateFuelMarkers
} from "./fuel.js";

export function loadSettings() {
  try {
    const saved = JSON.parse(
      localStorage.getItem(SETTINGS_KEY) || "{}"
    );

    state.settings = {
      ...state.settings,
      ...saved
    };
  } catch (error) {
    console.error("Kunne ikke indlæse settings", error);
  }
}

export function saveSettings() {
  localStorage.setItem(
    SETTINGS_KEY,
    JSON.stringify(state.settings)
  );
}

export function applySettingsToUI() {
  if (els.languageDa) {
    els.languageDa.checked =
      state.settings.language === "da";
  }

  if (els.languageEn) {
    els.languageEn.checked =
      state.settings.language === "en";
  }

  if (els.regionDK) {
    els.regionDK.checked =
      state.settings.region === "dk";
  }

  if (els.regionUS) {
    els.regionUS.checked =
      state.settings.region === "us";
  }

  if (els.settingsRouteFast) {
    els.settingsRouteFast.checked =
      state.settings.routeMode === "fast";
  }

  if (els.settingsRouteEco) {
    els.settingsRouteEco.checked =
      state.settings.routeMode === "eco";
  }

  if (els.settingsFuelType) {
    els.settingsFuelType.value =
      state.settings.fuelType;
  }

  if (els.settingsSearchRadius) {
    els.settingsSearchRadius.value =
      String(state.settings.searchRadiusBase);
  }
}

export function saveSettingsFromControls() {
  state.settings.language =
    els.languageEn?.checked ? "en" : "da";

  state.settings.region =
    els.regionUS?.checked ? "us" : "dk";

  state.settings.routeMode =
    els.settingsRouteEco?.checked ? "eco" : "fast";

  state.settings.fuelType =
    els.settingsFuelType?.value || "benzin95";

  state.settings.searchRadiusBase = Number(
    els.settingsSearchRadius?.value || 100000
  );

  saveSettings();

  closeSettings();

  if (state.routeData) {
    applyPricesToStations();
    updateFuelBox();
    updateFuelMarkers();
  }
}

export function openSettings() {
  els.settingsPanel?.classList.remove("hidden");
  els.settingsBackdrop?.classList.remove("hidden");
}

export function closeSettings() {
  els.settingsPanel?.classList.add("hidden");
  els.settingsBackdrop?.classList.add("hidden");
}
