import {state,SETTINGS_KEY} from "./state.js";
import {els} from "./dom.js";

export function loadSettings(){
  try{
    state.settings={...state.settings,...JSON.parse(localStorage.getItem(SETTINGS_KEY)||"{}")};
  }catch{}
}

export function renderSettings(){
  els.settingsBody.innerHTML=`
    <section class="setting-section">
      <h3>Område</h3>
      <label class="setting-option">
        <input id="regionDK" name="region" type="radio">
        Danmark
      </label>
      <label class="setting-option">
        <input id="regionUS" name="region" type="radio">
        USA
      </label>
    </section>

    <section class="setting-section">
      <h3>Rutevalg</h3>
      <label class="setting-option">
        <input id="routeFast" name="routeMode" type="radio">
        Hurtigste rute
      </label>
      <label class="setting-option">
        <input id="routeEco" name="routeMode" type="radio">
        Mest økonomiske rute
      </label>
      <p class="settings-note">
        Økonomisk rute vælger den mest brændstofvenlige af de ruter OSRM returnerer.
        Den prioriterer kortere distance og mindre tidsspild, men er ikke ægte live-trafik endnu.
      </p>
    </section>

    <section class="setting-section">
      <h3>Navigation</h3>
      <label class="setting-option">
        <input id="autoReroute" type="checkbox">
        Automatisk omdirigering
      </label>
      <label class="setting-option">
        <input id="greenWave" type="checkbox">
        GreenWave
      </label>
    </section>
  `;

  syncSettings();
}

export function openSettings(){
  renderSettings();
  els.settingsPanel.classList.remove("hidden");
  els.settingsBackdrop.classList.remove("hidden");
}

export function closeSettings(){
  els.settingsPanel.classList.add("hidden");
  els.settingsBackdrop.classList.add("hidden");
}

export function saveSettingsFromControls(){
  state.settings.region=document.getElementById("regionUS").checked?"us":"dk";
  state.settings.routeMode=document.getElementById("routeEco").checked?"eco":"fast";
  state.settings.autoRerouteEnabled=document.getElementById("autoReroute").checked;
  state.settings.greenWaveEnabled=document.getElementById("greenWave").checked;

  localStorage.setItem(SETTINGS_KEY,JSON.stringify(state.settings));
  closeSettings();
}

function syncSettings(){
  document.getElementById("regionDK").checked=state.settings.region==="dk";
  document.getElementById("regionUS").checked=state.settings.region==="us";

  document.getElementById("routeFast").checked=(state.settings.routeMode||"fast")==="fast";
  document.getElementById("routeEco").checked=state.settings.routeMode==="eco";

  document.getElementById("autoReroute").checked=state.settings.autoRerouteEnabled;
  document.getElementById("greenWave").checked=state.settings.greenWaveEnabled;
}
