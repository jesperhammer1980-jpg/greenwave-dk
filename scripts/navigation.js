import {state} from "./state.js";import {els} from "./dom.js";import {updateUserMarker,followNavigationCamera,enterNavigationView,exitNavigationView,updateRouteHighlight} from "./map.js";import {formatDistance,formatDuration,haversine,projectPointToSegment} from "./utils.js";import {getGreenWaveRecommendation} from "./greenwave.js";import {recalculateRouteFromCurrentPosition} from "./routing.js";
const OFF_ROUTE_DISTANCE=90,OFF_ROUTE_DELAY=7000,REROUTE_COOLDOWN=25000;let wakeLock=null;
export function startLiveNavigation(){if(!state.routeData?.geometry?.length){alert("Beregn en rute først.");return}prepareRouteMeasurements();resetEco();state.navigationActive=true;enterNavigationView();els.navOverlay.classList.remove("hidden");requestWakeLock();state.navigationWatcherId=navigator.geolocation.watchPosition(handlePosition,e=>alert("GPS-fejl: "+e.message),{enableHighAccuracy:true,maximumAge:700,timeout:10000});}
export function stopLiveNavigation(){if(state.navigationWatcherId)navigator.geolocation.clearWatch(state.navigationWatcherId);state.navigationWatcherId=null;state.navigationActive=false;els.navOverlay.classList.add("hidden");exitNavigationView();releaseWakeLock();}
function handlePosition(p){const cur={lat:p.coords.latitude,lng:p.coords.longitude,speed:typeof p.coords.speed==="number"?Math.max(0,p.coords.speed*3.6):0,heading:typeof p.coords.heading==="number"?p.coords.heading:0};state.currentPosition=cur;updateUserMarker(cur.lat,cur.lng);followNavigationCamera(cur);const progress=getRouteProgress(cur);state.routeProgress=progress;updateRouteHighlight(progress);updateUi(cur,progress);updateEco(cur);maybeReroute(cur,progress);}
function prepareRouteMeasurements(){const g=state.routeData.geometry,c=[0];let total=0;for(let i=1;i<g.length;i++){const a=g[i-1],b=g[i];total+=haversine(a[1],a[0],b[1],b[0]);c.push(total)}state.routeData._cumulativeMeters=c;state.routeData._measuredDistance=total;}
function getRouteProgress(cur){const g=state.routeData.geometry;let best={distanceToRoute:Infinity,alongMeters:0,segmentIndex:0};for(let i=1;i<g.length;i++){const a=g[i-1],b=g[i],p=projectPointToSegment(cur.lat,cur.lng,a[1],a[0],b[1],b[0]);if(p.distanceMeters<best.distanceToRoute){const len=haversine(a[1],a[0],b[1],b[0]);best={distanceToRoute:p.distanceMeters,alongMeters:state.routeData._cumulativeMeters[i-1]+len*p.t,segmentIndex:i}}}const total=state.routeData.distance||state.routeData._measuredDistance,ratio=total>0?Math.min(1,best.alongMeters/total):0;return{...best,remainingMeters:Math.max(0,total-best.alongMeters),remainingSeconds:(state.routeData.duration||0)*(1-ratio),progressRatio:ratio,isOffRoute:best.distanceToRoute>OFF_ROUTE_DISTANCE};}
function updateUi(cur,p){els.driveRemainingDistance.textContent=formatDistance(p.remainingMeters);els.driveRemainingTime.textContent=formatDuration(p.remainingSeconds);els.driveEtaValue.textContent=new Date(Date.now()+p.remainingSeconds*1000).toLocaleTimeString("da-DK",{hour:"2-digit",minute:"2-digit"});const step=findStep(p.alongMeters);if(step){const d=Math.max(0,step.endDistance-p.alongMeters);els.nextTurnDistance.textContent=d<8?"Nu":formatDistance(d);els.nextTurnInstruction.textContent=instruction(step);els.nextTurnRoad.textContent=step.name||"";els.turnIcon.textContent=icon(step)}const rec=getGreenWaveRecommendation(cur);els.currentSpeedValue.textContent=Math.round(cur.speed); if(els.ecoLiveSpeed) els.ecoLiveSpeed.textContent=Math.round(cur.speed);els.speedLimitValue.textContent=state.currentMaxSpeed||"?";els.recommendedSpeedValue.textContent=rec.speedKmh||"--";}
function findStep(a){return state.routeSteps.find(s=>a>=s.startDistance&&a<=s.endDistance)||state.routeSteps[state.routeSteps.length-1];}
function instruction(s){const t=String(s.maneuverType||"").toLowerCase(),m=String(s.maneuverModifier||"").toLowerCase();if(t.includes("arrive"))return"Du er fremme";if(t.includes("roundabout"))return"Kør gennem rundkørslen";if(m.includes("left"))return"Drej til venstre";if(m.includes("right"))return"Drej til højre";return"Fortsæt";}
function icon(s){const m=String(s.maneuverModifier||"").toLowerCase();if(m.includes("left"))return"←";if(m.includes("right"))return"→";return"↑";}
async function maybeReroute(cur,p){if(!state.settings.autoRerouteEnabled)return;const now=Date.now();if(!p.isOffRoute){state.offRouteSince=null;return}if(!state.offRouteSince){state.offRouteSince=now;return}if(now-state.offRouteSince<OFF_ROUTE_DELAY||now-(state.lastRerouteAt||0)<REROUTE_COOLDOWN)return;state.lastRerouteAt=now;state.offRouteSince=null;await recalculateRouteFromCurrentPosition(cur);prepareRouteMeasurements();}
function resetEco(){
  state.ecoScore={
    accelerationQualitySum:0,
    accelerationEvents:0,
    brakingQualitySum:0,
    brakingEvents:0,
    steadyQualitySum:0,
    steadySamples:0,
    currentScore:70,
    lastSpeed:null,
    lastLat:null,
    lastLng:null,
    measuredMeters:0,
    totalMeters:0,
    speedSamples:[],
    lastAccelerationLabel:"—",
    lastAccelerationClass:"rating-neutral",
    lastBrakingLabel:"—",
    lastBrakingClass:"rating-neutral",
    lastSteadyLabel:"—",
    lastSteadyClass:"rating-neutral"
  };
  updateEcoBadge(70);
}

function updateEco(cur){
  const e=state.ecoScore;
  const speed=Number(cur.speed||0);
  const now=Date.now();

  if(e.lastLat!==null && e.lastLng!==null){
    const moved=haversine(e.lastLat,e.lastLng,cur.lat,cur.lng);
    if(Number.isFinite(moved) && moved>=0 && moved<300){
      e.totalMeters+=moved;
      e.measuredMeters+=moved;
    }
  }

  e.lastLat=cur.lat;
  e.lastLng=cur.lng;

  e.speedSamples.push({time:now,speed,meters:e.totalMeters});
  e.speedSamples=e.speedSamples.filter(sample => now-sample.time<=18000 && e.totalMeters-sample.meters<=600);

  if(e.lastSpeed===null){
    e.lastSpeed=speed;
    return;
  }

  e.lastSpeed=speed;

  const oldest=e.speedSamples[0]||{speed,meters:e.totalMeters,time:now};
  const windowDelta=speed-oldest.speed;
  const windowMeters=Math.max(1,e.totalMeters-oldest.meters);
  const deltaPer100m=windowDelta/(windowMeters/100);

  if(speed>=10 && e.speedSamples.length>=3){
    const steadyStd=calculateSpeedStd(e.speedSamples);
    const steadyScore=Math.max(0,100-(steadyStd*18));
    e.steadyQualitySum+=steadyScore;
    e.steadySamples++;
    const steadyRating=ratingFromScore(steadyScore);
    e.lastSteadyLabel=steadyRating.label;
    e.lastSteadyClass=steadyRating.className;
  }

  if(windowDelta>0.8 && windowMeters>=15){
    const accelScore=Math.max(0,100-(Math.max(0,deltaPer100m)*9));
    e.accelerationQualitySum+=accelScore;
    e.accelerationEvents++;
    const accelRating=ratingFromScore(accelScore);
    e.lastAccelerationLabel=accelRating.label;
    e.lastAccelerationClass=accelRating.className;
  }

  if(windowDelta<-0.8 && windowMeters>=15){
    const brakeScore=Math.max(0,100-(Math.abs(Math.min(0,deltaPer100m))*8));
    e.brakingQualitySum+=brakeScore;
    e.brakingEvents++;
    const brakeRating=ratingFromScore(brakeScore);
    e.lastBrakingLabel=brakeRating.label;
    e.lastBrakingClass=brakeRating.className;
  }

  const a=avg(e.accelerationQualitySum,e.accelerationEvents,70);
  const b=avg(e.brakingQualitySum,e.brakingEvents,70);
  const st=avg(e.steadyQualitySum,e.steadySamples,65);
  const factor=e.totalMeters<1000?.85:e.totalMeters<3000?.95:1;
  const total=Math.round((a*.28+b*.28+st*.44)*factor);
  e.currentScore=total;
  updateEcoBadge(total);
}

function calculateSpeedStd(samples){
  if(!samples.length)return 0;
  const avgSpeed=samples.reduce((sum,s)=>sum+s.speed,0)/samples.length;
  const variance=samples.reduce((sum,s)=>sum+Math.pow(s.speed-avgSpeed,2),0)/samples.length;
  return Math.sqrt(variance);
}

function ratingFromScore(score){
  if(score<35)return{label:"Slap af Markus",className:"rating-awful"};
  if(score<55)return{label:"For voldsomt",className:"rating-bad"};
  if(score<72)return{label:"I orden",className:"rating-ok"};
  if(score<88)return{label:"Flot",className:"rating-good"};
  return{label:"Smukt",className:"rating-perfect"};
}

function updateEcoBadge(score){els.ecoScoreBadge.textContent=`Eco ${score}`;els.ecoScoreBadge.className="eco-badge "+(score>=82?"eco-ok":score>=58?"eco-mid":"eco-low");}
function avg(sum,count,fallback){return count>0?sum/count:fallback;}
async function requestWakeLock(){try{if("wakeLock"in navigator)wakeLock=await navigator.wakeLock.request("screen")}catch{}}
async function releaseWakeLock(){try{if(wakeLock){await wakeLock.release();wakeLock=null}}catch{}}
document.addEventListener("visibilitychange",()=>{if(document.visibilityState==="visible"&&state.navigationActive)requestWakeLock();});
