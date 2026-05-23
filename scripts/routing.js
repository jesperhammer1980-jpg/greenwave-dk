import {state} from "./state.js";
import {els} from "./dom.js";
import {getPosition} from "./utils.js";
import {drawRoute,updateUserMarker,updateDestinationMarker} from "./map.js";
import {saveHistory,renderHistory} from "./history.js";
import {loadFuelStations,computeRouteDistances,applyPricesToStations,updateFuelBox,updateFuelMarkers} from "./fuel.js";
import {prepareRouteSteps} from "./route-progress.js";

export async function calculateRoute(){
  const input=els.destinationInput.value.trim();

  if(!input){
    alert("Indtast destination.");
    return;
  }

  try{
    els.calcRouteBtn.disabled=true;
    els.startNavBtn.disabled=true;

    state.currentPosition=await getPosition();
    updateUserMarker(state.currentPosition.lat,state.currentPosition.lng);

    state.destination=state.selectedAutocompleteItem||await geocode(input);
    updateDestinationMarker(state.destination.lat,state.destination.lng);

    const route=await fetchRoute(state.currentPosition,state.destination);

    applyRoute(route);

    saveHistory(state.destination);
    renderHistory();

    els.startNavBtn.disabled=false;
    els.openFuelListBtn.disabled=false;

    // Fuel must never block route calculation or make GO appear dead.
    loadFuelStations(route.geometry)
      .then(() => {
        computeRouteDistances();
        applyPricesToStations();
        updateFuelBox();
        updateFuelMarkers();
      })
      .catch(error => {
        console.warn("Fuel update failed", error);
        updateFuelBox();
      });

  }catch(e){
    alert("Kunne ikke beregne rute:\\n"+(e.message||e));
  }finally{
    els.calcRouteBtn.disabled=false;
  }
}

export async function recalculateRouteFromCurrentPosition(position){
  if(!position||!state.destination)return;

  const route=await fetchRoute(position,state.destination);

  applyRoute(route);
}

function applyRoute(route){
  state.routeData=route;
  state.routeSteps=route.steps;
  state.currentStepIndex=0;

  drawRoute(route.geometry);
  prepareRouteSteps();
}

async function geocode(q){
  const c=state.settings.region==="us"?"us":"dk";

  const res=await fetch(
    `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&addressdetails=1&countrycodes=${c}&q=${encodeURIComponent(q)}`
  );

  const data=await res.json();

  if(!data?.length)throw new Error("Destination ikke fundet");

  const i=data[0];
  const a=i.address||{};

  return{
    lat:Number(i.lat),
    lng:Number(i.lon),
    inputLabel:i.name||a.road||q,
    displayName:i.display_name||q
  };
}

async function fetchRoute(from,to){
  const url =
    `https://router.project-osrm.org/route/v1/driving/`+
    `${from.lng},${from.lat};${to.lng},${to.lat}`+
    `?overview=full&geometries=geojson&steps=true&alternatives=true`;

  const res=await fetch(url);
  const data=await res.json();

  if(!data.routes?.length)throw new Error("Ingen rute fundet");

  const selected=selectRoute(data.routes);

  return{
    geometry:selected.geometry.coordinates,
    distance:Number(selected.distance||0),
    duration:Number(selected.duration||0),
    steps:extractSteps(selected),
    routeMode:state.settings.routeMode||"fast"
  };
}

function selectRoute(routes){
  if((state.settings.routeMode||"fast")==="eco"){
    return [...routes].sort((a,b)=>ecoScore(a)-ecoScore(b))[0];
  }

  return [...routes].sort((a,b)=>
    Number(a.duration||Infinity)-Number(b.duration||Infinity)
  )[0];
}

function ecoScore(route){
  const distanceKm=Number(route.distance||0)/1000;
  const minutes=Number(route.duration||0)/60;

  // OSRM has no real fuel model here.
  // This score prefers shorter routes, but avoids choosing a route that is much slower.
  return distanceKm*1.0 + minutes*0.22;
}

function extractSteps(route){
  const out=[];

  (route.legs||[]).forEach(leg=>{
    (leg.steps||[]).forEach(step=>{
      const maneuver=step.maneuver||{};

      out.push({
        distance:Number(step.distance||0),
        duration:Number(step.duration||0),
        name:step.name||"",
        maneuverType:maneuver.type||"continue",
        maneuverModifier:maneuver.modifier||""
      });
    });
  });

  return out;
}
