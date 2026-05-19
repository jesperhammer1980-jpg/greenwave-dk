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
    console.error("Settings load fejl", error);
  }
}

export function saveSettings() {
  localStorage.setItem(
    SETTINGS_KEY,
    JSON.stringify(state.settings)
  );
}

export function applySettingsToUI() {
  renderSettingsBody();
  syncSettingsControls();
}

export function openSettings() {
  renderSettingsBody();
  syncSettingsControls();

  els.settingsPanel?.classList.remove("hidden");
  els.settingsBackdrop?.classList.remove("hidden");
}

export function closeSettings() {
  els.settingsPanel?.classList.add("hidden");
  els.settingsBackdrop?.classList.add("hidden");
}

export function saveSettingsFromControls() {
  state.settings.region =
    getControl("regionUS")?.checked ? "us" : "dk";

  state.settings.routeMode =
    getControl("settingsRouteEco")?.checked ? "eco" : "fast";

  state.settings.fuelType =
    getControl("settingsFuelType")?.value || "benzin95";

  state.settings.searchRadiusBase =
    Number(getControl("settingsSearchRadius")?.value || 100000);

  state.settings.favoriteFuelBrand =
    getControl("settingsFavoriteFuelBrand")?.value || "all";

  state.settings.favoriteFuelMode =
    getControl("settingsFavoriteFuelMode")?.value || "boost";

  state.settings.mapStyleMode =
    getControl("settingsMapStyleMode")?.value || "navigation";

  state.settings.ecoScoreEnabled =
    getControl("settingsEcoScoreEnabled")?.checked !== false;

  state.settings.autoRerouteEnabled =
    getControl("settingsAutoRerouteEnabled")?.checked !== false;

  state.settings.dynamicZoomEnabled =
    getControl("settingsDynamicZoomEnabled")?.checked !== false;

  state.settings.smoothCameraEnabled =
    getControl("settingsSmoothCameraEnabled")?.checked !== false;

  state.settings.laneGuidanceEnabled =
    getControl("settingsLaneGuidanceEnabled")?.checked !== false;

  state.settings.greenWaveEnabled =
    getControl("settingsGreenWaveEnabled")?.checked !== false;

  saveSettings();
  closeSettings();

  if (state.routeData) {
    try {
      applyPricesToStations();
      updateFuelBox();
      updateFuelMarkers();
    } catch (error) {
      console.warn("Settings refresh fejl", error);
    }
  }
}

function renderSettingsBody() {
  if (!els.settingsBody) {
    return;
  }

  els.settingsBody.innerHTML = `
    <div class="settings-section">
      <h3>Område</h3>

      <label class="settings-option">
        <input id="regionDK" type="radio" name="region">
        <span>Danmark</span>
      </label>

      <label class="settings-option">
        <input id="regionUS" type="radio" name="region">
        <span>USA</span>
      </label>
    </div>

    <div class="settings-section">
      <h3>Rute</h3>

      <label class="settings-option">
        <input id="settingsRouteFast" type="radio" name="routeMode">
        <span>Hurtigste rute</span>
      </label>

      <label class="settings-option">
        <input id="settingsRouteEco" type="radio" name="routeMode">
        <span>Økonomisk rute</span>
      </label>
    </div>

    <div class="settings-section">
      <h3>Navigation</h3>

      <label class="settings-option">
        <input id="settingsAutoRerouteEnabled" type="checkbox">
        <span>Automatisk omdirigering</span>
      </label>

      <label class="settings-option">
        <input id="settingsDynamicZoomEnabled" type="checkbox">
        <span>Dynamisk zoom</span>
      </label>

      <label class="settings-option">
        <input id="settingsSmoothCameraEnabled" type="checkbox">
        <span>Flydende kamera</span>
      </label>

      <label class="settings-option">
        <input id="settingsLaneGuidanceEnabled" type="checkbox">
        <span>Simpel lane guidance</span>
      </label>

      <label class="settings-option">
        <input id="settingsGreenWaveEnabled" type="checkbox">
        <span>Anbefalet fart / GreenWave</span>
      </label>

      <p class="settings-note">
        GreenWave er stadig en anbefalet økonomisk fart. Den er ikke en præcis trafiklys-forudsigelse endnu.
      </p>
    </div>

    <div class="settings-section">
      <h3>EcoScore</h3>

      <label class="settings-option">
        <input id="settingsEcoScoreEnabled" type="checkbox">
        <span>Vis EcoScore</span>
      </label>

      <p class="settings-note">
        Høj score kræver rolig acceleration, blød nedbremsning og stabil hastighed over hele turen.
      </p>
    </div>

    <div class="settings-section">
      <h3>Brændstof</h3>

      <label class="label" for="settingsFuelType">Brændstof</label>
      <select id="settingsFuelType">
        <option value="benzin95">Benzin 95</option>
        <option value="diesel">Diesel</option>
      </select>

      <label class="label" for="settingsFavoriteFuelBrand">Favorit tankkæde</label>
      <select id="settingsFavoriteFuelBrand">
        <option value="all">Alle / billigst uanset kæde</option>
        <option value="ok">OK</option>
        <option value="circle k">Circle K</option>
        <option value="q8">Q8</option>
        <option value="shell">Shell</option>
        <option value="ingo">Ingo</option>
        <option value="uno-x">Uno-X</option>
        <option value="f24">F24</option>
        <option value="goon">Go’on</option>
      </select>

      <label class="label" for="settingsFavoriteFuelMode">Favorit-prioritet</label>
      <select id="settingsFavoriteFuelMode">
        <option value="boost">Prioritér favorit</option>
        <option value="only">Vis kun favorit</option>
      </select>
    </div>

    <div class="settings-section">
      <h3>Kort og radius</h3>

      <label class="label" for="settingsMapStyleMode">Kortstil</label>
      <select id="settingsMapStyleMode">
        <option value="navigation">Premium navigation</option>
        <option value="standard">Standard dark</option>
      </select>

      <label class="label" for="settingsSearchRadius">Søgeradius langs ruten</label>
      <select id="settingsSearchRadius">
        <option value="25000">25 km</option>
        <option value="50000">50 km</option>
        <option value="100000">100 km</option>
        <option value="150000">150 km</option>
        <option value="250000">250 km</option>
      </select>
    </div>
  `;
}

function syncSettingsControls() {
  setChecked("regionDK", state.settings.region === "dk");
  setChecked("regionUS", state.settings.region === "us");

  setChecked("settingsRouteFast", state.settings.routeMode === "fast");
  setChecked("settingsRouteEco", state.settings.routeMode === "eco");

  setChecked("settingsEcoScoreEnabled", state.settings.ecoScoreEnabled !== false);
  setChecked("settingsAutoRerouteEnabled", state.settings.autoRerouteEnabled !== false);
  setChecked("settingsDynamicZoomEnabled", state.settings.dynamicZoomEnabled !== false);
  setChecked("settingsSmoothCameraEnabled", state.settings.smoothCameraEnabled !== false);
  setChecked("settingsLaneGuidanceEnabled", state.settings.laneGuidanceEnabled !== false);
  setChecked("settingsGreenWaveEnabled", state.settings.greenWaveEnabled !== false);

  setValue("settingsFuelType", state.settings.fuelType || "benzin95");
  setValue("settingsFavoriteFuelBrand", state.settings.favoriteFuelBrand || "all");
  setValue("settingsFavoriteFuelMode", state.settings.favoriteFuelMode || "boost");
  setValue("settingsMapStyleMode", state.settings.mapStyleMode || "navigation");
  setValue("settingsSearchRadius", String(state.settings.searchRadiusBase || 100000));
}

function getControl(id) {
  return document.getElementById(id);
}

function setChecked(id, value) {
  const el = getControl(id);

  if (el) {
    el.checked = Boolean(value);
  }
}

function setValue(id, value) {
  const el = getControl(id);

  if (el) {
    el.value = value;
  }
}
