const GREENWAVE_VERSION="v1.11-gps-speed-real";
const SKEY="greenwave_dk_settings_v2",HKEY="greenwave_dk_history_v2";
const state={map:null,userMarker:null,destinationMarker:null,routeLine:null,routeGlow:null,fuelMarkers:[],currentPosition:null,destination:null,route:null,selectedAutocomplete:null,autocompleteTimer:null,watchId:null,previousGpsPosition:null,displayedSpeedKmh:null,position:null,stations:[],history:[],settings:{fuelType:"benzin95",maxFuelDetourMeters:2000,fuelAlongMeters:50000,fuelSort:"cheapest",routeMode:"fast"}};
const els={},ids=["map","destinationInput","goBtn","autocompleteResults","historySection","historyList","settingsBtn","settingsBackdrop","settingsModal","closeSettingsBtn","saveSettingsBtn","fuelTypeSelect","fuelDetourSelect","fuelAlongSelect","fuelSortSelect","routeModeSelect","statusText","recommendedSpeed","speedLimit","currentSpeed","reasonText","startBtn","stopBtn","recalcBtn","routeDistance","routeDuration","routeEta","fuelRefreshBtn","fuelSummary","fuelList"];
document.addEventListener("DOMContentLoaded",()=>{ids.forEach(id=>els[id]=document.getElementById(id));bind();loadSettings();loadHistory();initMap();syncSettingsUi();renderHistory();setStatus("Klar");});
function bind(){on(els.destinationInput,"input",()=>{state.selectedAutocomplete=null;clearTimeout(state.autocompleteTimer);state.autocompleteTimer=setTimeout(searchAutocomplete,250);});on(els.goBtn,"click",calculateRoute);on(els.startBtn,"click",startGreenWave);on(els.stopBtn,"click",stopGreenWave);on(els.recalcBtn,"click",calculateRoute);on(els.fuelRefreshBtn,"click",refreshFuel);on(els.settingsBtn,"click",openSettings);on(els.closeSettingsBtn,"click",closeSettings);on(els.settingsBackdrop,"click",closeSettings);on(els.saveSettingsBtn,"click",saveSettings);document.addEventListener("click",e=>{if(!e.target.closest(".search-card")&&!e.target.closest(".autocomplete"))hideAutocomplete();});}
function on(el,ev,fn){if(el)el.addEventListener(ev,fn);}
function initMap(){if(typeof L==="undefined"){setStatus("Kort kunne ikke indlæses.");return;}state.map=L.map("map",{zoomControl:false,attributionControl:false,preferCanvas:true});L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",{subdomains:"abcd",maxZoom:20}).addTo(state.map);state.map.setView([55.6761,12.5683],10);}
async function searchAutocomplete(){const q=els.destinationInput.value.trim();if(q.length<2){hideAutocomplete();return;}try{const r=await fetch(`/api/geocode?q=${encodeURIComponent(q)}&limit=6&mode=suggest`,{cache:"no-store"});const d=await r.json();const items=Array.isArray(d)?d:(d.results||[]);if(!items.length){hideAutocomplete();return;}els.autocompleteResults.innerHTML=items.map((it,i)=>{const label=it.displayName||it.label||"Ukendt adresse",p=splitAddress(label);return `<button type="button" data-index="${i}"><strong>${esc(p.title)}</strong><small>${esc(p.subtitle)}</small></button>`;}).join("");els.autocompleteResults.classList.remove("hidden");[...els.autocompleteResults.querySelectorAll("button")].forEach(b=>b.addEventListener("click",()=>{const it=items[Number(b.dataset.index)],label=it.displayName||it.label||"Destination",p=splitAddress(label);state.selectedAutocomplete={lat:Number(it.lat),lng:Number(it.lng??it.lon),label:p.title,displayName:label};els.destinationInput.value=p.title;hideAutocomplete();}));}catch(e){console.warn(e);hideAutocomplete();}}
function hideAutocomplete(){els.autocompleteResults?.classList.add("hidden");}
async function calculateRoute(){const q=els.destinationInput.value.trim();if(!q){alert("Indtast en destination.");return;}try{setStatus("Finder position og beregner rute...");els.goBtn.disabled=true;els.startBtn.disabled=true;els.recalcBtn.disabled=true;els.fuelRefreshBtn.disabled=true;const pos=await getCurrentPosition();state.currentPosition=pos;updateCurrentMarker(pos,true);const dest=state.selectedAutocomplete||await geocode(q);state.destination=dest;updateDestinationMarker(dest);saveHistory(dest);renderHistory();const route=await fetchRoute(pos,dest);applyRoute(route);els.startBtn.disabled=false;els.recalcBtn.disabled=false;els.fuelRefreshBtn.disabled=false;setStatus("Rute klar. Henter tankstationer...");await refreshFuel();}catch(e){console.error(e);setStatus(`Fejl: ${e.message}`);}finally{els.goBtn.disabled=false;}}
async function geocode(q){const r=await fetch(`/api/geocode?q=${encodeURIComponent(q)}&limit=1`,{cache:"no-store"});const d=await r.json();const it=Array.isArray(d)?d[0]:(d.result||d.results?.[0]);if(!r.ok||!it)throw new Error(d.message||d.error||"Adresse ikke fundet");const lat=Number(it.lat),lng=Number(it.lng??it.lon);if(!Number.isFinite(lat)||!Number.isFinite(lng))throw new Error("Adresse uden koordinater");const label=it.displayName||it.label||q;return{lat,lng,label:splitAddress(label).title,displayName:label};}
async function fetchRoute(from,to){const r=await fetch(`/api/route?fromLat=${from.lat}&fromLng=${from.lng}&toLat=${to.lat}&toLng=${to.lng}&mode=${encodeURIComponent(state.settings.routeMode)}`,{cache:"no-store"});const d=await r.json();if(!r.ok||!d.routes?.length)throw new Error(d.error||"Ingen rute fundet");const route=selectRoute(d.routes);return{geometry:normalizeGeometry(route.geometry?.coordinates||route.geometry),distance:Number(route.distance||0),duration:Number(route.duration||0)};}
function selectRoute(routes){if(state.settings.routeMode!=="eco")return routes[0];return[...routes].sort((a,b)=>(a.distance+a.duration*4)-(b.distance+b.duration*4))[0];}
function applyRoute(route){state.route=route;drawRoute(route.geometry);updateTrip(route);els.recommendedSpeed.textContent="--";els.speedLimit.textContent="?";els.reasonText.textContent="Maxhastighed ukendt på dette vejstykke.";}
async function refreshFuel(){if(!state.route)return;els.fuelRefreshBtn.disabled=true;els.fuelSummary.textContent="Henter tankstationer og priser...";try{const r=await fetch("/api/fuel-route",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({geometry:state.route.geometry,fuelType:state.settings.fuelType,maxDetourMeters:state.settings.maxFuelDetourMeters,fuelAlongMeters:state.settings.fuelAlongMeters})});const d=await r.json();if(!r.ok||!d.ok)throw new Error(d.error||`fuel-route ${r.status}`);state.stations=(d.stations||[]).map(s=>({...s,price:isValidFuelPrice(s.price)?Number(s.price):null,matchStatus:s.matchStatus||null,matchReason:s.matchReason||null,sourceStatus:s.sourceStatus||null,dataQuality:s.dataQuality||null})).sort(sortFuelStations);renderFuel(d);renderGreenWaveFlow();drawFuelMarkers();}catch(e){console.error(e);els.fuelSummary.textContent=`Kunne ikke hente tankstationer: ${e.message}`;}finally{els.fuelRefreshBtn.disabled=false;}}
function renderFuel(d){const count=state.stations.length,priced=state.stations.filter(s=>isValidFuelPrice(s.price)).length;if(!count){const raw=fuelDebugValue(d,"rawElements");const norm=fuelDebugValue(d,"normalizedStations");const returned=d?.counts?.returned??d?.stations?.length??0;const api=d?.counts?.apiStations??d?.debug?.priceApi?.apiStations??"?";els.fuelSummary.textContent=`0 stationer. Debug: raw=${raw}, norm=${norm}, returned=${returned}, API=${api}, bbox=${JSON.stringify(d?.input?.routeBbox||d?.debug?.routeBox||d?.debug?.overpass?.bbox||{})}, errors=${(d?.debug?.errors||d?.debug?.overpass?.attempts?.map(a=>a.error||a.statusText||a.status).filter(Boolean)||[]).join(" | ")}`;els.fuelList.innerHTML="";return;}els.fuelSummary.textContent=`${count} stationer inden for ${fmtDist(state.settings.fuelAlongMeters)} langs ruten. ${priced} med kendt pris. Kilder: ${fuelSourceStatusSummary(d)}.`;els.fuelList.innerHTML=state.stations.slice(0,20).map(s=>{const hasPrice=isValidFuelPrice(s.price);const price=hasPrice?formatFuelPrice(s.price):"Pris ikke tilgængelig";const reason=stationPriceReason(s);const sortReason=stationSortReasonLabel(s);const meta=[hasPrice&&sortReason?sortReason:"",`${fmtDist(s.distanceAlongRoute)} langs ruten`,`${fmtDist(s.distanceToRoute)} fra ruten`,hasPrice&&s.priceProduct?s.priceProduct:"",hasPrice&&s.priceSource?`Pris fra ${s.priceSource}`:"",!hasPrice&&reason?reason:""].filter(Boolean).join(" · ");return `<article class="fuel-item"><div class="fuel-title"><span>${esc(s.name||"Tankstation")}</span><span class="fuel-price">${esc(price)}</span></div><div class="fuel-meta">${esc(meta)}</div><a target="_blank" href="https://www.google.com/maps/search/?api=1&query=${s.lat},${s.lng}">Åbn i Google Maps</a></article>`;}).join("");}
function renderGreenWaveVersionBadge(){
  let badge=document.getElementById("greenwave-version-badge");
  if(!badge){
    badge=document.createElement("div");
    badge.id="greenwave-version-badge";
    badge.className="greenwave-version-badge";
    document.body.appendChild(badge);
  }
  badge.textContent=`GreenWave ${GREENWAVE_VERSION}`;
}
function ensureGreenWaveVersionStyles(){
  if(document.getElementById("greenwave-version-style"))return;
  const style=document.createElement("style");
  style.id="greenwave-version-style";
  style.textContent=".greenwave-version-badge{position:fixed;right:10px;bottom:10px;z-index:99999;padding:6px 9px;border-radius:999px;background:rgba(8,18,24,.88);border:1px solid rgba(116,255,165,.42);color:#d7ffe3;font:700 11px/1.1 system-ui,-apple-system,Segoe UI,sans-serif;box-shadow:0 8px 22px rgba(0,0,0,.35);pointer-events:none}";
  document.head.appendChild(style);
}
function initGreenWaveVersionBadge(){
  ensureGreenWaveVersionStyles();
  renderGreenWaveVersionBadge();
}
function initGreenWaveFrontCleanup(){
  ensureGreenWaveFrontCleanupStyles();
  cleanupGreenWaveFrontCards();
  setInterval(cleanupGreenWaveFrontCards,2500);
}
function cleanupGreenWaveFrontCards(){
  const nodes=[...document.querySelectorAll("section,article,div")];
  for(const el of nodes){
    if(!el||el===document.body||el===document.documentElement)continue;
    if(el.closest("#greenwave-driving-dashboard"))continue;
    if(el.id==="greenwave-flow-card"||el.id==="greenwave-driving-status"||el.id==="greenwave-version-badge")continue;

    const rect=el.getBoundingClientRect();
    if(rect.width<80||rect.width>330||rect.height<45||rect.height>170)continue;

    const text=(el.innerText||el.textContent||"").trim().toLowerCase().replace(/\s+/g," ");
    const isOldSpeedCard=
      (text.includes("anbefalet")&&text.includes("km/t"))||
      (text.includes("max")&&text.includes("km/t"))||
      (text.includes("aktuel")&&text.includes("km/t"));

    if(isOldSpeedCard){
      el.classList.add("greenwave-front-hidden");
    }
  }
}
function ensureGreenWaveFrontCleanupStyles(){
  if(document.getElementById("greenwave-front-cleanup-style"))return;
  const style=document.createElement("style");
  style.id="greenwave-front-cleanup-style";
  style.textContent=".greenwave-front-hidden{display:none!important}";
  document.head.appendChild(style);
}
function initGreenWaveDrivingDashboard(){
  ensureGreenWaveDrivingDashboardStyles();
  bindGreenWaveDashboardButtons();
  setInterval(()=>{bindGreenWaveDashboardButtons();if(state.greenwaveDrivingMode)renderGreenWaveDrivingDashboard();},1000);
}
function bindGreenWaveDashboardButtons(){
  const buttons=[...document.querySelectorAll("button,a")].filter(el=>/start\s*greenwave/i.test((el.textContent||"").trim()));
  for(const btn of buttons){
    if(btn.dataset.greenwaveDashboardBound==="1")continue;
    btn.dataset.greenwaveDashboardBound="1";
    btn.addEventListener("click",()=>openGreenWaveDrivingDashboard());
  }
}
function openGreenWaveDrivingDashboard(){
  state.greenwaveDrivingMode=true;
  document.body.classList.add("greenwave-driving-dashboard-active");
  let dash=document.getElementById("greenwave-driving-dashboard");
  if(!dash){
    dash=document.createElement("section");
    dash.id="greenwave-driving-dashboard";
    dash.className="greenwave-driving-dashboard";
    document.body.appendChild(dash);
  }
  renderGreenWaveDrivingDashboard();
}
function closeGreenWaveDrivingDashboard(){
  state.greenwaveDrivingMode=false;
  document.body.classList.remove("greenwave-driving-dashboard-active");
  const dash=document.getElementById("greenwave-driving-dashboard");
  if(dash)dash.remove();
}
function renderGreenWaveDrivingDashboard(){
  const dash=document.getElementById("greenwave-driving-dashboard");
  if(!dash)return;

  const advice=typeof greenWaveFlowAdvice==="function"?greenWaveFlowAdvice():{text:"GreenWave flow afventer rute/GPS.",level:"neutral"};
  const speedKmh=Number.isFinite(Number(state.displayedSpeedKmh))?Math.max(0,Number(state.displayedSpeedKmh)):null;
  const routeDistance=Number(state.route?.distance||0);
  const routeDuration=Number(state.route?.duration||0);
  const remaining=typeof estimateRemainingRouteMeters==="function"?estimateRemainingRouteMeters():routeDistance;
  const etaText=routeDuration?formatEtaFromNow(routeDuration):"--";
  const target=advice.targetSpeed?Math.round(advice.targetSpeed):"--";
  const current=speedKmh==null?"--":Math.round(speedKmh);
  const distanceText=remaining?fmtDist(remaining):routeDistance?fmtDist(routeDistance):"--";
  const destination=currentDestinationText();
  const routeReady=state.route&&Array.isArray(state.route.geometry)&&state.route.geometry.length>1;

  dash.innerHTML=`
    <div class="drive-topbar">
      <div><span class="drive-dot"></span>GreenWave</div>
      <div class="drive-version">${GREENWAVE_VERSION}</div>
    </div>
    <div class="drive-destination">${esc(destination||"Rute aktiv")}</div>
    <div class="drive-grid">
      <div class="drive-card drive-card-primary">
        <div class="drive-label">Anbefalet</div>
        <div class="drive-value">${esc(String(target))}<span>km/t</span></div>
      </div>
      <div class="drive-card">
        <div class="drive-label">Aktuel</div>
        <div class="drive-value">${esc(String(current))}<span>km/t</span></div>
      </div>
      <div class="drive-card">
        <div class="drive-label">Afstand</div>
        <div class="drive-value drive-small">${esc(distanceText)}</div>
      </div>
      <div class="drive-card">
        <div class="drive-label">ETA</div>
        <div class="drive-value drive-small">${esc(etaText)}</div>
      </div>
    </div>
    <div class="drive-advice" data-level="${esc(advice.level||"neutral")}">
      ${esc(routeReady?advice.text:"Rute/GPS mangler. Start eller genberegn ruten.")}
    </div>
    <div class="drive-note">Kørselsvisning: planlægning, adressevalg, seneste destinationer og tankstationer er skjult.</div>
    <div class="drive-actions">
      <button type="button" class="drive-exit" id="greenwave-dashboard-exit">Vis planlægning</button>
    </div>
  `;

  const exit=dash.querySelector("#greenwave-dashboard-exit");
  if(exit)exit.addEventListener("click",closeGreenWaveDrivingDashboard);
}
function currentDestinationText(){
  const input=document.querySelector("input");
  const value=input&&input.value?input.value.trim():"";
  if(value)return value;
  const heading=[...document.querySelectorAll("h1,h2,h3,.destination,.route-title")].map(el=>(el.textContent||"").trim()).find(Boolean);
  return heading||"";
}
function formatEtaFromNow(seconds){
  const d=new Date(Date.now()+Number(seconds)*1000);
  return d.toLocaleTimeString("da-DK",{hour:"2-digit",minute:"2-digit"});
}
function ensureGreenWaveDrivingDashboardStyles(){
  if(document.getElementById("greenwave-driving-dashboard-style"))return;
  const style=document.createElement("style");
  style.id="greenwave-driving-dashboard-style";
  style.textContent=`
    body.greenwave-driving-dashboard-active{overflow:hidden!important}
    .greenwave-driving-dashboard{
      position:fixed;inset:0;z-index:2147483000;
      padding:calc(env(safe-area-inset-top,0px) + 18px) 18px calc(env(safe-area-inset-bottom,0px) + 18px);
      background:radial-gradient(circle at top,#123324 0,#061018 42%,#02070c 100%);
      color:#f5fff8;font-family:system-ui,-apple-system,Segoe UI,sans-serif;
      display:flex;flex-direction:column;gap:16px;box-sizing:border-box;
    }
    .drive-topbar{display:flex;align-items:center;justify-content:space-between;font-weight:900;letter-spacing:.02em}
    .drive-dot{display:inline-block;width:10px;height:10px;border-radius:50%;background:#36f279;margin-right:8px;box-shadow:0 0 14px rgba(54,242,121,.75)}
    .drive-version{font-size:12px;opacity:.68}
    .drive-destination{font-size:22px;font-weight:900;line-height:1.15;min-height:28px}
    .drive-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}
    .drive-card{border:1px solid rgba(255,255,255,.12);border-radius:22px;background:rgba(7,18,30,.82);padding:16px 14px;box-shadow:0 10px 30px rgba(0,0,0,.25)}
    .drive-card-primary{background:linear-gradient(135deg,rgba(21,96,58,.96),rgba(7,18,30,.9));border-color:rgba(96,255,157,.38)}
    .drive-label{text-transform:uppercase;font-weight:900;font-size:12px;color:rgba(245,255,248,.68);letter-spacing:.08em;margin-bottom:8px}
    .drive-value{font-size:54px;font-weight:1000;line-height:.95}
    .drive-value span{font-size:18px;margin-left:5px}
    .drive-small{font-size:34px}
    .drive-advice{border:1px solid rgba(96,255,157,.32);border-radius:22px;background:rgba(11,36,25,.9);padding:18px;font-size:22px;font-weight:900;line-height:1.2}
    .drive-advice[data-level='warn']{border-color:rgba(255,193,91,.55);background:rgba(75,48,16,.92)}
    .drive-note{font-size:13px;opacity:.72;line-height:1.35}
    .drive-actions{margin-top:auto;display:flex;gap:12px}
    .drive-exit{width:100%;border:1px solid rgba(255,255,255,.16);border-radius:18px;padding:15px;background:rgba(255,255,255,.08);color:#f5fff8;font-weight:900;font-size:17px}
  `;
  document.head.appendChild(style);
}
function greenWaveFlowAdvice(){
  const active=state.route&&Array.isArray(state.route.geometry)&&state.route.geometry.length>1;
  if(!active)return{title:"GreenWave",text:"Planlæg en rute for at få anbefalet jævn hastighed.",level:"neutral"};
  const speedKmh=Number.isFinite(Number(state.displayedSpeedKmh))?Math.max(0,Number(state.displayedSpeedKmh)):null;
  const remaining=estimateRemainingRouteMeters();
  const target=estimateFlowTargetSpeedKmh(speedKmh,remaining);
  let text=`Hold ca. ${target} km/t for jævn kørsel. Aktuel fart: ${speedKmh==null?"GPS-fart afventer":Math.round(speedKmh)+" km/t"}.`;
  let level="good";
  if(speedKmh!=null&&speedKmh>target+8){text=`Sænk roligt mod ca. ${target} km/t. Aktuel fart: ${Math.round(speedKmh)} km/t.`;level="warn";}
  else if(speedKmh!=null&&speedKmh<target-10&&speedKmh>5){text=`Øg roligt mod ca. ${target} km/t, hvis fartgrænsen tillader det. Aktuel fart: ${Math.round(speedKmh)} km/t.`;level="neutral";}
  if(remaining&&remaining<700){text="Ruten er næsten færdig. Kør roligt og følg normal navigation.";level="neutral";}
  return{title:"GreenWave flow · v1.11-gps-speed-real",text,level,targetSpeed:target,remainingMeters:remaining||null,currentSpeedKmh:speedKmh};
}
function estimateFlowTargetSpeedKmh(speedKmh,remainingMeters){
  const base=Number.isFinite(speedKmh)&&speedKmh>70?70:50;
  if(remainingMeters&&remainingMeters<1500)return Math.min(base,45);
  if(Number.isFinite(speedKmh)&&speedKmh<35)return 40;
  return base;
}
function estimateRemainingRouteMeters(){
  if(!state.route||!Array.isArray(state.route.geometry)||!state.route.geometry.length)return null;
  const pos=state.position;
  if(!pos||!Number.isFinite(Number(pos.lat))||!Number.isFinite(Number(pos.lng)))return Number(state.route.distance||0)||null;
  let nearestIndex=0,nearestDistance=Infinity;
  for(let i=0;i<state.route.geometry.length;i++){
    const p=state.route.geometry[i];
    const d=distanceMeters(pos.lat,pos.lng,p[0],p[1]);
    if(d<nearestDistance){nearestDistance=d;nearestIndex=i;}
  }
  let remaining=0;
  for(let i=nearestIndex;i<state.route.geometry.length-1;i++){
    const a=state.route.geometry[i],b=state.route.geometry[i+1];
    remaining+=distanceMeters(a[0],a[1],b[0],b[1]);
  }
  return remaining;
}
function renderGreenWaveFlow(){
  const box=document.getElementById("greenwave-flow-card")||createGreenWaveFlowCard();
  const advice=greenWaveFlowAdvice();
  box.dataset.level=advice.level;
  box.innerHTML=`<div class="flow-title">${esc(advice.title)}</div><div class="flow-main">${esc(advice.text)}</div><div class="flow-meta">${advice.remainingMeters?`Ca. ${fmtDist(advice.remainingMeters)} tilbage · `:""}V1 bruger rute/GPS og er ikke live trafiklysdata.</div>`;
}
function createGreenWaveFlowCard(){
  ensureGreenWaveFlowStyles();
  const card=document.createElement("section");
  card.id="greenwave-flow-card";
  card.className="greenwave-flow-card";
  const anchor=document.querySelector(".route-panel,.nav-panel,.fuel-panel,main,.app")||document.body;
  anchor.prepend(card);
  return card;
}
function ensureGreenWaveFlowStyles(){
  if(document.getElementById("greenwave-flow-style"))return;
  const style=document.createElement("style");
  style.id="greenwave-flow-style";
  style.textContent=".greenwave-flow-card{margin:10px 0 12px;padding:12px 14px;border:1px solid rgba(116,255,165,.25);border-radius:16px;background:linear-gradient(135deg,rgba(24,78,54,.92),rgba(10,18,24,.92));box-shadow:0 8px 22px rgba(0,0,0,.22)}.greenwave-flow-card[data-level='warn']{border-color:rgba(255,194,102,.45);background:linear-gradient(135deg,rgba(92,62,18,.92),rgba(10,18,24,.92))}.flow-title{font-weight:900;color:#d7ffe3;margin-bottom:4px}.flow-main{font-size:1rem;font-weight:700}.flow-meta{font-size:.82rem;opacity:.78;margin-top:4px}";
  document.head.appendChild(style);
}
function stationSortReasonLabel(s){
  if(!isValidFuelPrice(s.price))return"";
  const m=Number(s.distanceToRoute||0);
  if(m<=50)return"Næsten på ruten";
  if(m<=250)return"Meget tæt på ruten";
  if(m<=750)return"Acceptabel omvej";
  if(m<=1500)return"Stor omvej";
  return"Lang omvej";
}
function stationPriceReason(s){if(s.matchReason)return s.matchReason;if(s.sourceStatus==="source-error")return"Priskilden fejler lige nu";if(s.matchStatus==="unsupported")return"Kæden er ikke understøttet";if(s.matchStatus==="no-specific-match")return"Stationen kunne ikke matches sikkert";if(s.matchStatus==="product-missing")return"Produktet findes ikke sikkert";return"";}
function fuelSourceStatusSummary(d){const src=d?.sources||[];if(!src.length)return fuelSourceLabel(d);return src.map(s=>`${sourceShortName(s.id)}:${s.ok?"OK":"FEJL"}`).join(" · ");}
function sourceShortName(id){if(id==="circlek-api")return"CircleK/INGO";if(id==="ok-api")return"OK";if(id==="unox-api")return"Uno-X";if(id==="q8-f24-api")return"Q8/F24";if(id==="circlek-list")return"Liste";return id||"kilde";}
function sortFuelStations(a,b){
  const aPriced=isValidFuelPrice(a.price);
  const bPriced=isValidFuelPrice(b.price);
  if(aPriced&&!bPriced)return-1;
  if(!aPriced&&bPriced)return 1;

  if(aPriced&&bPriced){
    const aScore=fuelStopSortScore(a);
    const bScore=fuelStopSortScore(b);
    return aScore-bScore||
      Number(a.distanceToRoute||0)-Number(b.distanceToRoute||0)||
      Number(a.price)-Number(b.price)||
      Number(a.distanceAlongRoute||0)-Number(b.distanceAlongRoute||0);
  }

  return Number(a.distanceToRoute||0)-Number(b.distanceToRoute||0)||
    Number(a.distanceAlongRoute||0)-Number(b.distanceAlongRoute||0);
}
function fuelStopSortScore(s){
  const price=Number(s.price);
  const detourKm=Math.max(0,Number(s.distanceToRoute||0))/1000;
  const alongKm=Math.max(0,Number(s.distanceAlongRoute||0))/1000;
  const qualityPenalty=s.dataQuality==="list-price"?0.08:0;
  // Practical score: price matters, but detour matters a lot.
  // 1 km off route counts roughly as +0.35 kr/l in practical inconvenience.
  return price+(detourKm*0.35)+(alongKm*0.002)+qualityPenalty;
}
function sortStations(a,b){const m=state.settings.fuelSort;if(m==="detour")return a.distanceToRoute-b.distanceToRoute;if(m==="upcoming")return a.distanceAlongRoute-b.distanceAlongRoute;const ap=isValidFuelPrice(a.price),bp=isValidFuelPrice(b.price);if(ap&&bp)return Number(a.price)-Number(b.price);if(ap)return-1;if(bp)return 1;return a.distanceAlongRoute-b.distanceAlongRoute;}
function drawRoute(g){if(!state.map||typeof L==="undefined")return;if(state.routeLine)state.map.removeLayer(state.routeLine);if(state.routeGlow)state.map.removeLayer(state.routeGlow);const ll=g.map(p=>[p[1],p[0]]);state.routeGlow=L.polyline(ll,{color:"#0a58ff",weight:12,opacity:.25}).addTo(state.map);state.routeLine=L.polyline(ll,{color:"#4aa3ff",weight:6,opacity:.95}).addTo(state.map);state.map.fitBounds(state.routeLine.getBounds(),{padding:[40,40]});}
function drawFuelMarkers(){if(!state.map||typeof L==="undefined")return;state.fuelMarkers.forEach(m=>state.map.removeLayer(m));state.fuelMarkers=[];state.stations.slice(0,20).forEach(s=>{const label=isValidFuelPrice(s.price)?formatFuelPriceShort(s.price):(s.brand||s.name||"Fuel").slice(0,8);state.fuelMarkers.push(L.marker([s.lat,s.lng],{icon:L.divIcon({className:"fuel-marker",html:esc(label)})}).addTo(state.map));});}
function updateCurrentMarker(p,center){if(!state.map||typeof L==="undefined")return;if(!state.userMarker)state.userMarker=L.circleMarker([p.lat,p.lng],{radius:9,color:"#8fb7ff",fillColor:"#2e78ff",fillOpacity:.9}).addTo(state.map);else state.userMarker.setLatLng([p.lat,p.lng]);if(center)state.map.setView([p.lat,p.lng],14);}
function updateDestinationMarker(d){if(!state.map||typeof L==="undefined")return;if(state.destinationMarker)state.map.removeLayer(state.destinationMarker);state.destinationMarker=L.marker([d.lat,d.lng]).addTo(state.map);}
function handleGpsPosition(p,center){
  const current={lat:p.coords.latitude,lng:p.coords.longitude,timestamp:p.timestamp||Date.now()};
  const nativeSpeedKmh=Number.isFinite(Number(p.coords.speed))&&Number(p.coords.speed)>=0?Number(p.coords.speed)*3.6:null;
  const fallbackSpeedKmh=calculateFallbackSpeedKmh(current,state.previousGpsPosition);
  let measuredSpeedKmh=nativeSpeedKmh;
  if(!Number.isFinite(measuredSpeedKmh)&&Number.isFinite(fallbackSpeedKmh))measuredSpeedKmh=fallbackSpeedKmh;
  if(Number.isFinite(measuredSpeedKmh)&&measuredSpeedKmh>180)measuredSpeedKmh=null;

  if(Number.isFinite(measuredSpeedKmh)){
    const previous=Number.isFinite(Number(state.displayedSpeedKmh))?Number(state.displayedSpeedKmh):measuredSpeedKmh;
    state.displayedSpeedKmh=(previous*0.65)+(measuredSpeedKmh*0.35);
    if(els.currentSpeed)els.currentSpeed.textContent=Math.round(state.displayedSpeedKmh);
    if(els.statusText)els.statusText.textContent=`GPS-fart ${Math.round(state.displayedSpeedKmh)} km/t`;
  }else{
    if(els.currentSpeed)els.currentSpeed.textContent="--";
    if(els.statusText)els.statusText.textContent="GPS-fart afventer";
  }

  state.previousGpsPosition=current;
  state.position={lat:current.lat,lng:current.lng,speed:Number.isFinite(Number(state.displayedSpeedKmh))?Number(state.displayedSpeedKmh)/3.6:null,timestamp:current.timestamp};
  state.currentPosition=state.position;
  updateCurrentMarker({lat:current.lat,lng:current.lng},!!center);

  if(typeof renderGreenWaveDrivingDashboard==="function"&&state.greenwaveDrivingMode)renderGreenWaveDrivingDashboard();
  if(typeof renderGreenWaveFlow==="function")renderGreenWaveFlow();

  console.log("GPS speed",{raw:p.coords.speed,calculatedFallback:fallbackSpeedKmh,displayed:state.displayedSpeedKmh});
}
function calculateFallbackSpeedKmh(current,previous){
  if(!current||!previous)return null;
  const seconds=(Number(current.timestamp)-Number(previous.timestamp))/1000;
  if(!Number.isFinite(seconds)||seconds<1||seconds>30)return null;
  const meters=distanceMeters(previous.lat,previous.lng,current.lat,current.lng);
  const kmh=(meters/seconds)*3.6;
  if(!Number.isFinite(kmh)||kmh<0||kmh>180)return null;
  return kmh;
}
function getCurrentPosition(){return new Promise((res,rej)=>{if(!navigator.geolocation)return rej(new Error("GPS ikke tilgængelig"));navigator.geolocation.getCurrentPosition(p=>{handleGpsPosition(p,true);res({lat:p.coords.latitude,lng:p.coords.longitude,speed:Number.isFinite(Number(state.displayedSpeedKmh))?Number(state.displayedSpeedKmh)/3.6:0});},e=>rej(new Error(e.message||"GPS-fejl")),{enableHighAccuracy:true,timeout:12000,maximumAge:3000});});}
function startGreenWave(){if(!navigator.geolocation){setStatus("GPS ikke tilgængelig");return;}els.startBtn.disabled=true;els.stopBtn.disabled=false;state.previousGpsPosition=null;state.displayedSpeedKmh=null;if(els.currentSpeed)els.currentSpeed.textContent="--";if(els.statusText)els.statusText.textContent="GPS-fart afventer";state.watchId=navigator.geolocation.watchPosition(p=>handleGpsPosition(p,false),e=>{console.warn(e);if(els.statusText)els.statusText.textContent=e.message||"GPS-fejl";},{enableHighAccuracy:true,maximumAge:1000,timeout:10000});}
function stopGreenWave(){if(state.watchId)navigator.geolocation.clearWatch(state.watchId);state.watchId=null;els.startBtn.disabled=false;els.stopBtn.disabled=true;state.previousGpsPosition=null;}
function updateTrip(r){els.routeDistance.textContent=fmtDist(r.distance);els.routeDuration.textContent=fmtDur(r.duration);els.routeEta.textContent=new Date(Date.now()+r.duration*1000).toLocaleTimeString("da-DK",{hour:"2-digit",minute:"2-digit"});}
function loadSettings(){try{state.settings={...state.settings,...JSON.parse(localStorage.getItem(SKEY)||"{}")};}catch{}}
function saveSettings(){state.settings.fuelType=els.fuelTypeSelect.value;state.settings.maxFuelDetourMeters=Number(els.fuelDetourSelect.value);state.settings.fuelAlongMeters=Number(els.fuelAlongSelect.value);state.settings.fuelSort=els.fuelSortSelect.value;state.settings.routeMode=els.routeModeSelect.value;localStorage.setItem(SKEY,JSON.stringify(state.settings));closeSettings();if(state.route)refreshFuel();}
function syncSettingsUi(){els.fuelTypeSelect.value=state.settings.fuelType;els.fuelDetourSelect.value=String(state.settings.maxFuelDetourMeters);els.fuelAlongSelect.value=String(state.settings.fuelAlongMeters);els.fuelSortSelect.value=state.settings.fuelSort;els.routeModeSelect.value=state.settings.routeMode;}
function openSettings(){els.settingsBackdrop.classList.remove("hidden");els.settingsModal.classList.remove("hidden");syncSettingsUi();}function closeSettings(){els.settingsBackdrop.classList.add("hidden");els.settingsModal.classList.add("hidden");}
function loadHistory(){try{state.history=JSON.parse(localStorage.getItem(HKEY)||"[]");}catch{state.history=[];}}function saveHistory(d){state.history=[d,...state.history.filter(x=>x.label!==d.label)].slice(0,5);localStorage.setItem(HKEY,JSON.stringify(state.history));}function renderHistory(){if(!state.history.length){els.historySection.classList.add("hidden");return;}els.historySection.classList.remove("hidden");els.historyList.innerHTML=state.history.map((h,i)=>`<button type="button" data-index="${i}"><strong>${esc(h.label)}</strong><small>${esc(h.displayName||"")}</small></button>`).join("");[...els.historyList.querySelectorAll("button")].forEach(b=>b.addEventListener("click",()=>{const h=state.history[Number(b.dataset.index)];state.selectedAutocomplete=h;els.destinationInput.value=h.label;}));}
function setStatus(t){els.statusText.textContent=t;}function splitAddress(t){const p=String(t||"").split(",").map(x=>x.trim()).filter(Boolean);return{title:p[0]||t,subtitle:p.slice(1).join(", ")}}function normalizeGeometry(g){return(g||[]).map(p=>Array.isArray(p)?[Number(p[0]),Number(p[1])]:[Number(p.lng??p.lon),Number(p.lat)]).filter(p=>Number.isFinite(p[0])&&Number.isFinite(p[1]));}function isValidFuelPrice(value){const price=Number(value);return Number.isFinite(price)&&price>=5&&price<=30;}function formatFuelPrice(value){return isValidFuelPrice(value)?`${Number(value).toFixed(2).replace(".",",")} kr/l`:"Pris ikke tilgængelig";}function formatFuelPriceShort(value){return isValidFuelPrice(value)?Number(value).toFixed(2).replace(".",","):"";}function fuelSourceLabel(d){const sources=Array.isArray(d?.sources)?d.sources:[],names=[];const has=id=>sources.some(s=>s?.id===id&&s.ok&&(Number(s.stations)>0||Number(s.products)>0));const add=name=>{if(!names.includes(name))names.push(name);};if(has("circlek-api")||has("circlek-list"))add("Circle K / INGO");if(has("ok-api"))add("OK");if(has("unox-api"))add("Uno-X");if(has("q8-f24-api"))add("Q8 / F24");return names.length?joinDanish(names):"ingen aktive priskilder";}function joinDanish(items){return items.length<=1?items[0]:`${items.slice(0,-1).join(", ")} og ${items[items.length-1]}`;}function fuelDebugValue(d,key){return d?.debug?.overpass?.[key]??d?.debug?.[key]??d?.counts?.[key]??"?";}function fmtDist(m){return m>=1000?`${(m/1000).toFixed(m>=10000?0:1).replace(".",",")} km`:`${Math.round(m)} m`;}function fmtDur(sec){const min=Math.round(sec/60);return min<60?`${min} min`:`${Math.floor(min/60)} t ${min%60} min`;}function esc(v){return String(v??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]));}

setInterval(renderGreenWaveFlow,5000);
setTimeout(renderGreenWaveFlow,500);

initGreenWaveVersionBadge();

initGreenWaveDrivingDashboard();

initGreenWaveFrontCleanup();
