export const els = {};

const elementIds = [
  "destinationInput",
  "autocompleteBox",
  "autocompleteList",

  "calcRouteBtn",
  "startNavBtn",
  "stopNavBtn",
  "recenterBtn",

  "historyToggleBtn",
  "historyBox",
  "historyList",

  "openSettingsBtn",
  "closeSettingsBtn",
  "saveSettingsBtn",

  "settingsBackdrop",
  "settingsPanel",

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

  "fuelDisclaimer",
  "fuelContent",

  "openFuelListBtn",
  "openFuelHistoryBtn",

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
}
