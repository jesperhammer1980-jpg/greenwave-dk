export const els = {};
export function cacheDom() {
  [
    "map","homePanel","destinationInput","calcRouteBtn","autocompleteResults","centerBtn","openFuelListBtn","startNavBtn",
    "historyList","fuelContent","fuelListModal","fuelListBackdrop","closeFuelListBtn","fuelListContent","sortFuelByPriceBtn","sortFuelByDetourBtn",
    "gpsStatus","navStatus","mapStatus","settingsBtn","settingsPanel","settingsBackdrop","closeSettingsBtn","settingsBody","saveSettingsBtn",
    "navOverlay","overlayStopBtn","turnIcon","nextTurnDistance","nextTurnInstruction","nextTurnRoad","speedLimitValue","currentSpeedValue",
    "recommendedSpeedValue","driveRemainingDistance","driveEtaValue","driveRemainingTime","ecoScoreBadge","ecoScoreModal","ecoScoreBackdrop",
    "closeEcoScoreBtn","ecoScoreTotalValue","ecoScoreAccelerationValue","ecoScoreBrakingValue","ecoScoreSteadyValue","ecoScoreComment"
  ].forEach(id => els[id] = document.getElementById(id));
}
