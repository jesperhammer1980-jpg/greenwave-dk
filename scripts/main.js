import {state} from "./state.js";import {cacheDom,els} from "./dom.js";import {initMap,recenterMap} from "./map.js";import {loadSettings,openSettings,closeSettings,saveSettingsFromControls,renderSettings} from "./settings.js";import {loadHistory,renderHistory} from "./history.js";import {runAutocomplete,hideAutocomplete} from "./autocomplete.js";import {calculateRoute} from "./routing.js";import {startLiveNavigation,stopLiveNavigation} from "./navigation.js";import {updateFuelBox,openFuelList,closeFuelList,renderFuelList} from "./fuel.js";
document.addEventListener("DOMContentLoaded",()=>{cacheDom();loadSettings();loadHistory();initMap();renderSettings();renderHistory();updateFuelBox();bind();});
function bind(){els.destinationInput.addEventListener("input",()=>{state.selectedAutocompleteItem=null;clearTimeout(state.autocompleteTimer);state.autocompleteTimer=setTimeout(runAutocomplete,220)});els.calcRouteBtn.addEventListener("click",calculateRoute);els.startNavBtn.addEventListener("click",startLiveNavigation);els.overlayStopBtn.addEventListener("click",stopLiveNavigation);els.centerBtn.addEventListener("click",recenterMap);els.settingsBtn.addEventListener("click",openSettings);els.closeSettingsBtn.addEventListener("click",closeSettings);els.settingsBackdrop.addEventListener("click",closeSettings);els.saveSettingsBtn.addEventListener("click",saveSettingsFromControls);els.openFuelListBtn.addEventListener("click",openFuelList);els.closeFuelListBtn.addEventListener("click",closeFuelList);els.fuelListBackdrop.addEventListener("click",closeFuelList);els.sortFuelByPriceBtn.addEventListener("click",()=>{state.fuelListSort="route";renderFuelList()});els.sortFuelByDetourBtn.addEventListener("click",()=>{state.fuelListSort="detour";renderFuelList()});els.ecoScoreBadge.addEventListener("click",openEcoModal);els.closeEcoScoreBtn.addEventListener("click",closeEcoModal);els.ecoScoreBackdrop.addEventListener("click",closeEcoModal);document.addEventListener("click",e=>{if(!e.target.closest(".search-card")&&!e.target.closest(".autocomplete-results"))hideAutocomplete()});}
function openEcoModal(){updateEcoModal();els.ecoScoreModal.classList.remove("hidden");els.ecoScoreBackdrop.classList.remove("hidden");}
function closeEcoModal(){els.ecoScoreModal.classList.add("hidden");els.ecoScoreBackdrop.classList.add("hidden");}
function updateEcoModal(){
  const e=state.ecoScore;
  const a=avg(e.accelerationQualitySum,e.accelerationEvents,70);
  const b=avg(e.brakingQualitySum,e.brakingEvents,70);
  const s=avg(e.steadyQualitySum,e.steadySamples,65);
  const total=e.currentScore||Math.round(a*.28+b*.28+s*.44);
  const km=((e.totalMeters||e.measuredMeters||0)/1000).toFixed(1).replace(".",",");

  els.ecoScoreTotalValue.textContent=`${total}/100`;
  els.ecoScoreAccelerationValue.textContent=`${Math.round(a)}/100`;
  els.ecoScoreBrakingValue.textContent=`${Math.round(b)}/100`;
  els.ecoScoreSteadyValue.textContent=`${Math.round(s)}/100`;

  setRating(els.ecoAccelerationStatus,e.lastAccelerationLabel||"—",e.lastAccelerationClass||"rating-neutral");
  setRating(els.ecoBrakingStatus,e.lastBrakingLabel||"—",e.lastBrakingClass||"rating-neutral");
  setRating(els.ecoMeasuredDistance,`${km} km målt`,e.lastSteadyClass||"rating-neutral");

  els.ecoScoreComment.textContent=
    (total>=82?"Meget økonomisk og stabil kørsel.":
     total>=70?"Generelt rolig og effektiv kørestil.":
     total>=55?"Forbedringspotentiale.":
     "Ujævn kørestil.")+
    ` Måling: ${km} km.`;
}

function setRating(el,text,className){
  if(!el)return;
  el.textContent=text;
  el.className=`rating-pill ${className}`;
}

function avg(sum,count,fallback){return count>0?sum/count:fallback;}
