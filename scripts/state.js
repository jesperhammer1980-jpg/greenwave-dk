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
    searchRadiusBase: 100000
  }
};
