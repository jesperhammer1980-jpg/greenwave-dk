export const SETTINGS_KEY = "greenwave_settings_v6";
export const HISTORY_KEY = "greenwave_history_v6";
export const FUEL_DATA_URL = "./fuel-prices.json";

export const state = {
  map: null,

  currentPosition: null,
  rawPosition: null,
  smoothedPosition: null,
  previousPosition: null,

  currentHeading: null,
  smoothedHeading: null,
  lastHeading: 0,

  isRecoveringPosition: false,
  lastVisibilityChangeAt: null,
  lastGoodGpsAt: null,
  lastCameraMoveAt: null,

  destination: null,
  selectedAutocompleteItem: null,
  autocompleteTimer: null,
  autocompleteAbortController: null,

  routeData: null,
  routeSteps: [],
  currentStepIndex: 0,

  routeLine: null,
  userMarker: null,
  destMarker: null,

  routeProgress: {
    alongMeters: 0,
    remainingMeters: 0,
    remainingSeconds: 0,
    progressRatio: 0,
    distanceToRoute: Infinity,
    segmentIndex: 0,
    isOffRoute: false
  },

  camera: {
    lastZoom: 16,
    targetZoom: 16,
    lastBearing: 0,
    targetBearing: 0,
    lastMoveAt: null,
    mode: "overview"
  },

  fuelPriceOverrides: [],
  osmFuelStations: [],
  fuelMarkers: [],
  fuelOverviewMarkers: [],
  fuelListSort: "price",

  trafficSignals: [],
  maxSpeedZones: [],
  currentMaxSpeed: null,

  wakeLock: null,
  watchId: null,
  isNavigating: false,

  reroute: {
    isRerouting: false,
    offRouteSince: null,
    lastRerouteAt: null,
    offRouteDistanceLimitMeters: 90,
    offRouteDelayMs: 7000,
    rerouteCooldownMs: 22000
  },

  ecoScore: {
    value: 70,

    samples: 0,
    movingSamples: 0,

    lastSpeed: null,
    lastSpeedKmh: null,
    lastTimestamp: null,

    accelerationQualitySum: 0,
    accelerationEvents: 0,

    brakingQualitySum: 0,
    brakingEvents: 0,

    steadyQualitySum: 0,
    steadySamples: 0,

    tripStartedAt: null,
    tripEndedAt: null
  },

  navigationView: {
    mode: "standard",
    pseudo3d: true,
    darkMode: true,
    cinematicCamera: true,
    adaptiveZoom: true,
    motorwayMode: false,
    nightMode: false,
    laneGuidance: true,
    curveSpeedAssist: true
  },

  settings: {
    language: "da",
    region: "dk",

    routeMode: "fast",

    fuelType: "benzin95",
    searchRadiusBase: 100000,

    favoriteFuelBrand: "all",
    favoriteFuelMode: "boost",

    ecoScoreEnabled: true,
    autoRerouteEnabled: true,

    dynamicZoomEnabled: true,
    smoothCameraEnabled: true,
    laneGuidanceEnabled: true,
    greenWaveEnabled: true,

    mapStyleMode: "navigation"
  }
};
