const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.osm.ch/api/interpreter'
];

export default async function handler(request, response) {
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('Access-Control-Allow-Origin', '*');

  if (request.method !== 'POST') {
    return response.status(405).json({ ok: false, error: 'POST only' });
  }

  try {
    const geometry = request.body?.geometry;
    const fuelType = String(request.body?.fuelType || 'benzin95');
    const maxDetourMeters = clamp(Number(request.body?.maxDetourMeters || 2000), 500, 20000);
    const fuelAlongMeters = clamp(Number(request.body?.fuelAlongMeters || 50000), 1000, 250000);

    if (!Array.isArray(geometry) || geometry.length < 2) {
      return response.status(400).json({ ok: false, error: 'Missing route geometry' });
    }

    const [osmResult, priceResult] = await Promise.allSettled([
      fetchFuelStationsForRoute(geometry, maxDetourMeters),
      fetchPrices(request)
    ]);

    const errors = [];
    const osmStations = osmResult.status === 'fulfilled' ? osmResult.value.stations : [];
    const osmDebug = osmResult.status === 'fulfilled' ? osmResult.value.debug : {};
    if (osmResult.status !== 'fulfilled') errors.push(`osm fuel: ${osmResult.reason?.message || osmResult.reason}`);

    const prices = priceResult.status === 'fulfilled' ? priceResult.value : { stations: [], listPrices: {}, sources: [] };
    if (priceResult.status !== 'fulfilled') errors.push(`prices: ${priceResult.reason?.message || priceResult.reason}`);

    const apiStations = (prices.stations || [])
      .filter(station => Number.isFinite(station.lat) && Number.isFinite(station.lng))
      .map(station => ({ ...station, fromPriceApi: true, source: station.source || 'price API' }));

    const merged = dedupeStations([...apiStations, ...osmStations]);

    const stations = attachRouteDistances(merged, geometry)
      .filter(station => station.distanceToRoute <= maxDetourMeters)
      .filter(station => station.distanceAlongRoute <= fuelAlongMeters)
      .map(station => attachPrice(station, prices, fuelType))
      .sort(sortStations);

    return response.status(200).json({
      ok: true,
      generatedAt: new Date().toISOString(),
      input: { fuelType, maxDetourMeters, fuelAlongMeters, geometryPoints: geometry.length },
      counts: {
        osmStations: osmStations.length,
        apiStations: apiStations.length,
        merged: merged.length,
        returned: stations.length,
        priced: stations.filter(station => Number.isFinite(station.price)).length
      },
      sources: prices.sources || [],
      debug: { osm: osmDebug, errors },
      stations: stations.slice(0, 80).map(station => ({
        id: station.id,
        name: station.name,
        brand: station.brand,
        lat: station.lat,
        lng: station.lng,
        addressText: station.addressText || station.address || '',
        city: station.city || '',
        distanceToRoute: station.distanceToRoute,
        distanceAlongRoute: station.distanceAlongRoute,
        price: Number.isFinite(station.price) ? station.price : null,
        priceProduct: station.priceProduct || null,
        priceSource: station.priceSource || null
      }))
    });
  } catch (error) {
    return response.status(500).json({ ok: false, error: error.message, stack: error.stack });
  }
}

async function fetchFuelStationsForRoute(geometry, maxDetourMeters) {
  const samples = sampleRouteByDistance(geometry, 3500, 28);
  const radius = clamp(maxDetourMeters + 900, 1300, 6000);

  const aroundParts = [];
  for (const point of samples) {
    aroundParts.push(`node(around:${Math.round(radius)},${point.lat},${point.lng})["amenity"="fuel"];`);
    aroundParts.push(`way(around:${Math.round(radius)},${point.lat},${point.lng})["amenity"="fuel"];`);
    aroundParts.push(`relation(around:${Math.round(radius)},${point.lat},${point.lng})["amenity"="fuel"];`);
  }

  const aroundQuery = `[out:json][timeout:35];(${aroundParts.join('\n')});out center tags;`;
  const aroundData = await overpass(aroundQuery, 22000).catch(error => ({ elements: [], _error: error.message }));

  let elements = Array.isArray(aroundData.elements) ? aroundData.elements : [];
  let fallbackUsed = false;

  if (elements.length === 0) {
    fallbackUsed = true;
    const bbox = routeBbox(geometry, Math.max(0.06, (maxDetourMeters / 111320) + 0.035));
    const b = `${bbox.south},${bbox.west},${bbox.north},${bbox.east}`;
    const bboxQuery = `[out:json][timeout:35];(node["amenity"="fuel"](${b});way["amenity"="fuel"](${b});relation["amenity"="fuel"](${b}););out center tags;`;
    const bboxData = await overpass(bboxQuery, 22000).catch(error => ({ elements: [], _error: error.message }));
    elements = Array.isArray(bboxData.elements) ? bboxData.elements : [];
  }

  return {
    debug: {
      samples: samples.length,
      radius,
      rawElements: elements.length,
      fallbackUsed,
      aroundError: aroundData._error || null
    },
    stations: dedupeStations(elements.map(normalizeFuelStation).filter(Boolean))
  };
}

async function fetchPrices(request) {
  const origin = originFromRequest(request);
  const res = await fetch(`${origin}/api/fuel-prices?v=${Date.now()}`, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`/api/fuel-prices HTTP ${res.status}`);
  return await res.json();
}

function originFromRequest(request) {
  const host = request.headers['x-forwarded-host'] || request.headers.host || process.env.VERCEL_URL || 'localhost:3000';
  const proto = request.headers['x-forwarded-proto'] || (String(host).includes('localhost') ? 'http' : 'https');
  return `${proto}://${host}`;
}

async function overpass(query, timeoutMs) {
  const errors = [];
  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      const res = await fetchWithTimeout(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
        body: query
      }, timeoutMs);
      if (res.ok) return await res.json();
      errors.push(`${endpoint} HTTP ${res.status}`);
    } catch (error) {
      errors.push(`${endpoint} ${error.message}`);
    }
  }
  throw new Error(`All Overpass endpoints failed: ${errors.join(' | ')}`);
}

function normalizeFuelStation(element) {
  const lat = typeof element.lat === 'number' ? element.lat : element.center?.lat;
  const lng = typeof element.lon === 'number' ? element.lon : element.center?.lon;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  const tags = element.tags || {};
  return {
    id: `${element.type}-${element.id}`,
    source: 'OSM',
    lat,
    lng,
    name: tags.name || tags.brand || tags.operator || 'Tankstation',
    brand: tags.brand || tags.operator || tags.name || '',
    addressText: [tags['addr:street'], tags['addr:housenumber']].filter(Boolean).join(' '),
    postalCode: tags['addr:postcode'] || '',
    city: tags['addr:city'] || ''
  };
}

function attachPrice(station, prices, fuelType) {
  const direct = chooseProduct(station.prices || [], fuelType);
  if (direct) {
    return {
      ...station,
      price: Number(direct.price),
      priceProduct: direct.productName || direct.displayName || direct.fuelType,
      priceSource: station.source || 'station API'
    };
  }

  const brandText = normalizeText(`${station.brand} ${station.name}`);
  if (brandText.includes('circle') || brandText.includes('ingo')) {
    const list = prices.listPrices?.[fuelType];
    if (list && Number.isFinite(Number(list.price))) {
      return {
        ...station,
        price: Number(list.price),
        priceProduct: list.productName || fuelType,
        priceSource: list.source || 'Circle K list price'
      };
    }
  }

  let best = null;
  for (const candidate of prices.stations || []) {
    const score = scoreMatch(station, candidate);
    if (!best || score > best.score) best = { candidate, score };
  }

  if (best && best.score >= 65) {
    const product = chooseProduct(best.candidate.prices || [], fuelType);
    if (product) {
      return {
        ...station,
        price: Number(product.price),
        priceProduct: product.productName || product.displayName || product.fuelType,
        priceSource: best.candidate.source || 'matched API'
      };
    }
  }

  return { ...station, price: null };
}

function scoreMatch(a, b) {
  let score = 0;
  if (Number.isFinite(a.lat) && Number.isFinite(a.lng) && Number.isFinite(b.lat) && Number.isFinite(b.lng)) {
    const d = haversine(a.lat, a.lng, b.lat, b.lng);
    if (d < 80) score += 80;
    else if (d < 200) score += 60;
    else if (d < 500) score += 35;
  }
  if (normalizeBrand(a.brand || a.name) && normalizeBrand(a.brand || a.name) === normalizeBrand(b.brand || b.name)) score += 25;
  if (a.postalCode && b.postalCode && String(a.postalCode) === String(b.postalCode)) score += 12;
  return score;
}

function chooseProduct(prices, fuelType) {
  const candidates = prices.filter(price => Number.isFinite(Number(price.price)));
  const text = price => normalizeText(`${price.code} ${price.octane} ${price.fuelType} ${price.productName} ${price.displayName}`);

  if (fuelType === 'diesel') {
    return candidates.find(p => /diesel/.test(text(p)) && !/premium|plus|extra|deluxe|hvo/.test(text(p))) ||
      candidates.find(p => /diesel/.test(text(p))) || null;
  }

  if (fuelType === 'premiumDiesel') {
    return candidates.find(p => /diesel/.test(text(p)) && /premium|plus|extra|deluxe/.test(text(p))) ||
      candidates.find(p => /diesel/.test(text(p))) || null;
  }

  if (fuelType === 'benzin98') {
    return candidates.find(p => /98|100|e5|oktan 98|oktan 100|blyfri 98/.test(text(p)) && !/diesel/.test(text(p))) || null;
  }

  return candidates.find(p =>
    /95|e10|blyfri 95|miles 95|benzin|gasoline|petrol/.test(text(p)) &&
    !/98|100|premium|diesel/.test(text(p))
  ) || candidates.find(p => /benzin|gasoline|petrol/.test(text(p)) && !/diesel/.test(text(p))) || null;
}

function attachRouteDistances(stations, geometry) {
  const segments = [];
  let cumulative = 0;

  for (let i = 1; i < geometry.length; i++) {
    const a = geometry[i - 1];
    const b = geometry[i];
    const length = haversine(a[1], a[0], b[1], b[0]);
    segments.push({ start: a, end: b, startMeters: cumulative, length });
    cumulative += length;
  }

  return stations.map(station => {
    let best = Infinity;
    let along = Infinity;

    for (const segment of segments) {
      const p = projectPointToSegment(station.lat, station.lng, segment.start[1], segment.start[0], segment.end[1], segment.end[0]);
      if (p.distanceMeters < best) {
        best = p.distanceMeters;
        along = segment.startMeters + segment.length * p.t;
      }
    }

    return { ...station, distanceToRoute: best, distanceAlongRoute: along };
  });
}

function sortStations(a, b) {
  if (Number.isFinite(a.price) && Number.isFinite(b.price)) return a.price - b.price;
  if (Number.isFinite(a.price)) return -1;
  if (Number.isFinite(b.price)) return 1;
  return a.distanceAlongRoute - b.distanceAlongRoute;
}

function sampleRouteByDistance(geometry, spacingMeters, maxSamples) {
  if (!Array.isArray(geometry) || geometry.length < 2) return [];

  const points = [{ lng: geometry[0][0], lat: geometry[0][1] }];
  let sinceLast = 0;

  for (let i = 1; i < geometry.length; i++) {
    const a = geometry[i - 1];
    const b = geometry[i];
    sinceLast += haversine(a[1], a[0], b[1], b[0]);

    if (sinceLast >= spacingMeters) {
      points.push({ lng: b[0], lat: b[1] });
      sinceLast = 0;
    }

    if (points.length >= maxSamples - 1) break;
  }

  const last = geometry[geometry.length - 1];
  points.push({ lng: last[0], lat: last[1] });

  return dedupePoints(points).slice(0, maxSamples);
}

function routeBbox(geometry, padding) {
  let south = Infinity;
  let west = Infinity;
  let north = -Infinity;
  let east = -Infinity;
  for (const point of geometry) {
    west = Math.min(west, point[0]);
    east = Math.max(east, point[0]);
    south = Math.min(south, point[1]);
    north = Math.max(north, point[1]);
  }
  return { south: south - padding, west: west - padding, north: north + padding, east: east + padding };
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

function dedupePoints(points) {
  const seen = new Set();
  return points.filter(point => {
    const key = `${point.lat.toFixed(4)}:${point.lng.toFixed(4)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function normalizeBrand(value) {
  const text = normalizeText(value);
  if (text.includes('circle')) return 'circle k';
  if (text.includes('ingo')) return 'ingo';
  if (text.includes('ok')) return 'ok';
  if (text.includes('uno')) return 'uno-x';
  if (text.includes('q8')) return 'q8';
  if (text.includes('shell')) return 'shell';
  return text;
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

function haversine(lat1, lng1, lat2, lng2) {
  const radius = 6371000;
  const toRad = value => value * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
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

  if (!len) return { t: 0, distanceMeters: Math.hypot(px - ax, py - ay) };

  let t = ((px - ax) * dx + (py - ay) * dy) / len;
  t = clamp(t, 0, 1);

  return { t, distanceMeters: Math.hypot(px - (ax + t * dx), py - (ay + t * dy)) };
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

async function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}
