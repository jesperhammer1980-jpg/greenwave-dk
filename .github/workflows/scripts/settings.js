import { state, SETTINGS_KEY } from "./state.js";
import { els } from "./dom.js";
import { updateFuelBox, applyPricesToStations, updateFuelMarkers } from "./fuel.js";

export function loadSettings() {
  try {
    state.settings = { ...state.settings, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}") };
  } catch {}
}

export function renderSettings() {
  if (!els.settingsBody) return;
  els.settingsBody.innerHTML = `
    <section class="setting-section">
      <h3>Område</h3>
      <label class="setting-option"><input id="regionDK" name="region" type="radio" value="dk"> Danmark</label>
      <label class="setting-option"><input id="regionUS" name="region" type="radio" value="us"> USA</label>
    </section>

    <section class="setting-section">
      <h3>Rute</h3>
      <label class="setting-option"><input id="routeFast" name="routeMode" type="radio" value="fast"> Hurtigste rute</label>
      <label class="setting-option"><input id="routeEco" name="routeMode" type="radio" value="eco"> Økonomisk rute</label>
    </section>

    <section class="setting-section">
      <h3>Navigation</h3>
      <label class="setting-option"><input id="autoReroute" type="checkbox"> Automatisk omdirigering</label>
      <label class="setting-option"><input id="dynamicZoom" type="checkbox"> Dynamisk zoom</label>
      <label class="setting-option"><input id="laneGuidance" type="checkbox"> Simpel lane guidance</label>
      <label class="setting-option"><input id="greenWave" type="checkbox"> Anbefalet fart / GreenWave</label>
    </section>

    <section class="setting-section">
      <h3>Brændstof</h3>
      <label>Type</label>
      <select id="fuelType">
        <option value="benzin95">Benzin 95</option>
        <option value="diesel">Diesel</option>
      </select>

      <label>Favorit tankkæde</label>
      <select id="favoriteFuelBrand">
        <option value="all">Alle</option>
        <option value="ok">OK</option>
        <option value="circle k">Circle K</option>
        <option value="q8">Q8</option>
        <option value="shell">Shell</option>
        <option value="ingo">Ingo</option>
        <option value="uno-x">Uno-X</option>
      </select>
    </section>
  `;
  syncSettings();
}

export function openSettings() {
  renderSettings();
  els.settingsPanel.classList.remove("hidden");
  els.settingsBackdrop.classList.remove("hidden");
}

export function closeSettings() {
  els.settingsPanel.classList.add("hidden");
  els.settingsBackdrop.classList.add("hidden");
}

export function saveSettingsFromControls() {
  state.settings.region = document.getElementById("regionUS").checked ? "us" : "dk";
  state.settings.routeMode = document.getElementById("routeEco").checked ? "eco" : "fast";
  state.settings.autoRerouteEnabled = document.getElementById("autoReroute").checked;
  state.settings.dynamicZoomEnabled = document.getElementById("dynamicZoom").checked;
  state.settings.laneGuidanceEnabled = document.getElementById("laneGuidance").checked;
  state.settings.greenWaveEnabled = document.getElementById("greenWave").checked;
  state.settings.fuelType = document.getElementById("fuelType").value;
  state.settings.favoriteFuelBrand = document.getElementById("favoriteFuelBrand").value;

  localStorage.setItem(SETTINGS_KEY, JSON.stringify(state.settings));
  closeSettings();

  if (state.routeData) {
    applyPricesToStations();
    updateFuelBox();
    updateFuelMarkers();
  }
}

function syncSettings() {
  document.getElementById("regionDK").checked = state.settings.region === "dk";
  document.getElementById("regionUS").checked = state.settings.region === "us";
  document.getElementById("routeFast").checked = state.settings.routeMode === "fast";
  document.getElementById("routeEco").checked = state.settings.routeMode === "eco";
  document.getElementById("autoReroute").checked = state.settings.autoRerouteEnabled;
  document.getElementById("dynamicZoom").checked = state.settings.dynamicZoomEnabled;
  document.getElementById("laneGuidance").checked = state.settings.laneGuidanceEnabled;
  document.getElementById("greenWave").checked = state.settings.greenWaveEnabled;
  document.getElementById("fuelType").value = state.settings.fuelType;
  document.getElementById("favoriteFuelBrand").value = state.settings.favoriteFuelBrand;
}
