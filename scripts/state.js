export const SETTINGS_KEY = "greenwave_settings_working_v4";
export const HISTORY_KEY = "greenwave_history_working_v4";
export const FUEL_DATA_URL = "./fuel-prices.json";

export const state = {
  map: null,

  currentPosition: null,
  destination: null,
  selectedAutocompleteItem: null,
  autocompleteTimer: null,
  autocompleteAbortController: null,

  routeData: null,
  routeLine: null,
  userMarker: null,
  destMarker: null,

  fuelPriceOverrides: [],
  osmFuelStations: [],
  fuelMarkers: [],
  fuelListSort: "price",

  trafficSignals: [],

  watchId: null,
  isNavigating: false,

  settings: {
    language: "da",
    region: "dk",
    routeMode: "fast",
    fuelType: "benzin95",
    searchRadiusBase: 100000
  }
};
