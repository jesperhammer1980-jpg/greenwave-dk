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
  renderSettingsBody();

  setChecked("languageDa", state.settings.language === "da");
  setChecked("languageEn", state.settings.language === "en");

  setChecked("regionDK", state.settings.region === "dk");
  setChecked("regionUS", state.settings.region === "us");

  setChecked("settingsRouteFast", state.settings.routeMode === "fast");
  setChecked("settingsRouteEco", state.settings.routeMode === "eco");

  setValue("settingsFuelType", state.settings.fuelType || "benzin95");
  setValue(
    "settingsSearchRadius",
    String(state.settings.searchRadiusBase || 100000)
  );
}

export function saveSettingsFromControls() {
  state.settings.language =
    getEl("languageEn")?.checked ? "en" : "da";

  state.settings.region =
    getEl("regionUS")?.checked ? "us" : "dk";

  state.settings.routeMode =
    getEl("settingsRouteEco")?.checked ? "eco" : "fast";

  state.settings.fuelType =
    getEl("settingsFuelType")?.value || "benzin95";

  state.settings.searchRadiusBase = Number(
    getEl("settingsSearchRadius")?.value || 100000
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
  renderSettingsBody();
  applySettingsToUI();

  els.settingsPanel?.classList.remove("hidden");
  els.settingsBackdrop?.classList.remove("hidden");
}

export function closeSettings() {
  els.settingsPanel?.classList.add("hidden");
  els.settingsBackdrop?.classList.add("hidden");
}

function renderSettingsBody() {
  const body =
    els.settingsBody ||
    document.getElementById("settingsBody");

  if (!body) {
    return;
  }

  body.innerHTML = `
    <div class="settings-section">
      <h3>Sprog</h3>

      <label class="settings-option">
        <input id="languageDa" type="radio" name="language" value="da">
        <span>Dansk</span>
      </label>

      <label class="settings-option">
        <input id="languageEn" type="radio" name="language" value="en">
        <span>Engelsk</span>
      </label>
    </div>

    <div class="settings-section">
      <h3>Område</h3>

      <label class="settings-option">
        <input id="regionDK" type="radio" name="region" value="dk">
        <span>Danmark</span>
      </label>

      <label class="settings-option">
        <input id="regionUS" type="radio" name="region" value="us">
        <span>USA</span>
      </label>
    </div>

    <div class="settings-section">
      <h3>Rute</h3>

      <label class="settings-option">
        <input id="settingsRouteFast" type="radio" name="routeMode" value="fast">
        <span>Hurtigste rute</span>
      </label>

      <label class="settings-option">
        <input id="settingsRouteEco" type="radio" name="routeMode" value="eco">
        <span>Økonomisk rute</span>
      </label>
    </div>

    <div class="settings-section">
      <h3>Brændstof</h3>

      <label class="label" for="settingsFuelType">
        Type
      </label>

      <select id="settingsFuelType">
        <option value="benzin95">Benzin 95</option>
        <option value="diesel">Diesel</option>
        <option value="el">El</option>
      </select>
    </div>

    <div class="settings-section">
      <h3>Søgeområde</h3>

      <label class="label" for="settingsSearchRadius">
        Søgeradius langs ruten
      </label>

      <select id="settingsSearchRadius">
        <option value="25000">25 km</option>
        <option value="50000">50 km</option>
        <option value="100000">100 km</option>
        <option value="150000">150 km</option>
      </select>

      <p class="settings-note">
        Større radius finder flere tankstationer, men kan også vise stationer længere væk fra ruten.
      </p>
    </div>
  `;

  refreshDynamicSettingRefs();
}

function refreshDynamicSettingRefs() {
  els.languageDa = document.getElementById("languageDa");
  els.languageEn = document.getElementById("languageEn");

  els.regionDK = document.getElementById("regionDK");
  els.regionUS = document.getElementById("regionUS");

  els.settingsRouteFast = document.getElementById("settingsRouteFast");
  els.settingsRouteEco = document.getElementById("settingsRouteEco");

  els.settingsFuelType = document.getElementById("settingsFuelType");
  els.settingsSearchRadius = document.getElementById("settingsSearchRadius");
}

function getEl(id) {
  return els[id] || document.getElementById(id);
}

function setChecked(id, checked) {
  const el = getEl(id);

  if (el) {
    el.checked = Boolean(checked);
  }
}

function setValue(id, value) {
  const el = getEl(id);

  if (el) {
    el.value = value;
  }
}
