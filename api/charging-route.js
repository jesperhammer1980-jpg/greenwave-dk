const OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.osm.ch/api/interpreter"
];

const Q8_F24_CHARGING_PRICES_URL_ENV = "Q8_F24_CHARGING_PRICES_URL";
const CHARGING_PRICE_MATCH_MAX_METERS = 300;
const NO_ACTIVE_CHARGING_PRICE_MESSAGE = "Ladepunkter fundet via OSM. Ingen aktiv priskilde til kr/kWh.";

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Access-Control-Allow-Origin", "*");

  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "POST only" });
  }

  try {
    const body = parseBody(req.body);
    const geometry = normalizeGeometry(body.geometry || body.coordinates || body.route?.geometry?.coordinates);
    const maxDetourMeters = clamp(Number(body.maxDetourMeters ?? body.maxDetour ?? 2000), 0, 20000);
    const fuelAlongMeters = clamp(Number(body.fuelAlongMeters ?? body.fuelAlong ?? 50000), 0, 500000);

    if (geometry.length < 2) {
      return res.status(400).json({
        ok: false,
        error: "Missing or invalid route geometry",
        debug: { receivedKeys: Object.keys(body) }
      });
    }

    const [osmResult, priceResult] = await Promise.allSettled([
      fetchOsmCharging(geometry, maxDetourMeters),
      fetchChargingPrices()
    ]);

    const priceData = priceResult.status === "fulfilled"
      ? priceResult.value
      : { sources: [sourceError("q8-f24-charging-api", "Q8/F24 charging price API", priceResult.reason)], stations: [], operatorGuidance: [] };
    const pricing = pricingMetadata(priceData);

    if (osmResult.status !== "fulfilled" || !osmResult.value.ok) {
      const debug = osmResult.status === "fulfilled"
        ? osmResult.value.debug
        : { error: osmResult.reason?.message || String(osmResult.reason) };

      return res.status(502).json({
        ok: false,
        error: "Overpass failed",
        input: { maxDetourMeters, fuelAlongMeters, geometryPoints: geometry.length, routeBbox: routeBbox(geometry, 0) },
        counts: { rawElements: 0, normalizedChargingPoints: 0, returned: 0 },
        sources: priceData.sources || [],
        pricingSources: pricing.pricingSources,
        pricingStatus: pricing.pricingStatus,
        pricingMessage: pricing.pricingMessage,
        debug: { overpass: debug },
        chargingPoints: []
      });
    }

    const attached = attachRouteDistances(osmResult.value.chargingPoints, geometry);
    const filtered = attached
      .filter(point => point.distanceToRoute <= maxDetourMeters)
      .filter(point => point.distanceAlongRoute <= fuelAlongMeters)
      .map(point => attachChargingPrice(point, priceData, pricing))
      .sort(sortChargingPoints);

    return res.status(200).json({
      ok: true,
      input: { maxDetourMeters, fuelAlongMeters, geometryPoints: geometry.length, routeBbox: routeBbox(geometry, 0) },
      counts: {
        rawElements: osmResult.value.debug.rawElements,
        normalizedChargingPoints: osmResult.value.debug.normalizedChargingPoints,
        priceStations: priceData.stations.length,
        returned: filtered.length,
        priced: filtered.filter(point => isValidChargePrice(point.priceKwh)).length
      },
      sources: [
        { id: "osm-overpass", name: "OSM Overpass charging stations", ok: true, stations: osmResult.value.chargingPoints.length },
        ...(priceData.sources || [])
      ],
      pricingSources: pricing.pricingSources,
      pricingStatus: pricing.pricingStatus,
      pricingMessage: pricing.pricingMessage,
      debug: { overpass: osmResult.value.debug },
      chargingPoints: filtered.slice(0, 500).map(point => ({
        id: point.id,
        osmType: point.osmType,
        osmId: point.osmId,
        name: point.name,
        provider: point.provider,
        providerKey: point.providerKey,
        lat: point.lat,
        lng: point.lng,
        distanceToRoute: Math.round(point.distanceToRoute),
        distanceAlongRoute: Math.round(point.distanceAlongRoute),
        powerKw: point.powerKw || null,
        connectorType: point.connectorType || null,
        ...chargingPriceFields(point),
        matchStatus: point.matchStatus || null,
        matchReason: point.matchReason || null
      }))
    });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message, stack: error.stack });
  }
}

async function fetchOsmCharging(geometry, maxDetourMeters) {
  const padding = clamp(maxDetourMeters / 111320 + 0.09, 0.10, 0.24);
  const bbox = routeBbox(geometry, padding);
  const query = chargingQuery(bbox);
  const result = await runOverpass(query, 25000);

  if (!result.ok) {
    return { ok: false, chargingPoints: [], debug: { bbox, query, attempts: result.attempts, rawElements: 0, normalizedChargingPoints: 0 } };
  }

  const elements = Array.isArray(result.data.elements) ? result.data.elements : [];
  const chargingPoints = dedupe(elements.map(normalizeOsmCharging).filter(Boolean));

  return {
    ok: true,
    chargingPoints,
    debug: {
      bbox,
      query,
      endpoint: result.endpoint,
      status: result.status,
      attempts: result.attempts,
      rawElements: elements.length,
      normalizedChargingPoints: chargingPoints.length
    }
  };
}

function chargingQuery(box) {
  const { south, west, north, east } = box;
  return `[out:json][timeout:25];
(
  node["amenity"="charging_station"](${south},${west},${north},${east});
  way["amenity"="charging_station"](${south},${west},${north},${east});
  relation["amenity"="charging_station"](${south},${west},${north},${east});
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
        attempts.push({ endpoint, ok: false, status: response.status, statusText: response.statusText, body: text.slice(0, 500) });
        continue;
      }

      let data;
      try {
        data = JSON.parse(text);
      } catch (error) {
        attempts.push({ endpoint, ok: false, status: response.status, error: `Invalid Overpass JSON: ${error.message}`, body: text.slice(0, 500) });
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

async function fetchChargingPrices() {
  const q8F24 = await fetchQ8F24ChargingPrices();
  return {
    sources: [q8F24.source],
    stations: q8F24.stations,
    operatorGuidance: q8F24.operatorGuidance
  };
}

function pricingMetadata(priceData) {
  const sources = Array.isArray(priceData?.sources) ? priceData.sources : [];
  const active = sources
    .filter(source => source.id !== "osm-overpass")
    .filter(source => source.ok && source.configured !== false)
    .map(source => ({
      id: source.id,
      name: source.name,
      stations: Number(source.stations || 0),
      operatorGuidance: Number(source.operatorGuidance || 0)
    }));

  if (!active.length) {
    return {
      pricingSources: [],
      pricingStatus: "no-active-price-source",
      pricingMessage: NO_ACTIVE_CHARGING_PRICE_MESSAGE
    };
  }

  return {
    pricingSources: active,
    pricingStatus: "active-price-source",
    pricingMessage: `Aktive ladepriskilder: ${active.map(source => source.name || source.id).join(", ")}.`
  };
}

async function fetchQ8F24ChargingPrices() {
  const url = process.env[Q8_F24_CHARGING_PRICES_URL_ENV];
  if (!url) {
    return {
      source: {
        id: "q8-f24-charging-api",
        name: "Q8/F24 charging price API",
        ok: false,
        configured: false,
        stations: 0,
        error: `Set ${Q8_F24_CHARGING_PRICES_URL_ENV} to enable this source`
      },
      stations: [],
      operatorGuidance: []
    };
  }

  const response = await fetch(url, { headers: configuredChargingHeaders() });
  const body = await response.text();

  if (!response.ok) throw new Error(`Q8/F24 charging price API HTTP ${response.status}: ${body.slice(0, 300)}`);

  let data;
  try {
    data = JSON.parse(body);
  } catch (error) {
    throw new Error(`Q8/F24 charging price API returned non-JSON: ${body.slice(0, 300)}`);
  }

  const stations = extractItems(data)
    .map(item => normalizeQ8F24ChargingStation(item))
    .filter(Boolean);
  const operatorGuidance = extractOperatorGuidance(data, "q8f24");

  return {
    source: {
      id: "q8-f24-charging-api",
      name: "Q8/F24 charging price API",
      ok: true,
      configured: true,
      stations: stations.length,
      operatorGuidance: operatorGuidance.length
    },
    stations,
    operatorGuidance
  };
}

function configuredChargingHeaders() {
  const headers = { "Accept": "application/json", "User-Agent": "GreenWave-DK/1.0" };
  const key = process.env.Q8_F24_CHARGING_API_KEY || process.env.Q8_F24_CHARGING_API_TOKEN || process.env.Q8_F24_API_KEY || process.env.Q8_F24_API_TOKEN;
  if (key) {
    const header = process.env.Q8_F24_CHARGING_API_AUTH_HEADER || process.env.Q8_F24_API_AUTH_HEADER || "Authorization";
    const scheme = process.env.Q8_F24_CHARGING_API_AUTH_SCHEME || process.env.Q8_F24_API_AUTH_SCHEME || "";
    headers[header] = header.toLowerCase() === "authorization" && scheme ? `${scheme} ${key}` : key;
  }
  return headers;
}

function normalizeOsmCharging(element) {
  const lat = element.type === "node" ? Number(element.lat) : Number(element.center?.lat);
  const lng = element.type === "node" ? Number(element.lon) : Number(element.center?.lon);
  if (!hasCoordinate(lat, lng)) return null;

  const tags = element.tags || {};
  const provider = detectProvider(tags);

  return {
    id: `${element.type}-${element.id}`,
    osmType: element.type,
    osmId: element.id,
    source: "OSM",
    lat,
    lng,
    name: tags.name || tags.brand || tags.operator || tags.network || "Ladepunkt",
    provider: provider.label,
    providerKey: provider.key,
    powerKw: extractPowerKw(tags),
    connectorType: extractConnectorType(tags),
    tags
  };
}

function normalizeQ8F24ChargingStation(item) {
  if (!item || typeof item !== "object") return null;
  const provider = detectProvider(item);
  if (provider.key !== "q8f24" && provider.key !== "unknown") return null;

  const coord = coordPair(
    item.coordinates?.latitude ?? item.location?.latitude ?? item.location?.lat ?? item.latitude ?? item.lat,
    item.coordinates?.longitude ?? item.location?.longitude ?? item.location?.lng ?? item.longitude ?? item.lng,
    "q8-f24-charging-api"
  );
  const price = extractChargePrice(item);

  if (!coord || !price) return null;

  return {
    id: `q8-f24-charging-${item.id || item.stationId || item.name || `${coord.lat}:${coord.lng}`}`,
    sourceId: "q8-f24-charging-api",
    source: "Q8/F24 charging price API",
    name: item.name || item.stationName || item.siteName || "Q8/F24",
    provider: "Q8/F24",
    providerKey: "q8f24",
    lat: coord.lat,
    lng: coord.lng,
    priceKwh: price.priceKwh,
    priceSource: "Q8/F24 API",
    priceQuality: "station-specific",
    productName: price.productName || null
  };
}

function attachChargingPrice(point, prices, pricing) {
  const match = findNearestChargingPrice(point, prices.stations || []);
  if (match) {
    return {
      ...point,
      priceKwh: Number(match.priceKwh),
      priceSource: match.priceSource,
      priceSourceUrl: match.priceSourceUrl || null,
      priceUpdatedAt: match.priceUpdatedAt || null,
      priceQuality: "station-specific",
      matchStatus: "matched",
      matchReason: "Stationsspecifik ladepris matchet via koordinater"
    };
  }

  const guidance = (prices.operatorGuidance || []).find(item => item.providerKey === point.providerKey && isValidChargePrice(item.priceKwh));
  if (guidance) {
    return {
      ...point,
      priceKwh: Number(guidance.priceKwh),
      priceSource: guidance.priceSource,
      priceSourceUrl: guidance.priceSourceUrl || null,
      priceUpdatedAt: guidance.priceUpdatedAt || null,
      priceQuality: "operator-guidance",
      matchStatus: "operator-guidance",
      matchReason: "Vejledende operatørpris, ikke stationsspecifik"
    };
  }

  return {
    ...point,
    priceKwh: null,
    priceMinKwh: null,
    priceMaxKwh: null,
    priceCurrency: "DKK",
    priceLabel: "Pris ikke tilgængelig",
    priceSource: null,
    priceSourceUrl: null,
    priceUpdatedAt: null,
    priceIsLive: false,
    priceIsStationSpecific: false,
    priceConfidence: "none",
    priceQuality: "unknown",
    matchStatus: pricing?.pricingStatus === "no-active-price-source" ? "no-active-price-source" : "no-price",
    matchReason: pricing?.pricingStatus === "no-active-price-source" ? "Ingen aktiv priskilde" : "Pris ikke tilgængelig fra dokumenteret kilde"
  };
}

function chargingPriceFields(point) {
  const price = isValidChargePrice(point.priceKwh) ? Number(point.priceKwh) : null;
  const min = isValidChargePrice(point.priceMinKwh) ? Number(point.priceMinKwh) : null;
  const max = isValidChargePrice(point.priceMaxKwh) ? Number(point.priceMaxKwh) : null;
  const quality = String(point.priceQuality || "unknown");
  const base = {
    priceKwh: price,
    priceMinKwh: min,
    priceMaxKwh: max,
    priceCurrency: point.priceCurrency || "DKK",
    priceSource: point.priceSource || "none",
    priceSourceUrl: point.priceSourceUrl || null,
    priceUpdatedAt: point.priceUpdatedAt || null
  };

  if (quality === "station-specific" && price !== null) {
    return {
      ...base,
      priceLabel: point.priceLabel || "Stationsspecifik ladepris",
      priceIsLive: point.priceIsLive !== false,
      priceIsStationSpecific: true,
      priceConfidence: point.priceConfidence || "high",
      priceQuality: "station-specific"
    };
  }

  if (quality === "operator-guidance" && (price !== null || min !== null || max !== null)) {
    return {
      ...base,
      priceLabel: point.priceLabel || "Vejledende operatørpris",
      priceIsLive: false,
      priceIsStationSpecific: false,
      priceConfidence: point.priceConfidence || "low",
      priceQuality: "operator-guidance"
    };
  }

  return {
    priceKwh: null,
    priceMinKwh: null,
    priceMaxKwh: null,
    priceCurrency: "DKK",
    priceLabel: "Pris ikke tilgængelig",
    priceSource: "none",
    priceSourceUrl: null,
    priceUpdatedAt: null,
    priceIsLive: false,
    priceIsStationSpecific: false,
    priceConfidence: "none",
    priceQuality: "unknown"
  };
}

function findNearestChargingPrice(point, stations) {
  if (!hasCoordinate(Number(point.lat), Number(point.lng)) || point.providerKey === "unknown") return null;
  let best = null;
  let bestDistance = Infinity;

  for (const candidate of stations) {
    if (candidate.providerKey !== point.providerKey) continue;
    if (!hasCoordinate(Number(candidate.lat), Number(candidate.lng))) continue;
    if (!isValidChargePrice(candidate.priceKwh)) continue;

    const distance = haversine(Number(point.lat), Number(point.lng), Number(candidate.lat), Number(candidate.lng));
    if (distance < bestDistance) {
      best = candidate;
      bestDistance = distance;
    }
  }

  return best && bestDistance <= CHARGING_PRICE_MATCH_MAX_METERS ? best : null;
}

function extractOperatorGuidance(data, providerKey) {
  const items = [
    data?.operatorPrices,
    data?.operator_prices,
    data?.tariffs,
    data?.prices,
    data?.data?.operatorPrices,
    data?.data?.tariffs
  ].find(Array.isArray) || [];

  return items
    .map(item => {
      const provider = detectProvider(item);
      const price = extractChargePrice(item);
      if (provider.key !== providerKey || !price) return null;
      return {
        provider: provider.label,
        providerKey,
        priceKwh: price.priceKwh,
        priceSource: "Q8/F24 API",
        priceQuality: "operator-guidance"
      };
    })
    .filter(Boolean);
}

function extractChargePrice(item) {
  const direct = num(item.priceKwh ?? item.price_kwh ?? item.kwhPrice ?? item.kWhPrice ?? item.pricePerKwh ?? item.price_per_kwh);
  if (isValidChargePrice(direct)) return { priceKwh: direct, productName: item.productName || item.name || "" };

  const products = [item.products, item.prices, item.tariffs, item.connectors].find(Array.isArray) || [];
  for (const product of products) {
    const text = norm([product.name, product.productName, product.displayName, product.type, product.unit, product.description].filter(Boolean).join(" "));
    if (!/(kwh|kw h|charging|charge|hpc|lynlad|el)/.test(text)) continue;
    const price = num(product.priceKwh ?? product.price_kwh ?? product.kwhPrice ?? product.kWhPrice ?? product.pricePerKwh ?? product.price_per_kwh ?? product.price ?? product.amount ?? product.value);
    if (isValidChargePrice(price)) return { priceKwh: price, productName: product.productName || product.name || product.displayName || "" };
  }

  return null;
}

function extractPowerKw(tags) {
  const values = [];
  for (const [key, value] of Object.entries(tags || {})) {
    const k = String(key).toLowerCase();
    if (!/(output|max_power|charging|socket)/.test(k)) continue;
    values.push(...extractKwNumbers(value));
  }
  const max = values.filter(value => value > 0 && value <= 500).sort((a, b) => b - a)[0];
  return Number.isFinite(max) ? Math.round(max) : null;
}

function extractKwNumbers(value) {
  const text = String(value || "").replace(",", ".");
  const matches = [...text.matchAll(/(\d+(?:\.\d+)?)\s*kw\b/gi)].map(match => Number(match[1]));
  if (matches.length) return matches;
  const plain = Number(text);
  return Number.isFinite(plain) && plain <= 500 ? [plain] : [];
}

function extractConnectorType(tags) {
  const found = [];
  const add = value => { if (value && !found.includes(value)) found.push(value); };

  for (const [key, value] of Object.entries(tags || {})) {
    const enabled = !/^(no|0|false)$/i.test(String(value || ""));
    if (!enabled || !key.startsWith("socket:")) continue;
    const k = key.toLowerCase();
    if (k.includes("type2_combo") || k.includes("ccs")) add("CCS");
    else if (k.includes("type2")) add("Type 2");
    else if (k.includes("chademo")) add("CHAdeMO");
    else if (k.includes("tesla")) add("Tesla");
  }

  return found.join(" / ") || null;
}

function detectProvider(value) {
  const text = norm(typeof value === "string" ? value : [
    value?.provider,
    value?.operator,
    value?.brand,
    value?.network,
    value?.name,
    value?.siteName,
    value?.stationName,
    value?.tags?.operator,
    value?.tags?.brand,
    value?.tags?.network,
    value?.tags?.name
  ].filter(Boolean).join(" "));

  if (/\bclever\b/.test(text)) return { key: "clever", label: "Clever" };
  if (/\be\s*on\b|\beon\b/.test(text)) return { key: "eon", label: "E.ON" };
  if (/\bspirii\b/.test(text)) return { key: "spirii", label: "Spirii" };
  if (/\bnorlys\b/.test(text)) return { key: "norlys", label: "Norlys" };
  if (/\bok\b/.test(text)) return { key: "ok", label: "OK" };
  if (/\b(q8|f24)\b/.test(text)) return { key: "q8f24", label: "Q8/F24" };
  if (/\bcircle\s*k\b|\bcirclek\b/.test(text)) return { key: "circlek", label: "Circle K" };
  if (/\btesla\b/.test(text)) return { key: "tesla", label: "Tesla" };
  if (/\bionity\b/.test(text)) return { key: "ionity", label: "Ionity" };
  if (/\buno\s*x\b|\bunox\b/.test(text)) return { key: "unox", label: "Uno-X" };
  return { key: "unknown", label: "Ukendt leverandør" };
}

function attachRouteDistances(points, geometry) {
  const segments = [];
  let cumulative = 0;

  for (let index = 1; index < geometry.length; index += 1) {
    const a = geometry[index - 1];
    const b = geometry[index];
    const length = haversine(a[1], a[0], b[1], b[0]);
    segments.push({ a, b, cumulative, length });
    cumulative += length;
  }

  return points.map(point => {
    let distanceToRoute = Infinity;
    let distanceAlongRoute = Infinity;

    for (const segment of segments) {
      const projected = project(point.lat, point.lng, segment.a[1], segment.a[0], segment.b[1], segment.b[0]);
      if (projected.distance < distanceToRoute) {
        distanceToRoute = projected.distance;
        distanceAlongRoute = segment.cumulative + segment.length * projected.t;
      }
    }

    return { ...point, distanceToRoute, distanceAlongRoute };
  });
}

function normalizeGeometry(geometry) {
  return (Array.isArray(geometry) ? geometry : [])
    .map(point => Array.isArray(point) ? [Number(point[0]), Number(point[1])] : [Number(point.lng ?? point.lon), Number(point.lat)])
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

  return { south: south - padding, west: west - padding, north: north + padding, east: east + padding };
}

function sortChargingPoints(a, b) {
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

  return { t, distance: Math.hypot(px - (ax + t * dx), py - (ay + t * dy)) };
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
  const kept = [];
  for (const item of items) {
    const provider = norm(item.providerKey || item.provider || "unknown");
    const name = norm(item.name || "");
    const nearDuplicate = kept.find(existing => {
      if (norm(existing.providerKey || existing.provider || "unknown") !== provider) return false;
      if (norm(existing.name || "") !== name) return false;
      return haversine(Number(item.lat), Number(item.lng), Number(existing.lat), Number(existing.lng)) <= 50;
    });

    if (!nearDuplicate) {
      kept.push(item);
      continue;
    }

    if (chargingPointDataScore(item) > chargingPointDataScore(nearDuplicate)) {
      kept[kept.indexOf(nearDuplicate)] = item;
    }
  }
  return kept;
}

function chargingPointDataScore(item) {
  return (Number(item.powerKw) || 0) +
    (item.connectorType ? 10 : 0) +
    (item.tags && Object.keys(item.tags).length ? 1 : 0);
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

function extractItems(data) {
  if (Array.isArray(data)) return data;
  return [
    data?.items,
    data?.stations,
    data?.chargingStations,
    data?.chargePoints,
    data?.sites,
    data?.data?.items,
    data?.data?.stations,
    data?.data?.chargingStations,
    data?.data
  ].find(Array.isArray) || [];
}

function sourceError(id, name, error) {
  return { id, name, ok: false, configured: true, stations: 0, error: error?.message || String(error) };
}

function coordPair(a, b, source) {
  a = num(a);
  b = num(b);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  if (isLat(a) && isLng(b)) return { lat: a, lng: b, source };
  if (isLat(b) && isLng(a)) return { lat: b, lng: a, source: `${source} swapped` };
  return null;
}

function hasCoordinate(lat, lng) {
  return Number.isFinite(lat) && Number.isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
}

function isValidChargePrice(value) {
  const price = Number(value);
  return Number.isFinite(price) && price >= 0.5 && price <= 15;
}

function isLat(value) {
  return value >= 54.2 && value <= 58.2;
}

function isLng(value) {
  return value >= 7.5 && value <= 15.8;
}

function clamp(value, min, max) {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

function num(value) {
  if (value === undefined || value === null || value === "") return NaN;
  return Number(String(value).replace(",", "."));
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
