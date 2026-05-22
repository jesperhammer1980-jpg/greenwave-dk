export const SETTINGS_KEY = "greenwave_clean_settings_v1";
export const HISTORY_KEY = "greenwave_clean_history_v1";
export const state = {
  map:null, routeLine:null, routeGlow:null, routeDoneLine:null, routeAheadLine:null, userMarker:null, destinationMarker:null, fuelMarkers:[],
  currentPosition:null, destination:null, selectedAutocompleteItem:null, routeData:null, routeSteps:[], currentStepIndex:0,
  routeProgress:{alongMeters:0,remainingMeters:0,remainingSeconds:0,progressRatio:0,distanceToRoute:Infinity},
  navigationWatcherId:null, navigationActive:false, lastRerouteAt:0, offRouteSince:null, autocompleteTimer:null, history:[], fuelStations:[], fuelListSort:"route", currentMaxSpeed:null,
  ecoScore:{accelerationQualitySum:0,accelerationEvents:0,brakingQualitySum:0,brakingEvents:0,steadyQualitySum:0,steadySamples:0,currentScore:70,lastSpeed:null,lastLat:null,lastLng:null,measuredMeters:0,lastAccelerationLabel:"—",lastBrakingLabel:"—"},
  settings:{region:"dk",routeMode:"fast",fuelType:"benzin95",searchRadiusBase:150000,favoriteFuelBrand:"all",autoRerouteEnabled:true,dynamicZoomEnabled:true,laneGuidanceEnabled:true,greenWaveEnabled:true,ecoScoreEnabled:true}
};