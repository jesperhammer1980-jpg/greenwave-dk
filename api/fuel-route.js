const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.osm.ch/api/interpreter'
];

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Access-Control-Allow-Origin', '*');

  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'POST only' });

  try {
    const body = parseBody(req.body);
    const geometry = normalizeGeometry(body.geometry);
    const fuelType = String(body.fuelType || 'benzin95');
    const maxDetourMeters = clamp(Number(body.maxDetourMeters || 2000), 500, 20000);
    const fuelAlongMeters = clamp(Number(body.fuelAlongMeters || 50000), 1000, 250000);

    if (geometry.length < 2) {
      return res.status(400).json({ ok: false, error: 'Missing or invalid route geometry', bodyType: typeof req.body });
    }

    const [osmResult, priceResult] = await Promise.allSettled([
      fetchOsmFuel(geometry, maxDetourMeters),
      fetchPrices(req)
    ]);

    const errors = [];
    const osmStations = osmResult.status === 'fulfilled' ? osmResult.value.stations : [];
    const osmDebug = osmResult.status === 'fulfilled' ? osmResult.value.debug : { error: osmResult.reason?.message || String(osmResult.reason) };

    if (osmResult.status !== 'fulfilled') errors.push(`osm: ${osmDebug.error}`);

    const prices = priceResult.status === 'fulfilled' ? priceResult.value : { stations: [], listPrices: {}, sources: [] };
    if (priceResult.status !== 'fulfilled') errors.push(`prices: ${priceResult.reason?.message || String(priceResult.reason)}`);

    const apiStations = (prices.stations || [])
      .filter(station => isLat(Number(station.lat)) && isLng(Number(station.lng)))
      .map(station => ({
        ...station,
        lat: Number(station.lat),
        lng: Number(station.lng),
        source: station.source || 'price API'
      }));

    const apiWithoutCoords = (prices.stations || []).length - apiStations.length;
    const merged = dedupe([...osmStations, ...apiStations]);

    const attached = attachRouteDistances(merged, geometry);
    const stations = attached
      .filter(station => station.distanceToRoute <= maxDetourMeters)
      .filter(station => station.distanceAlongRoute <= fuelAlongMeters)
      .map(station => attachPrice(station, prices, fuelType))
      .sort(sortStations);

    return res.status(200).json({
      ok: true,
      input: {
        fuelType,
        maxDetourMeters,
        fuelAlongMeters,
        geometryPoints: geometry.length,
        routeBbox: routeBbox(geometry, 0)
      },
      counts: {
        osmStations: osmStations.length,
        apiStations: apiStations.length,
        apiWithoutCoords,
        merged: merged.length,
        returned: stations.length,
        priced: stations.filter(station => Number.isFinite(station.price)).length
      },
      sources: prices.sources || [],
      debug: {
        ...osmDebug,
        errors,
        nearestRaw: attached
          .sort((a, b) => a.distanceToRoute - b.distanceToRoute)
          .slice(0, 12)
          .map(station => ({
            name: station.name,
            brand: station.brand,
            lat: station.lat,
            lng: station.lng,
            distanceToRoute: Math.round(station.distanceToRoute),
            distanceAlongRoute: Math.round(station.distanceAlongRoute)
          }))
      },
      stations: stations.slice(0, 120).map(station => ({
        id: station.id,
        name: station.name,
        brand: station.brand,
        lat: station.lat,
        lng: station.lng,
        addressText: station.addressText || station.address || '',
        city: station.city || '',
        distanceToRoute: Math.round(station.distanceToRoute),
        distanceAlongRoute: Math.round(station.distanceAlongRoute),
        price: Number.isFinite(station.price) ? station.price : null,
        priceProduct: station.priceProduct || null,
        priceSource: station.priceSource || null
      }))
    });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message, stack: error.stack });
  }
}

function parseBody(body) {
  if (!body) return {};
  if (typeof body === 'string') {
    try { return JSON.parse(body); } catch { return {}; }
  }
  return body;
}

async function fetchOsmFuel(geometry, maxDetourMeters) {
  const routeBox = routeBbox(geometry, 0);
  const routeCenter = {
    lat: (routeBox.south + routeBox.north) / 2,
    lng: (routeBox.west + routeBox.east) / 2
  };

  const padding = clamp(maxDetourMeters / 111320 + 0.09, 0.10, 0.24);
  const corridorBox = routeBbox(geometry, padding);
  const samples = sampleRoute(geometry, 3500, 24);
  const radius = clamp(maxDetourMeters + 3000, 3500, 10000);

  const strategies = [
    {
      name: 'corridor-bbox-nwr',
      query: bboxQuery(corridorBox)
    },
    {
      name: 'sample-around-nwr',
      query: aroundQuery(samples, radius)
    },
    {
      name: 'route-center-25km',
      query: aroundQuery([routeCenter], 25000)
    }
  ];

  const attempts = [];
  const all = [];

  for (const strategy of strategies) {
    for (const method of ['POST', 'GET']) {
      try {
        const data = await overpass(strategy.query, method, 30000);
        const elements = Array.isArray(data.elements) ? data.elements : [];
        attempts.push({ name: strategy.name, method, ok: true, rawElements: elements.length });
        if (elements.length) all.push(...elements);
      } catch (error) {
        attempts.push({ name: strategy.name, method, ok: false, error: error.message });
      }
    }
  }

  const stations = dedupe(all.map(normalizeOsmFuel).filter(Boolean));

  return {
    stations,
    debug: {
      routeBox,
      corridorBox,
      padding,
      samples: samples.length,
      radius,
      attempts,
      rawElements: all.length,
      normalizedStations: stations.length
    }
  };
}

function bboxQuery(box) {
  const b = `${box.south},${box.west},${box.north},${box.east}`;
  return `[out:json][timeout:45];
(
  node["amenity"="fuel"](${b});
  way["amenity"="fuel"](${b});
  relation["amenity"="fuel"](${b});
);
out center tags;`;
}

function aroundQuery(points, radius) {
  return `[out:json][timeout:45];
(
${points.map(point => `
  node(around:${Math.round(radius)},${point.lat},${point.lng})["amenity"="fuel"];
  way(around:${Math.round(radius)},${point.lat},${point.lng})["amenity"="fuel"];
  relation(around:${Math.round(radius)},${point.lat},${point.lng})["amenity"="fuel"];`).join('\n')}
);
out center tags;`;
}

async function fetchPrices(req) {
  const r = await fetch(`${origin(req)}/api/fuel-prices?v=${Date.now()}`, {
    headers: { Accept: 'application/json' }
  });
  if (!r.ok) throw new Error(`/api/fuel-prices ${r.status}`);
  return await r.json();
}

function origin(req) {
  const host = req.headers['x-forwarded-host'] || req.headers.host || process.env.VERCEL_URL;
  const proto = req.headers['x-forwarded-proto'] || 'https';
  return `${proto}://${host}`;
}

async function overpass(query, method, timeoutMs) {
  const errors = [];

  for (const endpoint of OVERPASS_ENDPOINTS) {
    let timeout;
    try {
      const controller = new AbortController();
      timeout = setTimeout(() => controller.abort(), timeoutMs);

      const options = method === 'GET'
        ? { signal: controller.signal, headers: { Accept: 'application/json' } }
        : {
            method: 'POST',
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
              Accept: 'application/json'
            },
            body: `data=${encodeURIComponent(query)}`,
            signal: controller.signal
          };

      const url = method === 'GET' ? `${endpoint}?data=${encodeURIComponent(query)}` : endpoint;
      const response = await fetch(url, options);
      clearTimeout(timeout);

      if (response.ok) return await response.json();

      const text = await response.text().catch(() => '');
      errors.push(`${endpoint} ${method} HTTP ${response.status}: ${text.slice(0, 140)}`);
    } catch (error) {
      if (timeout) clearTimeout(timeout);
      errors.push(`${endpoint} ${method}: ${error.message}`);
    }
  }

  throw new Error(errors.join(' | '));
}

function normalizeOsmFuel(element) {
  const lat = typeof element.lat === 'number' ? element.lat : element.center?.lat;
  const lng = typeof element.lon === 'number' ? element.lon : element.center?.lon;
  if (!isLat(lat) || !isLng(lng)) return null;

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
  const product = chooseProduct(station.prices || [], fuelType);
  if (product) {
    return {
      ...station,
      price: Number(product.price),
      priceProduct: product.productName || product.displayName || product.fuelType,
      priceSource: station.source
    };
  }

  const brand = norm(`${station.brand} ${station.name}`);
  if (brand.includes('circle') || brand.includes('ingo')) {
    const p = prices.listPrices?.[fuelType];
    if (p && Number.isFinite(Number(p.price))) {
      return {
        ...station,
        price: Number(p.price),
        priceProduct: p.productName || fuelType,
        priceSource: p.source
      };
    }
  }

  return { ...station, price: null };
}

function chooseProduct(prices, fuelType) {
  const items = prices.filter(price => Number.isFinite(Number(price.price)));
  const text = price => norm(`${price.code} ${price.octane} ${price.fuelType} ${price.productName} ${price.displayName}`);

  if (fuelType === 'diesel') {
    return items.find(p => /diesel/.test(text(p)) && !/premium|plus|extra|hvo/.test(text(p))) ||
      items.find(p => /diesel/.test(text(p))) || null;
  }

  if (fuelType === 'premiumDiesel') {
    return items.find(p => /diesel/.test(text(p)) && /premium|plus|extra/.test(text(p))) ||
      items.find(p => /diesel/.test(text(p))) || null;
  }

  if (fuelType === 'benzin98') {
    return items.find(p => /98|100|e5/.test(text(p)) && !/diesel/.test(text(p))) || null;
  }

  return items.find(p => /95|e10|benzin|gasoline|petrol/.test(text(p)) && !/98|100|premium|diesel/.test(text(p))) ||
    items.find(p => /benzin|gasoline|petrol/.test(text(p)) && !/diesel/.test(text(p))) ||
    null;
}

function attachRouteDistances(stations, geometry) {
  const segments = [];
  let cumulative = 0;

  for (let i = 1; i < geometry.length; i++) {
    const a = geometry[i - 1];
    const b = geometry[i];
    const length = haversine(a[1], a[0], b[1], b[0]);
    segments.push({ a, b, cumulative, length });
    cumulative += length;
  }

  return stations.map(station => {
    let best = Infinity;
    let along = Infinity;

    for (const segment of segments) {
      const p = project(station.lat, station.lng, segment.a[1], segment.a[0], segment.b[1], segment.b[0]);
      if (p.distance < best) {
        best = p.distance;
        along = segment.cumulative + segment.length * p.t;
      }
    }

    return { ...station, distanceToRoute: best, distanceAlongRoute: along };
  });
}

function normalizeGeometry(geometry) {
  return (Array.isArray(geometry) ? geometry : [])
    .map(point => Array.isArray(point)
      ? [Number(point[0]), Number(point[1])]
      : [Number(point.lng ?? point.lon), Number(point.lat)])
    .filter(point => isLng(point[0]) && isLat(point[1]));
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

  return {
    south: south - padding,
    west: west - padding,
    north: north + padding,
    east: east + padding
  };
}

function sampleRoute(geometry, spacingMeters, maxSamples) {
  const points = [{ lng: geometry[0][0], lat: geometry[0][1] }];
  let accumulated = 0;

  for (let i = 1; i < geometry.length; i++) {
    accumulated += haversine(geometry[i - 1][1], geometry[i - 1][0], geometry[i][1], geometry[i][0]);

    if (accumulated >= spacingMeters) {
      points.push({ lng: geometry[i][0], lat: geometry[i][1] });
      accumulated = 0;
    }

    if (points.length >= maxSamples - 1) break;
  }

  const last = geometry[geometry.length - 1];
  points.push({ lng: last[0], lat: last[1] });
  return points;
}

function sortStations(a, b) {
  if (Number.isFinite(a.price) && Number.isFinite(b.price)) return a.price - b.price;
  if (Number.isFinite(a.price)) return -1;
  if (Number.isFinite(b.price)) return 1;
  return a.distanceAlongRoute - b.distanceAlongRoute;
}

function project(lat, lng, lat1, lng1, lat2, lng2) {
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

  if (!len) return { t: 0, distance: Math.hypot(px - ax, py - ay) };

  let t = ((px - ax) * dx + (py - ay) * dy) / len;
  t = clamp(t, 0, 1);

  return {
    t,
    distance: Math.hypot(px - (ax + t * dx), py - (ay + t * dy))
  };
}

function haversine(a, b, c, d) {
  const radius = 6371000;
  const rad = value => value * Math.PI / 180;
  const dLat = rad(c - a);
  const dLng = rad(d - b);
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a)) * Math.cos(rad(c)) * Math.sin(dLng / 2) ** 2;
  return radius * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

function dedupe(items) {
  const seen = new Set();

  return items.filter(item => {
    const key = item.id || `${Math.round(item.lat * 10000)}:${Math.round(item.lng * 10000)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function isLat(value) {
  return Number.isFinite(value) && value >= 54.2 && value <= 58.2;
}

function isLng(value) {
  return Number.isFinite(value) && value >= 7.5 && value <= 15.8;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function norm(value) {
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
