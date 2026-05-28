const CIRCLEK_COUNTRY_URL = 'https://api.circlek.com/eu/prices/v1/fuel/countries/DK';
const CIRCLEK_LIST_PRICE_URL = 'https://www.circlek.dk/erhverv/braendstof/priser';

export default async function handler(request, response) {
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('Access-Control-Allow-Origin', '*');

  const from = String(request.query.from || 'Lupinvej 3, 3390 Hundested').trim();
  const to = String(request.query.to || 'Herstedøstervej 27, 2620 Albertslund').trim();
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
    const [fromGeo, toGeo] = await Promise.all([
      geocodeViaApi(request, from),
      geocodeViaApi(request, to)
    ]);

    result.route.from = fromGeo;
    result.route.to = toGeo;

    const route = await routeOsrm(fromGeo, toGeo);
    result.route.ok = true;
    result.route.distance = route.distance;
    result.route.duration = route.duration;
    result.route.geometryPoints = route.geometry.length;
    result.route.message = `${Math.round(route.distance)} m / ${Math.round(route.duration)} s / ${route.geometry.length} geometry points`;

    const [corridor, priceData] = await Promise.allSettled([
      fetchCorridorData(route.geometry, maxDetour),
      fetchPriceData()
    ]);

    let fuelStations = [];
    let maxspeedWays = [];
    let signals = [];

    if (corridor.status === 'fulfilled') {
      fuelStations = corridor.value.fuelStations;
      maxspeedWays = corridor.value.maxspeedWays;
      signals = corridor.value.signals;
    } else {
      result.errors.push(`corridor: ${corridor.reason?.message || corridor.reason}`);
    }

    let prices = { stations: [], sources: [], listPrices: {} };

    if (priceData.status === 'fulfilled') {
      prices = priceData.value;
    } else {
      result.errors.push(`prices: ${priceData.reason?.message || priceData.reason}`);
    }

    const fuelWithRoute = attachRouteDistances(fuelStations, route.geometry)
      .filter(station => station.distanceToRoute <= maxDetour)
      .map(station => attachPrice(station, prices, fuelType))
      .sort((a, b) => {
        if (Number.isFinite(a.price) && Number.isFinite(b.price)) return a.price - b.price;
        if (Number.isFinite(a.price)) return -1;
        if (Number.isFinite(b.price)) return 1;
        return a.distanceAlongRoute - b.distanceAlongRoute;
      });

    const apiStationsWithCoords = (prices.stations || []).filter(station => Number.isFinite(station.lat) && Number.isFinite(station.lng));
    const apiWithRoute = attachRouteDistances(apiStationsWithCoords, route.geometry)
      .filter(station => station.distanceToRoute <= maxDetour)
      .map(station => attachDirectPrice(station, fuelType));

    const combinedFuel = dedupeStations([...apiWithRoute, ...fuelWithRoute])
      .filter(station => station.distanceToRoute <= maxDetour)
      .sort((a, b) => {
        if (Number.isFinite(a.price) && Number.isFinite(b.price)) return a.price - b.price;
        if (Number.isFinite(a.price)) return -1;
        if (Number.isFinite(b.price)) return 1;
        return a.distanceAlongRoute - b.distanceAlongRoute;
      });

    result.fuel.priceApiStations = prices.stations?.length || 0;
    result.fuel.priceApiStationsWithCoords = apiStationsWithCoords.length;
    result.fuel.sources = prices.sources || [];
    result.fuel.circleKListPrices = prices.listPrices || {};
    result.fuel.osmFuelStations = fuelStations.length;
    result.fuel.candidatesTotal = fuelStations.length + apiStationsWithCoords.length;
    result.fuel.withinDetour = combinedFuel.length;
    result.fuel.pricedForFuelType = combinedFuel.filter(station => Number.isFinite(station.price)).length;
    result.fuel.nearest = combinedFuel.slice(0, 15).map(station => ({
      name: station.name,
      brand: station.brand,
      price: station.price ?? null,
      priceProduct: station.priceProduct || null,
      priceSource: station.priceSource || null,
      distanceToRoute: Math.round(station.distanceToRoute),
      distanceAlongRoute: Math.round(station.distanceAlongRoute)
    }));

    const waysWithRoute = maxspeedWays
      .map(way => ({ ...way, distanceToRoute: minLineDistance(way.geometry, route.geometry) }))
      .sort((a, b) => a.distanceToRoute - b.distanceToRoute);

    const signalsWithRoute = attachRouteDistances(signals, route.geometry)
      .filter(signal => signal.distanceToRoute <= 80)
      .sort((a, b) => a.distanceAlongRoute - b.distanceAlongRoute);

    result.road.maxspeedWays = maxspeedWays.length;
    result.road.maxspeedMatched = waysWithRoute.filter(way => way.distanceToRoute <= 120).length;
    result.road.signalsFetched = signals.length;
    result.road.signalsMatched = signalsWithRoute.length;
    result.road.nearestMaxspeed = waysWithRoute.slice(0, 12).map(way => ({
      maxspeed: way.maxspeed,
      highway: way.highway,
      distanceToRoute: Math.round(way.distanceToRoute)
    }));
    result.road.signals = signalsWithRoute.slice(0, 12).map(signal => ({
      distanceToRoute: Math.round(signal.distanceToRoute),
      distanceAlongRoute: Math.round(signal.distanceAlongRoute)
    }));

  } catch (error) {
    result.route.ok = false;
    result.route.message = error.message;
    result.errors.push(error.stack || error.message || String(error));
  }

  return response.status(200).json(result);
}

async function geocodeViaApi(request, address) {
  const url = `${originFromRequest(request)}/api/geocode?q=${encodeURIComponent(address)}&limit=1&debug=1`;
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  const data = await res.json();

  const item = Array.isArray(data) ? data[0] : (data.result || data.results?.[0]);

  if (!res.ok || !item) {
    throw new Error(`geocode failed for ${address}: ${data.message || data.error || res.status}`);
  }

  const lat = Number(item.lat);
  const lng = Number(item.lng ?? item.lon);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    throw new Error(`geocode returned invalid coordinates for ${address}: ${JSON.stringify(item)}`);
  }

  return {
    lat,
    lng,
    displayName: item.displayName || item.label || address,
    provider: item.provider || data.provider || 'unknown',
    raw: item.raw || null,
    attempts: data.attempts || item.attempts || []
  };
}

function originFromRequest(request) {
  const host = request.headers['x-forwarded-host'] || request.headers.host || process.env.VERCEL_URL || 'localhost:3000';
  const proto = request.headers['x-forwarded-proto'] || (String(host).includes('localhost') ? 'http' : 'https');
  return `${proto}://${host}`;
}

async function routeOsrm(from, to) {
  const url = `https://router.project-osrm.org/route/v1/driving/${from.lng},${from.lat};${to.lng},${to.lat}?overview=full&geometries=geojson&steps=true&alternatives=true`;
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`OSRM HTTP ${res.status}`);

  const data = await res.json();
  if (!data.routes?.length) throw new Error(`OSRM returned no routes: ${data.code || 'unknown'}`);

  const route = data.routes[0];

  return {
    geometry: route.geometry.coordinates,
    distance: Number(route.distance || 0),
    duration: Number(route.duration || 0)
  };
}

async function fetchCorridorData(geometry, maxDetour) {
  const samples = sampleRoute(geometry, 18);
  const fuelRadius = clamp(Number(maxDetour || 2000) + 500, 1200, 3500);
  const maxspeedRadius = 160;
  const signalRadius = 180;

  const parts = [];

  for (const point of samples) {
    parts.push(`node(around:${fuelRadius},${point.lat},${point.lng})["amenity"="fuel"];`);
    parts.push(`way(around:${fuelRadius},${point.lat},${point.lng})["amenity"="fuel"];`);
    parts.push(`relation(around:${fuelRadius},${point.lat},${point.lng})["amenity"="fuel"];`);
    parts.push(`way(around:${maxspeedRadius},${point.lat},${point.lng})["highway"]["maxspeed"];`);
    parts.push(`node(around:${signalRadius},${point.lat},${point.lng})["highway"="traffic_signals"];`);
  }

  const query = `[out:json][timeout:35];(${parts.join('\n')});out center tags geom;`;
  const data = await overpass(query);
  const fuelStations = [];
  const maxspeedWays = [];
  const signals = [];

  for (const element of data.elements || []) {
    if (isFuelElement(element)) {
      const station = normalizeFuelStation(element);
      if (station) fuelStations.push(station);
    }

    if (element.type === 'way' && element.tags?.highway && element.tags?.maxspeed && element.geometry?.length) {
      const maxspeed = parseMaxspeed(element.tags.maxspeed);

      if (maxspeed) {
        maxspeedWays.push({
          id: element.id,
          highway: element.tags.highway || '',
          maxspeed,
          geometry: element.geometry.map(point => [point.lat, point.lon])
        });
      }
    }

    if (element.type === 'node' && element.tags?.highway === 'traffic_signals') {
      signals.push({
        id: element.id,
        lat: element.lat,
        lng: element.lon
      });
    }
  }

  return {
    fuelStations: dedupeStations(fuelStations),
    maxspeedWays: dedupeById(maxspeedWays),
    signals: dedupeById(signals)
  };
}

function isFuelElement(element) {
  return element?.tags?.amenity === 'fuel';
}

async function overpass(query) {
  const endpoints = [
    'https://overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter',
    'https://overpass.osm.ch/api/interpreter'
  ];

  const errors = [];

  for (const endpoint of endpoints) {
    try {
      const res = await fetchWithTimeout(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
        body: query
      }, 18000);

      if (res.ok) return await res.json();

      errors.push(`${endpoint} HTTP ${res.status}`);
    } catch (error) {
      errors.push(`${endpoint} ${error.message}`);
    }
  }

  throw new Error(`Overpass failed: ${errors.join(' | ')}`);
}

async function fetchPriceData() {
  const [circleK, listPrices] = await Promise.allSettled([
    fetchCircleKBulk(),
    fetchCircleKListPrices()
  ]);

  const stations = [];
  const sources = [];

  if (circleK.status === 'fulfilled') {
    sources.push({ id: 'circlek-api', name: 'Circle K / INGO station API', ok: true, stations: circleK.value.length });
    stations.push(...circleK.value);
  } else {
    sources.push({ id: 'circlek-api', name: 'Circle K / INGO station API', ok: false, error: circleK.reason?.message || String(circleK.reason) });
  }

  let list = {};
  if (listPrices.status === 'fulfilled') {
    list = listPrices.value;
    sources.push({ id: 'circlek-list-prices', name: 'Circle K official list prices', ok: true, products: Object.keys(list).length });
  } else {
    sources.push({ id: 'circlek-list-prices', name: 'Circle K official list prices', ok: false, error: listPrices.reason?.message || String(listPrices.reason) });
  }

  return {
    sources,
    stations: dedupeStations(stations),
    listPrices: list
  };
}

async function fetchCircleKBulk() {
  const res = await fetch(CIRCLEK_COUNTRY_URL, {
    headers: {
      Accept: 'application/json',
      'X-App-Name': 'PRICES'
    }
  });

  if (!res.ok) throw new Error(`Circle K API HTTP ${res.status}`);

  const data = await res.json();
  const sites = Array.isArray(data.sites) ? data.sites : [];

  return sites.map(site => normalizeCircleKSite(site)).filter(Boolean);
}

function normalizeCircleKSite(site) {
  const prices = normalizePrices(site.fuelPrices || site.prices || site.fuels || site.products || []);
  const address = site.address || {};
  const brand = String(site.name || '').toLowerCase().includes('ingo') ? 'INGO' : 'Circle K';

  return {
    id: `circlek-${site.id || site.siteId || site.name || Math.random()}`,
    source: 'Circle K / INGO station API',
    sourceId: 'circlek-api',
    stationId: String(site.id || site.siteId || ''),
    name: site.name || brand,
    brand,
    addressText: [address.street, address.houseNumber, address.addressLine1].filter(Boolean).join(' '),
    postalCode: String(address.postalCode || ''),
    city: address.city || '',
    lat: parseNumber(site.latitude || site.lat || site.coordinates?.latitude || site.location?.lat),
    lng: parseNumber(site.longitude || site.lng || site.coordinates?.longitude || site.location?.lng),
    prices
  };
}

async function fetchCircleKListPrices() {
  const res = await fetch(CIRCLEK_LIST_PRICE_URL, { headers: { Accept: 'text/html' } });
  if (!res.ok) throw new Error(`Circle K list prices HTTP ${res.status}`);

  const html = await res.text();
  const text = stripHtml(html);

  return {
    benzin95: extractPrice(text, ['Miles 95', 'miles95']),
    benzin98: extractPrice(text, ['Miles Plus 95', 'miles+95', 'Miles Plus']),
    diesel: extractPrice(text, ['Diesel', 'milesDiesel']),
    premiumDiesel: extractPrice(text, ['Miles Plus Diesel', 'miles+Diesel'])
  };
}

function extractPrice(text, needles) {
  for (const needle of needles) {
    const index = text.toLowerCase().indexOf(String(needle).toLowerCase());
    if (index === -1) continue;

    const slice = text.slice(index, index + 700);
    const matches = [...slice.matchAll(/(\d{1,2},\d{2})/g)].map(match => parseNumber(match[1]));
    const plausible = matches.find(value => value >= 8 && value <= 30);

    if (Number.isFinite(plausible)) {
      return {
        price: plausible,
        productName: needle,
        source: 'Circle K official list prices'
      };
    }
  }

  return null;
}

function stripHtml(html) {
  return String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ');
}

function attachPrice(station, priceData, fuelType) {
  const direct = attachDirectPrice(station, fuelType);
  if (Number.isFinite(direct.price)) return direct;

  const brand = normalizeText(`${station.brand} ${station.name}`);

  if (brand.includes('circle') || brand.includes('ingo')) {
    const product = priceData.listPrices?.[fuelType];

    if (product && Number.isFinite(product.price)) {
      return {
        ...station,
        price: product.price,
        priceProduct: product.productName,
        priceSource: product.source,
        priceConfidence: 'brand-list-price'
      };
    }
  }

  return { ...station, price: null };
}

function attachDirectPrice(station, fuelType) {
  const product = chooseProduct(station.prices || [], fuelType);

  if (!product) return { ...station, price: null };

  return {
    ...station,
    price: Number(product.price),
    priceProduct: product.productName || product.displayName || product.fuelType,
    priceSource: station.source || 'station API',
    priceConfidence: 'direct'
  };
}

function chooseProduct(prices, fuelType) {
  const candidates = prices.filter(price => Number.isFinite(Number(price.price)));
  const text = price => normalizeText(`${price.code} ${price.octane} ${price.fuelType} ${price.productName} ${price.displayName}`);

  if (fuelType === 'diesel') {
    return candidates.find(p => /diesel/.test(text(p)) && !/premium|plus|extra|deluxe|hvo/.test(text(p)))
      || candidates.find(p => /diesel/.test(text(p)))
      || null;
  }

  if (fuelType === 'premiumDiesel') {
    return candidates.find(p => /diesel/.test(text(p)) && /premium|plus|extra|deluxe/.test(text(p)))
      || candidates.find(p => /diesel/.test(text(p)))
      || null;
  }

  if (fuelType === 'benzin98') {
    return candidates.find(p => /98|100|e5|oktan 98|oktan 100|blyfri 98/.test(text(p)) && !/diesel/.test(text(p))) || null;
  }

  return candidates.find(p =>
    /95|e10|blyfri 95|miles 95|benzin|gasoline|petrol/.test(text(p)) &&
    !/98|100|premium|diesel/.test(text(p))
  ) || candidates.find(p => /benzin|gasoline|petrol/.test(text(p)) && !/diesel/.test(text(p))) || null;
}

function normalizePrices(prices) {
  if (!Array.isArray(prices)) return [];

  return prices.map(price => ({
    code: price.code || price.productCode || price.id || '',
    displayName: price.displayName || price.name || price.productName || price.product_name || price.fuelType || '',
    productName: price.productName || price.product_name || price.displayName || price.name || price.fuelType || '',
    fuelType: price.fuelType || price.productName || price.product_name || price.displayName || price.name || '',
    octane: price.octane || '',
    price: parseNumber(price.price || price.amount || price.value),
    currency: price.currency || 'DKK',
    lastUpdated: price.lastUpdated || price.updatedAt || price.validFrom || null
  })).filter(price => Number.isFinite(price.price));
}

function normalizeFuelStation(element) {
  const lat = typeof element.lat === 'number' ? element.lat : element.center?.lat;
  const lng = typeof element.lon === 'number' ? element.lon : element.center?.lon;

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  const tags = element.tags || {};

  return {
    id: `${element.type}-${element.id}`,
    lat,
    lng,
    name: tags.name || tags.brand || tags.operator || 'Tankstation',
    brand: tags.brand || tags.operator || tags.name || '',
    addressText: [tags['addr:street'], tags['addr:housenumber']].filter(Boolean).join(' '),
    postalCode: tags['addr:postcode'] || '',
    city: tags['addr:city'] || '',
    source: 'OSM'
  };
}

function attachRouteDistances(stations, geometry) {
  const segments = [];
  let cumulative = 0;

  for (let i = 1; i < geometry.length; i++) {
    const a = geometry[i - 1];
    const b = geometry[i];
    const length = haversine(a[1], a[0], b[1], b[0]);

    segments.push({
      start: a,
      end: b,
      startMeters: cumulative,
      length
    });

    cumulative += length;
  }

  return stations.map(station => {
    let best = Infinity;
    let along = Infinity;

    for (const segment of segments) {
      const p = projectPointToSegment(
        station.lat,
        station.lng,
        segment.start[1],
        segment.start[0],
        segment.end[1],
        segment.end[0]
      );

      if (p.distanceMeters < best) {
        best = p.distanceMeters;
        along = segment.startMeters + segment.length * p.t;
      }
    }

    return {
      ...station,
      distanceToRoute: best,
      distanceAlongRoute: along
    };
  });
}

function minLineDistance(line, routeGeometry) {
  let best = Infinity;

  for (const point of line) {
    const distance = attachRouteDistances([{ lat: point[0], lng: point[1] }], routeGeometry)[0]?.distanceToRoute ?? Infinity;
    best = Math.min(best, distance);
  }

  return best;
}

function sampleRoute(geometry, targetCount) {
  if (!Array.isArray(geometry) || !geometry.length) return [];

  const count = Math.min(targetCount, geometry.length);
  const samples = [];

  for (let i = 0; i < count; i++) {
    const index = Math.round((geometry.length - 1) * (i / Math.max(1, count - 1)));
    const point = geometry[index];

    samples.push({
      lng: point[0],
      lat: point[1]
    });
  }

  return samples;
}

function parseMaxspeed(value) {
  if (!value) return null;

  const text = String(value).toLowerCase();

  if (text.includes('none')) return 130;
  if (text.includes('walk')) return 10;
  if (text.includes('signals')) return null;

  const match = text.match(/\d+/);
  if (!match) return null;

  let speed = Number(match[0]);

  if (text.includes('mph')) speed = Math.round(speed * 1.60934);

  return speed >= 5 && speed <= 140 ? speed : null;
}

function dedupeStations(stations) {
  const seen = new Set();

  return stations.filter(station => {
    const key = station.id || `${Math.round(station.lat * 10000)}:${Math.round(station.lng * 10000)}`;

    if (seen.has(key)) return false;

    seen.add(key);
    return true;
  });
}

function dedupeById(items) {
  const seen = new Set();

  return items.filter(item => {
    const key = item.id || `${item.lat}:${item.lng}`;

    if (seen.has(key)) return false;

    seen.add(key);
    return true;
  });
}

function normalizeText(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/æ/g, 'ae')
    .replace(/ø/g, 'oe')
    .replace(/å/g, 'aa')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function parseNumber(value) {
  if (value === undefined || value === null || value === '') return NaN;

  const numeric = Number(String(value).replace(',', '.'));

  return Number.isFinite(numeric) ? numeric : NaN;
}

function haversine(lat1, lng1, lat2, lng2) {
  const radius = 6371000;
  const toRad = value => value * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) *
    Math.cos(toRad(lat2)) *
    Math.sin(dLng / 2) ** 2;

  return radius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function projectPointToSegment(lat, lng, lat1, lng1, lat2, lng2) {
  const metersLat = 111320;
  const metersLng = 111320 * Math.cos(lat * Math.PI / 180);

  const px = lng * metersLng;
  const py = lat * metersLat;
  const ax = lng1 * metersLng;
  const ay = lat1 * metersLat;
  const bx = lng2 * metersLng;
  const by = lat2 * metersLat;

  const dx = bx - ax;
  const dy = by - ay;
  const len = dx * dx + dy * dy;

  if (!len) {
    return {
      t: 0,
      distanceMeters: Math.hypot(px - ax, py - ay)
    };
  }

  let t = ((px - ax) * dx + (py - ay) * dy) / len;
  t = clamp(t, 0, 1);

  return {
    t,
    distanceMeters: Math.hypot(px - (ax + t * dx), py - (ay + t * dy))
  };
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

async function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal
    });
  } finally {
    clearTimeout(timeout);
  }
}
