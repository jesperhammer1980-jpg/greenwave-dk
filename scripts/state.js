export const SETTINGS_KEY = "greenwave_settings_working_v4";
export const HISTORY_KEY = "greenwave_history_working_v4";
export const FUEL_DATA_URL = "./fuel-prices.json";

export const state = {
  map: null,

  currentPosition: null,
  rawPosition: null,
  smoothedPosition: null,
  previousPosition: null,

  currentHeading: null,
  smoothedHeading: null,

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

  fuelPriceOverrides: [],
  osmFuelStations: [],
  fuelMarkers: [],
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
    offRouteDistanceLimitMeters: 70,
    offRouteDelayMs: 8000,
    rerouteCooldownMs: 25000
  },

  ecoScore: {
    value: 100,
    samples: 0,
    lastSpeedKmh: null,
    lastTimestamp: null,
    hardAccelerationCount: 0,
    hardBrakeCount: 0,
    speedingCount: 0,
    greenWaveMissCount: 0,
    smoothDrivingBonus: 0
  },

  navigationView: {
    mode: "standard",
    pseudo3d: true,
    darkMode: true,
    cinematicCamera: true,
    adaptiveZoom: true,
    motorwayMode: false,
    nightMode: false,
    lastZoom: 17,
    lastBearing: 0
  },

  settings: {
    language: "da",
    region: "dk",
    routeMode: "fast",
    fuelType: "benzin95",
    searchRadiusBase: 100000,
    ecoScoreEnabled: true,
    autoRerouteEnabled: true
  }
};
