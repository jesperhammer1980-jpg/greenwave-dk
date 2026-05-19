export const SETTINGS_KEY =
  "greenwave_settings_v3";

export const HISTORY_KEY =
  "greenwave_history_v3";

export const state = {

  /* =========================
     MAP
  ========================== */

  map: null,

  mapReady: false,

  mapRotation: 0,

  currentZoom: 16,

  routeLine: null,

  userMarker: null,

  destinationMarker: null,

  fuelMarkers: [],

  trafficLightMarkers: [],

  /* =========================
     ROUTE
  ========================== */

  routeData: null,

  routeSteps: [],

  currentStepIndex: 0,

  destination: null,

  currentPosition: null,

  selectedAutocompleteItem: null,

  routeProgress: {
    alongMeters: 0,
    remainingMeters: 0,
    remainingSeconds: 0,
    progressRatio: 0,
    segmentIndex: 0,
    distanceToRoute: Infinity,
    isOffRoute: false
  },

  /* =========================
     NAVIGATION
  ========================== */

  navigationActive: false,

  navigationWatcherId: null,

  smoothCameraBearing: 0,

  smoothCameraZoom: 16,

  lastKnownHeading: 0,

  currentSpeed: 0,

  currentMaxSpeed: null,

  recommendedSpeed: null,

  /* =========================
     ECO SCORE
  ========================== */

  ecoScore: {
    accelerationQualitySum: 0,
    accelerationEvents: 0,

    brakingQualitySum: 0,
    brakingEvents: 0,

    steadyQualitySum: 0,
    steadySamples: 0,

    currentScore: 78
  },

  /* =========================
     GREENWAVE
  ========================== */

  trafficSignals: [],

  maxSpeedZones: [],

  /* =========================
     FUEL
  ========================== */

  fuelStations: [],

  fuelListSort: "price",

  fuelPricesLoaded: false,

  /* =========================
     SETTINGS
  ========================== */

  settings: {

    language: "da",

    region: "dk",

    routeMode: "fast",

    fuelType: "benzin95",

    searchRadiusBase: 100000,

    ecoScoreEnabled: true,

    autoRerouteEnabled: true,

    dynamicZoomEnabled: true,

    smoothCameraEnabled: true,

    laneGuidanceEnabled: true,

    greenWaveEnabled: true,

    favoriteFuelBrand: "all",

    favoriteFuelMode: "boost",

    mapStyleMode: "navigation"
  },

  /* =========================
     UI
  ========================== */

  autocompleteTimer: null,

  uiMode: "home",

  /* =========================
     HISTORY
  ========================== */

  history: []
};
