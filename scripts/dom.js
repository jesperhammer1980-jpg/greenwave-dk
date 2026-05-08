export const els = {};

const elementIds = [
  "destinationInput",

  "autocompleteBox",
  "autocompleteResults",

  "calcRouteBtn",
  "startNavBtn",
  "stopNavBtn",

  "centerBtn",
  "historyBtn",
  "settingsBtn",

  "gpsStatus",
  "navStatus",
  "mapStatus",

  "historyList",

  "fuelDisclaimer",
  "fuelContent",
  "fuelBox",

  "openFuelListBtn",
  "fuelHistoryBtn",

  "map",
  "map-rotation-wrap",
  "map-rotation-inner",

  "navOverlay",
  "overlayStopBtn",

  "ecoScoreBadge",

  "turnIcon",
  "nextTurnDistance",
  "nextTurnInstruction",
  "nextTurnRoad",
  "turnProgressBar",

  "speedLimitValue",
  "currentSpeedValue",
  "recommendedSpeedValue",
  "currentSpeedSign",

  "driveRemainingDistance",
  "driveEtaValue",
  "driveRemainingTime",

  "settingsBackdrop",
  "settingsPanel",
  "settingsBody",

  "closeSettingsBtn",
  "saveSettingsBtn",

  "fuelListBackdrop",
  "fuelListModal",
  "fuelListContent",

  "closeFuelListBtn",
  "sortFuelByPriceBtn",
  "sortFuelByDetourBtn",

  "fuelHistoryBackdrop",
  "fuelHistoryModal",
  "fuelHistoryContent",

  "closeFuelHistoryBtn"
];

export function cacheDom() {
  elementIds.forEach(id => {
    els[id] = document.getElementById(id);
  });
}
