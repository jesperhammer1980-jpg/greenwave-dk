const OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.osm.ch/api/interpreter"
];

const OK_PRICE_MATCH_MAX_METERS = 300;
const STRICT_BRAND_PRICE_MATCH_MAX_METERS = 300;
const STRICT_BRAND_PRICE_SOURCE_IDS = new Set(["circlek-api", "ok-api", "unox-api", "q8-f24-api"]);

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Access-Control-Allow-Origin", "*");

  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "POST only" });
  }

  try {
    const body = parseBody(req.body);
    const geometry = normalizeGeometry(body.geometry || body.coordinates || body.route?.geometry?.coordinates);
    const fuelType = String(body.fuelType || "benzin95");
    const maxDetourMeters = clamp(Number(body.maxDetourMeters ?? body.maxDetour ?? 2000), 0, 20000);
    const fuelAlongMeters = clamp(Number(body.fuelAlongMeters ?? body.fuelAlong ?? 50000), 0, 250000);

    if (geometry.length < 2) {
      return res.status(400).json({
        ok: false,
        error: "Missing or invalid route geometry",
        debug: {
          bodyType: typeof req.body,
          receivedKeys: Object.keys(body)
        }
      });
    }

    const [osmResult, priceResult] = await Promise.allSettled([
      fetchOsmFuel(geometry, maxDetourMeters),
      fetchPrices(req)
    ]);

    const priceData = priceResult.status === "fulfilled"
      ? priceResult.value
      : { ok: false, stations: [], listPrices: {}, sources: [] };
    const priceStations = Array.isArray(priceData.stations) ? priceData.stations : [];
    const apiStationsWithCoords = priceStations.filter(station =>
      hasCoordinate(Number(station.lat), Number(station.lng))
    );
    const apiWithoutCoords = priceStations.length - apiStationsWithCoords.length;

    if (osmResult.status !== "fulfilled" || !osmResult.value.ok) {
      const debug = osmResult.status === "fulfilled"
        ? osmResult.value.debug
        : { error: osmResult.reason?.message || String(osmResult.reason) };

      return res.status(502).json({
        ok: false,
        error: "Overpass failed",
        input: {
          fuelType,
          maxDetourMeters,
          fuelAlongMeters,
          geometryPoints: geometry.length,
          routeBbox: routeBbox(geometry, 0)
        },
        counts: {
          rawElements: 0,
          normalizedStations: 0,
          priceStations: priceStations.length,
          apiStations: apiStationsWithCoords.length,
          apiWithoutCoords,
          returned: 0
        },
        sources: priceData.sources || [],
        debug: {
          overpass: debug,
          priceApi: priceDebug(priceResult, priceData, apiStationsWithCoords.length, apiWithoutCoords)
        },
        stations: []
      });
    }

    const osmStations = osmResult.value.stations;
    const attached = attachRouteDistances(osmStations, geometry);
    const filtered = attached
      .filter(station => station.distanceToRoute <= maxDetourMeters)
      .filter(station => station.distanceAlongRoute <= fuelAlongMeters)
      .map(station => attachPrice(station, priceData, fuelType))
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
        rawElements: osmResult.value.debug.rawElements,
        normalizedStations: osmResult.value.debug.normalizedStations,
        osmStations: osmStations.length,
        priceStations: priceStations.length,
        apiStations: apiStationsWithCoords.length,
        apiWithoutCoords,
        returned: filtered.length,
        priced: filtered.filter(station => isValidFuelPrice(station.price)).length
      },
      sources: priceData.sources || [],
      debug: {
        overpass: osmResult.value.debug,
        priceApi: priceDebug(priceResult, priceData, apiStationsWithCoords.length, apiWithoutCoords),
        nearestRaw: attached
          .slice()
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
      stations: filtered.slice(0, 120).map(station => ({
        id: station.id,
        osmType: station.osmType,
        osmId: station.osmId,
        name: station.name,
        brand: station.brand,
        lat: station.lat,
        lng: station.lng,
        addressText: station.addressText || "",
        postalCode: station.postalCode || "",
        city: station.city || "",
        distanceToRoute: Math.round(station.distanceToRoute),
        distanceAlongRoute: Math.round(station.distanceAlongRoute),
        price: isValidFuelPrice(station.price) ? Number(station.price) : null,
        priceProduct: station.priceProduct || null,
        priceSource: station.priceSource || null
      }))
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error.message,
      stack: error.stack
    });
  }
}

function parseBody(body) {
  if (!body) return {};
  if (typeof body === "string") {
    try {
      return JSON.parse(body);
    } catch {
      return {};
    }
  }
  return body;
}

async function fetchOsmFuel(geometry, maxDetourMeters) {
  const padding = clamp(maxDetourMeters / 111320 + 0.09, 0.10, 0.24);
  const bbox = routeBbox(geometry, padding);
  const query = bboxQuery(bbox);
  const result = await runOverpass(query, 25000);

  if (!result.ok) {
    return {
      ok: false,
      stations: [],
      debug: {
        bbox,
        query,
        attempts: result.attempts,
        rawElements: 0,
        normalizedStations: 0
      }
    };
  }

  const elements = Array.isArray(result.data.elements) ? result.data.elements : [];
  const stations = dedupe(elements.map(normalizeOsmFuel).filter(Boolean));

  return {
    ok: true,
    stations,
    debug: {
      bbox,
      query,
      endpoint: result.endpoint,
      status: result.status,
      attempts: result.attempts,
      rawElements: elements.length,
      normalizedStations: stations.length
    }
  };
}

function bboxQuery(box) {
  const { south, west, north, east } = box;

  return `[out:json][timeout:25];
(
  node["amenity"="fuel"](${south},${west},${north},${east});
  way["amenity"="fuel"](${south},${west},${north},${east});
  relation["amenity"="fuel"](${south},${west},${north},${east});
);
out center tags;`;
}

async function runOverpass(query, timeoutMs) {
  const attempts = [];
  let firstEmpty = null;

  for (const endpoint of OVERPASS_ENDPOINTS) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
          "Accept": "application/json",
          "User-Agent": "GreenWave-DK/1.0"
        },
        body: new URLSearchParams({ data: query }).toString(),
        signal: controller.signal
      });

      const text = await response.text();
      clearTimeout(timeout);

      if (!response.ok) {
        attempts.push({
          endpoint,
          ok: false,
          status: response.status,
          statusText: response.statusText,
          body: text.slice(0, 500)
        });
        continue;
      }

      let data;
      try {
        data = JSON.parse(text);
      } catch (error) {
        attempts.push({
          endpoint,
          ok: false,
          status: response.status,
          error: `Invalid Overpass JSON: ${error.message}`,
          body: text.slice(0, 500)
        });
        continue;
      }

      const rawElements = Array.isArray(data.elements) ? data.elements.length : 0;
      attempts.push({ endpoint, ok: true, status: response.status, rawElements });

      const result = { ok: true, endpoint, status: response.status, data, attempts };
      if (rawElements > 0) return result;
      if (!firstEmpty) firstEmpty = result;
    } catch (error) {
      clearTimeout(timeout);
      attempts.push({ endpoint, ok: false, error: error.message });
    }
  }

  return firstEmpty || { ok: false, attempts };
}

async function fetchPrices(req) {
  const host = req.headers?.["x-forwarded-host"] || req.headers?.host || process.env.VERCEL_URL;
  if (!host) throw new Error("Missing host for /api/fuel-prices");

  const proto = req.headers?.["x-forwarded-proto"] || (String(host).includes("localhost") ? "http" : "https");
  const response = await fetch(`${proto}://${host}/api/fuel-prices?v=${Date.now()}`, {
    headers: { "Accept": "application/json" }
  });

  const text = await response.text();

  if (!response.ok) {
    throw new Error(`/api/fuel-prices HTTP ${response.status}: ${text.slice(0, 160)}`);
  }

  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`/api/fuel-prices returned non-JSON: ${text.slice(0, 160)}`);
  }
}

function priceDebug(priceResult, priceData, apiStationsWithCoords, apiWithoutCoords) {
  if (priceResult.status !== "fulfilled") {
    return {
      ok: false,
      error: priceResult.reason?.message || String(priceResult.reason),
      apiStations: 0,
      apiWithoutCoords: 0
    };
  }

  return {
    ok: Boolean(priceData.ok),
    sources: priceData.sources || [],
    stations: Array.isArray(priceData.stations) ? priceData.stations.length : 0,
    apiStations: apiStationsWithCoords,
    apiWithoutCoords
  };
}

function normalizeOsmFuel(element) {
  const lat = element.type === "node" ? Number(element.lat) : Number(element.center?.lat);
  const lng = element.type === "node" ? Number(element.lon) : Number(element.center?.lon);

  if (!hasCoordinate(lat, lng)) return null;

  const tags = element.tags || {};

  return {
    id: `${element.type}-${element.id}`,
    osmType: element.type,
    osmId: element.id,
    source: "OSM",
    lat,
    lng,
    name: tags.name || tags.brand || tags.operator || "Tankstation",
    brand: tags.brand || tags.operator || tags.name || "",
    addressText: [tags["addr:street"], tags["addr:housenumber"]].filter(Boolean).join(" "),
    postalCode: tags["addr:postcode"] || "",
    city: tags["addr:city"] || "",
    tags
  };
}

function attachPrice(station, prices, fuelType) {
  const match = findMatchingPriceStation(station, prices.stations || []);
  const product = match ? chooseProduct(match.prices || [], fuelType) : null;
  const truckStation = isTruckStation(station);

  if (product && isValidFuelPrice(product.price) && (!truckStation || isDieselFuelType(fuelType))) {
    return {
      ...station,
      price: Number(product.price),
      priceProduct: product.productName || product.displayName || product.fuelType || fuelType,
      priceSource: match.source || "price API"
    };
  }

  if (truckStation) {
    return { ...station, price: null };
  }

  if (isCircleKOrIngoStation(station)) {
    const listed = prices.listPrices?.[fuelType];

    if (listed && isValidFuelPrice(listed.price) && productMatchesFuelType(listed, fuelType)) {
      return {
        ...station,
        price: Number(listed.price),
        priceProduct: listed.productName || fuelType,
        priceSource: listed.source
      };
    }
  }

  return { ...station, price: null };
}

function findMatchingPriceStation(station, priceStations) {
  const strictBrandMatch = findNearestStrictBrandPriceStation(station, priceStations);
  if (strictBrandMatch) return strictBrandMatch;

  const q8F24AddressMatch = findMatchingQ8F24AddressStation(station, priceStations);
  if (q8F24AddressMatch) return q8F24AddressMatch;

  const okMatch = findNearestOkPriceStation(station, priceStations);
  if (okMatch) return okMatch;

  const stationBrand = norm(`${station.brand} ${station.name}`);
  const stationAddress = norm(station.addressText);
  const stationCity = norm(station.city);
  let best = null;
  let bestScore = 0;

  for (const candidate of priceStations) {
    if (!candidateCanMatchStation(candidate, station)) continue;

    const candidateBrand = norm(`${candidate.brand} ${candidate.name}`);
    const candidateAddress = norm(candidate.addressText || candidate.address);
    const candidateCity = norm(candidate.city);
    let score = 0;

    if (stationBrand && candidateBrand && (stationBrand.includes(candidateBrand) || candidateBrand.includes(stationBrand))) score += 4;
    if (stationBrand.includes("circle") && candidateBrand.includes("circle")) score += 3;
    if (stationBrand.includes("ingo") && candidateBrand.includes("ingo")) score += 3;
    if (stationCity && candidateCity && stationCity === candidateCity) score += 2;
    if (stationAddress && candidateAddress && (stationAddress.includes(candidateAddress) || candidateAddress.includes(stationAddress))) score += 3;

    if (score > bestScore) {
      best = candidate;
      bestScore = score;
    }
  }

  return bestScore >= 5 ? best : null;
}

function findMatchingQ8F24AddressStation(station, priceStations) {
  if (!isQ8Station(station) && !isF24Station(station)) return null;

  const stationAddress = addressKey(station.addressText);
  const stationCity = addressKey(station.city);
  const stationPostalCode = String(station.postalCode || "").trim();
  let best = null;
  let bestScore = 0;

  for (const candidate of priceStations) {
    if (candidate.sourceId !== "q8-f24-api") continue;
    if (!isMatchingQ8F24Station(candidate, station)) continue;

    const candidateAddress = addressKey(candidate.addressText || candidate.address || "");
    const candidateCity = addressKey(candidate.city || "");
    const candidatePostalCode = String(candidate.postalCode || "").trim();
    let score = 0;

    if (stationPostalCode && candidatePostalCode && stationPostalCode === candidatePostalCode) score += 4;
    if (stationCity && candidateCity && stationCity === candidateCity) score += 3;

    if (stationAddress && candidateAddress) {
      if (stationAddress === candidateAddress) score += 8;
      else if (stationAddress.includes(candidateAddress) || candidateAddress.includes(stationAddress)) score += 5;
      else if (addressTokenOverlap(stationAddress, candidateAddress) >= 2) score += 3;
    }

    if (score > bestScore) {
      best = candidate;
      bestScore = score;
    }
  }

  return bestScore >= 7 ? best : null;
}

function addressKey(value) {
  return norm(value)
    .replace(/\bvej\b/g, "vej")
    .replace(/\bgade\b/g, "gade")
    .replace(/\balle\b/g, "alle")
    .replace(/\s+/g, " ")
    .trim();
}

function addressTokenOverlap(a, b) {
  const aa = new Set(String(a || "").split(" ").filter(token => token.length > 1));
  const bb = new Set(String(b || "").split(" ").filter(token => token.length > 1));
  let count = 0;

  for (const token of aa) {
    if (bb.has(token)) count += 1;
  }

  return count;
}

function findNearestStrictBrandPriceStation(station, priceStations) {
  if (!hasCoordinate(Number(station.lat), Number(station.lng))) {
    return null;
  }

  let best = null;
  let bestDistance = Infinity;

  for (const candidate of priceStations) {
    if (!STRICT_BRAND_PRICE_SOURCE_IDS.has(candidate.sourceId)) continue;
    if (!candidateCanMatchStation(candidate, station)) continue;

    const lat = Number(candidate.lat);
    const lng = Number(candidate.lng);
    if (!hasCoordinate(lat, lng)) continue;

    const distance = haversine(Number(station.lat), Number(station.lng), lat, lng);
    if (distance < bestDistance) {
      best = candidate;
      bestDistance = distance;
    }
  }

  return best && bestDistance <= STRICT_BRAND_PRICE_MATCH_MAX_METERS ? best : null;
}

function findNearestOkPriceStation(station, priceStations) {
  if (!isOkStation(station) || !hasCoordinate(Number(station.lat), Number(station.lng))) {
    return null;
  }

  let best = null;
  let bestDistance = Infinity;

  for (const candidate of priceStations) {
    if (candidate.sourceId !== "ok-api") continue;

    const lat = Number(candidate.lat);
    const lng = Number(candidate.lng);
    if (!hasCoordinate(lat, lng)) continue;

    const distance = haversine(Number(station.lat), Number(station.lng), lat, lng);
    if (distance < bestDistance) {
      best = candidate;
      bestDistance = distance;
    }
  }

  return best && bestDistance <= OK_PRICE_MATCH_MAX_METERS ? best : null;
}

function candidateCanMatchStation(candidate, station) {
  if (candidate.sourceId === "ok-api") return isOkStation(station);
  if (candidate.sourceId === "circlek-api") return isCircleKOrIngoStation(station);
  if (candidate.sourceId === "unox-api") return isUnoXStation(station);
  if (candidate.sourceId === "q8-f24-api") return isMatchingQ8F24Station(candidate, station);
  return true;
}

function isDieselFuelType(fuelType) {
  return fuelType === "diesel" || fuelType === "premiumDiesel";
}

function isOkStation(station) {
  const text = stationText(station);
  return /\bok\b/.test(text) &&
    !/\b(circle\s*k|circlek|ingo|shell|uno\s*x|unox|f24|q8|go\s*on|goon)\b/.test(text);
}

function isUnoXStation(station) {
  const text = stationText(station);
  return /\b(uno\s*x|unox)\b/.test(text) &&
    !/\b(circle\s*k|circlek|ingo|ok|shell|f24|q8|go\s*on|goon)\b/.test(text);
}

function isQ8Station(station) {
  const text = stationText(station);
  return /\bq8\b/.test(text) &&
    !/\b(circle\s*k|circlek|ingo|ok|shell|uno\s*x|unox|f24|go\s*on|goon)\b/.test(text);
}

function isF24Station(station) {
  const text = stationText(station);
  return /\bf24\b/.test(text) &&
    !/\b(circle\s*k|circlek|ingo|ok|shell|uno\s*x|unox|q8|go\s*on|goon)\b/.test(text);
}

function isMatchingQ8F24Station(candidate, station) {
  if (isQ8Station(station)) return isQ8Station(candidate);
  if (isF24Station(station)) return isF24Station(candidate);
  return false;
}

function chooseProduct(prices, fuelType) {
  const items = prices.filter(price => isValidFuelPrice(price.price));
  return items.find(price => productMatchesFuelType(price, fuelType)) || null;
}

function attachRouteDistances(stations, geometry) {
  const segments = [];
  let cumulative = 0;

  for (let index = 1; index < geometry.length; index += 1) {
    const a = geometry[index - 1];
    const b = geometry[index];
    const length = haversine(a[1], a[0], b[1], b[0]);
    segments.push({ a, b, cumulative, length });
    cumulative += length;
  }

  return stations.map(station => {
    let distanceToRoute = Infinity;
    let distanceAlongRoute = Infinity;

    for (const segment of segments) {
      const projected = project(station.lat, station.lng, segment.a[1], segment.a[0], segment.b[1], segment.b[0]);

      if (projected.distance < distanceToRoute) {
        distanceToRoute = projected.distance;
        distanceAlongRoute = segment.cumulative + segment.length * projected.t;
      }
    }

    return { ...station, distanceToRoute, distanceAlongRoute };
  });
}

function normalizeGeometry(geometry) {
  return (Array.isArray(geometry) ? geometry : [])
    .map(point => {
      if (Array.isArray(point)) return [Number(point[0]), Number(point[1])];
      return [Number(point.lng ?? point.lon), Number(point.lat)];
    })
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

function sortStations(a, b) {
  return a.distanceAlongRoute - b.distanceAlongRoute ||
    a.distanceToRoute - b.distanceToRoute ||
    String(a.name).localeCompare(String(b.name));
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
  const lengthSquared = dx * dx + dy * dy;

  if (!lengthSquared) return { t: 0, distance: Math.hypot(px - ax, py - ay) };

  let t = ((px - ax) * dx + (py - ay) * dy) / lengthSquared;
  t = clamp(t, 0, 1);

  return {
    t,
    distance: Math.hypot(px - (ax + t * dx), py - (ay + t * dy))
  };
}

function haversine(lat1, lng1, lat2, lng2) {
  const radius = 6371000;
  const rad = value => value * Math.PI / 180;
  const dLat = rad(lat2 - lat1);
  const dLng = rad(lng2 - lng1);
  const x = Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) ** 2;

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

function hasCoordinate(lat, lng) {
  return Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180;
}

function isValidFuelPrice(value) {
  const price = Number(value);
  return Number.isFinite(price) && price >= 5 && price <= 30;
}

function isCircleKOrIngoStation(station) {
  const text = stationText(station);
  return /\b(circle\s*k|circlek|ingo)\b/.test(text);
}

function isTruckStation(station) {
  const text = stationText(station);
  return /\b(truck|lastbil|hgv|lorry)\b/.test(text) ||
    /\b(truck\s*diesel|diesel\s*truck)\b/.test(text);
}

function stationText(station) {
  const tags = station.tags || {};

  return norm([
    station.brand,
    station.name,
    tags.brand,
    tags.name,
    tags.operator,
    tags["fuel:diesel"],
    tags["fuel:HGV_diesel"],
    tags.hgv,
    tags.hgv_service,
    tags.description
  ].filter(Boolean).join(" "));
}

function productMatchesFuelType(product, fuelType) {
  const text = norm(`${product.code} ${product.octane} ${product.fuelType} ${product.productName} ${product.displayName}`);
  const isDieselProduct = /\bdiesel\b|hvo|truck|lastbil|hgv/.test(text);
  const isTruckProduct = /\b(truck|lastbil|hgv)\b/.test(text);
  const isGasolineProduct = /\b(benzin|gasoline|petrol|miles\s*95|blyfri|e10|e5)\b/.test(text) ||
    /\b95\b|\b98\b|\b100\b/.test(text);

  if (fuelType === "diesel") {
    return isDieselProduct && !isGasolineProduct && !/\b(premium|plus|extra)\b/.test(text);
  }

  if (fuelType === "premiumDiesel") {
    return isDieselProduct && !isGasolineProduct && /\b(premium|plus|extra)\b/.test(text);
  }

  if (fuelType === "benzin98") {
    return isGasolineProduct && !isDieselProduct && !isTruckProduct && /\b(98|100|e5)\b/.test(text);
  }

  return isGasolineProduct &&
    !isDieselProduct &&
    !isTruckProduct &&
    (/\b(95|e10)\b|miles\s*95|blyfri\s*95/.test(text)) &&
    !/\b(98|100|premium|plus)\b/.test(text);
}

function isLat(value) {
  return Number.isFinite(value) && value >= 54.2 && value <= 58.2;
}

function isLng(value) {
  return Number.isFinite(value) && value >= 7.5 && value <= 15.8;
}

function clamp(value, min, max) {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

function norm(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\u00e6/g, "ae")
    .replace(/\u00f8/g, "oe")
    .replace(/\u00e5/g, "aa")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}
