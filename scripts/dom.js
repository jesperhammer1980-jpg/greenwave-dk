export const els = {};

export function cacheDom() {

  /* =========================
     MAP
  ========================= */

  els.map = document.getElementById("map");

  els.mapRotationWrap =
    document.getElementById(
      "map-rotation-wrap"
    );

  els.mapRotationInner =
    document.getElementById(
      "map-rotation-inner"
    );

  /* =========================
     SEARCH
  ========================= */

  els.destinationInput =
    document.getElementById(
      "destinationInput"
    );

  els.autocompleteBox =
    document.getElementById(
      "autocompleteBox"
    );

  els.autocompleteResults =
    document.getElementById(
      "autocompleteResults"
    );

  /* =========================
     BUTTONS
  ========================= */

  els.calcRouteBtn =
    document.getElementById(
      "calcRouteBtn"
    );

  els.startNavBtn =
    document.getElementById(
      "startNavBtn"
    );

  els.stopNavBtn =
    document.getElementById(
      "stopNavBtn"
    );

  els.overlayStopBtn =
    document.getElementById(
      "overlayStopBtn"
    );

  els.centerBtn =
    document.getElementById(
      "centerBtn"
    );

  els.settingsBtn =
    document.getElementById(
      "settingsBtn"
    );

  els.historyBtn =
    document.getElementById(
      "historyBtn"
    );

  els.openFuelListBtn =
    document.getElementById(
      "openFuelListBtn"
    );

  els.fuelHistoryBtn =
    document.getElementById(
      "fuelHistoryBtn"
    );

  /* =========================
     STATUS
  ========================= */

  els.gpsStatus =
    document.getElementById(
      "gpsStatus"
    );

  els.navStatus =
    document.getElementById(
      "navStatus"
    );

  els.mapStatus =
    document.getElementById(
      "mapStatus"
    );

  /* =========================
     NAVIGATION OVERLAY
  ========================= */

  els.navOverlay =
    document.getElementById(
      "navOverlay"
    );

  els.turnIcon =
    document.getElementById(
      "turnIcon"
    );

  els.nextTurnDistance =
    document.getElementById(
      "nextTurnDistance"
    );

  els.nextTurnInstruction =
    document.getElementById(
      "nextTurnInstruction"
    );

  els.nextTurnRoad =
    document.getElementById(
      "nextTurnRoad"
    );

  els.turnProgressBar =
    document.getElementById(
      "turnProgressBar"
    );

  /* =========================
     SPEED UI
  ========================= */

  els.speedLimitValue =
    document.getElementById(
      "speedLimitValue"
    );

  els.currentSpeedValue =
    document.getElementById(
      "currentSpeedValue"
    );

  els.recommendedSpeedValue =
    document.getElementById(
      "recommendedSpeedValue"
    );

  els.currentSpeedSign =
    document.getElementById(
      "currentSpeedSign"
    );

  /* =========================
     BOTTOM BAR
  ========================= */

  els.driveRemainingDistance =
    document.getElementById(
      "driveRemainingDistance"
    );

  els.driveEtaValue =
    document.getElementById(
      "driveEtaValue"
    );

  els.driveRemainingTime =
    document.getElementById(
      "driveRemainingTime"
    );

  /* =========================
     ECO SCORE
  ========================= */

  els.ecoScoreBadge =
    document.getElementById(
      "ecoScoreBadge"
    );

  els.ecoScoreModal =
    document.getElementById(
      "ecoScoreModal"
    );

  els.ecoScoreBackdrop =
    document.getElementById(
      "ecoScoreBackdrop"
    );

  els.closeEcoScoreBtn =
    document.getElementById(
      "closeEcoScoreBtn"
    );

  els.ecoScoreTotalValue =
    document.getElementById(
      "ecoScoreTotalValue"
    );

  els.ecoScoreAccelerationValue =
    document.getElementById(
      "ecoScoreAccelerationValue"
    );

  els.ecoScoreBrakingValue =
    document.getElementById(
      "ecoScoreBrakingValue"
    );

  els.ecoScoreSteadyValue =
    document.getElementById(
      "ecoScoreSteadyValue"
    );

  els.ecoScoreComment =
    document.getElementById(
      "ecoScoreComment"
    );

  els.ecoScoreSubtitle =
    document.getElementById(
      "ecoScoreSubtitle"
    );

  /* =========================
     SETTINGS
  ========================= */

  els.settingsPanel =
    document.getElementById(
      "settingsPanel"
    );

  els.settingsBackdrop =
    document.getElementById(
      "settingsBackdrop"
    );

  els.closeSettingsBtn =
    document.getElementById(
      "closeSettingsBtn"
    );

  els.saveSettingsBtn =
    document.getElementById(
      "saveSettingsBtn"
    );

  els.settingsBody =
    document.getElementById(
      "settingsBody"
    );

  /* =========================
     FUEL
  ========================= */

  els.fuelBox =
    document.getElementById(
      "fuelBox"
    );

  els.fuelContent =
    document.getElementById(
      "fuelContent"
    );

  els.fuelDisclaimer =
    document.getElementById(
      "fuelDisclaimer"
    );

  els.fuelListModal =
    document.getElementById(
      "fuelListModal"
    );

  els.fuelListBackdrop =
    document.getElementById(
      "fuelListBackdrop"
    );

  els.closeFuelListBtn =
    document.getElementById(
      "closeFuelListBtn"
    );

  els.fuelListContent =
    document.getElementById(
      "fuelListContent"
    );

  els.sortFuelByPriceBtn =
    document.getElementById(
      "sortFuelByPriceBtn"
    );

  els.sortFuelByDetourBtn =
    document.getElementById(
      "sortFuelByDetourBtn"
    );

  /* =========================
     FUEL HISTORY
  ========================= */

  els.fuelHistoryModal =
    document.getElementById(
      "fuelHistoryModal"
    );

  els.fuelHistoryBackdrop =
    document.getElementById(
      "fuelHistoryBackdrop"
    );

  els.closeFuelHistoryBtn =
    document.getElementById(
      "closeFuelHistoryBtn"
    );

  els.fuelHistoryContent =
    document.getElementById(
      "fuelHistoryContent"
    );

  /* =========================
     HISTORY
  ========================= */

  els.historyList =
    document.getElementById(
      "historyList"
    );
}
