const GREENWAVE_VERSION="v1.06-no-planning";
const SKEY="greenwave_dk_settings_v2",HKEY="greenwave_dk_history_v2";
const state={map:null,userMarker:null,destinationMarker:null,routeLine:null,routeGlow:null,fuelMarkers:[],currentPosition:null,destination:null,route:null,selectedAutocomplete:null,autocompleteTimer:null,watchId:null,stations:[],history:[],settings:{fuelType:"benzin95",maxFuelDetourMeters:2000,fuelAlongMeters:50000,fuelSort:"cheapest",routeMode:"fast"}};
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
async function refreshFuel(){if(!state.route)return;els.fuelRefreshBtn.disabled=true;els.fuelSummary.textContent="Henter tankstationer og priser...";try{const r=await fetch("/api/fuel-route",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({geometry:state.route.geometry,fuelType:state.settings.fuelType,maxDetourMeters:state.settings.maxFuelDetourMeters,fuelAlongMeters:state.settings.fuelAlongMeters})});const d=await r.json();if(!r.ok||!d.ok)throw new Error(d.error||`fuel-route ${r.status}`);state.stations=(d.stations||[]).map(s=>({...s,price:isValidFuelPrice(s.price)?Number(s.price):null,matchStatus:s.matchStatus||null,matchReason:s.matchReason||null,sourceStatus:s.sourceStatus||null,dataQuality:s.dataQuality||null})).sort(sortStations);renderFuel(d);renderGreenWaveFlow();drawFuelMarkers();}catch(e){console.error(e);els.fuelSummary.textContent=`Kunne ikke hente tankstationer: ${e.message}`;}finally{els.fuelRefreshBtn.disabled=false;}}
function renderFuel(d){const count=state.stations.length,priced=state.stations.filter(s=>isValidFuelPrice(s.price)).length;if(!count){const raw=fuelDebugValue(d,"rawElements");const norm=fuelDebugValue(d,"normalizedStations");const returned=d?.counts?.returned??d?.stations?.length??0;const api=d?.counts?.apiStations??d?.debug?.priceApi?.apiStations??"?";els.fuelSummary.textContent=`0 stationer. Debug: raw=${raw}, norm=${norm}, returned=${returned}, API=${api}, bbox=${JSON.stringify(d?.input?.routeBbox||d?.debug?.routeBox||d?.debug?.overpass?.bbox||{})}, errors=${(d?.debug?.errors||d?.debug?.overpass?.attempts?.map(a=>a.error||a.statusText||a.status).filter(Boolean)||[]).join(" | ")}`;els.fuelList.innerHTML="";return;}els.fuelSummary.textContent=`${count} stationer inden for ${fmtDist(state.settings.fuelAlongMeters)} langs ruten. ${priced} med kendt pris. Kilder: ${fuelSourceStatusSummary(d)}.`;els.fuelList.innerHTML=state.stations.slice(0,20).map(s=>{const hasPrice=isValidFuelPrice(s.price);const price=hasPrice?formatFuelPrice(s.price):"Pris ikke tilgængelig";const reason=stationPriceReason(s);const meta=[`${fmtDist(s.distanceAlongRoute)} langs ruten`,`${fmtDist(s.distanceToRoute)} fra ruten`,hasPrice&&s.priceProduct?s.priceProduct:"",hasPrice&&s.priceSource?`Pris fra ${s.priceSource}`:"",!hasPrice&&reason?reason:""].filter(Boolean).join(" · ");return `<article class="fuel-item"><div class="fuel-title"><span>${esc(s.name||"Tankstation")}</span><span class="fuel-price">${esc(price)}</span></div><div class="fuel-meta">${esc(meta)}</div><a target="_blank" href="https://www.google.com/maps/search/?api=1&query=${s.lat},${s.lng}">Åbn i Google Maps</a></article>`;}).join("");}
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
function applyDrivingModeSafeHide(){
  const active=document.body.classList.contains("greenwave-driving-mode");
  document.querySelectorAll(".greenwave-safe-hidden").forEach(el=>el.classList.remove("greenwave-safe-hidden"));
  if(!active)return;

  const nodes=[...document.querySelectorAll("section,article,aside,div")];
  for(const el of nodes){
    if(!el||el===document.body||el===document.documentElement)continue;
    if(el.id==="greenwave-flow-card"||el.id==="greenwave-driving-status"||el.id==="greenwave-version-badge")continue;
    if(el.closest("#greenwave-flow-card,#greenwave-driving-status"))continue;

    const rect=el.getBoundingClientRect();
    if(rect.height<35||rect.height>520||rect.width<180)continue;

    const text=(el.innerText||el.textContent||"").trim().toLowerCase();
    if(!text)continue;

    const hasInput=!!el.querySelector("input,textarea");
    const hasGoButton=[...el.querySelectorAll("button,a")].some(btn=>/^go$/i.test((btn.textContent||"").trim()));
    const isRecentSection=text.includes("seneste destinationer");
    const isFuelSection=text.includes("tankstationer langs ruten")||text.includes("stationer inden for");
    const isRecentItem=text.includes("ny mårumvej")||text.includes("herstedøstervej")||text.includes("lupinvej");
    const isDestinationSearch=hasInput&&(hasGoButton||text.includes("destination")||text.includes("mårumvej")||text.includes("herstedøstervej"));

    // Hide planning/search/fuel/recent cards only, never large layout containers.
    if(isRecentSection||isFuelSection||isRecentItem||isDestinationSearch){
      el.classList.add("greenwave-safe-hidden");
    }
  }
}
function setGreenWaveDrivingMode(active){
  document.body.classList.toggle("greenwave-driving-mode",!!active);
  state.greenwaveDrivingMode=!!active;
  renderGreenWaveDrivingStatus();
  applyDrivingModeSafeHide();
  setTimeout(applyDrivingModeSafeHide,250);
  setTimeout(applyDrivingModeSafeHide,1000);
}
function renderGreenWaveDrivingStatus(){
  const card=document.getElementById("greenwave-driving-status")||createGreenWaveDrivingStatus();
  const active=!!state.greenwaveDrivingMode;
  const hasRoute=state.route&&Array.isArray(state.route.geometry)&&state.route.geometry.length>1;
  const speed=state.position&&Number.isFinite(Number(state.position.speed))?Math.round(Number(state.position.speed)*3.6):null;
  card.innerHTML=`<div class="driving-status-title">${active?"GreenWave kører":"GreenWave klar"}</div><div class="driving-status-main">${active?(hasRoute?"Fokusvisning aktiv. Planlægning, adresser og tankstationer er skjult.":"Fokusvisning aktiv, men der mangler en rute."):"Tryk Start GreenWave for kørselsvisning."}</div><div class="driving-status-meta">${speed!=null?`Aktuel fart: ${speed} km/t · `:""}${GREENWAVE_VERSION}</div>${active?`<button type="button" id="greenwave-exit-driving" class="greenwave-exit-driving">Vis planlægning</button>`:""}`;const exit=card.querySelector("#greenwave-exit-driving");if(exit)exit.addEventListener("click",()=>setGreenWaveDrivingMode(false));
}
function createGreenWaveDrivingStatus(){
  ensureGreenWaveDrivingStyles();
  const card=document.createElement("section");
  card.id="greenwave-driving-status";
  card.className="greenwave-driving-status";
  const anchor=document.querySelector(".route-panel,.nav-panel,.fuel-panel,main,.app")||document.body;
  anchor.prepend(card);
  return card;
}
function ensureGreenWaveDrivingStyles(){
  if(document.getElementById("greenwave-driving-mode-style"))return;
  const style=document.createElement("style");
  style.id="greenwave-driving-mode-style";
  style.textContent=[
    ".greenwave-driving-status{margin:10px 0 12px;padding:12px 14px;border-radius:16px;border:1px solid rgba(116,255,165,.28);background:rgba(8,18,24,.9);box-shadow:0 8px 22px rgba(0,0,0,.22)}",
    ".driving-status-title{font-weight:900;color:#d7ffe3;margin-bottom:4px}",
    ".driving-status-main{font-weight:800}",
    ".driving-status-meta{font-size:.82rem;opacity:.78;margin-top:4px}.greenwave-exit-driving{margin-top:8px;border:1px solid rgba(255,255,255,.18);border-radius:999px;background:rgba(255,255,255,.08);color:#d7ffe3;padding:6px 10px;font-weight:800}.greenwave-driving-mode .greenwave-safe-hidden{display:none!important}.greenwave-driving-mode .destination-panel,.greenwave-driving-mode .search-panel,.greenwave-driving-mode .planner-panel,.greenwave-driving-mode [data-panel='destination'],.greenwave-driving-mode [data-section='destination'],.greenwave-driving-mode [data-panel='search']{display:none!important}",
    "body.greenwave-driving-mode .greenwave-safe-hidden{display:none!important}",
    "body.greenwave-driving-mode .greenwave-version-badge{background:rgba(16,58,38,.94);border-color:rgba(116,255,165,.7)}",
    "body.greenwave-driving-mode #greenwave-flow-card,body.greenwave-driving-mode #greenwave-driving-status{position:relative;z-index:5}",
    "body.greenwave-driving-mode .fuel-section-title{margin-top:10px}",
    "body.greenwave-driving-mode .fuel-item{font-size:.95rem}",
    "body.greenwave-driving-mode input,body.greenwave-driving-mode textarea{font-size:16px}"
  ].join("");
  document.head.appendChild(style);
}
function bindGreenWaveStartButtons(){
  const buttons=[...document.querySelectorAll("button,a")].filter(el=>/start\s*greenwave|greenwave/i.test((el.textContent||"").trim()));
  for(const btn of buttons){
    if(btn.dataset.greenwaveDrivingBound==="1")continue;
    btn.dataset.greenwaveDrivingBound="1";
    btn.addEventListener("click",()=>setGreenWaveDrivingMode(true));
  }
}
function initGreenWaveDrivingMode(){
  ensureGreenWaveDrivingStyles();
  renderGreenWaveDrivingStatus();
  bindGreenWaveStartButtons();
  setInterval(()=>{bindGreenWaveStartButtons();if(state.greenwaveDrivingMode){renderGreenWaveDrivingStatus();applyDrivingModeSafeHide();}},3000);
}
function greenWaveFlowAdvice(){
  const active=state.route&&Array.isArray(state.route.geometry)&&state.route.geometry.length>1;
  if(!active)return{title:"GreenWave",text:"Planlæg en rute for at få anbefalet jævn hastighed.",level:"neutral"};
  const speedKmh=state.position&&Number.isFinite(Number(state.position.speed))?Math.max(0,Number(state.position.speed)*3.6):null;
  const remaining=estimateRemainingRouteMeters();
  const target=estimateFlowTargetSpeedKmh(speedKmh,remaining);
  let text=`Hold ca. ${target} km/t for jævn kørsel. Aktuel fart: ${speedKmh==null?"GPS-fart afventer":Math.round(speedKmh)+" km/t"}.`;
  let level="good";
  if(speedKmh!=null&&speedKmh>target+8){text=`Sænk roligt mod ca. ${target} km/t. Aktuel fart: ${Math.round(speedKmh)} km/t.`;level="warn";}
  else if(speedKmh!=null&&speedKmh<target-10&&speedKmh>5){text=`Øg roligt mod ca. ${target} km/t, hvis fartgrænsen tillader det. Aktuel fart: ${Math.round(speedKmh)} km/t.`;level="neutral";}
  if(remaining&&remaining<700){text="Ruten er næsten færdig. Kør roligt og følg normal navigation.";level="neutral";}
  return{title:"GreenWave flow · v1.06-no-planning",text,level,targetSpeed:target,remainingMeters:remaining||null,currentSpeedKmh:speedKmh};
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
  box.innerHTML=`<div class="flow-title">${esc(advice.title)}</div><div class="flow-main">${esc(advice.text)}</div><div class="flow-meta">${advice.remainingMeters?`Ca. ${fmtDist(advice.remainingMeters)} tilbage · `:""}V1 bruger rute/GPS og er ikke live trafiklysdata.</div>`;renderGreenWaveDrivingStatus();
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
function stationPriceReason(s){if(s.matchReason)return s.matchReason;if(s.sourceStatus==="source-error")return"Priskilden fejler lige nu";if(s.matchStatus==="unsupported")return"Kæden er ikke understøttet";if(s.matchStatus==="no-specific-match")return"Stationen kunne ikke matches sikkert";if(s.matchStatus==="product-missing")return"Produktet findes ikke sikkert";return"";}
function fuelSourceStatusSummary(d){const src=d?.sources||[];if(!src.length)return fuelSourceLabel(d);return src.map(s=>`${sourceShortName(s.id)}:${s.ok?"OK":"FEJL"}`).join(" · ");}
function sourceShortName(id){if(id==="circlek-api")return"CircleK/INGO";if(id==="ok-api")return"OK";if(id==="unox-api")return"Uno-X";if(id==="q8-f24-api")return"Q8/F24";if(id==="circlek-list")return"Liste";return id||"kilde";}
function sortStations(a,b){const m=state.settings.fuelSort;if(m==="detour")return a.distanceToRoute-b.distanceToRoute;if(m==="upcoming")return a.distanceAlongRoute-b.distanceAlongRoute;const ap=isValidFuelPrice(a.price),bp=isValidFuelPrice(b.price);if(ap&&bp)return Number(a.price)-Number(b.price);if(ap)return-1;if(bp)return 1;return a.distanceAlongRoute-b.distanceAlongRoute;}
function drawRoute(g){if(!state.map||typeof L==="undefined")return;if(state.routeLine)state.map.removeLayer(state.routeLine);if(state.routeGlow)state.map.removeLayer(state.routeGlow);const ll=g.map(p=>[p[1],p[0]]);state.routeGlow=L.polyline(ll,{color:"#0a58ff",weight:12,opacity:.25}).addTo(state.map);state.routeLine=L.polyline(ll,{color:"#4aa3ff",weight:6,opacity:.95}).addTo(state.map);state.map.fitBounds(state.routeLine.getBounds(),{padding:[40,40]});}
function drawFuelMarkers(){if(!state.map||typeof L==="undefined")return;state.fuelMarkers.forEach(m=>state.map.removeLayer(m));state.fuelMarkers=[];state.stations.slice(0,20).forEach(s=>{const label=isValidFuelPrice(s.price)?formatFuelPriceShort(s.price):(s.brand||s.name||"Fuel").slice(0,8);state.fuelMarkers.push(L.marker([s.lat,s.lng],{icon:L.divIcon({className:"fuel-marker",html:esc(label)})}).addTo(state.map));});}
function updateCurrentMarker(p,center){if(!state.map||typeof L==="undefined")return;if(!state.userMarker)state.userMarker=L.circleMarker([p.lat,p.lng],{radius:9,color:"#8fb7ff",fillColor:"#2e78ff",fillOpacity:.9}).addTo(state.map);else state.userMarker.setLatLng([p.lat,p.lng]);if(center)state.map.setView([p.lat,p.lng],14);}
function updateDestinationMarker(d){if(!state.map||typeof L==="undefined")return;if(state.destinationMarker)state.map.removeLayer(state.destinationMarker);state.destinationMarker=L.marker([d.lat,d.lng]).addTo(state.map);}
function getCurrentPosition(){return new Promise((res,rej)=>{if(!navigator.geolocation)return rej(new Error("GPS ikke tilgængelig"));navigator.geolocation.getCurrentPosition(p=>res({lat:p.coords.latitude,lng:p.coords.longitude,speed:p.coords.speed||0}),e=>rej(new Error(e.message||"GPS-fejl")),{enableHighAccuracy:true,timeout:12000,maximumAge:3000});});}
function startGreenWave(){if(!navigator.geolocation)return;els.startBtn.disabled=true;els.stopBtn.disabled=false;state.watchId=navigator.geolocation.watchPosition(p=>{els.currentSpeed.textContent=Math.round(Math.max(0,(p.coords.speed||0)*3.6));updateCurrentMarker({lat:p.coords.latitude,lng:p.coords.longitude},false);},console.warn,{enableHighAccuracy:true,maximumAge:1000,timeout:10000});}
function stopGreenWave(){if(state.watchId)navigator.geolocation.clearWatch(state.watchId);state.watchId=null;els.startBtn.disabled=false;els.stopBtn.disabled=true;}
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

initGreenWaveDrivingMode();
