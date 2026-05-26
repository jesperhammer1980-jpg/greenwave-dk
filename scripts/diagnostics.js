const els = {};
let map;
let layers = [];
const API_ENDPOINTS = {
  prices: '/api/fuel-prices',
  osrm: 'https://router.project-osrm.org/route/v1/driving',
  nominatim: 'https://nominatim.openstreetmap.org/search',
  overpass: [
    'https://overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter',
    'https://overpass.osm.ch/api/interpreter'
  ]
};

document.addEventListener('DOMContentLoaded', () => {
  ['runBtn','startInput','destInput','fuelType','detour','summary','cards','rawOutput'].forEach(id => els[id]=document.getElementById(id));
  map = L.map('map', { zoomControl: false, attributionControl: false });
  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', { subdomains:'abcd', maxZoom:20 }).addTo(map);
  map.setView([55.6761,12.5683], 11);
  els.runBtn.addEventListener('click', runDiagnostics);
});

async function runDiagnostics() {
  setBusy(true);
  clearMap();
  const report = { startedAt: new Date().toISOString(), inputs: readInputs(), steps: {}, failures: [] };
  try {
    const start = await geocode(report.inputs.start);
    const dest = await geocode(report.inputs.destination);
    report.steps.geocode = { ok:true, start, dest };

    const route = await fetchRoute(start, dest);
    report.steps.route = { ok:true, distanceMeters: route.distance, durationSeconds: route.duration, geometryPoints: route.geometry.length, steps: route.steps.length };

    const routeMetrics = measureRoute(route.geometry);
    drawRoute(route.geometry, start, dest);

    const [priceResult, fuelResult, roadResult] = await Promise.allSettled([
      fetchPriceData(),
      fetchFuelStations(route.geometry),
      fetchRoadContext(route.geometry)
    ]);

    const priceData = unwrap(priceResult, report, 'priceApi') || { stations: [], sources: [] };
    const osmFuel = unwrap(fuelResult, report, 'osmFuel') || [];
    const roadContext = unwrap(roadResult, report, 'roadContext') || { ways: [], signals: [] };

    const pricedStations = normalizePriceStations(priceData.stations || []);
    const allFuelCandidates = dedupeStations([...pricedStations, ...osmFuel]);
    const withRouteDistances = attachRouteDistances(allFuelCandidates, route.geometry);
    const maxDetour = Number(report.inputs.maxDetourMeters);
    const nearRoute = withRouteDistances.filter(s => s.distanceToRoute <= maxDetour);
    const withPrices = nearRoute.map(s => s.fromPriceApi ? attachDirectPrice(s, report.inputs.fuelType) : attachMatchedPrice(s, priceData, report.inputs.fuelType));
    const pricedNearRoute = withPrices.filter(s => Number.isFinite(s.price));

    const speedWaysWithRouteDistances = attachWayRouteDistances(roadContext.ways || [], route.geometry);
    const matchedSpeedWays = speedWaysWithRouteDistances.filter(w => w.distanceToRoute <= 80);
    const signalsNearRoute = attachRouteDistances((roadContext.signals || []).map(s => ({ ...s, name: 'Signal' })), route.geometry).filter(s => s.distanceToRoute <= 50);

    report.steps.prices = summarizePriceData(priceData);
    report.steps.osmFuel = { total: osmFuel.length };
    report.steps.fuelCandidates = {
      apiStationsWithCoords: pricedStations.length,
      osmStations: osmFuel.length,
      combinedCandidates: allFuelCandidates.length,
      withinSelectedDetour: nearRoute.length,
      withSelectedFuelPrice: pricedNearRoute.length,
      nearestAny: withRouteDistances.sort((a,b)=>a.distanceToRoute-b.distanceToRoute).slice(0,10).map(shortStation),
      nearestWithPrice: withPrices.filter(s=>Number.isFinite(s.price)).sort((a,b)=>a.distanceToRoute-b.distanceToRoute).slice(0,10).map(shortStation)
    };
    report.steps.road = {
      maxspeedWaysFetched: (roadContext.ways || []).length,
      maxspeedWaysMatchedToRoute: matchedSpeedWays.length,
      trafficSignalsFetched: (roadContext.signals || []).length,
      trafficSignalsMatchedToRoute: signalsNearRoute.length,
      nearestMaxspeedWays: speedWaysWithRouteDistances.sort((a,b)=>a.distanceToRoute-b.distanceToRoute).slice(0,10).map(w=>({ maxspeed:w.maxspeed, distanceToRoute:Math.round(w.distanceToRoute), highway:w.highway || '' }))
    };

    drawFuel(withPrices);
    render(report, withPrices, matchedSpeedWays, signalsNearRoute, route);
  } catch (error) {
    report.failures.push({ stage:'fatal', message:error.message || String(error), stack:error.stack || '' });
    render(report, [], [], [], null);
  } finally {
    els.rawOutput.textContent = JSON.stringify(report, null, 2);
    setBusy(false);
  }
}

function readInputs() {
  return { start: els.startInput.value.trim(), destination: els.destInput.value.trim(), fuelType: els.fuelType.value, maxDetourMeters: Number(els.detour.value) };
}

function render(report, stations, speedWays, signals, route) {
  const priceStep = report.steps.prices || {};
  const fuelStep = report.steps.fuelCandidates || {};
  const roadStep = report.steps.road || {};
  const routeOk = !!report.steps.route?.ok;
  const pricedCount = fuelStep.withSelectedFuelPrice || 0;
  const fuelCount = fuelStep.withinSelectedDetour || 0;
  const maxspeedCount = roadStep.maxspeedWaysMatchedToRoute || 0;
  const recommendOk = maxspeedCount > 0;

  els.summary.innerHTML = [
    metric('Rute', routeOk ? 'OK' : 'FEJL', routeOk ? 'ok' : 'bad'),
    metric('Tankstationer', String(fuelCount), fuelCount > 0 ? 'ok' : 'bad'),
    metric('Priser', String(pricedCount), pricedCount > 0 ? 'ok' : 'bad'),
    metric('Maxspeed-match', String(maxspeedCount), maxspeedCount > 0 ? 'ok' : 'bad')
  ].join('');

  const stationsRows = stations.slice(0,15).map(s => `<tr><td>${esc(s.name)}</td><td>${formatDistance(s.distanceToRoute)}</td><td>${formatDistance(s.distanceAlongRoute)}</td><td>${Number.isFinite(s.price) ? s.price.toFixed(2).replace('.', ',') + ' kr/l' : '—'}</td><td>${esc(s.priceSource || '')}</td></tr>`).join('');
  const speedRows = speedWays.slice(0,15).map(w => `<tr><td>${w.maxspeed}</td><td>${formatDistance(w.distanceToRoute)}</td><td>${esc(w.highway || '')}</td></tr>`).join('');
  const signalRows = signals.slice(0,15).map(s => `<tr><td>${formatDistance(s.distanceToRoute)}</td><td>${formatDistance(s.distanceAlongRoute)}</td></tr>`).join('');

  els.cards.innerHTML = `
    <article class="card"><h2>Pris-API</h2><table><tr><td>API-stationer i alt</td><td>${priceStep.totalStations || 0}</td></tr><tr><td>Med koordinater</td><td>${priceStep.withCoordinates || 0}</td></tr><tr><td>Kilder OK</td><td>${esc((priceStep.okSources || []).join(', '))}</td></tr><tr><td>Kilder fejl</td><td>${esc((priceStep.failedSources || []).join(', '))}</td></tr></table></article>
    <article class="card"><h2>Route/Fuel pipeline</h2><table><tr><td>API-stationer med koordinater</td><td>${fuelStep.apiStationsWithCoords || 0}</td></tr><tr><td>OSM fuel-stationer</td><td>${fuelStep.osmStations || 0}</td></tr><tr><td>Kandidater samlet</td><td>${fuelStep.combinedCandidates || 0}</td></tr><tr><td>Inden for valgt afstand</td><td>${fuelStep.withinSelectedDetour || 0}</td></tr><tr><td>Med pris for valgt type</td><td>${fuelStep.withSelectedFuelPrice || 0}</td></tr></table></article>
    <article class="card"><h2>Tankstationer nær ruten</h2><table><thead><tr><th>Navn</th><th>Fra rute</th><th>Langs rute</th><th>Pris</th><th>Kilde</th></tr></thead><tbody>${stationsRows || '<tr><td colspan="5">Ingen</td></tr>'}</tbody></table></article>
    <article class="card"><h2>Maxspeed / signaler</h2><table><tr><td>Maxspeed ways hentet</td><td>${roadStep.maxspeedWaysFetched || 0}</td></tr><tr><td>Maxspeed ways matchet til rute</td><td>${roadStep.maxspeedWaysMatchedToRoute || 0}</td></tr><tr><td>Traffic signals hentet</td><td>${roadStep.trafficSignalsFetched || 0}</td></tr><tr><td>Traffic signals matchet</td><td>${roadStep.trafficSignalsMatchedToRoute || 0}</td></tr></table><h3>Nærmeste maxspeed</h3><table><thead><tr><th>Max</th><th>Afstand</th><th>Type</th></tr></thead><tbody>${speedRows || '<tr><td colspan="3">Ingen</td></tr>'}</tbody></table><h3>Signaler</h3><table><tbody>${signalRows || '<tr><td colspan="2">Ingen</td></tr>'}</tbody></table></article>
  `;
}

function metric(label, value, cls){ return `<div class="${cls}"><span>${esc(label)}</span><strong>${esc(value)}</strong></div>`; }
function unwrap(result, report, stage) { if (result.status === 'fulfilled') return result.value; report.failures.push({ stage, message: result.reason?.message || String(result.reason) }); return null; }

async function geocode(q) {
  const url = `${API_ENDPOINTS.nominatim}?format=jsonv2&limit=1&addressdetails=1&countrycodes=dk&q=${encodeURIComponent(q)}`;
  const r = await fetch(url);
  const data = await r.json();
  if (!data.length) throw new Error(`Geocode gav 0 resultater for: ${q}`);
  return { lat:Number(data[0].lat), lng:Number(data[0].lon), displayName:data[0].display_name };
}
async function fetchRoute(a,b) {
  const url = `${API_ENDPOINTS.osrm}/${a.lng},${a.lat};${b.lng},${b.lat}?overview=full&geometries=geojson&steps=true&alternatives=true`;
  const r = await fetch(url);
  const data = await r.json();
  if (!data.routes?.length) throw new Error('OSRM returnerede ingen rute');
  const route = data.routes.sort((x,y)=>x.duration-y.duration)[0];
  return { geometry: route.geometry.coordinates, distance: route.distance, duration: route.duration, steps: extractSteps(route) };
}
function extractSteps(route){ const out=[]; (route.legs||[]).forEach(l=>(l.steps||[]).forEach(s=>{const m=s.maneuver||{}; out.push({distance:s.distance||0,duration:s.duration||0,maneuverType:m.type||'',maneuverModifier:m.modifier||'',name:s.name||''});})); return out; }
async function fetchPriceData(){ const r=await fetch(`${API_ENDPOINTS.prices}?v=${Date.now()}`,{cache:'no-store'}); if(!r.ok) throw new Error(`/api/fuel-prices HTTP ${r.status}`); return await r.json(); }
function normalizePriceStations(stations){ return (stations||[]).filter(s=>Number.isFinite(Number(s.lat))&&Number.isFinite(Number(s.lng))).map(s=>({...s,id:`api-${s.sourceId||''}-${s.stationId||s.name||''}`,fromPriceApi:true,lat:Number(s.lat),lng:Number(s.lng),brand:s.brand||'',address:s.addressText||'',name:s.name||s.brand||'Prisstation'})); }
async function fetchFuelStations(geometry){
  const box = routeBbox(geometry, .08); const b=`${box.south},${box.west},${box.north},${box.east}`;
  const q=`[out:json][timeout:30];(node["amenity"="fuel"](${b});way["amenity"="fuel"](${b});relation["amenity"="fuel"](${b}););out center tags;`;
  const data = await runOverpass(q, 12000);
  return (data.elements||[]).map(normalizeOsmFuel).filter(Boolean);
}
function normalizeOsmFuel(e){ const lat=typeof e.lat==='number'?e.lat:e.center?.lat, lng=typeof e.lon==='number'?e.lon:e.center?.lon; if(!Number.isFinite(lat)||!Number.isFinite(lng)) return null; const t=e.tags||{}; return {id:`osm-${e.type}-${e.id}`,lat,lng,name:t.name||t.brand||t.operator||'OSM tankstation',brand:t.brand||t.operator||t.name||'',address:[t['addr:street'],t['addr:housenumber']].filter(Boolean).join(' '),postalCode:t['addr:postcode']||'',fromPriceApi:false}; }
async function fetchRoadContext(geometry){
  const box=routeBbox(geometry,.04); const b=`${box.south},${box.west},${box.north},${box.east}`;
  const q=`[out:json][timeout:25];(way["highway"]["maxspeed"](${b});node["highway"="traffic_signals"](${b}););out body geom;`;
  const data=await runOverpass(q,12000); const ways=[], signals=[];
  for (const e of data.elements||[]) {
    if (e.type==='way' && e.geometry?.length) { const ms=parseMaxspeed(e.tags?.maxspeed); if(ms) ways.push({id:e.id,maxspeed:ms,highway:e.tags?.highway||'',geometry:e.geometry.map(p=>[p.lat,p.lon])}); }
    if (e.type==='node' && e.tags?.highway==='traffic_signals') signals.push({id:e.id,lat:e.lat,lng:e.lon});
  }
  return { ways, signals };
}
async function runOverpass(query, timeoutMs){
  let last;
  for (const ep of API_ENDPOINTS.overpass) { try { const r=await fetchWithTimeout(ep,{method:'POST',headers:{'Content-Type':'text/plain;charset=UTF-8'},body:query},timeoutMs); if(r.ok) return await r.json(); last = new Error(`${ep} HTTP ${r.status}`); } catch(e){ last=e; } }
  throw last || new Error('Overpass fejlede');
}
function attachRouteDistances(stations, geometry){ const segs=[]; let cum=0; for(let i=1;i<geometry.length;i++){const a=geometry[i-1],b=geometry[i],len=haversine(a[1],a[0],b[1],b[0]); segs.push({start:a,end:b,startMeters:cum,length:len}); cum+=len;} return stations.map(s=>{let best=Infinity, along=Infinity; for(const seg of segs){const p=projectPointToSegment(s.lat,s.lng,seg.start[1],seg.start[0],seg.end[1],seg.end[0]); if(p.distanceMeters<best){best=p.distanceMeters; along=seg.startMeters+seg.length*p.t;}} return {...s,distanceToRoute:best,distanceAlongRoute:along};}); }
function attachWayRouteDistances(ways, geometry){ return ways.map(w=>{let best=Infinity; for (const gp of w.geometry) { const p=attachRouteDistances([{lat:gp[0],lng:gp[1]}], geometry)[0]; if(p.distanceToRoute<best) best=p.distanceToRoute; } return {...w,distanceToRoute:best}; }); }
function attachDirectPrice(s,fuelType){ const p=chooseProduct(s.prices||[],fuelType); return p?{...s,price:Number(p.price),priceProduct:p.productName||p.displayName||p.fuelType,priceSource:s.source}:{...s,price:null}; }
function attachMatchedPrice(s,data,fuelType){ let best=null; for(const c of data.stations||[]){const sc=scorePriceMatch(s,c); if(!best||sc>best.score) best={c,score:sc};} if(!best||best.score<50) return {...s,price:null}; const p=chooseProduct(best.c.prices||[],fuelType); return p?{...s,price:Number(p.price),priceProduct:p.productName||p.displayName||p.fuelType,priceSource:best.c.source}:{...s,price:null}; }
function scorePriceMatch(osm,p){ let score=0; if(normalizeBrand(osm.brand||osm.name)===normalizeBrand(p.brand||p.name)) score+=35; if(sharesToken(osm.name,p.name)) score+=20; if(sharesToken(osm.address,p.addressText)) score+=25; if(osm.postalCode&&p.postalCode&&String(osm.postalCode)===String(p.postalCode)) score+=18; if(Number.isFinite(Number(p.lat))&&Number.isFinite(Number(p.lng))){const m=haversine(osm.lat,osm.lng,Number(p.lat),Number(p.lng)); if(m<120)score+=60; else if(m<350)score+=46; else if(m<900)score+=28; else if(m<1800)score+=12;} return score; }
function chooseProduct(prices,type){ const c=(prices||[]).filter(p=>Number.isFinite(Number(p.price))), text=p=>normalizeText(`${p.code} ${p.octane} ${p.fuelType} ${p.productName} ${p.displayName}`); if(type==='diesel') return c.find(p=>/diesel/.test(text(p))&&!/premium|plus|extra|deluxe|hvo/.test(text(p)))||c.find(p=>/diesel/.test(text(p)))||null; if(type==='premiumDiesel') return c.find(p=>/diesel/.test(text(p))&&/premium|plus|extra|deluxe/.test(text(p)))||c.find(p=>/diesel/.test(text(p)))||null; if(type==='benzin98') return c.find(p=>/98|100|e5|oktan 98|oktan 100|blyfri 98/.test(text(p))&&!/diesel/.test(text(p)))||null; return c.find(p=>/95|e10|blyfri 95|miles 95|benzin|gasoline|petrol/.test(text(p))&&!/98|100|premium|diesel/.test(text(p)))||c.find(p=>/benzin|gasoline|petrol/.test(text(p))&&!/diesel/.test(text(p)))||null; }
function summarizePriceData(data){ const stations=data.stations||[], withCoordinates=stations.filter(s=>Number.isFinite(Number(s.lat))&&Number.isFinite(Number(s.lng))).length; return { totalStations:stations.length, withCoordinates, okSources:(data.sources||[]).filter(s=>s.ok).map(s=>`${s.name} (${s.stations})`), failedSources:(data.sources||[]).filter(s=>!s.ok).map(s=>`${s.name}: ${s.error||s.status||'fejl'}`) }; }
function shortStation(s){ return { name:s.name, brand:s.brand||'', distanceToRoute:Math.round(s.distanceToRoute), distanceAlongRoute:Math.round(s.distanceAlongRoute||0), price:Number.isFinite(s.price)?s.price:null, source:s.source||s.priceSource||'', fromPriceApi:!!s.fromPriceApi }; }
function drawRoute(g,start,dest){ const ll=g.map(p=>[p[1],p[0]]); layers.push(L.polyline(ll,{color:'#2b91ff',weight:6}).addTo(map)); layers.push(L.marker([start.lat,start.lng]).addTo(map)); layers.push(L.marker([dest.lat,dest.lng]).addTo(map)); map.fitBounds(layers[0].getBounds(),{padding:[40,40]}); }
function drawFuel(stations){ stations.slice(0,25).forEach(s=>{ const label=Number.isFinite(s.price)?s.price.toFixed(2):s.name.slice(0,8); layers.push(L.marker([s.lat,s.lng],{icon:L.divIcon({className:'fuel-marker',html:`<div style="background:#0c1728;color:#fff;border:1px solid #fff;border-radius:999px;padding:4px 8px;font-weight:900">⛽ ${esc(label)}</div>`})}).addTo(map)); }); }
function clearMap(){ layers.forEach(l=>map.removeLayer(l)); layers=[]; }
function routeBbox(g,pad){ let south=Infinity,west=Infinity,north=-Infinity,east=-Infinity; for(const p of g){south=Math.min(south,p[1]);north=Math.max(north,p[1]);west=Math.min(west,p[0]);east=Math.max(east,p[0]);} return {south:south-pad,west:west-pad,north:north+pad,east:east+pad}; }
function parseMaxspeed(v){ if(!v) return null; const t=String(v).toLowerCase(); if(t.includes('none')) return 130; const m=t.match(/\d+/); if(!m) return null; let s=Number(m[0]); if(t.includes('mph')) s=Math.round(s*1.60934); return s>=5&&s<=140?s:null; }
function measureRoute(g){ let total=0; for(let i=1;i<g.length;i++) total+=haversine(g[i-1][1],g[i-1][0],g[i][1],g[i][0]); return {total}; }
function formatDistance(m){ if(!Number.isFinite(m))return'—'; if(m<1000)return`${Math.round(m)} m`; return `${(m/1000).toFixed(1).replace('.', ',')} km`; }
function fetchWithTimeout(url,opt,ms){ const c=new AbortController(); const t=setTimeout(()=>c.abort(),ms); return fetch(url,{...opt,signal:c.signal}).finally(()=>clearTimeout(t)); }
function haversine(lat1,lng1,lat2,lng2){ const R=6371000,toRad=v=>v*Math.PI/180,dLat=toRad(lat2-lat1),dLng=toRad(lng2-lng1),a=Math.sin(dLat/2)**2+Math.cos(toRad(lat1))*Math.cos(toRad(lat2))*Math.sin(dLng/2)**2; return R*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a)); }
function projectPointToSegment(lat,lng,lat1,lng1,lat2,lng2){ const mLat=111320,mLng=111320*Math.cos(lat*Math.PI/180),px=lng*mLng,py=lat*mLat,ax=lng1*mLng,ay=lat1*mLat,bx=lng2*mLng,by=lat2*mLat,dx=bx-ax,dy=by-ay,len=dx*dx+dy*dy; if(!len)return{t:0,distanceMeters:Math.hypot(px-ax,py-ay)}; let t=((px-ax)*dx+(py-ay)*dy)/len; t=Math.max(0,Math.min(1,t)); return{t,distanceMeters:Math.hypot(px-(ax+t*dx),py-(ay+t*dy))}; }
function normalizeBrand(v){ const t=normalizeText(v); if(t.includes('circle'))return'circle k'; if(t.includes('ingo'))return'ingo'; if(t.includes('ok'))return'ok'; if(t.includes('uno'))return'uno-x'; return t; }
function normalizeText(v){ return String(v||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/æ/g,'ae').replace(/ø/g,'oe').replace(/å/g,'aa').replace(/[^a-z0-9]+/g,' ').trim(); }
function sharesToken(a,b){ const ignore=new Set(['vej','gade','alle','tank','station','automat','circle','ingo','uno','ok']); const at=normalizeText(a).split(' ').filter(t=>t.length>2&&!ignore.has(t)), bt=new Set(normalizeText(b).split(' ').filter(t=>t.length>2&&!ignore.has(t))); return at.some(t=>bt.has(t)); }
function dedupeStations(stations){ const seen=new Set(); return stations.filter(s=>{ const k=s.id||`${Math.round(s.lat*10000)}:${Math.round(s.lng*10000)}`; if(seen.has(k))return false; seen.add(k); return true; }); }
function setBusy(b){ els.runBtn.disabled=b; els.runBtn.textContent=b?'Tester...':'Kør test'; }
function esc(v){ return String(v??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;'); }
