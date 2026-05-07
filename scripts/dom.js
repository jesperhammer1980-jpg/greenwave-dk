export const els = {};

const elementIds = [
  "destinationInput",
  "autocompleteBox",
  "autocompleteList",
  "autocompleteResults",

  "calcRouteBtn",
  "startNavBtn",
  "stopNavBtn",

  "recenterBtn",
  "centerBtn",

  "historyToggleBtn",
  "historyBtn",

  "historyBox",
  "historyList",

  "openSettingsBtn",
  "settingsBtn",

  "closeSettingsBtn",
  "saveSettingsBtn",

  "settingsBackdrop",
  "settingsPanel",
  "settingsBody",

  "languageDa",
  "languageEn",

  "regionDK",
  "regionUS",

  "settingsRouteFast",
  "settingsRouteEco",

  "settingsFuelType",
  "settingsMaxDetour",
  "settingsSearchRadius",

  "gpsStatusChip",
  "navStatusChip",
  "mapModeLabel",

  "gpsStatus",
  "navStatus",
  "mapStatus",

  "fuelDisclaimer",
  "fuelContent",
  "fuelBox",

  "openFuelListBtn",
  "openFuelHistoryBtn",
  "fuelHistoryBtn",

  "fuelListBackdrop",
  "fuelListModal",
  "closeFuelListBtn",

  "sortFuelByPriceBtn",
  "sortFuelByDetourBtn",

  "fuelListContent",

  "fuelHistoryBackdrop",
  "fuelHistoryModal",
  "closeFuelHistoryBtn",

  "fuelHistoryContent",

  "navOverlay",

  "exitNavOverlayBtn",
  "overlayStopBtn",

  "driveRemainingDistance",
  "driveRemainingTime",
  "driveCurrentValue",

  "turnIcon",
  "nextTurnDistance",
  "nextTurnInstruction",
  "nextTurnRoad",
  "turnProgressBar",

  "speedLimitSign",
  "speedLimitValue",

  "currentSpeedSign",
  "currentSpeedValue",

  "recommendedSpeedSign",
  "recommendedSpeedValue"
];

export function cacheDom() {
  elementIds.forEach(id => {
    els[id] = document.getElementById(id);
  });

  /* Compatibility aliases */

  els.recenterBtn =
    els.recenterBtn || els.centerBtn;

  els.historyToggleBtn =
    els.historyToggleBtn || els.historyBtn;

  els.openSettingsBtn =
    els.openSettingsBtn || els.settingsBtn;

  els.openFuelHistoryBtn =
    els.openFuelHistoryBtn || els.fuelHistoryBtn;

  els.exitNavOverlayBtn =
    els.exitNavOverlayBtn || els.overlayStopBtn;
}
