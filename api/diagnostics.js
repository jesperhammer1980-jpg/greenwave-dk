export default async function handler(request, response) {
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('Access-Control-Allow-Origin', '*');

  const from = String(request.query.from || '').trim();
  const to = String(request.query.to || '').trim();
  const fuelType = String(request.query.fuelType || 'benzin95');
  const maxDetour = Number(request.query.maxDetour || 2000);

  const result = {
    input: { from, to, fuelType, maxDetour },
    route: { ok: false },
    fuel: {},
    road: {},
    errors: []
  };

  try {
    const [fromGeo, toGeo] = await Promise.all([geocode(from), geocode(to)]);
    result.route.from = fromGeo;
    result.route.to = toGeo;

    const route = await routeOsrm(fromGeo, toGeo);
    result.route.ok = true;
    result.route.message = `${Math.round(route.distance)} m / ${Math.round(route.duration)} s / ${route.geometry.length} geometry points`;
    result.route.distance = route.distance;
    result.route.duration = route.duration;
    result.route.geometryPoints = route.geometry.length;

    const [priceData, osmFuel, roadContext] = await Promise.allSettled([
      fetchPriceData(),
      fetchOsmFuel(route.geometry),
      fetchRoadContext(route.geometry)
    ]);

    if (priceData.status === 'fulfilled') {
      const apiStations = (priceData.value.stations || []).filter(station => Number.isFinite(station.lat) && Number.isFinite(station.lng));
      const apiWithDistances = attachRouteDistances(apiStations, route.geometry);
      const within = apiWithDistances.filter(station => station.distanceToRoute <= maxDetour);
      const priced = within.filter(station => chooseProduct(station.prices || [], fuelType));
      result.fuel.priceApiStations = priceData.value.stations?.length || 0;
      result.fuel.priceApiStationsWithCoords = apiStations.length;
      result.fuel.withinDetour = within.length;
      result.fuel.pricedForFuelType = priced.length;
      result.fuel.sources = priceData.value.sources || [];
      result.fuel.nearest = apiWithDistances.sort((a,b)=>a.distanceToRoute-b.distanceToRoute).slice(0,8).map(s => ({ name:s.name, brand:s.brand, source:s.source, distanceToRoute:Math.round(s.distanceToRoute), distanceAlongRoute:Math.round(s.distanceAlongRoute), hasChosenPrice:!!chooseProduct(s.prices||[], fuelType) }));
    } else {
      result.errors.push(`fuel prices: ${priceData.reason?.message || priceData.reason}`);
    }

    if (osmFuel.status === 'fulfilled') {
      result.fuel.osmFuelStations = osmFuel.value.length;
      result.fuel.osmWithinDetour = attachRouteDistances(osmFuel.value, route.geometry).filter(s => s.distanceToRoute <= maxDetour).length;
    } else {
      result.errors.push(`OSM fuel: ${osmFuel.reason?.message || osmFuel.reason}`);
    }

    if (roadContext.status === 'fulfilled') {
      const ways = roadContext.value.ways || [];
      const signals = roadContext.value.signals || [];
      result.road.maxspeedWays = ways.length;
      result.road.maxspeedMatched = ways.filter(w => w.distanceToRoute <= 80).length;
      result.road.signalsFetched = signals.length;
      result.road.signalsMatched = signals.filter(s => s.distanceToRoute <= 60).length;
      result.road.nearestMaxspeed = ways.sort((a,b)=>a.distanceToRoute-b.distanceToRoute).slice(0,8).map(w => ({ maxspeed:w.maxspeed, distanceToRoute:Math.round(w.distanceToRoute), highway:w.highway }));
    } else {
      result.errors.push(`road context: ${roadContext.reason?.message || roadContext.reason}`);
    }
  } catch (error) {
    result.route.ok = false;
    result.route.message = error.message;
    result.errors.push(error.stack || error.message || String(error));
  }

  return response.status(200).json(result);
}

async function geocode(q) {
  const result = await geocodeAddress(q, 1);
  if (result.results.length) return { ...result.results[0], attempts: result.attempts };
  throw new Error(`Address not found: ${q} | attempts: ${JSON.stringify(result.attempts)}`);
}

async function routeOsrm(from, to) {
  const url = `https://router.project-osrm.org/route/v1/driving/${from.lng},${from.lat};${to.lng},${to.lat}?overview=full&geometries=geojson&steps=true&alternatives=true`;
  const r = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!r.ok) throw new Error(`OSRM HTTP ${r.status}`);
  const data = await r.json();
  if (!data.routes?.length) throw new Error(`OSRM returned no routes: ${data.code || 'unknown'}`);
  const route = data.routes[0];
  return { geometry:route.geometry.coordinates, distance:Number(route.distance||0), duration:Number(route.duration||0) };
}

async function fetchPriceData() {
  const url = absolute('/api/fuel-prices');
  const r = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!r.ok) throw new Error(`/api/fuel-prices HTTP ${r.status}`);
  return await r.json();
}

function absolute(path) {
  const base = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000';
  return `${base}${path}`;
}

async function fetchOsmFuel(geometry) {
  const bbox = routeBbox(geometry, 0.08);
  const b = `${bbox.south},${bbox.west},${bbox.north},${bbox.east}`;
  const query = `[out:json][timeout:25];(node["amenity"="fuel"](${b});way["amenity"="fuel"](${b});relation["amenity"="fuel"](${b}););out center tags;`;
  const data = await overpass(query);
  return (data.elements || []).map(normalizeFuelStation).filter(Boolean);
}

async function fetchRoadContext(geometry) {
  const bbox = routeBbox(geometry, 0.035);
  const b = `${bbox.south},${bbox.west},${bbox.north},${bbox.east}`;
  const query = `[out:json][timeout:25];(way["highway"]["maxspeed"](${b});node["highway"="traffic_signals"](${b}););out body geom;`;
  const data = await overpass(query);
  const ways = [];
  const signals = [];
  for (const e of data.elements || []) {
    if (e.type === 'way' && e.geometry?.length) {
      const maxspeed = parseMaxspeed(e.tags?.maxspeed);
      if (!maxspeed) continue;
      const line = e.geometry.map(p => [p.lat, p.lon]);
      ways.push({ id:e.id, maxspeed, highway:e.tags?.highway || '', geometry:line, distanceToRoute:minLineDistance(line, geometry) });
    }
    if (e.type === 'node' && e.tags?.highway === 'traffic_signals') {
      signals.push({ id:e.id, lat:e.lat, lng:e.lon });
    }
  }
  return { ways, signals:attachRouteDistances(signals, geometry) };
}

async function overpass(query) {
  const endpoints = ['https://overpass-api.de/api/interpreter','https://overpass.kumi.systems/api/interpreter','https://overpass.osm.ch/api/interpreter'];
  const errors = [];
  for (const endpoint of endpoints) {
    try {
      const r = await fetchWithTimeout(endpoint, { method:'POST', headers:{ 'Content-Type':'text/plain;charset=UTF-8' }, body:query }, 12000);
      if (r.ok) return await r.json();
      errors.push(`${endpoint} HTTP ${r.status}`);
    } catch (e) { errors.push(`${endpoint} ${e.message}`); }
  }
  throw new Error(`Overpass failed: ${errors.join(' | ')}`);
}

function normalizeFuelStation(e) {
  const lat = typeof e.lat === 'number' ? e.lat : e.center?.lat;
  const lng = typeof e.lon === 'number' ? e.lon : e.center?.lon;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const t = e.tags || {};
  return { id:`${e.type}-${e.id}`, lat, lng, name:t.name || t.brand || t.operator || 'Tankstation', brand:t.brand || t.operator || t.name || '' };
}

function attachRouteDistances(stations, geometry) {
  const segs=[]; let cum=0;
  for (let i=1;i<geometry.length;i++) { const a=geometry[i-1], b=geometry[i]; const len=haversine(a[1],a[0],b[1],b[0]); segs.push({start:a,end:b,startMeters:cum,length:len}); cum+=len; }
  return stations.map(s => {
    let best=Infinity, along=Infinity;
    for (const seg of segs) {
      const p=projectPointToSegment(s.lat,s.lng,seg.start[1],seg.start[0],seg.end[1],seg.end[0]);
      if (p.distanceMeters<best) { best=p.distanceMeters; along=seg.startMeters+seg.length*p.t; }
    }
    return { ...s, distanceToRoute:best, distanceAlongRoute:along };
  });
}

function minLineDistance(line, routeGeometry) {
  let best = Infinity;
  for (const p of line) {
    const d = attachRouteDistances([{ lat:p[0], lng:p[1] }], routeGeometry)[0]?.distanceToRoute ?? Infinity;
    best = Math.min(best, d);
  }
  return best;
}

function routeBbox(g,pad){let south=Infinity,west=Infinity,north=-Infinity,east=-Infinity;for(const p of g){south=Math.min(south,p[1]);north=Math.max(north,p[1]);west=Math.min(west,p[0]);east=Math.max(east,p[0]);}return{south:south-pad,west:west-pad,north:north+pad,east:east+pad};}
function parseMaxspeed(v){if(!v)return null;const t=String(v).toLowerCase();if(t.includes('none'))return 130;const m=t.match(/\d+/);if(!m)return null;let s=Number(m[0]);if(t.includes('mph'))s=Math.round(s*1.60934);return s>=5&&s<=140?s:null;}
function chooseProduct(prices,type){const c=prices.filter(p=>Number.isFinite(Number(p.price))),text=p=>normalizeText(`${p.code} ${p.octane} ${p.fuelType} ${p.productName} ${p.displayName}`);return c.find(p=>/95|e10|blyfri 95|miles 95|benzin|gasoline|petrol/.test(text(p))&&!/98|100|premium|diesel/.test(text(p)))||c.find(p=>/benzin|gasoline|petrol/.test(text(p))&&!/diesel/.test(text(p)))||null;}
function normalizeText(v){return String(v||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/æ/g,'ae').replace(/ø/g,'oe').replace(/å/g,'aa').replace(/[^a-z0-9]+/g,' ').trim();}
function haversine(lat1,lng1,lat2,lng2){const r=6371000,toRad=v=>v*Math.PI/180,dLat=toRad(lat2-lat1),dLng=toRad(lng2-lng1),a=Math.sin(dLat/2)**2+Math.cos(toRad(lat1))*Math.cos(toRad(lat2))*Math.sin(dLng/2)**2;return r*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));}
function projectPointToSegment(lat,lng,lat1,lng1,lat2,lng2){const mLat=111320,mLng=111320*Math.cos(lat*Math.PI/180),px=lng*mLng,py=lat*mLat,ax=lng1*mLng,ay=lat1*mLat,bx=lng2*mLng,by=lat2*mLat,dx=bx-ax,dy=by-ay,len=dx*dx+dy*dy;if(!len)return{t:0,distanceMeters:Math.hypot(px-ax,py-ay)};let t=((px-ax)*dx+(py-ay)*dy)/len;t=Math.max(0,Math.min(1,t));return{t,distanceMeters:Math.hypot(px-(ax+t*dx),py-(ay+t*dy))};}
async function fetchWithTimeout(url, options, timeoutMs){const c=new AbortController(),t=setTimeout(()=>c.abort(),timeoutMs);try{return await fetch(url,{...options,signal:c.signal});}finally{clearTimeout(t);}}


const DAWA_AUTOCOMPLETE = 'https://api.dataforsyningen.dk/autocomplete';
const DAWA_ADRESSER = 'https://api.dataforsyningen.dk/adresser';
const NOMINATIM = 'https://nominatim.openstreetmap.org/search';

function normalizeAddressInput(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .replace(/\s*,\s*/g, ', ')
    .trim();
}

function makeAddressVariants(input) {
  const trimmed = normalizeAddressInput(input);
  const noComma = trimmed.replace(/,/g, ' ').replace(/\s+/g, ' ').trim();
  const variants = [trimmed, noComma];
  const m = noComma.match(/^(.+?)\s+(\d{4})\s+(.+)$/);
  if (m) {
    variants.push(`${m[1]}, ${m[2]} ${m[3]}`);
    variants.push(`${m[1]} ${m[2]} ${m[3]}, Danmark`);
    variants.push(`${m[1]}, ${m[2]} ${m[3]}, Danmark`);
  }
  variants.push(`${noComma}, Danmark`);
  return [...new Set(variants.filter(Boolean))];
}

async function geocodeAddress(input, limit = 1) {
  const q = normalizeAddressInput(input);
  if (!q) throw new Error('Missing address');
  const attempts = [];

  const dawaAuto = await tryDawaAutocomplete(q, limit);
  attempts.push(dawaAuto.attempt);
  if (dawaAuto.results.length) return { results: dawaAuto.results, attempts };

  const dawaAddress = await tryDawaAdresser(q, limit);
  attempts.push(dawaAddress.attempt);
  if (dawaAddress.results.length) return { results: dawaAddress.results, attempts };

  const nominatim = await tryNominatim(q, limit);
  attempts.push(nominatim.attempt);
  if (nominatim.results.length) return { results: nominatim.results, attempts };

  return { results: [], attempts };
}

async function tryDawaAutocomplete(input, limit) {
  const variants = makeAddressVariants(input);
  const all = [];
  let lastAttempt = null;

  for (const q of variants) {
    const url = `${DAWA_AUTOCOMPLETE}?q=${encodeURIComponent(q)}&type=adresse&caretpos=${encodeURIComponent(String(q.length))}&fuzzy=true&per_side=${encodeURIComponent(String(Math.max(5, limit)))}`;
    try {
      const upstream = await fetch(url, { headers: { Accept: 'application/json' } });
      if (!upstream.ok) throw new Error(`DAWA autocomplete HTTP ${upstream.status}`);
      const data = await upstream.json();
      const items = Array.isArray(data) ? data : [];
      lastAttempt = { provider: 'DAWA autocomplete', ok: true, q, results: items.length };
      for (const item of items) {
        const normalized = normalizeDawaAutocomplete(item, input);
        if (normalized) all.push(normalized);
      }
      if (all.length) break;
    } catch (error) {
      return { attempt: { provider: 'DAWA autocomplete', ok: false, q, error: error.message }, results: [] };
    }
  }

  return { attempt: lastAttempt || { provider: 'DAWA autocomplete', ok: true, q: variants[0], results: 0 }, results: all.slice(0, limit) };
}

async function tryDawaAdresser(input, limit) {
  const variants = makeAddressVariants(input);
  const all = [];
  let lastAttempt = null;

  for (const q of variants) {
    const url = `${DAWA_ADRESSER}?q=${encodeURIComponent(q)}&struktur=mini&per_side=${encodeURIComponent(String(Math.max(5, limit)))}`;
    try {
      const upstream = await fetch(url, { headers: { Accept: 'application/json' } });
      if (!upstream.ok) throw new Error(`DAWA adresser HTTP ${upstream.status}`);
      const data = await upstream.json();
      const items = Array.isArray(data) ? data : [];
      lastAttempt = { provider: 'DAWA adresser', ok: true, q, results: items.length };
      for (const item of items) {
        const normalized = normalizeDawaAddress(item, input);
        if (normalized) all.push(normalized);
      }
      if (all.length) break;
    } catch (error) {
      return { attempt: { provider: 'DAWA adresser', ok: false, q, error: error.message }, results: [] };
    }
  }

  return { attempt: lastAttempt || { provider: 'DAWA adresser', ok: true, q: variants[0], results: 0 }, results: all.slice(0, limit) };
}

async function tryNominatim(input, limit) {
  const variants = makeAddressVariants(input);
  const all = [];
  let lastAttempt = null;

  for (const q of variants) {
    const url = `${NOMINATIM}?format=jsonv2&addressdetails=1&limit=${encodeURIComponent(String(Math.max(5, limit)))}&countrycodes=dk&q=${encodeURIComponent(q)}`;
    try {
      const upstream = await fetch(url, { headers: { Accept: 'application/json', 'User-Agent': 'GreenWave-DK-Companion/1.0 contact: jesperhammer1980@gmail.com' } });
      if (!upstream.ok) throw new Error(`Nominatim HTTP ${upstream.status}`);
      const data = await upstream.json();
      const items = Array.isArray(data) ? data : [];
      lastAttempt = { provider: 'Nominatim', ok: true, q, results: items.length };
      for (const item of items) {
        const lat = Number(item.lat);
        const lng = Number(item.lon);
        if (Number.isFinite(lat) && Number.isFinite(lng)) {
          all.push({ provider: 'Nominatim', lat, lng, displayName: item.display_name || input, raw: item });
        }
      }
      if (all.length) break;
    } catch (error) {
      return { attempt: { provider: 'Nominatim', ok: false, q, error: error.message }, results: [] };
    }
  }

  return { attempt: lastAttempt || { provider: 'Nominatim', ok: true, q: variants[0], results: 0 }, results: all.slice(0, limit) };
}

function normalizeDawaAutocomplete(item, fallback) {
  const data = item?.data || {};
  const lat = Number(data.y);
  const lng = Number(data.x);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { provider: 'DAWA autocomplete', lat, lng, displayName: item.tekst || data.betegnelse || fallback, dawaId: data.id || null, raw: item };
}

function normalizeDawaAddress(item, fallback) {
  const coords = item?.adgangsadresse?.adgangspunkt?.koordinater || item?.adgangspunkt?.koordinater || item?.adgangsadresse?.vejpunkt?.koordinater;
  if (!Array.isArray(coords) || coords.length < 2) return null;
  const lng = Number(coords[0]);
  const lat = Number(coords[1]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { provider: 'DAWA adresser', lat, lng, displayName: item.betegnelse || fallback, dawaId: item.id || null, raw: item };
}
