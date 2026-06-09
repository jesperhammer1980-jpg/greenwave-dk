const CIRCLEK_LIST_PRICE_URL = "https://www.circlek.dk/erhverv/braendstof/priser";
const CIRCLEK_COUNTRY_URL = "https://api.circlek.com/eu/prices/v1/fuel/countries/DK";
const OK_FUEL_PRICES_URL = "https://mobility-prices.ok.dk/api/v1/fuel-prices";
const UNOX_FUEL_PRICES_URL_ENV = "UNOX_FUEL_PRICES_URL";
const UNOX_TOKEN_URL_ENV = "UNOX_TOKEN_URL";
const UNOX_CLIENT_ID_ENV = "UNOX_CLIENT_ID";
const UNOX_CLIENT_SECRET_ENV = "UNOX_CLIENT_SECRET";
const UNOX_DEFAULT_TOKEN_URL = "https://auth.unoxmobility.net/realms/production-api-gateway/protocol/openid-connect/token";
const UNOX_DEFAULT_FUEL_PRICES_URL = "https://api.unoxmobility.net/gasstations/v1/getStationsAndPrices";
const Q8_F24_FUEL_PRICES_URL_ENV = "Q8_F24_FUEL_PRICES_URL";
const Q8_F24_DEFAULT_HEADER_ENV = "Q8_F24_DEFAULT_HEADER";

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=1800");
  res.setHeader("Access-Control-Allow-Origin", "*");

  const [circleK, ok, unoX, q8F24, list] = await Promise.allSettled([
    fetchCircleKStations(),
    fetchOkStations(),
    fetchUnoXStations(),
    fetchQ8F24Stations(),
    fetchCircleKListPrices()
  ]);

  const sources = [];
  const stationGroups = [];
  let listPrices = {};

  if (circleK.status === "fulfilled") {
    stationGroups.push(circleK.value);
    sources.push({
      id: "circlek-api",
      name: "Circle K / INGO station API",
      ok: true,
      stations: circleK.value.length
    });
  } else {
    sources.push({
      id: "circlek-api",
      name: "Circle K / INGO station API",
      ok: false,
      error: circleK.reason?.message || String(circleK.reason)
    });
  }

  if (ok.status === "fulfilled") {
    stationGroups.push(ok.value);
    sources.push({
      id: "ok-api",
      name: "OK public fuel price API (documented structure, not live-verified here)",
      ok: true,
      stations: ok.value.length
    });
  } else {
    sources.push({
      id: "ok-api",
      name: "OK public fuel price API (documented structure, not live-verified here)",
      ok: false,
      error: ok.reason?.message || String(ok.reason)
    });
  }

  addConfiguredStationSource({
    result: unoX,
    sources,
    stationGroups,
    id: "unox-api",
    name: "Uno-X fuel price API",
    urlEnv: `${UNOX_CLIENT_ID_ENV} and ${UNOX_CLIENT_SECRET_ENV}`
  });

  addConfiguredStationSource({
    result: q8F24,
    sources,
    stationGroups,
    id: "q8-f24-api",
    name: "Q8 / F24 fuel price API",
    urlEnv: Q8_F24_FUEL_PRICES_URL_ENV
  });

  if (list.status === "fulfilled") {
    listPrices = list.value;
    sources.push({
      id: "circlek-list",
      name: "Circle K official list prices",
      ok: true,
      products: Object.values(listPrices).filter(Boolean).length
    });
  } else {
    sources.push({
      id: "circlek-list",
      name: "Circle K official list prices",
      ok: false,
      error: list.reason?.message || String(list.reason)
    });
  }

  return res.status(200).json({
    ok: true,
    generatedAt: new Date().toISOString(),
    sources,
    stations: stationGroups.flat(),
    listPrices
  });
}

async function fetchCircleKStations() {
  const response = await fetch(CIRCLEK_COUNTRY_URL, {
    headers: {
      "Accept": "application/json",
      "X-App-Name": "PRICES"
    }
  });

  if (!response.ok) throw new Error(`Circle K API HTTP ${response.status}`);

  const data = await response.json();

  return (Array.isArray(data.sites) ? data.sites : [])
    .map(normalizeCircleKSite)
    .filter(Boolean);
}

function normalizeCircleKSite(site) {
  const address = site.address || {};
  const coord = extractDanishCoordinates(site);

  return {
    id: `circlek-${site.id || site.siteId || site.name || `${coord?.lat}:${coord?.lng}`}`,
    source: "Circle K / INGO station API",
    sourceId: "circlek-api",
    stationId: String(site.id || site.siteId || ""),
    name: site.name || "Circle K",
    brand: String(site.name || "").toLowerCase().includes("ingo") ? "INGO" : "Circle K",
    addressText: [address.street, address.houseNumber, address.addressLine1].filter(Boolean).join(" "),
    postalCode: String(address.postalCode || ""),
    city: address.city || "",
    lat: coord ? coord.lat : null,
    lng: coord ? coord.lng : null,
    coordinateSource: coord ? coord.source : "none",
    prices: normalizePrices(site.fuelPrices || site.prices || site.fuels || site.products || [])
  };
}

function extractDanishCoordinates(site) {
  const candidates = [
    ["latitude/longitude", site.latitude, site.longitude],
    ["lat/lng", site.lat, site.lng],
    ["coordinates latitude/longitude", site.coordinates?.latitude, site.coordinates?.longitude],
    ["coordinates lat/lng", site.coordinates?.lat, site.coordinates?.lng],
    ["location lat/lng", site.location?.lat, site.location?.lng],
    ["location latitude/longitude", site.location?.latitude, site.location?.longitude],
    ["address coordinates", site.address?.coordinates?.latitude, site.address?.coordinates?.longitude],
    ["address location", site.address?.location?.lat, site.address?.location?.lng]
  ];

  if (Array.isArray(site.coordinates)) {
    candidates.push(["coordinates array lng/lat", site.coordinates[1], site.coordinates[0]]);
    candidates.push(["coordinates array lat/lng", site.coordinates[0], site.coordinates[1]]);
  }

  for (const [source, a, b] of candidates) {
    const pair = coordPair(a, b, source);
    if (pair) return pair;
  }

  return null;
}

function coordPair(a, b, source) {
  a = num(a);
  b = num(b);

  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  if (isLat(a) && isLng(b)) return { lat: a, lng: b, source };
  if (isLat(b) && isLng(a)) return { lat: b, lng: a, source: `${source} swapped` };

  return null;
}

async function fetchOkStations() {
  const response = await fetch(OK_FUEL_PRICES_URL, {
    headers: {
      "Accept": "application/json",
      "User-Agent": "GreenWave-DK/1.0"
    }
  });

  if (!response.ok) throw new Error(`OK API HTTP ${response.status}`);

  const data = await response.json();
  const items = Array.isArray(data.items) ? data.items : Array.isArray(data) ? data : [];

  return items
    .map(normalizeOkStation)
    .filter(Boolean);
}

function normalizeOkStation(station) {
  if (!station || typeof station !== "object") return null;

  const coord = coordPair(
    station.coordinates?.latitude ?? station.coordinate?.latitude ?? station.latitude ?? station.lat,
    station.coordinates?.longitude ?? station.coordinate?.longitude ?? station.longitude ?? station.lng,
    "ok-api"
  );

  const stationId = String(station.facility_number ?? station.facilityNumber ?? station.id ?? station.station_id ?? "");
  const street = station.street ?? station.address?.street ?? "";
  const houseNumber = station.house_number ?? station.houseNumber ?? station.address?.house_number ?? station.address?.houseNumber ?? "";
  const city = station.city ?? station.address?.city ?? "";
  const addressText = [street, houseNumber].filter(Boolean).join(" ");

  return {
    id: `ok-${stationId || `${coord?.lat}:${coord?.lng}` || station.name || addressText}`,
    source: "OK public fuel price API",
    sourceId: "ok-api",
    stationId,
    name: station.name || ["OK", addressText, city].filter(Boolean).join(" ") || "OK",
    brand: "OK",
    addressText,
    postalCode: String(station.postal_code ?? station.postalCode ?? station.address?.postal_code ?? station.address?.postalCode ?? ""),
    city,
    lat: coord ? coord.lat : null,
    lng: coord ? coord.lng : null,
    coordinateSource: coord ? coord.source : "none",
    prices: normalizeOkPrices(
      station.prices || station.fuel_prices || station.fuelPrices || [],
      station.last_updated_time ?? station.lastUpdatedTime ?? station.updated_at
    )
  };
}

function normalizeOkPrices(prices, updatedAt) {
  return Array.isArray(prices)
    ? prices
        .map(price => {
          const productName = price.product_name || price.productName || price.name || price.displayName || price.fuelType || "";
          return {
            code: price.product_code || price.productCode || price.product_id || price.productId || price.code || "",
            displayName: productName,
            productName,
            fuelType: productName,
            octane: price.octane || "",
            price: num(price.price ?? price.amount ?? price.value),
            currency: price.currency || "DKK",
            updatedAt: price.last_updated_time || price.lastUpdatedTime || price.updated_at || updatedAt || null
          };
        })
        .filter(price => isValidFuelPrice(price.price))
    : [];
}

async function fetchUnoXStations() {
  const clientId = process.env[UNOX_CLIENT_ID_ENV];
  const clientSecret = process.env[UNOX_CLIENT_SECRET_ENV];

  if (!clientId || !clientSecret) {
    return {
      configured: false,
      stations: [],
      missingEnv: !clientId ? UNOX_CLIENT_ID_ENV : UNOX_CLIENT_SECRET_ENV
    };
  }

  const tokenUrl = process.env[UNOX_TOKEN_URL_ENV] || UNOX_DEFAULT_TOKEN_URL;
  const fuelPricesUrl = process.env[UNOX_FUEL_PRICES_URL_ENV] || UNOX_DEFAULT_FUEL_PRICES_URL;
  const accessToken = await fetchUnoXAccessToken(tokenUrl, clientId, clientSecret);

  const response = await fetch(fuelPricesUrl, {
    headers: {
      "Accept": "application/json",
      "User-Agent": "GreenWave-DK/1.0",
      "Authorization": `Bearer ${accessToken}`
    }
  });

  if (!response.ok) throw new Error(`Uno-X fuel price API HTTP ${response.status}`);

  const data = await response.json();
  const items = Array.isArray(data?.Data) ? data.Data : extractStationItems(data);

  return {
    configured: true,
    stations: items
      .map(normalizeUnoXStation)
      .filter(Boolean)
  };
}

async function fetchUnoXAccessToken(tokenUrl, clientId, clientSecret) {
  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const response = await fetch(tokenUrl, {
    method: "POST",
    headers: {
      "Accept": "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
      "Authorization": `Basic ${basic}`
    },
    body: new URLSearchParams({ grant_type: "client_credentials" }).toString()
  });

  if (!response.ok) throw new Error(`Uno-X token HTTP ${response.status}`);

  const data = await response.json();
  if (!data.access_token) throw new Error("Uno-X token response missing access_token");
  return data.access_token;
}

function normalizeUnoXStation(station) {
  if (!station || typeof station !== "object") return null;

  const address = station.address || {};
  const coord = coordPair(
    address.coordinates?.latitude ?? station.coordinates?.latitude ?? station.latitude ?? station.lat,
    address.coordinates?.longitude ?? station.coordinates?.longitude ?? station.longitude ?? station.lng,
    "unox-api"
  );

  const stationId = String(station.stationId ?? station.id ?? station.station_id ?? "");
  const addressText = address.addressHouseNumber ?? station.addressHouseNumber ?? "";
  const city = address.city ?? station.city ?? "";

  return {
    id: `unox-${stationId || `${coord?.lat}:${coord?.lng}` || station.stationName || addressText}`,
    source: "Uno-X fuel price API",
    sourceId: "unox-api",
    stationId,
    name: station.stationName || station.name || ["Uno-X", addressText, city].filter(Boolean).join(" ") || "Uno-X",
    brand: "Uno-X",
    addressText,
    postalCode: String(address.postalCode ?? station.postalCode ?? ""),
    city,
    lat: coord ? coord.lat : null,
    lng: coord ? coord.lng : null,
    coordinateSource: coord ? coord.source : "none",
    prices: normalizeBrandPrices(
      station.products || station.prices || station.fuel_prices || station.fuelPrices || [],
      station.lastUpdated ?? station.last_updated_time ?? station.updated_at
    )
  };
}

async function fetchQ8F24Stations() {
  const url = process.env[Q8_F24_FUEL_PRICES_URL_ENV];
  if (!url) {
    return {
      configured: false,
      stations: [],
      missingEnv: Q8_F24_FUEL_PRICES_URL_ENV
    };
  }

  const response = await fetch(url, {
    headers: configuredApiHeaders({
      sourceId: "q8-f24-api",
      source: "Q8 / F24 fuel price API",
      apiKeyEnv: "Q8_F24_API_KEY",
      tokenEnv: "Q8_F24_API_TOKEN",
      authHeaderEnv: "Q8_F24_API_AUTH_HEADER",
      authSchemeEnv: "Q8_F24_API_AUTH_SCHEME",
      defaultHeaderEnv: Q8_F24_DEFAULT_HEADER_ENV
    })
  });

  const body = await response.text();

  if (!response.ok) {
    throw new Error(`Q8 / F24 fuel price API HTTP ${response.status}: ${body.slice(0, 300)}`);
  }

  let data;
  try {
    data = JSON.parse(body);
  } catch (error) {
    throw new Error(`Q8 / F24 fuel price API returned non-JSON: ${body.slice(0, 300)}`);
  }

  const items = Array.isArray(data?.stationsPrices) ? data.stationsPrices : [];

  return {
    configured: true,
    stations: items
      .map(normalizeQ8F24Station)
      .filter(Boolean)
  };
}

function normalizeQ8F24Station(station) {
  if (!station || typeof station !== "object") return null;

  const stationId = String(station.stationId ?? station.id ?? "");
  const brand = detectQ8F24Brand(station);
  const parsed = parseQ8F24Address(station.address || "");

  return {
    id: `q8-f24-${stationId || station.address || station.stationName}`,
    source: "Q8 / F24 fuel price API",
    sourceId: "q8-f24-api",
    stationId,
    name: station.stationName || brand,
    brand,
    addressText: parsed.addressText,
    postalCode: parsed.postalCode,
    city: parsed.city,
    lat: null,
    lng: null,
    coordinateSource: "none",
    prices: normalizeBrandPrices(station.products || [], null)
  };
}

function parseQ8F24Address(value) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  const withoutCountry = text.replace(/\s+Danmark$/i, "").trim();
  const match = withoutCountry.match(/^(.*?)(?:\s+)(\d{4})(?:\s+)(.+)$/);

  if (!match) {
    return {
      addressText: withoutCountry,
      postalCode: "",
      city: ""
    };
  }

  return {
    addressText: match[1].trim(),
    postalCode: match[2],
    city: match[3].trim()
  };
}

async function fetchConfiguredBrandStations(config) {
  const url = process.env[config.urlEnv];
  if (!url) {
    return {
      configured: false,
      stations: [],
      missingEnv: config.urlEnv
    };
  }

  const response = await fetch(url, {
    headers: configuredApiHeaders(config)
  });

  if (!response.ok) throw new Error(`${config.source} HTTP ${response.status}`);

  const data = await response.json();
  const items = extractStationItems(data);

  return {
    configured: true,
    stations: items
      .map(station => normalizeConfiguredBrandStation(station, config))
      .filter(Boolean)
  };
}

function configuredApiHeaders(config) {
  const headers = {
    "Accept": "application/json",
    "User-Agent": "GreenWave-DK/1.0"
  };
  const key = process.env[config.apiKeyEnv] || process.env[config.tokenEnv];

  if (key) {
    const header = process.env[config.authHeaderEnv] || "Authorization";
    const scheme = process.env[config.authSchemeEnv] || "";
    headers[header] = header.toLowerCase() === "authorization" && scheme
      ? `${scheme} ${key}`
      : key;
  }

  if (config.defaultHeaderEnv) {
    headers.DefaultHeader = process.env[config.defaultHeaderEnv] || makeDefaultHeader(config.sourceId);
  }

  return headers;
}

function makeDefaultHeader(sourceId) {
  return JSON.stringify({
    transactionId: `${sourceId}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    systemName: "1012",
    ipAddress: "100.45.67.01",
    hostName: "HOSTPC",
    userToken: "GreenWave",
    serviceToken: "GreenWave"
  });
}

function extractStationItems(data) {
  if (Array.isArray(data)) return data;

  const containers = [
    data?.items,
    data?.stations,
    data?.sites,
    data?.facilities,
    data?.results,
    data?.data?.items,
    data?.data?.stations,
    data?.data?.sites,
    data?.data
  ];

  return containers.find(Array.isArray) || [];
}

function normalizeConfiguredBrandStation(station, config) {
  if (!station || typeof station !== "object") return null;

  const coord = coordPair(
    station.coordinates?.latitude ?? station.coordinate?.latitude ?? station.location?.latitude ?? station.location?.lat ?? station.latitude ?? station.lat,
    station.coordinates?.longitude ?? station.coordinate?.longitude ?? station.location?.longitude ?? station.location?.lng ?? station.longitude ?? station.lng,
    config.sourceId
  );
  const address = station.address || {};
  const stationId = String(station.facility_number ?? station.facilityNumber ?? station.siteId ?? station.stationId ?? station.id ?? station.station_id ?? "");
  const brand = config.brandFromStation ? config.brandFromStation(station) : config.brand;
  const street = station.street ?? address.street ?? address.addressLine1 ?? "";
  const houseNumber = station.house_number ?? station.houseNumber ?? address.house_number ?? address.houseNumber ?? "";
  const city = station.city ?? address.city ?? "";
  const addressText = [street, houseNumber].filter(Boolean).join(" ");

  return {
    id: `${config.sourceId}-${stationId || `${coord?.lat}:${coord?.lng}` || station.name || addressText}`,
    source: config.source,
    sourceId: config.sourceId,
    stationId,
    name: station.name || station.siteName || [brand, addressText, city].filter(Boolean).join(" ") || brand,
    brand,
    addressText,
    postalCode: String(station.postal_code ?? station.postalCode ?? address.postal_code ?? address.postalCode ?? ""),
    city,
    lat: coord ? coord.lat : null,
    lng: coord ? coord.lng : null,
    coordinateSource: coord ? coord.source : "none",
    prices: normalizeBrandPrices(
      station.prices || station.fuel_prices || station.fuelPrices || station.fuels || station.products || [],
      station.last_updated_time ?? station.lastUpdatedTime ?? station.updated_at ?? station.updatedAt
    )
  };
}

function normalizeBrandPrices(prices, updatedAt) {
  return Array.isArray(prices)
    ? prices
        .map(price => {
          const productName = price.product_name || price.productName || price.name || price.displayName || price.fuelType || "";
          return {
            code: price.product_code || price.productCode || price.product_id || price.productId || price.code || price.id || "",
            displayName: productName,
            productName,
            fuelType: productName,
            octane: price.octane || "",
            price: num(price.price ?? price.amount ?? price.value),
            currency: price.currency || "DKK",
            updatedAt: price.last_updated_time || price.lastUpdatedTime || price.updated_at || price.updatedAt || updatedAt || null
          };
        })
        .filter(price => isValidFuelPrice(price.price))
    : [];
}

function detectQ8F24Brand(station) {
  const text = String([
    station.brand,
    station.name,
    station.operator,
    station.siteName
  ].filter(Boolean).join(" ")).toLowerCase();

  if (/\bf24\b/.test(text)) return "F24";
  if (/\bq8\b/.test(text)) return "Q8";
  return "Q8/F24";
}

function addConfiguredStationSource({ result, sources, stationGroups, id, name, urlEnv }) {
  if (result.status !== "fulfilled") {
    sources.push({
      id,
      name,
      ok: false,
      configured: true,
      stations: 0,
      error: result.reason?.message || String(result.reason)
    });
    return;
  }

  const payload = result.value;
  const stations = Array.isArray(payload.stations) ? payload.stations : [];
  const configured = payload.configured !== false;

  if (configured) stationGroups.push(stations);

  sources.push({
    id,
    name,
    ok: configured,
    configured,
    stations: stations.length,
    error: configured ? null : `Set ${urlEnv} to enable this source`
  });
}

async function fetchCircleKListPrices() {
  const response = await fetch(CIRCLEK_LIST_PRICE_URL, {
    headers: { "Accept": "text/html" }
  });

  if (!response.ok) throw new Error(`Circle K list HTTP ${response.status}`);

  const text = stripHtml(await response.text());

  return {
    benzin95: extractPrice(text, ["Miles 95", "miles95", "Blyfri 95"]),
    benzin98: extractPrice(text, ["Miles Plus 95", "Miles+ 95", "Miles Plus"]),
    diesel: extractPrice(text, ["Miles Diesel", "Diesel"]),
    premiumDiesel: extractPrice(text, ["Miles Plus Diesel", "Miles+ Diesel"])
  };
}

function extractPrice(text, needles) {
  for (const needle of needles) {
    const index = text.toLowerCase().indexOf(needle.toLowerCase());
    if (index < 0) continue;

    const values = [...text.slice(index, index + 900).matchAll(/(\d{1,2},\d{2})/g)]
      .map(match => num(match[1]));
    const price = values.find(isValidFuelPrice);

    if (Number.isFinite(price)) {
      return {
        price,
        productName: needle,
        source: "Circle K official list prices"
      };
    }
  }

  return null;
}

function normalizePrices(prices) {
  return Array.isArray(prices)
    ? prices
        .map(price => ({
          code: price.code || price.productCode || price.id || "",
          displayName: price.displayName || price.name || price.productName || price.fuelType || "",
          productName: price.productName || price.displayName || price.name || price.fuelType || "",
          fuelType: price.fuelType || price.productName || price.displayName || price.name || "",
          octane: price.octane || "",
          price: num(price.price ?? price.amount ?? price.value),
          currency: price.currency || "DKK"
        }))
        .filter(price => isValidFuelPrice(price.price))
    : [];
}

function stripHtml(html) {
  return String(html || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ");
}

function num(value) {
  if (value === undefined || value === null || value === "") return NaN;
  return Number(String(value).replace(",", "."));
}

function isValidFuelPrice(value) {
  const price = Number(value);
  return Number.isFinite(price) && price >= 5 && price <= 30;
}

function isLat(value) {
  return value >= 54.2 && value <= 58.2;
}

function isLng(value) {
  return value >= 7.5 && value <= 15.8;
}
